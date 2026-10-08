# Safety Vote UX/UI Phase 1 — Responsive Shell and Admin Campaign Center

Date: 2026-10-08 (Asia/Bangkok)

Contract: `2026-10-08-safety-vote-ux1-r1`

Decision: `LOCAL_UX_PHASE1_PASS — FEATURE_DEFAULT_OFF — NO_PRODUCTION_CHANGE`

## Outcome

Phase 1 is complete on authoritative baseline `main` commit `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`. The new presentation is a strict opt-in through `window.__TSH_FEATURE_FLAGS__.safetyVoteUxV1 === true`; without that exact value, the existing Safety Vote UI is rendered unchanged. The existing server-side `module_enabled` control remains authoritative and default disabled/fail-closed.

The implementation adds the responsive Admin “จัดการ Safety Vote” center, KPI/search/filter/sort views, desktop table/master-detail, tablet campaign drawer, mobile cards, role-aware User/Juror navigation, campaign-type adaptive workspace navigation, Thai production wording and reusable state/action components. It changes no Safety Vote API, schema, migration or business rule.

## Preflight and protected boundary

The read-only entry gate is recorded in `docs/safety-vote-ux-phase1-preflight-scope.md`. It confirms:

- Admin route: Admin System Console `safety-vote-foundation`;
- User route: `#safety-vote`;
- Juror route: assignment-scoped workspace inside `#safety-vote`;
- Node source: `backend/routes/safety-vote.js` and Phase 2–7 routers;
- PHP source: `api/handlers/safety_vote*.php` and `api/lib/safety_vote_*`;
- server-side permissions and assignment scope remain authoritative;
- schema remains owned only by explicit Phase 1–7 migrations; and
- disabling the UX flag rolls back to the legacy UI without data mutation, while `module_enabled=0` prevents operational campaign calls.

Final diff inspection found no changes under `backend/routes`, `api`, `backend/migrations` or `shared`.

## Implemented UX

- Full-width Admin operational header and Thai production copy.
- KPI: ฉบับร่าง, กำลังเปิด, ใกล้ปิดใน 72 ชม. and ปิดแล้ว.
- Search, deterministic sorting and Active/Draft/Scheduled/Completed/Archived views.
- Desktop campaign table with master-detail; mobile campaign cards; tablet modal drawer.
- Type-adaptive workspace sections: Survey hides Jury; judged/submission/award types expose the applicable review/Jury sections.
- Explicit loading skeleton, empty result, retry, permission denied, schema readiness and module-disabled states.
- Shared Thai status badges with non-color accessible labels, responsive action bar, empty state and focus-managed confirm dialog.
- User/Juror role navigation uses server-returned assignments; it does not infer authorization from client role labels.
- Existing deeper Phase 1–8 workspace remains available behind the Phase 1 shell, preserving all current actions and contracts.

## Files changed in Phase 1

Runtime presentation:

- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/safety-vote-ux-model.mjs`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/pages/admin.js`
- `public/js/main.js`
- `public/style.css`
- `index.html`

Local verification:

- `backend/scripts/safety-vote-ux-phase1-static.test.js`
- `backend/scripts/safety-vote-ux-phase1-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase1-browser-probe.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js`
- `backend/package.json`
- `package.json`

Documentation:

- `docs/safety-vote-ux-phase1-preflight-scope.md`
- `docs/safety-vote-ux-phase1-responsive-admin-campaign-center.md`
- `AGENTS.md`

The pre-existing untracked Phase 0 contract and historical baseline HOLD report were preserved. The pre-merge safety stash remains available and unchanged.

## Verification

- JavaScript syntax: PASS for all new/changed Phase 1 modules and test scripts.
- `git diff --check`: PASS (newline normalization warnings only).
- Static/unit/accessibility/scope contract: PASS, 30 assertions.
- Node/PHP parity regression: Phase 1, 2, 3, 4, 5, 6 and 7 all PASS.
- Phase 8.3.1 disabled-mode Node/PHP gate: PASS.
- Authenticated local Chrome UAT: PASS for Admin, User and Juror at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080 (15 role/viewport combinations).
- Browser assertions: zero horizontal overflow; every visible interactive target at least 44×44 px; role landmarks/headings/status labels; adaptive Jury navigation; mobile cards; tablet drawer; desktop table/master-detail; dialog focus/Escape behavior; denied and module-disabled states.
- Browser health: zero Runtime console errors and zero unexpected HTTP 5xx.
- Disposable database cleanup: zero residue after the final run and after both defect-discovery reruns.
- Protected logic diff: zero files changed under Node/PHP APIs, migrations or shared contracts.

Accepted evidence: `backups/local/safety-vote-ux-phase1-1791461607095/` (20 PNG screenshots plus `result.json`).

## Limitations

- The presentation flag is intentionally OFF in normal Runtime. Authorized local/test environments must set `window.__TSH_FEATURE_FLAGS__.safetyVoteUxV1=true`; Production enablement is not part of this phase.
- The in-app Browser controller could not initialize because its local kernel assets were unavailable. The accepted run therefore used the repository’s guarded headless Chrome/CDP fallback against loopback-only authenticated fixtures.
- Phase 1 does not redesign the full legacy campaign editor, ballot flow or complete Juror score sheet. The shell links to the preserved existing workspace.
- KPI “ใกล้ปิด” enriches at most 25 currently open rows missing close-time fields from the list response; no API contract was changed.
- No Production connection, deployment, commit or push occurred.

## Rollback

Set or leave `window.__TSH_FEATURE_FLAGS__.safetyVoteUxV1` to any value other than boolean `true`. The wrapper immediately renders the legacy UI. Keep `module_enabled=0` to fail closed at the server. No database rollback, deletion or migration is needed.

## Copy-ready command for Safety Vote UX/UI Phase 2

> เริ่ม Safety Vote UX/UI Phase 2 — Campaign Creation and Readiness Workspace ต่อจาก `docs/safety-vote-ux-phase1-responsive-admin-campaign-center.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 1 diff, existing create/update/readiness APIs, campaign-type capability mapping และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged แม่แบบสร้างแคมเปญและ wizard 8 ขั้น ได้แก่ ประเภทแคมเปญ, ข้อมูลทั่วไป, ความเป็นส่วนตัว, เนื้อหา/ตัวเลือก/ผู้สมัคร/ข้อกำหนดผลงาน, ผู้มีสิทธิ์, กำหนดเวลา, การแสดงผล และตรวจสอบก่อนเปิด พร้อม autosave states, validation summary, real User/Juror preview, readiness checklist, accessible confirm dialog และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ให้ใช้ API/capability/schema เดิมเท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification, result calculation, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 3
