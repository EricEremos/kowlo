# Local change queue: verified browser foundation

6 September 2026. Implemented in `src/journal/local-journal.mjs`, with real IndexedDB checks in `experiments/offline-journal/change-checks.mjs` and `checks.mjs`. This is local bookkeeping for future private synchronization. It makes no network requests and does not authenticate a user or enable cloud synchronization.

## Implemented contract

- IndexedDB version 2 keeps the existing database name and record stores. The upgrade adds a `changes` store and queues existing live records without changing their contents. Existing version-change handling closes the previous connection.
- Every local put/delete and its change token commit in the same transaction. A record has one pending latest operation; edits replace that operation with a fresh random token. This is a coalesced pending state, not an ordered event history or server revision number.
- `pendingChanges()` returns `{sessionId, scope, changes}` in one read transaction. Each change contains `token`, `store`, `id`, `operation` and, for a put, the allowlisted current `record`. Scope is either device or account. The queue stores identifiers/tokens, not an extra copy of photo metadata.
- `acknowledgeChanges({sessionId, tokens})` removes only currently matching tokens and returns the count removed. Repeated and obsolete tokens are harmless. A newer write from another connection has a different token and survives an old acknowledgment. Closing, reopening or switching the active scope invalidates the previous session ID.
- Observation deletion removes its GPS/colour/time content, queues an identifier-only delete, and atomically unlinks and queues any preserved authored notes. Explicit note deletion removes note content. Delete-all removes both kinds of content while retaining pending delete tokens, including older deletions.
- Exports remain schema version 1 and contain only live observations and journal entries. Internal change/session tokens are excluded. Minimal local deletion identifiers remain until acknowledged; delete-all is not a purge of the entire IndexedDB database.

The transaction and upgrade choices follow the [IndexedDB transaction model](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) and [version-change notification behavior](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/versionchange_event). These sources explain the API semantics; the runtime results below establish this implementation's observed behavior.

## Observed verification

In Codex in-app browser tab 13, opened `http://127.0.0.1:8787/experiments/offline-journal/index.html`, clicked **Run storage checks**, then **Reload and verify saved draft**. The report showed **27 passed, phase after-reload**, on Chrome/152.0.0.0 (macOS). This includes the previous 18 storage/palette checks and nine added queue/upgrade/reload checks:

1. A populated version 1 database upgrades, closes its old connection, preserves coordinates/notes and queues both records.
2. Repeated acknowledgment removes only queue entries; saved journal data remains.
3. Two open LocalJournal connections: a newer edit survives acknowledgment of the previous token.
4. Closing during a write rolls back both record and token. Reopening rejects the prior session's acknowledgment.
5. Photo deletion replaces a pending put, excludes the deleted GPS payload and queues the preserved note's unlink. A delayed put acknowledgment cannot clear the deletion.
6. Account and device scopes do not share pending changes. A previous account's acknowledgment is rejected.
7. Delete-all retains identifier-only deletions, repeated delete-all keeps their tokens stable, and user export excludes queue internals.
8. An invalid acknowledgment list is rejected without a partial write. Partial acknowledgment retains unrelated pending deletes.
9. Full page reload preserves pending put/delete records and tokens exactly.

`npm test`: **27 passed, 0 failed** (parser, geography, palette and service-worker checks). `node --check` passed for the journal store and both browser check modules. The diagnostic cache release changed from v1 to v2 because the cached journal module changed. No dependency was installed. LSP remains unavailable because TypeScript is absent; this is not a clean LSP result.

App-level smoke: ran the ten synthetic fixtures and saved five accepted locations in the photo-import diagnostic. The old controlled tab reported a waiting offline-shell update. Closed that diagnostic tab and reopened the page in tab 15; it reported **Offline shell ready** and retained **5 saved observations · 1 / 18 districts represented**. Clicked **Delete all local diagnostic records** and reloaded; the page showed **0 saved observations · 0 / 18 districts represented**. Only synthetic test records were used. The server remained running for this check; this is not a new server-off or physical-device result.

## Remaining integration boundaries

No server acknowledgments were simulated as proof of cloud success. The acknowledgment method is a local API; session IDs guard accidental stale work, not malicious same-origin JavaScript or unauthenticated callers. A future transport must verify the active authenticated account and explicit sync opt-in before reading/sending a batch, then acknowledge only operations the server durably accepted.

Server revision checks, idempotent retry receipts, durable remote tombstones, remote merge behavior, pull cursors, permission-revocation handling and cross-device conflict resolution are not implemented. Consequently this queue alone does **not** prevent another device from resurrecting a deleted server record. Supabase migration 001 has no revision/tombstone protocol or palette mapping yet. Do not send these batches directly as row upserts. Linked observations and journal entries need dependency-safe, atomic server application.

The queue currently materializes all pending records. Large-library memory/throughput, quota failures, abrupt process termination, physical iOS/Android behavior and bounded transport batches are not benchmarked. IndexedDB is subject to browser eviction. Local-only deletion identifiers should be purged through a separately defined full-device-data removal path, not silently treated as synchronized deletions.
