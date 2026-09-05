# Portable journal map export

The local diagnostic now prepares two downloads from one atomic saved snapshot: the existing schema-version-1 JSON journal and a GeoJSON FeatureCollection. This is the approved export foundation; it does not implement the production map or automatic Photos access.

## Format and meaning

`src/journal/geojson-export.mjs` accepts the validated `LocalJournal.snapshot()` contract. The GeoJSON has a versioned `journalExport` foreign member and one Point feature per observation, identified by its original observation ID. Coordinates retain the stored numeric values in longitude, latitude order. Capture-time status and any explicit offset are preserved without converting an unknown local time to UTC. Optional colours retain their algorithm and are identified as photo-pixel-derived accents.

Linked journal entries live in the point's properties. Notes and personal labels are identified as user-authored; labels explicitly remain unverified. A retained entry whose observation was deleted becomes a separate feature with `geometry: null`, never a point at zero or a nearby suggested venue. Some GIS viewers may omit unlocated features; the JSON journal remains available with every record.

The format follows [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946), sections 3.1.1, 3.2, 3.3, 4, 6.1 and 12: WGS84 longitude/latitude positions, nullable feature geometry, a FeatureCollection and the `application/geo+json` media type. Coordinate precision is not a measured accuracy claim. Neither format establishes venue attendance or a travelled route.

Government place-name suggestions, district geometry and derived milestones are not included in this export. Consequently it does not copy or imply provenance from those datasets. Coordinate provenance is photo GPS metadata, and location accuracy is explicitly unknown. Image bytes, filenames and unrelated metadata are excluded by field selection. The serializer rejects invalid coordinates, unsupported snapshot versions, duplicate observations and dangling note links; it is not a general untrusted-file importer.

## Integration and verification

Both downloads are generated from one IndexedDB snapshot. Local edits or deletion clear both prepared links and revoke their Blob URLs. Already downloaded files remain outside the app's control. The v9 offline shell adds the serializer to its static allowlist, for 18 assets; it does not cache private exports.

- `npm test`: 41 passing checks, including 200 deterministic generated snapshots asserting coordinate, note, ID and capture-time preservation through JSON serialization, non-mutation and deterministic output. Separate cases exercise world bounds, coincident points, retained notes, palette ownership, extra-field exclusion and invalid geometry/link rejection. These generated checks use the existing Node runner without an added dependency or automatic shrinking.
- `scripts/journal-locality-browser-checks.mjs`: actual Chromium 151.0.7922.34 downloaded and read both files, checked filenames and matched their content to the saved snapshot. Original coordinates, palette, capture-time state, multilingual notes and user-authored labels survived.
- With the loopback server stopped and Chromium offline, actual downloads still succeeded. After deleting all saved records and reloading, the downloaded GeoJSON contained an empty feature array. A retained note exported with null geometry after its location was deleted.
- Desktop 1280 × 900 and mobile 390 × 844 screenshots were inspected. The first pass exposed adjacent text links with poor mobile target separation. The final controls have distinct borders, spacing and at least 44 px height, with no horizontal overflow.
- Zero uncaught page errors, external-origin requests or non-GET requests were observed. Syntax checks passed. LSP could not initialize because the configured TypeScript installation is absent; other server installation was previously declined. No clean LSP result is claimed.

The [browser report](journal-locality-browser.json) records current results and hashes twelve relevant files. Final screenshots: [desktop export](journal-geojson-desktop.png), [mobile export](journal-geojson-mobile.png). The harness closes its temporary server and browser.

## Limits

No physical phone, third-party GIS application, hosted Supabase endpoint, native photo-library permission, production Figma implementation or large-library performance was verified by this unit. GeoJSON export is not a journal import/restore feature. The full project Goal remains active.
