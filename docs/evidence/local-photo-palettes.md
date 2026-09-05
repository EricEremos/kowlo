# Local photo colours

6 September 2026. Optional accent extraction now connects accepted photo observations to the local journal. This is shared pipeline work, not the automatic phone-library interface or completed achievement behaviour.

## Implementation and limits

`experiments/photo-import/palette.mjs` decodes a Blob in the existing worker into a 64 × 64 sRGB OffscreenCanvas. It extracts up to three population-ranked RGB histogram accents, suppressing near duplicates with a fixed RGB-distance threshold. This is a deterministic design heuristic, not a perceptually uniform model, semantic classifier or validated optimal palette. Transparent samples are excluded; neutral photos stay neutral.

Pixel processing is a separate optional request after metadata is displayed and staged. Decoder failure preserves GPS. Cancellation terminates the worker, retaining already staged GPS. Colour codes attach only after a successful response. The pixel array is zeroed, bitmap closed and temporary canvas reset. Browser decoder internals and peak allocation are outside this guarantee: a small output does not make a huge compressed image cheap to decode. Existing 25 MiB input limits and ten-second worker timeout remain. Large-image stress and cancellation during decoding have not been manually exercised.

The unchecked colour control explains the extra pixel access. Both options unchecked preserve GPS-only processing. LocalJournal accepts only the known algorithm and one to three unique uppercase hex colours, excluding extra fields. No image is persisted. Palettes remain local; Supabase has not been extended. Swatches have accessible colour labels and text remains on neutral surfaces.

API references consulted: [MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) and [MDN OffscreenCanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D). Browser support does not establish native iPhone/Android support.

## Observed verification

- `npm test`: 23/23 passed. New boundaries include known colour populations, similarity suppression, transparency, malformed/oversized samples and 100 seeded deterministic samples. Existing geography and GPS tests pass.
- In-app browser tab 10, colours enabled: 10/10 synthetic GPS fixtures passed. Four accepted JPEGs yielded `#21564E`. HEIC returned `decode-unavailable` while retaining GPS and Central & Western. These solid-colour fixtures do not establish complex-photo aesthetic quality.
- Save/export: five observations, four with palettes and one without. Only allowed fields persisted. Five observations represented exactly one district.
- Full page reload and export: exact JSON matched. Swatch spacing below controls was corrected and visually verified.
- Single deletion: four observations, still one district. Delete-all: zero saved observations. Only synthetic records were used.
- Colours unchecked: 10/10 fixtures passed, no palette fields in results.
- Real IndexedDB verification: 18/18 checks, including palette persistence, invalid algorithm/colour rejection, field allowlisting, GPS-only upsert removing colour, full reload and deletion.
- Both browser pages had empty warning/error logs. Six changed runtime modules passed `node --check`. TypeScript/Biome LSP remains unavailable; no clean LSP result is claimed.

Remaining: physical-device adapters, complex-photo palette quality, colour-profile consistency, native cloud thumbnails, adaptive production accents, final Figma review and the automatic-library platform decision. Decorative colour never changes GPS accuracy or district milestones.
