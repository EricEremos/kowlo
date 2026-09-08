# Essential UI and floating navigation review

Date: 2026-09-07. Scope: editable Figma review frames; no production interface changes.

The user asked whether the interface contained only necessary elements and proposed translucent bottom navigation. The revision gives each primary destination a distinct purpose while removing repeated messaging. Originals remain available.

## Decisions

| Element | Decision and reason |
| --- | --- |
| Atlas slogans and repeated Hong Kong labels | Remove duplicates so the memory print carries the visual emphasis. |
| Repeated photo/place totals | Keep one district-progress measure on Atlas; show a chapter's photo count beside its entry. |
| Chapters repeating the Atlas map | Replace with an open, ruled district index. This destination now supports browsing. |
| Duplicate import/settings entry | Remove the second entry leading to the same import screen. Existing import preferences remain in that flow. |
| Privacy and data consequences | Keep at the relevant decision point. These cannot be replaced with design comments. |
| Design rationale and implementation details | Keep in component documentation and this evidence record, outside the product's main reading flow. |
| Bottom navigation | One reusable, translucent floating component; three equal destinations with visible labels and a solid selected pill. |

## Review artifacts

Figma file: `whw3t850Pcj9LrSiBa8rwn`, page `76:2`.

- Atlas: `213:220`
- Chapters: `216:245`
- You: `213:243`
- Floating navigation component: `215:235`
- [Review prototype](https://www.figma.com/proto/whw3t850Pcj9LrSiBa8rwn/Hong-Kong-Footprints?node-id=213-220&page-id=76%3A2&starting-point-node-id=213%3A220&scaling=scale-down&content-scaling=fixed)

The 390 × 844 review frames use a 342 × 64 navigation surface at x24/y744. Each tab is approximately 108.67 × 48. Labels use DM Sans Medium 14. Paper #F6F4EF at 90% opacity and an ink #263B3E border at 12% opacity are native RGBA variables; background blur is 20. The active pill uses opaque ink and paper text. No drag, rearrangement or automatic hiding is proposed.

## Verification

- Visually inspected Atlas, Chapters and You screenshots. Corrected inherited label widths, alignment and an obsolete underline.
- A final token readback caught opaque fills inherited from RGB variables. Added alpha-bearing navigation variables and verified the instance reports 0.90 fill / 0.12 border opacity. Re-rendered the final Atlas successfully.
- Real in-app browser prototype clicks passed: Atlas → Chapters → You → Atlas. URL node IDs and rendered destination contents changed accordingly.
- Calculated active text contrast: 10.75:1. Inactive ink against 90% paper composited over black: 8.59:1. These are colour calculations, not a full accessibility certification.
- Three primary screens retain native component instances, editable text and working tab reactions.

## Limits

Counts, district selection and artwork are illustrative. Six district rows are layout examples without detail destinations; Central & Western links to the existing chapter proposal. Existing export/manage rows are static proposals. The existing chapter and import screens were not redesigned in this unit. No production integration, device safe-area behavior, reduced-transparency fallback or responsive-width verification is claimed. The automatic phone-library delivery decision remains separate from this navigation review.
