# Project-wide Production Deployment Dependency Audit

Date: 2026-10-26 (Asia/Bangkok)

Decision: `PASS_PROJECT_WIDE_PRODUCTION_DEPENDENCY_AUDIT_AND_DEPLOYMENT_CONTROL`

This audit covered the PHP shared-hosting runtime, every PHP route handler registered by `api/index.php`, PHP libraries/bootstrap/configuration, the frontend entry chain, 22 deployment scripts, Production drift, authenticated/anonymous API smoke, desktop/mobile Browser smoke, PHP 7.4 compatibility and Node/PHP parity. After explicit approval, the four-file critical drift hotfix was deployed from immutable commit `fe3494197db3beb7405f4a79a8fadbc0da9702cf` with guarded rollback and verification. No database migration, rollback or Production data repair was performed.

## Executive result

- Git integrity passed at immutable `fe3494197db3beb7405f4a79a8fadbc0da9702cf`: the initial worktree was clean, `HEAD == origin/main`, `fe34941` was an ancestor, and `git fsck --full --no-reflogs` reported no broken ref or invalid object. Unreachable/dangling objects were informational only.
- The initial double-download found 164/168 files matching `HEAD` and four PHP drift files. After the approved guarded hotfix, a fresh full double-download passed 168/168 with zero drift and zero blocked files.
- The PHP entry closure contains 95 files. Static symbol inspection found 1,318 defined functions, 1,486 called functions, nine defined classes, 19 referenced classes, 71 defined constants and 128 referenced constants, with zero unresolved function, class or constant after internal and explicitly guarded optional symbols were accounted for.
- The frontend entry closure contains 72 files. All audited frontend files, including `index.html`, CSS, `public/js/main.js`, module loaders and page modules, matched Production.
- Production API smoke passed 35/35 checks with no 5xx, PHP warning/fatal text or invalid JSON. It covered authenticated Admin GETs, ordinary-user boundaries, anonymous boundaries and all principal modules.
- The initial Browser run passed rendering but opening Safety Vote sent two engagement-event POSTs, one per viewport. The post-deploy read-only Browser runner intercepted this endpoint locally and then passed 44/44 checks at 1366x768 and 390x844 with no 5xx, page/console error, horizontal overflow or unexpected Production mutation.
- Local PHP lint passed for 158 tracked PHP files. The project-wide PHP 7.4 contract passed across 159 discovered PHP files. The fresh post-deploy Production copy contains zero occurrences of the audited PHP 8-only APIs/syntax.
- Node/PHP parity passed 25/25 selected contracts: Safety Vote phases 1-7, authorization, workflow profiles, visibility remediation, result release, dashboard metrics, personal targets, cross-path profile, Yokoten and BBS phases 1-10A.
- Deployment-script analysis found 22 scripts: three remain active under the strict closure/control audit and 19 historical release scripts are now centrally classified and fail closed before credentials or Production connectivity can be used. The current root `deploy-manifest.json` remains historical BBS evidence from August 2026, not a current project-wide dependency manifest.

## Production drift

| File | Production SHA-256 | Expected `fe349419` SHA-256 | Impact | Risk |
|---|---|---|---|---|
| `api/config.php` | `4c93dffb8145e7d7fda7ffb267e0287be9f92c02ee20b578bc390df653b89f8f` | `ba00faa6e56e8ebe2868df6630c804d2c9137728491eb18e082f8d3c9589ed32` | Shared configuration lacks the current `public_api_url` projection. | Medium |
| `api/handlers/branding.php` | `21dbc94b31d7c79f6c3d60485c0b0c72c0ad6ee058555c3bf34e49702c44c331` | `ce43adf1125439f06a8c04920a667fde300678b7e62d24486fb56202fb63ba38` | Production still calls PHP 8-only `str_starts_with`; PHP 7.4 can fail with an undefined function when the branch is evaluated. | High |
| `api/handlers/johnny_ai.php` | `3ea4d8dab5d23e05c0195dddffbaa10e886ccb17ee3cda0bbf6a68ad56387609` | `0869c4089dd84ab18e9db7d49f19f58822c642040f011312060461097311b1d8` | Production lacks current suppression/fallback handling for unavailable Johnny upload bytes. | Medium |
| `api/handlers/workflow_phase6.php` | `2d9fc109055a3e244a5cf48cff9190614fe17381a75b6d94518a2763d6f614c8` | `8dd9796e1cf88cbe9cb07c71eb4b03dec7caeb15573e0bf108e68cced3507c01` | Production still calls PHP 8.1-only `array_is_list` in KY participant parsing. | High |

