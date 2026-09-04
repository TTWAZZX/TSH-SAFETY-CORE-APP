# TSH Safety Core Activity - Deployment

## CCCF Phase C1-C4 Ownership, Delegation and Review Queue release (2026-09-04)

The approved CCCF release is deployed to the shared-hosting PHP target at `dev.tshpcl.com/safety/tsh-safety-core`. It contains only `index.html`, `public/js/main.js`, `public/js/pages/cccf.js`, and `api/handlers/workflow_phase6.php`. The schema change is additive only: `SubmittedByEmployeeID`, `SubmittedByName`, and `cccf_submit_delegations`; no existing Permanent row, private upload or SMTP data was changed.

- Production SQL backup: `backups/production/cccf-c1c4-20260904-081838/production-before-cccf-migration.sql` (2,544,468 bytes; SHA-256 `A2D2EC9D19EB26D90F3E6E611A4985DC66D90661A8FAD89DD6BCEB8875F7C847`).
- Runtime rollback backup: `backups/production/cccf-c1c4-20260904-081838/application-before`.
- Migration result: all `37` existing Permanent rows remained; both actor columns and `cccf_submit_delegations` were verified.
- FTPS download-back verification: `backups/production/cccf-c1c4-20260904-081838/application-after`; SHA-256 matched `4/4` files.
- HTTPS smoke passed for the cache-busted `index.html`, `main.js` and `cccf.js`, and schema probe passed. The temporary token-protected helper was removed through FTPS and its URL returns HTTP `404`.

## Safety Patrol Top/Management and Sec/Supervisor UI release (2026-09-03)

The approved Safety Patrol UI/API projection is deployed to the shared-hosting PHP target at `dev.tshpcl.com/safety/tsh-safety-core`. The scoped release contains only `index.html`, Production-derived `public/js/main.js`, `public/js/pages/patrol.js`, and `api/handlers/patrol.php`. It adds no schema or database/data mutation, and does not alter check-in, quota, target, roster, session, rotation, schedule, or Attendance rules.

- Runtime rollback backup: `backups/production/patrol-supervisor-ui-predeploy-20260903-102020` (four Production files before upload).
- Release candidate: `backups/production/patrol-supervisor-ui-candidate-20260903-102020`.
- FTPS download-back verification: `backups/production/patrol-supervisor-ui-upload-verify-20260903-102020`; SHA-256 matched `4/4` files.
- HTTPS read-only smoke passed: `index.html` serves the new main cache key, `main.js` serves the new Patrol cache key, the Patrol page exposes the new Supervisor projection, and unauthenticated `/api/patrol/my-self-patrol` correctly returns `401`.
- Authenticated Top & Management/Sec. & Supervisor API smoke could not run because the local `PROD_UAT_*` login credentials are rejected by this target with `401`; no retry or test data was created. Complete the role smoke with valid target-specific UAT credentials before any further Patrol release.

## Safety Patrol Check-in v2 dev deployment record (2026-09-02)

Safety Patrol Check-in v2 is deployed and verified on `dev.tshpcl.com` only. Production was not rolled out. The Patrol-only source is included in its dedicated GitHub release commit. The shared-hosting PHP release was limited to `index.html`, `public/js/main.js`, `public/js/api.js`, `public/js/pages/patrol.js`, `api/handlers/patrol.php` and `deploy-manifest.json`; the Node route remains the Local development parity implementation.

Backup and verification references:

- Verified database backup: `backups/production/patrol-checkin-v2-dev-predeploy-20260902-184046/patrol-checkin-v2-dev-predeploy-20260902-184046.sql.gz` (185 tables, 15,996 rows, 1,441,927 bytes, SHA-256 `e993a46a8d8d52d541a1d9251463f9c58c8416eb154b160d7f5846de3869215b`; download hash matched and gzip validation passed).
- A preliminary server-side backup `patrol-checkin-v2-dev-predeploy-20260902-183953` was retained in the same HTTP-denied backup storage. It was superseded because the FTP account correctly could not read private storage directly; it was not used for restore evidence.
- Runtime rollback backup: `backups/production/patrol-checkin-v2-dev-predeploy-20260902-183249` (the six pre-deploy files and hashes).
- Exact scoped candidate: `backups/production/patrol-checkin-v2-dev-candidate-20260902-184300`.
- FTPS download-back verification: `backups/production/patrol-checkin-v2-dev-upload-verify-20260902-184700` (six runtime files matched; final manifest SHA-256 `8ae52c59fe5106ce005cd3a46663ce2621d891a17674711b111cf522987edc6e`).
- HTTPS verification: `backups/production/patrol-checkin-v2-dev-https-verify-20260902-185200` (`4/4` public static assets matched).

