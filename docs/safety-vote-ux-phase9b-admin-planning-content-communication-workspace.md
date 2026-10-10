# Safety Vote UX/UI Phase 9B — Admin Planning, Content and Communication Workspace

วันที่: 2026-10-10 (Asia/Bangkok)

สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE9C`

Authoritative local baseline: `main` / `728cecf8ae63a58a2868e679ef156ed75c9c8f7d`

## Preflight และขอบเขต

ตรวจ Phase 9A diff, Node/PHP route parity, campaign lifecycle/capability, private asset ownership, notification adapter และ rollback แบบ read-only ก่อนแก้ Runtime แล้ว บันทึก allowed scope ที่ `docs/safety-vote-ux-phase9b-preflight-scope.md`

- `safetyVoteUxV1` คงตาม baseline
- `safetyVoteEngagementV1=false` และ `engagement_enabled=0` ยังคงเป็นค่าเริ่มต้น
- `module_enabled` ยังคง fail-closed ก่อน engagement/planning endpoints
- ใช้ `SAFETY_VOTE_MANAGE`, campaign/version, frozen eligibility, private file delivery และ notification queue contract เดิม
- ไม่แก้ ballot immutability, privacy, eligibility freeze, jury scoring, certification, result calculation, schema/version ownership หรือ dispatcher
- ไม่เชื่อม Production, ไม่ deploy, ไม่ commit และไม่ push

## สิ่งที่ทำ

- Planning calendar พร้อมกรองเดือน/สถานะ และมุมมองส่วนตัวสูงสุด 20 รายการต่อ Admin
- reusable campaign template และ config-only duplication เป็น Draft ใหม่พร้อมรหัสใหม่ โดยตัด private files/media, frozen eligibility, employee-specific rules, participation, ballot, answer, jury, result, certification และ notification history
- private promotion asset library เฉพาะ campaign/current version เดียวกัน พร้อม MIME/signature validation, ownership guard และบังคับ alt text ก่อนแนบกับป้าย
- preview จาก configuration จริงในมุม User/Juror โดยไม่สวมสิทธิ์และไม่สร้าง participation/assignment
- share link และ QR ที่ไม่มี token/PII; ผู้รับยังต้อง login และผ่าน frozen eligibility เดิม
- notification composer แสดง aggregate audience/channel readiness, duplicate hint, schedule และ quiet-hours 21:00–07:00 พร้อม typed confirmation; ขั้นสุดท้ายเรียก queue API เดิมและไม่เรียก dispatcher
- responsive/focus/touch presentation สำหรับ mobile, tablet และ full-width desktop พร้อม loading/error/empty/denied/disabled states

## API และ schema

Node/PHP parity:

- `GET /safety-vote/admin/planning/overview`
- `POST /safety-vote/admin/planning/saved-views`
- `DELETE /safety-vote/admin/planning/saved-views/:id`
- `GET /safety-vote/admin/planning/campaigns/:id/config-copy`
- `POST /safety-vote/admin/planning/templates/from-campaign/:id`
- `GET /safety-vote/admin/planning/templates/:id`
- `POST /safety-vote/admin/planning/templates/:id/archive`
- `GET|POST /safety-vote/admin/planning/campaigns/:id/assets`
- `POST /safety-vote/admin/planning/promotions/:promotionId/assets/:fileId`
- `POST /safety-vote/admin/planning/notifications/preview`

Additive tables:

- `SafetyVote_AdminSavedViews`
- `SafetyVote_CampaignTemplates`

Rollback ปิด `engagement_enabled=0` และรักษาตาราง/ข้อมูลทั้งหมด ไม่มี `DROP` หรือ `DELETE`

## ไฟล์ Phase 9B

Runtime/API/schema:

- `backend/migrations/20261010_safety_vote_ux_phase9b_planning_content_communication.sql`
- `backend/migrations/20261010_safety_vote_ux_phase9b_planning_content_communication.rollback.sql`
- `backend/services/safety-vote-planning.js`
- `backend/routes/safety-vote-planning.js`
- `api/lib/safety_vote_planning.php`
- `api/handlers/safety_vote_planning.php`
- `backend/server.js`, `api/index.php` และ Node/PHP fixture routers

Presentation:

- `public/js/pages/admin-safety-vote-planning.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/main.js`
- `public/js/pages/admin.js`
- `public/style.css`
- `index.html`

Verification/documentation:

- `api/tests/safety_vote_planning_contract_test.php`
- `backend/scripts/safety-vote-ux-phase9b-static.test.js`
- `backend/scripts/safety-vote-ux-phase9b-migration.test.js`
- `backend/scripts/safety-vote-ux-phase9b-api-uat.js`
- `backend/scripts/safety-vote-ux-phase9b-browser-uat.js`
- root/backend package scripts, `docs/safety-vote-ux-phase9b-preflight-scope.md`, `AGENTS.md` และเอกสารนี้

## ผลทดสอบ

- JavaScript syntax, PHP lint และ `git diff --check`: PASS
- Phase 9B static/unit/Node-PHP contract: PASS — 44 assertions
- PHP planning contract: PASS — 3 assertions
- additive/idempotent migration + data-preserving rollback: PASS — 44 Safety Vote tables, default OFF
- authenticated Node/PHP API lifecycle: PASS
  - saved-view owner scope, config-only template/checksum/archive
  - private asset ownership/current-version/alt-text guard
  - aggregate audience preview, quiet-hours และ explicit queue step
  - queue rowsไม่ถูก dispatch และ external delivery = false
  - permission denial และ engagement-disabled isolation จาก core routes
  - ballots/answers/jury scores/certifications = 0
- regression: PASS
  - Phase 9A = 29 assertions
  - UX Phase 8 = 48 assertions
  - Phase 10.4 = 26 assertions
  - Phase 8.3.1 module-disabled Node/PHP parity
- authenticated Browser UAT: PASS — Admin planning + User share-link รวม 10 combinations ที่ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`
  - horizontal overflow = 0
  - visible/clickable target ต่ำกว่า 44×44 px = 0
  - console/runtime error = 0
  - keyboard focus และ screen-reader semantics = PASS
  - User/Juror role preview = PASS
  - permission denied, engagement disabled และ module disabled = fail-closed PASS
  - fixture saved views/templates/notifications และ protected business rows = 0

