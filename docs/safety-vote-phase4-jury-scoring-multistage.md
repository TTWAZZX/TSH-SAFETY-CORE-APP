# Safety Vote Phase 4 — Jury, Scoring and Multi-stage

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Runtime/schema contract: `2026-10-08-safety-vote-phase4-r1`
Decision: `PHASE_4_LOCAL_PASS — READY_FOR_PHASE_5_AUTHORIZATION — HOLD_FOR_PRODUCTION`

## Scope delivered

- Additive, idempotent migration extends questions/candidates/submissions with stage ownership and adds scoring criteria, jury assignments, score rows, immutable result snapshots/rows, certifications and stage advancements. Schema health requires exactly the 27 contracted Safety Vote tables and fails closed otherwise.
- The rollback is data-preserving: it disables the module and retains every table, column, ballot, score, result, certification and file.
- Node/PHP share deterministic contracts for weighted jury scoring, 70/30-style hybrid scoring, rank/allocation inputs, high/low exclusion, quorum, participation threshold, advancement threshold/top-N and deterministic tie-breaking.
- Admin can configure the scoring policy, stages, criteria and central Employee Master-backed jury assignments while the campaign is Draft. Every configuration response includes normalized values or a stable hash.
- Jurors have a responsive workspace for blind candidates, bounded comments, draft scores, conflict declaration/recusal and final submit. Submit uses a row lock and transaction; a submitted sheet is immutable. Formal reopen creates a new sheet version and never overwrites the submitted sheet.
- Result calculation writes an immutable snapshot and row set with input/result SHA-256 values. Freeze, exact-hash certification, certified publication and audited shortlist/final advancement are separate permission/assignment-controlled actions.
- Accepted ballots, anonymous identity separation and private-file delivery from Phases 1–3 remain unchanged.

## Verification

- Real local schema inspection was read-only before implementation and found no existing Safety Vote tables. Production was never contacted.
- Phase 4 migration runs twice on a guarded disposable database and verifies 27-table health plus a data-preserving rollback.
- Deterministic Node/PHP parity passes weighted, hybrid, ranking, allocation, quorum failure, threshold, tie-break, criteria, sheet and blind stage normalization cases.
- Authenticated Node and PHP lifecycles pass scoring configuration API parity, central-master jury assignment, blind identity suppression, recusal, draft scoring, concurrent submit (`200` once / `409` once), immutable submitted scores, formal reopen history, calculation, hash mismatch rejection, certification, publication and stage advancement.
- Phase 1–3 regression, accepted-ballot concurrency and anonymous survey identity separation remain passing.
- Authenticated juror/admin Browser UAT passes at 1366×768 and 390×844 with no horizontal overflow and minimum 44 px controls. Latest evidence: `backups/local/safety-vote-phase4-browser-1791434640207/`.
- Node syntax, PHP lint and `git diff --check` pass. Permission audit retains only the two pre-existing unrelated FourM findings.
- Disposable database cleanup is guarded by an exact allowlist and both test databases are dropped in `finally`.

No Production connection, deployment, commit or push occurred. Existing working-tree changes, including `backend/scripts/patrol-checkin-v2.test.js`, were preserved.

## Phase 5 authorization command

Use this exact instruction next:

> เริ่ม Safety Vote Phase 5 — Operations, Analytics, Export and Notification ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 4 โดยให้ตรวจ Phase 4 diff และ schema แบบ read-only ก่อน จากนั้นสร้าง additive migration และ data-preserving rollback สำหรับ Reports, Export Jobs และ Notifications/Delivery Logs; ทำ Node/PHP parity สำหรับ operations dashboard, campaign timeline, participation funnel, privacy-threshold suppression, scheduled open/close/reminders, duplicate-suppression, retry/failure handling, aggregate Excel/PDF และ certified report ที่ผูกกับ immutable result snapshot/hash พร้อม report ID และ SHA-256, scoped audit export และ retention/cleanup แบบ dry-run โดยคง immutable accepted ballots/score sheets, anonymous/secret identity separation, private files และ Phase 1–4 regression ทั้งหมด ใช้ฐานข้อมูลทดสอบแบบ guarded disposable เท่านั้น ทดสอบ authenticated user/juror/admin desktop/mobile, concurrency, reconciliation และ zero-residue cleanup รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ทั้งหมด ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานผล ขอบเขตไฟล์ และคำสั่งสำหรับ Phase 6
