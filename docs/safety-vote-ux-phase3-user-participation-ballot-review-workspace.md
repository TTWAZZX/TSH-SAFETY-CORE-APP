# Safety Vote UX/UI Phase 3 — User Participation and Ballot Review Workspace

Date: 2026-10-08 (Asia/Bangkok)
Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE4`
Authoritative baseline: `main` / `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`

## Outcome

Phase 3 adds a feature-flagged responsive User participation experience without changing Safety Vote Phase 1–8 business logic. `safetyVoteUxV1` remains strict opt-in (`=== true`), its default remains OFF, and the existing server `module_enabled` operational gate remains fail-closed.

The new presentation provides:

- “กิจกรรมของฉัน” with eligible-only campaign cards, search and Open/Submitted/Closed views.
- Role-aware User/Juror navigation; the existing Juror workspace remains the destination for assigned evaluations.
- Campaign-adaptive participation for survey/popular vote/secret election, submission challenge, nomination and award contracts.
- Existing choice, rating, text, picker, date/time, file, ranking, allocation/token and matrix question types, including display conditions.
- Focused validation summary, review-before-submit and an accessible immutable-submit confirmation dialog.
- In-flight duplicate protection, stable ballot idempotency key across an explicit retry and retained submission draft identity after create.
- Privacy-safe receipts that never repeat answers. A secret-ballot receipt exposes acceptance only and cannot locate a ballot.
- Loading, empty, retry, denied, module-disabled and already-submitted states, responsive sticky actions and keyboard-safe private-image gallery.

## Read-only preflight

The preflight is recorded in `docs/safety-vote-ux-phase3-preflight-scope.md`. It confirmed:

- `GET /safety-vote/me/campaigns` and `GET /safety-vote/campaigns/:id` remain the authoritative participation/read contract.
- Eligibility and `canSubmit` remain server-authoritative and tied to the frozen eligibility snapshot and campaign state.
- General ballot submission retains the existing request-key replay/conflict and immutable participation contract.
- Secret election retains `accepted_only`, `canLocateBallot=false`, no identity mapping and opaque receipt behavior.
- Submission and nomination use their existing lifecycle endpoints and duplicate guards.
- Node/PHP participation and privacy contracts remain unchanged.
- Rollback is flag OFF; no schema/data rollback is needed for this presentation-only phase.

## Changed files in Phase 3 scope

Runtime presentation:

- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/pages/safety-vote-participation-model.mjs` (new)
- `public/style.css` (Phase 3 scoped styles appended)
- `public/js/main.js` and `index.html` (cache marker only)

Local verification and closeout:

- `backend/scripts/safety-vote-ux-phase3-static.test.js` (new)
- `backend/scripts/safety-vote-ux-phase3-browser-uat.js` (new)
- `backend/scripts/safety-vote-ux-phase3-browser-probe.js` (new)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (guarded test-only authenticated route)
- `backend/package.json` and root `package.json` (Phase 3 verification commands)
- `docs/safety-vote-ux-phase3-preflight-scope.md`
- this report and `AGENTS.md`

No changed path exists under `backend/routes`, `api`, `backend/migrations` or `shared`.

## Verification

Static/unit/accessibility:

- Phase 3 contract: PASS, 45 assertions.
- Phase 2 regression: PASS, 43 assertions.
- Phase 1 regression: PASS, 30 assertions.
- JavaScript syntax and `git diff --check`: PASS.

Safety Vote business-contract regression:

- Phase 1 Node/PHP parity: PASS.
- Phase 2 Node/PHP parity: PASS.
- Phase 3 Node/PHP parity: PASS across 15 question types, conditional display, privacy blocks, encryption interoperability and accepted-answer immutability.
- Phase 4 Node/PHP parity: PASS.
- Phase 5 Node/PHP parity: PASS.
- Phase 6 Node/PHP parity: PASS.
- Phase 7 Node/PHP parity: PASS.
- Phase 8.3.1 module-disabled Node/PHP parity: PASS.

Authenticated local Browser UAT:

- Chrome, authenticated User flows at `390×844`, `430×932`, `768×1024`, `1366×768` and `1920×1080`: PASS.
- No horizontal overflow and no visible interactive target below 44 px at every viewport.
- Accessible headings/role navigation, focusable validation summary, alert-dialog semantics/focus and receipt accessibility: PASS.
- Browser-adaptive paths exercised: popular vote, secret election, submission challenge and nomination.
- Review-before-submit and immutable confirmation: PASS.
- Exact request replay returned the same receipt with `replayed=true`; changed payload with the same key returned `409 IDEMPOTENCY_CONFLICT`: PASS at all five viewports.
- Permission denial and `module_enabled=0` fail-closed state: PASS. The latter produced only expected `503` responses.
- Unexpected API 5xx and browser exceptions: zero.

Evidence: `backups/local/safety-vote-ux-phase3-1791463635656/`

- 13 PNG screenshots plus `result.json` and `result.sha256`.
- `result.json` SHA-256: `3ee5ed48d6246007ca654170ac908cab0635a8ecf119c85b6d9139cdef65db6c`.

## Mutation and residue ledger

The accepted run used one guarded loopback-only disposable database:

- ballots: 6 (five identified popular-vote ballots and one secret ballot)
- participation rows: 6
- request-key rows: 6
- identified ballot identity rows: 5
- secret-ballot identity rows: 0
- jury scores + certifications + result snapshots: 0
- exact replay and changed-payload conflict created no duplicate ballot or participation
- disposable database residue after cleanup: 0

No Production connection, deployment, commit or push occurred. No migration or schema was created or changed.

## Limits

- Browser UAT targets the Phase 3 User surface. Admin/Juror responsive coverage remains the accepted Phase 2 evidence; their underlying contracts passed the Phase 1–7 and disabled-mode regressions again in this closeout.
- Browser coverage exercises four representative adaptive types. Survey shares the generic question renderer; award shares the existing nomination workflow. Their mappings are covered statically but were not submitted in Browser UAT.
- Submission Challenge has no server request-key contract. The UI prevents concurrent requests and retains a successfully created draft for submit retry, but cannot prove the result of a transport failure before the create response arrives; it therefore does not auto-retry an ambiguous create.
- The in-app Browser controller could not initialize its kernel assets in this environment. Authenticated UAT used the repository’s guarded loopback Chrome/CDP fallback and captured durable evidence above.

## Command for Safety Vote UX/UI Phase 4

```text
เริ่ม Safety Vote UX/UI Phase 4 — Juror Assignment and Scoring Workspace ต่อจาก `docs/safety-vote-ux-phase3-user-participation-ballot-review-workspace.md` และ `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยคง `safetyVoteUxV1` default OFF และ `module_enabled` fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 3 diff, existing jury assignment/detail/score/submit/recuse APIs, blind-mode contract, conflict-of-interest guards, scoring validation, immutable submission/reopen ownership, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged หน้า “งานประเมินของฉัน” และ Juror scoring workspace ที่ปรับตาม campaign/stage พร้อม assignment status/progress, blind candidate presentation, criteria scoring, local autosave state, validation summary, review-before-submit, accessible immutable-submit/recusal dialogs, privacy-safe receipt และ responsive sticky action bar ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 โดยใช้ API/capability/schema เดิมเท่านั้น ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury calculation, certification, result calculation, Node/PHP contracts, migration หรือ schema ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผล static/unit/regression/authenticated Browser UAT หลักฐาน residue ข้อจำกัด และคำสั่งสำหรับ Safety Vote UX/UI Phase 5
```
