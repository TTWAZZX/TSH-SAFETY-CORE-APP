# TSH Safety Core Activity — CLAUDE.md

## Project Overview

ระบบจัดการกิจกรรมความปลอดภัย (Safety Core Activity) สำหรับองค์กร TSH
ภาษา UI: ภาษาไทย (ข้อความ error/success ทุกอย่างเป็นภาษาไทย)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS SPA, Tailwind CSS (CDN), Chart.js, Flatpickr, FullCalendar, SheetJS, html2canvas, jsPDF |
| Font | Kanit (Google Fonts) |
| Backend | Node.js + Express v5 |
| Database | TiDB Cloud (MySQL-compatible) via `mysql2` connection pool |
| File Storage | Cloudinary (images + documents) |
| Auth | JWT (6h expiry) + bcrypt passwords |
| Deploy | Vercel (serverless) |

## Project Structure

```
TSH-SAFETY-CORE-APP/
├── index.html                  # Single HTML entry point (SPA)
├── vercel.json                 # Vercel deployment config
├── public/
│   ├── style.css
│   └── js/
│       ├── api.js              # API call helpers
│       ├── main.js             # SPA router / page loader
│       ├── session.js          # JWT session management
│       ├── ui.js               # Shared UI utilities (openModal, closeModal, showToast, ...)
│       ├── fullcalendar.js
│       ├── utils/
│       │   └── normalize.js
│       └── pages/
│           ├── admin.js        # System Console (8 tabs — see below)
│           ├── cccf.js
│           ├── committee.js
│           ├── employee.js     # legacy — router redirects #employee → #admin/employees tab
│           ├── kpi.js
│           ├── machine-safety.js
│           ├── ojt.js
│           ├── patrol.js
│           ├── policy.js
│           ├── profile.js      # Profile slide-over drawer (enterprise)
│           ├── yokoten.js
│           ├── accident.js
│           ├── safety-culture.js
│           ├── training.js
│           ├── contractor.js
│           ├── hiyari.js
│           ├── ky.js
│           └── fourm.js        # 4M Change module
└── backend/
    ├── server.js               # Express app, auth endpoints, generic CRUD
    ├── db.js                   # mysql2 connection pool (TiDB Cloud)
    ├── cloudinary.js           # Cloudinary config + multer storage + fileFilter
    ├── migrate-passwords.js    # One-time bcrypt migration script
    ├── .env                    # Secret config (NOT committed to git)
    ├── middleware/
    │   └── auth.js             # authenticateToken, isAdmin
    └── routes/
        ├── patrol.js
        ├── admin.js
        ├── cccf.js
        ├── master.js
        ├── machine-safety.js
        ├── ojt.js
        ├── yokoten.js
        ├── accident.js
        ├── safety-culture.js
        ├── training.js
        ├── contractor.js
        ├── hiyari.js
        ├── ky.js
        ├── fourm.js            # 4M Change routes
        ├── settings.js         # App settings / config routes
        └── activity-targets.js # Activity Targets — position templates + per-person overrides
```

## Environment Variables

Config file: `backend/.env` (ไม่อยู่ใน git)

```
PORT=5000
JWT_SECRET=...
DB_HOST=...          # TiDB Cloud endpoint
DB_PORT=4000
DB_USER=...
DB_PASS=...
DB_NAME=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ALLOWED_ORIGINS=...  # comma-separated, e.g. https://example.vercel.app
```

## Running Locally

```bash
cd backend
node server.js      # runs on PORT=5000
```

ไม่มี test script ที่กำหนดไว้ในขณะนี้

## Architecture & Key Patterns

### Authentication
- JWT ส่งผ่าน `Authorization: Bearer <token>` header เสมอ
- Middleware `authenticateToken` → decode JWT → `req.user`
- Middleware `isAdmin` → ตรวจ `req.user.role === 'Admin'` (ต้องใช้หลัง authenticateToken)
- Login rate limit: 10 ครั้ง / 15 นาที / IP
- Token หมดอายุ 6 ชั่วโมง, refresh ได้ที่ `POST /api/session/verify`

### User Roles
- `Admin` — จัดการข้อมูลทั้งหมด
- `User` — ดูข้อมูล, บันทึกการรับทราบ
- `Viewer` — (import only)
- Role whitelist: `ALLOWED_ROLES = ['Admin', 'User', 'Viewer']` (enforced in admin.js backend)

