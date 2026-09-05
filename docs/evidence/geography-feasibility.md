# Geography Feasibility — HK 18 District Boundaries

Execution date: 2026-09-05

## Source and provenance
- URL: `https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json`
- Source SHA-256 (`data/reference/hk-districts.geojson`): `e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8`
- Source bytes: `366594`
- Validation run: `.venv_py312/bin/python scripts/validate-geography.py data/reference/hk-districts.geojson`
- Geometry engine: `shapely==2.1.1` (`GEOS`), observed at runtime via `shapely.__version__`

## Scope and what changed from prior report
- Switched validation from pure-Python checks to GEOS-backed checks.
- Previous “4 lists / 11+5 / 15” inconsistency is corrected: **issue_count is 15 total**, explicitly all zero-length-edge related.

## Dataset shape and IDs
- `FeatureCollection` with **18** features.
- Geometry type counts: `Polygon: 18`.
- District ID coverage: all expected IDs present (`A..T` excluding `I`, `O`, `U` as per HK schema).
- District names: all expected official names present, no missing/duplicate IDs or names.
- `bounding box`: `lon [113.81723, 114.50247]`, `lat [22.13672, 22.56833]`.

## GEOS validation results
- `district_reports` all pass `is_valid=true`, `is_simple=true`.
- No `invalid_geometry` findings from Shapely.
- Coordinate-ring/structure checks show holes at zero and all representative points are inside their own polygon.
- Raw ring checks reported **15 issues**:
  - `zero_length_edge[K:ring0:127]`
  - `zero_length_edge[K:ring0:1476]`
  - `zero_length_edge[K:ring0:499]`
  - `zero_length_edge[M:ring0:1162]`
  - `zero_length_edge[M:ring0:1488]`
  - `zero_length_edge[P:ring0:1104]`
  - `zero_length_edge[P:ring0:1219]`
  - `zero_length_edge[Q:ring0:628]`
  - `zero_length_edge[R:ring0:1476]`
  - `zero_length_edge[R:ring0:565]`
  - plus 5 aggregated per-district summaries (`K:3`, `M:2`, `P:2`, `Q:1`, `R:2`).
- Interpretation: geometry is not invalid; these are repeated-vertex artifacts at selected vertices and are typically non-fatal for district assignment logic.

## Boundary/adjacency checks (GEOS boundary intersection)
- Pairwise district boundary comparisons: **45 pairs with shared boundary**.
- `line_shared=45`, `point_shared=0` (no point-touch-only adjacency).
- This aligns with expected planar adjacency for this dataset shape.

## Representative points and controls (18 fixed fixtures)
- Representatives are deterministic, one per district, generated using `representative_point()` and persisted to `data/reference/hk-districts.provenance.json` under `source.representative_points`.
- All 18 representatives are inside their intended district.
- Named control checks (all pass):
  - Central `(114.154, 22.281) -> A`
  - Sha Tin `(114.200, 22.380) -> R`
  - Tung Chung `(113.9439, 22.288) -> T`
  - Cheung Chau `(114.028, 22.208) -> T`
- Outside/sea controls:
  - `(114.4, 22.08) -> []` (outside all 18 polygons)
  - `(113.95, 22.2) -> T` (inside Islands polygon, likely coastal/marine inclusion)
- Union and range checks pass: `union_valid=true`, `contains_nofeature_point=true`.

## Main audit and limitations

On 2026-09-05 at 15:49:03 UTC, the main agent fetched the official source again and compared its complete bytes with the local file: identical. The HTTP Last-Modified header was `Mon, 31 Aug 2026 03:33:33 GMT`. Provenance now records this observed fetch and header, replacing the unsupported midnight timestamp. Neither is evidence of a legal boundary effective date.

The existing validator was executed without its exit-code suppression option. It returned **exit code 2**, with 15 notices corresponding to 10 repeated-vertex edges and 5 aggregate summaries. This is not a clean validator pass. The repeated vertices are accepted for this GEOS district-assignment feasibility result because all 18 polygons are valid and the independent spatial checks below succeeded; the official source is preserved unchanged.

Independent checks on the full-resolution geometry found:

- 18 interior representative points each matched exactly one intended district.
- The six named, outside and maritime controls passed.
- No pair of districts had positive-area overlap.
- One point sampled from each of the 45 shared boundaries matched both adjacent districts. The exact coordinates and complete candidate lists are retained in `geography-main-audit.json` for later browser/PostGIS parity checks. These are geometry-derived tests, not independent surveyed ground truth.

Product consequence: preserve all boundary candidates and withhold district milestones from ambiguous records until resolved. Administrative containment alone cannot confirm a venue, a land location or the accuracy of a photo's GPS measurement. Do not count a shared-edge photo as visits to two districts.

This audit does not establish browser/PostGIS parity, near-boundary accuracy thresholds, current locality labels or device GPS accuracy. The existing validator is a fixture-oriented research utility, not hardened production ingestion; its numeric validation and malformed-coordinate handling need strengthening before accepting arbitrary datasets.

Machine-readable evidence: `docs/evidence/geography-main-audit.json`.

## Feasibility conclusion
- Suitable for district assignment (point-in-polygon and neighbor-edge checks).
- **Not a clean land-only shoreline source**: the Islands polygon includes at least ocean-facing area in the control test; coastal/shoreline rendering should be treated as administrative-territorial extent, not as an authoritative wet/dry boundary.
