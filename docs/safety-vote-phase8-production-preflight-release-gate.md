# Safety Vote Phase 8 — Production Preflight and Release Gate

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Preflight contract: `2026-10-08-safety-vote-phase8-preflight-r1`
Governance amendment: `2026-10-08-safety-vote-phase8.1-she-governance-r1`
Production target: `https://dev.tshpcl.com/safety/tsh-safety-core/`
Decision: `HOLD — NOT AUTHORIZED FOR PRODUCTION DEPLOYMENT`

## Gate decision

The exact PHP Production target was confirmed from the repository's established Production runbooks and prior releases. The hostname contains `dev`, but this URL is the documented live Production target.

The gate remains HOLD because:

1. The Safety Vote chain is an uncommitted dirty working-tree candidate, not an immutable release commit.
2. No existing protected read-only channel can freshly verify Production PHP capabilities, value-suppressed configuration, database schema/version and privileges, server clock/time zone or provider configuration.
3. No privacy-safe narrow Production database backup was made. No helper was uploaded and no SQL was executed.
4. Authenticated non-mutating smoke was not possible with a known-valid session. Previously stored Production UAT credentials returned `401`; authentication was not bypassed and no repeated login/audit mutation was attempted.
5. The repository-wide permission audit retains two pre-existing unrelated FourM findings. It reports no unreviewed Safety Vote mutation route.

The former six-department approval blocker is superseded. Safety Vote is governed internally by SHE: each campaign requires one audited `she_owner` acceptance, while Certified Secret Election retains two-person result certification.

## Scoped candidate manifest

Machine-readable manifest: `docs/safety-vote-phase8-candidate-manifest.json`

- Source commit at inspection: `aa270b0ee5d73403636231f4f60534824018472c` (`main`).
- Immutable: `false`.
- PHP Production runtime scope: 24 files.
- Operations-only additive migrations and data-preserving rollbacks: 14 files.
- Node parity/source-only scope: 19 files.
- Missing scoped files: zero.
- Runtime scope SHA-256: `2e341e572e74d6bfbe7a363075e2cea3b751b52d46662ef3e8f2e36c7fdc064e`.
- Migration scope SHA-256: `d29d252417681c4ecb77c2622e79ffb5355b3097e266482f41e61c849df1e107`.
- `backend/scripts/patrol-checkin-v2.test.js` is explicitly excluded as unrelated pre-existing dirty work.
- Private business files, local evidence and backups are explicitly excluded from release payloads.

The 24-file runtime scope is:

1. `api/index.php`
2. `api/handlers/admin_phase8.php`
3. `api/handlers/safety_vote.php`
4. `api/handlers/safety_vote_phase2.php`
5. `api/handlers/safety_vote_phase3.php`
6. `api/handlers/safety_vote_phase4.php`
7. `api/handlers/safety_vote_phase5.php`
8. `api/handlers/safety_vote_phase6.php`
9. `api/handlers/safety_vote_phase7.php`
10. `api/lib/safety_vote_phase1.php`
11. `api/lib/safety_vote_phase2.php`
12. `api/lib/safety_vote_phase3.php`
13. `api/lib/safety_vote_phase4.php`
14. `api/lib/safety_vote_phase5.php`
15. `api/lib/safety_vote_phase6.php`
16. `api/lib/safety_vote_phase7.php`
17. `api/private/.htaccess`
18. `api/private/index.html`
19. `index.html`
20. `public/js/main.js`
21. `public/js/module-meta.js`
22. `public/js/pages/admin.js`
23. `public/js/pages/admin-safety-vote.js`
24. `public/js/pages/safety-vote.js`

## Read-only Production evidence

Accepted evidence: `backups/production/safety-vote-phase8-preflight-20261008091739/`

Only FTPS `LIST`, FTPS `DOWNLOAD` and unauthenticated HTTPS `GET` were used. No upload, delete, login, SQL, migration, configuration change, business-data mutation, commit, push or deployment occurred.

### Exact runtime drift and file rollback

- Six existing replacement targets were present: `api/index.php`, `api/handlers/admin_phase8.php`, `index.html`, `public/js/main.js`, `public/js/module-meta.js` and `public/js/pages/admin.js`.
- Every existing target matched the inspected `HEAD` baseline after newline normalization.
- Each existing file was independently downloaded twice; all six byte-exact SHA-256 pairs matched.
- Sixteen new Safety Vote runtime files were absent as expected.
- `api/private/` was absent, so its two protection files were also correctly classified as new.
- Remote drift result: PASS, zero blockers.

The file rollback package is ready for the six replacement targets. A future rollback may restore only those six verified copies and remove only the 18 paths proven absent before deployment. This file readiness does not make the overall rollback ready because database state is unverified and has no Production backup.

### HTTPS read-only probes

