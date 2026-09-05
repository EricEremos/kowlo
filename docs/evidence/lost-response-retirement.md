# Purged-upload retirement verification

Observed 6 September 2026, local development only. No hosted project or production deployment was changed.

## Result

Deleting a record while its earlier upload has an unknown outcome no longer requires retaining or reconstructing that upload's content. The new RPC returns an already accepted receipt or atomically retires the operation token under the same owner lock used for writes. A delayed retired upload cannot execute. The browser consumes the retirement only for its matching purged request and pending deletion, preserves newer remote state and leaves deletion ready for version-checked transfer.

Retirement is not deletion itself. Existing content is removed only when the subsequent deletion is accepted. New conflicting edits still require explicit resolution. Details and transport obligations are in [the contract](../SYNC_PROTOCOL.md).

## Runtime evidence

- `python3 scripts/test-private-journal.py --sync`: **132 passed**, PostgreSQL 17.10. Migrations 001 and 003 only, isolated socket-only cluster `/tmp/placefold-db-mpqkaixv`, stopped by the driver on completion. The driver uses PostgreSQL roles and a minimal `auth.uid()` stand-in, not real Supabase JWTs.
- Database checks cover accepted-before-retirement and retired-before-put orderings, concurrent put/retirement agreement, stable retries, denied target/operation reuse, owner isolation, anonymous/identity-less rejection, no feed-clock advancement, no retained content, rollback and account-deletion cascade.
- Real Chromium 151 through bundled Playwright: **54 before full reload, 57 after reload**, no console errors or page errors. Buttons were clicked on the running local IndexedDB diagnostic. The new checks exercise purged-content recovery through closing/reopening, invalid results, changed deletion intent, concurrent connections, exact bigint revisions and preservation of a newer remote tombstone.
- [Browser result JSON](retirement-browser-result.json) and [full-page screenshot](retirement-browser.png). Screenshot inspected: all 57 rows passed and reload/deletion status visible. This is a technical check surface, not production visual approval.
- `npm test`: **27 passed**, including metadata/geography/palette and offline cache boundary checks. Cache version 6 and removal of prior versions tested. Fresh worker activation and server-off behavior were not rerun in this unit.
- `node --check` passed for the five changed JavaScript modules; Python source compilation passed. LSP was unavailable because TypeScript and basedpyright are not installed; no clean LSP claim.

## Source binding (SHA-256)

| Source | Hash |
|---|---|
| `src/journal/local-journal.mjs` | `16da0105f3b018842432ca1251a9e6609ed8870d2dc7b7981b249e11dd640013` |
| `supabase/migrations/202609060003_private_sync.sql` | `3838c16ea588ecf7f54bbd6fd55dd779750cf16a63638c834521dfd915b8cca7` |
| `scripts/private_sync_checks.py` | `4d85ea0237a559211922c922b2275fd9c5ad547af8a67c47e0e52a49e18f4e37` |
| `experiments/offline-journal/retirement-checks.mjs` | `c29b34ba01ae1301d9e0269b7ff693e5c9c693987b1cfcdd7d9ce3cc86a5fd88` |
| `experiments/offline-journal/checks.mjs` | `41a613e57723771f60e112b29c4bf6b1ae36f4847d6b6bdd76439b209349ee56` |
| `experiments/photo-import/offline-worker.mjs` | `3ea1ad8a72a77d6b157050769c043640082465be6e5daee3be6ce8ae2e864f9f` |
| `experiments/photo-import/offline-worker.test.mjs` | `ba0a6440552123c250cd24997f2dc4ccee4aa64011537fbd36c2b87717cc6078` |

## Remaining boundary

The authenticated transport must select retirement for `reconcile` puts, bind local scope to the real account and route accepted/retired results to the corresponding handler. Neither the live network path nor hosted privileges/JWTs have been verified. Full PostGIS migration coverage, production UI review, installation and physical-device checks remain incomplete. These results do not complete the beta Goal.

Diary: the missing-receipt race is closed at the local database boundary; the browser accepts only a matching recovery result without restoring content. Project-specific protocol is canonical; this unit did not establish a separate cross-project Wiki rule. The next bounded unit is the session-bound authenticated transport adapter.
