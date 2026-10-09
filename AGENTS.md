# TSH Safety Core Activity - AGENTS.md

## Safety Vote Phase 9.5C / 9.6 Full Core Rollout (ROLLED BACK / HOLD, 2026-10-09)

- Immutable candidate `47411cbdd3773e9f2e87472732596178313372f2` (tree `78a0531eece0c04e6a21b8e0a42a483779f23888`) changed the Production presentation switch only: `index.html` sets `safetyVoteUxV1=true` before `main.js`. UX Phase 1–8 static contracts, disabled-mode parity and the Phase 9.6 feature-flag regression passed locally.
- Fresh protected preflight confirmed 39 tables, 11 permissions, zero business rows, `module_enabled=1`, `phase7_integrations_enabled=0`, zero configured external providers, verified backup/restore and zero residue. The guarded deploy validated remote-before `index.html` SHA-256 `318b240930209d5562e9f401b92b9991ad584b4b0cbb174986c0cf9dd468a110`, prepared a one-file rollback package, uploaded the candidate SHA-256 `cd9afb279fed061816127f21c1fb1a0b8dd916e61f60e02c9c19c7c7c4694871` and double-download verified it byte-exact.
- Authenticated GET-only browser smoke failed closed before application bootstrap. Production serves three imported `.mjs` files (`safety-vote-participation-model.mjs`, `safety-vote-journey-model.mjs`, `safety-vote-jury-model.mjs`) without a JavaScript MIME type, so Chrome rejects the module scripts. This prevents both the new UX and the legacy fallback from becoming testable; no login or non-GET Production request was allowed by the smoke harness.
- The failed browser gate triggered immediate rollback. Production `index.html` was restored and double-download verified byte-exact at SHA-256 `318b240930209d5562e9f401b92b9991ad584b4b0cbb174986c0cf9dd468a110`. Fresh authenticated enabled-state GET smoke passed health/campaigns `200`, zero campaigns and privacy headers; fresh protected postcheck reconfirmed module enabled, integrations/providers off, 39 tables, zero business rows and zero residue.
- No permission change, campaign creation, business-data write, email/notification, login, external delivery or push occurred. Evidence: `backups/production/safety-vote-phase96-feature-deploy-20261009062303/`, `backups/production/safety-vote-phase95b-enabled-smoke-20261009063226/`, and `backups/production/safety-vote-phase82-preflight-20261009063228/`. Report: `docs/safety-vote-phase96-full-core-rollout-hold.md`. Decision: `PHASE_9_6_ROLLED_BACK_HOLD_PRODUCTION_MJS_MIME`.

## Safety Vote Phase 9.5B Company-wide Module Enablement (PASS, integrations remain disabled, 2026-10-09)

- The user explicitly superseded the bounded-pilot objective and accepted company-wide visibility for all 2,543 role-derived accounts. Permissions were not changed: four Admin accounts retain all 11 Safety Vote permissions/Admin bypass; populated User and Viewer roles retain `SAFETY_VOTE_VIEW` only.
- Fresh prechecks matched the immutable Production runtime `41/41`, verified the bearer session and rollback package, and confirmed 39 tables, 11 permissions, zero business rows, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured providers and zero helper/backup residue.
- Checksum-locked candidate SHA-256 `bf1ad0adf834a7efc9f4bd54075b157d32728b85580782913619b743977b9707` changed exactly one row, `SafetyVote_Settings.module_enabled: 0 -> 1`. The 209-byte private rollback SQL matched two downloads with SHA-256 `074a4be4ddae07b75e7d5f92fb0c3dcddba973cc9ed0a85b302a1f5300ebc982`, direct HTTPS returned `403`, `.htaccess` was restored byte-exact and remote residue is zero.
- Fresh protected postcheck confirmed `module_enabled=1`, integrations/providers still off, 39 tables, zero business rows, no DDL/DML and zero residue. Authenticated GET-only smoke returned `200` for health and campaigns with zero campaign rows and `private, no-store, max-age=0`. Activation evidence: `backups/production/safety-vote-phase95b-enable-20261009060715/`; smoke: `backups/production/safety-vote-phase95b-enabled-smoke-20261009060816/`.
- No login, permission change, campaign creation, business-data write, email/notification, runtime deploy or push occurred. The separate `safetyVoteUxV1` presentation remains strict opt-in/default OFF because no runtime/config enablement was authorized. Report: `docs/safety-vote-phase95b-company-wide-module-enablement.md`. Decision: `PHASE_9_5B_COMPANY_WIDE_MODULE_ENABLE_PASS_INTEGRATIONS_DISABLED`; Phase 9.6 has not started.

## Safety Vote Phase 9.5B Bounded-pilot Enablement Preflight (HOLD, 2026-10-09)

- Read-only/value-suppressed Production preflight double-downloaded all 41 runtime paths and matched immutable commit `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b` byte-exact. The bearer session, Phase 7 schema health, 39-table/zero-business-row protected evidence, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured providers and checksum-locked rollback package all pass.
- The bounded-access gate fails: all 2,543 employee accounts derive `SAFETY_VOTE_VIEW` from populated roles (`ADMIN` 4, `USER` 2,536, `VIEWER` 3). Admins also have all 11 Safety Vote permissions/Admin bypass. User override and orphan-override rows are both zero, so the exact effective breadth is provable and is not a bounded pilot cohort.
- A review-only checksum-locked helper candidate SHA-256 `bf1ad0adf834a7efc9f4bd54075b157d32728b85580782913619b743977b9707` would change only `SafetyVote_Settings.module_enabled: 0 -> 1`, require integrations/providers off and zero business rows, and create an exact private rollback backup before mutation. It has no package command and is not authorized for Production execution.
- Evidence: `backups/production/safety-vote-phase95b-preflight-20261009055655/`, result SHA-256 `bee40471db0058c9a222b79b85dd97fffc215baeaa9d844e21daeca5ec4344f2`; report: `docs/safety-vote-phase95b-bounded-pilot-enablement-preflight.md`. No login, Production mutation, helper upload, personal-data recording, email/notification, deploy or push occurred. Decision: `HOLD_PILOT_COHORT_NOT_PROVEN`; Phase 9.5B activation and Phase 9.6 have not started.

## Safety Vote Phase 9.5A Guarded Runtime Deployment (PASS, module remains disabled, 2026-10-09)

- Immutable commit `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b` supplied all 41 Production runtime files directly from Git objects. Fresh remote-before validation matched 25 existing paths by double-download SHA-256 and reconfirmed 16 paths absent; the checksum-locked rollback ZIP/manifest remained valid.
- FTPS uploaded exactly the 41 allowlisted paths and double-download verified `41/41` byte-exact against the immutable candidate. Evidence: `backups/production/safety-vote-phase95a-deploy-20261009045708/`, result SHA-256 `225959272bccf3a1b24eead9a6633a65c12edc2fabf40e6233ece18312f69e94`. Automatic rollback was ready and not triggered; a separate guarded rollback entrypoint verifies the deployed candidate before restoring 25 remote-before files and removing 16 proven-new paths.
- Fresh protected pre/post checks independently confirmed 39 tables, 11 permissions, zero business rows, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured providers, verified privacy-safe backup/restore, byte-exact `.htaccess` restoration and zero helper/backup residue. Postcheck evidence: `backups/production/safety-vote-phase82-preflight-20261009050056/`.
- Post-deploy authenticated GET-only smoke passed: health returned `200`/ready/module disabled and campaigns failed closed with `503 SAFETY_VOTE_MODULE_DISABLED`; both responses used `private, no-store, max-age=0`. Evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009050124/`, result SHA-256 `4883f4b204e2d3b47fad371c65aa008d46b2323ba7564893c938cdbe4ed1b0a3`.
- No migration, login, business-data write, module/integration opening, email/notification, external delivery or push occurred. Phase 9.5B requires separate authorization before bounded pilot enablement; Phase 9.6 has not started. Report: `docs/safety-vote-phase95a-guarded-runtime-deployment.md`. Decision: `PHASE_9_5A_RUNTIME_DEPLOY_PASS_MODULE_DISABLED`.

## Safety Vote Phase 9.5 Controlled Pilot Preflight (Authenticated entry PASS; deployment not started, 2026-10-09)

- The user attested that the exposed Gmail App Password was revoked/replaced and `backend/.env` updated. Value-suppressed checks confirm an SMTP credential is present, `.env` is ignored and untracked, and no secret value/hash was recorded; no SMTP authentication or email delivery was attempted.
- The immutable 41-path runtime candidate remains commit `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b`, tree `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`, manifest SHA-256 `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c` and runtime digest `d4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc`. The verified Phase 9.4 postcheck shows module/integrations disabled, providers unconfigured, 39 tables and zero business rows.
- Existing read-only drift evidence covers all 41 runtime paths: 25 remote-before files are hash-verified for restoration and 16 paths are proven absent for removal on rollback. The offline rollback archive contains 26 entries, is 306,679 bytes and has SHA-256 `df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394`; manifest SHA-256 is `31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd`.
- The initial preflight stopped at `HOLD_NO_EXISTING_AUTHENTICATED_SESSION`: only Production usernames/passwords were configured, with no existing token/session for non-mutating GET-only smoke. Login was not attempted because it writes authentication/audit state; authentication was not bypassed. No runtime deploy, module opening, external delivery, email or push occurred. Evidence: `backups/production/safety-vote-phase95-preflight-20261009035440/`; report: `docs/safety-vote-phase95-controlled-pilot-preflight.md`.
- A dedicated value-suppressed smoke runner accepts exactly one ignored `.env` key (`SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN` or `SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE`) and is restricted to two Production GETs. Its first guarded run found neither key, made zero HTTP requests and remained `HOLD_NO_EXISTING_AUTHENTICATED_SESSION`; no credential value, hash or response body was recorded. Evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009042622/`, result SHA-256 `079e36795c59b7d21b7d490d5f76b50a426f336fac1334612027c3ad02a43be9`.
- After the user stored an existing bearer token directly in ignored `backend/.env`, the fresh GET-only smoke passed without login: health returned `200`, ready and `module_enabled=false`; campaigns returned fail-closed `503 SAFETY_VOTE_MODULE_DISABLED`; both responses were JSON with `Cache-Control: no-store`. No credential value/hash, response body, business data, module/integration change, deployment or push occurred. Evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009044244/`, result SHA-256 `83f677656dd736e7cb74e3e8328cae32be6bf085819eeb887c714dcf74b2992b`. Decision: `PASS_AUTHENTICATED_ENTRY_GATE_PILOT_DEPLOYMENT_NOT_STARTED`; Phase 9.6 has not started.

## Safety Vote Phase 9.4 Corrected Production Remediation Retry (PASS, release remains HOLD, 2026-10-09)

- Corrected immutable remediation candidate `24ef0f60f31ab63ff17582dafe7c2eddcc157847` passed a fresh protected precheck: Phase 7 contract/schema, 39 tables, 11 permissions, zero Safety Vote business rows, external providers unconfigured and `phase7_integrations_enabled=0`. The precheck still observed `module_enabled=1`; its privacy-safe backup/restore and helper cleanup passed with zero residue.
- The checksum-locked one-time corrected helper changed exactly one row, `SafetyVote_Settings.module_enabled: 1 -> 0`, using schema-bounded actor `phase94_disable`. Integrations remained disabled and business rows remained zero before and after. The private rollback SQL was downloaded twice with SHA-256 `413c154da8080510d15ef8c9871f1db3714cccd6341aef3fde403b61d14c8aca`, direct HTTPS was denied, `.htaccess` was restored byte-exact and helper/guard/backup residue is zero.
- A separate fresh protected recheck independently confirmed `module_enabled=0`, `phase7_integrations_enabled=0`, 39 tables, zero business rows, unconfigured external providers, verified 61,017-byte privacy-safe backup/restore and zero residue. The legacy Phase 8.2 evaluator still labels an existing schema `HOLD` because it was designed for absent pre-deployment state; this is not a remediation failure. Release remains HOLD for the already documented runtime drift and missing authenticated non-mutating smoke.
- Evidence: `backups/production/safety-vote-phase82-preflight-20261009034219/`, `backups/production/safety-vote-phase94-remediation-20261009034250/` and `backups/production/safety-vote-phase82-preflight-20261009034316/`; report: `docs/safety-vote-phase94-corrected-remediation-production-closeout.md`. No runtime deploy, login, authenticated smoke, external delivery or push occurred. Phase 9.5/9.6 have not started. Decision: `PHASE_9_4_REMEDIATION_PASS_RELEASE_HOLD_FOR_RUNTIME_DRIFT_AND_AUTHENTICATED_SMOKE`.

## Safety Vote Phase 9.4 Remediation Local Diagnosis and Corrected Review Candidate (Local only, 2026-10-09)

- The failed Production attempt was diagnosed without reconnecting to Production. The forensic helper wrote `phase94_guarded_disable` (23 characters) into `SafetyVote_Settings.UpdatedBy VARCHAR(20)`; the restored Production schema reproduces `ER_DATA_TOO_LONG` under `STRICT_TRANS_TABLES`. Local non-strict mode demonstrated the same defect by truncating the actor to `phase94_guarded_disa`. A secondary portability defect used a case-sensitive `SafetyVote_Settings` table-name check against `INFORMATION_SCHEMA` output.
- The review-only correction uses schema-bounded actor `phase94_disable`, normalizes the 39-table inventory by lowercase name and returns only a bounded failure-stage enum on error. The Production orchestrator deliberately has no package command and is not authorized for execution. Only the loopback guarded regression has a package command.
- Twice-run regression restores the accepted 39-table Production schema/settings snapshot into a guarded disposable Local database, reproduces the strict-mode failure, proves one exact `1 -> 0` update with integrations still off and business rows zero, verifies preservation of the prior row in rollback SQL, completes helper cleanup and leaves zero database/config/token residue. Phase 9.3 aggregate and UX Phase 8 static regressions remain passing.
- Report: `docs/safety-vote-phase94-remediation-local-diagnosis.md`. No Production connection/change/retry, protected recheck, runtime deploy or push occurred. The live Production module setting remains unverified after the failed attempt, and Phase 9.5/9.6 remain blocked. Decision: `CORRECTED_REMEDIATION_CANDIDATE_READY_FOR_REVIEW_NOT_AUTHORIZED_FOR_PRODUCTION_RETRY`.

## Safety Vote Phase 9.4 Immutable Candidate and Fresh Protected Production Preflight (HOLD, 2026-10-09)

- A separately authorized guarded remediation attempt to change only `SafetyVote_Settings.module_enabled` to `0` failed closed with value-suppressed `500 REMEDIATION_FAILED` before a successful before/after result or rollback-backup download was produced. The helper transaction was designed to roll back on exception, but the current setting is treated as unverified rather than assumed. No retry or protected recheck was attempted because the instruction required stopping at the first failed gate.
- Cleanup passed: the one-time helper cleanup returned `200`, Production `.htaccess` was restored to SHA-256 `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`, helper/guard/private-backup residue is zero, and local token staging was removed. Failure evidence: `backups/production/safety-vote-phase94-remediation-20261009030348/`. The failed helper source is retained only for forensic review and has no package command; it must not be retried without diagnosis and separate authorization. Decision remains `HOLD_REMEDIATION_FAILED`.
- Immutable local candidate `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b` (tree `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`) contains the accepted UX Phase 8 and Phase 9.1–9.3 scope. Its 48-path delta digest is `3f125ca7ccdb3415cd5be9352d42c05fe52f2aae20366434bc6b553e78674cca`; the Git-blob candidate manifest SHA-256 is `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c`. The unrelated dirty Patrol test, `.env`, backups and private data were excluded; no push occurred.
- Fresh checksum-locked protected Production preflight verified PHP 7.4.33, value-suppressed configuration, capabilities, privileges, clock, 39-table Phase 7 schema, 11 permissions and zero Safety Vote business rows. External providers are unconfigured and `phase7_integrations_enabled=0`, but `module_enabled=1`; this violates the required pre-pilot disabled posture and is a release blocker. The 61,012-byte privacy-safe schema/settings backup SHA-256 is `86881f838313d31f8ce980cc928f1856bbf462d43f5b333d5f5ad129c5af48a4`; two downloads and guarded local restore matched, with no ballot/answer/business export or voter-to-choice mapping.
- Production helper/guard/backup cleanup passed with zero residue and `.htaccess` restored byte-exact to SHA-256 `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`. The separate read-only 41-path drift gate found 21 paths matching the candidate parent, one expected-absent new path, four shell files with remote drift and 15 parent runtime UX files missing remotely. Private Safety Vote storage was absent and contents were not read; anonymous health/preflight stayed `401` and private storage stayed `403`.
- Evidence: `backups/production/safety-vote-phase82-preflight-20261009025522/` and `backups/production/safety-vote-phase94-drift-20261009025816/`; report: `docs/safety-vote-phase94-immutable-candidate-protected-production-preflight.md`. No runtime deploy, migration, configuration/business-data mutation, login, authenticated smoke, pilot, push or rollout occurred. Phase 9.5 and 9.6 have not started. Decision: `PHASE_9_4_COMPLETE_HOLD_MODULE_ENABLED_REMOTE_DRIFT_AUTHENTICATED_SMOKE`.

## Safety Vote Phase 9.3 Rehearsal, Eligibility Diff and Operational Runbooks (Local only, 2026-10-09)

- Node and PHP now expose an Admin-only, exact-confirmation dry-run rehearsal for Draft campaigns. It evaluates saved eligibility against current Master data, compares the canonical projection with the latest frozen snapshot, checks operational readiness and existing business residue, and returns an explicit `PASS`/`HOLD` without opening a campaign, freezing eligibility, delivering notifications or mutating Safety Vote state.
- Eligibility drift is privacy-bounded to deterministic added/removed/changed/unchanged counts and sorted Employee ID lists capped at 100 per category; it excludes names, emails, answers, ballot choices, receipts and identity-to-choice mappings. Any drift or ballot/participation/request-key/jury/result/certification/report/notification/export residue fails closed to `HOLD`.
- Three SHE-owned runbooks cover rehearsal execution/evidence, eligibility-diff triage and incident containment/data-preserving rollback. A static contract passes 18 assertions, and the guarded Node/PHP regression proves exact-confirmation and permission denial, stable `PASS`, drift/residue `HOLD`, response parity, SHA-256 evidence and unchanged full-table fingerprints with zero disposable database residue.
- Phase 9.2 adversarial hardening, Phase 9.1 Jury Progress, Phase 8.3.1 disabled-mode and authenticated Phase 1–3 Node/PHP API/Browser lifecycles pass. Evidence: `backups/local/safety-vote-phase93-1791513012687/`, result SHA-256 `c0efd22bde566e1aa095f58448941e46a4977369f096a7af97661af916178c7c`; report: `docs/safety-vote-phase93-rehearsal-eligibility-diff-operational-runbooks.md`. No schema/migration or Production connection, deploy, commit or push occurred. Release remains `HOLD` because source is not immutable. Decision: `PASS_LOCAL_REHEARSAL_RELEASE_REMAINS_HOLD`.

## Safety Vote Phase 9.2 Security and Privacy Hardening (Local only, 2026-10-09)

- Node and PHP now apply one Safety Vote response policy across success, denial and unauthenticated paths: `private, no-store, max-age=0`, no-cache compatibility, MIME sniffing denial, no-referrer and same-origin resource isolation. PHP reasserts the policy at shutdown so session/authentication handling cannot overwrite it.
- Private file delivery is fail-closed by data class. Campaign media remains available to frozen eligible users, but answer attachments require uploader ownership or export authority, and submission attachments require uploader ownership or submission-review authority; Admin/Manage remains the explicit privileged path. Unauthorized and nonexistent files share `404 FILE_NOT_FOUND`, stored names remain basename-confined, and authorized delivery now verifies the stored SHA-256 before sending bytes.
- A separate guarded black-box adversarial suite attacks Node and PHP for unauthenticated access, permission bypass, cross-user file IDOR, existence oracles, numeric identifier injection, stored-name traversal, reviewer/export privilege separation, file tampering, missing privacy headers and ballot-schema correlation fields. It passes with zero ballot, participation, identity-mapping, disposable database or private-file residue.
- Full authenticated Phase 1–7 lifecycle regressions, Phase 8.3.1 disabled-mode parity and Phase 9.1 Jury Progress regression pass after hardening. Evidence: `backups/local/safety-vote-phase92-1791512062212/`, result SHA-256 `2950794fc625b95424c1682eed1746b6bb22a957269f0827f95174dd333deeaf`; report: `docs/safety-vote-phase92-security-privacy-hardening.md`. No Production connection, deploy, commit or push occurred. Cryptographic anonymity against DB/server operators remains outside the application-role boundary, and release-preflight remains `HOLD` because source is not immutable. Decision: `PASS_LOCAL_ADVERSARIAL_RELEASE_REMAINS_HOLD`.

## Safety Vote Phase 9.1 Jury Progress Remediation (Local only, 2026-10-09)

- The populated Jury Progress endpoint no longer fails on the ambiguous joined `Status` column. Node and PHP now select and group by `a.Status` and `a.ConflictState`, preserving the existing route, permission, response shape, aggregation and privacy boundary without a schema or migration change.
- A guarded disposable-loopback Node/PHP regression seeds Draft, Submitted and Recused assignments, requires HTTP `200`, verifies exact `2/1/1` aggregation and response parity, rejects the historical unqualified SQL form, and leaves zero disposable database residue.
- Phase 4 Node/PHP calculation parity and authenticated API/Browser lifecycle pass; Phase 8.3.1 disabled-mode parity passes. Updated Phase 5 authenticated Operations Browser UAT passes all five required viewports with functional `3/6` jury progress, one recusal, no historical partial warning, unexpected API error, protected identity leakage, generated report or disposable database residue.
- Evidence: `backups/local/safety-vote-phase4-browser-1791510293018/` and `backups/local/safety-vote-ux-phase5-1791510333090/`; report: `docs/safety-vote-phase91-jury-progress-remediation.md`. The earlier Phase 5/8 limitation records remain historical. No Production connection, deploy, commit or push occurred. The release-preflight remains `HOLD` because source is not immutable. Decision: `PASS_LOCAL_REGRESSION_RELEASE_REMAINS_HOLD`.

## Safety Vote UX/UI Phase 8 Integrated Journey, Accessibility and Release Candidate Closeout (Local only, 2026-10-09)

- The strict-opt-in `safetyVoteUxV1` presentation now uses one responsive, campaign-adaptive journey spine across Campaign Center, creation/readiness, User participation, Juror scoring, Operations, result/certification/publication and governance evidence. Breadcrumbs, role navigation, state semantics, focus visibility, reduced motion and action hierarchy are consistent; the flag remains default OFF and `module_enabled` remains independently fail-closed.
- Guarded disposable-loopback Chrome UAT passes Phase 1–7 Admin/User/Juror/audit-view-only/denied/module-disabled flows at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080. The combined evidence contains 102 privacy-safe screenshots with no horizontal overflow, sub-44 px visible target, protected identity/choice leakage, unexpected API error or browser exception.
- Phase 8/7/6/5/4/3/2/1 static contracts pass 48/59/58/54/50/45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity, Phase 8.3.1 disabled-mode parity, JavaScript syntax and `git diff --check` pass. Mutation ledgers contain only the intended guarded fixture actions, and disposable database/generated report/browser-profile residue is zero.
- Accepted evidence: `backups/local/safety-vote-ux-phase8-1791509833562/`; report: `docs/safety-vote-ux-phase8-integrated-journey-accessibility-release-candidate-closeout.md`. The authoritative release-preflight remains `HOLD`; Production/external delivery/deploy authorization remain false. No route/API/schema/migration/shared contract or protected business logic changed; no Production connection, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_RELEASE_REMAINS_HOLD`.

