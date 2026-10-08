# Safety Vote UX/UI Phase 2 — Campaign Creation and Readiness Workspace

Date: 2026-10-08 (Asia/Bangkok)
Decision: `LOCAL_UX_PHASE2_PASS — FEATURE_DEFAULT_OFF — NO_PRODUCTION_CHANGE`

## Scope and baseline

- Authoritative repository/branch/commit remained `C:\Users\User\TSH-SAFETY-CORE-APP`, `main`, `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`; `HEAD`, `main` and `origin/main` matched at closeout.
- Phase 1 remained intentionally uncommitted. Its rollback stash remains `stash@{0}: pre-origin-main-merge-safety-vote-ux-phase0-phase1-20261008` and was not applied or changed.
- The read-only gate verified the Phase 1 diff, create/update/readiness APIs, campaign-type capability mapping, schema ownership and rollback before Phase 2 Runtime edits. The exact allowed/excluded scope is recorded in `docs/safety-vote-ux-phase2-preflight-scope.md`.
- `safetyVoteUxV1` remains a strict opt-in (`=== true`). Flag OFF continues to call the legacy renderers. Server `module_enabled=0` remains default disabled and fail-closed; the Phase 2 UI performs no campaign read in that state.

## Delivered behavior

- Added six production-labelled campaign templates: Survey, Popular Vote, Secret Election, Submission Challenge, Nomination and Jury Scoring.
- Added an eight-step responsive creation flow: campaign type, general details, privacy, content/options/candidates/submission requirements, eligibility, schedule, results visibility and review/open.
- Added serialised autosave states (`dirty`, `saving`, `saved`, recoverable `error`) with optimistic `rowVersion` updates. Navigation and eligibility preview wait for pending autosave to prevent concurrent version conflicts.
- Added per-step validation summary with focus movement, readiness checklist, responsive progress/step navigation, a safe-area-aware sticky action bar and accessible confirmation dialogs.
- Added User and Juror presentation previews through a shared escaped component, and separately exercised the authenticated real User and Juror routes in Browser UAT.
- Reused only existing create/update, builder, eligibility preview/freeze and lifecycle/open APIs. The server remains the authoritative open-readiness gate.
- Survey and Popular Vote can open after common readiness passes. Secret Election, Submission Challenge, Nomination and Jury Scoring remain conservatively blocked from direct wizard opening and route to the existing advanced workspace for their type-specific setup.
- After an eligibility snapshot is frozen, moving to the next step does not rewrite its rules. Any explicit rule edit clears local readiness and requires a new preview/freeze cycle.

## Files changed for Phase 2

Runtime presentation:

- `public/js/pages/safety-vote-campaign-wizard.js` — wizard orchestration, autosave, validation, preview, readiness and confirmations.
- `public/js/pages/safety-vote-wizard-model.mjs` — pure templates, type capabilities, validation, readiness and existing-API payload mapping.
- `public/js/pages/safety-vote-ux-components.js` — shared escaped User/Juror campaign preview; existing confirm dialog reused.
- `public/js/pages/admin-safety-vote-ux1.js` — launch/return integration from “จัดการ Safety Vote”.
- `public/style.css` — scoped responsive wizard, preview, accessibility and action-bar styles.
- `public/js/pages/admin.js`, `public/js/main.js`, `index.html` — cache-marker updates only.

Local verification and documentation:

- `backend/scripts/safety-vote-ux-phase2-static.test.js`
- `backend/scripts/safety-vote-ux-phase2-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase2-browser-probe.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` — guarded test host only.
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase2-preflight-scope.md`
- this report and the Phase 2 entry in `AGENTS.md`
- `backups/local/safety-vote-ux-phase2-1791462675106/`

No file under `backend/routes`, `api`, `backend/migrations` or `shared` changed. No Node/PHP contract, migration or schema was added or modified.

## Verification results

| Gate | Result |
|---|---|
| Phase 2 static/unit/accessibility/scope | PASS — 43 assertions |
| Phase 1 UX regression | PASS — 30 assertions |
| Phase 1–7 Node/PHP contract parity | PASS — all seven phases |
| Phase 8.3.1 disabled-mode Node/PHP parity | PASS |
| JavaScript syntax and `git diff --check` | PASS |
| Protected-scope diff (`backend/routes`, `api`, migrations, `shared`) | PASS — empty |
| Authenticated Browser UAT | PASS — Admin/User/Juror × five required viewports |
| Browser console errors / unexpected 5xx | 0 / 0 |
| Horizontal overflow / sub-44 px actionable targets | 0 / 0 in all 15 combinations |
| Permission denied and `module_enabled=0` fail-closed | PASS |

Authenticated Browser UAT covered `390×844`, `430×932`, `768×1024`, `1366×768` and `1920×1080`. Each Admin viewport completed a real API-backed creation lifecycle through validation, autosave, builder save, eligibility preview, accessible freeze confirmation, frozen snapshot, readiness, User/Juror previews, accessible open confirmation and server-authoritative open transition.

The guarded mutation ledger before teardown was exactly:

- wizard campaigns: 5, all `Open`;
- questions: 5;
- frozen eligibility snapshots: 5;
- ballot + participation + jury score + certification + result rows: 0.

The disposable loopback database was dropped and `INFORMATION_SCHEMA` confirmed zero database residue. No network delivery, external provider or Production connection was used.

## Evidence

- Machine-readable result: `backups/local/safety-vote-ux-phase2-1791462675106/result.json`
- Result SHA-256: `86b18662463b44f749a2f62275deb851a6e37a7255f6d0dc5bd52627c660c079`
- Visual evidence: 22 PNG files covering the five Admin wizard previews, five Juror previews, authenticated User/Juror routes, permission denial and module-disabled state.

## Invariants and limitations

- Ballot immutability, privacy storage/separation, eligibility evaluation/freeze, jury scoring, certification and result calculation were not changed.
- No Production connection, deploy, commit or push occurred.
- Advanced type-specific setup is intentionally not recreated in the wizard. Secret Election, Submission Challenge, Nomination and Jury Scoring must finish through the existing advanced workspace.
- The in-app Browser controller remained unavailable because its local kernel assets could not initialize. UAT therefore used the repository’s guarded loopback Chrome/CDP fallback with disposable authentication fixtures. This does not use a Production session.
- Visual UAT proves current Chromium behavior; Safari/iOS hardware and a manual assistive-technology pass remain separate release activities.

## Copy-ready command for Safety Vote UX/UI Phase 3

> เริ่ม Safety Vote UX/UI Phase 3 — User Participation and Ballot Review Workspace ต่อจาก `docs/safety-vote-ux-phase2-campaign-creation-readiness-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 2 diff, existing User participation/answer/ballot/receipt APIs, eligibility and campaign-state guards, privacy-mode response contract, submission idempotency และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged หน้า “กิจกรรมของฉัน” และ participation workspace ที่ปรับตาม campaign type สำหรับ survey, popular vote, secret election, submission challenge และ nomination พร้อม eligible/ineligible/upcoming/closed/already-submitted/loading/retry/denied states, campaign detail/privacy/editability notice, 44px selection controls, portrait/landscape gallery และ keyboard-accessible viewer, validation summary, review-before-submit, accessible immutable-submit confirm dialog, duplicate-submit protection UI, success receipt ที่ไม่แสดงตัวเลือกสำหรับ secret ballot และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ให้ใช้ API/capability/schema เดิมเท่านั้น ห้ามเปลี่ยน ballot immutability, privacy separation, eligibility freeze, jury scoring, certification, result calculation, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 4
