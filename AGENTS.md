# TSH Safety Core Activity - AGENTS.md

## How Codex Should Work In This Repo

- Read `CLAUDE.md` first, then this file, then the architecture/deployment/history document relevant to the task.
- Keep changes scoped to the user's request and the current module boundary.
- Prefer existing repo patterns over new abstractions.
- Treat Thai UI/API strings as production data; preserve UTF-8 exactly.
- Leave unrelated dirty worktree changes alone.
- Do not push to GitHub unless explicitly asked in the current task.

## Session Startup

For every new task:

Always read:

1. `AGENTS.md`
2. `CLAUDE.md`

Read additional documents only when relevant:

### Architecture / System Design

If the task affects:

- APIs
- Database
- Backend
- Frontend structure
- Authentication
- Uploads

Read:

- `ARCHITECTURE.md`

### Deployment / Production

If the task affects:

- Production deployment
- FTP upload
- Shared hosting
- Backups
- Smoke tests
- Rollback procedures

Read:

- `DEPLOYMENT.md`

### Historical Behavior

If the task may affect:

- Existing behavior
- Compatibility
- Previous deployments
- Completed phases

Read:

- `CHANGELOG.md`

### Planning / Future Work

If the task involves:

- New features
- Technical debt
- Refactoring
- Project planning

Read:

- `ROADMAP.md`

Do not assume project behavior without reading the relevant documentation first.

## Before Coding Checklist

- Confirm whether the task is documentation-only or application behavior work.
- Check `git status --short` and avoid touching unrelated files.
- Read the relevant module file(s), handler(s), and route(s) before editing.
- Check whether production uses PHP compatibility routes, Node dev routes, or both.
- Identify whether a schema/data change, upload/storage change, cache bust, or smoke test is required.

## Safety Rules

## Collaboration Guardrails

- Do not push to GitHub unless the user explicitly asks for it in the current task.
- Local testing is expected before handoff: run `npm --prefix backend test` after backend/API changes.
- When changing upload or DB behavior, update this file and mention whether `backend/uploads/` or MySQL schema changed.
- Encoding/mojibake is the #1 safety check for every change. Before and after edits, scan changed UI/API/docs strings for replacement characters and common UTF-8/Latin-1 decode artifacts. Prefer ASCII-safe HTML entities such as `&mdash;` for fallback symbols when editing files that already have mixed encoding history. Do not bulk-replace production data; isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or actual DB content first.
- If any task requires a MySQL schema/data change, include the SQL/migration in the local handoff, apply the matching production DB update during deploy, and smoke the updated data path. If production DB changes are needed, take a fresh production backup first and document the backup ID plus verification result here.

## Production Rules

- Production target is company shared hosting/PHP plus Company MySQL/MariaDB unless the user says otherwise.
- For production-impacting changes, take a fresh production backup first and document the backup ID/path.
- Upload only the files required for the phase.
- Verify uploads with SHA-256 downloads before smoke testing.
- Remove temporary smoke helpers and verify they are gone by HTTP/FTP checks.
- Clean up every temporary test row created during smoke tests and record remaining count `0`.

## Testing Rules

- For backend/API changes, run the relevant PHP lint and Node syntax checks.
- Run `git diff --check` on changed files before handoff.
- Run the relevant authenticated smoke test for any API behavior change.
- Run `npm --prefix backend test` when backend/API permission behavior changes or when the change touches shared routes. If it fails due to known permission-audit debt, report that explicitly.
- Documentation-only changes require `git diff --check` and a mojibake scan of changed Markdown files.

## Documentation Maintenance

- After completing any task, determine whether documentation is affected.
- If architecture changed, update `ARCHITECTURE.md`.
- If deployment procedure changed, update `DEPLOYMENT.md`.
- If project history changed, update `CHANGELOG.md`.
- If roadmap changed, update `ROADMAP.md`.
- If current handoff information changed, update `CLAUDE.md`.
- Report all documentation updates in the final summary.
- Documentation must stay synchronized with code changes.

## Thai Encoding / Mojibake Rules

- Keep files as UTF-8.
- Check changed files for replacement characters and common UTF-8/Latin-1 decode artifacts.
- Do not bulk-replace Thai production text or DB content.
- If mojibake appears, isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or DB content.
- Prefer ASCII-safe HTML entities such as `&mdash;` when editing files that already have mixed encoding history.

## Database Migration Rules

- Never make hidden schema/data changes.
- Include SQL/migration details in handoff notes when a DB change is required.
- Apply matching production DB updates during deploy only after backup.
- Smoke the updated data path after migration.
- Preserve PHP production and Node dev parity when both stacks expose the same route.

