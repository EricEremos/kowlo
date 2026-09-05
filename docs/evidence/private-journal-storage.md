# Private journal storage: first migration

6 September 2026. This is an implemented database foundation, not a demonstrated hosted sync flow.

## Changed behavior

`supabase/migrations/202609060001_private_journal.sql` creates observations and journal entries. Both use a composite owner/record UUID key, enabled and forced row-level security, explicit grants, and separate policies for each operation. Authenticated clients can act only on their own rows. Anonymous clients receive no table grants. Clients cannot change ownership, record IDs, or server timestamps through an update.

Observations contain longitude/latitude and optional capture-time fields. There is no photo blob, asset-library identifier, filename, or image-upload bucket. Coordinate constraints reject NaN, infinities and out-of-range values. Capture-time states distinguish not requested, missing, invalid, unknown timezone and explicit offset; an unknown offset stays unknown. The schema does not claim district, locality or venue verification from a client-supplied label.

Notes and corrected place labels are separate records. Their composite foreign key prevents linking a note to another owner's observation. Explicit observation deletion unlinks an authored note and retains its text. Explicit note deletion removes the note; account deletion cascades to both tables. An eventual delete-all UI must remove both entity types. Permission revocation, local asset reconciliation and cloud backup retention are separate behaviors not implemented by this migration.

## Observed tests

`python3 scripts/test-private-journal.py` passed 58 assertions against PostgreSQL 17.10. Full output: [private-journal-db-results.json](private-journal-db-results.json).

The script starts a new cluster in a private directory, disables TCP listening, creates two non-login application roles and a minimal auth.uid stand-in, applies the real migration, and makes actual SQL requests under the application role with two synthetic user IDs. It tests allowed own-row operations, denied cross-owner reads/updates/deletes, forged owner insertion and reassignment, missing identity, all four anonymous operations, forged timestamps, cross-owner note links, UUID retries, invalid GPS/capture time, note edits and length limits, observation deletion, note deletion, and account cascade deletion. Same record UUIDs belonging to two different owners coexist.

The cluster was stopped successfully; `pg_ctl status` reported no server running. No existing local or cloud database was modified.

Verified source SHA-256 digests for the original test run (historical; the driver now also supports an optional spatial suite):

- Migration: `5fb4ec55137f09d932254bc46e3083c8b28860400bbfc23888cb894a0fac521e`
- Test driver: `16e0629c786e90299b1a1211906de8b4e2ba82d3424ad18b01fd8aadc0f38ddc`

## Access-control assessment and limits

All application-facing tables in this migration have per-operation ownership policies plus explicit grants. No SECURITY DEFINER function or exposing view was added. The timestamp trigger is SECURITY INVOKER, uses an empty search path and has public/client execution revoked. Production authentication is expected to supply auth.uid through Supabase; the local test stand-in is isolated in the test script and is never part of the deployment migration.

This verifies database authorization with trusted synthetic identity settings, not JWT verification, passwordless sign-in, PostgREST schema exposure, or direct hosted API isolation. Those remain required release checks. The test cannot establish protection from a database administrator or service-role key; those credentials bypass ordinary client policies and must remain server-side.

No synchronization client, conflict-resolution contract, deletion tombstone stream or offline outbox is implemented yet. Duplicate UUID insertion currently returns a constraint error; this alone is not an idempotent sync protocol. A hosted project and PostGIS extension are also pending, so no server geographic matching or browser/PostGIS parity is claimed.

## External state

Created [EricEremos/hong-kong-footprints](https://github.com/EricEremos/hong-kong-footprints) through the authenticated EricEremos GitHub account. A subsequent repository query returned `visibility: PRIVATE`, `isEmpty: true`, and the expected owner/name. The local origin is connected to that repository. No code was pushed in this work unit.

The Supabase CLI listed the account's projects; the newly approved Hong Kong project was absent. No existing project was reused or modified. Approved destination remains EricEremos's Org in Singapore.

## Sources and applied guidance

The implementation follows Supabase's documented distinction between grants and row policies, with both USING and WITH CHECK on updates. [Supabase row-level security documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Installed guidance applied: `build-fusion` routed to `ponytail` (full) and `supabase-postgres-best-practices` security/privilege references. `insecure-defaults` guided the production grants check; test-only authentication scaffolding was excluded from production-default findings. `differential-review` was read and skipped because this is greenfield SQL with no baseline; concrete adversarial role tests cover this bounded change instead. Spark was not retried after the previously observed provider exhaustion. Language-server verification was unavailable; actual database execution supplies the evidence above.