## Safety Vote UX/UI Phase 7 Governance, Audit and Release Evidence Workspace (Local only, 2026-10-08)

- The strict-opt-in `safetyVoteUxV1` presentation now provides the Admin “ธรรมาภิบาลและหลักฐานการปล่อยใช้งาน Safety Vote” workspace with immutable checksum comparison, SHE-owned acceptance evidence, privacy-safe bounded timeline, observability/alert summary, aggregate handoff preview, fixture-only exact confirmation and authoritative release-preflight HOLD. The flag remains default OFF and `module_enabled` remains independently fail-closed.
- Authenticated guarded Chrome UAT passes Admin, audit-view-only, denied and module-disabled flows at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080. Direct in-app Browser inspection also passes the 390×844 held fixture with no horizontal overflow, sub-44 px visible target, Production authorization, protected voter/choice disclosure or browser exception.
- Phase 7/6/5/4/3/2/1 static contracts pass 59/58/54/50/45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity, Phase 8.3.1 disabled-mode parity and the existing guarded Phase 7 Node/PHP lifecycle pass. UAT retained two ballots and zero identity mappings, added exactly one SHE acceptance and one locally delivered fixture handoff, left Production/external delivery false and removed all disposable database/report residue.
- Immutable source remains false in the existing release-preflight contract, so the workspace correctly reports `HOLD` and never authorizes deployment. Accepted evidence: `backups/local/safety-vote-ux-phase7-1791473598403/`; report: `docs/safety-vote-ux-phase7-governance-audit-release-evidence-workspace.md`. No route/API/schema/migration or protected business logic changed; no Production connection, external dispatch, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE8`.

## Safety Vote UX/UI Phase 6 Result Review, Certification and Publication (Local only, 2026-10-08)

- The strict-opt-in `safetyVoteUxV1` presentation now provides the Admin “ตรวจสอบและรับรองผล Safety Vote” workspace with immutable snapshot comparison, readiness metadata, complete SHA-256 review/re-entry, reasoned recount, standard freeze/certification/publication and secret-election two-person certification. The flag remains default OFF and `module_enabled` remains independently fail-closed.
- Authenticated guarded Chrome UAT passes Admin, two independent certifiers, result-view-only and denied flows at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080. There is no horizontal overflow, sub-44 px visible target, protected identity/choice leakage, unexpected API error or browser exception; partial capabilities and module-disabled states fail closed.
- Phase 6/5/4/3/2/1 static contracts pass 58/54/50/45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity, Phase 8.3.1 disabled-mode parity and the guarded Phase 6 Node/PHP API lifecycle pass. UX UAT retained two ballots/two participations/zero identity mappings, created one reasoned recount and three intended certifications, and left zero disposable-database residue.
- No route, API, shared contract, migration, schema or result-calculation logic changed. Accepted evidence: `backups/local/safety-vote-ux-phase6-1791472485401/`; report: `docs/safety-vote-ux-phase6-result-review-certification-publication-workspace.md`. No Production connection, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE7`.

## Safety Vote UX/UI Phase 5 Operations, Analytics and Result Readiness (Local only, 2026-10-08)

- The strict-opt-in `safetyVoteUxV1` presentation now provides the Admin “ศูนย์ปฏิบัติการ Safety Vote” with campaign/stage health, safe lifecycle timeline, server-suppressed turnout funnel, notification delivery/queue status, result-snapshot readiness and confirmed aggregate report/schedule actions. The flag remains default OFF and `module_enabled` remains independently fail-closed.
- Authenticated guarded Chrome UAT passes Admin/result-view-only/denied flows at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080 with no horizontal overflow, sub-44 px visible targets, protected ballot/identity leakage, unexpected API errors or browser exceptions. Secret dimensions, denied access, module disabled and partial capabilities fail closed.
- Phase 5/4/3/2/1 static contracts pass 54/50/45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity, Phase 8.3.1 disabled-mode parity and existing guarded Phase 5 Node/PHP API lifecycle pass. Confirmed UX actions added seven test notifications, one aggregate report/export and one due schedule transition while ballots/participation stayed unchanged, identity/certification stayed zero and generated-file/disposable-database residue is zero.
- The baseline Node/PHP jury-progress query has an ambiguous unqualified `Status` column and returns 500 with data; route/API changes were excluded, so the UX exposes a production-worded partial state and preserves all other panels. Evidence: `backups/local/safety-vote-ux-phase5-1791466271326/`; report: `docs/safety-vote-ux-phase5-operations-analytics-result-readiness-workspace.md`. No Production connection, API/schema/migration change, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE6_WITH_BASELINE_LIMITATION`.

## Safety Vote UX/UI Phase 4 Juror Assignment and Scoring Workspace (Local only, 2026-10-08)

- The strict-opt-in `safetyVoteUxV1` presentation now provides “งานประเมินของฉัน”, assignment status/progress, server-derived blind candidate aliases, criteria scoring, local draft recovery, complete-sheet server autosave, validation/review and accessible immutable-submit/recusal dialogs. The flag remains default OFF and server `module_enabled` remains independently fail-closed.
- Authenticated guarded Chrome UAT passes Juror flows at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080 with no horizontal overflow, no sub-44 px visible targets, real-name leakage, duplicate submit, unassigned detail disclosure or privacy-unsafe receipt. Permission denial and module-disabled states pass.
- Phase 4/3/2/1 static contracts pass 50/45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity and Phase 8.3.1 disabled-mode parity pass. The guarded lifecycle produced five immutable submitted assignments, one recusal, 20 submitted score rows, no ballot/participation/certification/result mutation and zero browser/disposable-database residue.
- Evidence is under `backups/local/safety-vote-ux-phase4-1791464614885/`; report: `docs/safety-vote-ux-phase4-juror-assignment-scoring-workspace.md`. No Production connection, API/schema/migration change, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE5`.

## Safety Vote UX/UI Phase 3 User Participation and Ballot Review (Local only, 2026-10-08)

- The strict-opt-in `safetyVoteUxV1` presentation now provides “กิจกรรมของฉัน”, campaign-adaptive participation, review-before-submit, accessible immutable confirmation, stable ballot retry keys, duplicate-submit protection and privacy-safe receipts. The flag remains default OFF and server `module_enabled` remains independently fail-closed.
- Authenticated local Chrome UAT passes at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080 with no horizontal overflow, no sub-44 px visible targets, exact idempotent replay, changed-payload conflict, permission denial and module-disabled states. Secret-ballot identity rows remained zero.
- Phase 3/2/1 static contracts pass 45/43/30 assertions. Safety Vote Phase 1–7 Node/PHP parity and Phase 8.3.1 disabled-mode parity pass. The guarded lifecycle produced six intended ballots/participations, no jury/certification/result mutation and zero disposable-database residue.
- Evidence is under `backups/local/safety-vote-ux-phase3-1791463635656/`; report: `docs/safety-vote-ux-phase3-user-participation-ballot-review-workspace.md`. No Production connection, schema/migration change, deploy, commit or push occurred. Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE4`.

## Safety Vote UX/UI Phase 2 Campaign Creation and Readiness Workspace (Local only, 2026-10-08)

- On authoritative baseline `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`, the strict opt-in Safety Vote shell now includes six campaign templates and an eight-step responsive creation/readiness wizard with serialised autosave, validation summary, real-role previews, eligibility preview/freeze, readiness checklist, accessible confirmations and a safe-area-aware sticky action bar. Flag OFF still renders the legacy UI; `module_enabled=0` remains fail-closed without campaign reads.
- Survey/Popular Vote may open only after the existing server preflight passes. Secret Election, Submission Challenge, Nomination and Jury Scoring route to the preserved advanced workspace and are never opened by guessed setup. No Node/PHP route or contract, migration, schema, ballot/privacy/eligibility/jury/certification/result logic changed.
- Static/unit gates pass 43 assertions, Phase 1 regression passes 30 assertions, Phase 1–7 Node/PHP parity and the Phase 8.3.1 disabled gate pass. Authenticated guarded Chrome UAT passes Admin/User/Juror at all five required viewports, with zero overflow, sub-44 px actionable targets, console errors, unexpected 5xx or disposable database residue.
- The UAT mutation ledger contained exactly five opened wizard campaigns, five questions and five frozen eligibility snapshots, with zero ballot/participation/jury-score/certification/result rows before the guarded database was dropped. Accepted evidence: `backups/local/safety-vote-ux-phase2-1791462675106/`; report: `docs/safety-vote-ux-phase2-campaign-creation-readiness-workspace.md`.
- Decision: `LOCAL_UX_PHASE2_PASS — FEATURE_DEFAULT_OFF — NO_PRODUCTION_CHANGE`. No Production connection, deploy, commit or push occurred.

## Safety Vote UX/UI Phase 1 Responsive Shell and Admin Campaign Center (Local only, 2026-10-08)

- On authoritative baseline `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`, a strict opt-in `safetyVoteUxV1` presentation shell now provides the full-width Thai Admin campaign center, KPI/search/status views, desktop table/master-detail, tablet drawer, mobile cards, shared accessible states/dialog/action bar and assignment-aware User/Juror navigation. Flag OFF renders the existing UI unchanged; server `module_enabled` remains default disabled and fail-closed.
- No Node/PHP API, shared contract, migration, schema, ballot/privacy/eligibility/jury/certification/result logic changed. Phase 1–7 Node/PHP parity and the Phase 8.3.1 disabled gate pass.
- Authenticated guarded Chrome UAT passes Admin/User/Juror at all five required viewports (15 combinations), with no horizontal overflow, minimum 44×44 px visible controls, keyboard/dialog/drawer semantics, adaptive navigation, denied/empty/disabled states, zero console/5xx errors and zero disposable database residue. Accepted evidence: `backups/local/safety-vote-ux-phase1-1791461607095/`.
- Decision: `LOCAL_UX_PHASE1_PASS — FEATURE_DEFAULT_OFF — NO_PRODUCTION_CHANGE`. No Production connection, deploy, commit or push occurred. Full report: `docs/safety-vote-ux-phase1-responsive-admin-campaign-center.md`; entry gate: `docs/safety-vote-ux-phase1-preflight-scope.md`.

## Safety Vote Phase 8.3.1 Disabled-mode Fail-closed Remediation (Local only, 2026-10-08)

- Node and PHP now enforce one authenticated module-state gate before every Safety Vote Phase 1–7 router. When `module_enabled=0`, every operational route—including workspace, integrations and ballot submit—returns `503 SAFETY_VOTE_MODULE_DISABLED`; only authenticated read-only health and per-campaign release preflight remain reachable.
- Additive migrations Phase 1–7 now finish with `module_enabled=0`; Phase 7 also finishes with `phase7_integrations_enabled=0`. Guarded fixtures must explicitly enable the module for ordinary regression/UAT.
- The dedicated adversarial parity gate applies all seven migrations to separate loopback-only Node/PHP databases, checks disabled defaults/reapply behavior, direct API bypass denial and zero ballot/participation/request-key residue. Full Phase 1–7 regression, concurrency, backup/restore and desktop/390 px Browser UAT remain passing.
- No Production connection, deployment or push occurred. The unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` remains excluded and untouched by the scoped commit.

## Safety Vote Phase 8.2 Protected Production Preflight Closeout (2026-10-08)

- A checksum-locked one-time protected helper completed fresh value-suppressed Production PHP/config/schema/privilege/clock/private-storage checks under contract `2026-10-08-safety-vote-phase8.2-r1`. Production PHP 7.4.33 and required capabilities pass; Safety Vote remains pre-deployment with zero tables, zero business rows and no private Safety Vote files.
- The privacy-safe 171-byte SQL backup SHA-256 is `4a67122f21be115a9cc950e1668408d0447dc2f4f45682380efbdc41bfb5e8d1`; two downloads matched and guarded disposable restore reproduced zero tables/settings. No ballot/answer/participation data was read or exported and no voter-to-choice mapping was created.
- Original and restored Production `.htaccess` SHA-256 are both `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`. Helper, guard, SQL and temporary directories have zero residue. Accepted evidence: `backups/production/safety-vote-phase82-preflight-20261008092819/`.
- Technical preflight passes, but deployment remains HOLD because no existing valid authenticated session was available for a non-mutating Production smoke. Login writes login/audit state, so it was not attempted or bypassed. No migration, configuration/business-data change, deploy or push occurred. Closeout: `docs/safety-vote-phase8.2-immutable-candidate-protected-preflight.md`.

## Safety Vote Phase 8.1 SHE Internal Governance Amendment (Local only, 2026-10-08)

- Governance contract `2026-10-08-safety-vote-phase8.1-she-governance-r1` supersedes the fixed HR/Legal/business-owner/Privacy/Security/Operations acceptance list. Safety Vote is SHE-owned; every campaign requires one authenticated, audited `she_owner` acceptance. The Admin UI provides `Approve by SHE` and the server stores the approver, statement hash, evidence reference and SHA-256.
- Dual certification is conditional: Activity Vote, Survey, Nomination, Submission and Jury campaigns do not require two certifiers; `secret_election`/`secret_ballot` still requires two distinct certifiers bound to the immutable result hash. All ballot immutability, anonymous/secret separation, private-file and privacy-safe audit controls remain unchanged.
- Full Phase 1–7 guarded regression passes after the amendment, including Node/PHP parity, 39-table idempotent migration, authenticated API lifecycles, 20-voter concurrency, backup/restore, privacy/10k performance and Admin/User/Juror desktop/390 px Browser UAT. Identified campaigns may retain their intended identity mapping without tripping the anonymous/secret separation gate. Latest gate evidence: `backups/local/safety-vote-phase7-gates-1791450748768/`; latest targeted Browser evidence: `backups/local/safety-vote-phase7-browser-1791450988011/`.
- The six-party acceptance blocker is removed. Production remains HOLD only for engineering blockers: dirty/non-immutable source, fresh protected server/config/schema/privilege/clock/provider verification, privacy-safe database backup/restore and valid authenticated non-mutating smoke. Amendment: `docs/safety-vote-phase8.1-she-governance-amendment.md`.

## Safety Vote Phase 8 Production Preflight and Release Gate (HOLD, 2026-10-08)

- The PHP Production target was confirmed as `https://dev.tshpcl.com/safety/tsh-safety-core/`. A scoped dirty-tree manifest contains 24 PHP Production runtime paths, 14 operations-only migration/rollback artifacts and 19 Node parity/source-only paths. All required files exist; unrelated dirty `backend/scripts/patrol-checkin-v2.test.js`, private business files and backups are excluded. Runtime scope SHA-256 is `2e341e572e74d6bfbe7a363075e2cea3b751b52d46662ef3e8f2e36c7fdc064e`; source remains non-immutable because no commit was authorized.
- Read-only Production FTPS/HTTPS preflight found six existing replacement paths matching `HEAD` after newline normalization and 18 new paths absent as expected. The six existing files were downloaded twice with byte-exact SHA-256 matches; accepted evidence is under `backups/production/safety-vote-phase8-preflight-20261008091739/`. The application root returned `200`, undeployed Safety Vote probes returned fail-closed `501`, and the shared contract returned `404`.
- Remote `api/private/safety-vote` was absent, so there were no Safety Vote private files to copy. No protected read-only DB/config channel existed, so Production PHP/config/schema/privileges/clock/providers, the 39-table database backup and authenticated non-mutating smoke remain unverified. No helper, SQL, login, migration, config/business mutation, deploy, commit or push occurred; no ballot choice or voter-to-choice mapping was read/exported/created.
- Decision is `HOLD — NOT AUTHORIZED FOR PRODUCTION DEPLOYMENT`: source is not immutable; database backup/restore, fresh protected server preflight and authenticated smoke are absent. SHE internal governance is accepted as the product model and is no longer a blocker. File rollback is ready for the six replacements and 18 proven-new paths, but overall rollback is not ready. Full report: `docs/safety-vote-phase8-production-preflight-release-gate.md`; manifest: `docs/safety-vote-phase8-candidate-manifest.json`.

## Safety Vote Phase 7 Integrations, Governance and Release Candidate (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has local Phase 7 integration governance with a 39-table additive/idempotent schema, data-preserving disable rollback, Node/PHP read-only adapter parity, exact-confirmation certified-result handoff, hash verification, acceptance evidence, observability and fail-closed release preflight.
- System Control/HR, calendar/notification and Committee/Hiyari/KY/BBS/Patrol/Training/Policy/Dashboard/Johnny adapters create no voter-to-choice mapping and cannot vote, certify or disclose hidden results. Fixture handoff sends nothing externally.
- Guarded Node/PHP lifecycle, backup/restore, 10k performance/privacy gates and authenticated Admin desktop/390 px UAT pass. Evidence: `backups/local/safety-vote-phase7-gates-1791448989923/` and `backups/local/safety-vote-phase7-browser-1791448992549/`.
- Decision is superseded by Phase 8.1 SHE internal governance. The working tree remains non-immutable and deployment is not authorized. Full report: `docs/safety-vote-phase7-release-candidate.md`.

## Safety Vote Phase 6 Certified Secret Election (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has local Certified Secret Election hardening: multi-position/seats/abstain, frozen candidate membership, separated secret submit hashes, acceptance-only receipts, deterministic recount/reconciliation, tie/void control, two-person hash-bound certification/revocation and certified report verification.
- Additive/idempotent Phase 6 migration reaches 35 Safety Vote tables; rollback preserves all election evidence and disables the module. Guarded Node/PHP tests pass 20 concurrent voters plus replay with exactly 20 ballots/participations, zero identity mappings and zero request-key/ballot hash joins.
- Authenticated User/Admin Browser UAT passes at 1366×768 and 390×844; evidence is under `backups/local/safety-vote-phase6-browser-1791442813769/`. No Production connection, deployment, commit or push occurred.
- Decision is `LOCAL_ENGINEERING_PASS — HOLD_FOR_INDEPENDENT_PRIVACY_AND_BUSINESS_ACCEPTANCE — HOLD_FOR_PRODUCTION`. Phase 6 does not claim cryptographic anonymity against DB/server operators; unsigned HR/Legal/business-owner/Privacy/Security acceptance remains a release blocker. Full report: `docs/safety-vote-phase6-certified-secret-election.md`.

## Safety Vote Phase 5 Operations, Analytics, Export and Notification (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has a local Phase 5 implementation with an additive/idempotent 31-table schema, data-preserving disable rollback, Node/PHP privacy/schedule/report parity, Operations Center, server-side threshold suppression, explicit Asia/Bangkok schedule processing, duplicate-safe notification outbox/delivery history, aggregate Excel/PDF and immutable certified report hashes.
- Guarded disposable migration and Phase 1–4 regressions pass. Authenticated Node/PHP lifecycle covers concurrent notification suppression, delivery failure/retry, schedule open/close, scoped audit, retention dry-run and private report SHA-256 verification. User/Admin Browser UAT, including the private user notification inbox, passes at 1366×768 and 390×844; latest evidence is under `backups/local/safety-vote-phase5-browser-1791436148768/`.
- Notification dispatch fails closed without a configured adapter; UAT uses a fixture transport and sends nothing externally. Report/database residue is zero. No Production connection, deploy, commit or push occurred; existing dirty work including `backend/scripts/patrol-checkin-v2.test.js` remains preserved. Closeout: `docs/safety-vote-phase5-operations-analytics-export-notification.md`. Decision: `PHASE_5_LOCAL_PASS — READY_FOR_PHASE_6_AUTHORIZATION — HOLD_FOR_PRODUCTION`.

## Safety Vote Phase 4 Jury, Scoring and Multi-stage (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has a local Phase 4 implementation with an additive/idempotent 27-table schema, data-preserving disable rollback, Node/PHP scoring parity, Draft scoring/stage/criteria/jury configuration, blind judging, conflict/recusal, transactional immutable score sheets, versioned reopen, result hashes, certification and multi-stage advancement.
- Guarded disposable migration and Phase 1–3 regressions pass. Authenticated Node/PHP lifecycle includes concurrent jury submit (`200` once / `409` once), and juror/admin Browser UAT passes at 1366×768 and 390×844; latest evidence is under `backups/local/safety-vote-phase4-browser-1791434640207/`.
- The real local schema was inspected read-only before implementation. No Production connection, deploy, commit or push occurred; existing dirty work, including `backend/scripts/patrol-checkin-v2.test.js`, remains preserved. Closeout: `docs/safety-vote-phase4-jury-scoring-multistage.md`. Decision: `PHASE_4_LOCAL_PASS — READY_FOR_PHASE_5_AUTHORIZATION — HOLD_FOR_PRODUCTION`.

