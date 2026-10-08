# Safety Vote Phase 6 — Certified Secret Election

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Runtime/schema contract: `2026-10-08-safety-vote-phase6-r1`
Decision: `LOCAL_ENGINEERING_PASS — HOLD_FOR_INDEPENDENT_PRIVACY_AND_BUSINESS_ACCEPTANCE — HOLD_FOR_PRODUCTION`

## Delivered controls

- Additive/idempotent schema adds election positions/candidate membership, independent certifier assignments and immutable recount/void action history. Result snapshots gain parent/run-type lineage. Rollback disables the module while retaining all data.
- Multi-position/seat configuration freezes question/candidate membership, verifies that every candidate belongs to the configured position question, and freezes seat limit, maximum selections, abstain policy and deterministic tie rule while Draft.
- Secret submission rechecks Open state, exact campaign version, frozen eligibility, question/option membership, limits, prior participation and idempotency inside one transaction.
- The Secret/Anonymous submission path no longer writes the request-key hash into the ballot. Its replay fingerprint contains no answer digest. Ballot nonce/hash, participation and generic receipt are separated; zero identity rows are allowed.
- Receipt is acceptance-only (`canLocateBallot=false`). There is no receipt-to-ballot lookup route.
- Recount is allowed only after close, derives candidate and per-position abstain counts from accepted ballots on the server, blocks identity mappings and reconciliation failures, and creates a new immutable snapshot linked to the prior snapshot.
- Unresolved boundary ties block certification. Void retains ballots, snapshots, files and audit evidence.
- Two distinct assigned certifiers must bind the exact result hash. Publication fails after one certification. Revocation withdraws publication and returns the snapshot to Frozen.
- Secret result APIs return `404 RESULT_NOT_AVAILABLE` before explicit dual certification and publication. Certified reports retain report ID, result hash and verified content SHA-256.
- Audit metadata uses an allowlist and excludes Employee/Participation/Ballot/receipt/answer correlation values.

## Threat model and privacy boundary

Protected against ordinary users and application Admins:

- unauthorized/ineligible/double/concurrent voting;
- application-level voter-to-choice joins;
- live/early result inference;
- small-scope choice analytics;
- Admin ballot edits and mutable recounts;
- one-person certification, stale hash certification and report tampering.

Not claimed by this phase:

- cryptographic anonymity against database/server operators observing transaction timing, runtime memory, backups or infrastructure logs;
- coercion resistance, remote-device integrity or proof against compromised infrastructure;
- statutory/legal validity for a real คปอ. election without HR/Legal review.

For a legally sensitive election, decide whether organizational controls are sufficient or require an independent ballot service, delayed batching/mixing, separated encryption keys, infrastructure log review and an external security/privacy assessment.

## Verification

- Phase 5 diff/threat contract and real local schema were inspected read-only first. The inspected database had no Safety Vote tables; Production was not contacted.
- Guarded migration runs twice: 35 tables, exact Phase 6 version and data-preserving rollback pass.
- Node/PHP deterministic parity passes positions, seats, abstain, ties, hashes, opaque receipts, dual certification and privacy-safe audit metadata.
- Node/PHP lifecycle passes 20 simultaneous voters plus duplicate replay with exactly 20 ballots/participations, zero identity rows and zero request-key/ballot-hash joins.
- Early result, one-certifier publication and post-revocation result access fail closed.
- Deterministic recount/reconciliation, dual certification, publication, certified PDF/hash and revocation pass on both stacks.
- Authenticated User/Admin Browser UAT passes desktop and 390 px with no horizontal overflow, ≥44 px Secret Election controls and no hidden result leakage. Evidence: `backups/local/safety-vote-phase6-browser-1791442813769/`.
- Phase 1–5 regression, Node/PHP syntax/lint, permission audit and zero-residue cleanup remain release gates in `npm run verify:safety-vote-phase6`.

## HR / Legal / business-owner acceptance checklist

All items below are mandatory and currently **not signed**; therefore Production use remains blocked.

- [ ] HR confirms eligible population, positions, seat counts, abstain semantics and post-freeze exception process.
- [ ] Legal confirms election rules, notice/consent, retention, recount, tie, void, challenge and publication requirements.
- [ ] Business owner approves schedule, quorum, candidate list, tie rule, two independent certifiers and incident contacts.
- [ ] Privacy/DPO accepts the stated application-level anonymity boundary and infrastructure timestamp/log exposure.
- [ ] Independent security reviewer verifies source, deployment configuration, database privileges, logs, backup access and report verification.
- [ ] Operations performs a witnessed dry run, backup/restore test, clock/time-zone check and rollback rehearsal.
- [ ] Two named certifiers acknowledge separation of duties and revocation procedure.
- [ ] Final immutable configuration/eligibility/result-report hashes are recorded in the signed election runbook.

## Release blockers

- Independent privacy/security review is not yet recorded.
- HR, Legal and business-owner approvals are not signed.
- Production database capabilities/drift, deployment configuration, backups and rollback have not been inspected.
- Current source is a dirty local working tree and not an immutable release candidate.
- The repository-wide permission audit still reports two pre-existing unrelated FourM routes as `UNREVIEWED`; no Safety Vote route is unreviewed.
- No real notification transport, external ballot service or cryptographic mixing/key separation was authorized.

## Phase 7 authorization command

> เริ่ม Safety Vote Phase 7 — Integrations, Governance and Release Candidate ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 6 โดยให้ตรวจ Phase 6 diff, schema, privacy threat model, permission matrix และ release blockers แบบ read-only ก่อน จากนั้นทำ integration adapters แบบ read-only สำหรับ System Control/HR master, calendar/notification provider และ certified-result handoff ที่ต้องมี explicit confirmation; เพิ่ม election runbook, configuration/eligibility/result/report hash verification, backup/restore rehearsal, deployment preflight, observability/alerting, accessibility/performance/load gates และ HR/Legal/business-owner/Privacy/Security acceptance evidence โดยห้ามให้ integration ใดสร้าง voter-to-choice mapping หรือ bypass dual certification ใช้ guarded disposable database และ mock/loopback adapters เท่านั้น รักษา immutable ballots/score sheets, anonymous/secret separation, private files และ Phase 1–6 regression ทั้งหมด รักษาไฟล์ที่ผู้ใช้แก้ค้างไว้ ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงาน release candidate scope, unresolved blockers, rollback plan และคำสั่งสำหรับ Production preflight แยกต่างหาก
