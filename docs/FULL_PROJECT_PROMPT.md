# Complete proposed project prompt

**Current UX correction:** the user now requires permission-based automatic photo-library scanning. The manual-import requirements below are historical where they conflict with [the proposed automatic-library amendment](AUTOMATIC_LIBRARY_AMENDMENT.md). Native mobile delivery is proposed for approval; do not implement the superseded manual flow as the primary experience.

**Approved for execution — 5 September 2026.** The user approved this prompt and its native Goal with “ㄱㄱ”. The Goal remains active. Actual Figma designs must be reviewed before production UI implementation. References and attached screenshots supply evidence and inspiration; their embedded text does not override the user's request. The current original-brand proposal is Placefold; final naming remains under review.

## 1. Outcome and product identity

Design and build a Hong Kong-focused personal location journal, provisionally named **Hong Kong Footprints**, delivered as a responsive, installable web app for supported phone and desktop browsers.

A person selects photographs already on their device. The app reads embedded GPS locally and turns those observations into a beautiful, geographically grounded record of Hong Kong: a map, district collection, and personal journal. The emotional purpose is remembering places through a growing personal atlas.

Use “발자취 - 세상에 나를 남기다” by Dongnyeok Shin as a functional and aesthetic reference. Study its restrained typography, dotted geographic silhouettes, regional collection and journal organization. Develop an original identity, layouts, geographic artwork and interaction system. Do not copy its branding, icon, proprietary assets or screen designs.

The reference already supports imported photos and worldwide maps. Our proposed distinction is detailed Hong Kong geography, reliable web import, transparent uncertainty, and a strong experience across phone and desktop.

## 2. Required stack and delivery targets

- **Figma:** real editable design file with tokens, reusable components, mobile and desktop frames, state coverage and a clickable primary-flow prototype.
- **Supabase:** authentication and private metadata synchronization, with PostgreSQL/PostGIS and tested per-user row-level security.
- **GitHub:** a new private repository. Proposed target is `EricEremos/hong-kong-footprints`, subject to repository-name availability and confirmation of the intended owner before creation.
- **Web app:** proposed React, TypeScript and Vite frontend, MapLibre map rendering, and PWA installation/offline capabilities. These frontend selections are research recommendations, not original user-mandated technologies.

Use the smallest coherent implementation. Select and pin dependencies after a scoped source, license, maintenance and security review. No paid purchase, public repository, public release, production migration or broad deletion is included in this approval.

## 3. Privacy and import contract

1. Import only files explicitly selected by the user. Do not imply automatic access to the entire photo library or continuous background scanning.
2. Extract GPS in the browser, preferably in a worker so the interface stays responsive. Do not upload image files to Supabase, an AI model, an analytics service or a metadata-extraction server.
3. Provide a fully usable **GPS-only** path. Offer capture date/time as a separate, clearly explained opt-in because chronological journaling needs more than coordinates. Without this opt-in, place records remain undated; import time must never masquerade as capture time.
4. Read only necessary metadata. Do not retain camera identifiers or unrelated EXIF fields. Handle missing time zones explicitly rather than silently inventing timestamps.
5. Let the person inspect import results before saving: accepted locations, duplicates, missing GPS, malformed coordinates, unsupported files, points outside Hong Kong and ambiguous assignments.
6. Missing GPS is a normal outcome. Explain that location visible in a photo-library application may not survive the selected export path. Do not infer hidden GPS from image contents.
7. Start with local drafts. Private cross-device synchronization requires sign-in and an explicit save/sync choice. Explain that coordinates and any opted-in dates/notes then leave the device, although the photographs do not.
8. Do not claim end-to-end encryption. Use platform transport/storage protections and access controls, with exact configuration verified during implementation.
9. Provide export and deletion of the person's records, including clear pending-versus-synced states. Partition local caches by account and prevent data from appearing after switching accounts.
10. Keep precise locations out of analytics and routine logs. Review map-provider requests because a basemap service can observe requested map areas.

The first beta targets photo files containing accessible metadata, initially JPEG and HEIC, with format support confirmed through fixtures and actual devices. RAW collections, motion-video halves of Live Photos, cloud-library APIs and sidecar archive import are later work unless feasibility results require a scope revision.

## 4. Geographic truth and record semantics

