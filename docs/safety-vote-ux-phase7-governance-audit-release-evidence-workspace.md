# Safety Vote UX/UI Phase 7 — Governance, Audit and Release Evidence Workspace

วันที่: 2026-10-08

สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE8`

Authoritative input baseline: `main` / `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5` plus the uncommitted, tested UX Phase 6 working tree

## ขอบเขตและการตัดสินใจก่อนแก้ Runtime

ผล read-only preflight อยู่ที่ `docs/safety-vote-ux-phase7-preflight-scope.md` โดยยืนยัน Phase 6 diff, source mapping, capability/ownership, Node/PHP parity, privacy-safe metadata และ rollback ก่อนเริ่มแก้ Runtime ดังนี้:

- ใช้เฉพาะ release-verification, acceptance-evidence, observability, integration catalog/provider, handoff preview/confirm และ release-preflight API เดิม
- SHE acceptance ต้องใช้ `SAFETY_VOTE_ADMIN`, exact confirmation `I ACCEPT SHE_OWNER <CampaignCode>` และ evidence reference; server เป็นผู้ตรวจและบันทึก SHA-256
- handoff preview ใช้ certified aggregate metadata เท่านั้นและระบุ `externalMutation=false`; confirmation ใช้ได้เฉพาะ fixture adapter และต้องตอบ `externalDelivery=false`
- release-preflight เดิมกำหนด `immutableSource=false`; UI จึงต้องแสดง `HOLD` และห้ามตีความว่าอนุญาต Production/deploy
- timeline ใช้เฉพาะ bounded acceptance evidence กับ privacy-safe receipt ของ session ปัจจุบัน ไม่อ่าน ballot choice, voter identity, answer, blind identity หรือ unrestricted audit payload
- `safetyVoteUxV1` ยังคง default OFF; rollback คือปิด flag/ถอด presentation entry โดยไม่ต้อง rollback schema หรือข้อมูล
- `module_enabled=0` ยังคงตอบ `503 SAFETY_VOTE_MODULE_DISABLED` ก่อน operational route ทุกเส้น

ไม่มีไฟล์ใน `backend/routes`, `api`, `backend/migrations` หรือ `shared` ถูกแก้ใน Phase นี้

## สิ่งที่ทำ

- เพิ่มทางเข้าจาก Admin Campaign Center ไปหน้า “ธรรมาภิบาลและหลักฐานการปล่อยใช้งาน Safety Vote” แบบ feature-flagged
- เพิ่ม full-width desktop evidence/master-detail layout, tablet/mobile responsive cards และ sticky action bar ที่รองรับ safe area
- เพิ่ม authoritative release-preflight checklist ที่ fail closed เป็น `HOLD` พร้อมข้อความชัดเจนว่าไม่เชื่อม Production และไม่ได้รับอนุญาตให้ deploy
- เพิ่ม stored/calculated SHA-256 comparison สำหรับ eligibility, result/certification และ private report โดยไม่เปิดเผย payload ที่ได้รับการคุ้มครอง
- เพิ่ม SHE acceptance status และ accessible typed-confirmation dialog ที่ต้องกรอก exact statement กับ evidence reference; ปิด action ซ้ำเมื่อมี active acceptance แล้ว
- เพิ่ม privacy-safe observability/alert summary และ bounded evidence timeline
- เพิ่ม aggregate integration handoff preview ที่ไม่ mutate external system และ fixture-only explicit confirmation พร้อม receipt ที่ยืนยัน `externalDelivery=false`
- เพิ่ม loading, empty, retry, denied, module-disabled และ partial-capability states โดยไม่ทำให้ข้อมูล missing ดูเหมือนผ่าน
- เพิ่ม presentation model แยก normalize release verification, acceptance, preflight, observability, catalog, preview และ timeline เพื่อให้ fail-closed ทดสอบได้

## ไฟล์ที่แก้

Runtime/presentation:

- `public/js/pages/admin-safety-vote-governance.js` (ใหม่)
- `public/js/pages/safety-vote-governance-model.mjs` (ใหม่)
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js`
- `public/js/main.js`
- `public/style.css`
- `index.html`

Local verification/documentation:

- `backend/scripts/safety-vote-ux-phase7-static.test.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase7-browser-uat.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase7-browser-probe.js` (ใหม่)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js`
- `backend/scripts/safety-vote-ux-phase3-static.test.js`
- `backend/scripts/safety-vote-ux-phase4-static.test.js`
- `backend/scripts/safety-vote-ux-phase5-static.test.js`
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase7-preflight-scope.md`
- เอกสารนี้และ `AGENTS.md`

## ผลทดสอบ

Static/unit/accessibility/scope:

- UX Phase 7: PASS — 59 assertions
- UX Phase 6/5/4/3/2/1 regression: PASS — 58/54/50/45/43/30 assertions
- JavaScript syntax และ `git diff --check`: PASS
- protected-scope inspection: PASS — ไม่มี route/API/migration/shared contract diff

Business/API regression:

- Safety Vote Phase 1–7 Node/PHP parity: PASS ทุก Phase
- Phase 8.3.1 default-disabled/fail-closed Node/PHP parity: PASS
- Existing guarded Phase 7 Node/PHP lifecycle: PASS ทั้งสอง stack ครอบคลุม read-only adapters, hash verification, explicit fixture handoff และ SHE-governed release-preflight HOLD

