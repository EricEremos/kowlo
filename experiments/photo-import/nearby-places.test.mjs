import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPlaceCatalog, PLACE_SOURCE } from '../../src/geography/place-catalog.mjs';
import { createNearbyPlaceFinder } from '../../src/geography/nearby-places.mjs';
import { createDistrictClassifier, countDistrictMilestones } from './districts.mjs';

const reference = name => readFile(new URL(`../../data/reference/${name}`, import.meta.url));
const catalog = await createPlaceCatalog(await reference('hk-place-points.geojson'), await reference('hk-place-names.json'));
const classify = createDistrictClassifier(JSON.parse(await reference('hk-districts.geojson')));
const find = createNearbyPlaceFinder(catalog, classify, { radiusMetres: 1000 });

test('urban, village and island controls keep official IDs, types and source pins', () => {
  for (const [coordinate, ids] of [
    [[114.154, 22.281], ['1896', '96', '1111']],
    [[114.2, 22.38], ['2734', '1725', '3070']],
    [[113.9439, 22.288], ['3125', '2730', '1046']],
    [[114.028, 22.208], ['146', '2223', '720']],
  ]) {
    const result = find(...coordinate);
    assert.deepEqual(result.candidates.map(item => item.id), ids);
    assert.deepEqual(result.source, PLACE_SOURCE);
    for (const candidate of result.candidates) {
      assert.deepEqual(candidate.name, catalog.get(candidate.id).officialName);
      assert.equal(candidate.confirmed, false);
      assert.ok(candidate.distanceMetres >= 0 && candidate.distanceMetres <= 1000);
    }
  }
  assert.equal(find(114.028, 22.208).candidates[0].placeType, 'Island');
});

test('no candidate is forced for marine gaps, outside points, invalid GPS or uncertain geography', () => {
  assert.equal(find(114.17, 22.29).status, 'no-nearby-labels');
  assert.equal(find(114.4, 22.08).status, 'outside-dataset');
  for (const coordinate of [[NaN, 22], [Infinity, 22], ['114', 22], [181, 22], [114, 91]]) {
    assert.equal(find(...coordinate).status, 'invalid-coordinate');
  }
  for (const status of ['ambiguous', 'outside-dataset', 'geography-unavailable']) {
    const result = createNearbyPlaceFinder(catalog, () => ({ status }), { radiusMetres: 1000 })(114.154, 22.281);
    assert.equal(result.status, status);
    assert.deepEqual(result.candidates, []);
  }
  assert.equal(createNearbyPlaceFinder(catalog, undefined, { radiusMetres: 1000 })(114.154, 22.281).status, 'geography-unavailable');
});

test('radius changes suggestions without changing administrative achievements or GPS', () => {
  const result = { status: 'accepted', longitude: 114.17, latitude: 22.29, district: classify(114.17, 22.29) };
  const before = structuredClone(result);
  result.locality = createNearbyPlaceFinder(catalog, classify, { radiusMetres: 2000 })(result.longitude, result.latitude);
  assert.equal(result.locality.candidates.length, 3);
  assert.equal(countDistrictMilestones([result, result]), 1);
  const { locality, ...after } = result;
  assert.deepEqual(after, before);
  assert.equal(countDistrictMilestones([{ status: 'accepted', locality }]), 0);
  assert.equal(createNearbyPlaceFinder(catalog, classify, { radiusMetres: 100000 })(114.4, 22.08).candidates.length, 0);
});

test('ranking uses unrounded distances and stable IDs, and does not filter by source district code', () => {
  const place = { ...catalog.get('96'), longitude: 114, latitude: 22, sourceDistrictCode: 'not-photo-district' };
  const synthetic = { source: PLACE_SOURCE, places: [
    { ...place, id: '30', longitude: 114.000004 },
    { ...place, id: '20', longitude: 114.000001 },
    { ...place, id: '10', longitude: 114.000001 },
  ] };
  const findSynthetic = createNearbyPlaceFinder(synthetic, () => ({ status: 'assigned' }), { radiusMetres: 0.2 });
  assert.deepEqual(findSynthetic(114, 22).candidates.map(item => item.id), ['10', '20']);
  assert.equal(findSynthetic(114, 22).candidates[0].distanceMetres, 0);
});

test('search policy must be explicit and valid', () => {
  for (const policy of [{}, { radiusMetres: 0 }, { radiusMetres: Infinity }, { radiusMetres: 1000, limit: 1.2 }]) {
    assert.throws(() => createNearbyPlaceFinder(catalog, classify, policy), TypeError);
  }
});
