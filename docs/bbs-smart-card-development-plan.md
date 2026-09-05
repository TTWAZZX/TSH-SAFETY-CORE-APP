# BBS Smart Card Development Plan

## Phase 10C-3 implementation status - Runtime resilience and safe recovery complete locally (2026-08-31)

- Core, History, Community, Inspector, Action, Analytics and Card reads now expose independent recovery state. A failed API no longer blanks the complete BBS page or silently redirects the user.
- Retry stays in the current workspace. Previously confirmed data remains visible with a stale-data warning; when no successful read exists, unknown totals are not rendered as zero.
- Critical Observation/batch, Action, Community, inspector, card/template and Department QR write controls expose `aria-busy`, pending labels and one in-flight activation per rendered control. Existing API payloads and server business safeguards are unchanged.
- Static contract, Phase 4-10C-2 regressions, the complete Backend suite (`exit 0`) and authenticated read-only Browser UAT pass. Browser coverage includes 8 tabs, five phone viewports and an injected temporary Analytics failure followed by successful Retry in the same tab.
- No API, schema, permission, Master/Pilot configuration, business row, upload path, Production or GitHub state changed.

## Phase 10C-2 implementation status - Mobile and accessibility hardening complete locally (2026-08-31)

- All visible BBS workspaces retain one semantic tablist/tabpanel contract with Left/Right/Home/End keyboard navigation, selected-tab focus and focus preservation across client renders.
- Phone layouts enforce 44 px touch targets and 16 px text-entry controls, support 320-430 px portrait plus phone landscape, label horizontal table regions and keep sticky actions clear of the safe area.
- Single/batch validation now returns users to the existing invalid answer, remark, immediate-action or evidence control. Safe/Unsafe/N/A, evidence and atomic batch rules are unchanged.
- Observation, Action and Analytics dialogs now expose modal semantics, trap focus, close with Escape/backdrop/close control, use the shared visual-viewport overlay state and restore the initiating control.
- Static/regression contracts, the complete Backend test suite (`exit 0`) and authenticated read-only Browser UAT pass across 8 tabs and five phone viewports. No API, schema, Master/Pilot configuration, business row, upload path, Production or GitHub state changed.

## Phase 10C-1 implementation status - Workflow Reliability complete locally (2026-08-31)

- Single and batch Drafts save before tab navigation. The Start workspace loads the observer's server Drafts independently of History filters and can resume them; starting the same employee reuses the current Draft path.
- Personal Card issue/replace pre-opens the browser print window and preloads the private template before the one-time QR mutation. Analytics Excel/PDF/Print refresh their current scoped export payload before output.
- Phase 10C-0B Pilot roster, Checklist, template, QR and handler configuration is intentionally left to the user. No schema, database data, upload path, Production or GitHub state changed.

## Phase 10A implementation status - Mobile Batch Observation complete locally (2026-08-27)

- Inspectors can select 2-50 server-authorized team members, search/select all, or fall back to the existing single-person workflow.
- The server resolves each employee's checklist and the mobile wizard groups matching immutable versions. Shared Safe/Unsafe/N/A answers may be overridden per employee.
- Every member remains an individual Observation. Draft save and final submit are atomic; Unsafe validation, private evidence and Corrective Actions remain individual.
- Local/server draft recovery, client image downscaling, review-before-submit, observer/Admin batch privacy and three safe rollback flags are included.
- Local migration, Node/PHP parity, lifecycle/privacy/action rollback UAT and authenticated 390px Chrome UAT pass. Production rollout remains separately gated.

## Phase 8 implementation status — Department cards and Community reporting complete locally (2026-08-26)

The approved extension now has personal cards for Group Leader and above plus Department cards only. Each Department can keep multiple named printable templates while sharing one rotatable QR; Unit cards are excluded. All authenticated employees can submit Community Good/Risky reports with an optional observed person. Good reports are visible company-wide without reporter identity; Risky reports and their immediately-created Community Actions are Admin-only. Community activity does not count formal KPI. The additive 8-table migration, private storage, Node/PHP APIs, responsive UI, permission/privacy controls and lifecycle tests are complete locally. Production and GitHub remain unchanged pending explicit controlled-rollout approval.

