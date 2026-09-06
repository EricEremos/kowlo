# Placefold: artistic memory atlas

Current naming update: [KOWLO](KOWLO_IDENTITY.md) is the selected identity. This document and its earlier screen exports preserve the design's development under previous working names.

## Current direction: memory print, 6 September 2026

The user requested an artistic interpretation of geographic accumulation, rather than simple photograph markers. The current direction supersedes the photographic-pin composition below: Hong Kong becomes a field of small folded marks, with restrained colour clusters and open editorial typography. The Footprints reference informs the accumulating city; the folded texture, photographic place chapters and proposed Placefold identity develop a distinct expression. This is a design hypothesis awaiting user review, not proven superiority or a cleared brand name.

Editable Figma outputs on page `76:2`: Atlas 390 `116:112`, Harbour chapter 390 `116:113`, Collection 390 `116:114`, Atlas 1440 `116:115`, and direction/foundation board `130:91`. The reusable artwork master `114:63` contains six editable vector paths representing 3,658 folded marks. Semantic variables use collection `115:63`; text styles are scoped under `Memory print/`. Older screens remain available.

Geography comes from Natural Earth overview land clipped against local Hong Kong district geometry. The generator, SVGs and provenance are in `docs/design-assets/memory-print*` and `generate-memory-print.py`. This is an overview composition, not venue-level evidence, and the chosen extent is not audited for every remote extremity. Coloured clusters, totals and the current palette are illustrative. They are not verified GPS observations, photo-derived colours or proof of territorial coverage. Production must derive mark membership from located photographs, preserve exact source coordinates separately, and distinguish inferred place names. No interpolated travel route is claimed. Revisits should enrich a chapter without falsely increasing district coverage.

Palette: warm paper `#F6F4EF`, ink `#263B3E`, secondary `#566969`, fine separators `#D4D9D0`; decorative terracotta, slate, lavender, ochre and forest marks. Actual computed text contrast is 10.75:1 for ink/paper and 5.28:1 for secondary/paper. Optional local photo analysis may supply decorative colours in production; essential text uses stable semantic colours. Existing consent preferences remain separate.

Typography: Newsreader Regular 40/42 mobile and 60/62 desktop for editorial headings; 26/30 section headings. Space Grotesk Medium 22/28 brand and 36/42 numbers. DM Sans 16/24 body, 14/20 labels and 12/16 metadata. This changes the earlier serif rejection because the current composition frames an artwork, rather than dense photograph pins. Shared alignment, 24 px mobile gutters, whitespace and fine rules replace decorative cards. Interactive navigation frames are 48 px high; structural Auto Layout frames remain where useful.

Verification: all four final screens and the foundation board were exported and visually inspected. The four screen roots have no direct-child overflow; 57 text nodes and 14 saved navigation links were audited. Main text contrast was computed. Core mobile navigation is exercised in the browser prototype with `scaling=scale-down&hide-ui=1`, avoiding Figma preview chrome overlapping the bottom controls. Exact live coverage is recorded in `uiux-run.json`. An emoji-rendered arrow was replaced with a plain arrow. Screenshots: `docs/evidence/figma/memory-print-{atlas,chapter,collection,desktop,foundation}.png`.

Responsive extension: Atlas 320 `138:91`, Atlas 768 `138:121`, and Harbour chapter 1440 `139:105` now use the same editable artwork and text styles. Compact mobile retains 24 px gutters; tablet uses 40 px gutters, a larger central print and an open split summary; desktop detail pairs an enlarged harbour print with a photograph and palette. Corrected instance scaling with proportional rescaling so the complete overview fits its viewport. No decorative cards were added. All three renders were inspected; zero visible direct-child overflow and 41 text nodes counted. Screenshots: `memory-print-compact.png`, `memory-print-tablet.png`, `memory-print-desktop-chapter.png`. The desktop atlas CTA → desktop harbour → Your atlas return was exercised in the real Figma browser prototype. Three navigation reactions were updated.

Responsive core destinations: Harbour 320 `145:112`, Harbour 768 `145:137`, Collection 320 `145:162`, Collection 768 `145:194`, and Collection 1440 `145:226` complete the atlas/chapter/collection composition at all four widths. Twenty-two navigation reactions now connect matching widths. The compact heading and photo-count label were shortened after renders exposed wrapping defects. Five final PNGs were exported; visual inspection and a structural audit found zero visible direct-child overflow across 71 visible text nodes. Minimum metadata size remains 12 px, with existing body and heading styles preserved. Evidence: `memory-print-{compact-chapter,tablet-chapter,compact-collection,tablet-collection,desktop-collection}.png`.

Live verification for these new destinations is blocked: Computer Use reported that the Mac is locked and automatic unlock failed. Saved Figma destinations were inspected, but new links have not been clicked in the browser. Earlier live tests remain evidence only for their earlier paths.

