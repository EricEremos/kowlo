# Saved locality context and journal entries

The technical diagnostic now reopens saved coordinates with nearby-name context and supports separately authored notes and personal place labels. This implements part of the existing journal requirement. It is not the production Figma interface or the proposed automatic photo-library flow.

## Implemented behavior

- Every saved observation retains its original GPS, optional capture time and opted-in palette. Nearby names are recomputed from the same pinned government catalog and district classifier used by the import worker. The explanatory disclosure includes the method and source hashes. Suggestions remain unconfirmed and are not persisted or exported as visits.
- A journal entry may contain a note, a personal place label, or both. Labels are explicitly user-authored descriptions; they cannot alter coordinates, district assignments or milestones. Existing IndexedDB and sync allowlists already support these fields, so no schema or transport change was made.
- Entries can be edited or deleted independently. Cancel leaves the saved entry unchanged. A failed save leaves the draft in the editor for retry. Other journal mutation controls are disabled while editing to avoid replacing the draft through another local action.
- Deleting a saved observation uses the existing atomic unlink operation. Its notes appear in a retained-notes section, where they remain editable, exportable and independently deletable. They have no saved coordinates and earn no district progress.
- Milestones continue to count distinct assigned districts. A duplicate location does not earn a second district, and removing the last saved observation in a district removes that district from the count.
- The initial journal unit used v8 with 17 allowlisted assets. The subsequent [GeoJSON export unit](journal-geojson-export.md) advances the current shell to v9 with 18 static assets. Photos, notes and journal exports are not placed in the service-worker cache.

This supports the requested sense of a growing personal record: memories can become richer without inflating geographic achievement. Emotional effectiveness and the final reward presentation have not been user-tested.

## Verification

The [machine-readable browser report](journal-locality-browser.json) now includes GeoJSON download verification and binds the result to SHA-256 hashes of twelve implementation/verification files. The reproducible driver is [journal-locality-browser-checks.mjs](../../scripts/journal-locality-browser-checks.mjs). It starts its own loopback server and isolated Chromium contexts, then closes both.

Observed on Chromium 151.0.7922.34:

1. Saved synthetic photo coordinates regain nearby names, distances, method and source pins. Original GPS, capture-time status and palette remain byte-for-byte equivalent in exported structured records after note creation and editing.
2. Empty entries and overlong notes/labels are rejected. An injected one-shot save rejection leaves both input fields intact; retry succeeds with the same intended content. This simulates a storage-boundary failure, not actual disk exhaustion.
3. Note text resembling HTML is displayed as text with no image element or script execution. Editing, cancelling, saving and reloading preserve the expected entry identity and content.
4. A corrupt place-name response hides suggestions while saved coordinates, notes and district progress remain available. Restoring the reference restores derived context.
5. Two synthetic observations in one district count as one district. Deleting the first preserves that milestone and unlinks its note. Deleting the second changes progress to zero. The retained note remains editable after reload and can be deleted independently.
6. With the server stopped and Chromium offline, the current v9 shell restores nearby names, saves a new note and label, preserves them through reload and actual JSON/GeoJSON downloads, and durably deletes all journal records.
7. The two captured layouts have no horizontal document overflow. [Desktop](journal-locality-desktop.png) and [mobile](journal-locality-mobile.png) screenshots were visually inspected: editor labels, input text, focus outline and action buttons are visible. These are diagnostic layouts, not evidence of production design approval or a full accessibility audit.

The instrumented pages produced zero uncaught page errors, external-origin requests or non-GET requests. The current Node suite passes 41 checks, including GeoJSON properties, v9 cache installation and retirement of v8. JavaScript syntax checks passed. LSP remained unavailable because the configured TypeScript installation is absent and installation of the other configured server was previously declined; no clean LSP result is claimed.

Run with the installed Playwright module available:

```sh
node scripts/journal-locality-browser-checks.mjs
```

If Playwright is provided by the bundled runtime rather than this package, set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. The driver uses only synthetic fixtures and local storage.

## Remaining scope

This unit does not establish exact venue attendance, measured GPS accuracy, a production locality acceptance policy, persistent source-backed locality assignments, large-library performance, cross-tab draft conflict handling, native phone permissions, physical-device behavior, hosted authentication/sync, or production map and reward quality. Nearby suggestions use the existing exploratory 1 km policy. Personal labels remain free text without a verified place identity. The approved project Goal remains active.
