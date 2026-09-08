# Approved floating navigation implementation

Date: 2026-09-07. User approved the screenshot of the Atlas / Chapters / You navigation and requested proceeding. This unit implements that component in the working web app; the broader native-library and hosted-sync decisions remain separate.

## Implementation

- Source: Figma component `215:235`, review Atlas `213:220`; see [design evidence](essential-ui-navigation-review.md).
- Existing semantic navigation links and `aria-current` route logic retained, including Chapters selection for district and memory routes.
- 342 × 64 maximum surface, 24px minimum side margins, 8px inset, equal 48px targets, 32px outer radius, 24px selected radius. DM Sans Medium 14; solid #263B3E active pill and #F6F4EF text.
- 90% paper surface with 20px background blur and a 12% ink inset border. Opaque paper is the base fallback; reduced transparency disables blur. Forced-colour selection and keyboard focus have explicit outlines.
- Fixed bottom placement includes the device safe-area inset. Document bottom space and scroll padding allow the last content to clear the bar. No dragging or automatic hiding.
- Static offline cache release advanced from v2 to v3 so existing installations can acquire changed HTML/CSS using the existing wait-until-tabs-close update lifecycle.

## Verification

`scripts/atlas-browser-checks.mjs`: PASS, eight scenarios. Existing journal/navigation/data tests pass. Added viewport checks at 320, 390, 768 and 1440px across five routes: no horizontal overflow, bar within margins, 48px targets, one selected destination, and bottom content clear at the end of scrolling. Real keyboard Tab/Enter activates Chapters; pointer clicks activate You and Atlas. Focus outline present. No page errors or external requests.

`scripts/atlas-offline-checks.mjs`: PASS, six scenarios, including update waiting, saved drafts, cache retirement, offline reload/edit/export/deletion and static-cache exclusions. The next-version test now simulates v3 → v4.

Visually inspected the resulting mobile and desktop renders. Screenshots and machine-readable output are in [atlas evidence](atlas/), including `atlas-mobile.png`, `atlas-desktop.png`, `navigation-keyboard.png`, and `chromium-checks.json`. All seeded memories are synthetic and exist only in isolated test browser contexts.

`git diff --check` and service-worker JavaScript syntax check: PASS. LSP diagnostics unavailable because the configured servers/runtime are missing; no installation performed.

## Limits

Verified in local Chromium. Physical iPhone/Android safe areas, Safari, virtual-keyboard behavior and assistive-technology use remain unverified. Reduced-transparency and forced-colour styles are implemented but not separately certified. This is a navigation implementation, not a claim that the full Figma redesign, automatic photo-library access or hosted sync has shipped. No deployment or push in this unit.