### API Routes
| Prefix | Auth | Module |
|--------|------|--------|
| `/api/login` | none | Login |
| `/api/register/options` | none | Public: departments + positions + safety units for register/profile forms |
| `/api/register` | none | สมัครใหม่ (register) |
| `/api/change-password` | User | เปลี่ยนรหัสผ่าน |
| `/api/session/verify` | User | Refresh JWT |
| `/api/patrol/*` | User | Patrol routes |
| `/api/patrol/roster` | User (read) / Admin (write) | Patrol roster CRUD — Top&Management / Sec.&Supervisor |
| `/api/patrol/member-records` | User | ดูรายการเดินตรวจรายบุคคล |
| `/api/patrol/my-missed-sessions` | User | รายการ sessions ที่ user ยังไม่ได้เดินตรวจ (สำหรับ makeup/compensation check-in) |
| `/api/patrol/admin-record` | Admin | เพิ่ม/ลบรายการเดินตรวจ (Patrol_Attendance) แทนสมาชิก |
| `/api/patrol/admin-record/supervisor/:id` | Admin | ลบรายการ Self-Patrol (Patrol_Self_Checkin) แทน supervisor |
| `/api/admin/*` | Admin | Admin routes (employees, schedules, audit, dashboard, health) |
| `/api/cccf/*` | User | CCCF routes |
| `/api/master/*` | User (write=Admin) | Master data (departments/teams/roles/positions/areas/safety-units) |
| `/api/profile` | User | ดูและแก้ไขโปรไฟล์ตัวเอง |
| `/api/profile/employee-id` | User | เปลี่ยน EmployeeID ตัวเอง (cascade update + new JWT) |
| `/api/machine-safety/*` | User | Machine & Device Safety |
| `/api/ojt/*` | User | Stop-Call-Wait (OJT/SCW) |
| `/api/yokoten/*` | User | Yokoten CRUD |
| `/api/accident/*` | User | Accident Reports |
| `/api/safety-culture/*` | User | Safety Culture |
| `/api/training/*` | User | Training Status |
| `/api/contractor/*` | User | Contractor Safety |
| `/api/hiyari/*` | User | Hiyari (near-miss) Reports |
| `/api/ky/*` | User | KY Activities |
| `/api/fourm/*` | User | 4M Change Management |
| `/api/employees` | User/Admin | Employee CRUD |
| `/api/policies` | User/Admin | Policy CRUD |
| `/api/committees` | User/Admin | Committee CRUD |
| `/api/kpidata/*` | User/Admin | KPI data CRUD |
| `/api/kpidata/bulk` | Admin | Bulk update KPI rows (PUT — must be declared BEFORE `/:id`) |
| `/api/machine-safety/:id/files` | Admin | Upload file to machine (multer field: `file`) |
| `/api/machine-safety/:id/links` | Admin | Add URL link to machine (no file upload) |
| `/api/machine-safety/files/:fileId` | Admin | Delete a file record |
| `/api/upload/document` | Admin | Cloudinary file upload (field name: `document`) |
| `/api/admin/permissions/matrix` | Admin | GET/PUT permission matrix (role × permission) |
| `/api/activity-targets/activities` | User | Static list of 9 activity definitions |
| `/api/activity-targets/position-templates` | User (write=Admin) | GET/PUT position template targets (IsNA supported) |
| `/api/activity-targets/position-templates/bulk-apply` | Admin | Apply position template to all employees in that position |
| `/api/activity-targets/employee/:empId` | User (write=Admin) | GET/PUT per-person override targets (IsNA supported) |
| `/api/activity-targets/me` | User | My merged targets + actual yearly counts for all 9 activities |

### Generic CRUD Tables
ตารางเหล่านี้มี auto-generated CRUD endpoints (GET/POST/PUT/DELETE):
`Patrol_Sessions`, `Patrol_Attendance`, `Patrol_Issues`, `Patrol_Areas`, `CCCF_Activity`, `CCCF_Targets`,
`ManHours`, `AccidentReports`, `TrainingStatus`, `SCW_Documents`, `OJT_Department_Status`,
`Machines`, `Documents`, `Document_Machine_Links`, `YokotenTopics`, `YokotenResponses`

Primary key ของ generic CRUD คือ `id` — ยกเว้น `Employees` ที่ใช้ `EmployeeID`

### Key Non-Generic Tables (managed by dedicated routes)
| Table | Route | Notes |
|-------|-------|-------|
| `Patrol_Roster` | `/api/patrol/roster` | Admin-managed patrol roster (top_management / supervisor) — auto-created at startup |
| `Patrol_Self_Checkin` | `/api/patrol/self-checkin`, `/api/patrol/admin-record/supervisor/:id` | Supervisor self-patrol records |
| `Master_SafetyUnits` | `/api/master/safety-units` | Safety units linked to departments (cascading select) |
| `Activity_Position_Templates` | `/api/activity-targets/position-templates` | Yearly targets per position per activity (IsNA flag supported) |
| `Employee_Activity_Targets` | `/api/activity-targets/employee/:empId` | Per-person override targets — override takes priority over template |

### File Upload
- **ห้ามเขียนไฟล์ไปยัง local filesystem** — Vercel มี read-only filesystem
- ไฟล์ทุกอย่างต้องอัปโหลดผ่าน Cloudinary เท่านั้น (`cloudinary.js`)
- Endpoint: `POST /api/upload/document` — field name ต้องเป็น `document` (ไม่ใช่ `file`)
- ประเภทไฟล์ที่รองรับ: JPEG, PNG, GIF, WEBP, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 10 MB (patrol images), 20 MB (documents)
- Cloudinary folder: `tsh_safety_app/`

### Database
- TiDB Cloud (MySQL-compatible) เชื่อมต่อด้วย SSL (`TLSv1.2`, `rejectUnauthorized: true`)
- ใช้ `pool.query()` เสมอ (อย่าใช้ `pool.getConnection()` โดยไม่จำเป็น)
- ยกเว้น bulk import ที่ต้องใช้ transaction (`connection.beginTransaction()`)
- Parameterized queries (`?`) เสมอ — ห้าม string concatenation ใน SQL

### Security Rules (ห้ามทำ)
- ห้าม raw `req.body` เป็น `INSERT INTO table SET ?` โดยตรง — ต้อง whitelist fields ก่อน (ดูตัวอย่าง `KPI_DATA_FIELDS`)
- ห้าม expose password/token ใน response
- ห้าม skip `authenticateToken` บน endpoints ที่มี side effects
- Admin-only endpoints ต้องมีทั้ง `authenticateToken` และ `isAdmin`

## Modules / Features