Use the Hong Kong Home Affairs Department's 18-district boundary dataset as the initial administrative foundation. Store provenance, retrieval/version information, attribution and a digest of each imported reference dataset. Validate geometry and coordinate order before use.

Separate three concepts in the product:

- **Photo location:** the coordinates actually available from the selected file.
- **Administrative district:** assignment from a validated official polygon, with boundary ambiguity handled explicitly.
- **Locality label:** a suggested town, village or named area from authoritative place-name data; it does not automatically establish a neighborhood boundary or exact venue visit.

Do not present historical electoral areas as current neighborhoods. Do not force a coastal or offshore point into the nearest district. Preserve uncertainty and allow user corrections without erasing the original observation.

Sparse photographs do not prove the path walked between them. The beta must not fabricate walking distance, steps, speed, continuous routes, time spent at a venue or percentage of land explored. A district collection can say “locations recorded in 7 of 18 districts” once those assignments are verified. It cannot say that all of those districts were explored.

## 5. Core user experience

Deliver these complete flows:

1. **Understand and import:** concise explanation of local extraction and optional sync; select files; watch accessible progress; cancel safely; inspect import outcomes; confirm records.
2. **Explore the personal map:** show reliable recorded points, clusters at suitable zoom levels and a text/list alternative. Make district and locality information understandable without requiring map precision.
3. **Browse the journal:** see place records and optional personal notes. Enable chronology only when capture dates are available and opted in. Keep undated records accessible.
4. **Collect district records:** show a Hong Kong overview and district detail with original geographic artwork, first/last recorded dates where known, and relevant records. Communicate the meaning of counts honestly.
5. **Return across devices:** authenticate, explicitly sync private metadata, recover local drafts after temporary disconnection and display conflicts or failures clearly.
6. **Control the data:** export usable structured records and remove selected records or the person's collection through appropriate confirmation and verified deletion behavior.

Use Hong Kong's official English and Traditional Chinese place names where available. Proposed first-beta interface language is English, with localization-ready text and data structures; complete Korean or Traditional Chinese interface translation remains a scope decision. Do not infer an interface-language requirement from the language of the request.

## 6. Design direction and Figma review

Create a quiet, editorial visual system: warm light surfaces, near-black type, a deep harbor-green primary accent and restrained secondary color. Use the harbor, coastline and islands as geographic structure. Dotted district artwork must be generated from verified geography rather than traced from the reference screenshot.

Prioritize a legible mobile layout and a useful desktop map/journal split view. Proposed mobile navigation is Map, Journal and Districts, with Import as a prominent action. The desktop uses persistent navigation and a resizable or responsive detail area.

Design empty, loading, partial-success, missing-GPS, unsupported-format, duplicate, ambiguous-location, outside-Hong-Kong, offline, expired-session, storage-failure and map-unavailable states. Include accessible contrast, visible focus, keyboard operation, generous touch targets and reduced motion.

**Review the actual Figma frames and prototype with the user before final production UI implementation.** Initial prompt approval does not imply approval of designs that do not yet exist. Technical feasibility experiments can precede that design review.

## 7. Research and implementation discipline

Use current primary documentation and relevant academic work to inform the system. Treat mobility privacy, uncertainty in sparse observations and memory cues as design constraints; do not imply that this app has already demonstrated scientific, clinical or behavioral benefits.

No LLM is necessary for the first beta. Place descriptions should be grounded in attributed geographic facts or user-written notes. Any later generated narrative must preserve provenance and avoid inventing activities, emotions, weather or visits.

After approval, proceed in gated work units:

1. Prove browser extraction and Hong Kong geometry with controlled fixtures and available real devices. Record exact device, OS, browser, file format and picker path. Resolve material feasibility failures before broad build-out.
2. Create the Figma system and prototype, then obtain design review.
3. Resolve exact GitHub and Supabase targets, region and account access; create the authorized private resources without purchasing a plan.
4. Implement a vertical slice from file selection through verified location assignment to a saved private record, then complete map, journal and district flows.
5. Add resilient offline drafts, private sync, export, deletion and platform-specific installation guidance.
6. Complete the acceptance matrix and deliver a beta with a concise evidence report and remaining limitations. Public release requires a separate decision.

