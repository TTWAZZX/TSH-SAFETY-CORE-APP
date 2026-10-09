# Safety Vote UX/UI Phase 8 — Read-only Preflight and Allowed Scope

วันที่: 2026-10-09 (Asia/Bangkok)

Authoritative baseline: `main` / `077c5977283a55756bdfcfe5dfb804e32f716aa8` (`Add Safety Vote UX result and governance workspaces`)

Origin verification: `origin/main` matched the authoritative baseline before Runtime edits.

Decision: `GO_FOR_UX_PHASE8_LOCAL_IMPLEMENTATION — RELEASE_REMAINS_HOLD — NO_PRODUCTION_CONNECTION`

## Read-only findings before Runtime edit

- `git status --short` contained one pre-existing unrelated local modification: `backend/scripts/patrol-checkin-v2.test.js`. It is excluded and must remain untouched.
- The committed Phase 7 diff from `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5` through the authoritative baseline contains the established presentation workspaces, fixture verification and reports. It did not authorize a Production release.
- Admin, User, Juror, audit-view-only, denied and module-disabled surfaces already use authenticated server routes. Role/campaign visibility remains server-owned.
- `safetyVoteUxV1` remains a strict opt-in presentation flag and defaults OFF. `module_enabled` remains independently default OFF and fail-closed.
- Ballot immutability, privacy separation, frozen eligibility, jury/result calculation, certification ownership, result visibility and immutable evidence remain owned by the existing Node/PHP contracts.
- Release preflight remains authoritative. Its immutable-source condition does not authorize Production; Phase 8 must preserve `HOLD`.
- Known baseline defect remains the Phase 5 jury-progress query with an ambiguous unqualified `Status` column when data exists. It is outside this presentation-only scope.
- Rollback is presentation-only: keep `safetyVoteUxV1` OFF or revert the Phase 8 frontend entries. No database or evidence rollback is required.

## Allowed file scope

Runtime/presentation:

- `public/js/pages/safety-vote-journey-model.mjs`
- `public/js/pages/safety-vote-ux-components.js`
- existing Safety Vote Admin/User/Juror/wizard/operations/results/governance presentation modules
- `public/js/main.js`, `public/js/pages/admin.js`, `index.html` for the cache chain only
- `public/style.css`

Local verification/documentation:

- Phase 8 static and guarded Browser UAT scripts
- existing Phase 3–7 static cache-marker assertions when needed for later-phase regression
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` only for guarded local Phase 8 pages/roles
- `backend/package.json`, root `package.json`, `AGENTS.md`
- Phase 8 report/candidate manifest and ignored evidence under `backups/local/`

Explicitly excluded:

- `backend/routes/**`
- `api/**`
- `backend/migrations/**`
- `shared/**`
- new schema, migration, endpoint, permission or inferred capability
- ballot, eligibility, privacy, scoring, result, certification or visibility behavior
- real external integration dispatch
- Production connection, deploy, commit and push

## Release rule

Missing data, `403`, `503`, unexpected `5xx`, failed checksum, absent acceptance or an unpassed authoritative release condition never means PASS. Phase 8 evidence may establish local UX readiness only. The release decision remains `HOLD — NOT AUTHORIZED FOR PRODUCTION DEPLOYMENT` until the authoritative immutable release gate passes independently.
