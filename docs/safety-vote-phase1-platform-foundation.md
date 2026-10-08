# Safety Vote Phase 1 — Platform Foundation Closeout

Date: 2026-10-08 (Asia/Bangkok)

Contract: `2026-10-08-safety-vote-phase0-r1`

Decision: **PHASE_1_LOCAL_PASS — READY_FOR_PHASE_2_AUTHORIZATION — HOLD_FOR_PRODUCTION**

## Delivered

- Read-only inspection of the actual local MariaDB schema before implementation. It confirmed MariaDB 10.4.32, the existing Employee/name-based organization model, Admin permission/audit tables, and that no `SafetyVote_*` table existed.
- Explicit additive/idempotent migration for ten foundation tables and 11 permission keys. Runtime contains no Safety Vote DDL.
- Data-preserving rollback that disables the module while retaining tables, campaigns, files, audit and permission configuration.
- Authenticated Node/PHP route parity for fail-closed health, permission discovery, Draft create/read/update/void, read-only System Console Master pickers, eligibility rule save/preview and private file upload/read/logical removal.
- Versioned campaign and eligibility validation contract shared through deterministic Node/PHP fixtures.
- Admin System Console tab for Draft configuration and preview. No general user module/menu entry and no ballot endpoint exist.
- Dedicated module audit containing bounded metadata only. Campaign/file content, passwords, tokens and ballots are not copied into audit.
- Private file delivery through authorized endpoints with signature/MIME/size checks and `private, no-store`; PHP storage has an Apache deny rule.

## Schema and privacy behavior

- Phase 1 schema version: `2026-10-08-phase1-r1`.
- `module_enabled` remains `0`.
- Health requires all ten tables plus exact contract and schema versions; otherwise it returns `503 SAFETY_VOTE_SCHEMA_NOT_READY` and performs no DDL.
- Master Data is projected read-only. Draft/preview never writes `Employees`, `Master_Departments`, `Master_SafetyUnits` or `Master_Positions`.
- Eligibility distinguishes `masterPresent`, `accountReady` and `eligible`; password presence is not treated as employment status.
- Draft deletion is a reason-required, audited `Voided` transition. It does not hard-delete campaign data.

## Verification

- Node syntax and PHP lint: pass.
- Deterministic Node/PHP campaign, validation, eligibility and hash parity: pass.
- Guarded disposable migration: pass twice; 10 tables, seven settings and 77 default role/permission rows; rollback preserved the probe campaign and disabled the module.
- Authenticated Node and PHP API lifecycle: pass for permission boundary, Draft CRUD/void, Master search, eligibility save/preview, private upload/download/denial/logical removal and audit.
- Both disposable API databases were dropped and verified absent. Temporary private-file fixtures were removed.
- `git diff --check`: pass; line-ending notices only.
- Permission audit: all Safety Vote mutation routes are reviewed inline guards. The audit still reports only the two pre-existing unrelated 4M routes as `UNREVIEWED`.

Primary verification command:

```powershell
npm run verify:safety-vote-phase1
```

## Boundaries observed

- No Production connection, deployment, commit or push.
- The real local business database was inspected read-only only; migration and API lifecycle writes used guarded disposable databases.
- No main user menu or real vote submission/result path was added.
- The pre-existing modification in `backend/scripts/patrol-checkin-v2.test.js` was preserved and excluded from Safety Vote work.

## Phase 2 authorization command

> เริ่ม Safety Vote Phase 2 — Core Activity Vote MVP ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 1 โดยให้ตรวจ Phase 1 diff และ schema แบบ read-only ก่อน จากนั้นสร้าง additive migration และ data-preserving rollback สำหรับ Questions, Options/Candidates, Participation, Ballots, BallotAnswers และ RequestKeys; ทำ Node/PHP parity สำหรับ Campaign Builder แบบ single/multiple choice, eligibility preview/freeze พร้อม snapshot/hash, lifecycle Draft → Open → Closed → Published, user workspace/gallery, transactional idempotent ballot submit ที่ห้าม Admin แก้คะแนน, dashboard/results และ Excel/PDF export ขั้นพื้นฐาน โดยใช้ image contest เป็น pilot เปิดเมนูผู้ใช้เฉพาะเมื่อ preflight พร้อม ทดสอบ authenticated desktop/mobile และ concurrency บน guarded disposable database เท่านั้น รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ทั้งหมด ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานผล ขอบเขตไฟล์ และคำสั่งสำหรับ Phase 3