| Module | Description |
|--------|-------------|
| **Patrol** | กำหนดการตรวจ, บันทึกการเข้าร่วม (ปกติ / ซ่อม / ตรวจซ้ำ), รายงานปัญหา (รูปภาพ), Self-Patrol สำหรับหัวหน้า, Team Rotation, พื้นที่โรงงาน (Patrol_Areas), Roster Management (Top&Management / Sec.&Supervisor), Admin Record Management (เพิ่ม/ลบรายการแทนสมาชิก) |
| **CCCF** | Form A Worker (ค้นหาอันตรายรายบุคคล), Form A Permanent (ตารางติดตาม `ต้องส่ง / On Process / Complete`, admin ส่งแทน/แก้ไข/ลบได้, progress รายส่วนงานจาก assignment), Unit Summary combo chart (horizontal bar + target line), Admin ตั้งเป้าหมาย/override achieved ต่อ Unit, กรองปีได้ทั้ง Unit summary และ "รายการของฉัน" |
| **KPI** | ประกาศ KPI, ข้อมูล KPI รายปี (ม.ค.–ธ.ค.) |
| **Yokoten** | แบ่งปันบทเรียน/ความรู้ความปลอดภัย, บันทึกการรับทราบ |
| **Policy** | นโยบายความปลอดภัย, รับทราบนโยบาย |
| **Committee** | คณะกรรมการความปลอดภัย, SubCommittee (JSON array), ผังองค์กร |
| **Machine Safety** | ข้อมูลเครื่องจักร/อุปกรณ์ความปลอดภัย, เอกสารเชื่อมโยงกับเครื่องจักร |
| **OJT / SCW** | Stop-Call-Wait, OJT Department Status, เอกสาร SCW |
| **Accident** | รายงานอุบัติเหตุ/อุบัติการณ์ |
| **Safety Culture** | กิจกรรมวัฒนธรรมความปลอดภัย |
| **Training** | สถานะการฝึกอบรม |
| **Contractor** | ความปลอดภัยผู้รับเหมา |
| **Hiyari** | รายงาน near-miss / ไฮยาริ |
| **KY** | กิจกรรม KY (Kiken Yochi) |
| **4M Change** | บริหารจัดการการเปลี่ยนแปลง Man/Machine/Material/Method |
| **Admin (System Console)** | Dashboard, Scheduler, Employee CRUD, Master Data, System Health, Audit Log, **เป้าหมายกิจกรรม** |
| **Activity Targets** | กำหนดเป้าหมายรายปีสำหรับ 9 กิจกรรม — เทมเพลตตามตำแหน่ง + override รายบุคคล + N/A flag; ผล sync อัตโนมัติกับ `/api/activity-targets/me` |
| **Master** | Departments, Teams, Roles, Positions, Areas (Patrol_Areas), Safety Units (Master_SafetyUnits) — admin-managed reference data |
| **Profile** | Slide-over drawer: ดู/แก้ไขโปรไฟล์ตัวเอง, เปลี่ยนรหัสผ่าน, เปลี่ยน EmployeeID (cascade update 9 tables + re-issue JWT) |

## CCCF Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `CCCF_FormA_Worker` | รายการค้นหาอันตรายรายบุคคล (พนักงานส่งเอง) — มี `SafetyUnit` column (auto-migrated) |
| `CCCF_FormA_Permanent` | เอกสารผลดำเนินการถาวร — ส่งโดย supervisor หรือ admin ส่งแทนได้ พร้อมแนบไฟล์ Cloudinary, มี `AssigneeID`, `StopType`, `Rank` |
| `CCCF_Unit_Targets` | เป้าหมายต่อ Unit — `yearly_target` (จำนวนคน ไม่ใช่ครั้ง) + `achieved_override` (admin override) |
| `CCCF_Assignments` | กำหนดผู้รับผิดชอบจาก Master Employee ว่าใครต้องส่ง Form A Permanent — admin เพิ่ม/แก้ไข/ลบได้ |

### Form A Permanent Tracking
- ใช้ `buildPermanentTrackingRows()` รวม `CCCF_Assignments` + `CCCF_FormA_Permanent` เป็นตารางติดตามเดียว
- สถานะมี 3 แบบ: `must_send` = ยังไม่มีรายการส่ง, `onprocess` = มีรายการส่งแต่ยังไม่มีไฟล์แนบ, `complete` = มีรายการส่งและมีไฟล์แนบ
- แถวที่มาจาก assignment ต้องขึ้นทันทีในตาราง แม้ยังไม่เคยส่งเอกสาร
- filter ของตารางรองรับ Department, Status, Rank, Stop Type
- แอดมินทำงานจากตารางได้เลย: เพิ่มแทนผู้ใช้, แก้ไขรายการ Permanent, ลบรายการ Permanent

### Permanent Admin Workflow
- ฟอร์ม `openPermanentForm(record = null, forcedAssigneeId = '')` ใช้ร่วมกันทั้ง create / edit / admin-submit-for-user
- ถ้าเป็น admin ต้องเลือกผู้รับผิดชอบ (`AssigneeID`) จาก assignment/master employee ได้ และระบบเติม `SubmitterName` + `Department` ตาม master
- backend helper `resolvePermanentSubmitter()` ใช้ source of truth จาก `Employees` เมื่อมี `AssigneeID`
- endpoint ที่เกี่ยวข้อง:
  - `POST /cccf/form-a-permanent` — supervisor ส่งเอง หรือ admin ส่งแทนผู้ใช้
  - `PUT /cccf/form-a-permanent/:id` — admin แก้ไขรายการ Permanent และอัปไฟล์แทนได้
  - `DELETE /cccf/form-a-permanent/:id` — admin ลบรายการได้

### Assignment Manager
- modal assignment ใช้รายชื่อจาก Master Employee เป็นหลัก
- `POST /cccf/assignments` ใช้เพิ่ม assignment ใหม่
- `PUT /cccf/assignments/:id` ใช้แก้ assignment เดิมตรง ๆ โดยไม่ต้องลบแล้วเพิ่มใหม่
- `DELETE /cccf/assignments/:id` ใช้ลบ assignment
- ต้องกัน duplicate `EmployeeID` ใน `CCCF_Assignments`

