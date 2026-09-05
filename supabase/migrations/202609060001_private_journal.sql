begin;

create table public.observations (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  capture_status text not null default 'not-requested'
    check (capture_status in ('not-requested', 'missing', 'invalid', 'invalid-offset', 'timezone-unknown', 'with-offset')),
  capture_local timestamp without time zone,
  capture_offset_minutes smallint check (capture_offset_minutes between -840 and 840),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint capture_consistency check (
    (capture_status in ('not-requested', 'missing', 'invalid') and capture_local is null and capture_offset_minutes is null)
    or (capture_status in ('invalid-offset', 'timezone-unknown') and capture_local is not null and capture_offset_minutes is null)
    or (capture_status = 'with-offset' and capture_local is not null and capture_offset_minutes is not null)
  ),
  constraint capture_finite check (capture_local is null or isfinite(capture_local))
);

create table public.journal_entries (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  observation_id uuid,
  note text not null default '' check (char_length(note) <= 4000),
  corrected_place_label text check (char_length(corrected_place_label) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, observation_id) references public.observations(owner_id, id)
    on delete set null (observation_id)
);

create index observations_owner_updated_idx on public.observations(owner_id, updated_at, id);
create index journal_entries_observation_idx on public.journal_entries(owner_id, observation_id);

create function public.touch_journal_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_journal_updated_at() from public, anon, authenticated;

create trigger observations_updated before update on public.observations
for each row execute function public.touch_journal_updated_at();
create trigger journal_entries_updated before update on public.journal_entries
for each row execute function public.touch_journal_updated_at();

alter table public.observations enable row level security;
alter table public.observations force row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;

revoke all on public.observations, public.journal_entries from public, anon, authenticated;
grant select, delete on public.observations, public.journal_entries to authenticated;
grant insert (owner_id, id, longitude, latitude, capture_status, capture_local, capture_offset_minutes)
  on public.observations to authenticated;
grant update (longitude, latitude, capture_status, capture_local, capture_offset_minutes)
  on public.observations to authenticated;
grant insert (owner_id, id, observation_id, note, corrected_place_label)
  on public.journal_entries to authenticated;
grant update (observation_id, note, corrected_place_label) on public.journal_entries to authenticated;

create policy observations_select on public.observations for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy observations_insert on public.observations for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy observations_update on public.observations for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy observations_delete on public.observations for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy journal_entries_select on public.journal_entries for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy journal_entries_update on public.journal_entries for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy journal_entries_delete on public.journal_entries for delete to authenticated
  using ((select auth.uid()) = owner_id);

commit;
