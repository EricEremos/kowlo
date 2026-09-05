# Spatial migration readiness

6 September 2026. **Full local migration chain verified: 163 checks passed. Hosted deployment remains unverified.**

## Verified full migration chain

The actual migrations 001, 002 and 003 ran in order on PostgreSQL 18.4 / PostGIS 3.6.4, using a new Unix-socket-only cluster with two synthetic identities and a minimal `auth.uid()` stand-in. All 163 checks passed. The driver stopped the cluster, and a separate `pg_ctl status` returned exit 3, confirming it was no longer running. [Machine-readable result](spatial-sync-db-results.json) and [source hashes and runtime provenance](spatial-runtime-provenance.json).

```sh
PATH="/tmp/placefold-spatial-runtime-3p1lvbg_/env/bin:$PATH" python3 scripts/test-private-journal.py --postgis --sync
python3 -m py_compile scripts/test-private-journal.py
python3 scripts/test-private-journal.py --help
```

The first spatial run exposed a test expectation error: an attempted independent write to the generated geometry returns SQLSTATE `428C9`, not `42501`. The test now asserts that actual generated-column rejection and verifies that both source coordinates and geometry remain intact. No migration SQL changed. Additional checks verify geometry and owner-scoped viewport behavior after the sync migration and synchronized writes, including the absence of records for a deleted account. The report now includes the runtime PostGIS version. Python compilation and help invocation passed; the previously declined language-server installation was not retried.

## Isolated runtime provenance

The existing PostgreSQL installation had no PostGIS, and no Docker or Podman runtime was available. A task-specific Micromamba 2.9.0 environment was created under `/tmp/placefold-spatial-runtime-3p1lvbg_`; no shell initialization or global PostgreSQL replacement was performed. All 69 exact conda-forge archives were downloaded and extracted before linking, their SHA-256 hashes verified against the resolved manifest, and the package tree checked for pre/post link scripts (none found). Linking used offline mode and explicitly skipped link scripts. [Exact package manifest](spatial-runtime-package-lock.json), [explicit URL lock](spatial-runtime-explicit.txt).

The [official conda-forge PostGIS package](https://anaconda.org/conda-forge/postgis) supplies an Apple Silicon build, pinned here to `3.6.4 hb889dd6_0`; PostgreSQL is `18.4 h9d50efe_1`. The embedded PostGIS recipe identifies GPL-2.0-or-later licensing and a hashed upstream source archive. Its build scripts were inspected, not executed. The recipe has its upstream `make check` commented out, so package provenance alone was not treated as functional verification. The independent project driver supplied that evidence for this project's tested behavior.

The temporary runtime is a local verification dependency, not a production or hosted-version guarantee. Remaining work includes actual Supabase deployment privileges, JWT/PostgREST tests, pagination and large-library performance, and browser/PostGIS district-classification parity. Accurate coordinate preservation does not improve camera GPS precision or establish a venue. No hosted database was created or modified.

## Earlier preflight record

The sections below retain the earlier dependency failure and initial source hashes. They are historical; the successful full-chain result above supersedes their runtime-readiness status.

### Database behavior at initial preparation

`supabase/migrations/202609060002_observation_geometry.sql` adds PostGIS in the `extensions` schema and rejects an existing installation in a different schema. It derives a stored `geometry(Point,4326)` from each observation's longitude and latitude, including existing rows, and adds a GiST index. The source double-precision columns remain authoritative; this does not improve the accuracy of the camera's GPS or identify a venue.

`observations_in_view(west, south, east, north)` is a stable SECURITY INVOKER function with an empty search path. Its explicit owner filter supplements the existing observation RLS policies. Only `authenticated` receives execution permission. It validates bounds, supports west > east across the antimeridian, and returns observations ordered by UUID. The exact numeric coordinate predicates supplement the spatial bounding-box prefilter so reduced-precision index bounds cannot admit a point just outside the requested rectangle. Bounds are inclusive, including a zero-area view.

This function currently returns the complete matching set. PostgREST pagination behavior and large-library query cost need measurement before choosing the production map transport; no scale or API-performance claim is made.

### Initial test driver and observed result

The existing isolated-cluster driver now has `--postgis`. It requires the actual installed extension, applies both real migrations and adds checks for existing-row backfill, coordinate order/SRID, geometry recomputation, forbidden independent geometry edits, valid GiST index, function privileges, two-owner viewport isolation, missing identity, anonymous denial, invalid bounds, exact edges, near-edge exclusion, antimeridian matching and deletion. It then runs the original 58 journal checks under the extended schema.

Observed commands:

```sh
python3 scripts/test-private-journal.py --postgis
python3 scripts/test-private-journal.py
python3 -m py_compile scripts/test-private-journal.py
```

The spatial run exited nonzero at the explicit dependency check: **PostGIS is not installed for this PostgreSQL runtime; spatial migration checks were NOT run.** See [preflight output](spatial-preflight.log). No spatial assertion is counted as passed, and the second migration was not executed.

The ordinary run passed all 58 checks on PostgreSQL 17.10. Its newly created Unix-socket-only cluster was stopped by the driver. [Current result](private-journal-db-results.json). Python syntax compilation passed. The configured Python language server is unavailable and its installation was previously declined.

Source digests for this unit:

- Spatial migration: `4956569a8f00dbaa9aa5e7267937742741124365b8ac3fe164555b5b599e4f80`.
- Test driver: `88b06120cf3805fcf409df0c6ed8f49bc19a6f0a90646983777eb2cdf156bde4`.

### Initial dependency finding and remaining verification

PostgreSQL's available-extension query returned zero for PostGIS. A bounded filesystem check also found no installed PostGIS control file. Homebrew reported PostGIS 3.6.4 uninstalled and a large transitive dependency set, including GDAL, Arrow, AWS libraries and LLVM. No package was installed or updated. The supply-chain skill was consulted; its skill-install audit machinery was not applied to a nonexistent skill candidate.

The next spatial verification requires a task-scoped PostGIS-capable runtime. Run the same `--postgis` command there and resolve every failure before deployment. Also required: actual Supabase JWT/PostgREST tests, production pagination/performance measurement, pinned district-data loading and browser/PostGIS classification parity. This migration alone does not implement district/locality records, synchronization or a production map. No hosted database was created or modified.

### Sources and workflow at initial preparation

The coordinate order, separate extension schema, GiST index and viewport pattern follow [Supabase's PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis). The invoker function retains database ownership enforcement following [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). These sources support the design choices, not an assertion that this SQL has executed successfully.

Applied `ponytail` full and `supabase-postgres-best-practices` RLS/privilege references. Main model owns this bounded change; Spark was not retried after provider exhaustion. Previous goal turn constituted progress through verified offline behavior and its evidence record. This turn adds the spatial migration and executable verification path, with its dependency limitation explicit.
