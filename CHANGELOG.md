# TSH Safety Core Activity - Changelog And Handoff History

This file preserves historical production handoff, smoke test, backup, deployment, migration, and phase notes moved out of `CLAUDE.md`.

## 4M White-screen Syntax Hotfix (2026-08-19)

Fixed the 4M page rendering as a blank white screen with browser console error
`Unexpected token '<'`. Three orphaned HTML/template lines remained outside a
function in `public/js/pages/fourm.js` after the Training Matrix duplicate-code
cleanup, preventing the entire ES module from parsing. The orphaned lines were
removed and the `main.js` plus 4M import cache keys were advanced to
`20260819-fourm-white-screen-hotfix`.

Production rollback files are stored at
`backups/production/fourm-white-screen-hotfix-predeploy-20260819-165556/`.
Uploaded runtime files were `index.html`, `public/js/main.js`, and
`public/js/pages/fourm.js`; FTP download-back SHA-256 matched 3/3 at
`backups/production/fourm-white-screen-hotfix-upload-verify-20260819-165556/`.
The final manifest-inclusive verification matched 4/4 at
`backups/production/fourm-white-screen-hotfix-final-verify-20260819-165841/`.
Production HTTP smoke returned the new cache markers and the exact local
`fourm.js` SHA-256 after JavaScript syntax and focused 4M regression passed.
No API, MySQL schema/data, upload storage, helper, or temporary test row changed.

Follow-up r2 was required after the browser exposed a second ES-module parse
failure (`Unexpected token 'class'`). The duplicate-code cleanup had also left
the Training History template incomplete, returned an unrelated variable from
`fetchTrainingPermissions()`, left audit-modal listener lines inside the delete
handler, and retained an extra closing brace. These fragments were restored or
removed against the last known-good function boundaries. Regression now parses
the complete source explicitly as an ES module with
`node --input-type=module --check`, which catches errors that the earlier
script-mode check missed. r2 rollback backup:
`backups/production/fourm-white-screen-hotfix-r2-predeploy-20260819-170450/`;
FTP SHA-256 verification passed 3/3 at
`backups/production/fourm-white-screen-hotfix-r2-upload-verify-20260819-170450/`,
final manifest-inclusive verification matched 4/4 at
`backups/production/fourm-white-screen-hotfix-r2-final-verify-20260819-172007/`,
and Production HTTP smoke passed with cache key
`20260819-fourm-white-screen-hotfix-r2` and the exact corrected module hash.

## 4M Change Notice And Training Matrix Stabilization (2026-08-19)

Fixed Admin editing a closed 4M Change Notice without choosing a replacement
attachment. The browser now omits an empty attachment field, and the PHP PUT
multipart parser ignores `filename=""` parts instead of rejecting them as an
unsupported upload. Existing attachments remain unchanged when no new file is
selected.

Stabilized Man Record > Training Matrix on the PHP production path with
required-field and status validation,
department permission checks, transactional curriculum/course/assignment
writes, safe transfer guards, explicit audit actions, and HTTP 409 responses
for duplicate curriculum or course data instead of generic HTTP 500 errors.
Unexpected schema, write, and email-queue failures are now logged server-side.
The frontend's repeated Training Matrix function implementations were removed,
leaving one implementation per action and adding the new audit action labels.
The SPA entry and 4M module import cache keys were advanced so browsers load
the corrected bundle after deployment.

4M email routing remains: `NoticeCreated` targets the configured 4M Admin
address; `NoticePending`, `NoticeClosed`, `ActionTaskCreated`, and
`ActionTaskDone` target the 4M Admin plus the notice creator's Employee Master
`CompanyEmail`, with duplicate addresses removed. Email queue failure remains
non-blocking for the business transaction and is now written to the PHP error
log.

Added focused multipart/source regression coverage in
`backend/scripts/fourm-stabilization.test.js` and its PHP fixture. Focused tests,
PHP/JavaScript syntax checks, permission audit, the complete backend suite,
API smoke, and 91-surface read-only UAT all pass locally. No upload file or
business-data mutation was made. Production read-only baseline confirmed every
Training Matrix endpoint used by the frontend returns HTTP 200 on the existing
schema, so the deployment does not introduce a schema or business-data change.

Production deployment completed on 2026-08-19. The rollback backup is stored
at `backups/production/fourm-stabilization-predeploy-20260819-152348/`; it
contains the five previous runtime files plus a complete download of Production
upload storage (774 files, 1,143,117,547 bytes). Uploaded runtime files were
`index.html`, `public/js/main.js`, `public/js/pages/fourm.js`,
`api/handlers/fourm_phase7.php`, and `deploy-manifest.json`. Final FTP
download-back SHA-256 verification matched 5/5 at
`backups/production/fourm-stabilization-final-verify-20260819-160239/`.

Authenticated Production smoke passed 11 checks at
`backups/production/fourm-stabilization-smoke-20260819T090007Z/result.json`:
static hashes and cache markers matched, auth boundaries and User Notice
validation behaved correctly, all six 4M/Training read paths passed, a closed
notice accepted an edit with no replacement attachment and retained its data,
duplicate Course Master returned HTTP 409, and invalid Man Record returned HTTP
400. Production has no Course Master unique index, so the final handler includes
an application-level duplicate guard without changing schema. Two temporary
Course Master rows created while discovering that legacy-schema condition were
hard-deleted; final temporary-row count is 0. No temporary backup helper was
uploaded, and FTP cleanup checks found zero helper/backup files. No MySQL schema,
business data, or Production upload-storage content remains changed by the
deployment; successful-login audit/housekeeping is the only expected side
effect.

## Safety Patrol Close Review Double-submit Fix (2026-08-18)

