# Place-name source evaluation

Observed 6 September 2026 Hong Kong time. Scope: determine whether the official gazetteer can support named chapters in the private photo atlas. This evaluation acquires reference data and establishes an integration contract; it does not implement production locality assignment.

## Decision

Use Lands Department geographic IDs as the identity of named places. Join the point layer to its name table by `GEO_NAME_ID`, retain the official English/Traditional Chinese names and all aliases, and preserve the source class and type. These points support nearby-name suggestions. They do not supply neighborhood containment, venue visits, or a defensible completion denominator.

Keep photo coordinates authoritative for the observation's location. Calculate its administrative district using the existing boundary classifier. Store the place source's district code separately; never use a place's district attribute to move a photo or overwrite its calculated district.

## Source and acquisition evidence

The [DATA.GOV.HK catalog](https://data.gov.hk/en-data/dataset/hk-landsd-openmap-landsd-geographic-name/resource/80fb7aa4-a7b9-4e10-8292-87ca1a224198) describes the Survey and Mapping Office's gazetteer, settlement/hydrographic/topographic coverage and monthly update cadence. The [CSDI service documentation](https://portal.csdi.gov.hk/csdi-webpage/doc/GeoSpatialServices) identifies the dataset's ArcGIS endpoint and coordinate request options. These are governing source descriptions, not measurements of photo GPS accuracy.

The live [FeatureServer](https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1648571595120_89752/FeatureServer?f=pjson) exposes point layer `0` (`GEO_PLACE_NAME`) and table `1000` (`PLACE_NAME`). Layer 0 reported native EPSG:2326, a 3,000-record response limit and pagination support. Point queries explicitly requested `outSR=4326` and GeoJSON. Both requests ordered by `OBJECTID`, requested all attributes, and received fewer than 3,000 records without a transfer-limit flag.

Exact response bytes are preserved in:

- `data/reference/hk-place-points.geojson`: 614,616 bytes; SHA-256 `156ba14a179f8e9454616cb2035877cf64824bb5c31cd4c8e86316ec84e74952`.
- `data/reference/hk-place-names.json`: 424,266 bytes; SHA-256 `084ae525b636f94d65c45ad938e313779f0f7b735a74300efee2ee4177c60d33`.
- `data/reference/hk-places.provenance.json`: exact query URLs, UTC fetch times, HTTP content types/ETags, byte lengths, hashes, counts and initial profile.

Counts queried immediately before and after each fetch matched the received feature count. This guards against truncation but does not prove a transactional snapshot across the two endpoints. Neither response supplied Last-Modified. Fetch time and ETag are not a legal effective date or a surveyed accuracy claim. Future refreshes require a fresh join/coverage audit and preserved old source versions.

## Direct observations

| Check | Observed result |
|---|---|
| Geographic points | 2,706, all distinct geographic IDs and point geometries |
| Name rows | 2,826: 2,706 Official and 120 Alias |
| Join integrity | Every point has exactly one Official name; no orphan names or unnamed point IDs |
| Official language coverage | All have English; 4 lack Traditional Chinese |
| Alias language coverage | 4 lack English; 108 lack Traditional Chinese |
| Place classes | Settlement 1,613; Topographic 796; Hydrographic 297 |
| Settlement types | Village 1,299; Area 301; Town 13 |
| Coordinate checks | All finite longitude/latitude pairs in the expected Hong Kong range |
| Point versus official district geometry | All 2,706 have a unique interior match; 13 differ from their source district attribute |

The four Official names without Chinese text are Crown Point, Crow's Nest, Hebe Knoll and Tate's Ridge. Preserve missing values and fall back to the supplied English name. Do not invent translations. Aliases identify the same place and must not create extra discoveries.

The 13 district differences are retained individually in `docs/evidence/place-name-spatial-profile.json`. Examples include Hong Kong Island, whose source district is Southern but whose label point lies in Wan Chai, and Kowloon, whose source district is Yau Tsim Mong but whose point lies in Kowloon City. A named area's extent can be larger than a point's containing district; the observed difference is not sufficient to accuse either source of error. The district-code crosswalk in the profile is an explicit project mapping between the two sources' identifiers.

## Challenge cases that change the design

`place-name-spatial-profile.json` contains six exploratory coordinate controls and their three nearest candidates. Distances use a spherical haversine calculation with mean Earth radius 6,371,008.8 m, rounded to metres. They are distances to label points, not distances to neighborhood edges or measured positioning errors. Control labels are scenario descriptions, not surveyed ground truth.

| Scenario | Observation | Implication |
|---|---|---|
| Existing Central example, 114.154 / 22.281 | Sheung Wan label is 529 m away; Central District is 560 m away | A small distance advantage cannot establish which locality contains the photo |
| Existing Sha Tin example | Wong Uk Village is nearest, 47 m from the coordinate | Local detail is available, but still requires suggestion semantics |
| Existing Cheung Chau example | Cheung Chau Wan (Bay) is nearest at 163 m; Cheung Chau (Island) is 197 m away | Taking the nearest feature can choose water; filtering only Settlement loses the island name |
| Synthetic harbour coordinate | Tsim Sha Tsui is the nearest Settlement, 1,153 m away | Proximity and same-district matching do not prove a land visit |
| Outside-Hong-Kong maritime control | Nearest Settlement is over 16 km away | A nearest-name function always finds something unless scope and distance are explicit |

## Integration and reward contract

1. Build each named-place reference from its geographic ID, exact source coordinate, class/type, official name and alias rows. Keep the two source hashes in provenance. Names and `OBJECTID` alone must not be used as place identity.
2. Keep observation GPS, computed district and suggested named place as separate facts. A source point has no polygon to fill as though it were an official neighborhood boundary.
3. Represent a nearby-name result with candidate ID, method/version, distance to label point and source provenance. Preserve multiple plausible candidates; allow a separate user correction without modifying source coordinates.
4. Include islands in the design vocabulary alongside urban areas, towns and villages. Do not automatically award a nearby hill, bay or island as a visit. Category eligibility and distance thresholds remain a benchmark decision, not a claim that all points within a fixed radius belong to that place.
5. A place and its aliases form one chapter. Additional photos enrich that chapter's colours and memories. They do not multiply place counts. The gazetteer's 2,706 points must not become a compulsory "complete Hong Kong" target; it mixes unlike geographic features and scales.
6. Use the already verified administrative district counts for bounded geographic milestones. A district match still is not proof of walking or land coverage. Nearby-name suggestions must not inflate those counts.

These rules preserve the intended effortless atlas: photos contribute automatically to known district chapters, while locality ambiguity does not require a mandatory review queue before the user can see their map. Production automatic phone-library access remains subject to the separate platform amendment.

## Alternatives and remaining evidence

| Alternative | Benefit | Failure or switch condition |
|---|---|---|
| Nearest point across all types | Simple, covers all source records | Reject as automatic assignment: bay/hill candidates and far-away matches can misdescribe a photo |
| Settlement-only nearest point | More likely to describe inhabited places | Insufficient alone: loses Cheung Chau and other island identities; harbour example remains misleading |
| Typed candidates with explicit uncertainty | Retains useful detail and source meaning | Selected integration direction; needs benchmarked eligibility, distance and ambiguity rules before production |
| Verified locality polygons | Could support actual locality containment | Reconsider if an authoritative, licensed, appropriately scaled polygon source is obtained; these point records do not provide it |

No universal distance cutoff or success rate is established by this six-scenario sample. The next implementation unit is a validated, deterministic reference loader for the pinned point/name join, followed by a separate benchmark for candidate selection. Production UI, hosted queries, physical-device access and GPS accuracy remain unverified by this work.

Work-unit closure: official payload acquisition, full join/language/type checks, 2,706 existing-classifier evaluations, six proximity challenges and source-backed integration decision completed. The earlier district classifier was reused against new data; its unchanged 684-case parity gate was not repeated. Project evidence is the canonical record; no new global Wiki doctrine is established.
