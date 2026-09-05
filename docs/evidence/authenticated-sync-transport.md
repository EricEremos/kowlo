# Authenticated journal transport evidence

6 September 2026. Local implementation verified; hosted synchronization is not yet verified.

## Observed result

The new `syncJournal()` adapter passed 13 scenarios in Chromium 151.0.7922.34 using real browser fetch and the journal's real IndexedDB transactions. Auth and RPC responses were intercepted synthetic fixtures. No real user credentials, personal photos or hosted service were used. [Machine-readable result](sync-transport-result.json) reports all cases and no uncaught page errors. [Browser capture](sync-transport-browser.png) was visually inspected; it is a technical test surface, not the production atlas.

The scenarios cover identity verification before metadata transfer; coordinates, opted-in capture data, palettes and linked notes; incoming changes without outbound echoes; unsafe configuration and wrong accounts; lost-response retries after reopening IndexedDB and subsequent edits; purged upload retirement and deletion; already accepted retirement receipts; bounded 500-row pages and revisions above JavaScript's safe integer range; explicit conflicts; account changes during pulls and writes; authorization failures, malformed responses, redirect rejection and cancellation.

`npm test` passed the existing 27 checks. `node --check` passed for both new modules. The automatic LSP check could not run because TypeScript is not installed; installation was previously declined. No SQL changed in this work unit, so prior database results were not rerun or recounted as new evidence.

## Reproduction

Start the existing diagnostic server with `npm run diagnostic`, then run:

```sh
PLAYWRIGHT_MODULE=/Users/blueock/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node scripts/sync-transport-checks.mjs
```

The driver loads the new adapter through an exact intercepted local module URL. It enables the synthetic endpoint only in its isolated harness response; production server routing and CSP are unchanged. It writes the JSON report and screenshot into `docs/evidence/`.

The completed run initially wrote the screenshot under a literal `%20` directory because the output used URL `.pathname`. The driver now uses `fileURLToPath`; syntax was checked after this output-path-only correction. The existing screenshot was moved to the correct project evidence directory and inspected. The 13 scenario checks were not rerun after this path-only correction.

## Exact source state

SHA-256:

| Source | Hash |
| --- | --- |
| `src/journal/sync-journal.mjs` | `aa153cde6d4425c22328cae43e815ee251c332868525cf24e1f4bf495195e6ab` |
| `scripts/sync-transport-checks.mjs` (corrected output path) | `23dc80726af688d8a87f6efb25318a42ca3ce12eb43e259a97f940debde548f3` |
| `src/journal/local-journal.mjs` | `16da0105f3b018842432ca1251a9e6609ed8870d2dc7b7981b249e11dd640013` |

## Implemented boundary

The adapter accepts a configured HTTPS origin, an `sb_publishable_` key and one user token supplied by the caller. It sends the project key and user token in separate headers, omits cookies, rejects redirects and sets a 30-second timeout per request. It checks `/auth/v1/user` before metadata RPCs and binds every operation and response to the originating journal session. This follows Supabase's separation of [publishable project keys and user authorization](https://supabase.com/docs/guides/getting-started/api-keys), and its use of [server-verified user information](https://supabase.com/docs/reference/javascript/auth-getuser).

Only explicit RPC arguments are transmitted: allowlisted record metadata, operation identifiers and exact decimal revisions. No original images, filenames, library identifiers or local session/scope fields enter the body. Server error bodies are not exposed. Existing storage handlers validate receipts and incoming rows before changing local state. An interrupted write retains its frozen identity for the next caller-initiated attempt; the adapter does not start an unbounded retry loop or choose a conflict winner.

## Remaining verification and integration

- Hosted Auth/JWT enforcement, RLS through the actual API, RPC permissions and PostgREST decimal-string handling remain unverified. Intercepted responses cannot prove these properties.
- The full migration chain, including PostGIS migration 002, has not run on the approved Supabase project. That cloud project has not yet been created.
- Sign-in, consent, credential lifecycle, production orchestration, conflict screens and physical device behavior remain unfinished. This adapter is not wired into the production UI or its service worker.
- `caught-up` refers to the fetched snapshot. New remote changes may arrive immediately afterward. Caller orchestration should avoid concurrent runs; the journal rejects stale sessions, cursors and receipts rather than treating them as success.

These results complete the bounded transport work unit, not the project Goal or cloud-sync release.
