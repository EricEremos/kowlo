# Photo metadata to local journal integration

6 September 2026. Implemented in `experiments/photo-import/journal-panel.mjs`, with worker-result staging in `diagnostic.mjs` and explicit diagnostic controls in `index.html`. The existing LocalJournal implementation and district classifier are reused unchanged. No cloud resources were modified.

The browser creates a device-scope UUID in localStorage and opens its IndexedDB journal. Accepted results get stable identifiers for the current staged batch. Save writes only coordinates, record identifiers and optional capture time. Each committed item is removed from the pending batch, permitting retry after a partial failure without creating a new identifier for already committed records. A separate import creates new observation identifiers; cross-import photo deduplication is not implemented.

On reopening, district matches are derived again from saved coordinates using the SHA-256-verified government boundaries. Multiple observations in the same district count as one milestone. Unknown, ambiguous and out-of-dataset points add no milestone. District counts describe administrative matches, not area coverage, route reconstruction, GPS accuracy or venue attendance.

Observed through actual clicks in Codex in-app browser tab 9 at `http://127.0.0.1:8787/experiments/photo-import/index.html`:

| Scenario | Observed result |
| --- | --- |
| Run synthetic JPEG/HEIC fixtures with capture time enabled | 10/10 parser checks passed. Local journal still showed zero observations before Save. |
| Save accepted records | Five observations saved. Four Central & Western records and one overseas record yielded 1 / 18 districts. Save became disabled after the batch completed. |
| Export through the control | JSON contained five observations and no notes. All observation keys were exactly id, longitude, latitude and captureTime. No filename, image bytes, district cache or derived UTC instant persisted. |
| Download JSON using the link | Actual file `/Users/blueock/Downloads/photo-location-journal.json` parsed successfully. Field allowlist, record count, two with-offset times, one timezone-unknown time and two missing times verified using Python assertions. Synthetic data only. |
| Full page reload and export again | Five records and 1 / 18 districts restored. Export string matched the pre-reload export exactly. |
| Delete one Central & Western observation | Four records remained; district count stayed 1 / 18. Previous export text was cleared. Linked-note preservation is covered separately by the existing store checks. |
| Delete all and reload | Zero records and 0 / 18 districts remained. |
| Run fixtures with capture time unchecked, then save/export | 10/10 parser checks passed. Five records exported, all captureTime values exactly `{ "status": "not-requested" }`. |

The second synthetic batch was deleted through the same journal control after verification. The downloaded synthetic JSON is retained as a test artifact; deletion in the app does not delete external copies. The browser warning/error log was empty. The journal section was visually inspected at the desktop viewport: controls and status text were readable and did not overlap. Both changed JavaScript modules passed `node --check`. LSP initialization failed because TypeScript/Biome are unavailable; no clean LSP result is claimed and no dependency was installed.

Limitations: this is a metadata pipeline diagnostic, not the approved production atlas or automatic phone-library flow. Physical devices, browser offline reload, storage eviction, live account sync, full-library performance, photo palettes and cross-import deduplication remain unverified or unimplemented. Storage failure and cancellation paths have not been exercised in this integrated page; transaction semantics were tested independently in the local store. No new claim is made about network capture or production access-control verification.
