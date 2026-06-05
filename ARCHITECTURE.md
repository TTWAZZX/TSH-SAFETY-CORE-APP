# TSH Safety Core Activity - Architecture

## Document Map

- `CLAUDE.md` is the quick-start entry point.
- `AGENTS.md` contains operating rules for Codex/Claude.
- `DEPLOYMENT.md` contains production operation and verification procedures.
- `CHANGELOG.md` contains dated phase and handoff history.
- `ROADMAP.md` contains known remaining work and recommended next phases.

## Frontend Structure

## Project Structure

```
TSH-SAFETY-CORE-APP/
├── index.html                  # Single HTML entry point (SPA)
├── vercel.json                 # legacy deployment config; company server is the current target
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
│           ├── admin.js        # System Console (9 tabs — see below)
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
    ├── db.js                   # mysql2 connection pool (Company MySQL/MariaDB)
    ├── storage.js              # local upload storage + multer storage + fileFilter
    ├── uploads/                # uploaded files; back up together with MySQL
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

## Backend Node Structure

The Node backend under `backend/` is used for local/development parity and Express route behavior. Core files include `backend/server.js`, `backend/db.js`, `backend/storage.js`, `backend/middleware/auth.js`, and dedicated route modules under `backend/routes/`.

## PHP Compatibility Layer

Production shared hosting routes are served by the PHP API under `api/`, with `api/bootstrap.php` and handler modules such as `api/handlers/foundation.php` and `api/handlers/patrol.php`. Keep PHP production behavior and Node dev behavior aligned for shared endpoints.

## Database Overview

Company MySQL/MariaDB is the source of truth. Dedicated modules own their own tables; several legacy tables are still present for compatibility. See module sections below for table-level notes and constraints.

## Auth / Session Model

JWT sessions expire after 6 hours. Passwords use bcrypt, with legacy auto-migration behavior documented below. Frontend code must use `TSHSession.getUser()` and refreshed session/profile data rather than stale local storage snapshots.

## Upload Storage

Uploads are stored on the server filesystem and served as `/uploads`. Back up uploaded files together with MySQL. Soft deletes do not imply physical file deletion unless the module has a dedicated attachment delete flow.

## Major Modules

Major modules include Admin/System Console, Dashboard, Patrol, CCCF, Machine Safety, Accident, Training, Policy, Yokoten, Safety Culture, Contractor, Hiyari, KY, 4M Change, Activity Targets, and Module Forms.

## API Compatibility Principles

- Keep PHP production handlers and Node dev routes behaviorally aligned.
- Preserve response shapes used by the SPA.
- Respect existing route ordering, auth boundaries, soft delete rules, and NULL-safe SQL patterns.
- Add schema migrations deliberately and document them in deployment/handoff notes.

## Architecture & Key Patterns

### Authentication
- JWT ส่งผ่าน `Authorization: Bearer <token>` header เสมอ
- Middleware `authenticateToken` → decode JWT → `req.user`
- Middleware `isAdmin` → ตรวจ `req.user.role === 'Admin'` (ต้องใช้หลัง authenticateToken)
- Login rate limit: 10 ครั้ง / 15 นาที / IP
- Change-password rate limit: 10 ครั้ง / 15 นาที / IP (`changePwdLimiter` ใน `server.js`)
- Token หมดอายุ 6 ชั่วโมง, refresh ได้ที่ `POST /api/session/verify`
- **`normalizeRole(rawRole)`** ใน `server.js` — case-insensitive match กับ `ALLOWED_ROLES`; บังคับ role เป็น canonical casing ก่อน sign JWT; ป้องกัน `'admin'` / `'ADMIN'` bypass isAdmin check
- **Password minimum 4 ตัวอักษร** — enforce ใน register, change-password, profile, และ admin reset password; มี strength indicator 5 ระดับ (อ่อนมาก/อ่อน/ปานกลาง/ดี/แข็งแกร่ง) ใน index.html, main.js, profile.js
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
| `/api/patrol/employee-search?q=` | Admin | ค้นหาพนักงานทุกคน (ไม่จำกัดเฉพาะ roster) — ใช้สำหรับ admin บันทึกการเดินตรวจแทน |
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
| `/api/yokoten/response-files/:fileId` | Admin | DELETE single file (server file storage + DB) |
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
| `/api/accident/attachments/:id` | Admin | DELETE single attachment (server file storage + DB) |
| `/api/accident/employees?q=` | User | Employee search for accident form |
| `/api/safety-culture/*` | User | Safety Culture |
| `/api/training/*` | User | Training Status |
| `/api/contractor/*` | User | Contractor & Supplier E-Pass Online |
| `/api/hiyari/*` | User | Hiyari (near-miss) Reports |
| `/api/ky/*` | User | KY Activities |
| `/api/fourm/*` | User | 4M Change Management |
| `/api/employees` | User/Admin | Employee CRUD |
| `/api/policies` | User/Admin | Policy CRUD |
| `/api/policies/:id/acknowledge` | User | Mark the current user as having acknowledged a policy |
| `/api/policies/:id/acknowledge-all` | Admin | Admin bulk-acknowledge a policy for every employee in `Employees`; idempotent and audit-logged |
| `/api/policies/:id/acknowledgements` | Admin | Acknowledged/not-acknowledged lists, including self/admin acknowledgement metadata |
| `/api/committees` | User/Admin | Committee CRUD; `SubCommitteeData` stores master-linked department/unit, per-subcommittee PDF metadata, and position-count breakdown |
| `/api/kpidata/*` | User/Admin | KPI data CRUD |
| `/api/kpidata/bulk` | Admin | Bulk update KPI rows (PUT — must be declared BEFORE `/:id`) |
| `/api/machine-safety/:id/files` | Admin | Upload file to machine (multer field: `file`) |
| `/api/machine-safety/:id/links` | Admin | Add URL link to machine (no file upload) |
| `/api/machine-safety/files/:fileId` | Admin | Delete a file record |
| `/api/machine-safety/:id/compliance` | User (write=Admin) | GET/PUT compliance checklist items (5.1–5.8) — batch upsert |
| `/api/machine-safety/:id/issues` | User (write=Admin) | GET/POST issues for one machine |
| `/api/machine-safety/issues/:issueId` | Admin | PUT (resolve/reopen) / DELETE issue — must be declared BEFORE `/:id` |
| `/api/upload/document` | Admin | server file storage file upload (field name: `document`) |
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
| `Yokoten_Response_Files` | `/api/yokoten/respond`, `/api/yokoten/response-files/:fileId` | Per-response file attachments (server file storage) |
| `Yokoten_Dashboard_Config` | `/api/yokoten/dashboard-config` | JSON config row: `pinnedDepts` + `pinnedUnits` arrays |
| `Policy_Acknowledgements` | `/api/policies/:id/acknowledge*` | Policy acknowledgement rows. Unique key `(PolicyID, UserID)`. Columns `AckSource`, `AcknowledgedByAdminID`, `AcknowledgedByAdminName` record whether acknowledgement was self-service or Admin bulk action. |
| `Committees` | `/api/committees` | `SubCommitteeData` JSON array. Each subcommittee should use `departmentId`, `department`, `unitId`, `unit`, `documentUrl`, `documentName`, and `positions[]` (`positionId`, `positionName`, `count`). `memberCount` is derived from `positions[]`; legacy `activeLink` is still mirrored for compatibility. |

### File Upload
- Uploads use local company-server storage through `backend/storage.js`
- Files are stored in `backend/uploads/` and served at `/uploads`
- Endpoint: `POST /api/upload/document` — field name ต้องเป็น `document` (ไม่ใช่ `file`)
- ประเภทไฟล์ที่รองรับ: JPEG, PNG, GIF, WEBP, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 10 MB (patrol images), 20 MB (documents)
- Stored file names are intentionally safe/random (`timestamp-random.ext`). Do not rely on the URL path as the user's original file name.
- `backend/storage.js` appends original-name metadata as `?filename=<encoded original name>` and `/uploads` sets `Content-Disposition` from that metadata for display/download.
- `public/js/ui.js` document viewer reads `filename` metadata when choosing display/download names.
- Committee subcommittee PDFs are uploaded with `POST /api/upload/document` and saved in `SubCommitteeData.documentUrl`; subcommittee manpower is stored as `SubCommitteeData.positions[]` from Master Positions or typed custom labels; editing/deleting committees cleans replaced/removed subcommittee PDFs from `backend/uploads/`.
- Back up `backend/uploads/` together with MySQL before every production change

### Committee Module Current Behavior
- Admin creates/edits Safety Committee records from `public/js/pages/committee.js`.
- Subcommittee setup uses Master Departments and Master Safety Units instead of free-text department/unit names.
- Each subcommittee has its own required PDF document uploaded through local server storage.
- Subcommittee manpower is entered as position-count rows, for example `MGR = 1`, `Supervisor = 2`, `Leader = 4`; totals are calculated into `memberCount`.
- The page intentionally omits the duplicate governance-summary strip and keeps the core 4-card summary plus current-committee hero.

### KPI Module Current Behavior
- KPI announcements use stable `AnnouncementID` values such as `KPI-2026`; `GET /api/pagedata/kpi-announcements` exposes `id` from `AnnouncementID`.
- KPI metric CRUD is guarded server-side against duplicates in the same `(Year, AnnouncementID, Metric, Department)` scope; duplicate create/update returns HTTP 409.
- KPI announcement delete is blocked with HTTP 409 while `KPIData` rows still reference that `AnnouncementID`.
- KPI metric create/update/delete and monthly bulk updates write audit rows through `Admin_AuditLogs`.
- The KPI Department field in the add/edit form comes from Master Departments and Master Safety Units.
- KPI filter controls include visible active states and a clear-filters button; changing status/view re-renders the control strip so the clicked state is obvious.
- KPI import skips duplicate rows and invalid numeric rows, then reports imported/skipped counts instead of stopping at the first bad row.
- KPI form/server validation requires numeric `Target`, positive numeric `Weight`, and numeric monthly values.
- KPI cards/tables show the linked `AnnouncementID`; delete confirmation displays KPI name, year, department, and announcement before removal.

### Database
- Company MySQL/MariaDB (MySQL-compatible) via `mysql2`
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
| **Yokoten** | แบ่งปันบทเรียน/ความรู้ความปลอดภัย (Phase 3) — **หนึ่ง response ต่อแผนก**, Approval workflow (pending→approved/rejected), Bulk approve (checkboxes + `POST /bulk-approve`), Corrective Action + evidence required when IsRelated=Yes, ไฟล์แนบ (FormData, field: `responseFiles`, สูงสุด 10 ไฟล์/20 MB), Dashboard pinned depts config, Admin approve/reject/delete (soft delete), Excel export |
| **Policy** | นโยบายความปลอดภัย, รับทราบนโยบาย — Description field ใช้ Rich Text Editor (RTE) เดียวกับ Yokoten (`pol-*` prefix), HTML ถูก sanitize ก่อนบันทึก/แสดง, PDF export รองรับ rich formatting |
| **Committee** | คณะกรรมการความปลอดภัย, SubCommittee (JSON array), ผังองค์กร |
| **Machine Safety** | ข้อมูลเครื่องจักร/อุปกรณ์ความปลอดภัย, Safety Device Std., Layout & Checkpoint, Compliance Checklist (5.1–5.8), Issue Tracker, Audit Readiness |
| **OJT / SCW** | มาตรฐาน Stop-Call-Wait (แก้ไขได้), จัดการเอกสาร SCW (อัปโหลด/ดู/ลบ), OJT Compliance รายแผนก (เป้าหมาย/ผู้เข้าร่วม/สถานะ, เลือกแผนกที่แสดง persisted, คำนวณ metric จากแผนกที่เลือกเท่านั้น, year filter) |
| **Accident** | รายงานอุบัติเหตุ/อุบัติการณ์ — Dashboard (KPI cards + trend chart + dept breakdown), Analytics (dept risk ranking + hotspot + root cause), Records (full 6-section form + file attachments + PDF export ต่อรายการ), Safety KPI Board (Zero Accident banner + Days/Hours without accident + target progress + monthly status grid), Soft delete (IsDeleted=1) |
| **Safety Culture** | กิจกรรมวัฒนธรรมความปลอดภัย — 4 tabs: Principles / Dashboard / ผลการประเมิน / PPE Control; คะแนน T1–T5,T7 (0–100%); PPE Inspection + Violation tracking; Dashboard PDF (html2canvas, fixed A4 paginated by content, Thai font); Culture Maturity Level (Reactive/Basic/Proactive/Generative) |
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

### Overview Phase 1 + 4 Integration Progress
- `GET /api/dashboard/overview` now exposes richer 4M metrics for the current year: total/open/pending/closed/active/overdue notices, Training Required notices, closure rate, and Training Matrix scope counts (`curriculums`, `courses`, `employees`, `transferred`).
- Enterprise Safety Health now penalizes active 4M work (`Open + Pending`) instead of only all-time Open notices.
- Department x Module Compliance Matrix now uses 4M closure rate by department; departments with no 4M records are treated as not-applicable for the 4M cell instead of forcing a false 0%.
- Overview hero and 4M module card now show active 4M work, open/pending/overdue breakdown, Training Required count, Matrix employee count, and 4M closure rate.
- `GET /api/dashboard/alerts` now includes open/pending 4M notices that have `TrainingRequired = 1`, so the Overview action queue can push Admin/User toward 4M > Training Matrix.

### Overview Phase 2 Command Center UX
- `public/js/pages/dashboard.js` now orders the Overview page as: Hero -> Enterprise Safety Health / Executive Signal -> Action Required -> Module Health cards -> Department x Module Compliance Matrix -> My Activity Targets.
- Action Required now has a visible loading state and a green empty state when overdue/due-soon/pending queues are clear, instead of leaving a silent blank area.
- Module cards are labeled as `Module Health / ภาพรวมระบบ` so they read as status cards after the action queue, not as the primary work queue.

### Overview Phase 3 Drill-down
- Overview now writes `pending_filter_*` from both module cards and Action Required cards, not only from the module card grid.
- Action Required cards now deep-link supported workflows: Patrol open issues -> Patrol issues tab, 4M overdue -> Change Notice overdue filter, and 4M Training Required -> Change Notice list filtered to Training Required records.
- `GET /api/fourm/notices` accepts `trainingRequired=1`; `public/js/pages/fourm.js` applies incoming dashboard filters for `all`, `Open`, `Pending`, `overdue`, and `trainingRequired`.
- 4M Notice Register shows a visible Training Required filter chip with a clear action when opened from Overview, so drill-down state is not hidden from the user.

### Overview Phase 4 Drill-down Expansion
- Accident now reads `pending_filter_accident` on load and can open Reports with quick filters such as `overdue`, `dueSoon`, and `recordable`.
- Machine Safety now reads `pending_filter_machine-safety` on load and can apply department/status/risk/audit/inspection filters from Overview.
- Machine Safety filter bar now includes an `Inspection` dropdown (`Due Soon`, `Overdue`) so incoming inspection drill-down state is visible and editable.
- Overview Accident overdue/due-soon Action Required cards and Accident recordable module card now send filter state to Accident Reports.
- Overview Machine overdue Action Required card and Machine Safety module card now send filter state to Machine Safety.

### Overview Phase 5 Verification
- Syntax checks passed for `backend/routes/dashboard.js`, `public/js/pages/dashboard.js`, `public/js/pages/fourm.js`, `backend/routes/fourm.js`, `public/js/pages/accident.js`, `public/js/pages/machine-safety.js`, and `backend/scripts/permission-audit.js`.
- `npm run uat:preflight` passed `90/90` read/permission surfaces, including Overview dashboard, Overview alerts, Overview config, 4M, Accident, Machine Safety, and Admin permission blocks.
- `npm test` passed end-to-end: permission audit, API smoke, and UAT preflight.
- Permission audit cleanup: 4M Course Master mutation routes now use explicit `isAdmin` middleware; curriculum-level assignment/remove/transfer routes are documented in the user-workflow allowlist because they enforce Admin-or-same-department ownership in route logic.
- Remaining browser UAT recommendation: open Overview as Admin and User, click Action Required cards for 4M Training Required, Accident overdue/due soon, and Machine overdue, then confirm each target module shows the incoming filter state visibly.

### Overview Department Coverage Matrix
- `buildComplianceMatrix()` now returns module-level 0-100% coverage signals by department instead of mostly presence-only flags.
- Matrix columns shown in `public/js/pages/dashboard.js`: `CCCF A`, `CCCF Perm.`, `Patrol Issue`, `Hiyari`, `KY`, `Yokoten`, `Training`, `4M`, `Accident`, `Machine`, `OJT`, and `Safety Culture`.
- Current formulas:
  - `CCCF A`: distinct `CCCF_FormA_Worker.EmployeeID` submitted this year / Employee Master count in that department.
  - `CCCF Perm.`: distinct completed `CCCF_FormA_Permanent.AssigneeID` this year / `CCCF_Assignments` in that department.
  - `Patrol Issue`: closed `Patrol_Issues` / total issues found this year by `ResponsibleDept`; departments with no issue are treated as 100%.
  - `Hiyari`: closed reports / total reports this year; departments with no report are treated as 100%.
  - `KY`: submitted KY activities this year / configured annual target from `KY_Program_Config`; fallback target is 12 when no active config exists.
  - `Yokoten`: responses this year / active Yokoten topics targeted to the department.
  - `Training`: `PassedCount / TotalEmp` from `Training_Dept_Records`.
  - `4M`: closed Change Notices / total Change Notices this year.
  - `Accident`: closed accident reports / total accident reports this year; departments with no accident are treated as 100%.
  - `Machine`: average of machine checklist pass rate and machine issue closure rate for active machines.
  - `OJT`: attendee count / yearly target when target exists; otherwise current non-overdue OJT record is 100%, overdue record is capped at 50%, missing record is 0%.
  - `Safety Culture`: average `SC_PPEInspections.CompliancePct` this year by department.
- Latest verification for the expanded matrix: `node --check backend/routes/dashboard.js`, `node --check public/js/pages/dashboard.js`, `git diff --check -- backend/routes/dashboard.js public/js/pages/dashboard.js`, and `npm run uat:preflight` (`90/90`).
- Frontend displays `N/A` for matrix cells where the backend intentionally returns `null` because there is no target/denominator/source data for that department. If new matrix columns show `N/A` everywhere after deployment, restart `backend/server.js` so `/api/dashboard/overview` serves the expanded backend fields.
- Overview page order now shows Department Coverage Matrix above Module Health cards: Hero -> Executive Signal -> Action Required -> Department Coverage Matrix -> Module Health -> My Activity Targets.

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

### Machine Safety Hardening Notes
- Backend route uses local storage via `backend/storage.js`; uploaded file URL is saved in `Machine_Safety_Files.FileUrl`.
- If DB insert/update fails after upload, route must call local cleanup best-effort so orphan uploads do not break the request flow.
- Local upload cleanup is non-fatal: Windows/XAMPP may temporarily lock a just-uploaded file, so delete failures are logged and retried instead of returning 500 after DB work succeeded.
- Machine code is checked for duplicates in create/update before saving. Dates are accepted only as `YYYY-MM-DD`.
- URL links accept only `http`/`https`; unsafe schemes such as `javascript:` must be rejected.
- Machine/file/compliance/issue mutations write `Admin_AuditLogs` via `logAudit()`.
- Frontend admin detection is case-insensitive, and machine list load failure should show a retry/error state instead of silently rendering an empty table.
- Smoke path tested: create machine, update machine, add URL link, reject invalid URL, upload PDF, save compliance, create/resolve/delete issue, delete machine.

## Accident Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `Accident_Reports` | รายงานหลัก — 34+ columns รวม `Location`, `Position`, `EmploymentType`, `InjuryType`, `BodyPart`, `MedicalTreatment`, `ImmediateCause`, `UnsafeAct`, `UnsafeCondition`, `PreventiveAction`, `ResponsiblePerson`, `DueDate`, `InvestigationStatus`, `PotentialSeverity`, `VerificationResult`, `VerifiedBy`, `VerifiedAt`, **`IsDeleted TINYINT(1) DEFAULT 0`** (auto-migrated ด้วย `ALTER TABLE ... ADD COLUMN` try/catch ใน `ensureTable()`) |
| `Accident_Attachments` | ไฟล์แนบต่อรายงาน — `AccidentID` (FK), `FileName`, `FileURL`, `PublicID`, `FileType`, `FileSize`, `UploadedBy` |
| `Accident_Performance` | Safety KPI Board ต่อปี — `Year` (UNIQUE), `TotalHours`, `TotalDays`, `LastAccidentDate`, `TargetHours`, `TargetDays`, `MonthlyStatus` (JSON), `UpdatedBy` |

### Accident / Near Miss Updates
- Accident form starts with `Incident Form Type`; selecting `Near Miss` hides the standard injury/cause accident sections and shows the Near Miss specific form.
- Near Miss data is stored in `Accident_Reports.NearMissDetails` JSON, not a separate table, to preserve existing report/attachment/Safety KPI flows.
- Near Miss `Involved Persons` and `Responsible Person` use Employee Master typeahead. Involved persons are stored as structured JSON (`EmployeeID`, `EmployeeName`, `Position`, `Department`).
- `NearMissSupervisorAdvice` is intentionally removed from the form; supervisor guidance should live in the attached official document.
- Near Miss requires `PotentialSeverity` (`Low`, `Medium`, `High`, `Critical`) for risk evaluation; labels in the form are Thai + English.
- Near Miss can be closed when `NearMissCAPA` is filled. Standard accident closure still requires `CorrectiveAction`.
- Accident case closure now has Thai + English enterprise control fields: `InvestigationStatus`, `VerificationResult`, `VerifiedBy` (Employee Master typeahead), and `VerifiedAt`. Closing a case requires CAPA/corrective action, verification result, and verified-by.
- Reports tab adds enterprise follow-up helpers without changing the report flow: investigation-status color badges, case aging/overdue days, counted/not-counted KPI filter, and CSV/Excel export for the currently visible records.
- Accident detail modal includes a closure checklist (CAPA, owner, due date, verification, evidence) and admin-only audit trail loaded from `GET /api/accident/reports/:id/audit`.
- Accident detail modal uses a document-reader layout for long narratives, similar to the Policy module: long text is rendered as Word-like sections with clear headings, line height, paragraph/list spacing, and wider `max-w-4xl` modal instead of cramped two-column cards.
- Audit actions are explicit for key events: `CREATE_ACCIDENT_REPORT`, `CREATE_NEAR_MISS_REPORT`, `UPDATE_ACCIDENT_REPORT`, `CLOSE_ACCIDENT_REPORT`, attachment delete, and soft delete.
- Near Miss contributes to analytics/dashboard trend and department risk views, but is excluded from Safety KPI Board counted cases and rates.
- Dashboard summary now includes `recentReports` and `openActions`; Analytics includes `nearMissTrend`, `injuryTypeStats`, and `bodyPartStats`.
- Accident attachment display names use `cleanOriginalFilename()` through `backend/storage.js`; stored filenames remain randomized, while original Thai names are decoded/sanitized for display/download metadata. `ensureTable()` repairs recent Accident attachment display names when possible.
- Hero `daysSince` is automatic from counted-stat accidents. For a selected year with no counted accident, it falls back to inclusive days from Jan 1 to today (current year) or full year length (past years); Near Miss and First Aid do not reset this count.

### Accident Report Form (6 Sections)
| Section | Fields |
|---------|--------|
| ข้อมูลทั่วไป | AccidentDate, ReportDate, AccidentTime, Location, Area, ReportedBy |
| ผู้ประสบเหตุ | EmployeeID (typeahead search), Position (auto-fill), EmploymentType |
| รายละเอียดเหตุการณ์ | AccidentType, Severity, Description |
| การบาดเจ็บ | InjuryType, BodyPart, LostDays, IsRecordable, MedicalTreatment |
| วิเคราะห์สาเหตุ | ImmediateCause, UnsafeAct, UnsafeCondition, RootCause, RootCauseDetail |
| มาตรการแก้ไข | CorrectiveAction, PreventiveAction, ResponsiblePerson, DueDate, Status, InvestigationStatus, VerificationResult, VerifiedBy, VerifiedAt + Attachments |

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

### Policy Acknowledgement
- Self acknowledgement endpoint: `POST /api/policies/:id/acknowledge`.
- Admin bulk acknowledgement endpoint: `POST /api/policies/:id/acknowledge-all`.
- Bulk acknowledgement inserts missing rows for every current employee from `Employees`; it uses `INSERT IGNORE`, so repeated clicks are idempotent and do not duplicate `(PolicyID, UserID)`.
- `Policy_Acknowledgements` columns:
  - `AckSource`: `'self'` or `'admin_all'`.
  - `AcknowledgedByAdminID`: Admin EmployeeID when bulk acknowledgement is used.
  - `AcknowledgedByAdminName`: Admin display name when bulk acknowledgement is used.
- The Admin UI button is `#btn-ack-all` in `public/js/pages/policy.js`; it is disabled when all employees have already acknowledged.
- Acknowledgement list and Excel export include the acknowledgement source and Admin operator.
- Bulk acknowledgement writes an audit row with action `ACKNOWLEDGE_ALL_POLICIES`.

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
| `DELETE /yokoten/topics/:id` | Admin | ลบ topic + cascade responses+files (server file storage) |
| `POST /yokoten/respond` | User/Admin | ส่ง dept response (FormData, field: `responseFiles`) — User ส่งได้เฉพาะแผนกตัวเอง; Admin ส่งแทนหลายแผนกได้ด้วย `departments` JSON array; IsRelated='Yes' requires CorrectiveAction + at least 1 evidence file and starts `ApprovalStatus='pending'`; IsRelated='No' can submit without action/evidence |
| `PUT /yokoten/respond/:id` | User/Admin | แก้ไข response (FormData) — ต้องเป็น dept เดียวกันหรือ admin |
| `DELETE /yokoten/respond/:id` | Admin | ลบ response + cascade files (server file storage) |
| `POST /yokoten/respond/:id/approve` | Admin | อนุมัติ → ApprovalStatus='approved' |
| `POST /yokoten/respond/:id/reject` | Admin | ปฏิเสธ → ApprovalStatus='rejected', body: `{ comment }` |
| `POST /yokoten/bulk-approve` | Admin | Bulk approve `{ ids: [ResponseID, ...] }` → UPDATE IN (...) WHERE ApprovalStatus='pending' |
| `DELETE /yokoten/respond/:id` | Admin | Soft delete → IsDeleted=1 (ไฟล์ server file storage ยังคงอยู่) |
| `DELETE /yokoten/response-files/:fileId` | Admin | ลบไฟล์เดี่ยว (server file storage + DB) |
| `GET /yokoten/dept-history` | User | ประวัติ response ของแผนกตัวเอง พร้อมไฟล์ |
| `GET /yokoten/dept-completion` | Admin | `{ topics, deptSummary }` — สรุปทุกแผนกจาก Master_Departments |
| `GET /yokoten/all-responses` | Admin | response ทั้งหมด พร้อมไฟล์ (filterable) |
| `GET /yokoten/employee-completion` | Admin | employee-level completion view; ห้ามเปิดให้ User เพราะสรุปข้อมูลรายบุคคล/ทุกแผนก |
| `GET /yokoten/dashboard-config` | User | `{ pinnedDepts: [], pinnedUnits: [] }` |
| `PUT /yokoten/dashboard-config` | Admin | บันทึก config |

### Permission Boundary
- User can read active topics, but `GET /topics` attaches only `deptResponse` for `req.user.department`. It must not include other departments' response bodies/files.
- User can read `GET /dept-history`, scoped to `req.user.department` only.
- User can create a response only for their own department. `POST /respond` ignores submitted `department/departments` unless the caller is Admin.
- User can update a response only when it belongs to their department and `ApprovalStatus='rejected'`; otherwise update returns 403.
- Admin-only: topic create/update/delete, all-responses, dept-completion, employee-completion, approve/reject/delete response, delete response files, bulk approve, dashboard-config update.
- UAT preflight must assert user-token 403 for Yokoten `dept-completion`, `all-responses`, and `employee-completion`.

### Response Model — Approval Workflow
- `IsRelated = 'Yes'` → `CorrectiveAction` + at least one evidence file required → `ApprovalStatus = 'pending'` → admin approve/reject
- `IsRelated = 'No'` → `ApprovalStatus = NULL` (auto-approved/no action required)
- `CorrectiveAction` and evidence files are enforced client+server side when `IsRelated = 'Yes'`.
- Status ที่ frontend ใช้ filter: `'responded'` | `'pending'` | `'rejected'`
- Admin response-on-behalf supports multi-department submit from the dashboard/detail modal. Frontend sends `departments: JSON.stringify([...])` in FormData; backend creates one `YokotenResponses` row per selected department while preserving the one-response-per `(YokotenID, Department)` unique-key rule.
- When one uploaded file is attached to multiple admin-created responses, each response gets its own `Yokoten_Response_Files` row pointing at the same stored file URL. `DELETE /response-files/:fileId` only removes the physical file when no other DB file row references that `FileURL`.

### Dashboard UX — Enterprise Phase 1
- Dashboard is treated as an operational control center before passive reporting.
- Admin executive dashboard renders `Enterprise Action Required` above charts. It groups:
  - pending approvals and rejected responses with drill-down to topic detail
  - missing department-topic responses prioritized by overdue/high-risk items
  - SLA/deadline watch for overdue and near-due topics
- Action-center rows use `.yok-open-topic-btn` and open `openDetailModal()` directly. If `data-rid` is present, the modal injects that response as `deptResponse` so admins can approve/reject in context.
- Keep charting secondary to the work queue: KPI strip → action required → department completion/status charts → risk/deadline summaries.

### Dashboard UX — Enterprise Phase 2
- Executive chart layer lives directly under `Enterprise Action Required`.
- `_buildExecutiveChartLayer()` renders:
- `Response Status Mix` donut (`#yok-status-chart`) for not responded / not-related auto-approved / pending / approved / rejected
  - `Monthly Yokoten Flow` line chart (`#yok-trend-chart`) for issued topics vs responses by month for `_dashYear`
- Chart lifecycle uses `_chartStatus` and `_chartTrend`; `_destroyCharts()` must destroy them when leaving dashboard or changing year.
- `_initStatusChart()` derives total possible responses from targeted dept-topic breakdown and `_allResponses`; `_initTrendChart()` uses `_topics` and `_allResponses` scoped to the selected year.

### Dashboard UX — Enterprise Phase 3
- Dashboard charts are no longer passive-only; they provide an inspectable drill-down layer under the executive chart row.
- `_dashboardDrilldown` stores the active drill-down selection and resets when the dashboard year changes.
- `Response Status Mix` supports drill-down from either the donut segment or the clickable legend row. It lists the exact missing department-topic items or response rows for that status.
- `Monthly Yokoten Flow` supports drill-down from chart points:
  - issued-topic points list topics issued in that month
  - response points list responses submitted in that month
- Drill-down rows use `.yok-open-topic-btn` and open the same Yokoten detail modal, preserving the admin approve/reject and response-on-behalf flows.

### Dashboard UX — Enterprise Phase 4
- `_buildExecutiveRiskWatch(deptSummary, topics, allResp)` renders directly after `Enterprise Action Required` and before the executive chart row.
- It is a decision layer, not a new API: it derives all items from existing `deptSummary`, selected-year `topics`, and `_allResponses`.
- The watch panel groups:
  - High/Critical department-topic gaps that have not responded yet
  - pending approvals sorted by age in days
  - department bottlenecks scored from completion %, pending approvals, rejected responses, and high-risk gaps
- High-risk and pending rows use `.yok-open-topic-btn`; department bottleneck rows switch to Admin → department completion view via `.yok-admin-dept-watch-btn`.

### Dashboard UX — Enterprise Phase 5
- `_buildExecutiveBrief(deptSummary, topics, allResp, alertTopics)` renders as the first executive dashboard block before `Enterprise Action Required`.
- It summarizes selected-year Yokoten health into one management-read paragraph plus four metrics:
  - response coverage
  - High/Critical response coverage
  - overdue response gaps
  - oldest pending approval age
- Health labels are derived client-side only: `Stable`, `Watch Closely`, or `Critical Attention`.
- Brief buttons use `.yok-brief-drill-btn` to open the existing dashboard drill-down layer, and `.yok-brief-admin-dept-btn` to jump to Admin → department completion.

### Dashboard UX — Enterprise Phase 6
- Executive brief calculations live in `_getExecutiveBriefData(deptSummary, topics, allResp, alertTopics)` so dashboard and PDF use the same health/coverage numbers.
- `exportYokotenPDF()` prepends a Board Report Snapshot page before the existing department/table report pages.
- The PDF snapshot includes:
  - Executive Board Snapshot text + health label
  - response coverage, High/Critical coverage, overdue gaps, and oldest pending approval age
  - top High/Critical response gaps
  - oldest pending approvals
- This is frontend-only PDF composition; it does not add endpoints, tables, or schema.

### Dashboard UX — Enterprise Phase 7
- Yokoten UI wording is standardized as Thai + English for high-traffic surfaces.
- Primary dashboard panels use bilingual titles and metrics, for example:
  - `Executive Brief / สรุปผู้บริหาร`
  - `Enterprise Action Required / งานที่ต้องติดตาม`
  - `Executive Risk & Aging Watch / ความเสี่ยงและงานค้าง`
  - `Response Status Mix / สัดส่วนสถานะตอบกลับ`
  - `Monthly Yokoten Flow / แนวโน้มรายเดือน`
- Detail modal and admin response controls use bilingual labels for risk, response status, target scope, deadline, approve/reject/delete, and admin response-on-behalf.
- Keep future Yokoten labels in the same pattern:
  - dashboard/report headings: English first, Thai second
  - operational status/action labels: English + Thai in one short line
  - avoid changing API field names or stored status values; this phase is UI wording only

### Yokoten Final Polish
- Frontend must guard admin-only UI even when an old saved tab/state points to Admin. Non-admin users are redirected back to Topics, and admin-only click handlers show `Admin access required / ต้องใช้สิทธิ์ผู้ดูแลระบบ`.
- Topics filter bar includes an SLA filter with values:
  - `overdue` = not responded and deadline has passed
  - `due_soon` = not responded and deadline is within the near-deadline window
  - `no_deadline` = topic has no deadline
- Topics empty state should be bilingual and explain that filters/search can be adjusted.
- `exportYokotenPDF()` includes enterprise report metadata: document no., generated date, generated by, scope year, and `Internal Use Only` classification.

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
- Response attachments use `backend/storage.js` display names (`file.originalName` / `cleanOriginalFilename()`), so Thai filenames are stored for display/download metadata while physical stored filenames remain randomized.
- Frontend validates response/topic attachment type, max 10 response files, and 20 MB per file before upload.

### Yokoten Safety Guards
- Soft-deleted responses (`IsDeleted=1`) are ignored when checking whether a department already responded, so admin-deleted responses do not block a new submission.
- Users can update a response only when it belongs to their department and has `ApprovalStatus='rejected'`; admins can still edit for governance work.
- Approve/reject endpoints only operate on active responses (`IsDeleted IS NULL OR IsDeleted = 0`).
- Server 500 responses use a standard user-facing message while logging technical errors to the server console.

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
ใช้ `SELECT r.* FROM YokotenResponses r WHERE r.Department = ?` แทน `SELECT r.*, GROUP_CONCAT(...) ... GROUP BY r.ResponseID` — MySQL/MariaDB อาจใช้ `sql_mode=only_full_group_by`; files ดึงแยกผ่าน `filesMap` อยู่แล้ว

## CCCF Module — Architecture

### Tables
| Table | Purpose |
|-------|---------|
| `CCCF_FormA_Worker` | รายการค้นหาอันตรายรายบุคคล (พนักงานส่งเอง) — มี `SafetyUnit` column (auto-migrated) |
| `CCCF_FormA_Permanent` | เอกสารผลดำเนินการถาวร — ส่งโดย supervisor หรือ admin ส่งแทนได้ พร้อมแนบไฟล์ server file storage, มี `AssigneeID`, `StopType`, `Rank` |
| `CCCF_EmailOutbox` | คิวอีเมล CCCF Form A Permanent แบบ text+HTML แยกจาก Hiyari; ใช้ retry ได้ผ่าน admin endpoint |
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
- ฟอร์ม Permanent ต้องคง field เดิมครบ: `ผู้รับผิดชอบ`, `JobArea`, `SubmitDate`, `Summary`, `StopType`, `Rank`, `FormFile`; เพิ่ม UX/related forms ได้ แต่ห้ามลบ field เหล่านี้
- Permanent tab แสดง “แบบฟอร์มที่เกี่ยวข้อง” จาก `Module_Forms` ด้วย `module=cccf`; admin จัดการ template ได้จากปุ่มแบบฟอร์ม และ user เห็นเฉพาะ active forms
- ถ้าเป็น admin ต้องเลือกผู้รับผิดชอบ (`AssigneeID`) จาก assignment/master employee ได้ และระบบเติม `SubmitterName` + `Department` ตาม master
- backend helper `resolvePermanentSubmitter()` ใช้ source of truth จาก `Employees` เมื่อมี `AssigneeID`
- endpoint ที่เกี่ยวข้อง:
  - `POST /cccf/form-a-permanent` — supervisor ส่งเอง หรือ admin ส่งแทนผู้ใช้
  - `PUT /cccf/form-a-permanent/:id` — admin แก้ไขรายการ Permanent และอัปไฟล์แทนได้
  - `DELETE /cccf/form-a-permanent/:id` — admin ลบรายการได้

### CCCF Permanent Email Loop
- `backend/routes/cccf.js` ใช้ `sendMail({ text, html })` + `buildHiyariEmail()` เพื่อสร้าง corporate HTML email แบบเดียวกับ Hiyari แต่แยก `CCCF_EmailOutbox`
- Admin recipient ใช้ `CCCF_ADMIN_EMAIL` หรือ fallback `HIYARI_ADMIN_EMAIL` / `ADMIN_EMAIL` / default company safety admin
- Email events: `Submitted` แจ้ง Safety Admin, `SubmittedByAdmin` แจ้งเจ้าของงานเมื่อ admin ส่งแทน, `Updated`/`UpdatedWithFile` แจ้งเจ้าของงานเมื่อ admin แก้ไข, `Assigned`/`AssignmentUpdated` แจ้งผู้รับผิดชอบเมื่อมี assignment
- Owner email ดึงจาก `Employees.CompanyEmail` และรับเฉพาะโดเมนบริษัท `@thaisummit-harness.co.th`; ไม่มี email จะไม่ block การบันทึก แต่จะไม่ส่งเมลหา owner
- Admin retry endpoints: `GET /cccf/email-outbox`, `POST /cccf/email-outbox/:id/retry`, `POST /cccf/email-outbox/retry-queued`

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
ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อให้ import/export ข้าม MySQL-compatible engines ง่ายขึ้น

### Admin Actions (per row in overview tables)
- **ดูรายการ** → modal แสดงรายการเดินตรวจ + เพิ่ม/ลบรายการ (calls `GET /patrol/member-records`)
- **แก้ไขเป้าหมาย** → modal แก้ `TargetPerYear` (calls `PUT /patrol/roster/:id`)
- **ลบสมาชิก** → confirm + calls `DELETE /patrol/roster/:id`
- **เพิ่มสมาชิก** button (ในหัว table) → modal **multi-select** ค้นหาพนักงาน + เลือกหลายคนพร้อมกัน (calls `POST /patrol/roster` ทีละคน)
  - ซ่อนพนักงานที่อยู่ใน roster **ทั้งสองกลุ่ม** ออกจากรายการค้นหา (fetch ทั้ง `top_management` + `supervisor` พร้อมกัน แล้ว union existingIds) — ป้องกัน admin สับสน
  - กด row เพื่อ toggle (checkbox UI), selected chips แสดงด้านล่าง
  - เป้าหมาย (TargetPerYear) ใส่ครั้งเดียว ใช้กับทุกคนที่เลือก

### Admin Record — บันทึกแทนพนักงานทุกคน (ไม่จำกัด roster)
- Admin เห็น **search card "บันทึกการเดินตรวจ (Admin)"** เหนือ sub-tab toggle ใน Overview tab
- พิมพ์ชื่อ / รหัสพนักงาน / แผนก → debounce 300ms → `GET /patrol/employee-search?q=` → dropdown สูงสุด 30 คน
- คลิกพนักงานใน dropdown → เปิด `openAdminRecordModal(employeeId, name, 0)` ซึ่งแสดงรายการเดินตรวจปัจจุบัน + ฟอร์มเพิ่ม/ลบ
- ใช้ร่วมกับ `GET /patrol/member-attendance?employeeId=X&year=Y` และ `POST/DELETE /patrol/admin-record` ที่มีอยู่แล้ว — ไม่มี table ใหม่
- **`GET /api/patrol/employee-search`** (Admin-only) — query `Employees` table, params: `q` (free text), returns `{ EmployeeID, EmployeeName, Department, Position }[]` สูงสุด 30 รายการ

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

## Admin Hub (System Console) — 9 Tabs

`public/js/pages/admin.js` มี 9 tabs:

2026-05-26 System Console Phase A layout shell:

- `public/js/pages/admin.js` now uses `admin-console-shell`, `admin-console-hero`, and `admin-console-content` so System Console can use the full module workspace width instead of being constrained to `max-w-7xl`.
- The change is intentionally shell-only: no admin tab logic, API calls, backend routes, or database schema were changed.
- `public/style.css` defines the additive admin shell classes; existing tab internals and shared design-system primitives remain untouched.
- Phase B responsive tab bar:
  - System Console tabs now use `admin-console-tabs` and `admin-console-tab` classes instead of the old thin underline-only layout.
  - Desktop tabs spread across the full command bar; mobile/tablet keeps horizontal scrolling.
  - The tab IDs and `window._adminTab(key)` click flow are unchanged.
- Phase C Admin Dashboard density:
  - Dashboard tab now starts with a denser command center: total action-signal count, readiness status, severity breakdown, and quick links to Employee Master, System Health, Audit Log, and Permissions.
  - Operational snapshot now has a section header, direct shortcuts to key admin tabs, a wider KPI grid, and a wider department/audit split for desktop.
  - This phase remains frontend-only and uses the existing `/api/admin/dashboard-stats` response.
- Phase D Employee Master / Reference density:
  - Reference Data uses wider responsive grids, a desktop-friendly filter bar, taller master-list panels, wider area tiles, and a minimum table width to keep columns readable.
  - Employee Master now has a compact toolbar summary for employees, filtered rows, email review issues, admin accounts, and profile gaps.
  - Employee Master search/actions expand better on desktop, and the employee table has a minimum width so email/readiness/role columns do not collapse.
  - This phase remains frontend-only and does not change admin APIs or schema.
- Phase E System Health / Audit polish:
  - System Health now starts with a System Assurance header and quick links to Audit Log, Dashboard, and Employee Master.
  - Audit Log now starts with an Audit Trail header, quick actions for Failed Only, Export CSV, and System Health, plus a wider desktop filter grid.
  - Audit summary grid and audit table width were adjusted for desktop readability; path/detail columns have more room before truncation.
  - This phase remains frontend-only and does not change admin APIs or schema.
- Post-closeout refinements:
  - System Health readiness signals are now clickable drilldowns: failed API/missing table signals open Audit Log with Failed Only preset, employee master signals open Employee Master, stale 4M opens 4M, and stale Hiyari opens Hiyari.
  - Audit Log now has quick presets for Today, Last 7 days, Employee changes, and Failed Only while keeping the existing filters and CSV export.
  - 2026-06-02 Activity Targets Phase AT-1 + AT-2: System Console > Activity Targets now shows admin guidance for yearly target/pass percentage examples (`12/year + 80%`, `4/year + 100%`, `1/year + 100%`, and `N/A`) plus a Coverage Summary for position templates. Coverage uses existing `GET /api/activity-targets/position-templates` data to show configured slots, N/A slots, missing slots, zero-target slots, positions needing review, and activity-level coverage. This phase is frontend-only; it does not add Department/Unit override yet and does not change API, uploads, or MySQL schema.
  - 2026-06-02 Activity Targets Phase AT-3: Department/Unit Override added. New priority is `Employee Override > Department/Unit Override > Position Template`. PHP production and Node dev now support `GET/PUT /api/activity-targets/scope-overrides`; PHP creates lowercase `activity_scope_overrides` with unique `(Department, Unit, ActivityKey)`. The Activity Targets admin tab now has a third sub-tab for department-wide or unit-specific targets. `/activity-targets/employee/:empId` and `/activity-targets/me` now merge scope overrides and return `source: "scope"` when applicable. No upload storage change.
    - Verification: PHP lint passed for `api/handlers/targets.php`; JS syntax passed for `public/js/pages/admin.js`, `backend/routes/activity-targets.js`, and `backend/scripts/uat-preflight.js`; `npm --prefix backend test` passed with UAT preflight expanded to 91/91 read/permission surfaces including `GET /api/activity-targets/scope-overrides`.
    - Production smoke: deployed `api/handlers/targets.php` and `public/js/pages/admin.js`, then used temporary marker `AT3*/CODX_AT3_DEPT_*` to seed one employee, create department-wide and unit-specific `ky` scope overrides, verify `/activity-targets/employee/:empId`, `/activity-targets/me`, employee override priority, fallback from employee override to unit scope, and fallback from unit scope to department scope. Cleanup verified temporary employee, scope rows, and employee override rows all returned 0. The one-time smoke helper was deleted from production and confirmed 404.
  - 2026-06-02 Activity Targets Phase AT-4 + AT-5: Coverage Matrix and system integration review completed locally. PHP production and Node dev now support Admin-only `GET /api/activity-targets/coverage-matrix`, resolving every employee/activity slot through `Employee Override > Department/Unit Override > Position Template`. The matrix reports `Employee Override`, `Department/Unit Override`, `Position Template`, `Missing`, `N/A`, and zero target distinctly; the System Console matrix sub-tab adds Department, Unit, Position, Activity, Source, and Review-needed filters plus click-through into the matching editor.
    - Dashboard My Targets now displays the effective source. Person Search / Safety 360 now receives and renders effective targets with target, actual, completion percentage, pass status, and source. Department x Module Compliance adds a Targets column with hover detail for missing, zero, N/A, scope, employee, and template rows. Admin readiness now counts unresolved employee/activity slots after scope-aware merging instead of checking only for missing position templates.
    - Local verification passed: PHP lint for `api/index.php`, `api/handlers/targets.php`, `api/handlers/people.php`, and `api/handlers/admin_phase8.php`; Node/browser syntax checks for changed JS files; `git diff --check`; and `npm --prefix backend test` with UAT preflight expanded to 93/93 including Admin 200 and User 403 checks for `/activity-targets/coverage-matrix`.
    - Production deployment and read-only smoke passed: uploaded `api/index.php`, `api/handlers/targets.php`, `api/handlers/people.php`, `api/handlers/admin_phase8.php`, `public/js/pages/admin.js`, `public/js/pages/dashboard.js`, and `public/js/pages/search.js`. Verified public branding 200; Admin matrix 200; User matrix guard 403; dashboard overview 200 with Targets column; `/activity-targets/me` 200; person search 200; and Admin dashboard readiness 200. Matrix summary returned 2,292 employees / 20,628 slots. Existing employee `008744` verified `patrol` merged from Employee Override with target 20, and Safety 360 returned the matching effective target source. No temporary production rows or files were created, so cleanup was not required.
  - 2026-06-02 Activity Targets Phase AT-6 KPI Definition Foundation completed locally. Node dev and PHP shared-hosting definitions now attach backward-compatible metadata to all 9 activities: `metricType`, `scopeType`, `unitLabel`, and `targetMode`. KPI types are `fixed_count` for Safety Patrol and KY; `dynamic_ratio` for Patrol Issues and Yokoten; and `people_coverage` for CCCF Worker/Permanent, OJT SCW, Safety Training, and Hiyari. The metadata is returned by `/api/activity-targets/activities`, `/activity-targets/employee/:empId`, `/activity-targets/me`, and the Admin coverage matrix without removing any existing response fields. No MySQL schema or upload-storage change.
    - System Console > Activity Targets now explains the three KPI types instead of describing every target as a record count. The guide, coverage summary, coverage matrix, Position Template editor, Department/Unit editor, and employee editor display metric-type badges with units. Existing editor inputs and calculators intentionally remain unchanged in AT-6 so saved targets continue to behave as before.
    - Local verification passed: `node --check` for `backend/routes/activity-targets.js` and `public/js/pages/admin.js`; PHP lint for `api/handlers/targets.php`; focused AT-6 static metadata parity assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Activity Targets Phase AT-7 Admin Target Editor UX completed locally. Dynamic-ratio rows for Patrol Issues and Yokoten now show `ระบบคำนวณ` with formula previews (`ปิดแล้ว / ประเด็นรับผิดชอบ` and `ตอบแล้ว / หัวข้อที่มอบหมาย`) instead of a manual yearly-target input in Position Template, Department/Unit, and employee editors. Fixed Count and People Coverage rows retain numeric inputs with activity-specific units. Saving a dynamic ratio stores a compatibility sentinel internally (`YearlyTarget=1`) through both Node and PHP guards, so old/direct clients cannot persist misleading manual denominator values.
    - Position-template coverage and the Admin employee coverage matrix now treat Dynamic Ratio as configured by the system without requiring fake yearly counts. The matrix adds `System Ratio` source rows, a System summary count, dynamic target display text, and click-through from a system row into its Department scope editor. Dynamic Ratio is temporarily omitted from personal `/activity-targets/me` widgets until AT-8 provides department-level calculators, avoiding misleading personal `0/1` cards.
    - Cache bust advanced for the AT-7 deploy bundle: `index.html` now loads `public/js/main.js?v=20260602-activity-targets-at7`; `main.js` imports `admin.js?v=20260602-activity-targets-at7`; and the stale HTML CSS reference was aligned to the already-implemented Mobile Navigation M5.3 stylesheet version `v=20260602-mobile-nav-m53`.
    - Local verification passed: `node --check` for `backend/routes/activity-targets.js`, `public/js/pages/admin.js`, and `public/js/main.js`; PHP lint for `api/handlers/targets.php`; focused AT-7 static contract assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`.
    - Next recommended phase: deploy AT-6 + AT-7 (`index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `api/handlers/targets.php`, and `CLAUDE.md`) with authenticated production read smoke and a temporary dynamic-ratio normalization mutation smoke, then implement AT-8 calculators for Department Patrol Issue closure and assigned-topic Yokoten completion.
  - 2026-06-02 Activity Targets Phase AT-8 Dynamic Ratio Calculators completed locally. Node dev and PHP shared-hosting now calculate Department KPI ratios for Patrol Issues (`closed issues / responsible issues`) and Yokoten (`responded assigned topics / assigned topics`). A Yokoten topic with empty `TargetDepts` remains assigned to all departments; otherwise only explicitly targeted departments receive it. Both calculators return `noData: true` with a null completion percentage when there is no valid denominator, rather than treating missing source data as a failed KPI.
    - Dynamic Ratio rows returned to `/api/activity-targets/me` with `source: "system"`, the calculated numerator/denominator, and department calculation scope. Safety 360 uses the viewed employee's department for the same ratios. Dashboard My Targets, compact module widgets, and Safety 360 now label these rows as Department KPI / System Ratio and render no-data separately from failed status. The dashboard overall percentage excludes no-data rows and displays `-` when no KPI row is evaluable.
    - Cache bust advanced to `v=20260602-activity-targets-at8` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local verification passed: `node --check` for the changed backend/frontend JS files; PHP lint for `api/handlers/targets.php` and `api/handlers/people.php`; focused AT-8 static contract assertions; UTF-8 encoding scan; `git diff --check`; and `npm --prefix backend test` with UAT preflight `93/93`. A committed local mutation smoke created isolated temporary rows and verified Patrol Issues `1/2 = 50%` plus Yokoten `1/2 = 50%`; cleanup verification returned zero temporary rows.
    - Next recommended phase: deploy AT-6 + AT-7 + AT-8 with authenticated production read smoke and isolated temporary Dynamic Ratio mutation smoke, verify cleanup, then implement AT-9 People Coverage Calculators.
  - 2026-06-02 Activity Targets Phase AT-6 + AT-7 + AT-8 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. The previous Production files were downloaded first to `backups/production/at8-code-20260602-160354/`.
    - Production verification passed: cache-busted HTML and `main.js` contain `v=20260602-activity-targets-at8`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`.
    - Isolated Production Dynamic Ratio mutation smoke passed after accounting for the Production-required `yokotenresponses.EmployeeID`: Patrol Issues `1/2 = 50%`, Yokoten `1/2 = 50%`, then rollback cleanup returned `patrolIssues=0`, `yokotenTopics=0`, and `yokotenResponses=0`. Temporary root helper `codx_at8_ratio_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-02 Activity Targets Phase AT-9 People Coverage Calculators completed locally. People Coverage KPIs now use effective Admin-configured yearly targets as denominators while calculating scope-level actual people: CCCF Worker counts distinct Form A worker submitters by Department/Unit; CCCF Permanent counts distinct permanent assignees by Department/Unit where employee identity is available; OJT Stop-Call-Wait uses the Department attendee snapshot; Safety Training counts distinct passed employees by Department; and Hiyari Near-Miss counts distinct reporters by Department/Unit. This replaces misleading personal document counts in `/api/activity-targets/me` and Safety 360 while preserving the existing target priority `Employee Override > Department/Unit Override > Position Template`.
    - People Coverage responses include `calculationScope` and `calculationMethod` separately from the target `source`, so the UI can explain both where the configured target came from and whether the actual KPI is Department or Department/Unit scope. Dashboard My Targets, Safety 360, and compact module widgets now label Scope KPI values explicitly. A configured denominator of zero or an unavailable source table returns no-data instead of a failed KPI.
    - Cache bust advanced to `v=20260602-activity-targets-at9` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local Node and PHP transaction mutation smokes both passed for all five calculators with duplicated source records: CCCF Worker, CCCF Permanent, OJT SCW, Safety Training, and Hiyari each returned `2/4 = 50%`; rollback cleanup returned zero temporary rows across Hiyari, Training, OJT, CCCF Permanent, CCCF Worker, and Employees.
    - Next recommended phase: deploy AT-9 with authenticated Production read smoke and isolated People Coverage mutation smoke, verify cleanup, then implement AT-10 KY / Patrol fixed-count alignment.
  - 2026-06-02 Activity Targets Phase AT-9 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. The previous Production files were downloaded first to `backups/production/at9-code-20260602-162014/`.
    - Production verification passed: cache-busted HTML and `main.js` contain `v=20260602-activity-targets-at9`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`.
    - Isolated Production People Coverage mutation smoke passed: CCCF Worker, CCCF Permanent, OJT SCW, Safety Training, and Hiyari each returned `2/4 = 50%` with duplicate source rows where relevant. Rollback cleanup returned `0` across Hiyari, Training, OJT, CCCF Permanent, CCCF Worker, and Employees. Temporary root helper `codx_at9_coverage_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-02 Activity Targets Phase AT-10 KY / Patrol Fixed-count Alignment completed locally. Safety Patrol now counts personal `patrol_attendance + patrol_self_checkin` records for the selected year and prefers `patrol_roster.TargetPerYear` as its effective target, falling back to the generic Activity Target when no roster target exists. KY Activity now counts `ky_activities` at Department or configured Safety Unit scope and prefers active `ky_program_config.YearlyTarget`, falling back to the generic Activity Target when module config is absent.
    - `/api/activity-targets/me` and Safety 360 receive the same aligned calculations with `calculationScope`, `calculationMethod`, and `targetSource`. When a KPI is surfaced solely by Patrol roster or KY program config, the response uses `source: "module"` instead of pretending it came from a Position Template. Dashboard and Safety 360 distinguish `Personal KPI · Patrol Roster` from `Scope KPI · KY Program Config`; compact widgets retain personal vs Department/Unit scope labels. Module-level Patrol roster and KY config targets can surface a KPI even when no generic target was configured.
    - Cache bust advanced to `v=20260602-activity-targets-at10` for `index.html`, the `main.js` entry graph, Dashboard, Search, Yokoten, OJT, Training, Hiyari, KY, and their shared activity widget imports. No MySQL schema or upload-storage change.
    - Local Node and PHP transaction mutation smokes both passed: Patrol attendance `1` + self-checkin `1` used roster target `4` and returned `2/4 = 50%`; KY Safety Unit activities `2` used program-config target `4` and returned `2/4 = 50%`. Cleanup returned zero temporary rows across KY activities/config, Patrol attendance/self-checkin/roster, and Employees.
    - Next recommended phase: deploy AT-10 with authenticated Production read smoke and isolated Patrol/KY alignment mutation smoke, verify cleanup, then implement AT-11 Dashboard / Safety 360 integration review.
  - 2026-06-04 Activity Targets Phase AT-10 deployed to Production. Uploaded and FTP SHA-256 verified the AT-10 bundle: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `public/js/pages/yokoten.js`, `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, `public/js/pages/ojt.js`, `public/js/pages/training.js`, `public/js/utils/activity-widget.js`, `api/handlers/targets.php`, `api/handlers/people.php`, and `CLAUDE.md`. Production backup was created at `backups/production/at10-code-20260604-075506/`.
    - Production read smoke passed after a patch to `api/handlers/targets.php`: cache-busted `index.html` and `main.js` contain `v=20260602-activity-targets-at10`; short-lived Admin JWT `POST /api/session/verify` passed; authenticated reads passed for `/api/activity-targets/activities`, `/api/activity-targets/me`, `/api/activity-targets/coverage-matrix`, and `/api/person-search/employees?limit=1`. The patch moved the AT-10 fixed-count alignment block out of `activity_target_coverage_matrix_data()` and into `/activity-targets/me`, fixing an initial Production `coverage-matrix` 500 caused by an undefined `$merged`.
    - Isolated Production Patrol/KY alignment mutation smoke passed through a temporary API route: Patrol returned `2/4 = 50%` from attendance + self-checkin using `patrol_roster`; KY returned `2/4 = 50%` using `ky_program_config` with Department/Unit scope. Transaction rollback cleanup returned `0` for KY activities/config, Patrol self-checkin/attendance/roster, and Employees. The temporary route restored `api/index.php` with SHA-256 verification, and `codx_at10_alignment_smoke.php` was deleted and verified HTTP `404` plus FTP absent.
  - 2026-06-04 Activity Targets Phase AT-11 Dashboard / Safety 360 integration review completed locally. Safety 360 and Person Search now return `activityTargetSummary.configured`, `evaluable`, `passed`, and `noData`, so no-data rows no longer inflate the visible passed denominator. Dashboard My Activity Targets now also excludes `passed=null` rows from its denominator and shows the no-data count in the year line.
    - Files changed for AT-11: `backend/routes/person-search.js`, `api/handlers/people.php`, `public/js/pages/search.js`, and `public/js/pages/dashboard.js`. No MySQL schema or upload-storage change.
    - Verification completed: `node --check backend/routes/person-search.js`, `node --check public/js/pages/search.js`, `node --check public/js/pages/dashboard.js`, `C:\xampp\php\php.exe -l api\handlers\people.php`, and `git diff --check` passed. `npm --prefix backend test` was attempted but local smoke failed before AT-11 assertions because MySQL/MariaDB was not running locally (`ECONNREFUSED`); no `mysql`/`mysqld` process was present.
    - Next recommended phase: deploy AT-11 to Production with authenticated read smoke for `/api/person-search/employees/:id` or an equivalent Safety 360 profile read, then begin AT-12 Activity Targets admin data-quality rollout (coverage matrix filters, missing/zero target cleanup guidance, and export/reporting for departments).
  - 2026-06-04 Activity Targets Phase AT-11 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/dashboard.js`, `public/js/pages/search.js`, `api/handlers/people.php`, and `CLAUDE.md`. Production backup was created at `backups/production/at11-code-20260604-081326/`. Cache bust advanced to `v=20260604-activity-targets-at11` for `main.js`, Dashboard, and Search.
    - Authenticated Production Safety 360 read smoke passed: cache-busted `index.html` and `main.js` contain the AT-11 marker; short-lived Admin JWT `POST /api/session/verify` passed; `/api/person-search/employees?limit=5` returned a sample employee; `/api/person-search/profile/AP0123?year=2026` returned `activityTargetSummary` with `configured`, `evaluable`, `passed`, and `noData`. The summary matched the returned rows exactly: `configured=4`, `evaluable=2`, `passed=0`, `noData=2`.
  - 2026-06-04 Activity Targets Phase AT-12 Admin Data-quality Rollout completed locally. System Console > Activity Targets > Coverage Matrix now has an AT-12 Data Quality Queue above the table, an Issue Type filter (`review`, `missing`, `zero`, `N/A`), quick filters for Review queue/Missing/Zero, top review departments, top review activities, and an export-current-view action. Export uses SheetJS when available and falls back to CSV, with columns for employee, department/unit, position, activity, metric type, source, issue, target, unit, and pass percentage.
    - Files changed for AT-12: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-activity-targets-at12` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions, and `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy AT-12 to Production with authenticated Admin Coverage Matrix read smoke, verify AT-12 marker in `main.js`, and optionally export a filtered review queue from the browser.
  - 2026-06-04 Activity Targets Phase AT-12 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/at12-code-20260604-082030/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-activity-targets-at12`; `public/js/pages/admin.js` contains `AT-12 Data Quality Queue`, `_atMatrixQuick`, and `_atMatrixExport`.
    - Authenticated Admin Coverage Matrix read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/activity-targets/coverage-matrix?year=2026` returned `20,628` rows and summary `employees=2,292`, `review=15,866`, `missing=15,866`, `zero=0`. Smoke recalculated review/missing/zero from returned rows and matched the summary exactly.
    - Next recommended phase: Phase AT-13 can focus on guided cleanup workflows, such as bulk template suggestions for repeated missing position/activity pairs, department owner export packs, or optional save-from-quality-queue actions.
  - 2026-06-04 Activity Targets Phase AT-13 Guided Cleanup Workflows completed locally. System Console > Activity Targets > Coverage Matrix now groups repeated missing `Position + Activity` pairs into Guided Cleanup Suggestions, ranked by impacted employees and showing impacted department counts. Each suggestion opens the Position Template editor for that position, highlights the suggested activity row, and scrolls it into view so Admin can set the missing template without manually searching the 20k-row matrix.
    - Files changed for AT-13: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-activity-targets-at13` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions for Guided Cleanup Suggestions and AT-13 cache bust, and `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy AT-13 to Production with marker verification and authenticated Admin Coverage Matrix read smoke, then browser-check one Guided Cleanup suggestion opens/highlights the expected Position Template row.
  - 2026-06-04 Activity Targets Phase AT-13 deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/at13-code-20260604-082724/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-activity-targets-at13`; `public/js/pages/admin.js` contains `Guided Cleanup Suggestions`, `_atGuideTemplate`, `_atMissingTemplateSuggestions`, and `at-template-row`.
    - Authenticated Admin Coverage Matrix read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/activity-targets/coverage-matrix?year=2026` returned `20,628` rows and summary `employees=2,292`, `review=15,866`, `missing=15,866`, `zero=0`. Smoke recalculated review/missing/zero from returned rows and matched the summary exactly.
    - Next recommended phase: browser-check one Guided Cleanup suggestion opens/highlights the expected Position Template row, then continue AT-14 if needed with save-from-quality-queue actions or department owner export packs.
  - 2026-06-04 System Console Employee Master filters completed locally. The Employee Master toolbar now includes Department and Unit dropdown filters generated from current employee data, a clear-filters action, and the table search now also searches Unit. Selecting a Department refreshes the Unit list to only units used by employees in that department. The table now displays a Unit column, filtered counts update in the toolbar summary, and Employee Excel export exports the currently filtered rows instead of always exporting the full employee cache.
    - Files changed: `index.html`, `public/js/main.js`, and `public/js/pages/admin.js`. Cache bust changed to `v=20260604-employee-master-filters` for `main.js` and Admin. No PHP API, MySQL schema, or upload-storage change.
    - Verification completed: `node --check public/js/pages/admin.js`, `node --check public/js/main.js`, static marker assertions for `emp-dept-filter`, `emp-unit-filter`, `_empFilteredRows`, and `v=20260604-employee-master-filters`, plus `git diff --check` passed with only existing CRLF warnings.
    - Next recommended phase: deploy Employee Master filters to Production with marker verification and authenticated Admin employees read smoke.
  - 2026-06-04 System Console Employee Master filters deployed to Production. Uploaded and FTP SHA-256 verified: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md`. Production backup was created at `backups/production/employee-master-filters-20260604-090226/`.
    - Production marker verification passed: cache-busted `index.html` and `main.js` contain `v=20260604-employee-master-filters`; `public/js/pages/admin.js` contains `emp-dept-filter`, `emp-unit-filter`, `_empFilteredRows`, `_empDepartmentFilter`, and `_empClearFilters`.
    - Authenticated Admin employees read smoke passed: short-lived Admin JWT `POST /api/session/verify` passed; `/api/employees` returned `2,293` rows, `41` unique departments, `0` non-empty units in current production employee data, sample `AP0123`. The Unit filter UI is still present and will populate once Employee Master rows contain Unit values.
  - 2026-06-02 Branding logo overflow production fix: production had the newer branding JavaScript but an older `public/style.css` without `.brand-logo-sm` and `.brand-logo img`, so a newly selected logo could render at its original image dimensions and cover the sidebar/content area. Added strict 32 x 32 px wrapper bounds and image max bounds in CSS, added inline JavaScript bounds as a stale-CSS fallback, and cache-busted the CSS/main module references in `index.html` with `v=20260602-brand-logo-bounds`.
    - Verification: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, production HTML/CSS/JS response checks, and public/settings branding read smoke passed. Production currently has no persisted `app_branding` value (`/settings/app_branding` returns `null`), so no old branding row or uploaded-logo cleanup was required.
  - 2026-06-02 Branding Login synchronization fix: connected the desktop Login hero to the same public branding data already used by Sidebar and mobile Login header. Desktop Login now renders the saved logo in a bounded 40 x 40 px wrapper, replaces the hero app name and tagline from `app_branding`, and synchronizes the Login footer tagline. Corporate identity text `Thai Summit Harness Co., Ltd.` remains static. `applyAppBranding()` now supports bounded per-element logo sizes through `data-brand-size`, defaults unchanged elements to 32 px, and synchronizes browser title plus iOS web-app title.
    - Cache bust updated to `v=20260602-brand-login-sync` for `public/style.css` and `public/js/main.js`. Local verification passed: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, static Login-branding contract assertions, and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Branding Login split: System Console > Branding now separates compact Sidebar/Mobile header/browser-title text from the desktop Login hero text. `app_branding.appName` and `app_branding.tagline` remain the backward-compatible Sidebar/Header fields, while optional `loginHeroTitle` and `loginHeroSubtitle` drive the desktop Login hero and fall back to `appName/tagline` when blank. The logo remains shared across all placements. PHP shared-hosting and Node dev public branding endpoints now include the two optional Login fields. No MySQL schema or upload-storage change.
    - Deployed to production via FTP root `/tsh-safety-core/`: `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, `api/index.php`, and `CLAUDE.md`. Cache bust updated to `v=20260602-brand-login-split`; `public/js/main.js` now imports `admin.js?v=20260602-brand-login-split`.
    - Verification passed: `node --check public/js/main.js`, `node --check public/js/pages/admin.js`, `node --check backend/server.js`, `C:\xampp\php\php.exe -l api\index.php`, `git diff --check -- index.html public/js/main.js public/js/pages/admin.js backend/server.js CLAUDE.md`, static Branding contract smoke, and `npm --prefix backend test` with UAT preflight `93/93`.
    - Production smoke passed: `GET /api/public/branding` returned 200 with `appName`, `tagline`, `loginHeroTitle`, `loginHeroSubtitle`, and `logoUrl`; production HTML references `v=20260602-brand-login-split` and desktop Login selectors; production `main.js` and `admin.js` contain the split Branding logic/fields. Current production values still have empty `loginHeroTitle/loginHeroSubtitle`, so Login falls back to `TSH SCA` / `TSH Safety Core Activity` until an Admin saves the desired long Login text from System Console > Branding. A temporary unauthenticated PHP setter was uploaded but was not executed after security review rejected the DB write; it was deleted immediately and verified 404.
    - Follow-up encoding fix: `public/js/pages/admin.js` was recovered from mojibake back to valid UTF-8 Thai text without BOM after the Branding split deploy. Cache bust updated again to `v=20260602-brand-login-split-utf8` for `index.html` and the `main.js` import of `admin.js`. Post-fix scan confirmed `index.html`, `public/js/main.js`, `public/js/pages/admin.js`, and `CLAUDE.md` have Thai Unicode text, zero mojibake markers, zero replacement characters, and no BOM.
  - 2026-06-02 Committee Sub-Committees member summary: the Committee module now adds a compact member summary directly above the Sub-Committees card grid. It shows total members across all sub-committees, a breakdown by position, and a breakdown by department/unit label. The summary uses existing `SubCommitteeData.positions[].count`, falling back to legacy `memberCount` when needed, so this is frontend-only with no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-sub-member-summary` for `index.html` and the `main.js` import of `committee.js`.
  - 2026-06-02 Committee Sub-Committees grouping: Sub-Committees are now sorted alphabetically by Department/Section then Safety Unit across the current card, timeline, export, print, copy, edit modal, and saved payload. The Sub-Committees display now groups cards by Department/Section, with Safety Unit cards inside each group. The member summary was expanded to separate breakdowns by position, Department/Section, and Safety Unit. The committee add/edit modal is wider on desktop (`max-w-6xl`) and the Sub-Committee editor list gets a taller scroll area. Frontend-only; no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-subcommittee-groups` for `index.html` and the `main.js` import of `committee.js`.
  - 2026-06-02 Committee Section-count refinement: the Sub-Committee count now uses distinct Department/Section count instead of raw Safety Unit item count in the current hero card, top current summary, timeline, export, print, and copy text. If a Sub-Committee has no selected Safety Unit, the card title and edit-form row fall back to the Department/Section name instead of showing an unprofessional unspecified label. The Department/Section group header no longer shows the raw Safety Unit count badge, and the member summary no longer includes a separate Safety Unit breakdown card; it keeps total members, by-position, and by-Department/Section only. Frontend-only; no PHP API, MySQL schema, or upload-storage change. Cache bust updated to `v=20260602-committee-section-counts`.
  - 2026-06-02 KPI Announcement CRUD production fix: KPI & Metrics announcement management now has a real edit action in the announcement manager and uses the shared-hosting-safe alias endpoint `/api/kpiannouncements/item?id=...` for edit, set-active, and delete so Apache/ModSecurity does not block `KPI-YYYY` IDs embedded in the URL path. The original `/api/kpiannouncements/:id` PHP routes remain for compatibility. Delete still protects announcements that have linked KPI rows and returns a Thai 409 message. No MySQL schema or upload-storage change. Cache bust updated to `v=20260602-kpi-announcement-crud` for `index.html` and the `main.js` import of `kpi.js`.
  - 2026-06-02 Accident Monthly Evidence: Accident > Safety KPI Board now requires a monthly Accident Report file to treat a month as complete. PHP shared-hosting schema guard creates `accident_monthly_reports` (`Year`, `MonthNo`, `Status`, report file metadata, notes, upload/update audit) with a unique key on `Year + MonthNo`. New endpoints: `GET /api/accident/monthly-reports?year=`, `POST /api/accident/monthly-reports` with multipart field `reportFile`, and `DELETE /api/accident/monthly-reports/:id`. Saving a monthly report also syncs `accident_performance.MonthlyStatus`, and `GET /api/accident/performance` now returns `monthlyReports`. KPI & Metrics shows a read-only Accident Report Monthly evidence strip for the selected year with a shortcut to Accident Board. Cache bust updated to `v=20260602-accident-monthly-evidence` for `index.html`, `accident.js`, and `kpi.js`.
  - 2026-06-02 Login first-use hint: added a compact emerald information panel directly below the Login password field and above `#login-error`. It tells new users that their initial password is the same as their employee ID and includes `012609` as an example. This is guidance-only: authentication flow, schema, and password lifecycle remain unchanged. A future security hardening phase should add a persisted must-change-password flag and force a password update after first login.
    - Verification: `git diff --check -- index.html CLAUDE.md`, DOM marker/order assertion for `#first-login-hint`, and `npm --prefix backend test` with UAT preflight `93/93`.
  - 2026-06-02 Mobile Navigation Phase M5.1: retained the mobile Bottom Tab Bar for thumb-friendly frequent actions and retained the Sidebar Drawer as the complete module menu. Consolidated Bottom Bar height, iPhone safe area, and content clearance into shared CSS variables. `#main-content` now reserves `Bottom Bar + safe area + 16px`, adds matching `scroll-padding-bottom`, and contains overscroll so the last row/button can be moved above the fixed bar.
    - Sidebar Drawer behavior is now explicit on mobile: Drawer z-index sits above the backdrop and Bottom Bar, opening the Drawer locks background scroll and hides the Bottom Bar temporarily, while closing restores the bar. Drawer closes through backdrop click, menu navigation, route changes, viewport transition to desktop, and the `Escape` key. Route changes now reset the actual `#main-content` scroll container as well as `window`.
    - Cache bust updated to `v=20260602-mobile-nav-m51` for `public/style.css` and `public/js/main.js`. Local verification passed: `node --check public/js/main.js`, `git diff --check -- index.html public/js/main.js public/style.css CLAUDE.md`, static CSS/JS contract assertions, and `npm --prefix backend test` with UAT preflight `93/93`. Browser-headless computed viewport automation could not return localhost DOM in this Windows environment; complete physical-device viewport UAT remains required after deploy.
  - 2026-06-02 Mobile Navigation Phase M5.2: added shared visual viewport tracking for mobile keyboards and modal forms. The browser now updates `--app-visual-viewport-height` and `--app-visual-viewport-offset-top` from `window.visualViewport`; focused text/select/textarea/contenteditable controls scroll into view after the keyboard settles. Bottom Tab Bar hides while a mobile keyboard or modal is active so it cannot cover form actions.
    - Mobile modal layout now follows the visible viewport instead of static `90vh`, anchors to the usable bottom edge, contains modal-body overscroll, and applies safe-area-aware form padding. Opening a shared modal locks the background content; closing restores the Bottom Bar and returns focus to the previous control. Mobile toast notifications now respect top safe area, fill the available width, wrap long messages, and cap overflow to the visible viewport.
    - Cache bust updated to `v=20260602-mobile-nav-m52` for `public/style.css`, `public/js/main.js`, and every frontend import of `public/js/ui.js` so all modules share one fresh UI-helper instance. Local verification passed: `node --check` for `public/js/main.js`, `public/js/ui.js`, and every `public/js/pages/*.js` module; `git diff --check -- index.html public/js/main.js public/js/ui.js public/js/pages public/style.css CLAUDE.md`; static CSS/JS contract assertions; and `npm --prefix backend test` with UAT preflight `93/93`. Complete physical-device viewport and software-keyboard UAT remains required after deploy.
  - 2026-06-02 Mobile Navigation Phase M5.3: hardened the mobile shell for iPhone Safari, Android Chrome, and installed PWA mode. The viewport meta now includes `viewport-fit=cover`; horizontal safe-area padding is applied to the Bottom Tab Bar and mobile header; iOS WebKit and standalone mode use the tracked visual viewport height instead of trusting a potentially stale `100dvh`. The PWA manifest no longer locks portrait orientation, allowing phone and tablet landscape use.
    - Visual viewport recovery now settles immediately, on the next animation frame, and after 320 ms. It also reruns after resize, orientation change, `pageshow`, visibility restore, focus changes, and visual viewport movement. Bottom Tab Bar hides whenever an editable control has focus on a mobile layout, avoiding Android browser differences in how keyboard height changes are reported. Installed-mode detection supports both CSS display mode and iOS `navigator.standalone`.
    - The standalone document viewer now locks background scrolling, hides Bottom Tab Bar, and applies safe-area padding while open. Cache bust advanced to `v=20260602-mobile-nav-m53` for CSS, main entry, service-worker registration/version, all `main.js` page-module imports, and every page import of `ui.js`, ensuring a single fresh frontend dependency graph after deploy.
    - Local verification passed: manifest JSON parse; `node --check` for `public/js/main.js`, `public/js/ui.js`, and every `public/js/pages/*.js` module; `git diff --check -- index.html sw.js public/manifest.webmanifest public/style.css public/js/main.js public/js/ui.js public/js/pages CLAUDE.md`; static compatibility assertions; and `npm --prefix backend test` with UAT preflight `93/93`. Physical-device testing on Safari iOS, Chrome Android, and installed standalone mode remains required after deploy.

| Tab | Key | Description |
|-----|-----|-------------|
| ภาพรวม | `dashboard` | KPI stat cards, dept chart, recent audit feed |
| กำหนดการตรวจ | `scheduler` | Patrol session scheduling (single + bulk by date range/weekday) |
| ข้อมูลพนักงาน | `employees` | Employee CRUD + bulk Excel import + pagination 25/page |
| ข้อมูลอ้างอิง | `reference` | Departments, Teams, Positions, Roles, Areas (Patrol_Areas) — add/edit/delete |
| สิทธิ์การใช้งาน | `permissions` | Permission matrix per role — Admin/User/Viewer |
| System Health | `health` | Module record counts, stale alert tables, readiness score, failed API 24h, audit activity 24h |
| Audit Log | `audit` | Admin-only audit trail for API mutations, summary strip, filterable by module/action/date/search |
| Branding | `branding` | App name/tagline + logo upload/reset stored in `App_Settings.app_branding` |
| เป้าหมายกิจกรรม | `targets` | Activity Targets — Coverage Matrix + เทมเพลตตามตำแหน่ง + ตามแผนก/หน่วยงาน + กำหนดรายบุคคล |

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
- `public/js/pages/patrol.js` — Safety Patrol no longer renders the duplicate work focus strip; today check-in, issue counts, and next patrol signals live in the hero stats, check-in card, tabs, and issue dashboard.
- `public/js/pages/patrol.js` — Safety Patrol Issue `VIEW` mode now shows a read-first summary block for status, rank, overdue state, dates, owner, reporter, and finish date before the detailed form sections.
- `public/js/pages/patrol.js` — Patrol issue forms validate required fields client-side before submit, preserve Issues tab/search/status/dept/unit/area/rank/stop filters across reloads, block duplicate submits/deletes in long workflows, and show clearer empty states plus image filename/thumbnail previews.
- `backend/routes/patrol.js` — Patrol issue create/temp-fix/close/update/delete and admin add/delete attendance/self-patrol writes audit logs; Patrol routes now validate year/month inputs before querying and avoid exposing technical DB errors to users.
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
- `public/js/pages/contractor.js` — Contractor dashboard duplicate summary strip was removed so the page starts directly with the useful breakdown/systems content.
- `public/js/pages/contractor.js` — Contractor UI now uses a more formal Document Control style: compact compliance header, Required Document Status panel, clearer category coverage, Recent Document Updates, Audit Trail wording, and cleaner document-library cards.
- `public/js/pages/contractor.js` / `backend/routes/contractor.js` — Contractor & Supplier E-Pass Online now supports `PartyType` for documents, an Accident Records tab, simple incident fields, multi-file evidence upload, and dashboard Zero External Accident YTD summary.
- `public/js/pages/contractor.js` — Documents tab supports Grid/List view switching; both modes preserve preview, download, edit, delete, filters, and pagination.
- `public/js/pages/contractor.js` — Dashboard Zero External Accident area is now a single bilingual target panel with balanced incident summary tiles instead of separate uneven cards.
- `public/js/pages/safety-culture.js` — Safety Culture dashboard now includes an enterprise summary strip for culture readiness, weak topics, PPE compliance, PPE violations, and executive PDF shortcut.
- `public/js/pages/committee.js` — Committee page keeps the cleaner core summary and current-committee hero only; the duplicate governance summary strip was removed after review.
- `public/js/pages/admin.js` — Employee master tab now includes an enterprise data-quality strip for missing core fields, department/position coverage, unit assignment, admin account count, and shortcuts to reference/permission controls.
- `public/js/pages/admin.js` — Reference / Master Data tab now includes a master-quality strip for master readiness, Safety Core unit coverage, duplicate master names, blank required names, loaded reference sets, and total master records.

- `public/js/pages/admin.js` — System Health now includes an enterprise readiness strip for pre-production readiness, failed API 24h, audit activity 24h, stale work, and missing/unreadable tables.
- `backend/routes/admin.js` — `GET /api/admin/system-health` now returns `readiness` and `audit` objects derived from module table availability, stale work queues, and Admin Audit Log activity.
- `public/js/pages/admin.js` — Audit Log now includes a summary strip for matched records, failures on current page, modules touched, active users, latest activity, and mutation count before the detailed table.

### Phase A UX Consistency Foundation

Phase A starts the enterprise design-system layer without breaking existing module screens.

- `public/style.css` now defines additive primitives: `ds-surface`, `ds-section`, `ds-filter-bar`, `ds-metric-card`, `ds-table-wrap`, `ds-table`, `ds-badge`, and `ds-empty-state`.
- `public/js/ui.js` exports reusable helpers: `statusTone()`, `statusBadge()`, `metricCard()`, and `emptyState()`.
- `public/js/pages/admin.js` uses the new primitives in Audit Log, Employee Master, Reference Master, and System Health as the reference implementation for filter bar, summary metrics, empty state, table, and status badges.
- `public/js/pages/fourm.js` now uses shared wrappers for dashboard cards, Change Notice filters/table, Man Record filters/table, status badges, and section cards.
- `public/js/pages/patrol.js` now uses shared table wrappers for the Safety Patrol issue register; filter scroll targets must support `.closest('.ds-table-wrap, .bg-white')` during the gradual migration.
- `public/js/pages/hiyari.js`, `public/js/pages/ky.js`, and `public/js/pages/yokoten.js` started Phase A migration on high-traffic history/topic/admin tables and filters. Keep localized display labels separate from canonical status values when using `statusBadge(status, { label })`.
- `public/js/pages/training.js`, `public/js/pages/ojt.js`, and `public/js/pages/search.js` now use shared filter, section, metric, table, and status primitives on key records/compliance/search/profile surfaces.
- `public/js/pages/contractor.js`, `public/js/pages/accident.js`, `public/js/pages/machine-safety.js`, `public/js/pages/committee.js`, and `public/js/pages/safety-culture.js` started Phase A migration on key filter bars, summary metrics, report/list tables, and high-traffic section wrappers.
- Second pass began on `public/js/pages/dashboard.js`, `public/js/pages/kpi.js`, `public/js/pages/patrol.js`, and deeper Accident analytics/dashboard surfaces to replace legacy wrappers with shared sections, filter bars, and tables.
- Deep workflow pass continued on Hiyari submit wizard, KY manage/config/forms, Yokoten admin/employee completion surfaces, 4M dashboard chart/table sections, and Policy metric/current-policy surfaces.
- Latest lower-traffic pass moved Safety Culture PPE history/work-type/violation surfaces, KPI data tables, and Hiyari/KY/Yokoten dashboard card shells onto the shared primitives.
- Follow-up Phase A pass standardized Safety Culture skeleton/principle cards, KPI drilldown tables, and additional Hiyari/KY/Yokoten dashboard/executive-summary shells.
- Final Phase A sweep completed the remaining high-signal legacy card/table shells across Contractor, Policy, Admin Activity Target, Hiyari/KY/Yokoten management surfaces, 4M skeletons, and Safety Culture dashboard/empty/filter states. Remaining custom admin matrix/rotation tables intentionally keep their specialized layout classes.
- `statusBadge()` chooses tone from the canonical `status` argument, not the localized label. Current tone map includes `Reviewed`, `Temporary`, OJT terms `Valid/Due Soon/No Data`, and risk terms `Low/Medium/High/Critical`.
- Existing `.btn`, `.form-input`, `.form-select`, `.status-badge`, and legacy Tailwind-heavy screens remain supported while modules are migrated gradually.

Recommended migration order after Phase A:

1. Start Phase B with visual QA on desktop/tablet/mobile for the highest-use workflows: Safety Patrol, 4M, Hiyari, KY, Yokoten, Safety Culture, Training/OJT, and Person Search.
2. Then polish workflow-specific drawers/modals where screenshots show spacing or overflow issues.

### Enterprise UX Roadmap Status

Current roadmap after Phase A completion:

1. Phase 1: UX Foundation / จุดโฟกัสงานสำคัญ
   - Status: completed for Dashboard, Patrol, 4M, Person Search, shared detail modal, and Audit detail.
   - Follow-up: visual QA only; avoid changing working business logic unless QA finds a real issue.

2. Phase 2: Form UX Standardization / detail modal + summary ก่อนอ่านฟอร์ม
   - Status: completed across the main modules: KY, Hiyari, Yokoten, Accident, OJT, Training, Machine Safety, Contractor, Safety Culture, Committee, and Admin master/reference.
   - Follow-up: check long forms on tablet/mobile and polish spacing/overflow only where screenshots show problems.

3. Phase 3: Enterprise Admin Command Center / Overview + System Health + Audit
   - Status: completed for Admin dashboard action required, Overview controls, System Health readiness, Audit summary, and Audit Log.
   - Follow-up: use real admin data during UAT to confirm stale work, failed API, and audit counts are useful.

4. Phase 4: Permission / Audit / Pre-production Regression
   - Status: completed for Admin Audit Log, permission audit script, API smoke test, and combined `npm test` checks.
   - Follow-up: keep `npm test` as the required pre-commit/pre-deploy gate.

5. Phase 5: Manual UAT / Production Handoff
   - Status: remaining.
   - Required before production deployment: open the browser with real Admin/User accounts, test every module, confirm admin-only buttons are hidden/blocked for User, create/edit/delete small sample records, confirm Audit Log captures the actions, then push/deploy handoff.

### Post-Phase A Enhancements (completed)

- **Phase B — Dashboard KPI drill-down**: Dashboard module cards for Patrol (open issues), Hiyari (pending), and 4M (open notices) write a `pending_filter_<module>` key to `sessionStorage` on click; target module reads and removes the key on load, then pre-selects the matching tab and filter state. No router changes required.
- **Phase D — Audit Log**: Added "Failed Only" quick-filter chip (`#audit-chip-failed`) that appends `failed=1` to API calls (backend: `StatusCode >= 400 OR Action LIKE 'FAILED%'`). Added "Export CSV" button (`_exportAuditCSV`) — downloads all matching records (up to 5000 rows) as UTF-8 BOM CSV.
- **Phase E — native confirm() removal**: Replaced all 3 native `confirm()` in `patrol.js` (`_armDeleteRecord`, `_arsvDeleteRecord`, `deleteSelfCheckin`) with `await showConfirmationModal(title, message)` from `ui.js`.
- **Patrol Admin Record — all employees**: Admin can now search and manage patrol records for any employee (not roster-only) via a search card in the Overview tab. Uses new `GET /patrol/employee-search` endpoint + existing `openAdminRecordModal`.

### Mobile/PWA Foundation (completed)

- **Bottom mobile tab bar**: `#bottom-tab-bar` defaults to `display:none` in `public/style.css` and is enabled only inside `@media (max-width: 767px)`. Desktop/tablet-wide browser layouts should use the sidebar/top shell only.
- **Mobile app shell**: `#app-container` and `#login-overlay` use `100dvh` with `100vh` fallback, `min-width:0` guards, iOS momentum scrolling, and safe-area padding for the bottom tab bar.
- **Login mobile layout**: `index.html` adds `#login-panel`, `#login-topbar`, `#login-form-area`, `#login-footer`, `.login-hero-icon`, and `#login-security-indicators` hooks. On mobile the login form starts at the top instead of vertical-center, preventing Safari address-bar/footer UI from clipping the login icon/header.
- **Short-height phones**: At `max-width:767px` + `max-height:760px`, login security indicators are hidden and spacing is reduced. At `max-height:640px`, login footer is hidden so the form remains usable on very short browser viewports.
- **iPhone input zoom guard**: Mobile `input`, `select`, and `textarea` are forced to `16px` font size to prevent Safari auto-zoom on focus. Login/register employee ID and password fields disable autocapitalize/autocorrect/spellcheck.
- **PWA shell**: `index.html` includes theme-color, Apple mobile web app meta, `public/manifest.webmanifest`, `public/icons/app-icon.svg`, and service worker registration. `vercel.json` must keep both the static build and route for root `/sw.js`.
- **Service worker policy**: `sw.js` is intentionally network-only. It exists for installability/open-as-app behavior and must not cache HTML/API responses because the app uses authenticated, frequently changing safety data.
- **CSS cache busting**: `index.html` links `public/style.css?v=20260503-mobile-login`. Bump this query string after future mobile CSS changes to reduce stale CSS on phones.
- **Completed login visual QA**: Playwright Chromium screenshots passed for the public login page at `320x667`, `375x812`, `390x844`, and `430x932`: no clipped login header/icon and no horizontal overflow. Full post-login module QA still requires an authenticated/API-backed environment.

### Admin Audit Log

Audit logging is centralized in `backend/utils/audit.js`.

- `authenticateToken` attaches `attachAuditLogger(req, res)` so signed-in `POST`, `PUT`, `PATCH`, and `DELETE` API calls are logged automatically after the response finishes.
- Admin Console curated actions still call `auditLog()` in `backend/routes/admin.js`; those rows use clear action names such as `CREATE_EMPLOYEE`, `RESET_PASSWORD`, and set `req.auditLogged = true` to avoid duplicates.
- `Admin_AuditLogs` is auto-created and auto-migrated by `ensureAuditTable()`; no manual SQL is required for normal deployment.
- `GET /api/admin/audit-logs` supports `page`, `limit`, `action`, `module`, `adminId`, `q`, `dateFrom`, `dateTo`, `failed` (`1` = failures only, StatusCode ≥ 400) and returns `facets` for filter dropdowns.
- Audit Log UI has a **"Failed Only"** quick-filter chip and an **"Export CSV"** button (downloads current filter as `audit_log_YYYY-MM-DD.csv` with UTF-8 BOM for Thai text).

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
- `USER_WORKFLOW` — intentionally allowed user actions such as login/register/change password/profile update, policy acknowledgement, CCCF submit, Hiyari Excel/direct signed-PDF submit, KY submit, 4M notice create, Patrol check-in, and Yokoten respond.
- `UNREVIEWED` — must be fixed or explicitly reviewed before release. The script exits non-zero if any appear.

Current verified result after the Hiyari direct signed-PDF workflow: `ADMIN=167`, `INLINE_GUARD=8`, `USER_WORKFLOW=17`, `UNREVIEWED=0`.

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
| `SC_Principles` | 8 campaign/principle cards (7 culture posters + 1 overview card; missing defaults are inserted with `INSERT IGNORE`) — `PrincipleID VARCHAR(36) PK`, `SortOrder`, `Title`, `Description`, `ImageUrl`, `AttachmentUrl`, `AttachmentName`, `IsFeatured TINYINT(1)` |
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
| `PUT /safety-culture/principles/:id` | Admin | แก้ไข principle/campaign card (title, description, imageUrl, attachmentUrl, attachmentName, IsFeatured); when `IsFeatured=1`, existing featured card is cleared automatically |
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

### Permission Boundary
- User can read Safety Culture principles, assessments, PPE items/work types, PPE inspections, and dashboard aggregates.
- Admin-only Safety Culture surfaces: principle/assessment/PPE item/work-type mutations, PPE inspection create/update/delete, and all PPE violation endpoints (`GET/POST/DELETE /safety-culture/ppe-violations*`).
- Frontend must not call `GET /safety-culture/ppe-violations` for non-admin sessions. Non-admin PPE UI should hide/block the violations sub-tab and fall back to the PPE dashboard if an old saved state points at `violations`.
- UAT preflight must keep asserting user-token 403 for Safety Culture PPE violation admin views.

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
| `principles` | สื่อรณรงค์และกิจกรรม | 8 card campaign/poster library (4+4 layout) + Campaign Library header + KPI strip (4 badges) + Recent Activity panel (assessment + PPE rows) |
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
- **แนวทาง**: render HTML fixed A4 ด้วย browser (Kanit font โหลดอยู่แล้วใน index.html) → capture ด้วย `html2canvas` → embed JPEG ใน jsPDF
- **Active path**: `exportPDF()` เป็น Hiyari-style fixed A4 executive pack ที่ paginate ตามข้อมูลจริงของ Safety Culture; `exportPDFLegacy()` คือ builder เดิม 3 หน้า เก็บไว้เทียบ/ fallback เท่านั้น
- **SVG chart helpers** (ไม่ต้องพึ่ง Chart.js instance): `_svgBar(scores, labels, w, h)`, `_svgRadar(scores, labels, size)`, `_svgLine(trend, w, h)`
- **จำนวนหน้าไม่ล็อกตายตัว** (794×1122px ต่อหน้า, auto-scale body) aligned to Hiyari Dashboard PDF rhythm while fitting the module data:
  - หน้า 1: solid green Hiyari-style header + KPI/maturity cards + Topic Score Register + Management Focus + Dashboard Scope
  - หน้า score/trend: Score Visualization + Monthly Trend + Follow-up Notes, added only when score/trend data exists
  - หน้า operational: PPE by Department + PPE by Item + Violation Tracker, added only when PPE/violation data exists
- **Footer**: light official footer, ASCII page label in the header badge (`Page x of y`) and filename/scope note in footer
- **ชื่อไฟล์**: `Safety_Culture_YYYY.pdf` หรือ `Safety_Culture_YYYY_MM.pdf` (ตาม year/month filter)
- ห้ามใช้ `_pdfKpiBoxRow` / `_pdfDeptBars` / `_pdfSectionHeader` ใน dashboard PDF — ฟังก์ชันเหล่านี้ถูกลบแล้ว (ใช้ได้เฉพาะ Assessment PDF หากยังเหลืออยู่)

### Assessment PDF (`window._scExportAssessmentPDF`)
- Current path uses HTML fixed-page capture (`html2canvas` -> JPEG -> jsPDF A4), same Thai-safe approach as Dashboard PDF.
- Yearly export creates a Hiyari-style executive summary page with KPI cards, Topic Performance, Action Focus, Monthly Performance, then always keeps assessment detail/register on separate page(s) so full topic scores remain clear. Monthly export follows the same pattern for the selected month: monthly summary page first, then monthly assessment register page(s) with Review & Follow-up / Approval block on the first register page to avoid sparse output.
- New helper path: `_asmtPage`, `_asmtSummaryCards`, `_asmtTable`, `_asmtMonthlySummaryTable`, `_saveScAssessmentHtmlPdf`, `exportAssessmentYearlyHtmlPDF`, `exportAssessmentMonthlyHtmlPDF`.
- Legacy text-based helpers (`_asmtPdfHeader`, `_asmtPdfScoreTable`, `_asmtPdfMonthRow`) may still exist but are no longer wired to `window._scExportAssessmentPDF`.
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
| `Contractor_Documents` | Contractor/Supplier document repository — `PartyType`, `Title`, `Category`, `Description`, file metadata, soft-delete columns |
| `Contractor_Companies` | Small company master for Contractor/Supplier names — `CompanyName`, `PartyType`, `Status`, audit columns |
| `Contractor_AccidentRecords` | Simple external incident statistics — `IncidentDate`, `IncidentType`, `PartyType`, `CompanyName`, `InvolvedPerson`, `Area`, `Description`, soft-delete columns |
| `Contractor_AccidentFiles` | Multi-file evidence rows for Accident Records |
| `Contractor_Activity_Log` | Activity/audit trail for document and accident actions — `ActionType`, `DocID`, `DocTitle`, `Category`, `ActorName`, `CreatedAt` |

ทั้งสองตารางสร้างด้วย `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN` (try/catch) ใน `ensureTables()` ของ `backend/routes/contractor.js`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /contractor/documents` | User | รายการเอกสารทั้งหมด — supports Contractor/Supplier `PartyType` data |
| `GET /contractor/documents/stats` | User | สรุป: `{ total, byCategory: [{Category, cnt}], recentCount }` (30 วันล่าสุด) |
| `GET /contractor/activity?limit=` | User | ประวัติกิจกรรมล่าสุด (สูงสุด 50 รายการ) |
| `GET /contractor/companies` | User | Company master list for Contractor/Supplier datalist |
| `POST /contractor/companies` | Admin | Add company master row; accident save also auto-creates missing names |
| `POST /contractor/documents` | Admin | อัปโหลดเอกสาร (field: `file`, includes `PartyType`, สูงสุด 20 MB) |
| `PUT /contractor/documents/:id` | Admin | แก้ไข metadata (`Title`, `PartyType`, `Category`, `Description`) |
| `DELETE /contractor/documents/:id` | Admin | ลบเอกสารแบบ soft delete (`DeletedAt`, `DeletedBy`) + activity log; physical uploaded file is kept for audit trail |
| `GET /contractor/accidents?year=` | User | Accident/Near Miss/First Aid/Property Damage records for selected year |
| `GET /contractor/accidents/stats?year=` | User | Zero External Accident summary for dashboard |
| `POST /contractor/accidents` | Admin | Create accident statistic record with multiple evidence files |
| `PUT /contractor/accidents/:id` | Admin | Edit accident record metadata |
| `DELETE /contractor/accidents/:id` | Admin | Soft-delete accident record and write audit trail |
| `POST /contractor/accidents/:id/files` | Admin | Add more evidence files |
| `DELETE /contractor/accident-files/:fileId` | Admin | Delete one evidence file and write audit trail |

### Frontend Architecture (`public/js/pages/contractor.js`)

#### Service Layer
```js
const ContractorService = {
    getDocs()           // GET /contractor/documents — all docs, no filter params
    getStats()          // GET /contractor/documents/stats
    getActivity(limit)  // GET /contractor/activity?limit=
    getCompanies()      // GET /contractor/companies
    upload(formData)    // POST /contractor/documents
    update(id, data)    // PUT /contractor/documents/:id
    remove(id)          // DELETE /contractor/documents/:id
    getAccidents(year)  // GET /contractor/accidents?year=
    getAccidentStats(year)
    createAccident(formData)
    updateAccident(id, data)
    removeAccident(id)
    addAccidentFiles(id, formData)
    deleteAccidentFile(fileId)
}
```
API calls อยู่ใน `ContractorService` เท่านั้น — ห้าม call `API.*` จาก UI functions โดยตรง

#### Cache (TTL 5 นาที)
```js
const _cache = { get(key), set(key, val), del(...keys) }
// CACHE_TTL = 5 * 60 * 1000
// Keys include: docs, stats, activity, companies, accidents:{year}, accidentStats:{year}
// Invalidate relevant keys after upload/edit/delete and accident file changes.
```

#### Centralized State
```js
const _state = {
    docs: [],          // full list from API (client-side filter/sort/paginate)
    stats: null,       // { total, byCategory, recentCount }
    activity: [],      // Contractor_Activity_Log rows
    companies: [],     // Contractor_Companies rows
    accidents: [],     // selected-year Accident Records
    accidentStats: null,
    accidentYear: new Date().getFullYear(),
    isAdmin: false,    // from TSHSession.getUser().role === 'Admin'
    activeTab: 'dashboard' | 'documents' | 'accidents',
    page: 1,
    docView: 'grid' | 'list',
    filter: { category, partyType, query, dateFrom, dateTo, sortBy },
    accidentFilter: { type, partyType, query }
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
| `HiyariReports` | รายงาน near-miss หลัก — `RiskRank VARCHAR(1)` (API aliases as `Rank`), `StopType INT`, `RiskLevel` (derived from Rank via `RANK_TO_RISK` for backward-compat), `AttachmentUrl`, `AdditionalFileUrl`, `CorrectiveAction`, `AdminComment`, `ClosedAt`, `ClosedBy`, `DeletedAt`, `DeletedBy` (soft delete) |
| `Hiyari_Dashboard_Config` | Key/value config — `pinnedDepts` (JSON array) บันทึกโดย admin เพื่อกำหนดแผนกที่แสดงใน dashboard |
| `Hiyari_Assignments` | รายการมอบหมาย — `EmployeeID`, `AssigneeName`, `Department`, `DueDate`, `Note`, `AllowDirectSignedPdf`; UNIQUE KEY `uq_emp (EmployeeID)` |

Phase 3 report-flow notes:
- Submit form uses local date (`_todayDateOnly`) to avoid timezone day drift.
- Area/Location is a searchable datalist sourced from `Master_Areas` via `/api/master/areas`, while still allowing manual "Other" input.
- Reporter card shows logged-in employee ID, department, and position from session.
- Frontend validates attachment type/size before preview and before submit (`PDF/JPG/PNG/WEBP`, max 20 MB).
- Submit has an in-flight guard to prevent duplicate POSTs and refreshes hero stats/history/assignment progress after save.

Phase 4 admin-review notes:
- Closing a Hiyari report now requires a non-empty `CorrectiveAction` on both frontend and backend.
- Reopen/update/close/add-attachment/delete actions write `Admin_AuditLogs` with `Module='hiyari'`, `TargetType='HiyariReports'`, and the report id as `TargetID`.
- Detail modal loads `/api/hiyari/:id/timeline` and shows recent review timeline entries from `Admin_AuditLogs`.
- Admin additional attachment uses the same frontend validation as reporter attachments (`PDF/JPG/PNG/WEBP`, max 20 MB).

Phase 5 dashboard/analytics notes:
- `/api/hiyari/stats` now returns `areaRank`, `monthlyRank`, and `monthlyStatus` in addition to the existing KPI/chart data.
- History list supports drill-down query filters for `stopType`, `rank`, `month`, and `area` while preserving existing `status`, `risk`, `dept`, `year`, and search filters.
- Dashboard adds Top Area Focus and Monthly Rank Focus panels. Heatmap, KPI, SLA, area, rank-month, and department widgets can drill into the History tab with the matching filters.
- Dashboard has an Export Year action that exports all reports for the selected dashboard year; History export still uses the currently filtered record set.

Direct signed-PDF assignment notes:
- `AllowDirectSignedPdf` is a per-assignee permission maintained by Admin in the Hiyari Manage Assignment subtab, not a profile/global role flag.
- The New Report tab separates document modes by the signed-in account: Admin sees all modes, normal users see Excel review + PDF after approval, and an assignee whose own assignment has `AllowDirectSignedPdf=1` sees only the direct signed-PDF mode to avoid document-flow confusion.
- `POST /api/hiyari/direct-signed` accepts the normal report wizard fields plus a signed PDF attachment, verifies the selected reporter assignment permission for non-admin users, creates a `ReviewStatus='Completed'` report with `SignedFileUrl`, writes `HIYARI_DIRECT_SIGNED_SUBMIT`, and queues the admin signed-file email.
- History and Admin Review show explicit document-flow labels for `รอตรวจ Excel`, `ผ่านแล้ว รอ PDF`, `ไม่ผ่าน ต้องแก้ไข`, `PDF ส่งแล้ว`, and `PDF ส่งโดยตรง`. Admin Review includes a `PDF ส่งโดยตรง` filter so direct submissions can be reviewed separately from normal completed reports.

### Hiyari UAT Checklist
- User normal flow: submit Excel from New Report and confirm CompanyEmail auto-fills from Employee Master; if the reporter has no Employee Master email, enter a valid `@thaisummit-harness.co.th` fallback. Confirm History shows `รอตรวจ Excel` and Admin Review receives the row.
- Admin review flow: approve one Excel report, reject one Excel report with a comment, and confirm user-side document status/email queue changes match the decision.
- Signed PDF close flow: user selects an approved report, uploads signed PDF, and confirm History/Admin Review show `PDF ส่งแล้ว`.
- Direct PDF flow: Admin opens direct-PDF permission on one Hiyari Assignment, confirm that assignee sees only direct signed-PDF submit mode, then submit one signed PDF and confirm status shows `PDF ส่งโดยตรง`.
- Submit-on-behalf flow: submit once for an assigned employee and verify reporter/submitted-by fields remain traceable in detail and audit history.
- Admin exception flow: use Admin Override only for a normal Excel report that needs to skip the usual approval step, require a reason, then verify audit/email behavior.
- Email operations: verify SMTP delivery on the company server and retry queued/failed Hiyari emails from Manage when needed.

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
4. `POST /direct-signed` — before `/:id` signed-file/report routes
5. `PUT /assignments/:id` (isAdmin) — ก่อน `PUT /:id`
6. `DELETE /assignments/:id` (isAdmin) — ก่อน `DELETE /:id`
7. `GET /:id`, `PUT /:id`, `DELETE /:id`

### Key API Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /hiyari/stats?year=` | User | KPI + monthly + stopDist + rankDist + deptRank (top 20) + consequence |
| `GET /hiyari` | User | รายการรายงาน — filter params: `status`, `risk`, `dept`, `year`, `q` |
| `GET /hiyari/:id` | User | รายงานเดี่ยว |
| `POST /hiyari` | User | ส่งรายงาน (multipart: `attachment`) — backend validates `StopType` (1–6), `Rank` (A/B/C), derives `RiskLevel` |
| `POST /hiyari/direct-signed` | User | ส่ง signed PDF โดยตรงสำหรับ assignee ที่ Admin เปิด `AllowDirectSignedPdf` หรือ Admin; creates completed document-flow report and queues admin email |
| `PUT /hiyari/:id` | Admin | อัปเดต `Status`, `CorrectiveAction`, `AdminComment` |
| `POST /hiyari/:id/attachment` | Admin | อัปโหลดไฟล์เพิ่มเติม (admin file — `AdditionalFileUrl`) |
| `DELETE /hiyari/:id` | Admin | ลบรายงาน |
| `GET /hiyari/dashboard-config` | User | `{ pinnedDepts: [] }` |
| `PUT /hiyari/dashboard-config` | Admin | บันทึก `{ pinnedDepts: [...] }` |
| `GET /hiyari/assignments` | User | รายการมอบหมายทั้งหมด |
| `POST /hiyari/assignments` | Admin | เพิ่ม assignment (duplicate guard via UNIQUE KEY); accepts `AllowDirectSignedPdf` |
| `PUT /hiyari/assignments/:id` | Admin | แก้ไข assignment including `AllowDirectSignedPdf` |
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

- **Dashboard**: executive alert strip, clickable KPI cards → filtered History, executive summary cards, Department Coverage progress (from `KY_Program_Config`), Recurring Hazard Pattern chart (top KYT Keywords), Dept×Month heatmap, and KYT Video Showcase with user reactions
- **Submit**: full-width form (wider enterprise grid), hazard/countermeasure side-by-side, attachment+video preview+clear, employee typeahead search for participants, yearly target progress strip, Admin submit-on-behalf from Employee Master, **แบบฟอร์มที่ต้องกรอก** card above attachment area
- **History**: main admin surface — year/dept/status/risk/date-range filters, KPI card clicks auto-filter; when `_filterHistDept='all'` and config exists, passes `depts=configDepts.join(',')` to backend; date range overrides year/month param
- **Manage**: 3 sub-tabs: `coverage` (department coverage + follow-up queue), `config` (KY_Program_Config CRUD), and `forms` (**แบบฟอร์มที่เกี่ยวข้อง** section)
- **Dashboard Video**: KYT Video Showcase reads existing `VideoUrl`, lets users react once per video (`useful`, `practice`, `awareness`, `attention`), and lets Admin pin/hide dashboard videos.
- **PDF**: 2-page executive pack (Executive Summary + Trend/Risk/Keywords / Coverage + Follow-up + Video Learning)
- **Backend**: `KY_Program_Config` table (per-dept yearly target + deadline + safety units + IsActive), `KY_Video_Reactions`, video dashboard flags on `KY_Activities`, `topKeywords` in `/stats`, `dateFrom`/`dateTo` params on `GET /ky`

### KY Hardening Notes (2026-05-21)
- `KY_Program_Config` is now enforced as one row per `Year + Department`; startup keeps the newest legacy duplicate row before adding the unique key, and batch config writes use DB upsert semantics.
- KY admin update validates `ActivityDate` against the same yearly target and one-record-per-department-per-month rules used by new submissions.
- KY audit logs now record activity create/update/delete and Program Config upsert/update/delete with KY-specific action names in `Admin_AuditLogs`.
- History search covers reporter, department, team, KYT keyword, hazard description, and countermeasure.
- KY upload handling returns JSON upload errors, clears rejected freshly uploaded files, limits evidence documents to 20 MB, and keeps video evidence at 200 MB. The submit and manage UI warn before sending oversized files.
- KY Dashboard now starts with a formal title/action header, alert strip, status KPI row, annual overview, and department tracker before charts. Current-year tracker numbers use current-month pending departments; past-year tracker shows yearly coverage instead of pretending it is the current month.
- KY Submit keeps normal users on their own login identity/department. Admin can search Employee Master in the submit form and send on behalf of one employee; backend accepts `ReporterEmployeeID` only for Admin, keeps that employee as `ReporterID/ReporterName/Department`, stores the actual operator in `SubmittedByID/SubmittedByName`, and writes the on-behalf context to the KY audit log.
- KY History separates submission source without creating a second record flow: table rows badge normal submissions vs `Admin ส่งแทน`, search includes `SubmittedByName`, source filter supports all/self/admin, detail shows `ผู้บันทึกแทน`, and Excel export includes submission source plus actual operator.
- KY Manage now opens with an Admin workspace header and 3 secondary tabs: Coverage & Follow-up, Program Config, and Forms. Coverage & Follow-up combines department coverage, pending departments, and the admin action queue in one formal workspace; Program Config shows yearly target/Safety Unit metrics; Forms manages related KY documents without being appended under Program Config.
- KY Dashboard now includes `KYT Video Showcase` for submitted videos. Backend creates `KY_Video_Reactions`, adds `ShowVideoOnDashboard` and `IsVideoPinned` to `KY_Activities`, and exposes `/api/ky/video-showcase`, `/api/ky/:id/reaction`, and `/api/ky/:id/video-dashboard`.
- KY Video Showcase reaction UI uses emoji + label while keeping the stored reaction keys unchanged: `👍 Useful`, `✅ Good Practice`, `💡 Awareness`, `⚠️ Attention`.
- KY PDF export is now a formal 2-page executive pack instead of 4 pages: page 1 focuses on KPI/trend/risk/themes, page 2 focuses on department coverage, follow-up queue, and video learning highlights.
- KY video reactions are intentionally listed in the permission audit user workflow allowlist because authenticated users are allowed to add/remove one reaction per KY video.
- KY Safety Unit coverage is now first-class: startup adds `KY_Activities.SafetyUnit`, submit requires a configured Safety Unit when the selected department has units, yearly/monthly duplicate checks are scoped per Safety Unit, and Dashboard/Manage progress uses `SafetyUnits.length × YearlyTarget` rather than one target per department.
- KY History/detail/Excel export now surfaces Safety Unit so Admin can trace which configured unit submitted each KY record.
- KY Submit now exposes **Main Department + Safety Unit** in the form. Department options come from active `KY_Program_Config` for the selected year, falling back to Master Departments; changing the department/date refreshes the Safety Unit list and target progress before submit.
- KY Admin edit now supports full submitted-detail correction: Activity Date, Main Department, Safety Unit, participants, status, KYT keyword, risk category, team name, hazard detail, countermeasure, admin comment, attachment, and video. Backend admin update revalidates yearly/monthly target rules against the edited Department + Safety Unit scope before saving.

### KY Specific Patterns
- `_kyProgConfig` — cached per year; cleared and re-fetched when year filter changes
- `_filterHistYear` change handler calls full `renderHistory(container)` (not just `fetchAndRenderHistory`) to refresh banner + dept dropdown
- `_manageSub` state: `'coverage'` | `'config'` | `'forms'`
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
    UNIQUE KEY uq_ky_program_year_dept (Year, Department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### KY_Video_Reactions Table
```sql
CREATE TABLE IF NOT EXISTS KY_Video_Reactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    ActivityID  VARCHAR(36) NOT NULL,
    EmployeeID  VARCHAR(50) NOT NULL,
    Reaction    VARCHAR(30) NOT NULL,
    CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ky_video_reaction_user (ActivityID, EmployeeID),
    KEY idx_activity (ActivityID),
    KEY idx_reaction (Reaction)
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
- Phase 3 adds `mine=1` to `GET /fourm/notices` for the `รายการของฉัน / My Notices` view; backend scopes it to `CreatedByID = req.user.id`.

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
- Closing a notice must go through `POST /fourm/notices/:id/close`; the generic admin update route rejects `Status=Closed` so `ClosingComment`, `ClosedDate`, and `ClosedBy` are not skipped.
- A closed notice cannot be switched back to Open/Pending through the generic admin update route; status reopening is intentionally not part of the current 4M lifecycle.
- The close route now requires a non-empty `ClosingComment` on the backend even though the frontend form already marks the summary field as required.
- Admins can edit, delete, and set `Pending` for all Change Notices from the Change Notice tab.
- Existing `PUT /fourm/notices/:id` remains admin-only and can update `ResponsiblePerson` for data correction/admin maintenance.

### Man Record Integrity
- `FourM_ManRecords` currently stores department-level totals: `TotalAttendance`, `Pass`, and `Fail`.
- The backend requires all counts to be non-negative integers and enforces `Pass + Fail = TotalAttendance`; `Pass` or `Fail` cannot exceed total attendance.
- The frontend keeps `Fail` as the computed remainder from total attendance minus pass to reduce inconsistent data entry before API validation.

### Impact Assessment
- Change Notice now captures lightweight impact assessment fields without changing the existing Open / Pending / Closed lifecycle:
  - `SafetyImpact`
  - `QualityImpact`
  - `ProductionImpact`
  - `EnvironmentImpact`
  - `TrainingRequired`
  - `ImpactNote`
- Valid impact levels are `N/A`, `Low`, `Medium`, and `High`; blank values default to `N/A`.
- `TrainingRequired` is a boolean flag used to mark changes that need extra communication or training follow-up.
- Backend auto-migration adds the new columns to `FourM_ChangeNotices` through `ensureTables()` in `backend/routes/fourm.js`.
- Frontend Change Notice create/edit form shows the Impact Assessment panel, detail modal displays impact badges, Notice Excel export includes the impact fields, and single Notice PDF includes the impact block.
- Audit metadata for Change Notice create/update includes the impact snapshot for traceability.

### Action Plan / Follow-up Task
- Added `FourM_ActionTasks` as a separate child table for Change Notice follow-up items. A Notice can have multiple tasks.
- Task fields: `TaskTitle`, `OwnerName`, `DueDate`, `Status` (`Pending`, `In Progress`, `Done`), `Notes`, `CompletedAt`, `CompletedBy`, creator metadata, and timestamps.
- API routes:
  - `GET /fourm/notices/:id/tasks`
  - `POST /fourm/notices/:id/tasks`
  - `PUT /fourm/notice-tasks/:taskId`
  - `DELETE /fourm/notice-tasks/:taskId`
- Permission rule: only the Notice creator or Admin can create/update/delete tasks; all authenticated users who can open the Notice can view the task list.
- Frontend Change Notice detail modal now shows Action Plan tasks with status badge, due date, overdue marker, and manage buttons for permitted users.
- Single Notice PDF includes the Action Plan table so follow-up tasks appear in formal exports.
- Audit actions added for task lifecycle: `FOURM_ACTION_TASK_CREATE`, `FOURM_ACTION_TASK_UPDATE`, `FOURM_ACTION_TASK_DONE`, and `FOURM_ACTION_TASK_DELETE`.

### Notification / Email Outbox
- Added `FourM_EmailOutbox` for 4M notification queue and status tracking. SMTP is optional; when `SMTP_HOST` is not configured, notifications remain queued instead of blocking the workflow.
- When SMTP is configured, 4M queues the email first and sends in the background so Change Notice/Action Plan save actions do not wait on SMTP. Set `FOURM_EMAIL_BACKGROUND=false` for smoke tests or maintenance runs that should only queue.
- Events currently queued:
  - `NoticeCreated` to the 4M admin email (`FOURM_ADMIN_EMAIL`, fallback `ADMIN_EMAIL`, fallback `sattaya_w@thaisummit-harness.co.th`)
  - `NoticePending` to the Notice creator when `Employees.CompanyEmail` exists
  - `NoticeClosed` to the Notice creator and admin
  - `ActionTaskCreated` and `ActionTaskDone` to admin plus Notice creator when available
- Admin routes:
  - `GET /fourm/email-outbox?status=&limit=`
  - `POST /fourm/email-outbox/:id/retry`
- Frontend 4M Dashboard shows an admin-only Email Outbox panel with latest queue items and Retry action for queued/failed emails.
- Smoke coverage checks required 4M outbox events in `backend/scripts/fourm-phase5-smoke.js`.

### Phase 4 Audit / Lifecycle
- 4M writes semantic `Admin_AuditLogs` entries for Change Notice create/update/set-pending/close/delete and Man Record create/update/delete.
- Audit actions use `FOURM_NOTICE_*` and `FOURM_MAN_RECORD_*` names with record ID plus compact metadata for Notice No, department, status, Change Type, counts, and attachment/closing-document presence.
- Close-route early rejects now clean up a newly uploaded closing document on not-found, permission denied, already-closed, or missing closing summary responses.

### Phase 5 Verification / Handoff
- Added focused workflow smoke coverage in `backend/scripts/fourm-phase5-smoke.js` for Change Notice create, My Notices scope, user/admin permission split, pending transition, close flow, closed-record reopen guard, Man Record CRUD/filter, and semantic 4M audit actions.
- Final verification on 2026-05-22:
  - `node --check backend/scripts/fourm-phase5-smoke.js`
  - `node backend/scripts/fourm-phase5-smoke.js`
  - `node --check backend/routes/fourm.js`
  - `node --check public/js/pages/fourm.js`
  - `git diff --check -- backend/scripts/fourm-phase5-smoke.js backend/routes/fourm.js public/js/pages/fourm.js CLAUDE.md`
  - `npm --prefix backend test`
- Focused smoke passed for the temporary 4M records it creates and cleans up; backend regression test also passed with Phase 5 UAT preflight `90/90`.

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
let _noticeFilter = { status:'all', type:'all', dept:'all', year: new Date().getFullYear(), q:'', overdue:false, mine:false };
let _manFilter    = { q:'', status:'all', year: new Date().getFullYear() };
let _departments  = [];    // lazy-loaded from /master/departments
let _statsData    = null;  // last /fourm/stats response
let _lastNotices  = [];    // last rendered notices list (used for Excel export)
let _fourmForms   = [];    // Module_Forms for 'fourm' module
let _chartManDonut = null; // Man Record pass/fail donut chart
```

### Excel Export (`_exportNoticesToExcel`)
- Uses global `XLSX` (SheetJS CDN in index.html)
- Exports `_lastNotices` (currently filtered list)
- Export now includes notice age, overdue flag, Notice attachment flag, and closing-document flag for follow-up review.
- Filename: `4M_Change_Notices_YYYY.xlsx`
- Guard: `if (typeof XLSX === 'undefined')` → toast error

### Man Record Filter / Export
- `GET /fourm/man-records` accepts `status=Pass|Fail|Pending` in addition to year/search so the department summary can be reviewed by result state.
- Man Record tab exports the currently filtered `_lastManRows` to Excel with department, exam date, counts, pass rate, status, notes, and recorder.
- Filename: `4M_Man_Record_YYYY.xlsx`

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
- Phase 2 adds a formal dashboard header with year/PDF controls and keeps Quick Access after the operational KPI/SLA/chart review path.
- Change Notice list uses a section intro and bilingual focus shortcuts; the create form shows concise guidance for auto Notice No, record ownership, and supporting attachments.
- Man Record UI must describe department-level exam summary counts, not individual employee qualification records.
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
| `FileUrl` | TEXT NOT NULL | local server file URL from `/uploads` |
| `PublicID` | VARCHAR(255) | local stored filename (legacy column name) |
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
| `DELETE /module-forms/:id` | Admin | ลบ + server file storage fire-and-forget delete |

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