Fixed Safety Patrol > Issues Admin Approve/Reject showing a false 409 error after
the first request had already succeeded, closed/rejected the issue, and sent its
notification email. The frontend now locks both review buttons while a request
is in flight. The PHP production and Node development endpoints now use a
conditional Pending-state update and return an idempotent success response for
the same action when it was already processed, preventing duplicate event,
audit, and email records during concurrent clicks.

Close-approved and close-rejected notifications continue to target both the
close requester and the original reporter through Employee Master
`CompanyEmail`, with duplicate addresses collapsed to one message. No MySQL
schema, business-data, or upload-storage change is required. Local syntax,
PHP lint, JavaScript syntax, diff, and replacement-character checks passed. The
full backend regression subsequently passed with local MySQL available,
including API smoke and the 91/91 read/permission UAT preflight.

Production deployment completed on 2026-08-18. The rollback backup is stored
at `backups/production/patrol-close-review-idempotent-predeploy-20260818-084228/`.
Uploaded runtime files were `index.html`, `public/js/main.js`,
`public/js/pages/patrol.js`, `api/handlers/patrol.php`, and
`deploy-manifest.json`; FTP download-back SHA-256 verification matched 5/5 at
`backups/production/patrol-close-review-idempotent-upload-verify-20260818-084353/`.
Authenticated Production smoke passed 6/6 at
`backups/production/patrol-close-review-idempotent-smoke-20260818T084557/`:
static hashes/cache markers matched, the unauthenticated boundary returned 401,
Admin login returned 200, and a repeated approve for already-approved issue
`#90042` returned idempotent HTTP 200 without adding an event or email row.
The final manifest was separately SHA-256 verified at
`backups/production/patrol-close-review-idempotent-final-manifest-verify-20260818-084620/`.
No temporary helper or test row was created; remaining temporary rows: 0.

## Safety Core KY Unit/Monthly Count Fix (2026-08-17)

Fixed System Console > Safety Core Data showing inflated KY Ability values such
as `26/12` and `21/12` for departments that contain several Safety Units. The
old aggregation credited every unit activity to every employee in the same
department, in addition to the matching Safety Unit, and counted multiple KY
submissions in one month as separate annual target slots.

The Node and PHP paths now count distinct activity months, scope unit rows by
the combined Department + Safety Unit key, and use distinct department months
only for employees whose Unit is blank or for department-level KY rows.
Reporter, submitter, and participant matching is retained. Added a focused
Node/PHP parity regression at `backend/scripts/safety-core-ky-count.test.js`.
No database schema, production data, or upload-storage change is required.

Production deploy completed as `safety-core-ky-unit-monthly-fix-20260817`.
The rollback backup is stored at
`backups/production/safety-core-ky-unit-monthly-fix-predeploy-20260817-163831/`.
Uploaded runtime files were `api/handlers/admin_phase8.php` and
`deploy-manifest.json`; initial FTP download-back SHA-256 verification matched
2/2 at
`backups/production/safety-core-ky-unit-monthly-fix-upload-verify-20260817-163936/`.
Authenticated read-only Production smoke passed at
`backups/production/safety-core-ky-unit-monthly-fix-smoke-20260817T094056/`:
unauthenticated access returned 401, Admin login and Safety Core Data returned
200, and the 21 Production 1/2 rows contained 19 scoped KY values plus 2
intentional `N/A` targets. The maximum scoped numerator was `8/12`; the old
inflated `26/12` and `21/12` values were absent. No temporary helper or test
row was created; normal login audit/housekeeping was the only expected side
effect.

## Forklift Card Template Type Map Production Deploy (2026-07-30)

Fixed Forklift License card templates so Admin can create a template for the
combined `Forklift + Stacker` license type set. Template setup now accepts one
or two license types, stores the exact mapping in
`forklift_card_template_type_map`, and card rendering ranks exact type-set
matches ahead of single-type fallback templates. The legacy
`forklift_card_templates.LicenseTypeID` remains as the primary/fallback type.

Production deploy completed on 2026-07-30 as
`forklift-card-template-type-map-20260730`. Uploaded runtime files were
`api/handlers/forklift.php`, `api/handlers/admin_phase8.php`,
`public/js/main.js`, `public/js/pages/forklift.js`, and
`deploy-manifest.json`. The previous production files are backed up at
`backups/production/forklift-card-template-type-map-predeploy-20260730-163801/`;
the read-only forklift DB snapshot is
`backups/production/forklift-card-template-type-map-predeploy-20260730-163801/forklift-db-snapshot.json`.

FTP download-back SHA-256 verification matched 5/5 at
`backups/production/forklift-card-template-type-map-upload-verify-20260730-164409/`;
the final manifest upload was verified at
`backups/production/forklift-card-template-type-map-final-manifest-verify-20260730-164742/`.
Authenticated Production smoke passed 12 checks at
`backups/production/forklift-card-template-type-map-smoke-20260730-164658/`:
static cache bust and UI contract were present, Admin login worked, the
forklift route created/backfilled the schema, a temporary `Forklift+Stacker`
template persisted both license type IDs, card payload accepted the combined
type set when a combined license was available, and cleanup left temporary
template rows at `0`. The temporary DB snapshot helper was removed from
Production and verified by HTTP `404` plus absent FTP listing. No upload
storage mutation was performed.

Follow-up hotfix `forklift-card-template-type-map-20260730-hf1` was deployed
after browser testing showed `POST /api/forklift/templates` returning
`TemplateName is required`. Root cause: the frontend created `FormData` inside
the `runFormBusy()` task, after that helper disabled form controls; disabled
controls are omitted from browser `FormData`. The template form now snapshots
`FormData` and explicitly sets `TemplateName` before entering the busy state.
`index.html` and `public/js/main.js` cache busts were advanced to
`20260730-forklift-template-type-map-hf1`. Hotfix backup:
`backups/production/forklift-card-template-formdata-hf1-predeploy-20260730-165625/`;
hotfix SHA-256 verification matched 4/4 at
`backups/production/forklift-card-template-formdata-hf1-upload-verify-20260730-165649/`.
Production hf1 smoke passed 9 checks at
`backups/production/forklift-card-template-formdata-hf1-smoke-20260730-165849/`
and cleanup left temporary template rows at `0`.