Authenticated Browser UAT:

- Guarded local Chrome ผ่าน Admin, audit-view-only และ denied role รวม module-disabled flow
- ผ่านครบ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`
- horizontal overflow = false ทุก viewport
- visible interactive target ต่ำกว่า 44 px = 0 ทุก viewport
- heading, role navigation, typed confirmation, focus, sticky action bar และ production-denied semantics: PASS
- immutable checksum review, exact SHE acceptance, privacy-safe timeline, no-external preview และ fixture-only confirmation: PASS
- audit-view-only partial `403`, permission denial และ module-disabled `503`: PASS โดยอยู่ใน expected error set
- unexpected API errors = 0; browser runtime exceptions = 0

ใช้ Browser skill ตรวจ local held fixture ซ้ำโดยตรงใน in-app Chrome ที่ `390×844`; ผลคือ no overflow, bad touch target = 0, release decision = `HOLD` และ Production authorization = false สอดคล้องกับ guarded five-viewport Chrome/CDP matrix ของ repository

## หลักฐานและ residue

หลักฐานที่ยอมรับ: `backups/local/safety-vote-ux-phase7-1791473598403/`

- 11 PNG screenshots พร้อม `result.json` และ `result.sha256`
- SHA-256 ของ `result.json`: `b78b8079eb0a22a854869bdbaf3f68c624c20260cde3bc30293bfb3b16f2fd0b`
- UX mutation ledger: ballots 2, identity mappings 0, SHE acceptances 1, fixture handoffs 1, locally delivered fixture receipts 1, result snapshots 1, certifications 2, open alerts 1
- disposable database residue หลัง drop: 0; temporary private report residue: 0
- Browser profile ถูกลบหลังจบ; external delivery เป็น false และไม่มี Production connection
- ชุดหลักฐานทดสอบที่ถูกแทนที่สองชุดถูกลบหลังตรวจ exact path แล้ว และสร้างใหม่ได้ด้วยคำสั่ง UAT

`HEAD` และ `origin/main` ยังคงเป็น `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5` ระหว่างงาน Phase 7 นี้ ไม่มี deploy, commit หรือ push

## ข้อจำกัด

- authoritative release-preflight ยังคง `HOLD` เพราะ immutable source เป็น false; Phase 7 ไม่เปลี่ยน source state และไม่อนุญาต deployment
- integration confirmation เป็น local fixture adapter เท่านั้น แม้มี persisted handoff receipt ก็ไม่มี external dispatch จริง
- five-viewport Browser UAT ใช้ Node fixture; PHP ได้รับการยืนยันด้วย deterministic parity และ guarded API lifecycle แต่ไม่ได้เปิด browser surface ซ้ำทั้งห้า viewport
- audit-view-only role เห็น declared partial states สำหรับ endpoint ที่ต้องใช้ `SAFETY_VOTE_ADMIN` หรือ `SAFETY_VOTE_MANAGE`; UI ไม่ยกระดับสิทธิ์และไม่ตีความ `403` ว่าผ่าน
- baseline jury-progress ambiguous-column defect จาก Phase 5 ยังไม่ถูกแก้และ Phase 7 ไม่ได้พึ่งพา endpoint ดังกล่าว
- ไม่ได้ทดสอบ Production, real business account/data หรือ real external integration adapter

## คำสั่งสำหรับ Safety Vote UX/UI Phase 8

```text
เริ่ม Safety Vote UX/UI Phase 8 — Integrated Journey, Accessibility and Release Candidate Closeout ต่อจาก `docs/safety-vote-ux-phase7-governance-audit-release-evidence-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 7 diff, Admin/User/Juror end-to-end routes, existing API/capability contracts, privacy/result visibility, immutable release evidence, rollback และ outstanding baseline limitations แบบ read-only แล้วทำเฉพาะ feature-flagged integration/polish ของ navigation และ state consistency ตลอด journey Admin Campaign Center → creation/readiness → User participation → Juror scoring → Operations → result/certification/publication → governance evidence พร้อม cross-role deep links, consistent loading/empty/retry/denied/partial/module-disabled states, keyboard/focus/screen-reader semantics, responsive action hierarchy และ release-candidate evidence summary โดยใช้ API/capability/schema เดิมเท่านั้น ห้ามสร้าง voting engine หรือ endpoint ใหม่ ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury/result calculation, certification, result visibility, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้ามส่ง external integration จริง ห้าม deploy ห้าม commit และห้าม push ให้ทดสอบ static/unit/regression และ authenticated end-to-end Browser UAT แยก Admin/User/Juror/audit-view-only/denied ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 พร้อมตรวจ no horizontal overflow, 44px touch targets, keyboard/focus/screen-reader semantics, privacy leakage, permission denial, feature OFF parity, module-disabled fail-closed, performance budget และ zero disposable-data residue เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผลทดสอบ หลักฐาน ข้อจำกัด candidate manifest และคำสั่งแยกสำหรับ commit/push หรือ Phase 9 โดยต้องคง release decision เป็น HOLD จนกว่า immutable source และ release gate ที่มีอำนาจจะยืนยันผ่านจริง
```
