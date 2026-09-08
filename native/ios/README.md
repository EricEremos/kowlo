# iPhone photo-library adapter

`PhotoLibrary.swift` is a PhotoKit metadata adapter. `Probe.swift` and `ProbeChecks.swift` form a separate simulator verification app. They are not the production KOWLO interface or a distributed iPhone app.

## Access and scanning

- Request `.readWrite` photo-library authorization only after a user action. iOS offers full, limited or denied access; there is no GPS-only permission scope.
- Enumerate accessible image assets, excluding hidden assets. Read `PHAsset.location` without requesting original image data. Burst members are included; videos are excluded.
- `begin` returns a scan token and total. Pull `next` batches of 1–256 assets. The consumer applies backpressure by requesting the next batch only after handling the previous one.
- Location is optional. Missing/invalid coordinates remain absent. A valid coordinate at zero is preserved. Accuracy is retained only if non-negative and finite.
- Capture time is off by default. If enabled, `capturedAtUTC` represents the asset's creation date normalized to UTC, not the original EXIF timezone.
- The asset identifier is device-local reconciliation data. It must never enter journal exports, public artwork or account sync payloads.

Cancellation, a PhotoKit change notification, or a change in authorization invalidates the scan token. Callbacks recheck permission and generation before returning metadata. A consumer must discard incomplete reconciliation when a scan is invalidated and must recheck access on foreground activation. Photos no longer accessible under limited permission are not proof of deletion.

The production integration still needs a persistent asset-to-observation ledger, reconciliation after edits/deletions, optional thumbnail palette extraction, and a bridge to the shared atlas interface. An absent asset must not automatically erase a user's note. Scanning here does not guarantee continuous background execution.

## Build the verification app

Requires Apple Silicon, Xcode and an installed iOS simulator runtime:

```sh
bash scripts/build-ios-probe.sh
```

The script uses the installed iPhoneSimulator SDK and creates an ad hoc signed app under ignored `.native-build/`. It does not enroll a developer account or install third-party packages. Install it only in a dedicated test simulator and seed it with repository-generated fixtures. The probe displays counts and contract results; it does not log asset IDs, coordinates or image contents.

## Sources

- [Apple: Delivering an enhanced privacy experience in your photos app](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app)
- [Apple: PHAsset location](https://developer.apple.com/documentation/photos/phasset/location)
- [Native phone and web delivery decision](../../docs/AUTOMATIC_LIBRARY_AMENDMENT.md)