Schema migration applied by PHP/Node ensure logic:

```sql
CREATE TABLE IF NOT EXISTS forklift_card_template_type_map (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  TemplateID INT NOT NULL,
  LicenseTypeID INT NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fl_template_type (TemplateID, LicenseTypeID),
  KEY idx_type (LicenseTypeID),
  KEY idx_template (TemplateID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO forklift_card_template_type_map (TemplateID, LicenseTypeID)
SELECT ID, LicenseTypeID
FROM forklift_card_templates
WHERE LicenseTypeID IS NOT NULL;
```

## Yokoten Production Soft-delete Restore Compatibility (2026-07-24)

Fixed Admin response-on-behalf failing with HTTP 500 when a selected
Production Department had a soft-deleted Yokoten response. The restore path
now reuses the existing `ResponseID` instead of changing it, preserving
compatibility with legacy references and database constraints. Stale
`yokoten_response_files` rows are cleared inside the same transaction before
new evidence is inserted; physical files are removed only after commit and
only when no response still references them.

Node.js and PHP retain the same behavior. Local verification passed scope
parity 8/8, bulk-response smoke 20/20, and a real PHP rollback probe confirmed
`RESTORED_RESPONSE_ID_REUSED=true`, `STALE_RESPONSE_FILES_CLEARED=true`, and
unchanged response/file fingerprints after rollback.

The PHP hotfix was deployed as
`yokoten-soft-delete-restore-hotfix-20260724`. The previous handler and
manifest are backed up at
`backups/production/yokoten-soft-delete-hotfix-predeploy-20260724-1213/`.
FTP download-back SHA-256 matched 2/2 at
`backups/production/yokoten-soft-delete-hotfix-upload-verify-20260724-1215/`.
Authenticated Production checks passed for topics and Department completion;
an invalid submit returned HTTP 400 and left active responses unchanged at
1/1. A valid Production response was deliberately left for the Admin to submit
because it is real business data, not test data.

## Machine & Device Safety Compact Master List Local (2026-07-24)

Redesigned the Machine & Device Safety frontend as a full-width workspace.
Desktop now opens in a compact 4-column Master List; mobile continues to open
in Card view. The list shows only Machine, Department/Area, Status/Risk, and a
combined readiness summary. Each row is clickable and keyboard accessible
(Enter/Space), opening a wider Detail modal with the complete master record,
Compliance, Issues, Files, and Admin Edit/Delete controls.

Information removed from the row remains available in the existing Detail
modal. The modal metadata now also includes Department, machine status, risk,
and remark, while its Compliance, Issues, and Files tabs and Admin controls
remain unchanged. The module shell no longer has a 1,440px cap and fills the
available application content width. No API, permission, schema, business-data,
or upload-storage behavior changed.

Local source contract, JavaScript syntax, and authenticated Chrome UAT passed
at desktop 1,424px and mobile 390px. UAT verified full-width layout, 4-column
List default on desktop, Card default on mobile, row-click and keyboard Detail
opening, complete Admin controls inside the modal,
Compliance/Issues/Files tabs, and no page-level horizontal overflow.
Evidence is at
`backups/local/machine-safety-responsive-20260724T061124/`.

Production deployment completed as
`machine-safety-row-detail-20260724`. The previous 5-file runtime boundary is
backed up at
`backups/production/machine-safety-row-detail-predeploy-20260724-1316/`.
FTP download-back SHA-256 matched 5/5 at
`backups/production/machine-safety-row-detail-upload-verify-20260724-1319/`.
Authenticated Production Chrome UAT passed at desktop 1,424px and mobile
390px with evidence under
`backups/production/machine-safety-responsive-20260724T061706/`. No schema,
business-data, or upload-storage mutation was performed.

## Dashboard D1-D5 / Hiyari / Yokoten Production Deploy (2026-07-24)

Deployed the PHP shared-hosting runtime for the canonical 15-card Dashboard
metric contract, Admin-configured Personal Target eligibility, the
assignment-driven Hiyari metric, and the Yokoten Admin bulk-submit HTTP 500
fix. No schema, business-data, or upload-storage migration was performed.

The exact 11-file Production boundary is recorded in `deploy-manifest.json`.
The pre-deploy rollback backup is
`backups/production/dashboard-hiyari-yokoten-predeploy-20260724-102545/`;
three new contract/helper files were correctly recorded as previously absent.
FTP download-back SHA-256 verification passed 11/11 at
`backups/production/dashboard-hiyari-yokoten-upload-verify-20260724-102805/`.

Authenticated read-only Production UAT passed at
`backups/production/yokoten-dashboard-readonly-uat-20260724T033127/`: all 15
canonical Module Health metrics and fields were present, Hiyari resolved from
Admin assignments as 29/66 (44%), Department Coverage contained 10
Departments with 8 non-zero CCCF Manual rows, Personal Targets returned one
mandatory Policy target plus only effective Admin-configured targets, and
Dashboard/Yokoten parity matched all 10 Departments. A deliberately invalid
Yokoten submission returned HTTP 400 and left response count unchanged at
1/1. Authenticated browser evidence at
`backups/production/yokoten-dashboard-browser-uat-20260724T033137/` passed
Dashboard rendering and Yokoten individual/select-all behavior for 9
Departments and 11 scoped Units with no business-data write. Successful login
audit/housekeeping was the only expected Production side effect.

## Yokoten Admin Bulk Submit HTTP 500 Fix Local (2026-07-24)

