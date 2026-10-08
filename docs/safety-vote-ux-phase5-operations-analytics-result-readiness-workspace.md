# Safety Vote UX/UI Phase 5 — Operations, Analytics and Result Readiness Workspace

วันที่: 2026-10-08
สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE6_WITH_BASELINE_LIMITATION`
Authoritative baseline: `main` / `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`

## ขอบเขตและการตัดสินใจก่อนแก้ Runtime

ผล preflight แบบ read-only อยู่ที่ `docs/safety-vote-ux-phase5-preflight-scope.md` และอนุญาตให้ทำเฉพาะ presentation-layer UX หลัง strict opt-in `safetyVoteUxV1` โดยยืนยันว่า:

- Operations, organization analytics และ result snapshots ใช้ `SAFETY_VOTE_RESULT_VIEW`
- stages, jury progress, notification preview/queue และ schedule processor ใช้ `SAFETY_VOTE_MANAGE`
- aggregate/certified report ใช้ `SAFETY_VOTE_EXPORT`
- การ calculate/freeze/certify/publish ไม่ใช่ mutation ของหน้านี้; certification ยังต้องใช้ `SAFETY_VOTE_CERTIFY`, campaign certifier assignment และ exact result hash
- privacy threshold และ `SECRET_DIMENSION_FORBIDDEN` เป็นคำตัดสินจากเซิร์ฟเวอร์; client ไม่อนุมานค่าที่ถูกปกปิด
- rollback คือปิด flag; legacy Admin workspace ยังอยู่ และ `module_enabled` ยังคง default OFF/fail-closed แยกต่างหาก

ไม่มีไฟล์ใน `backend/routes`, `api`, `backend/migrations` หรือ `shared` ถูกแก้ใน Phase นี้

## สิ่งที่ทำ

- เพิ่มทางเข้าจาก Admin Campaign Center ไปหน้า “ศูนย์ปฏิบัติการ Safety Vote” แบบ full-width และ feature-flagged
- campaign/stage health, schedule และ lifecycle timeline ที่ตัด `BoundedDetail` ออกจาก presentation
- privacy-safe turnout funnel ซึ่งแสดงค่าเฉพาะ server-visible metrics และใช้คำว่า “ปกปิด” เมื่อไม่ผ่าน threshold
- jury/stage progress และ partial-state ที่ไม่ทำให้ส่วนอื่นล้มเมื่อ optional capability/API ไม่พร้อม
- notification delivery status แบบ aggregate, preview เฉพาะจำนวนรวม และ confirm dialog ก่อน queue; ไม่มี external dispatch
- result snapshot/readiness metadata, shortened hash, aggregate Excel/PDF และ certified-report action โดยไม่เรียก calculate/certify/publish
- loading, empty, retry, denied, module-disabled, privacy-denied และ partial-data states
- accessible confirm dialog, keyboard focus, screen-reader landmarks/status และ responsive sticky action bar พร้อม safe-area
- desktop/tablet/mobile layout ที่ไม่มี horizontal overflow และกำหนด visible interactive target อย่างน้อย 44 px
- error normalization สำหรับ non-JSON HTTP failure เพื่อแสดง partial state ภาษาไทยแทนการเงียบหรือแสดงข้อมูลเหมือนพร้อมใช้งาน

## ไฟล์ที่แก้ใน Phase 5

Runtime/presentation:

- `public/js/pages/admin-safety-vote-operations.js` (ใหม่)
- `public/js/pages/safety-vote-operations-model.mjs` (ใหม่)
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js`
- `public/style.css`
- `public/js/main.js` และ `index.html` (cache marker)

Verification/documentation:

- `backend/scripts/safety-vote-ux-phase5-static.test.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase5-browser-uat.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase5-browser-probe.js` (ใหม่)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (authenticated guarded UX5 routes/roles)
- `backend/scripts/safety-vote-ux-phase3-static.test.js` และ `backend/scripts/safety-vote-ux-phase4-static.test.js` (ยอมรับ cache chain รุ่น Phase 5 โดยยังตรวจ contract เดิม)
- `backend/package.json` และ root `package.json`
- `docs/safety-vote-ux-phase5-preflight-scope.md`
- เอกสารนี้และ `AGENTS.md`

## ผลทดสอบ

Static/unit/accessibility:

- Phase 5: PASS, 54 assertions
- Phase 4 regression: PASS, 50 assertions
- Phase 3 regression: PASS, 45 assertions
- Phase 2 regression: PASS, 43 assertions
- Phase 1 regression: PASS, 30 assertions
- JavaScript syntax และ `git diff --check`: PASS

Business/API regression:

- Safety Vote Phase 1–7 Node/PHP parity: PASS ทุก Phase
- Phase 5 parity ยืนยัน privacy/funnel/schedule/suppression/safe metadata/report hash/retention dry-run
- Phase 8.3.1 default-disabled/fail-closed Node/PHP parity: PASS
- existing guarded Phase 5 Node/PHP API lifecycle UAT: PASS ทั้ง operations, privacy, schedule, notification suppression, export/report hash, audit และ retention
- existing authenticated Phase 5 desktop/390 px browser UAT: PASS
- ไม่พบการแก้ route/API contract, migration, schema หรือ business-calculation file