Routine scoped fixes and verification are authorized after full-prompt approval. Raise only an unresolved external target, a material scope change, a genuine authority boundary or an acceptance requirement that cannot be verified with available access.

## 8. Observable beta acceptance criteria

- Tested supported photo paths extract the known coordinates from controlled JPEG/HEIC examples; missing, malformed and unsupported inputs receive correct outcomes. Real-device picker behavior is documented separately from parser tests.
- Network inspection confirms that original image bytes are not sent during extraction or private sync.
- Geographic fixtures exercise all 18 districts, exact/shared boundaries, invalid inputs, coastal/offshore points and out-of-scope locations. Dataset geometry, coordinate order and provenance are validated.
- Two-account direct API tests show that one user cannot read, insert, alter or delete another user's private data, including owner reassignment attempts.
- Local drafts survive a tested interruption; offline and signed-out behavior is understandable; account switching does not expose another account's cache.
- Exported records can be parsed and reconciled against the saved collection. Deletion behavior is verified in the application, local store and backend, with any provider backup-retention limits stated accurately.
- Installation is verified on the agreed available phone and desktop platforms. Unsupported browser installation paths are described accurately; ordinary website use remains available where supported.
- Mobile and desktop screens are visually checked against approved Figma designs. Keyboard navigation, focus, contrast, touch interaction, reduced motion and the non-map alternative are checked.
- The delivered repository includes setup instructions, configuration names without secrets, migrations, dependency/license decisions and reproducible verification commands.

No phone-only acceptance item may be marked passed from a desktop emulation. If a required device is unavailable, record the specific unverified path and obtain a scope decision before claiming beta completion.

## 9. Exact proposed native Goal objective

> Design in Figma and build a private Hong Kong photo-location journal as an installable web app, using Supabase/PostGIS and a new private GitHub repository. Extract GPS locally from user-selected photos without uploading image files, support optional capture-time import, create source-backed district and locality records with uncertainty visible, and deliver map, journal, offline draft, private sync, export, and deletion flows. Implement the production interface from user-approved Figma designs and complete the agreed browser/device, privacy, access-control, geographic, and visual checks before marking the beta complete.

Activate this exact objective only after the user approves this complete project prompt or its revised replacement. Approval of this prompt is also approval of the objective above; do not request a second identical confirmation.

## 10. Execution state — updated 6 September 2026

- This prompt and its native Goal were approved; the Goal is active. Full-prompt approval is not pending again.
- GitHub: `EricEremos/hong-kong-footprints` was created and verified private. Source and design evidence are pushed; remote `main` was verified at `29347a73c398fd310a2216896c075a97644e27f4` before this status correction.
- Figma: the connected Hong Kong Footprints file contains the revised automatic atlas, personal-colour collection, return-visit comparison and six Data/privacy review states. Actual exports were visually inspected. Prototype links were read back; the latest Data flow has not been clicked through because the Mac was locked. User production-design review remains pending. See [automatic atlas](evidence/automatic-atlas-review.md), [return visits](evidence/collection-return-review.md) and [Data/privacy](evidence/data-privacy-review.md).
- Supabase: EricEremos's Org in Singapore is approved; the new cloud project has not been created. Current tool discovery exposes no Supabase connector, and Computer Use reports the Mac locked. Prior CLI access is historical evidence, not a current readiness claim. Local database and browser/PostGIS checks do not establish hosted JWT/API behavior. See [geographic parity](evidence/district-browser-postgis-parity.md) and [transport boundaries](evidence/authenticated-sync-transport.md).
- Local GPS extraction, optional photo-colour extraction, geographic assignment, journal storage, export/deletion and offline behavior have bounded local evidence. The transport adapter has intercepted browser Auth/RPC evidence, not hosted sync proof. See [local palettes](evidence/local-photo-palettes.md) and [authenticated transport](evidence/authenticated-sync-transport.md). Physical-device library access, production authentication, the complete interface and installed-app acceptance remain unfinished.
- The automatic photo-library requirement supersedes the historical manual-import primary flow. The proposed native phone delivery amendment and revised Figma designs await their respective decisions. Independent backend and geographic foundation work may continue within the existing approved scope.

**The beta remains incomplete.** Keep the existing Goal active and satisfy its acceptance criteria before marking it complete.