The additive migration retained `384/384` Attendance rows, installed the nullable idempotency column and all three unique indexes, and kept the flag off until runtime verification. The final flag is `patrol_checkin_v2_enabled=1`. Authenticated PHP UAT passed Scheduled, cross-month/year Makeup, Extra, three same-day rounds, scheduled-round duplicate rejection, concurrent retry idempotency, Member Rotation, Actual Walk Activity and Scheduled Compliance. The observed activity split was 7 total: 2 Scheduled, 2 Makeup and 3 Extra. Chrome 390x844 passed with the expected cache assets, three selectable same-day rounds, prior-year Makeup, no overflow and zero console errors. All temporary employees, teams, members, rotations, sessions, Attendance, leave and outbox rows were removed; remaining count is `0`. Both token-protected helpers were removed through FTPS and return HTTP `404`.

The final read-only audit reports no base-team conflict and no duplicate `(UserID,ScheduledSessionID)`, while retaining five pre-existing orphan session links, nine unlinked legacy normal rows and one valid multiple-round date. These records were not repaired or deleted. The configured User/Admin password credentials currently return `401`; deployment UAT therefore used short-lived server-signed tokens for isolated onboarding-ready fixtures. Operational rollback sets the flag to `0`, restores the six runtime files from the runtime backup and preserves the additive schema plus all Attendance history. Database restore is reserved for an integrity incident and uses the verified backup above.

## BBS Automatic Checklist References Production record (2026-09-02)

The server-generated Checklist Template/Item reference release is deployed to the shared-hosting PHP Production target. The release was limited to `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `api/handlers/bbs_checklists.php`, `api/lib/bbs_checklist.php` and `deploy-manifest.json`. No schema, existing business data, authorization, resolver rule, private-upload path or rollout setting changed; `staged_admin_only=1` remains authoritative.

Backup and verification references:

- Production database backup: `backups/production/bbs-auto-reference-production-20260902-050849/bbs-auto-reference-production-20260902-050849.sql.gz` (185 tables, 15,791 rows, 1,470,054 bytes, SHA-256 `49d2dcf10ff99860aa1977f51791702a90d1d2cf7e5a60cb84cab9107a80e7e5`)
- Application/BBS private-upload rollback backup: `backups/production/bbs-auto-reference-predeploy-20260902-115729` (six application files, both private deny files and four empty BBS private directories)
- Exact candidate: `backups/production/bbs-auto-reference-deploy-candidate-20260902-115805`
- FTPS download-back and HTTPS verification: `backups/production/bbs-auto-reference-upload-verify-20260902-115840` (FTPS `6/6`, HTTPS `4/4`, final manifest SHA-256 `4f9aaac1ee05fdeaeccfb50a0217c466aa4a9c243d78820dde0f3e6c050557c0`)
- Authenticated write smoke: Admin created a temporary Checklist without a supplied Template code (`201`), PHP generated a canonical `BBS-CHK-...` reference and `C01-I001`; ordinary User remained `403` and anonymous QR remained `401`.
- Normal-login Chrome UAT: all eight BBS tabs passed at 320x568, 390x844 and 844x390 with zero console errors.

The temporary Checklist/version/items/scopes/audit rows were removed and verified at `0`. Both token-protected deployment helpers were removed, are absent by FTPS and return HTTP `404`. Normal rollback restores the five runtime files and prior manifest from the application backup; database/private restore is reserved for an authorized data incident.

## BBS Foundation Admin Readiness Production record (2026-09-02)

The System Console `BBS Foundation` readiness/guided-setup UI is deployed to the shared-hosting PHP Production target. The release was limited to `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `public/js/pages/bbs-smart-card.js` and `deploy-manifest.json`; no API, schema, business data, private-upload path or rollout setting changed. `staged_admin_only=1` remains authoritative, so this release is Admin-only.

Backup and verification references:

- Database backup: `backups/production/fourm-controlled-uat-prebackup-20260902-085541/__codex_fourm_uat_full_20260902_015557_70d0ca6d.sql.gz` (185 tables, 1,464,971 bytes, SHA-256 `6d170371c8fc472ee3c9cb11415835799405540947b8648b02beaca54a504832`)
- Final application rollback backup: `backups/production/bbs-foundation-readiness-predeploy-20260902-090611`
- Final candidate/download-back evidence: `backups/production/bbs-foundation-readiness-upload-verify-20260902-090626` (FTP `5/5`, HTTPS `4/4`)
- Authenticated API smoke: `backups/production/bbs-phase10e-production-smoke-20260902T020649` (Admin reads `200`, ordinary user `403`, anonymous QR `401`)
- Authenticated Chrome UAT: System Console/BBS Foundation passed Desktop and 390 px Mobile, 23 Master Positions, Checklist Builder/Excel exchange, Department/Safety Unit readiness and BBS workspace deep-link with zero console errors.