### Permanent Department Progress
- dashboard executive ต้องแสดง progress รายส่วนงานจาก assignment ตั้งต้น ไม่ใช่นับเฉพาะรายการที่ส่งแล้ว
- ใช้ `buildPermanentDepartmentProgress()` สรุป `complete / onprocess / must_send` ต่อ Department
- `progressPct = complete / totalAssignedInDept`
- ถ้าส่วนงานยังไม่มีการส่งเลย ให้แสดงว่า `ยังไม่มีการส่ง`

ทุก table สร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` (try/catch) ใน startup IIFE ของ `backend/routes/cccf.js`

### CCCF_Unit_Targets — achieved_override
- `achieved_override INT DEFAULT NULL` — ถ้า NULL ระบบใช้ค่าที่คำนวณจาก unique EmployeeID ที่ส่งจริง
- ถ้า admin ตั้ง override ≠ NULL → ใช้ค่านั้นแทน computed value
- `buildUnitData()` ใน `cccf.js`: `achievedComputed = Set(yearData.map(r => r.EmployeeID)).size` → `achieved = achievedOverride ?? achievedComputed`
- PUT endpoint รับ `{ yearly_target, achieved_override }` — ถ้า `achieved_override` เป็น `null`/`''` → set `NULL` ใน DB

### Unit Summary Combo Chart
- **Horizontal bar chart** (`indexAxis: 'y'`) — ป้องกัน X-axis label ถูกตัด + align กับแถวตาราง
- **Stacked bars**: Achieved (เขียว) + Onprocess/Remaining (เหลือง) — total = target
- **Target line**: dataset `type:'line'` แสดง target ต่อ Unit บน X-axis
- **Y-axis labels**: แสดงชื่อ Unit ตัดที่ 22 ตัวอักษร (`getLabelForValue` + slice) — หมุนในตาราง, ไม่หมุนในกราฟ
- **Height sync**: chart ใช้ `flex-1; min-height:200px` ใน flex-column parent ที่เป็น flex-1 ของ outer flex-row → ความสูงตามตาราง
- `_unitChartInst` destroy ก่อน recreate ทุกครั้ง — ป้องกัน Chart.js duplicate instance
- `initUnitChart()` ต้องถูกเรียกหลัง DOM settle → ใช้ `setTimeout(() => initUnitChart(), 0)` เสมอ

### Year Filters
- **Unit summary**: `_unitYear` state → `window._unitSetYear(year)` re-renders `#cccf-unit-summary-inner` + reinit chart
- **"รายการของฉัน"**: `_myCardYear` state → `window._myCardSetYear(year)` re-renders `#cccf-my-card-wrap`
- ทั้งสอง default = `new Date().getFullYear()`

### Admin Edit Modal (`_cccfSetUnitTarget`)
- signature: `(unit, currentTarget, achievedOverride, computedAchieved)`
- 3 fields: เป้าหมาย (required), Achieved Override (optional — เว้นว่าง = ใช้ระบบ), Remaining (auto-calc read-only)
- `window._unitUpdateRemaining()` — global oninput handler อ่าน `data-computed` attribute จาก input เพื่อ fallback

### Safety Unit in Worker Form
- SafetyUnit ดึงจาก `GET /master/safety-units` — แสดง **ทุก unit** ไม่ filter ตาม department (ต่างจาก registration form)
- ถ้า `_safetyUnits.length > 0` → `<select>`, ถ้าไม่มี → `<input type="text">`

## Patrol Module — Overview Tab Structure

`patrol.js` แท็บ "ทีมและภาพรวม" มี 2 sub-tabs:

| Sub-tab | ID | RosterGroup | Attendance source | Yearly target |
|---------|----|-------------|-------------------|---------------|
| Top & Management | `ov-sub-mgmt` | `top_management` | `Patrol_Attendance.UserID` | per person (TargetPerYear in Patrol_Roster) |
| Sec. & Supervisor | `ov-sub-sv` | `supervisor` | `Patrol_Self_Checkin.EmployeeID` | per person (TargetPerYear in Patrol_Roster) |

### Position → Yearly Target
**Management group:**
- ผู้จัดการทั่วไป, ผู้ช่วยผู้จัดการทั่วไป, ผู้อำนวยการ → **12 ครั้ง/ปี**
- ผู้ชำนาญการพิเศษ, ผู้จัดการ → **24 ครั้ง/ปี**

**Supervisor group:**
- หัวหน้าแผนก, หัวหน้าส่วน → **24 ครั้ง/ปี**