## Safety Vote Phase 3 Survey, Feedback, Nomination and Submission (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has a local Phase 3 implementation with an additive/idempotent 20-table schema, data-preserving disable rollback, Node/PHP parity across 15 question types and conditional branches, anonymous surveys without ballot identity mapping, encrypted free text, private answer/submission files, nomination consent/review and owner-controlled submission lifecycle through review/finalist outcomes.
- Guarded disposable migration, Phase 2 regression and authenticated Phase 3 Node/PHP lifecycles pass. User/Admin browser UAT passes at 1366×768 and 390×844; evidence is under `backups/local/safety-vote-phase3-browser-1791432347673/`. Permission audit adds no Safety Vote finding and retains only two pre-existing unrelated FourM findings.
- The real local schema was inspected read-only before implementation. No Production connection, deploy, commit or push occurred; existing dirty work, including `backend/scripts/patrol-checkin-v2.test.js`, remains preserved. Closeout: `docs/safety-vote-phase3-survey-nomination-submission.md`. Decision: `PHASE_3_LOCAL_PASS — READY_FOR_PHASE_4_AUTHORIZATION — HOLD_FOR_PRODUCTION`.

## Safety Vote Phase 2 Core Activity Vote MVP (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has a local Core Activity Vote MVP with an additive/idempotent 18-table schema, data-preserving disable rollback, Node/PHP single/multiple-choice builder parity, frozen eligibility snapshots/hashes, private option images, Draft → Open → Closed → Published lifecycle, eligible user workspace, immutable transactional ballots, dashboard/results and basic Excel/PDF export.
- Guarded disposable migration/API gates pass, including idempotent/concurrent submit behavior, exact two-ballot reconciliation, private eligible gallery delivery and zero database/file residue. Authenticated browser UAT passes at 1366×768 and 390×844; evidence is under `backups/local/safety-vote-phase2-browser-1791430206649/`.
- The real local schema was inspected read-only. No Production connection, deploy, commit or push occurred; the unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` remains untouched. Closeout: `docs/safety-vote-phase2-core-activity-vote-mvp.md`. Decision: `PHASE_2_LOCAL_PASS — READY_FOR_PHASE_3_AUTHORIZATION — HOLD_FOR_PRODUCTION`.

## Safety Vote Phase 1 Platform Foundation (Local only, 2026-10-08)

- Contract `2026-10-08-safety-vote-phase0-r1` now has a local Platform Foundation: explicit additive/idempotent ten-table migration, data-preserving disable rollback, 11 permission keys, fail-closed schema health, Node/PHP Draft Campaign CRUD/void parity, read-only System Console Master picker, eligibility rule preview, private files and bounded audit.
- Guarded disposable migration and authenticated Node/PHP API lifecycle pass, including private-file denial/removal and zero disposable-database residue. The user module and ballot submission remain absent/disabled; `module_enabled=0`.
- The real local schema was inspected read-only before implementation. No Production connection, deploy, commit or push occurred, and the unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` remains untouched. Closeout: `docs/safety-vote-phase1-platform-foundation.md`. Decision: `PHASE_1_LOCAL_PASS — READY_FOR_PHASE_2_AUTHORIZATION — HOLD_FOR_PRODUCTION`.
## Safety Vote UX/UI Phase 1 Baseline Entry Gate (Historical HOLD, superseded 2026-10-08)

- This entry preserves the pre-pull audit at `aa270b0`. It was superseded when `origin/main` supplied the authoritative Safety Vote baseline through commit `84914eb`; the original HOLD evidence remains useful as an audit trail but is no longer the current source-availability decision.

- Phase 1 stopped before Runtime edits with decision `HOLD_BASELINE_NOT_FOUND`. The current worktree, all available local/remote-tracking refs, Git content/path history and a fresh read-only `git ls-remote --heads origin` check contain no authoritative Safety Vote page/module, Node route, PHP handler, shared contract, migration, explicit Juror/Ballot capability contract or Safety Vote feature flag.
- `main`, `origin/main` and `origin/HEAD` remain at `aa270b0`; the live `origin` exposes only `main`, `integration/production-bbs-20260905`, `restore-working-version` and `wip/bbs-card-designer-10f2`. `aa270b0` is an immutable current-app reference, not a Safety Vote baseline.
- Admin/User/Juror authenticated UAT and the five required viewport runs are correctly `NOT TESTABLE`, not passed or failed, because no Safety Vote routes exist. No voting engine, schema, API or inferred privacy/ballot contract was created. Phase 2 is not authorized until Phase 1 is unblocked and accepted.
- Only this documentation-only gate report and the instruction log changed during the attempt. No Runtime, API, database, schema, configuration, business data or authentication data changed; no checkout/fetch/server/database/Production operation, deploy, commit or push occurred. Evidence and the resume command: `docs/safety-vote-ux-phase1-baseline-gate-hold.md`.

## Safety Vote UX/UI Phase 0 — UX Audit and Responsive Design Contract (Local only, 2026-10-08)

- The source-availability constraint recorded during this audit was superseded by the later `84914eb` baseline import. The UX findings and responsive design contract remain the governing input for the separate UX/UI workstream.
- The Phase 0 read-only source/UI audit and responsive design contract is complete. It defines production information architecture, Thai-first wording, a full-width desktop workspace, mobile-first Admin/User/Juror wireflows, role/action visibility, campaign-type adaptive navigation, shared components, WCAG 2.2 AA criteria and an authenticated UAT matrix at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080.
- The audited `main` snapshot at `aa270b0` contains no registered Safety Vote page, frontend module, backend/PHP route, migration or explicit Juror/Ballot contract. Existing evidence is limited to the responsive global shell and binary Admin/User routing, so current Safety Vote visual/authenticated UAT is correctly recorded as not testable rather than passed.
- Phase 1 must first locate and record the authoritative Safety Vote source and immutable baseline. If it remains absent or ambiguous, work stops at `HOLD_BASELINE_NOT_FOUND`; no parallel voting engine or schema may be invented. Once confirmed, Phase 1 is limited to a feature-flagged responsive shell and Admin Campaign Center without changing ballot, privacy, eligibility, certification or result behavior.
- No Runtime, API, database, schema, configuration, business data or authentication data changed. No server/database/Production connection, deployment, commit or push occurred. Full contract and the copy-ready Phase 1 instruction: `docs/safety-vote-ux-phase0-audit-responsive-contract.md`. Decision: `PHASE_0_CONTRACT_COMPLETE_HOLD_FOR_RUNTIME_IMPLEMENTATION`.

## Johnny global launcher avatar Production release (2026-10-07)

- `main` commit `b42d845` is deployed to the PHP Production target. The global `ถาม Johnny` launcher now uses the same Admin-configured `johnnyAvatarUrl` as the main Johnny workspace, loads it read-only after authentication without opening the drawer, refreshes after leaving the Johnny workspace and safely falls back to `J` when absent or broken.
- Only `index.html`, `public/style.css`, `public/js/main.js` and `public/js/johnny-drawer.js` were deployed. FTPS download-back and public HTTPS SHA-256 matched source `4/4`; cache marker `20261007-johnny-launcher-avatar-r1` and the launcher avatar marker are served. Anonymous Johnny remains `401` and both shared contracts remain `404`.
- Production files had no unrelated drift after newline normalization. Rollback was not triggered. No PHP, Patrol, database, configuration, Knowledge Base or business data changed. Stored Production UAT credentials had returned `401` during the immediately preceding Phase 8 release, so no repeated failed login or authenticated visual UAT was performed.
- Rollback/download evidence is under `backups/production/johnny-launcher-avatar-predeploy-20261007-112733/`; report: `docs/johnny-launcher-avatar-production-release.md`. Decision: `RELEASED_GO`.

## Johnny AI Phase 8 Production release (2026-10-07)

- `main` commit `fa1046c` is deployed to the PHP Production target. The release uploaded exactly four runtime paths: `api/handlers/johnny_ai.php`, `api/lib/johnny_system_usage.php`, `api/lib/johnny_evidence_ranking.php` and `api/lib/johnny_answer_verification.php`. Patrol, working-tree preflight/AGENTS changes, backups, `.tmp` and every other path were excluded.
- The committed manifest was verified before upload and FTPS download-back matched source `4/4`. Production HTTPS returned `200`, anonymous Johnny status returned `401`, and both server-only shared contracts returned `404`. The `api` FTPS inventory contained zero suspected helper/preflight/backup/SQL residue; local release staging was removed.
- Stored Production UAT Admin and User credentials both returned `401`, so authenticated read-only Production UAT was skipped without bypass, synthetic account or chat mutation. Accepted authenticated local desktop/390 px evidence remains applicable. Only normal failed-login security audit side effects may have occurred.
- Phase 8 has no migration. No database, configuration, Knowledge Base or business data changed, and rollback was not triggered. Verified rollback remains under `backups/production/johnny-phase8-preflight-20261007-101608/`; release evidence is under `backups/production/johnny-phase8-release-20261007-105252/` and the report is `docs/johnny-phase8-production-release.md`. Decision: `RELEASED_GO`.

## Johnny AI Phase 8 Protected Production Backup Helper Closeout (GO, 2026-10-07)

- A separately authorized checksum-locked one-time helper closed the Phase 8 Production preflight blockers using value-suppressed checks, `SELECT`, `SHOW CREATE TABLE`, `INFORMATION_SCHEMA` and a read-only transaction only. Production PHP 7.4.33 and all required capabilities/config keys pass; six InnoDB Johnny tables, required columns/index and feedback cascade foreign key are ready.
- Current scoped counts are 19 conversations, 88 messages, one feedback, 24 documents, 109 chunks, 26 operational logs and one avatar setting. The 2,827,661-byte SQL export SHA-256 is `a0a2b769ecfb9019b11a5a1e3ad1edad8f5e1e9dbe8ed99becd1bd83b11b9bdb`; two downloads match. The readable database ZIP SHA-256 is `b695c5d0a14128e061a22934cb280974785ed1a20cc6dc428326a8449a24ff4c`; scope/count/destructive-statement validation passes.
- Helper fail-closed checks passed; SQL was HTTP `403` while present. Cleanup removed SQL/guard/marker/directory and helper, FTPS proved zero residue, and original `.htaccess` was restored byte-exact with SHA-256 `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`. Final HTTPS did not serve helper/export; anonymous Johnny remains `401` and shared contracts `404`.
- Decision is `GO_FOR_CONTROLLED_RELEASE` for immutable commit `fa1046c`. No runtime upload, deployment, schema/business-data mutation, commit or push occurred. Evidence is under `backups/production/johnny-phase8-preflight-20261007-101608/`; full report: `docs/johnny-phase8-production-preflight.md`. A separate explicit release instruction is required.

## Johnny AI Phase 8 Production Preflight (HOLD, 2026-10-07)

- Immutable commit `fa1046c` was inspected against the PHP Production target using FTPS/HTTPS read-only operations only. Existing runtime files matched deployed Phase 7.1 after newline normalization, both new Phase 8 libraries were absent, download-back matched `2/2`, Production HTTPS returned `200`, anonymous Johnny returned `401`, and both shared contracts returned `404`.
- Four legacy Johnny KB PDFs were downloaded twice with SHA-256/signature verification `4/4`; no private KB directory appeared in the Production `api` inventory. Combined runtime/KB download-back passed `6/6`. A readable file rollback archive and evidence are under `backups/production/johnny-phase8-preflight-20261007-101608/`.
- Decision is `HOLD`: current value-suppressed Production PHP/config execution, fresh `INFORMATION_SCHEMA`/row counts and the narrow seven-table-plus-setting database export were unavailable through an existing read-only channel. Secret-bearing `.env` was not downloaded, and no temporary helper was uploaded without separate authorization. The rollback package is file/KB ready but not database-backup complete.
- No Production runtime upload, deploy, schema/data change, authentication attempt, commit or push occurred. Full findings and the required checksum-locked helper closeout are in `docs/johnny-phase8-production-preflight.md`.

## Johnny AI Phase 8 Immutable Candidate Closeout (Local only, 2026-10-07)

- The Phase 8.2 release blocker is remediated without changing runtime behavior. Its evaluator now independently requires persisted evidence-ranking metadata plus integrated Phase 8.3 phase and answer-verification audit metadata in Node/PHP; all four ranking scenarios and ten integration checks pass with parity.
- Fresh gates pass Phase 1–7.1 regressions, Phase 8.1–8.3 parity, PHP 7.4.33 lint/configuration, Phase 6 and Phase 8.3 authenticated isolated lifecycles, desktop/390 px Browser UAT and the Phase 8.4 controlled real-model gate. Chat/message/feedback and disposable-database residue are zero.
- The candidate decision is `GO_FOR_PRODUCTION_PREFLIGHT_HOLD_FOR_DEPLOYMENT`. PHP Production scope remains four files; Node parity, evaluators and documentation are source-only. Patrol, `.tmp` and `backups` are excluded. No Production connection/change, push or deployment occurred.
- Final scope and hashes are in `docs/johnny-phase8-candidate-manifest.json`; verification closeout is `docs/johnny-phase8-immutable-candidate-closeout.md`. Production configuration, remote drift and verified scoped backup remain mandatory before a separate deployment authorization.

## Johnny AI Phase 8 Release Candidate & Pre-deployment Review (Local only, 2026-10-07)

