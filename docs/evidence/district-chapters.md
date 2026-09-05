# District chapters from saved photo colours

The local diagnostic now groups saved observations into chapters using district matches recomputed from their original coordinates. Each chapter displays its district name, saved-observation count, number of records with opted-in photo colours, and up to three colours already present in those palettes. Text stays on the existing neutral surface.

The aggregation gives each distinct colour one vote per saved record and breaks ties by hex code. Results are independent of snapshot order; repeated record IDs contribute once. This is a deterministic accent-selection heuristic, not a perceptual colour model or an estimate of photographed area. A separate import of the same photograph still creates a separate record in this diagnostic; native asset-level deduplication is not implemented or claimed.

Returning to a district enriches its existing chapter without adding a district award. Ambiguous, outside-dataset and invalid coordinates do not create chapters. A record without a palette still contributes its confirmed location. Deleting a record recalculates colours; deleting the final observation removes that district chapter. Retained notes cannot keep a district counted.

Validation on 2026-09-06:

- `npm test`: 42 passing checks, including palette aggregation, repeated IDs, order independence, uncertain geography, empty palettes, deletion and input immutability.
- `scripts/journal-locality-browser-checks.mjs`: passed in Chromium 151.0.7922.34 with actual synthetic photo import, IndexedDB persistence, palette rendering, repeat imports, deletion, note retention, export and offline reopening with the local server stopped.
- Offline shell v11 retains the same 18 static assets; photo files and private records are excluded from its cache.
- Desktop 1280×900 and mobile 390×844 renders were inspected. No horizontal overflow, page errors, external requests or non-GET requests were observed in the browser run. Swatches expose their colour codes through accessible text.
- `git diff --check` passed. Editor diagnostics remain unavailable because TypeScript/Biome are not installed; no clean LSP result is claimed.

Machine evidence: [browser report](journal-locality-browser.json). Renders: [mobile](district-chapters-mobile.png), [desktop](district-chapters-desktop.png).

This is a working diagnostic and reusable collection behaviour, not the approved production interface. Native library enumeration, actual user-photo colour quality, physical-device checks, hosted sync and production milestone motion remain unfinished. The existing Figma concepts use illustrative palettes and have not been replaced by this diagnostic.
