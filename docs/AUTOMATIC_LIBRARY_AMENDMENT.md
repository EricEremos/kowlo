# Automatic photo library: proposed scope amendment

Status: user requested the automatic experience on 5 September 2026. The revised UX is authorized; adding native mobile delivery to the previously approved PWA scope awaits a concrete platform decision. The existing native Goal remains active and has not been replaced.

## Product correction

The user's second clarification makes the product model explicit: this is not “Add places.” Existing photographs automatically give regions and places a personal identity. The home is a growing geographic atlas; districts and localities become chapters populated by observed photo locations. The editable Figma revision is frames 35:23 (connect), 35:48 (atlas), and 35:100 (place chapter). These are static review designs, not working native permission screens.

Geography supplies distinctive shapes and hierarchy. Personal counts, location clusters and optional notes supply individual character. No generated prose may claim a visit, activity, emotion or route unsupported by the photo metadata. Any photo thumbnails are an optional local presentation decision, not permission to upload images. A district's marine administrative boundary must not be drawn or labelled as a land coastline.

The primary journey is **connect photo library → operating-system authorization → automatically populated map**. Remove mandatory photo picking, batch inspection and save confirmation from the ordinary journey. Scan every accessible photo for available location metadata; show Hong Kong locations progressively. Group locations into sourced districts and suggested localities. This is an observation map, not proof of the route the person travelled.

On later launches/resumes, reconcile new, changed and removed accessible assets and refresh the map without repeated selection. Observe changes while the application is running. Do not promise permanent background execution or immediate updates while the app is closed.

## Delivery decision

### Personal colour and a sense of achievement

Further user direction: precise photo positioning, distinctive qualities/colours from their photographs, and increasing satisfaction as the atlas fills. This is a core product requirement.

Preserve source coordinates; do not claim more physical accuracy than the metadata supports. Assign verified districts separately from suggested localities or unverified venues. A photo coordinate is an observation, not evidence of an exact business visit or a continuous travelled route.

Proposed local visual processing: after explaining the feature, read a small local thumbnail, extract a restrained dominant-colour palette, then discard the analysis buffer. Keep palettes and asset links local by default. This does access image pixels in addition to GPS, so the connection explanation must accurately distinguish local visual processing from uploading photographs. Respect photo access restrictions; unavailable cloud thumbnails leave a neutral geographic treatment rather than forcing a full-resolution download. Do not infer sensitive traits or create invented semantic descriptions from the images.

Use palettes as decorative accents inside geographic chapters, with interface text kept on contrast-tested neutral surfaces. District progress counts distinct confirmed districts with valid photo observations, e.g. 3 of 18. Locality exploration uses a defined, sourced set if a denominator is displayed. Never imply that a few photos mean an entire district has been explored, and never count duplicate scans as progress. Land/grid coverage, if added, must have a separately defined resolution and evidence basis.

Give a restrained reveal when a new district appears, a chapter that gains colour and structure, and an optional shareable achievement card with precise locations hidden by default. No mandatory posting, loss-framed streaks or repeated reward dialogs. Honour reduced-motion preferences. Show current collection progress honestly if permissions or records change.

Figma includes a static district-collection concept with an explicitly illustrative palette. Optional local colour extraction now works in the browser diagnostic, including saved palettes and graceful HEIC decoder failure; see [local palette evidence](evidence/local-photo-palettes.md). Production thumbnail adapters, complex-photo palette quality, adaptive contrast and achievements still require implementation and device verification. District matching cannot improve original GPS accuracy.

Recommended: retain the shared React/TypeScript interface and desktop web/PWA, and add native phone packages using a custom Capacitor bridge. iOS uses PhotoKit; Android uses MediaStore and local EXIF extraction. The native bridge exposes a bounded metadata stream and permission state, never photo bytes to cloud services. Capacitor packaging alone does not implement library scanning.

A home-screen-installed website cannot acquire PhotoKit/MediaStore access by asking for browser location permission. A web directory picker grants a chosen filesystem directory on supported browsers; it is not permission to enumerate the phone's Photos library. Desktop web shows privately synchronized location records after sign-in and opt-in sync. A secondary web file/folder import may remain, but does not fulfill the requested automatic phone experience.

