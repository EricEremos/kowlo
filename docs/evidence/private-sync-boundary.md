# Private sync acceptance boundary

Observed 6 September 2026. Scope: migration 003 and its isolated database driver. This is local backend verification, not a completed cloud sync feature.

## Runtime evidence

`python3 scripts/test-private-journal.py --sync` exited 0 with 110 checks passed: the existing 58 storage checks and 52 sync checks. PostgreSQL 17.10 (Homebrew), isolated socket-only cluster `/tmp/placefold-db-z82pcomj`; the driver stopped the cluster on exit. `--help` also exited 0 and documents both optional suites.

The driver used two independent account identities and actual PostgreSQL transactions. Two concurrently submitted edits sharing the same base revision yielded one acceptance and one conflict. Other observed results:

- Existing content backfilled into the feed; another account could not see it.
- Direct authenticated inserts, updates and deletes were denied, including formerly granted column operations. Anonymous and missing-identity RPC calls were denied.
- Identical accepted retries returned the original receipt without advancing the clock. Altered input with the same token was rejected.
- Invalid coordinates, unexpected fields, filenames, forged ownership and malformed palettes failed. Rejections did not leave accepted receipts or advance the checked account clock.
- Exact coordinates and the locally derived palette round-tripped.
- Observation deletion retained authored notes, removed their observation link and published their new revision before the observation tombstone.
- A deleted ID could not be recreated even using its latest revision. Replaying an old accepted creation returned its old receipt without recreating content.
- Account isolation held for identical record IDs. Another account's content survived deletion.
- Unseen deletion retained a marker; pagination bounds and cursor semantics passed; explicit rollback removed both content and sync state.
- Account deletion cascaded all five content/bookkeeping tables.

One harness assertion was corrected: `SET ROLE` on an administrator session does not remove the session user's role-switch authority. Writer isolation is checked through actual client write denials and the authenticated role's lack of writer membership. No database permission was relaxed to pass this check.

## Privilege inspection

The write function is owned by a NOLOGIN, NOINHERIT, NOBYPASSRLS role, not the cluster administrator. It uses an empty search path, qualified relation/function references and owner policies. The client has no execution permission on the clock helper or read access to receipts. Table and previous column write grants are both revoked. There is no dynamic SQL or caller-selected owner. The operation lock, content mutation, revision and receipt share a transaction.

This follows the restricted execution and search-path guidance in [Supabase database functions](https://supabase.com/docs/guides/database/functions), with [owner-scoped RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Request digests use PostgreSQL's built-in [SHA-256 bytea function](https://www.postgresql.org/docs/17/functions-binarystring.html).

Inspected source hashes (SHA-256):

```text
83962d8a3001dcc9a27c0732c956d26f5bef67ad6af0f93997071cce9f4b98c7  supabase/migrations/202609060003_private_sync.sql
57c7cddf0f184dcd661c4fd87443b9b7018043e0506e4b6042b8fef6ca4ac24f  scripts/private_sync_checks.py
e2ddd57bb1675ef66b7b10c3e04b5f367fae05b13b72264a9b6b3323004c007f  scripts/test-private-journal.py
```

## Remaining limits

The auth helper is a minimal local JWT-subject stand-in. Hosted Supabase role creation, ownership transfer, JWT/PostgREST execution and rate limits are unverified. PostGIS is absent; migration 002 and the full ordered deployment chain were not run. No cloud resources were changed.

The browser still needs durable base revisions, frozen in-flight requests, conflict preservation, remote merge and authenticated transport. Receipts and deletion markers intentionally retain minimal identifiers until account deletion; retention at scale, backups, erasure and throughput need hosted evaluation. Privileged administrative content edits must preserve sync state. Physical devices and native photo-library permissions remain separate gates. Python LSP is unavailable and its installation was previously declined; no LSP validation is claimed.
