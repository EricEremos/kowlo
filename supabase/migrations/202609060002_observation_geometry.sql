begin;

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- An existing extension in another schema must be resolved explicitly before deployment.
do $$
begin
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'postgis' and n.nspname = 'extensions'
  ) then
    raise exception 'PostGIS must be installed in the extensions schema';
  end if;
end;
$$;

grant usage on schema extensions to authenticated;

alter table public.observations add column position extensions.geometry(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)
  ) stored not null;

create index observations_position_idx on public.observations using gist (position);

create function public.observations_in_view(
  west double precision, south double precision,
  east double precision, north double precision
) returns setof public.observations
language plpgsql stable security invoker set search_path = '' as $$
begin
  if west is null or east is null or south is null or north is null
    or not (west between -180 and 180 and east between -180 and 180
      and south between -90 and 90 and north between -90 and 90)
    or south > north then
    raise exception 'Invalid map bounds' using errcode = '22023';
  end if;

  return query
  select o.* from public.observations o
  where o.owner_id = (select auth.uid())
    and o.latitude between south and north
    and (
      (west <= east
        and o.longitude between west and east
        and o.position operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326))
      or (west > east and (
        (o.longitude >= west
          and o.position operator(extensions.&&) extensions.st_makeenvelope(west, south, 180, north, 4326))
        or (o.longitude <= east
          and o.position operator(extensions.&&) extensions.st_makeenvelope(-180, south, east, north, 4326))
      ))
    )
  order by o.id;
end;
$$;

revoke all on function public.observations_in_view(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.observations_in_view(double precision, double precision, double precision, double precision)
  to authenticated;

commit;