## Phase 7 implementation status — local hardening complete; Pilot configuration pending (2026-08-25)

Security hardening and rollout preparation are implemented locally without Production deployment. Node/PHP security headers and QR claim response shape are aligned; auth/IDOR, XSS, SQL parameterization, private content-verified uploads, QR replay controls, concurrency, idempotency and rollback gates pass. Authenticated Chrome passes wide/mobile layout and accessible-control checks. The read-only Pilot audit confirms the approved `MAINTENANCE SEC.` / `Tube Cutting` Master scope and 100% source/action reconciliation with no orphans, but reports 0 Active Assignments, 0 Published Checklists and 0 Operators. Business-owner roster/configuration approval and Pilot sign-off remain required before the separately approved Production rollout.

## Phase 6 implementation status — complete locally (2026-08-25)

Analytics / Management Reporting is complete with Node/PHP parity. Personal, team, Department and company scopes are enforced server-side; KPI numerator/denominator, trends, Pareto, Department/Unit comparison, action aging, drill-down and same-scope Excel/PDF/Print are available with year/month/Department/Unit/risk filters. The BBS shell now uses the same full-width content layout as the established modules. The additive local migration adds reporting indexes and reversible feature flags only. Formula parity, source reconciliation, privacy, production-like performance and responsive browser UAT passed. Production is unchanged. Phase 7 security hardening, Pilot and controlled rollout is next.

## Phase 5 implementation status — complete locally (2026-08-25)

Corrective Action creation, Owner/Verifier state machine, SLA, secure Before/After evidence, Pending Verification, closure/reopen, history/audit, queued reminders and overdue escalation are complete with Node/PHP parity. The new UI extends the existing BBS workspace with an Actions tab and dashboard alert. Local migration, cross-stack lifecycle UAT, and authenticated desktop/mobile browser UAT passed; email delivery is disabled and no real mail was sent. Production is unchanged. Phase 6 analytics and management reporting is next.

## Phase 4 implementation status — complete locally (2026-08-25)

QR / Smart Card / Print is implemented without using QR as authentication.
Admin can manage private scoped templates, issue 1-100 cards, replace/rotate,
revoke with reason, preview CR80 cards, and print CR80/A4 batches with audit.
The database stores token hashes/fingerprints only; public resolve exposes no
identity and authenticated claim preserves the current login. Node/PHP parity,
migration rollback, lifecycle/rate-limit cleanup, and responsive plus
pre-login QR browser UAT pass. Production is unchanged. Phase 5 Corrective
Action and SLA workflow is next.

## Phase 3 implementation status — complete locally (2026-08-25)

My Workspace and the core Observation MVP are implemented with Pilot/Admin
navigation, server-scoped team/eligible employees, immutable Checklist
snapshots, Draft/Submit idempotency, Safe/Unsafe/N/A rules, private evidence,
scoped histories, and basic KPI. Node/PHP parity, migration rollback, lifecycle
cleanup, and responsive browser UAT pass. Production is unchanged. Phase 4
Smart Card, opaque QR, and print lifecycle is next.

Implementation status (2026-08-25): Phase 2B is complete locally and not
deployed. Checklist Excel Export includes README, metadata, items, scopes, and
Master reference sheets. Import requires a successful server Preview, then
atomically replaces only a Draft after rechecking validation, Master IDs, and
RowVersion. Node/PHP parity, permission, immutable-version, invalid-import
atomicity, lifecycle cleanup, and browser wiring are covered. Phase 3 is next.

Implementation status (2026-08-25): Phase 2 Checklist Builder is complete
locally and not deployed. Immutable published versions, Clone/Archive,
Activate/Deactivate, categories/items reorder, scoped resolution, conflict
detection, Unsafe item flags, Admin Builder/Resolver Preview, Node/PHP parity,
migration/rollback, authenticated lifecycle UAT, and browser UAT pass.
Import/Export is deferred to Phase 2B. Phase 3 is next.

