# Safety Vote Phase 3 — Survey, Feedback, Nomination and Submission

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Runtime/schema contract: `2026-10-08-safety-vote-phase3-r1`
Decision: `PHASE_3_LOCAL_PASS — READY_FOR_PHASE_4_AUTHORIZATION — HOLD_FOR_PRODUCTION`

## Scope delivered

- Additive, idempotent migration extends questions, options, typed ballot answers and private-file associations; creates `SafetyVote_Submissions` and `SafetyVote_Nominations` with indexed owner/review paths.
- Rollback is data-preserving: it only sets `module_enabled=0`; it does not drop tables, columns, answers, submissions, nominations or files.
- Node/PHP question engines support all 15 contracted types: choice, yes/no/abstain, rating, Likert, ranking, matrix, allocation/token, short/long text, date/time, employee/organization picker and file upload.
- Conditional display supports `equals`, `not_equals`, `includes`, `not_includes`, `answered` and `not_answered`; conditions may reference only an earlier question.
- Anonymous surveys persist no `SafetyVote_BallotIdentities` row. Secret/anonymous combinations that could identify a respondent are rejected. Free text is encrypted at rest with interoperable AES-256-GCM and normal exports remain aggregate-only; restricted text requires an explicit privileged export request and carries a privacy classification.
- Accepted ballots and answers remain immutable. Submission, nomination and review APIs cannot update ballot rows.
- Submissions enforce owner-only Draft editing/private uploads and the lifecycle Draft → Submitted → Reviewed/Finalist/Rejected/Withdrawn with optimistic row version checks.
- Nominations validate the nominee against central Employee Master Data, require nominee-only consent, prevent duplicate nomination pairs, and provide audited Admin review/finalist transitions.
- Answer and submission files remain in private storage. Ballot submission revalidates file status, campaign/version, uploader ownership and exact question association.
- User and Admin UX covers survey controls/conditions, submission and nomination forms, consent inbox, 15-type builder and review queues at desktop and mobile widths.

## Schema and safety behavior

The runtime never performs DDL. Schema health requires all 20 Safety Vote tables and exact version `2026-10-08-phase3-r1`; otherwise Node and PHP return fail-closed `SAFETY_VOTE_SCHEMA_NOT_READY` behavior. Phase 3 was exercised only on guarded, loopback, disposable databases whose names match the test allowlist. Both test databases were dropped after every lifecycle.

The pre-implementation inspection used the existing read-only schema inspector against the local development schema. It found no pre-existing Safety Vote tables and made no mutation. Production was never contacted.

## Verification

- `npm run verify:safety-vote-phase3`: PASS.
- Node/PHP deterministic parity: PASS for 15 types, conditional branches, privacy blocks, AES-GCM interoperability and accepted-ballot immutability.
- Migration: PASS twice on the same disposable schema; 20-table health and data-preserving rollback verified.
- Phase 2 regression: PASS for builder, freeze/hash, lifecycle, idempotency, concurrency, exact ballot/result reconciliation, export, private image delivery and desktop/390 px browser flow.
- Phase 3 Node/PHP authenticated lifecycle: PASS for anonymous identity separation, encrypted free text, aggregate/restricted export, owner denial, submission review/finalist, nominee-only consent and nomination review/finalist.
- Phase 3 browser UAT: PASS for authenticated User and Admin surfaces at 1366×768 and 390×844; no horizontal overflow, minimum 44 px controls, all 15 builder types and visible review workflow. Evidence: `backups/local/safety-vote-phase3-browser-1791432347673/`.
- PHP lint, Node syntax and `git diff --check`: PASS (line-ending notices only).
- Permission audit recognizes every Safety Vote mutation as inline guarded. Its only two `UNREVIEWED` findings are pre-existing FourM routes outside this scope.

No Production connection, deployment, commit or push occurred. Existing working-tree changes, including `backend/scripts/patrol-checkin-v2.test.js`, were preserved.

## Phase 4 authorization command

Use this exact instruction next:

> เริ่ม Safety Vote Phase 4 — Jury, Scoring and Multi-stage ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 3 โดยให้ตรวจ Phase 3 diff และ schema แบบ read-only ก่อน จากนั้นสร้าง additive migration และ data-preserving rollback สำหรับ Scoring Criteria, Jury Assignments, Score Sheets, Conflict/Recusal, Stage Advancement และ Result Certification; ทำ Node/PHP parity สำหรับ weighted/hybrid scoring, ranking/allocation, blind judging, jury assignment และ conflict-of-interest/recusal, quorum/threshold/tie rules, multi-stage shortlist/final advancement, immutable submitted score sheets, Admin monitoring/audit และ user/juror/admin UX ทั้ง desktop/mobile โดยคง immutable accepted ballots, anonymous identity separation, private files และ Phase 1–3 regression ทั้งหมด ใช้ฐานข้อมูลทดสอบแบบ guarded disposable เท่านั้น รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ทั้งหมด ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานผล ขอบเขตไฟล์ และคำสั่งสำหรับ Phase 5
