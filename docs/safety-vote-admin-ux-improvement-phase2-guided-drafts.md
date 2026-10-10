# Safety Vote Admin UX Improvement — Phase 2 Guided Campaign Creation and Draft Management

Date: 2026-10-10

Status: `PASS_LOCAL_UAT_NO_PRODUCTION_NO_DEPLOY_NO_COMMIT_NO_PUSH`

## Objective

ทำให้การเริ่มแคมเปญ การกลับมาแก้ Draft การตรวจความพร้อม และการนำภาพประชาสัมพันธ์กลับมาใช้ซ้ำเป็นงานที่มีขั้นตอนชัดเจน โดยใช้ Safety Vote API/capability/schema ที่มีอยู่และไม่เปลี่ยน Voting Engine, ballot immutability, privacy, eligibility freeze, jury scoring, certification หรือ result calculation

## Read-only contract findings

- Existing Phase 9B Node/PHP routes รองรับ planning overview, reusable templates, config-only copy, campaign-scoped private assets และ guarded promotion asset attach อยู่แล้ว
- Config-only copy ตัด files/media, frozen eligibility, employee-specific rules, participation, ballots, answers, jury data, results, certifications และ notification history ออก
- Campaign Draft มี audited `DELETE /admin/campaigns/:id` ที่เปลี่ยนสถานะเป็น `Voided` เฉพาะ Draft; ไม่มี Campaign Draft archive contract
- Promotion asset attach ตรวจ same campaign, current version, active private image และ alternative text ก่อนใช้งาน
- `module_enabled`, `safetyVoteUxV1`, `safetyVoteEngagementV1` และ `engagement_enabled` ยังคง fail-closed ตาม baseline

## Implemented scope

- เพิ่ม creation launcher ที่เลือกได้ทั้ง 6 รูปแบบมาตรฐานและ reusable templates ของทีม
- Config-only duplicate เปิดข้อมูลใน Wizard ให้ผู้ดูแลตรวจแก้ก่อน ไม่สร้าง Campaign row ทันที
- สำเนาได้รับ Campaign code ใหม่เมื่อบันทึกครั้งแรก และล้างกำหนดเวลา/eligibility freeze เดิม
- เพิ่ม session-scoped Draft recovery อายุไม่เกิน 24 ชั่วโมง พร้อมปุ่มกู้คืนหรือไม่ใช้ข้อมูลที่กู้คืน
- เพิ่ม `beforeunload` และ in-app navigation guard สำหรับข้อมูลที่ยังไม่บันทึก พร้อม cleanup listener เมื่อออกจาก Wizard
- เพิ่ม readiness progress และข้อมูลแก้ไขล่าสุดในรายการ, detail และ Wizard
- เพิ่มเลือก Draft รายรายการ/เลือกทั้งหมด และ bulk void พร้อมเหตุผล, explicit confirmation, per-item Audit และ partial-failure summary
- เพิ่ม campaign-scoped Promotion media library พร้อม private preview และเลือกใช้ซ้ำแยก Desktop/Mobile ผ่าน guarded attach API
- คง image upload precedence: หากเลือกไฟล์ใหม่ ไฟล์ใหม่จะชนะ asset ที่เลือกจากคลังใน slot เดียวกัน
- เพิ่ม responsive/modal/focus-trap/touch-target styling สำหรับ desktop, tablet drawer และ mobile cards

## Phase 2 files

- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-campaign-wizard.js`
- `public/js/pages/admin.js`
- `public/style.css`
- `index.html`
- `backend/package.json`
- `backend/scripts/safety-vote-admin-guided-drafts-static.test.js`
- `backend/scripts/safety-vote-admin-guided-drafts-browser-uat.js`
- `docs/safety-vote-admin-ux-improvement-phase2-guided-drafts.md`

The uncommitted worktree also still contains the Phase 1 files listed in `docs/safety-vote-admin-ux-simplification-phase1.md`.

## Verification

- Phase 2 guided Drafts static/contract: PASS, 32 assertions
- Phase 1 Admin simplification: PASS, 20 assertions
- UX Phase 8: PASS, 48 assertions
- UX Phase 9A: PASS, 29 assertions
- UX Phase 9B: PASS, 44 assertions
- UX Phase 9C static + PHP/Node contract: PASS, 49 assertions total in the current suite
- Phase 10.3 static: PASS
- Phase 10.4 static + Node/PHP parity: PASS, 26 assertions
- Phase 1 Node/PHP fixture parity/private-file lifecycle: PASS
- Phase 8.3.1 disabled-mode Node/PHP parity: PASS
- JavaScript syntax and `git diff --check`: PASS

Authenticated Local Browser UAT passed at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080.

- Creation launcher and 6 built-in templates: PASS
- Reusable template entry: PASS
- Config-only duplicate preview before persistence: PASS
- Draft readiness/selection/bulk confirmation: PASS
- Promotion private asset library surface: PASS
- Horizontal overflow: 0
- Visible interactive targets below 44 px: 0
- Console/page errors: 0
- Dialog semantics and keyboard activation: PASS
- Protected business rows created: ballots 0, answers 0, jury scores 0, certifications 0
- External notification delivery: 0

Accepted evidence: `backups/local/safety-vote-admin-guided-drafts-1791644610423/`

Result SHA-256: `9e938db467d614f63729cacb6a906df2cd6cbfd7142cf27f960fbd94c56aae6b`

## Residue and environment note

- Disposable UAT database count before shutdown: 0
- Temporary MariaDB process was shut down gracefully and its isolated data directory was removed
- Rejected-run evidence directories were removed; only the accepted PASS evidence remains
- Existing XAMPP MariaDB data directory was not modified, repaired or deleted. Its original InnoDB startup problem is separate from this Phase 2 code change
- No Production connection, deployment, commit or push occurred

## Limitations

- Bulk Draft `archive` was not invented because the authoritative contract has no Campaign Draft archive endpoint. Phase 2 therefore provides audited bulk `ยกเลิกร่าง`/Voided only
- Readiness shown in the list is a preliminary four-part guide; authoritative open eligibility/readiness checks remain on the server and in the Wizard
- Draft recovery uses `sessionStorage`, so it intentionally does not survive browser-session termination or synchronize across devices
- The browser fixture validated an empty Promotion asset library. Ownership/alt-text enforcement and attach behavior are additionally covered by Node/PHP contract assertions; no private image was uploaded during this UAT

## Suggested Phase 3 command

เริ่ม Safety Vote Admin UX Improvement Phase 3 — Review Queue, Ownership and Governance Timeline ต่อจาก `docs/safety-vote-admin-ux-improvement-phase2-guided-drafts.md` โดยตรวจ cumulative Phase 1–2 diff, existing campaign owner/capability, readiness, audit, notification planning และ Node/PHP parity แบบ read-only ก่อน แล้วทำเฉพาะ feature-flagged Admin review queue, campaign ownership/assignee display, review notes ที่ไม่เก็บข้อมูลบัตรลงคะแนน, readiness blocker drill-down, schedule-conflict summary, activity/governance timeline จาก Audit เดิม, contextual quick actions และ responsive detail drawer โดยใช้ API/schema เดิมหรือ additive engagement metadata เท่านั้น ห้ามสร้าง approval state จากการคาดเดาหากไม่มี authoritative contract ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification, result calculation หรือ external notification dispatch ให้ทดสอบ static/regression, Node/PHP parity และ authenticated Local Browser UAT ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ตรวจ no horizontal overflow, 44px touch targets, keyboard/focus/screen-reader semantics, permission/module/engagement fail-closed และ zero disposable residue ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ ผลทดสอบ หลักฐาน ข้อจำกัด และคำสั่ง Phase 4
