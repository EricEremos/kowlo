import { LocalJournal } from '../../src/journal/local-journal.mjs';

function assert(value, message) { if (!value) throw new Error(message); }
async function aborts(promise) {
  try { await promise; } catch (error) {
    assert(error.name === 'AbortError', `Expected AbortError; received ${error.name}`);
    return;
  }
  throw new Error('Expected stale session rejection');
}
const acknowledge = (store, batch) => store.acknowledgeChanges({ sessionId: batch.sessionId, tokens: batch.changes.map(change => change.token) });

export async function checkChanges(passed) {
  const scope = { kind: 'account', id: crypto.randomUUID() };
  const point = { id: crypto.randomUUID(), longitude: 114.15, latitude: 22.285, captureTime: { status: 'missing' } };
  const entry = { id: crypto.randomUUID(), observationId: point.id, note: 'Keep this memory 🌿', correctedPlaceLabel: null };
  let legacyClosed = false;
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(`hk-journal-v1:account:${scope.id}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('observations', { keyPath: 'id' }).put(point);
      const entries = request.result.createObjectStore('journalEntries', { keyPath: 'id' });
      entries.createIndex('observationId', 'observationId');
      entries.put(entry);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); legacyClosed = true; };
      resolve();
    };
  });
  const store = new LocalJournal();
  const peer = new LocalJournal();
  try {
    await store.activate(scope);
    let batch = await store.pendingChanges();
    assert(legacyClosed && batch.changes.length === 2, 'Upgrade did not close the old connection and backfill changes');
    assert(JSON.stringify((await store.snapshot()).observations[0]) === JSON.stringify(point), 'Upgrade changed existing GPS');
    assert(batch.changes.find(change => change.store === 'journalEntries').record.note === entry.note, 'Upgrade lost the note');
    passed('Version 1 upgrade preserves records, closes the old connection and queues existing data');

    await acknowledge(store, batch);
    assert((await store.pendingChanges()).changes.length === 0 && (await store.snapshot()).observations.length === 1, 'Acknowledgment removed journal data');
    assert(await acknowledge(store, batch) === 0, 'Repeated acknowledgment was not harmless');
    passed('Acknowledgment clears only change tokens and can be repeated safely');

    await store.putObservation({ ...point, longitude: 114.151, filename: 'excluded.jpg' });
    const old = await store.pendingChanges();
    await peer.activate(scope);
    await peer.putObservation({ ...point, longitude: 114.152 });
    assert(await acknowledge(store, old) === 0, 'Delayed acknowledgment erased a peer edit');
    batch = await store.pendingChanges();
    assert(batch.changes.length === 1 && batch.changes[0].record.longitude === 114.152, 'Repeated edits did not retain the latest record once');
    assert(!JSON.stringify(batch).includes('excluded.jpg'), 'Change queue leaked an excluded field');
    passed('Two open connections retain the newest edit when an older acknowledgment arrives');

    const pendingId = crypto.randomUUID();
    const aborted = aborts(store.putObservation({ ...point, id: pendingId }));
    store.close();
    await aborted;
    await store.activate(scope);
    assert(!(await store.pendingChanges()).changes.some(change => change.id === pendingId), 'Aborted write left a change token');
    assert(!(await store.snapshot()).observations.some(row => row.id === pendingId), 'Aborted write left a record');
    await aborts(acknowledge(store, batch));
    passed('Aborted writes roll back both record and change; reopening invalidates old acknowledgments');

    const beforeDelete = await store.pendingChanges();
    await store.deleteObservation(point.id);
    assert(await acknowledge(store, beforeDelete) === 0, 'Old put acknowledgment erased the deletion');
    batch = await store.pendingChanges();
    const deletion = batch.changes.find(change => change.store === 'observations');
    const unlinked = batch.changes.find(change => change.store === 'journalEntries');
    assert(deletion.operation === 'delete' && !('record' in deletion), 'Deletion retained GPS payload');
    assert(unlinked.record.observationId === null && unlinked.record.note === entry.note, 'Note unlink was not tracked with the deletion');
    passed('Deleting a photo replaces its queued payload with an identifier-only deletion and tracks the preserved note');

    const other = { kind: 'account', id: crypto.randomUUID() };
    await store.activate(other);
    assert((await store.pendingChanges()).changes.length === 0, 'Pending changes leaked across accounts');
    await aborts(acknowledge(store, batch));
    await store.activate({ kind: 'device', id: scope.id });
    assert((await store.pendingChanges()).changes.length === 0, 'Account queue leaked into local-only scope');
    await store.activate(scope);
    assert((await store.pendingChanges()).changes.length === 2, 'Switching scopes lost pending changes');
    passed('Change queues stay separated between accounts and local-only drafts');

    await store.putObservation({ ...point, id: crypto.randomUUID() });
    await store.deleteAll();
    batch = await store.pendingChanges();
    assert(batch.changes.length === 3 && batch.changes.every(change => change.operation === 'delete' && !('record' in change)), 'Delete all lost tombstones or retained content');
    const exported = JSON.parse(await store.exportJSON());
    assert(exported.observations.length === 0 && exported.journalEntries.length === 0 && !('changes' in exported), 'Export exposed queue internals or deleted data');
    await store.deleteAll();
    const repeated = await store.pendingChanges();
    assert(JSON.stringify(repeated.changes) === JSON.stringify(batch.changes), 'Repeated delete all changed pending deletion tokens');
    passed('Delete all clears content while retaining stable deletion tokens outside user exports');

    try {
      await store.acknowledgeChanges({ sessionId: batch.sessionId, tokens: [batch.changes[0].token, 'invalid'] });
      throw new Error('Invalid token was accepted');
    } catch (error) { assert(error instanceof TypeError, 'Invalid acknowledgment failed unexpectedly'); }
    assert((await store.pendingChanges()).changes.length === 3, 'Malformed acknowledgment partially cleared the queue');
    await store.acknowledgeChanges({ sessionId: batch.sessionId, tokens: [batch.changes[0].token, batch.changes[0].token] });
    assert((await store.pendingChanges()).changes.length === 2, 'Partial acknowledgment removed unrelated changes');
    await acknowledge(store, await store.pendingChanges());
    passed('Malformed acknowledgments make no changes; partial acknowledgments leave other deletions pending');
  } finally { store.close(); peer.close(); }
}