No test business row/file was created and temporary Production files remaining are `0`. The completed BBS source is included in the 2026-09-02 GitHub synchronization. A normal rollback restores the four runtime files and prior manifest from the final application backup; database restore is not required for this frontend-only release.

## BBS Smart Card Phase 10B-4 / 10D-1 through 10E staged Production record (2026-09-01)

The completed BBS card preview, checklist readiness, KPI semantics, scalable lists, Action Email Outbox, mobile Agenda, Community Risk detail and Controlled Pilot access boundary are deployed to the shared-hosting PHP Production target. Production remains intentionally `staged_admin_only=1` and `pilot_scope_only=0` because the Production database currently has no effective Active Pilot scope, inspector enrollment or team assignment. Admin can perform business UAT and configuration; ordinary users and anonymous QR access remain closed. Company-wide mode was not enabled.

Backup and verification references:

- Full database backup: `backups/production/fourm-controlled-uat-prebackup-20260901-165755/__codex_fourm_uat_full_20260901_095813_0829c202.sql.gz` (185 tables, 1,464,823 bytes, SHA-256 `12532528b7bb75210034f55b58de7265b97a786cad990e9a6d2d1386e21e797f`)
- Application/private-upload rollback backup: `backups/production/bbs-phase10e-predeploy-20260901-170032` (23 existing files; four BBS private directories backed up with 0 files)
- Exact candidate and manifest: `backups/production/bbs-phase10e-deploy-candidate-20260901-170623` (28 files; manifest SHA-256 `ca6af5c2cd4ca760f9a3362c15780bd652b214b28a72e836128b8e9bdd4e4f78`)
- FTP download-back verification: `backups/production/bbs-phase10e-upload-verify-20260901-171150` (`28/28` plus manifest)
- HTTPS static verification: `backups/production/bbs-phase10e-https-verify-20260901-171650` (`4/4`)
- Authenticated API smoke: `backups/production/bbs-phase10e-production-smoke-20260901T101210` (Admin reads `200`, ordinary user `403`, anonymous QR `401`)
- Normal-login Chrome UAT: all 8 tabs passed at 320x568, 390x844 and 844x390 with zero console errors.

The additive `pilot_scope_only` setting was installed and the safe gate was explicitly retained at `1/0`. No employee, Pilot scope, enrollment, team assignment, Checklist, card/template, Community handler, Observation, Action or test business row was created. Temporary row/file residue is `0`; the rollout helper was removed and returns HTTP `404`. To open Controlled Pilot later, configure the real Production Pilot scope/roster/Checklist and rerun the Phase 10E gate before a separately approved `0/1` change.

## BBS Smart Card Phase 10E Controlled Pilot activation gate (not yet approved)

Local Pilot configuration has been applied through the established authenticated APIs for Inspector `002671` and Operator `012816`; it is not a Production migration. Production business configuration remains unchanged and must not receive these Local business rows implicitly.

Do not open company-wide access unless `npm --prefix backend run audit:bbs-phase10e` reports `READY_FOR_ROLLOUT_REVIEW` and the business owner gives explicit approval. During Production setup retain `staged_admin_only=1`. After fresh backups and explicit Pilot-test approval, Controlled Pilot UAT may use `staged_admin_only=0` with `pilot_scope_only=1`; only Admin, effective appointed inspectors and effective assigned Pilot members can enter. Same-scope unassigned users and anonymous QR requests must remain blocked.

After approval, take fresh verified MySQL/MariaDB, private-upload and application backups before changing the gate. Deploy only reviewed files, apply `20260901_bbs_phase10e_controlled_pilot_access.sql`, verify download-back SHA-256, smoke Admin with Admin-only still enabled, then switch to `0/1` and run the multi-role phone/desktop Pilot matrix. Verify Admin `200`, an appointed inspector/member `200`, an unassigned same-scope user `403`, an unrelated user `403`, Pilot denial on Admin APIs `403`, and anonymous QR `401`. Immediately restore `staged_admin_only=1` and `pilot_scope_only=0` for any critical failure. Remove every temporary test row/file and record remaining count `0`; retain backup identifiers and the rollback manifest.

Local preparation applied `backend/migrations/20260901_bbs_phase10e_staged_admin_gate.sql` on 2026-09-01 and verified `staged_admin_only=1` with 0 business rows created. This was not a Production deployment. Production already requires the value `1`; do not run a gate-changing rollout action until the separate approval above.

## BBS Smart Card Phase 10B-1 through 10C-3 staged Production record (2026-08-31)

