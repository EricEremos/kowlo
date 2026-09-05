import { LocalJournal } from '../../src/journal/local-journal.mjs';

function assert(value, message) { if (!value) throw new Error(message); }
async function rejects(operation, name = 'InvalidStateError') {
  try { await operation; } catch (error) { assert(error.name === name, error.message); return; }
  throw new Error(`Expected ${name}`);
}
const point = (id, revision, longitude = 114.2) => ({ store: 'observations', id, revision, deleted: false,
  record: { longitude, latitude: 22.28, capture_status: 'not-requested', capture_local: null,
    capture_offset_minutes: null, palette: null } });
const pull = async (journal, rows) => journal.applyPullPage({ ...await journal.nextPullRequest(), rows });
const decision = async (journal, choice, remoteRevision) => {
  const flight = await journal.nextSyncRequest();
  const change = (await journal.pendingChanges()).changes.find(row => row.store === flight.store && row.id === flight.id);
  return { sessionId: flight.sessionId, token: flight.token, changeToken: change.token, choice, remoteRevision };
};

export async function checkConflicts(passed) {
  const journal = new LocalJournal();
  const peer = new LocalJournal();
  const id = crypto.randomUUID();
  const local = { id, longitude: 114.1, latitude: 22.28 };
  const fresh = async () => {
    const scope = { kind: 'account', id: crypto.randomUUID() };
    await journal.activate(scope);
    return scope;
  };
  try {
    const scope = await fresh();
    await journal.putObservation(local);
    await pull(journal, [point(id, '9007199254740993')]);
    const reviewed = await decision(journal, 'local', '9007199254740993');
    const resolved = await journal.resolveSyncConflict(reviewed);
    assert(resolved.queued, 'Local choice did not queue');
    journal.close();
    await journal.activate(scope);
    const retry = await journal.nextSyncRequest();
    assert(retry.state === 'ready' && retry.baseRevision === '9007199254740993' && retry.token !== reviewed.token &&
      retry.record.longitude === local.longitude, 'Local choice lost exact revision, token rotation or chosen GPS');
    assert((await journal.pendingRemoteChanges()).length === 0, 'Resolved variant retained');
    await rejects(journal.resolveSyncConflict(reviewed), 'AbortError');
    passed('Keeping local metadata rotates the operation token, preserves exact revisions and survives reopening');

    await fresh();
    await journal.putObservation(local);
    await pull(journal, [point(id, '1')]);
    const remoteChoice = await decision(journal, 'remote', '1');
    await journal.resolveSyncConflict(remoteChoice);
    assert((await journal.snapshot()).observations[0].longitude === 114.2 && await journal.nextSyncRequest() === null,
      'Remote choice failed to replace or echoed a write');
    await rejects(journal.resolveSyncConflict(remoteChoice));
    passed('Choosing the remote version atomically replaces the local draft and clears its queue without an echo');

    await fresh();
    await journal.putObservation(local);
    await pull(journal, [point(id, '1')]);
    const staleLocal = await decision(journal, 'remote', '1');
    await journal.putObservation({ ...local, longitude: 114.3 });
    await rejects(journal.resolveSyncConflict(staleLocal));
    const staleRemote = await decision(journal, 'local', '1');
    await pull(journal, [point(id, '2', 114.4)]);
    await rejects(journal.resolveSyncConflict(staleRemote));
    assert((await journal.snapshot()).observations[0].longitude === 114.3 &&
      (await journal.pendingRemoteChanges())[0].record.longitude === 114.4, 'Stale choice erased competing versions');
    passed('New local edits and newer remote revisions invalidate an older decision without losing either version');

    const raceScope = await fresh();
    await journal.putObservation(local);
    await pull(journal, [point(id, '1')]);
    const first = await decision(journal, 'local', '1');
    await peer.activate(raceScope);
    const second = await decision(peer, 'remote', '1');
    const race = await Promise.allSettled([journal.resolveSyncConflict(first), peer.resolveSyncConflict(second)]);
    assert(race.filter(row => row.status === 'fulfilled').length === 1 &&
      race.find(row => row.status === 'rejected').reason.name === 'InvalidStateError', 'Both conflicting decisions committed');
    passed('Two browser connections can commit only one choice for the same reviewed conflict');

    await fresh();
    await journal.putObservation(local);
    await pull(journal, [{ ...point(id, '1'), deleted: true, record: null }]);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'local', '1')));
    assert((await journal.snapshot()).observations.length === 1, 'Rejected restoration destroyed local copy');
    await journal.resolveSyncConflict(await decision(journal, 'remote', '1'));
    assert((await journal.snapshot()).observations.length === 0 && await journal.nextSyncRequest() === null, 'Tombstone choice failed');
    await journal.putObservation(local);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'local', '1')));
    passed('Deleted photo IDs cannot be restored by keeping local; accepting deletion removes the draft without a new write');

    await fresh();
    await journal.putObservation(local);
    const uncertain = await journal.nextSyncRequest();
    await pull(journal, [point(id, '1')]);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'remote', '1')));
    await journal.deleteObservation(id);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'local', '1')));
    assert((await journal.nextSyncRequest()).state === 'reconcile' && !(await journal.nextSyncRequest()).record,
      'Ambiguous request restored its purged payload');
    assert((await journal.nextSyncRequest()).token === uncertain.token, 'Ambiguous request identity changed');
    passed('Ready and payload-purged requests cannot be bypassed by a conflict choice before receipt reconciliation');

    await fresh();
    await pull(journal, [point(id, '1')]);
    await journal.deleteObservation(id);
    await pull(journal, [point(id, '2')]);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'remote', '2')));
    await journal.resolveSyncConflict(await decision(journal, 'local', '2'));
    const deletion = await journal.nextSyncRequest();
    assert(deletion.operation === 'delete' && deletion.state === 'ready' && deletion.baseRevision === '2' && deletion.record === null,
      'Keeping deletion failed to rebase without content');
    await journal.acceptSyncResult({ sessionId: deletion.sessionId, token: deletion.token,
      response: { status: 'conflict', revision: '3', deleted: true } });
    await rejects(journal.resolveSyncConflict(await decision(journal, 'local', '3')));
    await pull(journal, [{ ...point(id, '3'), deleted: true, record: null }]);
    await journal.resolveSyncConflict(await decision(journal, 'local', '3'));
    assert(await journal.nextSyncRequest() === null && (await journal.snapshot()).observations.length === 0, 'Matching deletions failed to settle');
    passed('Local deletion never restores purged content; matching remote deletion settles only after its version is available');

    await fresh();
    const noteId = crypto.randomUUID();
    await pull(journal, [point(id, '1')]);
    await journal.putJournalEntry({ id: noteId, observationId: id, note: 'Keep my memory' });
    await pull(journal, [{ ...point(id, '2'), deleted: true, record: null }, {
      store: 'journalEntries', id: noteId, revision: '3', deleted: false,
      record: { observation_id: null, note: 'Remote memory', corrected_place_label: null },
    }]);
    await rejects(journal.resolveSyncConflict(await decision(journal, 'local', '3')), 'NotFoundError');
    assert((await journal.snapshot()).journalEntries[0].note === 'Keep my memory', 'Missing-link guard lost authored text');
    await journal.putJournalEntry({ id: noteId, observationId: null, note: 'Keep my memory' });
    await journal.resolveSyncConflict(await decision(journal, 'local', '3'));
    const noteFlight = await journal.nextSyncRequest();
    assert(noteFlight.record.note === 'Keep my memory' && noteFlight.record.observation_id === null && noteFlight.baseRevision === '3',
      'Unlinked authored note did not resume safely');
    passed('Keeping an authored note requires resolving its missing photo link and preserves its text when resumed');
  } finally { journal.close(); peer.close(); }
}
