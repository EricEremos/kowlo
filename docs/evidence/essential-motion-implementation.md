# Restoration, essential copy and motion

Date: 2026-09-08. Scope: KOWLO working web app and existing Figma review frames. Dedicated GitHub remote: `EricEremos/kowlo`.

## Restoration

Restored 132 missing tracked files from the existing HEAD, `4fd6efb`, without replacing modified files. Before/after hashes of the pre-existing modified files matched; no tracked deletions remained. This verifies restoration, not why the files had disappeared. Unrelated timestamp-suffixed Markdown copies were preserved and excluded from this change.

## Changes

- Integrated the previously approved floating Atlas / Chapters / You navigation.
- Removed repeated slogans, map instructions, diagnostic navigation and the development footer. Kept relevant empty states and failure messages.
- Moved geographic evidence into closed-by-default Location details; moved storage and atlas explanations into disclosures on You. Export consequences remain next to export.
- Added the cancellable motion contract in [Motion foundation](../MOTION_FOUNDATION.md): shared selection pill, short title transition, changed-mark reveal and restrained press/hover feedback.
- Advanced static cache to v4. Existing update waiting and draft preservation remain in place.
- Updated Figma Atlas `213:220`, Chapters `216:245` and You `213:243`. Component set `236:270` has three selected-destination variants; instances and reusable component reactions point to the current three frames with 220 ms Smart Animate. Removed the Chapters subtitle and corrected storage copy on You.

## Verification

- `node --check app/atlas.mjs`: passed.
- `npm test`: 46/46 unit tests passed.
- `scripts/atlas-browser-checks.mjs`: nine groups passed, including five route types at 320/390/768/1440 px, 48 px navigation targets, content clearance, keyboard activation, persistent notes, deletion/export and integrity failure handling. Rapid tab changes settle on the correct selection. Switching reduced motion on cancels effects and disables the pill transition. No page errors or external requests.
- `scripts/atlas-offline-checks.mjs`: six groups passed. Server-stopped offline reload, edits, deletion and export work. Waiting updates preserve drafts; obsolete-cache cleanup is scoped. Only 18 static resources are cached.
- Manually used the live app in the Codex in-app browser at port 8788: Atlas → Chapters → You, opened Photo access & storage, then returned to Atlas. Observed the expected destination headings, selected pills and expanded copy. Browser error log was empty.
- Visually inspected updated desktop/mobile app renders and Figma Chapters/You renders. No overlap or clipping was observed in those checked surfaces. The map remains the visual focus; section rules replace additional containers.

Machine-readable results and synthetic screenshots: [Chromium](atlas/chromium-checks.json), [offline](atlas/offline-checks.json), [mobile atlas](atlas/atlas-mobile.png), [desktop atlas](atlas/atlas-desktop.png). Test records were synthetic in isolated browser contexts; no personal photo library was accessed.

The prior [navigation implementation record](floating-navigation-implementation.md) describes its earlier v3 stage. This record supersedes its cache/version and current test counts.

## Limits

Configured LSP servers could not initialize because the local TypeScript/Biome tooling was unavailable. No dependency was installed solely for that hook; syntax and executable checks above provide the recorded code verification. Safari, physical phone safe areas, screen-reader use and large-library frame-time performance have not been verified in this unit.

Figma remains a design prototype with illustrative records and some proposed actions. The working app reads the local journal; automatic phone-library access, hosted accounts and cloud sync are still in development. This change does not claim the complete beta or those capabilities are finished.
