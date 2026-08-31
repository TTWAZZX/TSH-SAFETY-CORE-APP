# Prompt: พัฒนาโมดูล BBS Smart Card สำหรับ TSH Safety Core Activity

## Project Context

ชื่อระบบหลัก: **TSH Safety Core Activity**
โมดูลใหม่: **BBS Smart Card**
สภาพแวดล้อมเป้าหมาย: **Production — Corporate Internal System**

ระบบนี้เป็นโมดูลใหม่ภายในระบบเดิม ไม่ใช่โปรเจกต์หรือแอปพลิเคชันแยกต่างหาก

สถาปัตยกรรมปัจจุบัน:

- Frontend เป็น Vanilla JavaScript SPA
- Entry point อยู่ที่ `index.html`
- SPA routing และ module loader อยู่ที่ `public/js/main.js`
- Page modules อยู่ที่ `public/js/pages/`
- ใช้ `API` helper จาก `public/js/api.js`
- ใช้ `TSHSession.getUser()` จากระบบ session เดิม
- ใช้ UI utilities เดิม เช่น modal, confirmation, loading และ toast
- Local/Development backend ใช้ Node.js + Express + MySQL (`backend/`)
- Production ใช้ PHP compatibility API บน shared hosting (`api/`)
- ฐานข้อมูล Production เป็น Company MySQL/MariaDB
- Authentication ใช้ JWT และ RBAC เดิมของระบบ
- Uploaded files เก็บใน server filesystem และให้บริการผ่าน `/uploads`

เอกสารที่ต้องอ่านก่อนวิเคราะห์หรือแก้ไข:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `CHANGELOG.md`
5. `ROADMAP.md`
6. `DEPLOYMENT.md` เมื่อมีงาน Production หรือ deployment

## Objective

พัฒนาโมดูล **BBS Smart Card** สำหรับบริหารการสังเกตพฤติกรรมความปลอดภัย หรือ Behavior Based Safety แบบดิจิทัล โดยใช้ QR Code บนบัตรประจำตัวพนักงานเพื่อเปิด Personal BBS Workspace แทน BBS Card กระดาษ

โมดูลต้อง:

- ทำงานร่วมกับ Employee Master และโครงสร้างองค์กรเดิม
- รองรับ Department, Safety Unit, Position และสายบังคับบัญชา
- เลือกผู้ถูกสังเกตและ Checklist ตามสิทธิ์โดยอัตโนมัติ
- รองรับ Safe, Unsafe และ N/A
- สร้างและติดตาม Corrective Action จาก Unsafe behavior
- มี Dashboard, KPI, Analytics, Report และ Audit Log
- รองรับ Desktop, Tablet และ Mobile
- ขยายต่อในอนาคตได้โดยไม่ทำให้โมดูลเดิมเสียหาย

## Mandatory Working Method

ให้ทำหน้าที่เป็น:

- Senior Software Architect
- Senior Full Stack Developer
- Enterprise Database Designer
- Security Reviewer
- UI/UX Designer
- QA and Production Release Reviewer

ใช้รูปแบบและ utility ที่มีอยู่ใน repository ก่อนสร้าง abstraction ใหม่ ห้าม refactor ระบบทั้งโปรเจกต์เพื่อรองรับโมดูลนี้

หลักสำคัญ:

- Scope การเปลี่ยนแปลงต้องอยู่ภายในโมดูล BBS และ integration point ที่จำเป็น
- ห้ามสร้าง frontend framework หรือ backend architecture ชุดใหม่
- ไม่บังคับ Repository Pattern, Service Layer หรือ Clean Architecture ถ้าไม่สอดคล้องกับโครงสร้างเดิม
- แยก business rules เป็น helper/service ที่ทดสอบได้เมื่อมีความซับซ้อนจริง
- ห้าม hardcode Department, Safety Unit, Position, Employee หรือ Checklist
- ต้องรักษา Node local และ PHP Production ให้มีพฤติกรรมตรงกัน
- ต้องรักษา UTF-8 และข้อความภาษาไทยให้ถูกต้อง
- ห้าม deploy หรือ push GitHub จนกว่าผู้ใช้จะอนุมัติในคำขอปัจจุบันอย่างชัดเจน

