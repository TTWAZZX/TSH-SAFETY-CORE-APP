# Safety Vote Admin UX Simplification — Phase 1

Date: 2026-10-10

Status: `PASS_LOCAL_UAT_NO_DEPLOY_NO_COMMIT_NO_PUSH`

## Objective

ลดความรกของหน้า Admin Safety Vote โดยแยกงานประจำออกเป็นพื้นที่เฉพาะ และเพิ่มการจัดการ Campaign Draft กับ Promotion ที่เข้าใจง่าย โดยไม่เปลี่ยน Voting Engine, privacy, eligibility, jury, certification, result calculation, API contract, migration หรือ schema

## Implemented scope

- แยกหน้า Admin เป็น 4 พื้นที่: ภาพรวม, แคมเปญ, ป้ายประชาสัมพันธ์ และวางแผน/สื่อสาร
- ปรับภาพรวมเป็น task-oriented dashboard พร้อม KPI, งานของฉันวันนี้ และทางลัดสร้างงาน
- ย้ายการค้นหา/กรอง/เรียง/รายการแคมเปญออกจากภาพรวมไปยังพื้นที่แคมเปญ
- เพิ่มสถานะ `ยกเลิกแล้ว` ในรายการแคมเปญ
- เพิ่มปุ่ม `แก้ไขต่อ` สำหรับ Draft และเปิด Campaign Wizard ด้วยข้อมูลจริงจาก API เดิม
- เพิ่ม `ยกเลิกร่าง` ผ่าน existing void endpoint พร้อม reason dialog และเก็บรหัส/Audit ไว้ ไม่ hard delete
- ลด action clutter ใน Campaign detail เหลือ primary action และเมนู `เพิ่มเติม`
- แยก Promotion editor เป็น workspace เต็ม พร้อมรายการ, แก้ไข, เก็บถาวร และ confirmation
- เพิ่มคำแนะนำภาพ Desktop 1600×800 px (2:1, ขั้นต่ำ 1200×600) และ Mobile 1080×1350 px (4:5, ขั้นต่ำ 720×900)
- เพิ่ม client-side preview, ตรวจ type/ขนาดไฟล์/สัดส่วน/ความละเอียด และคำแนะนำ safe zone
- รักษา `module_enabled` และ engagement gate เดิม ไม่มีการ bypass permission

## Changed files

- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-campaign-wizard.js`
- `public/js/pages/admin.js`
- `public/style.css`
- `index.html`
- `backend/package.json`
- `backend/scripts/safety-vote-admin-simplification-static.test.js`
- `backend/scripts/safety-vote-ux-phase8-static.test.js`
- `backend/scripts/safety-vote-ux-phase9a-static.test.js`
- `backend/scripts/safety-vote-ux-phase9b-static.test.js`
- `backend/scripts/safety-vote-ux-phase9c-static.test.js`
- `docs/safety-vote-admin-ux-simplification-phase1.md`

## Verification

- Admin simplification static/contract: PASS, 20 assertions
- UX Phase 1: PASS, 30 assertions
- UX Phase 8: PASS, 48 assertions
- UX Phase 9A: PASS, 29 assertions
- UX Phase 9B: PASS, 44 assertions
- UX Phase 9C: PASS, 43 assertions
- Phase 10.3 static: PASS
- Phase 10.4 Node/PHP parity: PASS, 26 assertions
- Phase 1 Node/PHP fixture parity and private-file lifecycle: PASS
- Phase 8.3.1 disabled-mode Node/PHP parity: PASS
- JavaScript syntax and `git diff --check`: PASS

Authenticated read-only Local Browser UAT used the existing Admin session. Overview, Campaign workspace, Promotion list/editor and accessibility semantics were checked at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080.

- Horizontal overflow in the new Safety Vote surfaces: 0 at all five viewports
- Interactive targets under 44 px inside the new Campaign/Promotion surfaces: 0
- Workspace navigation exposes an accessible name and active `aria-current="page"`
- Keyboard Tab moved to the next form control with visible focus
- Promotion image recommendations and non-text guidance are exposed in the accessibility tree
- No form submit, Campaign mutation, Promotion mutation, upload, notification or external delivery occurred during Browser UAT

## Limitations

- The current Local authenticated dataset returned zero campaigns and zero promotions. Empty states and editor layout were verified in-browser; real Draft edit/void buttons are covered by static/API-contract tests but were not clicked against a business row.
- `ยกเลิกร่าง` is intentionally a reversible-governance style void action in the UI, not a physical database delete.
- Existing global Tailwind CDN warning and Johnny AI API error remain outside this Phase 1 scope.

## Suggested Phase 2 command

เริ่ม Safety Vote Admin UX Improvement Phase 2 — Guided Campaign Creation and Draft Management ต่อจาก `docs/safety-vote-admin-ux-simplification-phase1.md` โดยตรวจ Phase 1 diff และ API/capability contract แบบ read-only ก่อน แล้วทำเฉพาะ template chooser, duplicate config-only, Draft autosave/recovery, last-edited metadata, readiness progress, unsaved-change guard, bulk Draft archive/void ที่มี explicit confirmation และ Promotion media library/asset reuse โดยใช้ API/schema เดิมหรือ additive engagement schema เท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification หรือ result calculation ให้ทดสอบ static/regression, Node/PHP parity และ authenticated Local Browser UAT ครบ 5 viewports ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ ผลทดสอบ ข้อจำกัด และคำสั่ง Phase 3
