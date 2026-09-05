import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4


def run_sync_checks(root, sql, check, a, b, obs, other, note):
    def request(store, record_id, operation='put', base=0, record=None, token=None):
        payload = 'null' if record is None else "'" + json.dumps(record).replace("'", "''") + "'::jsonb"
        return f"select public.apply_journal_change('{token or uuid4()}','{store}','{record_id}','{operation}',{base},{payload});"

    def apply(record_id, record=None, **kwargs):
        return request('observations', record_id, record=record, **kwargs)

    point = {'longitude': 114.15, 'latitude': 22.28,
             'palette': {'algorithm': 'rgb-histogram-v1', 'colors': ['#AABBCC', '#223344']}}
    sql(f"insert into auth.users values ('{b}');")
    sql(f"insert into public.observations(id,longitude,latitude) values ('{obs}',114,22);", a)
    sql(f"insert into public.journal_entries(id,observation_id,note) values ('{note}','{obs}','Before sync');", a)
    sql((root / 'supabase/migrations/202609060003_private_sync.sql').read_text())
    check('sync backfills existing records', 'select count(*) from public.pull_journal_changes();', a, '2')
    check('sync backfill hidden from other identity', 'select count(*) from public.pull_journal_changes();', b, '0')
    check('sync writer cannot login or bypass RLS', "select not rolcanlogin and not rolbypassrls and not rolsuper from pg_roles where rolname='journal_sync_writer';", value='t')
    check('sync RPC has restricted owner and empty search path', "select prosecdef and proowner='journal_sync_writer'::regrole and proconfig=array['search_path=\"\"'] from pg_proc where oid='public.apply_journal_change(uuid,text,uuid,text,bigint,jsonb)'::regprocedure;", value='t')
    for statement in [f"insert into public.observations(id,longitude,latitude) values ('{other}',114,22);",
                      'update public.observations set longitude=115;', 'delete from public.observations;',
                      f"insert into public.journal_entries(id,note) values ('{other}','bypass');",
                      "update public.journal_entries set note='bypass';", 'delete from public.journal_entries;',
                      'select * from public.journal_sync_receipts;', 'update public.journal_sync_state set deleted=false;',
                      f"select public.mark_journal_sync('observations','{obs}',false);"]:
        check(f'sync direct bypass denied: {statement.split()[0:4]}', statement, a, error='42501')
    check('authenticated role has no writer membership', "select not pg_has_role('authenticated','journal_sync_writer','MEMBER');", value='t')
    check('sync anonymous write denied', apply(other, point), '', error='42501', role='anon')
    check('sync identity-less write denied', apply(other, point), '', error='42501')
    check('sync anonymous pull denied', 'select * from public.pull_journal_changes();', '', error='42501', role='anon')
    check('sync identity-less pull denied', 'select * from public.pull_journal_changes();', '', error='42501')
    token = str(uuid4())
    original = apply(other, point, token=token)
    first_raw = sql(original, a)
    first = json.loads(first_raw)
    assert first['status'] == 'accepted'
    check('sync identical retry returns original receipt', original, a, first_raw)
    check('sync accepted retry does not advance clock', f"select revision from public.journal_sync_clock where owner_id='{a}';", value=first['revision'])
    check('sync token reuse with altered content rejected', apply(other, dict(point, longitude=115), token=token), a, error='22023')
    check('sync same record id is isolated per account', apply(other, point), b)
    check('sync foreign note link denied', request('journalEntries', str(uuid4()), record={'observation_id': obs}), b, error='23503')
    for change, error in [({'filename': 'private.jpg'}, '22023'), ({'owner_id': b}, '22023'),
                          ({'longitude': '114'}, '22023'), ({'longitude': 181}, '23514'),
                          ({'capture_local': '2026-09-01T10:00:00Z'}, '22023'),
                          ({'palette': {'algorithm': 'rgb-histogram-v1', 'colors': ['#AABBCC', '#AABBCC']}}, '23514'),
                          ({'palette': {'algorithm': 'rgb-histogram-v1', 'colors': ['red']}}, '23514')]:
        check(f'sync malformed or private fields rejected: {change}', apply(str(uuid4()), dict(point, **change)), a, error=error)
    check('sync rejected operations leave no receipts or clock gaps', f"select revision={first['revision']} and (select count(*) from public.journal_sync_receipts where owner_id='{a}')=1 from public.journal_sync_clock where owner_id='{a}';", value='t')
    check('sync palette round trips with exact coordinates', f"select record->'palette'='{json.dumps(point['palette'])}'::jsonb and record->>'longitude'='114.15' from public.pull_journal_changes() where id='{other}';", a, 't')
    barrier = Barrier(2)

    def race(longitude):
        barrier.wait(timeout=10)
        return json.loads(sql(apply(other, dict(point, longitude=longitude), base=first['revision']), a))

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(race, [114.16, 114.17]))
    assert sorted(r['status'] for r in results) == ['accepted', 'conflict'], results
    check('sync simultaneous same-base edits accept only one', f"select revision from public.journal_sync_clock where owner_id='{a}';", value=str(int(first['revision']) + 1))
    current = next(r['revision'] for r in results if r['status'] == 'accepted')
    stale = json.loads(sql(apply(other, point, base=first['revision']), a))
    assert stale == {'status': 'conflict', 'revision': current, 'deleted': False}, stale
    check('sync stale edit preserves winning revision', f"select revision from public.journal_sync_state where id='{other}';", a, current)
    base_obs = sql(f"select revision from public.journal_sync_state where id='{obs}';", a)
    deletion = json.loads(sql(apply(obs, operation='delete', base=base_obs), a))
    check('sync deletion unlinks note and publishes its revision first', f"select j.observation_id is null and s.revision<{deletion['revision']} and s.revision>{current} from public.journal_entries j join public.journal_sync_state s on j.id=s.id and j.owner_id=s.owner_id where j.id='{note}';", a, 't')
    check('sync deletion feed contains only tombstone', f"select deleted and record is null from public.pull_journal_changes() where id='{obs}';", a, 't')
    resurrect = json.loads(sql(apply(obs, point, base=deletion['revision']), a))
    assert resurrect['status'] == 'conflict' and resurrect['deleted'] is True, resurrect
    check('sync deleted record cannot be resurrected with newest revision', f"select count(*) from public.observations where id='{obs}';", a, '0')
    sql(apply(other, operation='delete', base=current), a)
    retry = json.loads(sql(original, a))
    assert retry == first, retry
    check('sync old accepted retry cannot resurrect deleted content', f"select count(*) from public.observations where id='{other}';", a, '0')
    check('sync other account content survives deletion', f"select count(*) from public.observations where id='{other}';", b, '1')
    unseen = str(uuid4())
    sql(apply(unseen, operation='delete'), a)
    check('sync deleting unseen record retains marker', f"select deleted from public.journal_sync_state where id='{unseen}';", a, 't')
    for bounds in ['-1,100', '0,0', '0,501', 'null,10']:
        check(f'sync invalid page rejected: {bounds}', f'select * from public.pull_journal_changes({bounds});', a, error='22023')
    check('sync page limit enforced', 'select count(*) from public.pull_journal_changes(0,1);', a, '1')
    cursor = sql('select revision from public.pull_journal_changes(0,1);', a)
    check('sync cursor excludes prior revision', f'select bool_and(revision::bigint>{cursor}) from public.pull_journal_changes({cursor});', a, 't')
    transient = str(uuid4())
    sql('begin; ' + apply(transient, point) + ' rollback;', a)
    check('sync transaction rollback removes content and state', f"select not exists(select 1 from public.observations where id='{transient}') and not exists(select 1 from public.journal_sync_state where id='{transient}');", a, 't')
    def retire(record_id, operation_token, store='observations'):
        return f"select public.retire_journal_put('{operation_token}','{store}','{record_id}');"

    retired_id, retired_token = str(uuid4()), str(uuid4())
    check('retirement RPC has restricted owner and empty search path', "select prosecdef and proowner='journal_sync_writer'::regrole and proconfig=array['search_path=\"\"'] from pg_proc where oid='public.retire_journal_put(uuid,text,uuid)'::regprocedure;", value='t')
    check('retired markers deny direct access', 'select * from public.journal_sync_retired;', a, error='42501')
    check('anonymous retirement denied', retire(retired_id, retired_token), '', error='42501', role='anon')
    check('identity-less retirement denied', retire(retired_id, retired_token), '', error='42501')
    before = sql(f"select revision from public.journal_sync_clock where owner_id='{a}';")
    retired = sql(retire(retired_id, retired_token), a)
    assert json.loads(retired) == dict(status='retired', token=retired_token, store='observations',
                                      id=retired_id, revision='0', deleted=False)
    check('retirement retry returns immutable result', retire(retired_id, retired_token), a, retired)
    check('retirement does not advance feed clock', f"select revision from public.journal_sync_clock where owner_id='{a}';", value=before)
    check('late put returns retirement without writing', apply(retired_id, point, token=retired_token), a, retired)
    check('retired token cannot perform deletion', apply(retired_id, operation='delete', token=retired_token), a, error='22023')
    check('retired token cannot change target', retire(other, retired_token), a, error='22023')
    check('retired put cannot change target', apply(other, point, token=retired_token), a, error='22023')
    check('retirement retains no content or digest', f"select result-ARRAY['status','token','store','id','revision','deleted']='{{}}'::jsonb from public.journal_sync_retired where owner_id='{a}' and token='{retired_token}';", value='t')
    check('retirement leaves no content or feed state', f"select not exists(select 1 from public.observations where id='{retired_id}') and not exists(select 1 from public.journal_sync_state where id='{retired_id}');", a, 't')
    check('same retirement token is isolated by owner', apply(retired_id, point, token=retired_token), b)
    sql(apply(retired_id, operation='delete'), a)
    check('old retirement retry remains stable after tombstone', retire(retired_id, retired_token), a, retired)
    check('delayed retired put cannot resurrect tombstone', apply(retired_id, point, token=retired_token), a, retired)
    check('already accepted put returns receipt after later deletion', retire(other, token), a, first_raw)
    check('accepted receipt target mismatch rejected', retire(retired_id, token), a, error='22023')
    delete_token = str(uuid4())
    sql(apply(str(uuid4()), operation='delete', token=delete_token), a)
    check('deletion token cannot be retired as a put', retire(retired_id, delete_token), a, error='22023')
    rolled_id, rolled_token = str(uuid4()), str(uuid4())
    sql('begin; ' + retire(rolled_id, rolled_token) + ' rollback;', a)
    assert json.loads(sql(apply(rolled_id, point, token=rolled_token), a))['status'] == 'accepted'
    check('rolled back retirement does not prevent a put', f"select count(*) from public.observations where id='{rolled_id}';", a, '1')
    race_id, race_token = str(uuid4()), str(uuid4())
    race_barrier = Barrier(2)

    def race_retirement(statement):
        race_barrier.wait(timeout=10)
        return json.loads(sql(statement, a))

    with ThreadPoolExecutor(max_workers=2) as pool:
        race_results = list(pool.map(race_retirement, [apply(race_id, point, token=race_token), retire(race_id, race_token)]))
    assert race_results[0] == race_results[1], race_results
    assert race_results[0]['status'] in ['accepted', 'retired'], race_results
    check('concurrent put and retirement agree on one outcome', f"select count(*) from public.observations where id='{race_id}';", a,
          '1' if race_results[0]['status'] == 'accepted' else '0')
    check('concurrent retry returns same immutable outcome', apply(race_id, point, token=race_token), a,
          sql(retire(race_id, race_token), a))
    sql(f"delete from auth.users where id='{a}';")
    for table in ['observations', 'journal_entries', 'journal_sync_clock', 'journal_sync_state', 'journal_sync_receipts', 'journal_sync_retired']:
        check(f'sync account deletion clears {table}', f"select count(*) from public.{table} where owner_id='{a}';", value='0')
