# Safety Vote UX/UI Phase 4 — Read-only preflight and allowed scope

Date: 2026-10-08 (Asia/Bangkok)

Decision: `GO_FOR_UX_PHASE4_LOCAL_IMPLEMENTATION`

## Baseline, Phase 3 diff and rollback

- Authoritative repository/branch remains `C:\Users\User\TSH-SAFETY-CORE-APP`, `main`.
- `HEAD`, `main` and `origin/main` remain `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`.
- Phase 1–3 are intentionally uncommitted presentation work. Before Phase 4 Runtime edits, `git diff --check` passed and no changed/untracked path existed under `backend/routes`, `api`, `backend/migrations` or `shared`.
- Phase 3 adds only the strict-opt-in User presentation and local verification described in `docs/safety-vote-ux-phase3-user-participation-ballot-review-workspace.md`.
- Rollback remains strict flag-off: only `window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true` enables the new presentation. Flag OFF calls the preserved legacy page. Server `module_enabled=0` remains independently fail-closed through the existing operational gate.

## Existing Juror contracts

- Queue: `GET /safety-vote/jury/assignments` requires `SAFETY_VOTE_JURY` and returns only assignments owned by the authenticated `JurorEmployeeID`, including campaign/stage/candidate scope, status, conflict state, submission time, sheet version and row version.
- Campaign queue: `GET /safety-vote/campaigns/:id/jury/assignments` applies the same capability and authenticated juror ownership within a campaign version.
- Detail: `GET /safety-vote/jury/assignments/:assignmentId` requires `SAFETY_VOTE_JURY` and exact juror ownership. An unassigned/direct-link request returns `ASSIGNMENT_NOT_FOUND` without candidate, criterion or score content.
- Blind mode is server-derived from the stage advance rule. When enabled, candidate display names are replaced server-side with the existing candidate alias/number before the response; Phase 4 must not reconstruct identity from another endpoint or hidden DOM metadata.
- Draft save: `PUT /safety-vote/jury/assignments/:assignmentId/scores` accepts only an owned assignment with `Status=Draft` and `ConflictState=clear`. The shared validator requires one unique bounded score for every allowed candidate/criterion pair; comments are bounded to 1,000 characters.
- Final submit: `POST /safety-vote/jury/assignments/:assignmentId/submit` locks the owned assignment row, requires a complete saved sheet, marks scores and assignment `Submitted`, increments row version and returns `immutable=true`. A repeated/late submit fails `SCORE_SHEET_LOCKED`; the UI must not claim success until it verifies the authoritative state.
- Conflict/recusal: `POST /safety-vote/jury/assignments/:assignmentId/recuse` requires a non-empty bounded reason and changes only an owned Draft assignment to `Recused`/`recused`. Recused assignments cannot be scored or submitted.
- Reopen ownership: `POST /safety-vote/admin/jury/assignments/:assignmentId/reopen` requires `SAFETY_VOTE_MANAGE`, a submitted source assignment and a reason. It inserts a new Draft assignment with `SheetVersion+1` and preserves the prior immutable assignment; the Juror UI does not call this Admin endpoint.
- Node and PHP implement matching queue/detail/save/submit/recuse/reopen behavior. Phase 4 does not alter either stack or the shared calculation contract.

## Phase 4 presentation decisions

- “งานประเมินของฉัน” uses only the existing authenticated queue and presents Draft/Submitted/Recused views, search and completed/total progress.
- Detail uses the existing candidate and criterion response. Blind aliases are displayed exactly as returned, including in accessible names; identity-like fields are not added.
- Partial edits may be recovered from session-local storage only after the current user has successfully loaded the owned assignment. Stale keys not present in the authenticated queue are removed on queue load; submit/recuse clears the key.
- Server draft save is attempted only for a complete, valid sheet because the existing API rejects partial sheets. Local autosave status clearly distinguishes local recovery from server-saved draft.
- Submit review and receipt do not expose scores or candidate details. Ambiguous submit errors trigger an authoritative queue/detail refresh before retry wording is shown.

## Allowed Phase 4 file scope

Runtime presentation only:

- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/pages/safety-vote-jury-workspace.js` (new)
- `public/js/pages/safety-vote-jury-model.mjs` (new)
- `public/js/pages/safety-vote-ux-components.js` for an accessible reason dialog
- `public/style.css`
- cache markers in `public/js/main.js` and `index.html`

Local verification/evidence only:

- `backend/scripts/safety-vote-ux-phase4-static.test.js` (new)
- `backend/scripts/safety-vote-ux-phase4-browser-uat.js` (new)
- `backend/scripts/safety-vote-ux-phase4-browser-probe.js` (new)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` guarded test-only routes/users if required
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase4-*.md`, `AGENTS.md`, `backups/local/safety-vote-ux-phase4-*`

## Explicit exclusions

- Every Node route under `backend/routes`, PHP handler/library under `api`, server/shared contract, migration and schema object.
- Ballot immutability, privacy/identity separation, eligibility evaluation/freeze, jury validation/calculation, certification and result calculation.
- Admin reopen implementation, Production connection, deployment, commit and push.