Fixed the Admin response-on-behalf submit path in PHP production parity and
Node development. The failure had two backend hazards: a soft-deleted response
could still occupy the unique `(YokotenID, Department)` slot and fail the first
INSERT, while a successful multi-Department save attempted synchronous SMTP
delivery once per Department and could exceed the PHP request timeout.

The endpoint now locks every selected Department row with `FOR UPDATE` and
persists all response/file rows atomically. Active responses still return 409.
A matching soft-deleted row is safely reused with its existing `ResponseID`,
current response values, reset approval metadata, replacement file rows, and
`IsDeleted=0`; unreferenced physical files are removed after commit. Bulk notifications are written to
`Yokoten_EmailOutbox` with `notificationMode=queued` and no synchronous SMTP
wait. Single-Department response behavior keeps immediate best-effort delivery.
No MySQL schema migration or upload-storage change is required.

Authenticated Production diagnosis was read-only except for the expected login
audit side effect and confirmed the failed request had inserted zero visible
responses: the latest topic still contained only the original
`PRODUCTION 1 SEC.` response. The final Local PHP handler probe submitted all
9 unanswered Departments inside an outer rollback transaction, exercised one
soft-delete collision, returned success with `restoredResponseCount=1`, and
verified an unchanged database fingerprint.

During development, the first rollback probe exposed that Yokoten's runtime
DDL caused an implicit transaction commit before the test writes. The exact
9 probe response rows and 8 probe outbox rows were identified and immediately
deleted; Local baseline was restored to 7 total responses / 1 active response.
The PHP table ensure now runs once per request, and the final probe no longer
leaves residue.

Verification passed: `verify:yokoten-admin-submit` (scope parity 8/8, static
contracts 20/20, PHP rollback handler probe), PHP lint, Node syntax,
`git diff --check`, full backend regression, and read-only API/permission
preflight 91/91. The fix was deployed and verified on Production in the release
record above.

## Dashboard Hiyari Assignment Metric Local (2026-07-24)

Changed the Hiyari Module Health card from raw report closure
(`closed reports / all reports`) to the assignment-driven KPI already used by
the Hiyari module. The denominator is every current `Hiyari_Assignments` row
configured by Admin. The numerator counts each assignment once when its
employee has at least one non-deleted `Closed` Hiyari report in the current
year. Completion is capped at 100%; no configured assignments returns `N_A`.
Raw current-year report/open counts remain available as operational details.

Node and PHP return the same canonical metric and legacy response metadata
(`assignmentTarget`, `assignmentClosed`, and `assignmentRemaining`). The card
shows the remaining assignments and advances to 100% only when all configured
assignments have a closed current-year report. Local data currently resolves
to 26/66, or 39%, with 40 assignments remaining.

Local verification passed: Hiyari read-only source integration, authenticated
Node/PHP overview parity, D5 gate 11/11, authenticated desktop/mobile Chrome
UAT, full backend regression, read-only API preflight 91/91, and unchanged
database fingerprints. Browser evidence is under
`backups/local/dashboard-d5-browser-20260724T025202/`; consolidated evidence
is under `backups/local/dashboard-d5-gate-20260724T025157/`.

## Dashboard Automated Tests / Local UAT D5 (2026-07-24)

Added a consolidated, read-only Dashboard release gate covering the 15-card
metric contract, Node/PHP calculation parity, authenticated Node and PHP
overview sources, Personal Target fixture/runtime parity, all-employee
eligibility classification, Department Coverage sources, SELECT-only metric
baseline audit, and authenticated Chrome UAT.

Personal Target UAT now selects READY employees in both eligibility states:
company Policy baseline only and effective Admin-configured targets. It checks
API/DOM row counts, mandatory Policy ordering, Node/PHP parity, the
company-baseline-only notice, all 15 canonical Module Health statuses, and
desktop/mobile page overflow. D5 writes test evidence only under
`backups/local`; it does not alter schema, business data, or upload storage.

Local verification passed: consolidated D5 gate 11/11, READY eligibility
availability 36 users (26 with Admin-configured targets and 10 baseline-only),
2,492/2,492 population classification with zero system-generated eligibility,
full backend regression, read-only API preflight 91/91, JavaScript/PHP/JSON
syntax, `git diff --check`, and changed-file encoding scan. Gate evidence is at
`backups/local/dashboard-d5-gate-20260724T023628/`; browser screenshots and
JSON evidence are at
`backups/local/dashboard-d5-browser-20260724T023633/`.

## Dashboard Personal Targets D3 / Module Health D4 Local (2026-07-24)

Personal Targets now always include current safety-policy acknowledgement as a
mandatory company baseline. Additional rows appear only when an effective
non-N/A Admin configuration resolves from employee override, Department/Unit
scope, or position template. Patrol Issue, Yokoten, Patrol roster, KY program,
and other module calculations can measure an eligible target but no longer
create Personal Target eligibility themselves. Users without additional Admin
targets receive a clear company-baseline-only state.

Dashboard Module Health now consumes the canonical D2 `moduleMetrics` response
for all 15 cards. Card percentages, status, source, reason, and values come
from the module contract. N/A and Data Unavailable are explicit Module Signal
states and no longer default to On Track; risk-count and information cards do
not receive synthetic percentages. Cache busting advanced to
`20260724-dashboard-d4`.

Local verification passed: 10 Node/PHP eligibility fixtures, authenticated
Node/PHP Personal Target runtime parity, 2,492/2,492 read-only eligibility
classification (2,095 with additional Admin targets, 397 company-baseline
only, zero system-generated eligibility), 15/15 canonical frontend contract
checks, and authenticated Chrome UAT on desktop/mobile with no page-level
horizontal overflow. Database fingerprints remained unchanged. No schema,
business-data, or upload-storage mutation was introduced.

## Dashboard Module Health Phase D2 Local (2026-07-24)

