import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPalette } from './palette.mjs';

test('Dominant accents follow population and suppress near duplicates', () => {
  const pixels = [[200, 20, 20, 255], [200, 20, 20, 255], [208, 25, 25, 255], [20, 200, 20, 255], [20, 20, 200, 255]];
  assert.deepEqual(extractPalette(new Uint8ClampedArray(pixels.flat())).colors, ['#C81414', '#1414C8', '#14C814']);
});

test('Transparent pixels cannot colour a place; neutral images stay neutral', () => {
  assert.deepEqual(extractPalette(new Uint8ClampedArray([255, 0, 0, 0])).colors, []);
  assert.deepEqual(extractPalette(new Uint8ClampedArray([255, 0, 0, 127, 128, 128, 128, 255])).colors, ['#808080']);
});

test('Malformed and oversized samples are rejected', () => {
  for (const input of [null, [], new Uint8Array(4), new Uint8ClampedArray(0), new Uint8ClampedArray(3), new Uint8ClampedArray(64 * 64 * 4 + 4)]) {
    assert.throws(() => extractPalette(input), TypeError);
  }
});

test('Seeded samples produce bounded deterministic unique hex accents', () => {
  let seed = 20260906;
  for (let run = 0; run < 100; run++) {
    const pixels = new Uint8ClampedArray((run + 1) * 4);
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const before = pixels.slice();
    const palette = extractPalette(pixels);
    assert.deepEqual(palette, extractPalette(pixels));
    assert.deepEqual(pixels, before);
    assert.ok(palette.colors.length <= 3);
    assert.equal(new Set(palette.colors).size, palette.colors.length);
    assert.ok(palette.colors.every(color => /^#[0-9A-F]{6}$/.test(color)));
  }
});
