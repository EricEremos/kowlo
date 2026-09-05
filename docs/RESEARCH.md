# Research and evidence

Research date: **5 September 2026**. Scope: feasibility and product decisions for a Hong Kong photo-GPS journal before project approval. Method: targeted primary documentation, official data inspection, reference-product observation and selected academic author pages/abstracts. This is not an exhaustive literature review. No browser-photo import experiment has yet been performed.

## 1. What the reference actually establishes

The supplied screenshot shows a restrained light interface, map recording, large distance statistics, dotted regional silhouettes, a journal and district detail. These are visual observations, not evidence of backend architecture.

The developer's current App Store description already includes imported photos, worldwide dotted maps, detailed Korea/Japan regions, representative photos and place notes, alongside walking records. It describes on-device records and personal iCloud backup. These are developer claims, not an independent privacy audit. Therefore, photo import itself is not our differentiation. Hong Kong geographic detail and the web experience need to carry the value. [Official App Store listing](https://apps.apple.com/kr/app/%EB%B0%9C%EC%9E%90%EC%B7%A8-%EC%84%B8%EC%83%81%EC%97%90-%EB%82%98%EB%A5%BC-%EB%82%A8%EA%B8%B0%EB%8B%A4/id6792431474).

The reference's visual rhythm is useful inspiration. Its route statistics are not valid features to reproduce from sparse photographs alone.

## 2. Photo metadata: feasible, with a platform-dependent boundary

Browser File APIs support explicit user selection and local processing. A web app should not promise silent library scanning or permanent access to all photos. [MDN: using files](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications).