Native distribution introduces device builds, signing, platform permission declarations and app-store review. No purchase, signing-account enrollment or public release is authorized by this proposal.

## Proposed user journey

1. Welcome: “Your photos. Your Hong Kong.” Explain once: read saved photo locations on this device; original photos are not uploaded. Primary action: “Connect photo library.” No account prerequisite.
2. Use the actual OS permission dialog. Full access enables scanning the accessible library. Limited access remains supported; label the map as based on shared photos and offer Manage access. Denied/restricted access leads to a useful explanation and sample atlas, without repeated prompts.
3. Open the map immediately after authorization. A small status card reports actual scan progress while locations appear. Permit pause/resume. Do not block on a batch review screen or invent a percentage before the work total is known.
4. Finish quietly with a concise location summary. Photos without GPS do not become errors requiring confirmation. Never substitute zero coordinates or infer GPS from image contents. Capture time remains an optional preference; without it, records are undated.
5. Subsequent visits open directly to the map. Refresh new and changed locations on foreground/resume and during observable library changes. Keep access/sync controls in settings.
6. Optional private sync connects the phone's location journal to desktop web. Explain that coordinates and opted-in dates/notes leave the device; original photographs remain local.

## Implementation contracts

- iOS: request the appropriate PhotoKit access level and inspect full/limited/denied/restricted states. Read optional PHAsset.location metadata rather than requesting original image downloads just to locate assets. PhotoKit has no GPS-only permission scope: the product's narrower use must be enforced in code and disclosed accurately.
- Android: broad media enumeration and unredacted photo location are distinct permissions. Request ACCESS_MEDIA_LOCATION when needed and handle refusal. Respect selected-photo access and current Google Play broad-access eligibility. Never copy the official sample's (0,0) fallback into valid observations.
- Process metadata in bounded chunks off the UI thread. Maintain device-local asset identity and checkpoints; no cross-user fingerprints. Repeated scans must be idempotent; equal coordinates do not mean duplicate photographs.
- Reconcile permission changes before scanning or uploading. Distinguish inaccessible assets from confirmed deletion. Stop access and pending automatic sync for revoked assets; retain authored notes separately. Record precise deletion/retention behavior before implementation.
- Edited GPS updates a linked observation without overwriting the user's place-label correction. Repeated resume, interrupted scan and concurrent sync must not create duplicate records.
- Cloud-only, very large and partially accessible libraries require real-device validation. Do not promise access to every photo in every remote cloud service.
- Local-first geography and optional private Supabase/PostGIS sync remain in scope. No public image storage or image-analysis model is needed.

## Evidence and release checks

Documentation supports feasibility, not working implementation. Verify on physical iPhone and Android: full and limited permission; refusal and revocation; existing and newly added images; missing/redacted GPS; metadata edits; interrupted/resumed large scans; deletions; offline operation; and no image bytes in network requests. Desktop must show only the signed-in owner's opted-in synchronized metadata. Benchmark responsiveness and memory on representative devices before setting numerical performance targets.

Primary sources checked 5 September 2026:

- [Apple PhotoKit privacy and authorization](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app): remembered authorization, limited access and revocation.
- [Apple PHAsset.location](https://developer.apple.com/documentation/photos/phasset/location): optional asset location metadata.
- [Apple library change observation](https://developer.apple.com/documentation/photokit/observing-changes-in-the-photo-library): fetched-asset changes and observer updates; not a guarantee of continuous background runtime.
- [Android shared media](https://developer.android.com/training/data-storage/shared/media): MediaStore enumeration, ACCESS_MEDIA_LOCATION and update reconciliation.
- [Android selected-photo access](https://developer.android.com/about/versions/14/changes/partial-photo-video-access): full and partial authorization handling.
- [MDN directory picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker): limited browser support and selected-directory access.
- [Capacitor plugins](https://capacitorjs.com/docs/plugins): JavaScript-to-native interfaces for iOS and Android.

## Approval question

Approve native phone apps sharing the web interface, together with the desktop web/PWA, so automatic photo-library scanning becomes the primary experience?

The approval is required because the original approved prompt explicitly specified a web app with user-selected files. It is a material delivery-platform change, not a repeated approval of routine design work.
