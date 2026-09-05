# Automatic atlas revision review

5 September 2026. User corrected the product twice: permission-based discovery of existing photos, and regional/place identity rather than an Add places workflow.

Four editable Figma frames created on page 15:18 in file whw3t850Pcj9LrSiBa8rwn:

- 35:23: one-time photo-library connection explanation.
- 35:48: progressively populated atlas, scan status and discovered neighbourhoods.
- 35:100: automatically assembled place chapter with optional personal note.
- 37:24: collection view with district milestones and an illustrative place palette.

Uses existing bound colours, text styles, auto layout, button instances and navigation. Map vectors were derived from the validated local official 18-district GeoJSON, simplified for this static preview; three sample markers are illustrative. Marine administrative geometry is explicitly labelled and is not a coastline. Production atlas still needs a licensed geographic basemap and richer region-specific treatment.

All four 390×900 exports visually inspected. Final content ends at y=876. Revised awkward welcome line break, inset the map caption, and corrected collection overflow by reducing its heading and palette block heights. The connection disclosure now explicitly includes local use of photo colours, without original-image uploads. Old manual-import board annotated as superseded. Original photos, real library access and scan behavior have not been tested or implemented. These four review screens are static and do not simulate an OS permission grant. Previous prototype navigation remains unverified and is not evidence for this flow.

Achievement means a collection growing through distinct photo locations and districts with saved photo locations, not a claim that an entire district has been explored. The collection shows an illustrative 3 of 18 districts, a Sheung Wan chapter and four sample colours; these colours were not extracted from actual photos. Production requirements include deduplicated milestones, source-coordinate preservation, uncertainty for suggested places, local thumbnail palette extraction, reduced motion and optional sharing with precise locations hidden.

Screenshots: figma/automatic-connect.png, figma/automatic-atlas.png, figma/automatic-place.png and figma/automatic-collection.png. Platform amendment: ../AUTOMATIC_LIBRARY_AMENDMENT.md. Native phone delivery decision pending; original Goal remains active.

6 September copy refinement: collection frame 37:24 now says “YOUR LATEST DISCOVERY”, “Three districts, already yours.” and “New districts mark milestones. Familiar places grow richer with each return.” Mutated text nodes: 37:57, 37:66, 37:67. The current Figma render was visually checked at 390×900; the subtitle remains two lines and the navigation ends at y=876 without overlap. The saved PNG files above document the preceding revision; the inline Figma render and live frame document this latest copy change.

Design rules for the reward experience: an initial scan gets one consolidated discovery summary; subsequent new districts get one quiet milestone each. Repeat scans do not repeat awards. Additional photos in a known district enrich its chapter rather than inflate the district total. The chapter palette should feel personal while preserving text contrast. Deletion and permission changes must update the current total honestly, without guilt messages. These are proposed interaction requirements, not an implemented animation or verified psychological effect.

Applied `design-fusion` through `/Users/blueock/.codex/plugins/cache/openai-curated-remote/figma/2.0.21/skills/figma-use/SKILL.md` and the `mcp__codex_apps__figma_use_figma` tool. Existing typography, bound styles and auto layout were preserved. Additional layout-generation, brand-library and image-generation skills were unnecessary for this three-node copy refinement. No production UI approval is inferred.

## 6 September: clickable review verified

The four revised screens now have a named Figma flow, `Automatic atlas · Sample review`, starting at 35:23. This supersedes the earlier static-screen navigation status. Nine click reactions were saved and read back: 35:45 → 35:48; 35:86 and 35:96 → 35:100; 35:98 → 37:24; 35:124 → 35:48; 35:128 → 37:24; 37:70 → 35:48; 37:72 and 37:56 → 35:100. Existing legacy flow preserved. Annotation 35:130 explicitly identifies sample content and states that the prototype neither requests permission nor scans photos.

Real in-app browser verification traversed Connect → Atlas → Districts/Collection → latest discovery/Sheung Wan chapter → Atlas. Each destination was confirmed by the prototype URL and accessibility tree. Restart returned to Connect. Collection and chapter pixels were inspected; the 900-pixel frame requires scrolling in the 720-pixel preview viewport. The remaining alternate links were checked by Figma reaction readback only, not individually clicked. The Tsim Sha Tsui sample row has no linked chapter.

[Open the sample review](https://www.figma.com/proto/whw3t850Pcj9LrSiBa8rwn/Hong-Kong-Footprints?node-id=35-23&starting-point-node-id=35%3A23). The prototype was left open at its starting screen in the side panel. District totals, scan progress and colours remain illustrative. This verifies navigation, not native library access, reward animation, psychological impact or production readiness. Brand, platform amendment and production design review remain pending.

## 6 September: personal colours make district progress visible

The atlas previously rendered every district with the same pale fill. Three sample districts now use the existing illustrative chapter colours consistently across the map, photo markers and the first three collection progress cells:

| District | Map vector | Marker | Progress cell | Sample colour source |
| --- | --- | --- | --- | --- |
| Central & Western | 35:62 | 35:80 | 37:38 | 37:60, clay |
| Yau Tsim Mong | 35:66 | 35:81 | 37:39 | 37:61, sand |
| Islands | 35:79 | 35:82 | 37:40 | 37:62, sage |

District identification follows the source GeoJSON feature order and was cross-checked against normalized geographic bounds of these three shapes. Geometry and coordinates were unchanged. These are illustrative design colours copied from the existing palette, not newly extracted user-photo colours or measurements of geographic accuracy. Markers use the existing bound ink colour for a contrasting outline. The map caption explicitly says the administrative extents include sea and that colour indicates photo presence, not an entire area explored.

The collection retains 18 cells and a visible “3 of 18 districts” count. It now shows “12 photo locations · Sample collection” and names all three discovered districts under “Your first three districts.” This makes the milestone interpretable without colour alone. Existing chapter content and prototype destinations remain intact. Modified nodes: 35:62, 35:66, 35:79–83, 37:36, 37:38–40, 37:66–67.

Verification: fresh Figma renders of both 390×900 frames were visually inspected. Content ends at y=876 in both; the expanded map caption fits and navigation does not overlap. Plugin readback verified matching RGB values, 18 progress cells, count text, layout bounds, and Atlas → Collection, Collection → Atlas, and latest discovery → chapter reactions. A new Computer Use navigation pass could not run because the Mac was locked; the earlier click verification remains historical. No interaction logic changed in this revision. Current exports: [atlas](figma/atlas-personal-colours.png) and [collection](figma/collection-personal-colours.png). The reward experience remains a design proposal; actual motivation, automatic-library permission, native scanning and production readiness were not established by these checks.
## 6 September: place chapter carries the discovery colour

Chapter 35:100 now carries the same illustrative clay fill as Central & Western in the atlas and collection. Its existing district geometry is unchanged. The heading explicitly identifies a suggested place; the record distinguishes a suggested Sheung Wan label from preserved photo coordinates. The unimplemented automatic-library claim was replaced with “Sample collection · Photo GPS”. These design labels do not establish GPS accuracy or native library access.

The chapter says “Every return adds another layer to this place” and “This place is becoming yours.” The intent is to reward enrichment of a familiar place without increasing the unique-district total. This is a proposed experience, not a measured motivational outcome.

Changed nodes: 35:108, 35:110, 35:113, 35:118–121. Fresh 390×900 Figma render personally inspected: no clipping or overlapping text, navigation remains at y=812–876. Readback preserved chapter → Atlas and chapter → Districts destinations. No interaction changed and no new click pass was performed. Current export: [place chapter](figma/chapter-personal-colour.png). Production design and platform amendment remain pending user review.
