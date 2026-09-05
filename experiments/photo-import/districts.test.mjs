import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDistrictClassifier, countDistrictMilestones, DISTRICT_SOURCE_SHA256 } from './districts.mjs';

const raw = await readFile(new URL('../../data/reference/hk-districts.geojson', import.meta.url));
const collection = JSON.parse(raw);
const classify = createDistrictClassifier(collection);
const oracle = JSON.parse(await readFile(new URL('./fixtures/district-oracle.json', import.meta.url)));

test('source bytes and independent oracle bind to the pinned dataset', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), DISTRICT_SOURCE_SHA256);
  assert.equal(oracle.sourceSha256, DISTRICT_SOURCE_SHA256);
});

test('JavaScript agrees with GEOS interiors, grid, shared edges and nearby points', () => {
  for (const item of oracle.cases) {
    const result = classify(item.longitude, item.latitude);
    assert.deepEqual(result.matches.map(({ id, relation }) => ({ id, relation })), item.matches, item.name);
    const assigned = item.matches.length === 1 && item.matches[0].relation === 'interior';
    assert.equal(result.status, assigned ? 'assigned' : item.matches.length ? 'ambiguous' : 'outside-dataset', item.name);
    assert.equal(result.milestoneDistrictId, assigned ? item.matches[0].id : null, item.name);
  }
});

test('invalid GPS values cannot produce milestones', () => {
  for (const point of [[NaN, 22], [114, Infinity], ['114', 22], [true, 22], [181, 22], [114, -91]]) {
    assert.equal(classify(...point).status, 'invalid-coordinate');
    assert.equal(classify(...point).milestoneDistrictId, null);
  }
});

test('repeated photos count one district, ambiguous and outside coordinates count zero', () => {
  const central = { status: 'accepted', district: classify(114.1589, 22.2819) };
  const boundary = oracle.cases.find(item => item.matches.length > 1);
  const results = [central, central, { status: 'accepted', district: classify(boundary.longitude, boundary.latitude) }, { status: 'accepted', district: classify(-70.6, -33.8) }];
  assert.equal(countDistrictMilestones(results), 1);
  results.push({ status: 'accepted', district: classify(114.2, 22.38) });
  assert.equal(countDistrictMilestones(results), 2);
});

test('malformed and singly unclosed rings fail initialization', () => {
  for (const mutate of [data => { data.features[0].geometry.coordinates[0][0][0] = NaN; }, data => { data.features[0].geometry.coordinates[0].at(-1)[0] += 0.1; }, data => { data.features[0].geometry.type = 'MultiPolygon'; }]) {
    const broken = structuredClone(collection);
    mutate(broken);
    assert.throws(() => createDistrictClassifier(broken));
  }
});
