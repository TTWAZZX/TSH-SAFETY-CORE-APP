# Safety Vote UX/UI Phase 3 — Read-only preflight and allowed scope

Date: 2026-10-08 (Asia/Bangkok)

Decision: `GO_FOR_UX_PHASE3_LOCAL_IMPLEMENTATION`

## Baseline, Phase 2 diff and rollback

- Authoritative repository/branch remains `C:\Users\User\TSH-SAFETY-CORE-APP`, `main`.
- `HEAD`, `main` and `origin/main` remain `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`.
- Phase 1–2 are intentionally uncommitted local presentation work. Before Phase 3 Runtime edits, `git diff --check` passed and no changed/untracked path existed under `backend/routes`, `api`, `backend/migrations` or `shared`.
- Rollback remains strict flag-off: only `window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true` enables the new presentation. Flag OFF calls the preserved legacy page. Server `module_enabled=0` remains independently fail-closed through the shared operational gate.

## Existing participation contracts

- Campaign list: `GET /safety-vote/me/campaigns` returns only campaigns linked to the authenticated employee through the current frozen eligibility snapshot, for `Open`, `Closed` and `Published` states.
- Campaign detail: `GET /safety-vote/campaigns/:id` requires `SAFETY_VOTE_VIEW`, an allowed campaign state and frozen eligibility. It returns campaign, questions, `participation`, `eligibility.eligible` and server-authoritative `canSubmit`.
- General ballot: `POST /safety-vote/campaigns/:id/ballot/submit` requires campaign version, acknowledged rules, validated answers and an `Idempotency-Key` of at least 16 characters. The existing `SafetyVote_RequestKeys` contract stores only the keyed request proof needed for replay protection. The first accepted request creates immutable ballot/participation records; an exact replay returns the same receipt, a changed payload with the same key conflicts, and a second participation is rejected.
- Secret election: the Phase 6 handler intercepts `secret_election` + `secret_ballot`, preserves identity separation, stores no ballot identity and returns only acceptance proof (`proof=accepted_only`, `canLocateBallot=false`, `canEdit=false`) plus an opaque receipt code.
- Submission Challenge: existing create/read/update/submit endpoints own draft and submission lifecycle. They have no ballot-style request-key contract, so Phase 3 adds only an in-flight UI lock and never automatically retries an ambiguous create/submit response.
- Nomination: the existing nomination endpoint validates central Employee Master, frozen eligibility and campaign state; the database/API duplicate guard remains authoritative.
- Answer files remain available only for identified/confidential open campaigns and are validated/owned by the existing server contract.
- Node and PHP implement the same participation, eligibility, privacy, idempotency and receipt rules. Phase 3 does not alter either stack.

## Campaign-type presentation mapping

- `survey`: question-oriented participation and review.
- `popular_vote`: option/candidate selection and review.
- `secret_election`: private ballot wording, no selection in receipt, no interim result exposure.
- `submission_challenge`: work title/description workflow through existing submission APIs.
- `nomination` and `award`: nominee Employee ID and supporting statement through existing nomination API.
- Other existing campaign types retain the generic question contract and never gain a client-side capability that the API does not authorize.

## Allowed Phase 3 file scope

Runtime presentation only:

- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/pages/safety-vote-participation-model.mjs` (new)
- `public/js/pages/safety-vote-ux-components.js` only if a shared accessible primitive is required
- `public/style.css`
- cache markers in `public/js/main.js` and `index.html` only if required

Local verification/evidence only:

- `backend/scripts/safety-vote-ux-phase3-static.test.js`
- `backend/scripts/safety-vote-ux-phase3-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase3-browser-probe.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` test-only routes/users if required
- `backend/package.json`, root `package.json`
- `docs/safety-vote-ux-phase3-*.md`, `AGENTS.md`, `backups/local/safety-vote-ux-phase3-*`

## Explicit exclusions

- Every Node route under `backend/routes`, PHP handler under `api/handlers`, server library/shared contract, migration and schema object.
- Ballot immutability, privacy/identity separation, eligibility evaluation/freeze, jury scoring, certification and result calculation.
- Production connection, deployment, commit and push.