## Existing Sources of Truth

ห้ามสร้างข้อมูล Master ซ้ำกับของเดิมโดยไม่จำเป็น:

- พนักงาน: ตาราง `Employees`
- Primary key พนักงาน: `Employees.EmployeeID` ซึ่งรองรับทั้งเลข 6 หลัก เช่น `012609` และรหัสมีตัวอักษร เช่น `AP0001`
- แผนก: ตาราง `Master_Departments` และ `GET /api/master/departments`
- Safety Unit: ตาราง `Master_SafetyUnits` และ `GET /api/master/safety-units`
- Position และข้อมูลโครงสร้างองค์กร: ตรวจสอบ System Console และ Admin organization APIs ที่มีอยู่ก่อนออกแบบเพิ่ม
- ผู้ใช้ปัจจุบัน: `TSHSession.getUser()` และ JWT ที่ server ตรวจสอบแล้ว
- UI feedback: modal, loading, confirmation และ toast เดิม
- Upload: middleware/handler และ storage path เดิมของระบบ

ห้ามอ่าน user identity จาก `localStorage` โดยตรง และห้ามเชื่อข้อมูล Employee/Role/Department ที่ frontend ส่งมาโดยไม่ตรวจซ้ำที่ server

## QR Code Security Model

QR Code เป็นทางลัดเพื่อเปิด **Personal BBS Workspace** ไม่ใช่ credential และไม่ใช้แทนการ login

ข้อกำหนด:

- QR ต้องไม่บรรจุ password, JWT, email หรือข้อมูลส่วนบุคคลที่ไม่จำเป็น
- หลีกเลี่ยงการใส่ EmployeeID แบบอ่านได้โดยตรง หากสามารถใช้ opaque public token ได้
- Server ต้อง resolve QR token เป็นเจ้าของบัตรและตรวจสถานะ Active
- หากยังไม่ login ให้ไปหน้า login แล้วกลับมายัง BBS Workspace หลังยืนยันตัวตน
- หาก login อยู่ ต้องตรวจว่าผู้ใช้มีสิทธิ์เปิด workspace หรือทำ observation ตาม policy
- การสแกน QR ของผู้อื่นต้องไม่ทำให้กลายเป็นผู้ใช้อื่นหรือยึด session ของผู้อื่น
- รองรับ revoke/rotate QR token เมื่อบัตรสูญหายหรือออกบัตรใหม่
- เก็บ audit สำหรับการออกบัตร พิมพ์ใหม่ revoke และ regenerate QR

## Organization Hierarchy

โมดูลต้องรองรับ hierarchy ต่อไปนี้เป็น business level ของ BBS:

```text
Manager
  └─ Section Head
       └─ Department Head
            └─ Group Leader
                 └─ Operator
```

เจ้าของระบบยืนยันลำดับตำแหน่งหลักที่ใช้กับ BBS ดังนี้:

| ตำแหน่งในองค์กร | BBS level |
|---|---|
| พนักงาน | Operator |
| หัวหน้ากลุ่ม | Group Leader |
| หัวหน้าแผนก | Department Head |
| หัวหน้าส่วน | Section Head |
| ผู้จัดการ | Manager |

ชื่อตำแหน่งงานย่อยอื่นใน Employee Master ต้องถูกจัดเข้าหนึ่งในห้าระดับนี้
ผ่าน Admin-reviewed mapping ห้ามสร้าง BBS level เพิ่มหรือเดาจากข้อความตำแหน่ง
ใน source code

Admin จัดการ scope ทั้งหมดได้

ข้อควรระวัง:

- Global system roles ปัจจุบันคือ `Admin`, `User`, `Viewer`
- ห้ามเปลี่ยน global role whitelist เพื่อเอา Manager/Leader/Operator ไปใส่เป็น system role โดยอัตโนมัติ
- ให้สำรวจ Position, Safety Unit และ organization mapping เดิมก่อน
- หากข้อมูลเดิมไม่เพียงพอ ให้เสนอ BBS-specific hierarchy/mapping ที่อ้างอิง `EmployeeID` และ Master Data เดิม
- ต้องรองรับรักษาการ ผู้บังคับบัญชาชั่วคราว วันที่เริ่ม–สิ้นสุด และการย้ายแผนกโดยไม่ทำลายประวัติเดิม

## Observation Permission Rules

Baseline ที่เจ้าของระบบอนุมัติสำหรับ Phase 1 เมื่อ 25 สิงหาคม 2026:

- Operator เห็นเฉพาะ observation ที่ตนเป็นผู้ตรวจหรือผู้ถูกตรวจ
- Group Leader สังเกต Operator ในทีม/Unit ของตน
- Department Head สังเกต Group Leader ที่ตนรับผิดชอบ
- Section Head สังเกต Department Head ที่ตนรับผิดชอบ
- Manager สังเกต Section Head ที่ตนรับผิดชอบ
- Admin สังเกตหรือบันทึกแทนทุก scope ได้

Group Leader ต้องมี submitted observation อย่างน้อย 1 ครั้งต่อวันจันทร์–ศุกร์
ตามเขตเวลา `Asia/Bangkok`; Draft ไม่นับ รอบแรกยังไม่หักวันหยุดบริษัทจนกว่าจะ
มี calendar source ที่อนุมัติ

ผู้มีสิทธิ์ระดับ Department เห็นชื่อ observer, Unsafe history และข้อมูลรายบุคคล
ได้เฉพาะ Department ของตน Admin เห็นทั้งหมด และการเปิดดูรายละเอียดต้อง audit
ได้

Pilot แรกคือ Department `MAINTENANCE SEC.` และ Safety Unit `Tube Cutting`
โดย configuration ต้องอ้าง Master Data ID และห้าม hardcode ชื่อใน business
logic

ต้องออกแบบให้ Admin ตั้งค่า permission scope ได้ในอนาคต ไม่ผูกกติกาไว้กับชื่อ Position แบบ hardcode

Server ต้องเป็นผู้คำนวณรายชื่อผู้ที่ผู้สังเกตมีสิทธิ์ตรวจ Frontend มีหน้าที่แสดงผลเท่านั้น

## Personal BBS Workspace

เมื่อเปิด QR หรือเข้าเมนู BBS ให้เปิด `My BBS Workspace` ก่อน ไม่เปิดแบบฟอร์ม observation ทันที

### Operator Workspace

- เริ่มสังเกตเพื่อนร่วมงาน
- ประวัติที่ตนเป็นผู้สังเกต
- ประวัติที่ตนถูกสังเกต
- Safety Score และแนวโน้มส่วนตัวตาม privacy rule
- Action ที่เกี่ยวข้องกับตน

### Leader Workspace

แสดง `My Team` จาก hierarchy ที่ server resolve แล้ว โดยไม่ต้องเลือกแผนกซ้ำ

ข้อมูลสมาชิก:

- รูป ชื่อ รหัส ตำแหน่ง แผนก และ Unit
- วันที่สังเกตล่าสุด
- จำนวนครั้งที่ถูกสังเกตในรอบที่เลือก
- Safe/Unsafe summary
- Action ค้าง
- KPI progress

สถานะตัวอย่าง:

- เขียว: ทำครบเป้าหมาย
- เหลือง: ใกล้ครบกำหนดหรือยังไม่ครบเป้าหมาย
- แดง: ยังไม่เริ่มหรือเกินกำหนด
- เทา: Inactive หรือได้รับ exemption ที่ตรวจสอบได้

ห้ามสรุปว่า “ลางาน” จากการไม่มี observation ต้องเชื่อมกับแหล่ง attendance/leave ที่เชื่อถือได้ก่อน หากยังไม่มีให้ใช้สถานะ `Exempt/Unavailable` ที่ Admin กำหนดพร้อมเหตุผล

