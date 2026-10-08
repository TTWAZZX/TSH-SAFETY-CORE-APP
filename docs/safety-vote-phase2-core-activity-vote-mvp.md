# Safety Vote Phase 2 — Core Activity Vote MVP Closeout

Date: 2026-10-08 (Asia/Bangkok)

Contract: `2026-10-08-safety-vote-phase0-r1`

Decision: **PHASE_2_LOCAL_PASS — READY_FOR_PHASE_3_AUTHORIZATION — HOLD_FOR_PRODUCTION**

## Delivered

- Read-only review of the Phase 1 diff and actual local MariaDB schema before implementation. The real database remained unchanged.
- Additive/idempotent Phase 2 migration for Questions, Options, Candidates, Participation, Ballots, optional Ballot Identities, Ballot Answers and Request Keys. The data-preserving rollback disables the module and retains all rows.
- Fail-closed schema health now requires the complete 18-table Phase 2 schema and `2026-10-08-phase2-r1`; no runtime DDL was added.
- Node/PHP parity for single/multiple-choice builder, frozen eligibility snapshot/hash, Draft → Open → Closed → Published, eligible workspace, campaign detail and results.
- Private image-contest gallery. Admin can upload an image per option; an option can reference only an active private file from its own campaign; only an authorized Admin or employee in the frozen eligibility snapshot can read it.
- Transactional ballot acceptance with HMAC-protected `Idempotency-Key`, request fingerprint replay/conflict handling, campaign lock, exact question/option validation, frozen eligibility and one-participation/one-ballot concurrency guards.
- Accepted ballots have no update/delete route. Admin operations cannot edit a submitted score. Identified/confidential identity mapping is separated from ballot answers; anonymous/secret modes do not create that mapping.
- Admin dashboard, user aggregate result view and a shared export-data source used by basic Excel and PDF export.
- User navigation remains hidden unless authenticated schema health reports both `ready=true` and `moduleEnabled=true`.

## Verification

- `npm run verify:safety-vote-phase2`: pass.
- Deterministic Node/PHP contract/static parity: pass.
- Guarded disposable migration applied twice: pass; all 18 tables present.
- Data-preserving rollback: pass; probe data survived and the module was disabled.
- Authenticated Node and PHP lifecycle: pass for builder, image association/delivery, eligibility freeze, lifecycle, vote, result, dashboard and export.
- Concurrent identical request: one `201` plus one replayed `200`, with the same receipt.
- Concurrent different keys for the same employee: one `201` plus one `409`; exactly two accepted ballots across two voters.
- Authenticated browser UAT: pass at 1366×768 and 390×844, with no horizontal overflow, controls at least 44 px and no browser errors. Evidence: `backups/local/safety-vote-phase2-browser-1791430206649/`.
- Both disposable API databases were dropped and verified absent; temporary private fixture files were removed.
- PHP lint, Node syntax and `git diff --check`: pass; only line-ending notices.
- Permission audit classifies all Safety Vote mutation routes as reviewed inline guards. It still reports only the two pre-existing unrelated 4M routes as `UNREVIEWED`.

Primary verification command:

```powershell
npm run verify:safety-vote-phase2
```

## Boundaries observed

- No Production connection, migration, deployment, commit or push.
- The real local database was read-only; all migration/runtime writes used guarded disposable loopback databases.
- No accepted-ballot editing API exists. No certified secret-election claim is made in Phase 2.
- Survey conditional forms, nomination/submission intake, jury scoring, certification, scheduling/notification and advanced privacy suppression remain later phases.
- The pre-existing modification in `backend/scripts/patrol-checkin-v2.test.js` was preserved and excluded.

## Phase 3 authorization command

> เริ่ม Safety Vote Phase 3 — Survey, Feedback, Nomination and Submission ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 2 โดยให้ตรวจ Phase 2 diff และ schema แบบ read-only ก่อน จากนั้นสร้าง additive migration และ data-preserving rollback สำหรับ Submissions และ answer/file indexes ที่จำเป็น; ขยาย Question Engine และ Node/PHP parity ให้รองรับ question types และ conditional branches ตาม Contract, anonymous survey ที่ไม่มี identity mapping, nomination consent/review/status workflow, submission Draft → Submitted → Reviewed/Finalist/Rejected/Withdrawn พร้อม ownership และ private files, Admin review/finalist audit, free-text/export privacy classification และ user/admin UX ทั้ง desktop/mobile โดยคง immutable accepted ballots และ Phase 2 regression ทั้งหมด ใช้ฐานข้อมูลทดสอบแบบ guarded disposable เท่านั้น รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ทั้งหมด ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานผล ขอบเขตไฟล์ และคำสั่งสำหรับ Phase 4
