import hashlib
import json
from uuid import uuid4


def run_district_checks(root, sql, check, a, b):
    source = (root / 'data/reference/hk-districts.geojson').read_bytes()
    digest = hashlib.sha256(source).hexdigest()
    oracle = json.loads((root / 'experiments/photo-import/fixtures/district-oracle.json').read_text())
    assert digest == oracle['sourceSha256']
    sql((root / 'supabase/migrations/202609060004_district_classification.sql').read_text())
    check('unseeded reference fails instead of awarding zero districts',
          'select public.classify_hk_district(114.154,22.281);', b, error='55000')
    sql((root / 'supabase/migrations/202609060005_district_reference_seed.sql').read_text())
    check('18 pinned valid WGS84 districts loaded',
          f"select count(*)=18 and bool_and(source_sha256='{digest}' and extensions.st_isvalid(boundary) and extensions.st_srid(boundary)=4326) from public.hk_districts;", b, 't')
    for feature in json.loads(source)['features']:
        district_id = feature['properties']['地區號碼']
        geometry = json.dumps(feature['geometry']).replace("'", "''")
        check(f'{district_id} seed preserves every source vertex exactly',
              f"select extensions.st_asewkb(boundary)=extensions.st_asewkb(extensions.st_geomfromgeojson('{geometry}')) from public.hk_districts where id='{district_id}';", b, 't')
    check('district functions use invoker rights and empty search path',
          "select count(*)=2 and bool_and(not prosecdef and proconfig=array['search_path=\"\"']) from pg_proc where oid in ('public.classify_hk_district(double precision,double precision)'::regprocedure,'public.observation_districts_in_view(double precision,double precision,double precision,double precision)'::regprocedure);", value='t')
    for statement in ['select * from public.hk_districts;', 'select public.classify_hk_district(114,22);',
                      'select * from public.observation_districts_in_view(-180,-90,180,90);']:
        check(f'anonymous district access denied: {statement}', statement, '', error='42501', role='anon')
    for statement in ["update public.hk_districts set name='forged';", 'delete from public.hk_districts;',
                      "insert into public.hk_districts(id) values ('A');", 'truncate public.hk_districts;']:
        check(f'client cannot modify official reference: {statement}', statement, b, error='42501')
    invalid = json.dumps({'status': 'invalid-coordinate', 'matches': [], 'milestoneDistrictId': None})
    for point in ['null,22', '114,null', "'NaN',22", "114,'Infinity'", "'-Infinity',22", '181,22', '114,-91']:
        check(f'invalid district coordinate gets no milestone: {point}',
              f"select public.classify_hk_district({point})='{invalid}'::jsonb;", b, 't')

    payload = json.dumps(oracle['cases'], allow_nan=False).replace("'", "''")
    results = json.loads(sql(f"""
      select jsonb_agg(jsonb_build_object('name', c->>'name', 'result',
        public.classify_hk_district((c->>'longitude')::double precision, (c->>'latitude')::double precision)) order by n)
      from jsonb_array_elements('{payload}'::jsonb) with ordinality as fixture(c,n);
    """, b))
    for expected, actual in zip(oracle['cases'], results, strict=True):
        assert expected['name'] == actual['name']
        matches = actual['result']['matches']
        assert [{'id': m['id'], 'relation': m['relation']} for m in matches] == expected['matches'], actual
        unique = len(matches) == 1 and matches[0]['relation'] == 'interior'
        assert actual['result']['status'] == ('assigned' if unique else 'ambiguous' if matches else 'outside-dataset'), actual
        assert actual['result']['milestoneDistrictId'] == (matches[0]['id'] if unique else None), actual
        assert actual['result']['sourceSha256'] == digest
    check('all 684 geographic oracle cases match PostGIS classification and milestone rules', 'select true;', value='t')

    sql(f"insert into auth.users values ('{a}');")
    boundary = next(c for c in oracle['cases'] if len(c['matches']) > 1)
    ids = [str(uuid4()) for _ in range(5)]
    points = [(114.154,22.281), (114.154,22.281),
              (boundary['longitude'],boundary['latitude']), (114.4,22.08), (114.2,22.38)]
    def mutation(actor, record_id, point=None, base=0):
        record = 'null' if point is None else "'" + json.dumps({'longitude': point[0], 'latitude': point[1]}) + "'::jsonb"
        return json.loads(sql(f"select public.apply_journal_change('{uuid4()}','observations','{record_id}','{'delete' if point is None else 'put'}',{base},{record});", actor))

    receipts = [mutation(a, record_id, point) for record_id, point in zip(ids, points)]
    assert all(r['status'] == 'accepted' for r in receipts)
    projection = 'public.observation_districts_in_view(-180,-90,180,90)'
    check('private district projection returns exactly the five own synchronized records', f'select count(*) from {projection};', a, '5')
    check('duplicates boundary and outside points cannot inflate two district milestones',
          f"select count(distinct district->>'milestoneDistrictId') from {projection};", a, '2')
    check('boundary and outside observations remain visible without milestone',
          f"select count(*) from {projection} where district->>'milestoneDistrictId' is null;", a, '2')
    check('other account cannot see district records from A',
          f"select count(*) from {projection} where observation_id in ({','.join(repr(i) for i in ids)});", b, '0')
    check('identity-less district projection is empty', f'select count(*) from {projection};', '', '0')
    check('district projection retains viewport bounds validation',
          'select * from public.observation_districts_in_view(0,10,1,0);', a, error='22023')
    updated = mutation(a, ids[4], points[0], receipts[4]['revision'])
    assert updated['status'] == 'accepted'
    check('coordinate update recomputes districts without stale achievement',
          f"select count(distinct district->>'milestoneDistrictId') from {projection};", a, '1')
    deleted = mutation(a, ids[0], base=receipts[0]['revision'])
    assert deleted['status'] == 'accepted'
    check('deletion removes its district projection', f"select count(*) from {projection} where observation_id='{ids[0]}';", a, '0')
    sql(f"delete from auth.users where id='{a}';")
    check('account deletion leaves no personal district projection', f'select count(*) from {projection};', a, '0')
    check('account deletion preserves shared official reference', 'select count(*) from public.hk_districts;', b, '18')
    return {'sourceSha256': digest, 'oracleCount': len(results), 'results': results}
