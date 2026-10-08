# Safety Vote UX/UI Phase 6 — Result Review, Certification and Publication Workspace

วันที่: 2026-10-08

สถานะ: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE7`

Authoritative input baseline: `main` / `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5`

## ขอบเขตและการตัดสินใจก่อนแก้ Runtime

ผล read-only preflight อยู่ที่ `docs/safety-vote-ux-phase6-preflight-scope.md` โดยยืนยัน source mapping, capability/ownership, Node/PHP parity, privacy/result-visibility boundaries และ rollback ก่อนเริ่มแก้ Runtime ดังนี้:

- ใช้เฉพาะ result snapshot, calculate/recount, freeze, certifier assignment, standard/secret certification, publication, published-result และ release-verification API เดิม
- certification ยังคงถูกผูกกับ exact result SHA-256 และ server ตรวจ campaign role/independent assignment ซ้ำทุกครั้ง
- Secret Election ใช้ `certify-secret` เท่านั้นและต้องมีผู้รับรองอิสระสองคน; ไม่มี fallback ไป single-certifier route
- หน้าเว็บไม่คำนวณผล ไม่เปลี่ยน ballot/answer/eligibility/jury score และไม่สร้าง result row เอง
- pre-publication comparison แสดงเฉพาะ snapshot metadata, state และ hash; ไม่อ่าน result rows, ballot choice, voter identity หรือ blind identity
- `safetyVoteUxV1` ยังคง default OFF; rollback คือปิด flag/ถอด entry presentation โดยไม่ต้อง rollback ข้อมูลหรือ schema
- `module_enabled=0` ยังคงตอบ `503 SAFETY_VOTE_MODULE_DISABLED` ก่อน operational read/write

ไม่มีไฟล์ใน `backend/routes`, `api`, `backend/migrations` หรือ `shared` ถูกแก้ใน Phase นี้

## สิ่งที่ทำ

- เพิ่มทางเข้าจาก Admin Campaign Center ไปหน้า “ตรวจสอบและรับรองผล Safety Vote” แบบ feature-flagged
- เพิ่ม full-width desktop snapshot master/detail, tablet/mobile responsive layout และ sticky action bar ที่รองรับ safe area
- เพิ่ม immutable snapshot comparison, calculation contract, reconciliation/quorum/tie readiness, result-row count แบบไม่เปิดเผยรายละเอียด และ exact SHA-256 แบบเต็ม
- เพิ่ม reasoned Secret Election recount และ standard calculation/freeze handoff ผ่าน API เดิม
- เพิ่ม accessible exact-hash + reason alert dialog ซึ่งปิดปุ่มยืนยันจนกว่าจะกรอก SHA-256 ตรงครบ 64 ตัวและมีเหตุผล
- เพิ่ม standard certification และ Secret Election dual certification พร้อม privacy-safe receipt; publication เปิดได้เมื่อ server ส่งสถานะ Certified เท่านั้น
- เพิ่ม published Secret Election preview โดยอ่านเฉพาะ existing authenticated published-result API หลัง server อนุญาตแล้ว
- เพิ่ม release-verification/SHE governance summary, loading, empty, retry, denied, module-disabled และ partial-capability states
- เพิ่ม Draft-only independent certifier assignment form ซึ่งใช้ Employee Master identifier และ route เดิม
- แก้ presentation model ให้การเลือก snapshot ที่ normalize แล้วไม่ทำ readiness metadata สูญหาย พร้อม regression assertion

## ไฟล์ที่แก้

Runtime/presentation:

- `public/js/pages/admin-safety-vote-results.js` (ใหม่)
- `public/js/pages/safety-vote-results-model.mjs` (ใหม่)
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js`
- `public/js/main.js`
- `public/style.css`
- `index.html`

Local verification/documentation:

- `backend/scripts/safety-vote-ux-phase6-static.test.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase6-browser-uat.js` (ใหม่)
- `backend/scripts/safety-vote-ux-phase6-browser-probe.js` (ใหม่)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js`
- `backend/scripts/safety-vote-ux-phase3-static.test.js`
- `backend/scripts/safety-vote-ux-phase4-static.test.js`
- `backend/scripts/safety-vote-ux-phase5-static.test.js`
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase6-preflight-scope.md`
- เอกสารนี้และ `AGENTS.md`

## ผลทดสอบ

Static/unit/accessibility/scope:

- UX Phase 6: PASS — 58 assertions
- UX Phase 5/4/3/2/1 regression: PASS — 54/50/45/43/30 assertions
- JavaScript syntax และ `git diff --check`: PASS
- protected-scope inspection: PASS — ไม่มี route/API/migration/shared contract diff

Business/API regression:

