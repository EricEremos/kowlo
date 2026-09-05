import { LocalJournal } from '../../src/journal/local-journal.mjs';

function assert(value, message) { if (!value) throw new Error(message); }
async function rejects(operation, name) {
  try { await operation; } catch (error) { assert(error.name === name, error.message); return; }
  throw new Error(`Expected ${name}`);
}
const point = (id, revision, longitude = 114.15) => ({ store: 'observations', id, revision, deleted: false,
  record: { longitude, latitude: 22.28, capture_status: 'with-offset', capture_local: '2026-09-06T09:00:00',
    capture_offset_minutes: -210, palette: { algorithm: 'rgb-histogram-v1', colors: ['#AABBCC'] }, filename: 'exclude.jpg' } });
const tombstone = (id, revision) => ({ store: 'observations', id, revision, deleted: true, record: null });
const pull = async (journal, rows) => journal.applyPullPage({ ...await journal.nextPullRequest(), rows });
const accept = (journal, flight, revision) => journal.acceptSyncResult({ sessionId: flight.sessionId, token: flight.token,
  response: { status: 'accepted', token: flight.token, store: flight.store, id: flight.id, revision, deleted: flight.operation === 'delete' } });

export async function checkPull(passed) {
  const journal = new LocalJournal();
  const peer = new LocalJournal();
  const scope = { kind: 'account', id: crypto.randomUUID() };
  const id = crypto.randomUUID();
  try {
    await journal.activate({ kind: 'device', id: scope.id });
    await rejects(journal.nextPullRequest(), 'InvalidStateError');
    await journal.activate(scope);
    await pull(journal, [point(id, '9007199254740993')]);
    const saved = (await journal.snapshot()).observations[0];
    assert(saved.longitude === 114.15 && saved.captureTime.offset === '-03:30' && saved.palette.colors[0] === '#AABBCC', 'Remote metadata mapping changed');
    assert(!JSON.stringify(saved).includes('exclude.jpg') && (await journal.pendingChanges()).changes.length === 0, 'Pull leaked metadata or echoed a write');
    assert((await journal.nextPullRequest()).after === '9007199254740993', 'Pull rounded revision');
    passed('Incoming account records preserve exact GPS, palette and timezone without uploading an echo or extra metadata');

    const before = await journal.nextPullRequest();
    const nextId = crypto.randomUUID();
    const invalid = point(crypto.randomUUID(), '9007199254740995');
    invalid.record.latitude = 91;
    await rejects(journal.applyPullPage({ ...before, rows: [point(nextId, '9007199254740994'), invalid] }), 'TypeError');
    await rejects(journal.applyPullPage({ ...before, rows: [point(nextId, '9007199254740995'), point(id, '9007199254740994')] }), 'TypeError');
    await rejects(journal.applyPullPage({ ...before, rows: [point(id, '9007199254740994'), point(id, '9007199254740995')] }), 'TypeError');
    await rejects(journal.applyPullPage({ ...before, rows: Array(501).fill(point(id, '9007199254740994')) }), 'TypeError');
    await rejects(journal.applyPullPage({ ...before, rows: [{ ...tombstone(id, '9007199254740994'), record: {} }] }), 'TypeError');
    assert((await journal.snapshot()).observations.length === 1 && (await journal.nextPullRequest()).after === before.after, 'Malformed page partially applied');
    passed('Malformed, oversized, duplicate and unordered pages leave records and the cursor unchanged');

    await peer.activate(scope);
    const peerRequest = await peer.nextPullRequest();
    const raced = await Promise.allSettled([
      journal.applyPullPage({ ...before, rows: [point(id, '9007199254740994', 114.16)] }),
      peer.applyPullPage({ ...peerRequest, rows: [point(id, '9007199254740995', 114.17)] }),
    ]);
    assert(raced.filter(result => result.status === 'fulfilled').length === 1, 'Both stale pages committed');
    assert(raced.find(result => result.status === 'rejected').reason.name === 'InvalidStateError', 'Unexpected race rejection');
    await pull(journal, [point(id, '9007199254740996', 114.18)]);
    journal.close();
    await journal.activate(scope);
    assert((await journal.nextPullRequest()).after === '9007199254740996' && (await journal.snapshot()).observations[0].longitude === 114.18,
      'Reopen split cursor from records');
    await rejects(journal.applyPullPage({ ...before, rows: [] }), 'AbortError');
    passed('Two connections cannot commit pages from the same old cursor; cursor and content survive reopening together');

    await journal.putObservation({ ...saved, longitude: 114.19 });
    await pull(journal, [point(id, '9007199254740997', 114.20)]);
    assert((await journal.snapshot()).observations[0].longitude === 114.19, 'Remote update overwrote local draft');
    assert((await journal.pendingRemoteChanges())[0].record.longitude === 114.20, 'Remote variant lost');
    const conflict = await journal.nextSyncRequest();
    assert(conflict.state === 'conflict' && conflict.baseRevision === '9007199254740996', 'Conflict silently rebased');
    await journal.deleteObservation(id);
    assert((await journal.pendingRemoteChanges())[0].contentOmitted && !(await journal.pendingRemoteChanges())[0].record, 'Deletion retained remote GPS');
    await pull(journal, [point(id, '9007199254740998', 114.21)]);
    assert((await journal.snapshot()).observations.length === 0 && !(await journal.pendingRemoteChanges())[0].record, 'Later pull restored deleted content');
    passed('Local drafts retain remote variants without rebasing; explicit deletion purges retained GPS and blocks later restoration');

    await journal.activate({ kind: 'account', id: crypto.randomUUID() });
    await journal.putObservation(saved);
    const flight = await journal.nextSyncRequest();
    await pull(journal, [tombstone(id, '3')]);
    assert((await journal.nextSyncRequest()).token === flight.token, 'Pull changed frozen retry identity');
    await accept(journal, flight, '1');
    assert((await journal.snapshot()).observations.length === 0 && (await journal.pendingRemoteChanges()).length === 0,
      'Late accepted put resurrected newer remote deletion');
    assert(await journal.nextSyncRequest() === null, 'Remote tombstone echoed a write');
    passed('A newer remote deletion wins after an older frozen put receipt without resurrecting or echoing the photo');

    await journal.activate({ kind: 'account', id: crypto.randomUUID() });
    await journal.putObservation(saved);
    const oldFlight = await journal.nextSyncRequest();
    await journal.putObservation({ ...saved, longitude: 114.22 });
    await pull(journal, [point(id, '4', 114.23)]);
    await accept(journal, oldFlight, '2');
    assert((await journal.snapshot()).observations[0].longitude === 114.22 && (await journal.pendingRemoteChanges())[0].record.longitude === 114.23,
      'Receipt discarded either competing edit');
    assert((await journal.nextSyncRequest()).state === 'conflict', 'Competing edits became a ready overwrite');
    await journal.deleteAll();
    assert(!(await journal.pendingRemoteChanges())[0].record && !JSON.stringify(await journal.snapshot()).includes('114.23'), 'Delete all retained conflicting payload');
    passed('Late receipts preserve both a newer local edit and remote variant; delete all purges their photo content');

    const linkedScope = { kind: 'account', id: crypto.randomUUID() };
    await journal.activate(linkedScope);
    const noteId = crypto.randomUUID();
    const note = { store: 'journalEntries', id: noteId, revision: '1', deleted: false,
      record: { observation_id: id, note: 'Harbour light', corrected_place_label: null } };
    await pull(journal, [note]);
    assert((await journal.snapshot()).journalEntries[0].observationId === id, 'Split page lost note reference');
    await pull(journal, [point(id, '2')]);
    assert((await journal.snapshot()).observations[0].id === id && (await journal.snapshot()).journalEntries[0].observationId === id,
      'Later page failed to resolve note reference');
    await pull(journal, [tombstone(id, '3')]);
    await pull(journal, [{ ...note, revision: '4', record: { ...note.record, observation_id: null } }]);
    const afterDelete = await journal.snapshot();
    assert(afterDelete.observations.length === 0 && afterDelete.journalEntries[0].observationId === null && afterDelete.journalEntries[0].note === 'Harbour light',
      'Server unlink lost authored text');
    assert((await journal.pendingChanges()).changes.length === 0, 'Related remote records echoed writes');
    passed('Related records arriving across pages resolve by ID; remote photo deletion and note unlink preserve authored text');

    await rejects(pull(journal, [point(crypto.randomUUID(), '5'), point(id, '6')]), 'TypeError');
    assert((await journal.snapshot()).observations.length === 0 && (await journal.nextPullRequest()).after === '4',
      'Protocol error failed to roll back the entire transaction');
    passed('Attempted reuse of a deleted identifier aborts the whole page and its cursor, including otherwise valid records');

    const oldSession = await journal.nextPullRequest();
    await journal.activate(scope);
    await rejects(journal.applyPullPage({ ...oldSession, rows: [point(crypto.randomUUID(), '5')] }), 'AbortError');
    assert((await journal.nextPullRequest()).after === '9007199254740998', 'Cursor crossed account boundary');
    const exported = await journal.exportJSON();
    assert(!exported.includes('contentOmitted') && !exported.includes('pullCursor') && !exported.includes('114.21'), 'Export exposed retained sync state');
    passed('Incoming sessions, cursors and retained variants stay within their account and outside journal exports');
  } finally { journal.close(); peer.close(); }
}
