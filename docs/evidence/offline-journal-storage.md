# Local journal storage verification

6 September 2026. The browser executed `experiments/offline-journal/checks.mjs` against the actual IndexedDB implementation in `src/journal/local-journal.mjs`. Only synthetic records were used.

Observed through Codex browser tab 8 at `http://127.0.0.1:8787/experiments/offline-journal/index.html`: clicking **Run storage checks** passed 15 checks. Clicking **Reload and verify saved draft** performed a full page reload and passed two additional checks. The saved coordinates and notes matched exactly; deletion remained effective after closing and reopening the database. The final DOM report is preserved in [offline-journal-results.json](offline-journal-results.json). Browser warning/error log was empty.

The store partitions device drafts and account records, upserts stable observation identifiers, preserves distinct photos at equal coordinates, and keeps authored notes when a photo location is edited or deleted. Active transactions are aborted when the scope changes. Export includes only the explicitly allowed journal metadata; image buffers, filenames and account-owner fields are excluded. A seeded 64-coordinate round trip exercises precision without rounding. This is an invariant check, not a full property-testing framework with shrinking.

Both JavaScript files passed `node --check`; the scoped diagnostic server passed Python compilation. The configured language servers were unavailable, so no clean LSP result is claimed.

The implementation schedules requests within active transactions and resolves writes on transaction completion. Browser transaction completion and storage retention do not guarantee survival of OS crashes or storage eviction. See [MDN IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) and [persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

Limits: local account partitioning is not authentication, encryption, or isolation from hostile same-origin scripts or another person controlling the browser profile. Hosted authentication/RLS, synchronization, conflict handling, persistent-storage requests, service-worker offline reload, actual phone libraries, photo palettes, Safari/Android physical devices and the production interface remain unverified or unimplemented. This technical page is not the atlas design.