Implementation status (2026-08-25): Phase 1 is complete locally and is not
deployed. The schema, Node/PHP APIs, Admin configuration UI, permission engine,
KPI rule, pilot scope, migration/rollback tests, authenticated UAT, and browser
UAT pass. The main BBS menu remains hidden until Phase 3. Phase 2 Checklist
Builder is next after review. This status supersedes the original readiness
line below.

สถานะ: Phase 0 approved — พร้อมเริ่ม Phase 1 แต่ยังไม่ได้เริ่ม implementation
โปรเจกต์: TSH Safety Core Activity
โมดูล: BBS Smart Card

## 1. ตำแหน่งโมดูลในระบบ

กำหนด route เป็น `#bbs-smart-card` และวางเมนูใน sidebar ถัดจาก `Safety Culture` ทันที:

```text
YOKOTEN
Safety Culture
BBS Smart Card
Contractor / Supplier
Hiyari-Hatto
```

Integration points ที่ต้องแก้เมื่อเริ่ม implementation:

- `index.html`: sidebar navigation และ `<div id="bbs-smart-card-page">`
- `public/js/main.js`: import page loader, route switch และ page title
- `public/js/module-meta.js`: icon, metadata และ `MODULE_ORDER`
- `public/js/login-guides.js`: คำแนะนำและ audience ของโมดูล
- `public/js/pages/bbs-smart-card.js`: page module ใหม่

เมนูจะถูกเพิ่มใน Phase 3 เมื่อ My Workspace และ observation flow พร้อมใช้งานแล้ว เพื่อไม่เปิดหน้าเปล่าให้ผู้ใช้ Production ระหว่าง Phase 1–2

## 2. ขอบเขตหน้าจอภายในโมดูล

เสนอให้โมดูลมี tab ตามสิทธิ์ดังนี้:

1. `Dashboard` — ภาพรวมส่วนตัว/ทีม/บริษัทตาม scope
2. `My Workspace` — งานที่ต้องทำ สมาชิกที่ตรวจได้ และ KPI
3. `เริ่มสังเกต` — eligible employees และ Smart Checklist
4. `ประวัติ` — ที่ตนตรวจและถูกตรวจ พร้อม filter
5. `Actions` — Corrective Action ที่รับผิดชอบ/ต้องตรวจสอบ
6. `Reports` — analytics และ export ตาม permission
7. `จัดการ BBS` — Admin-only: hierarchy, checklist, card และ settings

ผู้ใช้ทั่วไปเห็นเฉพาะข้อมูลตนเองและ scope ที่ server อนุญาต Admin จึงเห็น configuration และ company drill-down

## 3. Architecture Boundary

### Frontend

- ใช้ Vanilla JavaScript SPA และ UI utilities เดิม
- เรียก API ผ่าน `API` object เดิม
- อ่านผู้ใช้ผ่าน `TSHSession.getUser()` เท่านั้น
- Responsive card/table ตาม pattern ของโมดูลปัจจุบัน
- ไม่เพิ่ม React, Vue, DataTables หรือ SweetAlert

### Backend

- Node local: `backend/routes/bbs-smart-card.js`
- PHP Production: `api/handlers/bbs_smart_card.php` และ route dispatch ตาม pattern เดิม
- Shared business rules ที่ต้องมี parity: hierarchy scope, checklist resolution, KPI, QR lifecycle และ action transition
- ใช้ prepared statements, transaction และ server-side authorization

### Existing data reused

- `Employees.EmployeeID`
- `Master_Departments`
- `Master_SafetyUnits`
- Position/organization APIs เดิมที่ตรวจพบใน System Console
- JWT, Admin middleware, audit, upload storage, email/outbox และ dashboard alert patterns เดิม

## 4. Draft Data Domains

ยังไม่ถือเป็น schema สุดท้ายจนกว่า Phase 0 จะยืนยันข้อมูลจริง