Accepted evidence:

- Browser: `backups/local/safety-vote-ux-phase9b-1791607128108/`, result SHA-256 `f56806011b8b8644a94a6b4fb18c9c5bdf39ad26289c440b3d6120fe0be5684d`
- API: `backups/local/safety-vote-ux-phase9b-api-1791606995261/`, result SHA-256 `1b6fdc6eb8cd8a248da1f06b5d9faa0eca24ec313f4c20ed2a8d740ed94f1653`

Disposable database, private fixture image และ rejected-run evidence residue หลัง cleanup = 0

## ข้อจำกัด

- Notification composer สร้างคิวเท่านั้น การ dispatch จริงยังอยู่ภายใต้ adapter/feature gate และ release process เดิม และไม่ได้ทดสอบการส่งภายนอกใน Phase นี้
- QR ใช้ `qrcode-generator` ที่มีอยู่ใน shell; หาก library โหลดไม่ได้ UI แสดงลิงก์สำหรับคัดลอกแทน
- แม่แบบจงใจไม่คัดลอก private media และ eligibility แบบรายบุคคล Admin ต้องเพิ่มไฟล์และตรวจ/freeze eligibility ใหม่ทุกครั้ง
- การสร้าง Draft จาก template ใช้ create/builder/rules APIs เดิมตามลำดับ หากขั้นหลังล้มเหลว Draft ที่สร้างแล้วจะถูกเก็บและแจ้งให้ Admin ตรวจใน Wizard แทนการลบหรือ rollback โดยคาดเดา

## คำสั่ง Phase ถัดไป

```text
เริ่ม Safety Vote UX/UI Phase 9C — Engagement Analytics, Delivery Governance and Campaign Optimization ต่อจาก docs/safety-vote-ux-phase9b-admin-planning-content-communication-workspace.md โดยคง safetyVoteUxV1 ตาม baseline และคง safetyVoteEngagementV1 กับ engagement_enabled default OFF รวมทั้ง module_enabled fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 9B diff, existing privacy-safe aggregate/report APIs, notification queue/dispatch ownership, retry/suppression/audit contract, campaign lifecycle/capability, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged engagement dashboard ที่แสดง aggregate reach/participation/conversion ตาม privacy threshold, campaign comparison, content/CTA performance แบบไม่ระบุตัวบุคคล, notification queue/delivery governance, failed/suppressed review, schedule conflict warnings และ actionable optimization recommendations พร้อม export เฉพาะ aggregate ที่ได้รับอนุญาต โดยใช้ API/capability/schema เดิมหรือ additive engagement schema เท่านั้น ห้ามเปิดเผย voter-to-choice, response identity, blind identity หรือข้อมูลต่ำกว่า privacy threshold ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification หรือ result calculation และห้ามส่ง notification ภายนอกระหว่าง fixture UAT ให้ทดสอบ static/unit/regression, Node/PHP parity และ authenticated Browser UAT ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ตรวจ no horizontal overflow, 44px touch targets, keyboard/focus/screen-reader semantics, permission denial, module/engagement disabled และ zero disposable residue ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผลทดสอบ หลักฐาน ข้อจำกัด และคำสั่ง Phase ถัดไป
```