The completed BBS frontend integration, guided Card Admin workspaces, Master-data readiness, workflow recovery, mobile/accessibility hardening and runtime retry protection are deployed to the shared-hosting PHP Production target. The release was intentionally limited to `index.html`, `public/js/main.js` and `public/js/pages/bbs-smart-card.js`; no API, schema, upload path or business configuration changed. `BBS_Settings.staged_admin_only=1` remains enforced, so Admin access succeeds while authenticated non-Admin and anonymous access remain blocked.

Backup and verification references:

- Application rollback backup: `backups/production/bbs-phase10c3-predeploy-20260831-164050`
- Database backup: `backend/private-uploads/deployment-backups/bbs-phase10c3-predeploy-20260831-164456/bbs-phase10c3-predeploy-20260831-164456.sql.gz` (185 tables, 15,759 rows, SHA-256 `b99983807cfbf413688698556a709531bd8fc7dc7976ffd50291673463690505`)
- Upload-storage backup: `backend/private-uploads/deployment-backups/bbs-phase10c3-predeploy-20260831-164456/bbs-phase10c3-predeploy-20260831-164456-uploads.zip` (91 files, SHA-256 `a01b6dc5bf8d24ebceec263fec478a10f292a92a026af691b19cb6471fedf5f7`)
- FTPS download-back SHA-256: `backups/production/bbs-phase10c3-upload-verify-20260831-164842` (`3/3`)
- Public HTTPS SHA-256/cache verification: `backups/production/bbs-phase10c3-https-verify-20260831-164919` (`3/3`)
- Authenticated API smoke: `backups/production/bbs-phase10c3-production-smoke-20260831-165136` (Admin context/foundation/cards `200`, non-Admin `403`, anonymous `401`)
- Authenticated Chrome UAT used the normal Production login flow and passed all 8 BBS tabs at 320x568, 390x844 and 844x390 with zero console errors.

The backup helper was removed and returns HTTP `404`. No temporary business row/file was created, remaining count is `0`, and rollback restores the three runtime paths from the application backup. Database/upload archives are incident-recovery safeguards and are not required for a normal frontend rollback.

## KY chunked video and Forklift renewal retry Production record (2026-08-31)

The shared-hosting PHP Production runtime now uses the 5 MB KY chunk upload flow and the retry-safe Forklift renewal workflow. The release was limited to `index.html`, a Production-derived `public/js/main.js`, both module page files, and the two existing PHP handlers. BBS remained on `bbs-smart-card.js?v=20260827-bbs-phase10a`; no local Phase 10B/10C frontend or API file was released.

Backup and verification references:

- Application rollback backup: `backups/production/ky-forklift-predeploy-20260831-115425`
- Database backup: `backend/private-uploads/deployment-backups/ky-forklift-predeploy-20260831-115425.sql.gz` (185 tables, 15,799 rows, SHA-256 `85b451ef07b99f4eda6c54cd4313f93120c51c6d5eb98bed32c89479c6205802`)
- Upload-storage backup: `backend/private-uploads/deployment-backups/ky-forklift-predeploy-20260831-115425-uploads.zip` (93 files, SHA-256 `9873304c5f5870ccc56521b23a8fd8cd4800e22649b91eb533d55b4367ef5693`)
- Exact deploy candidate: `backups/production/ky-forklift-deploy-candidate-20260831-115425`
- FTPS download-back SHA-256: `backups/production/ky-forklift-upload-verify-20260831-143122` (`6/6`)
- Public HTTPS SHA-256/cache guard: `backups/production/ky-forklift-https-verify-20260831-144608` (`4/4`)
- Authenticated write smoke: `backups/production/ky-forklift-production-smoke-20260831074343` (15 checks; all temporary rows/files/audit/chunks remaining `0`)
- Authenticated Chrome smoke: `backups/production/ky-forklift-browser-smoke-20260831T074745` (both modules visible, expected cache assets loaded, no overflow and zero console errors)
- Final deploy-manifest FTPS/HTTPS verification: `backups/production/ky-forklift-final-manifest-verify-20260831-145124` (local, FTPS download-back and HTTPS SHA-256 all `379b4e6d09c038cc15ef93ad7fbc7f1376266827bc245b0f6e697c6ba617b01d`)

Local verification passed PHP/Node/JavaScript syntax, KY chunk contracts and real PHP lifecycle, Forklift contract `46/46`, Forklift lifecycle `20/20`, the full backend regression and read/permission preflight `131/131`. Production smoke verified a two-part KY upload including safe part retry, incomplete-completion rejection and final SHA-256, plus Forklift same-Draft renewal retry and `sourceLicenseId` recovery. Temporary helpers were deleted and return HTTP `404`; backup files remain HTTP-denied with `403`. No schema migration or existing business-data deletion occurred. Rollback restores the six runtime paths from the application backup; restore the database/upload archives only for an authorized data incident.

## KY Employee Master search Production record (2026-08-31)

