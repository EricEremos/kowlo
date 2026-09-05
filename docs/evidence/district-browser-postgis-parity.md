# District classification and truthful progress

The browser and PostGIS classifiers agree on **684 geographic controls**, including full match lists, English/Chinese names, boundary relations, statuses, source hashes and milestone IDs. The full 001–005 migration chain passed **209 database checks** on PostgreSQL 18.4 / PostGIS 3.6.4. Chromium 151.0.7922.34 ran the actual browser module, with no page errors or external requests during this check.

## Delivered

Migration 004 adds the read-only `hk_districts` reference, `classify_hk_district(longitude, latitude)`, and private `observation_districts_in_view(west, south, east, north)`. Functions use invoker rights and an empty search path. The projection derives results from current owner-scoped observations, avoiding stale stored labels after coordinate edits.

Migration 005 seeds the 18 official polygons. The generator rejects a changed source hash and produces a deterministic migration. Database checks compare every loaded polygon's EWKB with the source conversion without tolerance or simplification. An incomplete reference raises an installation error instead of presenting an empty atlas. Clients cannot change the reference; anonymous access is denied.

## Achievement behaviour observed

| Scenario | Distinct districts |
|---|---:|
| Four Central photos | 1 |
| Central photos plus ambiguous boundary and outside-dataset points | 1 |
| Add Sha Tin | 2 |
| Edit the Sha Tin coordinate back to Central | 1 |
| Empty collection | 0 |

Database checks also exercised synchronized observations, other-account isolation, missing identity, invalid viewport bounds, coordinate updates, individual deletion and account deletion. Uncertain observations remain visible without an awarded district. Account deletion preserves the shared reference.

## Evidence and reproduction

- [Database results](district-postgis-results.json): 209 named checks and 684 full PostGIS outputs.
- [Browser comparison](district-browser-postgis-parity.json): browser version, source/code hashes, database result hash, observed counts and network/error results.
- [Runtime provenance](spatial-runtime-provenance.json): isolated package environment and archive verification. The cluster used here was `/tmp/placefold-db-ho9ek788`; `pg_ctl status` confirmed it stopped after the run.

```sh
python3 scripts/generate-district-seed.py --check
python3 scripts/test-private-journal.py --postgis --sync --districts > docs/evidence/district-postgis-results.json
node scripts/district-parity-checks.mjs
```

Use the verified PostgreSQL/PostGIS binaries on PATH, run the diagnostic server on `127.0.0.1:8787`, and provide an existing Playwright installation through `PLAYWRIGHT_MODULE` when outside this project. Python compilation, JavaScript syntax validation and the database driver's help command passed. Python/TypeScript LSP services remain unavailable; no language-server pass is claimed.

## Interpretation and limits

The reference is the [Home Affairs Department district dataset](https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json), pinned to SHA256 `e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8`. It includes marine administrative areas and does not prove a dry-land visit.

[ST_Covers](https://postgis.net/docs/ST_Covers.html) includes boundary points; [ST_Contains](https://postgis.net/docs/ST_Contains.html) excludes a point lying solely on a polygon boundary. We combine them to preserve boundary uncertainty and award a district only for one unique interior match. Near-boundary interior points still follow their supplied coordinates; GPS accuracy radii and venue confirmation are not implemented here.

These controls are geometry-derived, not surveyed GPS truth. Agreement does not establish sensor accuracy. Hosted Supabase JWT/PostgREST behaviour, physical devices, source-backed localities, large-library performance/pagination, automatic photo-library access and production achievement presentation remain outside this unit. The beta Goal remains active.

Work unit: source/schema implementation complete; real PostGIS and browser verification complete; evidence recorded. This project-specific geographic contract is held in project evidence; no new cross-project Wiki rule was inferred.
