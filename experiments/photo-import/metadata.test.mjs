import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractMetadata, captureTime, MAX_FILE_BYTES } from './metadata.mjs';

const fixture = async name => new Uint8Array(await readFile(new URL(`fixtures/${name}`, import.meta.url)));
const cases = JSON.parse(await readFile(new URL('fixtures/manifest.json', import.meta.url), 'utf8'));
for (const item of cases) {
  test(`fixture: ${item.file}`, async () => {
    const result = await extractMetadata(await fixture(item.file));
    assert.equal(result.status, item.status);
    if (item.latitude !== undefined) {
      assert.ok(Math.abs(result.latitude - item.latitude) < 1e-7);
      assert.ok(Math.abs(result.longitude - item.longitude) < 1e-7);
      assert.deepEqual(Object.keys(result).sort(), ['format', 'latitude', 'longitude', 'status']);
    }
  });
}
test('dates require opt-in and retain explicit offset only', async () => {
  const result = await extractMetadata(await fixture('gps-dated.jpg'), { includeCaptureTime: true });
  assert.deepEqual(result.captureTime, { status: 'with-offset', local: '2026-09-05T17:30:00', offset: '+08:00', instant: '2026-09-05T09:30:00.000Z' });
  assert.equal(JSON.stringify(result).includes('SYNTHETIC-DO-NOT-RETAIN'), false);
  const unknown = await extractMetadata(await fixture('gps-no-offset.jpg'), { includeCaptureTime: true });
  assert.deepEqual(unknown.captureTime, { status: 'timezone-unknown', local: '2026-09-05T17:30:00' });
  const missing = await extractMetadata(await fixture('gps-undated.jpg'), { includeCaptureTime: true });
  assert.deepEqual(missing.captureTime, { status: 'missing' });
});
test('capture time rejects calendar overflow and impossible offsets', () => {
  assert.equal(captureTime({ DateTimeOriginal: '2026:02:30 12:00:00' }).status, 'invalid');
  for (const offset of ['+14:01', '-15:00', '+01:70', 'Asia/Hong_Kong', 8]) {
    assert.equal(captureTime({ DateTimeOriginal: '2026:09:05 17:30:00', OffsetTimeOriginal: offset }).status, 'invalid-offset');
  }
});
test('input boundary rejects URL strings, paths and oversized bytes', async () => {
  for (const input of ['https://example.com/photo.jpg', '/private/photo.jpg', null, {}, new ArrayBuffer(12)]) {
    assert.deepEqual(await extractMetadata(input), { status: 'invalid-input' });
  }
  assert.deepEqual(await extractMetadata(new Uint8Array(MAX_FILE_BYTES + 1)), { status: 'too-large' });
});
test('truncated JPEG metadata never creates an accepted location', async () => {
  const bytes = await fixture('gps-dated.jpg');
  for (let length = 0; length < 40; length++) {
    const result = await extractMetadata(bytes.subarray(0, length));
    assert.notEqual(result.status, 'accepted');
  }
});