The KY submit-tab runtime fix is deployed to the shared-hosting PHP Production target. The upload was intentionally limited to `index.html`, a `public/js/main.js` candidate derived from the downloaded Production file, and `public/js/pages/ky.js`. The candidate advanced only the KY cache key to `20260831-ky-search-r1` and retained `bbs-smart-card.js?v=20260827-bbs-phase10a`; local BBS Phase 10B work was not deployed.

Rollback and verification references:

- Production application backup: `backups/production/ky-search-predeploy-20260831-093217`
- Exact deploy candidate: `backups/production/ky-search-deploy-candidate-20260831-093217`
- FTPS download-back SHA-256: `backups/production/ky-search-upload-verify-20260831-093635` (`3/3`)
- Public HTTPS SHA-256 and cache markers: `backups/production/ky-search-static-smoke-20260831-093756` (`3/3`)
- Observed FTPS certificate SHA-256 fingerprint: `02:11:09:56:F5:00:E7:2E:32:A5:51:78:E4:08:AD:1A:56:90:2A:EB:9A:4B:DE:DF:54:84:75:A6:2D:0A:68:0F`

Pre-deploy verification passed the full backend regression and read-only preflight `131/131`, KY Node/PHP count parity, JavaScript syntax and authenticated local Chrome search. Production smoke passed authenticated `/api/ky/employees` lookup plus Chrome reporter lookup/selection, participant lookup and zero console errors. No schema, database data, upload storage or KY business record changed. Rollback restores the same three paths from the application backup; no database restore is required.

## BBS Smart Card Admin-only staged Production record (2026-08-27)

Phases 1-10A are installed on the shared-hosting PHP Production runtime with `BBS_Settings.staged_admin_only=1`. Keep this flag enabled until the Tube Cutting Pilot audit is `READY` and the business owner separately approves ordinary-user rollout. In staged mode, Admin BBS requests succeed, authenticated non-Admin requests fail `403`, and anonymous BBS requests fail `401`.

Rollback references:

- Full Production database backup: `backend/private-uploads/deployment-backups/bbs-smart-card-predeploy-20260827-022206.sql.gz`
- Backup ID: `bbs-smart-card-predeploy-20260827-022206`
- Database backup SHA-256: `2a77efd8f0c6d9796c36722010058a8ede13da60021a75fe1d62a5ce897aed46`
- Application rollback files: `backups/production/bbs-smart-card-stage-predeploy-20260827-090333`
- Upload verification: `backups/production/bbs-smart-card-stage-upload-verify-20260827-130547`
- Final compatibility verification: `backups/production/bbs-smart-card-stage-compat-verify-20260827-132458`
- Mobile browser evidence: `backups/production/bbs-stage-mobile-browser-20260827T063110`

The migration was additive and retained all pre-existing data. Production verification covered 38 BBS tables, the Admin read surfaces for context/foundation/checklists/inspectors/schedules/cards/Community/analytics, staged denial, private storage denial and a 390x844 responsive browser render. No BBS business test record was created. All temporary deployment helpers, diagnostics and candidate files were removed. Operational rollback should first keep or restore `staged_admin_only=1`; do not drop BBS tables or restore the database unless an authorized incident requires it.

## BBS Smart Card Phase 9 pre-deployment note (not yet approved)

Phase 9 is local only. A future approved rollout must take a fresh verified Production database/application backup, then apply `backend/migrations/20260826_bbs_phase9_inspector_team_management.sql` before uploading the matching Node/PHP/frontend files. Verify both new tables and `inspector_team_management_enabled=1`, smoke Admin appointment plus owning-Group-Leader team access on both runtimes, and remove all smoke rows/events. Rollback uses `20260826_bbs_phase9_inspector_team_management.rollback.sql` to disable the feature without deleting enrollment, team, Observation, Action or audit history. No upload directory or storage permission changes are required.


## BBS Smart Card Phase 8 Production Runbook (prepared; not deployed)

Do not deploy Phase 8 without explicit user approval. First complete the Phase 7 Pilot gates, take fresh verified backups of MySQL/MariaDB, application files and all private uploads, then apply `backend/migrations/20260826_bbs_phase8_department_community.sql`. Verify all 8 `BBS_Department_*` / `BBS_Community_*` tables plus `community_reporting_enabled=1` and `department_cards_enabled=1`.

Create and verify writable, direct-HTTP-denied directories `backend/private-uploads/bbs-card-templates` and `backend/private-uploads/bbs-community`. Upload only the Node/PHP/frontend/migration/test/documentation files in the approved manifest, download them, compare SHA-256, and configure an Admin owner plus Admin verifier for every Department before enabling Risky submissions. Smoke both stacks for Good visibility without reporter identity, User denial of Risky data/evidence, immediate Risk Action creation/closure, Department QR issue/rotate/claim, multiple-template preview/print and personal-card Group-Leader minimum. Remove every smoke row/file/QR attempt/audit artifact and record remaining count `0`.