### Organization and permission

- Position → BBS level mapping
- Reporting/supervisor assignment เมื่อข้อมูลเดิมไม่เพียงพอ
- Temporary delegation และ effective dates
- Scope exception/exemption พร้อมเหตุผล

### Card lifecycle

- Card owner (`EmployeeID`)
- Opaque QR token hash
- Status: Active, Revoked, Replaced, Expired
- Template/version และ issued/revoked audit

### Checklist

- Template
- Immutable version
- Category และ item
- Scope mapping: Department, Unit, Position, BBS level
- Effective date, priority และ publish/archive state

### Observation

- Observer/observed EmployeeID
- Checklist version
- Organization snapshot ตอนตรวจ
- Date/time, status และ submit metadata
- Answers, remarks และ evidence

### Corrective Action

- Unsafe answer ต้นทาง
- Owner, priority, due date และ status
- Before/after evidence
- Verification, close/reopen history

Dashboard/report จะคำนวณจาก source records ก่อน ยังไม่สร้าง statistics/report tables จนกว่าจะมีหลักฐานด้าน performance

## 5. Permission Matrix Draft

| BBS level | Workspace scope | ผู้ที่สังเกตได้ | ประวัติที่เห็น | Configuration |
|---|---|---|---|---|
| Operator | ตนเอง | Peer ตาม scope | ของตนเอง | ไม่มี |
| Group Leader | ตนเองและทีม | Operator ในทีม | ทีมใน scope | ไม่มี |
| Department Head | สายงานที่รับผิดชอบ | Group Leader | scope ที่รับผิดชอบ | ไม่มี |
| Section Head | สายงานที่รับผิดชอบ | Department Head | scope ที่รับผิดชอบ | ไม่มี |
| Manager | สายงานที่รับผิดชอบ | Section Head | scope ที่รับผิดชอบ | ไม่มี |
| Admin | ทั้งบริษัท | ทุกคนตาม Admin flow | ทั้งหมด | ทั้งหมด |
| Viewer | ตาม policy ที่อนุมัติ | ไม่สังเกตโดย default | aggregate/read-only | ไม่มี |

BBS level ไม่ใช่ Global Role ใหม่ ระบบต้อง resolve จาก Position/mapping โดยไม่เปลี่ยน whitelist `Admin/User/Viewer`

## 6. Development Phases

## Phase 0 — Discovery, Data Audit and Design Approval

เป้าหมาย: ยืนยันว่าข้อมูลเดิมรองรับ hierarchy และ BBS workflow ได้จริงก่อนสร้าง schema

งาน:

- Audit `Employees`, Department, Safety Unit, Position และ organization mapping แบบ read-only
- ตรวจคุณภาพข้อมูล: ตำแหน่งว่าง ชื่อซ้ำ Unit ไม่ตรงแผนก และสายบังคับบัญชาที่ขาด
- สรุป BBS level mapping ที่เป็นไปได้
- ยืนยัน KPI period, target, peer scope และ privacy policy
- ทำ ERD draft, API contract, UI flow, wireframe และ threat model
- ออก checklist resolution/conflict rules
- กำหนด migration, backup, rollback และ data retention

ผลส่งมอบ:

- Discovery report
- Approved requirement/assumption list
- Permission matrix
- ERD และ API/UI design
- Exact affected-files list
- Phase acceptance criteria

เกณฑ์ผ่าน:

- ไม่มี critical hierarchy ambiguity ที่ยังไม่ตัดสินใจ
- ผู้ใช้อนุมัติ ERD, permission และ MVP scope
- ยังไม่มี application/schema/Production mutation

## Phase 1 — BBS Foundation, Hierarchy and Permission Engine

เป้าหมาย: สร้างฐานข้อมูลและ server-side scope resolver ที่เชื่อถือได้

งาน:

