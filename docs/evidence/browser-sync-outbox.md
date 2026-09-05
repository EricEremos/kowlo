# Browser frozen outbox verification

Verified 6 September 2026 against the local diagnostic server at `127.0.0.1:8787`. Synthetic records only. The actual in-app browser reported Chrome 152 on macOS. No cloud requests or personal photo access were used.

## Observed result

Clicked **Run storage checks** on `/experiments/offline-journal/index.html`: 32 checks passed. Clicked **Reload and verify saved draft**: 35 checks passed, including saved content, pending tokens and persistent deletion. The browser error/warning log returned no entries. This exercises real IndexedDB transactions rather than an in-memory replacement.

The eight added scenarios verify account-only requests; observation-before-linked-note ordering; exact GPS, palette and timezone mapping; one frozen request shared by two connections; newer edits surviving older receipts; reopening and session invalidation; malformed receipt rejection; exact revisions above JavaScript's safe integer range; durable conflicts; purging frozen content on deletion; late accepted puts preserving queued deletion and unlinked authored notes; delete-all/export/account boundaries; and a version 2 upgrade preserving queued tokens. The existing version 1 upgrade and reload scenarios remain covered.

Server responses in these browser scenarios are controlled fixtures. PostgreSQL acceptance behavior has its own [110-check evidence](private-sync-boundary.md); the two runtimes have not yet been connected end to end.

## Other validation

- `npm test`: 27 passed, zero failed. Cache release expectations were updated from v2 to v3 after the intended cache bump initially failed two version-specific assertions. Activation now checks removal of v2 while preserving v3 and other application caches.
- `node --check` passed for the local journal module, browser harness, new sync checks and service worker.
- TypeScript LSP could not initialize because a TypeScript installation is unavailable. No clean LSP result is claimed.
- Cache v3 is source/unit tested here. A fresh service-worker activation and server-off run were not repeated in this unit; earlier offline runtime evidence applies to its documented revision.

## Source binding

| File | SHA-256 |
| --- | --- |
| `src/journal/local-journal.mjs` | `8bffe90483e3d2a2904d443ccb0cb52093b7605a8bb4738ef1bc1b45b857e61d` |
| `experiments/offline-journal/sync-checks.mjs` | `05b96fbf0f514591f3dd995bf8803063f60cfead240cc969c429ebe6e1f09725` |
| `experiments/offline-journal/checks.mjs` | `8beb96180c327cf59201c418b8de16461580d6d759cab94a3ba74953cfebb793` |
| `experiments/photo-import/offline-worker.mjs` | `8fe47551fbdbd1062fbc1ecd1247951136cb7957403eab2ee9e61090f7a52cd0` |
| `experiments/photo-import/offline-worker.test.mjs` | `a9b02400b40fb1642751c9a06e83cc5514bcda36ca5b2113bf8de052100655f9` |

## Remaining boundary

No authentication, network transport, inbound pull application or conflict-resolution path is implemented in this unit. A `conflict` or `reconcile` request pauses sending; a deleted frozen payload is never reconstructed blindly. Future reconciliation must account for server-side note unlink revisions and later remote deletions. Physical device storage and the complete hosted Supabase/PostGIS migration chain remain unverified. This is infrastructure progress, not production beta completion.
