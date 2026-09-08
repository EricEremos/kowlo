# Native iPhone photo-library verification

Verified 8 September 2026 in a dedicated iPhone 17 Pro simulator, iOS 26.5, using the installed Xcode 26.6 toolchain. This is evidence for the PhotoKit adapter, not completion of the native KOWLO product.

## Observed results

| Scenario | Result |
| --- | --- |
| Clean build | `bash scripts/build-ios-probe.sh` passed with Swift warnings treated as errors. |
| First launch | Authorization remained `notDetermined`; no automatic permission request. |
| Full access after tapping Connect | Completed 10/10 accessible assets: 8 with valid locations, 2 without. |
| Metadata and cancellation checks | 8/8 passed: missing GPS, optional time, invalid latitude, valid zero coordinates, negative hemispheres, UTC date, batch-size rejection, stale-token rejection after cancellation. |
| Revoked access | Relaunch reported `denied`; scanning returned `accessUnavailable`. |
| Limited access | Selecting two synthetic assets in the real iOS permission picker yielded exactly 2/2 assets, one located and one without valid location. |
| Change limited selection | Deselecting the located asset triggered the PhotoKit observer and an automatic rescan: 1/1 asset, zero located, one without valid location. No Scan button was pressed. |

The fresh simulator included six Apple sample photos. Four repository-generated synthetic JPEG fixtures were added: `gps-dated.jpg`, `gps-undated.jpg`, `missing-gps.jpg`, and `southern-western.jpg`. No personal library was used. The full-scan totals include Apple's samples; they are not a four-fixture-only assertion.

Screenshots: [full access](native-ios/full-access.png), [contract checks](native-ios/contract-checks.png), [denied access](native-ios/denied-access.png), [limited access](native-ios/limited-access.png), [selection change](native-ios/limited-selection-change.png).

The simulator emitted Apple WebCore/WebKit accessibility loader warnings. The observed adapter checks completed without an application crash. These results do not establish physical-device, iCloud-only, large-library or background-execution behavior.

## Product boundary

`Probe.swift` is an isolated developer harness with deliberate technical controls. The user rejected it as a product interface on 8 September. It must not become a KOWLO user flow or be presented as the completed native app. The approved atlas, typography, folded geographic marks and floating Atlas / Chapters / You navigation remain the product foundation.

Native integration must put one Connect photos action in that experience, followed by the system permission prompt and automatic atlas updates. Diagnostics remain outside the product. A private asset-to-observation ledger, atomic reconciliation, shared-interface bridge, optional palette extraction and physical-device verification remain outstanding. Limited access losing an asset is not evidence that the original photo was deleted.

Android and hosted sync are not verified by this work.
