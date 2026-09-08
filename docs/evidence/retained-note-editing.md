# Retained notes remain editable

Verified 8 September 2026 against the local web companion. Removing a saved location keeps its authored note under You. That note now opens the same editor as a location-linked memory; edits survive reload, and an explicit Delete note confirmation removes only the selected note. Cancelling preserves it. The navigation remains on You.

The shared editor preserves failed-save drafts and uses the existing LocalJournal operations. Original photos and cloud records are unaffected by these local operations.

## Evidence

- `scripts/atlas-browser-checks.mjs`: 10 groups passed, including retained-note edit, reload, cancelled deletion and confirmed deletion without changing the location count. No page errors or external requests.
- `scripts/atlas-offline-checks.mjs`: 7 groups passed. Retained-note edits and deletion survive reload with the server stopped. Exactly 18 static resources remain cached; private and authenticated requests are excluded.
- Manual browser use: created a synthetic note, removed its synthetic location, opened the retained note through You, edited and saved it, then reloaded and observed the saved text. Browser error log was empty.
- [Mobile retained-note render](atlas/retained-note-mobile.png) inspected for input readability, spacing and floating-navigation clearance. Desktop editor also inspected in the live browser.

All records used in these checks were synthetic. Physical phone, Safari and hosted synchronization behavior are not established by this evidence. Static cache advances to v5 so returning web users receive the editor.