Operational rollback sets `community_reporting_enabled=0` and `department_cards_enabled=0` using `20260826_bbs_phase8_department_community.rollback.sql`; it does not drop tables or delete reports/actions/print history. Restore matching application and private-upload backups only under incident authority.

## BBS Smart Card Phase 7 Controlled Rollout Runbook (prepared; do not deploy without explicit approval)

Phase 7 has no new database migration. The current local build is hardened, but rollout is blocked until the business owner confirms the `MAINTENANCE SEC.` / `Tube Cutting` roster, at least one Operator, effective Active Assignments and one applicable Published Checklist. Run `npm --prefix backend run audit:bbs-phase7-pilot`; readiness must be `READY`, reconciliation must be 100%, and every orphan count must be `0`. Record owner approval and the agreed Pilot window before requesting deployment authority.

Pre-deployment gates:

1. Run Phase 1-7 parity, migration, lifecycle, security/runtime, performance, browser/accessibility and full backend tests. No Critical/High security issue may remain, and every temporary row/file count must be `0`.
2. Take fresh verified Production backups of MySQL/MariaDB, application files, `backend/uploads/` and `backend/private-uploads/`; record backup IDs/paths and restore-verification evidence.
3. Apply the matching Phase 1-6 migrations in order only after a dry inventory confirms they are absent or idempotently current. Keep action notification delivery disabled until separately approved.
4. Build an exact scoped upload manifest, calculate local SHA-256 values, upload only approved BBS/shared dispatch/cache/documentation files, download them again and compare SHA-256 before smoke testing.
5. Confirm writable private BBS directories and direct-HTTP denial. Confirm `PUBLIC_APP_URL` points to the exact Production application base and PHP emits UTF-8 JSON without notices.

Authenticated Production PHP smoke must cover anonymous QR resolve without identity, anonymous claim `401`, outsider claim/object access `403`, self/Admin claim without impersonation, malformed/spoofed uploads, Draft/Submit retry, Unsafe validation, Action lifecycle, report scope/export reconciliation, 1,920px/mobile rendering and accessible control names. Use uniquely marked temporary records only; remove their database rows, private files, QR attempts, outbox and audit artifacts and record remaining count `0`.

During the approved Pilot, reconcile daily KPI numerator/denominator, submitted Observations, Unsafe answers and generated Actions; review `Admin_AuditLogs`, PHP errors, QR throttling and action outbox failures. Escalate any permission leak, data mismatch, unrecoverable submission, unexpected identity, or private-file exposure immediately and pause the Pilot.

Rollback is operational first: disable BBS workspace/analytics/export flags, keep notification delivery off, archive affected Checklists/templates and revoke cards while preserving submitted Observation/Action history. Restore the verified application backup if code rollback is required. Do not run destructive schema rollback after business records exist; use forward repair. A database restore requires explicit incident authority and coordinated restoration of the matching private-upload backup.

## BBS Smart Card Phase 6 Production Runbook (not yet deployed)

Take and verify a fresh Production MySQL, application, `backend/uploads/` and `backend/private-uploads/` backup first. Confirm Phase 1-5 migrations, then apply `backend/migrations/20260825_bbs_phase6_analytics.sql`. Verify `analytics_enabled=1`, `analytics_export_enabled=1` and all four Phase 6 indexes before uploading only the matching Node/PHP/frontend/cache/test/documentation files with SHA-256 verification.

Authenticated smoke Personal, Team, Department and Admin Company scopes on the Production PHP stack. Confirm cross-hierarchy Department/Unit filters return `403`; reconcile one filtered total directly against submitted Observations; verify KPI numerator/denominator; open Safe/Unsafe and overdue drill-down; export Excel/PDF/Print and confirm the displayed filters/totals match. Create no permanent test records; if a temporary Observation/Action is necessary, remove every row/file/audit artifact and record remaining count `0`. Rollback applies `20260825_bbs_phase6_analytics.rollback.sql`, which disables analytics and export without changing Observation or Action workflows.

## BBS Smart Card Phase 5 Production Runbook (not yet deployed)

Take a fresh production MySQL plus `backend/uploads/` and `backend/private-uploads/` backup first. Apply `backend/migrations/20260825_bbs_phase5_corrective_actions.sql`, verify all five Phase 5 tables, then upload only the Phase 5 Node/PHP/frontend/docs files with SHA-256 verification. Keep `action_notifications_enabled=0` during smoke tests.