`exifr` documents browser File/Blob input and GPS extraction, including metadata in JPEG and HEIC. `ExifReader` is an alternative with broader tag/format handling. These are candidate parsers; neither restores metadata that an operating system has removed before delivering a file. Inspect and pin the chosen package before installation. [exifr upstream](https://github.com/mikekovarik/exifr), [ExifReader upstream](https://github.com/mattiasw/ExifReader).

A historical WebKit issue documents an iOS 17/Safari 17 picker/conversion path that stripped metadata. Its last recorded update in the inspected page was in 2023. This establishes a concrete failure mode, **not** a conclusion that all current iOS imports fail. Apple's sharing instructions also allow location suppression and format conversion, but those sharing controls do not guarantee behavior in a browser file picker. [WebKit issue 263192](https://bugs.webkit.org/show_bug.cgi?id=263192), [Apple photo-sharing guide](https://support.apple.com/en-ca/guide/iphone/iphf28f17237/ios).

**Decision:** make real-phone import a first feasibility gate. Test Photos versus Files selection, browser versus installed PWA, JPEG versus HEIC, original files versus shared/converted files. Record exact versions. Metadata parsing and HEIC image preview decoding are separate capabilities; a preview failure must not automatically reject valid GPS.

**Counterevidence to a seamless-import promise:** location shown in a library can be stored separately from the delivered file; missing GPS can be legitimate; messaging or conversion paths may alter metadata. The product needs useful partial-success and missing-location states.

## 3. Installation and local durability

PWA installation differs by browser and OS. MDN documents Chromium desktop installation, Safari Add to Dock on supported macOS versions and share-menu installation on supported iOS versions. iOS does not expose the same install-prompt event as Chromium. A manifest and HTTPS are part of the foundation, not proof of universal installation. [MDN: making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Browser storage can be evicted or constrained by quota. WebKit describes persistence heuristics rather than an unconditional backup guarantee. Therefore local drafts need explicit status, failure handling, export and optional private synchronization. Offline map tiles are a separate licensing/storage decision. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

**Decision:** ship a useful website plus installation guidance for verified platform paths. Promise offline drafts and cached application shell only after tests; do not initially promise a complete offline Hong Kong basemap.

## 4. Hong Kong geography: verified foundation and limits

The Home Affairs Department publishes the 18 administrative districts with English and Traditional Chinese names. This is a stronger starting point than treating informal neighborhoods or old electoral units as interchangeable administrative regions. [Official catalog](https://data.gov.hk/en-data/dataset/hk-had-json1-hong-kong-administrative-boundaries), [dataset specification](https://www.had.gov.hk/datagovhk/dataspec/en/dataspec_district_boundary_en.pdf).

### Direct read-only API observation

The following was inspected from the [live HAD JSON](https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json) on the research date:

| Property | Observed value |
|---|---|
| Response size | 366,594 bytes |
| Features | 18; each declared `Polygon` |
| District fields | `District`, `地區`, `地區號碼`, plus description |
| Coordinate extent | longitude 113.81723–114.50247; latitude 22.13672–22.56833 |
| Explicit JSON `crs` field | Absent |
| HTTP Last-Modified | Mon, 31 Aug 2026 03:33:33 GMT |
| SHA-256 | `e145cc41230d8215dfb0a797230a0c9671827c018ba608bfc3086966da4735c8` |

The specification describes WGS84/EPSG:4326 for its GML representation, and observed JSON values are consistent with longitude/latitude degrees. Production ingestion must still validate its coordinate contract, ring topology, islands and holes. A recent HTTP header is not proof of a legal effective boundary date. The payload was inspected, not installed into a production database.

Lands Department geographic-name data covers settlements, hydrographic and topographic names and is cataloged as monthly. It can support locality suggestions. Point names do not define neighborhood polygons, building footprints or proof of a venue visit. [Geographic-name catalog](https://data.gov.hk/en-data/dataset/hk-landsd-openmap-landsd-geographic-name/resource/80fb7aa4-a7b9-4e10-8292-87ca1a224198). The 6 September source evaluation acquired 2,706 points and 2,826 name rows, verified the complete geographic-ID join, and found 13 differences between source district attributes and point containment. Cheung Chau is an Island, so a settlement-only filter is insufficient. [Source evaluation and integration contract](evidence/place-name-source-evaluation.md) records language gaps, aliases, proximity counterexamples and remaining benchmark work.

CSDI documents geospatial services with multiple coordinate systems and service formats. WFS axis conventions can differ from GeoJSON conventions; test a known landmark and axis order for each chosen endpoint. [CSDI service documentation](https://p1tools.csdi.gov.hk/csdi-webpage/doc/GeoSpatialServices).

Government reuse terms permit reuse subject to conditions including attribution and disclaimers. Keep dataset and map-tile licenses separate. [DATA.GOV.HK terms](https://data.gov.hk/en/terms-and-conditions).

**Decision:** official districts first, named-place suggestions second. Do not ship historical 452-area constituency data as current neighborhoods. Handle coastal, offshore and shared-boundary cases without silently snapping them to an apparently precise location.

## 5. Academic foundations and their actual strength

| Anchor | Evidence reviewed | Application and limit |
|---|---|---|
| Yu Zheng, *Trajectory Data Mining: An Overview*, ACM TIST 6(3), 2015, DOI 10.1145/2743025 | Author-hosted project material on preprocessing and trajectory uncertainty; full paper PDF was not reviewed end-to-end | Sparse observations and noise require uncertainty handling. Do not turn photo points into an observed walking route. [Author source](https://www.microsoft.com/en-us/research/project/trajectory-data-mining/) |
| de Montjoye et al., *Unique in the Crowd: The privacy bounds of human mobility*, Scientific Reports 3, 1376, 2013, DOI 10.1038/srep01376 | Author-hosted abstract | In the studied cellular dataset, four spatiotemporal points identified 95% of traces. This is dataset-specific, not a universal risk percentage for this app. It supports treating location records as sensitive even without photographs. [MIT source](https://www.media.mit.edu/publications/unique-in-the-crowd-the-privacy-bounds-of-human-mobility/) |
| Hodges et al., *SenseCam: A Retrospective Memory Aid*, UbiComp 2006 | Author-hosted abstract describing a camera/sensor system and a single-patient study | Visual records can inspire memory-oriented interfaces. This does not establish clinical benefits, nor validate a GPS-only journal for general users. Our design needs its own usability evidence. [Microsoft Research source](https://www.microsoft.com/en-us/research/publication/sensecam-retrospective-memory-aid/) |

The academic contribution here is a disciplined treatment of uncertainty, privacy and memory cues. A fashionable AI component is unnecessary for those requirements. The first beta should use deterministic geographic assignment and attributed labels; generated travel narratives are deferred.

## 6. Technology choices and alternatives

| Decision | Preferred proposal | Alternative 1 | Alternative 2 |
|---|---|---|---|
| Application | React/TypeScript + Vite PWA: client-heavy private tool | Next.js if public content/SEO/server routes become central | Native shell if reliable system photo-library access becomes essential and PWA experiments fail |
| Metadata | exifr in a worker; prove target formats | ExifReader after fixture comparison | Server extraction would require original-file transfer and conflicts with the proposed privacy contract |
| Map | MapLibre with separately licensed tiles and geographic data | Simpler 2D map renderer if feature needs stay modest | Commercial SDK after reviewing cost, terms and provider data exposure |
| Geographic records | Supabase/PostGIS, matching requested backend | Local-only storage reduces cloud exposure but weakens recovery/sync | Fully native/cloud-specific storage changes the requested web and Supabase scope |

Vite supplies a modern frontend build foundation; choosing it here is an engineering judgment. MapLibre is a renderer, not a complete hosted map-data service. Supabase documents PostGIS and owner-based RLS, but actual policies and grants must be tested. [Vite guide](https://vite.dev/guide/), [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/), [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

`ST_Covers` includes boundary points, so adjacent district polygons may both match an exact edge. Preserve ambiguity rather than using an arbitrary first result. [PostGIS ST_Covers](https://postgis.net/docs/ST_Covers.html).

Public OpenStreetMap tile services have operational restrictions, including bulk/offline-download restrictions. Select a suitable tile provider before making offline or scale promises. [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).

## 7. Unresolved questions that can change the project

1. Which actual phone and desktop combinations preserve GPS through the available selection paths? This is the most consequential feasibility uncertainty.
2. Does “GPS only” permit optional capture dates and private cloud synchronization? The complete prompt makes both explicit and leaves a strict GPS-only path usable.
3. How reliably do official place names describe the Hong Kong areas users recognize? Inspect samples and test labels with local users before promising neighborhood-level precision.
4. Which tile provider, Supabase region and usage limits suit the expected audience? No reliable monthly budget exists without usage assumptions and current plan review.
5. Can the available Figma and Supabase accounts be connected to the intended targets? GitHub identity is verified; Figma currently requires reauthentication and Supabase access is unverified.

Research supports proceeding to a bounded feasibility phase after full-prompt approval. It does not yet justify an unconditional promise of universal photo import, installation, precise neighborhood identification or a completed beta.
