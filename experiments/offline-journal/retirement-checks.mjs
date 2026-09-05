import { LocalJournal } from '../../src/journal/local-journal.mjs';

function assert(value, message) { if (!value) throw new Error(message); }
async function rejects(operation, name) {
  try { await operation; } catch (error) { assert(error.name === name, error.message); return; }
  throw new Error(`Expected ${name}`);
}

export async function checkRetirement(passed) {
  const journal = new LocalJournal();
  const peer = new LocalJournal();
  const id = crypto.randomUUID();
  const point = { id, longitude: 114.15, latitude: 22.28 };
  const fresh = async () => {
    const scope = { kind: 'account', id: crypto.randomUUID() };
    await journal.activate(scope);
    await journal.putObservation(point);
    const flight = await journal.nextSyncRequest();
    const response = { status: 'retired', token: flight.token, store: flight.store, id,
      revision: '0', deleted: false };
    return { scope, flight, response };
  };
  const input = ({ flight, response }) => ({ sessionId: flight.sessionId, token: flight.token, response });
  try {
    const first = await fresh();
    await rejects(journal.acceptSyncRetirement(input(first)), 'TypeError');
    await journal.deleteObservation(id);
    assert(await journal.acceptSyncRetirement(input(first)), 'Retirement not consumed');
    assert(!await journal.acceptSyncRetirement(input(first)), 'Duplicate consumed twice');
    journal.close();
    await journal.activate(first.scope);
    const deletion = await journal.nextSyncRequest();
    assert(deletion.state === 'ready' && deletion.operation === 'delete' && deletion.baseRevision === '0' &&
      deletion.token !== first.flight.token && deletion.record === null, 'Queued deletion lost after reopen');
    assert((await journal.snapshot()).observations.length === 0, 'Retirement restored content');
    await rejects(journal.acceptSyncRetirement(input(first)), 'AbortError');
    passed('Retiring a purged upload preserves a fresh deletion through reopening and never restores photo metadata');

    const invalid = await fresh();
    await journal.deleteObservation(id);
    for (const change of [{ id: crypto.randomUUID() }, { store: 'journalEntries' }, { token: crypto.randomUUID() },
      { revision: 0 }, { revision: '01' }, { revision: '-1' }, { deleted: 'false' }]) {
      await rejects(journal.acceptSyncRetirement(input({ ...invalid, response: { ...invalid.response, ...change } })), 'TypeError');
    }
    const unrelated = crypto.randomUUID();
    assert(!await journal.acceptSyncRetirement({ ...input(invalid), token: unrelated,
      response: { ...invalid.response, token: unrelated } }), 'Unrelated token consumed');
    assert((await journal.nextSyncRequest()).state === 'reconcile' &&
      (await journal.nextSyncRequest()).token === invalid.flight.token, 'Malformed receipt advanced outbox');
    await journal.putObservation(point);
    await rejects(journal.acceptSyncRetirement(input(invalid)), 'InvalidStateError');
    assert((await journal.snapshot()).observations.length === 1, 'Changed deletion lost local edit');
    passed('Wrong targets, malformed revisions and a replaced deletion leave the unresolved request unchanged');

    const concurrent = await fresh();
    await journal.deleteObservation(id);
    await peer.activate(concurrent.scope);
    const peerFlight = await peer.nextSyncRequest();
    const results = await Promise.all([
      journal.acceptSyncRetirement(input(concurrent)),
      peer.acceptSyncRetirement({ ...input(concurrent), sessionId: peerFlight.sessionId }),
    ]);
    assert(results.filter(Boolean).length === 1, 'Concurrent retirement consumed twice');
    passed('Concurrent browser connections consume a retirement once while preserving the pending deletion');

    const shadow = await fresh();
    await journal.deleteObservation(id);
    await journal.applyPullPage({ ...await journal.nextPullRequest(), rows: [
      { store: 'observations', id, revision: '9007199254740994', deleted: true, record: null },
    ] });
    await journal.acceptSyncRetirement(input({ ...shadow, response: { ...shadow.response, revision: '9007199254740993' } }));
    const next = await journal.nextSyncRequest();
    assert(next.state === 'conflict' && next.baseRevision === '9007199254740993' &&
      next.conflict.revision === '9007199254740994' && next.conflict.deleted, 'Newer tombstone or exact revision lost');
    assert((await journal.pendingRemoteChanges())[0].deleted && (await journal.snapshot()).observations.length === 0,
      'Retirement discarded the newer deletion');
    passed('Retirement keeps exact large revisions and a newer pulled tombstone for explicit resolution');

    const existing = await fresh();
    await journal.acceptSyncResult({ ...input(existing), response: { ...existing.response, status: 'accepted', revision: '4' } });
    await journal.putObservation({ ...point, longitude: 114.16 });
    const update = await journal.nextSyncRequest();
    await journal.deleteObservation(id);
    await rejects(journal.acceptSyncRetirement({ sessionId: update.sessionId, token: update.token,
      response: { ...existing.response, token: update.token, revision: '3' } }), 'TypeError');
    await journal.acceptSyncRetirement({ sessionId: update.sessionId, token: update.token,
      response: { ...existing.response, token: update.token, revision: '4' } });
    assert((await journal.nextSyncRequest()).baseRevision === '4', 'Existing record base lost');
    passed('An existing photo update retires at its known base and rejects a regressing revision');
  } finally { journal.close(); peer.close(); }
}
