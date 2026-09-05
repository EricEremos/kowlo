import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Test journal migrations in a new isolated PostgreSQL cluster.')
parser.add_argument('--postgis', action='store_true', help='Require PostGIS and test the spatial migration and private map queries.')
parser.add_argument('--sync', action='store_true', help='Test revision conflicts, retries, deletion markers and sync privileges.')
parser.add_argument('--districts', action='store_true', help='Test seeded district classification after the full spatial and sync chain.')
args = parser.parse_args()
if args.districts and not (args.postgis and args.sync):
    parser.error('--districts requires --postgis --sync')
A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
OBS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
NOTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
work = Path(tempfile.mkdtemp(prefix='placefold-db-', dir='/tmp'))
os.chmod(work, 0o700)
data = work / 'data'
socket = work / 'socket'
socket.mkdir(mode=0o700)
checks = []


def command(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, check=True, **kwargs)


def sql(statement, actor=None, role='authenticated', expected=None):
    prefix = ''
    if actor is not None:
        prefix = f"set role {role}; set request.jwt.claim.sub = '{actor}';\n"
    result = subprocess.run(
        ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
         '-h', str(socket), '-p', '55439', '-U', 'postgres', '-d', 'postgres'],
        input=prefix + statement, text=True, capture_output=True,
    )
    if expected:
        assert result.returncode != 0 and f'ERROR:  {expected}:' in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def check(name, statement, actor=None, value=None, error=None, role='authenticated'):
    actual = sql(statement, actor, role, error)
    if value is not None:
        assert actual == value, f'{name}: expected {value!r}, got {actual!r}'
    checks.append(name)