Smoke one temporary Unsafe action through Open, In Progress, After evidence, Pending Verification, Closed and Reopened on the production PHP stack. Verify Owner/Verifier access, invalid transition rejection, action history and outbox suppression. Delete every temporary outbox/history/file/action/answer/observation record and private evidence file, and record remaining count `0`. Only enable delivery after explicit approval and an SMTP/outbox retry check. Rollback uses `20260825_bbs_phase5_corrective_actions.rollback.sql`: it disables delivery and deliberately preserves action audit data.

## BBS Smart Card Phase 4 Production Runbook (not yet deployed)

Take and verify a fresh Production database, application, public upload, and
private upload backup. Confirm Phase 1-3 migrations, then apply
`backend/migrations/20260825_bbs_phase4_cards.sql`. Verify the four Phase 4
tables and `BBS_Settings.qr_resolve_limit_5m=30` before uploading the matching
Node/PHP routes, services, SPA/cache files, and synchronized documentation.
Confirm `uq_bbs_card_one_active_employee` exists on `BBS_Cards`.

Create writable `backend/private-uploads/bbs-card-templates` and preserve the
parent deny-all rule. Configure `PUBLIC_APP_URL`/`public_app_url` to the exact
Production `index.html` base, and include card templates in private-storage
backups. Never expose this directory as static content.

Authenticated smoke must cover template content/type/size checks, same-scope
activation, issue and duplicate rejection, public resolve without identity,
outsider claim `403`, self/Admin claim without session impersonation,
replacement invalidating the old QR, reasoned revocation, CR80/A4 print, print
log, and rate limit. Remove all smoke cards/templates/files/attempt rows and
record residue `0`. Use archive/revoke for operational rollback; do not drop
tables once cards have been issued.

## BBS Smart Card Phase 3 Production Runbook (not yet deployed)

Take verified Production database, application, public upload, and private
evidence backups. Confirm Phase 1/2, then apply
`backend/migrations/20260825_bbs_phase3_observations.sql`. Verify three new
tables and `BBS_Settings.workspace_enabled=1` before uploading the Node/PHP
routes, SPA/menu/cache files, and `backend/private-uploads/.htaccess`.

Create writable `backend/private-uploads/bbs` for PHP, but never expose it as a
static alias. Verify direct HTTP access is denied and add it to the MySQL/public
upload backup schedule. Smoke Pilot/Admin visibility, scoped selection,
Checklist resolution, Draft/Submit retry, Unsafe rules, allowed/spoofed files,
outsider 403, histories, KPI, and responsive layout. Remove every smoke row and
file and verify residue `0`. Destructive rollback is allowed only before any
Observation must be retained.

## BBS Smart Card Phase 2B Production Runbook (not yet deployed)

Phase 2B has no new migration and depends on the Phase 1 and Phase 2 tables.
Before deployment, take and verify a fresh Production database/application
backup. Upload only the updated Node/PHP checklist rules/routes, Admin UI,
cache-bust files, and synchronized documents after Phase 1/2 migrations are
confirmed present.

Authenticated smoke must cover Admin Export, valid Preview with no row-count
change, invalid Import with no partial replacement, confirmed Import through
both Node and PHP paths, stale `RowVersion`, non-Admin `403`, and immutable
Published `409`. Verify `BBS_CHECKLIST_IMPORT` audit rows, downloaded workbook
sheet names, cache key `20260825-bbs-phase2b-r1`, and temporary rows remaining
`0`. Phase 2B changes no upload path.

## BBS Smart Card Phase 2 Production Runbook (not yet deployed)

Phase 2 depends on the completed Phase 1 migration. Take and verify a fresh
Production database/application backup before rollout, then apply
`backend/migrations/20260825_bbs_phase2_checklist_builder.sql`. Verify the five
new checklist tables and `checklist_builder_enabled=1` before uploading the
Node/PHP handlers, Admin UI, cache-bust files, and tests listed in the handoff.

Authenticated smoke coverage must include Admin list/create/save/publish,
published-version update returning 409 `IMMUTABLE_VERSION`, clone, archive,
template deactivate/reactivate, resolver selection, conflict fail-closed, User
403 on Admin endpoints, and absence of the main BBS sidebar entry. Remove all
test templates/versions/categories/items/scopes and record remaining count `0`.

The Phase 2 rollback drops checklist configuration and must never run after
Phase 3 observations reference a Checklist Version. Normal operational rollback
is to deactivate the Template or archive the Version, preserving history.
Phase 2 changes no upload-storage path.

## BBS Smart Card Phase 1 Production Runbook (not yet deployed)

Phase 1 has an additive database migration and must not be deployed as a
frontend-only upload.

Before deployment:

1. Take a fresh Production MySQL/MariaDB backup and record its verified path.
2. Take the normal application/upload-storage rollback backup. Phase 1 does not
   change `backend/uploads/`, but the standard backup boundary remains intact.
