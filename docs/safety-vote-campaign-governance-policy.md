# Safety Vote Campaign Governance Policy

สถานะ: Local implementation and guarded UAT passed, 2026-10-16. ยังไม่ได้ Commit, Push, Deploy หรือเชื่อมต่อ Production

## เป้าหมาย

เพิ่มวงจรจัดการแคมเปญที่แยกความหมายชัดเจนระหว่างการซ่อน การทดสอบ การเก็บถาวร การยกเลิก และการลบถาวร โดยรักษาคะแนน หลักฐาน และประวัติของแคมเปญจริงเป็นค่าเริ่มต้น

## นโยบาย

| การทำงาน | เงื่อนไข | ผลต่อผู้ใช้ | การเก็บข้อมูล |
| --- | --- | --- | --- |
| Hide | Draft, Scheduled, Open, Closed, Certified หรือ Published | ผู้ใช้ทั่วไปไม่เห็นและส่งคำตอบไม่ได้ | เก็บทุกข้อมูลเดิม |
| Unhide | แคมเปญที่ซ่อนและยังอยู่ในสถานะใช้งาน | กลับมาเห็นตามสิทธิ์และช่วงเวลา | เก็บทุกข้อมูลเดิม |
| Mark Test | Draft และไม่มี participation, ballot, submission, nomination, jury score, result/export/integration/notification/engagement business row | ซ่อนทันทีและติดป้าย TEST | เก็บ configuration ไว้ทดสอบ |
| Unmark Test | Draft/Test และยังไม่มี business row | ยกเลิกป้าย TEST แต่ยังซ่อนอยู่จน Admin สั่ง Unhide | เก็บทุกข้อมูลเดิม |
| Archive | Closed, Certified หรือ Published | ซ่อนจากผู้ใช้ | เก็บผล คะแนน หลักฐาน และสถานะก่อน Archive |
| Restore | Archived ที่มีสถานะต้นทางถูกต้อง | คืนสถานะเดิม แต่ยังซ่อนจน Admin สั่ง Unhide | เก็บทุกข้อมูลเดิม |
| Void | Draft, Scheduled, Open, Closed หรือ Certified | ยกเลิกการใช้งานและซ่อน | เก็บผลและหลักฐานทั้งหมด |
| Purge | ต้องเป็น Test + Voided + ไม่มี business row + ไม่มีไฟล์ และยืนยันชื่อแคมเปญตรงทุกตัวอักษร | ไม่แสดงอีก | ลบ configuration graph แต่เก็บ purge tombstone ที่ไม่มีคำตอบ/คะแนน |

## Permission และความปลอดภัย

- การอ่าน policy และ Hide/Unhide/Archive/Restore/Void ต้องมี `SAFETY_VOTE_MANAGE`.
- Mark Test, Unmark Test และ Purge ต้องมี `SAFETY_VOTE_ADMIN` เพิ่มเติม.
- ทุก mutation ใช้ `RowVersion` เพื่อป้องกันการเขียนทับข้อมูลที่เปลี่ยนระหว่างทาง.
- เหตุผลอย่างน้อย 10 ตัวอักษรเป็นข้อบังคับสำหรับการซ่อน กำหนด Test เก็บถาวร Void และ Purge.
- Purge ทำงานแบบ fail-closed: หากพบคะแนน การเข้าร่วม ไฟล์ ผลลัพธ์ งาน export การแจ้งเตือน integration หรือหลักฐานธุรกิจใด ๆ ระบบไม่ลบ.
- Purge เก็บ `SafetyVote_CampaignPurgeLog` เป็น tombstone พร้อมรหัสแคมเปญ ชื่อ เหตุผล ผู้ดำเนินการ เวลา และ SHA-256 ของข้อความยืนยัน แต่ไม่เก็บ ballot/answer/candidate data.
- ผู้ใช้ทั่วไปได้รับ `404` สำหรับแคมเปญ Hidden/Test และ endpoint ส่งคำตอบตอบ `409 CAMPAIGN_NOT_PARTICIPATABLE`.

## UX

- System Console มีแท็บ `ซ่อนอยู่` และ `แคมเปญทดสอบ` แยกจากงานปกติ.
- แสดงป้าย `TEST` และ `ซ่อนอยู่` ในการ์ด ตาราง และรายละเอียด.
- KPI ปกติไม่นับแคมเปญ Hidden/Test.
- เมนูแสดงเฉพาะ action ที่สัมพันธ์กับสถานะ และตรวจ policy จาก server ซ้ำก่อนดำเนินการ.
- Purge ต้องกรอกชื่อแคมเปญให้ตรง; server ตรวจซ้ำ ไม่เชื่อผลจาก UI.

## Schema และ API

- Migration: `backend/migrations/20261016_safety_vote_campaign_governance.sql`
- Policy parity: `backend/services/safety-vote-campaign-governance.js` และ `api/lib/safety_vote_campaign_governance.php`
- Policy endpoint: `GET /api/safety-vote/admin/campaigns/:id/governance-policy`
- Mutation endpoint: `POST /api/safety-vote/admin/campaigns/:id/governance/:action`

## Verification

- Static/policy contract ครอบคลุม Node, PHP, participant guards และ Admin UX.
- Migration ทดสอบกับ disposable schema สองรอบเพื่อยืนยัน idempotency.
- Guarded Node/PHP API UAT ครอบคลุม Mark Test → ซ่อนจากผู้ใช้ → Void → ปฏิเสธชื่อยืนยันผิด → Purge → ตรวจ tombstone และยืนยันว่าแคมเปญที่มี ballot ไม่สามารถเปลี่ยนเป็น Test ได้.
- Authenticated Admin Browser UAT ที่ 390×844 ยืนยันแท็บ Test/Hidden ป้ายสถานะ และไม่มี horizontal overflow หรือ console error.
- ฐาน disposable ถูกลบทิ้งหลังทดสอบและไม่มี private-file residue.

## Deployment note

ต้องลง migration นี้หลัง Safety Vote schema ปัจจุบันและก่อนเปิด runtime ชุดนี้ การ rollback เชิงปฏิบัติการควรปิด/ย้อน runtime ก่อน โดยไม่ drop คอลัมน์หรือ purge log เพื่อรักษาหลักฐานและหลีกเลี่ยง data loss.