### Patrol_Roster Table
```sql
CREATE TABLE IF NOT EXISTS Patrol_Roster (
    id INT AUTO_INCREMENT PRIMARY KEY,
    EmployeeID VARCHAR(50) NOT NULL,
    RosterGroup VARCHAR(20) NOT NULL,  -- 'top_management' | 'supervisor'
    TargetPerYear INT NOT NULL DEFAULT 12,
    SortOrder INT DEFAULT 99,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
สร้างอัตโนมัติเมื่อ server start (`CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `backend/routes/patrol.js`)
ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` — TiDB compatible

### Admin Actions (per row in overview tables)
- **ดูรายการ** → modal แสดงรายการเดินตรวจ + เพิ่ม/ลบรายการ (calls `GET /patrol/member-records`)
- **แก้ไขเป้าหมาย** → modal แก้ `TargetPerYear` (calls `PUT /patrol/roster/:id`)
- **ลบสมาชิก** → confirm + calls `DELETE /patrol/roster/:id`
- **เพิ่มสมาชิก** button (ในหัว table) → modal **multi-select** ค้นหาพนักงาน + เลือกหลายคนพร้อมกัน (calls `POST /patrol/roster` ทีละคน)
  - ซ่อนพนักงานที่อยู่ใน roster **ทั้งสองกลุ่ม** ออกจากรายการค้นหา (fetch ทั้ง `top_management` + `supervisor` พร้อมกัน แล้ว union existingIds) — ป้องกัน admin สับสน
  - กด row เพื่อ toggle (checkbox UI), selected chips แสดงด้านล่าง
  - เป้าหมาย (TargetPerYear) ใส่ครั้งเดียว ใช้กับทุกคนที่เลือก

### Patrol Overview UI Details (Top & Management tab)
- **Spotlight card** — full-width banner วางอยู่เหนือ grid ตาราง (ไม่อยู่ใน sidebar) เพื่อความเด่นชัด
- **Sidebar** — `flex flex-col h-full gap-3`: 3 stat cards แยกกัน (เซสชันทั้งหมด / เข้าร่วมรวม / อัตราเข้าร่วม) + pie chart ด้วย `flex-1` เต็มพื้นที่ที่เหลือ
- **ตาราง Top & Management** — เรียงลำดับ `TargetPerYear` ascending (12 ก่อน แล้วค่อย 24)

### PDF Export (`window.exportPatrolPDF(group)`)
- ปุ่ม PDF อยู่ในหัว card ของทั้งสอง sub-tabs (`top_management` / `supervisor`)
- ใช้ **fixed-page approach**: แต่ละหน้าเป็น HTML `794×1122px` (A4 at 96dpi) render ด้วย html2canvas → jsPDF `addImage(..., 0, 0, 210, 297)` → ขนาดพอดี A4 เสมอ
- หน้าข้อมูล: `display:flex;flex-direction:column` — content ใน `flex:1`, footer bar สีเขียวพิน bottom (`flex-shrink:0`) ป้องกัน whitespace
- หน้าสรุป (summary): green header block + content area `flex:1;justify-content:space-evenly` (3 sections) + footer — เนื้อหากระจายเต็มหน้า
- `ROWS_P1 = spMember ? 21 : 26`, `ROWS_FULL = 30`
- filename: `SP-MGT-YYYY-MMDD.pdf` / `SP-SUP-YYYY-MMDD.pdf`

## Vercel Deployment

`vercel.json` กำหนด:
- `backend/server.js` → serverless function (Node.js)
- `public/**` → static files
- `*.html` → static files
- Route: `/api/*` → `backend/server.js`, อื่นๆ → `index.html`

### Environment Variables บน Vercel (Critical)
`backend/.env` ไม่อยู่ใน git → ต้องตั้งค่า env vars บน **Vercel Dashboard → Project → Settings → Environment Variables** ทุกครั้งที่สร้าง project ใหม่:
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ALLOWED_ORIGINS`

สำหรับ `ALLOWED_ORIGINS` ต้องระบุ production URL เช่น `https://tsh-safety-core-app.vercel.app` — ถ้าไม่ตั้งค่า CORS middleware จะ reject request → Express ส่ง **500 HTML** กลับมา → frontend parse JSON ไม่ได้ → error "Unexpected token '<'"

หลัง save env vars ต้อง **Redeploy** ใหม่จาก Deployments tab

## Frontend Auth Pattern (Critical)

### ใช้ `TSHSession.getUser()` เสมอ — ห้ามใช้ `localStorage.getItem('currentUser')`

`session.js` บันทึก user object ด้วย key `tsh_user` แต่ทุก page อ่านผ่าน `TSHSession.getUser()` เท่านั้น

```js
// CORRECT:
const currentUser = TSHSession.getUser() || { name: '', id: '', department: '', team: '', role: 'User' };

// WRONG (key mismatch bug — จะได้ null เสมอ):
const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
```

`TSHSession` object มีใน `public/js/session.js` และ expose เป็น global บน `window`

## Backend: Employee Data from JWT (Critical)

Routes ที่บันทึกข้อมูลเกี่ยวกับผู้ใช้ **ต้องดึงจาก `req.user`** (JWT) ไม่รับจาก `req.body` เพื่อป้องกันการปลอมแปลงข้อมูล

```js
// CORRECT (patrol checkin, cccf form-a-worker, form-a-permanent):
const UserID     = req.user.id;
const UserName   = req.user.name;
const Department = req.user.department;

// WRONG (รับจาก client — ปลอมแปลงได้):
const { UserID, UserName } = req.body;
```

`req.user` มี fields: `{ id, name, department, role, team }`

## Admin Hub (System Console) — 8 Tabs

`public/js/pages/admin.js` มี 8 tabs:

| Tab | Key | Description |
|-----|-----|-------------|
| ภาพรวม | `dashboard` | KPI stat cards, dept chart, recent audit feed |
| กำหนดการตรวจ | `scheduler` | Patrol session scheduling (single + bulk by date range/weekday) |
| ข้อมูลพนักงาน | `employees` | Employee CRUD + bulk Excel import + pagination 25/page |
| ข้อมูลอ้างอิง | `reference` | Departments, Teams, Positions, Roles, Areas (Patrol_Areas) — add/edit/delete |
| สิทธิ์การใช้งาน | `permissions` | Permission matrix per role — Admin/User/Viewer |
| System Health | `health` | Module record counts, stale alert tables |
| Audit Log | `audit` | Admin action log, filterable by action type |
| เป้าหมายกิจกรรม | `targets` | Activity Targets — 2 sub-tabs: เทมเพลตตามตำแหน่ง + กำหนดรายบุคคล |

State: `_currentTab`, `_calInst`, `_empCache`, `_deptCache`, `_teamCache`, `_empSearch`, `_empPage`, `_auditPage`, `_atActivities`, `_atPositions`, `_atSubTab`, `_atSelPosition`, `_atSelEmp`, `_atEmpTargets`

Navigation: `#employee` hash redirects → `#admin` + auto-switches to employees tab via `window._adminTab?.('employees')`

**Permission Matrix** (`permissions` tab): เรียก `GET /api/admin/permissions/matrix` → ได้ `{ matrix, roles, permissions, roleLabels }` — ใช้ `PUT /api/admin/permissions/matrix` กับ `{ role, permission, granted }` เพื่อ toggle สิทธิ์แต่ละคู่

### Audit Log Table (SQL — run in DBeaver)
```sql
CREATE TABLE IF NOT EXISTS Admin_AuditLogs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    ActionTime DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    AdminID    VARCHAR(50)  NOT NULL,
    AdminName  VARCHAR(100),
    Action     VARCHAR(50)  NOT NULL,
    TargetType VARCHAR(50),
    TargetID   VARCHAR(100),
    Detail     TEXT,
    IPAddress  VARCHAR(50),
    INDEX idx_action (Action),
    INDEX idx_admin (AdminID),
    INDEX idx_actiontime (ActionTime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Frontend Modal Pattern (Critical)

`ui.js` exports `openModal` / `closeModal` as named exports — they are **NOT** automatically on `window`.

```js
// In every page module that uses modals:
import { openModal, closeModal } from '../ui.js';

// Set window.closeModal once so inline onclick handlers in HTML strings work:
window.closeModal = closeModal;

// In JS code — use imported function directly:
openModal('ชื่อ Modal', htmlContent, 'max-w-lg');
closeModal();

// In HTML template strings — use window prefix:
// <button onclick="window.closeModal&&window.closeModal()">ยกเลิก</button>
```

## Frontend UI Design System

> **ห้ามใช้ emoji ทุกชนิดใน UI** — ใช้ inline SVG แทนทั้งหมด

### Global Theme
- **Body background**: `#1e5c3e` (deep forest green) — ตัดกับ card สีขาวได้ชัดเจน ห้ามเปลี่ยนเป็นสีอ่อน
- **Card**: `background:#ffffff; border:1px solid #d1f0e0; box-shadow: 0 4px 16px rgba(5,150,105,0.15), 0 1px 4px rgba(0,0,0,0.08)` — shadow เขียวอ่อน

ไฟล์อ้างอิง (ห้ามแก้ไข): `committee.js`, `policy.js`, `patrol.js`, `kpi.js`, `cccf.js`, `profile.js`

### Restyle Status
| File | Status |
|------|--------|
| `kpi.js` | done (enterprise) |
| `machine-safety.js` | done (enterprise) |
| `patrol.js` | done (enterprise) |
| `ojt.js` | done |
| `safety-culture.js` | done |
| `profile.js` | done (enterprise — slide-over drawer) |
| `hiyari.js` | pending |
| `ky.js` | pending |
| `fourm.js` | pending |
| `yokoten.js` | pending |
| `accident.js` | pending |
| `training.js` | pending |
| `contractor.js` | pending |
| `admin.js` | pending |

### Page Wrapper Pattern
**ห้ามใส่ `max-w-*` หรือ `mx-auto` ใน page wrapper** — `<main>` ใน `index.html` จัดการ `p-4 md:p-6` ให้แล้ว

```js
`<div class="space-y-6 animate-fade-in pb-10">...</div>`
```

### Hero Header Pattern (Enterprise pages — kpi.js, machine-safety.js)
```html
<div class="relative overflow-hidden rounded-2xl" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
  <!-- dot pattern -->
  <div class="absolute inset-0 opacity-10 pointer-events-none">
    <svg width="100%" height="100%"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>
  </div>
  <div class="relative z-10 p-6">
    <!-- title + action buttons -->
    <!-- stats strip: grid of rounded-xl px-4 py-3 text-center cards with rgba(255,255,255,0.12) bg -->
  </div>
</div>
```

### Header Pattern (non-hero pages)
```html
<div>
  <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
    <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:linear-gradient(135deg,#COLOR1,#COLOR2);box-shadow:0 2px 10px rgba(R,G,B,0.3)">
      <svg class="w-5 h-5 text-white" .../>
    </span>
    PAGE TITLE
  </h1>
  <p class="text-sm text-slate-500 mt-1 ml-11">SUBTITLE</p>
</div>
```

### Accent Colors per Module
| Module | Gradient | Shadow rgba |
|--------|----------|-------------|
| machine-safety | `#059669 → #0d9488` | `5,150,105` |
| ojt/scw | `#dc2626 → #ea580c` | `220,38,38` |
| safety-culture | `#059669 → #0d9488` | `5,150,105` |
| hiyari | `#f97316 → #ef4444` | `249,115,22` |
| ky | `#6366f1 → #8b5cf6` | `99,102,241` |
| fourm (4M) | `#6366f1 → #0284c7` | `99,102,241` |
| yokoten | `#0ea5e9 → #6366f1` | `14,165,233` |
| accident | `#dc2626 → #9f1239` | `220,38,38` |
| training | `#0284c7 → #0891b2` | `2,132,199` |
| contractor | `#d97706 → #b45309` | `217,119,6` |

### Stats Card Pattern
```html
<div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-{color}-50">
    <svg class="w-5 h-5 text-{color}-500" .../>
  </div>
  <div>
    <p class="text-2xl font-bold text-slate-800">VALUE</p>
    <p class="text-xs text-slate-500">LABEL</p>
  </div>
</div>
```

### Status Badge / Chip Pattern
```html
<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-{color}-100 text-{color}-700">
  <span class="w-1.5 h-1.5 rounded-full bg-{color}-400 inline-block"></span>
  LABEL
</span>
```
ใช้ `animate-pulse` บน dot สำหรับ status "active/valid/ผ่าน"

### Container / Loading Pattern
- Filter bar: `<div class="card p-4">...</div>`
- Table: `<div class="card overflow-hidden">...</div>`
- Loading spinner: `<div class="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent"></div>`

### Empty State Pattern
```html
<div class="text-center py-16 text-slate-400">
  <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
    <svg class="w-8 h-8 opacity-40" .../>
  </div>
  <p class="font-medium">ไม่มีข้อมูล</p>
  <p class="text-sm mt-1">DESCRIPTION</p>
</div>
```

## Common Pitfalls

1. **อย่าเขียนไฟล์ลง disk** — ใช้ Cloudinary เสมอ
2. **`backend/.env` path** — โค้ด dotenv ใช้ `__dirname + '/.env'` ไม่ใช่ root `.env`
3. **`Employees` primary key** คือ `EmployeeID` (string) ไม่ใช่ `id`
4. **TiDB port** คือ 4000 ไม่ใช่ 3306
5. **Legacy password mode** — ถ้า `Password` column เป็น NULL จะใช้ EmployeeID เป็น password (ต้องย้ายมาใช้ bcrypt)
6. **Frontend เป็น SPA** — ทุก page อยู่ใน `index.html`, JS แยกตาม page ใน `public/js/pages/`
7. **localStorage key mismatch (fixed)** — `tsh_user` คือ key จริง แต่ใช้ `TSHSession.getUser()` เสมอ ไม่อ่าน localStorage โดยตรง
8. **Form fields ที่มาจาก JWT** — ต้อง `readonly`/`disabled` + `<input type="hidden">` เพื่อส่งค่าให้ form ได้รวม
9. **Express v5** — ใช้จริงใน production (`package.json` ระบุ `"express": "^5.1.0"`) ต่างจาก v4 ตรงที่ error handling และ async route errors
10. **bcrypt + bcryptjs** — มีทั้งสองตัวใน dependencies (ซ้ำซ้อน) — code ใช้ `bcryptjs` เท่านั้น, `bcrypt` เป็น native binding ที่ไม่จำเป็น
11. **`backend/uploads/`** — มีบน local เท่านั้น ไม่มีบน Vercel (Vercel read-only filesystem) — ไฟล์จริงต้องอยู่บน Cloudinary
12. **`window.closeModal` pattern** — `closeModal` จาก `ui.js` ไม่ถูก expose บน window โดยอัตโนมัติ ต้อง set `window.closeModal = closeModal` ใน page module ก่อนเปิด modal ที่มี inline onclick
13. **Upload field name** — `POST /api/upload/document` ใช้ field ชื่อ `document` (ไม่ใช่ `file`) — multer config กำหนดไว้ใน `cloudinary.js`
14. **`Admin_AuditLogs` table** — ต้องสร้างด้วย SQL ก่อน (ดูด้านบน) — auditLog helper ใน admin.js จะ silent-fail ถ้าตารางยังไม่มี
15. **`safeCount()` in system health** — ตาราง module ใหม่อาจยังไม่มีใน DB ทำให้ health check return `null` แทน error
16. **Express route ordering** — `PUT /api/kpidata/bulk` ต้องประกาศ **ก่อน** `PUT /api/kpidata/:id` ไม่งั้น `/bulk` จะถูก match เป็น `:id`
17. **Machine Safety file upload field** — `POST /api/machine-safety/:id/files` ใช้ multer field ชื่อ `file` (ไม่ใช่ `document`) ต่างจาก generic upload endpoint
18. **Add machine → upload files** — ต้อง POST machine ก่อน → รับ `id` จาก response → แล้วค่อย upload files/links ทีละขั้น (multi-step creation)
19. **KPI_DATA_FIELDS whitelist** — column จริงใน DB คือ `Metric`, `Department` (ไม่ใช่ `MetricName`, `Category`) — ตรวจ whitelist ใน `server.js` ก่อนแก้ field names
20. **`machine-safety.js` enterprise fields** — `Status`, `RiskLevel`, `NextInspectionDate` ถูก auto-migrate ใน `ensureTables()` แล้ว ไม่ต้องรัน SQL แยก (แต่ถ้าสร้างตารางใหม่ให้รัน SQL ที่ให้ไว้ใน session)
21. **EmployeeID format** — รองรับทั้งตัวเลข 6 หลัก (012609) และแบบ letter-prefix (AP0001, SP0001) — placeholder ทุกที่ต้องอ้างอิงทั้งสองรูปแบบ
22. **EmployeeID cascade update** — `PUT /api/profile/employee-id` ใช้ `pool.getConnection()` + transaction เพื่อ update Employees PK + 9 related tables แล้ว re-issue JWT ใหม่ — frontend ต้อง reload หลังสำเร็จ
23. **`isAdmin` ใน patrol routes** — `/api/patrol` mount ใช้ `authenticateToken` เท่านั้น ถ้าต้องการ admin-only endpoint ภายใน patrol.js ต้อง import `isAdmin` จาก `../middleware/auth` แล้วใส่เป็น per-route middleware (`router.post('/...', isAdmin, handler)`)
24. **`Patrol_Roster` auto-create** — สร้างด้วย `CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `patrol.js` — ไม่ต้องรัน SQL แยก; ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อ TiDB compatibility
25. **Patrol overview sub-tabs** — `ov-sub-mgmt` (Top&Management) และ `ov-sub-sv` (Sec.&Supervisor) แยก canvas ID: `ov-mgmt-pie` / `ov-sv-pie` — supervisor tab ใช้ yearly filter เท่านั้น (ไม่มี month filter แล้ว)
26. **Safety Units cascading** — `Master_SafetyUnits` มี `department_id` — ทั้ง registration form (`index.html`) และ profile drawer (`profile.js`) filter units ตาม department ที่เลือก ซ่อน unit select ถ้าไม่มี units ใน dept นั้น
27. **`/api/register/options` เป็น public** — ไม่ต้อง auth แต่ `apiFetch` จะส่ง auth header ไปด้วยถ้า token มีอยู่ — ไม่เป็นปัญหา backend ไม่ enforce auth บน route นี้
28. **`admin.js` ใช้ `API` object เท่านั้น** — import เป็น `import { API } from '../api.js'` ไม่ใช่ `apiFetch` โดยตรง — path ต้องไม่มี `/api/` นำหน้า (e.g. `API.get('/activity-targets/me')` ไม่ใช่ `API.get('/api/activity-targets/me')`)
29. **Activity Targets — hybrid architecture** — override (`Employee_Activity_Targets`) มีลำดับสูงกว่า template (`Activity_Position_Templates`) เสมอ — `getMergedTargets()` ใน `activity-targets.js` handle การ merge; ทั้งสอง table auto-migrate `IsNA` column ผ่าน `ALTER TABLE ... ADD COLUMN` (try/catch)
30. **Activity Targets — `IsNA` flag** — ถ้า `IsNA=1` → `YearlyTarget=0` และ activity ถูก filter ออกจาก `/me` response — ไม่แสดงใน compliance widget ของ user
31. **Activity Targets — `patrol_issue` actual count** — `Patrol_Issues` ไม่มี `ReporterID` column → `actualCount` คืน `null` เสมอ — ยังไม่รองรับ per-person tracking
32. **Activity Targets — compliance widget (pending)** — แต่ละ module page (patrol, cccf, training, yokoten, hiyari, ky, ojt) ยังไม่มี widget แสดง progress — ให้เพิ่มตอน restyle โดย call `GET /api/activity-targets/me` แล้วกรอง `activityKey` ที่ต้องการ
33. **Patrol PDF fixed-page approach** — ห้ามใช้ section-by-section render แล้ว addPage ตาม content height (จะเกิด whitespace gap) — ต้องสร้าง HTML `794×1122px` ต่อหน้าเสมอ แล้ว render ทีละหน้า
34. **Patrol roster add modal — filter both groups** — ตอน fetch รายชื่อพนักงานสำหรับ add modal ต้อง fetch ทั้ง `top_management` + `supervisor` roster พร้อมกัน แล้ว union เป็น `existingIds` เพื่อซ่อนคนที่อยู่ในกลุ่มใดกลุ่มหนึ่งแล้ว
35. **`Patrol_Sessions` PK คือ `SessionID` ไม่ใช่ `id`** — ทุก query ที่ SELECT จาก `Patrol_Sessions` ต้องใช้ `s.SessionID AS id` ไม่ใช่ `s.id` และ UPDATE/DELETE ต้องใช้ `WHERE SessionID = ?` — ถ้าใช้ `s.id` จะเกิด SQL error → 500 ทุกครั้ง; Columns จริง: `SessionID, PatrolDate, Year, Description, Area, CheckType, InspectorName, TeamName, Status, CreatedBy, TeamID, AreaID, PatrolRound`
36. **Vercel 500 "Unexpected token '<'" คือ CORS/env var ไม่ครบ** — เมื่อ backend return HTML แทน JSON (Vercel error page) แสดงว่า serverless function crash ก่อน respond — สาเหตุที่พบบ่อย: (1) `ALLOWED_ORIGINS` ไม่ได้ set บน Vercel → CORS middleware throw Error → Express default error handler ส่ง HTML 500 (2) DB credentials หรือ JWT_SECRET ไม่ครบ → function crash ตอน startup; วิธีแก้: ตั้งค่า env vars ใน Vercel Dashboard แล้ว Redeploy
37. **`Patrol_Attendance` columns เพิ่มเติม** — มี `PatrolType VARCHAR(20)` (ค่า: `'normal'`, `'compensation'`, `'Re-inspection'`) และ `RecordedBy VARCHAR(50)` — ถูก auto-migrate ด้วย `ALTER TABLE ... ADD COLUMN` ใน patrol.js startup; `compensation` = เดินซ่อม ใช้ `PatrolDate` จาก missed sessions dropdown (ดึงจาก `Patrol_Sessions` ที่ผ่านมา)
38. **patrol.js ส่วนตัว layout** — `grid grid-cols-1 xl:grid-cols-3`: left column (xl:col-span-2) = check-in card, mini calendar, next patrol, year dots, monthly sessions, **Team Roster (ทีมของฉัน)**, Self-Patrol; right sidebar (xl:col-span-1) = performance ring, recent checkins, issues — Team Roster อยู่ใน left column เพื่อใช้พื้นที่กว้าง
39. **CCCF Target = จำนวนคน ไม่ใช่ครั้ง** — `yearly_target` ใน `CCCF_Unit_Targets` หมายถึงจำนวน unique คน (EmployeeID) ที่ต้องส่ง ไม่ใช่จำนวนครั้ง — `achieved = Set(EmployeeIDs).size`
40. **CCCF `achieved_override` — NULL vs 0** — `null` = ใช้ค่าจากระบบ (computed), `0` = admin ตั้ง override เป็น 0 จริงๆ — ต้องส่ง `null` ไม่ใช่ `''` เพื่อ clear override; backend แปลง empty string → `null` แล้ว
41. **CCCF Unit Summary DOM IDs** — outer wrapper: `id="cccf-unit-summary"`, inner re-renderable: `id="cccf-unit-summary-inner"` — ทุก function ที่ update summary ต้อง target `cccf-unit-summary-inner` และ call `setTimeout(() => initUnitChart(), 0)` หลัง `innerHTML =`
42. **CCCF "รายการของฉัน" wrapper** — `id="cccf-my-card-wrap"` ใน `renderPage()` — `window._myCardSetYear()` re-renders แค่ card นี้โดยไม่ reload ทั้งหน้า
43. **CCCF Chart horizontal bar** — ใช้ `indexAxis: 'y'` ใน Chart.js options — Y-axis labels truncate ที่ 22 chars ด้วย `callback: function(val) { const name = this.getLabelForValue(val); return name.length > 22 ? name.slice(0,21)+'…' : name }` — ห้ามใช้ vertical bar เพราะ X-axis labels ถูกตัดเมื่อมี unit มาก
