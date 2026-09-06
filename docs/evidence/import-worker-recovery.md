# Local import worker recovery

7 September 2026. Scoped repair to the existing photo-import diagnostic; this does not implement automatic phone-library access or the proposed production import screens.

## Reproduction and change

Using the diagnostic's real file input in Chromium with two synthetic JPEG fixtures, a deliberately failed first worker produced `worker-error` for the first photo and `parse-timeout` for the second valid photo. The failed worker was still assigned to the importer. The second photo waited ten seconds and was not inspected.

The importer now terminates and clears the worker after an error or timeout. The next photo starts a new worker with the existing geographic references. Cancellation also clears the terminated worker. This preserves the failed photo's explicit status without discarding the next photo or retrying the failed photo silently.

## Verification

Browser: Chromium 151.0.7922.34, Playwright, isolated contexts with service workers blocked. The test server injects a real worker script startup error or nonresponsive worker only for the first instance; subsequent workers load the actual extraction code. No personal photos are used.

| Scenario | Observed result |
| --- | --- |
| Worker startup error, then valid photo | `worker-error`, `accepted` |
| Nonresponsive worker, then valid photo | `parse-timeout`, `accepted` |
| Cancel a pending import, then start a fresh import | Cancelled status; no old results; new photo `accepted`; controls restored |
| Normal fixture button | 10/10 existing fixture checks pass |

The browser checks observed zero external-origin page requests and zero non-GET page requests. Worker responses retain the diagnostic server's `connect-src 'none'` policy; page request observation alone is not a complete worker network capture. Imports remain unsaved until the existing explicit journal save action.

All 46 existing Node tests pass. Changed JavaScript passes `node --check`, and `git diff --check` passes. Editor LSP initialization could not run because the configured language server could not find TypeScript. A separate headed Computer Use attempt was blocked by the Mac lock screen; the actual DOM/file-input regression checks above ran successfully in headless Chromium. Safari, mobile OS photo permissions and physical devices are not covered by this unit.

Reproduce:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/import-worker-browser-checks.mjs
npm test
```

Implementation base: `bac7a44ee1a7b076f535316e4a15258c57947dbf`.

Verified file SHA-256:

- `experiments/photo-import/diagnostic.mjs`: `b86f40ad623be7a62830d62b9b37134226e9d0f730d3b184d465ee70f9dce73f`
- `scripts/import-worker-browser-checks.mjs`: `5b1dcf4dcd8df758550a45afff22c4345e5dea2cfd27a158b75960c99f63fa51`

The new [Figma companion proposal](web-companion-figma.md) still awaits the user's design review. Hosted sync remains subject to the separate [Supabase account decision](hosted-sync-readiness.md). The beta Goal remains active.
