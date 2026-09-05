# Private journal synchronization contract

Work units, 6 September 2026. The PostgreSQL acceptance boundary, browser frozen outbox, incoming page application, explicit conflict-choice handler and purged-upload retirement are locally verified. The authenticated transport adapter is verified against intercepted browser endpoints. Live authentication, hosted verification and production conflict UI remain separate work.

## Execution plan

1. Completed: migration 003 provides a restricted writer role, per-account serialized revisions, retained deletion markers, idempotent version-checked writes and bounded pull results. Existing content is backfilled.
2. Completed: the isolated PostgreSQL driver passed 110 checks, including two identities, stale writes, retries, deletion/unlink, rollback and concurrent writes.
3. Completed: [runtime evidence and privilege inspection](evidence/private-sync-boundary.md) record the verified local boundary and remaining client/hosted requirements.

## Browser outbox work unit

1. Completed: IndexedDB version 3 stores account revisions and one frozen request per account. Later edits remain separately queued; deletion removes any frozen content and requires reconciliation.
2. Completed: 35 real browser checks passed including reload; 27 Node checks passed. The diagnostic cache is version 3, with its migration expectations updated.
3. Completed: [browser outbox evidence](evidence/browser-sync-outbox.md) records verified behavior and the remaining transfer/reconciliation boundary.

## Incoming changes work unit

1. Completed: validate bounded server pages and atomically persist their cursor with clean record merges; retain remote variants when local work is pending.
2. Completed: 44 Chromium browser checks passed including reload, concurrent cursors, deletion privacy, late receipts, cross-page links and transaction rollback. Node checks passed 27; the diagnostic cache is now version 4.
3. Completed: [incoming sync evidence](evidence/browser-incoming-sync.md) records source hashes, the observed browser result and the remaining authenticated transport/conflict-choice work.

## Conflict choice work unit

1. Completed: atomic explicit local/remote choices bind to the reviewed session, flight token, latest local change token and remote revision. Unresolved lost responses remain suspended.
2. Completed: 52 real Chromium checks including reload and eight new conflict groups; 27 Node checks. [Conflict-choice evidence](evidence/browser-conflict-choice.md) records the exact sources and remaining boundaries. Diagnostic cache version 5.

## Lost-response recovery work unit

1. Completed: owner-serialized retirement of a purged put token returns its existing accepted receipt or prevents all later execution of that token. The expanded local PostgreSQL driver passed 132 checks.
2. Completed: browser retirement preserves the queued deletion without restoring content; 57 browser checks passed including reopening, concurrency and newer tombstones. The Node suite passed 27 checks; diagnostic cache version 6.
3. Completed: [retirement evidence](evidence/lost-response-retirement.md) binds the exact sources to local results and records remaining authenticated transport requirements.

## Authenticated transport work unit

1. Completed: a bounded browser-fetch adapter verifies the server-side user, binds one token to one local session, maps only RPC arguments and consumes existing pull/write/retirement handlers.
2. Completed: 13 scenarios exercised actual Chromium fetch and IndexedDB against intercepted test endpoints, including lost responses, account changes, paged pulls, retirement and conflicts. The existing Node suite passed 27 checks. This does not substitute for hosted Supabase tests.
3. Completed: [authenticated transport evidence](evidence/authenticated-sync-transport.md) records exact sources, results and remaining login, hosting and production UI work.

## Server write boundary

- Identity comes exclusively from `auth.uid()`; no owner parameter or client service-role credential.
- A mutation carries a random operation token, store, record ID, operation, expected server revision and allowlisted metadata. A new record expects revision zero.
- An identical accepted retry returns its original receipt. Reusing a token with different input fails. Receipts contain a SHA-256 request digest and result identifiers/revision, never a duplicate metadata payload.
- A stale revision returns a conflict without modifying content. A deleted ID stays deleted; restoring content requires a new record ID. Deleting an unseen ID creates a marker so an older pending creation cannot resurrect it.
- Direct authenticated row writes are removed. A dedicated NOLOGIN, NOBYPASSRLS role owns the write function; scoped RLS still applies to this role. Internal helpers have no client execution grants.
- Each owner has a transactionally incremented clock. Writes lock that owner's clock before checking revisions. Linked-note changes and observation deletion commit together and both enter the pull feed.
- Pull reads the latest state for changed records, ordered by server revision, with a bounded page. It is a state feed, not an event history. Coordinates, optional capture data, palette and authored notes are the only content fields.
- Account deletion cascades sync bookkeeping. Individual deletion retains minimal identifiers and receipts; provider backups and full-account erasure still need hosted verification.

## Integration boundary

The browser stores base revisions and a durable frozen request through `nextSyncRequest()`. `syncJournal()` implements bounded transfer using a caller-supplied HTTPS project origin, publishable project key and user access token. It verifies `/auth/v1/user` against the local account before sending metadata, drains incoming pages before choosing a write, and returns `caught-up`, `more` or `conflict`. `caught-up` describes the drained snapshot, not the absence of future changes on other devices. The caller still owns sign-in, explicit sync consent, token refresh and production orchestration; these are not implemented. Do not connect `pendingChanges()` directly to the endpoint or silently resolve conflicts by uploading again with a newer revision. Only a request in `ready` state may be sent as a content mutation; `conflict` suspends the outbox and `reconcile` uses retirement first. Map only the server RPC arguments, excluding local session/scope/bookkeeping fields. A retry must reuse the identical frozen request, including its original base revision. Revisions remain decimal strings through transport and storage to avoid JavaScript number rounding; actual hosted PostgREST coercion still needs verification.