- Application root: `200`.
- Safety Vote schema-health and direct not-yet-deployed Safety Vote PHP paths: `501` with `no-store`; this confirms the new runtime is not active, not that its Production schema is ready.
- Server-side shared Safety Vote contract probe: `404`.
- No response body was retained or interpreted for voter data.

### Private storage and database

- Remote `api/private/safety-vote` directory was absent. There were no Safety Vote private files to copy and no file content was read.
- Production database was not connected.
- None of the 39 Safety Vote tables, settings, row counts, schema hashes or privileges were inspected.
- No ballot answer, voter choice, voter-to-choice join or identity mapping was read, exported or created.
- No database dump exists. Overall backup/restore readiness is therefore FAIL/HOLD.

An acceptable future database backup design must be reviewed by Privacy/Security first. It must not expose or join `SafetyVote_Participation`/`SafetyVote_BallotIdentities` with `SafetyVote_Ballots`/`SafetyVote_BallotAnswers`; the current Phase 8 authorization does not permit a temporary server helper or a choice-row export.

## Verification completed locally

- Candidate manifest generation: PASS; all scoped files exist and unrelated dirty Patrol work is excluded.
- PHP syntax: PASS for 16 PHP candidate files using the local PHP runtime.
- JavaScript syntax: PASS for five browser candidate files and three Phase 8 tooling files.
- `git diff --check`: PASS, with line-ending warnings only.
- Static permission audit: Safety Vote has no unreviewed mutation route; two unrelated pre-existing FourM findings remain.
- Full Phase 1–7 regression after the SHE governance amendment: PASS, including guarded migrations, Node/PHP parity, authenticated API lifecycles, 20-voter concurrency, anonymous/secret separation, scoring, reports, backup/restore, privacy/performance and desktop/390 px Browser UAT.
- Latest full governance gate evidence: `backups/local/safety-vote-phase7-gates-1791450748768/`; latest targeted risk-conditional SHE Governance Browser UAT: `backups/local/safety-vote-phase7-browser-1791450988011/`.

Local lint does not replace fresh Production PHP 7.4 capability/configuration verification. The previously proven Production PHP 7.4.33 result is historical evidence only and was not promoted to a fresh Phase 8 pass.

## Unresolved release blockers

- Source is not a clean immutable scoped commit.
- Fresh Production PHP extensions/capabilities are unverified.
- Value-suppressed Production Safety Vote configuration is unverified.
- Production Safety Vote schema/version and database privileges are unverified.
- Production server/database clock and `Asia/Bangkok` behavior are unverified.
- Notification/calendar/certified-handoff provider configuration is unverified.
- Private storage directory ownership, permissions and deny rules cannot be verified before it exists.
- Narrow database backup/download-back/restore evidence is absent.
- Authenticated read-only smoke is absent.
- Two unrelated FourM permission-audit findings remain open.

## Rollback readiness

Status: `PARTIAL — FILE ROLLBACK READY, DATABASE/CONFIGURATION ROLLBACK NOT READY`.

If a later separately authorized deployment fails, the safe rollback must:

1. Disable the module and Phase 7 integrations without deleting evidence.
2. Restore the six pre-deployment files only from the accepted double-download SHA-256 package.
3. Remove only the 18 runtime paths whose preflight state was proven absent.
4. Preserve ballots, score sheets, participation, identity separation, result snapshots, certifications, reports, audit and private files.
5. Use only a separately approved data-preserving rollback after its exact Production schema and backup are verified.
6. Re-run anonymous fail-closed probes and an authorized non-mutating authenticated smoke.

## Separate future deployment authorization

Do not use the following authorization until all blockers above are closed and the placeholders identify a clean immutable candidate:

> เริ่ม Safety Vote Production Deployment แบบ controlled release จาก immutable commit `<IMMUTABLE_COMMIT_SHA>` และ manifest `<MANIFEST_SHA256>` ที่ Phase 8 closeout อนุมัติแล้วเท่านั้น โดยใช้ SHE internal governance ตาม Contract `2026-10-08-safety-vote-phase8.1-she-governance-r1`, ต้องมี fresh Production preflight และ verified privacy-safe database/private-file backup ก่อน จากนั้น apply additive migrations ตามลำดับ Phase 1–7 เพียงครั้งเดียว เปิด module แบบ fail-closed หลัง schema health ผ่าน อัปโหลดเฉพาะ 24 runtime paths ใน manifest ตรวจ download-back SHA-256, non-mutating authenticated Admin/User/Juror smoke, reconciliation และ zero temporary residue; Secret Election ต้องคงผู้รับรองผลสองคน ห้ามอ่านหรือสร้าง voter-to-choice mapping ห้าม deploy เมื่อ hash/drift/backup ไม่ตรง และห้าม commit/push หรือขยาย scope โดยไม่มีคำสั่งใหม่

This is a future authorization template, not an executable command and not current deployment approval.
