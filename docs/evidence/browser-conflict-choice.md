# Browser conflict-choice verification

Observed 6 September 2026 on isolated bundled Playwright Chromium 151.0.7922.34, using real IndexedDB and synthetic records at the local diagnostic server. No signed-in browser or personal photo library was accessed.

The driver clicked **Run storage checks**, observed 49 passing cases, clicked **Reload and verify saved draft**, then observed **52 checks passed. Reload and deletion verified.** No page errors or console errors were collected. The [full-page screenshot](conflict-choice-browser.png) was saved and visually inspected. This technical diagnostic is not the production atlas or conflict screen.

Eight added groups cover local choice with token rotation and exact bigint revision after reopen; remote choice without an echo; stale local/remote decisions preserving both variants; two-connection choice serialization; forbidden deleted-ID restoration; ready/reconcile request suspension; deletion privacy and matching tombstone settlement; and authored-note preservation while repairing a missing photo link. Existing 44 cases remain passing.

`npm test` passed all 27 Node tests. Syntax checks passed for the local journal, new conflict checks and harness. Cache version 5 replaces version 4 because a cached source changed; cache installation-failure and activation tests passed. Fresh service-worker activation and server-off browser checks were not repeated. The existing LSP hook cannot initialize because TypeScript is absent; no clean LSP result is claimed and no dependency was installed.

## Source binding

| File | SHA-256 |
| --- | --- |
| `src/journal/local-journal.mjs` | `aac8047694d038cefce5d07810ff3ab8b34b7819f7024dff50fdbb93fd0cbbf2` |
| `experiments/offline-journal/conflict-checks.mjs` | `25e9b140cfd16ea2b1d91236bd410a766a5def2ad516593a6655d27d0aae118f` |
| `experiments/offline-journal/checks.mjs` | `451b9aa46de0fcc2b54c900cbafccd2df0aea7e2f86c07eee8f9f23fa24f8998` |
| `experiments/photo-import/offline-worker.mjs` | `0d2c88937b37edbaeea9569bcbfedca77f80fe381623ce23646067bfeec8ee8a` |
| `experiments/photo-import/offline-worker.test.mjs` | `44a6411f26f43d99d76d1ec8e3c4c13c280615338940d862ff1bfe6ebdb3b0f2` |

## Limits and next boundary

Browser server responses are protocol fixtures; this run is not a browser-to-PostgreSQL or hosted Supabase integration test. No SQL changed or database checks were repeated. A conflict choice only queues a revision-checked write; it does not guarantee cloud acceptance. Production comparison UI, new-ID preserve-copy UX and authenticated transfer remain unfinished.

Deletion of a frozen put purges its payload and remains in `reconcile`. A late accepted response can settle its base; a lost response still needs a server reconciliation operation that closes the old token under the owner lock. A read-only missing-receipt result would be insufficient because the old request could still commit afterward. This is the next protocol boundary to implement and verify before live sync.