### Hierarchy-specific Workspace

- Department Head เห็น Group Leader ใน scope
- Section Head เห็น Department Head ใน scope
- Manager เห็น Section Head ใน scope
- Admin เห็นภาพรวมและ drill-down ทุกระดับ

## Smart Team Dashboard

แสดงอย่างน้อย:

- สมาชิกทั้งหมดใน scope
- ผู้ที่ครบเป้าหมาย
- ผู้ที่ยังไม่ครบเป้าหมาย
- KPI percentage พร้อม numerator/denominator
- Safe/Unsafe summary
- Top behavior categories
- Action pending/overdue
- Observation ล่าสุด
- Department/Unit comparison

ทุก KPI ต้องระบุสูตร ตัวตั้ง ตัวหาร ช่วงเวลา timezone และ source of truth อย่างชัดเจน

## Start Observation Flow

เมื่อกด `เริ่มสังเกต`:

1. Server ตรวจสิทธิ์ observer กับ observed employee
2. ดึงข้อมูลผู้ถูกสังเกตจาก `Employees`
3. Resolve Department, Safety Unit, Position, hierarchy และ template scope
4. เลือก Checklist version ที่ Active และมี priority สูงสุดตามกติกา
5. สร้าง observation draft หรือเริ่ม session ตามแบบที่ได้รับอนุมัติ
6. แสดงชื่อผู้สังเกต ผู้ถูกสังเกต แผนก Unit วันที่ เวลา และ Checklist แบบ readonly

ต้องกำหนดกรณีไม่พบ Checklist, พบหลาย Checklist priority เท่ากัน, พนักงาน inactive, ย้ายแผนกกลางรอบ และ observation ซ้ำอย่างชัดเจน

## Smart Checklist Resolution

Checklist รองรับ scope ตาม:

- Department
- Safety Unit หรือประเภทงาน เมื่อจำเป็น
- Position
- BBS hierarchy level
- Effective date
- Priority
- Version

ผู้ใช้ทั่วไปไม่ต้องเลือก Checklist เอง ระบบต้อง resolve อัตโนมัติและบันทึกเหตุผลว่าเลือก template/version ใด

ห้าม hardcode เช่น Production/QA/Warehouse ใน source code ให้ดึงจาก Master Data และ Admin configuration

## Checklist Builder

Admin สามารถ:

- สร้างและแก้ไข draft Checklist
- แบ่งหมวดหมู่และเรียงลำดับ
- Clone Checklist
- Publish version ใหม่
- Archive/Deactivate
- Import/Export ด้วย validation และ preview
- Mapping กับ Department, Unit, Position และ BBS level
- กำหนด effective date และ priority

Checklist version ที่ถูกใช้แล้วต้อง immutable ประวัติ observation ต้องอ้างอิง version เดิมเสมอ การแก้ไขต้องสร้าง version ใหม่

## Checklist Item Types

รองรับแบบค่อยเป็นค่อยไปตาม requirement ที่อนุมัติ:

- Safe / Unsafe / N/A
- Yes / No / N/A เมื่อ template อนุญาต
- Score พร้อม min/max validation
- Text/Remark
- Single หรือ Multiple Choice
- Photo required
- Action required

ต้องเก็บ item definition snapshot หรือ version reference เพื่อให้รายงานย้อนหลังไม่เปลี่ยนเมื่อ template รุ่นใหม่ถูกเผยแพร่

## Unsafe Business Rules

Admin ตั้งค่าราย item ได้ว่าเมื่อเลือก Unsafe ต้อง:

- บังคับ remark
- บังคับแนบรูป
- สร้าง Corrective Action
- กำหนด owner
- กำหนด due date จาก SLA rule
- กำหนด priority
- ส่ง notification

Validation ต้องทำทั้ง frontend เพื่อ UX และ server เพื่อความถูกต้อง ห้ามเชื่อ validation ฝั่ง browser เพียงอย่างเดียว

## BBS Smart Card Template

