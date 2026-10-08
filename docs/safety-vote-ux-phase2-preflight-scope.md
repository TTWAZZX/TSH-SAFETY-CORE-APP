# Safety Vote UX/UI Phase 2 — Read-only preflight and allowed scope

Date: 2026-10-08 (Asia/Bangkok)

Decision: `GO_FOR_UX_PHASE2_LOCAL_IMPLEMENTATION`

## Baseline and Phase 1 integrity

- Authoritative repository/branch remains `C:\Users\User\TSH-SAFETY-CORE-APP`, `main`.
- Immutable upstream baseline remains `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`.
- Phase 1 is an intentionally uncommitted local presentation layer documented in `docs/safety-vote-ux-phase1-responsive-admin-campaign-center.md`.
- Phase 1 diff check found no changes in `backend/routes`, `api`, `backend/migrations` or `shared`; `git diff --check` passed before Phase 2 Runtime edits.
- Rollback remains strict flag-off: unless `window.__TSH_FEATURE_FLAGS__.safetyVoteUxV1 === true`, the legacy UI is rendered. Server `module_enabled=0` remains independently fail-closed.

## Existing API mapping used by the wizard

- Create draft: `POST /safety-vote/admin/campaigns` (`SAFETY_VOTE_CREATE`).
- Update draft with optimistic version: `PUT /safety-vote/admin/campaigns/:id` (`SAFETY_VOTE_MANAGE`).
- Read draft/rules: `GET /safety-vote/admin/campaigns/:id`.
- Read/write content: `GET|PUT /safety-vote/admin/campaigns/:id/builder`.
- Save/preview/freeze eligibility: `PUT .../eligibility/rules`, `POST .../eligibility/preview`, `POST .../eligibility/freeze`.
- Read frozen eligible total through the existing aggregate dashboard where needed: `GET .../dashboard`.
- Authoritative open readiness and state transition: `POST .../lifecycle/open`. The server still requires at least one active question and one frozen eligibility snapshot.
- No new endpoint, capability, contract, readiness rule, schema object or migration is introduced.

## Campaign-type capability mapping

- `survey`: survey question types; Jury/secret controls absent.
- `popular_vote`: choice content; no dual certification.
- `secret_election`: choice content plus secret-ballot privacy; final wizard blocks direct opening until existing advanced election setup is completed in the preserved workspace.
- `submission_challenge`: submission-oriented content; final wizard routes to the preserved advanced workspace before opening.
- `nomination`: nominee-oriented content; final wizard routes to the preserved advanced workspace before opening.
- `jury_scoring`: judged-contest presentation; final wizard routes to existing stage/criteria/assignment setup before opening.

Client readiness is advisory and conservative. It never overrides an API denial. Type-specific workflows outside the eight common steps remain in the existing Phase 1–8 workspace.

## Allowed Phase 2 file scope

Runtime presentation only:

- `public/js/pages/safety-vote-campaign-wizard.js` (new)
- `public/js/pages/safety-vote-wizard-model.mjs` (new)
- `public/js/pages/safety-vote-ux-components.js` (shared preview/dialog primitives only)
- `public/js/pages/admin-safety-vote-ux1.js` (launch/return integration only)
- `public/style.css` (scoped wizard responsive/accessibility styles only)
- cache markers in `public/js/pages/admin.js`, `public/js/main.js`, `index.html` only if required

Local verification/evidence only:

- `backend/scripts/safety-vote-ux-phase2-static.test.js`
- `backend/scripts/safety-vote-ux-phase2-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase2-browser-probe.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (test-only routes)
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase2-*.md`, `AGENTS.md`, `backups/local/safety-vote-ux-phase2-*`

## Explicit exclusions

- Every Node Safety Vote route under `backend/routes`, PHP handler under `api/handlers`, service/library contract, `shared contract`, migration and schema object.
- Ballot immutability, privacy storage/separation, eligibility evaluation/freeze logic, jury scoring, certification and result calculation.
- Production connection, deployment, commit and push.
