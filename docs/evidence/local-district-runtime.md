# Local district classification and milestone evidence

Verification recorded 6 September 2026. This work adds geographic classification and honest collection progress to the local photo-metadata diagnostic. It does not implement automatic phone-library access or the production interface.

## Observed behavior

The real browser worker processed all ten synthetic photo fixtures successfully. Four fixtures representing Central and Western produced **1 / 18 districts**, not four milestones. The two valid southern/western-hemisphere controls were outside the district dataset. Missing, partial, invalid and unsupported/corrupt metadata retained their distinct outcomes. No personal photographs were used.

The browser displayed `10/10 fixture checks passed. Images stayed local.` and `1 / 18 districts represented by unique interior GPS matches. Repeats count once; ambiguous points count zero. This is not land coverage or verified venue attendance.` The observed environment was the Codex in-app Chromium 152 browser at localhost:8787, secure context true. The browser warning/error log query returned an empty list. Resource timing recorded only the localhost origin; this supports, but does not replace, a complete network capture.

The worker accepts verified district geometry before processing photographs. The page checks the dataset's SHA-256 before transferring it. Worker CSP sets `connect-src 'none'`. Direct HTTP checks returned 200 for the worker and district dataset, 404 for package.json and the full project prompt, and 501 for a POST to the diagnostic. No remote geocoder is called.

## Geographic meaning

Source: [Hong Kong Home Affairs Department district boundaries](https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json), retained unchanged in `data/reference/hk-districts.geojson`.

SHA-256: `e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8`.

A unique polygon-interior match receives a district assignment. A boundary match or multiple matches remains ambiguous and awards no district milestone. Outside-dataset and invalid coordinates remain separate outcomes. Repeated accepted records in the same assigned district count once. The original coordinates remain the evidence; district assignment does not improve GPS accuracy or establish a business visit, travelled route, or complete exploration of that district.

The official administrative polygons include marine areas. Their outlines are not land coastlines. Ten repeated zero-length source edges were retained, consistent with the earlier geographic feasibility audit; source geometry was not silently repaired.

## Verification

- `npm test`: 19 tests passed, zero failed. Includes the existing metadata tests plus source integrity, independent geometry comparisons, invalid coordinates, deduplicated milestones and malformed geometry checks.
- `.venv_py312/bin/python scripts/generate-district-fixtures.py`: generated 684 independent GEOS oracle cases: 18 district interior representatives, 441 grid points, 45 shared-boundary points and 180 nearby perturbations. JavaScript matched district IDs and interior/boundary relations for all cases.
- `python3 scripts/generate-photo-fixtures.py`: generated ten synthetic JPEG/HEIC and failure fixtures. The research virtual environment lacked Pillow, so regeneration used the already available system Python environment.
- Python syntax parsing passed for the changed diagnostic server and both fixture generators.
- The actual browser button exercised source hashing, module-worker loading, geometry transfer, metadata parsing and district counting together. Boundary ambiguity was exercised by the Node oracle tests, not by an actual phone-library scan.

Editor language servers were unavailable. Executable tests and browser behavior provide the verification recorded here; no clean language-server result is claimed.

## Dependency review

Added exact `point-in-polygon-hao@1.2.4` after reading its published source and package metadata. MIT; upstream repository [rowanwins/point-in-polygon-hao](https://github.com/rowanwins/point-in-polygon-hao), published git head `c31c1e76f42b571cd732ec817134b42a70df8d8b`. Its narrow runtime dependency resolves to `robust-predicates@3.0.3` under the lockfile, Unlicense. Neither package has an install lifecycle hook. Installation used `npm install --save-exact --ignore-scripts point-in-polygon-hao@1.2.4`; npm reported zero known vulnerabilities at that time, not a security guarantee.

The unbundled diagnostic uses the package's published self-contained browser bundle in both Node and browser checks. The embedded predicate code is the code shipped in that bundle; the separately resolved dependency version does not establish its embedded version. The application validates finite coordinate ranges, ring structure and closure before invoking the predicate.

## Remaining limits

These are geometry-derived controls, not surveyed GPS ground truth. PostGIS parity, exact locality/venue identification, physical-device performance, real photo permissions, automatic library reconciliation and local thumbnail palette extraction remain unverified or unimplemented. The Figma palette is illustrative. This evidence completes the district-classification feasibility work unit only; it does not complete the approved beta Goal.
