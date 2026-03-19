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
│           ├── admin.js        # System Console (6 tabs — see below)
│           ├── cccf.js
│           ├── committee.js
│           ├── employee.js     # legacy — router redirects #employee → #admin/employees tab
│           ├── kpi.js
│           ├── machine-safety.js
│           ├── ojt.js
│           ├── patrol.js
│           ├── policy.js
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
        └── fourm.js            # 4M Change routes
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
| `/api/change-password` | User | เปลี่ยนรหัสผ่าน |
| `/api/session/verify` | User | Refresh JWT |
| `/api/patrol/*` | User | Patrol routes |
| `/api/admin/*` | Admin | Admin routes (employees, schedules, audit, dashboard, health) |
| `/api/cccf/*` | User | CCCF routes |
| `/api/master/*` | User (write=Admin) | Master data (departments/teams/roles/positions) |
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

### Generic CRUD Tables
ตารางเหล่านี้มี auto-generated CRUD endpoints (GET/POST/PUT/DELETE):
`Patrol_Sessions`, `Patrol_Attendance`, `Patrol_Issues`, `CCCF_Activity`, `CCCF_Targets`,
`ManHours`, `AccidentReports`, `TrainingStatus`, `SCW_Documents`, `OJT_Department_Status`,
`Machines`, `Documents`, `Document_Machine_Links`, `YokotenTopics`, `YokotenResponses`

Primary key ของ generic CRUD คือ `id` — ยกเว้น `Employees` ที่ใช้ `EmployeeID`

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
| **Patrol** | กำหนดการตรวจ, บันทึกการเข้าร่วม, รายงานปัญหา (รูปภาพ) |
| **CCCF** | กิจกรรมและเป้าหมาย CCCF |
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
| **Admin (System Console)** | Dashboard, Scheduler, Employee CRUD, Master Data, System Health, Audit Log |
| **Master** | Departments, Teams, Roles, Positions — admin-managed reference data |

## Vercel Deployment

`vercel.json` กำหนด:
- `backend/server.js` → serverless function (Node.js)
- `public/**` → static files
- `*.html` → static files
- Route: `/api/*` → `backend/server.js`, อื่นๆ → `index.html`

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

## Admin Hub (System Console) — 6 Tabs

`public/js/pages/admin.js` มี 6 tabs:

| Tab | Key | Description |
|-----|-----|-------------|
| Dashboard | `dashboard` | KPI stat cards, dept chart, recent audit feed |
| กำหนดการตรวจ | `scheduler` | Patrol session scheduling (single + bulk by date range/weekday) |
| ข้อมูลพนักงาน | `employees` | Employee CRUD + bulk Excel import + pagination 25/page |
| Master Data | `master` | Departments, Teams, Positions, Roles — add/edit/delete |
| System Health | `health` | Module record counts, stale alert tables |
| Audit Log | `audit` | Admin action log, filterable by action type |

State: `_currentTab`, `_calInst`, `_empCache`, `_deptCache`, `_teamCache`, `_empSearch`, `_empPage`, `_auditPage`

Navigation: `#employee` hash redirects → `#admin` + auto-switches to employees tab via `window._adminTab?.('employees')`

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

ไฟล์อ้างอิง (ห้ามแก้ไข): `committee.js`, `policy.js`, `patrol.js`, `kpi.js`, `cccf.js`

### Restyle Status
| File | Status |
|------|--------|
| `kpi.js` | done (enterprise) |
| `machine-safety.js` | done (enterprise) |
| `ojt.js` | done |
| `safety-culture.js` | done |
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
