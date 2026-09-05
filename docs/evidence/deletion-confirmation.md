# Local deletion confirmation

The approved prompt requires appropriate confirmation before removing selected records or a collection. The diagnostic previously deleted immediately. `experiments/photo-import/journal-panel.mjs` now uses the browser's native confirmation dialog before entering the existing storage operation.

## Behavior

- Location deletion explains that linked notes are kept without coordinates and district progress is recalculated. Original photos and downloaded copies remain.
- Note deletion explains that its personal place label is also removed, while the saved location remains.
- Collection deletion explains that all saved locations and notes in this browser are removed. Original photos, unsaved import results and downloaded copies remain. The diagnostic does not claim to delete cloud data.
- Every prompt states that deletion cannot be undone. Dismissal returns before storage operations or export invalidation. Confirmation enters the existing guarded operation; editing or an in-flight operation prevents another deletion.
- Offline shell v10 still has 18 static assets. Older open tabs keep their release until closed, following the existing service-worker update policy.

## Verification

`scripts/journal-locality-browser-checks.mjs` operated real Chromium 151.0.7922.34 confirmation dialogs, asserted their type and consequence text, and exercised dismissal and acceptance for location, retained-note and collection deletion. Dismissal preserved the complete exported snapshot and both prepared download URLs. Accepted location deletion retained the note without coordinates, removed only the final instance of a district from progress, and invalidated exports. Accepted note deletion removed the retained entry.

With the server stopped and the browser offline, cancelling collection deletion preserved the location and note. Confirming removed both; after reload, actual JSON and GeoJSON downloads contained empty collections. Zero page errors, external requests or non-GET requests were observed. Twelve source hashes bind the verification to the tested tree: [browser evidence](journal-locality-browser.json).

`npm test` passed all 41 checks, including v10 cache activation retaining the current release and retiring v9. Syntax checks passed for the changed handler and browser driver. LSP cannot initialize because TypeScript is unavailable; no clean LSP result is claimed.

## Scope

These are native browser confirmations in the technical diagnostic, not approved production Figma dialogs. Physical-phone rendering, hosted deletion, cloud propagation and additional storage-failure behavior were not verified in this unit. The full project Goal remains active.