3. Run `backend/migrations/20260825_bbs_phase1_foundation.sql` and verify all
   six `BBS_*` tables, five mappings, one KPI rule, and one pilot scope.
4. Upload only the Phase 1 route, handler, service, Admin UI/cache-bust, and
   dispatch files listed in the handoff.
5. Verify SHA-256 download-back before authenticated smoke tests.

Smoke Admin and User context, Admin foundation access, User 403 on Admin APIs,
pilot Master IDs, Department isolation, and absence of the main BBS menu. Clean
all temporary rows/helpers and record remaining count `0`.

Rollback code/routes and cache references first. The provided
`20260825_bbs_phase1_foundation.rollback.sql` is safe only while the tables
contain configuration-only Phase 1 data and no later phase depends on them.

## Local Run Instructions

## Running Locally

```bash
cd backend
node server.js      # runs on PORT=5000
```

Run verification from the repo root:

```bash
npm test
npm run backup
```

## Shared Hosting / PHP Production Target

Production currently targets the company shared hosting/PHP API path backed by Company MySQL/MariaDB and local server upload storage. Node/Express is retained for local/dev parity unless a task explicitly changes the production target.

## Company Server Deployment

Run the backend as a normal Node.js process on the company server and serve the frontend static files from Apache/IIS/Nginx or another approved web server.

Required server items:
- Company MySQL/MariaDB database imported with the latest `safety_core_activity` SQL.
- `backend/.env` configured for company MySQL.
- `PUBLIC_UPLOAD_BASE_URL` set to the backend URL users can reach.
- `ALLOWED_ORIGINS` set to the real frontend origins only.
- `backend/uploads/` retained on disk and backed up together with MySQL.

Example production env shape:

```env
PORT=5000
JWT_SECRET=...
ALLOWED_ORIGINS=http://company-frontend
DB_HOST=company-mysql-host
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=safety_core_activity
DB_SSL=false
PUBLIC_UPLOAD_BASE_URL=http://company-backend:5000
```

Before rollout:

```bash
npm test
npm run backup
```

## FTP Path Notes

- Upload only the files required for the phase.
- Preserve directory paths exactly, especially `api/`, `public/js/`, `public/js/pages/`, `backend/routes/`, and root files such as `index.html`.
- Do not leave temporary smoke helper files on production.

## Backup Process

- Take a production backup before production-impacting changes.
- Include changed code files and a read-only data snapshot when the smoke test needs DB verification.
- Back up upload storage together with MySQL when upload/file behavior changes.
- Record backup folder names and timestamps in `CHANGELOG.md`.

## SHA-256 Verification Process

- After FTP upload, download each uploaded file into a verify folder.
- Compare local and downloaded SHA-256 hashes.
- Keep verify downloads under the matching `backups/production/*-upload-verify-*` folder when used for a phase.
- Do not proceed to smoke testing until changed production files verify.

## Smoke Test Process

- Use a unique marker for each smoke run.
- Prefer read-only smoke tests when possible.
- When a write smoke is required, create temporary rows with a marker, verify behavior, delete them, and confirm remaining count `0`.
- Verify HTTP status, JSON content type/shape, auth boundaries, and route dispatch before declaring production smoke passed.

## Rollback Notes

- Restore files from the matching phase backup folder.
- Restore DB from the matching production backup only when schema/data changes were applied.
- Re-run SHA-256 verification after rollback upload.
- Re-run the smoke path that failed plus a basic login/API health check.

## Cleanup Rules For Temporary Test Data

- Delete temporary smoke helpers from production and verify HTTP `404` or absent FTP listing.
- Delete temporary employees/records/files created by smoke tests.
- Record cleanup result and remaining count.
- Never leave test data in production as a handoff shortcut.

## Safety Patrol Check-in v2 — Phase 9

The dev-only phase was executed and verified on 2026-09-02. Follow `docs/safety-patrol-checkin-v2-local-handoff.md` for evidence and rollback details. Production rollout remains separately gated.

- Back up database and the exact runtime files before applying anything; record and verify the backup.
- Run the SELECT-only team/link audit and stop on duplicate base-team membership.
- Apply `backend/migrations/20260902_patrol_checkin_v2.sql` while `patrol_checkin_v2_enabled=0`; verify column, unique index, flag, and unchanged Attendance row count.
- Upload only approved Patrol/frontend files and verify downloaded SHA-256 hashes.
- Smoke PHP shared-hosting routes with the flag off, then enable the flag and test User/Admin Scheduled, Makeup, Extra, multiple rounds, statistics, calendar, and retries.
- Remove all uniquely marked smoke records and verify residue `0`.
- Roll back operationally by disabling the flag and restoring runtime files. Preserve Attendance and normally preserve the additive nullable column/index.
