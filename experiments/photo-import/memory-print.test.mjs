import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryPrint, MEMORY_PRINT_VIEWPORT as view } from '../../src/geography/memory-print.mjs';

const record = (id, longitude = 114.1589, latitude = 22.2819, colors) => ({
  id, longitude, latitude,
  ...(colors ? { palette: { algorithm: 'rgb-histogram-v1', colors } } : {}),
});
const snapshot = observations => ({ schemaVersion: 1, observations, journalEntries: [] });

test('nearby memories accumulate without inventing colours, routes or coordinates', () => {
  const a = record('a', 114.1589, 22.2819, ['#9F6952', '#637B6F']);
  const b = record('b', 114.159, 22.282, ['#9F6952', '#D7BD91']);
  const input = snapshot([a, b, record('c')]);
  const original = structuredClone(input);
  const print = memoryPrint(input);
  assert.equal(print.marks.length, 1);
  assert.equal(print.marks[0].observationCount, 3);
  assert.equal(print.marks[0].paletteCount, 2);
  assert.deepEqual(print.marks[0].colors, ['#9F6952', '#637B6F', '#D7BD91']);
  assert.deepEqual(print.marks[0].members.map(({ id, longitude, latitude }) => ({ id, longitude, latitude })),
    [a, b, record('c')].map(({ id, longitude, latitude }) => ({ id, longitude, latitude })));
  assert.deepEqual(memoryPrint(snapshot([...input.observations].reverse())), print);
  assert.deepEqual(memoryPrint(snapshot([b])).marks[0].colors, ['#9F6952', '#D7BD91']);
  assert.deepEqual(memoryPrint(snapshot([record('c')])).marks[0].colors, []);
  assert.deepEqual(memoryPrint(snapshot([])).marks, []);
  assert.deepEqual(input, original);
});

test('viewport edges remain on canvas; cropped records are accounted for', () => {
  const print = memoryPrint(snapshot([
    record('nw', view.west, view.north), record('se', view.east, view.south),
    record('outside', view.west - 0.000001, view.north), record('overseas', -70.6, -33.8),
  ]));
  assert.equal(print.observationCount, 4);
  assert.equal(print.displayedObservationCount, 2);
  assert.deepEqual(print.marks.map(({ x, y }) => [x, y]), [[5, 5], [995, 842.5]]);
  assert.deepEqual(print.marks.map(mark => [mark.members[0].x, mark.members[0].y]), [[0, 0], [1000, 845]]);
  assert.deepEqual(print.outsideViewport.map(item => item.id), ['outside', 'overseas']);
});

test('deterministic generated coordinates conserve membership, colour provenance and grid bounds', () => {
  let seed = 137;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const observations = Array.from({ length: 1000 }, (_, i) => record(String(i),
    view.west - 0.05 + random() * 0.61, view.south - 0.05 + random() * 0.5,
    i % 3 ? ['#637B6F'] : undefined));
  const result = memoryPrint(snapshot(observations));
  assert.deepEqual(memoryPrint(snapshot([...observations].reverse())), result);
  const members = result.marks.flatMap(mark => mark.members);
  assert.equal(members.length + result.outsideViewport.length, observations.length);
  assert.equal(new Set([...members, ...result.outsideViewport].map(item => item.id)).size, observations.length);
  for (const mark of result.marks) {
    assert.ok(mark.x >= 0 && mark.x <= view.width && mark.y >= 0 && mark.y <= view.height);
    assert.equal(mark.observationCount, mark.members.length);
    assert.ok(mark.colors.every(color => color === '#637B6F'));
    for (const member of mark.members) {
      assert.ok(Math.abs(mark.x - member.x) <= view.cellSize / 2 + 1e-9);
      assert.ok(Math.abs(mark.y - member.y) <= view.cellSize / 2 + 1e-9);
    }
  }
});

test('invalid snapshots, coordinates, palettes and duplicate identifiers fail explicitly', () => {
  for (const input of [null, snapshot([record('a'), record('a')]),
    snapshot([record('a', NaN)]), snapshot([record('a', 181)]),
    snapshot([record('a', 114, -91)]), snapshot([record('a', 114, 22, ['bad'])]),
    snapshot([record('a', 114, 22, ['#FFFFFF', '#FFFFFF'])])]) {
    assert.throws(() => memoryPrint(input), TypeError);
  }
});
