# Safety Vote UX/UI Phase 4 — Juror Assignment and Scoring Workspace

วันที่: 2026-10-08
สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE5`
Authoritative baseline: `main` / `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`

## ขอบเขตและการตัดสินใจก่อนแก้ Runtime

ผล preflight แบบ read-only อยู่ที่ `docs/safety-vote-ux-phase4-preflight-scope.md` และอนุญาตให้ทำเฉพาะ presentation-layer UX หลัง `safetyVoteUxV1` เท่านั้น โดยยืนยันว่า:

- queue/detail อ่านเฉพาะ assignment ของ `JurorEmployeeID` ที่ authenticated และ capability `SAFETY_VOTE_JURY`
- blind mode มาจาก stage rule ฝั่งเซิร์ฟเวอร์ และ detail API ส่ง alias แทนชื่อจริง
- score API รับเฉพาะชุด Draft, conflict state `clear`, ทุก candidate/criterion ที่อนุญาต และค่าคะแนนในช่วงที่กำหนด
- submit เป็น transactional immutable transition; การส่งซ้ำ/ส่งช้าถูกล็อก
- recusal ต้องมีเหตุผลและใช้ได้เฉพาะ Draft
- reopen เป็น Admin-owned operation ที่สร้าง `SheetVersion` ใหม่และเก็บชุดเดิม ไม่ใช่สิทธิ์ของ Juror UI
- Node/PHP ใช้ contract เดิมร่วมกัน และ runtime ไม่เป็นเจ้าของ DDL
- rollback คือปิด flag; legacy User/Juror UI ยังอยู่ และ `module_enabled` ยังคง fail-closed แยกต่างหาก

ไม่มีไฟล์ใน `backend/routes`, `api`, `backend/migrations` หรือ `shared` ถูกแก้ใน Phase นี้

## สิ่งที่ทำ

- หน้า “งานประเมินของฉัน” พร้อม Draft/Submitted/Recused, ค้นหา, จำนวนงานและ progress
- workspace ตาม assignment/stage พร้อม server-derived blind aliases, candidate/stage scope และ criteria scoring
- local draft ใน `sessionStorage` หลังอ่าน owned detail สำเร็จเท่านั้น; stale/Submitted/Recused drafts ถูกลบจาก authenticated queue
- server autosave เมื่อ sheet ครบและผ่าน validation โดย serialize request ป้องกัน save ซ้อน
- validation summary ที่ประกาศด้วย assistive technology และย้าย focus ได้
- review-before-submit, immutable warning และ dialog `alertdialog` ที่ trap/restore focus
- recusal dialog ที่บังคับเหตุผล, จำกัด 1,000 ตัวอักษร และมี inline live error
- duplicate-submit guard ใน UI และตรวจ authoritative detail หลัง ambiguous submit response
- privacy-safe receipt แสดงเฉพาะเลขอ้างอิง assignment, sheet version และเวลา server-side โดยไม่แสดงผู้สมัคร เกณฑ์ หรือคะแนน
- loading, empty, retry, denied, unassigned direct-link, locked และ module-disabled readiness states
- responsive sticky action bar, safe-area support, no horizontal overflow และ touch target อย่างน้อย 44 px

## ไฟล์ที่แก้ใน Phase 4

Runtime/presentation:

- `public/js/pages/safety-vote-jury-workspace.js` (ใหม่)
- `public/js/pages/safety-vote-jury-model.mjs` (ใหม่)
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/style.css`
- `public/js/main.js` และ `index.html` (cache marker)

Verification/documentation:

- `backend/scripts/safety-vote-ux-phase4-static.test.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase4-browser-uat.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase4-browser-probe.js` (ใหม่)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (authenticated guarded UX4 route)
- `backend/scripts/safety-vote-ux-phase3-static.test.js` (ยอมรับ cache chain รุ่น Phase 4 โดยยังตรวจ Phase 3 contract เดิม)
- `backend/package.json` และ root `package.json`
- `docs/safety-vote-ux-phase4-preflight-scope.md`
- เอกสารนี้และ `AGENTS.md`

## ผลทดสอบ

Static/unit/accessibility:

- Phase 4: PASS, 50 assertions
- Phase 3 regression: PASS, 45 assertions
- Phase 2 regression: PASS, 43 assertions
- Phase 1 regression: PASS, 30 assertions
- JavaScript syntax และ `git diff --check`: PASS

Business-contract regression:

- Safety Vote Phase 1–7 Node/PHP parity: PASS ทุก Phase
- Phase 4 parity ยืนยัน weighted/hybrid calculation, ranking/allocation, quorum/threshold, deterministic tie-break และ criteria/sheet/stage validation
- Phase 8.3.1 module-disabled Node/PHP parity: PASS
- ไม่พบการแก้ route/API contract, migration, schema หรือ business-calculation file

Authenticated Browser UAT:

- Chrome, authenticated Juror ที่ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`: PASS
- ทุก viewport: horizontal overflow = false; visible interactive target ต่ำกว่า 44 px = 0
- headings, role navigation, validation focus, accessible immutable/recusal dialogs และ receipt accessibility: PASS
- blind presentation ไม่พบชื่อจริง `Alice Real`/`Bob Real`: PASS
- local draft recovery, server autosave, review-before-submit และ immutable submit: PASS
- duplicate POST หลัง submit ได้ `409 SCORE_SHEET_LOCKED` ครบ 5 viewport
- unassigned direct link ได้ `404`, missing capability ได้ `403`, module disabled ได้ `503`; ทั้งหมดแสดง privacy-safe denied/fail-closed state
- unexpected API errors และ browser exceptions: 0

Browser skill ถูกใช้เพื่อเริ่ม in-app Browser ตามข้อกำหนด แต่ controller ไม่สามารถสร้าง kernel assets ใน environment นี้ได้ จึงใช้ guarded loopback Chrome/CDP fallback ของ repository และบันทึกหลักฐานถาวรแทน

## หลักฐานและ residue

หลักฐาน: `backups/local/safety-vote-ux-phase4-1791464614885/`

- 14 PNG screenshots พร้อม `result.json` และ `result.sha256`
- SHA-256 ของ `result.json`: `2e2c11b008a76debb8d20576ba67be65994ec5635db6bf3726d64226b5c65f1e`
- mutation ledger: Submitted assignments 5, Recused assignments 1, Submitted score rows 20
- ballot + participation + certification + result snapshot rows: 0
- browser `safety-vote-jury-draft:*` residue: 0
- guarded disposable database residue หลัง drop: 0

ไม่มีการเชื่อม Production, deploy, commit หรือ push และ `HEAD`/`origin/main` ยังเป็น `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`

## ข้อจำกัด

- Browser UAT นี้ทดสอบ presentation และ lifecycle ผ่าน Node fixture; PHP parity ถูกยืนยันด้วย deterministic Phase 1–7 parity gates แต่ไม่ได้เปิด PHP browser surface ซ้ำทั้งห้า viewport
- server score API ต้องการ complete sheet จึงเก็บ partial input ใน `sessionStorage` เท่านั้น และส่ง server autosave เมื่อครบ/valid; ไม่มีการเดา partial-save contract ใหม่
- Juror UI ไม่เปิดเผยหรือเรียก Admin reopen API; ชุดใหม่จะแสดงเมื่อ Admin ดำเนินการผ่าน workflow เดิม
- ไม่ได้ทดสอบ Production, external notification หรือ real business account/data

## คำสั่งสำหรับ Safety Vote UX/UI Phase 5

```text
เริ่ม Safety Vote UX/UI Phase 5 — Operations, Analytics and Result Readiness Workspace ต่อจาก `docs/safety-vote-ux-phase4-juror-assignment-scoring-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 4 diff, existing operations/analytics/turnout/jury-progress/schedule/notification/report APIs, privacy-threshold suppression, result visibility, certification ownership, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged หน้า Admin “ศูนย์ปฏิบัติการ Safety Vote” พร้อม campaign/stage health, lifecycle timeline, privacy-safe turnout funnel, jury progress, schedule/readiness warnings, notification delivery status, aggregate report/export actions, loading/empty/retry/denied/partial states และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 โดยใช้ API/capability/schema เดิมเท่านั้น ห้ามเปิดเผยตัวเลือกลงคะแนนหรือ blind identity ต่ำกว่า privacy threshold ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury calculation, certification, result calculation, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 6
```