All four rows above are the pre-remediation state. The approved deployment replaced them with the exact immutable candidate bytes, and the final 168-file audit reports zero drift.

The Production copies of the three handlers match the repository state immediately before `9fb0b3aa`; the Production `api/config.php` matches an older state before `e771dd66`. The 164 matching files include `api/index.php`, `api/bootstrap.php`, all Safety Vote casing-hotfix files from `fe34941`, and the complete frontend entry/cache chain.

## Module status

| Module/runtime area | Result | Evidence |
|---|---|---|
| Shared PHP entry, bootstrap and libraries | PASS | Final 168-file checksum audit matches the immutable candidate, including `api/config.php`, `api/index.php` and `api/bootstrap.php`. |
| Login / Auth / Session | PASS | UAT Admin/User login succeeded; authenticated and anonymous boundaries were correct; no 5xx/fatal. Normal login audit side effects occurred as expected. |
| Branding / Public Branding | PASS | Handler now matches the PHP 7.4-compatible candidate; endpoint smoke passed. |
| Dashboard | PASS | Runtime checksum and authenticated GET passed. |
| Employee / Profile / Search | PASS | Runtime checksum, Admin/User permission boundary and GETs passed. |
| Safety Vote | PASS | Runtime/API/casing checks passed; post-deploy Browser smoke suppressed engagement telemetry locally and emitted no unexpected Production mutation. |
| BBS Smart Card | PASS | PHP/frontend checksums and read endpoints passed. |
| Patrol | PASS | PHP/frontend checksums and read endpoint passed. |
| CCCF / Hiyari / KY / Yokoten | PASS | Shared handler matches the PHP 7.4-compatible candidate; API and Browser checks passed. |
| Accident | PASS | Runtime checksum and summary GET passed. |
| Training | PASS | Runtime checksum and GET passed. |
| KPI | PASS | Runtime checksum and GET passed. |
| Policy / Committee | PASS | Runtime checksums and GETs passed. |
| Johnny AI | PASS | Handler and missing-upload fallback now match the candidate; status GET passed. |
| File Library | PASS | Runtime checksum and Admin GET passed. |
| Forklift | PASS | Runtime checksum and dashboard GET passed. |
| Machine Safety | PASS | Runtime checksum and GET passed. |
| Contractor | PASS | Runtime checksum and stats GET passed. |
| Safety Culture | PASS | Runtime checksum and dashboard GET passed. |
| 4M | PASS | Runtime checksum and stats GET passed. |
| Frontend entry/cache chain | PASS | All audited HTML/CSS/JS files matched; desktop/mobile rendering had no 5xx/error/overflow. |

No Production 5xx, PHP warning, fatal error or observed undefined-function response occurred during the API/Browser checks. The two latent PHP 8-only calls identified in the pre-deploy files are absent from the final Production copy.

## Approved Production hotfix

- Deployment decision: `PASS_PROJECT_WIDE_DEPENDENCY_HOTFIX_PRODUCTION_DEPLOYMENT`.
- Immutable source commit: `fe3494197db3beb7405f4a79a8fadbc0da9702cf`.
- Scope: exactly four PHP files from the drift table; candidate bytes were read from Git, not from the dirty working tree.
- Guarding: fresh double-download, exact known pre-deploy SHA-256, rollback backup, local PHP lint/PHP 7.4 rejection, dependency-before-consumer upload, double-download post-upload verification and automatic rollback on failure.
- Rollback evidence: ignored Local Production evidence `backups/production/project-wide-dependency-hotfix-20261026022515/`; manifest SHA-256 `39d79c7c4ba9c4d3abaffb535e2c7f849576c1cba45f36ae459df50091c11097`; four restore files.
- Result SHA-256: `f270452f515cb83a18dc93f3fc1bbedcd7e103bee2d5425476c029d327cce6fb`.
- Post-deploy verification: API 35/35, Browser 44/44, unexpected mutations 0, full Production drift 168/168, blocked 0, PHP 8-only scan hits 0.

## Deployment script audit

