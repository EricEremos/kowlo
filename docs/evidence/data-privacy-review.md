# Data and privacy design review

Date: 2026-09-06. Status: Figma review artifact; production approval pending.

The Data screens extend the personal atlas with understandable storage, export and removal controls. They use the proposed Placefold identity. They do not change the primary experience of existing photos filling an atlas, or approve the native photo-library platform amendment.

## Review surfaces

Figma file: [Hong Kong Footprints](https://www.figma.com/design/whw3t850Pcj9LrSiBa8rwn/Hong-Kong-Footprints?node-id=66-61), page `15:18`.

| Frame | State | Render |
| --- | --- | --- |
| `66:61` | On this device: 12 saved locations, private sync off | [Local](figma/data-local.png) |
| `67:26` | JSON and GeoJSON export choices, precise coordinates disclosed | [Export](figma/data-export.png) |
| `67:44` | Remove one local observation, retaining notes and original photo | [Remove](figma/data-remove.png) |
| `67:62` | Offline: 3 saved changes waiting for private sync | [Offline](figma/data-offline.png) |
| `67:80` | Expired session: local changes retained, same-account recovery | [Session](figma/data-session-expired.png) |
| `67:98` | Storage full: earlier records saved, latest edit unsaved | [Storage](figma/data-storage-full.png) |

All counts and records are explicitly sample content. Offline, session and storage states are separate comparison frames, not a simulated successful authentication or save sequence.

## Design and behavior contracts

- Warm paper, harbour green and pale sage reuse existing colour variables. Newsreader headings and DM Sans body text reuse existing text styles.
- Each frame is editable vertical Auto Layout, 390 × 900, with spacing and padding variable bindings. All 13 buttons remain instances of component `14:2`.
- Export represents the saved local snapshot. Unsaved edits and original image files are excluded. Precise coordinates can be present in either format.
- Removing a local observation removes its stored location and colours, preserves authored notes, and leaves the original photo untouched. This is not a full cloud-account erasure promise or a native-library rescan exclusion specification.
- Offline and expired-session copy distinguishes locally retained work from successful remote delivery. Another account must not receive the previous account's changes.
- Storage-full copy explicitly distinguishes the unsaved edit from previously saved records and does not claim that an export recovers the unsaved edit.

These contracts follow `docs/ARCHITECTURE_AND_DESIGN.md` and `docs/SYNC_PROTOCOL.md`. Real production authentication, quota recovery UI and hosted account deletion remain separate implementation and verification work.

## Verification

The six final PNG exports were personally inspected at 390 × 900. Initial button labels wrapped because cloned text retained a fixed 101 px width. This was repaired on the new instances: labels now fill the 294 px available width, are centred, and measure 20 px high inside 52 px buttons. Final renders show no clipped labels or overlapping content. Maximum direct-child bottom is 660 px, inside the 900 px frame.

Figma API readback confirmed all six frames, spacing/padding/background variable bindings, shared text styles, and preserved button component references. The new `Private Data · Sample review` start frame is `66:61`.

Four navigation reactions were written and read back:

1. `66:94` Export journal → `67:26`.
2. `66:96` Review a sample memory → `67:44`.
3. `67:58` Keep this memory → `66:61`.
4. `69:42` Back to Data → `66:61`.

The original atlas flow's nine navigation reactions and its existing starting points remain present. Download, removal, sign-in, retry and isolated-state actions are intentionally unwired design specifications; these frames cannot prove real data operations.

Live GUI navigation was not verified in this work unit: Computer Use reported the Mac locked and automatic unlock unavailable. Static visual verification used actual Figma exports, with prototype links checked through API readback. Desktop responsiveness, keyboard/screen-reader behavior and physical-phone behavior require later production checks.
