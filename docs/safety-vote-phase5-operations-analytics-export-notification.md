# Safety Vote Phase 5 — Operations, Analytics, Export and Notification

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Runtime/schema contract: `2026-10-08-safety-vote-phase5-r1`
Decision: `PHASE_5_LOCAL_PASS — READY_FOR_PHASE_6_AUTHORIZATION — HOLD_FOR_PRODUCTION`

## Delivered

- Additive/idempotent schema adds `SafetyVote_Reports`, `SafetyVote_ExportJobs`, `SafetyVote_Notifications` and `SafetyVote_NotificationDeliveries`; schema health now requires 31 Safety Vote tables and `2026-10-08-phase5-r1`.
- Data-preserving rollback only disables the module. It retains reports, jobs, notification history, deliveries, ballots, scores, snapshots and private files.
- Node/PHP share deterministic privacy suppression, participation funnel/reconciliation, Asia/Bangkok scheduling decisions, notification suppression keys, protected-metadata filtering, report models/hashes and retention dry-run plans.
- Operations Center shows campaign schedule, eligible/started/submitted/accepted funnel, reconciliation, bounded audit timeline, export and notification status.
- Secret Ballot choice-by-organization analytics fail closed. Confidential/anonymous small groups return suppressed values from the server; the client never receives the hidden count.
- Explicit schedule processing opens/closes due campaigns using Asia/Bangkok comparison. No scheduler or retention mutation runs at request startup.
- Notification preview accepts only `eligible` or `nonparticipants`. Queueing uses unique SHA-256 suppression keys; concurrent duplicate queue requests produce one logical notification per recipient/window. Metadata uses an allowlist and excludes answer/choice/free-text/secret identifiers.
- Delivery logs support attempt counts, bounded errors and retry. Dispatch is fail-closed unless an explicit transport adapter is configured. Local UAT uses `SAFETY_VOTE_NOTIFICATION_TRANSPORT=fixture`; no email or external notification is sent.
- Aggregate Excel-compatible and PDF exports, plus certified reports, are generated server-side from immutable result snapshots. Every report has a stable report ID, result-hash snapshot and content SHA-256. Download re-hashes the private file and fails closed on mismatch.
- Audit retrieval is campaign-scoped and permission-controlled. Retention is read-only through API preview and `retention:safety-vote-phase5:dry-run`; `--apply` is deliberately rejected.

## Verification

- Real local schema inspection ran in a read-only transaction before implementation and found no Safety Vote tables. Production was not contacted.
- Phase 5 migration runs twice on a guarded disposable database: 31 tables, exact schema version and data-preserving rollback pass.
- Node/PHP deterministic parity passes privacy, funnel, scheduling, suppression, safe metadata, report hashing and retention planning.
- Authenticated Node/PHP lifecycle passes operations dashboard, Secret dimension denial, concurrent notification duplicate suppression, fixture delivery success/failure/retry, aggregate Excel/PDF, certified PDF, file SHA-256 verification, scoped audit, scheduled open/close and dry-run retention.
- Phase 1–4 regressions pass, including accepted-ballot and jury-score concurrency, immutable ballots/sheets, anonymous identity separation and private files.
- Authenticated User/Admin Browser UAT passes at 1366×768 and 390×844, including the private user notification inbox, with no horizontal overflow and minimum 44 px controls. Latest evidence: `backups/local/safety-vote-phase5-browser-1791436148768/`.
- Generated report files and guarded disposable databases are removed by test cleanup; residue is zero.
- Node syntax, PHP lint and whitespace verification pass. Permission audit retains only two pre-existing unrelated FourM findings.

No Production connection, deployment, commit or push occurred. Existing dirty work, including `backend/scripts/patrol-checkin-v2.test.js`, was preserved.

## Phase 6 authorization command

> เริ่ม Safety Vote Phase 6 — Certified Secret Election ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 5 โดยให้ตรวจ Phase 5 diff, threat model และ schema แบบ read-only ก่อน จากนั้นสร้างเฉพาะ additive migration และ data-preserving rollback ที่พิสูจน์ว่าจำเป็นสำหรับ Secret Election hardening; ทำ Node/PHP parity สำหรับ multi-position/seat election, abstain, strict eligibility/version freeze, anonymous participation-to-ballot separation, receipt ที่ยืนยันการรับแต่ย้อนหาตัวเลือกไม่ได้, deterministic recount/reconciliation, tie/void/recount workflow, dual certification และ revocation, certified report/hash verification, no-result-before-close/certification และ privacy-safe audit โดยเพิ่ม concurrency/load/privacy adversarial tests, authenticated desktop/mobile UAT และเอกสาร HR/Legal/business-owner acceptance checklist ทั้งหมดบน guarded disposable database เท่านั้น คง immutable ballots/score sheets, private files, operations/export/notification controls และ Phase 1–5 regression ทั้งหมด รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานผล ขอบเขตไฟล์ release blockers และคำสั่งสำหรับ Phase 7
