# Safety Vote Phase 7 — Integrations, Governance and Release Candidate

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Runtime/schema contract: `2026-10-08-safety-vote-phase7-r1`
Decision: `LOCAL_RC_ENGINEERING_PASS — SUPERSEDED_BY_PHASE_8.1_SHE_GOVERNANCE — HOLD_FOR_PRODUCTION_ENGINEERING_PREFLIGHT`

> Superseded governance note: Phase 8.1 replaces the fixed six-area acceptance list with audited SHE internal approval. See `docs/safety-vote-phase8.1-she-governance-amendment.md`. Other Phase 7 engineering evidence remains valid.

## Preflight performed read-only

- Reviewed Phase 6 working-tree scope, schema contract, threat model, permission matrix and release blockers.
- Real Local/UAT MariaDB 10.4.32 schema inspection used a read-only transaction and found no Safety Vote tables; Production was not contacted.
- Confirmed the privacy boundary is application-level separation, not cryptographic anonymity against DB/server operators, timing, backups or infrastructure logs.
- Permission audit retains two pre-existing unrelated FourM findings and no Safety Vote `UNREVIEWED` route.

## Delivered scope

- Additive/idempotent Phase 7 schema reaches 39 Safety Vote tables. New tables hold integration snapshots, explicitly confirmed handoffs, acceptance evidence and operational alerts only.
- Data-preserving rollback disables Phase 7 integrations while retaining every snapshot, handoff receipt, acceptance record and alert.
- Node/PHP adapter parity covers System Control/HR read-only projections; calendar, notification and cross-module capability catalog; certified aggregate handoff; canonical hashes; acceptance/preflight decisions; and privacy-safe metadata.
- Adapters for Committee, Hiyari, KY, BBS, Patrol, Training, Policy, Dashboard and Johnny default to read-only. Johnny cannot vote, certify or read hidden results.
- Certified-result handoff requires a dual-certified result, zero identity mappings, verified private report SHA-256, matching preview hash and exact typed confirmation. Fixture mode records a local receipt and sends nothing externally.
- Verification endpoints reconcile frozen eligibility RowsHash, active certification hash and report file SHA-256 without exposing voter choices.
- Governance APIs provide signed-evidence recording, observability and a fail-closed release preflight. The current source deliberately fails `immutable_source`, so the decision remains HOLD.
- Admin Release Candidate Control UI exposes verification, missing acceptance, observability, handoff preview and exact confirmation on desktop/mobile.

## Verification evidence

- Node/PHP parity: PASS.
- Guarded migration twice: PASS, 39 tables.
- Phase 1–6 full regression: PASS through `npm run verify:safety-vote-phase7`.
- Node/PHP authenticated integration lifecycle: PASS; wrong confirmation fails, duplicate handoff fails, no external delivery.
- Backup/restore rehearsal: PASS with table/evidence count and dump SHA-256 comparison; temporary dump and both guarded databases are removed.
- Performance: 10,000 deterministic handoff previews within the 5-second gate.
- Authenticated Admin desktop 1366×768 and mobile 390×844: PASS, no horizontal overflow and ≥44 px controls.
- Evidence: `backups/local/safety-vote-phase7-gates-1791448989923/` and `backups/local/safety-vote-phase7-browser-1791448992549/`.

## Local release-candidate scope

- Runtime: Phase 7 Node/PHP routes and services, server/API mounts, schema-health compatibility and Admin governance UI.
- Database: additive migration and data-preserving rollback only.
- Verification: parity, migration, authenticated Node/PHP lifecycle, backup/restore, privacy/performance and browser gates.
- Governance: election runbook, acceptance evidence template and this preflight report.
- Phase 1–6 files remain part of the uncommitted local chain. Unrelated dirty files, including `backend/scripts/patrol-checkin-v2.test.js`, are excluded and preserved.

## Unresolved blockers

- Superseded: the original six-area acceptance requirement is replaced by authenticated `she_owner` acceptance per campaign.
- Independent privacy/security assessment is absent.
- The working tree is dirty and there is no immutable scoped commit or checksum manifest.
- Production configuration, PHP capabilities, schema/drift, database privileges, clock, transport providers, private-file permissions and scoped backup are uninspected.
- No Production backup/download-back or rollback rehearsal has occurred.
- Calendar/notification/cross-module adapters are fixture/read-only only; no real provider is configured.
- Two unrelated FourM mutation routes remain `UNREVIEWED` in the repository-wide permission audit.
- No cryptographic mixnet, separated encryption key custody, coercion resistance or independent ballot service is provided.

## Rollback plan

1. Do not delete Phase 7 tables or evidence.
2. Apply the Phase 7 data-preserving rollback to set `phase7_integrations_enabled=0`.
3. Restore only checksum-verified prior runtime files from a scoped backup.
4. Retain immutable ballots, score sheets, result snapshots, certifications, reports, private files and audit logs.
5. Verify normal Safety Vote result visibility still fails closed and confirm zero temporary helper/dump/report residue.

No Production connection, deployment, commit or push occurred.

## Separate Production preflight authorization command

> เริ่ม Safety Vote Phase 8 — Production Preflight and Release Gate ตาม Contract `2026-10-08-safety-vote-phase0-r1` และผล Phase 7 โดยให้ตรวจ working tree และสร้าง scoped candidate manifest/hashes แบบ read-only ก่อน ห้ามรวมไฟล์ dirty ที่ไม่เกี่ยวข้อง และให้คงสถานะ HOLD หากยังไม่มี HR/Legal/business-owner/Privacy/Security/Operations acceptance ที่ลงนาม; หลังยืนยัน Production target ที่ถูกต้องแล้วจึงตรวจ PHP capabilities, value-suppressed configuration, schema/version, permissions, database privileges, clock/time zone, private storage, provider configuration และ exact remote drift แบบ read-only พร้อมทำ narrow verified backup ของ Safety Vote tables/settings/private files และ download-back SHA-256 โดยห้ามสร้าง voter-to-choice mapping ห้ามอ่านหรือ export ตัวเลือกของผู้ลงคะแนน ห้ามรัน migration ห้ามเปลี่ยน configuration/business data ห้าม deploy ห้าม commit และห้าม push; authenticated smoke ต้องเป็น non-mutating และห้าม bypass authentication เมื่อเสร็จให้รายงาน GO/HOLD, immutable release scope, verified backup/rollback readiness, unresolved blockers และคำสั่ง deployment แยกต่างหากซึ่งต้องได้รับอนุญาตใหม่