บริษัทมี Card Template อยู่แล้ว ระบบไม่ต้องออกแบบ artwork ใหม่

Admin สามารถ:

- Upload template ผ่าน secure upload flow เดิม
- กำหนด template ตาม Department หรือ BBS level
- Preview ก่อนใช้งาน
- Activate/Archive template
- สร้าง card รายคนหรือเป็น batch ตาม permission

ข้อมูล overlay:

- รูปพนักงาน
- ชื่อ
- Department และ Position
- QR Code แบบ opaque/revocable
- EmployeeID เท่าที่ policy อนุญาต

ต้องกำหนดขนาด output, font readiness, image fallback, privacy และ print quality ห้ามเก็บ template หรือรูปเป็น base64 ขนาดใหญ่ในฐานข้อมูลโดยไม่มีเหตุผล

## Corrective Action Tracking

Action จาก Unsafe behavior ต้องเก็บอย่างน้อย:

- Observation และ checklist item ต้นทาง
- ผู้รับผิดชอบ
- Priority
- Due date
- Description
- Before/After evidence
- Verification status และ verifier
- Close date
- Reopen history
- Audit fields

ต้องกำหนด state transition เช่น `Open → In Progress → Pending Verification → Closed → Reopened` และ permission ของแต่ละ transition

## Notification

แจ้งเตือนเมื่อ:

- มี Unsafe ใหม่ตาม rule
- Action ถูกมอบหมาย
- Action ใกล้ครบกำหนดหรือเกินกำหนด
- Observation/KPI ยังไม่ครบ
- Action ถูกส่งกลับหรือ reopen

ก่อนสร้าง notification framework ใหม่ ให้สำรวจระบบ Email Outbox, SMTP, dashboard alerts และ audit pattern ที่มีอยู่ พิจารณา in-app และ email แยกกัน พร้อม duplicate suppression และ retry behavior

## Reports and Analytics

รองรับ:

- Observation Summary
- Safe/Unsafe Summary
- KPI completion
- Action Summary และ overdue
- Behavior trend
- Pareto
- Heatmap
- Department/Unit comparison
- Top behavior categories
- Observer activity ตาม policy
- Excel, PDF และ Print

ห้ามสร้าง `statistics` หรือ `reports` table แบบ materialized โดยอัตโนมัติหาก query จาก source records ได้เพียงพอ หากปริมาณข้อมูลต้องใช้ aggregation table ต้องเสนอเกณฑ์และวิธี rebuild/reconcile ก่อน

รายงานที่แสดงชื่อหรือ ranking บุคคลต้องผ่าน privacy review และ permission matrix ก่อน

## Database Design Direction

ห้ามออกแบบฐานข้อมูลใหม่ทั้งหมด ให้ reuse master tables เดิมและเพิ่มเฉพาะตารางที่โมดูล BBS เป็นเจ้าของ

เสนอชื่อ table ตาม convention ของ repository เช่น:

- `BBS_Cards`
- `BBS_Card_Templates`
- `BBS_Hierarchy_Assignments` หากข้อมูลเดิมไม่เพียงพอ
- `BBS_Checklist_Templates`
- `BBS_Checklist_Versions`
- `BBS_Checklist_Categories`
- `BBS_Checklist_Items`
- `BBS_Checklist_Scope_Mappings`
- `BBS_Observations`
- `BBS_Observation_Answers`
- `BBS_Observation_Files`
- `BBS_Actions`
- `BBS_Action_Files`
- `BBS_Notifications` หรือ reuse outbox เดิมเมื่อเหมาะสม
- `BBS_AuditLogs` หรือ reuse Admin audit pattern เดิมเมื่อเหมาะสม

รายการนี้เป็น starting point ไม่ใช่ข้อบังคับ ต้องพิสูจน์ความจำเป็นของแต่ละ table ก่อนสร้าง

Database design ต้องมี:

