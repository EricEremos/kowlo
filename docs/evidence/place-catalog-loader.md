# Verified place catalog loader

Observed 6 September 2026 Hong Kong time. This implements the deterministic reference join selected in [the source evaluation](place-name-source-evaluation.md). It is a reference library, not a locality assignment algorithm or production screen.

## Delivered behavior

`src/geography/place-catalog.mjs` exports `createPlaceCatalog(pointBytes, nameBytes)` and immutable `PLACE_SOURCE` provenance. Inputs are the exact public response bytes in `data/reference/hk-place-points.geojson` and `hk-place-names.json`, supplied as ArrayBuffer or Uint8Array (including Node Buffer).

The loader copies both inputs before asynchronous work, verifies both SHA-256 pins, and joins names to points by the source's string geographic ID. A different source version, truncation, reordered serialization or corrupted byte fails before parsing. A deliberate refresh must repeat the source audit and update both reviewed pins. The hash check binds the entire audited schema and payload; this is deliberately not a generic importer for arbitrary gazetteers.

The returned frozen catalog provides `places` in numeric geographic-ID order and `get(stringId)`, which returns a place or null. Each place retains its source coordinate, class/type, source district code, official bilingual name, all aliases, and both source hashes. Nested names, aliases and provenance are also frozen. Missing language values remain null. An alias is not an additional place. No observation, GPS coordinate, journal record or discovery count is written by this module.

The diagnostic server allowlist now admits only the three additional files needed to exercise the loader: the module and its two public reference payloads. No new dependency was added.

## Verification

- `npm test`: 32 tests passed, including five new catalog tests. The new tests compare all 2,706 point records and all 2,826 name rows against the raw source, check 120 aliases, preserve Cheung Chau's Island type and absent translations, reject corrupt/truncated/swapped/reserialized inputs, test nested immutability, and test asynchronous caller mutation plus offset byte views.
- `node --check src/geography/place-catalog.mjs` and the browser driver syntax check passed; the Python server compiled successfully.
- `scripts/place-catalog-browser-checks.mjs` started its own loopback diagnostic server on an ephemeral port and loaded the module and both reference files in actual Chromium 151.0.7922.34. Every catalog entry matched Node output. Altered source bytes were rejected and source coordinates resisted mutation. No page errors or external requests were observed. The driver closed the browser and awaited its server's termination.
- [Machine-readable browser evidence](place-catalog-browser.json) binds the result to hashes of the module, tests, driver, server and source inputs.

Reproduce the browser check with `node scripts/place-catalog-browser-checks.mjs` when Playwright is resolvable; otherwise set `PLAYWRIGHT_MODULE` to the available Playwright ESM entry. This run used the existing bundled runtime, not a new installation. The initial driver failed because a hyphenated Python filename was imported as a module; the driver was corrected to load that exact file through `run_path`, then passed.

LSP remains unavailable: TypeScript is not installed and Python LSP installation was previously declined. No LSP success is claimed. No changes were made to auth, database privileges, production UI or the automatic-library platform amendment.

## Remaining work

Build and benchmark typed nearby-place candidates using the preserved class/type and provenance. Distances must remain explicit suggestions, not locality containment or proven visits. Integrate approved locality behavior into the journal and approved Figma interface afterward. The current module does not supply an assignment threshold, confidence score, offline caching of these new reference files, hosted sync integration or physical-device evidence.

Workflow: build-fusion routed to the fully read ponytail skill; the shared module and native Node/Chromium checks were used. Spark remained unavailable due to the already recorded provider quota exhaustion. No additional review lane or dependency installation was needed for this isolated reference loader. Project evidence is canonical; this unit establishes no new global Wiki rule.