- เพิ่ม migration สำหรับ BBS settings, level mapping และ hierarchy assignments เฉพาะส่วนที่ Master เดิมไม่มี
- เพิ่ม Admin APIs สำหรับ configuration
- เพิ่ม endpoint resolve `my BBS context`, reporting line และ eligible employees
- รองรับ effective date, temporary assignment และ inactive employee
- เพิ่ม audit log และ permission-denied behavior
- ทำ Node/PHP parity tests
- ทำ Admin configuration UI แบบยังไม่เปิดเมนูหลักให้ผู้ใช้ทั่วไป

เกณฑ์ผ่าน:

- Server คืน scope ตรง permission matrix
- ผู้ใช้แก้ request payload เพื่อข้าม scope ไม่ได้
- Admin configure mapping ได้โดยไม่ hardcode Department/Position
- Node/PHP fixture ให้ผลตรงกัน
- Migration และ rollback ผ่านบนฐานข้อมูลทดสอบ

จุด rollback: ถอน route/UI ของ Phase 1 และใช้ migration rollback ที่อนุมัติ โดยไม่แตะ Employee Master

## Phase 2 — Checklist Builder and Immutable Versioning

เป้าหมาย: ให้ Admin สร้างและ publish Checklist ที่ระบบ resolve อัตโนมัติได้

งาน:

- Checklist template, version, category, item และ scope mapping
- Draft → Publish → Archive lifecycle
- Clone, reorder และ preview
- Item types รอบแรก: Safe/Unsafe/N/A, remark, photo-required และ action-required
- Checklist resolution ตาม Department → Unit/Position/BBS level → priority → effective date
- Conflict detector เมื่อมี template priority เท่ากัน
- Import/Export ทำหลัง CRUD/validation เสถียร หรือแยกเป็น Phase 2B

เกณฑ์ผ่าน:

- Version ที่มี observation อ้างอิงแล้วแก้ไขไม่ได้
- Resolution คืน template เดียวแบบ deterministic
- ไม่มี template หรือมี conflict ต้อง fail closed พร้อมข้อความชัดเจน
- Import invalid row ไม่สร้างข้อมูลบางส่วน
- Admin preview เห็น checklist เดียวกับที่จะใช้จริง

จุด rollback: deactivate template/version โดยไม่ลบประวัติหรือ Master Data

## Phase 3 — My Workspace and Core Observation MVP

เป้าหมาย: เปิดใช้งาน BBS จริงผ่านเมนูระบบเดิมก่อนเพิ่ม QR

งาน:

- เพิ่มเมนู `BBS Smart Card` ใต้ `Safety Culture` และก่อน `Contractor / Supplier`
- เพิ่ม route, module metadata, page container และ login guide
- My Workspace ตาม BBS level
- My Team และ eligible employee list จาก server
- Start observation พร้อม auto-filled observer/observed/scope/date/checklist
- Save draft, submit และ duplicate-submit guard
- Answers Safe/Unsafe/N/A, remark และ secure evidence upload
- History: ที่ฉันตรวจ/ฉันถูกตรวจ
- Basic personal/team KPI numerator/denominator
- Responsive desktop/tablet/mobile

MVP ที่แนะนำ:

- ใช้การเข้าเมนูปกติก่อน QR
- รองรับ checklist types หลักและ evidence
- ยังไม่เปิด advanced analytics, batch card printing หรือ notification จริง

เกณฑ์ผ่าน:

- Operator/Leader/Admin เห็นรายชื่อและข้อมูลตาม scope เท่านั้น
- Checklist ถูกเลือกอัตโนมัติและ version ถูกตรึงใน observation
- Unsafe rule ถูก validate ทั้ง frontend/server
- Refresh/retry ไม่สร้าง observation ซ้ำ
- Upload/retrieval authorization ผ่าน
- ไม่มี page overflow และใช้งานบน mobile ได้

จุด release: เมื่อ Phase 3 ผ่านจึงเปิดเมนูให้กลุ่ม pilot; ก่อนหน้านั้นเป็น Admin-only/hidden

## Phase 4 — Smart Card, QR and Print Lifecycle

เป้าหมาย: เพิ่ม QR เป็นทางเข้า Personal Workspace อย่างปลอดภัย