Implemented a backward-compatible canonical `data.moduleMetrics` response for
all 15 Module Health cards in both Node and PHP. Corrected Patrol and Yokoten
mixed-unit percentages, aligned Hiyari year/deletion scope, removed the KY
fallback target, capped Training passed counts, scoped current Policy and
Committee data, and added real progress sources for Machine Safety, OJT, and
Safety Culture. PHP 4M Training Required and matrix values now come from their
real tables instead of hardcoded zeros. Risk-count and information cards no
longer receive synthetic percentages in the canonical response.

Legacy overview response fields remain available and now derive their
percentages from the canonical metrics. No frontend, personal-target resolver,
schema, business data, or upload-storage change is included in D2.

Local verification passed: 15/15 contract mappings, 13 canonical fields, nine
backend correction assertions, seven Node/PHP calculation fixtures, six
read-only complex-source integrations, authenticated PHP overview contract
15/15, live Patrol/KY/Yokoten Node/PHP source parity, PHP/Node syntax checks,
and unchanged guarded database fingerprints.

## Dashboard Metric Contract Phase D1 Local (2026-07-24)

Added a machine-readable source contract for all 15 Dashboard Module Health
cards at `config/dashboard-module-health-contract.json`, with a human-readable
mapping and D2 handoff at `docs/dashboard-module-health-contract.md`. The
contract standardizes 0-100 progress semantics, same-unit numerator and
denominator requirements, `N_A` for absent denominators,
`DATA_UNAVAILABLE` for source failures, and non-percentage handling for
risk-count/information cards.

Added a database-independent Node/PHP/frontend mapping test plus a guarded
SELECT-only baseline audit. D1 intentionally does not change Dashboard API
responses, frontend formulas, PHP/Node runtime behavior, MySQL schema/data, or
upload storage. The frozen baseline gaps are inputs to D2/D3 and must be
replaced by positive contract assertions when those phases implement the
corrected formulas and personal-target eligibility.

Local verification passed: 15/15 Module Health source mappings, 13 canonical
metric fields, seven frozen D2/D3 baseline gaps, the existing 15-contract
Department Coverage smoke across 10 Departments, JSON/Node syntax checks,
`git diff --check`, and the changed-file encoding scan. The SELECT-only audit
confirmed an unchanged database fingerprint and classified all 2,492 employees
as 2,095 with at least one matching non-N/A Admin target configuration and 397
without an additional configured target.

## Yokoten Admin Department–Safety Unit Coupling Deployed (2026-07-23)

Implemented and deployed the Yokoten Admin on-behalf response control follow-up. Root cause of the apparently silent individual Department controls was the delegated async action guard resolving the surrounding response form through `closest('[data-id]')` and restoring the form HTML after each click. Department and Safety Unit choices now use accessible row controls with centralized state, the response form is excluded from that action-lock target, and selecting every unanswered Department also selects only the topic-scoped Units that belong to those Departments.

The frontend sends an explicit `departmentUnits` mapping. PHP production and Node development validate the same canonical per-Department Unit plan against `master_departments`, `master_safetyunits`, and the topic scope before inserting one response per Department. Legacy topic values `QC1` and `QC2` resolve uniquely to current master names `QC1 AUTO` and `QC2 MOTOR`. Unknown/ambiguous scope, wrong-Department Units, missing required Units, unselected mapping keys, and values exceeding the existing `YokotenResponses.SafetyUnit VARCHAR(100)` limit fail closed. No MySQL schema/data migration or upload-storage change was required.

Local verification passed: full backend regression, read-only API preflight 91/91, Node/PHP scope parity 8/8, Yokoten bulk-response smoke 14/14, PHP/Node syntax checks, mojibake scan, `git diff --check`, and authenticated Chrome UAT. Local UAT selected `MAINTENANCE SEC.` with 2/2 scoped Units, cleared it successfully, selected 9/9 unanswered Departments with 11/11 scoped Units, toggled an individual Unit, and preserved Yokoten response count at 1/1.

Production rollback backup was captured before upload at `backups/production/yokoten-admin-scope-predeploy-20260723-175817/`; the new `api/lib/yokoten_admin_scope.php` correctly had no previous remote version. Uploaded runtime files were `index.html`, `public/js/main.js`, `public/js/pages/yokoten.js`, `api/handlers/workflow_phase6.php`, `api/lib/yokoten_admin_scope.php`, and `deploy-manifest.json`. Download-back SHA-256 verification passed 6/6 at `backups/production/yokoten-admin-scope-upload-verify-20260723-180042/`. The final post-UAT manifest was uploaded separately and SHA-256 verified at `backups/production/yokoten-admin-scope-final-manifest-verify-20260723-180214/`.

Authenticated Production browser UAT passed at `backups/production/yokoten-dashboard-browser-uat-20260723T110106/`: Dashboard rendered 10 rows without page-level overflow; Yokoten individual Department selection and clearing worked; 9/9 unanswered Departments and 11/11 scoped Units were selected; individual Unit toggling worked; and response count remained 1/1 because Submit was never called. Expected Production side effects were limited to successful-login audit/attempt records and normal login housekeeping.

## Machine & Device Safety Responsive Layout Deployed (2026-07-23)

Implemented and deployed a frontend-only responsive layout release for Machine & Device Safety. Card view is now the default on desktop and mobile, while List view remains available and contains its wide table inside a module-scoped horizontal scroller instead of widening the application page. The module content shell is capped at 1,440px, desktop filters use a responsive grid, mobile advanced filters start collapsed behind a toggle, cards use one column on phones, and pagination remains usable at narrow widths. Cache busting advanced to `20260723-machine-safety-responsive`.

No PHP/Node API behavior, MySQL schema/data, or upload storage changed. Local source-contract smoke, JavaScript syntax, `git diff --check`, and authenticated Chrome UAT passed at desktop 1,424px and mobile 390px. Local browser evidence is stored under `backups/local/machine-safety-responsive-20260723T101256/`.

