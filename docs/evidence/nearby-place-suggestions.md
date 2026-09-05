# Nearby-place suggestions in the photo diagnostic

Observed 6 September 2026. The shared finder now runs in the local photo worker, using the [verified catalog](place-catalog-loader.md). This is an implemented diagnostic pipeline, not the production map or automatic phone-library flow.

## Behavior and interpretation

`src/geography/nearby-places.mjs` accepts a verified catalog, the district classifier and an explicit radius. It ranks Settlement, Island and Islands label points by spherical great-circle distance, with numeric geographic ID as the deterministic tie-break. Other topographic and hydrographic types remain in the source catalog but are excluded from this locality shortlist. Ranking and radius filtering use unrounded metres; displayed distances round to whole metres. This distance is to a map label point, not a measured GPS error or distance to a neighbourhood boundary.

The diagnostic uses an exploratory 1,000 m radius and up to three candidates. Each result retains the source dataset and both SHA-256 pins, algorithm identifier, geographic ID, official bilingual name, source class/type and distance. Every candidate explicitly has `confirmed: false`. A unique district interior is required before searching; invalid GPS, outside points and ambiguous geography produce no candidates. A uniquely assigned marine point can still have no nearby label. Source district codes do not replace polygon containment or constrain the shortlist.

The worker waits for asynchronous source validation, including for the first imported file. Missing or corrupt reference bytes disable suggestions only. Existing coordinates, optional capture time, palettes and district results are preserved. Candidates neither create milestones nor persist in journal records or exports. The worker still has `connect-src 'none'`; the main page fetches only the public references and passes their bytes to it.

The offline shell advances from v6 to v7, caching 17 explicit static resources including the two source payloads, catalog and finder. Photos and private journal data are excluded. Existing tabs must close before a waiting service-worker release takes over.

## Radius experiment

Six scenario coordinates from the source audit were compared at 250, 500, 1,000 and 2,000 m in both Node and Chromium. These are geographic controls, not surveyed photo ground truth or an accuracy evaluation.

| Scenario | Candidates at 250 / 500 / 1,000 / 2,000 m | First candidate at 1,000 m |
| --- | --- | --- |
| Central core | 0 / 0 / 3 / 3 | Sheung Wan, 529 m; Central District is second, 560 m |
| Sha Tin | 1 / 3 / 3 / 3 | Wong Uk Village, 47 m |
| Tung Chung | 0 / 0 / 3 / 3 | Tung Chung, 762 m |
| Cheung Chau | 1 / 3 / 3 / 3 | Cheung Chau, Island, 197 m |
| Victoria Harbour | 0 / 0 / 0 / 3 | No candidate |
| Outside Hong Kong maritime extent | 0 / 0 / 0 / 0 | No candidate; outside geography |

The harbour control gains Tsim Sha Tsui, Wan Chai and Central District suggestions at 2,000 m. The Central control ranks Sheung Wan first. Both results demonstrate why the nearest label cannot automatically become a confirmed locality. The 1,000 m setting is a diagnostic policy, not a calibrated production threshold. Venue-level accuracy, actual photo error and user expectations still require evaluation.

## Verification

- `npm test`: 37 passing tests. Five new tests protect typed place controls, empty/uncertain outcomes, explicit policy, full-precision ordering, district-code independence and milestone invariance. Existing offline tests now cover v7 and retirement of v6.
- Syntax checks passed for the finder, metadata worker, diagnostic, offline worker and browser driver. The Python server compiled. LSP was unavailable because TypeScript was absent; previously declined language-server installations were respected. No LSP success is claimed.
- `scripts/nearby-place-browser-checks.mjs` exercised actual Chromium 151.0.7922.34 through its own temporary loopback server. All ten synthetic fixtures passed; five accepted GPS results included four Central suggestions and one outside result. Repeated Central photos still counted one district. A separate HEIC file-input import also returned suggestions.
- Isolated browser contexts simulated missing and corrupt name data. Both retained accepted GPS and district A while reporting `reference-unavailable` for locality.
- All 24 radius/scenario outputs matched Node exactly. Worker response CSP retained its connection prohibition. No page errors, external requests or non-GET requests were observed in the instrumented pages.
- With the server stopped and browser context offline, the cached page reloaded, imported a local JPEG, produced identical suggestions, saved and exported its coordinate, deleted it, and reloaded with zero saved records. Export excluded suggestions. The cache held exactly 17 static assets and no photos.
- Desktop 1280×900 and mobile 390×844 screenshots were inspected: the new explanatory text wraps with no horizontal page overflow. These are diagnostic render checks, not production visual acceptance or a complete accessibility audit.

[Machine-readable evidence](nearby-place-browser.json) includes source pins, all scenario outputs, fallback results, cached paths and hashes of ten relevant files. [Desktop capture](nearby-places-desktop.png) and [mobile capture](nearby-places-mobile.png) record the diagnostic surface. Reproduce with `node scripts/nearby-place-browser-checks.mjs`, setting `PLAYWRIGHT_MODULE` to an available Playwright ESM entry when necessary. The driver closes its browser and server.

## Remaining boundary

Production locality selection and persistence, the user-reviewed Figma implementation, automatic native library access, hosted synchronization and physical-device checks remain unfinished. No new dependency, cloud resource, publication or production UI was created in this unit. Project evidence holds this implementation decision; it establishes no new global Wiki rule.