งาน:

- Opaque QR token และ server-side resolve
- Issue, revoke, replace และ rotate token
- Login return-to-workspace flow
- Card template upload/preview/activation
- Overlay รูป ชื่อ แผนก ตำแหน่ง QR และ EmployeeID ตาม policy
- Single/batch generation และ print-ready output
- Lost-card/reissue audit
- Rate limit และ QR threat tests

เกณฑ์ผ่าน:

- QR ไม่บรรจุ JWT/password/PII เกินจำเป็น
- สแกน QR ไม่สามารถเปลี่ยน session เป็นเจ้าของบัตรคนอื่น
- Revoked/replaced token ใช้ไม่ได้ทันที
- Template/file access ถูกจำกัดสิทธิ์
- Output card ตรงขนาดและไม่ตัดข้อความ/QR

จุด rollback: revoke QR access และยังเข้า Workspace ผ่านเมนูปกติได้

## Phase 5 — Corrective Actions and Notifications

เป้าหมาย: ปิดวงจร Unsafe observation

งาน:

- Action state machine: Open → In Progress → Pending Verification → Closed/Reopened
- Owner, due date, priority และ before/after evidence
- Admin/Verifier permissions
- Dashboard alerts
- Email/outbox integration, retry และ duplicate suppression
- Reminder near due/overdue
- Audit ทุก transition

เกณฑ์ผ่าน:

- Invalid state transition ถูกปฏิเสธที่ server
- Closing action ต้องมี evidence/verification ตาม rule
- Reminder ไม่ส่งซ้ำใน suppression window
- ทดสอบไม่ส่ง email จริงจนได้รับอนุมัติ
- Action ไม่หายเมื่อ checklist/template ถูก archive

จุด rollback: ปิด notification worker/sending โดย workflow และข้อมูล Action ยังอ่านได้

## Phase 6 — Dashboard, Analytics and Reports

เป้าหมาย: เพิ่มภาพรวมเพื่อการตัดสินใจโดยไม่กระทบ privacy

งาน:

- Personal, team, Department และ company dashboard
- KPI completion พร้อม numerator/denominator
- Safe/Unsafe trend, Pareto, heatmap และ category analysis
- Action aging/overdue
- Year/month/Department/Unit/risk filters
- Drill-down ตาม permission
- Excel, PDF และ Print
- ตรวจ query/index ด้วย Production-like volume

เกณฑ์ผ่าน:

- KPI formula ตรงกันทุกหน้าและ export
- Filter scope ไม่เปิดเผยข้อมูลข้าม hierarchy
- Aggregate totals reconcile กับ observation source
- Export ใช้ scope เดียวกับหน้าจอ
- Query สำคัญผ่าน performance threshold ที่อนุมัติ

จุด rollback: ปิด analytics/export โดยไม่กระทบ observation และ action workflow

## Phase 7 — Security Hardening, Pilot and Production Rollout

เป้าหมาย: ตรวจระบบครบวงจรก่อนเปิดทั้งบริษัท

งาน:

- IDOR, XSS, SQL injection, upload, QR replay และ permission audit
- Concurrency/double-submit และ transaction failure tests
- Node/PHP parity suite
- Responsive/accessibility/browser UAT
- Pilot หนึ่งหรือสอง Department/Unit
- Data reconciliation และ feedback fixes
- Production backup, migration, scoped upload, SHA-256 และ authenticated smoke
- Monitoring, rollback drill และ support runbook

เกณฑ์ผ่าน:

- Critical/high security findings เท่ากับ 0
- Pilot observation/action counts reconcile 100%
- Temporary test rows/files ถูกลบเหลือ 0
- Production upload/download-back hashes ตรงกัน
- Business owner อนุมัติ UAT และ privacy behavior

## 7. Cross-phase Test Matrix

ทุก Phase ที่มี code ต้องตรวจอย่างน้อย:

- JavaScript syntax และ PHP lint
- Focused business-rule regression
- Node/PHP API parity
- Admin/User/Viewer permission boundaries
- Department/Unit/Position normalization
- UTF-8/mojibake
- `git diff --check`
- Authenticated browser UAT ตามความเสี่ยง

เมื่อแตะฐานข้อมูลหรือ upload:

- Migration dry run และ rollback test
- Production backup ก่อน deploy
- Upload/retrieval authorization
- SHA-256 verification
- Business-data count ก่อน/หลัง smoke
- Cleanup temporary rows/files เหลือ 0

## 8. Approved Phase 1 Decisions

เจ้าของระบบอนุมัติ baseline เมื่อ 25 สิงหาคม 2026:

1. Hierarchy: พนักงาน → Operator, หัวหน้ากลุ่ม → Group Leader,
   หัวหน้าแผนก → Department Head, หัวหน้าส่วน → Section Head และผู้จัดการ →
   Manager; Position ย่อยต้องผ่าน Admin-reviewed mapping เข้าหนึ่งในห้าระดับ
2. Operator สังเกตเฉพาะรายการที่เกี่ยวข้องกับตนตาม permission; Group Leader
   สังเกต Operator ภายใน Unit ที่ได้รับมอบหมาย ห้าม frontend ขยาย scope เอง
3. KPI บังคับสำหรับ Group Leader อย่างน้อย 1 submitted observation ต่อวัน
   จันทร์–ศุกร์ ตามเวลา `Asia/Bangkok`; Draft ไม่นับ และรอบแรกยังไม่หัก
   วันหยุดบริษัทจนกว่าจะมี calendar source ที่อนุมัติ
4. Operator เห็นเฉพาะรายการที่ตนเป็นผู้ตรวจหรือผู้ถูกตรวจ; ผู้มีสิทธิ์ระดับ
   Department เห็นชื่อผู้ตรวจ ประวัติ Unsafe และข้อมูลรายบุคคลได้เฉพาะแผนก
   ของตน; Admin เห็นทั้งหมด และการเปิดดูรายละเอียดต้อง audit ได้
5. Pilot ใช้ Department `MAINTENANCE SEC.` และ Safety Unit `Tube Cutting`
   โดยต้อง resolve จาก Master Data ID ตอนตั้งค่า ห้าม hardcode ชื่อใน business
   logic

รายการที่เลื่อนไปอนุมัติตาม Phase: กฎ Unsafe/หลักฐานใน Phase 2, action owner
และ SLA ใน Phase 5, Card template และ QR expiry/rotation ใน Phase 4 การเลื่อน
รายการเหล่านี้ต้องไม่ขยายขอบเขต Phase 1 ซึ่งทำเฉพาะ foundation, hierarchy,
permission และ KPI configuration

## 9. Recommended Starting Scope

เริ่มด้วย Phase 0 ก่อน และยังไม่สร้าง QR/บัตรในรอบแรก เหตุผลคือความถูกต้องของ hierarchy, eligible employee และ checklist resolution เป็นฐานของทั้งระบบ หากสามส่วนนี้ผิด QR จะเพียงพาผู้ใช้เข้าสู่ workflow ที่ผิดเร็วขึ้น

MVP แรกที่ควรใช้งานได้จริงคือ Phase 1–3:

- Admin ตั้ง BBS level และ hierarchy
- Admin publish Checklist version
- ผู้ใช้เปิด BBS จากเมนูใต้ Safety Culture
- ระบบแสดงคนที่ตรวจได้และเลือก Checklist อัตโนมัติ
- บันทึก Safe/Unsafe/N/A พร้อมหลักฐาน
- ดูประวัติและ KPI พื้นฐาน

หลัง MVP ผ่าน pilot จึงเพิ่ม QR Card, Actions, Notifications และ Analytics ตาม Phase 4–6

## 10. Phase 9B — Inspector Schedule & Compliance Dashboard

สถานะ ณ 26 สิงหาคม 2026: พัฒนาและทดสอบบน Localhost แล้ว ยังไม่ Deploy