- Primary/Foreign keys ที่เข้ากับ `Employees.EmployeeID`
- Unique constraints สำหรับ QR token, version และ business keys
- Index ตาม query/filter/report จริง
- CreatedAt/UpdatedAt และ actor fields
- Soft delete หรือ status lifecycle ตาม pattern ที่เหมาะสม
- Snapshot fields สำหรับ historical identity/scope ที่จำเป็น
- Transaction boundary สำหรับ observation, answers, files และ actions
- NULL-safe queries และ compatibility กับ MySQL/MariaDB
- Migration ที่รันซ้ำอย่างปลอดภัยหรือมี state ชัดเจน
- Rollback/backup plan

ต้องทำ ER Diagram และ data retention/privacy proposal ก่อน implementation

## API Direction

ใช้ prefix `/api/bbs/*` และ response shape ตาม API เดิมของระบบ

กลุ่ม endpoint ที่ควรวิเคราะห์:

- Workspace และ my team
- Eligible observed employees
- Card resolve/issue/revoke/regenerate
- Checklist/template/version management
- Checklist resolution preview
- Observation draft/submit/detail/history
- Evidence upload/download/delete
- Corrective Action workflow
- Dashboard/analytics/report export
- Admin configuration และ hierarchy mapping

ข้อกำหนด:

- JWT authentication ทุก route ยกเว้น endpoint resolve QR ที่ออกแบบให้ปลอดภัยโดยเฉพาะ
- Admin-only middleware สำหรับ configuration/write ที่เกี่ยวข้อง
- Object-level authorization ทุก observation/action/file
- Prepared statements และ parameterized SQL
- Pagination/filter/sort แบบ whitelist
- จำกัดขนาด request และ upload
- Error response ต้องไม่เปิดเผย SQL, filesystem path หรือ secret
- Node Express route และ PHP Production handler ต้องมี behavior parity

## Frontend Direction

เพิ่มโมดูลใน SPA เดิม โดยสำรวจ pattern ของโมดูลใกล้เคียงก่อน

ตำแหน่งเมนูที่กำหนดไว้คือ **ถัดจาก `Safety Culture` และก่อน `Contractor / Supplier`** โดยใช้ route `#bbs-smart-card` ห้ามย้ายไปไว้ภายใน Safety Culture หรือสร้าง sidebar ชุดใหม่

ตำแหน่งที่คาดว่าจะเกี่ยวข้อง:

- `index.html` สำหรับ navigation/shell ที่จำเป็น
- `public/js/main.js` สำหรับ route/module loader
- `public/js/pages/bbs-smart-card.js` สำหรับหน้าโมดูล
- `public/js/module-meta.js` และ `public/js/login-guides.js` สำหรับลำดับโมดูล metadata และคู่มือใช้งาน
- `public/js/api.js`, `session.js`, `ui.js` ให้ reuse ไม่ fork

UI ต้อง:

- ใช้ visual language เดิมของ TSH Safety Core
- Responsive บน Desktop/Tablet/Mobile
- รองรับ keyboard และ visible focus
- มี loading, empty, error และ permission-denied state
- ใช้ table/card ตามขนาดหน้าจอ
- มี search, sort, filter และ pagination เมื่อข้อมูลมาก
- ใช้ modal/toast/confirmation เดิม ไม่เพิ่ม SweetAlert หรือ DataTable library โดยอัตโนมัติ
- ป้องกันข้อความและ column ซ้อนกัน
- ไม่เปิดเผยข้อมูลพนักงานนอก scope

## Security Requirements

- JWT และ session helper เดิม
- Server-side RBAC และ object-level permission
- Opaque/revocable QR token
- Prepared statements
- Output escaping และ safe HTML rendering
- CSRF risk review ตามรูปแบบ JWT/CORS ปัจจุบัน
- CORS allowlist เดิม
- Secure upload: MIME, extension, size, random filename และ authorization ตอนอ่านไฟล์
- Rate limit สำหรับ QR resolve, card generation และ write endpoints ที่เสี่ยง
- Audit log สำหรับ Admin/configuration/approval/revoke/export ที่สำคัญ
- ห้าม log token, password, QR secret หรือข้อมูลส่วนบุคคลเกินจำเป็น
- ป้องกัน IDOR, mass assignment, duplicate submit และ replay
- กำหนด retention และ access policy ของรูป/observation/evidence