Authenticated Browser UAT ของ UX Phase 5:

- Chrome, authenticated Admin/result-view-only/denied ที่ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`: PASS
- ทุก viewport: horizontal overflow = false; visible interactive target ต่ำกว่า 44 px = 0
- heading/role navigation/sticky action bar/accessible alert dialog/focus: PASS
- server privacy-threshold suppression แสดง “ปกปิด” 3 KPI ทุก viewport; ไม่พบ ballot choice, voter identifier, private audit detail หรือ blind identity ใน DOM
- secret-ballot organization analytics ได้ `403 SECRET_DIMENSION_FORBIDDEN` และแสดง privacy state โดยไม่หามิติทดแทน
- result-view-only แสดง partial capability และปิด manage/export actions หลัง `403`; denied และ module-disabled `503` แสดง fail-closed state
- notification preview แสดงเฉพาะจำนวนรวม, queue/export/schedule ทุก mutation ผ่าน explicit confirmation, export receipt แสดง SHA-256
- unexpected API errors = 0 และ browser runtime exceptions = 0 หลังแยก baseline jury-progress defect เป็น known partial state

Browser skill ถูกใช้เพื่อเริ่ม in-app Browser ตามข้อกำหนด แต่ controller ไม่สามารถสร้าง kernel assets ใน environment นี้ได้ และ troubleshooting channel ล้มด้วยสาเหตุเดียวกัน จึงใช้ guarded loopback Chrome/CDP fallback ของ repository เพื่อทำ UAT และเก็บหลักฐานถาวร

## หลักฐานและ residue

หลักฐานที่ยอมรับ: `backups/local/safety-vote-ux-phase5-1791466271326/`

- 10 PNG screenshots พร้อม `result.json` และ `result.sha256` รวม 12 ไฟล์
- SHA-256 ของ `result.json`: `7d4b8f486aa80306da4de05f52ed2359b33769c6bd8abf6fbcb66c07601747b2`
- mutation ledger หลัง confirmed actions: ballots 3 (ไม่เปลี่ยน), participation 4 (ไม่เปลี่ยน), identity mappings 0, notifications 11 (seed 4 + queue 7), reports 1, completed exports 1, certifications 0, due campaign เปลี่ยน Draft → Open ตาม schedule processor เดิม
- generated report file residue หลัง verification: 0
- guarded disposable database residue หลัง drop: 0
- evidence จากรอบ failed/obsolete ถูกลบ เหลือเฉพาะชุดที่ยอมรับข้างต้น

ไม่มีการเชื่อม Production, deploy, commit หรือ push และ `HEAD`/`origin/main` ยังเป็น `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`

## ข้อจำกัด

- Existing Node route `GET /admin/campaigns/:id/jury/progress` ตอบ `500` เมื่อมีข้อมูล เพราะ SQL ใน baseline เลือก `Status` แบบไม่ระบุ table ใน join ซึ่งเป็น ambiguous column; PHP มี query รูปแบบเดียวกัน การแก้ route/API อยู่นอก allowed scope ของ Phase 5 จึงแสดง “ข้อมูลบางส่วนไม่พร้อม” และคงส่วนอื่นให้ทำงานต่อ ข้อนี้ควรแก้เป็นงาน contract-preserving remediation แยกต่างหากก่อนใช้ jury progress จริง
- UX five-viewport browser UAT ใช้ Node fixture; PHP ถูกยืนยันด้วย parity และ guarded API lifecycle แต่ไม่ได้เปิด PHP browser surface ซ้ำทั้งห้า viewport
- notification queue ไม่ใช่หลักฐานการส่งสำเร็จ และหน้านี้ไม่เรียก dispatch transport
- aggregate export สร้างจาก Frozen/Certified/Published snapshot เดิมเท่านั้น; certified report ต้องใช้ Certified/Published และหน้านี้ไม่รับรองหรือประกาศผล
- ไม่ได้ทดสอบ Production, external notification transport หรือ real business account/data

## คำสั่งสำหรับ Safety Vote UX/UI Phase 6

```text
เริ่ม Safety Vote UX/UI Phase 6 — Result Review, Certification and Publication Workspace ต่อจาก `docs/safety-vote-ux-phase5-operations-analytics-result-readiness-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 5 diff, baseline jury-progress known issue, existing result calculate/freeze/snapshot/certifier/certify/publish/certified-report APIs, exact-hash binding, dual-control/SHE governance, result-visibility/privacy-threshold rules, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged หน้า Admin “ตรวจสอบและรับรองผล Safety Vote” และ certifier workspace พร้อม snapshot/readiness comparison ที่ไม่เปิดเผยข้อมูลต่ำกว่า threshold, calculation/freeze handoff ตาม ownership เดิม, certifier assignment/status, exact-result-hash review, accessible irreversible certify/publish confirmations, publication preview, privacy-safe audit receipt, loading/empty/retry/denied/partial states และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 โดยใช้ API/capability/schema เดิมเท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury/result calculation, certification contract, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 7
```