- Admin กำหนดวันตรวจแบบ recurring ต่อผู้ตรวจที่แต่งตั้งใน Phase 9 พร้อมจำนวนครั้งต่อวันและช่วงวันที่มีผล
- การเปลี่ยนตารางสร้าง effective-dated version ใหม่ ไม่เขียนทับประวัติ และไม่อนุญาตแก้วันย้อนหลัง
- Admin กำหนดวันพิเศษเป็น `Required` หรือ `Exempt` พร้อมเหตุผลได้; ผู้ตรวจอ่านได้เฉพาะตารางของตน
- Dashboard แสดงผู้ตรวจ วันครบ วันตรวจไม่ครบ วันไม่ได้ตรวจ ผลงาน/เป้า เปอร์เซ็นต์ และปฏิทินรายวัน
- Workspace KPI, Analytics และ Export ใช้สูตรเดียวกัน: ผลงานแต่ละวันถูก cap ไม่เกิน target ของวันนั้น; วัน `Exempt` ไม่นับ denominator
- Migration เป็น additive สามตารางและมี `inspector_schedule_enabled` เป็น safe rollback flag; ไม่มีการเปลี่ยน upload/storage

## 11. Phase 10F — Visual Card Designer

### Phase 10F-0 — Architecture & Field Mapping

สถานะ ณ 2 กันยายน 2026: ออกแบบเอกสารเสร็จบน Localhost ยังไม่สร้าง Migration, ไม่แก้ Runtime, ไม่ Deploy และไม่ Push

- รองรับ Personal Card และ Department Card แบบหน้า/หลัง แนวตั้ง/แนวนอน
- ใช้ Draft layout ที่แก้ไขได้ และ Active/Archived version ที่ immutable
- ใช้ server-authoritative field catalog สำหรับ Employee Master, BBS level, Department และ QR เดิม
- ใช้ geometry แบบ integer basis points เพื่อให้ Preview/Print ใช้ layout เดียวกัน
- เตรียม additive legacy bootstrap ที่อ้างอิงไฟล์เดิมโดยไม่ย้าย/ทำสำเนาและไม่แก้ row เดิม
- เมื่อไม่มี layout ใหม่หรือปิด feature flag ต้อง fallback ไป renderer เดิม
- รายละเอียดอยู่ที่ `docs/bbs-smart-card-phase10f0-visual-card-designer.md`

### Phase 10F-1 — Additive Foundation & Compatibility

Status as of 2 September 2026: complete on Local; not deployed or pushed. The additive migration is installed locally with both designer flags disabled. Local legacy inventory contains no Personal/Department template candidates, so bootstrap inserted no designer row.

- Review และสร้าง migration สำหรับ layout version, sides, elements, assets และ print snapshots
- เพิ่ม feature flags ที่ default เป็นปิด
- เพิ่ม Node/PHP validation และ Admin Draft API parity
- เพิ่ม SELECT-only inventory และ idempotent legacy bootstrap

### Phase 10F-2 — Visual Designer Editor

Status as of 2 September 2026: complete on Local; not deployed or pushed. Local Admin editing is enabled, but live designer rendering remains disabled and all existing card output still uses the established renderer.

- Front/Back canvas, drag/resize, layers, properties, orientation, undo/redo และ accessibility
- private artwork/static asset upload และ preview-only rendering

### Phase 10F-3 — Personal Card Integration

- bind Employee/BBS fields และ one-time Personal QR flow เดิม
- reconcile output กับ legacy renderer ก่อนเปิด designer rendering

### Phase 10F-4 — Department Card Integration

- bind Master Department และ Active shared Community QR เดิม
- รองรับ named template และ duplex print

### Phase 10F-5 — Print Readiness, Audit & UAT

- ใช้ render contract เดียวกันสำหรับ preview/print/export
- ตรวจ QR scan, safe/bleed, duplex registration, portrait/landscape, security และ Node/PHP parity
- ต้องได้รับ business acceptance และคำสั่งแยกก่อน Deploy หรือเปลี่ยน Production flag