Production rollback backup was captured before upload at `backups/production/machine-safety-responsive-predeploy-20260723-171920/`. Uploaded runtime files were `index.html`, `public/style.css`, `public/js/main.js`, `public/js/pages/machine-safety.js`, and `deploy-manifest.json`. Download-back SHA-256 verification passed 5/5 at `backups/production/machine-safety-responsive-upload-verify-20260723-172036/`.

Authenticated Production browser UAT passed at `backups/production/machine-safety-responsive-20260723T102124/`: desktop and mobile had no page-level horizontal overflow, Card view loaded by default, Desktop List view scrolled only inside the results frame, mobile cards stayed inside the viewport, and advanced filters started collapsed and expanded successfully. No business-data endpoint was called; expected Production side effects were limited to successful-login audit/attempt records and normal login housekeeping.

## Yokoten Admin Bulk Response / Dashboard Source Alignment Deployed (2026-07-23)

Implemented and deployed a code-only PHP shared-hosting release for Yokoten Admin on-behalf response selection and Dashboard Department Coverage source alignment. Yokoten now uses directly clickable Department and Safety Unit checkboxes, supports selecting every unanswered Department in one action, and keeps already-answered Departments disabled. Dashboard `CCCF A (Manual)` now aggregates the configured CCCF Units from `cccf_unit_sel`, Unit yearly targets, manual achieved overrides, and actual worker records when no override exists. Yokoten coverage now follows the module's selected year and Unit scope, OJT deterministically selects the latest current Department record, and all visible coverage columns expose numerator/denominator/source metadata in tooltips.

Local verification passed: full `npm --prefix backend test`, 91/91 read/permission preflight, Dashboard source contracts 15/15 across 10 configured Departments, Yokoten bulk-response smoke 10/10, PHP lint, Node syntax, `git diff --check`, and no newly introduced replacement characters. The release required no MySQL schema/data migration and no upload-storage change.

Production rollback backup was captured at `backups/production/yokoten-dashboard-predeploy-20260723-162854/`. Uploaded runtime files were `index.html`, `public/js/main.js`, `public/js/pages/yokoten.js`, `public/js/pages/dashboard.js`, `api/index.php`, `api/handlers/targets.php`, and `deploy-manifest.json`. Download-back verification passed SHA-256 7/7 at `backups/production/yokoten-dashboard-upload-verify-20260723-163041/`.

Authenticated Production read-only API UAT passed at `backups/production/yokoten-dashboard-readonly-uat-20260723T093207/`: all 10 Dashboard rows returned source metadata, 8 CCCF Manual rows were correctly above 0%, and Yokoten Dashboard/module parity passed 10/10 Departments. Browser evidence is stored at `backups/production/yokoten-dashboard-browser-uat-20260723T093903/`: Dashboard rendered 10 rows without page-level horizontal overflow, and the Yokoten Admin modal showed 10 Department choices with 9 unanswered choices selectable and the already-answered Department disabled. No business write endpoint was called; expected Production side effects were limited to successful-login audit/attempt records and normal login housekeeping.

## Onboarding Phases 1-10 Deployed (2026-07-23)

Prepared the shared-hosting PHP production bundle for the centralized onboarding resolver, backend enforcement, password and Safety Unit continuation, cross-system profile validation, data-quality review, cross-path enforcement, frontend integration, and Phase 10 browser UAT. The bundle is code-only: no schema, employee data, or upload-storage mutation is planned.

Local release gates passed: Node/PHP resolver and enforcement parity, continuation/profile/data-quality suites, API smoke, 91/91 read-only API/permission preflight, PHP lint for 35 files, and read-only classification of all 2,492 employees with zero unknown departments. Final Chrome functional UAT passed 12 checks and cleanup restored the original database fingerprints with zero synthetic residue. External CDN access was unavailable during the final browser run, so overflow assertions were recorded as not asserted; an earlier CDN-enabled Phase 10 visual run passed desktop/mobile checks.

Production code rollback backup was captured before upload at `backups/production/onboarding-phase10-predeploy-20260723-085043/`. The exact 20-file deployment boundary and SHA-256 values are recorded in `deploy-manifest.json`. No production database export helper or forged authentication token was used; the deployment did not change schema, employee data, or upload storage.

Production FTP upload completed for all 20 files. Download-back SHA-256 verification passed 20/20 at `backups/production/onboarding-phase10-upload-verify-20260723-094042/`, and the protected `api/config.local.php` hash remained identical to the pre-deploy backup. Read-only HTTPS/API smoke passed 8/8 at `backups/production/onboarding-phase10-smoke-20260723-094310/`: application shell, release cache markers, public register options/branding, and unauthenticated onboarding/admin/profile boundaries all returned the expected status and content type. Authenticated production onboarding UAT was not run because no real production test credential was supplied; no credential was fabricated from the server secret.

Authenticated Production UAT was subsequently completed with real test credentials supplied through ignored `backend/.env` variables. Evidence is stored at `backups/production/production-authenticated-uat-20260723T042711/`. The User account resolved to `READY`, passed five authenticated API checks, was denied the Admin endpoint as expected, and rendered the READY shell in Chrome. The Admin account resolved to `READY`, passed six authenticated API checks including Admin dashboard/audit-log reads, and rendered the READY Admin shell in Chrome. No Password, Safety Unit, or Profile write endpoint was called; expected Production side effects were limited to successful-login audit/attempt records and normal login housekeeping.

GitHub release commits are prepared locally through `e638127`, but the push remains pending because this workstation has no stored GitHub account and Git Credential Manager device authentication did not complete. Production is running the content identified by runtime source commit `d18eaee` plus the deployed manifest metadata.

## Current Handoff Status (2026-05-21)

Use this section when switching accounts or resuming work. The current production target is the company server with Company MySQL/MariaDB and local server storage in `backend/uploads/`. Do not push to GitHub unless the user explicitly asks in the current chat.