## Upload / Storage Rules

- Uploaded files live in local server storage and must be backed up with MySQL.
- Do not delete stored attachments during soft deletes unless the module has an explicit attachment delete endpoint.
- Validate file type/size through the established upload middleware/handler patterns.
- When changing upload URLs or storage paths, update deployment notes and smoke both upload and retrieval.

## Forbidden Actions

- Do not modify application code for documentation-only tasks.
- Do not push to GitHub unless explicitly requested in the current chat.
- Do not run destructive Git commands such as reset/checkout against user changes.
- Do not delete historical handoff, deployment, smoke, backup, or phase notes.
- Do not hardcode department lists where `/master/departments` is the source of truth.
- Do not bypass auth/session helpers or use stale `localStorage` user data.
- Do not interpolate raw user input into SQL.
- Do not change password minimums, role normalization, soft-delete behavior, or Patrol schema assumptions without an explicit task.

## Common Pitfalls

1. **Uploaded files live on disk now** — use `backend/storage.js`; files are saved under `backend/uploads/` and served from `/uploads`
2. **`backend/.env` path** — โค้ด dotenv ใช้ `__dirname + '/.env'` ไม่ใช่ root `.env`
3. **`Employees` primary key** คือ `EmployeeID` (string) ไม่ใช่ `id`
4. **Company MySQL/MariaDB port** is normally 3306 unless IT provides a different port
5. **Legacy password mode** — ถ้า `Password` column เป็น NULL จะใช้ EmployeeID เป็น password (ต้องย้ายมาใช้ bcrypt)
6. **Frontend เป็น SPA** — ทุก page อยู่ใน `index.html`, JS แยกตาม page ใน `public/js/pages/`
7. **localStorage key mismatch (fixed)** — `tsh_user` คือ key จริง แต่ใช้ `TSHSession.getUser()` เสมอ ไม่อ่าน localStorage โดยตรง
8. **Form fields ที่มาจาก JWT** — ต้อง `readonly`/`disabled` + `<input type="hidden">` เพื่อส่งค่าให้ form ได้รวม
9. **Express v5** — ใช้จริงใน production (`package.json` ระบุ `"express": "^5.1.0"`) ต่างจาก v4 ตรงที่ error handling และ async route errors
10. **bcrypt + bcryptjs** — มีทั้งสองตัวใน dependencies (ซ้ำซ้อน) — code ใช้ `bcryptjs` เท่านั้น, `bcrypt` เป็น native binding ที่ไม่จำเป็น
11. **`backend/uploads/`** — must exist on the company server and must be backed up together with MySQL
12. **`window.closeModal` pattern** — `closeModal` จาก `ui.js` ไม่ถูก expose บน window โดยอัตโนมัติ ต้อง set `window.closeModal = closeModal` ใน page module ก่อนเปิด modal ที่มี inline onclick
13. **Upload field name** — `POST /api/upload/document` ใช้ field ชื่อ `document` (ไม่ใช่ `file`) — multer config กำหนดไว้ใน `backend/storage.js`
13a. **Upload original filenames** — stored filenames are random/safe; original display/download name is carried in `?filename=...`. Use `showDocumentModal()` or parse `filename` metadata; do not display `path.basename(url)` as the real document name.
14. **`Admin_AuditLogs` table** — auto-created/auto-migrated by `backend/utils/audit.js`; no manual DBeaver SQL step is required for normal startup
14a. **Policy acknowledge-all is irreversible in normal UI** — `POST /api/policies/:id/acknowledge-all` marks every employee as acknowledged. It is idempotent and audit-logged, but there is no bulk undo button; use only after Admin confirmation.
15. **`safeCount()` in system health** — ตาราง module ใหม่อาจยังไม่มีใน DB ทำให้ health check return `null` แทน error
16. **Express route ordering** — `PUT /api/kpidata/bulk` ต้องประกาศ **ก่อน** `PUT /api/kpidata/:id` ไม่งั้น `/bulk` จะถูก match เป็น `:id`
17. **Machine Safety file upload field** — `POST /api/machine-safety/:id/files` ใช้ multer field ชื่อ `file` (ไม่ใช่ `document`) ต่างจาก generic upload endpoint
18. **Add machine → upload files** — ต้อง POST machine ก่อน → รับ `id` จาก response → แล้วค่อย upload files/links ทีละขั้น (multi-step creation)
19. **KPI_DATA_FIELDS whitelist** — column จริงใน DB คือ `Metric`, `Department` (ไม่ใช่ `MetricName`, `Category`) — ตรวจ whitelist ใน `server.js` ก่อนแก้ field names
20. **`machine-safety.js` enterprise fields** — `Status`, `RiskLevel`, `NextInspectionDate` ถูก auto-migrate ใน `ensureTables()` แล้ว รวมถึงตาราง `Machine_Safety_Compliance` และ `Machine_Safety_Issues` — ไม่ต้องรัน SQL แยก; `ensureTables()` ทำงานครั้งแรกที่ request มาถึง route
21. **EmployeeID format** — รองรับทั้งตัวเลข 6 หลัก (012609) และแบบ letter-prefix (AP0001, SP0001) — placeholder ทุกที่ต้องอ้างอิงทั้งสองรูปแบบ
22. **EmployeeID cascade update** — `PUT /api/profile/employee-id` ใช้ `pool.getConnection()` + transaction เพื่อ update Employees PK + 9 related tables แล้ว re-issue JWT ใหม่ — frontend ต้อง reload หลังสำเร็จ
23. **`isAdmin` ใน patrol routes** — `/api/patrol` mount ใช้ `authenticateToken` เท่านั้น ถ้าต้องการ admin-only endpoint ภายใน patrol.js ต้อง import `isAdmin` จาก `../middleware/auth` แล้วใส่เป็น per-route middleware (`router.post('/...', isAdmin, handler)`)
24. **`Patrol_Roster` auto-create** — สร้างด้วย `CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `patrol.js` — ไม่ต้องรัน SQL แยก; ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อให้ import/export ข้าม MySQL-compatible engines ง่ายขึ้น
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
36. **Unexpected token '<' มักคือ backend ส่ง HTML แทน JSON** — สาเหตุที่พบบ่อย: (1) `ALLOWED_ORIGINS` ไม่รวม frontend origin จริง (2) DB credentials หรือ JWT_SECRET ไม่ครบ (3) backend process crash; วิธีแก้: ตรวจ `.env`, CORS, server logs แล้ว restart backend
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
53. **Yokoten `only_full_group_by` — ห้าม `SELECT r.* ... GROUP BY r.ResponseID`** — MySQL/MariaDB บางเครื่องเปิด `only_full_group_by`; ถ้าต้องการ files ให้ดึงแยกด้วย `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (...)` แทนการ JOIN + GROUP_CONCAT
54. **Yokoten response FormData** — `POST /yokoten/respond` และ `PUT /yokoten/respond/:id` รับ FormData (field: `responseFiles`) — ถ้าส่ง JSON จะไม่ได้รับไฟล์; `apiFetch` detect `body instanceof FormData` และข้าม `Content-Type` header อัตโนมัติ
55. **Yokoten approval status** — `null` = No/ไม่เกี่ยวข้อง (auto-approved/no action), `'pending'` = Yes/เกี่ยวข้อง รอ admin หลังแนบ action/evidence, `'approved'` = admin อนุมัติ, `'rejected'` = admin ปฏิเสธ; `CorrectiveAction` + evidence file required เมื่อ `IsRelated='Yes'` (validation ทั้ง client+server)
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
66. **Password minimum 4 ตัว** — validation enforce ทั้ง PHP production (`api/handlers/foundation.php` register + change-password + admin reset), Node dev (`server.js` register + change-password), Admin reset route, และ frontend (index.html, main.js, profile.js, admin.js); strength indicator แสดง 5 ระดับตาม score: length>=4 + lowercase + uppercase + digit + symbol; อย่าตั้ง validation กลับไป 6 หรือ 8 ตัว
67. **`normalizeRole()` ใน server.js** — ต้องเรียกใน login handler ก่อน sign JWT ทุกครั้ง; ใช้ `ALLOWED_ROLES.find(ar => ar.toLowerCase() === r.toLowerCase())` — ถ้าไม่พบ fallback `'User'`; ป้องกันกรณี DB มี role เป็น `'admin'` lowercase แล้ว isAdmin check (`=== 'Admin'`) fail
68. **Soft delete pattern — `IsDeleted TINYINT(1) DEFAULT 0`** — ทั้ง `Accident_Reports` และ `YokotenResponses` ใช้ soft delete; DELETE endpoint → `UPDATE ... SET IsDeleted=1`; ทุก GET/summary/analytics query ต้อง filter `WHERE (IsDeleted IS NULL OR IsDeleted = 0)`; ใช้ NULL-safe เพราะแถวเดิมก่อน migrate จะมีค่า NULL ไม่ใช่ 0
69. **Accident soft delete — Attachments ยังคงอยู่** — การ soft delete `Accident_Reports` ไม่ลบ `Accident_Attachments` และไม่ลบไฟล์จาก server file storage; ถ้าต้องการลบไฟล์ให้ใช้ `DELETE /accident/attachments/:id` แยกต่างหาก
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
