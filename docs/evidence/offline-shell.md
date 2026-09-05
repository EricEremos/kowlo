# Offline diagnostic shell

6 September 2026, Hong Kong time. Previous Goal turn classified as progress: the Figma review navigation was saved and browser-verified. This unit addresses reopening local drafts without the application server. Production design and the native platform amendment remain pending; neither is inferred from continuation.

## Completed work

- Added `experiments/photo-import/offline-worker.mjs` and `offline.mjs`, registered only under `/experiments/photo-import/`.
- Precache an explicit list of 13 static application/code/geography resources. Installation fetches omit credentials, bypass the HTTP cache and reject redirects. A failed installation deletes its incomplete release cache and rejects installation.
- Only exact allowlisted GET URLs without an Authorization header receive cached responses. Photo fixtures, uploaded files, exports, APIs, queries, other origins and write requests are not cached. Journal data remains in the existing IndexedDB store. There is no runtime response caching.
- Activation removes only older caches with this diagnostic's prefix. It does not clear IndexedDB or other applications' caches. No forced `skipWaiting`: a new release waits for existing diagnostic tabs to close. The release identifier must change whenever a listed resource changes; there is no automated production asset manifest yet.
- Added an accessible preparation/readiness/failure/update status to the existing technical diagnostic. This is not production UI or an installation prompt.
- Restricted the metadata-worker CSP selection to its exact route; response checks confirm that it still has `connect-src 'none'`, while the service worker can fetch same-origin static resources.

## Verification

`npm test`: 27/27 pass, including four new service-worker boundary/lifecycle tests. Existing metadata, geographic and palette tests remain green. The new tests cover excluded private/photo/API/authenticated/cross-origin/non-GET requests; static files present on disk and credential-free precache requests; failed-install rejection/cleanup; and preservation of unrelated/current caches during activation. These are Node VM checks, not browser lifecycle simulations.

`node --check` passed for both new runtime modules. Python compilation passed for `scripts/serve-diagnostic.py`. LSP was unavailable because TypeScript/tsserver and Biome/basedpyright are not installed; the user previously declined installation. No claim of clean LSP diagnostics is made.

Real in-app browser at `http://127.0.0.1:8787/experiments/photo-import/index.html`:

1. Observed “Offline shell ready.” Ran 10/10 synthetic fixture checks with date/colour options off; saved five accepted observations, representing one Hong Kong district. The southern/western fixture remains an out-of-Hong-Kong technical test record and earns no Hong Kong district.
2. Stopped the verified local diagnostic server. A fresh curl connection returned exit 7, connection refused.
3. Reloaded the page while the server remained stopped. All five saved observations and the correct 1/18 district count were restored.
4. Generated export JSON offline: five observations, exact fixture coordinates, `captureTime.status: not-requested`, no images or palettes. The download link appeared. This unit verified export generation, not a new downloaded file.
5. Deleted one saved location offline: four remained, still 1/18. Stale export output and its download link were cleared.
6. Deleted all synthetic records and reloaded with the server still stopped: zero observations and 0/18. The rendered journal controls and empty state were visually inspected in the narrow side panel.
7. Restored the server and checked response headers for both worker routes.

Only synthetic records were created and cleared. No cloud writes, account changes or original-photo uploads occurred in this unit.

## Limits and next scope

This proves an offline shell around the local diagnostic, not a complete installable production app. A first successful online load is required. Browser eviction/private-mode behavior, physical iPhone/Android use, actual OS installation, interrupted browser installation and multi-tab release transitions still need browser/device testing. New file selection and metadata-worker processing with the server stopped were not exercised in this unit. The store's note flows were previously tested, but this page has no note editor. Optional private sync, hosted access control and production map/journal UI remain incomplete.

Reference behavior checked against [MDN's service-worker guide](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) and [Cache.addAll](https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll). The explicit allowlist and credential omission are project decisions, not claims that a service worker provides encryption or a complete privacy boundary.

Workflow: `build-fusion` applied through `/Users/blueock/.codex/skills/ponytail/SKILL.md` (full), native Service Worker/Cache APIs, Node tests and CUA real-browser verification. No added dependency or production Figma change was needed. Spark remains exhausted; this scoped unit stayed on the main model. A separate agent/review loop would not improve this bounded change; main inspected the changed paths and exercised their real surface.
