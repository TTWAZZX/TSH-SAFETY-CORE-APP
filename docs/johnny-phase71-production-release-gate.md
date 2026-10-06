# Johnny AI Phase 7.1 — Production Release Blocker Remediation

Date: 2026-10-06
Scope: Local remediation and release preparation only. No Production deployment or mutation.

## Gate decision

**HOLD — local engineering gates pass, but Production authorization gates are still pending.**

The staged candidate is technically cleaner and the Phase 7 code blockers have been remediated. Deployment remains forbidden until an authorized Production configuration preflight, read-only drift/schema/file inventory, verified backups and a clean immutable scoped release commit are available.

## Remediated blockers

### Schema migration and runtime safety

- Node and PHP runtime no longer create or alter Johnny tables.
- Runtime performs read-only `INFORMATION_SCHEMA` checks and returns `503 JOHNNY_SCHEMA_NOT_READY` when required tables, columns, indexes or feedback foreign key are missing.
- The additive migration is `backend/migrations/20261006_johnny_phase7_schema.sql`. It contains no data `DELETE`, `UPDATE`, `DROP` or legacy-row rewrite and is idempotent for existing columns/indexes/constraints.
- The rollback file deliberately contains no executable destructive schema operation.
- Isolated Node/PHP lifecycle applies the migration twice and proves schema idempotency.

### Retention separation

- Chat and operational-log retention deletion was removed from runtime startup/request handling.
- The lifecycle seeds year-2000 chat/message/log sentinels before runtime startup and proves all three survive in Node and PHP.
- `backend/scripts/johnny-retention-maintenance.js` is a separate operator command. It defaults to dry-run and requires both `--apply` and exact `JOHNNY_RETENTION_CONFIRM=DELETE_EXPIRED_JOHNNY_DATA` before deletion.

### Server-only contract protection

- Apache returns 404 for every path below `shared/`.
- Node blocks `/shared` before any static serving.
- Browser UAT proves both Johnny JSON contract URLs return 404 while server-side usage and feedback behavior continue to work.

### Configuration and PHP 7.4 readiness

- `api/config.production.example.php` now includes the public URLs, model chain, explicit chat/log retention, file-size limits and web/system switches required by Johnny.
- The configuration preflight validates required keys, placeholders, URLs, numeric ranges, boolean flags and runtime extensions while suppressing all values.
- A synthetic config fixture passes the preflight with the official portable PHP 7.4.33 runtime and required extensions enabled.
- PHP 7.4.33 passes lint for six candidate/preflight files plus Phase 3, 4 and 5 PHP evaluations. The temporary runtime was removed after verification.

### Authenticated Browser UAT

The in-app Browser controller still fails before tab creation with `failed to write kernel assets: path not found`. Following the Browser skill recovery attempt, the repository-controlled Microsoft Edge/CDP fallback was used against a loopback-only fixture URL; the UAT script refuses any non-loopback URL and has no Production fallback.

The final Browser UAT passes:

- authenticated Johnny workspace at 1366×768;
- floating Side Drawer on Dashboard;
- deterministic System Usage answer, visible source and persisted Helpful feedback;
- 390×844 full-screen drawer with no page overflow;
- all visible drawer controls at least 44 px;
- no failed Johnny API response and no mutation outside the login/Johnny allowlist;
- direct shared-contract access returns 404;
- browser conversation cleanup leaves zero conversations.

Evidence: `backups/local/johnny-phase71-browser-20261006155553/`.

## Test results

- Phase 7.1 static release gate: `37/37`.
- Phase 1: `33/33`; Phase 2: `33/33`.
- Phase 3 Node/PHP: `105/105`, `135/135`.
- Phase 4 Node/PHP: `42/42`, `22/22`; observability `7/7`.
- Phase 5 Node/PHP: `49/49`, `37/37`; workflow smoke `9/9`.
- Golden quality `9/9`; mobile compact `14/14`.
- Node/PHP integrated lifecycle: seven Johnny tables, 24 workflow logs, schema/retention assertions and zero chat/database residue.
- PHP 7.4.33: six lint files, three PHP evaluation suites and config-preflight fixture pass.
- Permission audit has no new Johnny finding; it retains the two pre-existing unrelated 4M `UNREVIEWED` routes.
- Final disposable-database audit: zero.

## Staged release candidate

`output/johnny-ai-phase7.1-release-candidate/` contains an allowlisted staged candidate:

- `runtime/`: 13 PHP-target runtime files;
- `operations/`: seven migration/config/preflight/retention artifacts;
- `manifest.json`: per-file byte size and SHA-256;
- secret-bearing `.env` and `api/config.local.php`: excluded and verified absent.

Candidate manifest verification passes `13 runtime + 7 operations`, with zero secret files. Its status is intentionally `HOLD_PRODUCTION_PREFLIGHT_AND_IMMUTABLE_COMMIT_REQUIRED` because the source worktree is still dirty and not an immutable release commit.

## Remaining Production gates

1. Run the value-suppressed config/extension preflight against the authorized Production configuration.
2. Capture read-only Production runtime hashes, `INFORMATION_SCHEMA` compatibility, Johnny table counts/fingerprints and private/legacy KB-file inventory.
3. Create and verify the approved runtime download-back, narrow Johnny database backup and KB-file backup.
4. Create a clean, scoped immutable release commit, rebuild the candidate and verify every final hash.
5. Obtain a new explicit deployment approval after the four items above pass.

No Production connection, upload, schema change, data mutation, commit, push or deployment occurred in Phase 7.1.