- Safety Vote Phase 1–7 Node/PHP parity: PASS ทุก Phase
- Phase 8.3.1 default-disabled/fail-closed Node/PHP parity: PASS
- Guarded Phase 6 Node/PHP API lifecycle: PASS ทั้งสอง stack รวม 20-voter concurrent immutable submit, separation, deterministic recount, dual certification, report และ revocation

Authenticated Browser UAT:

- Guarded local Chrome ผ่าน Admin, primary certifier, secondary certifier, result-view-only และ denied role
- ผ่านครบ `390×844`, `430×932`, `768×1024`, `1366×768`, `1920×1080`
- horizontal overflow = false ทุก viewport
- visible interactive target ต่ำกว่า 44 px = 0 ทุก viewport
- heading, role navigation, dialog semantics, focus, exact-hash re-entry, mismatched-hash blocking และ sticky action bar: PASS
- reasoned recount, two-person exact-hash certification, standard freeze/certify/publish และ published Secret Election preview: PASS
- pre-publication DOM ไม่พบ voter identifier, protected candidate label หรือ ballot choice
- partial capability, certification denial, `RESULT_VIEW` denial และ module-disabled `503`: PASS
- unexpected API errors = 0; browser runtime exceptions = 0

Browser skill ถูกใช้เพื่อเริ่ม in-app Browser และเรียก bootstrap troubleshooting ตามข้อกำหนด แต่ environment ไม่สามารถสร้าง kernel assets ได้ (`The system cannot find the path specified`) ทั้งสองครั้ง จึงใช้ guarded loopback Chrome/CDP fallback ของ repository ซึ่งเก็บ screenshot, semantic checks และ network/error evidence ครบถ้วน

## หลักฐานและ residue

หลักฐานที่ยอมรับ: `backups/local/safety-vote-ux-phase6-1791472485401/`

- 12 PNG screenshots พร้อม `result.json` และ `result.sha256`
- SHA-256 ของ `result.json`: `00ab9279c5ec4d3cdc6c3aec6be3fc736fa71a18541ad3b4a7e715ccf3bf8346`
- UX mutation ledger: ballots 2, participations 2, identity mappings 0, Secret snapshots 2 (seed 1 + reasoned recount 1), standard snapshots 1, certifications 3, recount actions 1
- disposable database residue หลัง drop: 0
- Browser profile ถูกลบหลังจบ; ไม่มี external delivery และไม่มี Production connection

`HEAD` และ `origin/main` ยังคงเป็น `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5` ระหว่างงาน Phase 6 นี้ ไม่มี deploy, commit หรือ push

## ข้อจำกัด

- five-viewport Browser UAT ใช้ Node fixture; PHP ได้รับการยืนยันด้วย deterministic parity และ guarded API lifecycle แต่ไม่ได้เปิด browser surface ซ้ำทั้งห้า viewport
- stage context ต้องใช้ `SAFETY_VOTE_MANAGE`; certifier ที่มีเฉพาะ `RESULT_VIEW/CERTIFY` จะเห็น declared partial state โดยยัง review/certify ตามสิทธิ์เดิมได้
- release verification ต้องใช้ `SAFETY_VOTE_AUDIT_VIEW`; หากไม่มีสิทธิ์ UI ไม่ตีความสถานะ missing ว่า “ผ่าน”
- standard result details ไม่ถูกดึงมา preview ใน Phase นี้ เพราะ existing generic published-result contract ไม่ได้เปิด route เดียวกับ Secret Election; หน้าแสดง metadata/hash และ receipt เท่านั้น
- baseline jury-progress ambiguous-column defect จาก Phase 5 ยังไม่ถูกแก้ เนื่องจาก route/API อยู่นอก allowed scope ของ Phase 6
- ไม่ได้ทดสอบ Production, real business account/data หรือ external integration adapter

## คำสั่งสำหรับ Safety Vote UX/UI Phase 7

```text
เริ่ม Safety Vote UX/UI Phase 7 — Governance, Audit and Release Evidence Workspace ต่อจาก `docs/safety-vote-ux-phase6-result-review-certification-publication-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 6 diff, existing release-verification, acceptance-evidence, observability, integration handoff preview/confirm, release-preflight APIs, SHE ownership, capability matrix, privacy-safe audit metadata, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged หน้า Admin “ธรรมาภิบาลและหลักฐานการปล่อยใช้งาน Safety Vote” พร้อม immutable evidence/checksum review, SHE acceptance status และ explicit acceptance confirmation ผ่าน API เดิม, privacy-safe audit timeline, integration handoff preview ที่ไม่ส่งออกภายนอก, fixture-only explicit handoff confirmation, observability/alert summary, release-preflight checklist, loading/empty/retry/denied/partial states และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 โดยใช้ API/capability/schema เดิมเท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury/result calculation, certification, result visibility, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้ามส่ง external integration จริง ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 8
```
