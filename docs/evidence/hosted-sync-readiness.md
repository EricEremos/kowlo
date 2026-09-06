# Hosted sync readiness

7 September 2026. **Supabase sign-in works; creation of the approved new KOWLO project is blocked by the account's free-project limit. Hosted synchronization remains unverified.**

## Live observation

The official Supabase dashboard authenticated EricEremos through the existing GitHub browser session. The approved organization, EricEremos's Org, was accessible. Its project list contained no KOWLO project.

Opening New project displayed: “The organization has members who have exceeded their free project limits” and identified EricEremos with a limit of two free projects. The Create new project action was disabled after the quota check. No project was created, no configuration was saved, and no hosted migration was executed. Existing projects and billing were not changed.

The approved target remains **a new project in EricEremos's Org, Singapore**. Access to another organization does not authorize using it. A user decision is pending: identify an existing project to pause, arrange an organization upgrade, or defer hosted sync. This observation establishes the dashboard's current creation blocker; it does not diagnose each existing project's quota contribution.

## What existing evidence establishes

| Boundary | Evidence | Limit |
| --- | --- | --- |
| Database migrations 001–005 | [209 database checks and 684 geographic comparisons](district-browser-postgis-parity.md) | Isolated PostgreSQL 18.4 / PostGIS 3.6.4 with a minimal test identity implementation; not hosted JWT enforcement |
| Browser sync transport | [13 Chromium scenarios](authenticated-sync-transport.md) using real fetch and IndexedDB | Auth and RPC responses were intercepted fixtures; not live Supabase requests |
| Installation and offline journal | [Standalone installation evidence](atlas-installation.md) | Local Chromium verification; production hosting and physical phone behavior remain unverified |

These are earlier recorded results, not new runs. The later full-chain database evidence supersedes earlier notes that PostGIS had not yet run locally. None of these checks establishes successful hosted deployment.

## Ordered hosted verification after the blocker is resolved

1. Confirm that the newly created project belongs to the approved organization and uses Singapore. Record its project reference and observable provisioning state without recording credentials.
2. Inspect the hosted PostgreSQL/PostGIS versions and extension schema. Apply migrations 001–005 in order to this new project. Verify the restricted `journal_sync_writer` role, ownership transfers, grants and forced RLS under the actual hosted privileges. If a privilege is unavailable, investigate the specific operation; do not weaken isolation to make deployment pass.
3. Verify the pinned 18-district reference and generated geometry. Confirm the seeded reference hash and classify representative interior, boundary and outside-dataset controls through the actual API.
4. Exercise live Auth/JWT and PostgREST using isolated synthetic test identities: anonymous denial, owner access, cross-account denial, restricted direct writes, RPC permissions, exact decimal revision strings, pagination, retry receipts, conflicts, retirement and deletion. A publishable key alone must not authorize private records.
5. Wire explicit sign-in and metadata-sync consent into the atlas, with account-bound orchestration, cancellation and visible conflict handling. Add only the configured service origin to the necessary network policy. Keep tokens and private API responses out of static offline caches.
6. Verify the complete browser flow against the hosted service, including offline edits and reconnection. Retain sanitized results and inspect requests to confirm that only allowlisted metadata leaves the device. Physical phone and production installation checks remain separate release requirements.

No hosted readiness or release claim is made until these checks pass. Automatic phone photo-library access still requires the separate delivery decision in [the library amendment](../AUTOMATIC_LIBRARY_AMENDMENT.md); connecting Supabase does not provide that capability.