## Patrol Schedule Refresh / Supervisor Quota Fix Local (2026-06-05)

Implemented locally for Safety Patrol first-load session state and Sec. & Supervisor scheduled quota behavior. Runtime changes: `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, `api/handlers/patrol.php`, and `backend/routes/patrol.js`.

Behavior: Patrol now re-syncs `TSHSession.getUser()` whenever `loadPatrolPage()` runs, so Admin controls and personal profile data are not stuck on the module-import fallback user (`EMP001`) until refresh. Sec. & Supervisor detail now loads all non-cancelled `Patrol_Sessions` rows for the selected year instead of slicing each month down to the old target distribution. Monthly minimum is calculated from the actual scheduled count for that month as `ceil(scheduled sessions / 2)`, so 4 sessions require 2 records and 2 sessions require 1 record. Admin on-behalf and personal Self-Patrol check-in pickers show all uncompleted scheduled rows for the relevant scope, including future scheduled dates.

No MySQL schema/data migration and no upload-storage change are required. Local verification passed: PHP lint for `api/handlers/patrol.php`, Node syntax checks for `backend/routes/patrol.js`, `public/js/pages/patrol.js`, and `public/js/main.js`, `git diff --check`, diff-scoped mojibake marker scan, and `npm --prefix backend test` with UAT preflight `93/93`.

Production deployment is still pending for this local fix. A temporary FTP deploy helper was prepared, but the FTP run was blocked by sandbox/network approval usage before a successful production backup or upload occurred. No production files were changed by this attempt.

## Patrol Permission Detail Hotfix Deployed (2026-06-05)

Implemented and deployed a follow-up for Safety Patrol Team & Overview -> Sec. & Supervisor user accounts. Root cause: `GET /api/patrol/attendance-detail` allowed non-Admin users to read only their own EmployeeID, while the Sec. & Supervisor overview table intentionally lets regular users open read-only roster-member detail rows. PHP production and Node dev now allow read-only attendance detail when the requested employee belongs to the requested `Patrol_Roster` group; non-roster requests still return `403 Permission denied.`. `GET /api/patrol/my-self-patrol` now returns `{ isSupervisorPatrol:false, checkins:[] }` for non-supervisor roster users instead of surfacing a 404 from the supervisor detail builder.

Changed runtime files: `api/handlers/patrol.php` and `backend/routes/patrol.js`. The final deployed bundle also re-uploaded the existing hotfix runtime files `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, and `public/js/ui.js` so production static hashes match the current local bundle. No MySQL schema/data migration and no upload-storage change were required.

Local verification passed: `C:\xampp\php\php.exe -l api\handlers\patrol.php`, `node --check backend/routes/patrol.js`, `git diff --check -- api/handlers/patrol.php backend/routes/patrol.js`, mojibake scan for replacement/Latin-1 markers on changed runtime files, and `npm --prefix backend test` with UAT preflight `93/93`.

Production deploy completed on 2026-06-05. Production code backup was created first at `backups/production/patrol-permission-detail-hotfix-code-20260605-140212/`. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, `public/js/ui.js`, `api/handlers/patrol.php`, and `backend/routes/patrol.js`; verify downloads are stored in `backups/production/patrol-permission-detail-hotfix-upload-verify-20260605-140212/`. Static HTTPS hash smoke matched local files for `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, and `public/js/ui.js`; unauthenticated `GET /api/patrol/attendance-detail?...` returned `401`.

Authenticated read-only production smoke used temporary helper `codx_patrol_permission_smoke.php`, then deleted it and verified HTTP `404`. Smoke result: regular user `009812` reading Sec. & Supervisor roster peer `001320` returned HTTP `200`; non-roster detail request returned HTTP `403`; non-roster `GET /api/patrol/my-self-patrol` returned HTTP `200` with `isSupervisorPatrol:false`. No permanent production rows were created.

## Patrol Schedule Source / Upload URL Hotfix Deployed (2026-06-05)

Implemented and deployed a focused Safety Patrol follow-up for schedule source-of-truth behavior plus legacy upload URL normalization. Changed runtime files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, `public/js/pages/patrol.js`, `public/js/ui.js`, `public/js/main.js`, and `index.html`. Local-only agent documentation `AGENTS.md` was also updated with Session Continuity rules but was not uploaded to production because it is not runtime code.

Behavior: Admin on-behalf Top/Management and Sec.&Supervisor records now require a real `ScheduledSessionID`; completed scheduled rounds are hidden from the admin picker; Top duplicate guard also treats legacy same-date records without `ScheduledSessionID` as completed. Supervisor monthly requirement now derives from the Activity Target / yearly target distribution instead of relying on a hardcoded `2` fallback. Self-Patrol display no longer falls back to `2/24` when target data is absent. The shared document viewer and Patrol image resolver normalize legacy `localhost` or `127.0.0.1` upload URLs to the current production `/uploads/...` path to avoid browser `ERR_CONNECTION_REFUSED`.

Local verification before deploy passed: `node --check backend/routes/patrol.js`, `node --check public/js/pages/patrol.js`, `node --check public/js/main.js`, `C:\xampp\php\php.exe -l api\handlers\patrol.php`, `git diff --check -- AGENTS.md api/handlers/patrol.php backend/routes/patrol.js index.html public/js/main.js public/js/pages/patrol.js public/js/ui.js`, mojibake scan of changed files, and `npm --prefix backend test` with UAT preflight `93/93`.

Production deploy completed on 2026-06-05. Production code backup was created first at `backups/production/patrol-schedule-upload-hotfix-code-20260605-131214/` for `index.html`, `public/js/main.js`, `api/handlers/patrol.php`, `public/js/pages/patrol.js`, `public/js/ui.js`, and `backend/routes/patrol.js`. Uploaded and FTP SHA-256 verified the same six files; verify downloads and HTTP smoke files are stored in `backups/production/patrol-schedule-upload-hotfix-upload-verify-20260605-131214/`.

Production schema snapshots before and after upload verified `patrol_attendance.ScheduledSessionID`, `patrol_self_checkin.ScheduledSessionID`, `idx_patrol_attendance_session`, and `idx_patrol_self_checkin_session` already exist. No new MySQL schema migration or data migration was required for this hotfix. Counts during snapshots: `patrol_attendance=225`, `patrol_self_checkin=2`.

Production smoke passed: static HTTPS hashes matched local files for `index.html`, `public/js/main.js`, `public/js/pages/patrol.js`, and `public/js/ui.js`; `index.html` references `public/js/main.js?v=20260605-patrol-upload-hotfix`; `main.js` imports `ui.js?v=20260605-patrol-upload-hotfix` and `patrol.js?v=20260605-patrol-upload-hotfix`; production Patrol/UI files contain the schedule picker and legacy upload normalization markers. Production API dispatch returned `401 No token provided` for unauthenticated Patrol overview. Authenticated validation smoke through a temporary guarded helper returned HTTP 400 for both `POST /api/patrol/admin-record` and `POST /api/patrol/admin-record/supervisor` when `ScheduledSessionID` was missing, without creating DB rows. The temporary helper `codx_patrol_deploy_schema_1312.php` was deleted from production and verified by HTTP `404` plus absent FTP listing.

## Patrol Supervisor Schedule Linkage Deployed (2026-06-05)

Implemented locally for Safety Patrol Sec. & Supervisor schedule linkage. Changed files: `api/handlers/patrol.php`, `backend/routes/patrol.js`, `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, `ARCHITECTURE.md`, `CHANGELOG.md`, and `CLAUDE.md`.