Limits: collection growth is a static illustrative narrative, not a verified before/after animation. Atlas, harbour and collection compositions cover 320/390/768/1440 px; You/privacy destinations still use earlier mobile drafts. Keyboard/focus, screen-reader behaviour, real photo-library access, integrated accurate location grouping and production performance remain unverified. Production design approval and the native-platform amendment remain pending. No 100/100 score or finished beta is claimed.

## Prior photographic-pin revision (historical)

Status: authorized Figma exploration, 6 September 2026. Production approval remains pending.

## Contract

Help people rediscover their existing photographs through the places they have recorded. Permission leads to an automatically assembled atlas on platforms that support library enumeration. The web limitation and native amendment remain unresolved; these screens do not prove that capability.

The primary loop is atlas → neighbourhood → photographs → a richer atlas after another visit. There is no Add places task. A recorded district means at least one located photograph, not complete territorial exploration. Original GPS stays unchanged. Place-name inference must remain distinguishable from source coordinates. Demo photographs and map markers are illustrative.

## Direction decision

Compare three different structures: A photographic atlas (map first, expandable chapter), B cinematic contact sheet (photos first, location filter), C editorial field journal (chronology first, map as index). Select A because the user's primary reward is seeing places fill themselves. B makes geography secondary; C introduces sequential reading and repeated navigation. This is a design hypothesis, not proven usability superiority.

The chosen interface uses cool chalk #F4F6F5, white #FFFFFF, deep ink #182B32, secondary slate #52666D, harbour water #DCE8EB, land #EDF1E9, border #CBD5D7, and vermilion #B83D2C. User photographs provide the variable palette. Avoid neon stereotypes, unrelated gradients and quantitative-looking palette bars. Extracted colours are decorative swatches with no percentage meaning.

Type: Space Grotesk Medium for brand/display (32/38 mobile, 48/56 desktop); DM Sans Regular/Medium for UI (16/24 body, 14/20 labels, 12/16 metadata); Noto Sans TC Regular for Chinese labels (14/22). Newsreader is retained only in the editorial comparison; it loses for the selected interface because it shifts emphasis toward a travel publication. Manrope is a viable UI alternative but adds no clear benefit over the existing DM Sans system. No main body below 16 px.

Use a 4 px spacing base, 24 px mobile gutters (20 at 320), 32 desktop content padding, 8/12/16/24/32 spacing, 12 px cards, 44 px minimum primary interactive bounds and explicit focus treatment. Map geography uses fixed projected coordinates within a flexible map viewport; related interface content uses Auto Layout. Mobile is map plus bottom chapter preview, intermediate is map and compact side chapter, desktop is persistent navigation plus map and chapter column.

Signature moment: photographs accumulate around their mapped locations, and a revisited chapter gains another visible photograph without falsely increasing district coverage. Reduced motion shows the same final state without movement. Photos require explicit local visual-analysis consent; metadata-only use still offers named records.

## Execution checklist

- P0.a Complete: inspect file, code, available fonts, local styles and libraries. Search returned no photo-map navigation component. Existing Button lacks the revised token/API contract; use scoped new components and preserve existing work.
- P1.a Complete: primitive/semantic variables, type styles, three-direction board and reusable components saved in Figma.
- P2.a Complete: atlas at 320/390/768/1440, chapter and collection growth at 390. Actual licensed photographs use durable Figma image fills.
- P3.a Complete for static design: six final screen renders inspected; no text/instance parent-bound overflow; 17 navigation reactions saved. Contrast: ink/surface 13.53:1, muted/surface 5.56:1, accent/white 5.61:1, muted/water 4.82:1.
- Live prototype click-through previously blocked: Mac locked and automatic unlock failed. Runtime keyboard/screen-reader, real photo-library/GPS, dense marker behaviour and performance remain unverified. The You navigation was subsequently wired in the privacy extension below.

## Delivered state

Revision page 76:2; foundations 76:3; components 76:4. Screens 78:2 through 78:7. Direction board 83:38 and foundation board 83:106. See `uiux-run.json` and `evidence/figma/atlas-r2-*.png` for evidence.

Final adjustments to the initial specification: all mobile widths use 24 px gutters, including 320 px. Tablet uses a wider stacked map and chapter preview. The editorial comparison uses DM Serif Display. Primary and back/navigation targets are 48 px and 44 px respectively. Focus and keyboard behaviour remain production requirements.

The chapter's decorative palette was extracted from `design-assets/harbour.jpg`: #757887, #4A4450, #D5D7DE, #E8E5EA, #A7AEBB. Swatches are not statistical bars. The return state retains 3/18 districts while a chapter grows from 4 to 7 photographs and the total grows from 12 to 15.

## Sources and limits

### Privacy design extension, 6 September 2026

Added four editable 390 × 844 draft screens: You `94:31`, export options `94:51`, local-deletion explanation `94:67`, and offline availability `94:85`. Added reusable settings-row variants `93:15`, bound to the existing semantic colours, spacing and text styles. The safe cancellation action uses ink rather than the destructive accent. The active You navigation uses the accent.

