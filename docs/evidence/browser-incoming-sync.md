# Incoming journal sync verification

Verified 6 September 2026 against the local diagnostic server at `127.0.0.1:8787`, with synthetic records and controlled server-response fixtures. No cloud requests or personal photo access were used.

## Observed result

The desktop was locked and Computer Use could not access its browser. Used the already installed Playwright runtime to launch an isolated headless Chromium 151.0.7922.34 context, without using signed-in browser profiles. Opened `/experiments/offline-journal/index.html` and clicked **Run storage checks**: 41 checks passed. Clicked **Reload and verify saved draft**: 44 checks passed. Browser page errors, console errors and warnings were empty. The [captured result](incoming-sync-browser.png) was visually inspected.

This is actual browser IndexedDB and page reload behavior, not an in-memory storage substitute. It is not a physical mobile-device check. An initial driver run passed 40 checks before reload but waited for the wrong success text; the driver was stopped, its wait condition corrected and the final run above included the additional rollback case.

## Added coverage

Nine scenario groups exercise incoming metadata mapping and unknown-field exclusion; exact bigint revisions; account-only access; no outbound echo; malformed/oversized/unordered/duplicate-page rejection; two-connection cursor races; session invalidation and persistence on reopen; dirty local edits with retained remote variants; deletion purging retained content; late accepted puts followed by newer remote deletion; newer local edits surviving old receipts; delete-all privacy; related records across pages; authored-note unlinking; forbidden deleted-ID reuse rolling back otherwise valid records and the cursor; and account/export separation.

The incoming cursor and content share one transaction. The deleted-ID case fails inside the transaction after page validation, exercising actual rollback. Pending variants are retained internally for a future explicit conflict-resolution operation. Unknown references between pages remain unresolved IDs until their corresponding records arrive; they never become guessed coordinates.

## Other validation and limits

- `npm test`: 27 passed, zero failed, including cache v4 activation retaining unrelated caches and removing previous releases.
- `node --check`: passed for the journal module, incoming-check module, browser harness, service worker and worker test.
- TypeScript LSP remains unavailable because its TypeScript installation is absent. No clean LSP result is claimed.
- Service-worker v4 was unit tested; fresh activation and server-off behavior were not repeated in this unit.
- Responses are fixtures. The previously verified PostgreSQL acceptance boundary has separate [110-check evidence](private-sync-boundary.md); browser and SQL runtimes are not connected end to end.
- Authenticated transport, explicit conflict choices, lost-response receipt lookup, physical devices and the complete hosted Supabase/PostGIS migration chain remain unverified or unimplemented. This unit does not complete the production beta.

## Source binding

| File | SHA-256 |
| --- | --- |
| `src/journal/local-journal.mjs` | `b815d79eaf72e9aaf7adfdef9b253e0f8d358075668251259c33d304bfe0b88c` |
| `experiments/offline-journal/pull-checks.mjs` | `3a984cb9d0fbf768b199362c1ed3498704f3d386c80ba0bcbabaf394ae929277` |
| `experiments/offline-journal/checks.mjs` | `e2e50af135a90e7bfc43f3b53cdc1d0d9fc375abaa3c87cce5ef2f5acd47d005` |
| `experiments/photo-import/offline-worker.mjs` | `490bfc58b2d81b1a3e77e2ed52bf8cda2c756362884f68a16d84ef43fb7e2a8a` |
| `experiments/photo-import/offline-worker.test.mjs` | `bbe6df39c387e050da98b74eb2d88c12b4109801af7ee48c355a9bd4a8d6f643` |
