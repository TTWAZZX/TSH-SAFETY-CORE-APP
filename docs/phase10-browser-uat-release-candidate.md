# Phase 10: Browser UAT and Release Candidate Preparation

Date: 2026-07-23 (Asia/Bangkok)

Deployment status: **not deployed**. Phase 10 performed no production, staging,
FTP, hosting, remote database, commit, or push action. The onboarding release is
still **NO-GO for deployment** until the release-control gates below are closed.

## Local safety baseline

- Source branch: `main`; source HEAD: `ae63be2f93f3921ab8a677c7dc6fbd1decd4044c`.
- Local/UAT database: `uattshpc_safetytsh` on `localhost:3306` at
  `DESKTOP-CP3M7TL`.
- Pre-UAT backup: `backups/20260722-174115`.
- Email delivery was forced off in the Phase 10 runner before the application
  modules were loaded.
- Chrome ran with a unique temporary profile and a dedicated CDP port. Cleanup
  terminated only the Chrome process tree created by that run; existing browser
  sessions were not touched.
- The pre-existing dirty worktree was preserved. No reset, checkout, deletion of
  prior work, commit, or deployment manifest update was performed.

Backup checksums:

| Artifact | SHA-256 |
| --- | --- |
| `uattshpc_safetytsh.sql` | `ac47042a636915d7270a1d51c6fa0eba8171a13255b997435ed5b66102fac9ec` |
| `uploads.zip` | `3da747528aa96365a714021c031ac3486fa428035d3f236344282f4f1d60939c` |

## Authoritative real-browser UAT

Authoritative run: `backups/phase10-browser-U10MRWTS84F`.

Chrome exercised the actual local frontend, Apache/PHP-served static files, and
Express API. The runner passed 10 browser checks:

1. forced password-change modal;
2. password continuation and fresh session/token;
3. Safety Unit gate;
4. clean modal-to-gate transition with no stacked password modal;
5. READY User shell with admin UI hidden and admin API returning 403;
6. session persistence after a full refresh;
7. 390 x 844 mobile layout without horizontal overflow;
8. logout and repeat login with the new password;
9. READY Admin shell with admin UI visible;
10. Admin API returning 200, followed by logout.

Both synthetic employees resolved to `READY`. Five screenshots were visually
reviewed. The final result file SHA-256 is
`60bc41898d7cacbf0db9b71f8a5325105ec000d6a65687f92da74d542addd057`.

The first visual review found the closing password modal briefly stacked behind
the Safety Unit page. `public/js/main.js` now waits for the 300 ms close animation
before rendering the next onboarding surface. The cache boundary in `index.html`
was advanced to `20260723-phase10-browser-uat`, and the full browser flow passed
again after the correction.

### Cleanup and database result

Successful login uses an existing seven-day housekeeping rule in
`backend/server.js`. The first exploratory run therefore pruned 40 old successful
login-attempt rows. The fingerprint guard caught this. Those 40 rows were restored
with their original primary keys and timestamps from the verified SQL backup;
the restored row hash exactly matched the captured pre-run hash. The runner now
snapshots all original login-attempt rows and restores any rows removed by that
housekeeping inside cleanup before comparing fingerprints.

The authoritative run ended with:

- employees: 2,492;
- registration requests: 9;
- admin audit logs: 1,436;
- login attempts: 126;
- synthetic `U10%` employees/audits/login attempts: 0;
- employee, audit-log, login-attempt, and column-schema fingerprints restored.

The row contents and column schema are unchanged. As with normal insert/delete
UAT, InnoDB auto-increment sequence counters advance even after exact row cleanup;
they are not business data and were not reset with DDL.

## Final regression

`npm run verify:onboarding-local` passed after the browser correction:

- resolver: 10 cases with Node/PHP parity;
- backend enforcement: 11 cases;
- password continuation: 8 cases;
- Safety Unit continuation: 12 cases;
- profile validation: 16 cases;
- data-quality audit: 14 scenarios and read-only guard;
- cross-path profile enforcement: 16 cases;
- email kill switch: 4 Node/PHP checks with no network connection while off;
- permission inventory: ADMIN 219, INLINE_GUARD 55, USER_WORKFLOW 41;
- API smoke: 6/6;
- read-only API/permission preflight: 90/90;
- database resolver audit: 2,492 employees, zero unknown departments, zero
  resolver errors, and Node/PHP parity;
- final resolver distribution: PASSWORD_CHANGE_REQUIRED 2,453,
  SAFETY_UNIT_REQUIRED 3, READY 36.

Node syntax, relevant PHP lint, package JSON parsing, and scoped Git whitespace
checks passed. Port 5000 had no listener after cleanup. The duplicate
`RegistrationRequests` table is absent.

The Phase 10 starting worktree had 59 modified, 1 deleted, and 73 untracked
entries (133 total). The final tree has 59 modified, 1 deleted, and 75 untracked
entries (135 total). The two additional entries are the Phase 10 browser runner
and this report; all prior status entries remain present.

## Provisional onboarding release inventory