`acceptSyncResult()` validates session, operation and accepted receipt identifiers before advancing the base revision. It clears the queued change only when its token still matches the accepted request. A later edit or deletion remains pending. Deletion purges a frozen put payload and marks it for reconciliation; it must never be retried without its original payload. A late accepted receipt may safely establish the base for a queued deletion. A successful old receipt cannot establish that the record is still live; pull may contain a later deletion.

### Retiring a purged upload

For a `reconcile` put, the transport calls `retire_journal_put(p_token,p_store,p_id)` with the frozen identifiers. This uses the same account clock lock as writes. If that put already committed, the RPC returns its original accepted receipt. Otherwise it records an immutable retirement marker and the target's current revision/deletion state. A delayed put using the retired token returns that marker without executing. Checking for a missing receipt without retiring the token would race an already dispatched put.

Route an `accepted` result to `acceptSyncResult()` and a `retired` result to `acceptSyncRetirement()`, carrying the originating local session. Retirement is valid only for the matching purged put with a pending deletion. The browser atomically adopts the returned base, clears that flight, retains the queued deletion and merges any newer retained remote state. It does not restore photo content or advance the pull cursor. A changed session, malformed result, wrong target or regressing revision cannot advance the outbox. A duplicate or no-longer-active token has no effect. If a new local put replaced the deletion, retirement consumption is rejected with the edit intact; that changed intent needs an explicit decision before synchronization resumes.

Retirement closes a request token; it does not itself delete the server record. The subsequent revision-checked deletion may still conflict with another device, and a retired result is an immutable snapshot rather than a claim about the latest server state. Finish pulling and use explicit conflict handling when needed. Retirement markers retain identifiers and result revision/deletion only, with no photo metadata or request digest. They remain until account deletion. An accepted token still requires exact-input retry; a retired token never executes another same-target put, even if its payload changes. Reusing either token for a different target or operation is rejected.

Observation creation must precede linked-note creation. The server preserves authored notes when deleting an observation. Pull reconciliation must retain unsent local edits for conflict resolution and tolerate related records arriving on separate pages. Original image files, filenames and photo-library identifiers must never enter the request.

### Incoming page application

`nextPullRequest()` returns the account session, exact decimal cursor and page limit. The transport must bind the authenticated account to that scope, call the pull RPC, then pass the original session/cursor and its rows to `applyPullPage()`. Rows are validated as a bounded, strictly ordered page with one latest state per record. Local record values are allowlisted. A stale account session fails; a stale cursor requires refetching. The record merges and cursor commit in one IndexedDB transaction across the content, queue and sync stores. An error rolls back the page and cursor together. This relies on IndexedDB's atomic transactions and serialization of overlapping read/write scopes; it does not claim power-loss durability. [W3C IndexedDB specification](https://www.w3.org/TR/IndexedDB-3/)

Clean records apply directly without creating outbound changes. Pending local edits or frozen requests retain the incoming variant in internal sync state, exposed through `pendingRemoteChanges()`. They do not advance the edit's base revision. New requests with retained variants are marked `conflict`; an already frozen request keeps its retry identity so its original receipt can still be reconciled. An accepted older receipt applies a newer retained change only when no newer local work remains. Deleted identifiers cannot be reused by a later remote put.

Explicit local deletion removes content from retained remote puts as well as frozen puts. Later remote puts against a pending local deletion retain only identifiers and revision information. Internal variants and cursor state are excluded from journal exports. Metadata-only retained conflicts may preserve the deletion through the explicit choice handler below; they cannot restore content that was purged.

Related records can arrive on different pages because the server feed coalesces updates. Preserve a note's observation ID while the corresponding observation is absent; consumers must treat that reference as unresolved and never fabricate a location. A remote observation deletion removes the point; its subsequent note-unlink row preserves authored text. Finish pulling available pages before deciding dependency-sensitive writes. A locally edited note may still conflict with the server's unlink; no automatic text merge or production conflict screen is implemented yet.

### Explicit conflict decisions

`resolveSyncConflict({sessionId, token, changeToken, remoteRevision, choice})` accepts `local` or `remote`. The caller must show the current versions and bind the choice to their identifiers. The transaction rejects a changed session, replaced flight, newer local change or different remote revision; a concurrent second choice cannot overwrite the first. The caller must refresh the presented comparison after rejection.

Only a `conflict` flight can be resolved. A `ready` request may already be executing, and `reconcile` has had its payload purged; both require receipt reconciliation first. A server conflict response alone is insufficient: the matching or newer remote variant must be pulled, or a known deletion marker must exist. A choice never advances the pull cursor.

Keeping local content preserves the current record, adopts the reviewed server revision and queues a new operation token. That subsequent server write can still conflict again if another device edits meanwhile. Choosing remote replaces the record and clears the corresponding local change without an outbound echo. Both choices remove the retained variant and frozen request atomically.

A deleted identifier cannot be restored by keeping a local put. The local copy remains available until an explicit alternative is chosen; a future preserve-copy flow would need a new ID. When both versions are deleted, keeping deletion clears redundant work. Purged remote content cannot be restored through a remote choice. Keeping a note with a missing photo reference fails without losing its text; the caller must resolve that link, then present a fresh decision. Related remote note updates still arrive through pull.

Privileged administrative writes can bypass this protocol and must not edit these content tables directly during normal operation. A data migration must update or rebuild sync state in the same controlled operation. The feed is not a backup or an audit log.

The dedicated role and function ownership transfer require deployment privileges that remain unverified on hosted Supabase. The full local 001 → 002 → 003 chain passed 163 checks with `--postgis --sync` on PostgreSQL 18.4 / PostGIS 3.6.4, including geometry and owner-scoped viewport behavior after synchronized writes. See [spatial evidence](evidence/spatial-migration-readiness.md). Runs without `--postgis` omit migration 002; hosted migration, JWT and PostgREST behavior remain unverified.