started = False
try:
    command(['initdb', '-D', str(data), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale'])
    command(['pg_ctl', '-D', str(data), '-l', str(work / 'server.log'), '-o',
             f"-k {socket} -p 55439 -c listen_addresses=''", '-w', 'start'])
    started = True
    sql('''
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
    ''')
    sql(f"insert into auth.users values ('{A}'), ('{B}');")
    migration = ROOT / 'supabase/migrations/202609060001_private_journal.sql'
    sql(migration.read_text())
    if args.postgis:
        available = sql("select count(*) from pg_available_extensions where name='postgis';")
        if available != '1':
            raise RuntimeError('PostGIS is not installed for this PostgreSQL runtime; spatial migration checks were NOT run.')
        check('pre-spatial observation exists for backfill', f"insert into public.observations(id,longitude,latitude) values ('{OBS}',114.1589,22.2819);", A)
        sql((ROOT / 'supabase/migrations/202609060002_observation_geometry.sql').read_text())
        check('backfill preserves exact longitude, latitude and SRID',
              'select extensions.st_x(position)=longitude and extensions.st_y(position)=latitude and extensions.st_srid(position)=4326 from public.observations;', A, 't')
        check('spatial index exists and is valid', "select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am a on a.oid=c.relam where c.relname='observations_position_idx' and i.indisvalid and a.amname='gist';", value='1')
        check('spatial RPC is invoker with empty search path', "select not prosecdef and proconfig=array['search_path=\"\"'] from pg_proc where oid='public.observations_in_view(double precision,double precision,double precision,double precision)'::regprocedure;", value='t')
        check('geometry recomputes from coordinate edit', f"update public.observations set longitude=114.15,latitude=22.28 where id='{OBS}';", A)
        check('updated geometry has exact coordinate order', 'select extensions.st_x(position)=114.15 and extensions.st_y(position)=22.28 from public.observations;', A, 't')
        check('client cannot forge geometry independently', "update public.observations set position=extensions.st_setsrid(extensions.st_makepoint(0,0),4326);", A, error='428C9')
        check('rejected geometry forgery leaves source and position intact', 'select longitude=114.15 and latitude=22.28 and extensions.st_x(position)=longitude and extensions.st_y(position)=latitude from public.observations;', A, 't')
        check('B inserts private point in same viewport', f"insert into public.observations(id,longitude,latitude) values ('{OBS}',114.15,22.28);", B)
        for actor in [A, B]:
            check(f'{actor[0]} viewport exposes only own point', f"select count(*)=1 and bool_and(owner_id='{actor}') from public.observations_in_view(114,22,115,23);", actor, 't')
        check('viewport edges include exact source coordinate', 'select count(*) from public.observations_in_view(114.15,22.28,114.15,22.28);', A, '1')
        check('float bounding-box rounding cannot admit outside point', 'select count(*) from public.observations_in_view(114.15000001,22.28,114.15000002,22.28);', A, '0')
        check('identity-less viewport is empty', 'select count(*) from public.observations_in_view(-180,-90,180,90);', '', '0')
        check('anonymous viewport denied', 'select * from public.observations_in_view(-180,-90,180,90);', '', error='42501', role='anon')
        for bounds in ['null,0,1,1', "'NaN',0,1,1", "0,0,'Infinity',1", '-181,0,1,1', '0,-91,1,1', '0,2,1,1']:
            check(f'invalid viewport rejected: {bounds}', f'select * from public.observations_in_view({bounds});', A, error='22023')
        check('add antimeridian and origin fixtures', 'insert into public.observations(id,longitude,latitude) values (gen_random_uuid(),179,0),(gen_random_uuid(),-179,0),(gen_random_uuid(),0,0);', A)
        check('wrapped viewport includes both dateline sides', 'select count(*) from public.observations_in_view(178,-1,-178,1);', A, '2')
        check('ordinary viewport excludes dateline points', 'select count(*) from public.observations_in_view(-1,-1,1,1);', A, '1')
        check('world viewport retains every own point', 'select count(*) from public.observations_in_view(-180,-90,180,90);', A, '4')
        check('deletion removes geometry from viewport', f"delete from public.observations where id='{OBS}';", A)
        check('deleted observation is absent from viewport', 'select count(*) from public.observations_in_view(114,22,115,23);', A, '0')
        check('other owner viewport unaffected by deletion', 'select count(*) from public.observations_in_view(114,22,115,23);', B, '1')
        sql('delete from public.observations;')
    check('RLS enabled and forced on both tables', "select count(*) from pg_class where relname in ('observations','journal_entries') and relrowsecurity and relforcerowsecurity;", value='2')
    for actor in [A, B]:
        check(f'{actor[0]} inserts own observation with same client UUID', f"insert into public.observations(id,longitude,latitude) values ('{OBS}',114.15,22.28);", actor)
        check(f'{actor[0]} sees only one owned observation', 'select count(*) from public.observations;', actor, '1')
        check(f'{actor[0]} inserts own note', f"insert into public.journal_entries(id,observation_id,note) values ('{NOTE}','{OBS}','My place');", actor)
        check(f'{actor[0]} sees only own note', 'select count(*) from public.journal_entries;', actor, '1')
    check('B has an additional private observation', f"insert into public.observations(id,longitude,latitude) values ('{OTHER}',114.2,22.3);", B)
    for table, update in [('observations', 'longitude=115'), ('journal_entries', "note='changed'")]:
        check(f'{table}: cross-owner read hidden', f"select count(*) from public.{table} where owner_id='{B}';", A, '0')
        check(f'{table}: cross-owner update affects zero', f"with changed as (update public.{table} set {update} where owner_id='{B}' returning id) select count(*) from changed;", A, '0')
        check(f'{table}: cross-owner delete affects zero', f"with removed as (delete from public.{table} where owner_id='{B}' returning id) select count(*) from removed;", A, '0')
        check(f'{table}: ownership cannot be changed', f"update public.{table} set owner_id='{B}' where id='{OBS if table == 'observations' else NOTE}';", A, error='42501')
        check(f'{table}: server timestamps cannot be forged', f"update public.{table} set updated_at='2000-01-01';", A, error='42501')
        check(f'{table}: missing identity sees no rows', f'select count(*) from public.{table};', '', '0')
        for operation in [f'select * from public.{table}', f'delete from public.{table}', f'update public.{table} set {update}', f'insert into public.{table}(id) values (gen_random_uuid())']:
            check(f'{table}: anon {operation.split()[0]} denied', operation, '', error='42501', role='anon')
    check('forged observation owner denied', f"insert into public.observations(owner_id,id,longitude,latitude) values ('{B}',gen_random_uuid(),114,22);", A, error='42501')
    check('forged note owner denied', f"insert into public.journal_entries(owner_id,id,note) values ('{B}',gen_random_uuid(),'forged');", A, error='42501')
    check('identity-less observation insert denied', "insert into public.observations(id,longitude,latitude) values (gen_random_uuid(),114,22);", '', error='42501')
    check('cross-owner note link insert denied', f"insert into public.journal_entries(id,observation_id) values (gen_random_uuid(),'{OTHER}');", A, error='23503')
    check('cross-owner note link update denied', f"update public.journal_entries set observation_id='{OTHER}' where id='{NOTE}';", A, error='23503')
    check('duplicate retry rejected without another row', f"insert into public.observations(id,longitude,latitude) values ('{OBS}',114,22);", A, error='23505')
    for field, value in [('longitude', "'NaN'"), ('latitude', "'Infinity'"), ('longitude', '-181'), ('latitude', '91')]:
        check(f'invalid {field} {value} rejected', f'update public.observations set {field}={value};', A, error='23514')
    check('unrequested capture date cannot be retained', "update public.observations set capture_local='2026-09-01';", A, error='23514')
    check('unknown timezone preserved', "update public.observations set capture_status='timezone-unknown',capture_local='2026-09-01 10:30:00';", A)
    check('unknown timezone has no invented offset', 'select capture_offset_minutes is null from public.observations;', A, 't')
    check('with-offset requires an offset', "update public.observations set capture_status='with-offset';", A, error='23514')
    check('valid explicit offset retained', "update public.observations set capture_status='with-offset',capture_offset_minutes=480;", A)
    check('infinite capture timestamp rejected', "update public.observations set capture_local='infinity';", A, error='23514')
    check('update timestamp maintained', 'select updated_at >= created_at from public.observations;', A, 't')
    check('note length bounded', "update public.journal_entries set note=repeat('x',4001);", A, error='23514')
    check('own note can be edited', "update public.journal_entries set note='Updated',corrected_place_label='My harbour';", A)
    check('note corrections separate from source coordinate', f"select longitude::text || ',' || latitude::text from public.observations where id='{OBS}';", A, '114.15,22.28')
    check('own observation deletion succeeds', f"delete from public.observations where id='{OBS}';", A)
    check('authored note retained with absent observation', 'select observation_id is null and note=\'Updated\' from public.journal_entries;', A, 't')
    check('B observation unaffected by A deletion', 'select count(*) from public.observations;', B, '2')
    check('own note deletion succeeds', f"delete from public.journal_entries where id='{NOTE}';", A)
    check('own note now absent', 'select count(*) from public.journal_entries;', A, '0')
    check('account deletion cascades metadata', f"delete from auth.users where id='{B}';")
    check('deleted account observations absent', 'select count(*) from public.observations;', value='0')
    check('deleted account notes absent', 'select count(*) from public.journal_entries;', value='0')
    if args.sync:
        from private_sync_checks import run_sync_checks
        run_sync_checks(ROOT, sql, check, A, B, OBS, OTHER, NOTE)
        if args.postgis:
            check('full migration chain preserves geometry for synchronized records', 'select count(*)>0 and bool_and(extensions.st_x(position)=longitude and extensions.st_y(position)=latitude and extensions.st_srid(position)=4326) from public.observations;', B, 't')
            check('viewport remains owner scoped after sync migration', f"select count(*)>0 and bool_and(owner_id='{B}') from public.observations_in_view(-180,-90,180,90);", B, 't')
            check('deleted account has no viewport records after synchronized writes', 'select count(*) from public.observations_in_view(-180,-90,180,90);', A, '0')
    district_results = None
    if args.districts:
        from private_district_checks import run_district_checks
        district_results = run_district_checks(ROOT, sql, check, A, B)
    print(json.dumps({'status': 'passed', 'checks': len(checks), 'cases': checks,
                      'districts': district_results,
                      'sync_checks_requested': args.sync,
                      'spatial_checks_requested': args.postgis,
                      'postgis': sql('select extensions.postgis_full_version();') if args.postgis else None,
                      'postgres': sql('select version();'), 'local_cluster': str(work),
                      'scope': 'PostgreSQL roles and minimal auth.uid stand-in; not hosted Supabase JWT/API verification'}, indent=2))
finally:
    if started:
        command(['pg_ctl', '-D', str(data), '-m', 'fast', '-w', 'stop'])