## Required Analysis Deliverables

ก่อนเขียน source code ให้ส่งเอกสารวิเคราะห์เพื่ออนุมัติ ประกอบด้วย:

1. Existing-system discovery และสิ่งที่ reuse ได้
2. Requirement clarification และ assumptions
3. User roles, BBS levels และ permission matrix
4. End-to-end user flows
5. QR threat model และ security decisions
6. Proposed module architecture และ integration points
7. Database ER Diagram, tables, constraints และ indexes
8. Checklist resolution algorithm พร้อม conflict/fallback rules
9. API contract สำหรับ Node/PHP parity
10. UI information architecture และ wireframes
11. Corrective Action state machine
12. Notification and duplicate-suppression design
13. KPI/report formulas พร้อม numerator/denominator
14. Migration/backfill/seed strategy
15. Testing strategy
16. Deployment, backup, smoke, rollback และ cache-bust plan
17. Affected-files list
18. Risks, privacy concerns, open decisions และ recommended phases

แต่ละข้อควรอธิบายเหตุผล trade-off และสิ่งที่ยังไม่ควรทำในรอบแรก

## Recommended Delivery Phases

ให้เสนอ phase ที่สามารถ deploy และ rollback แยกได้ ตัวอย่าง:

1. Discovery, hierarchy and permission design
2. Database foundation and Admin configuration
3. Checklist builder and immutable versioning
4. Personal workspace and QR card lifecycle
5. Observation workflow and secure evidence
6. Corrective Actions and notifications
7. Dashboard, analytics and exports
8. Security hardening, performance, UAT and Production rollout

แต่ละ phase ต้องมี acceptance criteria, test plan, migration impact และ rollback boundary

## Testing and Production Rules

- เพิ่ม focused regression tests สำหรับ business rules
- ทดสอบ Node syntax และ PHP lint เมื่อแก้ backend/API
- ทดสอบ Node/PHP permission and response parity
- รัน `npm --prefix backend test` เมื่อแตะ shared route หรือ permission behavior
- รัน `git diff --check`
- ตรวจ UTF-8/mojibake ในไฟล์ที่เปลี่ยน
- ทำ authenticated local UAT ก่อน Production
- หากมี schema/data change ต้องมี migration, fresh Production backup และ smoke data path
- หากมี upload change ต้อง smoke upload/retrieval และ backup `backend/uploads/`
- Production ต้อง upload เฉพาะไฟล์ที่จำเป็นและตรวจ SHA-256 download-back
- Temporary smoke rows/files ต้องลบและยืนยันจำนวนคงเหลือ `0`
- ห้ามส่ง email/notification จริงระหว่าง test เว้นแต่ผู้ใช้อนุมัติโดยชัดเจน

## First Response Instruction

ในคำตอบรอบแรก:

- วิเคราะห์ระบบเดิมและ Requirement เท่านั้น
- ห้ามเขียนหรือแก้ application code
- ห้ามสร้าง/แก้ schema หรือข้อมูล
- ห้าม deploy หรือ push
- สรุปสิ่งที่ reuse ได้ ช่องว่างของข้อมูล ความเสี่ยง และคำถามที่มีผลต่อการออกแบบ
- เสนอ architecture, ERD draft, API/UI flow, permission matrix และ phased implementation plan
- ระบุ recommendation สำหรับ MVP ที่ปลอดภัยและต่อยอดจากของเดิม
- รอผู้ใช้อนุมัติแผนก่อนเริ่ม implementation

หากพบว่า Requirement ใดขัดกับระบบเดิมหรือมีความเสี่ยงด้าน security/privacy ให้ชี้แจงด้วยหลักฐานจาก repository และเสนอทางเลือกที่ปลอดภัยกว่า ห้ามเปลี่ยนพฤติกรรมสำคัญโดยเดาเอง