This is a review inventory, not a deploy manifest. `deploy-manifest.json` still
describes the previously deployed 2026-07-15 Patrol build and must not be used as
the Phase 10 artifact.

### Node runtime

- `backend/middleware/auth.js`
- `backend/middleware/onboarding.js`
- `backend/routes/admin.js`
- `backend/server.js`
- `backend/services/employee-profile-write.js`
- `backend/services/password-continuation.js`
- `backend/services/profile-update.js`
- `backend/services/safety-unit-continuation.js`
- `backend/utils/company-email.js`
- `backend/utils/email-requirement.js`
- `backend/utils/email.js`
- `backend/utils/onboarding-resolver.js`
- `backend/utils/profile-validator.js`
- `backend/utils/registration-email-template.js`

### PHP runtime

- `api/bootstrap.php`
- `api/config.php`
- `api/handlers/admin_phase8.php`
- `api/handlers/foundation.php`
- `api/index.php`
- `api/lib/employee_profile_write.php`
- `api/lib/onboarding_enforcement.php`
- `api/lib/onboarding_resolver.php`
- `api/lib/password_continuation.php`
- `api/lib/profile_update.php`
- `api/lib/profile_validator.php`
- `api/lib/safety_unit_continuation.php`
- `api/mailer.php`

### Frontend runtime

- `index.html`
- `public/js/api.js`
- `public/js/main.js`
- `public/js/pages/admin.js`
- `public/js/pages/profile.js`
- `public/js/session.js`

### Verification and operator assets

- `package.json`, `package-lock.json`, `backend/package.json`, and
  `backend/package-lock.json`
- `backend/scripts/onboarding-resolver.test.js`
- `backend/scripts/onboarding-db-audit.js`
- `backend/scripts/onboarding-enforcement.test.js`
- `backend/scripts/password-continuation.test.js`
- `backend/scripts/safety-unit-continuation.test.js`
- `backend/scripts/profile-validation.test.js`
- `backend/scripts/profile-cross-system-audit.js`
- `backend/scripts/data-quality-audit.js`
- `backend/scripts/data-quality-audit.test.js`
- `backend/scripts/cross-path-profile.test.js`
- `backend/scripts/email-delivery-switch.test.js`
- `backend/scripts/onboarding-local-uat.js`
- `backend/scripts/phase10-browser-uat.js`
- `api/tests/onboarding_resolver_runner.php`
- `api/tests/onboarding_enforcement_runner.php`
- `api/tests/password_continuation_runner.php`
- `api/tests/safety_unit_continuation_runner.php`
- `api/tests/profile_validation_runner.php`
- `api/tests/cross_path_profile_runner.php`
- `api/tests/email_delivery_switch_runner.php`
- `api/tests/uat_token_runner.php`
- `scripts/backup-safety-core.ps1`
- the Phase 5-10 documents under `docs/`

Several runtime files above contain unrelated work from the existing dirty
worktree. In addition, the entire `api/` tree is currently untracked relative to
HEAD. The inventory is therefore a dependency boundary for review, not authority
to copy only selected hunks or deploy the dirty working directory.

## Production configuration review

Only local configuration shape was inspected; secret values were not printed.
The Local/UAT environment is intentionally not production-ready:

- database host/name correctly identify Local/UAT;
- local database and JWT credentials are development-strength;
- `FRONTEND_ORIGINS` is not explicitly set;
- `EMAIL_ENABLED` is not explicitly set, while PHP defaults it to enabled;
- SMTP fields exist locally, but Phase 10 forced delivery off;
- production origins, database identity, secrets, SMTP decision, and TLS settings
  were not inspected or changed.

Production must explicitly set and independently verify a strong JWT secret,
database credentials/SSL policy, exact frontend origins, `EMAIL_ENABLED`, and all
SMTP values if email is approved. Secrets must be supplied outside the release
artifact.

## Release-control gates

Deployment remains **NO-GO** until all of the following are complete:

1. Create a reviewed clean release branch/commit that separates the onboarding
   dependency set from unrelated working-tree changes.
2. Review the mixed shared files and compare the untracked PHP tree with the
   actual deployed runtime; generate a new manifest and hashes from that reviewed
   commit, not from the current dirty directory.
3. Confirm production configuration through an authorized secret channel,
   including explicit origins and email on/off decision.
4. Assign a production backup/restore owner, deployment owner, validation owner,
   rollback decision owner, maintenance window, and rollback deadline.
5. Take a fresh production database/uploads/runtime backup immediately before
   deployment and verify that the restore command and backup location are usable.
6. Obtain explicit deployment approval. Phase 10 itself grants no deployment
   authority.

## Planned deployment and rollback boundary

When a later deployment is approved, use the reviewed manifest to back up every
replaced runtime file, deploy application files only (no schema migration or
employee bulk update), set production configuration separately, restart the
selected Node/PHP runtime, and run read-only health/login/onboarding checks.

Rollback must restore the exact pre-deploy runtime files and prior manifest,
restore the previous environment configuration, restart the runtime, and rerun
read-only health/session checks. Database restore is a last resort only if an
approved production write caused a verified data defect; this onboarding release
does not require a schema migration or mass Unit remediation.
