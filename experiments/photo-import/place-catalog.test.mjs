import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPlaceCatalog, PLACE_SOURCE } from '../../src/geography/place-catalog.mjs';

const points = await readFile(new URL('../../data/reference/hk-place-points.geojson', import.meta.url));
const names = await readFile(new URL('../../data/reference/hk-place-names.json', import.meta.url));
const catalog = await createPlaceCatalog(points, names);

test('every source point and name survives the geographic-ID join exactly', () => {
  const rawPoints = JSON.parse(points).features;
  const rawNames = JSON.parse(names).features.map(row => row.attributes);
  assert.equal(catalog.places.length, 2706);
  assert.equal(new Set(catalog.places.map(place => place.id)).size, 2706);
  assert.equal(catalog.places.reduce((count, place) => count + place.aliases.length, 0), 120);
  for (const feature of rawPoints) {
    const place = catalog.get(feature.properties.GEO_NAME_ID);
    assert.deepEqual([place.longitude, place.latitude], feature.geometry.coordinates);
    assert.equal(place.placeClass, feature.properties.PLACE_CLASS);
    assert.equal(place.placeType, feature.properties.PLACE_TYPE);
    assert.equal(place.sourceDistrictCode, feature.properties.DISTRICT);
    assert.equal(place.source, PLACE_SOURCE);
  }
  for (const row of rawNames) {
    const place = catalog.get(row.GEO_NAME_ID);
    const actual = row.NAME_STATUS === 'Official' ? place.officialName : place.aliases.find(name => name.id === row.PLACE_NAME_ID);
    assert.deepEqual(actual, { id: row.PLACE_NAME_ID, en: row.NAME_EN, zhHant: row.NAME_TC });
  }
});

test('islands, absent translations and aliases retain their distinct source meaning', () => {
  assert.equal(catalog.get('146').placeType, 'Island');
  assert.equal(catalog.get('146').officialName.en, 'Cheung Chau');
  assert.equal(catalog.get('293').officialName.zhHant, null);
  assert.equal(catalog.get('48').aliases[0].en, 'See Chau');
  assert.equal(catalog.get('48').aliases[0].zhHant, null);
  assert.equal(catalog.get('539').sourceDistrictCode, 'STH');
  assert.equal(catalog.get('missing'), null);
  assert.equal(catalog.get(146), null);
});

test('reference identity, coordinates, aliases and provenance cannot be mutated', () => {
  for (const mutate of [
    () => { catalog.places.pop(); },
    () => { catalog.get('146').longitude = 0; },
    () => { catalog.get('146').officialName.en = 'Changed'; },
    () => { catalog.get('48').aliases.push({}); },
    () => { catalog.get('48').aliases[0].en = 'Changed'; },
    () => { catalog.source.namesSha256 = 'Changed'; },
  ]) assert.throws(mutate, TypeError);
});

test('truncation, byte changes, reserialization and swapped sources fail closed', async () => {
  const changed = Uint8Array.from(points);
  changed[100] ^= 1;
  for (const [p, n] of [
    [changed, names], [points.subarray(0, -1), names],
    [points, names.subarray(0, -1)], [names, points],
    [new TextEncoder().encode(JSON.stringify(JSON.parse(points))), names],
  ]) await assert.rejects(createPlaceCatalog(p, n), /source hash mismatch/);
  await assert.rejects(createPlaceCatalog(JSON.parse(points), names), TypeError);
});

test('async hashing uses owned snapshots and supports ArrayBuffer and offset views', async () => {
  const p = Uint8Array.from(points);
  const n = Uint8Array.from(names);
  const pending = createPlaceCatalog(p.buffer, n);
  p.fill(0); n.fill(0);
  const loaded = await pending;
  assert.deepEqual(loaded.places, catalog.places);
  const padded = new Uint8Array(points.length + 12);
  padded.set(points, 6);
  const offset = await createPlaceCatalog(padded.subarray(6, -6), names);
  assert.deepEqual(offset.places, catalog.places);
});
