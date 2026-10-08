# Safety Vote Phase 8.2 — Immutable Candidate and Protected Production Preflight Closeout

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Governance contract: `2026-10-08-safety-vote-phase8.1-she-governance-r1`
Protected preflight contract: `2026-10-08-safety-vote-phase8.2-r1`
Production target: `https://dev.tshpcl.com/safety/tsh-safety-core/`
Decision before commit: `TECHNICAL_PREFLIGHT_PASS — HOLD_FOR_AUTHENTICATED_NON_MUTATING_SMOKE`

## Outcome

The protected Production preflight is complete. A one-time checksum-locked helper performed value-suppressed PHP/configuration checks, `INFORMATION_SCHEMA`, `SHOW GRANTS`, row counts and schema-only export work inside a read-only transaction. It did not execute DDL/DML, read ballot choices, export voting records or create a voter-to-choice mapping.

Production is ready for the additive Safety Vote schema from an infrastructure perspective, but deployment remains HOLD because there is no existing valid authenticated Production session for a non-mutating smoke test. The login endpoint records login/audit state, so no login was attempted and authentication was not bypassed.

The final full Phase 1–7 guarded regression passed after the Phase 8.2 tooling changes. Latest backup/restore/privacy/10k evidence is `backups/local/safety-vote-phase7-gates-1791452005790/`; latest authenticated Admin desktop/mobile SHE-governance Browser evidence is `backups/local/safety-vote-phase7-browser-1791452007684/`.

## Protected Production evidence

Accepted evidence: `backups/production/safety-vote-phase82-preflight-20261008092819/`

- Production PHP: `7.4.33`; required PDO MySQL, JSON, mbstring, fileinfo, ZIP, image metadata, hash, OpenSSL and HTTPS client capabilities pass.
- Required configuration keys are present and non-empty; values and credentials were never returned or persisted.
- Application and database clocks align with `Asia/Bangkok` (`UTC+07:00`).
- Database privileges required for the later additive migration are present.
- Existing Safety Vote tables: `0`; Safety Vote business rows: `0`; private Safety Vote files: none.
- Existing Safety Vote role permission grants: `0`, as expected before Phase 1 migration. The existing permission table schema is compatible.
- External calendar/notification/result-handoff adapters are not configured. This is acceptable for the core pilot because the adapters fail closed and do not bypass certification.

## Privacy-safe backup and restore verification

- Scoped SQL bytes: `171`.
- SHA-256: `4a67122f21be115a9cc950e1668408d0447dc2f4f45682380efbdc41bfb5e8d1`.
- Two independent download-back copies matched the server SHA-256.
- Direct HTTPS access to the SQL returned `403` while it existed.
- Restore into a guarded disposable local database passed with zero Safety Vote tables and zero settings rows, matching the pre-deployment Production state.
- No ballot, answer, participation, eligibility, nomination, submission, score, certification or private-file content was exported.

The backup is intentionally small because Safety Vote is not yet installed in Production. File rollback evidence from Phase 8 remains valid for the six existing replacement files and the 18 runtime paths proven absent.

## Helper controls and cleanup

- The helper filename and tokens were random; only token SHA-256 values were embedded.
- A separate guard file locked execution to the exact helper SHA-256.
- `GET` returned `405`; an invalid token returned `401`.
- The root `.htaccess` was temporarily changed only to exempt the exact random helper path from the API rewrite.
- Original and restored `.htaccess` SHA-256 both equal `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`.
- Helper, guard, SQL, marker and temporary backup directory were removed. Final FTPS inventory proved zero residue.

Two diagnostic attempts failed closed before the accepted run: the first exposed a case-sensitive Production permission-table lookup assumption; the second confirmed the same stage before the exact table-name fix. Both attempts restored `.htaccess` byte-exact and removed their temporary artifacts. No database mutation occurred.

## Authenticated Production UAT

Status: `HOLD_NO_EXISTING_VALID_SESSION`.

- No existing valid bearer/session token was available.
- Login was not attempted because it writes login/audit state and therefore is not non-mutating.
- Authentication was not bypassed and no synthetic Production account was created.
- Authenticated Admin/User/Juror desktop and mobile behavior remains covered by the guarded local Phase 1–7 regressions, but it does not replace the requested Production smoke gate.

## Release and rollback posture

- Deployment: not performed and not authorized.
- Push: not performed and not authorized.
- Migration/configuration/business-data mutation: not performed.
- Candidate commit: created only after final scoped diff, regression and staged-file verification; its definitive hash is recorded in the post-commit evidence and closeout response because a Git commit cannot contain its own hash.
- `backend/scripts/patrol-checkin-v2.test.js`, backups, private business files and every unrelated dirty path are excluded.

Rollback readiness is `READY_FOR_CONTROLLED_DEPLOYMENT_WITH_HOLD`: the pre-deployment runtime state is downloaded and verified, the absent Safety Vote database/private-file state is verified and restored, and Phase 1–7 rollbacks preserve evidence while disabling the module. Deployment must still wait for a valid non-mutating authenticated Production session or a separately accepted exception from the SHE owner.

## Separate deployment authorization

Use a new explicit instruction only after resolving or explicitly accepting the authenticated-smoke blocker:

> เริ่ม Safety Vote Production Deployment แบบ controlled release จาก immutable commit `<COMMIT_SHA>` และ candidate manifest/evidence hash `<HASH>` ตาม Contract `2026-10-08-safety-vote-phase0-r1` และ SHE Governance `2026-10-08-safety-vote-phase8.1-she-governance-r1`; ให้ตรวจ exact remote drift และ protected preflight freshness ก่อน จากนั้นสำรอง download-back ที่ตรวจ hash แล้ว, apply additive migrations Phase 1–7 ตามลำดับ, ตรวจ schema health ก่อนเปิด module, deploy เฉพาะ runtime manifest, ทำ authenticated non-mutating Admin/User/Juror smoke ด้วย session ที่มีอยู่แล้ว, ตรวจ reconciliation และ zero residue; ห้ามอ่าน/export voter choice, ห้ามสร้าง voter-to-choice mapping, ห้าม bypass dual certification และให้ rollback แบบ data-preserving ทันทีเมื่อ gate ใดไม่ผ่าน

This text is a future authorization template, not current deployment permission.
