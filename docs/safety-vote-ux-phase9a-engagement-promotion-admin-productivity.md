# Safety Vote UX/UI Phase 9A — Engagement, Promotion and Admin Productivity

วันที่: 2026-10-10 (Asia/Bangkok)

สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE9B`

Authoritative local baseline: `main` / `728cecf8ae63a58a2868e679ef156ed75c9c8f7d`

## ขอบเขตและข้อสรุปก่อนแก้ Runtime

ตรวจแบบ read-only แล้วว่า Safety Vote เดิมยังใช้ API, capability, schema ownership และ business rules ของ Phase 1–10.4 เป็นแหล่งจริง ฝั่ง Node และ PHP มี module gate กลางแบบ fail-closed และ `safetyVoteUxV1` เป็น presentation shell เดิม งาน Phase 9A จึงเพิ่มเฉพาะ engagement layer แยกจาก Voting Engine โดยมี feature gate สองชั้น:

- client `safetyVoteEngagementV1` ค่าเริ่มต้น `false`
- server setting `engagement_enabled` ค่าเริ่มต้น `0`
- `module_enabled=0` ยังปิด Safety Vote ทั้งโมดูลก่อนถึง engagement gate
- ปิด `engagement_enabled` แล้ว endpoint เดิม เช่น `/me/campaigns` ยังทำงานตาม contract เดิม ไม่ถูกปิดตาม

ไม่แก้ ballot immutability, privacy, eligibility freeze, jury scoring, certification, result calculation หรือ campaign lifecycle เดิม และไม่เชื่อมต่อ Production

## สิ่งที่เพิ่ม

### Admin

- Admin Action Center รวมงานที่ต้องตรวจ แคมเปญใกล้เปิด/ใกล้ปิด ผลที่ต้องเตรียม และ notification ที่ส่งไม่สำเร็จ โดยคืนเฉพาะข้อมูลสรุปที่ไม่เปิดเผยคำตอบ ตัวเลือก คะแนน หรือผู้ลงคะแนน
- เครื่องมือสร้างและจัดการป้ายประชาสัมพันธ์ผูกกับแคมเปญจริง รองรับ Draft/Published/Archived, ช่วงเวลาแสดง, ลำดับ, CTA, ภาพ Desktop/Mobile และ alt text
- ใช้ optimistic row version ป้องกันการเขียนทับ พร้อม private authenticated image delivery ผ่าน file contract เดิม
- UI responsive: desktop split workspace, tablet/mobile stacked form และ action controls ขนาดอย่างน้อย 44 px

### User

- Featured activity banner แบบควบคุมด้วยปุ่มก่อนหน้า/ถัดไป ไม่มี autoplay
- “สิ่งที่คุณต้องทำ” สรุปกิจกรรมที่เข้าร่วมได้/ส่งแล้ว/สิ้นสุดแล้ว
- campaign card ที่มีภาพหรือ fallback, สถานะ, campaign type, เวลาประมาณการและสัญญาณใกล้ปิด
- campaign introduction แสดงผู้จัด ช่วงเวลา กติกา และบริบทก่อนเข้าร่วม
- Notification Center พร้อมอ่านทีละรายการและอ่านทั้งหมด โดยสถานะการอ่านเป็นของผู้ใช้แต่ละคน
- promotion แสดงเฉพาะผู้ใช้ที่อยู่ใน frozen eligibility snapshot ของแคมเปญนั้น และเฉพาะช่วงเวลาที่เผยแพร่

## API และ schema ที่เพิ่ม

Node/PHP parity:

- `GET /safety-vote/admin/engagement/action-center`
- `GET|POST /safety-vote/admin/promotions`
- `PUT /safety-vote/admin/promotions/:id`
- `POST /safety-vote/admin/promotions/:id/assets/:slot`
- `GET /safety-vote/me/promotions`
- `GET /safety-vote/notification-center`
- `POST /safety-vote/notification-center/:id/read`
- `POST /safety-vote/notification-center/read-all`

Additive tables:

- `SafetyVote_Promotions`
- `SafetyVote_NotificationReads`

Rollback เป็นแบบรักษาข้อมูล: ปิด `engagement_enabled=0` โดยไม่ DROP/DELETE ตารางหรือข้อมูล

## ไฟล์ที่แก้

Runtime และ contract:

- `backend/migrations/20261010_safety_vote_ux_phase9a_engagement.sql`
- `backend/migrations/20261010_safety_vote_ux_phase9a_engagement.rollback.sql`
- `backend/services/safety-vote-engagement.js`
- `backend/routes/safety-vote-engagement.js`
- `backend/server.js`
- `api/lib/safety_vote_engagement.php`
- `api/handlers/safety_vote_engagement.php`
- `api/index.php`

Presentation:

- `index.html`
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/main.js`
- `public/js/pages/admin.js`
- `public/style.css`