- The local read-only pre-deployment review is complete with decision `HOLD`. The PHP Production runtime candidate is four files: two replacements (`api/handlers/johnny_ai.php`, `api/lib/johnny_system_usage.php`) and two new libraries pending remote drift proof (`api/lib/johnny_evidence_ranking.php`, `api/lib/johnny_answer_verification.php`). Node has four matching parity files but they are not PHP Production upload content.
- Legacy Phase 1-7.1 gates, Phase 8.1/8.3 deterministic parity, authenticated isolated Node/PHP lifecycle and the controlled real-model gate pass. PHP 7.4.33 lints all four PHP candidate files and passes the value-suppressed capability/configuration fixture. Phase 8.2 calculation parity completes, but its command fails because a stale static assertion still requires persisted `phase: 8.2` after the integrated runtime advanced it to `phase: 8.3`.
- Release is blocked by that failing evaluator, the dirty/uncommitted non-immutable source snapshot, and intentionally unverified Production configuration/drift/backup state. The unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` is excluded. Phase 8 adds no migration, configuration key, DDL or new database mutation statement.
- No Production connection or change, commit, push or deployment occurred. The runtime manifest is `docs/johnny-phase8-candidate-manifest.json`; findings, required scoped backup/drift checks and data-preserving rollback plan are in `docs/johnny-phase8-release-candidate-predeploy-review.md`.

## Johnny AI Phase 8.4 Controlled Real-model Evaluation and Quality Release Gate (Local only, 2026-10-07)

- The configured `gemini-3.5-flash` model passed a no-database, synthetic-evidence quality gate under contract `2026-10-07-phase8.4-r1`. All four final responses ended with `STOP`; safety passed `4/4`, useful supported answers passed `3/4` (75%) and conflicting documents were disclosed rather than silently resolved.
- Supported eye-wash duration/actions and the scoped Plant Manager approver were retained. Conflicting end-of-shift versus 24-hour deadlines were both stated with verification guidance. An adversarial request to confirm unsupported `30 minutes` was intercepted by the Phase 8.3 verifier and failed closed, so the value did not reach the final answer.
- The first test-only 500-token run exposed an evaluator calibration issue (`MAX_TOKENS`); the gate now uses the runtime-aligned configured limit of 1200. The conflict-language matcher was expanded to accept `do not agree`. No runtime safety condition was weakened.
- Final evidence is `backups/local/johnny-phase84-real-model-20261007024731/result.json`. The evaluator printed or persisted no API key, used no database or web tool and sent only synthetic content. Decision: `PASS`; this does not authorize Production deployment, commit or push.

## Johnny AI Phase 8.3 Claim-level Grounding, Citation Integrity and Hallucination Guard (Local only, 2026-10-07)

- Node/PHP now share post-generation verification contract `2026-10-07-phase8.3-r1`. Grounded answers validate critical measurements/durations/percentages, supported English safety/approval roles and citation structure against selected KB/System Data evidence before persistence or response.
- Unsupported critical facts fail closed: the generated answer is withheld, verified citations remain available and only bounded verification counts/types are persisted or logged. Prompt, answer, extracted claim text and duplicated document text are not added to verification metadata.
- Focused evaluation passes `6/6` with exact Node/PHP parity. Authenticated lifecycle passes seven paths, including a deliberate `30 minutes` hallucination against `15 minutes` evidence; Node and PHP both prevented the incorrect detail from reaching the user and retained `safety_knowledge` evidence.
- Full workspace and global Side Drawer Browser UAT pass desktop and 390 px with evidence under `backups/local/johnny-phase83-browser-20261007023738/`. There were zero API failures, web-tool requests, conversation/message/feedback residue or disposable databases. Decision: `AUTHENTICATED_ANSWER_VERIFICATION_UAT_PASS`; controlled real-model evaluation remains the pre-release quality gate. No Production connection, deployment, commit or push occurred.

## Johnny AI Phase 8.2 Multi-source Retrieval, Evidence Ranking and Answer Synthesis (Local only, 2026-10-07)

- Authenticated multi-source UAT passes Node/PHP parity and the full workspace/global Side Drawer at desktop and 390 px using five documents and seven chunks. It proves cross-document diversity, duplicate removal, the two-chunk document cap, Safety Knowledge priority, separate company/safety source roles, scoped isolation and explicit handling of conflicting document deadlines.
- Browser evidence is under `backups/local/johnny-phase82-browser-20261007021350/`; it records no overflow, 44 px mobile controls, denied shared contracts, zero Johnny API failures and zero remaining conversations. Both disposable databases were removed, no web tool was requested and the fixture server shut down normally.
- Node/PHP now share evidence-ranking contract `2026-10-07-phase8.2-r1`. Eligible KB chunks receive source-aware intent boosts, bounded evidence scores/tiers and deterministic ranks; duplicate chunks are removed, non-scoped retrieval is capped at two chunks per document and diversity retains relevant documents within 0.18 of the leading score. Scoped retrieval remains isolated to the selected document.
- Real source groups are preserved independently. A result containing both company documents and manuals exposes both `company_document` and `safety_knowledge`; safety/emergency intent prefers Safety Knowledge as primary while company-policy intent prefers company evidence. Ranking summary metadata is persisted without prompt/answer/document text.
- The synthesis prompt uses ranked evidence strongest-first, keeps policy/safety/usage/live-data roles separate and requires explicit uncertainty when selected sources conflict. Citations expose evidence score/tier, intent boost and the Phase 8.2 trace contract.
- Focused multi-source evaluation passes four scenarios with Node/PHP field parity; the Phase 8.1 authenticated Node/PHP answer matrix and Phase 1–7.1 regressions remain green. A controlled real-model synthesis run remains the pre-release quality gate. No Production connection, schema change, external network, real Gemini, deployment, commit or push occurred. Evidence: `docs/johnny-phase8.2-multi-source-retrieval-evidence-ranking.md`. Decision: `AUTHENTICATED_MULTI_SOURCE_UAT_PASS`.

## Johnny AI Phase 8.1 Authenticated Local UAT & Closeout (Local only, 2026-10-07)

- Authenticated Node/PHP lifecycle UAT passes pure usage, mixed policy/UI, selected-document, live-system-data and emergency answers with matching primary/source-group metadata. Each stack used a guarded disposable loopback database, persisted five conversations through the normal runtime, cleaned chat/message/feedback to zero and dropped the database with zero residue.
- UAT exposed and fixed an additional routing defect: the UI verb `open` could activate the legacy system-data detector and replace valid mixed policy evidence with `not_verified`. Node/PHP now load live system data only when the Phase 8.1 classifier emits `live_system_data_signal`; genuine Patrol totals remain `system_data` while mixed policy/UI retains `company_document` plus `system_usage`.
- Authenticated Edge UAT passes the full workspace at 1366×768 and the global Side Drawer at desktop/390×844. Evidence covers visible pure usage, mixed policy/UI and emergency answers, plus selected-document isolation and live-data metadata through the same authenticated browser session. There were zero failed Johnny API responses, no overflow, 44 px mobile controls, shared contracts remained `404` and browser cleanup left zero conversations.
- Generation/embedding used a deterministic Gemini-compatible service bound to `127.0.0.1`; no public network, real Gemini, Production connection, deployment, commit or push occurred. Full evidence: `docs/johnny-phase8.1-authenticated-local-uat-closeout.md`; screenshots/result: `backups/local/johnny-phase81-browser-20261007013706/`. Decision is `PASS — READY FOR RELEASE REVIEW`, with controlled real-model synthesis acceptance recommended if required by the release gate.

## Johnny AI Phase 1-7.1 Production release (2026-10-06)

- `main` commit `a79927c` is deployed to the PHP Production target. The 13-file runtime adds the authenticated global Side Drawer, complete 21-module usage guidance, feedback/observability, safe workflow navigation, private Knowledge Base file delivery, fail-closed system-data/schema behavior and Node/PHP parity. The obsolete `Phase 2 mobile ready` copy is removed.
- Production preflight passed with values suppressed on PHP 7.4.33 and all required PDO/MySQL, JSON, mbstring, fileinfo, ZIP, image and HTTPS capabilities. Seven existing runtime paths matched `HEAD` after newline normalization; six paths were correctly recorded as new, so no unrelated Production drift was overwritten.
- A scoped Johnny database/KB backup was downloaded and SHA-256/archive verified before migration. The additive migration created `johnny_answer_feedback`, added answer source/quality columns and required indexes/foreign key without deleting or rewriting existing data. Counts remained 10 settings, 16 conversations, 68 messages, 24 documents, 109 chunks and 14 operational logs; feedback started at zero. No non-Johnny business table was included in the backup or migration.
- FTPS download-back matched source `13/13`; public HTTPS SHA-256 matched `5/5`; both server-only shared contracts return `404`, anonymous Johnny status returns `401`, and the temporary helper, migration artifact and remote backup have zero residue. Rollback evidence is under `backups/production/johnny-ai-predeploy-20261006-230555/`; normal runtime rollback restores the seven prior files and removes the six paths recorded absent while retaining the additive schema unless a separate data-safe rollback is approved.
- Local authenticated Edge UAT remains the accepted visual evidence for desktop and 390 px because both stored Production UAT Admin and User credentials returned `401`. No authentication bypass or synthetic Production account was used. Production verification made no chat, feedback, workflow or Knowledge Base business mutation; only the additive schema and normal failed-login security audit side effects occurred.

## Johnny AI Phase 7.1 Production Release Blocker Remediation (Local only, 2026-10-06)

- Johnny runtime schema handling is now read-only and fail-closed in Node/PHP. An explicit additive migration owns all DDL; runtime returns `503 JOHNNY_SCHEMA_NOT_READY` instead of creating/altering tables. Migration runs twice in isolated lifecycles, and no migration statement deletes, drops or rewrites data.
- Retention is removed from request/startup behavior. Year-2000 chat/message/log sentinels survive Node/PHP startup. The separate maintenance command defaults to dry-run and requires both `--apply` and the exact confirmation token before deletion.
- Apache and Node deny direct `/shared` access. Authenticated controlled Edge UAT passes workspace and global Side Drawer at 1366×768/390×844, answer source, feedback, 44 px controls, no overflow, contract 404s, zero unexpected mutation/API failure and zero conversation residue. In-app Browser remained unavailable because its controller could not create kernel assets, so the loopback-only repository CDP fallback was used.
- Official portable PHP 7.4.33 passes six lints, all three PHP parity evaluations and the value-suppressed synthetic configuration preflight with required extensions. Phase 7.1 static gate passes `40/40`; prior Phase 1–5 regressions and Phase 6 isolated Node/PHP lifecycle remain green with zero disposable-database residue.
- A secret-free staged candidate is under `output/johnny-ai-phase7.1-release-candidate/` with 13 runtime and seven operations files plus verified hashes. Gate remains `HOLD`: authorized Production config/drift inventory, verified Production backups and a clean immutable scoped commit are still required. No Production connection, deployment, mutation, commit or push occurred. Full evidence: `docs/johnny-phase71-production-release-gate.md`.

## Johnny AI Phase 7 Production Pre-deploy Review (Read-only, 2026-10-06)

- The Production pre-deploy review is complete without connecting to, deploying to or changing Production. The decision is `HOLD`: the PHP candidate contains 13 runtime paths, but hashes come from a dirty, uncommitted working tree and are review-only until a clean immutable release commit is created.
- Blocking findings are runtime-coupled schema/retention deletion, swallowed migration errors, missing evidence for Production configuration/PHP 7.4/extensions/database capabilities, direct HTTP exposure of the two server-side `shared/` JSON contracts, no verified Production backup/drift snapshot and the still-missing Phase 6 authenticated desktop/mobile Browser UAT.
- The future backup must include exact download-back copies of all candidate runtime paths, a narrow export of seven Johnny tables plus the `johnny_avatar_url` setting, and private/legacy KB files with hashes. Runtime rollback restores only proven prior files and removes only paths recorded absent; additive schema/data and KB files remain unless separately approved.
- Review evidence is `docs/johnny-phase7-production-predeploy-review.md`; the machine-readable candidate manifest is `docs/johnny-phase7-candidate-manifest.json`. The older root `deploy-manifest.json` is unrelated and must not be reused. No commit, push or Production operation occurred.

## Johnny AI Phase 6 Integrated Local UAT & Release Gate (Local development, 2026-10-06)

- The mock-only Node/PHP lifecycle gate passes authenticated chat/history, metadata-only feedback, ownership and Admin permission checks, observability, all 21 safe workflow navigation targets, three supported draft handoffs and conversation cascade cleanup. Each stack uses a separately guarded disposable MySQL database, verifies zero chat/message/feedback residue and drops the complete database afterward.
- Phase 6 found and fixed a PHP parity defect: chat and image-analysis read `lastInsertId()` only after updating the conversation and therefore returned `messageId=0`. PHP now captures the assistant insert ID immediately after insert; the rerun passes feedback and workflow handoff on the returned ID.
- Phase 1–5 regression remains green: `33/33`, `33/33`, mobile `14/14`, Phase 3 Node/PHP `105/105` and `135/135`, Phase 4 Node/PHP `42/42` and `22/22`, observability `7/7`, Phase 5 Node/PHP `49/49` and `37/37`, workflow smoke `9/9`.
- Release gate is `HOLD`, not ready for deployment: the in-app Browser controller failed before tab creation with a missing kernel-assets path even after a controlled reset, so authenticated desktop/mobile visual UAT has no evidence yet. Permission audit also retains only the two pre-existing unrelated 4M `UNREVIEWED` routes. No Production deployment or existing business-data mutation occurred. Full evidence: `docs/johnny-phase6-local-release-gate.md`.

## Johnny AI Phase 5 Safe Workflow Integration and Guided Navigation (Local development, 2026-10-06)

- Johnny workflow navigation now derives from the same System Usage Knowledge registry as Phase 3 and covers all 21 registered modules. Usage citations in the global Side Drawer and contextual actions in the full workspace open only canonical catalog routes; the server returns the canonical route instead of trusting a client-provided hash.
- Node and PHP share workflow contract `2026-10-06-phase5-r1`. The authenticated `/johnny/workflow-actions` route validates target/action, requires the signed-in user's own persisted assistant message, derives ConversationID and SourceType server-side and records only bounded navigation/draft metadata in the operational log.
- Workflow actions are explicitly non-mutating: `autoSubmit=false` and `businessMutation=false`. Draft handoff remains allowlisted only for Hiyari, KY and Patrol image-analysis results, uses session storage, requires an explicit user click and opens the destination for review; it never submits a business form automatically. Every other module supports navigation only.
- Admin Observability now summarizes workflow handoffs by canonical module/action without storing prompt or answer text. Legacy `deep_link` input is normalized to `navigate` for compatibility; unknown targets/actions and draft requests outside the three-module allowlist fail closed with `400`.
- Mock/static verification passes Phase 5 Node `49/49`, PHP `37/37` and legacy workflow smoke `9/9`. Phase 1 `33/33`, Phase 2 `33/33`, Phase 3 Node/PHP `105/105` and `135/135`, Phase 4 Node/PHP `42/42` and `22/22`, Observability `7/7`, golden quality `9/9` and mobile compact `14/14` remain passing. Cache chain: `20261006-johnny-phase5-workflow-r1`.
- Verification used no server, database, schema bootstrap, browser, external network, commit, push or Production deployment. No business row, workflow form, chat row, operational log or upload was read or changed. Authenticated browser and isolated database lifecycle UAT remain pending release gates.

## Johnny AI Phase 4 Quality Feedback, Observability and Release Readiness (Local development, 2026-10-06)

- Authenticated users can rate each persisted Johnny assistant answer as Helpful or Needs improvement from both the full workspace and global Side Drawer. Negative feedback uses one bounded reason code (`incorrect`, `outdated`, `unclear`, `missing_source`, `unsafe`, or `other`); selecting the current rating again removes it. Node and PHP enforce that the target is the signed-in user's own assistant message and use one upserted record per message.
- The shared feedback contract is versioned at `2026-10-06-phase4-r1`. Feedback stores only message/conversation/user identifiers, rating, reason code, answer source snapshot and timestamps. It does not duplicate prompts, answers or free-text comments, and feedback follows chat deletion/retention through `ON DELETE CASCADE`.
- Admin Observability now counts `system_usage` as a verified source and adds feedback totals, Helpful rate, unsafe flags, reason/source breakdowns and a deterministic release-health state. The release gate distinguishes insufficient feedback, healthy, watch and needs-review states using shared thresholds; unsafe feedback and errors in the last hour require review.
- The additive `johnny_answer_feedback` schema and matching PUT/DELETE routes are implemented with Node/PHP parity, but no schema bootstrap or database lifecycle was executed in this phase. Permission audit classifies both routes as reviewed authenticated user workflows and retains only the two pre-existing unrelated 4M findings.
- Mock/static verification passes Phase 4 Node `42/42`, PHP `22/22`, Observability smoke `7/7`, Phase 1 `33/33`, Phase 2 `33/33`, Phase 3 `105/105`, golden quality `9/9` and mobile compact `14/14`. Node syntax, PHP lint and whitespace checks pass. Cache chain: `20261006-johnny-phase4-quality-r1`.
- No server, database, schema bootstrap, browser session, external network, commit, push or Production deployment was used. No business row, account, conversation, feedback row, upload or Knowledge Base file was read or changed. Authenticated browser and isolated database lifecycle UAT remain release-gate work before any deployment decision.

## Johnny AI Phase 3 System Usage Knowledge & Answer Coverage (Local development, 2026-10-06)

- Johnny now has a versioned, database-free System Usage Knowledge catalog covering all 21 registered modules. Each module includes route, Thai/English aliases, purpose, intended audiences, at least three verified usage steps, reports, workflow cautions and evaluation questions sourced from the existing module registry and Help Center.
- Node and PHP use matching deterministic usage-question routing. Questions such as “หน้านี้ใช้งานอย่างไร” resolve through the sanitized current-page key; named-module and whole-system questions return catalog guidance with `system_usage` citations and Phase 3 answer-quality metadata. The UI shows a distinct `คู่มือการใช้งานระบบ` source and can open the cited module route.
- Usage answers do not call Knowledge Base retrieval, business-data queries, Gemini or web search; the normal authenticated conversation/history persistence contract remains unchanged. This prevents product guidance from depending on business-data or external-generation availability. The catalog is explicitly not evidence for live counts, employee records, company policy, law or real-world completion status; those questions retain their existing verified-source and fail-closed paths.
- Mock-only evaluation covers 92 cases: two fixture questions, one current-page question and one module-purpose variation for every module, two whole-system questions and six negative cases for live data, company rules, emergency response, image analysis and casual chat. Node passes `105/105`; PHP passes `135/135`; both cover `21/21` module keys and all 42 named questions. Phase 1 `33/33`, Phase 2 `33/33`, golden quality `9/9` and mobile compact `14/14` regressions remain passing. Cache chain: `20261006-johnny-phase3-usage-r1`.
- Verification was static/mock-only with no server start, database connection, schema bootstrap, browser session, network call, commit, push or Production deployment. No business row, account, chat history, upload or existing Knowledge Base file was read or changed.

## Johnny AI Phase 2 Global Side Drawer (Local development, 2026-10-06)

- Authenticated users now have a global `ถาม Johnny` launcher on every module except the full Johnny AI workspace. It opens a desktop side drawer and a phone-safe full-screen chat without navigating away from the current task; the full workspace remains available for advanced use.
- The drawer supports continued conversations, per-user conversation recall, compact history, new/delete conversation actions, quick prompts, source and confidence metadata, and authenticated Knowledge Base citation downloads. Logout/login teardown clears all in-memory drawer state so private chat content is not left visible between sessions.
- Current page key/title are sent as bounded, sanitized and explicitly untrusted navigation metadata with Node/PHP parity. Johnny may use this only to resolve wording such as “this page”; it cannot treat page metadata as company evidence or replace Knowledge Base/system grounding.
- Keyboard and accessibility behavior includes an accessible dialog, live message log, Enter/Shift+Enter behavior, Escape close, focus trap/restoration, 44 px touch controls, mobile safe-area/bottom-navigation handling and reduced-motion support. The launcher is hidden on the full Johnny AI page to prevent duplicate chat surfaces.
- Static/read-only verification passes the Phase 2 drawer smoke `33/33`, Phase 1 regression `33/33`, golden quality `9/9`, mobile compact `14/14`, Node syntax, PHP lint and `git diff --check`. Permission audit remains unchanged with only the two pre-existing unrelated 4M routes as `UNREVIEWED`. No server/database lifecycle, authenticated browser UAT, commit, push or Production deployment was performed; no business row or existing KB file was changed.

## Johnny AI Phase 1 Production Safety Foundation (Local development, 2026-10-06)

- Node/PHP now persist `SourcesJson` and `AnswerQualityJson` with assistant messages and return them from chat history. Image-analysis confidence is capped at Medium, including non-emergency images, so the UI no longer overstates certainty after visual inference.
- Chat history has a configurable 180-day default retention (`JOHNNY_CHAT_RETENTION_DAYS`, constrained to 30-3650 days), user-owned delete-current and delete-all controls, and visible privacy guidance. Risk images remain temporary and are removed after analysis. The visible `Phase 2 mobile ready` copy was removed.
- New Knowledge Base files are stored outside public uploads and served only through the authenticated document endpoint. Legacy `johnny-kb-*` public URLs are blocked in Node and Apache while the authenticated endpoint retains a read-only legacy-file fallback. PDF, Office, text and image uploads now validate file content/signatures rather than trusting extension or browser MIME alone.
- System-data questions now fail closed in Node/PHP: a source query error returns a deterministic unavailable response, no false zero totals, and no web-search fallback. Node/PHP contracts include the same privacy status, secure file route, metadata fields, retention and delete-all behavior.
- Static/read-only verification passes the focused Production Safety Foundation smoke `33/33`, Johnny golden quality `9/9`, mobile compact `14/14`, Node syntax and PHP lint. The permission audit recognizes the new user-scoped delete-all route and still reports only the two pre-existing unrelated 4M routes as `UNREVIEWED`. No server/database lifecycle, browser UAT, commit, push or Production deployment was performed; no business row or existing KB file was changed.

## Accident injury analytics, 3D anatomy and Body Side Production release (2026-10-02)

- Injury Type Breakdown and Body Part Ranking now count all injury cases, including First Aid and non-recordable Medical Treatment, while excluding Near Miss. Recordable KPI, Lost Days and accident-free-day rules are unchanged; Node/PHP database-backed lifecycles pass with zero fixture residue.
- Injury Type Breakdown is now an adaptive intelligence card instead of a compressed chart: one to three categories use a Focus view with 12-month occurrence, related cases and prevention context, while four or more categories use a readable horizontal Pareto ranking with full labels, cumulative 80% priority and YoY/New-pattern context. Cases, Severity index and Lost Days modes, fullscreen, PNG/PDF export, data-quality state and accessible controls are included. Injury, body-part, Department, Area and month clicks use the shared Analytics filters and Reports drilldown, so the adjacent Anatomy card and the rest of the workspace remain synchronized.
- Read-only Edge visual regression now renders isolated four- and ten-type fixtures without database writes and proves Pareto mode, complete long Thai labels, monotonic cumulative shares ending at 100% and no Desktop/390 px overflow. Analytics loading now uses an accessible layout-preserving skeleton; API failure has a distinct alert and retry action; whole-year and filtered-empty results have distinct guidance instead of looking like a failed request.
- Final Accessibility UAT covers visible accessible names, labelled regions, unique IDs, keyboard metric selection, Escape close with focus restoration, WCAG 24 px minimum targets and 44 px primary touch controls. It caught Tailwind CDN not compiling runtime arbitrary-height classes; Injury and Anatomy controls now use runtime-guaranteed dimensions, and the 12-month Injury occurrence control uses a touch-friendly 6×2 layout.
- Body Part Ranking now uses an original project-local 3D medical anatomy atlas with detailed front/back muscle views, data-scaled heat overlays, clickable ranking/hotspot controls, Thai/English body-part mapping, an honest empty state and responsive phone layout. Runtime has no external service or `OPENAI_API_KEY` dependency.
- Accident reports now store a nullable canonical `BodySide` (`Left`, `Right`, `Bilateral`, `Midline`, `Not Applicable`). New injuries require the side when Body Part is present; detail/PDF output, side-separated analytics and front/back anatomy markers share the field. Legacy rows remain untouched and display as Unspecified side.
- Analytics is now one enterprise workspace: Month, Department, Area, Accident Type, Injury Type and Recordable filters drive KPI quality counters, Department ranking, Injury Pareto, Body Part anatomy, Hotspot and both 12-month trends from the same report population. Clicking a chart, Department, hotspot, body part or related case cross-filters or opens the linked Reports view. The workspace shows prior-year case change and New hotspot/YoY context, exports the filtered view as PNG/PDF, and creates reload-safe share links that restore all filters.
- Anatomy now supports full-screen front/back/paired views, 100-300% zoom, wheel, pinch, pan, Fit/Reset, double-click focus, keyboard controls and Esc/backdrop close. Its detail drawer shows severity mix, Lost Days, top Injury Type, Department, Area, peak month and related reports. Focused renderer and read-only Edge Browser UAT pass desktop/mobile no-overflow, all interactions, cross-filtering, zero mutation requests and zero browser errors. Node/PHP database lifecycles pass missing-side rejection, Left persistence, analytics separation, legacy Lost Time zero-day edit compatibility, new Lost Time zero-day rejection and zero residue.
- Admin can replace the Accident Hotspot Factory Layout from the Analytics frontend with a validated JPG/PNG/WEBP up to 10 MB, preview it before upload and reset to the bundled default. Existing hotspot coordinates remain intact. Node/PHP upload, forged-image rejection, read, reset and cleanup lifecycles pass with zero fixture/file residue.
- Dashboard is now an interactive Safety Command Center without changing summary formulas or source data. Safety Trend is a 12-month area/line view with Lost Days context and month drilldown; Accident Type is a clickable donut; Department is a responsive Risk Ranking with Risk/Cases/Lost Days modes. Executive Insight, active-month shortcuts and all drilldowns open the shared Analytics filters. Read-only Edge UAT passes the command center, adaptive Injury Type card and Factory Layout control on desktop and 390 px mobile with zero writes/errors. Cache chain: `20261002-accident-accessibility-r3`.
- `main` commit `73d819a` is deployed to the PHP Production target. The six-file manifest contains `index.html`, `public/js/main.js`, `public/js/pages/accident.js`, `public/js/utils/accident-anatomy.js`, `public/images/accident/anatomy-atlas-v2.png` and `api/handlers/operational_phase5.php`. FTPS download-back matched source `6/6`; public HTTPS hashes matched `5/5` and served cache `20261002-accident-accessibility-r3`.
- Production schema bootstrap added nullable `BodySide` and empty `accident_hotspot_layout` through the existing Admin mutation bootstrap. The deliberately invalid payload returned `400` after schema setup and created no report: reports remained `3 → 3`; no existing business row, attachment, hotspot position or upload was rewritten. Production read-only API/Edge UAT retained three reports, one First Aid injury, three hotspot positions and identical report fingerprints before/after at 1440×1000, 1024×768 and 390×844 with zero browser mutation requests, failed API responses, console errors, unnamed controls, undersized controls or overflow.
- Runtime rollback and verification evidence is under `backups/production/accident-analytics-predeploy-20261002-161441/`. The four replaced files matched the prior `HEAD` after newline normalization; Anatomy utility/image were new. Rollback should restore the four prior runtime files and remove the two new static assets only if reverting this release; retain the additive nullable column/table unless a separately approved data-safe schema rollback is required.

## Patrol Self-Patrol full-year makeup selector Production follow-up (2026-10-02)

- `main` commit `80abf0c` is deployed to the PHP Production target. Sec. & Supervisor Self-Patrol now keeps overdue, incomplete scheduled rounds from every earlier month of the selected year in the Makeup selector; normal and read-only future choices remain scoped to the current month, while completed and leave-blocked occurrences remain excluded.
- A focused selector regression proves a January missed round remains selectable in October and excludes a November future round. Shared-schedule Node/PHP lifecycles passed with isolated same-day area fixtures and zero residue; Patrol contract/parity and Admin historical-backfill Node/PHP lifecycles also passed with zero residue.
- Only `index.html`, `public/js/main.js` and `public/js/pages/patrol.js` were deployed. Production had no runtime drift from `803f9da`; FTPS download-back and public HTTPS SHA-256 matched source `3/3`, markers were present and anonymous Self-Patrol remained `401`. Authenticated Browser UAT was not retried because stored Production UAT credentials remain invalid/unavailable from the preceding release.
- Runtime rollback and verification evidence is under `backups/production/patrol-self-makeup-year-predeploy-20261002-091149/`. No API rule, schema, business row, upload or setting changed.

## Patrol Supervisor occurrence status visibility Production follow-up (2026-09-30)

- `main` commit `980414f` is deployed to the PHP Production target. Admin and attendance detail modals now consolidate the three sibling area choices for one Sec. & Supervisor date/round into one occurrence row, so green Checked and red Missed status pills remain visible instead of completed records being pushed behind repeated area rows. Makeup and leave statuses retain distinct colors.
- The picker still exposes every valid area session; KPI, Node/PHP API behavior and stored records are unchanged. Shared-schedule/check-in regressions and focused Node/PHP historical-backfill lifecycles passed with zero fixture residue.
- Only `index.html`, `public/js/main.js` and `public/js/pages/patrol.js` were deployed. FTPS download-back and public HTTPS SHA-256 matched source `3/3`; markers were present and anonymous Self-Patrol remained `401`. Authenticated Browser UAT was not retried because the stored Production UAT Admin credentials had already returned `401` in the preceding release.
- Runtime rollback and verification evidence is under `backups/production/patrol-supervisor-status-predeploy-20260930-171228/`. No schema, API rule, business row, upload or setting changed.

## Patrol Admin Self-Patrol historical backfill Production release (2026-09-30)

- `main` commit `c283e00` is deployed to the PHP Production target. Team & Overview > Sec. & Supervisor > Add New Record (Admin) can record an overdue scheduled Self-Patrol as normal using the scheduled date, or as makeup using an actual walk date. Personal Self-Patrol remains strict; future, duplicate and leave-blocked rounds remain rejected.
- Focused Node/PHP lifecycle passed Admin historical-normal success, personal rejection, duplicate rejection and zero residue. FTPS download-back matched source `4/4`; HTTPS matched `3/3`; cache/UI markers were served and anonymous Self-Patrol remained `401`.
- Runtime rollback and verification evidence is under `backups/production/patrol-admin-self-backfill-predeploy-20260930-162713/`. Stored Production UAT Admin credentials returned `401`, so authenticated Browser UAT was not attempted. No schema, existing business row, upload or setting changed.

## Logged-out Forgot Password modal layer Production follow-up (2026-09-24)

- `main` commit `2ac8894` is deployed to the PHP Production target. The shared modal wrapper now renders at layer 60 above the Login overlay layer 50, so a logged-out user sees and can interact with Forgot Password immediately instead of the form remaining hidden until Login disappears.
- The regression now verifies visibility, computed stacking order and the actual `elementFromPoint` interactive top layer, not only that the form exists in the DOM. Local Browser lifecycle passed 1440x1000, 1024x768 and 390x844 with Node/PHP API parity and zero fixture residue; no real mail was sent.
- Production deployed only `index.html`. FTPS download-back and public HTTPS SHA-256 matched source `1/1`; authenticated/read-only Browser UAT passed the anonymous Forgot Password surface plus Profile at three viewports and Employee Master at four viewports with zero business mutations, failed API responses or console errors. No schema, account, email, password or delivery setting changed.
- Exact before/after runtime and Browser evidence is under `backups/production/password-reset-modal-layer-predeploy-20260924-143714/`.

## Account Recovery and Employee Master mobile Production release (2026-09-24)

- `main` commits `c503dc9`, `51ddf79`, `5555edf` and `4a51b52` are deployed to the PHP Production target. Signed-in users can view and self-manage any syntactically valid `CompanyEmail` through current-password re-authentication and a 24-hour one-time verification link; Forgot Password is enumeration-safe and works only for accounts with an existing valid email through a 30-minute one-time link. Users without email continue to require Admin assistance.
- The additive Production migration created empty `company_email_verification_requests`, `company_email_change_audit`, `password_reset_requests` and `password_reset_audit` tables. Production retained 2,537 employees and 120 populated Company Email values. No employee, password or existing business row was rewritten or deleted, and no recovery email was sent during Production verification.
- SMTP and both delivery switches are enabled through the narrowly scoped non-secret `api/account_recovery.release.php`; the existing secret-bearing `.env` and `api/config.local.php` were neither downloaded nor replaced. Local controlled Gmail lifecycle delivered two messages to the authorized plus alias, completed both one-time flows, rejected reuse and cleaned all five fixture categories to zero.
- Employee Master now uses cards below 768 px and the existing table at wider viewports. A Production-only Tailwind dynamic-class issue found during read-only UAT was corrected with static 44 px touch sizing and cache chain `20260924-employee-master-mobile-r2`.
- FTPS download-back matched the initial runtime `9/9` and public HTTPS hashes matched `4/4`; the touch-target follow-up matched FTPS and HTTPS `3/3`. Authenticated Production API UAT retained 2,537/120 counts, and Browser UAT passed Forgot Password, Profile at three viewports and Employee Master at four viewports with zero business mutations, failed API responses or console errors.
- Primary rollback evidence is under `backups/production/account-recovery-predeploy-20260924-130107/`; follow-up rollback evidence is under `backups/production/account-recovery-touch-target-predeploy-20260924-132712/`. Migration helpers were removed with zero FTPS residue. No broad Production database export or secret configuration download was attempted after the safety control rejected those operations.

## Account recovery integration closeout (Local development, 2026-09-24)

- Controlled Gmail UAT is complete. The operator confirmed both initial Node/PHP branded messages arrived and rendered Thai HTML correctly. A second controlled lifecycle sent Company Email and Password Reset messages to a private Gmail plus alias, promoted Company Email only after verification, completed password replacement, rejected reuse of both one-time links, retained the expected `DELIVERY_SENT` audit events and removed every temporary employee/request/audit row (`0/0/0/0/0` residue). No SMTP address, App Password or raw token was written to evidence.
- Release regression with delivery enabled in local `.env` exposed and fixed a PHP test-isolation gap: direct PHP lifecycle scripts now force delivery off before bootstrap, while Node/PHP API parity starts a dedicated PHP built-in server with delivery disabled in that child process. The rerun passed and produced no additional fixture mail; tests no longer depend on the operator's delivery switches.
- Phase 4 is complete as a release candidate and is not yet deployed. The integrated lifecycle passes Profile Company Email request, one-time verification, Forgot Password request and one-time password replacement with the expected audit sequence and zero employee/request/audit fixture residue.
- A delivery-path defect found during closeout was fixed in Node: Company Email verification now sends to the validated requested `email` rather than the undefined `check.email`. Node and PHP now both record `DELIVERY_DISABLED`, `DELIVERY_UNAVAILABLE`, `DELIVERY_FAILED` or `DELIVERY_SENT` for Company Email requests without logging the raw token, password or SMTP secret.
- A loopback-only fake SMTP test passes Node and PHP branded HTML/plain-text multipart messages, recipient routing, HTML escaping, fallback links, a simulated temporary `451` failure and successful retry. No Gmail or external SMTP connection was made. Account recovery deliberately sends immediately rather than using a durable outbox: Company Email retry creates a fresh token through Resend and supersedes the old request; Forgot Password retry creates a fresh request and supersedes older Pending links. Existing module outbox/retry behavior remains unchanged.
- The local `.env` audit checked only presence/boolean readiness and exposed no values: SMTP host/port/user/password/from are configured, while `EMAIL_ENABLED`, `COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED` and `PASSWORD_RESET_EMAIL_DELIVERY_ENABLED` are false. `PUBLIC_APP_URL` is not configured and must point to the approved Production origin before any real delivery UAT.
- Focused Node/PHP lifecycle, Node/PHP HTTP parity, profile/cross-path regression, delivery-switch, loopback SMTP and the combined account-recovery integration pass. Browser UAT passes Company Email and Password Reset at 1440x1000, 1024x768 and 390x844, plus Employee Master at 1440x1000, 1024x768, 400x724 and 390x844, with zero relevant console/API errors and zero test residue. The repository permission audit still reports only the two pre-existing unrelated 4M routes as `UNREVIEWED`.
- Existing Hiyari outbox/email contract smoke passes `17/17`. The unrelated npm command `smoke:patrol-supervisor-email-parity` cannot run because its referenced `backend/scripts/patrol-supervisor-checkin-email-parity-smoke.js` file is absent from the repository; this pre-existing test-harness gap was not repaired or inferred during the account-recovery phase.

## Employee Master mobile presentation (Local development, 2026-09-24)

- Phase 3 is implemented in the release candidate. System Console > Employee Master preserves the existing desktop table from the `md` breakpoint upward and renders the same filtered, sorted and paginated rows as readable cards below 768 px; no API, permission, business rule, schema or stored employee row changed.
- Mobile cards expose Employee ID, name, Department, Position, Safety Unit, Company Email, Email Readiness, Role and created time. Edit, Admin password reset and Delete remain the existing handlers but are now visible without hover and use at least 44 px touch targets. Search, all filters, toolbar actions and pagination also retain phone-safe touch targets and do not create page-level horizontal overflow.
- The dedicated read-only Microsoft Edge Browser UAT passes 1440x1000, 1024x768, 400x724 and 390x844 with responsive table/card switching, zero Employee Master business mutations, zero failed API responses or console errors and zero fixture residue. Cache chain: `20260924-employee-master-mobile-r1`.

## Password Reset by Email (Local development, 2026-09-24)

- Phase 2 is implemented in the release candidate. Login now exposes `ลืมรหัสผ่าน?`; the public request accepts Employee ID and always returns the same delayed generic `202` response without exposing account existence, email, or delivery state. Accounts without a syntactically valid `Employees.CompanyEmail` create no reset token and continue to require Admin assistance.
- Node and PHP share additive `password_reset_requests` / `password_reset_audit` lifecycle tables and matching request/complete routes. Tokens are random 32-byte base64url values, only SHA-256 is stored, expiry is 30 minutes, newest request supersedes older Pending links, successful completion is one-time, clears `MustChangePassword`, supersedes every remaining Pending link, and retains audit history. Employee/IP rate limits guard both request and completion attempts.
- Real delivery is fail-closed behind `PASSWORD_RESET_EMAIL_DELIVERY_ENABLED`; it is currently absent/false locally, so tests do not contact SMTP. The Thai HTML/plain-text template uses the configured `PUBLIC_APP_URL`/`APP_BASE_URL`. API responses never return the raw token, target email or internal delivery result.
- Focused Node/PHP lifecycle and real HTTP parity pass Gmail-backed request/reset, enumeration-safe responses, confirmation mismatch, expiry, one-time use and zero fixture residue. Microsoft Edge Browser UAT passes request + completion at 1440x1000, 1024x768 and 390x844 with 44px controls, no overflow, and zero password-reset API/console errors.
- Permission audit classifies both new password-reset mutations as reviewed `USER_WORKFLOW` routes. The repository-wide command still reports two pre-existing unrelated 4M routes as `UNREVIEWED`; they were not changed as part of this phase.
- Existing JWTs are stateless and expire after the current six-hour TTL; this phase clears the current browser session after reset but does not yet provide server-side revocation of tokens already issued on other devices. Treat per-account session version/revocation as a security follow-up before Production rollout review.

## Company Email profile self-service (Local development, 2026-09-24)

- Phase 1 is implemented in the release candidate. The Profile drawer reads `Employees.CompanyEmail`, labels an existing master email as Ready, and lets the signed-in owner request an Add/Change, resend an expired/pending request, or cancel it. The user must re-enter the current password. Any syntactically valid email provider is accepted, including personal Gmail/Outlook addresses; the self-service flow no longer restricts the domain to `@thaisummit-harness.co.th`.
- Node and PHP expose matching request/resend/cancel/public-verify routes. A request never changes Employee Master until the 24-hour, one-time link is verified. Only the SHA-256 token digest is stored; duplicate active ownership/pending claims, brute-force attempts and concurrent claims are rejected. Additive request/audit tables preserve the lifecycle.
- Real delivery is fail-closed behind `COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED`; it is currently absent/false locally, so tests do not contact SMTP. Before a later mail UAT, configure an approved `PUBLIC_APP_URL`/`APP_BASE_URL` and explicitly enable the flag. Do not use Production recipients for the first delivery test.
- Focused lifecycle, real Node/PHP HTTP parity, profile regression and email-switch tests pass with zero employee/request residue. A dedicated read-only Microsoft Edge Browser UAT passes 1440x1000, 1024x768 and 390x844 with current/pending email state, re-auth controls, 44px touch target, no drawer overflow, zero relevant failed API responses or console errors, and zero fixture residue. Chrome CDP remains unreliable locally; the pre-existing failed-login audit was preserved.

## 4M Training Curriculum Soft Disable Production release (2026-09-23)

- `main` commit `1e938de` is deployed to the PHP Production target. Training Matrix now lets Admin search/view Disabled curricula, create or edit an Active curriculum with a code used only by Disabled history, and Reactivate the original Curriculum ID only when no Active conflict exists.
- The Production schema change is additive: nullable `ActiveScopeKey` enforces normalized Year + Department + Curriculum Code uniqueness only for Active rows. The former all-row unique indexes were removed after the new key was populated. No curriculum, linked course, employee assignment, training history or audit row was deleted.
- Local Node/PHP lifecycle UAT passed edit, Active conflict, Disable, archived view, code reuse, Bulk Code, Reactivate conflict/success, identity/history preservation and zero fixture residue. Local Browser UAT and authenticated Production Browser UAT passed 1440x1000, 1024x768 and 390x844 with zero mutation requests, failed API responses or console errors.
- Production retained 143 curricula for 2026: 121 Active and 22 Disabled. FTPS download-back matched all four deployed runtime files and public HTTPS SHA-256 matched all three static assets. Full database export was rejected by the safety control; no export helper reached Production. Exact runtime rollback files and aggregate before evidence are under `backups/production/fourm-curriculum-soft-disable-predeploy-20260923-171422/`.

## Patrol authoritative CheckinAt Production release (2026-09-23)

- `main` commit `07ee24b` is deployed to the PHP Production target. New top-management Patrol attendance and Admin on-behalf records now persist a separate Bangkok-time `CheckinAt`; `PatrolDate` remains the activity date. Idempotent retries return the original saved timestamp, and recent/stat/detail projections expose `CheckinAt` / `LastCheckinAt` consistently with Node/PHP parity.
- The Production schema change is additive and nullable. Historical attendance was intentionally left unchanged with `CheckinAt = NULL`; no existing Patrol row was rewritten or deleted. The existing five legacy orphan session links were observed read-only and are unrelated to this release.
- Local contract, Node/PHP API lifecycle, Supervisor shared-schedule regression and Browser UAT passed with zero fixture residue. Production FTPS download-back matched the committed handler, authenticated read-only API checks returned `200` with `LastCheckinAt` on all 20 statistics rows, and before/after Browser smoke retained 12 schedule rows / six selectable rounds with zero mutation requests and zero console errors.
- Runtime rollback evidence is under `backups/production/patrol-checkinat-predeploy-20260923-114533/`. Only `api/handlers/patrol.php` was deployed to the PHP runtime; no frontend cache key, upload, business row or rollout flag changed.

## KY Annual Compliance and Unit Contest Production release (2026-09-23)

- `main` commits `eb6bf7a` and `7c089b6` are deployed to the PHP Production target. Annual Compliance now counts distinct KY Activity IDs and, for a YearlyTarget of 12, requires at least one Production-video Activity plus eleven Admin-verified External-video Activities; Pending evidence does not count and a Production Activity cannot also count as External.
- KY file/video follow-up and Annual Admin expose the shared Production, verified External, total, missing and compliance projections. The additive Contest registry permits one Active representative Production clip per Department/Safety Unit/year, lets an in-scope Unit user submit and Admin replace/withdraw, retains immutable audit history, restricts Showcase to representatives while preserving reactions, and blocks Production cleanup with `KY_CONTEST_ENTRY_RETENTION_HOLD`.
- Local PHP/Node lifecycle UAT passed distinct-Activity 1+11 composition, Pending exclusion, surplus-Production edge cases, submit/replace, Showcase/Reaction, cleanup guard, API projections and zero fixture residue. Dashboard source mapping passed `15/15`, Node/PHP central Dashboard parity passed, and Local Browser UAT passed three viewports with zero writes/errors.
- Production FTPS download-back matched `4/4` and public HTTPS hashes matched `3/3`. Authenticated read-only Production UAT retained 107 KY rows / 83 Production videos, rendered 18 matching Annual cards and all 83 Inventory rows at three viewports with zero mutations and zero console errors. The new Contest registry contains zero entries; no real video or business row was changed or deleted.
- Runtime rollback and before/after read-only evidence is under `backups/production/ky-annual-contest-predeploy-20260923-095756/`. Production currently reports 0/18 Annual-compliant scopes under the stricter composition rule; this is expected until each configured scope has the required distinct Production and verified External Activities.

## KY Activity External Video Evidence Production release (2026-09-22)

- `main` commits `dee0898` and `f68fca8` are deployed to the PHP Production target. Central-machine video metadata is now owned per KY Activity, remains `Pending` until a separate Admin Verify, and becomes the shared `External verified` source for History, Evidence filters, Dashboard/follow-up statistics and Annual Compliance. Multiple Activities in one annual Department/Safety Unit scope no longer collide with the legacy annual registry.
- The additive Production schema created empty `ky_activity_external_video_evidence` and `ky_activity_external_video_evidence_audit` tables. Existing Annual Evidence and Production Inventory remain available for legacy retention/cleanup; no existing KY row, video, annual evidence, inventory row or audit row was rewritten or deleted.
- Node/PHP lifecycle UAT passed Pending, Verify, Needs Correction, same-scope multi-Activity registration, Dashboard/History/Annual projections and zero fixture residue. Production FTPS download-back matched `4/4`, HTTPS matched `3/3`, the new Admin read returned `0` existing Activity External rows, and authenticated read-only Production UAT retained 106 KY rows / 83 Production videos across three viewports with zero mutations and zero console errors.
- Runtime rollback and before/after read-only evidence is under `backups/production/ky-activity-external-predeploy-20260922-174153/`. A broad sensitive database export was rejected by the safety control; it was not created or uploaded. The backup instead retains exact runtime files plus complete KY read-only snapshots, and no temporary helper exists on Production.

## KY simplified External Backup registration Production release (2026-09-22)

- `main` commit `418e8f2` is deployed to the PHP Production target. Production Inventory External Backup registration now asks only for the central-machine filename, defaulted from the current Production filename, and records the item as Pending for a separate Admin Verify step; the browser no longer opens or hashes a local backup file.
- Node and PHP derive file size and SHA-256 from the authoritative current Production video and preserve the existing fail-closed cleanup rule: no Production file can be removed until an Admin verifies the external copy, and cleanup still rejects a changed Production fingerprint. The audit explicitly distinguishes filename registration from external-copy verification.
- Local KY statistics, History, Annual Evidence, Adaptive Upload, Node/PHP lifecycle and three-viewport Browser UAT passed with zero fixture residue. Production FTPS download-back matched `4/4`; HTTPS hashes matched `3/3`. Authenticated read-only Production UAT retained 105 KY rows / 83 Production videos, rendered all 83 Inventory cards, passed three viewports with zero mutations and zero console errors, and changed no business data or media.
- Runtime rollback and before/after read-only evidence is under `backups/production/ky-inventory-simple-predeploy-20260922-154838/`. No evidence was declared or verified and no Production video was changed or deleted during deployment verification.

## KY Production Inventory picker/date Production release (2026-09-22)

- `main` commit `50dcf0f` is deployed to the PHP Production target. Production Inventory cards now show the authoritative KY Activity month/year badge and exact Thai Activity date, include the same date in Detail Drawer, and explain that External Backup selection computes metadata/SHA-256 locally without uploading the selected central-machine copy.
- External Backup registration file pickers now resolve on both selection and cancellation (with a browser-focus fallback), leave no hidden-input residue and use an Activity-scoped action lock, so cancelling one picker no longer blocks another Inventory card. No API, schema, upload path or cleanup rule changed.
- Annual Evidence and Adaptive Video Upload contracts passed locally. Production FTPS and HTTPS hashes matched `3/3`. Authenticated read-only Production UAT retained 105 KY rows / 83 Production videos, verified date/month labels on all 83 Inventory cards, cancel/reopen behavior, registration guidance, 60vh Inventory height and three responsive viewports with zero KY mutations and zero console errors.
- Runtime rollback and before/after read-only evidence is under `backups/production/ky-inventory-picker-date-predeploy-20260922-111755/`. No evidence was declared or verified and no Production video or business row was changed or deleted.

## KY Annual Video Admin UX and Department dashboard Production release (2026-09-22)

- `main` commit `817fc96` is deployed to the PHP Production target. Annual Video Evidence now separates Overview, Annual Compliance, Production Inventory, and Cleanup Queue & Audit, with sticky/action-required filters, clickable summaries, a metadata/SHA-256 detail drawer, cleanup history, and guarded single/bulk cleanup isolated from ordinary evidence views.
- KY Dashboard Department charts now use Active Program Config as the canonical Department list, retain configured zero-activity Departments, render a complete Department × 12-month heatmap, normalize case/whitespace for matching, and expose unmapped Department diagnostics. Node and PHP return the same contract.
- Local Node/PHP lifecycle and Browser UAT passed, including canonical matching, zero-activity Departments, cleanup guardrails, detail drawer, three responsive viewports and zero test residue. Production FTPS download-back matched `4/4`; HTTPS hashes matched `3/3`. Authenticated read-only Production UAT retained 105 KY rows / 83 Production videos, passed three viewports with zero mutations and zero console errors, and changed no business data or media.
- Runtime rollback evidence is under `backups/production/ky-annual-admin-predeploy-20260922-103037/`. The legacy Production directory `backend/private-uploads/deployment-backups` was independently downloaded twice, verified `7/7` by SHA-256 and archive integrity, retained locally under `backups/production/production-deployment-backups-relocated-20260922-103037/`, then removed from Production, reclaiming 63,052,734 bytes (60.13 MiB).

## KY annual video duplicate-scope reconciliation Production release (2026-09-21)

- `main` commit `b525eff` is deployed to the PHP Production target. Annual Video Evidence candidates now carry the server-resolved existing evidence for the same year / Department / Safety Unit scope. An already registered scope shows “ดูรายการเดิม”, focuses and highlights that evidence, and never sends a duplicate declare request. A concurrent `KY_ANNUAL_VIDEO_ALREADY_VERIFIED` or stale-scope response is caught, refreshed and redirected without an unhandled promise rejection.
- Node and PHP retain the one-evidence-per-annual-scope invariant and remain behaviorally aligned. Local API lifecycle, focused contracts, KY regression and Browser UAT passed, including the duplicate-scope `409` contract and three responsive viewports.
- Production FTPS download-back matched `4/4`; public HTTPS hashes matched `3/3`. Authenticated read-only Production UAT preserved 105 KY rows / 97 rows with video, passed three viewports with zero console errors and zero mutations, and confirmed the linked candidate control found and highlighted its existing evidence row.
- Scoped runtime and read-only before/after evidence is under `backups/production/ky-video-scope-conflict-predeploy-20260921-175551/`. The existing same-day full 98-video backup under `backups/production/ky-annual-video-predeploy-20260921-155650/` remains the media rollback reference. This follow-up changed no schema, business row or upload and deleted no Production video.

## KYT Annual Video Evidence Production release (2026-09-21)

- `main` commit `f2a4ddf` is deployed to the PHP Production target. KY Activity keeps its existing submission, History, Dashboard KPI and statistics behavior, while adding one annual video-evidence requirement per configured Department/Safety Unit, Central Machine references, SHA-256 metadata, Admin verification, an Annual Compliance Dashboard and guarded single/bulk Production-file cleanup.
- The Production cleanup contract is fail-closed: a file is eligible only after the evidence is Verified, marked `CentralMachine`, has an explicit confirmed external reference and valid SHA-256, and still matches the Activity's current Production video. The existing Activity, annual metadata and immutable audit survive physical cleanup. Existing direct replacement/activity deletion paths reject videos protected by this retention flow.
- The additive Production schema created `ky_annual_video_evidence` and `ky_annual_video_evidence_audit`. Read-only Production UAT retained 105 KY rows and all 98 video references, found 18 configured annual scopes with no evidence declarations yet, passed API/KPI parity and the Annual UI at 1440/1024/390 px with zero KY mutation requests and zero console errors. No evidence was declared or verified, the delete endpoint was never called and no real video was changed or removed.
- Scoped rollback evidence is under `backups/production/ky-annual-video-predeploy-20260921-155650/`: exact predeploy Runtime, all 105 KY row snapshots and all 98 referenced KY videos (923,334,576 bytes) with per-file SHA-256. FTPS download-back matched `4/4`; public HTTPS hashes matched `3/3`. A full sensitive database export was not retained because the safety control rejected the temporary web-accessible export helper; it was never uploaded.

## BBS issued Personal Batch Replace + Print Production release (2026-09-21)

- `main` commit `1457584` is deployed to the PHP Production target. Admin Batch Sheet / Duplex controls now live under “บัตร Personal ที่ออกแล้ว”, support cross-page selection of up to 100 Active Personal cards and remain separate from new-card issuance and Department cards.
- Reprinting an issued Personal card remains security-preserving: raw QR tokens are not stored, so a confirmed batch atomically replaces every selected card, revokes every old QR, issues fresh QR tokens through the canonical Designer snapshot path and links each old/new lifecycle. Node and PHP expose the same Admin-only `/cards/replace-batch` contract and fail the whole transaction if any selected card is stale, ineligible or out of Template scope.
- Production FTPS download-back matched `4/4`; public HTTPS hashes matched `3/3`. Normal-login browser smoke passed six groups, eight tabs, five Card workspaces and three responsive viewports with zero console errors. Focused Production verification found the controls only under issued Personal cards and one selectable Active card. An empty-batch `400` route probe preserved the Active-card count and every ID/status/QR fingerprint; no valid replacement was submitted because that would revoke a real QR.
- Scoped rollback evidence is under `backups/production/bbs-issued-batch-predeploy-20260921-125706/`. This release changed no schema, existing business row, private upload or rollout setting; no database backup/helper was required because deployment touched only four runtime files. The deployed cache chain is `20260921-bbs-issued-batch-r1`.

## BBS Native 600 DPI Export Engine Production release (2026-09-18)

- `main` commit `d68c519` is deployed to the PHP Production target. PNG/JPG/PDF now clone the canonical Designer card face into an off-screen native `1417 x 2008` pixel surface for a 60 x 85 mm card at 600 DPI, convert physical millimetre typography/borders/spacing to the native pixel grid before layout, and call the rasterizer at `scale: 1`. PNG/JPG and PDF share this renderer; the accepted physical browser Print contract remains unchanged.
- Browser layout regression with Thai text verified the same normalized geometry and baseline from the 226.77 x 321.25 CSS-pixel Print face to the native surface, the exact 6.25 typography ratio (16 px to 100 px), zero temporary export-host residue and unchanged two-page A4 duplex output. Full BBS regression passed `62/62`; the KY upload contract also remained green.
- Production FTPS download-back and HTTPS hashes passed `5/5`. Authenticated read-only browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors, zero business writes and zero temporary rows. The deployed cache chain is `20260918-bbs-native-raster-r1`.
- Scoped rollback evidence is under `backups/production/bbs-native-raster-predeploy-20260918-172530/` with exact before/after/HTTPS copies and hashes of all five deployed runtime files. This release changed no schema, BBS business row, private upload, rollout setting or Print contract; unrelated worktree changes in `backend/scripts/patrol-checkin-v2.test.js` and `output/` were preserved.

## KY Adaptive Video Upload Production deployment (2026-09-18)

- `main` commit `94c9357` is deployed to the PHP Production target. KY advertises a 200 MB aggregate limit with a Production-probed 256 KiB server-driven chunk size, per-chunk and final SHA-256 validation, retry/abort cleanup, explicit upload/storage error codes, and Node/PHP parity. Automatic video compression remains disabled.
- Local PHP and Node lifecycle tests passed real-size 2.5 MB and greater-than-5 MB payloads, retry, incomplete completion rejection, final hash, abort and zero residue. Production accepted a real MP4 256 KiB probe, including retry/hash/abort/post-abort 404, but a 2,826,128-byte full-file transport test was blocked on its second chunk with `KY_VIDEO_CHUNK_COPY_INCOMPLETE`. A follow-up probe passed, proving cleanup; the remaining blocker is Production hosting storage/quota with less than approximately 512 KiB available for cumulative new files. Do not represent Production video upload as fully operational until hosting storage is increased or safely freed and the full-file UAT passes.
- Production remained at 105 KY rows / 96 rows with video before and after UAT; no schema, KY business row, existing upload or compression setting changed. Runtime rollback and verification evidence is under `backups/production/ky-adaptive-video-predeploy-20260918-155044/`. A broad sensitive database export was not retained because the safety control rejected the executable export helper; that helper was never uploaded.

## BBS PNG/JPG/PDF physical export parity Production release (2026-09-18)

- `main` commit `5e710f1` is deployed to the PHP Production target. Canonical Designer element typography, letter spacing and borders now use the same physical millimetre grid as the card for browser Print and rasterized PNG/JPG/PDF output, avoiding CSS point interpretation differences while preserving the accepted Print geometry.
- Canvas zoom remains view-only. Saved output remains server-snapshot authoritative: a new Draft such as V3 must be saved, activated and used by a newly issued or explicitly replaced Personal card before its layout can appear in that card's PNG/JPG/PDF; existing issued cards retain their frozen Active-layout snapshot and QR history.
- Full BBS regression passed `62/62`, the focused print/export contract passed `36/36`, and Batch Duplex Browser E2E passed. Production FTPS download-back and HTTPS hashes passed `5/5`; authenticated read-only browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors, zero business writes and zero temporary rows.
- Scoped rollback evidence is under `backups/production/bbs-export-parity-predeploy-20260918-132916/` with exact before/after copies of all five deployed runtime files. This release changed no schema, BBS business row, private upload or rollout setting; unrelated worktree changes in `backend/scripts/patrol-checkin-v2.test.js` and `output/` were preserved.

## BBS anchored Personal layer scaling Production follow-up (2026-09-18)

- `main` commits `6f4d8f9` and cache-chain follow-up `e9d44cb` are deployed to the PHP Production target. Personal Draft `Scale to 70%` now scales each selected layer around its own visual anchor instead of collapsing the four layers toward one shared center: employee name stays left anchored, position right anchored, Department center anchored and Personal QR bottom-right anchored.
- The transform remains Draft-only, scales geometry, typography and border dimensions, remains undoable before save, and changes neither canvas zoom nor Active/Archived layouts automatically. This release changed no schema, BBS business row, card/QR record, private upload or rollout setting.
- Full BBS regression passed `62/62`. Production FTPS download-back and HTTPS hashes passed `4/4`; the `anchor-r2` cache chain and removal of the shared-center formula were verified over HTTPS. Authenticated read-only browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors, zero business writes and zero temporary rows.
- Scoped rollback evidence is under `backups/production/bbs-designer-anchor-predeploy-20260918-130029/` with exact before/after copies of all four deployed runtime files. Existing unrelated worktree changes in `backend/scripts/patrol-checkin-v2.test.js` and `output/` were preserved.

## BBS real employee Designer preview and persisted layer scale Production release (2026-09-18)

- `main` commits `5dd5fbb` and cache-entry follow-up `3ab2fdd` are deployed to the PHP Production target. Personal Card Designer can preview permission-scoped real employee values, explicitly labels canvas zoom as view-only, and provides a Draft-only multi-layer transform for Personal QR, employee name, Department and position. The 70% transform persists geometry, typography and border dimensions around the shared group center.
- Active/Archived layouts remain immutable. Admin must create an explicit editable Draft copy before changing an Active layout; Personal and Department workflows remain separate. This release changed no schema, BBS business row, card/QR record, private upload or rollout setting.
- Full BBS regression passed `62/62`. Production FTPS download-back and public HTTPS hashes passed `4/4`, including the updated HTML entry-point cache key; authenticated read-only browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors, zero business writes and zero temporary rows.
- Scoped rollback evidence is under `backups/production/bbs-designer-preview-scale-predeploy-20260918-083325/` with exact before/after copies of the four deployed runtime files. Existing unrelated worktree changes in `backend/scripts/patrol-checkin-v2.test.js` and `output/` were preserved.

## BBS high-fidelity batch output Production release (2026-09-17)

- `main` commit `2963031` is deployed to the PHP Production target. Direct PNG/JPG/PDF renders the canonical Designer card face at the exact 600 DPI physical grid; browser Print remains physical HTML backed by the original Designer resources.
- Admin Personal issuance supports cross-page selection up to 100 employees, server-compatible Template preflight, A4/A5/A6 Batch Sheet layout, Compact/Safe spacing, crop marks and Back-only X/Y calibration. A 60 x 85 mm card with 1 mm bleed fits 3 x 3 (nine cards per A4 side); Front/Back pair IDs, incomplete-sheet placeholders and Designer LongEdge/ShortEdge mirroring preserve exact duplex order. Personal and Department workflows remain separate.
- Automated Browser E2E produced exactly two A4 pages for nine cards, measured exact CSS physical dimensions and passed with zero console errors. Physical Canon A4 Duplex/Long-edge output was accepted by the operator with X/Y calibration at zero. Full BBS regression passed 61/61.
- This release changed no schema, BBS business row, private upload, QR/card record or rollout setting. Production remains Controlled Pilot with `staged_admin_only=0`, `pilot_scope_only=1` and both Designer flags `1`. Authenticated Production browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors or writes.
- Fresh rollback evidence is under `backups/production/bbs-batch-output-predeploy-20260917-172947/`: verified 195-table SQL gzip (SHA-256 `9E62AB4084AF2D525B6F1B695A09CD98C45097812F286FA0DEDEF38685F39663`), all 18 current BBS private uploads (40,056,549 bytes), six runtime-before files and checksum-matched FTPS/HTTPS deployment `5/5`. The protected helper was removed, FTPS residue is zero and `.htaccess` was restored to SHA-256 `4088E920886567C344AE7A7A88AEB010DD7F2E42F7AFD2AF9D94F8DE4A1265DB`.

## BBS Controlled Pilot mobile, QR and 600 DPI output Production release (2026-09-17)

- `main` commit `3c424ba` is deployed to the PHP Production target. The inner BBS header now remains in normal document flow instead of covering phone content, mobile sticky actions clear the application bottom navigation, and ordinary users render the permission-scoped Department Designer snapshot without calling Admin card-designer APIs.
- Department QR intent opens and focuses the Community Good/Risky report form. A Personal QR for another employee enters the authorized single-observation flow directly without an overlapping verification dialog; the existing authenticated claim, scope checks and server-selected employee remain authoritative.
- Direct PNG/JPG output now renders the canonical Designer card face to its exact 600 DPI pixel grid (60 x 85 mm = 1417 x 2008 px) with embedded density metadata. Direct PDF enforces at least 450 DPI, physical dimensions are unchanged, and toolbar/status/safe/bleed controls remain excluded from print/export.
- This release changed no schema, BBS business row, private upload, QR/card record or rollout setting. Production remains Controlled Pilot with `staged_admin_only=0`, `pilot_scope_only=1` and both Designer flags `1`. Authenticated Admin browser smoke passed six groups, eight tabs, five card workspaces and three responsive viewports with zero console errors or writes; Department 18 returned one Active template and one permission-scoped Designer layout.
- Fresh rollback evidence is under `backups/production/bbs-pilot-ux-predeploy-20260917-120418/`: verified 195-table SQL gzip (SHA-256 `76A47BBA7C161F71E24CCBEE17D2BBC006C342100770E33714EF13678C086C50`), all 16 BBS private uploads, six runtime-before files, and checksum-matched FTPS/HTTPS deployment `5/5`. The protected helper was removed, FTPS residue is zero and `.htaccess` was restored to SHA-256 `4088E920886567C344AE7A7A88AEB010DD7F2E42F7AFD2AF9D94F8DE4A1265DB`.

## BBS exact output and QR login continuation Production release (2026-09-17)

- `main` commit `3cd2a32` is deployed to the PHP Production target. Composite Preview, print, PDF, PNG and JPG now use the same canonical Designer card-face contract; 60 x 85 mm raster output is exactly 709 x 1004 pixels at 300 DPI with embedded PNG/JPEG density metadata, PDF uses lossless page capture, and print-only CSS excludes the toolbar/status/safe/bleed controls.
- A scanned Personal or Department QR is now retained across authentication. Resolve/claim distinguishes temporary authentication or rollout denial from terminal inactive/scope errors, returns only the safe BBS route, and Node/PHP expose the same explicit `BBS_ADMIN_ONLY` code.
- Local reversible E2E passed Personal Issue/Resolve/Claim/Print/Replace/Reprint/Revoke plus Department QR/Resolve/Claim/Designer Output/Print/History, with Node/PHP parity and exact database/file/settings rollback. Production FTPS download-back passed `8/8`; public HTTPS hashes passed `7/7`; anonymous protected surfaces remained `401` with zero writes.
- This release changed no schema, BBS business row, private upload or rollout setting. Production remains behind its existing Admin-only gate because the read-only Pilot audit returned `CONFIGURATION_REQUIRED` (inactive Pilot scope, one unmapped employee, and missing active schedule/checklist/templates/Department QR/community handler plus acceptance evidence). Do not switch to Controlled Pilot or Company-wide until those blockers are closed and the gate is rerun.
- Runtime rollback files are under `backups/production/bbs-output-qr-predeploy-20260917-092827/`. A full Production database export was intentionally not taken because the safety reviewer rejected exporting the sensitive payload without a separate explicit approval; the helper and temporary `.htaccess` were never uploaded, Production `.htaccess` remained SHA-256 `4088E920886567C344AE7A7A88AEB010DD7F2E42F7AFD2AF9D94F8DE4A1265DB`, and the helper URL returned the normal router `501`. Stored Production Admin UAT credentials returned `401`, so authenticated browser smoke remains pending a valid test credential.

## BBS Personal Template scope Production release (2026-09-16)

- `main` commit `4404c1a` is deployed to the PHP Production target. Personal Card Template creation/activation now permits only Group Leader level or higher (or all eligible Personal levels), employee projections include canonical Safety Unit identity, and issuance compatibility checks Department, Unit and BBS level consistently in Node, PHP and the Admin UI.
- Existing invalid Personal Templates are not silently rewritten. Admin receives an explicit guarded repair action that preserves status, Designer Layout and Artwork, requires optimistic `RowVersion`, blocks any Template with card history and rejects an Active-scope conflict. Production Template 3 remains Active/Operator and unchanged until Admin explicitly repairs it to Group Leader.
- This release changed no schema, BBS business row, card/QR record, rollout setting or private upload. Production smoke confirmed the deployed repair UI and compatibility filter, exact Template 3 versus employee 002671 mismatch, canonical Department 18 / Safety Unit 2, responsive BBS at three viewports, zero console errors and zero business writes.
- Exact runtime rollback evidence is under `backups/production/bbs-personal-template-scope-predeploy-20260916-110810/`: six before files and five checksum-verified deployed files (`FTPES 5/5`, `HTTPS 3/3`). A fresh full database/private-upload export was intentionally blocked by the safety control because this approval did not explicitly cover those sensitive payloads; no helper was uploaded and Production `.htaccess`, database and private uploads were untouched.

## Accident explicit Recordable classification Production release (2026-09-15)

- `main` commit `e2a215f` is deployed to the PHP Production target. Accident Recordable totals, counted Lost Days, Lost Time frequency/severity rates, last-counted-case date, Dashboard, Analytics, report filters and exports now use the explicit `IsRecordable=1` flag and exclude Near Miss / First Aid; type, severity and lost days no longer infer Recordable status.
- Historical Accident row 14 remains an unchanged Lost Time report with three factual lost days and `IsRecordable=0`; Production read-only API and browser smokes confirm it is visibly Non-recordable and contributes zero to Recordable, LTIFR and ISR. No Accident business mutation was sent during verification.
- This release changed no schema, Accident business row or upload path. Near Miss / First Aid now fail closed if submitted as Recordable, while Fatal remains required to be Recordable. Node, PHP and central Dashboard projections are aligned.
- Rollback evidence is under `backups/production/accident-recordable-predeploy-20260915-151114/`: verified 195-table SQL gzip and six exact runtime-before files. The unchanged Production `uploads/` inventory contained 895 entries; a broad download was intentionally blocked because this release does not modify uploads and the host could not provide a fully protected data channel. FTPES control-channel hashes passed `5/5`, HTTPS hashes passed `3/3`, `.htaccess` was restored to SHA-256 `4088E920886567C344AE7A7A88AEB010DD7F2E42F7AFD2AF9D94F8DE4A1265DB`, and helper residue is zero.

## Accident Recordable classification constraints (2026-09-15)

- `IsRecordable=1` is the explicit and sole gate for official Accident Recordable totals, KPI/rates, counted lost days, counted Lost Time cases and last-counted-case date. Accident type, severity and `LostDays` must never infer Recordable status.
- Near Miss and First Aid cannot be Recordable. Fatal must be Recordable. Enforce the same validation and projection in Node, PHP, dashboard, UI, exports and read-only audits.
- Preserve factual report fields such as Accident Type, Severity, Lost Days and treatment even when a case is Non-recordable. Do not rewrite historical report rows merely to correct aggregate projections.
- `Accident_Performance.LastAccidentDate` is a derived cache, not classification authority. Read and save paths resolve the latest explicit Recordable report for the selected year and must not revive a stale stored date.

## BBS Composite Preview and exact card output Production release (2026-09-15)

- `main` commit `60cc095` is deployed to the PHP Production target. Composite Card Preview now prefers the Active same-kind Designer layout and its server-resolved Scoped Front / Global Back artwork, geometry, layers and typography instead of reconstructing a separate legacy approximation.
- Issued Personal and printable Department card windows now provide Print, PDF, PNG and JPG from the same server-issued Designer Print Snapshot. Personal raw QR remains available only after the existing issue/replace mutation; Department output continues to use its current Active Department QR. Image export emits separate physical front/back print sheets and hides safe/bleed guides while retaining the cut line.
- This release changed no schema, BBS business record, private-upload path or rollout setting. Production remains `staged_admin_only=1`, `pilot_scope_only=0`, `visual_card_designer_enabled=1`, `visual_card_designer_rendering_enabled=1`.
- Fresh rollback evidence is under `backups/production/bbs-card-output-predeploy-20260915-103829/`: verified 195-table SQL gzip, five runtime-before files and all 14 BBS private uploads. FTPS and HTTPS hashes passed `4/4`; authenticated read-only API, responsive BBS and focused Active Designer Composite Preview smokes passed with zero mutation requests or console errors. The protected backup helper was removed and the original `.htaccess` checksum was restored.

## BBS artwork-first Template workflow Production release (2026-09-14)

- `main` commit `1f7ac9a` is deployed to the PHP Production target. Active kind-specific Scoped Front artwork can now open a preselected Personal or Department Template form, fileless Template creation materializes the resolved Scoped Front as the isolated legacy fallback, and Template Lifecycle shows explicit Scoped Front / Global Back readiness before Designer work.
- Personal and Department remain separate domains; only Global Back is shared. This release changed no schema, BBS business record, rollout setting or existing private file. Production remains `staged_admin_only=1`, `pilot_scope_only=0`, `visual_card_designer_enabled=1`, `visual_card_designer_rendering_enabled=1`.
- Fresh rollback evidence is under `backups/production/bbs-artwork-template-predeploy-20260914-154716/`: verified 195-table SQL gzip, exact runtime-before files and 14 BBS private uploads. FTPS hashes passed `8/8`, HTTPS hashes passed `5/5`, authenticated read-only API smoke and responsive browser smoke passed with zero mutation requests or console errors. The protected backup helper was removed and the original `.htaccess` checksum was restored.

## BBS Scoped Artwork and 4M Audit Log Production release (2026-09-14)

- `main` commit `f385461` is deployed to the PHP Production target. BBS now resolves kind-specific Unit/Department Scoped Front artwork plus one versioned Global Back; 4M Training Matrix exposes immutable, paged and filterable Audit Log details with canonical before/after snapshots for new events.
- The additive Production migration created `BBS_Card_Artwork_Slots` and `BBS_Card_Artwork_Versions` plus six scoped-artwork columns. It preserved the two legacy Master Artwork rows, one Designer layout version, all private files and rollout settings (`staged_admin_only=1`, `pilot_scope_only=0`, Designer flags `1/1`). No existing artwork slot/version was fabricated automatically.
- Fresh rollback evidence is under `backups/production/bbs-fourm-release-predeploy-20260914-101911/`: verified 193-table SQL gzip, exact runtime-before files and eight BBS private uploads. FTPS hashes passed 12/12, HTTPS hashes passed 5/5, and authenticated read-only BBS/4M smoke passed with zero mutation requests. The checksum-locked helper and SQL were removed and the original `.htaccess` was restored.

## 4M Training Matrix audit snapshot constraints (2026-09-14)

- New Training Matrix audit rows preserve the existing raw fields and add the same versioned canonical before/after snapshot keys in Node and PHP: affected employee, employee Department/Unit/position, curriculum, curriculum Department/year, course, assignment, status, notes and reactivation state.
- Transfer is one canonical transfer event per affected employee. Its before snapshot resolves the source and its after snapshot resolves the destination; PHP transfer must not emit an additional implicit create/reassign log for the destination.
- Actor identity remains server-derived in `PerformedByID` and `PerformedBy`. Do not rewrite legacy audit rows or invent missing historical snapshot values.
- Training-log pagination is opt-in with `paged=1`; requests without it retain the legacy array response. Paged responses contain server-computed `rows` and `pagination`, default to 20 rows and cap page size at 100.
- Training-log Department/Unit/year/search filters resolve canonical before/after snapshots before current Master joins so historical context survives later Master changes. Non-Admin Department scope always comes from the authenticated server context, never the query string; invalid or reversed date filters fail closed.
- The Audit Log UI consumes only paged results (20 rows per page), preserves combined filters across navigation and exposes accessible expandable before/after details. Legacy rows show only fields actually present and must not fabricate missing historical context.
- Training Matrix Audit Log rows are immutable. The UI exposes no delete control, permission metadata always returns `canDeleteHistory=false`, and both Node/PHP DELETE routes fail closed with `405 AUDIT_LOG_IMMUTABLE` without reading or mutating the target row.

## BBS Scoped Front / Global Back constraints (2026-09-11, local development)

- Personal and Department layouts/templates remain separate. Only the versioned `GlobalBack` artwork is shared; `ScopedFront` is kind-specific and resolves exact Unit before Department default. Never fall back across card kinds or to another Department.
- Artwork resolution is server-authoritative. Personal issue/print uses the employee's current Master Department/Unit; Department output uses its template Department and optional Unit. A Unit-scoped Department template still uses the shared Department QR and does not create a Unit card.
- Layout geometry stores logical artwork bindings. Designer preview context is not issuance authority. Issue/print resolves again and freezes resolved artwork version IDs in the existing print snapshot JSON.
- Migration and legacy adoption are additive. Do not rewrite/delete existing Master Artwork, layout assets, cards, QR rows, print snapshots or files. Promoting a legacy image requires an explicit Admin action and retains its source.

## BBS legacy Designer Draft repair Production release (2026-09-11)

- `main` commit `a0966a3` is deployed to the PHP Production target. Personal template 2 / Tube cutting / Designer V1 remains an intentionally unrepaired legacy Draft until an Admin explicitly uses “ซ่อม Master Artwork ของ Draft”; normal Save remains blocked beforehand.
- The deployment changed no schema, BBS business record, private-upload path or rollout flag. Production verification passed FTPS 5/5, HTTPS 4/4, authenticated read-only inventory, focused Designer smoke and full responsive BBS smoke with zero mutation requests or console errors.
- Fresh rollback evidence is under `backups/production/bbs-master-rebase-predeploy-20260911-160219/`: verified 193-table SQL gzip, exact runtime-before files and eight BBS private uploads. The temporary protected helper was removed and the original `.htaccess` restored.

## BBS legacy Designer Draft Master Artwork repair constraints (2026-09-11)

- A pre-Master-Artwork Designer Draft may be repaired only by an Admin-explicit rebase. Rebase is Draft-only, requires optimistic `RowVersion`, uses the current Active same-kind Front and Back Master Artwork, and snapshots both files inside the transaction.
- Rebase may accept the Admin's current unsaved normalized layout so size, orientation, side settings, elements and authorized static-asset references survive the repair. Background asset references from the client are ignored and replaced server-side; foreign static assets fail closed.
- Never auto-repair on read, mutate Active/Archived layouts, delete superseded Designer assets/files, or merge Personal and Department provenance. Node and PHP must remain behaviorally aligned.

## KY History filter Production release (2026-09-11)

- `main` commit `507b615` is deployed to the PHP Production target. KY History supports combined year/date, Department/program Department, Status, Risk Category, submit-source, Evidence and free-text filters; reversed date ranges fail closed and stale browser responses cannot replace newer results.
- This release changed no schema, KY record, private upload or rollout setting. Production database export was intentionally not retained after the environment safety control rejected a full sensitive-data download; exact rollback copies of the four changed runtime files are under `backups/production/ky-history-filter-predeploy-20260911-132847/runtime-before/`.
- FTPS and HTTPS checksums passed, authenticated read-only API smoke covered every filter against 100 records with zero writes, and Chrome passed search/reset/date validation/mobile coverage with zero console errors or mutation requests. The temporary Admin-protected helper was removed and the original `.htaccess` checksum was restored.

## BBS performance Production release (2026-09-09)

- `main` commits `a266f21` and PHP 7.4 compatibility follow-up `c5ef4f4` are deployed to the PHP Production target. The release adds lazy tab/workspace reads, scoped mutation refresh, standardized Busy state, active-side Designer image loading with editing previews, and the evidence-backed Admin eligible-employee projection optimization.
- No schema, rollout flag, private-upload path or business record changed. Production remains `staged_admin_only=1`, `pilot_scope_only=0`, `visual_card_designer_enabled=1`, `visual_card_designer_rendering_enabled=1`; Pilot/ordinary-user rollout remains blocked pending acceptance.
- Fresh backup and verification evidence is under `backups/production/bbs-performance-predeploy-20260909-170834/`. Preserve its 193-table SQL archive, six exact runtime rollback files and eight checksum-verified BBS private uploads. Both temporary Admin-protected helpers were removed and the original `.htaccess` was restored.

## BBS card workflow Production release (2026-09-08)

- `main` commit `4ae2fe1` is deployed to the PHP Production target with navigation/loading persistence, Personal Front QR plus Department Back QR, four isolated Master Artwork slots, separate Personal/Department templates, same-kind Layout Presets, Draft-only Apply and recoverable Trash.
- Production additive schema contains `BBS_Card_Master_Artwork`, `BBS_Card_Layout_Presets` and soft-trash columns on both parent-template tables plus layout versions. Preserve all rows/files on rollback; restore runtime first and use the database backup only for an authorized data incident.
- Production remains `staged_admin_only=1`, `pilot_scope_only=0`, `visual_card_designer_enabled=1`, `visual_card_designer_rendering_enabled=1`. Backup and verification evidence is under `backups/production/bbs-card-workflow-predeploy-20260908-153658/`; helper/SQL residue is zero.

## BBS Layout Preset and recoverable Trash constraints (2026-09-08)

- Layout Presets are strictly scoped to Personal or Department. They contain reusable geometry, side settings and non-file elements only; they never carry Master Artwork files, stored filenames, Draft assets, raw QR values or cross-domain data.
- Apply is Admin-only, same-kind and Draft-only, uses optimistic `RowVersion`, and transactionally preserves the destination Draft's exact Front/Back Master Artwork snapshots while replacing reusable layout content.
- Template, Designer Draft and Preset removal is soft Trash. Never delete private files, cards, QR rows, print logs, snapshots or audit history. Active templates must be Archived first; only Draft layout versions may enter Trash. Restore increments `RowVersion` and never activates an item implicitly.
- Normal catalogs and issuance/printing surfaces exclude trashed records. Node and PHP must remain behaviorally aligned.

## BBS Admin-only Production backup (2026-09-05)

- User explicitly authorized push/deploy and the temporary protected backup helper. Fresh backup ID: `bbs-admin-deploy-20260905T083722Z` under `backups/production/`. SQL: 191 tables, 15,385,425 bytes, SHA-256 `91a9cc729a54242d76c50a44d477b1bf81b4f567f0b0698139bd2a96338f3672`; SQL archive and all 1,037 application/upload files verified against remote SHA-256. Helper removed; FTPS absence and HTTP 404 verified.
- This release requires no Production schema/data migration or upload-path change. Preserve staged Admin-only=1, pilot=0 and both Designer flags=0. Deployment outcome is recorded in `docs/bbs-integration-review-20260905.md`.

## BBS integration local migration evidence (2026-09-05)

Local-only CCCF delegation and BBS designer foundation migrations were applied after backup `backups/bbs-integration-local-2026-09-05T08-17-05-534Z` (SQL SHA-256 `b2b4f087467a3364a714cb7a6db2d784c707bf0162ffc0986601bf4f25b2fd78`). Six additive tables and two actor columns; existing row counts preserved. No Production DB update or `backend/uploads/` path change. Print receipts add no schema. Keep staged=1 and both Designer flags=0 pending acceptance. See `docs/bbs-integration-review-20260905.md`.

## Local MySQL recovery evidence (2026-09-05)

- Local XAMPP data was rebuilt from a verified cold-copy export after an InnoDB checkpoint failure. Preserve `backups/local-mysql-recovery-20260905/` and `C:/xampp/mysql/data-before-recovery-20260905`; do not delete redo files or replace business tables as a generic startup fix.
- Normal runtime must keep `innodb_force_recovery=0`. The recovery changed no application schema or `backend/uploads/` path. Only the damaged MySQL system table `mysql.transaction_registry` was reinitialized. Exact verification, technical-log retention differences and recovery limits are in `docs/project-review-and-mysql-recovery-20260905.md`.

## Safety Patrol Check-in v2 Constraints

- Scheduled check-in must link one authorized Admin-created Patrol session. Makeup may complete an earlier missed session across month/year; Extra remains unlinked, counts only in Actual Walk Activity for the actual walk month, and never closes Scheduled Compliance.
- Team/Member Rotation and Patrol Sessions in System Control are the calendar authority. Preserve multiple same-day rounds, one base team per employee and historical Attendance without automatic repair.
- Retry safety uses nullable `Patrol_Attendance.IdempotencyKey`, unique `(UserID,IdempotencyKey)` and unique `(UserID,ScheduledSessionID)`. A new idempotency key intentionally permits another Extra walk.
- `patrol_checkin_v2_enabled` is the operational rollback flag. Disable it before runtime rollback; do not drop the additive column/indexes or delete Attendance history.

## CCCF Form A Permanent Submit-on-behalf Constraints

- `AssigneeID` is the accountable owner for CCCF KPI, tracking, review recipient and history. `SubmittedByEmployeeID` and `SubmittedByName` identify the authenticated actor and must never replace the owner or create a second KPI count.
- An ordinary user may submit for themselves, or for an owner with both an active `CCCF_Assignments` row and an active `CCCF_Submit_Delegations` grant for that exact delegate. Admin retains the established Employee Master selection authority. The server resolves owner and actor data; the client only presents permission-scoped choices.
- Direct-signed PDF for a non-Admin actor is allowed only when the selected owner has an active `CCCF_Assignments` row with `AllowDirectSignedPdf=1` and the actor is either that owner or holds an active exact `CCCF_Submit_Delegations` grant for that owner. A delegated Direct PDF must retain `AssigneeID` as owner and actor columns as the authenticated delegate; disabling either the owner flag or grant revokes access immediately.
- `CCCF_Submit_Delegations` and the actor columns are additive. Preserve legacy rows, use creator/name fallback for old records, retain history/audit rows when a grant is disabled, and reuse the existing `SubmittedByAdmin` email template/outbox event.
- Admin bulk delegation may select multiple assigned owners, one owner Department, or one Unit within a selected Department. Department/Unit modes resolve exact current Employee Master membership intersected with existing `CCCF_Assignments` and materialize exact owner/delegate rows transactionally; they never grant an unassigned or future owner implicitly. Re-run the selected scope after future Assignment changes. The delegate may be any current Employee Master employee and does not need an Assignment. Node and PHP must remain behaviorally aligned.

## BBS Smart Card Phase 10F-2 Constraints

- The Visual Designer is Admin-only. It may create and edit only `Draft` layout versions; `Active` and `Archived` versions are immutable previews in both the client and server.
- Canvas QR elements are visibly non-functional placeholders. Phase 10F-2 must keep `visual_card_designer_rendering_enabled=0` and must not call or alter issue, replace, revoke, rotate, print-log or QR-resolution workflows.
- New JPG/PNG/WebP designer artwork is limited to 10 MB, content-signature validated and stored under denied private storage `backend/private-uploads/bbs-card-designer`. Reads are object-authorized and APIs must never expose stored filenames or filesystem paths.
- The server canonicalizes every parent/background/asset reference. A client cannot select another Draft's asset, a foreign parent file, an arbitrary path, dynamic value or QR token.
- Desktop/tablet may edit with drag/resize, layers, properties and keyboard equivalents. Phone mode is preview-only. Phase 10F-2 changes no existing template/card/QR record or established renderer, and it does not authorize Production deployment or GitHub push.

## BBS Smart Card Phase 10F-1 Constraints

- Phase 10F-1 installs only the additive BBS designer foundation: layout versions, sides, elements, assets and print snapshots. It must not alter or delete existing Personal/Department templates, cards, QR rows, print logs or private files.
- `visual_card_designer_enabled` and `visual_card_designer_rendering_enabled` default to `0`. Phase 10F-1 may expose the Admin catalog and Draft-version APIs, but it must not activate designer rendering, issue cards through a designer layout or change the established legacy renderer.
- Node and PHP must validate the same allowlisted fields, element types, styles and integer basis-point geometry. Draft writes are transactional, require optimistic `RowVersion`, and fail closed for non-Draft versions or foreign assets.
- The inventory command is SELECT-only. Legacy bootstrap is dry-run by default, requires explicit `--apply`, is idempotent and must prove that existing parent rows and private artwork remain unchanged.
- Phase 10F-1 adds no Unit card, public designer route, new QR destination, upload-path change, Production deployment or GitHub push.

## BBS Smart Card Phase 10F-0 Constraints

- Visual Card Designer supports only the established Personal Card and Department Card domains. It may provide front/back artwork and portrait/landscape layouts, but it must not introduce Unit cards or reuse Forklift tables/authorization as BBS storage.
- Layout data is server-authoritative and versioned. Only Draft layouts are editable; Active/Archived layouts are immutable, and clients may not select a layout version, employee, Department, QR value or dynamic field outside the authorized server context.
- Personal preview QR remains visibly non-functional; the raw Personal QR remains available only during the existing issue/replace response. Department output continues to use the single existing Active shared Department QR. Static uploads must never bypass either QR lifecycle.
- Legacy adoption must be additive and idempotent: do not update/delete existing Personal/Department templates, cards, QR rows, print logs or private files. Designer-disabled or missing-layout templates must continue through the existing renderer. Operational rollback disables designer flags and preserves all designer records.
- Phase 10F-0 is documentation/design only. It adds no migration, API, runtime behavior, business record, upload path, Production deployment or GitHub push.

## BBS Smart Card Phase 10E Constraints

- Pilot acceptance is a gate, not automatic rollout. Use `staged_admin_only=1` during Production setup. After a fresh backup and explicit Pilot-test approval, `staged_admin_only=0` plus `pilot_scope_only=1` may be used for controlled multi-role UAT; keep company-wide mode (`0`/`0`) blocked until acceptance, integrity reconciliation and explicit ordinary-user rollout approval.
- Controlled Pilot access permits Admin, effective Active inspectors in an effective `BBS_Pilot_Scopes` scope, and effective assigned members in that scope. It does not grant Admin privileges, does not infer access from Department text alone, and requires authentication for shared QR resolution while active.
- `backend/scripts/bbs-phase10e-pilot-acceptance-audit.js` is SELECT-only. A blocked result must identify missing platform/configuration/evidence inputs without creating Operators, assignments, Checklists, templates, QR cards, handlers or workflow records.
- `READY_FOR_ROLLOUT_REVIEW` means the release may be reviewed; it does not authorize a flag change, deployment or GitHub push. Production rollout still requires fresh database/private-upload/application backups, reviewed file hashes, staged Admin smoke, multi-role smoke after the approved gate change, rollback verification and zero test residue.

## BBS Smart Card Phase 10D-5 Constraints

- Inspector Agenda is a responsive projection of the existing server-computed schedule `days`; it must not calculate targets, actuals, exemptions or KPI status independently. Agenda and Calendar are alternate presentations of the same response.
- Community Risk detail is Admin-only in Node and PHP. It may expose report identity, private evidence metadata, assigned owner/verifier and Action History only after Admin authorization; stored filenames and private filesystem paths must never appear in JSON.
- Evidence remains readable only through the existing object-authorized `/bbs/community/reports/:id/evidence/:fileId` route. Phase 10D-5 changes no schema, Action transition rule, schedule mutation, Master/Pilot configuration, private upload path, stored workflow data or staged rollout gate.

## BBS Smart Card Phase 10D-4 Constraints

- Action Email Outbox visibility is Admin-only and projects the existing `BBS_Action_EmailOutbox` records. Status totals, filters and pagination must not modify or infer delivery state.
- Manual Retry is allowed only for an existing `Failed` row while BBS action notifications and SMTP are enabled. Lock the selected row before delivery, reject `Queued`/`Sent` retries, increment attempt metadata and audit both success and failure without creating a replacement outbox row.
- Existing suppression keys, notification events, recipients, SMTP configuration and action workflow remain authoritative. Phase 10D-4 changes no schema, business rule, authorization, private upload path, stored Action/Observation data or staged rollout gate.

## BBS Smart Card Phase 10D-3 Constraints

- History, Corrective Actions, Community Good/Risky reports, Personal Card recipients and issued Cards use opt-in server-side pagination. Requests without `paged=1` retain their legacy array response so existing consumers remain compatible.
- Every paged response uses server-computed `rows` plus `pagination` (`page`, `pageSize`, `total`, `totalPages`, `hasPrevious`, `hasNext`). Page size is bounded to 100 and out-of-range pages are clamped without fabricating records.
- Search and Department/Unit/year/status/priority filters are applied after the existing authorization scope. Risky Community rows/evidence remain Admin-only, Good reports remain reporter-anonymous, and Cards endpoints remain Admin-only.
- Phase 10D-3 changes no schema, stored data, card/QR lifecycle, Observation/Action business rule, authorization, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10D-2 Constraints

- KPI status is a server-derived semantic projection over the existing effective inspector enrollment, `KpiRequired`, schedule target and capped submitted-observation formula. `N_A`, `NOT_CONFIGURED`, `NOT_INSPECTED`, `ZERO_PERCENT` and `PERCENT` must remain distinct; clients and exports must not coerce a null percentage to zero.
- `N_A` means KPI is not applicable, `NOT_CONFIGURED` means no effective KPI enrollment/configuration, `NOT_INSPECTED` means a schedule exists but no target is due yet, and `ZERO_PERCENT` means a positive target is due with zero credited observations. Existing `Exempt` dates remain outside the denominator.
- Dashboard, inspector compliance, analytics and exports use the same semantic status and existing per-day capped schedule formula. Phase 10D-2 changes no schema, authorization, target formula, enrollment/schedule mutation, Observation immutability, batch behavior, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10D-1 Constraints

- Checklist readiness in employee selectors is a server projection from the existing resolver, Employee Master context and effective date. The client may display and filter the result but must not select, publish, override or substitute a Checklist version.
- `READY` is the only state that enables a new Single or Batch Observation selection. `NO_CHECKLIST`, `SCOPE_MISMATCH`, `VERSION_NOT_PUBLISHED`, `VERSION_NOT_EFFECTIVE`, `CHECKLIST_CONFLICT` and unknown results fail closed with an actionable reason. Existing Drafts remain resumable because their Checklist snapshot is already frozen.
- Draft creation and Batch preview/draft APIs remain authoritative and must resolve again inside their existing transaction/atomic workflow. Phase 10D-1 changes no schema, authorization, Observation immutability, batch per-employee model, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10B-4 Constraints

- Phase 10B-4 composes a read-only preview from existing private Personal/Department template reads and existing Master/card context. It must not change BBS routes, payloads, schema, authorization, card eligibility, QR lifecycle, private upload paths or stored workflow data.
- Personal preview QR is visibly non-functional. Actual one-time Personal QR remains available only after the existing issue/replace mutation; popup pre-open and template validation remain before that mutation. Department preview/print uses the current Active Department QR returned by the existing permission-scoped Department-card endpoint.
- Readiness distinguishes Ready, Warning and Blocked. Aspect ratio or low resolution warns without inventing business data; missing/unreadable background, invalid dimensions, unavailable QR generation, scope mismatch or missing Active Department QR blocks only the affected print/mutation action.

## BBS Smart Card Phase 10C-3 Constraints

- Phase 10C-3 is frontend-only runtime resilience. It must not change BBS routes, payloads, schema, authorization, Master/Pilot configuration, business rules, private upload paths or stored workflow data.
- Core, History, Community, Inspector, Action, Analytics and Card reads fail independently. A failed section must show an actionable retry state, preserve previously confirmed data when available and never replace an unknown result with a fabricated zero or silently navigate away.
- Critical mutation forms/buttons must reject repeat activation while their request is pending and expose an accessible busy state. Existing server idempotency, optimistic concurrency, immutable Observation/batch behavior and one-time card QR safeguards remain authoritative.

## KY Chunked Video Upload Constraints

- KY videos up to 200 MB must be uploaded through the authenticated `video-upload/init`, per-index `chunk`, and `complete` flow so shared-hosting PHP never receives the full video in one multipart request. Each chunk is 5 MB or smaller.
- Every chunk operation must re-check the existing KY owner/participant/Admin rule and bind the private upload manifest to the initiating employee and activity. Non-Admin users may not replace an existing video.
- Temporary chunks live only in HTTP-denied `backend/private-uploads/ky-video-chunks`, expire after 24 hours and never become `VideoUrl`. Completion must verify every chunk, exact total size and the supported video signature before atomically updating `KY_Activities.VideoUrl`; only then may an Admin replacement remove the prior upload.
- New submit and Admin edit requests must exclude the video from their main multipart body. If record save succeeds but chunk upload fails, preserve the KY record and tell the user to attach the video later rather than resubmitting a duplicate activity.

## Forklift Renewal Retry Constraints

- Creating a renewal request is retry-safe. An open `DRAFT` or `RETURNED` renewal for the same source license is reused and updated; its documents, request number and history are preserved. A `SUBMITTED`, `PENDING` or `UNDER_REVIEW` renewal remains a `409` conflict and must return the existing request identity for UI recovery.
- Renewal retry checks are serialized by locking the source license inside the transaction. Keep Node/PHP route behavior in parity and never resolve the conflict by deleting request/document/history rows.
- The frontend must query the permission-scoped request API by `sourceLicenseId`, resume editable requests, and open processing requests rather than displaying an opaque 409 or creating a duplicate.

## BBS Smart Card Phase 10C-2 Constraints

- Phase 10C-2 is frontend-only mobile and accessibility hardening. It must not change BBS schema, APIs, authorization, Master/Pilot configuration, private upload paths, stored observations/actions/cards, or the Phase 10A per-employee batch model.
- BBS primary tabs use one semantic tablist/tabpanel contract with keyboard navigation. Phone controls retain at least a 44 px touch target, text-entry controls avoid iOS focus zoom, and horizontal data regions remain keyboard-focusable and labelled.
- BBS dialogs must expose dialog semantics, trap focus, close with Escape/backdrop/close control, restore focus and participate in the shared mobile overlay/viewport state. Validation must move users to the existing invalid field without relaxing Safe/Unsafe/N/A or evidence requirements.

## BBS Smart Card Phase 10C-1 Constraints

- Leaving the Observation tab must save the current single or batch Draft before navigation. Draft recovery is server-backed, and only the original observer may resume a Draft; changing tabs must never silently discard it or create a second Draft for the same observed employee.
- Personal-card issue/replace must synchronously open the print window and validate the private template before the one-time raw QR mutation. A blocked popup must leave the card unchanged; post-issue rendering failure must show an explicit recovery state rather than imply the card was not issued.
- Excel, PDF and Print analytics must fetch `/api/bbs/analytics/export-data` with current filters before producing output. Phase 10C-1 changes no schema, business configuration, authorization, upload path or stored workflow data.

## BBS Smart Card Phase 10B-3 Constraints

- Department Configuration is a read-only client projection over the Master Department list plus existing Department template, QR and handler records. Searching, filtering or selecting a Department must not mutate records.
- The selected Department ID comes from Master data and is submitted through the unchanged template/QR/handler APIs. Owner and Verifier pickers list only Admin accounts returned by the existing Department-card Admin API; server-side Admin validation remains authoritative.
- Render only one Department detail/form set at a time. Preserve one shared Active QR per Department, multiple named templates and existing lifecycle/audit behavior. Phase 10B-3 adds no API, schema, storage path or role change.

## BBS Smart Card Phase 10B-2 Constraints

- Card Admin has three UI-only workspaces: Overview, Personal Card and Department Card. Keep the established Personal/Department endpoints, payloads, permissions and lifecycle actions unchanged.
- Overview readiness may guide Admin to the next workspace but must never create, activate, issue, rotate, replace, revoke or archive records automatically. Detailed Personal and Department forms must not be rendered together in the same workspace.
- Entering Card Admin from the Community tab may open Department Card context; all other normal entries begin at Overview. Phase 10B-2 adds no schema, storage path or rollback flag.

## BBS Smart Card Phase 10B-1 Constraints

- BBS Admin reference controls must use `/api/bbs/admin/foundation` and the central Master Department, Safety Unit, Position and Employee sources. Do not derive Personal Card Department options from the currently eligible card-recipient rows.
- Personal Card issuance remains limited to effective Group Leader-or-higher mappings. Readiness messages explain missing Master/mapping/template/QR/handler configuration but must not weaken server authorization or create fallback business data.
- Phase 10B-1 is frontend/readiness integration only: no schema, upload-path or workflow behavior change. Foundation failure must degrade to an explanatory state without blocking existing card/template API reads.

## BBS Smart Card Staged Production Constraint

- `BBS_Settings.staged_admin_only=1` is the production Pilot configuration gate. While enabled, every `/api/bbs/*` surface, including public QR resolution, is Admin-only in both PHP and Node; the normal user rollout must not be opened until the Pilot roster, Active inspector/team assignments and an applicable Published Checklist are confirmed.
- Disabling staged mode is a separate business rollout action. It must not alter observations, actions, cards, schedules or audit history.

## BBS Smart Card Phase 10A Constraints

- A batch is only a mobile orchestration layer. Every selected employee must still receive a separate immutable `BBS_Observations` record and separate answers; batch totals must never replace individual KPI, team coverage, history, analytics or action sources.
- Batch selection is 2-50 unique employees from the server-authorized effective team scope. The server resolves and freezes each employee's checklist; the frontend may group matching versions but may not choose or override a version.
- Draft save and final submit are atomic across every batch member. Final validation, status transition and per-answer Corrective Action creation occur in one transaction; any invalid member rolls back the complete batch.
- Batch detail is visible only to the originating observer or Admin. An observed employee may read their individual Observation under existing rules but must never receive the batch container or peer identities.
- `batch_observation_enabled`, `mobile_observation_wizard_enabled` and `draft_autosave_enabled` are safe rollback flags. Disabling them must not delete batches, observations, evidence, actions or history. Evidence remains in `backend/private-uploads/bbs` under existing authorization and validation rules.

## BBS Smart Card Phase 9B Constraints

- Inspector schedules are effective-dated versions. Never rewrite a historical rule or past-day override; a new rule may only start today or later, and replaced rules remain for audit.
- KPI, workspace, compliance dashboard, analytics and exports must use the same per-day capped schedule target. `Exempt` contributes no denominator; `Required` supplies the explicit target for that date.
- Admin may configure schedules and date overrides. A non-Admin inspector may read only their own schedule/compliance. `inspector_schedule_enabled` is the safe API rollback flag and must not delete schedules, observations or history.

## BBS Smart Card Phase 9 Constraints

- Formal Observation access and KPI eligibility require an effective Active `BBS_Inspector_Enrollments` row. A Group Leader mapping by itself is not sufficient.
- Admin may appoint Group Leaders and manage their teams. A Group Leader may mutate only their own team when `AllowSelfManage=1`; server scope always comes from the enrollment, never frontend Department/Unit values.
- One Operator may have only one effective primary `BBS_Hierarchy_Assignments` inspector at a time. Team changes preserve assignment and `BBS_Inspector_Team_Events` history.
- KPI includes only effective Active enrollments with `KpiRequired=1`, Monday-Friday rules and the existing daily target cap. Team coverage is a separate metric.
- `inspector_team_management_enabled` is the rollback flag. When disabled, team writes and detail APIs fail closed and existing Observation/Action/history data must not mutate.

## BBS Smart Card Phase 8 Constraints

- There are only personal cards and Department cards. Never add Unit cards implicitly. Personal issue/reissue requires `Group Leader` or higher. A Department may have many named Active templates, but exactly one Active shared Department QR.
- Community Report is authenticated and Department-scoped from Employee Master for ordinary users. Observed employee/Unit are optional; supplied values must belong to that Department. Community records never count formal BBS KPI or formal Observation analytics.
- Good reports may be shown to all authenticated users but must not expose reporter identity. Risky report/detail/evidence and Community Actions are Admin-only. Risky submission creates its Action immediately; active owner and verifier must both be current Admin accounts.
- Department templates and Community evidence are private uploads. Keep Node/PHP API parity, content-signature/10 MB checks, object authorization and path confinement. `community_reporting_enabled` and `department_cards_enabled` disable UI/workflows without deleting data.

## BBS Smart Card Phase 6 Constraints

- Analytics scopes are server-enforced: Personal=self, Team=effective hierarchy assignment, Department=own Department unless Admin, Company=Admin only. Never trust a frontend Department or Safety Unit filter.
- KPI actuals are capped per eligible workday by the active `BBS_KPI_Rules.TargetCount`; dashboard, drill-down and exports must share that formula and filter scope.
- Excel/PDF/Print must fetch `/api/bbs/analytics/export-data` with the current filters before generating output. `analytics_enabled` and `analytics_export_enabled` are the safe operational rollback flags; disabling them must not mutate Observation or Action workflows.

## BBS Smart Card Phase 2B Constraints

- Checklist Excel exchange uses sheets `Checklist`, `Items`, and `Scopes`;
  `README` and `Master Reference` are informational export sheets. Keep these
  names and English column headers stable for round-trip compatibility.
- Import Preview is read-only. Confirmed Import may replace only a Draft and
  must validate the complete payload plus Master IDs before one transaction
  replaces categories, items, scopes, and effective dates. Invalid input must
  leave the existing Draft unchanged.
- Import endpoints are Admin-only in both Node and PHP. Published/Archived
  versions return `409 IMMUTABLE_VERSION`; stale `RowVersion` returns
  `409 VERSION_CONFLICT`. Phase 2B adds no schema or upload-storage change.

## BBS Smart Card Phase 2 Constraints

- Phase 2 checklist tables come from
  `backend/migrations/20260825_bbs_phase2_checklist_builder.sql`. Use exact
  `BBS_*` casing in Node and PHP and keep the API behavior/status codes in
  parity.
- Only Draft versions are editable. Published/Archived content and scope are
  immutable; clone to a new Draft. Never hard-delete a version during normal
  operation. Template deactivate and Version archive preserve history.
- Resolver order is specificity, priority, then effective date. No match or an
  equal top match fails closed. Do not let the frontend choose a version to
  bypass the server resolver.
- Phase 2 uses only `safe_unsafe_na`; Unsafe remark/photo/action requirements
  are item configuration. Import/Export is Phase 2B, observations are Phase 3,
  and the main BBS menu remains hidden. No upload storage changed in Phase 2.

## BBS Smart Card Phase 1 Constraints

- The six `BBS_*` tables come from
  `backend/migrations/20260825_bbs_phase1_foundation.sql`. Node and PHP must use
  the exact migration table-name casing and preserve `/api/bbs/*` parity.
- BBS level maps from Master Position and is not a global role. Missing mapping
  or hierarchy denies by default. Resolve pilot Department/Safety Unit from
  Master IDs and do not hardcode the business names.
- Keep the main BBS navigation hidden until Phase 3. Phase 1 changes no upload
  storage path.

## How Codex Should Work In This Repo

- Read `CLAUDE.md` first, then this file, then the architecture/deployment/history document relevant to the task.
- Keep changes scoped to the user's request and the current module boundary.
- Prefer existing repo patterns over new abstractions.
- Treat Thai UI/API strings as production data; preserve UTF-8 exactly.
- Leave unrelated dirty worktree changes alone.
- Do not push to GitHub unless explicitly asked in the current task.

## Session Startup

For every new task:

Always read:

1. `AGENTS.md`
2. `CLAUDE.md`

Read additional documents only when relevant:

### Architecture / System Design

If the task affects:

- APIs
- Database
- Backend
- Frontend structure
- Authentication
- Uploads

Read:

- `ARCHITECTURE.md`

### Deployment / Production

If the task affects:

- Production deployment
- FTP upload
- Shared hosting
- Backups
- Smoke tests
- Rollback procedures

Read:

- `DEPLOYMENT.md`

### Historical Behavior

If the task may affect:

- Existing behavior
- Compatibility
- Previous deployments
- Completed phases

Read:

- `CHANGELOG.md`

### Planning / Future Work

If the task involves:

- New features
- Technical debt
- Refactoring
- Project planning

Read:

- `ROADMAP.md`

Do not assume project behavior without reading the relevant documentation first.

## Context Efficiency

Read only the documentation required for the current task.

Always read:

- `AGENTS.md`
- `CLAUDE.md`

Read additional documents only when necessary:

- `ARCHITECTURE.md` -> when the task affects APIs, database, backend, frontend structure, authentication, uploads, or system design.
- `DEPLOYMENT.md` -> when the task affects deployment, production, backups, smoke tests, FTP uploads, rollback procedures, or hosting configuration.
- `CHANGELOG.md` -> when the task affects existing behavior, backward compatibility, historical implementations, previous deployments, or legacy functionality.
- `ROADMAP.md` -> when the task involves planning, technical debt, future development, refactoring strategy, or project direction.

Guidelines:

- Do not load large documentation files unless they are relevant to the task.
- Minimize context usage whenever possible.
- Prefer targeted document loading instead of reading all project documents.
- Preserve context budget for code analysis and implementation work.
- If uncertain, explain which documents need to be read and why.

## Analysis Reuse

When a plan has already been approved, do not repeat project discovery, architecture discovery, changelog review, or requirement analysis. Reuse previous approved findings whenever possible and proceed directly to implementation.

If the current session already contains:

- approved requirements
- approved implementation plan
- approved risk assessment
- approved affected files list

then:

- avoid re-reading large documentation files unnecessarily
- avoid repeating the same analysis
- avoid generating duplicate gap analysis reports
- focus on implementation and verification

Only perform additional discovery if:

- requirements have changed
- new risks are discovered
- implementation reveals missing information
- the user explicitly requests a new analysis

The goal is to minimize context usage, reduce token consumption, reduce repeated project discovery, and preserve implementation capacity for large tasks. Prefer continuing from approved findings rather than restarting analysis.

### Session Continuity Integration

When generating a Handoff Report, include:

- approved findings
- approved implementation plan
- approved risks
- approved scope

so that future sessions can continue implementation without repeating discovery work.

## Session Continuity

If context usage exceeds 80% or quota appears close to exhaustion, stop implementation and generate continuity notes before the session ends.

Generate:

- Handoff Report
- Remaining Tasks
- Risks
- Testing Status
- Ready-to-use continuation prompt

Prefer generating a handoff before context becomes critically low. Do not wait until the session is completely exhausted. Preserve implementation details needed for continuity and minimize repeated project discovery work in future sessions.

### Handoff Report Requirements

The handoff report must include:

1. Project / Feature being worked on
2. Current objective
3. Completed work
4. Remaining work
5. Files modified
6. Files still requiring changes
7. Related APIs
8. Related database logic
9. Risks and known issues
10. Verification and testing status
11. Recommended next steps

### Continuation Prompt Requirements

Generate a copy-paste ready prompt for a new Codex session.

The continuation prompt must include:

- Current project context
- Current feature context
- Completed implementation
- Remaining implementation
- Relevant files
- Risks
- Testing status
- Exact next task

The goal is that a new Codex session can continue work immediately without re-discovering project context.

## Before Coding Checklist

- Confirm whether the task is documentation-only or application behavior work.
- Check `git status --short` and avoid touching unrelated files.
- Read the relevant module file(s), handler(s), and route(s) before editing.
- Check whether production uses PHP compatibility routes, Node dev routes, or both.
- Identify whether a schema/data change, upload/storage change, cache bust, or smoke test is required.

## Safety Rules

## Collaboration Guardrails

- Do not push to GitHub unless the user explicitly asks for it in the current task.
- Local testing is expected before handoff: run `npm --prefix backend test` after backend/API changes.
- When changing upload or DB behavior, update this file and mention whether `backend/uploads/` or MySQL schema changed.
- Encoding/mojibake is the #1 safety check for every change. Before and after edits, scan changed UI/API/docs strings for replacement characters and common UTF-8/Latin-1 decode artifacts. Prefer ASCII-safe HTML entities such as `&mdash;` for fallback symbols when editing files that already have mixed encoding history. Do not bulk-replace production data; isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or actual DB content first.
- If any task requires a MySQL schema/data change, include the SQL/migration in the local handoff, apply the matching production DB update during deploy, and smoke the updated data path. If production DB changes are needed, take a fresh production backup first and document the backup ID plus verification result here.

## Production Rules

- Production target is company shared hosting/PHP plus Company MySQL/MariaDB unless the user says otherwise.
- For production-impacting changes, take a fresh production backup first and document the backup ID/path.
- Upload only the files required for the phase.
- Verify uploads with SHA-256 downloads before smoke testing.
- Remove temporary smoke helpers and verify they are gone by HTTP/FTP checks.
- Clean up every temporary test row created during smoke tests and record remaining count `0`.

## Testing Rules

- For backend/API changes, run the relevant PHP lint and Node syntax checks.
- Run `git diff --check` on changed files before handoff.
- Run the relevant authenticated smoke test for any API behavior change.
- Run `npm --prefix backend test` when backend/API permission behavior changes or when the change touches shared routes. If it fails due to known permission-audit debt, report that explicitly.
- Documentation-only changes require `git diff --check` and a mojibake scan of changed Markdown files.

## Documentation Maintenance

- After completing any task, determine whether documentation is affected.
- If architecture changed, update `ARCHITECTURE.md`.
- If deployment procedure changed, update `DEPLOYMENT.md`.
- If project history changed, update `CHANGELOG.md`.
- If roadmap changed, update `ROADMAP.md`.
- If current handoff information changed, update `CLAUDE.md`.
- Report all documentation updates in the final summary.
- Documentation must stay synchronized with code changes.

## Thai Encoding / Mojibake Rules

- Keep files as UTF-8.
- Check changed files for replacement characters and common UTF-8/Latin-1 decode artifacts.
- Do not bulk-replace Thai production text or DB content.
- If mojibake appears, isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or DB content.
- Prefer ASCII-safe HTML entities such as `&mdash;` when editing files that already have mixed encoding history.

## Database Migration Rules

- Never make hidden schema/data changes.
- Include SQL/migration details in handoff notes when a DB change is required.
- Apply matching production DB updates during deploy only after backup.
- Smoke the updated data path after migration.
- Preserve PHP production and Node dev parity when both stacks expose the same route.

## Upload / Storage Rules

- Uploaded files live in local server storage and must be backed up with MySQL.
- Do not delete stored attachments during soft deletes unless the module has an explicit attachment delete endpoint.
- Validate file type/size through the established upload middleware/handler patterns.
- When changing upload URLs or storage paths, update deployment notes and smoke both upload and retrieval.

## Forbidden Actions

- Do not modify application code for documentation-only tasks.
- Do not push to GitHub unless explicitly requested in the current chat.
- Do not run destructive Git commands such as reset/checkout against user changes.
- Do not delete historical handoff, deployment, smoke, backup, or phase notes.
- Do not hardcode department lists where `/master/departments` is the source of truth.
- Do not bypass auth/session helpers or use stale `localStorage` user data.
- Do not interpolate raw user input into SQL.
- Do not change password minimums, role normalization, soft-delete behavior, or Patrol schema assumptions without an explicit task.

## Common Pitfalls

0a. **BBS Phase 3 private evidence** — Observation images live under `backend/private-uploads/bbs`, never under public `/uploads`. Keep the deny-all `.htaccess`, validate JPEG/PNG/WebP content and the 10 MB limit in Node/PHP, retrieve only through the object-authorized evidence API, and back up this directory with MySQL.
0b. **BBS Observation immutability/retries** — Draft creation is unique by `(ObserverEmployeeID, IdempotencyKey)` and returns the same record on retry. Submitted Observations and Checklist/item snapshots are immutable; submit retry returns the existing record. Unsafe remark/photo/immediate-action rules require frontend and server validation.

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
80. **4M Notice responsible identity** — `fourm_changenotices.ResponsibleEmployeeID` is the stable Employee Master key; `ResponsiblePerson` is only the display-name snapshot and legacy fallback. Notice Department and responsible employee Department are intentionally independent. Admin assignment must resolve EmployeeID/CompanyEmail server-side; ordinary users remain self-assigned. Notice emails de-duplicate responsible, creator, and Admin recipients, while missing responsible CompanyEmail must not block the Notice write.
80. **Yokoten bulk response — transaction + deferred SMTP** — `POST /api/yokoten/respond` ต้อง lock selected `(YokotenID, Department)` rows ด้วย `FOR UPDATE` และ commit response/file rows แบบ atomic; active response คืน 409, soft-deleted unique slot ต้อง restore ด้วย `ResponseID` ใหม่และ `IsDeleted=0` โดยไม่ลบไฟล์ประวัติ; เมื่อส่งมากกว่า 1 Department ให้ queue outbox โดยไม่รอ SMTP (`notificationMode='queued'`) เพื่อไม่ให้ PHP request timeout
81. **4M PUT optional attachment** — an unchanged `<input type="file">` can arrive as a multipart part with `filename=""`; the PHP PUT parser must ignore that part and retain the existing `AttachmentUrl`. Do not pass an empty file part to `store_upload()` or it will return `Unsupported upload`.
82. **4M Paste Employee IDs is a verified write** — `Assign IDs` must POST eligible IDs to `/fourm/training-curriculums/:id/assignments` and then GET the curriculum assignments to confirm every non-missing/non-blocked ID is visible before showing success. Do not use an `Added` toast for selection-only state. Keep only one active `showAssignEmployeesModal()` declaration; legacy duplicates must not override it.
83. **4M transfer confirmation detaches/disables the form** — `guardSubmitHandler()` disables form controls immediately after the handler reaches its first `await`, and `showConfirmationModal()` can replace the transfer modal. Capture `FormData` and element references before awaiting confirmation; after completion, only restore a referenced control when `element?.isConnected`. Otherwise the destination ID is omitted and `document.getElementById(...)` returns null.
84. **4M Training Matrix KPI source** — the five matrix KPI cards must use `GET /fourm/training-matrix-summary`, not `_tmCurriculums`, `_tmCourses`, or the currently selected `_tmAssignments`. The summary is scoped by year/department server-side and includes active curricula/courses, distinct assigned employees, both curriculum/course transfer rows, and inactive curricula/courses. Every successful Training Matrix mutation must finish with `fetchTrainingMatrix()` so the authoritative summary is read again.
85. **BBS Phase 4 QR is a locator, never authentication** — store only SHA-256 token hashes plus short fingerprints. Raw tokens are returned only on issue/replace and travel in `#bbs-qr=`. Public resolve must not return identity. Authenticated claim must preserve the current session and authorize only self, Admin, or a current direct hierarchy assignment.
86. **BBS card templates are private CR80 assets** — store verified JPG/PNG/WebP files in `backend/private-uploads/bbs-card-templates`, serve them through the Admin-authorized API only, and back them up with MySQL/private evidence. Replace/reprint rotates the QR token; normal rollback uses archive/revoke rather than deleting issued history.
87. **BBS Phase 5 action lifecycle** — qualifying submitted Unsafe answers create exactly one action per `AnswerID`; lifecycle is `Open -> In Progress -> Pending Verification -> Closed`, with `Pending Verification/Closed -> Reopened`. After evidence is mandatory before verification. Reminder tests queue only; keep `BBS_Settings.action_notifications_enabled=0` unless real delivery is explicitly approved. Operational rollback preserves action/history/evidence data.
88. **BBS Phase 6 analytics scope/formula** — enforce Personal/Team/Department/Company permission in Node and PHP before applying filters. KPI actual is capped per eligible workday by the configured daily target. Drill-down and `/analytics/export-data` must reuse the same scoped query; rollback disables `analytics_enabled` and `analytics_export_enabled` only.
89. **BBS Phase 7 rollout gate** — `/api/bbs/qr/claim` must return `data.employee` as one object in both Node and PHP, never a MySQL row array. BBS API responses use `private, no-store` and module security headers. A valid Master scope alone is not Pilot-ready: require business-approved roster, Active Assignments, an applicable Published Checklist, and a clean read-only Pilot reconciliation before deployment approval.
