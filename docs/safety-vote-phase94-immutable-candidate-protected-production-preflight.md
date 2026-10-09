# Safety Vote Phase 9.4 — Immutable Candidate and Fresh Protected Production Preflight

Date: 2026-10-09

Contract: `2026-10-09-safety-vote-phase9.4-r1`

Production target: `https://dev.tshpcl.com/safety/tsh-safety-core/`

Decision: `PHASE_9_4_COMPLETE_HOLD_MODULE_ENABLED_REMOTE_DRIFT_AUTHENTICATED_SMOKE`

## Outcome

Phase 9.4 completed its authorized immutable-candidate, protected Production and file-drift work. The candidate is immutable and the protected checks, privacy-safe backup/restore and cleanup succeeded. Release remains `HOLD`: Production currently reports `module_enabled=1`, runtime drift is present and no existing authenticated non-mutating session is available for the required smoke.

Phase 9.5 controlled pilot and Phase 9.6 rollout have not started. No deployment, migration, module-setting change, login, external delivery or push occurred.

## Immutable candidate

- Candidate commit: `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b`
- Git tree: `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`
- Parent: `077c5977283a55756bdfcfe5dfb804e32f716aa8`
- Candidate paths: 48
- Candidate delta SHA-256: `3f125ca7ccdb3415cd5be9352d42c05fe52f2aae20366434bc6b553e78674cca`
- Runtime scope: 41 paths; SHA-256 `d4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc`
- Candidate manifest: `docs/safety-vote-phase94-candidate-manifest.json`
- Candidate manifest SHA-256: `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c`

Every manifest file hash comes from an immutable Git blob. `.env`, credentials, backups, private business files and the unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` are excluded.

## Fresh protected Production preflight

Evidence: `backups/production/safety-vote-phase82-preflight-20261009025522/`

Result JSON SHA-256: `05207782cc298deff267ec8d1030819b276b148f57c6a3741a5d25b3973d6e6d`

Verified conditions:

- PHP `7.4.33`, required extensions, value-suppressed configuration, database privileges and Asia/Bangkok clock alignment passed.
- Production has the expected Phase 7 contract/schema version, 39 Safety Vote tables and all 11 permissions.
- Safety Vote business rows are zero and private Safety Vote storage is absent.
- External provider environment keys are unconfigured and fail closed; `phase7_integrations_enabled=0`.
- `module_enabled=1` is a blocker because the controlled-pilot entry condition requires a known disabled state before separately authorized activation.
- The authenticated smoke was not attempted or bypassed because no existing valid non-mutating session was available.

The protected helper used random tokens, a checksum guard and a one-time execution marker. Unauthorized `GET` returned `405`; an invalid token returned `401`. Production `.htaccess` was restored byte-exact with original/restored SHA-256 `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`. Helper, guard, server backup and temporary directory residue is zero.

## Privacy-safe backup and restore

- Bytes: `61,012`
- SHA-256: `86881f838313d31f8ce980cc928f1856bbf462d43f5b333d5f5ad129c5af48a4`
- Two independent download hashes matched.
- Direct public access returned `403` while the backup existed.
- Guarded local restore reproduced 39 tables and 20 settings rows and was removed afterward.
- No ballot choice, answer, participation, eligibility identity, nomination, submission, jury score or private-file content was exported.
- No voter-to-choice mapping was created.

## Production runtime drift

Evidence: `backups/production/safety-vote-phase94-drift-20261009025816/`

Result JSON SHA-256: `c5140b4d5adbddb38340d85ff73156a1c07a4b87b28d2245989becf3897fd159`

The read-only gate performed only FTPS `LIST`/`DOWNLOAD` and anonymous HTTPS `GET` against 41 candidate runtime paths:

- 21 paths match the immutable candidate parent.
- One candidate-new path is absent as expected.
- Four shell files have remote drift: `index.html`, `public/js/main.js`, `public/js/pages/admin.js` and `public/style.css`.
- Fifteen UX runtime files present in the parent commit are missing remotely.
- Remote private Safety Vote directory is absent; private contents were not read.
- Root HTTPS returned `200`; anonymous health and release-preflight returned `401`; the direct handler returned fail-closed `501`; private storage returned `403`.

These findings describe pre-deployment state; they do not authorize overwriting the drift. A later controlled deployment must revalidate every remote file, prepare verified rollback for replacements and remove only paths proven new if rollback is required.

## Required next gates

Phase 9.5 must not begin until a separately authorized plan safely establishes and verifies the disabled pre-pilot posture, resolves or explicitly incorporates the remote drift into a rollback-protected deployment plan, and defines an authenticated non-mutating smoke using an existing valid session. External integrations must remain disabled.

Phase 9.6 remains blocked until the controlled pilot is accepted, authenticated smoke passes, the rollback drill passes and a separate Production rollout instruction is issued.
