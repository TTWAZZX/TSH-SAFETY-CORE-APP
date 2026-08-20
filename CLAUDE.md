# TSH Safety Core Activity - AI Quick Start

## Project Overview

ระบบจัดการกิจกรรมความปลอดภัย (Safety Core Activity) สำหรับองค์กร TSH
ภาษา UI: ภาษาไทย (ข้อความ error/success ทุกอย่างเป็นภาษาไทย)

## Current Production Handoff (2026-08-17)

- Fixed System Console > Safety Core Data KY Ability counts for departments with multiple Safety Units.
- KY progress is now counted by distinct activity month (maximum 12 monthly slots per year), and a unit-scoped KY row credits only employees in the same Department + Safety Unit. Employees without a Unit use distinct department months as a fallback; explicit reporter/submitter/participant credit remains supported.
- Node development and PHP production implementations are aligned. Production deploy `safety-core-ky-unit-monthly-fix-20260817` completed with FTP SHA-256 verification and authenticated read-only smoke. No MySQL schema, data, or upload-storage change was required.
- Focused parity regression: `npm --prefix backend run test:safety-core-ky`.

## Current Safety Patrol Handoff (2026-08-18)

- Safety Patrol > Issues close-review double-submit handling is fixed and
  deployed.
- The frontend disables Approve/Reject during an in-flight review. PHP and Node
  update only rows still in `Pending` and treat a repeated identical action as
  successful without creating duplicate events, audit rows, or emails.
- Close approval/rejection email recipients are the close requester and the
  original reporter, sourced from Employee Master `CompanyEmail` and
  de-duplicated by address.
- No MySQL schema, business-data, or `backend/uploads/` change is required.
- Syntax, PHP lint, diff, and encoding checks passed. Full backend verification
  subsequently passed with local MySQL available, including API smoke and the
  91/91 read/permission UAT preflight.
- Production deploy completed with rollback backup
  `backups/production/patrol-close-review-idempotent-predeploy-20260818-084228/`,
  FTP SHA-256 verification 5/5, and authenticated smoke 6/6. Repeating Approve
  for already-approved issue `#90042` returned HTTP 200 with no duplicate event
  or email. No temporary rows were created; remaining count is 0.

## Current 4M Change Management Handoff (2026-08-19, deployed)

- Module-scope hotfix r4 (2026-08-20) moved the existing legacy quarantine
  wrapper to the actual duplicate Training Matrix block. This exposes the
  active `fetchTrainingPermissions`, `renderTrainingMatrix`, and related
  functions to `loadFourmPage()` without deleting functions. Regression checks
  12 required symbols in ES-module scope; Production FTP SHA-256 matched 4/4
  including the manifest and HTTP cache/hash smoke passed using
  `20260820-fourm-scope-hotfix-r4`.
- Scope correction r3 (2026-08-20) restored the complete pre-stabilization
  `fourm.js` after the duplicate-code cleanup removed about 1,900 lines. Against
  the restored source, the frontend behavior diff is only four added lines to
  omit an empty optional Notice attachment. The full 8,134-line ES module
  parses successfully; cache key is `20260820-fourm-restore-r3`; Production FTP
  SHA-256 matched 4/4 including the final manifest and HTTP cache/hash smoke
  passed.
- Emergency white-screen hotfix r2 is deployed. Duplicate-code cleanup left an
  incomplete History template, incorrect permissions return, orphaned audit
  lines, and an extra closing brace, causing consecutive ES-module parse
  errors. The complete source now passes an explicit ES-module syntax gate;
  SPA/module cache keys use `20260819-fourm-white-screen-hotfix-r2`.
  Production FTP SHA-256 verification passed 3/3, then final
  manifest-inclusive verification matched 4/4 at
  `backups/production/fourm-white-screen-hotfix-r2-final-verify-20260819-172007/`.
  HTTP smoke matched the exact corrected `fourm.js` hash.
- Closed Change Notices can be edited without uploading a replacement file;
  empty file inputs are ignored by both the frontend and PHP multipart parser.
- Training Matrix PHP writes now validate input, use transactions, return 409
  for duplicates, enforce assignment transfer state/target rules, and record
  explicit curriculum, course, assignment, and Course Master audit actions.
- Production read-only baseline confirmed all Training Matrix endpoints used by
  the frontend return HTTP 200 with the existing schema. Production has no
  Course Master unique index, so duplicate protection is enforced in the PHP
  application layer without adding or altering MySQL columns/indexes.
- The duplicated Training Matrix frontend implementations were consolidated to
  one function per action, with updated SPA/module cache keys. Focused
  regression, syntax/lint, permission audit,
  full backend tests, API smoke, and read-only UAT (91/91) pass locally.
- Email recipients are unchanged: NoticeCreated goes to the configured 4M
  Admin; later notice/task events go to that Admin plus the creator's
  `CompanyEmail`, de-duplicated. Queue failures are non-blocking and now logged.
- Production deploy completed with rollback backup
  `backups/production/fourm-stabilization-predeploy-20260819-152348/`, including
  all five previous runtime files and 774 Production upload files
  (1,143,117,547 bytes). Final FTP SHA-256 download-back matched 5/5 at
  `backups/production/fourm-stabilization-final-verify-20260819-160239/`.
- Authenticated Production smoke passed 11 checks; evidence is
  `backups/production/fourm-stabilization-smoke-20260819T090007Z/result.json`.
  Closed-notice empty-attachment edit, User Notice permission boundary,
  duplicate Course Master 409, invalid Man Record 400, and six read paths all
  passed. Two discovery-only Course Master rows were deleted and remaining test
  rows are 0. No helper was uploaded; no MySQL schema, business-data, or upload
  storage mutation remains.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS SPA, Tailwind CSS (CDN), Chart.js, Flatpickr, FullCalendar, SheetJS, html2canvas, jsPDF |
| Font | Kanit (Google Fonts) |
| Backend | Node.js + Express v5 |
| Database | Company MySQL/MariaDB via `mysql2` connection pool |
| File Storage | Local backend uploads folder (`backend/uploads`) served at `/uploads` |
| Auth | JWT (6h expiry) + bcrypt passwords |
| Deploy | Company server (Node.js backend + static frontend) |

## Project Structure Summary

```
TSH-SAFETY-CORE-APP/
├── index.html                  # Single HTML entry point (SPA)
├── vercel.json                 # legacy deployment config; company server is the current target
├── public/
│   ├── style.css
│   └── js/
│       ├── api.js              # API call helpers
│       ├── main.js             # SPA router / page loader
│       ├── session.js          # JWT session management
│       ├── ui.js               # Shared UI utilities (openModal, closeModal, showToast, ...)
│       ├── fullcalendar.js
│       ├── utils/
│       │   └── normalize.js
│       └── pages/
│           ├── admin.js        # System Console (9 tabs — see below)
│           ├── cccf.js
│           ├── committee.js
│           ├── employee.js     # legacy — router redirects #employee → #admin/employees tab
│           ├── kpi.js
│           ├── machine-safety.js
│           ├── ojt.js
│           ├── patrol.js
│           ├── policy.js
│           ├── profile.js      # Profile slide-over drawer (enterprise)
│           ├── yokoten.js
│           ├── accident.js
│           ├── safety-culture.js
│           ├── training.js
│           ├── contractor.js
│           ├── hiyari.js
│           ├── ky.js
│           └── fourm.js        # 4M Change module
└── backend/
    ├── server.js               # Express app, auth endpoints, generic CRUD
    ├── db.js                   # mysql2 connection pool (Company MySQL/MariaDB)
    ├── storage.js              # local upload storage + multer storage + fileFilter
    ├── uploads/                # uploaded files; back up together with MySQL
    ├── migrate-passwords.js    # One-time bcrypt migration script
    ├── .env                    # Secret config (NOT committed to git)
    ├── middleware/
    │   └── auth.js             # authenticateToken, isAdmin
    └── routes/
        ├── patrol.js
        ├── admin.js
        ├── cccf.js
        ├── master.js
        ├── machine-safety.js
        ├── ojt.js
        ├── yokoten.js
        ├── accident.js
        ├── safety-culture.js
        ├── training.js
        ├── contractor.js
        ├── hiyari.js
        ├── ky.js
        ├── fourm.js            # 4M Change routes
        ├── settings.js         # App settings / config routes
        └── activity-targets.js # Activity Targets — position templates + per-person overrides
```

## Environment Variables

Config file: `backend/.env` (ไม่อยู่ใน git)

```
PORT=5000
JWT_SECRET=...
DB_HOST=...          # company MySQL/MariaDB host
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=...
PUBLIC_UPLOAD_BASE_URL=... # backend URL visible to users, e.g. http://company-server:5000
ALLOWED_ORIGINS=...        # comma-separated frontend origins
```

## Core Rules

- Documentation-only changes must not touch frontend, backend, PHP API, DB, deployment, or generated production files.
- Do not push to GitHub unless the user explicitly asks in the current task.
- Thai UTF-8 is production-critical. Scan changed files for mojibake markers after edits.
- Preserve historical handoff, smoke test, backup, deployment, and phase notes by moving them, not deleting them.
- For implementation work, read `AGENTS.md` before coding and follow its testing, migration, upload, and production rules.

Run verification from the repo root:

```bash
npm test
npm run backup
```

## Machine & Device Safety Compact Master List Local Handoff (2026-07-24)

The module frontend now fills the available application width. Desktop defaults
to a compact 4-column Master List whose rows open the complete Detail modal by
mouse, Enter, or Space; mobile defaults to Card view. The list keeps only
Machine, Department/Area, Status/Risk, and combined readiness. Full metadata,
Compliance 5.1-5.8, Issues, Files, and Admin Edit/Delete controls live in the
Detail modal.

No PHP/Node API, permission, schema, business-data, or upload-storage behavior
changed. Local source smoke and authenticated desktop/mobile Chrome UAT passed
without page-level horizontal overflow; evidence is under
`backups/local/machine-safety-responsive-20260724T061124/`. Cache marker:
`20260724-machine-safety-row-detail`. Production deployment and authenticated
desktop/mobile browser UAT passed; rollback backup:
`backups/production/machine-safety-row-detail-predeploy-20260724-1316/`;
Production evidence:
`backups/production/machine-safety-responsive-20260724T061706/`.

## Dashboard Metric / Personal Target D1-D5 Handoff (2026-07-24)

The canonical 15-module mapping is
`config/dashboard-module-health-contract.json`, with design notes in
`docs/dashboard-module-health-contract.md`. D2 implements the canonical
`data.moduleMetrics` response in both Node and PHP and preserves all legacy
overview keys. Progress metrics use same-unit 0-100 calculations; zero
denominators are `N_A`, failed sources are `DATA_UNAVAILABLE`, and risk or
information cards have no synthetic percentage.

D3 now gives every employee a mandatory current-policy acknowledgement target
and returns additional targets only from effective non-N/A Admin employee,
Department/Unit, or position configuration. System/module ratios measure
eligible rows but cannot create eligibility. D4 consumes canonical
`moduleMetrics` in the frontend, including explicit N/A and unavailable states.
Legacy API keys remain for compatibility.

Local D2 verification passed: contract mapping 15/15, 13 canonical fields,
Node/PHP helper parity, live Patrol/KY/Yokoten source parity, PHP authenticated
overview contract 15/15, and read-only source integration. Database
fingerprints remained unchanged. The D1 baseline classification remains 2,095
employees with a matching non-N/A Admin target configuration and 397 without
an additional configured target. D3/D4 verification additionally passed
Node/PHP eligibility parity, authenticated runtime parity, a SELECT-only
2,492-employee eligibility audit, and authenticated desktop/mobile browser UAT
for all 15 canonical card statuses. No schema/data/upload mutation is required.

D5 consolidates those checks under
`npm --prefix backend run verify:dashboard-d5`. Its authenticated browser and
runtime UAT cover both READY eligibility states: Policy baseline only and
effective Admin-configured targets. The gate stores logs, JSON results, and
screenshots under `backups/local` and remains read-only for business data.
The completed Local gate passed 11/11; READY test availability was 26
Admin-configured and 10 baseline-only users. Full backend regression and the
91/91 read-only API preflight also passed.

The Hiyari Module Health card now follows the module's Admin assignment KPI,
not raw report closure. It counts distinct current assignments with at least
one closed current-year report over all current `Hiyari_Assignments`; zero
assignments is N/A and full assignment completion is 100%. Local data at the
2026-07-24 verification point was 26/66 (39%). Node/PHP parity, D5 gate 11/11,
authenticated browser UAT, and full regression passed without database
mutation.

The Yokoten Admin bulk-submit HTTP 500 fix is deployed. PHP production and
Node dev now persist every selected Department in one transaction, reject
active duplicates, and safely reuse a soft-deleted unique-key slot with a new
`ResponseID`. Bulk notifications are queued without synchronous SMTP delivery;
single-Department submit retains immediate best-effort delivery. `npm --prefix backend run
verify:yokoten-admin-submit` passed scope parity 8/8, contracts 20/20, and an
authenticated PHP handler probe for 9 Departments with one soft-delete
collision; the probe reported `notificationMode=queued` and an unchanged
post-rollback fingerprint. No schema or upload-storage change is required.

Production deployment on 2026-07-24 used the exact 11-file boundary in
`deploy-manifest.json`. Rollback backup:
`backups/production/dashboard-hiyari-yokoten-predeploy-20260724-102545/`.
Download-back SHA-256 verification passed 11/11 at
`backups/production/dashboard-hiyari-yokoten-upload-verify-20260724-102805/`.
Authenticated read-only API UAT passed all 15 Module Health contracts, Hiyari
29/66 (44%), 10-Department Dashboard/Yokoten parity, Personal Target
eligibility, and an invalid Yokoten submit with response count unchanged 1/1.
Authenticated browser UAT passed Dashboard plus Yokoten individual/select-all
selection for 9 Departments and 11 Units. Evidence is under
`backups/production/yokoten-dashboard-readonly-uat-20260724T033127/` and
`backups/production/yokoten-dashboard-browser-uat-20260724T033137/`.

## Collaboration Guardrails

- Do not push to GitHub unless the user explicitly asks for it in the current task.
- Local testing is expected before handoff: run `npm --prefix backend test` after backend/API changes.
- When changing upload or DB behavior, update this file and mention whether `backend/uploads/` or MySQL schema changed.
- Encoding/mojibake is the #1 safety check for every change. Before and after edits, scan changed UI/API/docs strings for mojibake markers such as `à`, `Ã`, `Â`, `â€”`, `â€¦`, and replacement characters. Prefer ASCII-safe HTML entities such as `&mdash;` for fallback symbols when editing files that already have mixed encoding history. Do not bulk-replace production data; isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or actual DB content first.
- If any task requires a MySQL schema/data change, include the SQL/migration in the local handoff, apply the matching production DB update during deploy, and smoke the updated data path. If production DB changes are needed, take a fresh production backup first and document the backup ID plus verification result here.

## Current Handoff Status (2026-05-21)

Use this section when switching accounts or resuming work. The current production target is the company server with Company MySQL/MariaDB and local server storage in `backend/uploads/`. Do not push to GitHub unless the user explicitly asks in the current chat.

## Safety Unit Gate Local Handoff (2026-06-04)

Phase SU-1 + ENC-1 was completed read-only against production before code changes. Production `/api/register/options` and `/api/employees` returned `application/json; charset=utf-8`; master Safety Unit data looked clean; `Employee.Unit` was empty for all production employees checked. The visible `Unit` column mojibake was traced to frontend fallback rendering, not DB Safety Unit data.

Phase SU-2 is implemented and deployed. Files changed for SU-2: `public/js/main.js`, `public/js/session.js`, `index.html`, `api/bootstrap.php`, `api/handlers/foundation.php`, and `backend/server.js`. `public/js/pages/admin.js` also has the Unit fallback fix from `emp.Unit || mojibake dash` to `emp.Unit || '&mdash;'`.

SU-2 behavior: non-Admin users are checked after session/profile load and before page routing. If their Department has configured Safety Units and their Employee Master `Unit` is empty, the app renders a blocking first-use Safety Unit selection page. The dropdown is limited to Safety Units from the user's own Department. Saving calls `PUT /api/profile/safety-unit`, validates the Unit server-side against `master_safetyunits` joined to the user's Department, updates `employees.Unit`, returns a refreshed JWT/user, and then allows normal routing. Admin users bypass the gate so they can continue to maintain the system.

Verification completed locally before deploy: `node --check public/js/main.js`, `node --check public/js/session.js`, `node --check backend/server.js`, `C:\xampp\php\php.exe -l api\bootstrap.php`, `C:\xampp\php\php.exe -l api\handlers\foundation.php`, and `git diff --check -- public\js\main.js public\js\session.js index.html api\bootstrap.php api\handlers\foundation.php backend\server.js` all passed. Only existing LF/CRLF warnings were reported.

Phase SU-2 deployed to production on 2026-06-04. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/session.js`, `public/js/pages/admin.js`, `api/bootstrap.php`, `api/handlers/foundation.php`, and `CLAUDE.md`. Production backup was created at `backups/production/su2-code-20260604-094836/` with the previous code files plus read-only `employees.snapshot.json`; upload SHA verification downloads were stored at `backups/production/su2-upload-verify-20260604-094905/`.

SU-2 production smoke passed with marker `CSU2P094951`: production HTML references `v=20260604-safety-unit-gate`; production `main.js` contains `getSafetyUnitGateRequirement` and `profile/safety-unit`; temporary non-Admin employee in `PRODUCTION 1 SEC.` started with empty `Unit`; Department had 6 Safety Units; invalid unit returned HTTP 400; valid unit `PD1 Assy 3/1` saved successfully; refreshed token/profile returned `Unit=PD1 Assy 3/1`; temporary employee cleanup returned remaining count 0. No MySQL schema migration was required. The only production DB mutation was the temporary smoke employee create/update/delete, fully cleaned up.

Phase SU-3 is implemented and deployed. Employee Master now has an `All Safety Unit Status / Missing Safety Unit` filter, a toolbar `Missing SU` count, row-level `Missing Safety Unit` badge, visible `Set Unit` quick action that opens the edit modal, and export columns `SafetyUnitStatus` plus `SafetyUnitOptions`. The filter and export use master department/unit data, so a row is missing only when the employee department has configured Safety Units and `Employee.Unit` is empty. Cache busts were updated to `20260604-su3-cleanup` in `index.html` and `public/js/main.js`.

SU-3 local verification passed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, and `git diff --check -- public\js\pages\admin.js public\js\main.js index.html CLAUDE.md` with only existing LF/CRLF warnings. Local authenticated API smoke found 21 Safety Units across 10 departments and 205 employees matching the Missing Safety Unit condition in the local DB; no SU-3 database writes or schema migrations were made.

SU-3 production deploy completed on 2026-06-04. Production backup: `backups/production/su3-code-20260604-100046/` with `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `CLAUDE.md`, and read-only `employees.snapshot.json`. Uploaded and SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`; verify downloads are in `backups/production/su3-upload-verify-20260604-100108/`. Production authenticated smoke stored in `backups/production/su3-smoke-20260604-100214/`: HTML references `public/js/main.js?v=20260604-su3-cleanup`, production `main.js` imports `admin.js?v=20260604-su3-cleanup`, production `admin.js` contains `emp-safety-unit-filter`, `Missing Safety Unit`, `SafetyUnitStatus`, and `&mdash;`. Production API smoke found 2,294 employees, 21 Safety Units across 10 departments, and 2,066 employees matching Missing Safety Unit. No SU-3 production DB mutation or schema migration was required.

Phase PW-1 is implemented and deployed. Password minimum is now 4 characters in register, change-password, profile drawer password form, admin reset password, PHP production handler, and Node dev parity. Bcrypt remains unchanged. Changed files: `index.html`, `public/js/main.js`, `public/js/pages/profile.js`, `api/handlers/foundation.php`, `backend/server.js`, and `CLAUDE.md`; cache busts use `20260604-pw1-min4`. Local verification passed: `node --check public/js/main.js`, `node --check public/js/pages/profile.js`, `node --check backend/server.js`, and `C:\xampp\php\php.exe -l api\handlers\foundation.php`. Local PHP smoke marker `CPW1L100733`: 3-character register/change-password/admin reset returned HTTP 400; 4-character register/change-password/admin reset succeeded; login after reset succeeded; cleanup remaining count 0. No MySQL schema migration is required.

PW-1 production deploy completed on 2026-06-04. Production backup: `backups/production/pw1-code-20260604-100824/` with `index.html`, `public/js/main.js`, `public/js/pages/profile.js`, `api/handlers/foundation.php`, `CLAUDE.md`, and read-only `employees.snapshot.json`. Uploaded and SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/profile.js`, `api/handlers/foundation.php`, and `CLAUDE.md`; verify downloads are in `backups/production/pw1-upload-verify-20260604-100845/`. Production authenticated smoke stored in `backups/production/pw1-smoke-20260604-100925/` with marker `CPW1P100925`: HTML references `public/js/main.js?v=20260604-pw1-min4`, production `main.js` imports `profile.js?v=20260604-pw1-min4` and contains `newPassword.length < 4`, production `profile.js` contains `newPw.length < 4`, 3-character register/change-password/admin reset returned HTTP 400, 4-character register/change-password/admin reset succeeded, login after reset succeeded, and cleanup remaining count 0. No PW-1 production DB schema migration was required; only temporary smoke employee create/update/delete occurred and was fully cleaned up.

Phase Patrol-2 Attendance Detail API is implemented and deployed. Changed files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Do not start Phase Patrol-3/UI work unless explicitly requested.

Patrol-2 local API additions: PHP and Node dev now expose `GET /api/patrol/attendance-detail?employeeId=...&group=top_management|supervisor&year=YYYY`. Top & Management returns `mode: "scheduled_calendar"` using real Admin-created `patrol_sessions`, member rotation, management all-round visibility, round-2 filtering for top/committee, cancelled-session exclusion, `requiredToDate`, `completedScheduled`, `scheduledTotal`, `missingToDate`, `upcoming`, `progressToDatePct`, and `fullYearPct`. Sec. & Supervisor returns `mode: "monthly_quota"` with default monthly requirement `2`, 12 monthly periods, capped completed-to-date calculation, `progressToDatePct`, and `fullYearPct`. Records expose `mode: "self"` or `mode: "admin_recorded"`.

Patrol-2 schema/runtime notes: PHP auto-migrates `patrol_self_checkin.RecordedBy VARCHAR(50) DEFAULT NULL`; Node dev parity auto-migrates `Patrol_Self_Checkin.RecordedBy VARCHAR(50) DEFAULT NULL`. Existing `patrol_attendance.RecordedBy` auto-migration remains. Inserts now set `RecordedBy` for user self-checkin and Admin supervisor records, and supervisor checkin reads include `RecordedBy`. Production DB auto-migration was exercised by the production smoke.

Patrol-2 local verification on 2026-06-04: `C:\xampp\php\php.exe -l api\handlers\patrol.php` passed and `node --check backend\routes\patrol.js` passed. The previous local `501` on `/patrol/attendance-detail` was rechecked against `http://127.0.0.1:8092/api/index.php?route=patrol/attendance-detail&group=top_management&employeeId=005889&year=2026`; without token it now returns `401 No token provided`, confirming the current PHP handler dispatches before fallback. Authenticated local smoke passed: Admin `012609` read Top detail for `005889` with `mode=scheduled_calendar`; Admin read Supervisor detail for `001123` with `mode=monthly_quota` and 12 periods; User `005889` reading `001123` returned `403`; Admin created a temporary supervisor record for `001123`, detail returned the temp record with `mode=admin_recorded`, delete returned `200`, and cleanup remaining count was `0`.

Patrol-2 production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol2-code-20260604-130522/` with `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`; an earlier failed curl-option attempt created `backups/production/patrol2-code-20260604-130444/` with only `manifest.json` and should not be treated as a valid backup. Uploaded and FTP SHA-256 verified: `api/handlers/patrol.php` and `backend/routes/patrol.js`; verify downloads are in `backups/production/patrol2-upload-verify-20260604-130556/`. Production authenticated smoke marker `CODX_PATROL2_PROD_130730` passed: no-token route returned `401`; Admin read Top detail for `005889` with `mode=scheduled_calendar`, `progressToDatePct`, and `fullYearPct`; Admin read Supervisor detail for `001123` with `mode=monthly_quota` and 12 periods; User `005889` reading `001123` returned `403`; Admin created a temporary supervisor record for `001123`, detail returned the temp record with `mode=admin_recorded`, delete returned `200`, and cleanup remaining count was `0`. Temporary smoke helper `codx_patrol2_smoke.php` was deleted from production and verified by HTTP `404` plus absent FTP listing. After smoke, `CLAUDE.md` was uploaded to production and SHA-256 verified; final verify downloads are in `backups/production/patrol2-claude-final-verify-20260604-130918/`.

Phase Patrol-3 Progress Calculation / Summary percent is implemented and deployed. Changed files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`; no frontend file was intentionally edited for this phase. Summary APIs now use Progress To Date as the primary percentage: Top & Management `/api/patrol/attendance-overview` sets member `Percent` and summary `percent` from completed scheduled walks to date / required scheduled walks to date, while exposing Full Year as `FullYearPct` / `fullYearPct`, yearly target totals, scheduled totals, missing-to-date, and upcoming counts. Sec. & Supervisor `/api/patrol/supervisor-overview` sets member `percent`, `attended`, and `target` from capped completed-to-date / required-to-date monthly quota, while exposing `fullYearPct`, `yearlyTarget`, `fullYearCompleted`, `requiredToDate`, `completedToDateCapped`, `missingToDate`, `upcomingMonths`, and `monthlyRequirement`.

Patrol-3 local verification on 2026-06-04: `C:\xampp\php\php.exe -l api\handlers\patrol.php`, `node --check backend\routes\patrol.js`, `git diff --check -- api/handlers/patrol.php backend/routes/patrol.js CLAUDE.md`, and mojibake scan of changed code files passed. Local authenticated PHP smoke passed for `/patrol/attendance-overview?year=2026` and `/patrol/supervisor-overview?year=2026`, verifying `progressToDatePct` plus `fullYearPct` fields and primary percent mapping. Full `npm --prefix backend test` did not complete because the existing permission audit still reports `PUT /api/profile/safety-unit` as one `UNREVIEWED` route in `backend/server.js`; this is pre-existing SU-2 classification debt and not a Patrol-3 behavior failure.

Patrol-3 production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol3-code-20260604-131605/` with `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `api/handlers/patrol.php` and `backend/routes/patrol.js`; verify downloads are in `backups/production/patrol3-upload-verify-20260604-131638/`. Production authenticated read-only smoke marker `CODX_PATROL3_PROD_131719` passed: Top summary returned 200, member count 37, `progressToDatePct`, `fullYearPct`, and summary `percent === progressToDatePct`; Supervisor summary returned 200, member count 67, `progressToDatePct`, `fullYearPct`, `yearlyTarget`, and member `percent === progressToDatePct`. Temporary smoke helper `codx_patrol3_smoke.php` was deleted from production and verified by HTTP `404` plus absent FTP listing. Next recommended work: Phase Patrol-4 Admin On-Behalf Schedule/Quota View, then Phase Patrol-5 Summary Detail Modal and Phase Patrol-6 UI Integration. Also consider clearing the permission-audit debt for `PUT /api/profile/safety-unit` so `npm --prefix backend test` can be fully green again.

Phase Patrol-4 Admin On-Behalf Schedule/Quota View is implemented and deployed. Changed files: `public/js/pages/patrol.js`, `public/js/main.js`, and `CLAUDE.md`; cache bust advanced to `20260604-patrol4-admin-view` for the `patrol.js` import in `main.js`. Admin Top & Management record modal now uses `GET /api/patrol/attendance-detail?group=top_management` and shows the employee's actual scheduled-calendar requirement, Progress To Date, Full Year, required due, missing due, scheduled dates with completed/missed/upcoming status, and extra records. Admin Sec. & Supervisor record modal now uses `GET /api/patrol/attendance-detail?group=supervisor` and shows monthly quota status, Progress To Date, Full Year, monthly quota, missing due, and each month's records with admin/self mode. Add/delete actions refresh the new detail view after mutation. No backend schema change was required.

Patrol-4 local verification on 2026-06-04: `node --check public\js\main.js`, `node --check public\js\pages\patrol.js`, and `git diff --check -- public/js/main.js public/js/pages/patrol.js CLAUDE.md` passed with only existing LF/CRLF warnings. Production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol4-code-20260604-132429/` with `public/js/main.js`, `public/js/pages/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `public/js/main.js` and `public/js/pages/patrol.js`; verify downloads are in `backups/production/patrol4-upload-verify-20260604-132450/`. Production static smoke stored in `backups/production/patrol4-smoke-20260604-132509/` verified that production `main.js` imports `patrol.js?v=20260604-patrol4-admin-view`, and production `patrol.js` contains `_armRenderTopDetail`, `_arsvRenderQuotaDetail`, and the `attendance-detail` API usage. Production authenticated API smoke marker `CODX_PATROL4_PROD_132554` passed: Top detail for `005889` returned `mode=scheduled_calendar`, schedule, and progress; Supervisor detail for `001123` returned `mode=monthly_quota`, 12 periods, and progress. Temporary smoke helper `codx_patrol4_api_smoke.php` was deleted from production and verified by HTTP `404` plus absent FTP listing. Next recommended work: Phase Patrol-5 Summary Detail Modal, then Phase Patrol-6 UI Integration for clickable summary tables; also clear the pre-existing `PUT /api/profile/safety-unit` permission-audit debt when ready.

Phase Patrol-5 Summary Detail Modal and Phase Patrol-6 clickable summary table UI are implemented and deployed. Changed files: `public/js/pages/patrol.js`, `public/js/main.js`, `backend/scripts/permission-audit.js`, and `CLAUDE.md`; cache bust advanced to `20260604-patrol56-detail-modal` for the `patrol.js` import in `main.js`. Top & Management and Sec. & Supervisor summary table rows now open a read-only attendance detail modal using `GET /api/patrol/attendance-detail`. The modal shows Progress To Date as the primary metric, Full Year as secondary, completed/due, missing due, scheduled-calendar or monthly-quota detail, and self/admin-recorded check-in rows. Admin row action buttons stop click propagation so Manage/Edit/Delete actions do not open the detail modal, and Admins can jump from the detail modal into the existing on-behalf record manager. Summary table admin actions now pass yearly target values instead of the Progress-To-Date denominator where the API exposes yearly target fields.

Permission-audit debt from SU-2 is cleared: `PUT /api/profile/safety-unit` is now allowlisted as a reviewed authenticated user workflow because the route validates the user's department-scoped Safety Unit server-side. Local verification on 2026-06-04 passed: `node --check public\js\pages\patrol.js`, `node --check public\js\main.js`, `node --check backend\scripts\permission-audit.js`, `git diff --check -- public/js/pages/patrol.js public/js/main.js backend/scripts/permission-audit.js`, and full `npm --prefix backend test`. The full backend test passed permission audit with 182 Admin, 12 inline-guard, and 33 user-workflow mutation routes; API smoke passed; UAT preflight checked 93 read/permission surfaces and passed 93.

Patrol-5/6 production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol56-code-20260604-133639/` with `public/js/main.js`, `public/js/pages/patrol.js`, `backend/scripts/permission-audit.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `public/js/main.js`, `public/js/pages/patrol.js`, and `backend/scripts/permission-audit.js`; verify downloads are in `backups/production/patrol56-upload-verify-20260604-133639/`. Production static smoke stored in `backups/production/patrol56-smoke-20260604-133639/` verified that production `main.js` imports `patrol.js?v=20260604-patrol56-detail-modal`, and production `patrol.js` contains `openPatrolAttendanceDetailModal`, `_patrolTopDetailList`, `_patrolSupervisorDetailList`, and admin button propagation guards. Production authenticated API smoke marker `CODX_PATROL56_PROD_133805` passed: Top detail for `005889` returned HTTP 200, `mode=scheduled_calendar`, 4 scheduled rows, `progressToDatePct`, and `fullYearPct`; Supervisor detail for `001123` returned HTTP 200, `mode=monthly_quota`, 12 periods, `progressToDatePct`, and `fullYearPct`. The first helper placement under `/api/` was intercepted by API rewrite and returned 501, so the temporary smoke helper was moved to web root, rerun successfully, deleted, and verified by HTTP `404` plus absent FTP listing. No production DB mutation or schema migration was required.

Patrol-5/6 click-handler hotfix was deployed to production on 2026-06-04 after user browser testing found `Unexpected end of input` from the new inline row `onclick` handlers. Root cause: `_patrolJsArg()` returned JSON double-quoted strings inside double-quoted HTML attributes, which broke event-handler parsing for row clicks. Fix: `_patrolJsArg()` now emits single-quoted, escaped JS string literals; `index.html` cache bust advanced to `public/js/main.js?v=20260604-patrol56-click-fix` so browsers reload the updated Patrol import chain. Production backup was created first at `backups/production/patrol56-clickfix-code-20260604-134804/`; uploaded and SHA-256 verified: `index.html` and `public/js/pages/patrol.js`; verify downloads are in `backups/production/patrol56-clickfix-upload-verify-20260604-134804/`. Production static smoke stored in `backups/production/patrol56-clickfix-smoke-20260604-134804/` verified the new `index.html` cache bust, `openPatrolAttendanceDetailModal`, and `_patrolJsArg()` no longer using `JSON.stringify` while containing the `\x22` double-quote escape marker. API behavior was unchanged from the earlier authenticated smoke marker `CODX_PATROL56_PROD_133805`.

Phase Patrol-7A Scheduled Session Linkage is implemented and deployed. Changed files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, and `CLAUDE.md`. PHP and Node parity add `patrol_attendance.ScheduledSessionID VARCHAR(50) DEFAULT NULL` with an index. Top & Management attendance records can now link to a real scheduled `patrol_sessions.SessionID`, so a walk on a different actual date can complete the intended scheduled round. Exact-date records without `ScheduledSessionID` remain a fallback for historical data. Duplicate completion of the same scheduled session is rejected. Admin record modal now auto-suggests the scheduled round and fills the schedule area when the selected actual date matches the calendar; when the actual date is outside the scheduled date but in the same month, it shows open scheduled rounds for that month so 12/year users can auto-select the single round and 24/year users can choose the correct round/area. User compensation check-in now sends `ScheduledSessionID` instead of overwriting actual walk date with scheduled date. Cache busts use `20260604-patrol7-session-linkage`.

Patrol-7A local verification on 2026-06-04 passed: `C:\xampp\php\php.exe -l api\handlers\patrol.php`, `node --check backend\routes\patrol.js`, `node --check public\js\pages\patrol.js`, `node --check public\js\main.js`, `git diff --check -- api/handlers/patrol.php backend/routes/patrol.js public/js/pages/patrol.js public/js/main.js index.html`, local PHP linkage smoke marker `CODX_PATROL7_LOCAL_092247` for employee `005889` linked actual date `2026-02-11` to scheduled session `1b2a7a34-7b23-40b2-ac0b-649c414319d9` on `2026-02-18` and verified it completed the scheduled item without appearing as extra, then cleaned up remaining count 0. Full `npm --prefix backend test` passed: permission audit, API smoke, and UAT preflight 93/93.

Patrol-7A production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol7-code-20260604-142450/` with `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, `api/handlers/patrol.php`, and `backend/routes/patrol.js`; verify downloads are in `backups/production/patrol7-upload-verify-20260604-142450/`. Production static/API smoke stored in `backups/production/patrol7-smoke-20260604-142450/` passed: `index.html` references `public/js/main.js?v=20260604-patrol7-session-linkage`, production `main.js` imports `patrol.js?v=20260604-patrol7-session-linkage`, and production `patrol.js` contains `ScheduledSessionID`, `_armRefreshSessionPicker`, `_onCheckinSessionChange`, and `Compensate scheduled round`. Production linkage smoke marker `CODX_PATROL7_PROD_142531` linked actual date `2026-02-11` to scheduled session `1b2a7a34-7b23-40b2-ac0b-649c414319d9` on `2026-02-18`, verified the schedule item completed as makeup, verified it did not appear as extra, and cleaned up remaining count 0. The temporary smoke helper `codx_patrol7_smoke.php` was deleted from production and verified by HTTP `404` plus absent FTP listing. Production DB schema migration `patrol_attendance.ScheduledSessionID` was applied by `ensure_patrol_schema()` during smoke; no permanent production data mutation remained after cleanup.

Patrol-7B/7D backend linkage follow-up continued locally on 2026-06-04 after review of the Patrol-7A handoff. Patrol-7A was already implemented and deployed, but two backend parity gaps were tightened locally: explicit `ScheduledSessionID` makeup links are now rejected unless the actual patrol date and scheduled session date are in the same `YYYY-MM` month in both PHP production handler and Node dev route, and Node `/api/patrol/my-missed-sessions` now uses the shared scheduled-session helper so rotation, cancelled-session filtering, round visibility, linked completions, and exact-date historical completions match attendance-detail behavior. Node `/api/patrol/checkin` also preserves thrown 400/409 schedule-link validation responses instead of falling through to a generic 500 in local dev. Local syntax verification passed: `C:\xampp\php\php.exe -l api\handlers\patrol.php`, `node --check backend\routes\patrol.js`, and `git diff --check -- api/handlers/patrol.php backend/routes/patrol.js` with only the existing LF/CRLF warning on `backend/routes/patrol.js`. Remaining Patrol-7E work before production deploy: run authenticated smoke for same-month makeup success, cross-month makeup rejection, duplicate scheduled-session rejection, 12/year single-round suggestion, 24/year second round still missing, then back up production, upload/verify changed backend files plus `CLAUDE.md`, and perform production smoke/cleanup.

Patrol-7E local authenticated smoke passed on 2026-06-04 with marker `CODX_PATROL7E_LOCAL_20260604074337`. The smoke script `backend/scripts/patrol7e-smoke.js` starts the local Express app, signs Admin/User JWTs, creates temporary `Patrol_Attendance` rows through the API, verifies `12/year` missed-session listing, same-month makeup completion, cross-month makeup rejection, duplicate scheduled-session rejection, exact scheduled date auto-link plus area default, and `24/year` one compensated round leaving the second round missing, then deletes all marker rows; cleanup remaining count was `0`. During this smoke, Node dev parity was fixed so `dateOnly(Date)` uses local date components instead of UTC `toISOString()`, preventing MySQL `DATE` values from shifting one day and breaking exact-date auto-link. Full `npm --prefix backend test` passed afterward: permission audit, API smoke, and UAT preflight 93/93.

Patrol-7E production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol7e-code-20260604-144503/` with `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`; verify downloads are in `backups/production/patrol7e-upload-verify-20260604-144534/`. Production authenticated smoke stored in `backups/production/patrol7e-smoke-20260604-144748/` passed with marker `CODX_PATROL7E_PROD_144749`: `12/year` missed-session listing included the open scheduled round for `006493`, cross-month makeup was rejected, same-month makeup linked actual `2026-01-21` to scheduled `2026-01-28`, duplicate scheduled-session completion was rejected, attendance-detail showed the makeup as scheduled completion and not extra, exact scheduled date auto-linked and defaulted area, `24/year` compensation for employee `006065` left the second round missing, and cleanup remaining count was `0`. Temporary root helper `codx_patrol7e_smoke.php` was deleted from production and verified by HTTP `404` plus absent FTP listing. No permanent production data mutation remained after cleanup; no new schema migration was required beyond the existing Patrol-7A `patrol_attendance.ScheduledSessionID`.

Patrol-8A through Patrol-8D backend/email work is implemented locally on 2026-06-04. Changed files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Personal `GET /api/patrol/my-schedule` now returns only the logged-in user's required Admin-configured rounds for the selected month, using the same rotation/cancelled-session/round-visibility logic as attendance-detail. `GET /api/patrol/my-monthly-plan` now uses the same personal schedule helper and counts completed scheduled sessions through exact-date or `ScheduledSessionID` linkage instead of raw monthly record count, preserving correct 24/year behavior. Self `POST /api/patrol/checkin` now accepts only `normal` and `compensation`; `Re-inspection` is rejected for self check-in, and `compensation` requires `ScheduledSessionID`. The check-in response now returns a `checkin` object with employee name, position, department, type, actual date, scheduled date, makeup flag, round, team, area, and scheduled session id.

Patrol-8C/8D local schema/runtime notes: PHP auto-creates lowercase `patrol_emailoutbox`; Node dev parity auto-creates `Patrol_EmailOutbox`. Both include `AttendanceID`, `EmployeeID`, `EventType`, `Recipients`, `Subject`, `Body`, `HtmlBody`, `Status`, `Error`, `SentAt`, and `CreatedAt`. Self check-in queues an email to `employees.CompanyEmail` / `Employees.CompanyEmail` when present, using the shared corporate email card style with a `เข้าสู่ระบบ / Open Safety Core` CTA and details for inspector, employee id, position, department, routine/makeup type, actual date, scheduled date, round, team, area, and notes. Delivery is best-effort: if SMTP is configured it attempts immediate send and updates outbox status; otherwise the item remains queued. Admin outbox maintenance endpoints were added: `GET /api/patrol/email-outbox`, `POST /api/patrol/email-outbox/:id/retry`, and `POST /api/patrol/email-outbox/retry-queued`.

Patrol-8A-D local verification on 2026-06-04: `C:\xampp\php\php.exe -l api\handlers\patrol.php` passed, `node --check backend\routes\patrol.js` passed, `git diff --check -- api/handlers/patrol.php backend/routes/patrol.js CLAUDE.md` passed with only existing LF/CRLF warnings, and full `npm --prefix backend test` passed: permission audit, API smoke, and UAT preflight 93/93. Production deploy and authenticated smoke are still pending. Next recommended phase is Patrol-8E/8F mobile-first UI: fix check-in modal identity/position from master employee data, remove the self `Re-inspection` option from the UI, show Routine/Makeup with explicit actual/scheduled dates and user name, and make My Schedule/check-in flows comfortable on phone widths.

Patrol-8A-D production deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol8-code-20260604-161958/` with `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified: `api/handlers/patrol.php`, `backend/routes/patrol.js`, and `CLAUDE.md`; verify downloads are in `backups/production/patrol8-upload-verify-20260604-161958/`. Earlier FTP backup attempts `backups/production/patrol8-code-20260604-161837/` and `backups/production/patrol8-code-20260604-161924/` completed before the successful upload/verify pass but should be treated as superseded by the later verified deploy set. Temporary smoke helper upload was SHA-256 verified in `backups/production/patrol8-smoke-helper-20260604-162019/`.

Patrol-8A-D production authenticated smoke passed with marker `CODX_PATROL8_PROD_162031`: `GET /api/patrol/my-schedule` for employee `001430` returned only that user's 1 required scheduled round for June 2026; self `POST /api/patrol/checkin` with `Re-inspection` returned HTTP 400; self makeup without `ScheduledSessionID` returned HTTP 400; normal self check-in created temporary attendance id `210023` and Patrol email outbox id `1` with email status `Sent`; Admin authenticated `attendance-detail` still returned successfully for the same employee. Smoke cleanup deleted the temporary attendance/outbox marker rows and restored any temporary CompanyEmail change; remaining marker attendance and outbox counts were `0`. Temporary root helper `codx_patrol8_smoke.php` was deleted from production and verified by HTTP `404`.

Patrol-8E/8F mobile-first personal UI is implemented locally on 2026-06-04. Changed files: `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, and `CLAUDE.md`. The personal dashboard now fetches the logged-in employee's master profile via `GET /api/employees/:id` and uses it for the self check-in modal, so the modal shows the real employee name, position, and department instead of the stale session fallback such as `Staff`. `GET /api/patrol/my-schedule` is now called without the ignored `employeeId` query and relies on the authenticated backend 8A scope. My Schedule and the monthly session tracker now read `isCompleted`, `completionStatus`, `records`, `actualDate`, and `isMakeup` from the backend schedule payload, so linked makeup rounds show completed state and the actual date separately from the scheduled date. Self check-in modal was narrowed to two modes only: `normal` / Routine and `compensation` / Makeup; the self `Re-inspection` option was removed from the mobile/user flow. The form header shows Actual date, and the success screen now uses the API response `checkin` + `email` object to display inspector, type, scheduled date, actual date, area, and email notification status. Cache bust advanced to `20260604-patrol8-mobile-ui` in `index.html` and `public/js/main.js`.

Patrol-8E/8F local verification on 2026-06-04: `node --check public\js\pages\patrol.js` passed, `node --check public\js\main.js` passed, and `git diff --check -- public/js/pages/patrol.js public/js/main.js index.html` passed with only existing LF/CRLF warnings. Remaining `Re-inspection` strings in `public/js/pages/patrol.js` are limited to the Admin record modal/history formatter, not the self check-in mobile modal.

Patrol-8E/8F production frontend deploy completed on 2026-06-04. Production backup was created first at `backups/production/patrol8ef-code-20260604-163358/` with `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, and `CLAUDE.md`. Uploaded and FTP SHA-256 verified the same files; verify downloads are in `backups/production/patrol8ef-upload-verify-20260604-163358/`. HTTPS static smoke passed with `backups/production/patrol8ef-static-smoke-20260604-163607/`: production `index.html` loads `public/js/main.js?v=20260604-patrol8-mobile-ui`, production `main.js` loads `patrol.js?v=20260604-patrol8-mobile-ui`, production `patrol.js` contains the master-profile self UI helper, schedule completion linkage helper, self Routine/Makeup radio options, no self `Re-inspection` option inside `openCheckInModal`, and success screen fields for `Actual`, `Scheduled`, and email notification state. Earlier static smoke directories `patrol8ef-static-smoke-20260604-163429/`, `patrol8ef-static-smoke-20260604-163513/`, and `patrol8ef-static-smoke-20260604-163545/` are superseded; they failed only because the smoke assertions were too broad or encoding-sensitive while production files had already uploaded.

## Phase 4 In Progress Handoff (2026-06-01)

Continuation request: finish the shared-hosting PHP API migration beyond the current Phase 4 work. Production is DirectAdmin/Apache/PHP shared hosting at `https://dev.tshpcl.com/safety/tsh-safety-core/` and cannot run Node/Express. Keep the existing frontend API contract and URLs such as `/api/login`; do not push GitHub unless explicitly requested.

Local project: `C:\xampp\htdocs\tsh-safety-core-app`. Production FTP uses FileZilla saved credentials for host `dev.tshpcl.com`, port `2002`, remote root `/home/uattshpc/domains/dev.tshpcl.com/public_html/safety/tsh-safety-core`.

Production DB: `DB_HOST=localhost`, `DB_PORT=3306`, `DB_USER=uattshpc_safetytsh`, `DB_NAME=uattshpc_safetytsh`, `DB_SSL=false`. Production PHP must remain PHP 7.4 compatible and use lowercase Linux table names where needed.

Already deployed before this continuation: Phase 0 architecture/router review; Phase 1 auth/profile/register options/master departments/dashboard overview/alerts; Phase 2 uploads/storage, branding upload, module forms, activity targets, person search, employee import; Phase 3 Policy, Committee, KPI; `.htaccess` rewrites `/api/...` into PHP API and production login works.

Current Phase 4 scope in this continuation: Training, OJT, and Patrol. Created locally but not yet deployed: `api/handlers/operational.php` and `api/handlers/patrol.php`.

`api/handlers/operational.php` current status: Training 16 routes and OJT 9 routes are drafted; OJT create-table/migration and `OJTDate` validation are present; training department CourseID warning has been addressed. Still requires contract review, PHP lint, local/API test, deploy, production smoke test, cleanup, and final CLAUDE update.

`api/handlers/patrol.php` current status: baseline routes exist but must not be deployed until checked against `backend/routes/patrol.js` and `public/js/pages/patrol.js`. Required fixes before deploy: add/complete `GET /patrol/my-monthly-plan`, `GET /patrol/my-missed-sessions`, `GET /patrol/my-yearly-stats` with `monthlyBreakdown`; adjust `GET /patrol/day-detail`, `GET /patrol/attendance-stats`, `GET /patrol/attendance-overview`, and `GET /patrol/supervisor-overview` response shapes; duplicate guard plus stats for `POST /patrol/checkin`; multipart `POST /patrol/issue/save` for `BeforeImage`, `TempImage`, and `AfterImage`; cleanup replaced/new files on update/error; Admin-only `DELETE /patrol/issue/:id` with image cleanup; supervisor-position guard for `POST /patrol/self-checkin`; UUID Wednesday session generation by PatrolGroup A/B like Node; array payload support for `POST /patrol/member-rotation` and `POST /patrol/rotation`; verify `/patrol/monthly-report` and `/patrol/member-schedule`; add validation/admin guards on write routes.

When Phase 4 is ready, update `api/index.php` to require `handlers/operational.php` and `handlers/patrol.php`, then dispatch `handle_training_routes()`, `handle_ojt_routes()`, and `handle_patrol_routes()` before the 501 fallback. Run PHP lint for all changed PHP files and `npm --prefix backend test`; do local API checks where possible; deploy Phase 4 files by FTP; production smoke Training, OJT, and Patrol read/mutation endpoints with temporary data only; test issue image upload/delete and confirm no leftover files; cleanup temporary records; update this file and upload it to production.

After Phase 4, do not stop at Phase 4. Inventory all remaining unported endpoints from `backend/server.js`, `backend/routes/*.js`, and `public/js/pages/*.js`; record module/workstream counts and endpoint counts; propose Phase 5+ roadmap before editing the next phase.

## Phase 4 Completed (2026-06-01)

Phase 4 in this continuation is complete and deployed: PHP compatibility handlers now cover Safety Training, OJT/SCW, and Safety Patrol. `api/index.php` now requires `api/handlers/operational.php` and `api/handlers/patrol.php`, then dispatches `handle_training_routes()`, `handle_ojt_routes()`, and `handle_patrol_routes()` before fallback 501.

Files changed locally for this phase:

- `api/index.php`
- `api/handlers/operational.php`
- `api/handlers/patrol.php`
- `CLAUDE.md`

Files uploaded to production for this phase:

- `api/index.php`
- `api/handlers/operational.php`
- `api/handlers/patrol.php`
- `CLAUDE.md`

FTP note: the FileZilla account lands at an FTP sandbox root containing `tsh-safety-core/`; for future uploads use FTP path `/tsh-safety-core/...`. The filesystem-style path `/home/uattshpc/domains/dev.tshpcl.com/public_html/safety/tsh-safety-core` is documented by hosting, but with this FTP login it is not the correct upload path.

Verification completed:

- PHP lint: `C:\xampp\php\php.exe -l` passed for every `api/**/*.php` file.
- Whitespace check: `git diff --check -- api/index.php api/handlers/operational.php api/handlers/patrol.php CLAUDE.md` passed, with only the existing CRLF warning for `CLAUDE.md`.
- Backend regression: `npm --prefix backend test` passed; UAT preflight checked 90 surfaces and passed 90.
- Local PHP smoke read passed for Training, OJT, and Patrol, including Patrol `attendance-stats`, `my-yearly-stats`, `attendance-overview`, `supervisor-overview`, `my-monthly-plan`, `my-missed-sessions`, and `day-detail`.
- Local PHP smoke mutation passed: Training course/record create/delete, OJT record upsert/delete, Patrol issue `OPEN` + `BeforeImage`, `TEMP` + `TempImage`, `CLOSE` + `AfterImage`, issue delete/file cleanup, Patrol check-in duplicate guard returning 409, and local attendance cleanup.
- Production smoke read passed for: `GET /api/training/courses`, `GET /api/training/summary`, `GET /api/ojt/standard`, `GET /api/ojt/records`, `GET /api/patrol/issues`, `GET /api/patrol/teams`, `GET /api/patrol/attendance-stats`, `GET /api/patrol/my-yearly-stats`, `GET /api/patrol/attendance-overview`, `GET /api/patrol/supervisor-overview`, `GET /api/patrol/my-monthly-plan`, `GET /api/patrol/my-missed-sessions`, and `GET /api/patrol/day-detail`.
- Production smoke mutation passed: Training temporary course/record create/delete, OJT temporary record upsert/delete, Patrol issue image workflow `OPEN`/`TEMP`/`CLOSE`/delete with `BeforeImage`, `TempImage`, `AfterImage`, and Patrol check-in duplicate guard returning 409. Windows `curl.exe` needed `--ssl-no-revoke` for HTTPS multipart smoke because Schannel could not check certificate revocation.
- Production cleanup verification passed: temporary Training courses `P4TMP*`, OJT departments `CODX_PHASE4_TEMP*`, Patrol issues `CODX_PHASE4_*`, and Patrol attendance for `php-prod-phase4-user` all returned count 0 after cleanup.

Phase 4 endpoint status:

- Training: 16/16 Node routes ported.
- OJT/SCW: 9/9 Node routes ported.
- Patrol: 48/48 Node routes ported, including monthly plan, missed sessions, yearly breakdown, day detail, attendance overview, supervisor overview, multipart issue images, duplicate check-in guard, self-patrol supervisor validation, UUID Wednesday session generation, member/team rotation arrays, monthly report, and member schedule.

## Phase 5 Completed (2026-06-01)

Phase 5 is complete and deployed: PHP compatibility now covers Accident Report, Machine Safety, Contractor, and Safety Culture operational modules. `api/index.php` now requires `api/handlers/operational_phase5.php`, then dispatches `handle_accident_routes()`, `handle_machine_safety_routes()`, `handle_contractor_routes()`, and `handle_safety_culture_routes()` before fallback 501.

Files changed locally for this phase:

- `api/index.php`
- `api/handlers/operational_phase5.php`
- `CLAUDE.md`

Files uploaded to production for this phase:

- `api/index.php`
- `api/handlers/operational_phase5.php`
- `CLAUDE.md`

Temporary cleanup note: a one-time root `phase5_cleanup.php` script was uploaded to production only to hard-delete smoke-test rows/files with prefix `CODX_PHASE5_PROD_%`, then deleted immediately. FTP verification confirmed `phase5_cleanup.php` is not present in the production root or `api/` directory.

Verification completed:

- PHP lint: `C:\xampp\php\php.exe -l` passed for every `api/**/*.php` file after the Phase 5 handler was added.
- Whitespace check: `git diff --check -- api/index.php api/handlers/operational_phase5.php CLAUDE.md` passed, with only the existing CRLF warning for `CLAUDE.md`.
- Backend regression: `npm --prefix backend test` passed; UAT preflight checked 90 surfaces and passed 90.
- Local PHP smoke read passed for Accident, Machine Safety, Contractor, and Safety Culture read endpoints.
- Local PHP smoke mutation passed and cleaned up to visible count 0: Accident report create/update/read/delete, Machine Safety create/link/compliance/issue resolve/delete/machine delete, Contractor company/document upload/accident file workflow/delete, Safety Culture PPE item/work type/assessment/PPE inspection/PPE violation create/delete.
- Production smoke read passed for 18 endpoints: `GET /api/accident/reports`, `GET /api/accident/summary`, `GET /api/accident/analytics`, `GET /api/accident/performance`, `GET /api/accident/employees`, `GET /api/machine-safety`, `GET /api/contractor/documents`, `GET /api/contractor/documents/stats`, `GET /api/contractor/activity`, `GET /api/contractor/companies`, `GET /api/contractor/accidents`, `GET /api/contractor/accidents/stats`, `GET /api/safety-culture/principles`, `GET /api/safety-culture/assessments`, `GET /api/safety-culture/ppe-items`, `GET /api/safety-culture/ppe-work-types`, `GET /api/safety-culture/ppe-inspections`, and `GET /api/safety-culture/dashboard`.
- Production smoke mutation passed: Accident temporary report create/update/read/delete; Machine Safety temporary machine/link/compliance/issue resolve/delete; Contractor temporary company/document upload/accident file workflow/delete; Safety Culture temporary PPE item/work type/assessment/PPE inspection/PPE violation create/delete.
- Production cleanup verification passed twice: API-visible marker counts returned 0 after normal endpoint cleanup, then hard cleanup verified remaining DB rows/files for `CODX_PHASE5_PROD_%` all returned 0 across Accident, Machine Safety, Contractor documents/companies/accidents, Safety Culture assessments, PPE items, work types, inspections, and violations. The Contractor document upload file count showed 1 temporary file deleted by cleanup.

Phase 5 endpoint status:

- Accident Report: 12/12 Node routes ported.
- Machine Safety: 14/14 Node routes ported.
- Contractor: 15/15 Node routes ported.
- Safety Culture: 23/23 Node routes ported.

## Phase 6 Completed (2026-06-01)

Phase 6 is complete and deployed: PHP compatibility now covers CCCF Activity, Hiyari Near-Miss, KY Activity, and Yokoten workflow modules. `api/index.php` now requires `api/handlers/workflow_phase6.php`, then dispatches `handle_cccf_routes()`, `handle_hiyari_routes()`, `handle_ky_routes()`, and `handle_yokoten_routes()` before fallback 501.

Files changed locally for this phase:

- `api/index.php`
- `api/handlers/workflow_phase6.php`
- `CLAUDE.md`

Files uploaded to production for this phase:

- `api/index.php`
- `api/handlers/workflow_phase6.php`
- `CLAUDE.md`

Temporary cleanup note: a one-time root `phase6_cleanup.php` script was uploaded to production only to hard-delete smoke-test rows/files with prefixes `CODX_PHASE6_PROD_%` and `CODX_PHASE6_YDEBUG_%`, then deleted immediately. FTP verification confirmed `phase6_cleanup.php` is not present in the production root.

Verification completed:

- PHP lint: `C:\xampp\php\php.exe -l` passed for every `api/**/*.php` file after the Phase 6 handler was added.
- Whitespace check: `git diff --check -- api/index.php api/handlers/workflow_phase6.php CLAUDE.md` passed, with only the existing CRLF warning for `CLAUDE.md`.
- Backend regression: `npm --prefix backend test` passed; UAT preflight checked 90 surfaces and passed 90.
- Local PHP smoke mutation/read passed with marker `CODX_PHASE6_LOCAL_20260601101629`, covering CCCF activity/worker/assignment/permanent signed file, Hiyari create/update/signed-file/delete, KY create/reaction/update/delete, and Yokoten topic/respond/approve/delete. Visible marker counts returned 0 after local cleanup.
- Production smoke read passed for 26 endpoints: `GET /api/cccf`, `GET /api/cccf/form-a-worker`, `GET /api/cccf/form-a-permanent`, `GET /api/cccf/unit-targets`, `GET /api/cccf/assignments`, `GET /api/cccf/email-outbox`, `GET /api/hiyari/stats`, `GET /api/hiyari/dashboard-config`, `GET /api/hiyari/assignments`, `GET /api/hiyari/email-outbox`, `GET /api/hiyari`, `GET /api/ky/employees`, `GET /api/ky/email-profile`, `GET /api/ky/stats`, `GET /api/ky/check`, `GET /api/ky/program-config`, `GET /api/ky/reminder-queue`, `GET /api/ky/video-showcase`, `GET /api/ky`, `GET /api/ky/email-outbox`, `GET /api/yokoten/topics`, `GET /api/yokoten/dept-completion`, `GET /api/yokoten/all-responses`, `GET /api/yokoten/dept-history`, `GET /api/yokoten/employee-completion`, and `GET /api/yokoten/dashboard-config`.
- Production smoke mutation passed for 30 endpoints: CCCF activity, unit target, worker form, assignment, permanent upload, review, signed-file upload, complete, email retry queue; Hiyari assignment, report upload, PDF override, attachment upload, signed-file upload, admin update/close, email retry queue; KY program config, activity upload, reaction, video dashboard flag, admin update/close, reminder send, email retry queue; Yokoten topic, response upload, approve, reject, and bulk approve.
- Production cleanup verification passed twice: first hard cleanup deleted 5 temporary files and removed remaining marker rows/outbox/soft-deleted data for `CODX_PHASE6_PROD_%` plus debug marker `CODX_PHASE6_YDEBUG_%`; second run returned zero remaining marker rows.

Phase 6 endpoint status:

- CCCF Activity: 22/22 Node routes ported.
- Hiyari Near-Miss: 20/20 Node routes ported.
- KY Activity: 22/22 Node routes ported.
- Yokoten: 17/17 Node routes ported.

Historical Phase 6 note: email outbox retry endpoints were initially PHP-compatible queue/status endpoints only because shared hosting cannot run Node SMTP workers. This limitation was resolved in Post-Migration Phase G with direct PHP SMTP delivery.

## Remaining PHP API Migration Inventory (after Phase 6)

## Phase 7 In Progress Handoff (2026-06-01)

Phase 7 ports the 4M Change module from `backend/routes/fourm.js` while preserving the frontend contract in `public/js/pages/fourm.js`. The Node router mounts at `/api/fourm` behind authenticated access; PHP must dispatch the same `/fourm/...` paths before the JSON 501 fallback.

Inventory confirmed before implementation: 42 Node routes total.

- Dashboard/statistics: 1 route: `GET /fourm/stats`.
- Man records and Training Matrix department scope: 5 routes: `GET/POST /fourm/man-records`, `PUT/DELETE /fourm/man-records/:id`, and `GET /fourm/training-department-scopes`.
- Training Matrix master/configuration/workflow: 23 routes covering curriculum reads/writes, course master reads/writes, linked courses, curriculum assignments, course assignments, employee scopes, transfer workflows, and logs.
- Change Notice workflow: 13 routes covering notice list/next number/detail/create/update/delete/close, notice tasks, email outbox read, and retry compatibility.

Implementation rules for this phase:

- Use lowercase production Linux table names such as `fourm_changenotices`.
- Keep idempotent schema guards for shared-hosting schema drift.
- Admin can manage every Training Matrix department. Non-admin users can mutate only their own department scope, matching the Node inline guard.
- Notice creation remains available to authenticated users. Notice update/delete remains Admin-only. Notice close and task management remain creator-or-Admin.
- Multipart notice attachment and closing-document mutations must remove replaced files, remove files on delete, and clean newly uploaded files if the DB mutation fails.
- Historical implementation note: 4M email retry was queue/status compatibility only during Phase 7. Post-Migration Phase G now sends email through direct PHP SMTP.

## Phase 7 Completed (2026-06-01)

Phase 7 is complete and deployed: PHP compatibility now covers the 4M Change module. `api/index.php` requires `api/handlers/fourm_phase7.php` and dispatches `handle_fourm_routes()` before fallback 501.

Files changed locally and uploaded to production:

- `api/index.php`
- `api/handlers/fourm_phase7.php`
- `CLAUDE.md`

Temporary cleanup note: a one-time root `phase7_cleanup.php` script was uploaded only to hard-delete production smoke rows/files with prefix `CODX_PHASE7_PROD_%`, then deleted immediately. FTP verification confirmed `phase7_cleanup.php` is absent from the production root.

Verification completed:

- PHP lint: `C:\xampp\php\php.exe -l` passed for every `api/**/*.php` file.
- Whitespace check: `git diff --check -- api/index.php api/handlers/fourm_phase7.php CLAUDE.md` passed, with only the existing CRLF warning for `CLAUDE.md`.
- Backend regression: `npm --prefix backend test` passed; UAT preflight checked 90 surfaces and passed 90.
- Local PHP smoke passed for core 4M read routes, Man Record CRUD, Training Matrix course master/curriculum/course/assignment flows, curriculum transfer, course transfer, Change Notice task/pending/close/delete workflow, and multipart notice attachment replace/closing-document/delete file cleanup.
- Production read smoke passed for 10 core endpoints: `GET /api/fourm/stats`, `GET /api/fourm/man-records`, `GET /api/fourm/training-department-scopes`, `GET /api/fourm/training-curriculums`, `GET /api/fourm/training-employee-scopes`, `GET /api/fourm/training-course-master`, `GET /api/fourm/training-logs`, `GET /api/fourm/notices`, `GET /api/fourm/notice-next-no`, and `GET /api/fourm/email-outbox`.
- Production mutation smoke passed: Man Record create/update/delete; course master and curriculum creation; linked courses; curriculum assignment transfer/remove; course assignment transfer/remove; Change Notice create/task create/task done/task delete/pending/close/delete; email outbox retry compatibility queue; PDF attachment static serve/replace; close-document static serve; and file cleanup after delete.
- Linux multipart compatibility: PHP does not populate multipart `PUT` automatically, so `fourm_phase7.php` parses multipart `PUT` for Change Notice attachment replacement and applies file mode `0644` after moving the replacement into shared-hosting uploads.
- Production cleanup verification passed: remaining temporary `CODX_PHASE7_PROD_%` Change Notices, Man Records, curriculums, and course master rows all returned 0 after hard cleanup.

Phase 7 endpoint status:

- 4M Change: 42/42 Node routes ported.
- Historical implementation note: email retry was PHP shared-hosting queue/status compatibility only at Phase 7 completion. Post-Migration Phase G now sends through direct PHP SMTP.

Next phase:

- Phase 8: audit and port the remaining Admin Console surfaces, then review legacy generic CRUD routes by actual frontend usage. Classify each legacy route as used and required, already covered by a module handler, or retired/not ported. Do not deploy a broad generic CRUD baseline.

## Phase 8 In Progress Handoff (2026-06-01)

Phase 8 closes the remaining Admin Console contract and reviews the legacy generic CRUD routes in `backend/server.js`. The Node admin router mounts at `/api/admin` behind authenticated Admin access. PHP must keep the same `/admin/...` paths and return JSON `403` for User/Viewer access.

Admin route inventory:
- Already covered by `api/handlers/foundation.php`: employee list/create/update/delete/reset-password, import-template-data, multipart employee import.
- Already covered by `api/handlers/platform.php`: organization departments/units, master data, branding/settings.
- Port in `api/handlers/admin_phase8.php`: `GET|PUT /admin/email-requirement-rules`, `GET /admin/email-readiness`, `GET /admin/dashboard-stats`, `GET /admin/system-health`, `GET /admin/audit-logs`, `GET|PUT /admin/permissions/matrix`.
- Retire/not port: `/admin/schedules`, `/admin/schedule/create`, `/admin/schedule/bulk-create`, `/admin/schedule/:id`. Current `public/js/pages/admin.js` uses module-specific Patrol routes such as `/patrol/monthly-summary`, `/patrol/rotation`, `/patrol/generate-sessions`, and `/patrol/sessions/:id`.

Legacy generic CRUD review:
- `backend/server.js` exposes GET/POST/PUT/DELETE generic CRUD for 15 table endpoints: `patrol_sessions`, `patrol_attendance`, `patrol_issues`, `cccf_activity`, `cccf_targets`, `manhours`, `accidentreports`, `trainingstatus`, `scw_documents`, `ojt_department_status`, `machines`, `documents`, `document_machine_links`, `yokotentopics`, and `yokotenresponses`.
- Frontend search across `public/js/pages/*.js`, `public/js/api.js`, `public/js/session.js`, and `index.html` found no caller for those generic paths.
- Decision: retire/not port all 60 generic CRUD methods. Active consumers use module-specific handlers with narrower permission and workflow contracts. Do not deploy a generic PHP CRUD baseline.

## Phase 8 Completed (2026-06-01)

Phase 8 is complete and deployed. `api/index.php` now requires `api/handlers/admin_phase8.php` and dispatches `handle_admin_phase8_routes()` before fallback 501.

Admin Console remainder:
- Added 8 frontend-consumed Admin routes: `GET|PUT /admin/email-requirement-rules`, `GET /admin/email-readiness`, `GET /admin/dashboard-stats`, `GET /admin/system-health`, `GET /admin/audit-logs`, and `GET|PUT /admin/permissions/matrix`.
- Added idempotent lowercase production schema guards for `app_settings`, `admin_auditlogs`, `admin_rolepermissions`, `admin_userpermissions`, employee `CompanyEmail`, audit columns/indexes, and role-permission default rows.
- Preserved Admin-only access through `require_admin()`. Production smoke confirmed both temporary User and Viewer sessions receive JSON `403`.
- Kept employee and organization routes in the existing Phase 1/2 handlers; no duplicate broad Admin CRUD surface was added.

Legacy CRUD review:
- Retired/not ported all 60 generic CRUD methods generated from the 15 `backend/server.js` table names. No frontend caller uses those paths.
- Retired/not ported the 4 old `/admin/schedule...` methods. The Admin scheduler uses the module-specific Patrol workflow.
- Production fallback smoke confirmed `/admin/schedules` and representative `/patrol_sessions` return JSON `501`, not an Apache HTML error page.

Verification:
- PHP lint passed for every `api/**/*.php` file.
- `git diff --check -- CLAUDE.md api/index.php api/handlers/admin_phase8.php` passed.
- `npm --prefix backend test` passed: permission audit, API smoke, and UAT preflight `90/90`.
- Local PHP compatibility smoke passed Admin reads, email-rule restore-equivalent PUT, permission toggle restore, User JSON `403`, and temporary employee cleanup.
- Production smoke passed 9 Admin read surfaces, email-rule restore-equivalent PUT, permission toggle-and-restore, temporary organization unit create/delete, temporary employee register/update/delete, User JSON `403`, Viewer JSON `403`, and post-mutation audit read.
- Production cleanup verified temporary employee rows `0` and temporary organization unit rows `0`.
- No GitHub push was performed.

Next phase:
- Phase 9: full production regression and final migration hardening across every ported module, role behavior, upload lifecycle cleanup, JSON fallback behavior, known limitations, and the migration readiness report.

## Phase 9 Completed: Final Production Regression and Migration Readiness (2026-06-01)

Phase 9 is complete. The shared-hosting PHP API migration is deployed and production-regressed end to end without pushing GitHub.

Production hardening fix:
- `api/handlers/workflow_phase6.php` now parses `PUT multipart/form-data` on PHP 7.4 for workflow updates, feeds parsed fields/files into the existing workflow upload path, moves parser temp files safely, and applies `0644` permissions after move.
- This closes the KY update parity gap found by regression: `PUT /ky/:id` now replaces attachments/videos correctly, deletes the old file, and serves the replacement file instead of returning static `403`.
- The same compatibility parser is available to CCCF permanent-form and Yokoten response PUT workflows that share `wf_store_files()`.

Deployed PHP handlers:
- `api/handlers/foundation.php`, `platform.php`, `storage.php`, `targets.php`, `people.php`, `content.php`, `operational.php`, `patrol.php`, `operational_phase5.php`, `workflow_phase6.php`, `fourm_phase7.php`, and `admin_phase8.php`.
- Phase 9 uploaded the hardened `api/handlers/workflow_phase6.php` and this `CLAUDE.md`.

Production regression:
- Public/auth contract passed: branding, register options, invalid login JSON `401`, unauthenticated session verify JSON `401`, temporary login/session/profile/password-change flow, and cleanup.
- Read regression passed `100` hosted API routes across Dashboard, Master Data, Settings, Module Forms, Person Search, Activity Targets, Policy, Committee, KPI, Training, OJT/SCW, Patrol, Accident, Machine Safety, Contractor, Safety Culture, CCCF, Hiyari, KY, Yokoten, 4M Change, and Admin Console.
- Role regression passed: temporary User and Viewer sessions receive JSON `403` from Admin-only surfaces. Unknown API paths and retired `/admin/schedules` return JSON `501`, not Apache HTML errors.
- Storage lifecycle passed: generic document upload/static/delete, module forms upload/static/delete, Patrol before/temp/after images, Accident attachment deletion, Machine Safety parent-file cleanup, Contractor document cleanup and accident-file deletion, CCCF permanent/signed files, Hiyari attachment/additional/signed files, KY attachment/video replace/delete, Yokoten response-file deletion, and 4M attachment replace/closing-doc/delete.
- CRUD mutation regression passed with temporary data for Policy, Committee, KPI announcement, Training course/record, OJT record, Safety Culture assessment/PPE item, CCCF worker form, and 4M man record/course master.

Verification and cleanup:
- PHP lint passed for every `api/**/*.php` file after the hardening fix.
- `git diff --check` passed.
- `npm --prefix backend test` passed: permission audit, API smoke, and UAT preflight `90/90`.
- One-time `phase9_control.php` created `CODX_PHASE9_ADMIN`, hard-cleaned marker rows/files, reported remaining marker counts `0`, and was deleted from production. FTP verification confirmed it is absent.
- FTP upload verification found and removed two orphan probe artifacts (`68`-byte PNG and `32`-byte MP4). Production `uploads/` now contains only the two pre-existing baseline PDF files.

Known limitations:
- Shared hosting cannot run Node workers, PM2, Passenger, SSH, Terminal, or PHP process execution functions.
- Historical limitation resolved in Phase G: email outbox retry endpoints now send through direct PHP SMTP and update `Sent`/`Failed` status.
- Phase 8 intentionally retired unused legacy generic CRUD routes and old `/admin/schedule...` routes after frontend usage review.

Post-migration roadmap:
- Run business-user UAT with real role assignments and representative documents.
- Add optional direct PHP SMTP or an external mail worker if queued notifications must send automatically.
- Add monitoring/log review procedures and a MySQL plus uploads backup/restore runbook.

## Post-Migration Improvement Plan (after Phase 9)

Current focus after the completed PHP migration:

- Phase A: documentation/status cleanup. `CLAUDE.md` must state that Phases 0-9 are complete and must not retain stale "after Phase 6" unported-module roadmaps.
- Phase B: restore and polish Dashboard `Department x Module Compliance`. PHP `/api/dashboard/overview` now needs to return `complianceMatrix` data instead of an empty array so the existing dashboard section is visible again.
- Phase C: improve Person Search / Employee Safety 360 UX with Thai + English labels for search, profile, safety signals, empty states, and timeline surfaces.
- Phase D: shared-hosting security hardening review for config access, upload execution blocking, JSON fallback, and Admin/User/Viewer permissions.
- Phase E: backup/restore runbook for production MySQL plus root `uploads/`. Completed in `docs/backup-restore-runbook.md`.
- Phase F: monitoring and error-review checklist. Completed in `docs/monitoring-error-review-checklist.md`.
- Phase G: email notification delivery. Direct PHP SMTP is approved and implemented for shared hosting; outbox retry endpoints must send real email and update `Sent`/`Failed` status.
- Phase H: business-user UAT checklist, deferred until the above cleanup and UX work are complete.

## Post-Migration Phase A-C Completed (2026-06-01)

Phase A-C cleanup and UX recovery is complete locally and ready for production deployment:

- Phase A documentation cleanup: removed the stale post-Phase-6 unported roadmap that said 4M/Admin/legacy CRUD were still pending after Phase 9. The current plan now reflects post-migration improvement work only.
- Phase B Dashboard restoration: PHP `/api/dashboard/overview` now builds and returns `complianceMatrix` from lowercase production tables, honoring Dashboard `pinnedDepartments`. The Dashboard UI keeps the Department x Module Compliance section visible with Thai + English explanation, legend, and an empty state.
- Phase C Person Search UX: `public/js/pages/search.js` now uses Thai + English labels on the Employee Safety 360 shell, search/filter/results, profile KPI cards, person snapshot, risk/compliance signal, empty states, Patrol history, and Safety Timeline.
- Verification: `C:\xampp\php\php.exe -l api\index.php`, `node --check public\js\pages\dashboard.js`, `node --check public\js\pages\search.js`, `git diff --check -- api\index.php public\js\pages\dashboard.js public\js\pages\search.js CLAUDE.md`, local PHP smoke for `/dashboard/overview` and `/person-search/employees`, and `npm --prefix backend test` all passed.

## Post-Migration Phase D Completed (2026-06-01)

Shared-hosting security hardening is complete and deployed:

- Root `.htaccess` now also disables directory listing and denies direct web access to dotfiles, `.env`, package/composer/vercel metadata, backup/database/log/map files, PowerShell/shell scripts, and `phase*_*.php` temporary control scripts.
- Root `.htaccess` still preserves `Authorization` and rewrites `/api/...` to `api/index.php`; existing PHP API contract is unchanged.
- Root `uploads/.htaccess` now disables directory listing, removes executable/browser-scriptable handlers and MIME types, and denies direct access to PHP/PHTML/PHAR/CGI/PL/PY/SH plus HTML/HTM/JS/MJS/SVG/SHTML/XHTML and backup/database/log/map files.
- Production security smoke passed without touching database records: `GET /api/public/branding` returned 200; unknown API returned JSON 501; `/api/config.php`, `/api/config.local.php`, `/.env`, `/package.json`, a temporary `/phase9_probe.php`, and `/uploads/` directory listing returned 403.
- Production upload probe passed: temporary uploaded `.html`, `.js`, `.svg`, and `.php` files returned 403, while a temporary `.pdf` returned 200. All probe files were deleted afterward and FTP listings confirmed no `codx_phaseD_probe*` or `phase9_probe.php` files remained.
- Local verification: `C:\xampp\apache\bin\httpd.exe -t` reported `Syntax OK`, and `git diff --check -- .htaccess uploads\.htaccess CLAUDE.md` passed with only existing CRLF warnings.

## Post-Migration Phase G Completed (2026-06-01)

Direct PHP SMTP email delivery is complete and deployed for shared hosting. The previous limitation where email retry endpoints were queue/status compatibility no-ops is resolved for the PHP layer.

- Added `api/mailer.php`, a PHP 7.4 compatible SMTP client using sockets, STARTTLS, AUTH LOGIN, UTF-8 MIME text/html bodies, and shared outbox helpers.
- `api/config.php` now reads SMTP settings from `api/config.local.php`, process env, or `backend/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_STARTTLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_TIMEOUT_MS`, and `SMTP_EHLO_DOMAIN`.
- `api/index.php` now requires `api/mailer.php` before module handlers.
- Phase 6 outbox endpoints now send real email and update status:
  - `POST /api/cccf/email-outbox/:id/retry`
  - `POST /api/cccf/email-outbox/retry-queued`
  - `POST /api/hiyari/email-outbox/:id/retry`
  - `POST /api/hiyari/email-outbox/retry-queued`
  - `POST /api/ky/email-outbox/:id/retry`
  - `POST /api/ky/email-outbox/retry-queued`
- Phase 7 4M outbox retry now sends real email:
  - `POST /api/fourm/email-outbox/:id/retry`
- New workflow-created outbox rows attempt immediate best-effort sending. A failed SMTP send does not fail the user workflow; the row is marked `Failed` with `Error` so Admin can retry.
- Outbox GET endpoints now return `smtpConfigured` where the frontend already expects it.
- Local verification passed: PHP lint for changed files, `git diff --check`, SMTP config runtime check, local temporary Hiyari outbox SMTP smoke with cleanup, and `npm --prefix backend test` passed `90/90`.
- Production verification passed: deployed `api/mailer.php`, `api/config.php`, `api/config.production.example.php`, `api/index.php`, `api/handlers/workflow_phase6.php`, and `api/handlers/fourm_phase7.php`; `GET /api/public/branding` returned 200; authenticated production outbox reads for Hiyari, KY, CCCF, and 4M returned `smtpConfigured:true`; temporary production SMTP smoke row `CODX_PHASEG_PROD_*` sent successfully and was deleted by the smoke script.
- Temporary production file `codx_phaseg_mail_smoke.php` was uploaded only for the SMTP smoke, then deleted. FTP listing confirmed the file is absent afterward.

Operational note: Gmail SMTP is now the active sender. If the company later provides a Microsoft 365 mailbox such as `safety@thaisummit-harness.co.th` or `noreply@thaisummit-harness.co.th`, switch only the SMTP config values; no handler rewrite should be needed.

## Hiyari Email Template Recovery (2026-06-01)

Follow-up from Phase G: the first SMTP smoke email was intentionally a minimal temporary outbox row, but PHP-created Hiyari workflow emails also still used plain text (`Body`) without `HtmlBody`. This is now corrected in the PHP Phase 6 handler.

- `api/handlers/workflow_phase6.php` now includes PHP Hiyari email template builders with Thai-first + English labels, detail table, action list, system footer, and plain-text fallback.
- Hiyari workflow outbox rows now store `HtmlBody` and send as HTML for:
  - Submitted Excel report to Safety Admin
  - Direct signed PDF submitted to Safety Admin
  - Admin review Approved/Rejected/Completed to reporter email
  - Admin PDF override approval to reporter email
  - Closed/Reopened status updates to reporter email
  - Signed PDF uploaded to Safety Admin
- Retry endpoints remain backward compatible: older rows without `HtmlBody` still send as plain text, while new rows use the HTML template.
- Local verification passed: `C:\xampp\php\php.exe -l api\handlers\workflow_phase6.php` and direct template smoke returned `HIYARI_TEMPLATE_OK`.
- Production verification passed: deployed `api/handlers/workflow_phase6.php` and `CLAUDE.md`; temporary `codx_hiyari_template_smoke.php` inserted one Hiyari outbox row with `HtmlBody`, sent it through SMTP as `Sent`, confirmed `hasHtmlTemplate:true`, deleted the outbox row in `finally`, then the temporary PHP file was removed from production FTP and local workspace.
- Follow-up fix: Outlook displayed the first PHP SMTP smoke as raw MIME because Thai subjects were emitted as one oversized encoded-word. `api/mailer.php` now folds UTF-8 encoded headers and formats the `From` display name safely. The Hiyari PHP HTML template was also restyled to match the original card layout used by the Node KY/Hiyari templates: grey background, centered card, top color bar, kicker pill, status pill, detail table, action panel, note block, and dark footer.
- Production re-smoke passed after the MIME/template fix: temporary row `CODX-HIYARI-151736` / outbox id `36` sent as `Sent`, `hasHtmlTemplate:true`, then the outbox row and temporary smoke PHP file were removed.
- Second MIME root-cause fix: PHP `str_replace(["\r\n", "\r", "\n"], "\r\n", ...)` was normalizing line endings sequentially, which could turn valid CRLF into extra blank lines between mail headers. Outlook then parsed only the first header and displayed `To/Subject/MIME-Version/Content-Type` as raw body text. `api/mailer.php` now uses regex CRLF normalization (`/\r\n|\r|\n/`) for MIME bodies and SMTP dot-stuffing, and keeps encoded-word chunks within the RFC 75-character limit.
- Production re-smoke after CRLF normalization passed: temporary row `CODX-HIYARI-152506` / outbox id `37` sent as `Sent`, `hasHtmlTemplate:true`, then the outbox row and temporary smoke PHP file were removed.
- Hiyari full-loop production smoke passed on 2026-06-02 with run marker `CODX080608`: created 4 temporary Hiyari reports and sent 10 real HTML-template emails to the configured admin recipient. Events covered `Submitted`, `Approved`, `SignedFileUploaded`, `Closed`, `Reopened`, `Rejected`, `ReviewOverrideApproved`, and `DirectSignedSubmitted`. Result: `statusCounts.Sent=10`, `missingHtmlCount=0`. The smoke script deleted temporary `hiyari_emailoutbox`, `hiyarireports`, `hiyari_assignments`, and `employees` rows in `finally`; production FTP temporary script `codx_hiyari_full_loop_smoke.php` was removed and verified 404.
- Post-smoke regression passed: `C:\xampp\php\php.exe -l api\mailer.php`, `C:\xampp\php\php.exe -l api\handlers\workflow_phase6.php`, `git diff --check -- CLAUDE.md api\mailer.php api\handlers\workflow_phase6.php` (CRLF warning only), and `npm --prefix backend test` passed with UAT preflight `90/90`.
- Email template CTA added after the full-loop smoke: Hiyari/KY/CCCF shared corporate templates now include an Outlook-friendly `เข้าสู่ระบบ / Open Safety Core` button plus fallback link to `https://dev.tshpcl.com/safety/tsh-safety-core/` in both HTML and plain text. PHP production default can be overridden with `PUBLIC_APP_URL` or `APP_BASE_URL`; Node shared template uses the same env names for local/parity rendering.
- 4M Change email template migration completed on 2026-06-02: PHP 4M email outbox now has `HtmlBody`, retry sends HTML, and 4M workflow emails use the same corporate card template with 4M-specific kicker/footer plus the login CTA. Events covered: `NoticeCreated`, `NoticePending`, `ActionTaskCreated`, `ActionTaskDone`, and `NoticeClosed`. Production full-loop smoke run `CODX4M083759` sent 5 real emails to the configured admin recipient; result `Sent=5`, `missingHtmlCount=0`. Temporary `fourm_changenotices`, `fourm_actiontasks`, and `fourm_emailoutbox` rows were deleted in `finally`; production smoke script `codx_fourm_email_full_loop_smoke.php` was removed and verified 404.

## Post-Migration Phase E Completed (2026-06-01)

Backup/restore runbook is complete locally:

- Added `docs/backup-restore-runbook.md` for the current DirectAdmin/PHP shared-hosting production target.
- The runbook states that the restore unit is always production MySQL/MariaDB plus root `/tsh-safety-core/uploads/` together.
- Production backup procedure uses DirectAdmin/phpMyAdmin DB export plus FTP download of `/tsh-safety-core/uploads/`; it does not depend on SSH, server terminal, Node, PHP `exec`, `shell_exec`, or `proc_open`.
- Restore procedure covers write freeze, pre-restore safety backup, DB restore options, uploads restore while preserving `uploads/.htaccess`, smoke tests, partial restore patterns, quarterly restore drills, and common failure modes.
- Updated `docs/production-readiness.md` so production backup points to the Phase E runbook. Existing `npm run backup` remains documented for local XAMPP development only.
- No production data was changed for Phase E.

## Post-Migration Phase F Completed (2026-06-01)

Monitoring and error-review checklist is complete locally:

- Added `docs/monitoring-error-review-checklist.md` for production operations after the shared-hosting migration.
- The checklist covers daily, weekly, monthly, and incident-triggered reviews.
- Daily checks focus on Admin System Health, Audit Log `Failed Only`, failed email outboxes for Hiyari/KY/CCCF/4M, JSON/API basics, and blocked sensitive paths.
- Weekly checks include SQL snippets for queued/failed outbox counts, FTP review of `/tsh-safety-core/uploads/`, security probes, and backup freshness.
- Incident playbooks cover API 500/HTML errors, email outbox failures, upload 404s, upload leftovers/orphans, and failed security probes.
- Updated `docs/production-readiness.md` to reference the Phase F monitoring checklist after rollout.
- No production data was changed for Phase F.

2026-06-01 Shared-hosting PHP API compatibility continuation:

- Production frontend remains at `https://dev.tshpcl.com/safety/tsh-safety-core/`, but DirectAdmin shared hosting cannot run `backend/server.js`: there is no Node.js App, PM2, Passenger, SSH, or Terminal, and PHP process execution functions are disabled.
- Root `.htaccess` now preserves `Authorization` and rewrites `/api/...` into `api/index.php` instead of proxying to `127.0.0.1:5000`. Keep the existing frontend URL/API contract unchanged.
- Added phased PHP compatibility layer: `api/index.php`, `api/bootstrap.php`, `api/config.php`, and `api/config.production.example.php`. Production-only `api/config.local.php` contains DB/JWT secrets and is intentionally ignored by Git.
- Production runtime is PHP `7.4.33` with `PDO`, `pdo_mysql`, and `mbstring`. Keep PHP compatibility at 7.4: no PHP 8-only syntax such as union types, `mixed`, `never`, `str_starts_with`, `str_contains`, arrow functions where compatibility is uncertain, or variable-less `catch (Throwable)`.
- Production Linux MySQL table names are case-sensitive and stored lowercase, for example `employees`, `app_settings`, `master_departments`, `master_positions`, `master_safetyunits`, `patrol_attendance`, and `fourm_changenotices`. PHP production queries must use the actual lowercase identifiers.
- PHP endpoints deployed and production-smoke-tested: `GET /api/public/branding`, `POST /api/login`, `POST /api/session/verify`, `GET /api/register/options`, `GET /api/profile`, `GET /api/master/departments`, `GET /api/dashboard/overview`, and `GET /api/dashboard/alerts`.
- PHP login matches Node behavior: query employee ID + password, verify bcrypt hash, allow legacy `Password IS NULL` login where password equals `EmployeeID`, auto-migrate the legacy password with `password_hash()`, normalize role to `Admin` / `User` / `Viewer`, and issue HS256 Bearer JWT with 6-hour expiry.
- Production verification completed: public branding/options return JSON, invalid login returns JSON `401`, invalid token returns JSON `403`, synthetic authenticated session verify/departments/dashboard requests return JSON `200`, and a temporary employee smoke test confirmed legacy login -> bcrypt migration -> hashed login -> session refresh -> profile. Temporary employee and diagnostic files were removed.
- `api/config.php` direct access is blocked with `403`. Backup of the pre-PHP production `.htaccess` was saved locally at `C:\tmp\tsh-safety-core-production-backup\.htaccess.before-php-api`.
- Remaining phase work: port Node-only APIs incrementally, starting with change password, profile update, register submit, uploads/static upload serving, and the module endpoints needed by the first production workflows. Unported PHP paths intentionally return JSON `501`.

2026-06-01 PHP compatibility Phase 0/1 continuation:

- Phase 0 modularization deployed: `api/index.php` now dispatches to `api/handlers/foundation.php` and `api/handlers/platform.php` before the original compatibility fallback. Shared PHP 7.4 helpers in `api/bootstrap.php` now cover route params, authenticated Admin guard, PDO row/execute helpers, and Company Email validation.
- Phase 1 foundation endpoints deployed: `POST /api/register`, `POST /api/change-password`, `PUT /api/profile`, `PUT /api/profile/employee-id`, authenticated `/api/employees` read/write routes, Admin employee create/update/delete/reset-password, JSON bulk import alias `POST /api/admin/employees/import`, and import-template master data.
- Phase 1 platform endpoints deployed: master departments/teams/roles/positions/areas CRUD, position supervisor toggle, safety-unit read, app settings GET/PUT, Dashboard config GET/PUT, and Admin organization departments/units read/write routes.
- Dashboard overview and alerts now consume the persisted Dashboard config; alert due-soon days no longer stay hardcoded.
- Production read smoke passed for the new Phase 1 surfaces and User mutation guard returns `403`. Production mutation smoke passed register -> login -> profile update -> change password -> login -> EmployeeID change -> login, master team create, org unit create, settings write, and Dashboard config write. Temporary employees, team, unit, setting, and Dashboard config changes were cleaned up/restored.
- Remaining Phase 2 dependency work: static uploads and upload delete, branding logo upload, reusable module forms, person search, activity targets, and multipart `POST /api/admin/employee/import`. The JSON legacy import alias is available, but the current Admin Excel upload route still waits for multipart support.

2026-06-01 PHP compatibility Phase 2 continuation:

- Phase 2 shared dependencies deployed through PHP handlers: `api/handlers/storage.php`, `api/handlers/targets.php`, and `api/handlers/people.php`. `api/index.php` dispatches these handlers after the Phase 1 handlers.
- Shared-hosting uploads now write to root `uploads/` and return hosted relative URLs such as `/safety/tsh-safety-core/uploads/<stored-file>?filename=<original-name>`. Added `uploads/.htaccess` to disable directory indexes and deny direct execution of script-like extensions. Back up root `uploads/` together with MySQL on shared hosting.
- Upload endpoints deployed: Admin `POST /api/upload/document`, Admin `DELETE /api/upload/document`, and Admin `POST /api/upload/branding-logo`. Document uploads allow the existing image/document MIME types up to 20 MB; branding allows PNG/JPG/JPEG/WEBP up to 2 MB.
- Reusable Module Forms deployed: authenticated `GET /api/module-forms`, Admin `POST /api/module-forms`, Admin `PUT /api/module-forms/:id`, and Admin `DELETE /api/module-forms/:id`. PHP auto-creates lowercase `module_forms` when needed.
- Activity Targets deployed: activities list, position-template read/write, bulk apply, employee merged-target read/write, and current-user progress read. PHP auto-creates lowercase `activity_position_templates` and `employee_activity_targets` when needed.
- Person Search deployed: authenticated employee search and resilient Safety 360 profile baseline. Missing optional module tables degrade to empty metrics/lists instead of failing the whole profile. The advanced Node profile enrichment remains a follow-up during module migrations.
- Admin Excel import compatibility deployed at multipart `POST /api/admin/employee/import`. `public/js/pages/admin.js` still sends the selected file and now also sends SheetJS-parsed rows as JSON plus Base64 JSON fallback, allowing PHP shared hosting to import `.xlsx` data without a server-side Excel package.
- Production smoke passed: public branding, 9 activity definitions, target read/write, person search, document upload plus static `200` serve, branding upload, module form create/update/delete, multipart employee import, and imported employee profile. Smoke-created employees, target override, module form, uploaded files, and temporary local secret copy were removed after verification. No MySQL schema migration file was added; the three Phase 2 tables auto-create lazily.

2026-06-01 PHP compatibility Phase 3 continuation:

- Phase 3 business content modules deployed through `api/handlers/content.php`, dispatched from `api/index.php`: Safety Policy, Safety Committee, and Safety KPI.
- Policy routes deployed: authenticated `GET /api/pagedata/policies`, Admin create/update/delete, user self-acknowledge, Admin acknowledgement list, Admin acknowledge-all, and Admin restore-current. PHP preserves acknowledgement metadata columns with best-effort schema compatibility alters.
- Committee routes deployed: authenticated `GET /api/pagedata/committees`, Admin create/update/delete, and Admin restore-current. `SubCommitteeData` remains JSON-compatible. Replaced/removed main chart, appointment document, and subcommittee document URLs use root `uploads/` cleanup.
- KPI routes deployed: authenticated announcement page data, Admin announcement list/create/update/delete, authenticated KPI yearly read, Admin KPI create/update/delete, and bulk monthly update. KPI announcement IDs remain stable values such as `KPI-2099`, with numeric suffixes when needed. Bulk update accepts both the browser array contract and a single-row object compatibility form.
- Production smoke passed without changing current production records: Policy create/update/read/self-acknowledge/acknowledgement-list/delete, Committee create/update/read/delete, KPI announcement create/list/delete, KPI create/year-read/bulk-monthly-update/delete, and attached-document cleanup through Phase 2 upload storage. KPI monthly readback verified `Jan=7.00` and `Feb=8.00`.
- Production cleanup verification passed: temporary Policy, Committee, KPI announcement, and KPI rows all returned `0`. Admin restore-current and Policy acknowledge-all endpoints are deployed but were intentionally not invoked against production data because they are state-changing bulk/current-version operations.

2026-05-29 System Branding continuation:

- System Console now has a `Branding` tab for editing app name/tagline, previewing the current logo, uploading a new logo, saving to `App_Settings.app_branding`, and resetting to default.
- Branding logo upload uses dedicated `POST /api/upload/branding-logo` with local `backend/uploads/` storage, 2 MB limit, and PNG/JPG/JPEG/WEBP MIME + extension validation. SVG upload remains blocked.
- Public UI branding loads from `GET /api/public/branding` on app startup and applies to `data-brand-logo`, `data-brand-name`, and `data-brand-tagline` targets with default-logo fallback.
- No new MySQL table was added; existing `App_Settings` is used. Real logo uploads add files under `backend/uploads/` and should be backed up with MySQL.
- 2026-06-02 Branding UX guide added: the Branding tab now explains recommended logo sizing (`512 x 512 px`, minimum `256 x 256 px`), transparent PNG/WebP preference, 15-20% safe area, where the logo is used (Sidebar 40px, Mobile 32px, Login 56px), and the system color palette (`#059669`, `#064e3b`, `#0d9488`, `#ecfdf5`, `#0f172a`, `#d97706`). Frontend-only change; no API, upload storage, or MySQL schema change.

2026-05-28 Login Help Center continuation:

- Login left panel now keeps the compact module showcase style while `public/js/login-guides.js` owns the centralized `LOGIN_MODULE_GUIDES` guide data, module icon map, Thai badge labels, and realistic usage examples.
- Module cards use sidebar-matching icons, compact Thai badges, hover/focus previews with delayed tooltip placement, and click-to-detail modals; mobile shows a single "ดูคู่มือการใช้งานโมดูล" entry point instead of a dense guide list on the login form.
- Help Center Phase 2 is implemented as a single modal: desktop uses a two-pane layout with search + role filters (`ทั้งหมด`, `พนักงานทั่วไป`, `หัวหน้างาน`, `Safety/Admin`) on the left and selected module details on the right; mobile shows the list first and opens detail in-place with a back button.
- Help Center Phase 3 centralizes module metadata in `public/js/module-meta.js`; Login Guide icons/badges/audience, SPA page titles, and Dashboard module labels/icons now read from the shared metadata. Sidebar HTML remains static for now but uses the same icon direction visually.
- The technical login security badges (`JWT Encrypted`, `Role-Based Access`, `TiDB Cloud Database`) are removed from the login view at guide initialization; the left-panel footer status now uses `Guide / User Help` instead of `JWT / Secure Auth`.
- Verification completed: `node --check public/js/main.js`, `node --check public/js/login-guides.js`, `node --check public/js/module-meta.js`, `node --check public/js/pages/dashboard.js`, `git diff --check -- index.html public/js/main.js public/js/login-guides.js public/js/module-meta.js public/js/pages/dashboard.js public/style.css CLAUDE.md`, and the standard mojibake scan for the edited login/help files.
- No backend route, upload storage, or MySQL schema changes were made.

2026-05-27 CCCF Form A Permanent workflow continuation:

- Phase 1 backend workflow was already in place and syntax-clean before this handoff: `CCCF_FormA_Permanent` supports `DocumentMode`, `ReviewStatus`, `ReviewComment`, reviewer metadata, `ExcelFileUrl`, `SignedFileUrl`, `SignedUploadedAt`, and assignment-level `AllowDirectSignedPdf`; CCCF email outbox and retry routes exist.
- Phase 2 frontend popup completed: Permanent modal is wider (`max-w-5xl`), uses a responsive two-column layout, shows owner `CompanyEmail`, warns when missing, and supports three modes: Excel review, signed PDF after approved Excel, and direct signed PDF for allowed assignments.
- Phase 3 admin workflow completed: Permanent page now has an Admin Review Queue, quick approve/reject actions, clearer Direct PDF assignment status, an email outbox/retry modal, and an admin complete/close action that notifies the owner.
- Phase 4 email loop completed/polished for CCCF: events covered include `Assigned`, `Submitted`, `Approved`, `Rejected`, `SignedFileUploaded`, `DirectSignedSubmitted`, and `Completed`; assignment emails now explicitly mention Direct PDF permission.
- Phase 5 smoke coverage added: `backend/scripts/cccf-permanent-workflow-smoke.js` and npm scripts `smoke:cccf` verify Excel submit -> approve -> signed PDF -> complete, rejected Excel, direct signed PDF -> complete, plus CCCF email outbox events.
- Verification completed: `node --check backend/routes/cccf.js`, `node --check public/js/pages/cccf.js`, `node --check backend/scripts/cccf-permanent-workflow-smoke.js`, `git diff --check -- backend/routes/cccf.js public/js/pages/cccf.js`, and `npm --prefix backend run smoke:cccf`.
- Note: CCCF workflow now writes to local `backend/uploads/` during real/smoke uploads and uses MySQL schema auto-migration in `backend/routes/cccf.js`. The smoke script cleans test DB rows directly after verification; uploaded smoke files may remain if Windows holds a fresh file lock.
- Hiyari-parity follow-up completed: `CCCF_Assignments` now auto-migrates `DueDate` and `Note`; assignment API/UI saves and displays both; Permanent tracking table shows due badges and adds Due filter (`Overdue`, `Due Soon`, `No Due Date`).
- Approved Permanent rows now expose an `อัปโหลด PDF` action directly in the tracking table for Admin or the assigned owner, so users do not need to open detail before uploading the signed PDF.
- Added configurable CompanyEmail policy via `App_Settings.cccf_require_company_email`; Admin can toggle it from the CCCF Permanent admin panel. When enabled, frontend and backend block new Permanent submissions if the responsible owner has no valid Employee Master `CompanyEmail`.
- CCCF smoke test now verifies assignment `DueDate`/`Note`, CompanyEmail policy blocking for a no-email user, and restores the previous email policy setting after the run.
- CCCF Form A Worker and Form A Permanent export PDFs now follow the Hiyari-style report direction: solid green full-width headers, rounded KPI cards on summary pages, numbered section titles, matching green detail-page headers, restrained table heads, and light report footers. This affects only the frontend PDF export reports, not Permanent Excel/PDF upload workflow.

2026-05-27 KY Activity email flow continuation:

- KY email flow now follows the Hiyari/CCCF corporate template pattern via `buildHiyariEmail`: reporter Submitted, Safety Admin AdminSubmitted, reporter Reviewed, reporter Closed, and Missing Submission Reminder all generate text + HTML bodies.
- `KY_EmailOutbox` now includes `HtmlBody`; `queueKyEmail()` stores HTML and uses it when SMTP is configured.
- Safety Admin is notified on new KY submission using `KY_ADMIN_EMAIL`, then `HIYARI_ADMIN_EMAIL`, `ADMIN_EMAIL`, or the module default fallback.
- Admin retry support added for KY email outbox: `GET /api/ky/email-outbox`, `POST /api/ky/email-outbox/retry-queued`, and `POST /api/ky/email-outbox/:id/retry`.
- KY Admin UI now loads the latest email outbox items in Manage view, shows status/error/SMTP state, and provides retry all / retry item actions.
- Smoke coverage added: `backend/scripts/ky-email-flow-smoke.js` plus npm scripts `smoke:ky-email` verify submit -> Reviewed -> Closed and require `Submitted`, `AdminSubmitted`, `Reviewed`, `Closed` outbox events with `HtmlBody`.
- Shared corporate email template contrast improved in `backend/utils/hiyari-email-template.js`: header now uses an Outlook-friendly light background with dark title text instead of relying on a gradient + white text, and status chips use stronger tone colors.
- KY submit form UX improved: Company Email now shows a clear Employee Master / missing-email badge, locks the auto-filled master email unless the user explicitly edits it, and shows a live review summary before submit for reporter, date, department, Safety Unit, risk type, participants, and recipient email.
- KY Activity export PDF now follows the Hiyari reference more closely as a fixed 2-page user-facing summary pack: Page 1 report summary/KPI cards/key notes/report health/monthly trend/risk categories/top departments/KYT keywords; Page 2 department target coverage/Safety Unit follow-up/pending unit chips/action follow-up/status control/approval, while preserving KY activity, Safety Unit, status, risk category, and program target data. Legacy KY PDF helper functions remain below but are not used by the current export button.
- Yokoten export PDF now follows the Hiyari reference more closely as a fixed 2-page user-facing summary pack: Page 1 report summary/key notes/topic coverage/department focus; Page 2 risk coverage matrix/action follow-up/follow-up notes/approval, while preserving targeted-department filtering and Yokoten response/approval data.
- Accident single-case export PDF now follows the Hiyari reference more closely as a fixed 2-page case report: Page 1 case summary/general information/person involved/incident narrative/injury-medical information; Page 2 cause analysis/CAPA/preventive action/verification/approval, while preserving Accident case fields including severity, potential severity, recordable, lost days, root cause, corrective/preventive action, due date, investigation status, and CAPA verification.
- Accident overview tab now has a Hiyari-style fixed 2-page PDF export button in the module header: Page 1 executive summary/KPI/key notes/current record/monthly trend/type breakdown/counted case classification/recent case snapshot; Page 2 man-hour and incident rates/department focus/root-cause pattern/area hotspot/injury-body part/open action tracker/follow-up notes, using `/accident/summary`, `/accident/performance`, and `/accident/analytics` for the selected year. Current Record shows current/cumulative man-hour rather than target hours and keeps the status label clear of the progress bar; long department/root-cause labels are wrapped for PDF readability instead of truncated.
- 4M Change PDF exports have started moving to the Hiyari-style report direction: Single Notice, Training Matrix, and Dashboard PDF shared report surfaces now use solid green headers, light report footers, and restrained document styling while preserving 4M notice/task/training/dashboard data.
- Safety Culture Dashboard PDF and Assessment PDF have started moving to the Hiyari-style report direction while preserving Safety Culture score/PPE/violation/assessment data. Dashboard export now follows the Hiyari executive pack style but is allowed to paginate by module content instead of forcing exactly 2 pages: Page 1 covers KPI/maturity/topic register/management focus/report scope; the score visualization/monthly trend page is added only when score/trend data exists; an operational PPE/violation page is added only when those records exist. When data is sparse, Page 1 shows Report Health instead of creating mostly blank pages.
- Safety KPI PDF export now builds its own fixed A4 Hiyari-style report instead of capturing the live dashboard page: solid green report header, KPI summary cards, report health, priority off-track list, department focus, follow-up notes, paginated KPI register with weight/status, light footer, and ASCII `Page x / y` labels while preserving current year/filter scope. Page density is conservative: the first page only starts a short register preview, later pages use smaller chunks so long KPI names do not collide with the footer.
- Safety Patrol encoding recovery completed after a Windows PowerShell UTF-8/ANSI rewrite caused Thai mojibake in `public/js/pages/patrol.js`; the file was restored to readable UTF-8 and verified with `node --check`, mojibake search, and `git diff --check`.
- Safety Patrol PDF save polish continued: issue and attendance PDF exports now use collision-resistant document/file names with date + time down to seconds, and jsPDF overlay page numbers use ASCII `Page x / y` while Thai report content remains rendered through html2canvas for font-safe output.
- Safety Patrol attendance PDF follow-up: Top/Management now uses a formal continuous report structure instead of a fixed 2-page limit: executive summary, continuous member detail table pages, and approval/signature page. Supervisor remains on the previously requested 3-page structure for now.
- Top/Management PDF visual polish continued toward a document-first style: white A4 pages, document-control header table, bordered summary/rating/follow-up tables, continuous member detail tables, and restrained approval blocks instead of dashboard-style cards.
- Top/Management PDF pagination corrected: page 1 now starts the member list immediately after a compact summary and shows rows 1-20; subsequent detail pages start at row 21 and continue sequentially in 24-row chunks. The old Priority Follow-up table was removed from the first page so the report begins with the official member list.
- Top/Management and Sec. & Supervisor attendance PDFs now follow the Hiyari-style report direction: green full-width report header, rounded KPI cards, key notes, pass-rate summary, roster pages with sequential numbering, and Hiyari-style follow-up/approval page. Page density is kept conservative so rows do not collide with the footer in fixed A4 capture.
- Safety Patrol issue PDF now has a formal document-first export path: official header, compact KPI/filter summary, STOP x Rank matrix, continuous issue register pages with sequential numbering, limited high-priority evidence pages, and an approval/signature page. The older issue PDF builder remains below it as fallback code but the formal path returns after export.
- Safety Patrol issue detail images now open in a full-screen image viewer from the issue modal. The viewer sits above the existing modal, supports Escape/backdrop close, and provides Download plus Open original actions for Before, Temporary, and After images.
- Safety Patrol issue PDF styling is aligned to the Hiyari-Hatto executive dashboard report pattern: green full-width report header, rounded KPI cards, numbered summary sections, rank/STOP distribution bars, STOP x Rank matrix, priority follow-up snapshot on page 1, full-width continuous issue register pages for large datasets, evidence cards, and Hiyari-style follow-up/approval page. Keep this as the preferred direction for future module PDF standardization.

2026-05-26 Person Search / Person Profile 360 Phase B:

- `backend/routes/person-search.js` now enriches `GET /api/person-search/profile/:employeeId?year=YYYY` with Employee Master `CompanyEmail`, 4M Training Matrix curriculum scope, 4M curriculum logs, CCCF worker/permanent Form A records, PPE inspection summaries, and PPE violations.
- Person Search accident counts/timeline now filter soft-deleted `Accident_Reports` with `(IsDeleted IS NULL OR IsDeleted=0)`.
- Added backend compliance signals for Training, 4M scope, risk events, safety activity, and PPE, plus an overall status of `Good`, `Watch`, or `Action Needed`.
- `public/js/pages/search.js` now renders a Person Snapshot section, 4M Training Matrix scope cards, Training/PPE/CCCF recent records, module cards for 4M Matrix, and compliance signal cards for the selected person/year.
- Verification completed: `node --check backend/routes/person-search.js`, `node --check public/js/pages/search.js`, `git diff --check -- backend/routes/person-search.js public/js/pages/search.js CLAUDE.md`, and `npm run uat:preflight`.
- Phase C Timeline implemented:
  - Person Search timeline items now use a consistent activity-stream shape: `type`, `module`, `date`, `title`, `status`, `detail`, `severity`, and `refId`.
  - Timeline now includes Training, 4M notices, 4M Training Matrix assignment/transfer logs, Patrol/Self Patrol, CCCF Worker/Permanent Form A, PPE inspection/violation, Accident, KY, Hiyari, and Yokoten records.
  - Backend returns `timelineSummary` with total/module/severity counts; timeline limit increased to latest 40 events for the selected year.
  - Frontend Safety Timeline now has module filter chips, latest-first activity stream cards, module badges, risk badges, and compact icon markers.
  - Verification completed: `node --check backend/routes/person-search.js`, `node --check public/js/pages/search.js`, `git diff --check -- backend/routes/person-search.js public/js/pages/search.js CLAUDE.md`, and `npm run uat:preflight`.
- Phase D Risk & Compliance Signal implemented:
  - `GET /api/person-search/profile/:employeeId` now returns `riskProfile` with weighted score, `Good` / `Watch` / `Action Needed` status, factor scores, reasons, next actions, and counters.
  - Risk scoring currently weights Training pass rate 30%, 4M Training Matrix scope 20%, Accident/PPE/Patrol risk events 25%, KY/Hiyari/CCCF proactive activity 15%, and PPE compliance 10%.
  - Accident or PPE violation in the selected year forces `Action Needed`; missing training, missing 4M scope, no proactive activity, patrol issues, or score below 80 produce `Watch`.
  - Person Search UI now includes a Risk & Compliance Signal panel with score, factor progress bars, reasons, next actions, and key risk counters.
  - Verification completed: `node --check backend/routes/person-search.js`, `node --check public/js/pages/search.js`, `git diff --check -- backend/routes/person-search.js public/js/pages/search.js CLAUDE.md`, and `npm run uat:preflight`.
- Phase E Export / Audit View implemented:
  - Person Profile header now has `Excel` and `Print` actions.
  - Excel export builds a person audit workbook from the loaded profile data with sheets: `Profile`, `Risk Signal`, `Timeline`, and `4M Scope`.
  - Print action opens a print-friendly Person Profile 360 audit view with profile snapshot, risk reasons, next actions, factor scores, and timeline.
  - Export uses existing frontend SheetJS (`XLSX`) and print APIs; no backend route or database schema change.
  - Verification completed: `node --check public/js/pages/search.js`, `node --check backend/routes/person-search.js`, `git diff --check -- public/js/pages/search.js backend/routes/person-search.js CLAUDE.md`, and `npm run uat:preflight`.
- Navigation shell polish completed:
  - Desktop sidebar can collapse into an icon rail from either the sidebar header button or the top header button.
  - Collapsed desktop state is stored in `localStorage` as `tsh_sidebar_collapsed`; mobile view always uses the drawer behavior.
  - Mobile header now includes a clear logout button while the drawer still keeps the full logout action.

2026-05-25 4M Change continuation:

- Phase A Training Matrix foundation continued:
  - `backend/routes/fourm.js` now auto-creates `FourM_Curriculums`, `FourM_Courses`, `FourM_CourseEmployees`, and `FourM_CurriculumLogs`.
  - Added CRUD-style APIs for 4M curriculums and courses plus assignment APIs:
    `GET/POST /api/fourm/training-curriculums`,
    `PUT/DELETE /api/fourm/training-curriculums/:id`,
    `GET/POST /api/fourm/training-curriculums/:id/courses`,
    `PUT/DELETE /api/fourm/training-courses/:id`,
    `GET/POST /api/fourm/training-courses/:id/assignments`,
    `PUT/DELETE /api/fourm/training-assignments/:id`,
    and `GET /api/fourm/training-logs`.
  - Assignment delete is a soft remove (`Status='Removed'`) so audit history remains intact. Re-adding the same employee to the same course reactivates the existing row.
  - Every curriculum/course/assignment mutation writes both `FourM_CurriculumLogs` and central `Admin_AuditLogs`.
  - Permission pattern for Phase A Training Matrix: Admin can manage all departments; non-admin users can manage only their own department via inline route guard.
  - Verification completed: `node --check backend/routes/fourm.js`, `node --check backend/scripts/permission-audit.js`, `git diff --check -- backend/routes/fourm.js`, and `npm --prefix backend test`.
- Phase B Training Matrix UI started:
  - `public/js/pages/fourm.js` now adds sub-tabs inside 4M > Man Record: `Exam Summary` and `Training Matrix`.
  - Training Matrix UI has Year/Department filters, curriculum list, course list, assignment table, and Employee Master multi-select modal.
  - UI supports create/edit/disable curriculum, create/edit/disable course, assign multiple employees from `/api/employees`, and soft-remove course assignment.
  - Current UI intentionally does not implement cross-course movement yet; keep that for Phase C so old/new course logging can be handled as one workflow.
  - Verification completed: `node --check public/js/pages/fourm.js`, `git diff --check -- public/js/pages/fourm.js CLAUDE.md backend/routes/fourm.js backend/scripts/permission-audit.js`, and `npm --prefix backend test`.
- Phase C Training Matrix movement workflow implemented:
  - Added `POST /api/fourm/training-assignments/:id/transfer` in `backend/routes/fourm.js`.
  - Transfer runs in one MySQL transaction: source assignment becomes `Transferred`, destination course row becomes `Assigned` (reactivates an old non-active row when present), and duplicate active destination assignment returns 409.
  - Transfer permission follows Training Matrix scope: Admin can transfer across all departments; non-admin users can transfer only within departments they are allowed to manage.
  - `FourM_CurriculumLogs` stores `ASSIGNMENT_TRANSFER` with old/new curriculum and course details in JSON; central `Admin_AuditLogs` also records old/new course metadata.
  - Training Matrix UI now shows `Transfer` next to active assignments and opens a destination-course modal grouped by curriculum.
  - Verification completed: `node --check backend/routes/fourm.js`, `node --check public/js/pages/fourm.js`, `node --check backend/scripts/permission-audit.js`, `git diff --check -- backend/routes/fourm.js backend/scripts/permission-audit.js public/js/pages/fourm.js`, and `npm --prefix backend test`.
- Phase D Training Matrix permission + audit view implemented:
  - `GET /api/fourm/training-logs` now supports `year`, `dept`, `action`, `curriculumId`, `courseId`, `employeeId`, and `limit` filters.
  - Non-admin log access is restricted to the user's own department; Admin can filter all departments.
  - Training Matrix UI now has an `Audit Log` modal with Current Selection vs Whole Year/Department scope and action filters.
  - Audit timeline highlights transfer events with old/new curriculum and course details from `FourM_CurriculumLogs` JSON.
  - Non-admin curriculum creation UI locks Department to the signed-in user's department, and Employee Master assignment picker is scoped to the selected curriculum department.
  - Verification completed: `node --check backend/routes/fourm.js`, `node --check public/js/pages/fourm.js`, `git diff --check -- backend/routes/fourm.js public/js/pages/fourm.js`, and `npm --prefix backend test`.
- Phase E Training Matrix export implemented:
  - Training Matrix UI now has `Excel` and `PDF` export buttons for the current Year/Department scope.
  - Excel export builds an audit workbook with sheets: `Summary`, `Curriculums`, `Courses`, `Employees`, and `Audit Logs`.
  - PDF export builds an audit package with a summary/curriculum scope page plus paginated employee scope pages.
  - Export data is gathered from live Phase A-D APIs, including curriculum/course/assignment rows and latest Training Matrix audit logs.
  - Verification completed: `node --check public/js/pages/fourm.js`, `git diff --check -- public/js/pages/fourm.js CLAUDE.md backend/routes/fourm.js backend/scripts/permission-audit.js`, and `npm --prefix backend test`.
- Training Matrix UX improvements continued:
  - Added a KPI summary bar above the Training Matrix columns for curriculums, courses, employees in scope, transferred rows for the selected course, and inactive items.
  - Added client-side search boxes for the three Training Matrix columns: curriculum, course, and employee assignment. Searches filter the already-loaded arrays and do not add backend/API load.
  - Search boxes are bilingual Thai/English and become disabled until their parent scope is selected.
  - Added a bilingual selection summary / breadcrumb above the Training Matrix columns showing Year > Department > Curriculum > Course, plus assigned/transferred counts for the selected course.
  - Improved the Assign Employees modal with a sticky selected-count summary (`เลือกแล้ว N คน / N selected`) and a dynamic disabled/enabled submit button. Selection is kept in modal state so it survives search/list re-rendering.
  - Added an Employee History quick view button on each Training Matrix assignment row. It opens a bilingual modal backed by `GET /api/fourm/training-logs?employeeId=...`, showing that employee's add/remove/transfer audit trail for the current year.
  - Improved the Transfer Employee modal with a side-by-side Current vs Destination course comparison, dynamic destination preview, warning text for different curriculum/department transfers, and a detailed confirmation modal before the transfer API call.
  - Fixed Man Record sub-tab persistence: the selected sub-tab (`summary` or `matrix`) is stored in `sessionStorage` via `fourm_man_subtab`, so browser refresh keeps users on Training Matrix instead of falling back to Exam Summary.
  - Clarified Training Matrix scope rule: course codes/titles may repeat across different curriculums because `FourM_Courses` is unique by `(CurriculumID, CourseCode)`, while one employee may be active in only one curriculum for the same year/department scope. The same employee may still be assigned to multiple courses inside that same curriculum.
  - Added `GET /api/fourm/training-employee-scopes` and backend assignment/transfer guards so employees already active in another curriculum are blocked at API level, not just in the browser.
  - Updated the Assign Employees modal to disable employees already active in another curriculum, show a short reason badge, allow same-curriculum course assignment, and report partial assignment when some selected employees are blocked.
  - Tightened Training Matrix labels/buttons and added title tooltips on long curriculum/course names so the screen is less text-heavy while keeping Thai/English where it helps operators.
  - API smoke test completed on local backend port 5000: temporary `CODX-SMOKE-*` curriculums/courses were created, same-employee assignment to two courses in the same curriculum succeeded, same-employee assignment to another curriculum returned HTTP 409 as expected, and the temporary active records were soft-disabled/removed afterward.
  - Verification completed: `node --check backend/routes/fourm.js`, `node --check public/js/pages/fourm.js`, and `git diff --check -- backend/routes/fourm.js public/js/pages/fourm.js CLAUDE.md` (working-copy CRLF warning only).
- Training Matrix UX/data model refinement continued:
  - Added Course Master support with `FourM_CourseMaster` and `/api/fourm/training-course-master` so Admin can create reusable course subjects before linking them into curriculums.
  - Added `CourseMasterID` to `FourM_Courses`; the same master course can now be linked into multiple curriculums while each curriculum still keeps its own active course list.
  - Added curriculum-level employee assignment with `FourM_CurriculumEmployees`, `GET/POST /api/fourm/training-curriculums/:id/assignments`, and `DELETE /api/fourm/training-curriculum-assignments/:id`.
  - New assignment guard: a curriculum must have at least one active course before employees can be assigned; assigning the same employee to another active curriculum in the same year/department still returns HTTP 409.
  - Training Matrix UI changed from the previous 3-column `Curriculum > Course > Employees` layout to a 2-pane workflow: curriculum list on the left and curriculum detail on the right, with detail tabs for `Courses` and `Employees`.
  - Added Course Master modal and "pick from master" course linking modal. Employees are now assigned at curriculum level, and the Assign button is disabled until the selected curriculum has courses.
  - Inline usability update: the `Courses` tab now shows both linked curriculum courses and active Course Master rows in the same view, with one-click Add buttons for master courses not yet linked. The `Employees` tab now preloads Employee Master rows in the detail pane with inline checkboxes and an Assign Selected action, while still blocking employees already assigned to another active curriculum.
  - Permission/visibility refinement: curriculum/course/course-master create/edit/disable APIs are now Admin-only. Non-admin users can still list permitted department scope and manage curriculum employee assignments within their allowed department. The Training Matrix UI hides admin-only controls for non-admin users and shows a user role badge.
  - UI density refinement: Course Master rows inside the course tab are compact by default with an expand/compact toggle, and Employee Master is hidden behind a `เลือกพนักงาน` toggle so the curriculum detail pane starts cleaner.
  - Replaced the text-heavy `Current scope` summary with a compact SVG-icon Context Bar showing year, department, selected curriculum, linked course count, assigned employee count, and Admin/User role. The bar uses a lightly elevated gradient panel instead of flat text, and the course-as-scope label was removed because assignment now happens at curriculum level.
  - API smoke test completed on local backend port 5000: temporary `CODX-*` Course Master/Curriculums/Courses were created, assignment without courses returned HTTP 400, one master course linked into two curriculums successfully, assignment to curriculum A succeeded, assignment of the same employee to curriculum B returned HTTP 409, and temporary active records were removed/disabled afterward.
  - Permission smoke test completed on local backend port 5000: User role receives HTTP 403 for creating Course Master, creating Curriculum, and linking Course; User role can still list permitted curriculums and curriculum assignments.
  - Admin tooling completion: linked curriculum courses now use explicit `Remove from curriculum` wording, and Course Master admin modal now supports add, edit, delete/disable, and restore/reactivate. Smoke tested Course Master create/edit/delete/restore APIs on local backend port 5000.
  - Verification completed: `node --check backend/routes/fourm.js`, `node --check public/js/pages/fourm.js`, and `git diff --check -- backend/routes/fourm.js public/js/pages/fourm.js CLAUDE.md` (working-copy CRLF warning only).
- Change Notice + Training Dashboard UX refinement:
  - Change Notice filter area was redesigned from stacked plain inputs into an enterprise-style Notice Register toolbar with status chips, labeled filters, separated search, export, and New Notice actions.
  - Added `GET /api/fourm/notice-next-no?date=YYYY-MM-DD`; the create Notice modal now previews the next Notice No and refreshes it when Request Date changes. The backend still generates the final number at submit time to avoid duplicate sequence conflicts.
  - Dashboard now includes a Training Matrix Snapshot card for the selected year, showing active curriculums, linked courses, employees in scope, and transferred rows, with a shortcut into Man Record > Training Matrix.
- Department Exam Summary now links to Training Matrix scope without changing the existing Man Record table model:
  - Added `GET /api/fourm/training-department-scopes?year=YYYY&q=...` to summarize active Training Matrix scope by department from `FourM_Curriculums`, `FourM_Courses`, and `FourM_CurriculumEmployees`.
  - Exam Summary merges real `FourM_ManRecords` with virtual Training Matrix rows. Departments with Training Matrix scope but no exam record show as `Pending` / `รอบันทึกผล`, tagged with the Matrix employee count, and are not inserted into DB until Admin saves.
  - Admin can click `บันทึกผล` on a virtual scope row to open the existing Man Record form prefilled with Department and TotalAttendance from Training Matrix; Admin still manually enters Pass and the system calculates Fail.
- Course Master admin refinement:
  - Course Master `Category` is now a dropdown with the three company categories: `การประเมินเชิงคุณภาพ`, `การประเมินเชิงความปลอดภัย`, and `การประเมินจิตสำนึกความปลอดภัย`.
  - Active Course Master rows use `ปิด / Disable`; inactive rows now show both `เปิดใช้ / Restore` and `ลบถาวร / Delete`. Hard delete calls `DELETE /api/fourm/training-course-master/:id?hard=1` and is blocked if the course is still linked to curriculum courses.
  - Cleaned up local smoke data created during development: `CODX-M-082720`, `CODX-ADM-090403`, and inactive smoke curriculums `CODX-CUR-A-082720` / `CODX-CUR-B-082720`.
- Fixed Change Notice create flow in `backend/routes/fourm.js` so the `NoticeCreated` email outbox row is queued before the API sends the 201 response. SMTP delivery still remains background/non-blocking.
- Continued the Single Notice PDF in `public/js/pages/fourm.js` by adding formal Evidence / Attachments and Review / Approval History sections alongside the existing Control Summary, Impact Assessment, Action Plan summary, closing summary, and Prepared/Checked/Approved signature boxes.
- Completed 4M Dashboard UX Phase 1-3 in `public/js/pages/fourm.js`:
  - Reordered Dashboard flow to Command Center -> My Work / Priority Queue -> Operational KPI -> Admin Insight -> Charts/Matrix -> Man Summary -> Email Outbox.
  - Reworked Command Center as a compact enterprise tool dock combining Change Overview, mini status counters, linked systems, and related forms.
  - Added role-aware My Work / Priority Queue: ordinary users see their open/pending/closed notice counts and own pending queue; Admin sees open/pending/overdue/closure controls and priority queue.
  - Dashboard queue/filter buttons navigate to Change Notice with the relevant status/mine/overdue filters.
  - Phase 3 polish added prominent Command Center actions for Create Notice, My Notices, and Dashboard PDF plus stronger enterprise empty states for related 4M forms.
  - Phase 4 started: Admin Insight now has clickable decision cards for Top Change Type, Watch Department, Longest Pending, department ranking, and Change Type ranking. These drill down into Change Notice with status/type/department filters applied.
  - Phase 4 refinement added admin risk signals: Low Closure Dept, Pending By Type, and Monthly Momentum. `/fourm/stats` now returns `lowClosureDept` and `typePendingRisk` under `adminInsights`; monthly momentum is derived client-side from `monthlyClosure`.
  - Phase 7 completed: Dashboard PDF exports all four built pages. Page 2 now includes a Training Matrix Snapshot from `/fourm/stats.trainingSummary`; pages 3-4 include Change Notice and Man Record detail lists.
  - Dashboard redundancy cleanup: removed the separate top Dashboard header card and removed mini KPI counters from Command Center. Year/PDF controls now live in Command Center; status numbers stay in Workbench/KPI sections.
- 4M final integration close-out:
  - Change Notice detail now connects `TrainingRequired` records to Man Record > Training Matrix. The CTA opens Training Matrix and applies the Notice year/department scope.
  - Training Matrix employee movement is now aligned with the current curriculum-level assignment model. `POST /api/fourm/training-curriculum-assignments/:id/transfer` transfers an employee from one curriculum to another, requires the destination curriculum to have at least one active linked course, blocks duplicates, respects department/admin permission rules, and writes both `FourM_CurriculumLogs` and `Admin_AuditLogs`.
  - Training Matrix assignment rows expose curriculum-level `Transfer` for active assignments; the old course-assignment transfer path remains available as a legacy API/UI fallback but is no longer the primary workflow.
  - 4M module is now connected across Change Notice -> Training Required -> Training Matrix -> Department Exam Summary -> Dashboard/PDF audit output without changing the existing Man Record table contract.
- Verification completed:
  - `node --check backend/routes/fourm.js`
  - `node --check public/js/pages/fourm.js`
  - `git diff --check -- backend/routes/fourm.js public/js/pages/fourm.js` (only CRLF working-copy warnings)
  - `node backend/scripts/fourm-phase5-smoke.js`
- Next recommended 4M work: production UAT with real Admin/User accounts and real Employee Master data; feature work can move to the next module.

Current working module: **Master Email Foundation / KY follow-up email readiness**.

2026-05-22 active handoff:

- User wants Employee Master/System Console to support optional company email for future KY notification and follow-up workflows.
- Rule: `CompanyEmail` is optional when creating/importing employees, but if filled it must use `@thaisummit-harness.co.th`.
- Backend work already started:
  - Added `backend/utils/company-email.js` with `validateCompanyEmail()`, `normalizeCompanyEmail()`, and `ensureEmployeeCompanyEmailColumn()`.
  - `Employees.CompanyEmail VARCHAR(150) DEFAULT NULL` is auto-migrated by the helper, with best-effort index `idx_employees_company_email`.
  - `backend/routes/admin.js` now imports the helper and started wiring `CompanyEmail` into admin employee GET/create/update/import.
  - `backend/server.js` generic `/api/employees` GET/create/update/import routes now started accepting/validating `CompanyEmail`.
- Frontend Step 1 work in `public/js/pages/admin.js`:
  - Added `EMP_COMPANY_EMAIL_DOMAIN`, `_normalizeEmpCompanyEmail()`, `_validateEmpCompanyEmail()`.
  - Employee table search now includes `CompanyEmail`.
  - Employee table and export now show/export `CompanyEmail`.
  - Step 1 frontend is now closed: `_empFormFields()` create/edit modal includes optional `CompanyEmail`, and add/edit submit validates the company domain before API POST/PUT.
  - Employee Import modal help text and downloaded Excel template now include `CompanyEmail`; imports keep blank email optional and skip invalid domains via backend validation.
- Next planned step: **Step 2 Email Requirement Rules**.
  - Keep `CompanyEmail` optional in Employee Master.
  - Add editable System Console config for the positions that should have a company email instead of hardcoding the KY follow-up rule.
  - Seed the rule from the user-approved leadership/supervisor positions before adding Email Readiness badges and queues in Step 3.
- Step 2 Email Requirement Rules is now implemented:
  - Admin API `GET/PUT /api/admin/email-requirement-rules` validates saved `Master_Positions` IDs and stores the editable rule in `App_Settings` key `employee_email_required_positions`.
  - If no rule has been saved yet, the API proposes the user-approved leadership/supervisor positions that currently exist in `Master_Positions` as the default selection.
  - System Console > Reference Data now has an **Email Requirement Rules** panel where Admin can select the positions that should have `CompanyEmail`.
  - Master Positions list shows an `Email` badge for positions currently selected by the rule.
  - The rule remains advisory in Step 2; it does not block employee create/import when `CompanyEmail` is blank.
- Next planned step after Step 2: **Step 3 System Console Email Readiness**.
  - Use Employee Master plus Email Requirement Rules to show readiness counts, missing-email list, invalid-domain list, and employee badges.
- Step 3 System Console Email Readiness is now implemented:
  - Admin API `GET /api/admin/email-readiness` evaluates Employee Master against Email Requirement Rules and returns readiness rows plus summary counts.
  - The readiness result distinguishes optional employees, ready emails, required positions missing email, and legacy invalid-domain email data.
  - System Console > Employee Master now shows an Email Readiness panel with summary metrics and a review queue for employees that need email correction.
  - Employee table now shows an Email Readiness badge per employee so Admin can see `Ready`, `Missing Required Email`, `Invalid Domain`, or optional status while editing master data.
  - Employee create/edit/import refreshes readiness after save so the panel and table stay in sync.
  - UAT preflight now checks admin access to Email Requirement Rules and Email Readiness, plus user blocking for the readiness endpoint.
- Step 4 KY Email Integration is now implemented:
  - KY submit form calls `/api/ky/email-profile` and auto-fills `CompanyEmail` from Employee Master for the signed-in reporter when available.
  - If Employee Master does not yet have a company email, the reporter or Admin may type an optional email in the KY form; if filled, it must use `@thaisummit-harness.co.th`.
  - Admin submit-on-behalf reuses the selected reporter master email from KY employee search and lets Admin fill the same optional company-email field when that master row is still blank.
  - `KY_Activities.ReporterEmail` stores the reporter email snapshot used on the submission date, and KY detail shows that notification email with the record.
  - KY submit and Admin close transitions now queue reporter notifications in `KY_EmailOutbox`. If SMTP is configured, the backend attempts immediate delivery and marks the row `Sent` or `Failed`; otherwise the row remains queued for server-side follow-up.
  - MySQL schema changes in Step 4: auto-migration adds `KY_Activities.ReporterEmail` and creates `KY_EmailOutbox`. No new upload storage path was added.
- Step 5 KY Reminder for Missing Submissions is now implemented:
  - Admin KY Manage > Coverage & Follow-up loads `/api/ky/reminder-queue` for the selected year and the current month.
  - Reminder queue scope comes from active `KY_Program_Config`: a config with Safety Units creates one pending scope per missing Safety Unit, otherwise it creates a department-level pending scope.
  - Responsible recipients come from Employee Master in the same Department whose Position is in Email Requirement Rules. If the Safety Unit matches `Employees.Unit`, that unit-specific candidate list is preferred; otherwise the queue falls back to department-level candidates.
  - If Admin has not saved Email Requirement Rules yet, KY uses the same seeded leadership/supervisor position names as the Step 2 default rule.
  - Ready queue rows can send one reminder or all ready reminders through `POST /api/ky/reminders/send`. Blocked rows explain whether the rule is empty, responsible employee is missing, CompanyEmail is blank, or CompanyEmail is invalid.
  - Reminder emails reuse `KY_EmailOutbox` with event type `MissingSubmissionReminder`, preserve SMTP `Queued`/`Sent`/`Failed` status, and write `KY_MISSING_SUBMISSION_REMINDER_SEND` audit entries.
- Next planned step after Step 5: browser/UAT review of the KY email flow and then continue with the next module once the user accepts the KY reminder behavior.
- Important blocker/note: `public/js/pages/admin.js` contains Thai text that appears mojibake in shell output, so patches matching Thai labels may fail. Continue by patching around stable English tokens such as `Role`, `name="Role"`, `_empFormFields`, `headers = [...]`, and submit handlers instead of matching Thai text.
- Step 1 verification completed on 2026-05-22:
  - `node --check backend/utils/company-email.js`
  - `node --check backend/routes/admin.js`
  - `node --check backend/server.js`
  - `node --check public/js/pages/admin.js`
  - `git diff --check -- backend/utils/company-email.js backend/routes/admin.js backend/server.js public/js/pages/admin.js CLAUDE.md`
  - `Select-String -Path backend/utils/company-email.js,backend/routes/admin.js,backend/server.js,public/js/pages/admin.js,CLAUDE.md -Pattern ([char]0xFFFD)` should return no rows.
  - `npm --prefix backend test`
- Manual test after Step 1:
  - System Console > ข้อมูลพนักงาน: add employee with blank CompanyEmail should save.
  - Edit employee with `test@gmail.com` should reject.
  - Edit employee with `name@thaisummit-harness.co.th` should save and display in table/export.
  - Excel import with `CompanyEmail` column should import valid company emails and skip invalid domain rows.
- Manual test after Step 4:
  - KY > ส่งกิจกรรมใหม่ as a reporter with Employee Master `CompanyEmail`: the form should auto-fill the company email and the saved KY detail should show that snapshot.
  - KY submit with blank master email and `test@gmail.com`: frontend/backend should reject the non-company domain.
  - Admin submit-on-behalf: selecting an employee should switch the notification email to that employee master email when available.
  - Admin closes a KY record with `ReporterEmail`: a `Submitted` or `Closed` email row should appear in `KY_EmailOutbox`, and with SMTP configured the status should move to `Sent` or `Failed`.
- Manual test after Step 5:
  - Add active KY Program Config for the current year, leave the current month missing, and open KY > จัดการ > Coverage & Follow-up: pending Department/Safety Unit rows should appear in KY Reminder Queue.
  - With a responsible Employee Master row whose Position is in Email Requirement Rules and valid `CompanyEmail`, the row should appear under ready queue and send a `MissingSubmissionReminder` outbox row.
  - Remove that CompanyEmail or use an invalid legacy domain: the row should move to blocked queue with the reason shown instead of sending.
  - Sign in as ordinary User and call `/api/ky/reminder-queue`: access should be blocked.

Recent module progress:

| Module | Current status | Notes / next check |
|--------|----------------|--------------------|
| Database / Storage | Done for local MySQL + company server style storage | Cloudinary removed from runtime path. Back up MySQL together with `backend/uploads/`. |
| Policy | Done | PDF/file preview flow was adjusted for local storage. Admin acknowledge-all exists. |
| Committee | Done | Sub-committees use master department/unit, sub-position rows, and separate PDF attachments. |
| KPI & Metrics | Done | Announcement linkage fixed, department/unit from master, enterprise UI polish applied. |
| Safety Patrol | Done | Duplicate focus strip removed, validation/empty states/audit/session hardening added. |
| CCCF Activity | Done | Reviewed and polished while preserving Form A Worker / Permanent flow. Watch Thai text after any edit. |
| Machine & Device Safety | Done | Extra duplicate dashboard strip removed; route/order and file upload behavior reviewed. |
| Stop-Call-Wait / OJT | Done | Reviewed and polished; preserve existing SCW document/OJT department flow. |
| Safety Training | Done | Dashboard duplication reduced; training records/courses tabs kept in existing flow. |
| Accident Report | Done / recently stabilized | Accident + Near Miss + Safety KPI Board are linked. Detail modal uses Word-like reader layout. PDF export and filters were adjusted. |
| Yokoten | Current review complete | Admin response-on-behalf, formal detail modal, compact filters, SLA filter, file validation, soft-delete handling, and response approval flow are in place. Final browser QA items: admin respond for 1 dept, multi-dept with file, ordinary user permission. |
| Safety Culture | Reviewed / current pass complete | Campaign Featured card flow, dashboard gap fill, Assessment review helpers, and PPE Control template-driven inspection flow were added while preserving the original module tabs and data flow. |
| Contractor & Supplier E-Pass Online | Reviewed / current pass complete | Documents separate Contractor/Supplier via `PartyType`; Accident Records store simple external incident statistics with multi-file evidence, company master suggestions, year filtering, CSV exports, and accident audit trail for the Zero External Accident target. |
| Hiyari (Near-Miss) | Active development | Dashboard, report submission, admin review workflow, PDF export, permissions, and Manage subtabs are in place. Current follow-up: Excel review preview fallback and real admin email delivery still need implementation/verification. |

2026-05-21 worklog summary:

- Safety Culture was reviewed end to end before moving on. The campaign/library surface now supports a single Featured Campaign (`SC_Principles.IsFeatured`), keeps the existing 1-8 card flow, and shows the selected featured card above the campaign library.
- Safety Culture Dashboard was refined to avoid duplicate summary content and fill the lower-right gap with a decision-oriented panel when PPE per-item data is unavailable.
- Safety Culture Assessment added non-breaking review helpers around the existing assessment records: insight/filters/heatmap/note visibility and clearer area handling so the main Area/Department field is not confused with optional per-topic area detail.
- Safety Culture PPE Control was expanded in sequence: formalized filters/insights, bilingual Thai+English inspection UI, area and employee master lookup support, current-user inspector default, evidence upload/camera capture, template-driven inspection by PPE work type, and optional PPE item image/description guidance.
- Contractor module was renamed and restyled as Contractor & Supplier E-Pass Online while keeping the existing document repository flow. Document cards can switch Grid/List view and documents are separated by Contractor/Supplier party type.
- Contractor dashboard duplicate repository summary cards were removed. The module now keeps the document repository, zero external accident objective, Accident Records, company master suggestions, year/export helpers, attachment management, and accident audit trail connected through the same reload flow.
- Hiyari Phase 1-5 work was carried forward: dashboard polish, report workflow, history/detail/admin management improvements, permissions review, PDF export redesign, filters/drill-down/export helpers, and Thai text checks after prior mojibake issues.
- Hiyari submit email readiness now follows Employee Master first: `/api/hiyari/assignments` exposes `Employees.CompanyEmail`, New Report auto-fills/locks CompanyEmail for the current reporter or selected on-behalf assignment, and backend submit/direct-signed endpoints resolve `Employees.CompanyEmail` before accepting a manual company-email fallback.
- Hiyari new-report workflow now separates `ส่ง Excel เพื่อตรวจสอบ` from `ส่ง PDF ที่ลงนามแล้ว`. Excel review submit requires company email in `@thaisummit-harness.co.th`, supports submit-on-behalf from Hiyari assignments, and records review states before signed PDF completion.
- Hiyari Admin Manage page now uses secondary tabs: `ตรวจรายงาน`, `รายการมอบหมาย`, and `แบบฟอร์มที่เกี่ยวข้อง`. Review list filters document stage, opens the submitted Excel file, and exposes review result/comment updates.
- Hiyari in-app admin review notice now shows pending-review badges and checks for newly pending Excel reports while the Hiyari page is open. Email events are queued in `Hiyari_EmailOutbox`; when SMTP env is configured, the backend now attempts immediate real delivery and marks outbox rows `Sent` or `Failed`.
- Hiyari Excel review preview no longer depends only on Google/Office online viewers for local/private server files. `showDocumentModal()` now uses SheetJS (`window.XLSX`) to render the first worksheet inline when possible, then falls back to open/download if preview fails.
- Hiyari email delivery config is optional and non-breaking. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_STARTTLS`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and optional `HIYARI_ADMIN_EMAIL` in `backend/.env` on the company server. Admin can inspect/retry via `GET /api/hiyari/email-outbox` and `POST /api/hiyari/email-outbox/:id/retry`.
- Hiyari email copy is now standardized for all active email flows: new Excel report to Admin, review approved/rejected to User, signed PDF uploaded to Admin, and closed/reopened status to User. Subjects use `[Hiyari-Hatto] ...`; bodies include formal greeting, report details, action required, and system footer.
- Hiyari email presentation now uses Thai-first corporate HTML email templates with plain-text fallback. `backend/utils/email.js` sends multipart text+HTML when `html` is provided, `backend/utils/hiyari-email-template.js` renders the Hiyari layout/status colors/detail table/action panel, and `Hiyari_EmailOutbox.HtmlBody` stores HTML for retry while old text-only outbox rows remain compatible.
- Hiyari email smoke testing uses `backend/scripts/hiyari-email-flow-smoke.js` so Thai test content is read as UTF-8 and does not become `????` through PowerShell piping. The script sends real emails for Submitted, Approved, SignedFileUploaded, Closed, Reopened, Rejected, ReviewOverrideApproved, and DirectSignedSubmitted loops.
- Hiyari Admin Override is available for practical document-flow exceptions. Admin can open a report and use `Admin Override` to allow signed-PDF submission even when the normal Excel approval flow cannot be completed. The system requires a reason, sets the report to `Approved`, records `ReviewOverrideReason/By/At`, writes `HIYARI_REVIEW_OVERRIDE` audit log, and emails the reporter.
- Hiyari Assignment now has a per-person `AllowDirectSignedPdf` switch. Admin sets it in `จัดการ > รายการมอบหมาย` when adding or editing an assignment; permitted assignees can use the New Report tab to send a signed PDF directly without a prior Excel review report, while the backend still checks that assignment permission before creating the completed document record.
- Hiyari signed-PDF submission now captures the form before async upload to avoid browser `currentTarget` becoming `null` after `await`. The Manage tab also has `Retry Email Queue` for queued/failed Hiyari emails after SMTP/server restart, and Approved review can auto-fill a formal review comment when Admin leaves it blank.
- Hiyari Dashboard keeps pinned departments as an internal chart configuration only. The visible "สรุปรายแผนก" card no longer shows the yellow saved-department config strip, so the dashboard stays focused on the graph/summary view.

Yokoten verification run on 2026-05-20:

- `node --check backend/routes/yokoten.js` — passed.
- `node --check public/js/pages/yokoten.js` — passed.
- `git diff --check -- backend/routes/yokoten.js public/js/pages/yokoten.js CLAUDE.md` — passed; only LF/CRLF warnings.
- Replacement-character scan for `backend/routes/yokoten.js`, `public/js/pages/yokoten.js`, and `CLAUDE.md` — passed.
- `npm --prefix backend run permission:audit` — passed with `ADMIN=158`, `INLINE_GUARD=8`, `USER_WORKFLOW=15`.

Yokoten handoff notes:

- Admin can respond on behalf of selected departments from the topic detail modal. Frontend sends `departments` as JSON in FormData; backend honors department override only for Admin.
- Topic detail uses `openDetailModal()` with a wider `max-w-4xl` document-style layout and Thai/English labels.
- Topic filters are now compact and include risk, category, response status, SLA, search, count, and clear-filters button.
- Soft-deleted responses are excluded when checking whether a department has already responded.
- Upload display names go through `cleanOriginalFilename()` so Thai filenames should display better.
- Yokoten file-delete hardening: when Admin responds on behalf of multiple departments and those response file rows reference the same physical upload, `DELETE /api/yokoten/response-files/:fileId` now checks other `FileURL`/`PublicID` references before deleting the physical file. DB row deletion still happens for the selected file only.
- Yokoten upload cleanup hardening: failed validation after multer upload uses best-effort local file cleanup without throwing a secondary `.catch is not a function` error.

Safety Culture handoff notes:

- Current pass keeps the existing 4-tab flow: Principles / Dashboard / Assessment / PPE Control.
- Backend `backend/routes/safety-culture.js` standardizes server error responses so DB/MySQL technical messages are logged server-side and not shown directly to users.
- Assessment point validation rejects `ComplyPeople > TotalPeople` on the backend and warns before submit on the frontend.
- Frontend `public/js/pages/safety-culture.js` submit guards were added for Principles, Assessment, and PPE Inspection forms to prevent duplicate saves.
- Empty states were clarified for Assessment and PPE admin/setup surfaces.
- Safety Culture Assessment tab now adds non-schema review helpers: Assessment Insight, month/week/area filters, a monthly heatmap matrix, visible Follow-up Note in the table, and a notes panel sourced from the existing `SC_Assessments.Notes` field.
- Safety Culture Assessment form keeps `Area` as the main area/department for the whole assessment; per-topic `TopicAreas` remain supported but are hidden under an optional "พื้นที่เฉพาะหัวข้อนี้" detail control to avoid duplicate-looking required fields.
- Principles now support local server upload for image and document files via `/api/upload/document`, while retaining the URL fields for compatibility.
- PPE Inspection can attach image/PDF evidence and stores the uploaded local URL in the existing `SC_PPEInspections.ImageUrl` field; the detail modal shows an Evidence link.
- PPE Control tab now adds no-schema dashboard helpers: shared month/department/work-type/status/search filters, PPE Compliance Insight, Repeat Violation Focus, PPE Item Heatmap, Work Type Coverage, and evidence preview from the existing `ImageUrl` field.
- PPE Control inspection flow now starts from an admin PPE work-type template. The form uses bilingual Thai/English labels, master areas with Other/manual entry, master employee search from `/api/person-search/employees`, current logged-in user as default inspector, and evidence upload/camera capture. PPE items support optional `Description` and `ImageUrl` columns for visual checklist guidance.
- Safety Culture Dashboard PDF and Assessment PDF now both use HTML fixed-page capture via `html2canvas` + `jsPDF`, which is safer for Thai text and monthly executive presentation output. The active Dashboard PDF is `exportPDF()`; the previous 3-page builder remains as `exportPDFLegacy()` for comparison/fallback only.
- Safety Culture Dashboard no longer renders the duplicate 5-card executive strip; keep the dashboard focused on period filter, core quick cards, maturity level, charts, PPE summary, and department breakdown.
- Safety Culture Dashboard fills the lower-right chart area with an Action Focus panel when PPE per-item breakdown is unavailable; it highlights weak topics, PPE data gaps, and next actions without changing the Assessment/PPE flow.
- Safety Culture first tab was renamed from "วัฒนธรรมความปลอดภัย" to "สื่อรณรงค์และกิจกรรม" because it is the poster/campaign/document library surface, not the analytics dashboard.
- Safety Culture campaign tab now has a Featured Campaign panel, Campaign Library filters (type/status/search), and a formal preview modal. Featured is controlled by `SC_Principles.IsFeatured`; the edit-card form has "ตั้งเป็น Featured Campaign / Set as Featured", and the backend keeps only one featured card at a time.
- Safety Culture campaign library now seeds card 8 (`sc-p-08`) for "ภาพรวม 7 วัฒนธรรมความปลอดภัยและสิ่งแวดล้อม" so the poster grid can display 4 cards on top and 4 cards below. Admin should upload the overview image through the existing edit-card form.

Current production target is the company shared hosting/PHP API path backed by Company MySQL/MariaDB and local server storage. The detailed current handoff and all phase/deploy history live in `CHANGELOG.md`. Production operation steps live in `DEPLOYMENT.md`.

### Authentication
- JWT ส่งผ่าน `Authorization: Bearer <token>` header เสมอ
- Middleware `authenticateToken` → decode JWT → `req.user`
- Middleware `isAdmin` → ตรวจ `req.user.role === 'Admin'` (ต้องใช้หลัง authenticateToken)
- Login rate limit: 10 ครั้ง / 15 นาที / IP
- Change-password rate limit: 10 ครั้ง / 15 นาที / IP (`changePwdLimiter` ใน `server.js`)
- Token หมดอายุ 6 ชั่วโมง, refresh ได้ที่ `POST /api/session/verify`
- **`normalizeRole(rawRole)`** ใน `server.js` — case-insensitive match กับ `ALLOWED_ROLES`; บังคับ role เป็น canonical casing ก่อน sign JWT; ป้องกัน `'admin'` / `'ADMIN'` bypass isAdmin check
- **Password minimum 4 ตัวอักษร** — enforce ใน register, change-password, profile, และ admin reset password; มี strength indicator 5 ระดับ (อ่อนมาก/อ่อน/ปานกลาง/ดี/แข็งแกร่ง) ใน index.html, main.js, profile.js
- **Request logger** — middleware `res.on('finish')` log format: `[INFO/WARN/ERROR] METHOD /path statusCode ms`
- **Global error handler** — Express `(err, req, res, next)` ใน `server.js` ก่อน SECTION 6; CORS error → 403; อื่นๆ → 500 `{ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }`

## Split Documentation

### API Routes
| Prefix | Auth | Module |
|--------|------|--------|
| `/api/login` | none | Login |
| `/api/register/options` | none | Public: departments + positions + safety units for register/profile forms |
| `/api/register` | none | สมัครใหม่ (register) |
| `/api/change-password` | User | เปลี่ยนรหัสผ่าน |
| `/api/session/verify` | User | Refresh JWT |
| `/api/patrol/*` | User | Patrol routes |
| `/api/patrol/roster` | User (read) / Admin (write) | Patrol roster CRUD — Top&Management / Sec.&Supervisor |
| `/api/patrol/member-records` | User | ดูรายการเดินตรวจรายบุคคล |
| `/api/patrol/my-missed-sessions` | User | รายการ sessions ที่ user ยังไม่ได้เดินตรวจ (สำหรับ makeup/compensation check-in) |
| `/api/patrol/admin-record` | Admin | เพิ่ม/ลบรายการเดินตรวจ (Patrol_Attendance) แทนสมาชิก |
| `/api/patrol/admin-record/supervisor/:id` | Admin | ลบรายการ Self-Patrol (Patrol_Self_Checkin) แทน supervisor |
| `/api/patrol/employee-search?q=` | Admin | ค้นหาพนักงานทุกคน (ไม่จำกัดเฉพาะ roster) — ใช้สำหรับ admin บันทึกการเดินตรวจแทน |
| `/api/admin/*` | Admin | Admin routes (employees, schedules, audit, dashboard, health) |
| `/api/cccf/*` | User | CCCF routes |
| `/api/master/*` | User (write=Admin) | Master data (departments/teams/roles/positions/areas/safety-units) |
| `/api/profile` | User | ดูและแก้ไขโปรไฟล์ตัวเอง |
| `/api/profile/employee-id` | User | เปลี่ยน EmployeeID ตัวเอง (cascade update + new JWT) |
| `/api/machine-safety/*` | User | Machine & Device Safety |
| `/api/ojt/*` | User | Stop-Call-Wait (OJT/SCW) |
| `/api/yokoten/topics` | User (write=Admin) | GET topics (includes `deptResponse` for caller's dept) / POST create / PUT :id / DELETE :id |
| `/api/yokoten/respond` | User | POST new dept response (FormData, field: `responseFiles`) |
| `/api/yokoten/respond/:id` | User/Admin | PUT update response / POST approve / POST reject |
| `/api/yokoten/respond/:id/approve` | Admin | อนุมัติ response (ApprovalStatus → approved) |
| `/api/yokoten/respond/:id/reject` | Admin | ปฏิเสธ response (body: { comment }) |
| `/api/yokoten/response-files/:fileId` | Admin | DELETE single file (server file storage + DB) |
| `/api/yokoten/dept-history` | User | ประวัติ response ของแผนกตัวเอง (includes files) |
| `/api/yokoten/dept-completion` | Admin | สรุปความคืบหน้ารายแผนก → `{ topics, deptSummary }` |
| `/api/yokoten/all-responses` | Admin | รายการ response ทั้งหมด (filterable, includes files) |
| `/api/yokoten/dashboard-config` | User (write=Admin) | GET/PUT `{ pinnedDepts, pinnedUnits }` JSON config |
| `/api/yokoten/bulk-approve` | Admin | POST `{ ids: [...] }` — bulk approve pending responses |
| `/api/dashboard/overview` | User | Cross-module KPI overview |
| `/api/dashboard/alerts` | User | Overdue items across modules (accident/machine/yokoten/patrol) |
| `/api/accident/*` | User | Accident Reports |
| `/api/accident/reports` | User (write=Admin) | GET (list+filters) / POST (create+upload) |
| `/api/accident/reports/:id` | User (write=Admin) | GET single / PUT (update+upload) / DELETE (soft-delete: IsDeleted=1) |
| `/api/accident/summary?year=` | User | KPI + trend + byType + byDept aggregates |
| `/api/accident/analytics?year=` | User | dept risk ranking + hotspot + root causes |
| `/api/accident/performance?year=` | User | Safety Performance record + recordableCount |
| `/api/accident/performance` | Admin | PUT upsert — TotalHours, TotalDays, LastAccidentDate, TargetHours, TargetDays, MonthlyStatus (JSON) |
| `/api/accident/attachments/:id` | Admin | DELETE single attachment (server file storage + DB) |
| `/api/accident/employees?q=` | User | Employee search for accident form |
| `/api/safety-culture/*` | User | Safety Culture |
| `/api/training/*` | User | Training Status |
| `/api/contractor/*` | User | Contractor & Supplier E-Pass Online |
| `/api/hiyari/*` | User | Hiyari (near-miss) Reports |
| `/api/ky/*` | User | KY Activities |
| `/api/fourm/*` | User | 4M Change Management |
| `/api/employees` | User/Admin | Employee CRUD |
| `/api/policies` | User/Admin | Policy CRUD |
| `/api/policies/:id/acknowledge` | User | Mark the current user as having acknowledged a policy |
| `/api/policies/:id/acknowledge-all` | Admin | Admin bulk-acknowledge a policy for every employee in `Employees`; idempotent and audit-logged |
| `/api/policies/:id/acknowledgements` | Admin | Acknowledged/not-acknowledged lists, including self/admin acknowledgement metadata |
| `/api/committees` | User/Admin | Committee CRUD; `SubCommitteeData` stores master-linked department/unit, per-subcommittee PDF metadata, and position-count breakdown |
| `/api/kpidata/*` | User/Admin | KPI data CRUD |
| `/api/kpidata/bulk` | Admin | Bulk update KPI rows (PUT — must be declared BEFORE `/:id`) |
| `/api/machine-safety/:id/files` | Admin | Upload file to machine (multer field: `file`) |
| `/api/machine-safety/:id/links` | Admin | Add URL link to machine (no file upload) |
| `/api/machine-safety/files/:fileId` | Admin | Delete a file record |
| `/api/machine-safety/:id/compliance` | User (write=Admin) | GET/PUT compliance checklist items (5.1–5.8) — batch upsert |
| `/api/machine-safety/:id/issues` | User (write=Admin) | GET/POST issues for one machine |
| `/api/machine-safety/issues/:issueId` | Admin | PUT (resolve/reopen) / DELETE issue — must be declared BEFORE `/:id` |
| `/api/upload/document` | Admin | server file storage file upload (field name: `document`) |
| `/api/admin/permissions/matrix` | Admin | GET/PUT permission matrix (role × permission) |
| `/api/activity-targets/activities` | User | Static list of 9 activity definitions |
| `/api/activity-targets/position-templates` | User (write=Admin) | GET/PUT position template targets (IsNA supported) |
| `/api/activity-targets/position-templates/bulk-apply` | Admin | Apply position template to all employees in that position |
| `/api/activity-targets/employee/:empId` | User (write=Admin) | GET/PUT per-person override targets (IsNA supported) |
| `/api/activity-targets/me` | User | My merged targets + actual yearly counts for all 9 activities |

### Generic CRUD Tables
ตารางเหล่านี้มี auto-generated CRUD endpoints (GET/POST/PUT/DELETE):
`Patrol_Sessions`, `Patrol_Attendance`, `Patrol_Issues`, `Patrol_Areas`, `CCCF_Activity`, `CCCF_Targets`,
`ManHours`, `AccidentReports`, `TrainingStatus`, `SCW_Documents`, `OJT_Department_Status`,
`Machines`, `Documents`, `Document_Machine_Links`

Primary key ของ generic CRUD คือ `id` — ยกเว้น `Employees` ที่ใช้ `EmployeeID`

### Key Non-Generic Tables (managed by dedicated routes)
| Table | Route | Notes |
|-------|-------|-------|
| `Patrol_Roster` | `/api/patrol/roster` | Admin-managed patrol roster (top_management / supervisor) — auto-created at startup |
| `Patrol_Self_Checkin` | `/api/patrol/self-checkin`, `/api/patrol/admin-record/supervisor/:id` | Supervisor self-patrol records |
| `Master_SafetyUnits` | `/api/master/safety-units` | Safety units linked to departments (cascading select) |
| `Activity_Position_Templates` | `/api/activity-targets/position-templates` | Yearly targets per position per activity (IsNA flag supported) |
| `Employee_Activity_Targets` | `/api/activity-targets/employee/:empId` | Per-person override targets — override takes priority over template |
| `YokotenTopics` | `/api/yokoten/topics` | Admin-managed topics (Phase 3) — TargetDepts + TargetUnits as JSON |
| `YokotenResponses` | `/api/yokoten/respond` | One response per (YokotenID, Department) — UNIQUE KEY `uq_dept_topic` — approval workflow |
| `Yokoten_Response_Files` | `/api/yokoten/respond`, `/api/yokoten/response-files/:fileId` | Per-response file attachments (server file storage) |
| `Yokoten_Dashboard_Config` | `/api/yokoten/dashboard-config` | JSON config row: `pinnedDepts` + `pinnedUnits` arrays |
| `Policy_Acknowledgements` | `/api/policies/:id/acknowledge*` | Policy acknowledgement rows. Unique key `(PolicyID, UserID)`. Columns `AckSource`, `AcknowledgedByAdminID`, `AcknowledgedByAdminName` record whether acknowledgement was self-service or Admin bulk action. |
| `Committees` | `/api/committees` | `SubCommitteeData` JSON array. Each subcommittee should use `departmentId`, `department`, `unitId`, `unit`, `documentUrl`, `documentName`, and `positions[]` (`positionId`, `positionName`, `count`). `memberCount` is derived from `positions[]`; legacy `activeLink` is still mirrored for compatibility. |

### File Upload
- Uploads use local company-server storage through `backend/storage.js`
- Files are stored in `backend/uploads/` and served at `/uploads`
- Endpoint: `POST /api/upload/document` — field name ต้องเป็น `document` (ไม่ใช่ `file`)
- ประเภทไฟล์ที่รองรับ: JPEG, PNG, GIF, WEBP, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 10 MB (patrol images), 20 MB (documents)
- Stored file names are intentionally safe/random (`timestamp-random.ext`). Do not rely on the URL path as the user's original file name.
- `backend/storage.js` appends original-name metadata as `?filename=<encoded original name>` and `/uploads` sets `Content-Disposition` from that metadata for display/download.
- `public/js/ui.js` document viewer reads `filename` metadata when choosing display/download names.
- Committee subcommittee PDFs are uploaded with `POST /api/upload/document` and saved in `SubCommitteeData.documentUrl`; subcommittee manpower is stored as `SubCommitteeData.positions[]` from Master Positions or typed custom labels; editing/deleting committees cleans replaced/removed subcommittee PDFs from `backend/uploads/`.
- Back up `backend/uploads/` together with MySQL before every production change

### Committee Module Current Behavior
- Admin creates/edits Safety Committee records from `public/js/pages/committee.js`.
- Subcommittee setup uses Master Departments and Master Safety Units instead of free-text department/unit names.
- Each subcommittee has its own required PDF document uploaded through local server storage.
- Subcommittee manpower is entered as position-count rows, for example `MGR = 1`, `Supervisor = 2`, `Leader = 4`; totals are calculated into `memberCount`.
- The page intentionally omits the duplicate governance-summary strip and keeps the core 4-card summary plus current-committee hero.

### KPI Module Current Behavior
- KPI announcements use stable `AnnouncementID` values such as `KPI-2026`; `GET /api/pagedata/kpi-announcements` exposes `id` from `AnnouncementID`.
- KPI metric CRUD is guarded server-side against duplicates in the same `(Year, AnnouncementID, Metric, Department)` scope; duplicate create/update returns HTTP 409.
- KPI announcement delete is blocked with HTTP 409 while `KPIData` rows still reference that `AnnouncementID`.
- KPI metric create/update/delete and monthly bulk updates write audit rows through `Admin_AuditLogs`.
- The KPI Department field in the add/edit form comes from Master Departments and Master Safety Units.
- KPI filter controls include visible active states and a clear-filters button; changing status/view re-renders the control strip so the clicked state is obvious.
- KPI import skips duplicate rows and invalid numeric rows, then reports imported/skipped counts instead of stopping at the first bad row.
- KPI form/server validation requires numeric `Target`, positive numeric `Weight`, and numeric monthly values.
- KPI cards/tables show the linked `AnnouncementID`; delete confirmation displays KPI name, year, department, and announcement before removal.

### Database
- Company MySQL/MariaDB (MySQL-compatible) via `mysql2`
- ใช้ `pool.query()` เสมอ (อย่าใช้ `pool.getConnection()` โดยไม่จำเป็น)
- ยกเว้น bulk import ที่ต้องใช้ transaction (`connection.beginTransaction()`)
- Parameterized queries (`?`) เสมอ — ห้าม string concatenation ใน SQL

### Security Rules (ห้ามทำ)
- ห้าม raw `req.body` เป็น `INSERT INTO table SET ?` โดยตรง — ต้อง whitelist fields ก่อน (ดูตัวอย่าง `KPI_DATA_FIELDS`)
- ห้าม expose password/token ใน response
- ห้าม skip `authenticateToken` บน endpoints ที่มี side effects
- Admin-only endpoints ต้องมีทั้ง `authenticateToken` และ `isAdmin`

## Modules / Features

| Module | Description |
|--------|-------------|
| **Patrol** | กำหนดการตรวจ, บันทึกการเข้าร่วม (ปกติ / ซ่อม / ตรวจซ้ำ), รายงานปัญหา (รูปภาพ), Self-Patrol สำหรับหัวหน้า, Team Rotation, พื้นที่โรงงาน (Patrol_Areas), Roster Management (Top&Management / Sec.&Supervisor), Admin Record Management (เพิ่ม/ลบรายการแทนสมาชิก) |
| **CCCF** | Form A Worker (ค้นหาอันตรายรายบุคคล), Form A Permanent (ตารางติดตาม `ต้องส่ง / On Process / Complete`, admin ส่งแทน/แก้ไข/ลบได้, progress รายส่วนงานจาก assignment), Unit Summary combo chart (horizontal bar + target line), Admin ตั้งเป้าหมาย/override achieved ต่อ Unit, กรองปีได้ทั้ง Unit summary และ "รายการของฉัน" |
| **KPI** | ประกาศ KPI, ข้อมูล KPI รายปี (ม.ค.–ธ.ค.) |
| **Yokoten** | แบ่งปันบทเรียน/ความรู้ความปลอดภัย (Phase 3) — **หนึ่ง response ต่อแผนก**, Approval workflow (pending→approved/rejected), Bulk approve (checkboxes + `POST /bulk-approve`), Corrective Action + evidence required when IsRelated=Yes, ไฟล์แนบ (FormData, field: `responseFiles`, สูงสุด 10 ไฟล์/20 MB), Dashboard pinned depts config, Admin approve/reject/delete (soft delete), Excel export |
| **Policy** | นโยบายความปลอดภัย, รับทราบนโยบาย — Description field ใช้ Rich Text Editor (RTE) เดียวกับ Yokoten (`pol-*` prefix), HTML ถูก sanitize ก่อนบันทึก/แสดง, PDF export รองรับ rich formatting |
| **Committee** | คณะกรรมการความปลอดภัย, SubCommittee (JSON array), ผังองค์กร |
| **Machine Safety** | ข้อมูลเครื่องจักร/อุปกรณ์ความปลอดภัย, Safety Device Std., Layout & Checkpoint, Compliance Checklist (5.1–5.8), Issue Tracker, Audit Readiness |
| **OJT / SCW** | มาตรฐาน Stop-Call-Wait (แก้ไขได้), จัดการเอกสาร SCW (อัปโหลด/ดู/ลบ), OJT Compliance รายแผนก (เป้าหมาย/ผู้เข้าร่วม/สถานะ, เลือกแผนกที่แสดง persisted, คำนวณ metric จากแผนกที่เลือกเท่านั้น, year filter) |
| **Accident** | รายงานอุบัติเหตุ/อุบัติการณ์ — Dashboard (KPI cards + trend chart + dept breakdown), Analytics (dept risk ranking + hotspot + root cause), Records (full 6-section form + file attachments + PDF export ต่อรายการ), Safety KPI Board (Zero Accident banner + Days/Hours without accident + target progress + monthly status grid), Soft delete (IsDeleted=1) |
| **Safety Culture** | กิจกรรมวัฒนธรรมความปลอดภัย — 4 tabs: Principles / Dashboard / ผลการประเมิน / PPE Control; คะแนน T1–T5,T7 (0–100%); PPE Inspection + Violation tracking; Dashboard PDF (html2canvas, fixed A4 paginated by content, Thai font); Culture Maturity Level (Reactive/Basic/Proactive/Generative) |
| **Training** | บันทึกและติดตามผลการอบรมรายแผนก — `Training_Dept_Records` (Department+Year+CourseID+TotalEmp+PassedCount), Dashboard: KPI cards + compliance chart + course summary + dept summary + Dept×Course matrix, หลักสูตร CRUD (Admin only) |
| **Contractor** | ความปลอดภัยผู้รับเหมา |
| **Hiyari** | รายงาน near-miss / ไฮยาริ — มีปุ่ม "สร้าง Yokoten" ที่ write `hiyari_to_yokoten` ลง sessionStorage แล้ว navigate ไป `#yokoten` |
| **Dashboard** | ภาพรวม KPI ทุก module + Enterprise Safety Health Index + Department×Module Compliance Matrix + Alert Widget (overdue/due soon/pending) + เป้าหมายกิจกรรมส่วนตัว; user เห็นข้อมูล, admin คุม config |
| **Search / Employee Safety 360** | `#search` ค้นหารายบุคคลจาก Employee Master, เปิด Safety Profile รายคนพร้อม KPI, Patrol records, Training, CCCF, Hiyari, KY, Yokoten, Accident, 4M, Policy/PPE signals และ timeline รวม; backend `/api/person-search`; admin บันทึก/ลบ Patrol record ได้โดยยิงเข้า Safety Patrol เดิม (`/api/patrol/admin-record`) ไม่สร้างตาราง Patrol ซ้ำ |
| **KY** | กิจกรรม KY (Kiken Yochi) |
| **4M Change** | บริหารจัดการการเปลี่ยนแปลง Man/Machine/Material/Method |
| **Admin (System Console)** | Dashboard, Scheduler, Employee CRUD, Master Data, System Health, Audit Log, **เป้าหมายกิจกรรม** |
| **Activity Targets** | กำหนดเป้าหมายรายปีสำหรับ 9 กิจกรรม — เทมเพลตตามตำแหน่ง + override รายบุคคล + N/A flag; ผล sync อัตโนมัติกับ `/api/activity-targets/me` |
| **Master** | Departments, Teams, Roles, Positions, Areas (Patrol_Areas), Safety Units (Master_SafetyUnits) — admin-managed reference data |
| **Profile** | Slide-over drawer: ดู/แก้ไขโปรไฟล์ตัวเอง, เปลี่ยนรหัสผ่าน, เปลี่ยน EmployeeID (cascade update 9 tables + re-issue JWT) |

## Enterprise Dashboard — Architecture

หน้า `#dashboard` เป็น cross-module command center ที่ authenticated users ทุกคนเห็นได้ แต่ control/config เป็นของ admin เท่านั้น

### Access Model
| Endpoint | Access | Purpose |
|----------|--------|---------|
| `GET /api/dashboard/overview` | User | KPI รวม, Enterprise Safety Health Index, Department×Module Compliance Matrix |
| `GET /api/dashboard/alerts` | User | รายการ overdue/due soon/pending ข้าม module |
| `GET /api/dashboard/config` | User | อ่าน dashboard config ที่ active |
| `PUT /api/dashboard/config` | Admin | ตั้งค่า threshold, due-soon days, hidden modules, pinned departments |

### API Permission Notes
- Legacy generic CRUD endpoints in `backend/server.js` are read-only for authenticated users; `POST/PUT/DELETE` require `isAdmin` to prevent bypassing module-specific admin controls.
- Frontend `apiFetch()` logs out only on `401` or invalid token; normal `403 Permission denied` is surfaced as an error instead of forcing logout.

### Config Table
| Table | Purpose |
|-------|---------|
| `Dashboard_Config` | `ConfigKey='enterprise'`, `ConfigValue` JSON: `{ healthGreen, healthAmber, alertDueSoonDays, hiddenModules, pinnedDepartments }`, `UpdatedBy`, `UpdatedAt` |

### Enterprise Safety Health Index
- คำนวณใน `backend/routes/dashboard.js` ด้วย `buildHealthIndex()`
- Positive inputs: Patrol rate, CCCF permanent completion, Yokoten response %, Training pass rate
- Penalties: recordable accidents, open Hiyari, open 4M notices, open Patrol issues
- Status:
  - `Good` เมื่อ score >= `healthGreen`
  - `Watch` เมื่อ score >= `healthAmber`
  - `Critical` ต่ำกว่า `healthAmber`
- Frontend แสดงใน `public/js/pages/dashboard.js` ที่ `db-health-wrap`

### Department×Module Compliance Matrix
- คำนวณใน `buildComplianceMatrix(year, config)`
- Rows = `config.pinnedDepartments` หรือ 12 แผนกแรกจาก `Master_Departments`
- Columns = Patrol, Hiyari, KY, Yokoten, Training, 4M
- Training ใช้ pass rate จริง, module อื่นเริ่มจาก presence/completion signal แบบ 0/100 เพื่อให้ matrix ทนกับ schema ต่าง module
- Frontend แสดงใน `db-compliance-wrap`

### Admin Controls
- ปุ่ม `ตั้งค่า` แสดงเฉพาะ admin ใน Health Index card
- Modal: Green threshold, Amber threshold, Due soon days, pinned departments, hidden modules
- Save ผ่าน `PUT /dashboard/config`; user ทั่วไปไม่มีปุ่มและเรียก PUT ไม่ได้
- Overview module cards ครบทุก module หลัก: Patrol, Hiyari, KY, CCCF, Yokoten, Training, Accident, 4M, KPI, Policy, Committee, Machine Safety, OJT/SCW, Contractor, Safety Culture
- Admin เลือกได้ทั้ง module ที่แสดงบนหน้า Overview และแผนกที่แสดงใน Department x Module Compliance Matrix (`pinnedDepartments`)

### Overview Phase 1 + 4 Integration Progress
- `GET /api/dashboard/overview` now exposes richer 4M metrics for the current year: total/open/pending/closed/active/overdue notices, Training Required notices, closure rate, and Training Matrix scope counts (`curriculums`, `courses`, `employees`, `transferred`).
- Enterprise Safety Health now penalizes active 4M work (`Open + Pending`) instead of only all-time Open notices.
- Department x Module Compliance Matrix now uses 4M closure rate by department; departments with no 4M records are treated as not-applicable for the 4M cell instead of forcing a false 0%.
- Overview hero and 4M module card now show active 4M work, open/pending/overdue breakdown, Training Required count, Matrix employee count, and 4M closure rate.
- `GET /api/dashboard/alerts` now includes open/pending 4M notices that have `TrainingRequired = 1`, so the Overview action queue can push Admin/User toward 4M > Training Matrix.

### Overview Phase 2 Command Center UX
- `public/js/pages/dashboard.js` now orders the Overview page as: Hero -> Enterprise Safety Health / Executive Signal -> Action Required -> Module Health cards -> Department x Module Compliance Matrix -> My Activity Targets.
- Action Required now has a visible loading state and a green empty state when overdue/due-soon/pending queues are clear, instead of leaving a silent blank area.
- Module cards are labeled as `Module Health / ภาพรวมระบบ` so they read as status cards after the action queue, not as the primary work queue.

### Overview Phase 3 Drill-down
- Overview now writes `pending_filter_*` from both module cards and Action Required cards, not only from the module card grid.
- Action Required cards now deep-link supported workflows: Patrol open issues -> Patrol issues tab, 4M overdue -> Change Notice overdue filter, and 4M Training Required -> Change Notice list filtered to Training Required records.
- `GET /api/fourm/notices` accepts `trainingRequired=1`; `public/js/pages/fourm.js` applies incoming dashboard filters for `all`, `Open`, `Pending`, `overdue`, and `trainingRequired`.
- 4M Notice Register shows a visible Training Required filter chip with a clear action when opened from Overview, so drill-down state is not hidden from the user.

### Overview Phase 4 Drill-down Expansion
- Accident now reads `pending_filter_accident` on load and can open Reports with quick filters such as `overdue`, `dueSoon`, and `recordable`.
- Machine Safety now reads `pending_filter_machine-safety` on load and can apply department/status/risk/audit/inspection filters from Overview.
- Machine Safety filter bar now includes an `Inspection` dropdown (`Due Soon`, `Overdue`) so incoming inspection drill-down state is visible and editable.
- Overview Accident overdue/due-soon Action Required cards and Accident recordable module card now send filter state to Accident Reports.
- Overview Machine overdue Action Required card and Machine Safety module card now send filter state to Machine Safety.

### Overview Phase 5 Verification
- Syntax checks passed for `backend/routes/dashboard.js`, `public/js/pages/dashboard.js`, `public/js/pages/fourm.js`, `backend/routes/fourm.js`, `public/js/pages/accident.js`, `public/js/pages/machine-safety.js`, and `backend/scripts/permission-audit.js`.
- `npm run uat:preflight` passed `90/90` read/permission surfaces, including Overview dashboard, Overview alerts, Overview config, 4M, Accident, Machine Safety, and Admin permission blocks.
- `npm test` passed end-to-end: permission audit, API smoke, and UAT preflight.
- Permission audit cleanup: 4M Course Master mutation routes now use explicit `isAdmin` middleware; curriculum-level assignment/remove/transfer routes are documented in the user-workflow allowlist because they enforce Admin-or-same-department ownership in route logic.
- Remaining browser UAT recommendation: open Overview as Admin and User, click Action Required cards for 4M Training Required, Accident overdue/due soon, and Machine overdue, then confirm each target module shows the incoming filter state visibly.

### Overview Department Coverage Matrix
- `buildComplianceMatrix()` now returns module-level 0-100% coverage signals by department instead of mostly presence-only flags.
- Matrix columns shown in `public/js/pages/dashboard.js`: `CCCF A`, `CCCF Perm.`, `Patrol Issue`, `Hiyari`, `KY`, `Yokoten`, `Training`, `4M`, `Accident`, `Machine`, `OJT`, and `Safety Culture`.
- Current formulas:
  - `CCCF A`: distinct `CCCF_FormA_Worker.EmployeeID` submitted this year / Employee Master count in that department.
  - `CCCF Perm.`: distinct completed `CCCF_FormA_Permanent.AssigneeID` this year / `CCCF_Assignments` in that department.
  - `Patrol Issue`: closed `Patrol_Issues` / total issues found this year by `ResponsibleDept`; departments with no issue are treated as 100%.
  - `Hiyari`: closed reports / total reports this year; departments with no report are treated as 100%.
  - `KY`: submitted KY activities this year / configured annual target from `KY_Program_Config`; fallback target is 12 when no active config exists.
  - `Yokoten`: responses this year / active Yokoten topics targeted to the department.
  - `Training`: `PassedCount / TotalEmp` from `Training_Dept_Records`.
  - `4M`: closed Change Notices / total Change Notices this year.
  - `Accident`: closed accident reports / total accident reports this year; departments with no accident are treated as 100%.
  - `Machine`: average of machine checklist pass rate and machine issue closure rate for active machines.
  - `OJT`: attendee count / yearly target when target exists; otherwise current non-overdue OJT record is 100%, overdue record is capped at 50%, missing record is 0%.
  - `Safety Culture`: average `SC_PPEInspections.CompliancePct` this year by department.
- Latest verification for the expanded matrix: `node --check backend/routes/dashboard.js`, `node --check public/js/pages/dashboard.js`, `git diff --check -- backend/routes/dashboard.js public/js/pages/dashboard.js`, and `npm run uat:preflight` (`90/90`).
- Frontend displays `N/A` for matrix cells where the backend intentionally returns `null` because there is no target/denominator/source data for that department. If new matrix columns show `N/A` everywhere after deployment, restart `backend/server.js` so `/api/dashboard/overview` serves the expanded backend fields.
- Overview page order now shows Department Coverage Matrix above Module Health cards: Hero -> Executive Signal -> Action Required -> Department Coverage Matrix -> Module Health -> My Activity Targets.

## Machine Safety Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Machine_Safety` | เครื่องจักรหลัก — `Status`, `RiskLevel`, `NextInspectionDate`, `HasRiskAssessment` ถูก auto-migrate ใน `ensureTables()` |
| `Machine_Safety_Files` | ไฟล์แนบต่อเครื่อง — `FileCategory` แบ่งเป็น `'SafetyDeviceStandard'` และ `'LayoutCheckpoint'` |
| `Machine_Safety_Compliance` | Compliance checklist 5.1–5.8 ต่อเครื่อง — `UNIQUE KEY (MachineID, ItemCode)`, `Status ENUM('pass','fail','na')` |
| `Machine_Safety_Issues` | ปัญหาที่พบต่อเครื่อง — `Status ENUM('open','resolved')`, `Severity ENUM('low','medium','high','critical')` |

### GET /machine-safety — Derived Counts
Query หลักใช้ correlated subqueries ส่งคืน computed columns พิเศษ:
- `SafetyDeviceCount` — จำนวนไฟล์ `FileCategory='SafetyDeviceStandard'`
- `LayoutCheckpointCount` — จำนวนไฟล์ `FileCategory='LayoutCheckpoint'`
- `CompliancePassCount` — รายการ Compliance ที่ `Status='pass'`
- `ComplianceCheckedCount` — รายการ Compliance ที่ `Status != 'na'`
- `OpenIssueCount` — จำนวนปัญหา `Status='open'`

### Compliance Checklist (5.1–5.8)
`COMPLIANCE_ITEMS` ใน `machine-safety.js` กำหนด 8 ข้อ:
`5.1` Nip/Shear Point Guard, `5.2` Rotating Part Guard, `5.3` Emergency Stop, `5.4` Warning Signs & Signals, `5.5` LOTO Procedure, `5.6` Electrical Safety/Grounding, `5.7` Ergonomic Safety, `5.8` Inspection & Maintenance Log

- `PUT /machine-safety/:id/compliance` รับ `{ items: [{ ItemCode, Status }] }` — batch upsert ด้วย `ON DUPLICATE KEY UPDATE`
- ใช้ `UNIQUE KEY (MachineID, ItemCode)` — ไม่ต้องลบแล้ว insert ใหม่

### Audit Readiness (`_auditStatus(m)`)
คำนวณ per-machine: `{ status: 'pass'|'warn'|'fail', hints: [{type, msg}] }`

| เงื่อนไข | ประเภท |
|----------|--------|
| `SafetyDeviceCount == 0` | fail |
| `LayoutCheckpointCount == 0` | fail |
| `NextInspectionDate` เกินวันนี้ | fail |
| Compliance มีรายการ fail | fail |
| `HasRiskAssessment == 0` | warn |
| `OpenIssueCount > 0` | warn |

- `auditMap = { pass, warn, fail }` — aggregate ทุกเครื่องใน `_renderPage()`
- `auditPct = auditMap.pass / total * 100` — แสดงใน donut chart ใน summary card
- `topHints` — aggregate hint messages by frequency → แสดง top 4 ปัญหาที่พบบ่อย

### Audit Summary Card + Filter
- Summary card แสดง donut chart + chip count (pass/warn/fail)
- Chips เป็น `<button>` → `window._msdSetAuditFilter(val)` — toggle filter (คลิกซ้ำเพื่อ clear)
- Filter dropdown `#msd-audit` ใน filter bar sync กับ `_filterAudit` state
- `_msdSetAuditFilter()` sync dropdown และ re-render table

### Filter State (`_getFiltered()`)
| Variable | DOM ID | ค่าที่รองรับ |
|----------|--------|-------------|
| `_search` | `msd-search` | free text |
| `_filterDept` | `msd-dept` | department name |
| `_filterStatus` | `msd-status` | `full` / `partial` / `none` (doc status) |
| `_filterMStatus` | `msd-mstatus` | `active` / `restricted` / `locked` / `maintenance` / `inactive` |
| `_filterRisk` | `msd-risk` | `critical` / `high` / `medium` / `low` |
| `_filterAudit` | `msd-audit` | `pass` / `warn` / `fail` |

### Table Row Highlighting
- `fail` rows: `background:rgba(254,242,242,0.55)` (red tint)
- `warn` rows: `background:rgba(255,251,235,0.45)` (amber tint)
- Applied via inline `style` — ไม่ใช้ arbitrary Tailwind values (CDN ไม่ compile)
- Audit badge ต่อ row แสดง pass/warn/fail พร้อม `title` tooltip บอก hints

### Status & Risk Constants
`STATUS_META` และ `RISK_META` ใน `machine-safety.js` — map value → `{ label, bg, text, dot }` สำหรับ Tailwind badge classes

### Express Route Ordering (Issues)
`PUT /issues/:issueId` และ `DELETE /issues/:issueId` ต้องประกาศ **ก่อน** `PUT /:id` และ `DELETE /:id` เสมอ — ไม่งั้น Express จะ match `'issues'` เป็น `:id`

### Machine Safety Hardening Notes
- Backend route uses local storage via `backend/storage.js`; uploaded file URL is saved in `Machine_Safety_Files.FileUrl`.
- If DB insert/update fails after upload, route must call local cleanup best-effort so orphan uploads do not break the request flow.
- Local upload cleanup is non-fatal: Windows/XAMPP may temporarily lock a just-uploaded file, so delete failures are logged and retried instead of returning 500 after DB work succeeded.
- Machine code is checked for duplicates in create/update before saving. Dates are accepted only as `YYYY-MM-DD`.
- URL links accept only `http`/`https`; unsafe schemes such as `javascript:` must be rejected.
- Machine/file/compliance/issue mutations write `Admin_AuditLogs` via `logAudit()`.
- Frontend admin detection is case-insensitive, and machine list load failure should show a retry/error state instead of silently rendering an empty table.
- Smoke path tested: create machine, update machine, add URL link, reject invalid URL, upload PDF, save compliance, create/resolve/delete issue, delete machine.

## Accident Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Accident_Reports` | รายงานหลัก — 34+ columns รวม `Location`, `Position`, `EmploymentType`, `InjuryType`, `BodyPart`, `MedicalTreatment`, `ImmediateCause`, `UnsafeAct`, `UnsafeCondition`, `PreventiveAction`, `ResponsiblePerson`, `DueDate`, `InvestigationStatus`, `PotentialSeverity`, `VerificationResult`, `VerifiedBy`, `VerifiedAt`, **`IsDeleted TINYINT(1) DEFAULT 0`** (auto-migrated ด้วย `ALTER TABLE ... ADD COLUMN` try/catch ใน `ensureTable()`) |
| `Accident_Attachments` | ไฟล์แนบต่อรายงาน — `AccidentID` (FK), `FileName`, `FileURL`, `PublicID`, `FileType`, `FileSize`, `UploadedBy` |
| `Accident_Performance` | Safety KPI Board ต่อปี — `Year` (UNIQUE), `TotalHours`, `TotalDays`, `LastAccidentDate`, `TargetHours`, `TargetDays`, `MonthlyStatus` (JSON), `UpdatedBy` |

### Accident / Near Miss Updates
- Accident form starts with `Incident Form Type`; selecting `Near Miss` hides the standard injury/cause accident sections and shows the Near Miss specific form.
- Near Miss data is stored in `Accident_Reports.NearMissDetails` JSON, not a separate table, to preserve existing report/attachment/Safety KPI flows.
- Near Miss `Involved Persons` and `Responsible Person` use Employee Master typeahead. Involved persons are stored as structured JSON (`EmployeeID`, `EmployeeName`, `Position`, `Department`).
- `NearMissSupervisorAdvice` is intentionally removed from the form; supervisor guidance should live in the attached official document.
- Near Miss requires `PotentialSeverity` (`Low`, `Medium`, `High`, `Critical`) for risk evaluation; labels in the form are Thai + English.
- Near Miss can be closed when `NearMissCAPA` is filled. Standard accident closure still requires `CorrectiveAction`.
- Accident case closure now has Thai + English enterprise control fields: `InvestigationStatus`, `VerificationResult`, `VerifiedBy` (Employee Master typeahead), and `VerifiedAt`. Closing a case requires CAPA/corrective action, verification result, and verified-by.
- Reports tab adds enterprise follow-up helpers without changing the report flow: investigation-status color badges, case aging/overdue days, counted/not-counted KPI filter, and CSV/Excel export for the currently visible records.
- Accident detail modal includes a closure checklist (CAPA, owner, due date, verification, evidence) and admin-only audit trail loaded from `GET /api/accident/reports/:id/audit`.
- Accident detail modal uses a document-reader layout for long narratives, similar to the Policy module: long text is rendered as Word-like sections with clear headings, line height, paragraph/list spacing, and wider `max-w-4xl` modal instead of cramped two-column cards.
- Audit actions are explicit for key events: `CREATE_ACCIDENT_REPORT`, `CREATE_NEAR_MISS_REPORT`, `UPDATE_ACCIDENT_REPORT`, `CLOSE_ACCIDENT_REPORT`, attachment delete, and soft delete.
- Near Miss contributes to analytics/dashboard trend and department risk views, but is excluded from Safety KPI Board counted cases and rates.
- Dashboard summary now includes `recentReports` and `openActions`; Analytics includes `nearMissTrend`, `injuryTypeStats`, and `bodyPartStats`.
- Accident attachment display names use `cleanOriginalFilename()` through `backend/storage.js`; stored filenames remain randomized, while original Thai names are decoded/sanitized for display/download metadata. `ensureTable()` repairs recent Accident attachment display names when possible.
- Hero `daysSince` is automatic from counted-stat accidents. For a selected year with no counted accident, it falls back to inclusive days from Jan 1 to today (current year) or full year length (past years); Near Miss and First Aid do not reset this count.

### Accident Report Form (6 Sections)
| Section | Fields |
|---------|--------|
| ข้อมูลทั่วไป | AccidentDate, ReportDate, AccidentTime, Location, Area, ReportedBy |
| ผู้ประสบเหตุ | EmployeeID (typeahead search), Position (auto-fill), EmploymentType |
| รายละเอียดเหตุการณ์ | AccidentType, Severity, Description |
| การบาดเจ็บ | InjuryType, BodyPart, LostDays, IsRecordable, MedicalTreatment |
| วิเคราะห์สาเหตุ | ImmediateCause, UnsafeAct, UnsafeCondition, RootCause, RootCauseDetail |
| มาตรการแก้ไข | CorrectiveAction, PreventiveAction, ResponsiblePerson, DueDate, Status, InvestigationStatus, VerificationResult, VerifiedBy, VerifiedAt + Attachments |

- SubmitFormData ผ่าน `API.post/put(url, fd)` — multer `accFileFilter` รับเฉพาะ `image/*` + `application/pdf` สูงสุด 10 ไฟล์ / 20 MB ต่อไฟล์
- `EmployeeID` ต้องมีอยู่ใน `Employees` — backend ดึง `Department` และ `Position` จาก master อัตโนมัติ
- ไฟล์ staged ใน `_pendingFiles[]` ก่อน submit — validate type/size/duplicate client-side

### File Upload Security
- `accFileFilter` (local ใน `accident.js`) แทน global `fileFilter` — restrict เฉพาะ image/* + PDF
- `parseId(val)` validate `:id` params ทุก route (400 ถ้าไม่ใช่ integer > 0)
- `s(v)` trim whitespace จาก `req.body` string fields ทุกตัว
- DELETE routes verify existence ก่อน destroy (404 ถ้าไม่พบ)

### Safety Performance (KPI Board)
- `GET /accident/performance?year=` คืน record + `recordableCount` จาก `Accident_Reports` (Zero Accident = recordableCount === 0)
- `daysWithoutAccident`: ถ้ามี `LastAccidentDate` → คำนวณ `today - lastDate`; ถ้าไม่มี → ใช้ `TotalDays` (manual)
- `MonthlyStatus` เป็น JSON object `{ "1": "green", "2": "red", ... }` — admin คลิก cell เพื่อ cycle: pending → green → red → pending (auto-save ทันที)
- `PUT /accident/performance` ใช้ `ON DUPLICATE KEY UPDATE` — upsert ต่อ Year

### Tabs & Cache Sync
4 tabs: `dashboard`, `analytics`, `reports`, `performance`
- `_summary`, `_analytics`, `_perfData` เป็น module-level cache
- ล้าง cache ทั้ง 3 เมื่อ: (1) เปลี่ยนปี (2) บันทึกรายงาน (3) ลบรายงาน
- เปลี่ยนปี (`acc-year-sel`) → reset caches ก่อน render เสมอ ป้องกัน race condition

## Training Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Training_Courses` | หลักสูตร — `CourseCode`, `CourseName`, `DurationHours`, `PassScore`, `IsActive` |
| `Training_Records` | (legacy — ไม่ได้ใช้ใน UI ปัจจุบัน) บันทึกรายบุคคล |
| `Training_Dept_Records` | บันทึกรายแผนก — `Department`, `Year`, `CourseID` (nullable), `TotalEmp`, `PassedCount`, `Notes`; UNIQUE KEY `(Department, Year, CourseID)` |

### Key API Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /training/dept-summary?year=` | สรุปรายแผนก: `{ byDept, overall: { deptCount, totalEmp, totalPassed, passRate } }` |
| `GET /training/course-summary?year=` | สรุปรายหลักสูตร: `[{ CourseID, CourseName, deptCount, totalEmp, passedCount }]` |
| `GET /training/dept-records?year=&department=` | รายการดิบ JOIN Training_Courses |
| `POST /training/dept-records` | เพิ่มบันทึก — duplicate guard ด้วย `CourseID <=>` (NULL-safe) |
| `PUT /training/dept-records/:id` | แก้ไขบันทึก — duplicate guard ยกเว้น row ปัจจุบัน |
| `GET /training/courses` | รายการหลักสูตรทั้งหมด |

### Dashboard Structure
1. KPI cards (4 ใบ): แผนกที่บันทึก / พนักงานเข้าอบรม / ผ่านการอบรม / Pass Rate
2. Horizontal stacked bar chart — compliance รายแผนก (`indexAxis:'y'`)
3. 2-col grid: **Course Summary table** (ซ้าย) + **Dept Summary table** (ขวา) — ทั้งสองแสดงเฉพาะ depts/courses ที่มีข้อมูลจริง
4. **Dept × Course Matrix** (full-width) — แสดงเมื่อมี 2+ courses; rows=depts, cols=courses, cells=% badge, last col=overall; คำนวณ client-side จาก `dept-records` โดยตรง

### Duplicate Guard (NULL-safe CourseID)
MySQL UNIQUE index ถือ NULL เป็น distinct ทุกค่า — ต้องใช้ `CourseID <=> ?` ใน application-level check แทน `CourseID = ?`

```js
WHERE Department = ? AND Year = ? AND (CourseID <=> ?)
```

### Division-by-zero
`pct = total > 0 ? Math.round(passed * 100 / total) : null` — null → แสดง "—" ใน UI

## Policy Module — Architecture

### Description Field — Rich Text Editor
`policy.js` ใช้ RTE เดียวกับ Yokoten สำหรับ field `Description` — toolbar + `contenteditable` + input bar สำหรับ link/image

#### IDs (prefixed `pol-`)
| Element | ID |
|---------|-----|
| Toolbar | `pol-rte-toolbar` |
| Link/image input bar | `pol-rte-input-bar` |
| Input label | `pol-rte-input-label` |
| URL input | `pol-rte-url-input` |
| Insert button | `pol-rte-insert-btn` |
| Cancel button | `pol-rte-cancel-bar` |
| Editable area | `pol-desc` |

#### Style injection
`<style id="pol-rte-style">` — inject once ก่อน `openModal()` (guard: `if (!document.getElementById('pol-rte-style'))`)
- placeholder CSS สำหรับ `#pol-desc`
- `.pol-rte-content` class สำหรับ render HTML ใน view (list, heading, bold, italic, underline, link, image)
- `.rte-btn.rte-active` — shared class กับ Yokoten

#### Data flow
- **Edit form**: `rteEl.innerHTML = _sanitizeHtml(policy.Description)` — populate existing HTML
- **Submit**: `data.Description = _sanitizeHtml(rteEl.innerHTML).trim()` — อ่านจาก contenteditable โดยตรง (ไม่ผ่าน FormData)
- **View**: render ด้วย `.pol-rte-content` class — ไม่ใช้ `whitespace-pre-wrap`
- **PDF export**: `.desc-box` ไม่มี `white-space:pre-wrap` + มี styles สำหรับ `h3`, `ul/ol/li`, `b/em/u`, `a`, `img`

#### Helper
`_sanitizeHtml(html)` ใน `policy.js` — strip `<script>`, `<iframe>`, `on*=`, `javascript:` (เหมือน Yokoten)

### Policy Acknowledgement
- Self acknowledgement endpoint: `POST /api/policies/:id/acknowledge`.
- Admin bulk acknowledgement endpoint: `POST /api/policies/:id/acknowledge-all`.
- Bulk acknowledgement inserts missing rows for every current employee from `Employees`; it uses `INSERT IGNORE`, so repeated clicks are idempotent and do not duplicate `(PolicyID, UserID)`.
- `Policy_Acknowledgements` columns:
  - `AckSource`: `'self'` or `'admin_all'`.
  - `AcknowledgedByAdminID`: Admin EmployeeID when bulk acknowledgement is used.
  - `AcknowledgedByAdminName`: Admin display name when bulk acknowledgement is used.
- The Admin UI button is `#btn-ack-all` in `public/js/pages/policy.js`; it is disabled when all employees have already acknowledged.
- Acknowledgement list and Excel export include the acknowledgement source and Admin operator.
- Bulk acknowledgement writes an audit row with action `ACKNOWLEDGE_ALL_POLICIES`.

### RTE Reuse Pattern (ทุก module)
เมื่อต้องการเพิ่ม RTE ให้กับ Description field ของ module อื่น:
1. Replace `<textarea>` ด้วย toolbar + input bar + `contenteditable` — ใช้ prefix เฉพาะ module (เช่น `pol-`, `acc-`)
2. Inject `<style id="xxx-rte-style">` once ก่อน `openModal()`
3. Init RTE ใน `setTimeout(..., 0)` หลัง `openModal()`
4. Submit อ่าน `_sanitizeHtml(rteEl.innerHTML)` แล้ว set ใน data object
5. View ใช้ `.xxx-rte-content` class แทน `whitespace-pre-wrap`
6. PDF: ลบ `white-space:pre-wrap` + เพิ่ม HTML element styles
7. เพิ่ม `_sanitizeHtml()` helper ในไฟล์ module

## Yokoten Module — Architecture (Phase 3)

### Tables
| Table | Purpose |
|-------|---------|
| `YokotenTopics` | หัวข้อ Yokoten — `TargetDepts` (JSON array), `TargetUnits` (JSON array), `RiskLevel`, `Category`, `Deadline`, `AttachmentUrl` — auto-created by `ensureTables()` |
| `YokotenResponses` | Response หนึ่งรายการต่อ (YokotenID, Department) — UNIQUE KEY `uq_dept_topic` — `IsRelated`, `Comment`, `CorrectiveAction`, `ApprovalStatus` (NULL/pending/approved/rejected), `ApprovalComment`, `ApprovedBy`, **`IsDeleted TINYINT(1) DEFAULT 0`** (soft delete — auto-migrated ใน `ensureTables()`) |
| `Yokoten_Response_Files` | ไฟล์แนบต่อ response — `ResponseID` (FK), `FileName`, `FileURL`, `PublicID`, `FileType`, `FileSize`, `UploadedBy` |
| `Yokoten_Dashboard_Config` | Config row เดียว — `pinnedDepts` (JSON), `pinnedUnits` (JSON) — upsert ด้วย `INSERT ... ON DUPLICATE KEY UPDATE` |

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /yokoten/topics` | User | ดึงทุก topic (IsActive=1) พร้อม `deptResponse` ของ caller's dept + `totalDeptCount` |
| `POST /yokoten/topics` | Admin | สร้าง topic ใหม่ (TargetDepts+TargetUnits เป็น JSON) |
| `PUT /yokoten/topics/:id` | Admin | แก้ไข topic |
| `DELETE /yokoten/topics/:id` | Admin | ลบ topic + cascade responses+files (server file storage) |
| `POST /yokoten/respond` | User/Admin | ส่ง dept response (FormData, field: `responseFiles`) — User ส่งได้เฉพาะแผนกตัวเอง; Admin ส่งแทนหลายแผนกได้ด้วย `departments` JSON array; IsRelated='Yes' requires CorrectiveAction + at least 1 evidence file and starts `ApprovalStatus='pending'`; IsRelated='No' can submit without action/evidence |
| `PUT /yokoten/respond/:id` | User/Admin | แก้ไข response (FormData) — ต้องเป็น dept เดียวกันหรือ admin |
| `DELETE /yokoten/respond/:id` | Admin | ลบ response + cascade files (server file storage) |
| `POST /yokoten/respond/:id/approve` | Admin | อนุมัติ → ApprovalStatus='approved' |
| `POST /yokoten/respond/:id/reject` | Admin | ปฏิเสธ → ApprovalStatus='rejected', body: `{ comment }` |
| `POST /yokoten/bulk-approve` | Admin | Bulk approve `{ ids: [ResponseID, ...] }` → UPDATE IN (...) WHERE ApprovalStatus='pending' |
| `DELETE /yokoten/respond/:id` | Admin | Soft delete → IsDeleted=1 (ไฟล์ server file storage ยังคงอยู่) |
| `DELETE /yokoten/response-files/:fileId` | Admin | ลบไฟล์เดี่ยว (server file storage + DB) |
| `GET /yokoten/dept-history` | User | ประวัติ response ของแผนกตัวเอง พร้อมไฟล์ |
| `GET /yokoten/dept-completion` | Admin | `{ topics, deptSummary }` — สรุปทุกแผนกจาก Master_Departments |
| `GET /yokoten/all-responses` | Admin | response ทั้งหมด พร้อมไฟล์ (filterable) |
| `GET /yokoten/employee-completion` | Admin | employee-level completion view; ห้ามเปิดให้ User เพราะสรุปข้อมูลรายบุคคล/ทุกแผนก |
| `GET /yokoten/dashboard-config` | User | `{ pinnedDepts: [], pinnedUnits: [] }` |
| `PUT /yokoten/dashboard-config` | Admin | บันทึก config |

### Permission Boundary
- User can read active topics, but `GET /topics` attaches only `deptResponse` for `req.user.department`. It must not include other departments' response bodies/files.
- User can read `GET /dept-history`, scoped to `req.user.department` only.
- User can create a response only for their own department. `POST /respond` ignores submitted `department/departments` unless the caller is Admin.
- User can update a response only when it belongs to their department and `ApprovalStatus='rejected'`; otherwise update returns 403.
- Admin-only: topic create/update/delete, all-responses, dept-completion, employee-completion, approve/reject/delete response, delete response files, bulk approve, dashboard-config update.
- UAT preflight must assert user-token 403 for Yokoten `dept-completion`, `all-responses`, and `employee-completion`.

### Response Model — Approval Workflow
- `IsRelated = 'Yes'` → `CorrectiveAction` + at least one evidence file required → `ApprovalStatus = 'pending'` → admin approve/reject
- `IsRelated = 'No'` → `ApprovalStatus = NULL` (auto-approved/no action required)
- `CorrectiveAction` and evidence files are enforced client+server side when `IsRelated = 'Yes'`.
- Status ที่ frontend ใช้ filter: `'responded'` | `'pending'` | `'rejected'`
- Admin response-on-behalf supports multi-department submit from the dashboard/detail modal. Frontend sends `departments: JSON.stringify([...])` in FormData; backend creates one `YokotenResponses` row per selected department while preserving the one-response-per `(YokotenID, Department)` unique-key rule.
- Multi-department persistence is atomic in PHP and Node: the selected Department rows are locked with `FOR UPDATE`, all response/file rows commit together, and an active response still returns 409.
- A soft-deleted `(YokotenID, Department)` row occupies the same unique-key slot. A new response therefore reuses that deleted row with a new `ResponseID`, resets approval metadata, and sets `IsDeleted=0`; historical attachment files are not physically deleted.
- One-department submit may attempt immediate notification delivery. Multi-department submit only creates `Yokoten_EmailOutbox` rows and returns `notificationMode: "queued"` so SMTP latency cannot turn a successful bulk save into HTTP 500.
- When one uploaded file is attached to multiple admin-created responses, each response gets its own `Yokoten_Response_Files` row pointing at the same stored file URL. `DELETE /response-files/:fileId` only removes the physical file when no other DB file row references that `FileURL`.

### Dashboard UX — Enterprise Phase 1
- Dashboard is treated as an operational control center before passive reporting.
- Admin executive dashboard renders `Enterprise Action Required` above charts. It groups:
  - pending approvals and rejected responses with drill-down to topic detail
  - missing department-topic responses prioritized by overdue/high-risk items
  - SLA/deadline watch for overdue and near-due topics
- Action-center rows use `.yok-open-topic-btn` and open `openDetailModal()` directly. If `data-rid` is present, the modal injects that response as `deptResponse` so admins can approve/reject in context.
- Keep charting secondary to the work queue: KPI strip → action required → department completion/status charts → risk/deadline summaries.

### Dashboard UX — Enterprise Phase 2
- Executive chart layer lives directly under `Enterprise Action Required`.
- `_buildExecutiveChartLayer()` renders:
- `Response Status Mix` donut (`#yok-status-chart`) for not responded / not-related auto-approved / pending / approved / rejected
  - `Monthly Yokoten Flow` line chart (`#yok-trend-chart`) for issued topics vs responses by month for `_dashYear`
- Chart lifecycle uses `_chartStatus` and `_chartTrend`; `_destroyCharts()` must destroy them when leaving dashboard or changing year.
- `_initStatusChart()` derives total possible responses from targeted dept-topic breakdown and `_allResponses`; `_initTrendChart()` uses `_topics` and `_allResponses` scoped to the selected year.

### Dashboard UX — Enterprise Phase 3
- Dashboard charts are no longer passive-only; they provide an inspectable drill-down layer under the executive chart row.
- `_dashboardDrilldown` stores the active drill-down selection and resets when the dashboard year changes.
- `Response Status Mix` supports drill-down from either the donut segment or the clickable legend row. It lists the exact missing department-topic items or response rows for that status.
- `Monthly Yokoten Flow` supports drill-down from chart points:
  - issued-topic points list topics issued in that month
  - response points list responses submitted in that month
- Drill-down rows use `.yok-open-topic-btn` and open the same Yokoten detail modal, preserving the admin approve/reject and response-on-behalf flows.

### Dashboard UX — Enterprise Phase 4
- `_buildExecutiveRiskWatch(deptSummary, topics, allResp)` renders directly after `Enterprise Action Required` and before the executive chart row.
- It is a decision layer, not a new API: it derives all items from existing `deptSummary`, selected-year `topics`, and `_allResponses`.
- The watch panel groups:
  - High/Critical department-topic gaps that have not responded yet
  - pending approvals sorted by age in days
  - department bottlenecks scored from completion %, pending approvals, rejected responses, and high-risk gaps
- High-risk and pending rows use `.yok-open-topic-btn`; department bottleneck rows switch to Admin → department completion view via `.yok-admin-dept-watch-btn`.

### Dashboard UX — Enterprise Phase 5
- `_buildExecutiveBrief(deptSummary, topics, allResp, alertTopics)` renders as the first executive dashboard block before `Enterprise Action Required`.
- It summarizes selected-year Yokoten health into one management-read paragraph plus four metrics:
  - response coverage
  - High/Critical response coverage
  - overdue response gaps
  - oldest pending approval age
- Health labels are derived client-side only: `Stable`, `Watch Closely`, or `Critical Attention`.
- Brief buttons use `.yok-brief-drill-btn` to open the existing dashboard drill-down layer, and `.yok-brief-admin-dept-btn` to jump to Admin → department completion.

### Dashboard UX — Enterprise Phase 6
- Executive brief calculations live in `_getExecutiveBriefData(deptSummary, topics, allResp, alertTopics)` so dashboard and PDF use the same health/coverage numbers.
- `exportYokotenPDF()` prepends a Board Report Snapshot page before the existing department/table report pages.
- The PDF snapshot includes:
  - Executive Board Snapshot text + health label
  - response coverage, High/Critical coverage, overdue gaps, and oldest pending approval age
  - top High/Critical response gaps
  - oldest pending approvals
- This is frontend-only PDF composition; it does not add endpoints, tables, or schema.

### Dashboard UX — Enterprise Phase 7
- Yokoten UI wording is standardized as Thai + English for high-traffic surfaces.
- Primary dashboard panels use bilingual titles and metrics, for example:
  - `Executive Brief / สรุปผู้บริหาร`
  - `Enterprise Action Required / งานที่ต้องติดตาม`
  - `Executive Risk & Aging Watch / ความเสี่ยงและงานค้าง`
  - `Response Status Mix / สัดส่วนสถานะตอบกลับ`
  - `Monthly Yokoten Flow / แนวโน้มรายเดือน`
- Detail modal and admin response controls use bilingual labels for risk, response status, target scope, deadline, approve/reject/delete, and admin response-on-behalf.
- Keep future Yokoten labels in the same pattern:
  - dashboard/report headings: English first, Thai second
  - operational status/action labels: English + Thai in one short line
  - avoid changing API field names or stored status values; this phase is UI wording only

### Yokoten Final Polish
- Frontend must guard admin-only UI even when an old saved tab/state points to Admin. Non-admin users are redirected back to Topics, and admin-only click handlers show `Admin access required / ต้องใช้สิทธิ์ผู้ดูแลระบบ`.
- Topics filter bar includes an SLA filter with values:
  - `overdue` = not responded and deadline has passed
  - `due_soon` = not responded and deadline is within the near-deadline window
  - `no_deadline` = topic has no deadline
- Topics empty state should be bilingual and explain that filters/search can be adjusted.
- `exportYokotenPDF()` includes enterprise report metadata: document no., generated date, generated by, scope year, and `Internal Use Only` classification.

### deptResponse shape (returned in GET /topics)
```js
{
    ResponseID, YokotenID, Department, EmployeeID, EmployeeName,
    IsRelated, Comment, CorrectiveAction,
    ApprovalStatus,   // null | 'pending' | 'approved' | 'rejected'
    ApprovalComment, ApprovedBy, ApprovedAt,
    ResponseDate, UpdatedAt,
    files: [{ FileID, FileName, FileURL, FileType, FileSize }]
}
```

### deptSummary shape (returned in GET /dept-completion)
```js
{
    department, totalTopics, respondedCount, pendingApproval, rejected,
    completionPct, lastResponse,
    topicBreakdown: [{
        YokotenID, title, responded, isRelated, approvalStatus,
        responseCount, fileCount, respondedBy, responseDate
    }]
}
```

### File Upload (Response Files)
- Field name: `responseFiles` (multer `.array('responseFiles', 10)`)
- ใช้ `responseFileFilter` (local ใน yokoten.js) — รับ image/*, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 20 MB ต่อไฟล์, สูงสุด 10 ไฟล์ต่อ response
- `API.post('/yokoten/respond', fd)` และ `API.put('/yokoten/respond/:id', fd)` — ส่ง FormData โดยตรง (`apiFetch` จะไม่ set Content-Type เมื่อ body เป็น FormData)
- Response attachments use `backend/storage.js` display names (`file.originalName` / `cleanOriginalFilename()`), so Thai filenames are stored for display/download metadata while physical stored filenames remain randomized.
- Frontend validates response/topic attachment type, max 10 response files, and 20 MB per file before upload.

### Yokoten Safety Guards
- Soft-deleted responses (`IsDeleted=1`) are ignored when checking whether a department already responded, so admin-deleted responses do not block a new submission.
- Users can update a response only when it belongs to their department and has `ApprovalStatus='rejected'`; admins can still edit for governance work.
- Approve/reject endpoints only operate on active responses (`IsDeleted IS NULL OR IsDeleted = 0`).
- Server 500 responses use a standard user-facing message while logging technical errors to the server console.

### Frontend State Variables
```js
let _topics         = [];    // each topic has deptResponse: {..., files:[]} | null
let _history        = [];    // dept's own responses
let _masterDepts    = [];    // from GET /master/departments
let _safetyUnits    = [];    // from GET /master/safety-units
let _deptCompletion = null;  // { topics, deptSummary } — admin only
let _dashConfig     = {};    // { pinnedDepts, pinnedUnits }
let _allResponses   = [];    // admin only
let _adminView      = 'topics'; // 'topics' | 'dept' | 'config'
let _filterAck      = '';    // '' | 'responded' | 'pending' | 'rejected'
```

### Admin Tabs (renderAdmin)
3 sub-tabs: `topics` (CRUD topics) | `dept` (dept completion + approve/reject) | `config` (dashboard pinned depts)

### Dept Filtering Utilities
```js
// กรอง deptSummary ให้เหลือเฉพาะแผนกที่อยู่ใน TargetDepts ของ topics อย่างน้อยหนึ่งหัวข้อ
_filterToTargetedDepts(deptSummary, topicsArr)

// กรอง deptSummary ให้เหลือเฉพาะแผนกใน TargetDepts ของ topic เดียว ([] = ทุกแผนก)
_getTopicTargetedDepts(deptSummary, topic)
```
- ใช้ใน: `_buildExecSection`, `_initDeptChart`, `_buildAdminDept`, `_buildAdminTopics`, `exportYokotenPDF`
- `TargetDepts = []` (ไม่ได้เลือก) หมายถึง "ทุกแผนก" — ต้องไม่ filter ออก

### HTML Description Utilities
```js
_sanitizeHtml(html)  // ใช้ render HTML ใน modal (_buildTopicModal) + RTE init/submit
_htmlToText(html)    // ใช้ truncate preview ใน cards, tables, PDF, data-attributes
```
- ห้ามสลับสองตัวนี้: `_sanitizeHtml` = ยังเป็น HTML, `_htmlToText` = แปลงเป็น plain text

### Rich Text Editor (openTopicForm)
Toolbar buttons ทั้งหมด:
- **Bold / Italic / Underline** — `execCommand`
- **Bullet list / Numbered list** — `execCommand`
- **Heading (H3) / Clear format** — `execCommand`
- **Align Left / Center / Right / Justify** — `execCommand('justifyLeft/Center/Right/Full')` + active state ด้วย `queryCommandState`
- **Insert Link** — บันทึก selection range → แสดง `#yt-rte-input-bar` → `execCommand('createLink')` + เพิ่ม `target="_blank"`
- **Remove Link** — `execCommand('unlink')`
- **Insert Image (URL)** — บันทึก selection range → แสดง `#yt-rte-input-bar` → `execCommand('insertImage')`

Pattern สำคัญ: link/image ต้องบันทึก selection ก่อนที่ focus จะออกจาก contenteditable แล้วค่อย restore เมื่อกด "แทรก"
```js
let _savedRange = _saveSelection();   // ก่อนแสดง input bar
_restoreSelection(_savedRange);       // ก่อน execCommand
```

CSS classes: `.rte-active` = alignment button ที่ active อยู่ (bg-sky-100); `.yok-rte-content img` / `.yok-rte-content a` — ใน `#yok-rte-style`

### History Tab — Admin Edit/Delete
- **Edit** (`.yok-hist-edit-btn`): inject response เป็น `deptResponse` บน topic copy → `openModal(_buildTopicModal(tWithResp))`
- **Delete** (`.yok-hist-del-btn`): confirm → `DELETE /yokoten/respond/:id` → `refreshData()`
- Non-admin users เห็น Edit เฉพาะ response ที่ถูก `rejected`

### GROUP BY / only_full_group_by Pitfall
ใช้ `SELECT r.* FROM YokotenResponses r WHERE r.Department = ?` แทน `SELECT r.*, GROUP_CONCAT(...) ... GROUP BY r.ResponseID` — MySQL/MariaDB อาจใช้ `sql_mode=only_full_group_by`; files ดึงแยกผ่าน `filesMap` อยู่แล้ว

## CCCF Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `CCCF_FormA_Worker` | รายการค้นหาอันตรายรายบุคคล (พนักงานส่งเอง) — มี `SafetyUnit` column (auto-migrated) |
| `CCCF_FormA_Permanent` | เอกสารผลดำเนินการถาวร — ส่งโดย supervisor หรือ admin ส่งแทนได้ พร้อมแนบไฟล์ server file storage, มี `AssigneeID`, `StopType`, `Rank` |
| `CCCF_EmailOutbox` | คิวอีเมล CCCF Form A Permanent แบบ text+HTML แยกจาก Hiyari; ใช้ retry ได้ผ่าน admin endpoint |
| `CCCF_Unit_Targets` | เป้าหมายต่อ Unit — `yearly_target` (จำนวนคน ไม่ใช่ครั้ง) + `achieved_override` (admin override) |
| `CCCF_Assignments` | กำหนดผู้รับผิดชอบจาก Master Employee ว่าใครต้องส่ง Form A Permanent — admin เพิ่ม/แก้ไข/ลบได้ |

### Form A Permanent Tracking
- ใช้ `buildPermanentTrackingRows()` รวม `CCCF_Assignments` + `CCCF_FormA_Permanent` เป็นตารางติดตามเดียว
- สถานะมี 3 แบบ: `must_send` = ยังไม่มีรายการส่ง, `onprocess` = มีรายการส่งแต่ยังไม่มีไฟล์แนบ, `complete` = มีรายการส่งและมีไฟล์แนบ
- แถวที่มาจาก assignment ต้องขึ้นทันทีในตาราง แม้ยังไม่เคยส่งเอกสาร
- filter ของตารางรองรับ Department, Status, Rank, Stop Type
- แอดมินทำงานจากตารางได้เลย: เพิ่มแทนผู้ใช้, แก้ไขรายการ Permanent, ลบรายการ Permanent

### Permanent Admin Workflow
- ฟอร์ม `openPermanentForm(record = null, forcedAssigneeId = '')` ใช้ร่วมกันทั้ง create / edit / admin-submit-for-user
- ฟอร์ม Permanent ต้องคง field เดิมครบ: `ผู้รับผิดชอบ`, `JobArea`, `SubmitDate`, `Summary`, `StopType`, `Rank`, `FormFile`; เพิ่ม UX/related forms ได้ แต่ห้ามลบ field เหล่านี้
- Permanent tab แสดง “แบบฟอร์มที่เกี่ยวข้อง” จาก `Module_Forms` ด้วย `module=cccf`; admin จัดการ template ได้จากปุ่มแบบฟอร์ม และ user เห็นเฉพาะ active forms
- ถ้าเป็น admin ต้องเลือกผู้รับผิดชอบ (`AssigneeID`) จาก assignment/master employee ได้ และระบบเติม `SubmitterName` + `Department` ตาม master
- backend helper `resolvePermanentSubmitter()` ใช้ source of truth จาก `Employees` เมื่อมี `AssigneeID`
- endpoint ที่เกี่ยวข้อง:
  - `POST /cccf/form-a-permanent` — supervisor ส่งเอง หรือ admin ส่งแทนผู้ใช้
  - `PUT /cccf/form-a-permanent/:id` — admin แก้ไขรายการ Permanent และอัปไฟล์แทนได้
  - `DELETE /cccf/form-a-permanent/:id` — admin ลบรายการได้

### CCCF Permanent Email Loop
- `backend/routes/cccf.js` ใช้ `sendMail({ text, html })` + `buildHiyariEmail()` เพื่อสร้าง corporate HTML email แบบเดียวกับ Hiyari แต่แยก `CCCF_EmailOutbox`
- Admin recipient ใช้ `CCCF_ADMIN_EMAIL` หรือ fallback `HIYARI_ADMIN_EMAIL` / `ADMIN_EMAIL` / default company safety admin
- Email events: `Submitted` แจ้ง Safety Admin, `SubmittedByAdmin` แจ้งเจ้าของงานเมื่อ admin ส่งแทน, `Updated`/`UpdatedWithFile` แจ้งเจ้าของงานเมื่อ admin แก้ไข, `Assigned`/`AssignmentUpdated` แจ้งผู้รับผิดชอบเมื่อมี assignment
- Owner email ดึงจาก `Employees.CompanyEmail` และรับเฉพาะโดเมนบริษัท `@thaisummit-harness.co.th`; ไม่มี email จะไม่ block การบันทึก แต่จะไม่ส่งเมลหา owner
- Admin retry endpoints: `GET /cccf/email-outbox`, `POST /cccf/email-outbox/:id/retry`, `POST /cccf/email-outbox/retry-queued`

### Assignment Manager
- modal assignment ใช้รายชื่อจาก Master Employee เป็นหลัก
- `POST /cccf/assignments` ใช้เพิ่ม assignment ใหม่
- `PUT /cccf/assignments/:id` ใช้แก้ assignment เดิมตรง ๆ โดยไม่ต้องลบแล้วเพิ่มใหม่
- `DELETE /cccf/assignments/:id` ใช้ลบ assignment
- ต้องกัน duplicate `EmployeeID` ใน `CCCF_Assignments`

### Permanent Department Progress
- dashboard executive ต้องแสดง progress รายส่วนงานจาก assignment ตั้งต้น ไม่ใช่นับเฉพาะรายการที่ส่งแล้ว
- ใช้ `buildPermanentDepartmentProgress()` สรุป `complete / onprocess / must_send` ต่อ Department
- `progressPct = complete / totalAssignedInDept`
- ถ้าส่วนงานยังไม่มีการส่งเลย ให้แสดงว่า `ยังไม่มีการส่ง`

ทุก table สร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` (try/catch) ใน startup IIFE ของ `backend/routes/cccf.js`

### CCCF_Unit_Targets — achieved_override
- `achieved_override INT DEFAULT NULL` — ถ้า NULL ระบบใช้ค่าที่คำนวณจาก unique EmployeeID ที่ส่งจริง
- ถ้า admin ตั้ง override ≠ NULL → ใช้ค่านั้นแทน computed value
- `buildUnitData()` ใน `cccf.js`: `achievedComputed = Set(yearData.map(r => r.EmployeeID)).size` → `achieved = achievedOverride ?? achievedComputed`
- PUT endpoint รับ `{ yearly_target, achieved_override }` — ถ้า `achieved_override` เป็น `null`/`''` → set `NULL` ใน DB

### Unit Summary Combo Chart
- **Horizontal bar chart** (`indexAxis: 'y'`) — ป้องกัน X-axis label ถูกตัด + align กับแถวตาราง
- **Stacked bars**: Achieved (เขียว) + Onprocess/Remaining (เหลือง) — total = target
- **Target line**: dataset `type:'line'` แสดง target ต่อ Unit บน X-axis
- **Y-axis labels**: แสดงชื่อ Unit ตัดที่ 22 ตัวอักษร (`getLabelForValue` + slice) — หมุนในตาราง, ไม่หมุนในกราฟ
- **Height sync**: chart ใช้ `flex-1; min-height:200px` ใน flex-column parent ที่เป็น flex-1 ของ outer flex-row → ความสูงตามตาราง
- `_unitChartInst` destroy ก่อน recreate ทุกครั้ง — ป้องกัน Chart.js duplicate instance
- `initUnitChart()` ต้องถูกเรียกหลัง DOM settle → ใช้ `setTimeout(() => initUnitChart(), 0)` เสมอ

### Year Filters
- **Unit summary**: `_unitYear` state → `window._unitSetYear(year)` re-renders `#cccf-unit-summary-inner` + reinit chart
- **"รายการของฉัน"**: `_myCardYear` state → `window._myCardSetYear(year)` re-renders `#cccf-my-card-wrap`
- ทั้งสอง default = `new Date().getFullYear()`

### Admin Edit Modal (`_cccfSetUnitTarget`)
- signature: `(unit, currentTarget, achievedOverride, computedAchieved)`
- 3 fields: เป้าหมาย (required), Achieved Override (optional — เว้นว่าง = ใช้ระบบ), Remaining (auto-calc read-only)
- `window._unitUpdateRemaining()` — global oninput handler อ่าน `data-computed` attribute จาก input เพื่อ fallback

### Safety Unit in Worker Form
- SafetyUnit ดึงจาก `GET /master/safety-units` — แสดง **ทุก unit** ไม่ filter ตาม department (ต่างจาก registration form)
- ถ้า `_safetyUnits.length > 0` → `<select>`, ถ้าไม่มี → `<input type="text">`

## Patrol Module — Overview Tab Structure

`patrol.js` แท็บ "ทีมและภาพรวม" มี 2 sub-tabs:

| Sub-tab | ID | RosterGroup | Attendance source | Yearly target |
|---------|----|-------------|-------------------|---------------|
| Top & Management | `ov-sub-mgmt` | `top_management` | `Patrol_Attendance.UserID` | per person (TargetPerYear in Patrol_Roster) |
| Sec. & Supervisor | `ov-sub-sv` | `supervisor` | `Patrol_Self_Checkin.EmployeeID` | per person (TargetPerYear in Patrol_Roster) |

### Position → Yearly Target
**Management group:**
- ผู้จัดการทั่วไป, ผู้ช่วยผู้จัดการทั่วไป, ผู้อำนวยการ → **12 ครั้ง/ปี**
- ผู้ชำนาญการพิเศษ, ผู้จัดการ → **24 ครั้ง/ปี**

**Supervisor group:**
- หัวหน้าแผนก, หัวหน้าส่วน → **24 ครั้ง/ปี**

### Patrol_Roster Table
```sql
CREATE TABLE IF NOT EXISTS Patrol_Roster (
    id INT AUTO_INCREMENT PRIMARY KEY,
    EmployeeID VARCHAR(50) NOT NULL,
    RosterGroup VARCHAR(20) NOT NULL,  -- 'top_management' | 'supervisor'
    TargetPerYear INT NOT NULL DEFAULT 12,
    SortOrder INT DEFAULT 99,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
สร้างอัตโนมัติเมื่อ server start (`CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `backend/routes/patrol.js`)
ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อให้ import/export ข้าม MySQL-compatible engines ง่ายขึ้น

### Admin Actions (per row in overview tables)
- **ดูรายการ** → modal แสดงรายการเดินตรวจ + เพิ่ม/ลบรายการ (calls `GET /patrol/member-records`)
- **แก้ไขเป้าหมาย** → modal แก้ `TargetPerYear` (calls `PUT /patrol/roster/:id`)
- **ลบสมาชิก** → confirm + calls `DELETE /patrol/roster/:id`
- **เพิ่มสมาชิก** button (ในหัว table) → modal **multi-select** ค้นหาพนักงาน + เลือกหลายคนพร้อมกัน (calls `POST /patrol/roster` ทีละคน)
  - ซ่อนพนักงานที่อยู่ใน roster **ทั้งสองกลุ่ม** ออกจากรายการค้นหา (fetch ทั้ง `top_management` + `supervisor` พร้อมกัน แล้ว union existingIds) — ป้องกัน admin สับสน
  - กด row เพื่อ toggle (checkbox UI), selected chips แสดงด้านล่าง
  - เป้าหมาย (TargetPerYear) ใส่ครั้งเดียว ใช้กับทุกคนที่เลือก

### Admin Record — บันทึกแทนพนักงานทุกคน (ไม่จำกัด roster)
- Admin เห็น **search card "บันทึกการเดินตรวจ (Admin)"** เหนือ sub-tab toggle ใน Overview tab
- พิมพ์ชื่อ / รหัสพนักงาน / แผนก → debounce 300ms → `GET /patrol/employee-search?q=` → dropdown สูงสุด 30 คน
- คลิกพนักงานใน dropdown → เปิด `openAdminRecordModal(employeeId, name, 0)` ซึ่งแสดงรายการเดินตรวจปัจจุบัน + ฟอร์มเพิ่ม/ลบ
- ใช้ร่วมกับ `GET /patrol/member-attendance?employeeId=X&year=Y` และ `POST/DELETE /patrol/admin-record` ที่มีอยู่แล้ว — ไม่มี table ใหม่
- **`GET /api/patrol/employee-search`** (Admin-only) — query `Employees` table, params: `q` (free text), returns `{ EmployeeID, EmployeeName, Department, Position }[]` สูงสุด 30 รายการ

### Patrol Overview UI Details (Top & Management tab)
- **Spotlight card** — full-width banner วางอยู่เหนือ grid ตาราง (ไม่อยู่ใน sidebar) เพื่อความเด่นชัด
- **Sidebar** — `flex flex-col h-full gap-3`: 3 stat cards แยกกัน (เซสชันทั้งหมด / เข้าร่วมรวม / อัตราเข้าร่วม) + pie chart ด้วย `flex-1` เต็มพื้นที่ที่เหลือ
- **ตาราง Top & Management** — เรียงลำดับ `TargetPerYear` ascending (12 ก่อน แล้วค่อย 24)

### PDF Export (`window.exportPatrolPDF(group)`)
- ปุ่ม PDF อยู่ในหัว card ของทั้งสอง sub-tabs (`top_management` / `supervisor`)
- ใช้ **fixed-page approach**: แต่ละหน้าเป็น HTML `794×1122px` (A4 at 96dpi) render ด้วย html2canvas → jsPDF `addImage(..., 0, 0, 210, 297)` → ขนาดพอดี A4 เสมอ
- หน้าข้อมูล: `display:flex;flex-direction:column` — content ใน `flex:1`, footer bar สีเขียวพิน bottom (`flex-shrink:0`) ป้องกัน whitespace
- หน้าสรุป (summary): green header block + content area `flex:1;justify-content:space-evenly` (3 sections) + footer — เนื้อหากระจายเต็มหน้า
- `ROWS_P1 = spMember ? 21 : 26`, `ROWS_FULL = 30`
- filename: `SP-MGT-YYYY-MMDD.pdf` / `SP-SUP-YYYY-MMDD.pdf`

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

## Frontend Auth Pattern (Critical)

### ใช้ `TSHSession.getUser()` เสมอ — ห้ามใช้ `localStorage.getItem('currentUser')`

`session.js` บันทึก user object ด้วย key `tsh_user` แต่ทุก page อ่านผ่าน `TSHSession.getUser()` เท่านั้น

```js
// CORRECT:
const currentUser = TSHSession.getUser() || { name: '', id: '', department: '', team: '', role: 'User' };

// WRONG (key mismatch bug — จะได้ null เสมอ):
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
```

`TSHSession` object มีใน `public/js/session.js` และ expose เป็น global บน `window`

## Backend: Employee Data from JWT (Critical)

Routes ที่บันทึกข้อมูลเกี่ยวกับผู้ใช้ **ต้องดึงจาก `req.user`** (JWT) ไม่รับจาก `req.body` เพื่อป้องกันการปลอมแปลงข้อมูล

```js
// CORRECT (patrol checkin, cccf form-a-worker, form-a-permanent):
const UserID     = req.user.id;
const UserName   = req.user.name;
const Department = req.user.department;

// WRONG (รับจาก client — ปลอมแปลงได้):
const { UserID, UserName } = req.body;
```

`req.user` มี fields: `{ id, name, department, role, team }`

## Admin Hub (System Console) — 9 Tabs

`public/js/pages/admin.js` มี 9 tabs:

2026-05-26 System Console Phase A layout shell:

- `public/js/pages/admin.js` now uses `admin-console-shell`, `admin-console-hero`, and `admin-console-content` so System Console can use the full module workspace width instead of being constrained to `max-w-7xl`.
- The change is intentionally shell-only: no admin tab logic, API calls, backend routes, or database schema were changed.
- `public/style.css` defines the additive admin shell classes; existing tab internals and shared design-system primitives remain untouched.
- Phase B responsive tab bar:
  - System Console tabs now use `admin-console-tabs` and `admin-console-tab` classes instead of the old thin underline-only layout.
  - Desktop tabs spread across the full command bar; mobile/tablet keeps horizontal scrolling.
  - The tab IDs and `window._adminTab(key)` click flow are unchanged.
- Phase C Admin Dashboard density:
  - Dashboard tab now starts with a denser command center: total action-signal count, readiness status, severity breakdown, and quick links to Employee Master, System Health, Audit Log, and Permissions.
  - Operational snapshot now has a section header, direct shortcuts to key admin tabs, a wider KPI grid, and a wider department/audit split for desktop.
  - This phase remains frontend-only and uses the existing `/api/admin/dashboard-stats` response.
- Phase D Employee Master / Reference density:
  - Reference Data uses wider responsive grids, a desktop-friendly filter bar, taller master-list panels, wider area tiles, and a minimum table width to keep columns readable.
  - Employee Master now has a compact toolbar summary for employees, filtered rows, email review issues, admin accounts, and profile gaps.
  - Employee Master search/actions expand better on desktop, and the employee table has a minimum width so email/readiness/role columns do not collapse.
  - This phase remains frontend-only and does not change admin APIs or schema.
- Phase E System Health / Audit polish:
  - System Health now starts with a System Assurance header and quick links to Audit Log, Dashboard, and Employee Master.
  - Audit Log now starts with an Audit Trail header, quick actions for Failed Only, Export CSV, and System Health, plus a wider desktop filter grid.
  - Audit summary grid and audit table width were adjusted for desktop readability; path/detail columns have more room before truncation.
  - This phase remains frontend-only and does not change admin APIs or schema.
- Post-closeout refinements:
  - System Health readiness signals are now clickable drilldowns: failed API/missing table signals open Audit Log with Failed Only preset, employee master signals open Employee Master, stale 4M opens 4M, and stale Hiyari opens Hiyari.
  - Audit Log now has quick presets for Today, Last 7 days, Employee changes, and Failed Only while keeping the existing filters and CSV export.
  - 2026-06-02 Activity Targets Phase AT-1 + AT-2: System Console > Activity Targets now shows admin guidance for yearly target/pass percentage examples (`12/year + 80%`, `4/year + 100%`, `1/year + 100%`, and `N/A`) plus a Coverage Summary for position templates. Coverage uses existing `GET /api/activity-targets/position-templates` data to show configured slots, N/A slots, missing slots, zero-target slots, positions needing review, and activity-level coverage. This phase is frontend-only; it does not add Department/Unit override yet and does not change API, uploads, or MySQL schema.
  - 2026-06-02 Activity Targets Phase AT-3: Department/Unit Override added. New priority is `Employee Override > Department/Unit Override > Position Template`. PHP production and Node dev now support `GET/PUT /api/activity-targets/scope-overrides`; PHP creates lowercase `activity_scope_overrides` with unique `(Department, Unit, ActivityKey)`. The Activity Targets admin tab now has a third sub-tab for department-wide or unit-specific targets. `/activity-targets/employee/:empId` and `/activity-targets/me` now merge scope overrides and return `source: "scope"` when applicable. No upload storage change.
    - Verification: PHP lint passed for `api/handlers/targets.php`; JS syntax passed for `public/js/pages/admin.js`, `backend/routes/activity-targets.js`, and `backend/scripts/uat-preflight.js`; `npm --prefix backend test` passed with UAT preflight expanded to 91/91 read/permission surfaces including `GET /api/activity-targets/scope-overrides`.
    - Production smoke: deployed `api/handlers/targets.php` and `public/js/pages/admin.js`, then used temporary marker `AT3*/CODX_AT3_DEPT_*` to seed one employee, create department-wide and unit-specific `ky` scope overrides, verify `/activity-targets/employee/:empId`, `/activity-targets/me`, employee override priority, fallback from employee override to unit scope, and fallback from unit scope to department scope. Cleanup verified temporary employee, scope rows, and employee override rows all returned 0. The one-time smoke helper was deleted from production and confirmed 404.
  - 2026-06-02 Activity Targets Phase AT-4 + AT-5: Coverage Matrix and system integration review completed locally. PHP production and Node dev now support Admin-only `GET /api/activity-targets/coverage-matrix`, resolving every employee/activity slot through `Employee Override > Department/Unit Override > Position Template`. The matrix reports `Employee Override`, `Department/Unit Override`, `Position Template`, `Missing`, `N/A`, and zero target distinctly; the System Console matrix sub-tab adds Department, Unit, Position, Activity, Source, and Review-needed filters plus click-through into the matching editor.
    - Dashboard My Targets now displays the effective source. Person Search / Safety 360 now receives and renders effective targets with target, actual, completion percentage, pass status, and source. Department x Module Compliance adds a Targets column with hover detail for missing, zero, N/A, scope, employee, and template rows. Admin readiness now counts unresolved employee/activity slots after scope-aware merging instead of checking only for missing position templates.
    - Local verification passed: PHP lint for `api/index.php`, `api/handlers/targets.php`, `api/handlers/people.php`, and `api/handlers/admin_phase8.php`; Node/browser syntax checks for changed JS files; `git diff --check`; and `npm --prefix backend test` with UAT preflight expanded to 93/93 including Admin 200 and User 403 checks for `/activity-targets/coverage-matrix`.
    - Production deployment and read-only smoke passed: uploaded `api/index.php`, `api/handlers/targets.php`, `api/handlers/people.php`, `api/handlers/admin_phase8.php`, `public/js/pages/admin.js`, `public/js/pages/dashboard.js`, and `public/js/pages/search.js`. Verified public branding 200; Admin matrix 200; User matrix guard 403; dashboard overview 200 with Targets column; `/activity-targets/me` 200; person search 200; and Admin dashboard readiness 200. Matrix summary returned 2,292 employees / 20,628 slots. Existing employee `008744` verified `patrol` merged from Employee Override with target 20, and Safety 360 returned the matching effective target source. No temporary production rows or files were created, so cleanup was not required.
  - 2026-06-02 Activity Targets Phase AT-6 KPI Definition Foundation completed locally. Node dev and PHP shared-hosting definitions now attach backward-compatible metadata to all 9 activities: `metricType`, `scopeType`, `unitLabel`, and `targetMode`. KPI types are `fixed_count` for Safety Patrol and KY; `dynamic_ratio` for Patrol Issues and Yokoten; and `people_coverage` for CCCF Worker/Permanent, OJT SCW, Safety Training, and Hiyari. The metadata is returned by `/api/activity-targets/activities`, `/activity-targets/employee/:empId`, `/activity-targets/me`, and the Admin coverage matrix without removing any existing response fields. No MySQL schema or upload-storage change.
    - System Console > Activity Targets now explains the three KPI types instead of describing every target as a record count. The guide, coverage summary, coverage matrix, Position Template editor, Department/Unit editor, and employee editor display metric-type badges with units. Existing editor inputs and calculators intentionally remain unchanged in AT-6 so saved targets continue to behave as before.
    - Local verification passed: `node --check` for `backend/routes/activity-targets.js` and `public/js/pages/admin.js`; PHP lint for `api/handlers/targets.php`; focused AT-6 static metadata parity assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Activity Targets Phase AT-7 Admin Target Editor UX completed locally. Dynamic-ratio rows for Patrol Issues and Yokoten now show `ระบบคำนวณ` with formula previews (`ปิดแล้ว / ประเด็นรับผิดชอบ` and `ตอบแล้ว / หัวข้อที่มอบหมาย`) instead of a manual yearly-target input in Position Template, Department/Unit, and employee editors. Fixed Count and People Coverage rows retain numeric inputs with activity-specific units. Saving a dynamic ratio stores a compatibility sentinel internally (`YearlyTarget=1`) through both Node and PHP guards, so old/direct clients cannot persist misleading manual denominator values.
    - Position-template coverage and the Admin employee coverage matrix now treat Dynamic Ratio as configured by the system without requiring fake yearly counts. The matrix adds `System Ratio` source rows, a System summary count, dynamic target display text, and click-through from a system row into its Department scope editor. Dynamic Ratio is temporarily omitted from personal `/activity-targets/me` widgets until AT-8 provides department-level calculators, avoiding misleading personal `0/1` cards.
    - Cache bust advanced for the AT-7 deploy bundle: `index.html` now loads `public/js/main.js?v=20260602-activity-targets-at7`; `main.js` imports `admin.js?v=20260602-activity-targets-at7`; and the stale HTML CSS reference was aligned to the already-implemented Mobile Navigation M5.3 stylesheet version `v=20260602-mobile-nav-m53`.
    - Local verification passed: `node --check` for `backend/routes/activity-targets.js`, `public/js/pages/admin.js`, and `public/js/main.js`; PHP lint for `api/handlers/targets.php`; focused AT-7 static contract assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`.
    - Next recommended phase: deploy AT-6 + AT-7 (`index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `api/handlers/targets.php`, and `CLAUDE.md`) with authenticated production read smoke and a temporary dynamic-ratio normalization mutation smoke, then implement AT-8 calculators for Department Patrol Issue closure and assigned-topic Yokoten completion.
  - 2026-06-02 Activity Targets Phase AT-8 Dynamic Ratio Calculators completed locally. Node dev and PHP shared-hosting now calculate Department KPI ratios for Patrol Issues (`closed issues / responsible issues`) and Yokoten (`responded assigned topics / assigned topics`). A Yokoten topic with empty `TargetDepts` remains assigned to all departments; otherwise only explicitly targeted departments receive it. Both calculators return `noData: true` with a null completion percentage when there is no valid denominator, rather than treating missing source data as a failed KPI.
    - Dynamic Ratio rows returned to `/api/activity-targets/me` with `source: "system"`, the calculated numerator/denominator, and department calculation scope. Safety 360 uses the viewed employee's department for the same ratios. Dashboard My Targets, compact module widgets, and Safety 360 now label these rows as Department KPI / System Ratio and render no-data separately from failed status. The dashboard overall percentage excludes no-data rows and displays `-` when no KPI row is evaluable.
    - Cache bust advanced to `v=20260602-activity-targets-at8` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local verification passed: `node --check` for the changed backend/frontend JS files; PHP lint for `api/handlers/targets.php` and `api/handlers/people.php`; focused AT-8 static contract assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`. A committed local mutation smoke created isolated temporary rows and verified Patrol Issues `1/2 = 50%` plus Yokoten `1/2 = 50%`; cleanup verification returned zero temporary rows.
    - Next recommended phase: deploy AT-6 + AT-7 + AT-8 with authenticated production read smoke and isolated temporary Dynamic Ratio mutation smoke, verify cleanup, then implement AT-9 People Coverage Calculators.
  - 2026-06-02 Activity Targets Phase AT-6 + AT-7 + AT-8 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. The previous Production files were downloaded first to `backups/production/at8-code-20260602-160354/`.
    - Production verification passed: cache-busted HTML and `main.js` contain `v=20260602-activity-targets-at8`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`.
    - Isolated Production Dynamic Ratio mutation smoke passed after accounting for the Production-required `yokotenresponses.EmployeeID`: Patrol Issues `1/2 = 50%`, Yokoten `1/2 = 50%`, then rollback cleanup returned `patrolIssues=0`, `yokotenTopics=0`, and `yokotenResponses=0`. Temporary root helper `codx_at8_ratio_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-02 Activity Targets Phase AT-9 People Coverage Calculators completed locally. People Coverage KPIs now use effective Admin-configured yearly targets as denominators while calculating scope-level actual people: CCCF Worker counts distinct Form A worker submitters by Department/Unit; CCCF Permanent counts distinct permanent assignees by Department/Unit where employee identity is available; OJT Stop-Call-Wait uses the Department attendee snapshot; Safety Training counts distinct passed employees by Department; and Hiyari Near-Miss counts distinct reporters by Department/Unit. This replaces misleading personal document counts in `/api/activity-targets/me` and Safety 360 while preserving the existing target priority `Employee Override > Department/Unit Override > Position Template`.
    - People Coverage responses include `calculationScope` and `calculationMethod` separately from the target `source`, so the UI can explain both where the configured target came from and whether the actual KPI is Department or Department/Unit scope. Dashboard My Targets, Safety 360, and compact module widgets now label Scope KPI values explicitly. A configured denominator of zero or an unavailable source table returns no-data instead of a failed KPI.
    - Cache bust advanced to `v=20260602-activity-targets-at9` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local Node and PHP transaction mutation smokes both passed for all five calculators with duplicated source records: CCCF Worker, CCCF Permanent, OJT SCW, Safety Training, and Hiyari each returned `2/4 = 50%`; rollback cleanup returned zero temporary rows across Hiyari, Training, OJT, CCCF Permanent, CCCF Worker, and Employees.
    - Next recommended phase: deploy AT-9 with authenticated Production read smoke and isolated People Coverage mutation smoke, verify cleanup, then implement AT-10 KY / Patrol fixed-count alignment.
  - 2026-06-02 Activity Targets Phase AT-9 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. The previous Production files were downloaded first to `backups/production/at9-code-20260602-162014/`.
    - Production verification passed: cache-busted HTML and `main.js` contain `v=20260602-activity-targets-at9`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`.
    - Isolated Production People Coverage mutation smoke passed: CCCF Worker, CCCF Permanent, OJT SCW, Safety Training, and Hiyari each returned `2/4 = 50%` with duplicate source rows where relevant. Rollback cleanup returned `0` across Hiyari, Training, OJT, CCCF Permanent, CCCF Worker, and Employees. Temporary root helper `codx_at9_coverage_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-02 Activity Targets Phase AT-10 KY / Patrol Fixed-count Alignment completed locally. Safety Patrol now counts personal `patrol_attendance + patrol_self_checkin` records for the selected year and prefers `patrol_roster.TargetPerYear` as its effective target, falling back to the generic Activity Target when no roster target exists. KY Activity now counts `ky_activities` at Department or configured Safety Unit scope and prefers active `ky_program_config.YearlyTarget`, falling back to the generic Activity Target when module config is absent.
    - `/api/activity-targets/me` and Safety 360 receive the same aligned calculations with `calculationScope`, `calculationMethod`, and `targetSource`. When a KPI is surfaced solely by Patrol roster or KY program config, the response uses `source: "module"` instead of pretending it came from a Position Template. Dashboard and Safety 360 distinguish `Personal KPI · Patrol Roster` from `Scope KPI · KY Program Config`; compact widgets retain personal vs Department/Unit scope labels. Module-level Patrol roster and KY config targets can surface a KPI even when no generic target was configured.
    - Cache bust advanced to `v=20260602-activity-targets-at10` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local Node and PHP transaction mutation smokes both passed: Patrol attendance `1` + self-checkin `1` used roster target `4` and returned `2/4 = 50%`; KY Safety Unit activities `2` used program-config target `4` and returned `2/4 = 50%`. Cleanup returned zero temporary rows across KY activities/config, Patrol attendance/self-checkin/roster, and Employees.
    - Next recommended phase: deploy AT-10 with authenticated Production read smoke and isolated Patrol/KY alignment mutation smoke, verify cleanup, then implement AT-11 Dashboard / Safety 360 integration review.
  - 2026-06-04 Activity Targets Phase AT-10 deployed to Production. Uploaded and FTP SHA-256 verified the AT-10 bundle: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. Production backup was created at `backups/production/at10-code-20260604-075506/`.
    - Production read smoke passed after a patch to `api/handlers/targets.php`: cache-busted `index.html` and `main.js` contain `v=20260602-activity-targets-at10`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`. The patch moved the AT-10 fixed-count alignment block out of `activity_target_coverage_matrix_data()` and into `/activity-targets/me`, fixing an initial Production `coverage-matrix` 500 caused by an undefined `$merged`.
    - Isolated Production Patrol/KY alignment mutation smoke passed through a temporary API route: Patrol returned `2/4 = 50%` from attendance + self-checkin using `patrol_roster`; KY returned `2/4 = 50%` using `ky_program_config` with Department/Unit scope. Transaction rollback cleanup returned `0` for KY activities/config, Patrol self-checkin/attendance/roster, and Employees. The temporary route restored `api/index.php` with SHA-256 verification, and `codx_at10_alignment_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-04 Activity Targets Phase AT-11 Dashboard / Safety 360 integration review completed locally. Safety 360 and Person Search now return `activityTargetSummary.configured`, `evaluable`, `passed`, and `noData`, so no-data rows no longer inflate the visible passed denominator. Dashboard My Activity Targets now also excludes `passed=null` rows from its denominator and shows the no-data count in the year line.
    - Files changed for AT-11: `backend/routes/person-search.js`, `api/handlers/people.php`, `public/js/pages/search.js`, and `public/js/pages/dashboard.js`. No MySQL schema or upload-storage change.
    - Verification completed: `node --check backend/routes/person-search.js`, `node --check public/js/pages/search.js`, `node --check public/js/pages/dashboard.js`, `C:\xampp\php\php.exe -l api\handlers\people.php`, and `git diff --check` passed. `npm --prefix backend test` was attempted but local smoke failed before AT-11 assertions because MySQL/MariaDB was not running locally (`ECONNREFUSED`); no `mysql`/`mysqld` process was present.
    - Next recommended phase: deploy AT-11 to Production with authenticated read smoke for `/api/person-search/employees/:id` or an equivalent Safety 360 profile read, then begin AT-12 Activity Targets admin data-quality rollout (coverage matrix filters, missing/zero target cleanup guidance, and export/reporting for departments).
  - 2026-06-04 Activity Targets Phase AT-11 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `api/handlers/people.php`, and `CLAUDE.md`. Production backup was created at `backups/production/at11-code-20260604-081326/`. Cache bust advanced to `v=20260604-activity-targets-at11` for `main.js`, Dashboard, and Search.
    - Authenticated Production Safety 360 read smoke passed: cache-busted `index.html` and `main.js` contain the AT-11 marker; short-lived Admin JWT `POST /api/session/verify` passed; `/api/person-search/employees?limit=5` returned a sample employee; `/api/person-search/profile/AP0123?year=2026` returned `activityTargetSummary` with `configured`, `evaluable`, `passed`, and `noData`. The summary matched the returned rows exactly: `configured=4`, `evaluable=2`, `passed=0`, `noData=2`.
  - 2026-06-04 Activity Targets Phase AT-12 Admin Data-quality Rollout completed locally. System Console > Activity Targets > Coverage Matrix now has an AT-12 Data Quality Queue above the table, an Issue Type filter (`review`, `missing`, `zero`, `N/A`), quick filters for Review queue/Missing/Zero, top review departments, top review activities, and an export-current-view action. Export uses SheetJS when available and falls back to CSV, with columns for employee, department/unit, position, activity, metric type, source, issue, target, unit, and pass percentage.
    - Files changed for AT-12: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-activity-targets-at12` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions, and `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy AT-12 to Production with authenticated Admin Coverage Matrix read smoke, verify AT-12 marker in `main.js`, and optionally export a filtered review queue from the browser.
  - 2026-06-04 Activity Targets Phase AT-12 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/at12-code-20260604-082030/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-activity-targets-at12`; `public/js/pages/admin.js` contains `AT-12 Data Quality Queue`, `_atMatrixQuick`, and `_atMatrixExport`.
    - Authenticated Admin Coverage Matrix read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/activity-targets/coverage-matrix?year=2026` returned `20,628` rows and summary `employees=2,292`, `review=15,866`, `missing=15,866`, `zero=0`. Smoke recalculated review/missing/zero from returned rows and matched the summary exactly.
    - Next recommended phase: Phase AT-13 can focus on guided cleanup workflows, such as bulk template suggestions for repeated missing position/activity pairs, department owner export packs, or optional save-from-quality-queue actions.
  - 2026-06-04 Activity Targets Phase AT-13 Guided Cleanup Workflows completed locally. System Console > Activity Targets > Coverage Matrix now groups repeated missing `Position + Activity` pairs into Guided Cleanup Suggestions, ranked by impacted employees and showing impacted department counts. Each suggestion opens the Position Template editor for that position, highlights the suggested activity row, and scrolls it into view so Admin can set the missing template without manually searching the 20k-row matrix.
    - Files changed for AT-13: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-activity-targets-at13` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions for Guided Cleanup Suggestions and AT-13 cache bust, and `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy AT-13 to Production with marker verification and authenticated Admin Coverage Matrix read smoke, then browser-check one Guided Cleanup suggestion opens/highlights the expected Position Template row.
  - 2026-06-04 Activity Targets Phase AT-13 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/at13-code-20260604-082724/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-activity-targets-at13`; `public/js/pages/admin.js` contains `Guided Cleanup Suggestions`, `_atGuideTemplate`, `_atMissingTemplateSuggestions`, and `at-template-row`.
    - Authenticated Admin Coverage Matrix read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/activity-targets/coverage-matrix?year=2026` returned `20,628` rows and summary `employees=2,292`, `review=15,866`, `missing=15,866`, `zero=0`. Smoke recalculated review/missing/zero from returned rows and matched the summary exactly.
    - Next recommended phase: browser-check one Guided Cleanup suggestion opens/highlights the expected Position Template row, then continue AT-14 if needed with save-from-quality-queue actions or department owner export packs.
  - 2026-06-04 System Console Employee Master filters completed locally. The Employee Master toolbar now includes Department and Unit dropdown filters generated from current employee data, a clear-filters action, and the table search now also searches Unit. Selecting a Department refreshes the Unit list to only units used by employees in that department. The table now displays a Unit column, filtered counts update in the toolbar summary, and Employee Excel export exports the currently filtered rows instead of always exporting the full employee cache.
    - Files changed: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-employee-master-filters` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions for `emp-dept-filter`, `emp-unit-filter`, `_empFilteredRows`, and `v=20260604-employee-master-filters`, plus `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy Employee Master filters to Production with marker verification and authenticated Admin employees read smoke.
  - 2026-06-04 System Console Employee Master filters deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/employee-master-filters-20260604-090226/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-employee-master-filters`; `public/js/pages/admin.js` contains `emp-dept-filter`, `emp-unit-filter`, `_empFilteredRows`, `_empDepartmentFilter`, and `_empClearFilters`.
    - Authenticated Admin employees read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/employees` returned `2,293` rows, `41` unique departments, `0` non-empty units in current production employee data, sample `AP0123`. The Unit filter UI is still present and will populate once Employee Master rows contain Unit values.
  - 2026-06-02 Branding logo overflow production fix: production had the newer branding JavaScript but an older `public/style.css` without `.brand-logo-sm` and `.brand-logo img`, so a newly selected logo could render at its original image dimensions and cover the sidebar/content area. Added strict 32 x 32 px wrapper bounds and image max bounds in CSS, added inline JavaScript bounds as a stale-CSS fallback, and cache-busted the CSS/main module references in `index.html` with `v=20260602-brand-logo-bounds`.
    - Verification: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, production HTML/CSS/JS response checks, and public/settings branding read smoke passed. Production currently has no persisted `app_branding` value (`/settings/app_branding` returns `null`), so no old branding row or uploaded-logo cleanup was required.
  - 2026-06-02 Branding Login synchronization fix: connected the desktop Login hero to the same public branding data already used by Sidebar and mobile Login header. Desktop Login now renders the saved logo in a bounded 40 x 40 px wrapper, replaces the hero app name and tagline from `app_branding`, and synchronizes the Login footer tagline. Corporate identity text `Thai Summit Harness Co., Ltd.` remains static. `applyAppBranding()` now supports bounded per-element logo sizes through `data-brand-size`, defaults unchanged elements to 32 px, and synchronizes browser title plus iOS web-app title.
    - Cache bust updated to `v=20260602-brand-login-sync` for `public/style.css` and `public/js/main.js`. Local verification passed: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, static Login-branding contract assertions, and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Branding Login split: System Console > Branding now separates compact Sidebar/Mobile header/browser-title text from the desktop Login hero text. `app_branding.appName` and `app_branding.tagline` remain the backward-compatible Sidebar/Header fields, while optional `loginHeroTitle` and `loginHeroSubtitle` drive the desktop Login hero and fall back to `appName/tagline` when blank. The logo remains shared across all placements. PHP shared-hosting and Node dev public branding endpoints now include the two optional Login fields. No MySQL schema or upload-storage change.
    - Deployed to production via FTP root `/tsh-safety-core/`: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `api/index.php`, and `CLAUDE.md`. Cache bust updated to `v=20260602-brand-login-split`; `public/js/main.js` now imports `admin.js?v=20260602-brand-login-split`.
    - Verification passed: `node --check public/js/main.js`, `node --check public/js/pages/admin.js`, `node --check backend/server.js`, `C:\xampp\php\php.exe -l api\index.php`, `git diff --check -- index.html public/js/main.js public/js/pages/admin.js backend/server.js CLAUDE.md`, static Branding contract smoke, and `npm --prefix backend test` with UAT preflight `93/93`.
    - Production smoke passed: `GET /api/public/branding` returned 200 with `appName`, `tagline`, `loginHeroTitle`, `loginHeroSubtitle`, and `logoUrl`; production HTML references `v=20260602-brand-login-split` and desktop Login selectors; production `main.js` and `admin.js` contain the split Branding logic/fields. Current production values still have empty `loginHeroTitle/loginHeroSubtitle`, so Login falls back to `TSH SCA` / `TSH Safety Core Activity` until an Admin saves the desired long Login text from System Console > Branding. A temporary unauthenticated PHP setter was uploaded but was not executed after security review rejected the DB write; it was deleted immediately and verified 404.
    - Follow-up encoding fix: `public/js/pages/admin.js` was recovered from mojibake back to valid UTF-8 Thai text without BOM after the Branding split deploy. Cache bust updated again to `v=20260602-brand-login-split-utf8` for `index.html` and the `main.js` import of `admin.js`. Post-fix scan confirmed `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md` have Thai Unicode text, zero mojibake markers, zero replacement characters, and no BOM.
  - 2026-06-02 Committee Sub-Committees member summary: the Committee module now adds a compact member summary directly above the Sub-Committees card grid. It shows total members across all sub-committees, a breakdown by position, and a breakdown by department/unit label. The summary uses existing `SubCommitteeData.positions[].count`, falling back to legacy `memberCount` when needed, so this is frontend-only with no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-sub-member-summary` for `index.html` and the `main.js` import of `committee.js`.
  - 2026-06-02 Committee Sub-Committees grouping: Sub-Committees are now sorted alphabetically by Department/Section then Safety Unit across the current card, timeline, export, print, copy, edit modal, and saved payload. The Sub-Committees display now groups cards by Department/Section, with Safety Unit cards inside each group. The member summary was expanded to separate breakdowns by position, Department/Section, and Safety Unit. The committee add/edit modal is wider on desktop (`max-w-6xl`) and the Sub-Committee editor list gets a taller scroll area. Frontend-only; no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-subcommittee-groups` for `index.html` and the `main.js` import of `committee.js`.
  - 2026-06-02 Committee Section-count refinement: the Sub-Committee count now uses distinct Department/Section count instead of raw Safety Unit item count in the current hero card, top current summary, timeline, export, print, and copy text. If a Sub-Committee has no selected Safety Unit, the card title and edit-form row fall back to the Department/Section name instead of showing an unprofessional unspecified label. The Department/Section group header no longer shows the raw Safety Unit count badge, and the member summary no longer includes a separate Safety Unit breakdown card; it keeps total members, by-position, and by-Department/Section only. Frontend-only; no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-section-counts`.
  - 2026-06-02 KPI Announcement CRUD production fix: KPI & Metrics announcement management now has a real edit action in the announcement manager and uses the shared-hosting-safe alias endpoint `/api/kpiannouncements/item?id=...` for edit, set-active, and delete so Apache/ModSecurity does not block `KPI-YYYY` IDs embedded in the URL path. The original `/api/kpiannouncements/:id` PHP routes remain for compatibility. Delete still protects announcements that have linked KPI rows and returns a Thai 409 message. No MySQL schema or upload-storage change. Cache bust updated to `v=20260602-kpi-announcement-crud` for `index.html` and the `main.js` import of `kpi.js`.
  - 2026-06-02 Accident Monthly Evidence: Accident > Safety KPI Board now requires a monthly Accident Report file to treat a month as complete. PHP shared-hosting schema guard creates `accident_monthly_reports` (`Year`, `MonthNo`, `Status`, report file metadata, notes, upload/update audit) with a unique key on `Year + MonthNo`. New endpoints: `GET /api/accident/monthly-reports?year=`, `POST /api/accident/monthly-reports` with multipart field `reportFile`, and `DELETE /api/accident/monthly-reports/:id`. Saving a monthly report also syncs `accident_performance.MonthlyStatus`, and `GET /api/accident/performance` now returns `monthlyReports`. KPI & Metrics shows a read-only Accident Report Monthly evidence strip for the selected year with a shortcut to Accident Board. Cache bust updated to `v=20260602-accident-monthly-evidence` for `index.html`, `accident.js`, and `kpi.js`.
  - 2026-06-02 Login first-use hint: added a compact emerald information panel directly below the Login password field and above `#login-error`. It tells new users that their initial password is the same as their employee ID and includes `012609` as an example. This is guidance-only: authentication flow, schema, and password lifecycle remain unchanged. A future security hardening phase should add a persisted must-change-password flag and force a password update after first login.
    - Verification: `git diff --check -- index.html CLAUDE.md`, DOM marker/order assertion for `#first-login-hint`, and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Mobile Navigation Phase M5.1: retained the mobile Bottom Tab Bar for thumb-friendly frequent actions and retained the Sidebar Drawer as the complete module menu. Consolidated Bottom Bar height, iPhone safe area, and content clearance into shared CSS variables. `#main-content` now reserves `Bottom Bar + safe area + 16px`, adds matching `scroll-padding-bottom`, and contains overscroll so the last row/button can be moved above the fixed bar.
    - Sidebar Drawer behavior is now explicit on mobile: Drawer z-index sits above the backdrop and Bottom Bar, opening the Drawer locks background scroll and hides the Bottom Bar temporarily, while closing restores the bar. Drawer closes through backdrop click, menu navigation, route changes, viewport transition to desktop, and the `Escape` key. Route changes now reset the actual `#main-content` scroll container as well as `window`.
    - Cache bust updated to `v=20260602-mobile-nav-m51` for `public/style.css` and `public/js/main.js`. Local verification passed: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, static CSS/JS contract assertions, and `npm --prefix backend test` with UAT preflight `93/93`. Browser-headless computed viewport automation could not return localhost DOM in this Windows environment; complete physical-device viewport UAT remains required after deploy.
  - 2026-06-02 Mobile Navigation Phase M5.2: added shared visual viewport tracking for mobile keyboards and modal forms. The browser now updates `--app-visual-viewport-height` and `--app-visual-viewport-offset-top` from `window.visualViewport`; focused text/select/textarea/contenteditable controls scroll into view after the keyboard settles. Bottom Tab Bar hides while a mobile keyboard or modal is active so it cannot cover form actions.
    - Mobile modal layout now follows the visible viewport instead of static `90vh`, anchors to the usable bottom edge, contains modal-body overscroll, and applies safe-area-aware form padding. Opening a shared modal locks the background content; closing restores the Bottom Bar and returns focus to the previous control. Mobile toast notifications now respect top safe area, fill the available width, wrap long messages, and cap overflow to the visible viewport.
    - Cache bust updated to `v=20260602-mobile-nav-m52` for `public/style.css`, `public/js/main.js`, and every frontend import of `public/js/ui.js` so all modules share one fresh UI-helper instance. Local verification passed: `node --check` for `public/js/main.js`, `public/js/ui.js`, and every `public/js/pages/*.js` module; `git diff --check -- index.html public/js/main.js public/js/ui.js public/js/pages public/style.css CLAUDE.md`; static CSS/JS contract assertions; and `npm --prefix backend test` with UAT preflight `93/93`. Complete physical-device viewport and software-keyboard UAT remains required after deploy.
  - 2026-06-02 Mobile Navigation Phase M5.3: hardened the mobile shell for iPhone Safari, Android Chrome, and installed PWA mode. The viewport meta now includes `viewport-fit=cover`; horizontal safe-area padding is applied to the Bottom Tab Bar and mobile header; iOS WebKit and standalone mode use the tracked visual viewport height instead of trusting a potentially stale `100dvh`. The PWA manifest no longer locks portrait orientation, allowing phone and tablet landscape use.
    - Visual viewport recovery now settles immediately, on the next animation frame, and after 320 ms. It also reruns after resize, orientation change, `pageshow`, visibility restore, focus changes, and visual viewport movement. Bottom Tab Bar hides whenever an editable control has focus on a mobile layout, avoiding Android browser differences in how keyboard height changes are reported. Installed-mode detection supports both CSS display mode and iOS `navigator.standalone`.
    - The standalone document viewer now locks background scrolling, hides Bottom Tab Bar, and applies safe-area padding while open. Cache bust advanced to `v=20260602-mobile-nav-m53` for CSS, main entry, service-worker registration/version, all `main.js` page-module imports, and every page import of `ui.js`, ensuring a single fresh frontend dependency graph after deploy.
    - Local verification passed: manifest JSON parse; `node --check` for `public/js/main.js`, `public/js/ui.js`, and every `public/js/pages/*.js` module; `git diff --check -- index.html sw.js public/manifest.webmanifest public/style.css public/js/main.js public/js/ui.js public/js/pages CLAUDE.md`; static compatibility assertions; and `npm --prefix backend test` with UAT preflight `93/93`. Physical-device testing on Safari iOS, Chrome Android, and installed standalone mode remains required after deploy.

| Tab | Key | Description |
|-----|-----|-------------|
| ภาพรวม | `dashboard` | KPI stat cards, dept chart, recent audit feed |
| กำหนดการตรวจ | `scheduler` | Patrol session scheduling (single + bulk by date range/weekday) |
| ข้อมูลพนักงาน | `employees` | Employee CRUD + bulk Excel import + pagination 25/page |
| ข้อมูลอ้างอิง | `reference` | Departments, Teams, Positions, Roles, Areas (Patrol_Areas) — add/edit/delete |
| สิทธิ์การใช้งาน | `permissions` | Permission matrix per role — Admin/User/Viewer |
| System Health | `health` | Module record counts, stale alert tables, readiness score, failed API 24h, audit activity 24h |
| Audit Log | `audit` | Admin-only audit trail for API mutations, summary strip, filterable by module/action/date/search |
| Branding | `branding` | App name/tagline + logo upload/reset stored in `App_Settings.app_branding` |
| เป้าหมายกิจกรรม | `targets` | Activity Targets — Coverage Matrix + เทมเพลตตามตำแหน่ง + ตามแผนก/หน่วยงาน + กำหนดรายบุคคล |

State: `_currentTab`, `_calInst`, `_empCache`, `_deptCache`, `_teamCache`, `_empSearch`, `_empPage`, `_auditPage`, `_atActivities`, `_atPositions`, `_atSubTab`, `_atSelPosition`, `_atSelEmp`, `_atEmpTargets`

Navigation: `#employee` hash redirects → `#admin` + auto-switches to employees tab via `window._adminTab?.('employees')`

**Permission Matrix** (`permissions` tab): เรียก `GET /api/admin/permissions/matrix` → ได้ `{ matrix, roles, permissions, roleLabels }` — ใช้ `PUT /api/admin/permissions/matrix` กับ `{ role, permission, granted }` เพื่อ toggle สิทธิ์แต่ละคู่

### Admin Dashboard UX

`GET /api/admin/dashboard-stats` now returns:

- `actionRequired` — cross-module admin work queue for stale Patrol issues, 4M Change Notices, Hiyari reports, expired training, pending Yokoten, incomplete employee profiles, missing activity target templates, and failed API actions.
- `uxHealth` — readiness score derived from open high/medium/low admin risks.

`public/js/pages/admin.js` renders these above the KPI cards as the first Phase 1 UX improvement: the Admin Dashboard now acts as a command center before showing passive stats.

### Phase 1 UX Foundation Progress

- `public/js/pages/admin.js` — Admin Dashboard has Action Required + UX Health above passive KPIs.
- `public/js/pages/patrol.js` — Safety Patrol no longer renders the duplicate work focus strip; today check-in, issue counts, and next patrol signals live in the hero stats, check-in card, tabs, and issue dashboard.
- `public/js/pages/patrol.js` — Safety Patrol Issue `VIEW` mode now shows a read-first summary block for status, rank, overdue state, dates, owner, reporter, and finish date before the detailed form sections.
- `public/js/pages/patrol.js` — Patrol issue forms validate required fields client-side before submit, preserve Issues tab/search/status/dept/unit/area/rank/stop filters across reloads, block duplicate submits/deletes in long workflows, and show clearer empty states plus image filename/thumbnail previews.
- `backend/routes/patrol.js` — Patrol issue create/temp-fix/close/update/delete and admin add/delete attendance/self-patrol writes audit logs; Patrol routes now validate year/month inputs before querying and avoid exposing technical DB errors to users.
- `public/js/pages/fourm.js` — Change Notice tab has focus shortcuts for Open, Pending, and Overdue notices.
- `public/js/pages/search.js` — Employee Safety 360 has standardized empty/error states for search results, profile load, Patrol records, and activity timeline.
- `public/js/ui.js` — added `openDetailModal()` as an additive helper for standardized detail modals without changing existing `openModal()` behavior.
- `public/js/pages/fourm.js` — Change Notice detail now uses `openDetailModal()` as the first low-risk standardized detail modal.
- `public/js/pages/admin.js` — Audit Log table has a read-only Detail action using `openDetailModal()` to inspect path, target, status, IP/user-agent, and safe metadata.

### Phase 2 Form UX Standardization Progress

- `public/js/pages/ky.js` — KY detail view now uses the shared `openDetailModal()` wrapper and adds a read-first summary grid for status, risk, date, and participant count before the detailed fields.
- `public/js/pages/ky.js` — KY detail text fields and participant chips are escaped before rendering to reduce display/XSS risk from user-entered content.
- `public/js/pages/hiyari.js` — Hiyari detail view now uses the shared `openDetailModal()` wrapper and adds a read-first summary grid for status, Stop Type, Rank, and report date while keeping attachments and the Yokoten conversion shortcut intact.
- `public/js/pages/yokoten.js` — Yokoten topic detail and employee breakdown now use `openDetailModal()` with read-first summary grids for risk/response/deadline and completion/waiting/review counts.
- `public/js/pages/accident.js` — Accident reports table now has a read-only Detail action for all viewers; the detail modal uses `openDetailModal()` with incident type, severity, lost days, due date, root cause, action owner, and attachments while preserving admin-only edit/delete controls.
- `public/js/pages/accident.js` — Safety KPI Board now includes an executive summary strip for board status, days/hours target progress, safe months, accident months, and pending monthly status before the large KPI cards.
- `public/js/pages/ojt.js` — OJT department history now shows a read-first summary grid for current review status, latest OJT date, next review date, total attendees, and review interval before the history table.
- `public/js/pages/training.js` — Training department records now show a read-first summary strip for record count, total employees, passed count, average compliance, low-compliance departments, and no-data records before the records table.
- `public/js/pages/machine-safety.js` — Machine Safety now includes an enterprise summary strip for audit risk, high/critical risk machines, inspection due/overdue, risk assessment readiness, open issues, and restricted controls with quick filters.
- `public/js/pages/contractor.js` — Contractor dashboard duplicate summary strip was removed so the page starts directly with the useful breakdown/systems content.
- `public/js/pages/contractor.js` — Contractor UI now uses a more formal Document Control style: compact compliance header, Required Document Status panel, clearer category coverage, Recent Document Updates, Audit Trail wording, and cleaner document-library cards.
- `public/js/pages/contractor.js` / `backend/routes/contractor.js` — Contractor & Supplier E-Pass Online now supports `PartyType` for documents, an Accident Records tab, simple incident fields, multi-file evidence upload, and dashboard Zero External Accident YTD summary.
- `public/js/pages/contractor.js` — Documents tab supports Grid/List view switching; both modes preserve preview, download, edit, delete, filters, and pagination.
- `public/js/pages/contractor.js` — Dashboard Zero External Accident area is now a single bilingual target panel with balanced incident summary tiles instead of separate uneven cards.
- `public/js/pages/safety-culture.js` — Safety Culture dashboard now includes an enterprise summary strip for culture readiness, weak topics, PPE compliance, PPE violations, and executive PDF shortcut.
- `public/js/pages/committee.js` — Committee page keeps the cleaner core summary and current-committee hero only; the duplicate governance summary strip was removed after review.
- `public/js/pages/admin.js` — Employee master tab now includes an enterprise data-quality strip for missing core fields, department/position coverage, unit assignment, admin account count, and shortcuts to reference/permission controls.
- `public/js/pages/admin.js` — Reference / Master Data tab now includes a master-quality strip for master readiness, Safety Core unit coverage, duplicate master names, blank required names, loaded reference sets, and total master records.

- `public/js/pages/admin.js` — System Health now includes an enterprise readiness strip for pre-production readiness, failed API 24h, audit activity 24h, stale work, and missing/unreadable tables.
- `backend/routes/admin.js` — `GET /api/admin/system-health` now returns `readiness` and `audit` objects derived from module table availability, stale work queues, and Admin Audit Log activity.
- `public/js/pages/admin.js` — Audit Log now includes a summary strip for matched records, failures on current page, modules touched, active users, latest activity, and mutation count before the detailed table.

### Phase A UX Consistency Foundation

Phase A starts the enterprise design-system layer without breaking existing module screens.

- `public/style.css` now defines additive primitives: `ds-surface`, `ds-section`, `ds-filter-bar`, `ds-metric-card`, `ds-table-wrap`, `ds-table`, `ds-badge`, and `ds-empty-state`.
- `public/js/ui.js` exports reusable helpers: `statusTone()`, `statusBadge()`, `metricCard()`, and `emptyState()`.
- `public/js/pages/admin.js` uses the new primitives in Audit Log, Employee Master, Reference Master, and System Health as the reference implementation for filter bar, summary metrics, empty state, table, and status badges.
- `public/js/pages/fourm.js` now uses shared wrappers for dashboard cards, Change Notice filters/table, Man Record filters/table, status badges, and section cards.
- `public/js/pages/patrol.js` now uses shared table wrappers for the Safety Patrol issue register; filter scroll targets must support `.closest('.ds-table-wrap, .bg-white')` during the gradual migration.
- `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, and `public/js/pages/yokoten.js` started Phase A migration on high-traffic history/topic/admin tables and filters. Keep localized display labels separate from canonical status values when using `statusBadge(status, { label })`.
- `public/js/pages/training.js`, `public/js/pages/ojt.js`, and `public/js/pages/search.js` now use shared filter, section, metric, table, and status primitives on key records/compliance/search/profile surfaces.
- `public/js/pages/contractor.js`, `public/js/pages/accident.js`, `public/js/pages/machine-safety.js`, `public/js/pages/committee.js`, and `public/js/pages/safety-culture.js` started Phase A migration on key filter bars, summary metrics, report/list tables, and high-traffic section wrappers.
- Second pass began on `public/js/pages/dashboard.js`, `public/js/pages/kpi.js`, `public/js/pages/patrol.js`, and deeper Accident analytics/dashboard surfaces to replace legacy wrappers with shared sections, filter bars, and tables.
- Deep workflow pass continued on Hiyari submit wizard, KY manage/config/forms, Yokoten admin/employee completion surfaces, 4M dashboard chart/table sections, and Policy metric/current-policy surfaces.
- Latest lower-traffic pass moved Safety Culture PPE history/work-type/violation surfaces, KPI data tables, and Hiyari/KY/Yokoten dashboard card shells onto the shared primitives.
- Follow-up Phase A pass standardized Safety Culture skeleton/principle cards, KPI drilldown tables, and additional Hiyari/KY/Yokoten dashboard/executive-summary shells.
- Final Phase A sweep completed the remaining high-signal legacy card/table shells across Contractor, Policy, Admin Activity Target, Hiyari/KY/Yokoten management surfaces, 4M skeletons, and Safety Culture dashboard/empty/filter states. Remaining custom admin matrix/rotation tables intentionally keep their specialized layout classes.
- `statusBadge()` chooses tone from the canonical `status` argument, not the localized label. Current tone map includes `Reviewed`, `Temporary`, OJT terms `Valid/Due Soon/No Data`, and risk terms `Low/Medium/High/Critical`.
- Existing `.btn`, `.form-input`, `.form-select`, `.status-badge`, and legacy Tailwind-heavy screens remain supported while modules are migrated gradually.

Recommended migration order after Phase A:

1. Start Phase B with visual QA on desktop/tablet/mobile for the highest-use workflows: Safety Patrol, 4M, Hiyari, KY, Yokoten, Safety Culture, Training/OJT, and Person Search.
2. Then polish workflow-specific drawers/modals where screenshots show spacing or overflow issues.

### Enterprise UX Roadmap Status

Current roadmap after Phase A completion:

1. Phase 1: UX Foundation / จุดโฟกัสงานสำคัญ
   - Status: completed for Dashboard, Patrol, 4M, Person Search, shared detail modal, and Audit detail.
   - Follow-up: visual QA only; avoid changing working business logic unless QA finds a real issue.

2. Phase 2: Form UX Standardization / detail modal + summary ก่อนอ่านฟอร์ม
   - Status: completed across the main modules: KY, Hiyari, Yokoten, Accident, OJT, Training, Machine Safety, Contractor, Safety Culture, Committee, and Admin master/reference.
   - Follow-up: check long forms on tablet/mobile and polish spacing/overflow only where screenshots show problems.

3. Phase 3: Enterprise Admin Command Center / Overview + System Health + Audit
   - Status: completed for Admin dashboard action required, Overview controls, System Health readiness, Audit summary, and Audit Log.
   - Follow-up: use real admin data during UAT to confirm stale work, failed API, and audit counts are useful.

4. Phase 4: Permission / Audit / Pre-production Regression
   - Status: completed for Admin Audit Log, permission audit script, API smoke test, and combined `npm test` checks.
   - Follow-up: keep `npm test` as the required pre-commit/pre-deploy gate.

5. Phase 5: Manual UAT / Production Handoff
   - Status: remaining.
   - Required before production deployment: open the browser with real Admin/User accounts, test every module, confirm admin-only buttons are hidden/blocked for User, create/edit/delete small sample records, confirm Audit Log captures the actions, then push/deploy handoff.

### Post-Phase A Enhancements (completed)

- **Phase B — Dashboard KPI drill-down**: Dashboard module cards for Patrol (open issues), Hiyari (pending), and 4M (open notices) write a `pending_filter_<module>` key to `sessionStorage` on click; target module reads and removes the key on load, then pre-selects the matching tab and filter state. No router changes required.
- **Phase D — Audit Log**: Added "Failed Only" quick-filter chip (`#audit-chip-failed`) that appends `failed=1` to API calls (backend: `StatusCode >= 400 OR Action LIKE 'FAILED%'`). Added "Export CSV" button (`_exportAuditCSV`) — downloads all matching records (up to 5000 rows) as UTF-8 BOM CSV.
- **Phase E — native confirm() removal**: Replaced all 3 native `confirm()` in `patrol.js` (`_armDeleteRecord`, `_arsvDeleteRecord`, `deleteSelfCheckin`) with `await showConfirmationModal(title, message)` from `ui.js`.
- **Patrol Admin Record — all employees**: Admin can now search and manage patrol records for any employee (not roster-only) via a search card in the Overview tab. Uses new `GET /patrol/employee-search` endpoint + existing `openAdminRecordModal`.

### Mobile/PWA Foundation (completed)

- **Bottom mobile tab bar**: `#bottom-tab-bar` defaults to `display:none` in `public/style.css` and is enabled only inside `@media (max-width: 767px)`. Desktop/tablet-wide browser layouts should use the sidebar/top shell only.
- **Mobile app shell**: `#app-container` and `#login-overlay` use `100dvh` with `100vh` fallback, `min-width:0` guards, iOS momentum scrolling, and safe-area padding for the bottom tab bar.
- **Login mobile layout**: `index.html` adds `#login-panel`, `#login-topbar`, `#login-form-area`, `#login-footer`, `.login-hero-icon`, and `#login-security-indicators` hooks. On mobile the login form starts at the top instead of vertical-center, preventing Safari address-bar/footer UI from clipping the login icon/header.
- **Short-height phones**: At `max-width:767px` + `max-height:760px`, login security indicators are hidden and spacing is reduced. At `max-height:640px`, login footer is hidden so the form remains usable on very short browser viewports.
- **iPhone input zoom guard**: Mobile `input`, `select`, and `textarea` are forced to `16px` font size to prevent Safari auto-zoom on focus. Login/register employee ID and password fields disable autocapitalize/autocorrect/spellcheck.
- **PWA shell**: `index.html` includes theme-color, Apple mobile web app meta, `public/manifest.webmanifest`, `public/icons/app-icon.svg`, and service worker registration. `vercel.json` must keep both the static build and route for root `/sw.js`.
- **Service worker policy**: `sw.js` is intentionally network-only. It exists for installability/open-as-app behavior and must not cache HTML/API responses because the app uses authenticated, frequently changing safety data.
- **CSS cache busting**: `index.html` links `public/style.css?v=20260503-mobile-login`. Bump this query string after future mobile CSS changes to reduce stale CSS on phones.
- **Completed login visual QA**: Playwright Chromium screenshots passed for the public login page at `320x667`, `375x812`, `390x844`, and `430x932`: no clipped login header/icon and no horizontal overflow. Full post-login module QA still requires an authenticated/API-backed environment.

### Admin Audit Log

Audit logging is centralized in `backend/utils/audit.js`.

- `authenticateToken` attaches `attachAuditLogger(req, res)` so signed-in `POST`, `PUT`, `PATCH`, and `DELETE` API calls are logged automatically after the response finishes.
- Admin Console curated actions still call `auditLog()` in `backend/routes/admin.js`; those rows use clear action names such as `CREATE_EMPLOYEE`, `RESET_PASSWORD`, and set `req.auditLogged = true` to avoid duplicates.
- `Admin_AuditLogs` is auto-created and auto-migrated by `ensureAuditTable()`; no manual SQL is required for normal deployment.
- `GET /api/admin/audit-logs` supports `page`, `limit`, `action`, `module`, `adminId`, `q`, `dateFrom`, `dateTo`, `failed` (`1` = failures only, StatusCode ≥ 400) and returns `facets` for filter dropdowns.
- Audit Log UI has a **"Failed Only"** quick-filter chip and an **"Export CSV"** button (downloads current filter as `audit_log_YYYY-MM-DD.csv` with UTF-8 BOM for Thai text).

### Pre-production Permission Regression

Run the static permission audit before production handoff:

```bash
cd backend
npm run permission:audit
npm run smoke:api
npm run uat:preflight
```

The audit scans `backend/server.js` and `backend/routes/*.js` for every `POST`, `PUT`, `PATCH`, and `DELETE` route. Expected categories:

- `ADMIN` — protected by route-level `isAdmin` or mounted under `/api/admin` with `isAdmin`.
- `INLINE_GUARD` — intentionally mixed workflow with owner/admin checks inside the handler, such as CCCF worker edit/delete, 4M notice close, Patrol issue save/delete, Self Patrol delete, and Yokoten response update.
- `USER_WORKFLOW` — intentionally allowed user actions such as login/register/change password/profile update, policy acknowledgement, CCCF submit, Hiyari Excel/direct signed-PDF submit, KY submit, 4M notice create, Patrol check-in, and Yokoten respond.
- `UNREVIEWED` — must be fixed or explicitly reviewed before release. The script exits non-zero if any appear.

Current verified result after the Hiyari direct signed-PDF workflow: `ADMIN=167`, `INLINE_GUARD=8`, `USER_WORKFLOW=17`, `UNREVIEWED=0`.

`npm run smoke:api` starts the Express app on a temporary local port and checks that public boot data loads, `/api/admin/*` rejects missing/User tokens, Admin token can read admin dashboard/audit log, normal User token can read policy page data, and User token cannot write master data.

`npm run uat:preflight` is the Phase 5 handoff check. It starts the Express app on a temporary local port and checks the main read surfaces across Dashboard, Master, Patrol, 4M, Hiyari, KY, CCCF, Machine Safety, OJT, Training, Accident, Yokoten, Safety Culture, Contractor, Activity Targets, Module Forms, Person Search, and Admin Console. It also confirms User tokens are blocked from Admin Console, Yokoten all-responses, and Safety Culture PPE violation admin views.

Current Phase 5 verified result: `83/83` UAT preflight checks passed. During Phase 5, `/api/yokoten/employee-completion` was fixed to use `Employees.EmployeeName` instead of the non-existent `Employees.Name` column.

Current table shape:
```sql
CREATE TABLE IF NOT EXISTS Admin_AuditLogs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    ActionTime  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    AdminID     VARCHAR(50)  NOT NULL,
    AdminName   VARCHAR(100),
    Role        VARCHAR(50),
    Department  VARCHAR(100),
    Module      VARCHAR(80),
    Action      VARCHAR(80)  NOT NULL,
    Method      VARCHAR(10),
    Path        VARCHAR(255),
    StatusCode  INT,
    TargetType  VARCHAR(80),
    TargetID    VARCHAR(100),
    Detail      TEXT,
    Metadata    TEXT,
    IPAddress   VARCHAR(80),
    UserAgent   VARCHAR(255),
    INDEX idx_action (Action),
    INDEX idx_admin (AdminID),
    INDEX idx_module (Module),
    INDEX idx_actiontime (ActionTime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Frontend Modal Pattern (Critical)

`ui.js` exports `openModal` / `closeModal` as named exports — they are **NOT** automatically on `window`.

```js
// In every page module that uses modals:
import { openModal, closeModal } from '../ui.js';

// Set window.closeModal once so inline onclick handlers in HTML strings work:
window.closeModal = closeModal;

// In JS code — use imported function directly:
openModal('ชื่อ Modal', htmlContent, 'max-w-lg');
closeModal();

// In HTML template strings — use window prefix:
// <button onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
```

## Frontend UI Design System

> **ห้ามใช้ emoji ทุกชนิดใน UI** — ใช้ inline SVG แทนทั้งหมด

### Global Theme
- **Body background**: `#1e5c3e` (deep forest green) — ตัดกับ card สีขาวได้ชัดเจน ห้ามเปลี่ยนเป็นสีอ่อน
- **Card**: `background:#ffffff; border:1px solid #d1f0e0; box-shadow: 0 4px 16px rgba(5,150,105,0.15), 0 1px 4px rgba(0,0,0,0.08)` — shadow เขียวอ่อน

ไฟล์อ้างอิง (design system): `committee.js`, `patrol.js`, `kpi.js`, `cccf.js`, `profile.js`
> หมายเหตุ: `policy.js` ถูกแก้ไขเพื่อเพิ่ม RTE Description — ดู **Policy Module — Architecture** สำหรับรายละเอียด

### Restyle Status
| File | Status |
|------|--------|
| `kpi.js` | done (enterprise) |
| `committee.js` | done (enterprise) |
| `machine-safety.js` | done (enterprise) |
| `patrol.js` | done (enterprise) |
| `ojt.js` | done (enterprise) |
| `safety-culture.js` | done (enterprise) |
| `profile.js` | done (enterprise — slide-over drawer) |
| `hiyari.js` | done (enterprise) |
| `ky.js` | done (enterprise) |
| `fourm.js` | done (enterprise) |
| `yokoten.js` | done (enterprise) |
| `accident.js` | done (enterprise) |
| `training.js` | done (enterprise) |
| `contractor.js` | done (enterprise) |
| `policy.js` | done (enterprise + RTE Description) |
| `admin.js` | done (enterprise) |

### Page Wrapper Pattern
**ห้ามใส่ `max-w-*` หรือ `mx-auto` ใน page wrapper** — `<main>` ใน `index.html` จัดการ `p-4 md:p-6` ให้แล้ว

```js
`<div class="space-y-6 animate-fade-in pb-10">...</div>`
```

### Hero Header Pattern (Enterprise pages — kpi.js, machine-safety.js)
```html
<div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
  <!-- dot pattern -->
  <div class="absolute inset-0 opacity-10 pointer-events-none">
    <svg width="100%" height="100%"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>
  </div>
  <div class="relative z-10 p-6">
    <!-- title + action buttons -->
    <!-- stats strip: grid of rounded-xl px-4 py-3 text-center cards with rgba(255,255,255,0.12) bg -->
  </div>
</div>
```

### Header Pattern (non-hero pages)
```html
<div>
  <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
    <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:linear-gradient(135deg,#COLOR1,#COLOR2);box-shadow:0 2px 10px rgba(R,G,B,0.3)">
      <svg class="w-5 h-5 text-white" .../>
    </span>
    PAGE TITLE
  </h1>
  <p class="text-sm text-slate-500 mt-1 ml-11">SUBTITLE</p>
</div>
```

### Accent Colors per Module
| Module | Gradient | Shadow rgba |
|--------|----------|-------------|
| machine-safety | `#059669 → #0d9488` | `5,150,105` |
| ojt/scw | `#dc2626 → #ea580c` | `220,38,38` |
| safety-culture | `#059669 → #0d9488` | `5,150,105` |
| hiyari | `#f97316 → #ef4444` | `249,115,22` |
| ky | `#6366f1 → #8b5cf6` | `99,102,241` |
| fourm (4M) | `#6366f1 → #0284c7` | `99,102,241` |
| yokoten | `#0ea5e9 → #6366f1` | `14,165,233` |
| accident | `#dc2626 → #9f1239` | `220,38,38` |
| training | `#0284c7 → #0891b2` | `2,132,199` |
| contractor | `#d97706 → #b45309` | `217,119,6` |

### Stats Card Pattern
```html
<div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-{color}-50">
    <svg class="w-5 h-5 text-{color}-500" .../>
  </div>
  <div>
    <p class="text-2xl font-bold text-slate-800">VALUE</p>
    <p class="text-xs text-slate-500">LABEL</p>
  </div>
</div>
```

### Status Badge / Chip Pattern
```html
<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-{color}-100 text-{color}-700">
  <span class="w-1.5 h-1.5 rounded-full bg-{color}-400 inline-block"></span>
  LABEL
</span>
```
ใช้ `animate-pulse` บน dot สำหรับ status "active/valid/ผ่าน"

### Container / Loading Pattern
- Filter bar: `<div class="card p-4">...</div>`
- Table: `<div class="card overflow-hidden">...</div>`
- Loading spinner: `<div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent"></div>`

### Empty State Pattern
```html
<div class="text-center py-16 text-slate-400">
  <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
    <svg class="w-8 h-8 opacity-40" .../>
  </div>
  <p class="font-medium">ไม่มีข้อมูล</p>
  <p class="text-sm mt-1">DESCRIPTION</p>
</div>
```

## Safety Culture Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `SC_Principles` | 8 campaign/principle cards (7 culture posters + 1 overview card; missing defaults are inserted with `INSERT IGNORE`) — `PrincipleID VARCHAR(36) PK`, `SortOrder`, `Title`, `Description`, `ImageUrl`, `AttachmentUrl`, `AttachmentName`, `IsFeatured TINYINT(1)` |
| `SC_Assessments` | ผลการประเมินวัฒนธรรม — `AssessmentID UUID PK`, `AssessmentYear`, `AssessmentDate DATE`, `WeekNo TINYINT`, `Area`, `T1_Score–T5_Score, T7_Score DECIMAL(5,2)` (0–100%), `Notes`, `CreatedBy` |
| `SC_Assessment_Points` | บันทึกรายจุดตรวจ (TotalPeople/ComplyPeople/Pct) ต่อ AssessmentID+TopicKey |
| `SC_PPEInspections` | บันทึกการตรวจ PPE — `InspectionID UUID PK`, `InspectionDate`, `Department`, `InspectorID/Name`, `InspectedEmployeeID/Name`, `WorkTypeID`, `IsPass TINYINT(1)`, `IsUnregistered`, `CompliancePct`, `deleted_at` (soft delete) |
| `SC_PPE_Inspection_Details` | รายการ PPE ต่อ inspection — `DetailID UUID PK`, `InspectionID`, `ItemID`, `Status ENUM('compliant','non-compliant','na')` — UNIQUE FK → SC_PPEInspections |
| `SC_PPE_Items` | รายการ PPE ที่ตรวจ (admin-configurable) — seed 6 รายการเริ่มต้น; `ItemID UUID PK`, `ItemName`, `SortOrder`, `IsActive` |
| `SC_PPE_WorkTypes` | ประเภทงาน/พื้นที่ (admin-configurable) — กำหนด PPE set ที่ต้องการ |
| `SC_PPE_WorkType_Items` | กำหนด ItemID ที่ต้องการต่อ WorkTypeID — `UNIQUE KEY uq_wt_item` |
| `SC_PPE_Violations` | บันทึกการฝ่าฝืน PPE ต่อพนักงาน — `ViolationID UUID PK`, `EmployeeID`, `ViolationNo`, `WarningLevel ENUM('verbal','safety_notice','written_warning')`, `InspectionID`, `ViolationDate`, `deleted_at` |
| `SC_PPE_AuditLog` | บันทึก mutation ของ PPE (Create/Update/Delete) — `Action`, `EntityType`, `EntityID`, `UserID`, `Detail TEXT` |

### Score Scale Migration
- เดิม: T1–T5, T7 บันทึก scale 1–5
- ปัจจุบัน: scale 0–100% (`DECIMAL(5,2)`)
- `ensureTables()` ทำ one-time `UPDATE SC_Assessments SET Tx_Score = Tx_Score * 20 WHERE Tx_Score <= 5` (safe re-run — condition guards แถวที่ migrate แล้ว)

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /safety-culture/principles` | User | ดึง 7 หลักการ (seed ถ้าว่าง) |
| `PUT /safety-culture/principles/:id` | Admin | แก้ไข principle/campaign card (title, description, imageUrl, attachmentUrl, attachmentName, IsFeatured); when `IsFeatured=1`, existing featured card is cleared automatically |
| `GET /safety-culture/assessments?year=` | User | รายการประเมินรายปี + details |
| `POST /safety-culture/assessments` | Admin | บันทึกประเมินใหม่ (body: AssessmentYear, AssessmentDate, WeekNo, Area, T1–T5+T7 scores 0–100, Notes) |
| `PUT /safety-culture/assessments/:id` | Admin | แก้ไขประเมิน |
| `DELETE /safety-culture/assessments/:id` | Admin | ลบประเมิน |
| `GET /safety-culture/ppe-items` | User | รายการ PPE ทั้งหมด (IsActive=1) |
| `POST /safety-culture/ppe-items` | Admin | เพิ่ม PPE item |
| `PUT /safety-culture/ppe-items/:id` | Admin | แก้ไข PPE item |
| `DELETE /safety-culture/ppe-items/:id` | Admin | ลบ PPE item (soft — IsActive=0) |
| `GET /safety-culture/ppe-work-types` | User | รายการ work type + items ที่ผูกไว้ |
| `POST /safety-culture/ppe-work-types` | Admin | เพิ่ม work type |
| `PUT /safety-culture/ppe-work-types/:id` | Admin | แก้ไข work type + item mapping |
| `DELETE /safety-culture/ppe-work-types/:id` | Admin | ลบ work type |
| `GET /safety-culture/ppe-violations` | Admin | รายการ violations (filterable) |
| `GET /safety-culture/ppe-violations/summary` | Admin | สรุป violations รายพนักงาน |
| `POST /safety-culture/ppe-violations` | Admin | บันทึก violation ใหม่ (body: EmployeeID, ViolationDate, WarningLevel, Note) |
| `DELETE /safety-culture/ppe-violations/:id` | Admin | soft delete violation (deleted_at) |
| `GET /safety-culture/ppe-inspections?year=&month=&dept=` | User | รายการ inspection + details + violations |
| `POST /safety-culture/ppe-inspections` | Admin | บันทึก inspection ใหม่ (JSON body: InspectionDate, WorkTypeID, InspectedEmployeeID/Name, IsUnregistered, items: [{ItemID, Status}], violations: [{...}]) — เขียน Details + Violations + AuditLog ใน transaction |
| `PUT /safety-culture/ppe-inspections/:id` | Admin | แก้ไข inspection (rebuild Details) |
| `DELETE /safety-culture/ppe-inspections/:id` | Admin | soft delete (`deleted_at = NOW()`) |
| `GET /safety-culture/dashboard?year=` | User | KPI dashboard — `{ avgScores, ppeStats: { overall_pct, itemBreakdown }, yearTrend }` |

### Permission Boundary
- User can read Safety Culture principles, assessments, PPE items/work types, PPE inspections, and dashboard aggregates.
- Admin-only Safety Culture surfaces: principle/assessment/PPE item/work-type mutations, PPE inspection create/update/delete, and all PPE violation endpoints (`GET/POST/DELETE /safety-culture/ppe-violations*`).
- Frontend must not call `GET /safety-culture/ppe-violations` for non-admin sessions. Non-admin PPE UI should hide/block the violations sub-tab and fall back to the PPE dashboard if an old saved state points at `violations`.
- UAT preflight must keep asserting user-token 403 for Safety Culture PPE violation admin views.

### `GET /dashboard` — Response Shape
```js
{
  avgScores: { avg_t1, avg_t2, avg_t3, avg_t4, avg_t5, avg_t7 },  // AVG per topic for year
  ppeStats: {
    overall_pct,   // AVG(CompliancePct) from SC_PPEInspections
    itemBreakdown: [{ ItemID, ItemName, SortOrder, ok_count, total_count }]  // from Details JOIN Items
  },
  yearTrend: [{ AssessmentYear, avg_score, record_count }],  // NULL-aware avg across all years
  year       // the requested year
}
```
- `yearTrend.avg_score` ใช้ `NULLIF(sum_of_IS_NOT_NULL, 0)` เป็น divisor — หารเฉพาะคอลัมน์ที่มีค่า ป้องกัน COALESCE(col,0) ทำ avg ต่ำกว่าจริง (ดู pitfall #79)

### Frontend Tabs (4 tabs)
| Tab ID | Label | เนื้อหา |
|--------|-------|---------|
| `principles` | สื่อรณรงค์และกิจกรรม | 8 card campaign/poster library (4+4 layout) + Campaign Library header + KPI strip (4 badges) + Recent Activity panel (assessment + PPE rows) |
| `dashboard` | Dashboard | Hero stats strip (sync กับ month/year filter), Radar+Bar+Line charts, dept breakdown |
| `assessment` | ผลการประเมิน | ตารางประเมิน + CRUD form (Admin), PDF export per record |
| `ppe` | PPE Control | sub-tabs: dashboard / records / violations / work-types / items (Admin) |

### State Variables
```js
let _assessments    = [];    // SC_Assessments rows (with details)
let _ppeInspections = [];    // SC_PPEInspections rows (with details array)
let _ppeItems       = [];    // SC_PPE_Items (active)
let _ppeViolations  = [];    // SC_PPE_Violations rows
let _ppeWorkTypes   = [];    // SC_PPE_WorkTypes (with items)
let _scAreas        = [];    // distinct Area values from assessments
let _dashData       = null;  // GET /dashboard response
let _dashScores     = null;  // [T1,T2,T3,T4,T5,T6(PPE),T7] computed by buildDashboardHtml()
let _dataLoaded     = false; // true after first _loadHeroStats() success — skeleton guard
let _departments    = [];    // lazy-cached from GET /master/departments
let _filterYear     = new Date().getFullYear();
let _filterDashMonth = 0;   // 0=รายปี, 1-12=เดือน
let _filterPPEDept  = '';
let _ppeSub         = 'dashboard'; // PPE tab sub-panel
let _ppeSearch      = '';
let _ppeFilterWT    = '';
let _ppeFilterStatus = '';
```

### Score Colors & Thresholds
| Range | Color | Meaning |
|-------|-------|---------|
| `>= 90%` | `#059669` (green) | ผ่าน |
| `>= 70%` | `#d97706` (amber) | ควรปรับปรุง |
| `< 70%` | `#ef4444` (red) | ต้องแก้ไขด่วน |
| `0 / null` | `#cbd5e1` (gray) | ไม่มีข้อมูล |

`getMaturity(avg)`:
- ≤ 40% → Reactive (red), ≤ 60% → Basic (amber), ≤ 80% → Proactive (blue), > 80% → Generative (emerald)

### Dashboard Sync (`_updateHeroStats`)
`window._scSetDashMonth(v)` → sets `_filterDashMonth` → calls `_updateHeroStats()` + `renderPanel('dashboard')`

`_updateHeroStats()` recomputes 4 `[data-sc-stat]` badges from filtered data:
- stat[0]: maturity label
- stat[1]: avg score %
- stat[2]: PPE compliance % (from filteredPPE pass rate; fallback to `_dashData.ppeStats.overall_pct` when mo=0)
- stat[3]: PPE inspection count

### `renderPanel()` Skeleton Guard
```js
function renderPanel(id) {
    if (!_dataLoaded) { panel.innerHTML = _buildSkeleton(id); return; }
    // ... render real content
}
```
`_dataLoaded` set to `true` after first successful `_loadHeroStats()` — skeleton shown in all tabs before data arrives.

### Dashboard PDF (`exportPDF`) — html2canvas Approach
- **เหตุผล**: jsPDF built-in fonts (Helvetica/Times) ไม่มี Thai Unicode glyphs — ข้อความไทยแสดงเป็น `!#2!` / garbage
- **แนวทาง**: render HTML fixed A4 ด้วย browser (Kanit font โหลดอยู่แล้วใน index.html) → capture ด้วย `html2canvas` → embed JPEG ใน jsPDF
- **Active path**: `exportPDF()` เป็น Hiyari-style fixed A4 executive pack ที่ paginate ตามข้อมูลจริงของ Safety Culture; `exportPDFLegacy()` คือ builder เดิม 3 หน้า เก็บไว้เทียบ/ fallback เท่านั้น
- **SVG chart helpers** (ไม่ต้องพึ่ง Chart.js instance): `_svgBar(scores, labels, w, h)`, `_svgRadar(scores, labels, size)`, `_svgLine(trend, w, h)`
- **จำนวนหน้าไม่ล็อกตายตัว** (794×1122px ต่อหน้า, auto-scale body) aligned to Hiyari Dashboard PDF rhythm while fitting the module data:
  - หน้า 1: solid green Hiyari-style header + KPI/maturity cards + Topic Score Register + Management Focus + Dashboard Scope
  - หน้า score/trend: Score Visualization + Monthly Trend + Follow-up Notes, added only when score/trend data exists
  - หน้า operational: PPE by Department + PPE by Item + Violation Tracker, added only when PPE/violation data exists
- **Footer**: light official footer, ASCII page label in the header badge (`Page x of y`) and filename/scope note in footer
- **ชื่อไฟล์**: `Safety_Culture_YYYY.pdf` หรือ `Safety_Culture_YYYY_MM.pdf` (ตาม year/month filter)
- ห้ามใช้ `_pdfKpiBoxRow` / `_pdfDeptBars` / `_pdfSectionHeader` ใน dashboard PDF — ฟังก์ชันเหล่านี้ถูกลบแล้ว (ใช้ได้เฉพาะ Assessment PDF หากยังเหลืออยู่)

### Assessment PDF (`window._scExportAssessmentPDF`)
- Current path uses HTML fixed-page capture (`html2canvas` -> JPEG -> jsPDF A4), same Thai-safe approach as Dashboard PDF.
- Yearly export creates a Hiyari-style executive summary page with KPI cards, Topic Performance, Action Focus, Monthly Performance, then always keeps assessment detail/register on separate page(s) so full topic scores remain clear. Monthly export follows the same pattern for the selected month: monthly summary page first, then monthly assessment register page(s) with Review & Follow-up / Approval block on the first register page to avoid sparse output.
- New helper path: `_asmtPage`, `_asmtSummaryCards`, `_asmtTable`, `_asmtMonthlySummaryTable`, `_saveScAssessmentHtmlPdf`, `exportAssessmentYearlyHtmlPDF`, `exportAssessmentMonthlyHtmlPDF`.
- Legacy text-based helpers (`_asmtPdfHeader`, `_asmtPdfScoreTable`, `_asmtPdfMonthRow`) may still exist but are no longer wired to `window._scExportAssessmentPDF`.
- เรียกจาก assessment tab ไม่ใช่จาก `exportPDF()` ของ dashboard

### PPE Inspection Form — Data Flow
1. Admin เลือก WorkType → system โหลด items ที่ผูกไว้ (`SC_PPE_WorkType_Items`)
2. Admin เลือก employee (search หรือ IsUnregistered=1 สำหรับบุคคลภายนอก)
3. ต่อ item: เลือก `compliant` / `non-compliant` / `na`
4. `IsPass` = `CompliantItems / TotalCheckedItems >= threshold` (คำนวณ backend)
5. `CompliancePct` = `compliant / (compliant + non-compliant) * 100` (ไม่รวม na)
6. POST body: `{ InspectionDate, WorkTypeID, InspectedEmployeeID, InspectedEmployeeName, IsUnregistered, Department, items: [{ItemID, Status}], violations: [{EmployeeID, WarningLevel, Note}] }`
7. Backend เขียน `SC_PPEInspections` + `SC_PPE_Inspection_Details` + `SC_PPE_Violations` + `SC_PPE_AuditLog` ใน transaction

### `SC_PPE_Inspection_Details.Status` Constraint
- ค่าที่รับได้: `'compliant'`, `'non-compliant'`, `'na'` (lowercase เท่านั้น)
- `ensureTables()` normalize legacy uppercase values ก่อน add CHECK constraint
- `na` = ไม่นับใน compliance % — ใช้สำหรับ item ที่ไม่เกี่ยวข้องกับงานนั้น

### Soft Delete Pattern (PPE)
- `SC_PPEInspections.deleted_at` และ `SC_PPE_Violations.deleted_at`
- DELETE endpoints → `UPDATE ... SET deleted_at = NOW()`
- ทุก GET query ต้องมี `WHERE deleted_at IS NULL`

## Contractor Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Contractor_Documents` | Contractor/Supplier document repository — `PartyType`, `Title`, `Category`, `Description`, file metadata, soft-delete columns |
| `Contractor_Companies` | Small company master for Contractor/Supplier names — `CompanyName`, `PartyType`, `Status`, audit columns |
| `Contractor_AccidentRecords` | Simple external incident statistics — `IncidentDate`, `IncidentType`, `PartyType`, `CompanyName`, `InvolvedPerson`, `Area`, `Description`, soft-delete columns |
| `Contractor_AccidentFiles` | Multi-file evidence rows for Accident Records |
| `Contractor_Activity_Log` | Activity/audit trail for document and accident actions — `ActionType`, `DocID`, `DocTitle`, `Category`, `ActorName`, `CreatedAt` |

ทั้งสองตารางสร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN` (try/catch) ใน `ensureTables()` ของ `backend/routes/contractor.js`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /contractor/documents` | User | รายการเอกสารทั้งหมด — supports Contractor/Supplier `PartyType` data |
| `GET /contractor/documents/stats` | User | สรุป: `{ total, byCategory: [{Category, cnt}], recentCount }` (30 วันล่าสุด) |
| `GET /contractor/activity?limit=` | User | ประวัติกิจกรรมล่าสุด (สูงสุด 50 รายการ) |
| `GET /contractor/companies` | User | Company master list for Contractor/Supplier datalist |
| `POST /contractor/companies` | Admin | Add company master row; accident save also auto-creates missing names |
| `POST /contractor/documents` | Admin | อัปโหลดเอกสาร (field: `file`, includes `PartyType`, สูงสุด 20 MB) |
| `PUT /contractor/documents/:id` | Admin | แก้ไข metadata (`Title`, `PartyType`, `Category`, `Description`) |
| `DELETE /contractor/documents/:id` | Admin | ลบเอกสารแบบ soft delete (`DeletedAt`, `DeletedBy`) + activity log; physical uploaded file is kept for audit trail |
| `GET /contractor/accidents?year=` | User | Accident/Near Miss/First Aid/Property Damage records for selected year |
| `GET /contractor/accidents/stats?year=` | User | Zero External Accident summary for dashboard |
| `POST /contractor/accidents` | Admin | Create accident statistic record with multiple evidence files |
| `PUT /contractor/accidents/:id` | Admin | Edit accident record metadata |
| `DELETE /contractor/accidents/:id` | Admin | Soft-delete accident record and write audit trail |
| `POST /contractor/accidents/:id/files` | Admin | Add more evidence files |
| `DELETE /contractor/accident-files/:fileId` | Admin | Delete one evidence file and write audit trail |

### Frontend Architecture (`public/js/pages/contractor.js`)

#### Service Layer
```js
const ContractorService = {
    getDocs()           // GET /contractor/documents — all docs, no filter params
    getStats()          // GET /contractor/documents/stats
    getActivity(limit)  // GET /contractor/activity?limit=
    getCompanies()      // GET /contractor/companies
    upload(formData)    // POST /contractor/documents
    update(id, data)    // PUT /contractor/documents/:id
    remove(id)          // DELETE /contractor/documents/:id
    getAccidents(year)  // GET /contractor/accidents?year=
    getAccidentStats(year)
    createAccident(formData)
    updateAccident(id, data)
    removeAccident(id)
    addAccidentFiles(id, formData)
    deleteAccidentFile(fileId)
}
```
API calls อยู่ใน `ContractorService` เท่านั้น — ห้าม call `API.*` จาก UI functions โดยตรง

#### Cache (TTL 5 นาที)
```js
const _cache = { get(key), set(key, val), del(...keys) }
// CACHE_TTL = 5 * 60 * 1000
// Keys include: docs, stats, activity, companies, accidents:{year}, accidentStats:{year}
// Invalidate relevant keys after upload/edit/delete and accident file changes.
```

#### Centralized State
```js
const _state = {
    docs: [],          // full list from API (client-side filter/sort/paginate)
    stats: null,       // { total, byCategory, recentCount }
    activity: [],      // Contractor_Activity_Log rows
    companies: [],     // Contractor_Companies rows
    accidents: [],     // selected-year Accident Records
    accidentStats: null,
    accidentYear: new Date().getFullYear(),
    isAdmin: false,    // from TSHSession.getUser().role === 'Admin'
    activeTab: 'dashboard' | 'documents' | 'accidents',
    page: 1,
    docView: 'grid' | 'list',
    filter: { category, partyType, query, dateFrom, dateTo, sortBy },
    accidentFilter: { type, partyType, query }
}
```

#### Data Loading (partial-failure tolerant)
```js
async function _loadAll(force = false)   // Promise.allSettled — continues even if 1 of 3 fetches fails
async function _reload()                 // cache.del all 3 keys → _loadAll(true); returns !anyFailed
```
- `_loadAllInFlight` flag ป้องกัน concurrent calls (second call returns immediately)
- Returns `true` = all OK, `false` = partial failure — caller shows appropriate toast

#### Tabs
| Tab | ID | Content |
|-----|----|---------|
| ภาพรวม | `dashboard` | Hero stats + category breakdown + external systems + recent uploads + activity log |
| เอกสาร | `documents` | Filter bar + document grid (12/page) + pagination |

### Filters & Pagination
- **Client-side filtering** — `_state.docs` loaded once; `_getFilteredDocs()` pure function (no DOM side-effects)
- Filter fields: `category` chip, `query` (title+description, debounce 300 ms), `dateFrom`, `dateTo`, `sortBy` (newest/oldest/A–Z)
- `PAGE_SIZE = 12`, smart ellipsis pagination (max 7 visible page buttons)
- `_state.page` clamped to `Math.max(1, Math.ceil(total / PAGE_SIZE))` on every grid render — ป้องกัน empty grid หลัง delete

### Clickable KPI Cards
Hero stats strip cards ที่มี `data-filter-cat` จะ navigate ไป documents tab และ set `_state.filter.category` อัตโนมัติ

### Optimistic Delete
1. `await ContractorService.remove(id)` — wait for API confirm
2. `_state.docs.filter(...)` — remove locally
3. `_cache.del(...)` — invalidate
4. Background: `_loadStats(true)` + `_loadActivity(true)` — sync counts without full re-render

### RBAC
- `_state.isAdmin` read once ใน `loadContractorPage()` จาก `TSHSession.getUser()`
- Upload button, edit/delete buttons ใน card: render เมื่อ `_state.isAdmin` เท่านั้น
- Backend enforces `isAdmin` middleware บน POST/PUT/DELETE ทุก route

### Production Hardening (fixes applied)
| Risk | Fix |
|------|-----|
| Empty grid after delete on non-first page | Clamp `_state.page` ≤ `maxPage` ใน `_buildDocGridContent` |
| Concurrent `_loadAll()` race condition | `_loadAllInFlight` boolean flag, wrapped in try/finally |
| Success toast despite partial API failure | `_loadAll` returns `!anyFailed`; refresh handler shows warning toast on partial failure |
| Drag-and-drop bypasses `accept` attribute | `ALLOWED_MIME_TYPES` Set checked in `_validateUploadForm` before upload starts |
| Date filter off-by-one near midnight (UTC vs local) | `_toDateStr(val)` converts via `Date.getFullYear/Month/Date` (local time) for lexicographic string compare |
| Double-click upload opens duplicate submit handlers | `data-opening` debounce flag (500 ms) on upload button |

### Categories
`ALLOWED_CATEGORIES` (backend) = `['Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป']`
`CAT_META` (frontend) — map category → `{ label, bg, text, dot }` Tailwind classes

### External Systems (hardcoded in EXTERNAL_SYSTEMS const)
- **Contractor Online** — `https://dev.tshpcl.com/contractor/login.php`
- **Supplier E-Pass** — `https://dev.tshpcl.com/epass/login.php`
แสดงใน dashboard tab ไม่มี separate tab (merged by design)

## Hiyari Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `HiyariReports` | รายงาน near-miss หลัก — `RiskRank VARCHAR(1)` (API aliases as `Rank`), `StopType INT`, `RiskLevel` (derived from Rank via `RANK_TO_RISK` for backward-compat), `AttachmentUrl`, `AdditionalFileUrl`, `CorrectiveAction`, `AdminComment`, `ClosedAt`, `ClosedBy`, `DeletedAt`, `DeletedBy` (soft delete) |
| `Hiyari_Dashboard_Config` | Key/value config — `pinnedDepts` (JSON array) บันทึกโดย admin เพื่อกำหนดแผนกที่แสดงใน dashboard |
| `Hiyari_Assignments` | รายการมอบหมาย — `EmployeeID`, `AssigneeName`, `Department`, `DueDate`, `Note`, `AllowDirectSignedPdf`; UNIQUE KEY `uq_emp (EmployeeID)` |

Phase 3 report-flow notes:
- Submit form uses local date (`_todayDateOnly`) to avoid timezone day drift.
- Area/Location is a searchable datalist sourced from `Master_Areas` via `/api/master/areas`, while still allowing manual "Other" input.
- Reporter card shows logged-in employee ID, department, and position from session.
- Frontend validates attachment type/size before preview and before submit (`PDF/JPG/PNG/WEBP`, max 20 MB).
- Submit has an in-flight guard to prevent duplicate POSTs and refreshes hero stats/history/assignment progress after save.

Phase 4 admin-review notes:
- Closing a Hiyari report now requires a non-empty `CorrectiveAction` on both frontend and backend.
- Reopen/update/close/add-attachment/delete actions write `Admin_AuditLogs` with `Module='hiyari'`, `TargetType='HiyariReports'`, and the report id as `TargetID`.
- Detail modal loads `/api/hiyari/:id/timeline` and shows recent review timeline entries from `Admin_AuditLogs`.
- Admin additional attachment uses the same frontend validation as reporter attachments (`PDF/JPG/PNG/WEBP`, max 20 MB).

Phase 5 dashboard/analytics notes:
- `/api/hiyari/stats` now returns `areaRank`, `monthlyRank`, and `monthlyStatus` in addition to the existing KPI/chart data.
- History list supports drill-down query filters for `stopType`, `rank`, `month`, and `area` while preserving existing `status`, `risk`, `dept`, `year`, and search filters.
- Dashboard adds Top Area Focus and Monthly Rank Focus panels. Heatmap, KPI, SLA, area, rank-month, and department widgets can drill into the History tab with the matching filters.
- Dashboard has an Export Year action that exports all reports for the selected dashboard year; History export still uses the currently filtered record set.

Direct signed-PDF assignment notes:
- `AllowDirectSignedPdf` is a per-assignee permission maintained by Admin in the Hiyari Manage Assignment subtab, not a profile/global role flag.
- The New Report tab separates document modes by the signed-in account: Admin sees all modes, normal users see Excel review + PDF after approval, and an assignee whose own assignment has `AllowDirectSignedPdf=1` sees only the direct signed-PDF mode to avoid document-flow confusion.
- `POST /api/hiyari/direct-signed` accepts the normal report wizard fields plus a signed PDF attachment, verifies the selected reporter assignment permission for non-admin users, creates a `ReviewStatus='Completed'` report with `SignedFileUrl`, writes `HIYARI_DIRECT_SIGNED_SUBMIT`, and queues the admin signed-file email.
- History and Admin Review show explicit document-flow labels for `รอตรวจ Excel`, `ผ่านแล้ว รอ PDF`, `ไม่ผ่าน ต้องแก้ไข`, `PDF ส่งแล้ว`, and `PDF ส่งโดยตรง`. Admin Review includes a `PDF ส่งโดยตรง` filter so direct submissions can be reviewed separately from normal completed reports.

### Hiyari UAT Checklist
- User normal flow: submit Excel from New Report and confirm CompanyEmail auto-fills from Employee Master; if the reporter has no Employee Master email, enter a valid `@thaisummit-harness.co.th` fallback. Confirm History shows `รอตรวจ Excel` and Admin Review receives the row.
- Admin review flow: approve one Excel report, reject one Excel report with a comment, and confirm user-side document status/email queue changes match the decision.
- Signed PDF close flow: user selects an approved report, uploads signed PDF, and confirm History/Admin Review show `PDF ส่งแล้ว`.
- Direct PDF flow: Admin opens direct-PDF permission on one Hiyari Assignment, confirm that assignee sees only direct signed-PDF submit mode, then submit one signed PDF and confirm status shows `PDF ส่งโดยตรง`.
- Submit-on-behalf flow: submit once for an assigned employee and verify reporter/submitted-by fields remain traceable in detail and audit history.
- Admin exception flow: use Admin Override only for a normal Excel report that needs to skip the usual approval step, require a reason, then verify audit/email behavior.
- Email operations: verify SMTP delivery on the company server and retry queued/failed Hiyari emails from Manage when needed.

ทุกตารางสร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` (try/catch) ใน `ensureTables()` ของ `backend/routes/hiyari.js`

### Constants (ทั้ง frontend + backend ต้องตรงกัน)
```js
// Frontend: public/js/pages/hiyari.js
const STOP_TYPES = [
    { id:1, code:'Stop 1', label:'อันตรายจากเครื่องจักร',        color:'#ef4444', bg:'#fef2f2', border:'#fecaca' },
    { id:2, code:'Stop 2', label:'อันตรายจากวัตถุหนักตกใส่',    color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
    { id:3, code:'Stop 3', label:'อันตรายจากยานพาหนะ',          color:'#eab308', bg:'#fefce8', border:'#fef08a' },
    { id:4, code:'Stop 4', label:'อันตรายจากการตกจากที่สูง',    color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
    { id:5, code:'Stop 5', label:'อันตรายจากไฟฟ้า',             color:'#3b82f6', bg:'#eff6ff', border:'#bfdbfe' },
    { id:6, code:'Stop 6', label:'อันตรายอื่นๆ',                color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' },
];
const RANKS = [
    { rank:'A', label:'Rank A', desc:'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail:'7 วัน',  color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
    { rank:'B', label:'Rank B', desc:'บาดเจ็บหยุดงาน',                   detail:'15 วัน', color:'#ea580c', bg:'#fff7ed', border:'#fed7aa' },
    { rank:'C', label:'Rank C', desc:'บาดเจ็บเล็กน้อย ไม่หยุดงาน',      detail:'30 วัน', color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
];
// Backend: backend/routes/hiyari.js
const RANK_TO_RISK = { A: 'Critical', B: 'High', C: 'Low' };
```

### Backend Route Ordering (Critical)
ต้องประกาศ specific routes **ก่อน** `/:id` เสมอ — Express v5 จะ match literal strings เป็น `:id` ถ้าประกาศหลัง:
1. `GET /stats`
2. `GET /dashboard-config`, `PUT /dashboard-config` (isAdmin)
3. `GET /assignments`, `POST /assignments` (isAdmin)
4. `POST /direct-signed` — before `/:id` signed-file/report routes
5. `PUT /assignments/:id` (isAdmin) — ก่อน `PUT /:id`
6. `DELETE /assignments/:id` (isAdmin) — ก่อน `DELETE /:id`
7. `GET /:id`, `PUT /:id`, `DELETE /:id`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /hiyari/stats?year=` | User | KPI + monthly + stopDist + rankDist + deptRank (top 20) + consequence |
| `GET /hiyari` | User | รายการรายงาน — filter params: `status`, `risk`, `dept`, `year`, `q` |
| `GET /hiyari/:id` | User | รายงานเดี่ยว |
| `POST /hiyari` | User | ส่งรายงาน (multipart: `attachment`) — backend validates `StopType` (1–6), `Rank` (A/B/C), derives `RiskLevel` |
| `POST /hiyari/direct-signed` | User | ส่ง signed PDF โดยตรงสำหรับ assignee ที่ Admin เปิด `AllowDirectSignedPdf` หรือ Admin; creates completed document-flow report and queues admin email |
| `PUT /hiyari/:id` | Admin | อัปเดต `Status`, `CorrectiveAction`, `AdminComment` |
| `POST /hiyari/:id/attachment` | Admin | อัปโหลดไฟล์เพิ่มเติม (admin file — `AdditionalFileUrl`) |
| `DELETE /hiyari/:id` | Admin | ลบรายงาน |
| `GET /hiyari/dashboard-config` | User | `{ pinnedDepts: [] }` |
| `PUT /hiyari/dashboard-config` | Admin | บันทึก `{ pinnedDepts: [...] }` |
| `GET /hiyari/assignments` | User | รายการมอบหมายทั้งหมด |
| `POST /hiyari/assignments` | Admin | เพิ่ม assignment (duplicate guard via UNIQUE KEY); accepts `AllowDirectSignedPdf` |
| `PUT /hiyari/assignments/:id` | Admin | แก้ไข assignment including `AllowDirectSignedPdf` |
| `DELETE /hiyari/assignments/:id` | Admin | ลบ assignment |

### Frontend Tab Structure
4 tabs: `dashboard` | `submit` (รายงานใหม่) | `history` (ประวัติ) | `manage` (admin only)

**Dashboard tab:**
- Toolbar: year picker + Export PDF button (`#hiyari-pdf-btn`)
- KPI cards (4): รายงานทั้งหมด / รอดำเนินการ / กำลังดำเนินการ / ปิดแล้ว
- Stop chart: `renderStopChart(data.stopDist)` — Chart.js bar, colors from `STOP_TYPES`
- Rank summary: `renderRankSummary(data.rankDist)` — horizontal progress bars
- Monthly line chart + Consequence pie chart
- Dept section: admin ตั้งค่าได้ (`#hiyari-dept-config-btn` → `openDashConfigModal()`); user เห็น pinned depts หรือ top 8

**New Report tab (Submit):**
- Stop Type card-radio: `grid grid-cols-2 sm:grid-cols-3 gap-2` — 6 cards จาก `STOP_TYPES`
- Rank card-radio: `grid grid-cols-1 sm:grid-cols-3 gap-2` — 3 cards จาก `RANKS`
- Date label: **"Created Date"** (ไม่ใช่ "วันที่เกิดเหตุ" หรือ "วันที่สร้าง")
- Validation: require `StopType` + `Rank` ก่อน submit (JS check บน hidden radio — ไม่ใช้ `required` attribute)
- File: `input[name="attachment"]` — CCCF file pattern (`file:bg-orange-50 file:text-orange-700`)

**History tab:**
- Columns: วันที่ / ผู้รายงาน / แผนก / **Stop Type** (badge inline style) / **Rank** (badge — fallback to RiskLevel for legacy) / สถานะ / actions
- Filter: สถานะ + "Rank" dropdown (options: ทุก Rank / Rank A=Critical / Rank B=High / Rank C=Low → maps to backend `risk` param)
- Stop badge: `style="background:${st.bg};color:${st.color};border:1px solid ${st.border}"` — ไม่ใช้ Tailwind arbitrary

**Manage tab (admin):**
- Section 1: Assignment manager (table + Add/Edit/Delete via `openAssignmentModal()`)
- Section 2: Reports table — columns: วันที่ / ผู้รายงาน+แผนก / รายละเอียด+Stop badge / Rank / สถานะ / actions
- `showManageModal(id)`: อัปเดต Status + CorrectiveAction + AdminComment + optional file replace

### Backward Compatibility Rules
- **Legacy records** (ก่อน Rank/StopType): มีเฉพาะ `RiskLevel` — แสดง `RISK_BADGE[r.RiskLevel]` fallback ในทุก tab
- **New records**: มี `Rank` + `StopType` + `RiskLevel` (derived) — แสดง RANK_BADGE + Stop badge
- History Rank filter maps to `risk=Critical/High/Low` — ทำงานกับทั้งเก่าและใหม่
- Yokoten button ใน detail modal: `['A','B'].includes(r.Rank) || ['High','Critical'].includes(r.RiskLevel)`

### Detail Modal (showDetailModal)
- Header block: Status badge + Stop badge + Rank badge (fallback RiskLevel)
- Info grid: Stop Type row (code + full label), Rank row (label + desc + days)
- File section: แยก `AttachmentUrl` (reporter) + `AdditionalFileUrl` (admin)
- Yokoten button: แสดงเมื่อ Rank A/B หรือ RiskLevel High/Critical

### PDF Export (exportHiyariPDF)
- html2canvas + jsPDF, scale:1.5, 2 หน้า A4 (794×1122px)
- หน้า 1: gradient header + 4 KPI boxes + Stop distribution bars + Rank distribution bars
- หน้า 2: Monthly trend table (12 cols) + Dept summary table + progress bars
- Dept data: filter ตาม `_dashConfig.pinnedDepts` ถ้าตั้งค่าไว้, fallback top 8
- Library check: `typeof html2canvas === 'undefined' || typeof jspdf === 'undefined'`
- Footer pattern: "หน้า X จาก 2" บน orange bar

### UI Rules (ต้องตรงกับ CCCF Form A Permanent)
- Input class: `form-input w-full rounded-xl text-sm`
- Select class: `form-select w-full rounded-xl text-sm`
- Layout: `grid grid-cols-2 gap-3`, `space-y-4 px-1`
- Card-radio: `peer hidden` + `peer-checked:ring-2 peer-checked:ring-orange-300`
- Banner: `bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800`
- Submit/Save buttons: `style="background:linear-gradient(135deg,#f97316,#ef4444)"`
- Module accent color: **orange** (`#f97316 → #ef4444`) — ห้ามใช้สีอื่น
- Stop/Rank badges: ใช้ inline `style=` ไม่ใช้ Tailwind arbitrary values (CDN ไม่ compile)

### State Variables
```js
let _chartStop   = null;   // Chart.js instance for Stop bar chart
let _chartRank   = null;   // (unused — rank uses HTML, not canvas)
let _dashConfig  = { pinnedDepts: [] };  // loaded from GET /hiyari/dashboard-config
let _assignments = [];     // loaded from GET /hiyari/assignments
```

### escHtml Requirement
ทุก user-generated content ใน innerHTML ต้องผ่าน `escHtml()` — import จาก `../ui.js`

## Hiyari Module — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: Executive Summary Strip, clickable KPI cards (filter History), overdue alert strip, monthly trend, consequence chart, STOP×Rank matrix, SLA Compliance Gauge, Top Overdue/Near Due list, Department Risk Ranking, Near-Miss Heatmap, pinned dept summary
- **KPI basis**: assignment-driven — total/submitted/pending/in-progress/closed/closure rate calculated against assigned employees (not raw report count)
- **SLA**: Rank A=7d, B=15d, C=30d — overdue rows: light red + "เกิน X วัน" badge; near-due: light amber + "เหลือ X วัน"
- **Submit**: full-width 3-step wizard (Stop Type → Details → Recommendation+Attachment), image preview before upload
- **History**: main admin control surface — view/filter/edit/delete/update status/export; clickable KPI cards auto-filter here; date range filter overrides year filter
- **Manage**: assignment-focused (roster + progress + dept summary) + **แบบฟอร์มที่เกี่ยวข้อง** section (Module Forms admin)
- **PDF**: 4-page executive pack (Executive Summary / Trend+STOP×Rank / Dept Risk / Action Follow-up)
- **Backend UUID**: use `crypto.randomUUID()` — installed `uuid` package is ESM-only

### Hiyari UX Rules

- Tabs: Dashboard=insight, Submit=report creation, History=report control, Manage=assignment+forms
- Hiyari accent color: orange (`#f97316 → #ef4444`)
- Stop/Rank badges: inline `style=` — ไม่ใช้ Tailwind arbitrary values

## KY Activity — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: executive alert strip, clickable KPI cards → filtered History, executive summary cards, Department Coverage progress (from `KY_Program_Config`), Recurring Hazard Pattern chart (top KYT Keywords), Dept×Month heatmap, and KYT Video Showcase with user reactions
- **Submit**: full-width form (wider enterprise grid), hazard/countermeasure side-by-side, attachment+video preview+clear, employee typeahead search for participants, yearly target progress strip, Admin submit-on-behalf from Employee Master, **แบบฟอร์มที่ต้องกรอก** card above attachment area
- **History**: main admin surface — year/dept/status/risk/date-range filters, KPI card clicks auto-filter; when `_filterHistDept='all'` and config exists, passes `depts=configDepts.join(',')` to backend; date range overrides year/month param
- **Manage**: 3 sub-tabs: `coverage` (department coverage + follow-up queue), `config` (KY_Program_Config CRUD), and `forms` (**แบบฟอร์มที่เกี่ยวข้อง** section)
- **Dashboard Video**: KYT Video Showcase reads existing `VideoUrl`, lets users react once per video (`useful`, `practice`, `awareness`, `attention`), and lets Admin pin/hide dashboard videos.
- **PDF**: 2-page executive pack (Executive Summary + Trend/Risk/Keywords / Coverage + Follow-up + Video Learning)
- **Backend**: `KY_Program_Config` table (per-dept yearly target + deadline + safety units + IsActive), `KY_Video_Reactions`, video dashboard flags on `KY_Activities`, `topKeywords` in `/stats`, `dateFrom`/`dateTo` params on `GET /ky`

### KY Hardening Notes (2026-05-21)
- `KY_Program_Config` is now enforced as one row per `Year + Department`; startup keeps the newest legacy duplicate row before adding the unique key, and batch config writes use DB upsert semantics.
- KY admin update validates `ActivityDate` against the same yearly target and one-record-per-department-per-month rules used by new submissions.
- KY audit logs now record activity create/update/delete and Program Config upsert/update/delete with KY-specific action names in `Admin_AuditLogs`.
- History search covers reporter, department, team, KYT keyword, hazard description, and countermeasure.
- KY upload handling returns JSON upload errors, clears rejected freshly uploaded files, limits evidence documents to 20 MB, and keeps video evidence at 200 MB. The submit and manage UI warn before sending oversized files.
- KY Dashboard now starts with a formal title/action header, alert strip, status KPI row, annual overview, and department tracker before charts. Current-year tracker numbers use current-month pending departments; past-year tracker shows yearly coverage instead of pretending it is the current month.
- KY Submit keeps normal users on their own login identity/department. Admin can search Employee Master in the submit form and send on behalf of one employee; backend accepts `ReporterEmployeeID` only for Admin, keeps that employee as `ReporterID/ReporterName/Department`, stores the actual operator in `SubmittedByID/SubmittedByName`, and writes the on-behalf context to the KY audit log.
- KY History separates submission source without creating a second record flow: table rows badge normal submissions vs `Admin ส่งแทน`, search includes `SubmittedByName`, source filter supports all/self/admin, detail shows `ผู้บันทึกแทน`, and Excel export includes submission source plus actual operator.
- KY Manage now opens with an Admin workspace header and 3 secondary tabs: Coverage & Follow-up, Program Config, and Forms. Coverage & Follow-up combines department coverage, pending departments, and the admin action queue in one formal workspace; Program Config shows yearly target/Safety Unit metrics; Forms manages related KY documents without being appended under Program Config.
- KY Dashboard now includes `KYT Video Showcase` for submitted videos. Backend creates `KY_Video_Reactions`, adds `ShowVideoOnDashboard` and `IsVideoPinned` to `KY_Activities`, and exposes `/api/ky/video-showcase`, `/api/ky/:id/reaction`, and `/api/ky/:id/video-dashboard`.
- KY Video Showcase reaction UI uses emoji + label while keeping the stored reaction keys unchanged: `👍 Useful`, `✅ Good Practice`, `💡 Awareness`, `⚠️ Attention`.
- KY PDF export is now a formal 2-page executive pack instead of 4 pages: page 1 focuses on KPI/trend/risk/themes, page 2 focuses on department coverage, follow-up queue, and video learning highlights.
- KY video reactions are intentionally listed in the permission audit user workflow allowlist because authenticated users are allowed to add/remove one reaction per KY video.
- KY Safety Unit coverage is now first-class: startup adds `KY_Activities.SafetyUnit`, submit requires a configured Safety Unit when the selected department has units, yearly/monthly duplicate checks are scoped per Safety Unit, and Dashboard/Manage progress uses `SafetyUnits.length × YearlyTarget` rather than one target per department.
- KY History/detail/Excel export now surfaces Safety Unit so Admin can trace which configured unit submitted each KY record.
- KY Submit now exposes **Main Department + Safety Unit** in the form. Department options come from active `KY_Program_Config` for the selected year, falling back to Master Departments; changing the department/date refreshes the Safety Unit list and target progress before submit.
- KY Admin edit now supports full submitted-detail correction: Activity Date, Main Department, Safety Unit, participants, status, KYT keyword, risk category, team name, hazard detail, countermeasure, admin comment, attachment, and video. Backend admin update revalidates yearly/monthly target rules against the edited Department + Safety Unit scope before saving.

### KY Specific Patterns
- `_kyProgConfig` — cached per year; cleared and re-fetched when year filter changes
- `_filterHistYear` change handler calls full `renderHistory(container)` (not just `fetchAndRenderHistory`) to refresh banner + dept dropdown
- `_manageSub` state: `'coverage'` | `'config'` | `'forms'`
- KY accent color: indigo (`#6366f1 → #8b5cf6`)

### KY_Program_Config Table
```sql
CREATE TABLE IF NOT EXISTS KY_Program_Config (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    Year         YEAR        NOT NULL,
    Department   VARCHAR(100) NOT NULL,
    SafetyUnits  TEXT,          -- JSON array of unit names
    YearlyTarget INT NOT NULL DEFAULT 12,
    DeadlineDay  TINYINT,       -- day-of-month (1–31)
    DeadlineNote VARCHAR(200),
    IsActive     TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ky_program_year_dept (Year, Department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### KY_Video_Reactions Table
```sql
CREATE TABLE IF NOT EXISTS KY_Video_Reactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    ActivityID  VARCHAR(36) NOT NULL,
    EmployeeID  VARCHAR(50) NOT NULL,
    Reaction    VARCHAR(30) NOT NULL,
    CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ky_video_reaction_user (ActivityID, EmployeeID),
    KEY idx_activity (ActivityID),
    KEY idx_reaction (Reaction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4M Change Management — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: Executive alert strip (overdue items), clickable KPI cards → filtered Notices, monthly line chart, Change Type pie chart, dept bar chart, Dept × Change Type matrix, plus Quick Access for external systems and module forms.
- **Change Notice tab**: Main admin/user surface — year/dept/status/overdue filters, overdue row highlighting (>30 days open/pending), Excel export (SheetJS), user create/close notice with file attachment, admin edit/delete/manage status for all notices.
- **Man Record tab**: Year filter, employee training/qualification records, admin-only create/edit/delete flow.
- **Backend**: `OVERDUE_DAYS=30` constant, auto-generated `NoticeNo`, login user as `ResponsiblePerson`, `overdueCount` + `byDeptType` in stats, `overdue=1` query param on GET /notices, `_handleUpload(field)` factory wrapping multer errors → JSON 400

### Tabs (order)
| Tab | ID | Description |
|-----|----|-------------|
| Dashboard | `dashboard` | KPI overview, alert strip, charts, dept matrix |
| Change Notice | `notices` | Main record surface — filter/create/close/export; users create and close own notices, admins can edit/delete/status-manage all notices |
| Man Record | `man` | Employee qualification tracking; admin-only create/edit/delete |

### Tables (existing — managed by dedicated routes)
| Table | Purpose |
|-------|---------|
| `FourM_ChangeNotices` | Change Notice records — `NoticeNo` (backend auto-generated as `4M-YYYY-###` from `RequestDate`), `Title`, `ChangeType` (Man/Machine/Material/Method), `Department`, `RequestDate`, `Status` (Open/Pending/Closed), `ResponsiblePerson` (login user on create), `AttachmentUrl`, `ClosingDoc`, `ClosedDate`, `ClosingComment`, `CreatedBy` |
| `FourM_ManRecords` | Man Record (employee training/qualification) — `RecordDate`, `EmployeeID`, `EmployeeName`, `Department`, `TestType`, `Score`, `Status` (Pass/Fail/Pending), `Remarks`, `ClosedDate`, `CreatedBy` |

### Backend Constants
```js
const OVERDUE_DAYS = 30;  // Open/Pending notices older than this are "overdue"
```

### Stats Response Shape (`GET /fourm/stats?year=`)
```js
{
  noticeKpi: { total, open, pending, closed },
  byType:    [{ ChangeType, count }],               // for pie chart
  monthly:   [{ month, count }],                    // for line chart
  byDept:    [{ Department, count }],               // for bar chart
  manSummary:{ total, pass, fail, pending },
  overdueCount: <number>,                           // Open/Pending > OVERDUE_DAYS
  byDeptType: [{ Department, ChangeType, count }]   // for Dept×Type matrix
}
```

### Overdue Filter (`GET /fourm/notices?overdue=1`)
- `overdue=1` overrides `status` filter: `AND Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30`
- Frontend: row with `daysOld > OVERDUE_DAYS` → inline `style="background:rgba(254,242,242,0.7)"` + "ค้าง X วัน" badge
- Status dropdown has special option `<option value="overdue">ค้างนาน (>30 วัน)</option>` that sets `_noticeFilter.overdue=true`
- Phase 3 adds `mine=1` to `GET /fourm/notices` for the `รายการของฉัน / My Notices` view; backend scopes it to `CreatedByID = req.user.id`.

### Dept × Change Type Matrix
Client-side transform of `byDeptType` array into HTML table:
- Rows = departments, Columns = Man/Machine/Material/Method
- Each cell shows count badge with TYPE_META inline colors
- Zero cells show `–`

### Clickable KPI Cards
```js
// data attributes drive navigation
data-filter-status="Open"      → _noticeFilter.status = 'Open', switchTab('notices')
data-filter-status="Pending"   → _noticeFilter.status = 'Pending'
data-filter-overdue="1"        → _noticeFilter.overdue = true, _noticeFilter.status = 'overdue'
```

### Alert Strip (`_buildAlertStrip`)
- Shown at top of dashboard only when `overdue > 0` or `pending > 0`
- Amber background: `background:linear-gradient(135deg,#fef3c7,#fde68a)`
- Clickable links are `<button class="fourm-kpi-nav">` with `data-filter-*` attributes
- If nothing to alert → returns empty string (no strip rendered)

### Hero Gradient
```css
background: linear-gradient(135deg, #064e3b 0%, #065f46 55%, #0d9488 100%)
```

### Change Notice Create / Ownership Rules
- `POST /fourm/notices` is available to authenticated users, not admin-only.
- `NoticeNo` is generated in `backend/routes/fourm.js` with `generateNoticeNo(RequestDate)` as `4M-YYYY-###`; the frontend shows the field as readonly/auto and does not submit it.
- `ResponsiblePerson` is set server-side from the login user (`req.user.name || req.user.EmployeeName || req.user.id`) on create; the frontend shows owner as readonly.
- Users can close their own notices; admins can close any notice.
- Closing a notice must go through `POST /fourm/notices/:id/close`; the generic admin update route rejects `Status=Closed` so `ClosingComment`, `ClosedDate`, and `ClosedBy` are not skipped.
- A closed notice cannot be switched back to Open/Pending through the generic admin update route; status reopening is intentionally not part of the current 4M lifecycle.
- The close route now requires a non-empty `ClosingComment` on the backend even though the frontend form already marks the summary field as required.
- Admins can edit, delete, and set `Pending` for all Change Notices from the Change Notice tab.
- Existing `PUT /fourm/notices/:id` remains admin-only and can update `ResponsiblePerson` for data correction/admin maintenance.

### Man Record Integrity
- `FourM_ManRecords` currently stores department-level totals: `TotalAttendance`, `Pass`, and `Fail`.
- The backend requires all counts to be non-negative integers and enforces `Pass + Fail = TotalAttendance`; `Pass` or `Fail` cannot exceed total attendance.
- The frontend keeps `Fail` as the computed remainder from total attendance minus pass to reduce inconsistent data entry before API validation.

### Impact Assessment
- Change Notice now captures lightweight impact assessment fields without changing the existing Open / Pending / Closed lifecycle:
  - `SafetyImpact`
  - `QualityImpact`
  - `ProductionImpact`
  - `EnvironmentImpact`
  - `TrainingRequired`
  - `ImpactNote`
- Valid impact levels are `N/A`, `Low`, `Medium`, and `High`; blank values default to `N/A`.
- `TrainingRequired` is a boolean flag used to mark changes that need extra communication or training follow-up.
- Backend auto-migration adds the new columns to `FourM_ChangeNotices` through `ensureTables()` in `backend/routes/fourm.js`.
- Frontend Change Notice create/edit form shows the Impact Assessment panel, detail modal displays impact badges, Notice Excel export includes the impact fields, and single Notice PDF includes the impact block.
- Audit metadata for Change Notice create/update includes the impact snapshot for traceability.

### Action Plan / Follow-up Task
- Added `FourM_ActionTasks` as a separate child table for Change Notice follow-up items. A Notice can have multiple tasks.
- Task fields: `TaskTitle`, `OwnerName`, `DueDate`, `Status` (`Pending`, `In Progress`, `Done`), `Notes`, `CompletedAt`, `CompletedBy`, creator metadata, and timestamps.
- API routes:
  - `GET /fourm/notices/:id/tasks`
  - `POST /fourm/notices/:id/tasks`
  - `PUT /fourm/notice-tasks/:taskId`
  - `DELETE /fourm/notice-tasks/:taskId`
- Permission rule: only the Notice creator or Admin can create/update/delete tasks; all authenticated users who can open the Notice can view the task list.
- Frontend Change Notice detail modal now shows Action Plan tasks with status badge, due date, overdue marker, and manage buttons for permitted users.
- Single Notice PDF includes the Action Plan table so follow-up tasks appear in formal exports.
- Audit actions added for task lifecycle: `FOURM_ACTION_TASK_CREATE`, `FOURM_ACTION_TASK_UPDATE`, `FOURM_ACTION_TASK_DONE`, and `FOURM_ACTION_TASK_DELETE`.

### Notification / Email Outbox
- Added `FourM_EmailOutbox` for 4M notification queue and status tracking. SMTP is optional; when `SMTP_HOST` is not configured, notifications remain queued instead of blocking the workflow.
- When SMTP is configured, 4M queues the email first and sends in the background so Change Notice/Action Plan save actions do not wait on SMTP. Set `FOURM_EMAIL_BACKGROUND=false` for smoke tests or maintenance runs that should only queue.
- Events currently queued:
  - `NoticeCreated` to the 4M admin email (`FOURM_ADMIN_EMAIL`, fallback `ADMIN_EMAIL`, fallback `sattaya_w@thaisummit-harness.co.th`)
  - `NoticePending` to the Notice creator when `Employees.CompanyEmail` exists
  - `NoticeClosed` to the Notice creator and admin
  - `ActionTaskCreated` and `ActionTaskDone` to admin plus Notice creator when available
- Admin routes:
  - `GET /fourm/email-outbox?status=&limit=`
  - `POST /fourm/email-outbox/:id/retry`
- Frontend 4M Dashboard shows an admin-only Email Outbox panel with latest queue items and Retry action for queued/failed emails.
- Smoke coverage checks required 4M outbox events in `backend/scripts/fourm-phase5-smoke.js`.

### Phase 4 Audit / Lifecycle
- 4M writes semantic `Admin_AuditLogs` entries for Change Notice create/update/set-pending/close/delete and Man Record create/update/delete.
- Audit actions use `FOURM_NOTICE_*` and `FOURM_MAN_RECORD_*` names with record ID plus compact metadata for Notice No, department, status, Change Type, counts, and attachment/closing-document presence.
- Close-route early rejects now clean up a newly uploaded closing document on not-found, permission denied, already-closed, or missing closing summary responses.

### Phase 5 Verification / Handoff
- Added focused workflow smoke coverage in `backend/scripts/fourm-phase5-smoke.js` for Change Notice create, My Notices scope, user/admin permission split, pending transition, close flow, closed-record reopen guard, Man Record CRUD/filter, and semantic 4M audit actions.
- Final verification on 2026-05-22:
  - `node --check backend/scripts/fourm-phase5-smoke.js`
  - `node backend/scripts/fourm-phase5-smoke.js`
  - `node --check backend/routes/fourm.js`
  - `node --check public/js/pages/fourm.js`
  - `git diff --check -- backend/scripts/fourm-phase5-smoke.js backend/routes/fourm.js public/js/pages/fourm.js CLAUDE.md`
  - `npm --prefix backend test`
- Focused smoke passed for the temporary 4M records it creates and cleans up; backend regression test also passed with Phase 5 UAT preflight `90/90`.

### TYPE_META Colors
```js
const TYPE_META = {
    Man:      { bg:'#eff6ff', text:'#1d4ed8', dot:'#3b82f6' },  // blue
    Machine:  { bg:'#fff7ed', text:'#c2410c', dot:'#f97316' },  // orange
    Material: { bg:'#f0fdf4', text:'#15803d', dot:'#22c55e' },  // green
    Method:   { bg:'#faf5ff', text:'#7e22ce', dot:'#a855f7' },  // purple
};
```

### multer Error Handling
`_handleUpload(field)` factory in `backend/routes/fourm.js` — same pattern as module-forms.js:
- Wraps `upload.single(field)` in callback
- multer errors → JSON `{ success:false, message }` 400 (not global 500)
- Used on: `POST /notices`, `PUT /notices/:id`, `POST /notices/:id/close`

### State Variables
```js
let _noticeFilter = { status:'all', type:'all', dept:'all', year: new Date().getFullYear(), q:'', overdue:false, mine:false };
let _manFilter    = { q:'', status:'all', year: new Date().getFullYear() };
let _departments  = [];    // lazy-loaded from /master/departments
let _statsData    = null;  // last /fourm/stats response
let _lastNotices  = [];    // last rendered notices list (used for Excel export)
let _fourmForms   = [];    // Module_Forms for 'fourm' module
let _chartManDonut = null; // Man Record pass/fail donut chart
```

### Excel Export (`_exportNoticesToExcel`)
- Uses global `XLSX` (SheetJS CDN in index.html)
- Exports `_lastNotices` (currently filtered list)
- Export now includes notice age, overdue flag, Notice attachment flag, and closing-document flag for follow-up review.
- Filename: `4M_Change_Notices_YYYY.xlsx`
- Guard: `if (typeof XLSX === 'undefined')` → toast error

### Man Record Filter / Export
- `GET /fourm/man-records` accepts `status=Pass|Fail|Pending` in addition to year/search so the department summary can be reviewed by result state.
- Man Record tab exports the currently filtered `_lastManRows` to Excel with department, exam date, counts, pass rate, status, notes, and recorder.
- Filename: `4M_Man_Record_YYYY.xlsx`

### Module Forms (Dashboard Quick Access)
- Loaded with `GET /module-forms?module=fourm` (active only for users, `&all=1` for admin)
- Rendered inside Dashboard Quick Access (`fourm-forms-dash`), not a standalone Systems tab.
- Admin: upload/manage from dashboard card (toggle active/inactive, delete)
- User: view/download from dashboard card
- Upload via `POST /module-forms` with `FormData` field `formFile`
- `ALLOWED_MODULES` in `module-forms.js` includes `'fourm'`

### `_renderDashInner()` Separation
- `renderDashboard(container)` creates the shell with year selector (once)
- `_renderDashInner()` fetches + renders dashboard content only — called on year change
- Prevents year selector from being re-created when changing year

### UX Rules
- Phase 2 adds a formal dashboard header with year/PDF controls and keeps Quick Access after the operational KPI/SLA/chart review path.
- Change Notice list uses a section intro and bilingual focus shortcuts; the create form shows concise guidance for auto Notice No, record ownership, and supporting attachments.
- Man Record UI must describe department-level exam summary counts, not individual employee qualification records.
- 4M hero accent color: emerald/teal (`#064e3b → #065f46 → #0d9488`); primary action accents remain indigo→sky (`#6366f1 → #0284c7`)
- Overdue rows: inline `style="background:rgba(254,242,242,0.7)"` on `<tr>` — not Tailwind arbitrary
- TYPE_META badges: inline `style=` — not Tailwind arbitrary values
- Alert strip clickable items are `<button class="fourm-kpi-nav">` — not `<a>` tags

## Module Forms — Architecture

แบบฟอร์มเทมเพลตที่ admin อัปโหลด (PDF/Word/Excel) ให้ user ดาวน์โหลด กรอก และนำมาแนบ

### Table
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT AUTO_INCREMENT PK | |
| `Module` | VARCHAR(50) | `'hiyari'` / `'ky'` / `'general'` |
| `Title` | VARCHAR(200) | ชื่อแบบฟอร์ม |
| `Description` | TEXT | |
| `FileUrl` | TEXT NOT NULL | local server file URL from `/uploads` |
| `PublicID` | VARCHAR(255) | local stored filename (legacy column name) |
| `FileType` | VARCHAR(100) | MIME type |
| `FileSize` | INT | bytes |
| `Version` | VARCHAR(30) | เช่น `v1.0` |
| `IsActive` | TINYINT(1) DEFAULT 1 | 1=แสดง, 0=ซ่อน |
| `SortOrder` | INT DEFAULT 99 | |
| `UploadedBy` | VARCHAR(100) | name หรือ EmployeeID |
| `UploadedAt` | DATETIME | |
| `UpdatedAt` | DATETIME ON UPDATE CURRENT_TIMESTAMP | |

สร้างอัตโนมัติด้วย `CREATE TABLE IF NOT EXISTS` ใน `ensureTable()` ของ `backend/routes/module-forms.js`

### API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /module-forms?module=hiyari` | User | active forms เท่านั้น |
| `GET /module-forms?module=hiyari&all=1` | Admin | ทุก form รวม inactive |
| `POST /module-forms` | Admin | upload form (multer field: `formFile`, 20 MB) |
| `PUT /module-forms/:id` | Admin | update metadata (title/desc/version/isActive/sortOrder) — ไม่รับไฟล์ใหม่ |
| `DELETE /module-forms/:id` | Admin | ลบ + server file storage fire-and-forget delete |

- Mount: `app.use('/api/module-forms', authenticateToken, moduleFormsRoutes)` ใน `server.js`
- `ALLOWED_MODULES = ['hiyari', 'ky', 'general']`
- multer ใช้ `_handleUpload` wrapper (ไม่ใช่ middleware ตรงๆ) เพื่อ catch multer errors → return JSON 400 แทน global 500

### Frontend Pattern (Hiyari + KY)
**Admin — Manage tab:**
- `_loadHiyariForms(adminAll=true)` → `_renderHiyariFormsManage()` → renders table ใน `#hiyari-forms-tbody`
- Toggle active/inactive ด้วย `PUT /module-forms/:id` (ส่ง full metadata + new isActive)
- Delete ด้วย `DELETE /module-forms/:id` (confirm modal)
- Upload modal: fields = title*, version, sortOrder, description, formFile* → FormData → `API.post('/module-forms', fd)`

**User — Submit tab:**
- `_loadHiyariForms(false)` → `_renderHiyariFormsUserCard(forms)` → inject ใน `#hiyari-forms-user-card`
- แสดงเฉพาะ `IsActive=1` — card สี orange (Hiyari) / indigo (KY)
- ปุ่ม "ดูไฟล์" (`target="_blank"`) + "ดาวน์โหลด" (`download` attribute)
- Load ด้วย fire-and-forget `.then()` หลัง form render (ไม่บล็อก render)

**KY specifics:**
- Forms section อยู่ใน `config` sub-tab ของ Manage (ไม่ใช่ coverage)
- `_renderKyFormsManageSection()` + `_renderKyFormsUserCard()` — ฟังก์ชันแยกเพื่อ KY accent color (indigo)

## Forklift Card Template Type Matching Handoff (2026-07-30)

Forklift card templates now support a one-or-two-license-type mapping through
`forklift_card_template_type_map`. The legacy
`forklift_card_templates.LicenseTypeID` column remains as the primary/fallback
type and is backfilled into the map automatically by both Node and PHP ensure
logic. Card rendering chooses an exact type-set template first, then a single
matching type, then an all-license template. This fixes combined
`Forklift + Stacker` licenses using the `Forklift` template.

Production deploy completed on 2026-07-30 as
`forklift-card-template-type-map-20260730`. Uploaded and SHA-256 verified:
`api/handlers/forklift.php`, `api/handlers/admin_phase8.php`,
`public/js/main.js`, `public/js/pages/forklift.js`, and
`deploy-manifest.json`. Backup:
`backups/production/forklift-card-template-type-map-predeploy-20260730-163801/`;
read-only forklift DB snapshot:
`backups/production/forklift-card-template-type-map-predeploy-20260730-163801/forklift-db-snapshot.json`;
upload verify:
`backups/production/forklift-card-template-type-map-upload-verify-20260730-164409/`;
final manifest verify:
`backups/production/forklift-card-template-type-map-final-manifest-verify-20260730-164742/`.
Authenticated Production smoke passed 12 checks at
`backups/production/forklift-card-template-type-map-smoke-20260730-164658/`.
The smoke created and deleted a temporary combined `Forklift+Stacker` card
template, verified both license type IDs were returned by the API, and left
temporary template rows at `0`. The temporary DB snapshot helper was removed
from Production and verified by HTTP `404` plus absent FTP listing. Upload
storage was not changed.

Follow-up hotfix `forklift-card-template-type-map-20260730-hf1` is also
deployed. Browser testing found `POST /api/forklift/templates` returned
`TemplateName is required` because the frontend created `FormData` after
`runFormBusy()` disabled the form controls. The template form now snapshots
`FormData` and sets `TemplateName` before entering busy state, and cache busts
were advanced in `index.html` and `public/js/main.js`. Hotfix backup:
`backups/production/forklift-card-template-formdata-hf1-predeploy-20260730-165625/`;
hotfix upload verify:
`backups/production/forklift-card-template-formdata-hf1-upload-verify-20260730-165649/`;
hf1 smoke:
`backups/production/forklift-card-template-formdata-hf1-smoke-20260730-165849/`.
Hotfix smoke passed 9 checks and left temporary template rows at `0`.

## Common Pitfalls

1. **Uploaded files live on disk now** — use `backend/storage.js`; files are saved under `backend/uploads/` and served from `/uploads`
2. **`backend/.env` path** — โค้ด dotenv ใช้ `__dirname + '/.env'` ไม่ใช่ root `.env`
3. **`Employees` primary key** คือ `EmployeeID` (string) ไม่ใช่ `id`
4. **Company MySQL/MariaDB port** is normally 3306 unless IT provides a different port
5. **Legacy password mode** — ถ้า `Password` column เป็น NULL จะใช้ EmployeeID เป็น password (ต้องย้ายมาใช้ bcrypt)
6. **Frontend เป็น SPA** — ทุก page อยู่ใน `index.html`, JS แยกตาม page ใน `public/js/pages/`
7. **localStorage key mismatch (fixed)** — `tsh_user` คือ key จริง แต่ใช้ `TSHSession.getUser()` เสมอ ไม่อ่าน localStorage โดยตรง
8. **Form fields ที่มาจาก JWT** — ต้อง `readonly`/`disabled` + `<input type="hidden">` เพื่อส่งค่าให้ form ได้รวม
9. **Express v5** — ใช้จริงใน production (`package.json` ระบุ `"express": "^5.1.0"`) ต่างจาก v4 ตรงที่ error handling และ async route errors
10. **bcrypt + bcryptjs** — มีทั้งสองตัวใน dependencies (ซ้ำซ้อน) — code ใช้ `bcryptjs` เท่านั้น, `bcrypt` เป็น native binding ที่ไม่จำเป็น
11. **`backend/uploads/`** — must exist on the company server and must be backed up together with MySQL
12. **`window.closeModal` pattern** — `closeModal` จาก `ui.js` ไม่ถูก expose บน window โดยอัตโนมัติ ต้อง set `window.closeModal = closeModal` ใน page module ก่อนเปิด modal ที่มี inline onclick
13. **Upload field name** — `POST /api/upload/document` ใช้ field ชื่อ `document` (ไม่ใช่ `file`) — multer config กำหนดไว้ใน `backend/storage.js`
13a. **Upload original filenames** — stored filenames are random/safe; original display/download name is carried in `?filename=...`. Use `showDocumentModal()` or parse `filename` metadata; do not display `path.basename(url)` as the real document name.
14. **`Admin_AuditLogs` table** — auto-created/auto-migrated by `backend/utils/audit.js`; no manual DBeaver SQL step is required for normal startup
14a. **Policy acknowledge-all is irreversible in normal UI** — `POST /api/policies/:id/acknowledge-all` marks every employee as acknowledged. It is idempotent and audit-logged, but there is no bulk undo button; use only after Admin confirmation.
15. **`safeCount()` in system health** — ตาราง module ใหม่อาจยังไม่มีใน DB ทำให้ health check return `null` แทน error
16. **Express route ordering** — `PUT /api/kpidata/bulk` ต้องประกาศ **ก่อน** `PUT /api/kpidata/:id` ไม่งั้น `/bulk` จะถูก match เป็น `:id`
17. **Machine Safety file upload field** — `POST /api/machine-safety/:id/files` ใช้ multer field ชื่อ `file` (ไม่ใช่ `document`) ต่างจาก generic upload endpoint
18. **Add machine → upload files** — ต้อง POST machine ก่อน → รับ `id` จาก response → แล้วค่อย upload files/links ทีละขั้น (multi-step creation)
19. **KPI_DATA_FIELDS whitelist** — column จริงใน DB คือ `Metric`, `Department` (ไม่ใช่ `MetricName`, `Category`) — ตรวจ whitelist ใน `server.js` ก่อนแก้ field names
20. **`machine-safety.js` enterprise fields** — `Status`, `RiskLevel`, `NextInspectionDate` ถูก auto-migrate ใน `ensureTables()` แล้ว รวมถึงตาราง `Machine_Safety_Compliance` และ `Machine_Safety_Issues` — ไม่ต้องรัน SQL แยก; `ensureTables()` ทำงานครั้งแรกที่ request มาถึง route
21. **EmployeeID format** — รองรับทั้งตัวเลข 6 หลัก (012609) และแบบ letter-prefix (AP0001, SP0001) — placeholder ทุกที่ต้องอ้างอิงทั้งสองรูปแบบ
22. **EmployeeID cascade update** — `PUT /api/profile/employee-id` ใช้ `pool.getConnection()` + transaction เพื่อ update Employees PK + 9 related tables แล้ว re-issue JWT ใหม่ — frontend ต้อง reload หลังสำเร็จ
23. **`isAdmin` ใน patrol routes** — `/api/patrol` mount ใช้ `authenticateToken` เท่านั้น ถ้าต้องการ admin-only endpoint ภายใน patrol.js ต้อง import `isAdmin` จาก `../middleware/auth` แล้วใส่เป็น per-route middleware (`router.post('/...', isAdmin, handler)`)
24. **`Patrol_Roster` auto-create** — สร้างด้วย `CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `patrol.js` — ไม่ต้องรัน SQL แยก; ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อให้ import/export ข้าม MySQL-compatible engines ง่ายขึ้น
25. **Patrol overview sub-tabs** — `ov-sub-mgmt` (Top&Management) และ `ov-sub-sv` (Sec.&Supervisor) แยก canvas ID: `ov-mgmt-pie` / `ov-sv-pie` — supervisor tab ใช้ yearly filter เท่านั้น (ไม่มี month filter แล้ว)
26. **Safety Units cascading** — `Master_SafetyUnits` มี `department_id` — ทั้ง registration form (`index.html`) และ profile drawer (`profile.js`) filter units ตาม department ที่เลือก ซ่อน unit select ถ้าไม่มี units ใน dept นั้น
27. **`/api/register/options` เป็น public** — ไม่ต้อง auth แต่ `apiFetch` จะส่ง auth header ไปด้วยถ้า token มีอยู่ — ไม่เป็นปัญหา backend ไม่ enforce auth บน route นี้
28. **`admin.js` ใช้ `API` object เท่านั้น** — import เป็น `import { API } from '../api.js'` ไม่ใช่ `apiFetch` โดยตรง — path ต้องไม่มี `/api/` นำหน้า (e.g. `API.get('/activity-targets/me')` ไม่ใช่ `API.get('/api/activity-targets/me')`)
29. **Activity Targets — hybrid architecture** — override (`Employee_Activity_Targets`) มีลำดับสูงกว่า template (`Activity_Position_Templates`) เสมอ — `getMergedTargets()` ใน `activity-targets.js` handle การ merge; ทั้งสอง table auto-migrate `IsNA` column ผ่าน `ALTER TABLE ... ADD COLUMN` (try/catch)
30. **Activity Targets — `IsNA` flag** — ถ้า `IsNA=1` → `YearlyTarget=0` และ activity ถูก filter ออกจาก `/me` response — ไม่แสดงใน compliance widget ของ user
31. **Activity Targets — `patrol_issue` actual count** — `Patrol_Issues` ไม่มี `ReporterID` column → `actualCount` คืน `null` เสมอ — ยังไม่รองรับ per-person tracking
32. **Activity Targets — compliance widget (pending)** — แต่ละ module page (patrol, cccf, training, yokoten, hiyari, ky, ojt) ยังไม่มี widget แสดง progress — ให้เพิ่มตอน restyle โดย call `GET /api/activity-targets/me` แล้วกรอง `activityKey` ที่ต้องการ
33. **Patrol PDF fixed-page approach** — ห้ามใช้ section-by-section render แล้ว addPage ตาม content height (จะเกิด whitespace gap) — ต้องสร้าง HTML `794×1122px` ต่อหน้าเสมอ แล้ว render ทีละหน้า
34. **Patrol roster add modal — filter both groups** — ตอน fetch รายชื่อพนักงานสำหรับ add modal ต้อง fetch ทั้ง `top_management` + `supervisor` roster พร้อมกัน แล้ว union เป็น `existingIds` เพื่อซ่อนคนที่อยู่ในกลุ่มใดกลุ่มหนึ่งแล้ว
35. **`Patrol_Sessions` PK คือ `SessionID` ไม่ใช่ `id`** — ทุก query ที่ SELECT จาก `Patrol_Sessions` ต้องใช้ `s.SessionID AS id` ไม่ใช่ `s.id` และ UPDATE/DELETE ต้องใช้ `WHERE SessionID = ?` — ถ้าใช้ `s.id` จะเกิด SQL error → 500 ทุกครั้ง; Columns จริง: `SessionID, PatrolDate, Year, Description, Area, CheckType, InspectorName, TeamName, Status, CreatedBy, TeamID, AreaID, PatrolRound`
36. **Unexpected token '<' มักคือ backend ส่ง HTML แทน JSON** — สาเหตุที่พบบ่อย: (1) `ALLOWED_ORIGINS` ไม่รวม frontend origin จริง (2) DB credentials หรือ JWT_SECRET ไม่ครบ (3) backend process crash; วิธีแก้: ตรวจ `.env`, CORS, server logs แล้ว restart backend
37. **`Patrol_Attendance` columns เพิ่มเติม** — มี `PatrolType VARCHAR(20)` (ค่า: `'normal'`, `'compensation'`, `'Re-inspection'`) และ `RecordedBy VARCHAR(50)` — ถูก auto-migrate ด้วย `ALTER TABLE ... ADD COLUMN` ใน patrol.js startup; `compensation` = เดินซ่อม ใช้ `PatrolDate` จาก missed sessions dropdown (ดึงจาก `Patrol_Sessions` ที่ผ่านมา)
38. **patrol.js ส่วนตัว layout** — `grid grid-cols-1 xl:grid-cols-3`: left column (xl:col-span-2) = check-in card, mini calendar, next patrol, year dots, monthly sessions, **Team Roster (ทีมของฉัน)**, Self-Patrol; right sidebar (xl:col-span-1) = performance ring, recent checkins, issues — Team Roster อยู่ใน left column เพื่อใช้พื้นที่กว้าง
39. **CCCF Target = จำนวนคน ไม่ใช่ครั้ง** — `yearly_target` ใน `CCCF_Unit_Targets` หมายถึงจำนวน unique คน (EmployeeID) ที่ต้องส่ง ไม่ใช่จำนวนครั้ง — `achieved = Set(EmployeeIDs).size`
40. **CCCF `achieved_override` — NULL vs 0** — `null` = ใช้ค่าจากระบบ (computed), `0` = admin ตั้ง override เป็น 0 จริงๆ — ต้องส่ง `null` ไม่ใช่ `''` เพื่อ clear override; backend แปลง empty string → `null` แล้ว
41. **CCCF Unit Summary DOM IDs** — outer wrapper: `id="cccf-unit-summary"`, inner re-renderable: `id="cccf-unit-summary-inner"` — ทุก function ที่ update summary ต้อง target `cccf-unit-summary-inner` และ call `setTimeout(() => initUnitChart(), 0)` หลัง `innerHTML =`
42. **CCCF "รายการของฉัน" wrapper** — `id="cccf-my-card-wrap"` ใน `renderPage()` — `window._myCardSetYear()` re-renders แค่ card นี้โดยไม่ reload ทั้งหน้า
43. **CCCF Chart horizontal bar** — ใช้ `indexAxis: 'y'` ใน Chart.js options — Y-axis labels truncate ที่ 22 chars ด้วย `callback: function(val) { const name = this.getLabelForValue(val); return name.length > 22 ? name.slice(0,21)+'…' : name }` — ห้ามใช้ vertical bar เพราะ X-axis labels ถูกตัดเมื่อมี unit มาก
44. **Machine Safety issues route ordering** — `PUT /issues/:issueId` และ `DELETE /issues/:issueId` ต้องประกาศ **ก่อน** `PUT /:id` และ `DELETE /:id` ในไฟล์ `machine-safety.js` — ถ้าประกาศหลัง Express จะ match `'issues'` เป็น `:id` ทำให้ไม่ทำงาน (Express v5 ใช้ path-to-regexp เหมือนกัน)
45. **Machine Safety row highlighting — inline style** — ใช้ inline `style="background:rgba(...)"` บน `<tr>` ไม่ใช่ Tailwind arbitrary value เช่น `bg-red-50/55` เพราะ CDN Tailwind ไม่ compile arbitrary opacity values ที่ไม่ได้ใช้ใน source
46. **`_msdSetAuditFilter()` toggles** — ถ้า user คลิก badge เดิมซ้ำ จะ clear filter (toggle off) และ sync dropdown `#msd-audit` ด้วย — ต้องทำทั้งสองทาง (badge คลิก ↔ dropdown เปลี่ยน) ให้ state `_filterAudit` เป็น source of truth
47. **Training module — department-based (ไม่ใช่ individual)** — `Training_Dept_Records` คือตารางหลักใน UI ปัจจุบัน; `Training_Records` (individual) ยังมีใน DB แต่ UI ไม่ใช้แล้ว — อย่าสับสนกัน; unique constraint คือ `(Department, Year, CourseID)` ไม่ใช่ `(Department, Year)` เพราะ 1 แผนก/ปี มีได้หลายหลักสูตร
48. **Training `CourseID` NULL-safe duplicate check** — MySQL UNIQUE index ถือ NULL เป็น distinct ทุกค่า (ไม่ conflict) → ต้องใช้ `CourseID <=> ?` ใน app-level guard ด้วย ไม่ใช่ `CourseID = ?` (ซึ่งจะไม่ match NULL)
49. **Training dashboard — Dept×Course Matrix** — คำนวณ client-side จาก `_deptRecords` (ดึงจาก `/training/dept-records?year=`); แสดงเฉพาะเมื่อมี 2+ courses; lookup key = `` `${dept}::${courseID ?? '__null__'}` ``
50. **`API.patch()` ใน `api.js`** — method PATCH ถูกเพิ่มแล้วใน `api.js`; `admin.js` ใช้ `API.patch(...)` สำหรับ toggle-cancel sessions — ห้าม import `apiFetch` โดยตรงใน `admin.js`
51. **contractor.js accent color = amber** — gradient `#d97706 → #b45309`, shadow `rgba(217,119,6,...)` — ห้ามใช้สี sky/blue ใน contractor module
52. **Yokoten Phase 3 — one response per dept** — `YokotenResponses` มี UNIQUE KEY `uq_dept_topic (YokotenID, Department)` — ใช้ `deptResponse` (singular) ไม่ใช่ array; ห้ามใช้ `myResponse` หรือ `UserID` lookup อีกต่อไป
53. **Yokoten `only_full_group_by` — ห้าม `SELECT r.* ... GROUP BY r.ResponseID`** — MySQL/MariaDB บางเครื่องเปิด `only_full_group_by`; ถ้าต้องการ files ให้ดึงแยกด้วย `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (...)` แทนการ JOIN + GROUP_CONCAT
54. **Yokoten response FormData** — `POST /yokoten/respond` และ `PUT /yokoten/respond/:id` รับ FormData (field: `responseFiles`) — ถ้าส่ง JSON จะไม่ได้รับไฟล์; `apiFetch` detect `body instanceof FormData` และข้าม `Content-Type` header อัตโนมัติ
55. **Yokoten approval status** — `null` = No/ไม่เกี่ยวข้อง (auto-approved/no action), `'pending'` = Yes/เกี่ยวข้อง รอ admin หลังแนบ action/evidence, `'approved'` = admin อนุมัติ, `'rejected'` = admin ปฏิเสธ; `CorrectiveAction` + evidence file required เมื่อ `IsRelated='Yes'` (validation ทั้ง client+server)
56. **Yokoten dept filtering — TargetDepts=[] = ทุกแผนก** — `_filterToTargetedDepts()` ต้องคืน deptSummary ทั้งหมดเมื่อ topic ใดมี `TargetDepts=[]`; ห้าม filter ออกทุกแผนกในกรณีนี้; ใช้ฟังก์ชันนี้ทุกที่ที่แสดงผลรายแผนก (dashboard, chart, admin dept tab, PDF)
57. **Yokoten RTE link/image — ต้องบันทึก selection ก่อนเปิด input bar** — `contenteditable` เสีย focus เมื่อ user คลิก input; ต้องเรียก `_saveSelection()` ใน mousedown handler (ก่อน `preventDefault`) แล้วค่อย `_restoreSelection()` ก่อน `execCommand`; ถ้าไม่ทำ link/image จะถูก insert ที่ตำแหน่งผิด
58. **Yokoten RTE `execCommand`/`queryCommandState` deprecated hint** — IDE แสดง hint code 6387 สำหรับทั้งสองคำสั่ง; นี่คือ spec deprecation ไม่ใช่ browser removal — ยังทำงานได้ในทุก modern browser; ไม่มีทางเลือกอื่นใน vanilla JS; ไม่ต้องแก้ไข
59. **`escHtml()` สำหรับ err.message ใน innerHTML** — ทุกที่ที่ inject `err.message` เข้า innerHTML ต้องผ่าน `escHtml(err.message)` เสมอ; import จาก `../ui.js`; ห้ามใช้ `err.message` โดยตรงใน template literals ที่ assign ให้ innerHTML เพราะเสี่ยง XSS
60. **patrol.js — routes ที่ต้องการ `isAdmin`** — POST/PUT/DELETE `/teams`, POST `/teams/:id/members`, DELETE `/teams/:teamId/members/:memberId`, POST `/member-rotation`, POST `/generate-sessions`, PUT `/sessions/:id`, DELETE `/sessions/:id` ทุกตัวต้องมี `isAdmin` middleware; CLOSE/UPDATE ใน POST `/issue/save` ก็ต้องมี admin check
61. **patrol.js — `/checkin` duplicate guard** — POST `/checkin` ตรวจ `Patrol_Attendance` ก่อน INSERT ว่า user เช็คอิน `(UserID, DATE(PatrolDate), PatrolType)` ซ้ำหรือไม่; return 409 ถ้าซ้ำ
62. **`PatrolType` whitelist** — รับได้เฉพาะ `['normal', 'compensation', 'Re-inspection']`; ค่าอื่น fallback เป็น `'normal'` อัตโนมัติ; กำหนดไว้ใน `ALLOWED_PATROL_TYPES` constant ใน patrol.js
63. **cascade EmployeeID warning log** — `.catch()` ใน cascade loop ไม่ใช่ silent swallow อีกต่อไป — log `console.warn` แสดงชื่อตารางและ error message เพื่อให้ debug ได้
64. **Activity Targets compliance widget** — `public/js/utils/activity-widget.js` export `buildActivityCard(activityKeys)` → returns async HTML card (glass style) สำหรับแปะต่อท้าย hero stats strip — import แล้วเรียกท้าย `_loadHeroStats()` / `_renderHeroStats()` โมดูลที่ใช้: hiyari (`'hiyari'`), ky (`'ky'`), yokoten (`'yokoten'`), training (`'training'`), ojt (`'scw'`); patrol+cccf ไม่ใช้เพราะแสดงข้อมูลเดียวกันอยู่แล้วในสตริป
65. **Legacy password auto-migration** — เมื่อ `user.Password` เป็น NULL (legacy mode) และ login สำเร็จ, server.js จะ fire-and-forget `bcrypt.hash` → `UPDATE Employees SET Password=?` โดยอัตโนมัติ — ครั้งถัดไปที่ user login จะใช้ bcrypt เต็มรูปแบบ; migration ล้มเหลว = `console.warn` แต่ login ยังผ่าน
66. **Password minimum 4 ตัว** — validation enforce ทั้ง PHP production (`api/handlers/foundation.php` register + change-password + admin reset), Node dev (`server.js` register + change-password), Admin reset route, และ frontend (index.html, main.js, profile.js, admin.js); strength indicator แสดง 5 ระดับตาม score: length>=4 + lowercase + uppercase + digit + symbol; อย่าตั้ง validation กลับไป 6 หรือ 8 ตัว
67. **`normalizeRole()` ใน server.js** — ต้องเรียกใน login handler ก่อน sign JWT ทุกครั้ง; ใช้ `ALLOWED_ROLES.find(ar => ar.toLowerCase() === r.toLowerCase())` — ถ้าไม่พบ fallback `'User'`; ป้องกันกรณี DB มี role เป็น `'admin'` lowercase แล้ว isAdmin check (`=== 'Admin'`) fail
68. **Soft delete pattern — `IsDeleted TINYINT(1) DEFAULT 0`** — ทั้ง `Accident_Reports` และ `YokotenResponses` ใช้ soft delete; DELETE endpoint → `UPDATE ... SET IsDeleted=1`; ทุก GET/summary/analytics query ต้อง filter `WHERE (IsDeleted IS NULL OR IsDeleted = 0)`; ใช้ NULL-safe เพราะแถวเดิมก่อน migrate จะมีค่า NULL ไม่ใช่ 0
69. **Accident soft delete — Attachments ยังคงอยู่** — การ soft delete `Accident_Reports` ไม่ลบ `Accident_Attachments` และไม่ลบไฟล์จาก server file storage; ถ้าต้องการลบไฟล์ให้ใช้ `DELETE /accident/attachments/:id` แยกต่างหาก
70. **Yokoten bulk approve — safe integer validation** — `POST /yokoten/bulk-approve` รับ `{ ids: [...] }` แล้ว map `parseInt(id, 10)` filter `!isNaN && > 0` ก่อน build `IN (...)` placeholder ทุกครั้ง — ห้าม interpolate ids โดยตรงใน SQL string
71. **Dashboard alerts — silent fail** — `GET /dashboard/alerts` ทุก sub-query ใช้ `.catch(() => [])` เพราะตารางบางอันอาจยังไม่มีใน DB; frontend `_loadAlerts()` ก็ `try/catch` silent — widget ไม่แสดงถ้าไม่มีรายการ (ไม่แสดง "0 alerts" section)
72. **Hiyari → Yokoten cross-module flow** — `hiyari.js` เขียน `sessionStorage.setItem('hiyari_to_yokoten', JSON.stringify({ title, description, riskLevel, sourceHiyariId }))` แล้ว navigate `location.hash = '#yokoten'`; `yokoten.js` อ่านใน `loadYokotenPage()` หลัง `refreshData()`, `removeItem` ทันที, switch tab admin→topics, เรียก `openTopicForm(null, prefill)` ด้วย `setTimeout(..., 150)` เพื่อให้ DOM settle; ถ้าไม่ใช่ admin → ไม่ดำเนินการ (try/catch คลุม)
73. **Accident PDF export — `window._accExportPDF(id)`** — สร้าง `div 794×1122px` position:fixed left:-9999px, render ด้วย html2canvas scale:1.5, จากนั้น jsPDF addImage A4; ใช้ helpers `_pdfField()` / `_pdfFieldFull()` ที่นิยาม local ในไฟล์; filename pattern: `ACC-XXXX-YYYYMMDD.pdf`; ต้องการ `html2canvas` + `jspdf` CDN (มีแล้วใน index.html)
74. **String normalization — filter comparison ต้อง `.trim()` ทั้งสองฝั่ง** — ค่า Department ที่มาจาก DB อาจมี leading/trailing whitespace จากการกรอก free-text ในอดีต; ทุก client-side filter ที่เปรียบเทียบ string กับ master data ต้องใช้ `(r.Field || '').trim() === masterValue`; master values ต้อง trim ตั้งแต่ตอน fetch: `.map(d => (d.Name || d.name || '').trim()).filter(Boolean)`; ห้าม mutate ข้อมูลใน `_ppeInspections` / `_assessments` โดยตรง — normalize เฉพาะตอน compare
75. **Department master data — `/master/departments` เป็น single source of truth** — ทุก module ที่มี department dropdown ต้องดึงจาก `GET /master/departments` (ไม่ใช่ hardcode หรือ derive จาก records); lazy-cache ใน module-level `_departments = []`; fetch ใน `_loadHeroStats()` พร้อมกับ fetches อื่นโดยใช้ `if (_departments.length === 0) fetches.push(_fetchDepts())`; `.catch()` ใน `_fetchDepts()` ต้อง return ค่าที่ทำให้ `_departments` เป็น `[]` — UI guard ด้วย `_departments.length > 0` ก่อนแสดง select และ filter bar; fallback เป็น `<input type="text">` เมื่อ departments ไม่พร้อม (graceful degradation ไม่ crash)
76. **Progress bar inline colors — ใช้ hex ตรงจาก `training.js` เสมอ** — color constants สำหรับ compliance/pass-rate progress bars: null → `#e2e8f0` (slate-200, ไม่ใช่ slate-400), pass → `#059669`, warn → `#d97706`, fail → `#ef4444`; ห้ามใช้ Tailwind class arbitrary value (CDN ไม่ compile); ห้ามใช้ hex ใกล้เคียงเช่น `#94a3b8` (slate-400) สำหรับ null state — จะทำให้ bar มองเห็นทั้งที่ไม่มีข้อมูล; thresholds ขึ้นอยู่กับ domain: training ใช้ 80%/60%, PPE compliance ใช้ 90%/70%
77. **Dropdown + filter pattern — ห้ามสร้าง abstraction ใหม่** — เมื่อต้องการ department filter บน tab: (1) ใช้ `<select onchange="window._xxxSetDeptFilter(this.value)">` inline ใน HTML template, (2) register `window._xxxSetDeptFilter = (val) => { _filterXxx = val; renderPanel(id); }` ใน `setupEventListeners()`, (3) filter ใน render function ก่อน compute stats — ไม่ต้องสร้าง helper class, factory, หรือ shared filter component; pattern นี้เหมือนกับ `_msdSetAuditFilter` ใน machine-safety.js
78. **Backend numeric range validation — `parseScore()` pattern** — ทุก route ที่รับคะแนน/score จาก user input ต้องมี helper validate: `if (val === '' || val == null) return null; const n = parseFloat(val); if (isNaN(n) || n < MIN || n > MAX) throw new Error('...')` แล้ว return rounded value; throw ใน try/catch → `res.status(400).json(...)` ก่อน INSERT/UPDATE; ห้าม insert raw `req.body` score โดยไม่ validate range
79. **SQL NULL-aware average — ห้ามใช้ `COALESCE(col, 0) / totalCount`** — เมื่อบางคอลัมน์ nullable ใน average calculation: `COALESCE(col,0)` จะนับ NULL เป็น 0 ทำให้ค่าเฉลี่ยต่ำกว่าความเป็นจริง; ต้องหารด้วย `NULLIF((col1 IS NOT NULL)+(col2 IS NOT NULL)+..., 0)` เพื่อหารเฉพาะจำนวนคอลัมน์ที่มีค่า; pattern นี้ใช้ใน `safety-culture.js` route `yearTrend` query สำหรับ T1–T5,T7 scores
