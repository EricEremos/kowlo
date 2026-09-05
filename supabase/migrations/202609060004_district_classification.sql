begin;

create table public.hk_districts (
  id text primary key check (id in ('A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T')),
  name text not null,
  name_zh text not null,
  source_sha256 text not null check (source_sha256 = 'e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8'),
  boundary extensions.geometry(Polygon, 4326) not null
    check (extensions.st_isvalid(boundary) and not extensions.st_isempty(boundary))
);

create index hk_districts_boundary_idx on public.hk_districts using gist (boundary);
alter table public.hk_districts enable row level security;
alter table public.hk_districts force row level security;
create policy district_reference_read on public.hk_districts for select to authenticated using (true);
revoke all on public.hk_districts from public, anon, authenticated;
grant select on public.hk_districts to authenticated;

create function public.classify_hk_district(longitude double precision, latitude double precision)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  point extensions.geometry;
  matches jsonb;
  assigned boolean;
begin
  if longitude is null or latitude is null
    or not (longitude between -180 and 180 and latitude between -90 and 90) then
    return jsonb_build_object('status', 'invalid-coordinate', 'matches', '[]'::jsonb, 'milestoneDistrictId', null);
  end if;
  -- Missing reference data is an installation error, never an empty personal atlas.
  if (select count(*) from public.hk_districts) <> 18 then
    raise exception 'Pinned district reference is incomplete' using errcode = '55000';
  end if;
  point := extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'name', d.name, 'nameZh', d.name_zh,
    'relation', case when extensions.st_contains(d.boundary, point) then 'interior' else 'boundary' end
  ) order by d.id collate "C"), '[]'::jsonb) into matches
  from public.hk_districts d where extensions.st_covers(d.boundary, point);
  assigned := jsonb_array_length(matches) = 1 and matches->0->>'relation' = 'interior';
  return jsonb_build_object(
    'status', case when assigned then 'assigned' when jsonb_array_length(matches) > 0 then 'ambiguous' else 'outside-dataset' end,
    'sourceSha256', 'e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8',
    'matches', matches,
    'milestoneDistrictId', case when assigned then matches->0->>'id' else null end
  );
end;
$$;

create function public.observation_districts_in_view(
  west double precision, south double precision, east double precision, north double precision
) returns table (observation_id uuid, district jsonb)
language sql stable security invoker set search_path = '' as $$
  select o.id, public.classify_hk_district(o.longitude, o.latitude)
  from public.observations_in_view(west, south, east, north) o;
$$;

revoke all on function public.classify_hk_district(double precision, double precision) from public, anon, authenticated;
revoke all on function public.observation_districts_in_view(double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.classify_hk_district(double precision, double precision) to authenticated;
grant execute on function public.observation_districts_in_view(double precision, double precision, double precision, double precision) to authenticated;

commit;