Verification/documentation:

- `api/tests/safety_vote_engagement_contract_test.php`
- `backend/scripts/safety-vote-ux-phase9a-static.test.js`
- `backend/scripts/safety-vote-ux-phase9a-migration.test.js`
- `backend/scripts/safety-vote-ux-phase9a-api-uat.js`
- `backend/scripts/safety-vote-ux-phase9a-browser-uat.js`
- fixture Node/PHP hosts, root/backend package scripts, `package-lock.json`, Playwright test dependency, `AGENTS.md` และเอกสารนี้

## ผลทดสอบ

- JavaScript syntax และ PHP lint: PASS
- `git diff --check`: PASS
- Phase 9A static/unit/Node-PHP contract: PASS — 29 assertions
- PHP engagement contract: PASS — 3 assertions
- additive/idempotent migration and data-preserving rollback: PASS — 42 Safety Vote tables in disposable database
- authenticated Node/PHP API lifecycle: PASS
  - Admin create/publish/list/action-center
  - private promotion image
  - permission denial
  - frozen-eligibility filtering
  - notification read state
  - engagement-disabled isolation from core routes
  - ballots/answers/certifications = 0
- regression: PASS
  - UX Phase 8 = 48 assertions
  - Safety Vote Phase 10.4 = 26 assertions
  - Phase 8.3.1 module-disabled Node/PHP parity
- authenticated Browser UAT: PASS สำหรับ Admin และ User รวม 10 combinations ที่ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`
  - horizontal overflow = 0
  - visible target ต่ำกว่า 44×44 px = 0
  - console error = 0
  - protected business-row mutation = 0

Accepted evidence: `backups/local/safety-vote-ux-phase9a-1791604898562/`

Recorded `resultSha256` in `result.json`: `1273d76170da52a059690ff15e9fe8af40d25e61cf9da1d966c1723b42feb219`

Disposable database, test promotion image และ failed-run evidence residue หลัง cleanup = 0

## ข้อจำกัดและสถานะการปล่อยใช้งาน

- Phase 9A ยังปิดโดยค่าเริ่มต้นทั้ง client และ server จึงไม่ปรากฏใน Local/Production จนกว่าจะ apply migration และเปิดสอง flag โดยได้รับอนุญาต
- Browser UAT ใช้ guarded local Node fixture; PHP parity ตรวจด้วย authenticated API lifecycle แยกต่างหาก
- Browser harness บันทึก Playwright เป็น dev dependency และเครื่องทดสอบใหม่ต้องติดตั้ง Chromium ด้วย `npx playwright install chromium`
- ยังไม่มี notification composer, calendar, saved view, asset library หรือ campaign duplication; เก็บไว้สำหรับ Phase 9B
- source ยัง uncommitted และไม่ใช่ immutable release artifact

ไม่มี Production connection, external delivery, deploy, commit หรือ push ใน Phase นี้

## คำสั่งเริ่ม UX/UI Phase 9B

```text
เริ่ม Safety Vote UX/UI Phase 9B — Admin Planning, Content and Communication Workspace ต่อจาก docs/safety-vote-ux-phase9a-engagement-promotion-admin-productivity.md โดยคง safetyVoteUxV1 ตาม baseline และคง safetyVoteEngagementV1 กับ engagement_enabled default OFF รวมทั้ง module_enabled fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 9A diff, Node/PHP parity, campaign lifecycle/capability, private asset ownership, notification adapter และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged campaign calendar, saved views, reusable campaign templates/config-only duplication, promotion asset library, preview as User/Juror, share link/QR และ notification composer ที่มี audience preview, schedule, quiet-hours, delivery preview และ explicit confirmation โดยใช้ API/capability/schema เดิมหรือ additive engagement schema เท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification, result calculation หรือส่ง notification ภายนอกระหว่าง fixture UAT ให้ทดสอบ static/unit/regression, Node/PHP parity และ authenticated Browser UAT ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ตรวจ no horizontal overflow, 44px touch targets, keyboard/focus/screen-reader semantics, permission denial, module/engagement disabled และ zero disposable residue ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผลทดสอบ หลักฐาน ข้อจำกัด และคำสั่ง Phase ถัดไป
```
