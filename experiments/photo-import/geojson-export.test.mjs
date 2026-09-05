import test from 'node:test';
import assert from 'node:assert/strict';
import { journalGeoJSON } from '../../src/journal/geojson-export.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const point = (n, longitude = 114.1589123456789, latitude = 22.2819123456789) => ({
  id: id(n), longitude, latitude, captureTime: { status: 'timezone-unknown', local: '2026-09-05T19:30:21' },
});
const snapshot = (observations = [], journalEntries = []) => ({ schemaVersion: 1, observations, journalEntries });

test('generated snapshots preserve coordinates, Unicode notes, IDs and unknown time zones through JSON', () => {
  let seed = 7946;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const tokens = ['香港', '나의 기록', 'é', '🌅', '\n', '\u0000', '"', '<script>', '\\'];
  for (let run = 0; run < 200; run++) {
    const observations = Array.from({ length: 1 + run % 9 }, (_, n) => point(n, random() * 360 - 180, random() * 180 - 90));
    const entries = observations.map((record, n) => ({ id: id(100 + n), observationId: record.id,
      note: Array.from({ length: 1 + run % 25 }, () => tokens[Math.floor(random() * tokens.length)]).join(''),
      correctedPlaceLabel: run % 2 ? `My corner ${run} · 香港` : null }));
    const input = snapshot(observations, entries);
    const before = structuredClone(input);
    const result = JSON.parse(JSON.stringify(journalGeoJSON(input)));
    assert.equal(result.features.length, observations.length);
    for (const [n, feature] of result.features.entries()) {
      assert.deepEqual(feature.geometry.coordinates, [observations[n].longitude, observations[n].latitude]);
      assert.deepEqual(feature.properties.captureTime, observations[n].captureTime);
      assert.equal(feature.properties.journalEntries[0].note, entries[n].note);
      assert.equal(feature.properties.journalEntries[0].id, entries[n].id);
      assert.equal(feature.properties.journalEntries[0].personalPlaceLabel?.value ?? null, entries[n].correctedPlaceLabel);
    }
    assert.deepEqual(input, before);
    assert.deepEqual(journalGeoJSON(input), journalGeoJSON(input));
  }
});

test('world bounds, duplicate positions, palettes and retained notes keep their meaning without leaking extra fields', () => {
  const observations = [point(1, -180, -90), point(2, 180, 90), point(3, 0, 0), point(4, 0, 0)];
  observations[0].palette = { algorithm: 'rgb-histogram-v1', colors: ['#123456'], file: 'PRIVATE_BYTES' };
  observations[0].captureTime.file = 'PRIVATE_BYTES';
  observations[0].image = 'PRIVATE_BYTES';
  const entries = [{ id: id(5), observationId: null, note: 'Retained memory', correctedPlaceLabel: 'My shore', file: 'PRIVATE_BYTES' }];
  const output = journalGeoJSON(snapshot(observations, entries));
  assert.equal(output.features.length, 5);
  assert.equal(new Set(output.features.map(feature => feature.id)).size, 5);
  assert.equal(output.features[4].geometry, null);
  assert.deepEqual(output.features[4].properties.personalPlaceLabel, { value: 'My shore', source: 'user-authored', verified: false });
  assert.deepEqual(output.features[0].properties.palette, { algorithm: 'rgb-histogram-v1', colors: ['#123456'], source: 'photo-pixels' });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_BYTES|candidates|milestoneDistrictId/);
  output.features[0].properties.palette.colors.push('#FFFFFF');
  assert.deepEqual(observations[0].palette.colors, ['#123456']);
  assert.deepEqual(journalGeoJSON(snapshot()).features, []);
});

test('known offset remains explicit and missing capture time stays missing', () => {
  for (const captureTime of [{ status: 'missing' }, { status: 'not-requested' }, { status: 'invalid' },
    { status: 'invalid-offset', local: '2026-09-05T19:30:21' },
    { status: 'with-offset', local: '2026-09-05T19:30:21', offset: '+08:00' }]) {
    const record = { ...point(1), captureTime };
    assert.deepEqual(journalGeoJSON(snapshot([record])).features[0].properties.captureTime, captureTime);
  }
});

test('invalid geometry, unsupported snapshots and broken links fail rather than emit misleading map data', () => {
  for (const [longitude, latitude] of [[NaN, 0], [Infinity, 0], [0, -91], [181, 0], ['114', 22]]) {
    assert.throws(() => journalGeoJSON(snapshot([point(1, longitude, latitude)])), /Invalid coordinates/);
  }
  assert.throws(() => journalGeoJSON({ schemaVersion: 2, observations: [], journalEntries: [] }), /Unsupported/);
  assert.throws(() => journalGeoJSON(snapshot([point(1), point(1)])), /Duplicate/);
  assert.throws(() => journalGeoJSON(snapshot([], [{ id: id(2), observationId: id(1), note: 'Lost', correctedPlaceLabel: null }])), /Missing linked/);
});
