# Safety Patrol Check-in v2 — Local Handoff and Phase 9 Deployment Plan

Date: 2026-09-02
Status: Local phases 1-8 and Phase 9 deployment to `dev.tshpcl.com` implemented and verified; Production unchanged and Patrol-only GitHub synchronization approved.

## Phase 9 dev deployment result

- `dev.tshpcl.com` shared-hosting PHP/frontend deployment completed on 2026-09-02. Node remains the Local development parity route.
- Verified database backup: `patrol-checkin-v2-dev-predeploy-20260902-184046` (185 tables, 15,996 rows, 1,441,927 bytes, SHA-256 `e993a46a8d8d52d541a1d9251463f9c58c8416eb154b160d7f5846de3869215b`, matching downloaded copy and valid gzip).
- Runtime backup: `backups/production/patrol-checkin-v2-dev-predeploy-20260902-183249`; scoped candidate: `backups/production/patrol-checkin-v2-dev-candidate-20260902-184300`.
- Additive migration preserved Attendance at `384/384`, installed the column/indexes once and retained flag `0` until the runtime smoke passed. Final dev flag is `1`.
- FTPS verification passed all six scoped files. HTTPS verification passed all four public assets. Final manifest SHA-256 is `8ae52c59fe5106ce005cd3a46663ce2621d891a17674711b111cf522987edc6e`.
- Authenticated PHP UAT passed Scheduled, Makeup across month/year, Extra, Actual Walk Activity, unchanged Scheduled Compliance, three same-day rounds, retry idempotency, scheduled duplicate rejection, rotation and Admin reads. Activity result was 7 total: 2 Scheduled, 2 Makeup and 3 Extra.
- Authenticated Chrome UAT passed at 390x844 with expected cache assets, three selectable same-day rounds, prior-year Makeup, no overflow and zero console errors.
- All marked fixture rows were removed from employees, teams, members, rotations, sessions, Attendance, leave and outbox; residue is `0`. Both temporary helpers were removed and return HTTP `404`.
- Final anomalies retained read-only: five orphan scheduled links, nine unlinked legacy normal rows and one valid multiple-round date; no team conflict or duplicate scheduled completion.
- The configured password-based User/Admin UAT credentials return `401`. Isolated short-lived server-signed fixture tokens were used instead; no password or real employee record was changed.

## Accepted behavior

- `Scheduled` links the check-in to one Admin-created `Patrol_Sessions.SessionID` assigned to the user's effective team for the actual day. When multiple rounds exist on that day, the user must select one.
- `Makeup` links the actual check-in date to any earlier missed scheduled round that belongs to the user under the Admin-configured Team/Member Rotation calendar. It can cross month and year boundaries. The linked scheduled round becomes completed while the activity is counted in the month/year actually walked.
- `Extra` is intentionally unlinked. It appears as extra activity, counts in Actual Walk Activity for the actual month/year, and never completes a scheduled round—even when performed on the same day as that round.
- Scheduled Compliance remains `completed scheduled rounds / due scheduled rounds`. Extra activity does not change its numerator or denominator.
- Legacy attendance is not rewritten. An unlinked pre-v2 attendance row can satisfy at most one same-date scheduled round. New v2 Extra rows are distinguishable from that compatibility fallback.
- A request idempotency key prevents double-click and network retry duplication. Reusing the same key returns the existing check-in; a new key intentionally creates another Extra walk.
- One employee may have one base Patrol team. Monthly changes use `Patrol_Member_Rotation`. Conflicting base memberships fail closed and are reported by a SELECT-only audit.

## Source of truth and API compatibility

The calendar resolver uses `Patrol_Team_Members`, `Patrol_Member_Rotation`, `Patrol_Team_Rotation`, and `Patrol_Sessions` maintained in System Control. The existing endpoints remain in place. Responses only gain additive fields such as `features.checkinV2Enabled`, `actualActivity`, and the check-in `mode`.

The v2 behavior is gated by `App_Settings.patrol_checkin_v2_enabled`. Migration defaults the flag to `0`. Local verification explicitly enables it. With the flag off, the previous same-month makeup and date/type duplicate behavior remains available as operational fallback.

## Schema change

`Patrol_Attendance.IdempotencyKey VARCHAR(80) NULL`, unique request index `uq_patrol_attendance_user_request (UserID, IdempotencyKey)`, unique round-completion index `uq_patrol_attendance_user_session (UserID, ScheduledSessionID)`, and unique base-membership index `uq_patrol_team_members_employee (EmployeeID)` are additive. Existing attendance rows remain `NULL`, and MySQL permits multiple `NULL` values in these attendance indexes. The unique indexes are applied only after the read-only duplicate audits pass. No attendance row is updated or deleted by the migration.

Files:

