# KOWLO web companion design proposal

7 September 2026. Editable Figma proposal, visually inspected and exercised in the in-app browser. This is a design review artifact, not evidence of an implemented import flow or automatic phone-library access.

## Scope and design

The secondary web import sits under You. It supplements the primary automatic phone-library intent in [the library amendment](../AUTOMATIC_LIBRARY_AMENDMENT.md). A native delivery decision, production design review and device verification remain outstanding.

The proposal reuses KOWLO's Memory print colour variables, editorial type styles, settings-row component 93:9 and primary-action component 79:9. Paper #F6F4EF, ink #263B3E and muted #566969 carry the hierarchy. Newsreader 40 px titles, DM Sans 16 px body text, 14 px descriptions and 12 px supporting labels retain the established atlas language. Settings use open rows and fine dividers. Main actions are 52 px high; preference status targets are 44 px high. Existing screens were preserved.

## Review targets

File: [Hong Kong Footprints / KOWLO](https://www.figma.com/design/whw3t850Pcj9LrSiBa8rwn/Hong-Kong-Footprints?node-id=192-206), page 76:2.

| Frame | Node | Scope |
| --- | --- | --- |
| You | 192:206 | Local atlas status and companion controls, 390 × 844 |
| Web import | 193:214 | GPS by default; colours and dates independently optional, 390 × 844 |
| Import result | 194:215 | Illustrative completion and skipped-photo explanation, 390 × 844 |
| Colours on / dates off | 195:216 | Preference state |
| Colours off / dates on | 195:240 | Preference state |
| Colours on / dates on | 195:264 | Preference state |
| Narrow import | 195:288 | Static 320 × 844 layout proof |

[Open the scoped prototype](https://www.figma.com/proto/whw3t850Pcj9LrSiBa8rwn/Hong-Kong-Footprints?node-id=192-206&page-id=76%3A2&starting-point-node-id=192%3A206&scaling=scale-down&content-scaling=fixed).

## Verification performed

- Inspected Figma screenshots of You, base import, both preferences on, the result and the 320 px layout. Text wraps within the intended widths; the screenshots show no clipping or overlap. Corrected a paint fallback issue so variable-bound text renders in the intended teal rather than black.
- Read back all 22 newly assigned prototype links. All four preference combinations have independent toggle transitions, back navigation and a result destination. None of the seven new top-level frames has an immediate child outside its bounds. This geometry check is limited to immediate children; screenshots provide the separate visual check.
- In the actual Figma browser prototype, clicked You → web import → colours on → dates on → colours off. The visible state retained dates on while colours became off. Clicked Choose photos → illustrative result → See your atlas, and observed the existing atlas frame 182:202.
- No application code changed and no code tests were rerun for this design-only unit. No personal photographs were accessed or uploaded.

## Prototype limitations and review boundary

The result's 28 checked / 24 added / 3 without GPS / 1 unreadable counts are synthetic. Choose photos navigates to that illustration; it does not open a real picker or save records. Preference states are frame navigation and do not establish persistence across returns. The two You entry rows currently share the same import/preferences destination. Export and Manage atlas data are presentation rows in this proposal, and the narrow proof has no links. Existing atlas navigation and the page's existing Restart flow were not redesigned; Restart can land on the existing atlas rather than this proposal. The direct prototype link opens the scoped You screen.

This proposal does not establish keyboard or screen-reader compliance of production controls. Implementation must use semantic controls with explicit state, focus handling and accessible names. The automatic library flow, large-library progress/cancellation/reconciliation, live hosted sync and final production integration remain separate unfinished work. Supabase's current account blocker is recorded in [hosted sync readiness](hosted-sync-readiness.md).

Production implementation of this design awaits the user's review, as requested for the project. The native Goal remains active.
