# Safety Vote Phase 9.5B — Company-wide Module Enablement

Date: 2026-10-09

Decision: `PHASE_9_5B_COMPANY_WIDE_MODULE_ENABLE_PASS_INTEGRATIONS_DISABLED`

## Outcome

Following explicit authorization to replace the bounded-pilot objective with company-wide visibility, Production `SafetyVote_Settings.module_enabled` was changed from `0` to `1`. The existing role-derived visibility surface of 2,543 accounts was explicitly accepted. Permissions were not modified: four Admin accounts retain all 11 Safety Vote permissions/Admin bypass, while the populated User and Viewer roles retain only `SAFETY_VOTE_VIEW`.

Phase 7 integrations remain disabled, external providers remain unconfigured and there are no campaigns or other Safety Vote business rows. No login, permission change, campaign creation, email/notification, runtime deployment or push occurred.

## Fresh preconditions

- Immutable Production runtime double-download matched `41/41` files from commit `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b`.
- Bearer authentication, rollback archive/manifest and exact effective account count passed.
- Fresh protected precheck confirmed 39 tables, 11 permissions, zero business rows, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured providers, verified privacy-safe backup/restore and zero helper/backup residue.
- Runtime/access evidence: `backups/production/safety-vote-phase95b-preflight-20261009060333/`, result SHA-256 `8f6bfae60a4ce6ace97c4755ee1ec4e7674436520e24f9d2412518afc572b83c`.
- Protected precheck: `backups/production/safety-vote-phase82-preflight-20261009060516/`, result SHA-256 `218dbee18d7e6d5d08821ed341a5a954623ba9a08a90034659278e5839e2d1b2`.

The Phase 9.5B preflight's prior `HOLD_PILOT_COHORT_NOT_PROVEN` was a product-scope blocker, not a technical failure. It was superseded by the explicit company-wide authorization.

## Guarded setting change

Checksum-locked review candidate SHA-256: `bf1ad0adf834a7efc9f4bd54075b157d32728b85580782913619b743977b9707`.

The one-time helper changed exactly one row and limited DML to `SafetyVote_Settings.module_enabled: 0 -> 1`. It verified integrations disabled, providers unconfigured, Phase 7 schema and zero business rows before committing. The exact prior setting row was written to a private rollback SQL file, downloaded twice and verified:

- Rollback bytes: `209`.
- Rollback SHA-256: `074a4be4ddae07b75e7d5f92fb0c3dcddba973cc9ed0a85b302a1f5300ebc982`.
- Direct HTTPS status: `403`.
- Original/restored Production `.htaccess` SHA-256: `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`.
- Helper, guard and remote backup residue: zero.

Activation evidence: `backups/production/safety-vote-phase95b-enable-20261009060715/`, result SHA-256 `36b5713e53094fba7ff6696523c280e728a8ee84089c8c102d319809d7f4c707`.

Rollback was not triggered because all activation and post-activation gates passed.

## Post-enablement verification

Fresh protected postcheck independently confirmed `module_enabled=1`, `phase7_integrations_enabled=0`, zero configured providers, 39 tables, zero business rows, no DDL/DML, verified privacy-safe backup/restore, byte-exact `.htaccess` restoration and zero helper/backup residue.

Protected postcheck: `backups/production/safety-vote-phase82-preflight-20261009060740/`, result SHA-256 `6f56676c3150f70f5f4fd21f9b8a56915698db630e6752d72d979be820e2ac19`.

Authenticated GET-only smoke passed:

- Health: `200`, ready and module enabled.
- Campaigns: `200`, zero rows.
- Both responses: JSON and `Cache-Control: private, no-store, max-age=0`.
- No credential value/hash or response body was recorded.

Smoke evidence: `backups/production/safety-vote-phase95b-enabled-smoke-20261009060816/`, result SHA-256 `99990164798d7dedee40db530f8bd6c62399e2f2bad284f1f1507753ba572d78`.

The separate `safetyVoteUxV1` presentation flag remains strict opt-in and default OFF because this authorization prohibited runtime deployment. Company-wide users therefore receive the deployed default/legacy Safety Vote presentation unless that UX flag is separately authorized and configured. Phase 9.6 has not started.
