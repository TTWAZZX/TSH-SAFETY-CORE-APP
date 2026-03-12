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
│       ├── ui.js               # Shared UI utilities
│       ├── fullcalendar.js
│       ├── utils/
│       │   └── normalize.js
│       └── pages/
│           ├── admin.js
│           ├── cccf.js
│           ├── committee.js
│           ├── employee.js
│           ├── kpi.js
│           ├── machine-safety.js
│           ├── ojt.js
│           ├── patrol.js
│           ├── policy.js
│           └── yokoten.js
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
        └── ojt.js
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

### API Routes
| Prefix | Auth | Module |
|--------|------|--------|
| `/api/login` | none | Login |
| `/api/login` | none | Login |
| `/api/change-password` | User | เปลี่ยนรหัสผ่าน |
| `/api/session/verify` | User | Refresh JWT |
| `/api/patrol/*` | User | Patrol routes |
| `/api/admin/*` | Admin | Admin routes |
| `/api/cccf/*` | User | CCCF routes |
| `/api/master/*` | User | Master data |
| `/api/machine-safety/*` | User | Machine & Device Safety |
| `/api/ojt/*` | User | Stop-Call-Wait (OJT/SCW) |
| `/api/employees` | User/Admin | Employee CRUD |
| `/api/policies` | User/Admin | Policy CRUD |
| `/api/committees` | User/Admin | Committee CRUD |
| `/api/kpidata/*` | User/Admin | KPI data CRUD |
| `/api/yokoten/*` | User | Yokoten CRUD |
| `/api/upload/document` | Admin | Cloudinary file upload |

### Generic CRUD Tables
ตารางเหล่านี้มี auto-generated CRUD endpoints (GET/POST/PUT/DELETE):
`Patrol_Sessions`, `Patrol_Attendance`, `Patrol_Issues`, `CCCF_Activity`, `CCCF_Targets`,
`ManHours`, `AccidentReports`, `TrainingStatus`, `SCW_Documents`, `OJT_Department_Status`,
`Machines`, `Documents`, `Document_Machine_Links`, `YokotenTopics`, `YokotenResponses`

Primary key ของ generic CRUD คือ `id` — ยกเว้น `Employees` ที่ใช้ `EmployeeID`

### File Upload
- **ห้ามเขียนไฟล์ไปยัง local filesystem** — Vercel มี read-only filesystem
- ไฟล์ทุกอย่างต้องอัปโหลดผ่าน Cloudinary เท่านั้น (`cloudinary.js`)
- ประเภทไฟล์ที่รองรับ: JPEG, PNG, GIF, WEBP, PDF, Word, Excel, PowerPoint
- ขนาดสูงสุด: 10 MB (patrol), 20 MB (documents)
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
| **Committee** | คณะกรรมการความปลอดภัย, SubCommittee (JSON array) |
| **Employee** | จัดการพนักงาน, bulk import via Excel |
| **Machine Safety** | ข้อมูลเครื่องจักร/อุปกรณ์ความปลอดภัย, เอกสารเชื่อมโยงกับเครื่องจักร |
| **OJT / SCW** | Stop-Call-Wait, OJT Department Status, เอกสาร SCW |
| **Admin** | สรุปข้อมูล, จัดการระบบ |
| **Master** | ข้อมูล master ต่างๆ |

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
const UserID   = req.user.id;
const UserName = req.user.name;
const Department = req.user.department;

// WRONG (รับจาก client — ปลอมแปลงได้):
const { UserID, UserName } = req.body;
```

`req.user` มี fields: `{ id, name, department, role, team }`

## Admin Hub — 3 Tabs

`public/js/pages/admin.js` มี 3 tabs:

| Tab | Key | Description |
|-----|-----|-------------|
| กำหนดการตรวจ | `scheduler` | Patrol session scheduling |
| ข้อมูลพนักงาน | `employees` | Employee CRUD + bulk Excel import |
| Master Data | `master` | Departments, teams, roles master lists |

State variables ใน admin.js: `_empCache`, `_deptCache`, `_teamCache`, `_roleCache`, `_empSearch`

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
