# Memory-print data foundation

Date: 6 September 2026. Scope: reusable data transformation, not a new production screen or native-library implementation.

## Implemented contract

`src/geography/memory-print.mjs` consumes the atomic `LocalJournal.snapshot()` contract. It groups saved observations in fixed 10-unit cells within the Figma overview's 1000 × 845 coordinate space. Bounds are 113.92–114.43 longitude and 22.16–22.56 latitude; the affine projection matches the artwork generator. This is a cropped decorative overview, not a navigation projection or an authoritative Hong Kong boundary test.

Each mark has a stable cell ID, decorative cell-centre anchor, observation count and optional photo colours. Members preserve their exact stored longitude/latitude and unsnapped projected position. Cell proximity does not establish that two photographs depict the same place. No routes, venue claims, area percentages or additional location accuracy are inferred. Out-of-viewport observations remain explicitly listed and counted.

Palette colours receive one vote per observation containing that colour; the three highest votes win, with lexical tie-breaking. These are decorative accents, not measured pixel proportions across the collection. Metadata-only observations contribute without invented colours. Rebuilding after deletion removes the deleted record's membership and colour votes. Different IDs at the same coordinate remain separate observations; duplicate IDs fail explicitly. This module does not detect duplicate photographs.

The module copies only the fields it needs and does not mutate its input. It does not read image files, send network requests, persist rendered marks, classify districts or change achievement totals. Original coordinates remain the input to the existing district classifier.

## Observed verification

- `npm test`: **46 tests passed**, including four new memory-print tests. Coverage includes 1,000 deterministic generated coordinate cases, membership conservation, input-order independence, viewport corners, explicit cropping, invalid inputs and deletion recalculation.
- `node --check` passed for the new module, its tests and its browser driver.
- `scripts/memory-print-browser-checks.mjs`: **PASS in headless Chromium**, using the existing strict local diagnostic server. A synthetic JPEG fixture was parsed for GPS and decoded for its actual pixel palette, saved into real IndexedDB, transformed into one two-observation mark, closed/reopened, then deleted. Removing the colour-bearing observation left the metadata-only member with no colour; deleting all removed every mark. Invalid coordinates were rejected. No page errors or external/non-GET requests were observed.
- The first driver run exposed a missing server allowlist entry. Added only `src/geography/memory-print.mjs` to `scripts/serve-diagnostic.py`; the rerun passed. No directory-wide access was introduced.
- Offline follow-up: added the memory-print module to the diagnostic shell's explicit static allowlist and advanced the cache to v12. The Chromium driver now stops its HTTP server, reloads the entire document, imports the module from the service-worker cache, and reconstructs the same saved marks from IndexedDB. Both colour-source deletion and collection deletion pass while the server remains stopped. The actual cache contains 19 static assets and no fixture photographs. The 46 Node tests, including cache installation failure and old-release cleanup, passed again after this change.

Reproduce the browser driver with Playwright available:

```sh
PLAYWRIGHT_MODULE=/Users/blueock/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node scripts/memory-print-browser-checks.mjs
```

Editor LSP verification was unavailable: the JavaScript server lacked a TypeScript installation, and basedpyright was not installed with installation previously declined. Syntax and actual runtime verification above passed; no clean-LSP claim is made.

## Remaining boundaries

The Figma artwork still uses illustrative clusters and colours; it has not been replaced with a user's library. The production renderer, dense-library performance, responsive detail transitions, runtime accessibility, native permission/library access and live private cloud sync remain unverified. The module is now available in the diagnostic offline shell, but only the dedicated driver consumes it in-browser; the diagnostic UI does not render the artistic map. No public deployment or native-scope approval occurred in this unit.
