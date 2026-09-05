import { LocalJournal } from '../../src/journal/local-journal.mjs';

function assert(value, message) { if (!value) throw new Error(message); }
async function rejects(operation, name) {
  try { await operation; } catch (error) { assert(error.name === name, error.message); return; }
  throw new Error(`Expected ${name}`);
}
function receipt(flight, revision) {
  return { status: 'accepted', token: flight.token, store: flight.store, id: flight.id,
    deleted: flight.operation === 'delete', revision };
}
const accept = (journal, flight, revision) => journal.acceptSyncResult({
  sessionId: flight.sessionId, token: flight.token, response: receipt(flight, revision),
});

export async function checkSync(passed) {
  const scope = { kind: 'account', id: crypto.randomUUID() };
  const point = { id: crypto.randomUUID(), longitude: 114.15, latitude: 22.28,
    captureTime: { status: 'with-offset', local: '2026-09-06T09:00:00', offset: '+08:00' },
    palette: { algorithm: 'rgb-histogram-v1', colors: ['#AABBCC'] } };
  const store = new LocalJournal();
  const peer = new LocalJournal();
  try {
    await store.activate({ kind: 'device', id: scope.id });
    await rejects(store.nextSyncRequest(), 'InvalidStateError');
    await store.activate(scope);
    assert(await store.nextSyncRequest() === null, 'Empty outbox produced request');
    await store.putObservation({ ...point, filename: 'private.jpg' });
    await store.putJournalEntry({ id: crypto.randomUUID(), observationId: point.id, note: 'A harbour morning' });
    const first = await store.nextSyncRequest();
    assert(first.store === 'observations' && first.baseRevision === '0', 'Linked note sent before observation');
    assert(first.record.capture_offset_minutes === 480 && first.record.palette.colors[0] === '#AABBCC', 'Metadata mapping failed');
    assert(!JSON.stringify(first).includes('private.jpg'), 'Unexpected metadata leaked');
    passed('Account-only outbox sends observation before linked note with exact GPS, palette and explicit timezone');

    await peer.activate(scope);
    const parallel = await peer.nextSyncRequest();
    assert(parallel.token === first.token && JSON.stringify(parallel.record) === JSON.stringify(first.record), 'Peers froze different requests');
    await peer.putObservation({ ...point, longitude: 114.16 });
    assert((await store.nextSyncRequest()).record.longitude === 114.15, 'New local edit mutated frozen request');
    await rejects(store.acknowledgeChanges({ sessionId: first.sessionId, tokens: [first.token] }), 'InvalidStateError');
    passed('Two connections share one frozen request; later edits and legacy acknowledgments cannot change it');

    store.close();
    await store.activate(scope);
    const reopened = await store.nextSyncRequest();
    assert(reopened.token === first.token && JSON.stringify(reopened.record) === JSON.stringify(first.record), 'Reopen changed retry envelope');
    await rejects(accept(store, first, '1'), 'AbortError');
    await rejects(store.acceptSyncResult({ sessionId: reopened.sessionId, token: reopened.token,
      response: { ...receipt(reopened, '1'), id: crypto.randomUUID() } }), 'TypeError');
    await rejects(accept(store, reopened, '9007199254740993x'), 'TypeError');
    assert((await store.nextSyncRequest()).token === first.token, 'Bad receipt removed request');
    passed('Frozen requests survive reopening; stale sessions, mismatched receipts and malformed revisions are rejected');

    await accept(store, reopened, '9007199254740993');
    assert(await accept(store, reopened, '9007199254740993') === false, 'Duplicate local acknowledgment changed state');
    const latest = await store.nextSyncRequest();
    assert(latest.token !== first.token && latest.baseRevision === '9007199254740993' && latest.record.longitude === 114.16,
      'Old receipt lost newer edit or rounded server revision');
    passed('Accepted receipt advances exact bigint revision while preserving a newer local edit');

    const conflictStore = new LocalJournal();
    await conflictStore.activate({ kind: 'account', id: crypto.randomUUID() });
    await conflictStore.putObservation({ ...point, longitude: 114.16 });
    const conflictFlight = await conflictStore.nextSyncRequest();
    await conflictStore.acceptSyncResult({ sessionId: conflictFlight.sessionId, token: conflictFlight.token,
      response: { status: 'conflict', revision: '9007199254740994', deleted: false } });
    const conflict = await conflictStore.nextSyncRequest();
    assert(conflict.state === 'conflict' && conflict.baseRevision === conflictFlight.baseRevision && conflict.record.longitude === 114.16,
      'Conflict silently rebased or discarded local edit');
    conflictStore.close();
    await conflictStore.activate(conflict.scope);
    assert((await conflictStore.nextSyncRequest()).state === 'conflict', 'Conflict lost on reopen');
    await conflictStore.deleteObservation(point.id);
    assert(!('record' in await conflictStore.nextSyncRequest()), 'Conflicted deletion retained metadata');
    conflictStore.close();
    passed('Conflict is durable and preserves local content without silently rebasing');

    await store.deleteObservation(point.id);
    const reconcile = await store.nextSyncRequest();
    assert(reconcile.state === 'reconcile' && !('record' in reconcile), 'Deletion retained frozen GPS payload');
    assert((await store.snapshot()).journalEntries[0].observationId === null, 'Deletion lost note unlink');
    await accept(store, reconcile, '9007199254740994');
    const deletion = await store.nextSyncRequest();
    assert(deletion.operation === 'delete' && deletion.record === null && deletion.baseRevision === '9007199254740994',
      'Late accepted put erased queued deletion');
    await accept(store, deletion, '9007199254740995');
    const note = await store.nextSyncRequest();
    assert(note.store === 'journalEntries' && note.record.observation_id === null, 'Preserved note was not queued');
    await accept(store, note, '9007199254740996');
    assert(await store.nextSyncRequest() === null, 'Acknowledged queue did not drain');
    passed('Deleting an unresolved photo purges frozen content; late receipt preserves deletion and the unlinked authored note');

    const nextPoint = { ...point, id: crypto.randomUUID() };
    await store.putObservation(nextPoint);
    await store.nextSyncRequest();
    await store.deleteAll();
    assert(!('record' in await store.nextSyncRequest()), 'Delete all retained frozen metadata');
    const exported = JSON.parse(await store.exportJSON());
    assert(exported.observations.length === 0 && exported.journalEntries.length === 0 && !('syncState' in exported), 'Export leaked bookkeeping');
    await store.activate({ kind: 'account', id: crypto.randomUUID() });
    assert(await store.nextSyncRequest() === null, 'Envelope leaked across accounts');
    await rejects(accept(store, note, '9007199254740996'), 'AbortError');
    await store.activate(scope);
    assert((await store.nextSyncRequest()).state === 'reconcile', 'Reconciliation state was not durable');
    passed('Delete all removes payloads; reconciliation state survives scope changes without crossing account or export boundaries');

    const legacyScope = { kind: 'account', id: crypto.randomUUID() };
    const legacyToken = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(`hk-journal-v1:account:${legacyScope.id}`, 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('observations', { keyPath: 'id' }).put({ ...point,
          captureTime: { status: 'with-offset', local: '2026-09-06T09:00:00', offset: '-03:30' } });
        request.result.createObjectStore('journalEntries', { keyPath: 'id' }).createIndex('observationId', 'observationId');
        const changes = request.result.createObjectStore('changes', { keyPath: 'key' });
        changes.createIndex('token', 'token', { unique: true });
        changes.put({ key: `observations:${point.id}`, store: 'observations', id: point.id,
          token: legacyToken, operation: 'put' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    await store.activate(legacyScope);
    const upgraded = await store.nextSyncRequest();
    assert(upgraded.token === legacyToken && upgraded.baseRevision === '0' && upgraded.record.capture_offset_minutes === -210,
      'Version 2 upgrade lost queued identity or negative timezone');
    passed('Version 2 migration preserves queued tokens and maps negative half-hour timezone exactly');
  } finally { store.close(); peer.close(); }
}
