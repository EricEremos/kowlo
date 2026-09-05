import { LocalJournal } from '../../src/journal/local-journal.mjs';
import { checkChanges } from './change-checks.mjs';
import { checkSync } from './sync-checks.mjs';
import { checkPull } from './pull-checks.mjs';
import { checkConflicts } from './conflict-checks.mjs';
import { checkRetirement } from './retirement-checks.mjs';

const run = document.querySelector('#run');
const reload = document.querySelector('#reload');
const status = document.querySelector('#status');
const list = document.querySelector('#results');
const report = document.querySelector('#report');
const receiptKey = 'hk-journal-synthetic-reload';
let cases = [];

function assert(value, message) { if (!value) throw new Error(message); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function rejected(operation, name) {
  try { await operation; } catch (error) {
    assert(error.name === name, `Expected ${name}; received ${error.name}`);
    return;
  }
  throw new Error(`Expected ${name}`);
}
function passed(name) {
  cases.push(name);
  const item = document.createElement('li');
  item.textContent = `PASS: ${name}`;
  list.append(item);
}
function finish(phase) {
  const value = { status: 'passed', phase, checks: cases.length, cases, browser: navigator.userAgent };
  report.textContent = JSON.stringify(value, null, 2);
  status.textContent = `${cases.length} checks passed. ${phase === 'before-reload' ? 'Saved draft ready for reload verification.' : 'Reload and deletion verified.'}`;
}
function failed(error) {
  status.textContent = `FAILED: ${error.name}: ${error.message}`;
  report.textContent = JSON.stringify({ status: 'failed', checks: cases.length, cases, error: error.message }, null, 2);
}

run.addEventListener('click', async () => {
  run.disabled = true;
  list.replaceChildren();
  cases = [];
  const store = new LocalJournal();
  const a = { kind: 'account', id: crypto.randomUUID() };
  const b = { kind: 'account', id: crypto.randomUUID() };
  const id = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const point = { id, longitude: 114.15, latitude: 22.285 };
  try {
    await rejected(store.snapshot(), 'InvalidStateError');
    passed('Closed sessions cannot read');
    await store.activate(a);
    await store.putObservation({ ...point, image: new Uint8Array([1, 2]), filename: 'private.jpg', ownerId: b.id });
    await store.putObservation(point);
    let snapshot = await store.snapshot();
    assert(snapshot.observations.length === 1, 'Repeated scan duplicated a record');
    assert(equal(Object.keys(snapshot.observations[0]), ['id', 'longitude', 'latitude', 'captureTime']), 'Unexpected metadata stored');
    passed('Stable identity upserts once and excludes image bytes, filenames and owner fields');
    const palette = { algorithm: 'rgb-histogram-v1', colors: ['#C81414', '#14C814'], image: 'excluded' };
    await store.putObservation({ ...point, palette });
    await store.activate(a);
    assert(equal((await store.snapshot()).observations[0].palette, { algorithm: palette.algorithm, colors: palette.colors }), 'Palette did not survive reopening or leaked extra fields');
    for (const invalid of [null, { algorithm: 'unknown', colors: ['#FFFFFF'] }, { ...palette, colors: [] }, { ...palette, colors: ['red'] }, { ...palette, colors: ['#FFFFFF', '#FFFFFF'] }, { ...palette, colors: ['#000000', '#111111', '#222222', '#333333'] }]) {
      await rejected(store.putObservation({ ...point, palette: invalid }), 'TypeError');
    }
    assert(equal((await store.snapshot()).observations[0].palette.colors, palette.colors), 'Invalid palette changed the saved record');
    await store.putObservation(point);
    assert(!(await store.snapshot()).observations[0].palette, 'GPS-only upsert retained an opted-out palette');
    passed('Optional palettes survive reopening, exclude extra fields and reject malformed colours');
    await store.putObservation({ ...point, id: crypto.randomUUID() });
    assert((await store.snapshot()).observations.length === 2, 'Equal coordinates collapsed distinct photos');
    passed('Distinct photo identifiers retain equal coordinates');
    await store.putJournalEntry({ id: entryId, observationId: id, note: '記憶 / 기억 🌿', correctedPlaceLabel: 'My harbour corner' });
    await store.putObservation({ ...point, longitude: 114.151 });
    snapshot = await store.snapshot();
    assert(snapshot.journalEntries[0].correctedPlaceLabel === 'My harbour corner', 'GPS edit erased a correction');
    passed('Photo GPS edits preserve authored notes and labels');
    await store.activate(b);
    assert((await store.snapshot()).observations.length === 0, 'Account A data leaked to B');
    await rejected(store.putJournalEntry({ id: entryId, observationId: id }), 'NotFoundError');
    await store.putObservation(point);
    passed('Account partitions hide records and reject foreign note links');
    await store.activate({ kind: 'device', id: a.id });
    assert((await store.snapshot()).observations.length === 0, 'Account data leaked to device drafts');
    passed('Device drafts remain separate even when scope identifiers match');
    await store.activate(a);
    const beforeInvalid = await store.exportJSON();
    for (const coordinates of [{ latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { longitude: -181 }]) {
      await rejected(store.putObservation({ ...point, ...coordinates }), 'TypeError');
    }
    assert(await store.exportJSON() === beforeInvalid, 'Invalid coordinate write changed data');
    passed('Nonfinite and out-of-range coordinates leave the journal unchanged');
    await rejected(store.putObservation({ ...point, captureTime: { status: 'with-offset', local: '2026-02-30T10:00:00', offset: '+08:00' } }), 'TypeError');
    await rejected(store.putObservation({ ...point, captureTime: { status: 'with-offset', local: '2026-09-06T10:00:00', offset: '+14:01' } }), 'TypeError');
    await rejected(store.putObservation({ ...point, captureTime: { status: 'timezone-unknown', local: '2026-09-06T10:00:00', offset: '+08:00' } }), 'TypeError');
    await store.putObservation({ ...point, captureTime: { status: 'timezone-unknown', local: '2026-09-06T10:00:00' } });
    assert(!(await store.snapshot()).observations.find(row => row.id === id).captureTime.offset, 'Invented offset');
    passed('Invalid capture dates/offsets rejected and unknown timezone preserved');
    await store.putJournalEntry({ id: entryId, observationId: id, note: '🌿'.repeat(4000) });
    await rejected(store.putJournalEntry({ id: entryId, note: '🌿'.repeat(4001) }), 'TypeError');
    passed('Unicode note length matches PostgreSQL character limits');
    const pendingId = crypto.randomUUID();
    const pendingWrite = rejected(store.putObservation({ ...point, id: pendingId }), 'AbortError');
    const pendingRead = rejected(store.snapshot(), 'AbortError');
    await store.activate(b);
    await Promise.all([pendingWrite, pendingRead]);
    await store.activate(a);
    assert(!(await store.snapshot()).observations.some(row => row.id === pendingId), 'Interrupted write committed');
    passed('Account switch aborts unfinished writes and rejects stale reads');
    const superseded = rejected(store.activate(b), 'AbortError');
    await store.activate(a);
    await superseded;
    assert((await store.snapshot()).observations.length === 2, 'Racing activation selected wrong account');
    passed('Latest account activation wins a concurrent open race');
    await store.deleteObservation(id);
    snapshot = await store.snapshot();
    assert(snapshot.journalEntries[0].observationId === null && snapshot.journalEntries[0].note.length > 0, 'Deleted location erased note');
    passed('Observation deletion unlinks and preserves the authored note');
    await store.deleteJournalEntry(entryId);
    assert((await store.snapshot()).journalEntries.length === 0, 'Explicit note deletion failed');
    passed('Explicit note deletion removes its content');
    await store.deleteAll();
    let seed = 17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const expected = [];
    for (let index = 0; index < 64; index++) {
      const record = { id: crypto.randomUUID(), longitude: random() * 360 - 180, latitude: random() * 180 - 90 };
      expected.push(await store.putObservation(record));
    }
    expected.sort((x, y) => x.id.localeCompare(y.id));
    const exported = JSON.parse(await store.exportJSON());
    assert(exported.schemaVersion === 1 && equal(exported.observations, expected), 'Export did not preserve coordinates');
    passed('64 seeded coordinate records survive JSON export without rounding or loss');
    await store.deleteAll();
    assert(equal(await store.snapshot(), { schemaVersion: 1, observations: [], journalEntries: [] }), 'Delete all did not clear both stores');
    await store.activate(b);
    assert((await store.snapshot()).observations.length === 1, 'A deletion affected B');
    await store.deleteAll();
    passed('Delete all is scoped and clears both record types');
    await checkChanges(passed);
    await checkSync(passed);
    await checkPull(passed);
    await checkConflicts(passed);
    await checkRetirement(passed);
    await store.activate(a);
    await store.putObservation(point);
    await store.putJournalEntry({ id: entryId, observationId: id, note: 'Reload keeps my memory.' });
    const expectedSnapshot = await store.snapshot();
    const expectedChanges = (await store.pendingChanges()).changes;
    sessionStorage.setItem(receiptKey, JSON.stringify({ scope: a, expectedSnapshot, expectedChanges, cases }));
    store.close();
    reload.disabled = false;
    finish('before-reload');
  } catch (error) { failed(error); }
  finally { store.close(); }
});

reload.addEventListener('click', () => location.reload());

const receipt = sessionStorage.getItem(receiptKey);
if (receipt) {
  run.disabled = true;
  const saved = JSON.parse(receipt);
  for (const name of saved.cases) passed(name);
  const store = new LocalJournal();
  try {
    await store.activate(saved.scope);
    assert(equal(await store.snapshot(), saved.expectedSnapshot), 'Reload changed the saved draft');
    passed('Full page reload preserves exact saved locations and notes');
    assert(equal((await store.pendingChanges()).changes, saved.expectedChanges), 'Reload lost pending edits or deletions');
    passed('Full page reload preserves pending edit and deletion tokens exactly');
    await store.deleteAll();
    store.close();
    await store.activate(saved.scope);
    assert((await store.snapshot()).observations.length === 0 && (await store.snapshot()).journalEntries.length === 0, 'Deleted records returned');
    passed('Deletion persists after closing and reopening storage');
    sessionStorage.removeItem(receiptKey);
    finish('after-reload');
  } catch (error) { failed(error); }
  finally { store.close(); run.disabled = false; }
}
