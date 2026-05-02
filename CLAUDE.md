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
- Change-password rate limit: 10 ครั้ง / 15 นาที / IP (`changePwdLimiter` ใน `server.js`)
- Token หมดอายุ 6 ชั่วโมง, refresh ได้ที่ `POST /api/session/verify`
- **`normalizeRole(rawRole)`** ใน `server.js` — case-insensitive match กับ `ALLOWED_ROLES`; บังคับ role เป็น canonical casing ก่อน sign JWT; ป้องกัน `'admin'` / `'ADMIN'` bypass isAdmin check
- **Password minimum 8 ตัวอักษร** — enforce ใน register, change-password, profile; มี strength indicator 5 ระดับ (อ่อนมาก/อ่อน/ปานกลาง/ดี/แข็งแกร่ง) ใน index.html, main.js, profile.js
- **Request logger** — middleware `res.on('finish')` log format: `[INFO/WARN/ERROR] METHOD /path statusCode ms`
- **Global error handler** — Express `(err, req, res, next)` ใน `server.js` ก่อน SECTION 6; CORS error → 403; อื่นๆ → 500 `{ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }`

### User Roles
- `Admin` — จัดการข้อมูลทั้งหมด
- `User` — ดูข้อมูล, บันทึกการรับทราบ
- `Viewer` — (import only)
- Role whitelist: `ALLOWED_ROLES = ['Admin', 'User', 'Viewer']` (enforced in admin.js backend + `normalizeRole()` in server.js)

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
| `/api/yokoten/topics` | User (write=Admin) | GET topics (includes `deptResponse` for caller's dept) / POST create / PUT :id / DELETE :id |
| `/api/yokoten/respond` | User | POST new dept response (FormData, field: `responseFiles`) |
| `/api/yokoten/respond/:id` | User/Admin | PUT update response / POST approve / POST reject |
| `/api/yokoten/respond/:id/approve` | Admin | อนุมัติ response (ApprovalStatus → approved) |
| `/api/yokoten/respond/:id/reject` | Admin | ปฏิเสธ response (body: { comment }) |
| `/api/yokoten/response-files/:fileId` | Admin | DELETE single file (Cloudinary + DB) |
| `/api/yokoten/dept-history` | User | ประวัติ response ของแผนกตัวเอง (includes files) |
| `/api/yokoten/dept-completion` | Admin | สรุปความคืบหน้ารายแผนก → `{ topics, deptSummary }` |
| `/api/yokoten/all-responses` | Admin | รายการ response ทั้งหมด (filterable, includes files) |
| `/api/yokoten/dashboard-config` | User (write=Admin) | GET/PUT `{ pinnedDepts, pinnedUnits }` JSON config |
| `/api/yokoten/bulk-approve` | Admin | POST `{ ids: [...] }` — bulk approve pending responses |
| `/api/dashboard/overview` | User | Cross-module KPI overview |
| `/api/dashboard/alerts` | User | Overdue items across modules (accident/machine/yokoten/patrol) |
| `/api/accident/*` | User | Accident Reports |
| `/api/accident/reports` | User (write=Admin) | GET (list+filters) / POST (create+upload) |
| `/api/accident/reports/:id` | User (write=Admin) | GET single / PUT (update+upload) / DELETE (soft-delete: IsDeleted=1) |
| `/api/accident/summary?year=` | User | KPI + trend + byType + byDept aggregates |
| `/api/accident/analytics?year=` | User | dept risk ranking + hotspot + root causes |
| `/api/accident/performance?year=` | User | Safety Performance record + recordableCount |
| `/api/accident/performance` | Admin | PUT upsert — TotalHours, TotalDays, LastAccidentDate, TargetHours, TargetDays, MonthlyStatus (JSON) |
| `/api/accident/attachments/:id` | Admin | DELETE single attachment (Cloudinary + DB) |
| `/api/accident/employees?q=` | User | Employee search for accident form |
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
| `/api/machine-safety/:id/compliance` | User (write=Admin) | GET/PUT compliance checklist items (5.1–5.8) — batch upsert |
| `/api/machine-safety/:id/issues` | User (write=Admin) | GET/POST issues for one machine |
| `/api/machine-safety/issues/:issueId` | Admin | PUT (resolve/reopen) / DELETE issue — must be declared BEFORE `/:id` |
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
`Machines`, `Documents`, `Document_Machine_Links`

Primary key ของ generic CRUD คือ `id` — ยกเว้น `Employees` ที่ใช้ `EmployeeID`

### Key Non-Generic Tables (managed by dedicated routes)
| Table | Route | Notes |
|-------|-------|-------|
| `Patrol_Roster` | `/api/patrol/roster` | Admin-managed patrol roster (top_management / supervisor) — auto-created at startup |
| `Patrol_Self_Checkin` | `/api/patrol/self-checkin`, `/api/patrol/admin-record/supervisor/:id` | Supervisor self-patrol records |
| `Master_SafetyUnits` | `/api/master/safety-units` | Safety units linked to departments (cascading select) |
| `Activity_Position_Templates` | `/api/activity-targets/position-templates` | Yearly targets per position per activity (IsNA flag supported) |
| `Employee_Activity_Targets` | `/api/activity-targets/employee/:empId` | Per-person override targets — override takes priority over template |
| `YokotenTopics` | `/api/yokoten/topics` | Admin-managed topics (Phase 3) — TargetDepts + TargetUnits as JSON |
| `YokotenResponses` | `/api/yokoten/respond` | One response per (YokotenID, Department) — UNIQUE KEY `uq_dept_topic` — approval workflow |
| `Yokoten_Response_Files` | `/api/yokoten/respond`, `/api/yokoten/response-files/:fileId` | Per-response file attachments (Cloudinary) |
| `Yokoten_Dashboard_Config` | `/api/yokoten/dashboard-config` | JSON config row: `pinnedDepts` + `pinnedUnits` arrays |

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
| **Yokoten** | แบ่งปันบทเรียน/ความรู้ความปลอดภัย (Phase 3) — **หนึ่ง response ต่อแผนก**, Approval workflow (pending→approved/rejected), Bulk approve (checkboxes + `POST /bulk-approve`), Corrective Action (IsRelated=No), ไฟล์แนบ (FormData, field: `responseFiles`, สูงสุด 10 ไฟล์/20 MB), Dashboard pinned depts config, Admin approve/reject/delete (soft delete), Excel export |
| **Policy** | นโยบายความปลอดภัย, รับทราบนโยบาย — Description field ใช้ Rich Text Editor (RTE) เดียวกับ Yokoten (`pol-*` prefix), HTML ถูก sanitize ก่อนบันทึก/แสดง, PDF export รองรับ rich formatting |
| **Committee** | คณะกรรมการความปลอดภัย, SubCommittee (JSON array), ผังองค์กร |
| **Machine Safety** | ข้อมูลเครื่องจักร/อุปกรณ์ความปลอดภัย, Safety Device Std., Layout & Checkpoint, Compliance Checklist (5.1–5.8), Issue Tracker, Audit Readiness |
| **OJT / SCW** | มาตรฐาน Stop-Call-Wait (แก้ไขได้), จัดการเอกสาร SCW (อัปโหลด/ดู/ลบ), OJT Compliance รายแผนก (เป้าหมาย/ผู้เข้าร่วม/สถานะ, เลือกแผนกที่แสดง persisted, คำนวณ metric จากแผนกที่เลือกเท่านั้น, year filter) |
| **Accident** | รายงานอุบัติเหตุ/อุบัติการณ์ — Dashboard (KPI cards + trend chart + dept breakdown), Analytics (dept risk ranking + hotspot + root cause), Records (full 6-section form + file attachments + PDF export ต่อรายการ), Safety KPI Board (Zero Accident banner + Days/Hours without accident + target progress + monthly status grid), Soft delete (IsDeleted=1) |
| **Safety Culture** | กิจกรรมวัฒนธรรมความปลอดภัย — 4 tabs: Principles / Dashboard / ผลการประเมิน / PPE Control; คะแนน T1–T5,T7 (0–100%); PPE Inspection + Violation tracking; Dashboard PDF (html2canvas, 3 หน้า, Thai font); Culture Maturity Level (Reactive/Basic/Proactive/Generative) |
| **Training** | บันทึกและติดตามผลการอบรมรายแผนก — `Training_Dept_Records` (Department+Year+CourseID+TotalEmp+PassedCount), Dashboard: KPI cards + compliance chart + course summary + dept summary + Dept×Course matrix, หลักสูตร CRUD (Admin only) |
| **Contractor** | ความปลอดภัยผู้รับเหมา |
| **Hiyari** | รายงาน near-miss / ไฮยาริ — มีปุ่ม "สร้าง Yokoten" ที่ write `hiyari_to_yokoten` ลง sessionStorage แล้ว navigate ไป `#yokoten` |
| **Dashboard** | ภาพรวม KPI ทุก module + Enterprise Safety Health Index + Department×Module Compliance Matrix + Alert Widget (overdue/due soon/pending) + เป้าหมายกิจกรรมส่วนตัว; user เห็นข้อมูล, admin คุม config |
| **Search / Employee Safety 360** | `#search` ค้นหารายบุคคลจาก Employee Master, เปิด Safety Profile รายคนพร้อม KPI, Patrol records, Training, CCCF, Hiyari, KY, Yokoten, Accident, 4M, Policy/PPE signals และ timeline รวม; backend `/api/person-search`; admin บันทึก/ลบ Patrol record ได้โดยยิงเข้า Safety Patrol เดิม (`/api/patrol/admin-record`) ไม่สร้างตาราง Patrol ซ้ำ |
| **KY** | กิจกรรม KY (Kiken Yochi) |
| **4M Change** | บริหารจัดการการเปลี่ยนแปลง Man/Machine/Material/Method |
| **Admin (System Console)** | Dashboard, Scheduler, Employee CRUD, Master Data, System Health, Audit Log, **เป้าหมายกิจกรรม** |
| **Activity Targets** | กำหนดเป้าหมายรายปีสำหรับ 9 กิจกรรม — เทมเพลตตามตำแหน่ง + override รายบุคคล + N/A flag; ผล sync อัตโนมัติกับ `/api/activity-targets/me` |
| **Master** | Departments, Teams, Roles, Positions, Areas (Patrol_Areas), Safety Units (Master_SafetyUnits) — admin-managed reference data |
| **Profile** | Slide-over drawer: ดู/แก้ไขโปรไฟล์ตัวเอง, เปลี่ยนรหัสผ่าน, เปลี่ยน EmployeeID (cascade update 9 tables + re-issue JWT) |

## Enterprise Dashboard — Architecture

หน้า `#dashboard` เป็น cross-module command center ที่ authenticated users ทุกคนเห็นได้ แต่ control/config เป็นของ admin เท่านั้น

### Access Model
| Endpoint | Access | Purpose |
|----------|--------|---------|
| `GET /api/dashboard/overview` | User | KPI รวม, Enterprise Safety Health Index, Department×Module Compliance Matrix |
| `GET /api/dashboard/alerts` | User | รายการ overdue/due soon/pending ข้าม module |
| `GET /api/dashboard/config` | User | อ่าน dashboard config ที่ active |
| `PUT /api/dashboard/config` | Admin | ตั้งค่า threshold, due-soon days, hidden modules, pinned departments |

### API Permission Notes
- Legacy generic CRUD endpoints in `backend/server.js` are read-only for authenticated users; `POST/PUT/DELETE` require `isAdmin` to prevent bypassing module-specific admin controls.
- Frontend `apiFetch()` logs out only on `401` or invalid token; normal `403 Permission denied` is surfaced as an error instead of forcing logout.

### Config Table
| Table | Purpose |
|-------|---------|
| `Dashboard_Config` | `ConfigKey='enterprise'`, `ConfigValue` JSON: `{ healthGreen, healthAmber, alertDueSoonDays, hiddenModules, pinnedDepartments }`, `UpdatedBy`, `UpdatedAt` |

### Enterprise Safety Health Index
- คำนวณใน `backend/routes/dashboard.js` ด้วย `buildHealthIndex()`
- Positive inputs: Patrol rate, CCCF permanent completion, Yokoten response %, Training pass rate
- Penalties: recordable accidents, open Hiyari, open 4M notices, open Patrol issues
- Status:
  - `Good` เมื่อ score >= `healthGreen`
  - `Watch` เมื่อ score >= `healthAmber`
  - `Critical` ต่ำกว่า `healthAmber`
- Frontend แสดงใน `public/js/pages/dashboard.js` ที่ `db-health-wrap`

### Department×Module Compliance Matrix
- คำนวณใน `buildComplianceMatrix(year, config)`
- Rows = `config.pinnedDepartments` หรือ 12 แผนกแรกจาก `Master_Departments`
- Columns = Patrol, Hiyari, KY, Yokoten, Training, 4M
- Training ใช้ pass rate จริง, module อื่นเริ่มจาก presence/completion signal แบบ 0/100 เพื่อให้ matrix ทนกับ schema ต่าง module
- Frontend แสดงใน `db-compliance-wrap`

### Admin Controls
- ปุ่ม `ตั้งค่า` แสดงเฉพาะ admin ใน Health Index card
- Modal: Green threshold, Amber threshold, Due soon days, pinned departments, hidden modules
- Save ผ่าน `PUT /dashboard/config`; user ทั่วไปไม่มีปุ่มและเรียก PUT ไม่ได้
- Overview module cards ครบทุก module หลัก: Patrol, Hiyari, KY, CCCF, Yokoten, Training, Accident, 4M, KPI, Policy, Committee, Machine Safety, OJT/SCW, Contractor, Safety Culture
- Admin เลือกได้ทั้ง module ที่แสดงบนหน้า Overview และแผนกที่แสดงใน Department x Module Compliance Matrix (`pinnedDepartments`)

## Machine Safety Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Machine_Safety` | เครื่องจักรหลัก — `Status`, `RiskLevel`, `NextInspectionDate`, `HasRiskAssessment` ถูก auto-migrate ใน `ensureTables()` |
| `Machine_Safety_Files` | ไฟล์แนบต่อเครื่อง — `FileCategory` แบ่งเป็น `'SafetyDeviceStandard'` และ `'LayoutCheckpoint'` |
| `Machine_Safety_Compliance` | Compliance checklist 5.1–5.8 ต่อเครื่อง — `UNIQUE KEY (MachineID, ItemCode)`, `Status ENUM('pass','fail','na')` |
| `Machine_Safety_Issues` | ปัญหาที่พบต่อเครื่อง — `Status ENUM('open','resolved')`, `Severity ENUM('low','medium','high','critical')` |

### GET /machine-safety — Derived Counts
Query หลักใช้ correlated subqueries ส่งคืน computed columns พิเศษ:
- `SafetyDeviceCount` — จำนวนไฟล์ `FileCategory='SafetyDeviceStandard'`
- `LayoutCheckpointCount` — จำนวนไฟล์ `FileCategory='LayoutCheckpoint'`
- `CompliancePassCount` — รายการ Compliance ที่ `Status='pass'`
- `ComplianceCheckedCount` — รายการ Compliance ที่ `Status != 'na'`
- `OpenIssueCount` — จำนวนปัญหา `Status='open'`

### Compliance Checklist (5.1–5.8)
`COMPLIANCE_ITEMS` ใน `machine-safety.js` กำหนด 8 ข้อ:
`5.1` Nip/Shear Point Guard, `5.2` Rotating Part Guard, `5.3` Emergency Stop, `5.4` Warning Signs & Signals, `5.5` LOTO Procedure, `5.6` Electrical Safety/Grounding, `5.7` Ergonomic Safety, `5.8` Inspection & Maintenance Log

- `PUT /machine-safety/:id/compliance` รับ `{ items: [{ ItemCode, Status }] }` — batch upsert ด้วย `ON DUPLICATE KEY UPDATE`
- ใช้ `UNIQUE KEY (MachineID, ItemCode)` — ไม่ต้องลบแล้ว insert ใหม่

### Audit Readiness (`_auditStatus(m)`)
คำนวณ per-machine: `{ status: 'pass'|'warn'|'fail', hints: [{type, msg}] }`

| เงื่อนไข | ประเภท |
|----------|--------|
| `SafetyDeviceCount == 0` | fail |
| `LayoutCheckpointCount == 0` | fail |
| `NextInspectionDate` เกินวันนี้ | fail |
| Compliance มีรายการ fail | fail |
| `HasRiskAssessment == 0` | warn |
| `OpenIssueCount > 0` | warn |

- `auditMap = { pass, warn, fail }` — aggregate ทุกเครื่องใน `_renderPage()`
- `auditPct = auditMap.pass / total * 100` — แสดงใน donut chart ใน summary card
- `topHints` — aggregate hint messages by frequency → แสดง top 4 ปัญหาที่พบบ่อย

### Audit Summary Card + Filter
- Summary card แสดง donut chart + chip count (pass/warn/fail)
- Chips เป็น `<button>` → `window._msdSetAuditFilter(val)` — toggle filter (คลิกซ้ำเพื่อ clear)
- Filter dropdown `#msd-audit` ใน filter bar sync กับ `_filterAudit` state
- `_msdSetAuditFilter()` sync dropdown และ re-render table

### Filter State (`_getFiltered()`)
| Variable | DOM ID | ค่าที่รองรับ |
|----------|--------|-------------|
| `_search` | `msd-search` | free text |
| `_filterDept` | `msd-dept` | department name |
| `_filterStatus` | `msd-status` | `full` / `partial` / `none` (doc status) |
| `_filterMStatus` | `msd-mstatus` | `active` / `restricted` / `locked` / `maintenance` / `inactive` |
| `_filterRisk` | `msd-risk` | `critical` / `high` / `medium` / `low` |
| `_filterAudit` | `msd-audit` | `pass` / `warn` / `fail` |

### Table Row Highlighting
- `fail` rows: `background:rgba(254,242,242,0.55)` (red tint)
- `warn` rows: `background:rgba(255,251,235,0.45)` (amber tint)
- Applied via inline `style` — ไม่ใช้ arbitrary Tailwind values (CDN ไม่ compile)
- Audit badge ต่อ row แสดง pass/warn/fail พร้อม `title` tooltip บอก hints

### Status & Risk Constants
`STATUS_META` และ `RISK_META` ใน `machine-safety.js` — map value → `{ label, bg, text, dot }` สำหรับ Tailwind badge classes

### Express Route Ordering (Issues)
`PUT /issues/:issueId` และ `DELETE /issues/:issueId` ต้องประกาศ **ก่อน** `PUT /:id` และ `DELETE /:id` เสมอ — ไม่งั้น Express จะ match `'issues'` เป็น `:id`

## Accident Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Accident_Reports` | รายงานหลัก — 29+ columns รวม `Location`, `Position`, `EmploymentType`, `InjuryType`, `BodyPart`, `MedicalTreatment`, `ImmediateCause`, `UnsafeAct`, `UnsafeCondition`, `PreventiveAction`, `ResponsiblePerson`, `DueDate`, **`IsDeleted TINYINT(1) DEFAULT 0`** (auto-migrated ด้วย `ALTER TABLE ... ADD COLUMN` try/catch ใน `ensureTable()`) |
| `Accident_Attachments` | ไฟล์แนบต่อรายงาน — `AccidentID` (FK), `FileName`, `FileURL`, `PublicID`, `FileType`, `FileSize`, `UploadedBy` |
| `Accident_Performance` | Safety KPI Board ต่อปี — `Year` (UNIQUE), `TotalHours`, `TotalDays`, `LastAccidentDate`, `TargetHours`, `TargetDays`, `MonthlyStatus` (JSON), `UpdatedBy` |

### Accident Report Form (6 Sections)
| Section | Fields |
|---------|--------|
| ข้อมูลทั่วไป | AccidentDate, ReportDate, AccidentTime, Location, Area, ReportedBy |
| ผู้ประสบเหตุ | EmployeeID (typeahead search), Position (auto-fill), EmploymentType |
| รายละเอียดเหตุการณ์ | AccidentType, Severity, Description |
| การบาดเจ็บ | InjuryType, BodyPart, LostDays, IsRecordable, MedicalTreatment |
| วิเคราะห์สาเหตุ | ImmediateCause, UnsafeAct, UnsafeCondition, RootCause, RootCauseDetail |
| มาตรการแก้ไข | CorrectiveAction, PreventiveAction, ResponsiblePerson, DueDate, Status + Attachments |

- SubmitFormData ผ่าน `API.post/put(url, fd)` — multer `accFileFilter` รับเฉพาะ `image/*` + `application/pdf` สูงสุด 10 ไฟล์ / 20 MB ต่อไฟล์
- `EmployeeID` ต้องมีอยู่ใน `Employees` — backend ดึง `Department` และ `Position` จาก master อัตโนมัติ
- ไฟล์ staged ใน `_pendingFiles[]` ก่อน submit — validate type/size/duplicate client-side

### File Upload Security
- `accFileFilter` (local ใน `accident.js`) แทน global `fileFilter` — restrict เฉพาะ image/* + PDF
- `parseId(val)` validate `:id` params ทุก route (400 ถ้าไม่ใช่ integer > 0)
- `s(v)` trim whitespace จาก `req.body` string fields ทุกตัว
- DELETE routes verify existence ก่อน destroy (404 ถ้าไม่พบ)

### Safety Performance (KPI Board)
- `GET /accident/performance?year=` คืน record + `recordableCount` จาก `Accident_Reports` (Zero Accident = recordableCount === 0)
- `daysWithoutAccident`: ถ้ามี `LastAccidentDate` → คำนวณ `today - lastDate`; ถ้าไม่มี → ใช้ `TotalDays` (manual)
- `MonthlyStatus` เป็น JSON object `{ "1": "green", "2": "red", ... }` — admin คลิก cell เพื่อ cycle: pending → green → red → pending (auto-save ทันที)
- `PUT /accident/performance` ใช้ `ON DUPLICATE KEY UPDATE` — upsert ต่อ Year

### Tabs & Cache Sync
4 tabs: `dashboard`, `analytics`, `reports`, `performance`
- `_summary`, `_analytics`, `_perfData` เป็น module-level cache
- ล้าง cache ทั้ง 3 เมื่อ: (1) เปลี่ยนปี (2) บันทึกรายงาน (3) ลบรายงาน
- เปลี่ยนปี (`acc-year-sel`) → reset caches ก่อน render เสมอ ป้องกัน race condition

## Training Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Training_Courses` | หลักสูตร — `CourseCode`, `CourseName`, `DurationHours`, `PassScore`, `IsActive` |
| `Training_Records` | (legacy — ไม่ได้ใช้ใน UI ปัจจุบัน) บันทึกรายบุคคล |
| `Training_Dept_Records` | บันทึกรายแผนก — `Department`, `Year`, `CourseID` (nullable), `TotalEmp`, `PassedCount`, `Notes`; UNIQUE KEY `(Department, Year, CourseID)` |

### Key API Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /training/dept-summary?year=` | สรุปรายแผนก: `{ byDept, overall: { deptCount, totalEmp, totalPassed, passRate } }` |
| `GET /training/course-summary?year=` | สรุปรายหลักสูตร: `[{ CourseID, CourseName, deptCount, totalEmp, passedCount }]` |
| `GET /training/dept-records?year=&department=` | รายการดิบ JOIN Training_Courses |
| `POST /training/dept-records` | เพิ่มบันทึก — duplicate guard ด้วย `CourseID <=>` (NULL-safe) |
| `PUT /training/dept-records/:id` | แก้ไขบันทึก — duplicate guard ยกเว้น row ปัจจุบัน |
| `GET /training/courses` | รายการหลักสูตรทั้งหมด |

### Dashboard Structure
1. KPI cards (4 ใบ): แผนกที่บันทึก / พนักงานเข้าอบรม / ผ่านการอบรม / Pass Rate
2. Horizontal stacked bar chart — compliance รายแผนก (`indexAxis:'y'`)
3. 2-col grid: **Course Summary table** (ซ้าย) + **Dept Summary table** (ขวา) — ทั้งสองแสดงเฉพาะ depts/courses ที่มีข้อมูลจริง
4. **Dept × Course Matrix** (full-width) — แสดงเมื่อมี 2+ courses; rows=depts, cols=courses, cells=% badge, last col=overall; คำนวณ client-side จาก `dept-records` โดยตรง

### Duplicate Guard (NULL-safe CourseID)
MySQL UNIQUE index ถือ NULL เป็น distinct ทุกค่า — ต้องใช้ `CourseID <=> ?` ใน application-level check แทน `CourseID = ?`

```js
WHERE Department = ? AND Year = ? AND (CourseID <=> ?)
```

### Division-by-zero
`pct = total > 0 ? Math.round(passed * 100 / total) : null` — null → แสดง "—" ใน UI

## Policy Module — Architecture

### Description Field — Rich Text Editor
`policy.js` ใช้ RTE เดียวกับ Yokoten สำหรับ field `Description` — toolbar + `contenteditable` + input bar สำหรับ link/image

#### IDs (prefixed `pol-`)
| Element | ID |
|---------|-----|
| Toolbar | `pol-rte-toolbar` |
| Link/image input bar | `pol-rte-input-bar` |
| Input label | `pol-rte-input-label` |
| URL input | `pol-rte-url-input` |
| Insert button | `pol-rte-insert-btn` |
| Cancel button | `pol-rte-cancel-bar` |
| Editable area | `pol-desc` |

#### Style injection
`<style id="pol-rte-style">` — inject once ก่อน `openModal()` (guard: `if (!document.getElementById('pol-rte-style'))`)
- placeholder CSS สำหรับ `#pol-desc`
- `.pol-rte-content` class สำหรับ render HTML ใน view (list, heading, bold, italic, underline, link, image)
- `.rte-btn.rte-active` — shared class กับ Yokoten

#### Data flow
- **Edit form**: `rteEl.innerHTML = _sanitizeHtml(policy.Description)` — populate existing HTML
- **Submit**: `data.Description = _sanitizeHtml(rteEl.innerHTML).trim()` — อ่านจาก contenteditable โดยตรง (ไม่ผ่าน FormData)
- **View**: render ด้วย `.pol-rte-content` class — ไม่ใช้ `whitespace-pre-wrap`
- **PDF export**: `.desc-box` ไม่มี `white-space:pre-wrap` + มี styles สำหรับ `h3`, `ul/ol/li`, `b/em/u`, `a`, `img`

#### Helper
`_sanitizeHtml(html)` ใน `policy.js` — strip `<script>`, `<iframe>`, `on*=`, `javascript:` (เหมือน Yokoten)

### RTE Reuse Pattern (ทุก module)
เมื่อต้องการเพิ่ม RTE ให้กับ Description field ของ module อื่น:
1. Replace `<textarea>` ด้วย toolbar + input bar + `contenteditable` — ใช้ prefix เฉพาะ module (เช่น `pol-`, `acc-`)
2. Inject `<style id="xxx-rte-style">` once ก่อน `openModal()`
3. Init RTE ใน `setTimeout(..., 0)` หลัง `openModal()`
4. Submit อ่าน `_sanitizeHtml(rteEl.innerHTML)` แล้ว set ใน data object
5. View ใช้ `.xxx-rte-content` class แทน `whitespace-pre-wrap`
6. PDF: ลบ `white-space:pre-wrap` + เพิ่ม HTML element styles
7. เพิ่ม `_sanitizeHtml()` helper ในไฟล์ module

## Yokoten Module — Architecture (Phase 3)

### Tables
| Table | Purpose |
|-------|---------|
| `YokotenTopics` | หัวข้อ Yokoten — `TargetDepts` (JSON array), `TargetUnits` (JSON array), `RiskLevel`, `Category`, `Deadline`, `AttachmentUrl` — auto-created by `ensureTables()` |
| `YokotenResponses` | Response หนึ่งรายการต่อ (YokotenID, Department) — UNIQUE KEY `uq_dept_topic` — `IsRelated`, `Comment`, `CorrectiveAction`, `ApprovalStatus` (NULL/pending/approved/rejected), `ApprovalComment`, `ApprovedBy`, **`IsDeleted TINYINT(1) DEFAULT 0`** (soft delete — auto-migrated ใน `ensureTables()`) |
| `Yokoten_Response_Files` | ไฟล์แนบต่อ response — `ResponseID` (FK), `FileName`, `FileURL`, `PublicID`, `FileType`, `FileSize`, `UploadedBy` |
| `Yokoten_Dashboard_Config` | Config row เดียว — `pinnedDepts` (JSON), `pinnedUnits` (JSON) — upsert ด้วย `INSERT ... ON DUPLICATE KEY UPDATE` |

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /yokoten/topics` | User | ดึงทุก topic (IsActive=1) พร้อม `deptResponse` ของ caller's dept + `totalDeptCount` |
| `POST /yokoten/topics` | Admin | สร้าง topic ใหม่ (TargetDepts+TargetUnits เป็น JSON) |
| `PUT /yokoten/topics/:id` | Admin | แก้ไข topic |
| `DELETE /yokoten/topics/:id` | Admin | ลบ topic + cascade responses+files (Cloudinary) |
| `POST /yokoten/respond` | User | ส่ง dept response (FormData, field: `responseFiles`) — IsRelated='No' → ApprovalStatus='pending' |
| `PUT /yokoten/respond/:id` | User/Admin | แก้ไข response (FormData) — ต้องเป็น dept เดียวกันหรือ admin |
| `DELETE /yokoten/respond/:id` | Admin | ลบ response + cascade files (Cloudinary) |
| `POST /yokoten/respond/:id/approve` | Admin | อนุมัติ → ApprovalStatus='approved' |
| `POST /yokoten/respond/:id/reject` | Admin | ปฏิเสธ → ApprovalStatus='rejected', body: `{ comment }` |
| `POST /yokoten/bulk-approve` | Admin | Bulk approve `{ ids: [ResponseID, ...] }` → UPDATE IN (...) WHERE ApprovalStatus='pending' |
| `DELETE /yokoten/respond/:id` | Admin | Soft delete → IsDeleted=1 (ไฟล์ Cloudinary ยังคงอยู่) |
| `DELETE /yokoten/response-files/:fileId` | Admin | ลบไฟล์เดี่ยว (Cloudinary + DB) |
| `GET /yokoten/dept-history` | User | ประวัติ response ของแผนกตัวเอง พร้อมไฟล์ |
| `GET /yokoten/dept-completion` | Admin | `{ topics, deptSummary }` — สรุปทุกแผนกจาก Master_Departments |
| `GET /yokoten/all-responses` | Admin | response ทั้งหมด พร้อมไฟล์ (filterable) |
| `GET /yokoten/dashboard-config` | User | `{ pinnedDepts: [], pinnedUnits: [] }` |
| `PUT /yokoten/dashboard-config` | Admin | บันทึก config |

### Response Model — Approval Workflow
- `IsRelated = 'Yes'` → `ApprovalStatus = NULL` (auto-approved, ไม่ต้องรอ admin)
- `IsRelated = 'No'` → `ApprovalStatus = 'pending'` → admin approve/reject
- `CorrectiveAction` required เมื่อ `IsRelated = 'No'` (enforced client+server side)
- Status ที่ frontend ใช้ filter: `'responded'` | `'pending'` | `'rejected'`

### deptResponse shape (returned in GET /topics)
```js
{
    ResponseID, YokotenID, Department, EmployeeID, EmployeeName,
    IsRelated, Comment, CorrectiveAction,
    ApprovalStatus,   // null | 'pending' | 'approved' | 'rejected'
    ApprovalComment, ApprovedBy, ApprovedAt,
    ResponseDate, UpdatedAt,
    files: [{ FileID, FileName, FileURL, FileType, FileSize }]
}
```

### deptSummary shape (returned in GET /dept-completion)
```js
{
    department, totalTopics, respondedCount, pendingApproval, rejected,
    completionPct, lastResponse,
    topicBreakdown: [{
        YokotenID, title, responded, isRelated, approvalStatus,
        responseCount, fileCount, respondedBy, responseDate
    }]
}
```

### File Upload (Response Files)
- Field name: `responseFiles` (multer `.array('responseFiles', 10)`)
- ใช้ `responseFileFilter` (local ใน yokoten.js) — รับ image/*, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 20 MB ต่อไฟล์, สูงสุด 10 ไฟล์ต่อ response
- `API.post('/yokoten/respond', fd)` และ `API.put('/yokoten/respond/:id', fd)` — ส่ง FormData โดยตรง (`apiFetch` จะไม่ set Content-Type เมื่อ body เป็น FormData)

### Frontend State Variables
```js
let _topics         = [];    // each topic has deptResponse: {..., files:[]} | null
let _history        = [];    // dept's own responses
let _masterDepts    = [];    // from GET /master/departments
let _safetyUnits    = [];    // from GET /master/safety-units
let _deptCompletion = null;  // { topics, deptSummary } — admin only
let _dashConfig     = {};    // { pinnedDepts, pinnedUnits }
let _allResponses   = [];    // admin only
let _adminView      = 'topics'; // 'topics' | 'dept' | 'config'
let _filterAck      = '';    // '' | 'responded' | 'pending' | 'rejected'
```

### Admin Tabs (renderAdmin)
3 sub-tabs: `topics` (CRUD topics) | `dept` (dept completion + approve/reject) | `config` (dashboard pinned depts)

### Dept Filtering Utilities
```js
// กรอง deptSummary ให้เหลือเฉพาะแผนกที่อยู่ใน TargetDepts ของ topics อย่างน้อยหนึ่งหัวข้อ
_filterToTargetedDepts(deptSummary, topicsArr)

// กรอง deptSummary ให้เหลือเฉพาะแผนกใน TargetDepts ของ topic เดียว ([] = ทุกแผนก)
_getTopicTargetedDepts(deptSummary, topic)
```
- ใช้ใน: `_buildExecSection`, `_initDeptChart`, `_buildAdminDept`, `_buildAdminTopics`, `exportYokotenPDF`
- `TargetDepts = []` (ไม่ได้เลือก) หมายถึง "ทุกแผนก" — ต้องไม่ filter ออก

### HTML Description Utilities
```js
_sanitizeHtml(html)  // ใช้ render HTML ใน modal (_buildTopicModal) + RTE init/submit
_htmlToText(html)    // ใช้ truncate preview ใน cards, tables, PDF, data-attributes
```
- ห้ามสลับสองตัวนี้: `_sanitizeHtml` = ยังเป็น HTML, `_htmlToText` = แปลงเป็น plain text

### Rich Text Editor (openTopicForm)
Toolbar buttons ทั้งหมด:
- **Bold / Italic / Underline** — `execCommand`
- **Bullet list / Numbered list** — `execCommand`
- **Heading (H3) / Clear format** — `execCommand`
- **Align Left / Center / Right / Justify** — `execCommand('justifyLeft/Center/Right/Full')` + active state ด้วย `queryCommandState`
- **Insert Link** — บันทึก selection range → แสดง `#yt-rte-input-bar` → `execCommand('createLink')` + เพิ่ม `target="_blank"`
- **Remove Link** — `execCommand('unlink')`
- **Insert Image (URL)** — บันทึก selection range → แสดง `#yt-rte-input-bar` → `execCommand('insertImage')`

Pattern สำคัญ: link/image ต้องบันทึก selection ก่อนที่ focus จะออกจาก contenteditable แล้วค่อย restore เมื่อกด "แทรก"
```js
let _savedRange = _saveSelection();   // ก่อนแสดง input bar
_restoreSelection(_savedRange);       // ก่อน execCommand
```

CSS classes: `.rte-active` = alignment button ที่ active อยู่ (bg-sky-100); `.yok-rte-content img` / `.yok-rte-content a` — ใน `#yok-rte-style`

### History Tab — Admin Edit/Delete
- **Edit** (`.yok-hist-edit-btn`): inject response เป็น `deptResponse` บน topic copy → `openModal(_buildTopicModal(tWithResp))`
- **Delete** (`.yok-hist-del-btn`): confirm → `DELETE /yokoten/respond/:id` → `refreshData()`
- Non-admin users เห็น Edit เฉพาะ response ที่ถูก `rejected`

### GROUP BY / only_full_group_by Pitfall
ใช้ `SELECT r.* FROM YokotenResponses r WHERE r.Department = ?` แทน `SELECT r.*, GROUP_CONCAT(...) ... GROUP BY r.ResponseID` — TiDB ใช้ `sql_mode=only_full_group_by` โดยค่าเริ่มต้น; files ดึงแยกผ่าน `filesMap` อยู่แล้ว

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
| System Health | `health` | Module record counts, stale alert tables, readiness score, failed API 24h, audit activity 24h |
| Audit Log | `audit` | Admin-only audit trail for API mutations, summary strip, filterable by module/action/date/search |
| เป้าหมายกิจกรรม | `targets` | Activity Targets — 2 sub-tabs: เทมเพลตตามตำแหน่ง + กำหนดรายบุคคล |

State: `_currentTab`, `_calInst`, `_empCache`, `_deptCache`, `_teamCache`, `_empSearch`, `_empPage`, `_auditPage`, `_atActivities`, `_atPositions`, `_atSubTab`, `_atSelPosition`, `_atSelEmp`, `_atEmpTargets`

Navigation: `#employee` hash redirects → `#admin` + auto-switches to employees tab via `window._adminTab?.('employees')`

**Permission Matrix** (`permissions` tab): เรียก `GET /api/admin/permissions/matrix` → ได้ `{ matrix, roles, permissions, roleLabels }` — ใช้ `PUT /api/admin/permissions/matrix` กับ `{ role, permission, granted }` เพื่อ toggle สิทธิ์แต่ละคู่

### Admin Dashboard UX

`GET /api/admin/dashboard-stats` now returns:

- `actionRequired` — cross-module admin work queue for stale Patrol issues, 4M Change Notices, Hiyari reports, expired training, pending Yokoten, incomplete employee profiles, missing activity target templates, and failed API actions.
- `uxHealth` — readiness score derived from open high/medium/low admin risks.

`public/js/pages/admin.js` renders these above the KPI cards as the first Phase 1 UX improvement: the Admin Dashboard now acts as a command center before showing passive stats.

### Phase 1 UX Foundation Progress

- `public/js/pages/admin.js` — Admin Dashboard has Action Required + UX Health above passive KPIs.
- `public/js/pages/patrol.js` — Safety Patrol has a work focus strip for today check-in, open issues, temporary fixes, and next patrol.
- `public/js/pages/patrol.js` — Safety Patrol Issue `VIEW` mode now shows a read-first summary block for status, rank, overdue state, dates, owner, reporter, and finish date before the detailed form sections.
- `public/js/pages/fourm.js` — Change Notice tab has focus shortcuts for Open, Pending, and Overdue notices.
- `public/js/pages/search.js` — Employee Safety 360 has standardized empty/error states for search results, profile load, Patrol records, and activity timeline.
- `public/js/ui.js` — added `openDetailModal()` as an additive helper for standardized detail modals without changing existing `openModal()` behavior.
- `public/js/pages/fourm.js` — Change Notice detail now uses `openDetailModal()` as the first low-risk standardized detail modal.
- `public/js/pages/admin.js` — Audit Log table has a read-only Detail action using `openDetailModal()` to inspect path, target, status, IP/user-agent, and safe metadata.

### Phase 2 Form UX Standardization Progress

- `public/js/pages/ky.js` — KY detail view now uses the shared `openDetailModal()` wrapper and adds a read-first summary grid for status, risk, date, and participant count before the detailed fields.
- `public/js/pages/ky.js` — KY detail text fields and participant chips are escaped before rendering to reduce display/XSS risk from user-entered content.
- `public/js/pages/hiyari.js` — Hiyari detail view now uses the shared `openDetailModal()` wrapper and adds a read-first summary grid for status, Stop Type, Rank, and report date while keeping attachments and the Yokoten conversion shortcut intact.
- `public/js/pages/yokoten.js` — Yokoten topic detail and employee breakdown now use `openDetailModal()` with read-first summary grids for risk/response/deadline and completion/waiting/review counts.
- `public/js/pages/accident.js` — Accident reports table now has a read-only Detail action for all viewers; the detail modal uses `openDetailModal()` with incident type, severity, lost days, due date, root cause, action owner, and attachments while preserving admin-only edit/delete controls.
- `public/js/pages/accident.js` — Safety KPI Board now includes an executive summary strip for board status, days/hours target progress, safe months, accident months, and pending monthly status before the large KPI cards.
- `public/js/pages/ojt.js` — OJT department history now shows a read-first summary grid for current review status, latest OJT date, next review date, total attendees, and review interval before the history table.
- `public/js/pages/training.js` — Training department records now show a read-first summary strip for record count, total employees, passed count, average compliance, low-compliance departments, and no-data records before the records table.
- `public/js/pages/machine-safety.js` — Machine Safety now includes an enterprise summary strip for audit risk, high/critical risk machines, inspection due/overdue, risk assessment readiness, open issues, and restricted controls with quick filters.
- `public/js/pages/contractor.js` — Contractor dashboard now includes an enterprise summary strip for core document coverage, total documents, recent uploads, missing required categories, and repository size with document-tab shortcuts.
- `public/js/pages/safety-culture.js` — Safety Culture dashboard now includes an enterprise summary strip for culture readiness, weak topics, PPE compliance, PPE violations, and executive PDF shortcut.
- `public/js/pages/committee.js` — Committee page now includes an enterprise governance summary strip for current committee readiness, term control, core documents, sub-committee coverage, and admin manage shortcut.
- `public/js/pages/admin.js` — Employee master tab now includes an enterprise data-quality strip for missing core fields, department/position coverage, unit assignment, admin account count, and shortcuts to reference/permission controls.
- `public/js/pages/admin.js` — Reference / Master Data tab now includes a master-quality strip for master readiness, Safety Core unit coverage, duplicate master names, blank required names, loaded reference sets, and total master records.

- `public/js/pages/admin.js` — System Health now includes an enterprise readiness strip for pre-production readiness, failed API 24h, audit activity 24h, stale work, and missing/unreadable tables.
- `backend/routes/admin.js` — `GET /api/admin/system-health` now returns `readiness` and `audit` objects derived from module table availability, stale work queues, and Admin Audit Log activity.
- `public/js/pages/admin.js` — Audit Log now includes a summary strip for matched records, failures on current page, modules touched, active users, latest activity, and mutation count before the detailed table.

### Admin Audit Log

Audit logging is centralized in `backend/utils/audit.js`.

- `authenticateToken` attaches `attachAuditLogger(req, res)` so signed-in `POST`, `PUT`, `PATCH`, and `DELETE` API calls are logged automatically after the response finishes.
- Admin Console curated actions still call `auditLog()` in `backend/routes/admin.js`; those rows use clear action names such as `CREATE_EMPLOYEE`, `RESET_PASSWORD`, and set `req.auditLogged = true` to avoid duplicates.
- `Admin_AuditLogs` is auto-created and auto-migrated by `ensureAuditTable()`; no manual SQL is required for normal deployment.
- `GET /api/admin/audit-logs` supports `page`, `limit`, `action`, `module`, `adminId`, `q`, `dateFrom`, `dateTo` and returns `facets` for filter dropdowns.

### Pre-production Permission Regression

Run the static permission audit before production handoff:

```bash
cd backend
npm run permission:audit
npm run smoke:api
npm run uat:preflight
```

The audit scans `backend/server.js` and `backend/routes/*.js` for every `POST`, `PUT`, `PATCH`, and `DELETE` route. Expected categories:

- `ADMIN` — protected by route-level `isAdmin` or mounted under `/api/admin` with `isAdmin`.
- `INLINE_GUARD` — intentionally mixed workflow with owner/admin checks inside the handler, such as CCCF worker edit/delete, 4M notice close, Patrol issue save/delete, Self Patrol delete, and Yokoten response update.
- `USER_WORKFLOW` — intentionally allowed user actions such as login/register/change password/profile update, policy acknowledgement, CCCF submit, Hiyari submit, KY submit, 4M notice create, Patrol check-in, and Yokoten respond.
- `UNREVIEWED` — must be fixed or explicitly reviewed before release. The script exits non-zero if any appear.

Current verified result: `ADMIN=156`, `INLINE_GUARD=8`, `USER_WORKFLOW=15`, `UNREVIEWED=0`.

`npm run smoke:api` starts the Express app on a temporary local port and checks that public boot data loads, `/api/admin/*` rejects missing/User tokens, Admin token can read admin dashboard/audit log, normal User token can read policy page data, and User token cannot write master data.

`npm run uat:preflight` is the Phase 5 handoff check. It starts the Express app on a temporary local port and checks the main read surfaces across Dashboard, Master, Patrol, 4M, Hiyari, KY, CCCF, Machine Safety, OJT, Training, Accident, Yokoten, Safety Culture, Contractor, Activity Targets, Module Forms, Person Search, and Admin Console. It also confirms User tokens are blocked from Admin Console, Yokoten all-responses, and Safety Culture PPE violation admin views.

Current Phase 5 verified result: `83/83` UAT preflight checks passed. During Phase 5, `/api/yokoten/employee-completion` was fixed to use `Employees.EmployeeName` instead of the non-existent `Employees.Name` column.

Current table shape:
```sql
CREATE TABLE IF NOT EXISTS Admin_AuditLogs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    ActionTime  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    AdminID     VARCHAR(50)  NOT NULL,
    AdminName   VARCHAR(100),
    Role        VARCHAR(50),
    Department  VARCHAR(100),
    Module      VARCHAR(80),
    Action      VARCHAR(80)  NOT NULL,
    Method      VARCHAR(10),
    Path        VARCHAR(255),
    StatusCode  INT,
    TargetType  VARCHAR(80),
    TargetID    VARCHAR(100),
    Detail      TEXT,
    Metadata    TEXT,
    IPAddress   VARCHAR(80),
    UserAgent   VARCHAR(255),
    INDEX idx_action (Action),
    INDEX idx_admin (AdminID),
    INDEX idx_module (Module),
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

ไฟล์อ้างอิง (design system): `committee.js`, `patrol.js`, `kpi.js`, `cccf.js`, `profile.js`
> หมายเหตุ: `policy.js` ถูกแก้ไขเพื่อเพิ่ม RTE Description — ดู **Policy Module — Architecture** สำหรับรายละเอียด

### Restyle Status
| File | Status |
|------|--------|
| `kpi.js` | done (enterprise) |
| `committee.js` | done (enterprise) |
| `machine-safety.js` | done (enterprise) |
| `patrol.js` | done (enterprise) |
| `ojt.js` | done (enterprise) |
| `safety-culture.js` | done (enterprise) |
| `profile.js` | done (enterprise — slide-over drawer) |
| `hiyari.js` | done (enterprise) |
| `ky.js` | done (enterprise) |
| `fourm.js` | done (enterprise) |
| `yokoten.js` | done (enterprise) |
| `accident.js` | done (enterprise) |
| `training.js` | done (enterprise) |
| `contractor.js` | done (enterprise) |
| `policy.js` | done (enterprise + RTE Description) |
| `admin.js` | done (enterprise) |

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

## Safety Culture Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `SC_Principles` | 7 หลักการ (seed ใน `ensureTables()` ครั้งแรก) — `PrincipleID VARCHAR(36) PK`, `SortOrder`, `Title`, `Description`, `ImageUrl`, `AttachmentUrl`, `AttachmentName` |
| `SC_Assessments` | ผลการประเมินวัฒนธรรม — `AssessmentID UUID PK`, `AssessmentYear`, `AssessmentDate DATE`, `WeekNo TINYINT`, `Area`, `T1_Score–T5_Score, T7_Score DECIMAL(5,2)` (0–100%), `Notes`, `CreatedBy` |
| `SC_Assessment_Points` | บันทึกรายจุดตรวจ (TotalPeople/ComplyPeople/Pct) ต่อ AssessmentID+TopicKey |
| `SC_PPEInspections` | บันทึกการตรวจ PPE — `InspectionID UUID PK`, `InspectionDate`, `Department`, `InspectorID/Name`, `InspectedEmployeeID/Name`, `WorkTypeID`, `IsPass TINYINT(1)`, `IsUnregistered`, `CompliancePct`, `deleted_at` (soft delete) |
| `SC_PPE_Inspection_Details` | รายการ PPE ต่อ inspection — `DetailID UUID PK`, `InspectionID`, `ItemID`, `Status ENUM('compliant','non-compliant','na')` — UNIQUE FK → SC_PPEInspections |
| `SC_PPE_Items` | รายการ PPE ที่ตรวจ (admin-configurable) — seed 6 รายการเริ่มต้น; `ItemID UUID PK`, `ItemName`, `SortOrder`, `IsActive` |
| `SC_PPE_WorkTypes` | ประเภทงาน/พื้นที่ (admin-configurable) — กำหนด PPE set ที่ต้องการ |
| `SC_PPE_WorkType_Items` | กำหนด ItemID ที่ต้องการต่อ WorkTypeID — `UNIQUE KEY uq_wt_item` |
| `SC_PPE_Violations` | บันทึกการฝ่าฝืน PPE ต่อพนักงาน — `ViolationID UUID PK`, `EmployeeID`, `ViolationNo`, `WarningLevel ENUM('verbal','safety_notice','written_warning')`, `InspectionID`, `ViolationDate`, `deleted_at` |
| `SC_PPE_AuditLog` | บันทึก mutation ของ PPE (Create/Update/Delete) — `Action`, `EntityType`, `EntityID`, `UserID`, `Detail TEXT` |

### Score Scale Migration
- เดิม: T1–T5, T7 บันทึก scale 1–5
- ปัจจุบัน: scale 0–100% (`DECIMAL(5,2)`)
- `ensureTables()` ทำ one-time `UPDATE SC_Assessments SET Tx_Score = Tx_Score * 20 WHERE Tx_Score <= 5` (safe re-run — condition guards แถวที่ migrate แล้ว)

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /safety-culture/principles` | User | ดึง 7 หลักการ (seed ถ้าว่าง) |
| `PUT /safety-culture/principles/:id` | Admin | แก้ไข principle (title, description, imageUrl, attachmentUrl) |
| `GET /safety-culture/assessments?year=` | User | รายการประเมินรายปี + details |
| `POST /safety-culture/assessments` | Admin | บันทึกประเมินใหม่ (body: AssessmentYear, AssessmentDate, WeekNo, Area, T1–T5+T7 scores 0–100, Notes) |
| `PUT /safety-culture/assessments/:id` | Admin | แก้ไขประเมิน |
| `DELETE /safety-culture/assessments/:id` | Admin | ลบประเมิน |
| `GET /safety-culture/ppe-items` | User | รายการ PPE ทั้งหมด (IsActive=1) |
| `POST /safety-culture/ppe-items` | Admin | เพิ่ม PPE item |
| `PUT /safety-culture/ppe-items/:id` | Admin | แก้ไข PPE item |
| `DELETE /safety-culture/ppe-items/:id` | Admin | ลบ PPE item (soft — IsActive=0) |
| `GET /safety-culture/ppe-work-types` | User | รายการ work type + items ที่ผูกไว้ |
| `POST /safety-culture/ppe-work-types` | Admin | เพิ่ม work type |
| `PUT /safety-culture/ppe-work-types/:id` | Admin | แก้ไข work type + item mapping |
| `DELETE /safety-culture/ppe-work-types/:id` | Admin | ลบ work type |
| `GET /safety-culture/ppe-violations` | Admin | รายการ violations (filterable) |
| `GET /safety-culture/ppe-violations/summary` | Admin | สรุป violations รายพนักงาน |
| `POST /safety-culture/ppe-violations` | Admin | บันทึก violation ใหม่ (body: EmployeeID, ViolationDate, WarningLevel, Note) |
| `DELETE /safety-culture/ppe-violations/:id` | Admin | soft delete violation (deleted_at) |
| `GET /safety-culture/ppe-inspections?year=&month=&dept=` | User | รายการ inspection + details + violations |
| `POST /safety-culture/ppe-inspections` | Admin | บันทึก inspection ใหม่ (JSON body: InspectionDate, WorkTypeID, InspectedEmployeeID/Name, IsUnregistered, items: [{ItemID, Status}], violations: [{...}]) — เขียน Details + Violations + AuditLog ใน transaction |
| `PUT /safety-culture/ppe-inspections/:id` | Admin | แก้ไข inspection (rebuild Details) |
| `DELETE /safety-culture/ppe-inspections/:id` | Admin | soft delete (`deleted_at = NOW()`) |
| `GET /safety-culture/dashboard?year=` | User | KPI dashboard — `{ avgScores, ppeStats: { overall_pct, itemBreakdown }, yearTrend }` |

### `GET /dashboard` — Response Shape
```js
{
  avgScores: { avg_t1, avg_t2, avg_t3, avg_t4, avg_t5, avg_t7 },  // AVG per topic for year
  ppeStats: {
    overall_pct,   // AVG(CompliancePct) from SC_PPEInspections
    itemBreakdown: [{ ItemID, ItemName, SortOrder, ok_count, total_count }]  // from Details JOIN Items
  },
  yearTrend: [{ AssessmentYear, avg_score, record_count }],  // NULL-aware avg across all years
  year       // the requested year
}
```
- `yearTrend.avg_score` ใช้ `NULLIF(sum_of_IS_NOT_NULL, 0)` เป็น divisor — หารเฉพาะคอลัมน์ที่มีค่า ป้องกัน COALESCE(col,0) ทำ avg ต่ำกว่าจริง (ดู pitfall #79)

### Frontend Tabs (4 tabs)
| Tab ID | Label | เนื้อหา |
|--------|-------|---------|
| `principles` | วัฒนธรรมความปลอดภัย | 7 card หลักการ + KPI strip (4 badges) + Recent Activity panel (assessment + PPE rows) |
| `dashboard` | Dashboard | Hero stats strip (sync กับ month/year filter), Radar+Bar+Line charts, dept breakdown |
| `assessment` | ผลการประเมิน | ตารางประเมิน + CRUD form (Admin), PDF export per record |
| `ppe` | PPE Control | sub-tabs: dashboard / records / violations / work-types / items (Admin) |

### State Variables
```js
let _assessments    = [];    // SC_Assessments rows (with details)
let _ppeInspections = [];    // SC_PPEInspections rows (with details array)
let _ppeItems       = [];    // SC_PPE_Items (active)
let _ppeViolations  = [];    // SC_PPE_Violations rows
let _ppeWorkTypes   = [];    // SC_PPE_WorkTypes (with items)
let _scAreas        = [];    // distinct Area values from assessments
let _dashData       = null;  // GET /dashboard response
let _dashScores     = null;  // [T1,T2,T3,T4,T5,T6(PPE),T7] computed by buildDashboardHtml()
let _dataLoaded     = false; // true after first _loadHeroStats() success — skeleton guard
let _departments    = [];    // lazy-cached from GET /master/departments
let _filterYear     = new Date().getFullYear();
let _filterDashMonth = 0;   // 0=รายปี, 1-12=เดือน
let _filterPPEDept  = '';
let _ppeSub         = 'dashboard'; // PPE tab sub-panel
let _ppeSearch      = '';
let _ppeFilterWT    = '';
let _ppeFilterStatus = '';
```

### Score Colors & Thresholds
| Range | Color | Meaning |
|-------|-------|---------|
| `>= 90%` | `#059669` (green) | ผ่าน |
| `>= 70%` | `#d97706` (amber) | ควรปรับปรุง |
| `< 70%` | `#ef4444` (red) | ต้องแก้ไขด่วน |
| `0 / null` | `#cbd5e1` (gray) | ไม่มีข้อมูล |

`getMaturity(avg)`:
- ≤ 40% → Reactive (red), ≤ 60% → Basic (amber), ≤ 80% → Proactive (blue), > 80% → Generative (emerald)

### Dashboard Sync (`_updateHeroStats`)
`window._scSetDashMonth(v)` → sets `_filterDashMonth` → calls `_updateHeroStats()` + `renderPanel('dashboard')`

`_updateHeroStats()` recomputes 4 `[data-sc-stat]` badges from filtered data:
- stat[0]: maturity label
- stat[1]: avg score %
- stat[2]: PPE compliance % (from filteredPPE pass rate; fallback to `_dashData.ppeStats.overall_pct` when mo=0)
- stat[3]: PPE inspection count

### `renderPanel()` Skeleton Guard
```js
function renderPanel(id) {
    if (!_dataLoaded) { panel.innerHTML = _buildSkeleton(id); return; }
    // ... render real content
}
```
`_dataLoaded` set to `true` after first successful `_loadHeroStats()` — skeleton shown in all tabs before data arrives.

### Dashboard PDF (`exportPDF`) — html2canvas Approach
- **เหตุผล**: jsPDF built-in fonts (Helvetica/Times) ไม่มี Thai Unicode glyphs — ข้อความไทยแสดงเป็น `!#2!` / garbage
- **แนวทาง**: render HTML ด้วย browser (Kanit font โหลดอยู่แล้วใน index.html) → capture ด้วย `html2canvas` → embed JPEG ใน jsPDF
- **SVG chart helpers** (ไม่ต้องพึ่ง Chart.js instance): `_svgBar(scores, labels, w, h)`, `_svgRadar(scores, labels, size)`, `_svgLine(trend, w, h)`
- **3 หน้า** (794×1122px ต่อหน้า, scale:2):
  - หน้า 1: Cover header (gradient) + 8 KPI boxes (2 แถว) + score summary table + key insights
  - หน้า 2: PPE per-item table + dept breakdown table + violations summary boxes + violations table
  - หน้า 3: Bar SVG + Radar SVG + year trend table + line SVG + improvement suggestions + executive summary box
- **Footer**: `รายงานวัฒนธรรมความปลอดภัย · Thai Summit Harness Co., Ltd. | หน้า X จาก 3 | สร้างเมื่อ DD MMM YY`
- **ชื่อไฟล์**: `Safety_Culture_YYYY.pdf` หรือ `Safety_Culture_YYYY_MM.pdf` (ตาม year/month filter)
- ห้ามใช้ `_pdfKpiBoxRow` / `_pdfDeptBars` / `_pdfSectionHeader` ใน dashboard PDF — ฟังก์ชันเหล่านี้ถูกลบแล้ว (ใช้ได้เฉพาะ Assessment PDF หากยังเหลืออยู่)

### Assessment PDF (`window._scExportAssessmentPDF`)
- ใช้ jsPDF text-based (ไม่มีปัญหา Thai เพราะ field ส่วนใหญ่เป็น label ภาษาอังกฤษ + ตัวเลข)
- helpers: `_asmtPdfHeader`, `_asmtPdfScoreTable`, `_pdfMonthlySummary` — อยู่หลัง `// ── Assessment PDF helpers` (line ~3021+)
- เรียกจาก assessment tab ไม่ใช่จาก `exportPDF()` ของ dashboard

### PPE Inspection Form — Data Flow
1. Admin เลือก WorkType → system โหลด items ที่ผูกไว้ (`SC_PPE_WorkType_Items`)
2. Admin เลือก employee (search หรือ IsUnregistered=1 สำหรับบุคคลภายนอก)
3. ต่อ item: เลือก `compliant` / `non-compliant` / `na`
4. `IsPass` = `CompliantItems / TotalCheckedItems >= threshold` (คำนวณ backend)
5. `CompliancePct` = `compliant / (compliant + non-compliant) * 100` (ไม่รวม na)
6. POST body: `{ InspectionDate, WorkTypeID, InspectedEmployeeID, InspectedEmployeeName, IsUnregistered, Department, items: [{ItemID, Status}], violations: [{EmployeeID, WarningLevel, Note}] }`
7. Backend เขียน `SC_PPEInspections` + `SC_PPE_Inspection_Details` + `SC_PPE_Violations` + `SC_PPE_AuditLog` ใน transaction

### `SC_PPE_Inspection_Details.Status` Constraint
- ค่าที่รับได้: `'compliant'`, `'non-compliant'`, `'na'` (lowercase เท่านั้น)
- `ensureTables()` normalize legacy uppercase values ก่อน add CHECK constraint
- `na` = ไม่นับใน compliance % — ใช้สำหรับ item ที่ไม่เกี่ยวข้องกับงานนั้น

### Soft Delete Pattern (PPE)
- `SC_PPEInspections.deleted_at` และ `SC_PPE_Violations.deleted_at`
- DELETE endpoints → `UPDATE ... SET deleted_at = NOW()`
- ทุก GET query ต้องมี `WHERE deleted_at IS NULL`

## Contractor Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Contractor_Documents` | เอกสารผู้รับเหมา — `id UUID PK`, `Title`, `Category`, `Description`, `FileUrl`, `PublicID`, `FileType`, `FileSize`, `UploadedBy`, `UploadedAt`, `UpdatedAt` |
| `Contractor_Activity_Log` | บันทึกการกระทำ (upload/edit/delete) — `ActionType`, `DocID`, `DocTitle`, `Category`, `ActorName`, `CreatedAt` |

ทั้งสองตารางสร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN` (try/catch) ใน `ensureTables()` ของ `backend/routes/contractor.js`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /contractor/documents` | User | รายการเอกสารทั้งหมด — filter params: `category`, `q`, `dateFrom`, `dateTo` |
| `GET /contractor/documents/stats` | User | สรุป: `{ total, byCategory: [{Category, cnt}], recentCount }` (30 วันล่าสุด) |
| `GET /contractor/activity?limit=` | User | ประวัติกิจกรรมล่าสุด (สูงสุด 50 รายการ) |
| `POST /contractor/documents` | Admin | อัปโหลดเอกสาร (multer + Cloudinary, field: `file`, สูงสุด 20 MB) |
| `PUT /contractor/documents/:id` | Admin | แก้ไข metadata (Title, Category, Description) |
| `DELETE /contractor/documents/:id` | Admin | ลบเอกสาร + Cloudinary cleanup (fire-and-forget) + log |

### Frontend Architecture (`public/js/pages/contractor.js`)

#### Service Layer
```js
const ContractorService = {
    getDocs()           // GET /contractor/documents — all docs, no filter params
    getStats()          // GET /contractor/documents/stats
    getActivity(limit)  // GET /contractor/activity?limit=
    upload(formData)    // POST /contractor/documents
    update(id, data)    // PUT /contractor/documents/:id
    remove(id)          // DELETE /contractor/documents/:id
}
```
API calls อยู่ใน `ContractorService` เท่านั้น — ห้าม call `API.*` จาก UI functions โดยตรง

#### Cache (TTL 5 นาที)
```js
const _cache = { get(key), set(key, val), del(...keys) }
// CACHE_TTL = 5 * 60 * 1000
// Keys: 'docs', 'stats', 'activity'
// Invalidate ทั้ง 3 keys หลัง upload/edit/delete ทุกครั้ง
```

#### Centralized State
```js
const _state = {
    docs: [],          // full list from API (client-side filter/sort/paginate)
    stats: null,       // { total, byCategory, recentCount }
    activity: [],      // Contractor_Activity_Log rows
    isAdmin: false,    // from TSHSession.getUser().role === 'Admin'
    activeTab: 'dashboard' | 'documents',
    page: 1,
    filter: { category, query, dateFrom, dateTo, sortBy }
}
```

#### Data Loading (partial-failure tolerant)
```js
async function _loadAll(force = false)   // Promise.allSettled — continues even if 1 of 3 fetches fails
async function _reload()                 // cache.del all 3 keys → _loadAll(true); returns !anyFailed
```
- `_loadAllInFlight` flag ป้องกัน concurrent calls (second call returns immediately)
- Returns `true` = all OK, `false` = partial failure — caller shows appropriate toast

#### Tabs
| Tab | ID | Content |
|-----|----|---------|
| ภาพรวม | `dashboard` | Hero stats + category breakdown + external systems + recent uploads + activity log |
| เอกสาร | `documents` | Filter bar + document grid (12/page) + pagination |

### Filters & Pagination
- **Client-side filtering** — `_state.docs` loaded once; `_getFilteredDocs()` pure function (no DOM side-effects)
- Filter fields: `category` chip, `query` (title+description, debounce 300 ms), `dateFrom`, `dateTo`, `sortBy` (newest/oldest/A–Z)
- `PAGE_SIZE = 12`, smart ellipsis pagination (max 7 visible page buttons)
- `_state.page` clamped to `Math.max(1, Math.ceil(total / PAGE_SIZE))` on every grid render — ป้องกัน empty grid หลัง delete

### Clickable KPI Cards
Hero stats strip cards ที่มี `data-filter-cat` จะ navigate ไป documents tab และ set `_state.filter.category` อัตโนมัติ

### Optimistic Delete
1. `await ContractorService.remove(id)` — wait for API confirm
2. `_state.docs.filter(...)` — remove locally
3. `_cache.del(...)` — invalidate
4. Background: `_loadStats(true)` + `_loadActivity(true)` — sync counts without full re-render

### RBAC
- `_state.isAdmin` read once ใน `loadContractorPage()` จาก `TSHSession.getUser()`
- Upload button, edit/delete buttons ใน card: render เมื่อ `_state.isAdmin` เท่านั้น
- Backend enforces `isAdmin` middleware บน POST/PUT/DELETE ทุก route

### Production Hardening (fixes applied)
| Risk | Fix |
|------|-----|
| Empty grid after delete on non-first page | Clamp `_state.page` ≤ `maxPage` ใน `_buildDocGridContent` |
| Concurrent `_loadAll()` race condition | `_loadAllInFlight` boolean flag, wrapped in try/finally |
| Success toast despite partial API failure | `_loadAll` returns `!anyFailed`; refresh handler shows warning toast on partial failure |
| Drag-and-drop bypasses `accept` attribute | `ALLOWED_MIME_TYPES` Set checked in `_validateUploadForm` before upload starts |
| Date filter off-by-one near midnight (UTC vs local) | `_toDateStr(val)` converts via `Date.getFullYear/Month/Date` (local time) for lexicographic string compare |
| Double-click upload opens duplicate submit handlers | `data-opening` debounce flag (500 ms) on upload button |

### Categories
`ALLOWED_CATEGORIES` (backend) = `['Contractor Policy', 'Work Permit', 'Safety Procedure', 'Training', 'Forms', 'ทั่วไป']`
`CAT_META` (frontend) — map category → `{ label, bg, text, dot }` Tailwind classes

### External Systems (hardcoded in EXTERNAL_SYSTEMS const)
- **Contractor Online** — `https://dev.tshpcl.com/contractor/login.php`
- **Supplier E-Pass** — `https://dev.tshpcl.com/epass/login.php`
แสดงใน dashboard tab ไม่มี separate tab (merged by design)

## Hiyari Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `HiyariReports` | รายงาน near-miss หลัก — `Rank VARCHAR(1)`, `StopType INT`, `RiskLevel` (derived from Rank via `RANK_TO_RISK` for backward-compat), `AttachmentUrl`, `AdditionalFileUrl`, `CorrectiveAction`, `AdminComment`, `ClosedAt`, `ClosedBy` |
| `Hiyari_Dashboard_Config` | Key/value config — `pinnedDepts` (JSON array) บันทึกโดย admin เพื่อกำหนดแผนกที่แสดงใน dashboard |
| `Hiyari_Assignments` | รายการมอบหมาย — `EmployeeID`, `AssigneeName`, `Department`, `DueDate`, `Note`; UNIQUE KEY `uq_emp (EmployeeID)` |

ทุกตารางสร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` (try/catch) ใน `ensureTables()` ของ `backend/routes/hiyari.js`

### Constants (ทั้ง frontend + backend ต้องตรงกัน)
```js
// Frontend: public/js/pages/hiyari.js
const STOP_TYPES = [
    { id:1, code:'Stop 1', label:'อันตรายจากเครื่องจักร',        color:'#ef4444', bg:'#fef2f2', border:'#fecaca' },
    { id:2, code:'Stop 2', label:'อันตรายจากวัตถุหนักตกใส่',    color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
    { id:3, code:'Stop 3', label:'อันตรายจากยานพาหนะ',          color:'#eab308', bg:'#fefce8', border:'#fef08a' },
    { id:4, code:'Stop 4', label:'อันตรายจากการตกจากที่สูง',    color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
    { id:5, code:'Stop 5', label:'อันตรายจากไฟฟ้า',             color:'#3b82f6', bg:'#eff6ff', border:'#bfdbfe' },
    { id:6, code:'Stop 6', label:'อันตรายอื่นๆ',                color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' },
];
const RANKS = [
    { rank:'A', label:'Rank A', desc:'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail:'7 วัน',  color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
    { rank:'B', label:'Rank B', desc:'บาดเจ็บหยุดงาน',                   detail:'15 วัน', color:'#ea580c', bg:'#fff7ed', border:'#fed7aa' },
    { rank:'C', label:'Rank C', desc:'บาดเจ็บเล็กน้อย ไม่หยุดงาน',      detail:'30 วัน', color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
];
// Backend: backend/routes/hiyari.js
const RANK_TO_RISK = { A: 'Critical', B: 'High', C: 'Low' };
```

### Backend Route Ordering (Critical)
ต้องประกาศ specific routes **ก่อน** `/:id` เสมอ — Express v5 จะ match literal strings เป็น `:id` ถ้าประกาศหลัง:
1. `GET /stats`
2. `GET /dashboard-config`, `PUT /dashboard-config` (isAdmin)
3. `GET /assignments`, `POST /assignments` (isAdmin)
4. `PUT /assignments/:id` (isAdmin) — ก่อน `PUT /:id`
5. `DELETE /assignments/:id` (isAdmin) — ก่อน `DELETE /:id`
6. `GET /:id`, `PUT /:id`, `DELETE /:id`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /hiyari/stats?year=` | User | KPI + monthly + stopDist + rankDist + deptRank (top 20) + consequence |
| `GET /hiyari` | User | รายการรายงาน — filter params: `status`, `risk`, `dept`, `year`, `q` |
| `GET /hiyari/:id` | User | รายงานเดี่ยว |
| `POST /hiyari` | User | ส่งรายงาน (multipart: `attachment`) — backend validates `StopType` (1–6), `Rank` (A/B/C), derives `RiskLevel` |
| `PUT /hiyari/:id` | Admin | อัปเดต `Status`, `CorrectiveAction`, `AdminComment` |
| `POST /hiyari/:id/attachment` | Admin | อัปโหลดไฟล์เพิ่มเติม (admin file — `AdditionalFileUrl`) |
| `DELETE /hiyari/:id` | Admin | ลบรายงาน |
| `GET /hiyari/dashboard-config` | User | `{ pinnedDepts: [] }` |
| `PUT /hiyari/dashboard-config` | Admin | บันทึก `{ pinnedDepts: [...] }` |
| `GET /hiyari/assignments` | User | รายการมอบหมายทั้งหมด |
| `POST /hiyari/assignments` | Admin | เพิ่ม assignment (duplicate guard via UNIQUE KEY) |
| `PUT /hiyari/assignments/:id` | Admin | แก้ไข assignment |
| `DELETE /hiyari/assignments/:id` | Admin | ลบ assignment |

### Frontend Tab Structure
4 tabs: `dashboard` | `submit` (รายงานใหม่) | `history` (ประวัติ) | `manage` (admin only)

**Dashboard tab:**
- Toolbar: year picker + Export PDF button (`#hiyari-pdf-btn`)
- KPI cards (4): รายงานทั้งหมด / รอดำเนินการ / กำลังดำเนินการ / ปิดแล้ว
- Stop chart: `renderStopChart(data.stopDist)` — Chart.js bar, colors from `STOP_TYPES`
- Rank summary: `renderRankSummary(data.rankDist)` — horizontal progress bars
- Monthly line chart + Consequence pie chart
- Dept section: admin ตั้งค่าได้ (`#hiyari-dept-config-btn` → `openDashConfigModal()`); user เห็น pinned depts หรือ top 8

**New Report tab (Submit):**
- Stop Type card-radio: `grid grid-cols-2 sm:grid-cols-3 gap-2` — 6 cards จาก `STOP_TYPES`
- Rank card-radio: `grid grid-cols-1 sm:grid-cols-3 gap-2` — 3 cards จาก `RANKS`
- Date label: **"Created Date"** (ไม่ใช่ "วันที่เกิดเหตุ" หรือ "วันที่สร้าง")
- Validation: require `StopType` + `Rank` ก่อน submit (JS check บน hidden radio — ไม่ใช้ `required` attribute)
- File: `input[name="attachment"]` — CCCF file pattern (`file:bg-orange-50 file:text-orange-700`)

**History tab:**
- Columns: วันที่ / ผู้รายงาน / แผนก / **Stop Type** (badge inline style) / **Rank** (badge — fallback to RiskLevel for legacy) / สถานะ / actions
- Filter: สถานะ + "Rank" dropdown (options: ทุก Rank / Rank A=Critical / Rank B=High / Rank C=Low → maps to backend `risk` param)
- Stop badge: `style="background:${st.bg};color:${st.color};border:1px solid ${st.border}"` — ไม่ใช้ Tailwind arbitrary

**Manage tab (admin):**
- Section 1: Assignment manager (table + Add/Edit/Delete via `openAssignmentModal()`)
- Section 2: Reports table — columns: วันที่ / ผู้รายงาน+แผนก / รายละเอียด+Stop badge / Rank / สถานะ / actions
- `showManageModal(id)`: อัปเดต Status + CorrectiveAction + AdminComment + optional file replace

### Backward Compatibility Rules
- **Legacy records** (ก่อน Rank/StopType): มีเฉพาะ `RiskLevel` — แสดง `RISK_BADGE[r.RiskLevel]` fallback ในทุก tab
- **New records**: มี `Rank` + `StopType` + `RiskLevel` (derived) — แสดง RANK_BADGE + Stop badge
- History Rank filter maps to `risk=Critical/High/Low` — ทำงานกับทั้งเก่าและใหม่
- Yokoten button ใน detail modal: `['A','B'].includes(r.Rank) || ['High','Critical'].includes(r.RiskLevel)`

### Detail Modal (showDetailModal)
- Header block: Status badge + Stop badge + Rank badge (fallback RiskLevel)
- Info grid: Stop Type row (code + full label), Rank row (label + desc + days)
- File section: แยก `AttachmentUrl` (reporter) + `AdditionalFileUrl` (admin)
- Yokoten button: แสดงเมื่อ Rank A/B หรือ RiskLevel High/Critical

### PDF Export (exportHiyariPDF)
- html2canvas + jsPDF, scale:1.5, 2 หน้า A4 (794×1122px)
- หน้า 1: gradient header + 4 KPI boxes + Stop distribution bars + Rank distribution bars
- หน้า 2: Monthly trend table (12 cols) + Dept summary table + progress bars
- Dept data: filter ตาม `_dashConfig.pinnedDepts` ถ้าตั้งค่าไว้, fallback top 8
- Library check: `typeof html2canvas === 'undefined' || typeof jspdf === 'undefined'`
- Footer pattern: "หน้า X จาก 2" บน orange bar

### UI Rules (ต้องตรงกับ CCCF Form A Permanent)
- Input class: `form-input w-full rounded-xl text-sm`
- Select class: `form-select w-full rounded-xl text-sm`
- Layout: `grid grid-cols-2 gap-3`, `space-y-4 px-1`
- Card-radio: `peer hidden` + `peer-checked:ring-2 peer-checked:ring-orange-300`
- Banner: `bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800`
- Submit/Save buttons: `style="background:linear-gradient(135deg,#f97316,#ef4444)"`
- Module accent color: **orange** (`#f97316 → #ef4444`) — ห้ามใช้สีอื่น
- Stop/Rank badges: ใช้ inline `style=` ไม่ใช้ Tailwind arbitrary values (CDN ไม่ compile)

### State Variables
```js
let _chartStop   = null;   // Chart.js instance for Stop bar chart
let _chartRank   = null;   // (unused — rank uses HTML, not canvas)
let _dashConfig  = { pinnedDepts: [] };  // loaded from GET /hiyari/dashboard-config
let _assignments = [];     // loaded from GET /hiyari/assignments
```

### escHtml Requirement
ทุก user-generated content ใน innerHTML ต้องผ่าน `escHtml()` — import จาก `../ui.js`

## Hiyari Module — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: Executive Summary Strip, clickable KPI cards (filter History), overdue alert strip, monthly trend, consequence chart, STOP×Rank matrix, SLA Compliance Gauge, Top Overdue/Near Due list, Department Risk Ranking, Near-Miss Heatmap, pinned dept summary
- **KPI basis**: assignment-driven — total/submitted/pending/in-progress/closed/closure rate calculated against assigned employees (not raw report count)
- **SLA**: Rank A=7d, B=15d, C=30d — overdue rows: light red + "เกิน X วัน" badge; near-due: light amber + "เหลือ X วัน"
- **Submit**: full-width 3-step wizard (Stop Type → Details → Recommendation+Attachment), image preview before upload
- **History**: main admin control surface — view/filter/edit/delete/update status/export; clickable KPI cards auto-filter here; date range filter overrides year filter
- **Manage**: assignment-focused (roster + progress + dept summary) + **แบบฟอร์มที่เกี่ยวข้อง** section (Module Forms admin)
- **PDF**: 4-page executive pack (Executive Summary / Trend+STOP×Rank / Dept Risk / Action Follow-up)
- **Backend UUID**: use `crypto.randomUUID()` — installed `uuid` package is ESM-only

### Hiyari UX Rules

- Tabs: Dashboard=insight, Submit=report creation, History=report control, Manage=assignment+forms
- Hiyari accent color: orange (`#f97316 → #ef4444`)
- Stop/Rank badges: inline `style=` — ไม่ใช้ Tailwind arbitrary values

## KY Activity — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: executive alert strip, clickable KPI cards → filtered History, executive summary cards, Department Coverage progress (from `KY_Program_Config`), Recurring Hazard Pattern chart (top KYT Keywords), Dept×Month heatmap
- **Submit**: full-width form (wider enterprise grid), hazard/countermeasure side-by-side, attachment+video preview+clear, employee typeahead search for participants, yearly target progress strip, **แบบฟอร์มที่ต้องกรอก** card above attachment area
- **History**: main admin surface — year/dept/status/risk/date-range filters, KPI card clicks auto-filter; when `_filterHistDept='all'` and config exists, passes `depts=configDepts.join(',')` to backend; date range overrides year/month param
- **Manage**: 2 sub-tabs: `coverage` (per-dept yearly target progress bars + action queue) and `config` (KY_Program_Config CRUD + **แบบฟอร์มที่เกี่ยวข้อง** section)
- **PDF**: 4-page executive pack (Executive Summary / Trend+Risk / Dept Coverage with yearly targets / Action Follow-up)
- **Backend**: `KY_Program_Config` table (per-dept yearly target + deadline + safety units + IsActive), `topKeywords` in `/stats`, `dateFrom`/`dateTo` params on `GET /ky`

### KY Specific Patterns
- `_kyProgConfig` — cached per year; cleared and re-fetched when year filter changes
- `_filterHistYear` change handler calls full `renderHistory(container)` (not just `fetchAndRenderHistory`) to refresh banner + dept dropdown
- `_manageSub` state: `'coverage'` | `'config'`
- KY accent color: indigo (`#6366f1 → #8b5cf6`)

### KY_Program_Config Table
```sql
CREATE TABLE IF NOT EXISTS KY_Program_Config (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    Year         YEAR        NOT NULL,
    Department   VARCHAR(100) NOT NULL,
    SafetyUnits  TEXT,          -- JSON array of unit names
    YearlyTarget INT NOT NULL DEFAULT 12,
    DeadlineDay  TINYINT,       -- day-of-month (1–31)
    DeadlineNote VARCHAR(200),
    IsActive     TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_year_dept (Year, Department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4M Change Management — 2026 Final Architecture

### Completed Scope (Final)

- **Dashboard**: Executive alert strip (overdue items), clickable KPI cards → filtered Notices, monthly line chart, Change Type pie chart, dept bar chart, Dept × Change Type matrix, plus Quick Access for external systems and module forms.
- **Change Notice tab**: Main admin/user surface — year/dept/status/overdue filters, overdue row highlighting (>30 days open/pending), Excel export (SheetJS), user create/close notice with file attachment, admin edit/delete/manage status for all notices.
- **Man Record tab**: Year filter, employee training/qualification records, admin-only create/edit/delete flow.
- **Backend**: `OVERDUE_DAYS=30` constant, auto-generated `NoticeNo`, login user as `ResponsiblePerson`, `overdueCount` + `byDeptType` in stats, `overdue=1` query param on GET /notices, `_handleUpload(field)` factory wrapping multer errors → JSON 400

### Tabs (order)
| Tab | ID | Description |
|-----|----|-------------|
| Dashboard | `dashboard` | KPI overview, alert strip, charts, dept matrix |
| Change Notice | `notices` | Main record surface — filter/create/close/export; users create and close own notices, admins can edit/delete/status-manage all notices |
| Man Record | `man` | Employee qualification tracking; admin-only create/edit/delete |

### Tables (existing — managed by dedicated routes)
| Table | Purpose |
|-------|---------|
| `FourM_ChangeNotices` | Change Notice records — `NoticeNo` (backend auto-generated as `4M-YYYY-###` from `RequestDate`), `Title`, `ChangeType` (Man/Machine/Material/Method), `Department`, `RequestDate`, `Status` (Open/Pending/Closed), `ResponsiblePerson` (login user on create), `AttachmentUrl`, `ClosingDoc`, `ClosedDate`, `ClosingComment`, `CreatedBy` |
| `FourM_ManRecords` | Man Record (employee training/qualification) — `RecordDate`, `EmployeeID`, `EmployeeName`, `Department`, `TestType`, `Score`, `Status` (Pass/Fail/Pending), `Remarks`, `ClosedDate`, `CreatedBy` |

### Backend Constants
```js
const OVERDUE_DAYS = 30;  // Open/Pending notices older than this are "overdue"
```

### Stats Response Shape (`GET /fourm/stats?year=`)
```js
{
  noticeKpi: { total, open, pending, closed },
  byType:    [{ ChangeType, count }],               // for pie chart
  monthly:   [{ month, count }],                    // for line chart
  byDept:    [{ Department, count }],               // for bar chart
  manSummary:{ total, pass, fail, pending },
  overdueCount: <number>,                           // Open/Pending > OVERDUE_DAYS
  byDeptType: [{ Department, ChangeType, count }]   // for Dept×Type matrix
}
```

### Overdue Filter (`GET /fourm/notices?overdue=1`)
- `overdue=1` overrides `status` filter: `AND Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30`
- Frontend: row with `daysOld > OVERDUE_DAYS` → inline `style="background:rgba(254,242,242,0.7)"` + "ค้าง X วัน" badge
- Status dropdown has special option `<option value="overdue">ค้างนาน (>30 วัน)</option>` that sets `_noticeFilter.overdue=true`

### Dept × Change Type Matrix
Client-side transform of `byDeptType` array into HTML table:
- Rows = departments, Columns = Man/Machine/Material/Method
- Each cell shows count badge with TYPE_META inline colors
- Zero cells show `–`

### Clickable KPI Cards
```js
// data attributes drive navigation
data-filter-status="Open"      → _noticeFilter.status = 'Open', switchTab('notices')
data-filter-status="Pending"   → _noticeFilter.status = 'Pending'
data-filter-overdue="1"        → _noticeFilter.overdue = true, _noticeFilter.status = 'overdue'
```

### Alert Strip (`_buildAlertStrip`)
- Shown at top of dashboard only when `overdue > 0` or `pending > 0`
- Amber background: `background:linear-gradient(135deg,#fef3c7,#fde68a)`
- Clickable links are `<button class="fourm-kpi-nav">` with `data-filter-*` attributes
- If nothing to alert → returns empty string (no strip rendered)

### Hero Gradient
```css
background: linear-gradient(135deg, #064e3b 0%, #065f46 55%, #0d9488 100%)
```

### Change Notice Create / Ownership Rules
- `POST /fourm/notices` is available to authenticated users, not admin-only.
- `NoticeNo` is generated in `backend/routes/fourm.js` with `generateNoticeNo(RequestDate)` as `4M-YYYY-###`; the frontend shows the field as readonly/auto and does not submit it.
- `ResponsiblePerson` is set server-side from the login user (`req.user.name || req.user.EmployeeName || req.user.id`) on create; the frontend shows owner as readonly.
- Users can close their own notices; admins can close any notice.
- Admins can edit, delete, and set `Pending` for all Change Notices from the Change Notice tab.
- Existing `PUT /fourm/notices/:id` remains admin-only and can update `ResponsiblePerson` for data correction/admin maintenance.

### TYPE_META Colors
```js
const TYPE_META = {
    Man:      { bg:'#eff6ff', text:'#1d4ed8', dot:'#3b82f6' },  // blue
    Machine:  { bg:'#fff7ed', text:'#c2410c', dot:'#f97316' },  // orange
    Material: { bg:'#f0fdf4', text:'#15803d', dot:'#22c55e' },  // green
    Method:   { bg:'#faf5ff', text:'#7e22ce', dot:'#a855f7' },  // purple
};
```

### multer Error Handling
`_handleUpload(field)` factory in `backend/routes/fourm.js` — same pattern as module-forms.js:
- Wraps `upload.single(field)` in callback
- multer errors → JSON `{ success:false, message }` 400 (not global 500)
- Used on: `POST /notices`, `PUT /notices/:id`, `POST /notices/:id/close`

### State Variables
```js
let _noticeFilter = { status:'all', type:'all', dept:'all', year: new Date().getFullYear(), q:'', overdue:false };
let _manFilter    = { q:'', year: new Date().getFullYear() };
let _departments  = [];    // lazy-loaded from /master/departments
let _statsData    = null;  // last /fourm/stats response
let _lastNotices  = [];    // last rendered notices list (used for Excel export)
let _fourmForms   = [];    // Module_Forms for 'fourm' module
let _chartManDonut = null; // Man Record pass/fail donut chart
```

### Excel Export (`_exportNoticesToExcel`)
- Uses global `XLSX` (SheetJS CDN in index.html)
- Exports `_lastNotices` (currently filtered list)
- Filename: `4M_Change_Notices_YYYY.xlsx`
- Guard: `if (typeof XLSX === 'undefined')` → toast error

### Module Forms (Dashboard Quick Access)
- Loaded with `GET /module-forms?module=fourm` (active only for users, `&all=1` for admin)
- Rendered inside Dashboard Quick Access (`fourm-forms-dash`), not a standalone Systems tab.
- Admin: upload/manage from dashboard card (toggle active/inactive, delete)
- User: view/download from dashboard card
- Upload via `POST /module-forms` with `FormData` field `formFile`
- `ALLOWED_MODULES` in `module-forms.js` includes `'fourm'`

### `_renderDashInner()` Separation
- `renderDashboard(container)` creates the shell with year selector (once)
- `_renderDashInner()` fetches + renders dashboard content only — called on year change
- Prevents year selector from being re-created when changing year

### UX Rules
- 4M hero accent color: emerald/teal (`#064e3b → #065f46 → #0d9488`); primary action accents remain indigo→sky (`#6366f1 → #0284c7`)
- Overdue rows: inline `style="background:rgba(254,242,242,0.7)"` on `<tr>` — not Tailwind arbitrary
- TYPE_META badges: inline `style=` — not Tailwind arbitrary values
- Alert strip clickable items are `<button class="fourm-kpi-nav">` — not `<a>` tags

## Module Forms — Architecture

แบบฟอร์มเทมเพลตที่ admin อัปโหลด (PDF/Word/Excel) ให้ user ดาวน์โหลด กรอก และนำมาแนบ

### Table
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT AUTO_INCREMENT PK | |
| `Module` | VARCHAR(50) | `'hiyari'` / `'ky'` / `'general'` |
| `Title` | VARCHAR(200) | ชื่อแบบฟอร์ม |
| `Description` | TEXT | |
| `FileUrl` | TEXT NOT NULL | Cloudinary secure_url |
| `PublicID` | VARCHAR(255) | Cloudinary public_id (สำหรับ delete) |
| `FileType` | VARCHAR(100) | MIME type |
| `FileSize` | INT | bytes |
| `Version` | VARCHAR(30) | เช่น `v1.0` |
| `IsActive` | TINYINT(1) DEFAULT 1 | 1=แสดง, 0=ซ่อน |
| `SortOrder` | INT DEFAULT 99 | |
| `UploadedBy` | VARCHAR(100) | name หรือ EmployeeID |
| `UploadedAt` | DATETIME | |
| `UpdatedAt` | DATETIME ON UPDATE CURRENT_TIMESTAMP | |

สร้างอัตโนมัติด้วย `CREATE TABLE IF NOT EXISTS` ใน `ensureTable()` ของ `backend/routes/module-forms.js`

### API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /module-forms?module=hiyari` | User | active forms เท่านั้น |
| `GET /module-forms?module=hiyari&all=1` | Admin | ทุก form รวม inactive |
| `POST /module-forms` | Admin | upload form (multer field: `formFile`, 20 MB) |
| `PUT /module-forms/:id` | Admin | update metadata (title/desc/version/isActive/sortOrder) — ไม่รับไฟล์ใหม่ |
| `DELETE /module-forms/:id` | Admin | ลบ + Cloudinary fire-and-forget delete |

- Mount: `app.use('/api/module-forms', authenticateToken, moduleFormsRoutes)` ใน `server.js`
- `ALLOWED_MODULES = ['hiyari', 'ky', 'general']`
- multer ใช้ `_handleUpload` wrapper (ไม่ใช่ middleware ตรงๆ) เพื่อ catch multer errors → return JSON 400 แทน global 500

### Frontend Pattern (Hiyari + KY)
**Admin — Manage tab:**
- `_loadHiyariForms(adminAll=true)` → `_renderHiyariFormsManage()` → renders table ใน `#hiyari-forms-tbody`
- Toggle active/inactive ด้วย `PUT /module-forms/:id` (ส่ง full metadata + new isActive)
- Delete ด้วย `DELETE /module-forms/:id` (confirm modal)
- Upload modal: fields = title*, version, sortOrder, description, formFile* → FormData → `API.post('/module-forms', fd)`

**User — Submit tab:**
- `_loadHiyariForms(false)` → `_renderHiyariFormsUserCard(forms)` → inject ใน `#hiyari-forms-user-card`
- แสดงเฉพาะ `IsActive=1` — card สี orange (Hiyari) / indigo (KY)
- ปุ่ม "ดูไฟล์" (`target="_blank"`) + "ดาวน์โหลด" (`download` attribute)
- Load ด้วย fire-and-forget `.then()` หลัง form render (ไม่บล็อก render)

**KY specifics:**
- Forms section อยู่ใน `config` sub-tab ของ Manage (ไม่ใช่ coverage)
- `_renderKyFormsManageSection()` + `_renderKyFormsUserCard()` — ฟังก์ชันแยกเพื่อ KY accent color (indigo)

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
14. **`Admin_AuditLogs` table** — auto-created/auto-migrated by `backend/utils/audit.js`; no manual DBeaver SQL step is required for normal startup
15. **`safeCount()` in system health** — ตาราง module ใหม่อาจยังไม่มีใน DB ทำให้ health check return `null` แทน error
16. **Express route ordering** — `PUT /api/kpidata/bulk` ต้องประกาศ **ก่อน** `PUT /api/kpidata/:id` ไม่งั้น `/bulk` จะถูก match เป็น `:id`
17. **Machine Safety file upload field** — `POST /api/machine-safety/:id/files` ใช้ multer field ชื่อ `file` (ไม่ใช่ `document`) ต่างจาก generic upload endpoint
18. **Add machine → upload files** — ต้อง POST machine ก่อน → รับ `id` จาก response → แล้วค่อย upload files/links ทีละขั้น (multi-step creation)
19. **KPI_DATA_FIELDS whitelist** — column จริงใน DB คือ `Metric`, `Department` (ไม่ใช่ `MetricName`, `Category`) — ตรวจ whitelist ใน `server.js` ก่อนแก้ field names
20. **`machine-safety.js` enterprise fields** — `Status`, `RiskLevel`, `NextInspectionDate` ถูก auto-migrate ใน `ensureTables()` แล้ว รวมถึงตาราง `Machine_Safety_Compliance` และ `Machine_Safety_Issues` — ไม่ต้องรัน SQL แยก; `ensureTables()` ทำงานครั้งแรกที่ request มาถึง route
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
44. **Machine Safety issues route ordering** — `PUT /issues/:issueId` และ `DELETE /issues/:issueId` ต้องประกาศ **ก่อน** `PUT /:id` และ `DELETE /:id` ในไฟล์ `machine-safety.js` — ถ้าประกาศหลัง Express จะ match `'issues'` เป็น `:id` ทำให้ไม่ทำงาน (Express v5 ใช้ path-to-regexp เหมือนกัน)
45. **Machine Safety row highlighting — inline style** — ใช้ inline `style="background:rgba(...)"` บน `<tr>` ไม่ใช่ Tailwind arbitrary value เช่น `bg-red-50/55` เพราะ CDN Tailwind ไม่ compile arbitrary opacity values ที่ไม่ได้ใช้ใน source
46. **`_msdSetAuditFilter()` toggles** — ถ้า user คลิก badge เดิมซ้ำ จะ clear filter (toggle off) และ sync dropdown `#msd-audit` ด้วย — ต้องทำทั้งสองทาง (badge คลิก ↔ dropdown เปลี่ยน) ให้ state `_filterAudit` เป็น source of truth
47. **Training module — department-based (ไม่ใช่ individual)** — `Training_Dept_Records` คือตารางหลักใน UI ปัจจุบัน; `Training_Records` (individual) ยังมีใน DB แต่ UI ไม่ใช้แล้ว — อย่าสับสนกัน; unique constraint คือ `(Department, Year, CourseID)` ไม่ใช่ `(Department, Year)` เพราะ 1 แผนก/ปี มีได้หลายหลักสูตร
48. **Training `CourseID` NULL-safe duplicate check** — MySQL UNIQUE index ถือ NULL เป็น distinct ทุกค่า (ไม่ conflict) → ต้องใช้ `CourseID <=> ?` ใน app-level guard ด้วย ไม่ใช่ `CourseID = ?` (ซึ่งจะไม่ match NULL)
49. **Training dashboard — Dept×Course Matrix** — คำนวณ client-side จาก `_deptRecords` (ดึงจาก `/training/dept-records?year=`); แสดงเฉพาะเมื่อมี 2+ courses; lookup key = `` `${dept}::${courseID ?? '__null__'}` ``
50. **`API.patch()` ใน `api.js`** — method PATCH ถูกเพิ่มแล้วใน `api.js`; `admin.js` ใช้ `API.patch(...)` สำหรับ toggle-cancel sessions — ห้าม import `apiFetch` โดยตรงใน `admin.js`
51. **contractor.js accent color = amber** — gradient `#d97706 → #b45309`, shadow `rgba(217,119,6,...)` — ห้ามใช้สี sky/blue ใน contractor module
52. **Yokoten Phase 3 — one response per dept** — `YokotenResponses` มี UNIQUE KEY `uq_dept_topic (YokotenID, Department)` — ใช้ `deptResponse` (singular) ไม่ใช่ array; ห้ามใช้ `myResponse` หรือ `UserID` lookup อีกต่อไป
53. **Yokoten `only_full_group_by` — ห้าม `SELECT r.* ... GROUP BY r.ResponseID`** — TiDB บังคับ `only_full_group_by`; ถ้าต้องการ files ให้ดึงแยกด้วย `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (...)` แทนการ JOIN + GROUP_CONCAT
54. **Yokoten response FormData** — `POST /yokoten/respond` และ `PUT /yokoten/respond/:id` รับ FormData (field: `responseFiles`) — ถ้าส่ง JSON จะไม่ได้รับไฟล์; `apiFetch` detect `body instanceof FormData` และข้าม `Content-Type` header อัตโนมัติ
55. **Yokoten approval status** — `null` = Yes (auto-approved), `'pending'` = No รอ admin, `'approved'` = admin อนุมัติ, `'rejected'` = admin ปฏิเสธ; `CorrectiveAction` required เมื่อ `IsRelated='No'` (validation ทั้ง client+server)
56. **Yokoten dept filtering — TargetDepts=[] = ทุกแผนก** — `_filterToTargetedDepts()` ต้องคืน deptSummary ทั้งหมดเมื่อ topic ใดมี `TargetDepts=[]`; ห้าม filter ออกทุกแผนกในกรณีนี้; ใช้ฟังก์ชันนี้ทุกที่ที่แสดงผลรายแผนก (dashboard, chart, admin dept tab, PDF)
57. **Yokoten RTE link/image — ต้องบันทึก selection ก่อนเปิด input bar** — `contenteditable` เสีย focus เมื่อ user คลิก input; ต้องเรียก `_saveSelection()` ใน mousedown handler (ก่อน `preventDefault`) แล้วค่อย `_restoreSelection()` ก่อน `execCommand`; ถ้าไม่ทำ link/image จะถูก insert ที่ตำแหน่งผิด
58. **Yokoten RTE `execCommand`/`queryCommandState` deprecated hint** — IDE แสดง hint code 6387 สำหรับทั้งสองคำสั่ง; นี่คือ spec deprecation ไม่ใช่ browser removal — ยังทำงานได้ในทุก modern browser; ไม่มีทางเลือกอื่นใน vanilla JS; ไม่ต้องแก้ไข
59. **`escHtml()` สำหรับ err.message ใน innerHTML** — ทุกที่ที่ inject `err.message` เข้า innerHTML ต้องผ่าน `escHtml(err.message)` เสมอ; import จาก `../ui.js`; ห้ามใช้ `err.message` โดยตรงใน template literals ที่ assign ให้ innerHTML เพราะเสี่ยง XSS
60. **patrol.js — routes ที่ต้องการ `isAdmin`** — POST/PUT/DELETE `/teams`, POST `/teams/:id/members`, DELETE `/teams/:teamId/members/:memberId`, POST `/member-rotation`, POST `/generate-sessions`, PUT `/sessions/:id`, DELETE `/sessions/:id` ทุกตัวต้องมี `isAdmin` middleware; CLOSE/UPDATE ใน POST `/issue/save` ก็ต้องมี admin check
61. **patrol.js — `/checkin` duplicate guard** — POST `/checkin` ตรวจ `Patrol_Attendance` ก่อน INSERT ว่า user เช็คอิน `(UserID, DATE(PatrolDate), PatrolType)` ซ้ำหรือไม่; return 409 ถ้าซ้ำ
62. **`PatrolType` whitelist** — รับได้เฉพาะ `['normal', 'compensation', 'Re-inspection']`; ค่าอื่น fallback เป็น `'normal'` อัตโนมัติ; กำหนดไว้ใน `ALLOWED_PATROL_TYPES` constant ใน patrol.js
63. **cascade EmployeeID warning log** — `.catch()` ใน cascade loop ไม่ใช่ silent swallow อีกต่อไป — log `console.warn` แสดงชื่อตารางและ error message เพื่อให้ debug ได้
64. **Activity Targets compliance widget** — `public/js/utils/activity-widget.js` export `buildActivityCard(activityKeys)` → returns async HTML card (glass style) สำหรับแปะต่อท้าย hero stats strip — import แล้วเรียกท้าย `_loadHeroStats()` / `_renderHeroStats()` โมดูลที่ใช้: hiyari (`'hiyari'`), ky (`'ky'`), yokoten (`'yokoten'`), training (`'training'`), ojt (`'scw'`); patrol+cccf ไม่ใช้เพราะแสดงข้อมูลเดียวกันอยู่แล้วในสตริป
65. **Legacy password auto-migration** — เมื่อ `user.Password` เป็น NULL (legacy mode) และ login สำเร็จ, server.js จะ fire-and-forget `bcrypt.hash` → `UPDATE Employees SET Password=?` โดยอัตโนมัติ — ครั้งถัดไปที่ user login จะใช้ bcrypt เต็มรูปแบบ; migration ล้มเหลว = `console.warn` แต่ login ยังผ่าน
66. **Password minimum 8 ตัว (ไม่ใช่ 6)** — validation enforce ทั้ง backend (`server.js` register + change-password) และ frontend (index.html, main.js, profile.js); strength indicator แสดง 5 ระดับตาม score: length≥8 + lowercase + uppercase + digit + symbol; อย่าตั้ง validation กลับไป 6 ตัว
67. **`normalizeRole()` ใน server.js** — ต้องเรียกใน login handler ก่อน sign JWT ทุกครั้ง; ใช้ `ALLOWED_ROLES.find(ar => ar.toLowerCase() === r.toLowerCase())` — ถ้าไม่พบ fallback `'User'`; ป้องกันกรณี DB มี role เป็น `'admin'` lowercase แล้ว isAdmin check (`=== 'Admin'`) fail
68. **Soft delete pattern — `IsDeleted TINYINT(1) DEFAULT 0`** — ทั้ง `Accident_Reports` และ `YokotenResponses` ใช้ soft delete; DELETE endpoint → `UPDATE ... SET IsDeleted=1`; ทุก GET/summary/analytics query ต้อง filter `WHERE (IsDeleted IS NULL OR IsDeleted = 0)`; ใช้ NULL-safe เพราะแถวเดิมก่อน migrate จะมีค่า NULL ไม่ใช่ 0
69. **Accident soft delete — Attachments ยังคงอยู่** — การ soft delete `Accident_Reports` ไม่ลบ `Accident_Attachments` และไม่ลบไฟล์จาก Cloudinary; ถ้าต้องการลบไฟล์ให้ใช้ `DELETE /accident/attachments/:id` แยกต่างหาก
70. **Yokoten bulk approve — safe integer validation** — `POST /yokoten/bulk-approve` รับ `{ ids: [...] }` แล้ว map `parseInt(id, 10)` filter `!isNaN && > 0` ก่อน build `IN (...)` placeholder ทุกครั้ง — ห้าม interpolate ids โดยตรงใน SQL string
71. **Dashboard alerts — silent fail** — `GET /dashboard/alerts` ทุก sub-query ใช้ `.catch(() => [])` เพราะตารางบางอันอาจยังไม่มีใน DB; frontend `_loadAlerts()` ก็ `try/catch` silent — widget ไม่แสดงถ้าไม่มีรายการ (ไม่แสดง "0 alerts" section)
72. **Hiyari → Yokoten cross-module flow** — `hiyari.js` เขียน `sessionStorage.setItem('hiyari_to_yokoten', JSON.stringify({ title, description, riskLevel, sourceHiyariId }))` แล้ว navigate `location.hash = '#yokoten'`; `yokoten.js` อ่านใน `loadYokotenPage()` หลัง `refreshData()`, `removeItem` ทันที, switch tab admin→topics, เรียก `openTopicForm(null, prefill)` ด้วย `setTimeout(..., 150)` เพื่อให้ DOM settle; ถ้าไม่ใช่ admin → ไม่ดำเนินการ (try/catch คลุม)
73. **Accident PDF export — `window._accExportPDF(id)`** — สร้าง `div 794×1122px` position:fixed left:-9999px, render ด้วย html2canvas scale:1.5, จากนั้น jsPDF addImage A4; ใช้ helpers `_pdfField()` / `_pdfFieldFull()` ที่นิยาม local ในไฟล์; filename pattern: `ACC-XXXX-YYYYMMDD.pdf`; ต้องการ `html2canvas` + `jspdf` CDN (มีแล้วใน index.html)
74. **String normalization — filter comparison ต้อง `.trim()` ทั้งสองฝั่ง** — ค่า Department ที่มาจาก DB อาจมี leading/trailing whitespace จากการกรอก free-text ในอดีต; ทุก client-side filter ที่เปรียบเทียบ string กับ master data ต้องใช้ `(r.Field || '').trim() === masterValue`; master values ต้อง trim ตั้งแต่ตอน fetch: `.map(d => (d.Name || d.name || '').trim()).filter(Boolean)`; ห้าม mutate ข้อมูลใน `_ppeInspections` / `_assessments` โดยตรง — normalize เฉพาะตอน compare
75. **Department master data — `/master/departments` เป็น single source of truth** — ทุก module ที่มี department dropdown ต้องดึงจาก `GET /master/departments` (ไม่ใช่ hardcode หรือ derive จาก records); lazy-cache ใน module-level `_departments = []`; fetch ใน `_loadHeroStats()` พร้อมกับ fetches อื่นโดยใช้ `if (_departments.length === 0) fetches.push(_fetchDepts())`; `.catch()` ใน `_fetchDepts()` ต้อง return ค่าที่ทำให้ `_departments` เป็น `[]` — UI guard ด้วย `_departments.length > 0` ก่อนแสดง select และ filter bar; fallback เป็น `<input type="text">` เมื่อ departments ไม่พร้อม (graceful degradation ไม่ crash)
76. **Progress bar inline colors — ใช้ hex ตรงจาก `training.js` เสมอ** — color constants สำหรับ compliance/pass-rate progress bars: null → `#e2e8f0` (slate-200, ไม่ใช่ slate-400), pass → `#059669`, warn → `#d97706`, fail → `#ef4444`; ห้ามใช้ Tailwind class arbitrary value (CDN ไม่ compile); ห้ามใช้ hex ใกล้เคียงเช่น `#94a3b8` (slate-400) สำหรับ null state — จะทำให้ bar มองเห็นทั้งที่ไม่มีข้อมูล; thresholds ขึ้นอยู่กับ domain: training ใช้ 80%/60%, PPE compliance ใช้ 90%/70%
77. **Dropdown + filter pattern — ห้ามสร้าง abstraction ใหม่** — เมื่อต้องการ department filter บน tab: (1) ใช้ `<select onchange="window._xxxSetDeptFilter(this.value)">` inline ใน HTML template, (2) register `window._xxxSetDeptFilter = (val) => { _filterXxx = val; renderPanel(id); }` ใน `setupEventListeners()`, (3) filter ใน render function ก่อน compute stats — ไม่ต้องสร้าง helper class, factory, หรือ shared filter component; pattern นี้เหมือนกับ `_msdSetAuditFilter` ใน machine-safety.js
78. **Backend numeric range validation — `parseScore()` pattern** — ทุก route ที่รับคะแนน/score จาก user input ต้องมี helper validate: `if (val === '' || val == null) return null; const n = parseFloat(val); if (isNaN(n) || n < MIN || n > MAX) throw new Error('...')` แล้ว return rounded value; throw ใน try/catch → `res.status(400).json(...)` ก่อน INSERT/UPDATE; ห้าม insert raw `req.body` score โดยไม่ validate range
79. **SQL NULL-aware average — ห้ามใช้ `COALESCE(col, 0) / totalCount`** — เมื่อบางคอลัมน์ nullable ใน average calculation: `COALESCE(col,0)` จะนับ NULL เป็น 0 ทำให้ค่าเฉลี่ยต่ำกว่าความเป็นจริง; ต้องหารด้วย `NULLIF((col1 IS NOT NULL)+(col2 IS NOT NULL)+..., 0)` เพื่อหารเฉพาะจำนวนคอลัมน์ที่มีค่า; pattern นี้ใช้ใน `safety-culture.js` route `yearTrend` query สำหรับ T1–T5,T7 scores
