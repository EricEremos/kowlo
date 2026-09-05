begin;

create role journal_sync_writer nologin noinherit nobypassrls;
grant usage on schema public, auth to journal_sync_writer;
grant execute on function auth.uid() to journal_sync_writer;

create function public.valid_journal_palette(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object'
     or value - array['algorithm','colors'] <> '{}'::jsonb
     or value->>'algorithm' is distinct from 'rgb-histogram-v1'
     or jsonb_typeof(value->'colors') is distinct from 'array' then return false; end if;
  return jsonb_array_length(value->'colors') between 1 and 3
    and not exists (select 1 from jsonb_array_elements(value->'colors') c
      where jsonb_typeof(c) <> 'string' or c #>> '{}' !~ '^#[0-9A-F]{6}$')
    and (select count(distinct c) from jsonb_array_elements(value->'colors') c) = jsonb_array_length(value->'colors');
end;
$$;
revoke all on function public.valid_journal_palette(jsonb) from public, anon, authenticated;
grant execute on function public.valid_journal_palette(jsonb) to journal_sync_writer;
alter table public.observations add column palette jsonb
  check (public.valid_journal_palette(palette));

create table public.journal_sync_clock (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);
create table public.journal_sync_state (
  owner_id uuid not null references auth.users(id) on delete cascade,
  store text not null check (store in ('observations','journalEntries')),
  id uuid not null,
  revision bigint not null check (revision > 0),
  deleted boolean not null,
  primary key(owner_id,store,id),
  unique(owner_id,revision)
);
create table public.journal_sync_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null,
  request_digest bytea not null check (octet_length(request_digest)=32),
  result jsonb not null,
  primary key(owner_id,token)
);
create table public.journal_sync_retired (
  owner_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null,
  result jsonb not null,
  primary key(owner_id,token)
);
alter table public.journal_sync_retired enable row level security;
alter table public.journal_sync_retired force row level security;
revoke all on public.journal_sync_retired from public,anon,authenticated;
grant select,insert on public.journal_sync_retired to journal_sync_writer;
create policy sync_retired_writer on public.journal_sync_retired to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

insert into public.journal_sync_state(owner_id,store,id,revision,deleted)
select owner_id,store,id,row_number() over(partition by owner_id order by store,id),false
from (select owner_id,'observations' as store,id from public.observations
      union all select owner_id,'journalEntries',id from public.journal_entries) records;
insert into public.journal_sync_clock(owner_id,revision)
select owner_id,max(revision) from public.journal_sync_state group by owner_id;

alter table public.journal_sync_clock enable row level security;
alter table public.journal_sync_clock force row level security;
alter table public.journal_sync_state enable row level security;
alter table public.journal_sync_state force row level security;
alter table public.journal_sync_receipts enable row level security;
alter table public.journal_sync_receipts force row level security;
revoke all on public.journal_sync_clock,public.journal_sync_state,public.journal_sync_receipts from public,anon,authenticated;
grant select on public.journal_sync_state to authenticated;
create policy sync_state_read on public.journal_sync_state for select to authenticated
  using ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.observations,public.journal_entries,
  public.journal_sync_clock,public.journal_sync_state,public.journal_sync_receipts to journal_sync_writer;
create policy sync_observations_writer on public.observations to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy sync_entries_writer on public.journal_entries to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy sync_clock_writer on public.journal_sync_clock to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy sync_state_writer on public.journal_sync_state to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy sync_receipts_writer on public.journal_sync_receipts to journal_sync_writer
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

-- Table-level REVOKE alone does not remove the earlier column grants.
revoke insert,update,delete on public.observations,public.journal_entries from authenticated;
revoke insert(owner_id,id,longitude,latitude,capture_status,capture_local,capture_offset_minutes),
  update(longitude,latitude,capture_status,capture_local,capture_offset_minutes) on public.observations from authenticated;
revoke insert(owner_id,id,observation_id,note,corrected_place_label),
  update(observation_id,note,corrected_place_label) on public.journal_entries from authenticated;

create function public.mark_journal_sync(p_store text,p_id uuid,p_deleted boolean) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare v_revision bigint;
begin
  update public.journal_sync_clock set revision=revision+1 where owner_id=auth.uid()
    returning revision into strict v_revision;
  insert into public.journal_sync_state(owner_id,store,id,revision,deleted)
    values(auth.uid(),p_store,p_id,v_revision,p_deleted)
    on conflict(owner_id,store,id) do update set revision=excluded.revision,deleted=excluded.deleted;
  return v_revision;
end;
$$;
revoke all on function public.mark_journal_sync(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.mark_journal_sync(text,uuid,boolean) to journal_sync_writer;

create function public.apply_journal_change(
  p_token uuid,p_store text,p_id uuid,p_operation text,p_base_revision bigint,p_record jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_digest bytea;
  v_receipt public.journal_sync_receipts%rowtype;
  v_state public.journal_sync_state%rowtype;
  v_revision bigint;
  v_note_id uuid;
  v_result jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message='Authentication required'; end if;
  if p_token is null or p_id is null or p_store is null or p_store not in ('observations','journalEntries')
     or p_operation is null or p_operation not in ('put','delete') or p_base_revision is null or p_base_revision<0
     or (p_operation='delete' and p_record is not null)
     or (p_operation='put' and jsonb_typeof(p_record) is distinct from 'object') then
    raise invalid_parameter_value using message='Invalid journal operation';
  end if;
  if octet_length(coalesce(p_record::text,''))>32768 then
    raise invalid_parameter_value using message='Journal record too large';
  end if;
  v_digest := sha256(convert_to(jsonb_build_array(p_store,p_id,p_operation,p_base_revision,p_record)::text,'UTF8'));
  insert into public.journal_sync_clock(owner_id) values(v_owner) on conflict do nothing;
  perform 1 from public.journal_sync_clock where owner_id=v_owner for update;
  select result into v_result from public.journal_sync_retired where owner_id=v_owner and token=p_token;
  if found then
    if v_result->>'store'<>p_store or v_result->>'id'<>p_id::text or p_operation<>'put' then
      raise invalid_parameter_value using message='Retired token reused for another operation';
    end if;
    return v_result;
  end if;
  select * into v_receipt from public.journal_sync_receipts where owner_id=v_owner and token=p_token;
  if found then
    if v_receipt.request_digest<>v_digest then
      raise invalid_parameter_value using message='Operation token reused with different input';
    end if;
    return v_receipt.result;
  end if;
  select * into v_state from public.journal_sync_state where owner_id=v_owner and store=p_store and id=p_id;
  if coalesce(v_state.revision,0)<>p_base_revision or (coalesce(v_state.deleted,false) and p_operation='put') then
    return jsonb_build_object('status','conflict','revision',coalesce(v_state.revision,0)::text,
      'deleted',coalesce(v_state.deleted,false));
  end if;
  if p_operation='put' and p_store='observations' then
    if p_record-array['longitude','latitude','capture_status','capture_local','capture_offset_minutes','palette']<>'{}'::jsonb
       or jsonb_typeof(p_record->'longitude') is distinct from 'number'
       or jsonb_typeof(p_record->'latitude') is distinct from 'number'
       or (p_record ? 'capture_status' and jsonb_typeof(p_record->'capture_status') is distinct from 'string')
       or (p_record->>'capture_local' is not null and
           (jsonb_typeof(p_record->'capture_local')<>'string' or p_record->>'capture_local' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'))
       or (p_record->>'capture_offset_minutes' is not null and
           (jsonb_typeof(p_record->'capture_offset_minutes')<>'number' or p_record->>'capture_offset_minutes' !~ '^-?\d+$')) then
      raise invalid_parameter_value using message='Invalid observation fields';
    end if;
    insert into public.observations(owner_id,id,longitude,latitude,capture_status,capture_local,capture_offset_minutes,palette)
      values(v_owner,p_id,(p_record->>'longitude')::double precision,(p_record->>'latitude')::double precision,
        coalesce(p_record->>'capture_status','not-requested'),(p_record->>'capture_local')::timestamp,
        (p_record->>'capture_offset_minutes')::smallint,nullif(p_record->'palette','null'::jsonb))
      on conflict(owner_id,id) do update set longitude=excluded.longitude,latitude=excluded.latitude,
        capture_status=excluded.capture_status,capture_local=excluded.capture_local,
        capture_offset_minutes=excluded.capture_offset_minutes,palette=excluded.palette;
  elsif p_operation='put' then
    if p_record-array['observation_id','note','corrected_place_label']<>'{}'::jsonb
       or (p_record ? 'note' and jsonb_typeof(p_record->'note') is distinct from 'string')
       or (p_record->>'corrected_place_label' is not null and jsonb_typeof(p_record->'corrected_place_label')<>'string')
       or (p_record->>'observation_id' is not null and jsonb_typeof(p_record->'observation_id')<>'string') then
      raise invalid_parameter_value using message='Invalid journal fields';
    end if;
    insert into public.journal_entries(owner_id,id,observation_id,note,corrected_place_label)
      values(v_owner,p_id,(p_record->>'observation_id')::uuid,coalesce(p_record->>'note',''),p_record->>'corrected_place_label')
      on conflict(owner_id,id) do update set observation_id=excluded.observation_id,note=excluded.note,
        corrected_place_label=excluded.corrected_place_label;
  elsif p_store='observations' then
    for v_note_id in update public.journal_entries set observation_id=null
      where owner_id=v_owner and observation_id=p_id returning id loop
      perform public.mark_journal_sync('journalEntries',v_note_id,false);
    end loop;
    delete from public.observations where owner_id=v_owner and id=p_id;
  else
    delete from public.journal_entries where owner_id=v_owner and id=p_id;
  end if;
  v_revision := public.mark_journal_sync(p_store,p_id,p_operation='delete');
  v_result := jsonb_build_object('status','accepted','token',p_token,'store',p_store,'id',p_id,
    'revision',v_revision::text,'deleted',p_operation='delete');
  insert into public.journal_sync_receipts(owner_id,token,request_digest,result)
    values(v_owner,p_token,v_digest,v_result);
  return v_result;
end;
$$;
revoke all on function public.apply_journal_change(uuid,text,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant create on schema public to journal_sync_writer;
alter function public.apply_journal_change(uuid,text,uuid,text,bigint,jsonb) owner to journal_sync_writer;
revoke create on schema public from journal_sync_writer;
grant execute on function public.apply_journal_change(uuid,text,uuid,text,bigint,jsonb) to authenticated;

-- Shares the write lock: either the old put committed or it can never commit.
create function public.retire_journal_put(p_token uuid,p_store text,p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_result jsonb;
  v_state public.journal_sync_state%rowtype;
begin
  if v_owner is null then raise insufficient_privilege using message='Authentication required'; end if;
  if p_token is null or p_id is null or p_store is null or p_store not in ('observations','journalEntries') then
    raise invalid_parameter_value using message='Invalid retirement target';
  end if;
  insert into public.journal_sync_clock(owner_id) values(v_owner) on conflict do nothing;
  perform 1 from public.journal_sync_clock where owner_id=v_owner for update;
  select result into v_result from public.journal_sync_receipts where owner_id=v_owner and token=p_token;
  if found then
    if v_result->>'store'<>p_store or v_result->>'id'<>p_id::text or (v_result->>'deleted')::boolean then
      raise invalid_parameter_value using message='Receipt does not identify this put';
    end if;
    return v_result;
  end if;
  select result into v_result from public.journal_sync_retired where owner_id=v_owner and token=p_token;
  if found then
    if v_result->>'store'<>p_store or v_result->>'id'<>p_id::text then
      raise invalid_parameter_value using message='Retired token reused for another target';
    end if;
    return v_result;
  end if;
  select * into v_state from public.journal_sync_state where owner_id=v_owner and store=p_store and id=p_id;
  v_result := jsonb_build_object('status','retired','token',p_token,'store',p_store,'id',p_id,
    'revision',coalesce(v_state.revision,0)::text,'deleted',coalesce(v_state.deleted,false));
  insert into public.journal_sync_retired(owner_id,token,result) values(v_owner,p_token,v_result);
  return v_result;
end;
$$;
revoke all on function public.retire_journal_put(uuid,text,uuid) from public,anon,authenticated;
grant create on schema public to journal_sync_writer;
alter function public.retire_journal_put(uuid,text,uuid) owner to journal_sync_writer;
revoke create on schema public from journal_sync_writer;
grant execute on function public.retire_journal_put(uuid,text,uuid) to authenticated;

create function public.pull_journal_changes(p_after bigint default 0,p_limit integer default 100)
returns table(store text,id uuid,revision text,deleted boolean,record jsonb)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
  if p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 500 then
    raise invalid_parameter_value using message='Invalid sync page';
  end if;
  return query
    select s.store,s.id,s.revision::text,s.deleted,
      case when s.deleted then null
        when s.store='observations' then jsonb_build_object('longitude',o.longitude,'latitude',o.latitude,
          'capture_status',o.capture_status,'capture_local',to_char(o.capture_local,'YYYY-MM-DD"T"HH24:MI:SS'),
          'capture_offset_minutes',o.capture_offset_minutes,'palette',o.palette)
        else jsonb_build_object('observation_id',j.observation_id,'note',j.note,'corrected_place_label',j.corrected_place_label)
      end
    from public.journal_sync_state s
    left join public.observations o on s.store='observations' and o.owner_id=s.owner_id and o.id=s.id
    left join public.journal_entries j on s.store='journalEntries' and j.owner_id=s.owner_id and j.id=s.id
    where s.owner_id=auth.uid() and s.revision>p_after order by s.revision limit p_limit;
end;
$$;
revoke all on function public.pull_journal_changes(bigint,integer) from public,anon,authenticated;
grant execute on function public.pull_journal_changes(bigint,integer) to authenticated;

commit;