The strict test requires a deterministic literal scope, dependency closure, backup before write, double-download verification, post-deploy checksum, rollback package and temporary-helper cleanup.

Passing after Local hardening:

- `backend/scripts/safety-vote-phase7-production-deploy.js`
- `backend/scripts/safety-vote-phase96-guarded-feature-deploy.js`
- `backend/scripts/safety-vote-wizard-layout-production-deploy.js`

Formally archived and non-executable through the central fail-closed deployment policy:

- `app-bootstrap-production-deploy.js`
- `app-compact-safety-vote-production-deploy.js`
- `file-library-production-deploy.js`
- `registration-first-login-production-deploy.js`
- `safety-vote-account-advisory-production-deploy.js`
- `safety-vote-eligibility-amendments-production-deploy.js`
- `safety-vote-independent-banner-production-deploy.js`
- `safety-vote-live-promotion-production-deploy.js`
- `safety-vote-open-feedback-production-deploy.js`
- `safety-vote-phase104-production-deploy.js`
- `safety-vote-phase95a-guarded-runtime-deploy.js`
- `safety-vote-phase96-admin-target-production-deploy.js`
- `safety-vote-phase96-mime-production-deploy.js`
- `safety-vote-preview-gallery-production-deploy.js`
- `safety-vote-promotion-image-ux-production-deploy.js`
- `safety-vote-public-discovery-preview-production-deploy.js`
- `safety-vote-response-media-first-login-production-deploy.js`
- `safety-vote-seven-plan-production-deploy.js`
- `safety-vote-thai-time-production-deploy.js`

The archived scripts remain available as historical evidence only. Attempting to execute any one of them stops immediately with `ARCHIVED_PRODUCTION_DEPLOYMENT`, before environment loading, credentials or network activity. A regression test discovers every `*deploy.js` file and fails unless it is classified exactly once as active or archived; it also executes all 19 archived entrypoints to prove the fail-closed behavior.

## Local hardening added

- `production-dependency-manifest.json` is a deterministic central topology manifest for the 95-file PHP entry closure and 72-file frontend entry closure. Protected environment-only files remain excluded.
- `backend/scripts/production-dependency-closure.js` resolves PHP include/require edges, HTML entry assets and static/dynamic frontend module references, verifies exact filename casing and orders dependencies before entrypoints.
- `backend/scripts/production-dependency-closure.test.js` fails on partial entry deployment and stale central manifests.
- `backend/scripts/safety-vote-phase7-production-deploy.js` now expands its declared release scope through the central closure before preparing, backing up or uploading files.
- `backend/scripts/production-deployment-policy.js` provides the explicit three-script active allowlist and 19-script archival list. Every archived entrypoint invokes its refusal guard before any other runtime dependency.
- `backend/scripts/production-deployment-policy.test.js` proves complete/non-overlapping classification and fail-closed execution across all 22 deployment scripts.
- New npm commands: `npm run generate:production-dependency-manifest` and `npm run test:production-dependency-closure`.

Local verification passed: dependency closure (PHP 95, frontend 72), Safety Vote Phase 7 final static acceptance, PHP 7.4 compatibility, Node syntax checks and `git diff --check`.

## Ongoing release policy

### Deployment hardening

Do not reactivate an archived script. Each future Production change must use a new immutable release workflow, enter the active policy allowlist, expand or explicitly prove its dependency closure, and generate a release-specific manifest from the approved commit. Retain backup, double-download, post-deploy verification, rollback and helper-cleanup controls. The historical root `deploy-manifest.json` must not be used as an operational source.

### Regression prevention

Make `npm run test:production-dependency-closure`, project-wide PHP lint, `verify:php74-compatibility` and relevant Node/PHP parity mandatory release gates. Add a Production Browser smoke mode that intercepts or server-suppresses analytics/engagement POSTs so a read-only smoke cannot mutate counters. The smoke must fail before sending any unexpected non-GET request.

## Evidence

Sensitive-free Local audit evidence is retained under ignored `backups/local/project-wide-production-dependency-audit-20261026/`, including double-download checksum results, deployment-script analysis, API smoke and Browser smoke. Rollback/deployment evidence is retained under ignored `backups/production/project-wide-dependency-hotfix-20261026022515/`. Downloaded Production runtime copies and any evidence derived from them must remain ignored and local. Credentials, bearer tokens, `.env` values and response bodies were not recorded.