- `backend/migrations/20260902_patrol_checkin_v2.sql`
- `backend/migrations/20260902_patrol_checkin_v2.rollback.sql`

The rollback is operational: set the feature flag to `0` and restore runtime files. The new nullable column/index should normally remain because new rows may reference idempotency keys; destructive schema rollback is intentionally excluded.

## Local verification commands

```powershell
npm --prefix backend run migrate:patrol-checkin-v2-local
npm --prefix backend run audit:patrol-checkin-v2
npm --prefix backend run test:patrol-checkin-v2
npm --prefix backend run uat:patrol-checkin-v2-local
npm --prefix backend run uat:patrol-checkin-v2-php-local
npm --prefix backend run uat:patrol-checkin-v2-browser
npm --prefix backend test
```

The lifecycle UAT scripts refuse a non-local database, use unique markers, and delete their fixtures. Coverage includes Normal/Scheduled, Makeup, Extra, cross-month, cross-year, multiple rounds on one day, sequential and concurrent retry, legacy fallback, Member Rotation, base-team conflict, Node/PHP parity, mobile modal behavior, and residue count zero.

Final Local result on 2026-09-02:

- Additive migration rerun: passed and idempotent; request/session/member unique indexes and feature flag verified.
- Patrol contract and Node/PHP parity test: passed.
- Node lifecycle UAT: passed; residue `0`.
- PHP shared-hosting compatibility lifecycle UAT: passed; residue `0`.
- Authenticated Chrome 390 px UAT: passed with Scheduled/Makeup/Extra controls, two same-day rounds, prior-year Makeup picker, no horizontal overflow, no console error, and residue `0`.
- Full `npm --prefix backend test`: passed, including 133/133 read/permission preflight surfaces.
- Node syntax, PHP lint, `git diff --check`, replacement-character scan, and added-line mojibake scan: passed. Git emitted only the repository's expected LF-to-CRLF working-tree warnings.

## Read-only anomalies found locally

- Five attendance rows reference `ScheduledSessionID` values that no longer exist in `Patrol_Sessions`.
- Ten unlinked legacy normal rows were found after trimming and normalizing `PatrolType`.
- No employee was found in more than one base Patrol team at audit time.
- No duplicate `(UserID, ScheduledSessionID)` completion was found, so the unique round-completion index can be applied safely.
- One team/date already contains multiple scheduled rounds; this is valid under v2 and was retained.

These rows were not changed. Orphan links still count as Actual Walk Activity but cannot be used to infer a scheduled calendar completion because their source session is absent.

## Phase 9 deployment plan (executed on dev)

1. Confirm the accepted Local commit/file list and maintenance window. Keep `patrol_checkin_v2_enabled=0`.
2. Take a fresh database backup plus runtime-file backup. Record backup IDs, timestamps, sizes, and restore verification.
3. Run the SELECT-only Patrol audit on the target and archive its result. Stop if duplicate base-team memberships exist; report orphan/legacy counts without modifying them.
4. Dry-review the additive migration against the target schema. Apply it once, verify the nullable column, unique index, default-disabled flag, and unchanged attendance row count.
5. Upload only the approved Patrol runtime/frontend files. Download them to a verification folder and compare SHA-256 for every file.
6. While the flag remains off, run authenticated Admin/User health and legacy-path smoke checks on the PHP compatibility route.
7. Set `patrol_checkin_v2_enabled=1`, then smoke User and Admin flows: Scheduled (including two rounds), cross-month/year Makeup, Extra, retry, monthly plan, detail statistics, calendar colors, rotation, and BBS 403 console suppression.
8. Use uniquely marked smoke rows. Delete every created attendance/session/team/member/rotation/employee/outbox row and verify residue is `0`.
9. Record results and keep the environment in the approved development scope. Do not roll out to Production. GitHub synchronization must remain limited to the reviewed Patrol-only release commit.

## Phase 9 rollback

1. Immediately set `patrol_checkin_v2_enabled=0`.
2. Restore the backed-up runtime files and verify SHA-256.
3. Keep the additive nullable column/index and all Attendance history; do not mass-edit or delete attendance.
4. Re-run login, Patrol reads, legacy check-in behavior, and database integrity checks.
5. Restore the database only if migration integrity failed and only from the fresh verified backup. Document the reason and post-restore row counts.

## Residual risks

- Old unlinked attendance has no explicit historical intent. Compatibility assigns such rows in stable session order, one row to at most one same-day scheduled round. It cannot reconstruct which same-day round a user originally intended.
- Orphan `ScheduledSessionID` rows require a separate business-led reconciliation; this release deliberately does not repair them.
- Feature enablement must occur only after schema migration. Enabling first would make v2 writes depend on a missing column/index.
- Shared-hosting PHP timezone must remain Asia/Bangkok (the application default) so the server-authoritative actual date matches the business day.
