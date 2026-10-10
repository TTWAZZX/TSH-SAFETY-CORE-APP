# Safety Vote Admin UX Improvement Phase 3 — Review Queue, Ownership and Governance Timeline

วันที่ตรวจรับ Local: 2026-10-10

สถานะ: `PASS_LOCAL_UAT_NO_PRODUCTION_CHANGE`

## ขอบเขตที่ดำเนินการ

- ตรวจ cumulative Phase 1–2 diff และยืนยัน authoritative contracts แบบ read-only ก่อนแก้ Runtime
- เพิ่ม workspace แยก “ตรวจทานและกำกับ” ภายใต้ client gate `safetyVoteEngagementV1` และ server gate `engagement_enabled`; `module_enabled` ยังคง fail-closed แยกอิสระ
- เพิ่ม review queue แบบ derived-only จากสถานะ Campaign, owner, จำนวนคำถาม, eligibility rules และ schedule โดยไม่สร้าง approval state ใหม่
- แสดง Owner จาก `SafetyVote_Campaigns.OwnerEmployeeID` และ assignees จาก `SafetyVote_CampaignRoles`
- เพิ่ม readiness blocker drill-down ซึ่งระบุ `authoritative=false`; การเปิด Campaign ยังต้องผ่าน readiness contract เดิม
- สรุป schedule conflict ของ notification plans ช่องทางเดียวกันภายใน 30 นาที โดยไม่มีการเรียก external dispatch
- แสดง governance timeline จาก `SafetyVote_AuditLogs` เดิม และกรอง Ballot/Answer/Response/Voter/Receipt/Jury Score/Candidate domains ออกจาก response
- บันทึก review note แบบ bounded 800 ตัวอักษรลง Audit เดิม พร้อม category และ privacy class; reject sensitive keys/phrases ที่สื่อถึงข้อมูลลงคะแนนรายบุคคล
- เพิ่ม contextual actions ไปยัง Draft editor, Operations, Promotion และ Planning workspace
- เพิ่ม responsive detail drawer สำหรับ desktop/tablet/mobile พร้อม focus target และปุ่มกลับศูนย์จัดการ

ไม่มี migration หรือ schema ใหม่ และไม่มีการเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification หรือ result calculation

## API/Parity

- `GET /admin/planning/review-queue`
- `GET /admin/planning/campaigns/:id/governance`
- `POST /admin/planning/campaigns/:id/review-notes`

ทั้ง Node และ PHP ใช้ permission `SAFETY_VOTE_MANAGE` และ `SAFETY_VOTE_AUDIT_VIEW`, planning/engagement gate เดิม และ response contract `2026-10-10-safety-vote-admin-review-r1` พร้อม `approvalState=false` และ `containsBallotData=false`

## ไฟล์ Phase 3

- `backend/services/safety-vote-planning.js`
- `api/lib/safety_vote_planning.php`
- `backend/routes/safety-vote-planning.js`
- `api/handlers/safety_vote_planning.php`
- `public/js/pages/admin-safety-vote-review.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js`
- `public/style.css`
- `index.html`
- `backend/package.json`
- `backend/scripts/safety-vote-admin-review-governance-static.test.js`
- `backend/scripts/safety-vote-admin-review-governance-browser-uat.js`

ไฟล์ที่เป็น cumulative Phase 1–2 ใน worktree ถูกเก็บไว้ทั้งหมดและไม่ได้ย้อนทับ

## ผลทดสอบ

- Phase 3 static/Node-PHP pure contract parity: PASS 27 assertions
- Phase 3 authenticated Node/PHP route parity และ Local Browser UAT: PASS 5 Admin viewports
  - 390×844
  - 430×932
  - 768×1024
  - 1366×768
  - 1920×1080
- ทุก viewport: horizontal overflow = 0, visible target ต่ำกว่า 44px = 0, console error = 0
- Review-note Audit lifecycle และ sensitive-note rejection: PASS
- Permission denied, `module_enabled=0`, `engagement_enabled=0`: PASS fail-closed
- Protected rows: Ballots 0, Answers 0, Jury Scores 0, Certifications 0, Notification Deliveries 0
- Existing Phase 1 simplification: PASS 20 assertions
- Existing Phase 2 guided Drafts: PASS 32 assertions
- UX Phase 9B static/parity: PASS 44 assertions
- UX Phase 9B guarded Node/PHP API lifecycle: PASS; queue-only, external delivery 0
- UX Phase 9C static/contract: PASS 43 assertions
- UX Phase 8 static/regression: PASS 48 assertions
- Phase 8.3.1 disabled-mode Node/PHP parity: PASS

หลักฐาน Browser UAT: `backups/local/safety-vote-admin-review-governance-1791646691109/result.json`

SHA-256 ผลลัพธ์: `2b906053d89b98a553179a3b78b6b42e32c7d5e6aa4ba18052863685ca08de4b`

Disposable database residue หลังจบ: 0

## ข้อจำกัด

- Review queue เป็นการจัดลำดับแบบ derived-only ไม่ใช่ workflow อนุมัติ
- Readiness ใน queue เป็นตัวช่วยคัดกรอง ไม่แทน authoritative readiness/open guard
- Ownership ใน Phase นี้เป็นการแสดงข้อมูลเดิม ยังไม่มีการเปลี่ยน owner หรือ assignment mutation
- Timeline จำกัด 100 รายการล่าสุดและไม่ส่ง MetadataJson เพื่อป้องกันรายละเอียดเกินขอบเขต
- ไม่ส่ง notification ภายนอก และไม่มี retry/dispatch action ใน workspace นี้

## Release boundary

- Production connection: ไม่มี
- Deploy: ไม่มี
- Commit: ไม่มี
- Push: ไม่มี

Decision: `PASS_LOCAL_UAT_READY_FOR_ADMIN_UX_PHASE4_REVIEW`