Saved navigation connects existing You targets to the new screen, export and deletion explanations, return paths, and an offline preview. Rendered all four screens and checked text bounds: zero screen overflow. Saved PNG evidence uses `atlas-r2-you`, `atlas-r2-export`, `atlas-r2-delete`, and `atlas-r2-offline`. Prototype reaction inspection is structural evidence; live clicking has not been verified.

These are design states. Preference interactions are now simulated as described below; export generation/success, destructive confirmation/completion, responsive privacy layouts and cloud-wide deletion remain unfinished. The local-deletion preview deliberately performs no deletion. The production interface must include a separate final destructive confirmation. Native permission-flow implementation remains dependent on the pending platform amendment.

### Photo preferences and minimal surfaces, 6 September 2026

Added four preference states: both off `103:45`, colours only `103:63`, dates only `103:109`, and both on `103:155`. Matching You states are `94:31`, `103:81`, `103:127`, and `103:173`. Sixteen saved navigation destinations were verified. Live browser interaction verified enabling both options, returning to the matching You summary, reopening preferences, and switching both off. This is a Figma state simulation, not persistent app settings or OS photo access. Navigation through the separate export/offline drafts may return to the default You state.

Both options default off. GPS-only mapping remains available. Draft retention behaviour: turning an option off hides that detail and stops new analysis; existing derived details remain until device data is cleared. This policy is design copy awaiting implementation, not evidence of runtime privacy behaviour.

User direction: use as few visible container boxes as possible, with a reason for each retained surface. Updated both reusable settings-row variants to transparent, square-edged rows with fine bottom dividers and aligned text. Removed decorative panels from You, preferences, export notices, deletion scope and offline explanations. Unified the chapter story background and removed the collection photograph's decorative rounding. Retained action buttons and geographic photo markers because they communicate interaction or preserve readability over the map.

Design rationale: shared alignment, proximity, type hierarchy and whitespace organize ordinary content. Enclosure is reserved for spatial separation or functional controls. Photo-derived colours remain decorative; semantic text and controls use stable contrast-tested colours. This is an explicit project direction, not a claim of universal usability superiority.

Eight updated PNG exports were visually inspected. Eleven privacy/preference screen trees had zero text outside screen bounds. These checks do not establish screen-reader semantics, focus behaviour or real-device performance. Evidence: `atlas-r2-preferences-off.png`, `atlas-r2-preferences-on.png`, and refreshed You/export/delete/offline/chapter/collection exports.

- M+ design interview: https://www.mplus.org.hk/en/magazine/web-design-is-visual-culture/ supports studying multilingual Hong Kong visual culture, not a claim that this palette is optimal.
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ informs contrast, target size, focus and non-colour cues. A Figma audit does not prove runtime accessibility.
- Natural Earth: https://www.naturalearthdata.com/about/terms-of-use/ permits public-domain map artwork. Overview land geometry is not precision venue evidence.
- Foundation: /Users/blueock/Library/CloudStorage/OneDrive-Personal/Obsidian/LLM_Knowledge_Vault/09_Decisions/Blueock UI and UX Foundation.md.

### Memory-print privacy alignment, 6 September 2026

Updated the four existing 390 px You states (`94:31`, `103:81`, `103:127`, `103:173`) to the memory-print typography and semantic palette. Newsreader supplies the editorial heading; Space Grotesk the brand; DM Sans the controls. Transparent preference rows retain thin dividers. No decorative cards were added. Existing colour/date combinations and their preference destinations are preserved.

Corrected legacy navigation targets that extended beyond the frame. Atlas and Chapters now have visible labels in 114 × 48 px targets and point to the current artistic screens (`116:112`, `116:114`). You is the current destination without a self-navigation reaction. Removed obsolete hidden navigation reactions and gave the offline preview an explicit visible label.

Static checks: 64 visible text nodes across four states, minimum 12 px metadata, expected three font families, no visible text outside screen bounds. Inspected four PNG renders. A variable-paint export inconsistency was corrected by resolving fallback RGB values from the bound tokens while retaining bindings. Evidence: `memory-print-you.png`, `memory-print-you-colours.png`, `memory-print-you-dates.png`, `memory-print-you-options-on.png`.

Saved destinations were inspected. Live clicking remains blocked because Computer Use reports the Mac is locked and automatic unlock failed. These are Figma states; production privacy behaviour, responsive privacy layouts and cloud access remain unverified.

## Success and stop

Deliver an editable Figma revision with identifiable Hong Kong land/harbour geometry, actual illustrative photo fills, explicit type/colour/spacing tokens, coherent responsive hierarchy, and inspected exported renders. Record defects and residual platform/production gates. Do not report 100/100, production readiness, native library access or user approval without evidence.