Behavior: Admin Sec. & Supervisor on-behalf recording now selects from real scheduled patrol items built from `Patrol_Sessions`; selected records are stored on `Patrol_Self_Checkin.ScheduledSessionID`. Personal Self-Patrol check-in also shows open scheduled items, requires the user to select one, and removes completed scheduled items from the open list. Supervisor/section-head visibility now accepts either `Master_Positions.IsSupervisorPatrol` or `Patrol_Roster.RosterGroup='supervisor'`, so rostered supervisors see their required work even if the position master flag is missing. Monthly requirements are still derived from the current target resolver and yearly target distribution, preserving Admin-set targets.

Schema/runtime notes: PHP production compatibility and Node dev parity auto-add nullable `ScheduledSessionID` plus an index to `patrol_self_checkin` / `Patrol_Self_Checkin`. Legacy supervisor records without `ScheduledSessionID` still count as fallback completions when their check-in date matches an open scheduled date.

Local verification completed after repairing local XAMPP MySQL: `node --check backend\routes\patrol.js`, `node --check public\js\pages\patrol.js`, `node --check public\js\main.js`, and `C:\xampp\php\php.exe -l api\handlers\patrol.php` passed. Full `npm --prefix backend test` passed, existing `node backend\scripts\patrol7e-smoke.js` passed, and a focused authenticated supervisor schedule smoke passed for self-checkin selected schedule, duplicate scheduled item HTTP 409, completed schedule hidden from open list, admin on-behalf selected schedule, and cleanup remaining count 0.

Production deploy completed on 2026-06-05 for Safety Patrol supervisor schedule linkage. Production backup was created first at `backups/production/patrol-supervisor-schedule-code-20260605-091527/` with `api/handlers/patrol.php`, `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, and `backend/routes/patrol.js`. A pre-deploy read-only Patrol schema/count snapshot was captured at `backups/production/patrol-supervisor-schedule-db-snapshot-20260605-091931/`; before migration, `patrol_self_checkin` had no `ScheduledSessionID` column and row count was 0. Uploaded and FTP SHA-256 verified: `api/handlers/patrol.php`, `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`, and `backend/routes/patrol.js`; verify downloads are in `backups/production/patrol-supervisor-schedule-upload-verify-20260605-091527/`.

Production static smoke stored in `backups/production/patrol-supervisor-schedule-static-smoke-20260605-092142/` verified that production `index.html` references `public/js/main.js?v=20260605-patrol-supervisor-schedule`, production `main.js` imports `patrol.js?v=20260605-patrol-supervisor-schedule`, and production `patrol.js` contains supervisor scheduled-linkage markers including `ScheduledSessionID`, `openSchedule`, and `admin-record/supervisor`. Production authenticated write smoke stored in `backups/production/patrol-supervisor-schedule-smoke-20260605-092101/` passed with marker `CODX_PATROL_SUP_SCHED_PROD_092101`: supervisor self-checkin selected scheduled slot `2` for employee `009812` on `2026-01-28`, duplicate scheduled supervisor item returned HTTP 409, completed supervisor schedule disappeared from the open list, Admin on-behalf supervisor recording linked the same scheduled slot, and cleanup left `Patrol_Self_Checkin` temporary rows remaining count 0. Temporary smoke helpers were deleted from production and verified by HTTP 404.

Post-deploy schema check stored in `backups/production/patrol-supervisor-schedule-postschema-20260605-092142/` verified `patrol_self_checkin.ScheduledSessionID` exists, `idx_patrol_self_checkin_session` exists, and remaining temporary smoke rows are 0. Production DB schema migration applied by `ensure_patrol_schema()` during smoke: nullable `patrol_self_checkin.ScheduledSessionID` plus index. No upload/storage path changed.

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
- Hiyari email smoke testing uses `backend/scripts/hiyari-email-flow-smoke.js` so Thai test content is read as UTF-8 and does not become question-mark replacement text through PowerShell piping. The script sends real emails for Submitted, Approved, SignedFileUploaded, Closed, Reopened, Rejected, ReviewOverrideApproved, and DirectSignedSubmitted loops.
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
