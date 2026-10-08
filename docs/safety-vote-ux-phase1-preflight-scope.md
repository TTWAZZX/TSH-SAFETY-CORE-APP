# Safety Vote UX/UI Phase 1 — Baseline preflight and allowed scope

Date: 2026-10-08 (Asia/Bangkok)

Decision: `GO_FOR_UX_PHASE1_LOCAL_IMPLEMENTATION`

## Immutable baseline

- Repository: `C:\Users\User\TSH-SAFETY-CORE-APP`
- Branch: `main`
- Commit: `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`
- Remote baseline: `origin/main` at the same commit when this gate was recorded.
- Existing local UX documentation and `AGENTS.md` changes are preserved and are not treated as baseline Runtime.

## Authoritative source mapping

- Admin UI route: Admin System Console tab `safety-vote-foundation`, rendered by `public/js/pages/admin-safety-vote.js`.
- User route: `#safety-vote`, rendered by `public/js/pages/safety-vote.js`.
- Juror route: the authenticated assignment workspace inside `#safety-vote`; availability is derived from server-returned jury assignments, not a client-only role guess.
- Node API: `backend/routes/safety-vote.js` plus `safety-vote-phase2.js` through `safety-vote-phase7.js` and their existing shared rule/service modules.
- PHP API: `api/handlers/safety_vote.php` plus Phase 2–7 handlers and existing `api/lib/safety_vote_*` libraries.
- Schema ownership: explicit additive migrations `backend/migrations/20261008_safety_vote_phase1_foundation.sql` through `20261008_safety_vote_phase7_integrations_governance.sql`. Runtime does not own DDL.

## Authorization, readiness and rollback

- Server authorization remains authoritative through the existing `SAFETY_VOTE_*` permission set. Admin routes require their current granular permissions; Juror access remains assignment-scoped.
- `module_enabled` remains the authoritative operational kill switch. When disabled, operational routes fail closed with `503 SAFETY_VOTE_MODULE_DISABLED`; only authenticated read-only health and release-preflight control routes remain reachable.
- The UX shell adds a separate presentation flag, `window.__TSH_FEATURE_FLAGS__.safetyVoteUxV1`, with strict boolean opt-in. Its default is OFF.
- UI rollback is to remove/disable that flag. The legacy UI remains the fallback and no campaign, ballot, eligibility, submission, jury score, certification, result or audit data is deleted or rewritten.

## Allowed file scope

Runtime presentation only:

- `public/js/pages/admin-safety-vote-ux1.js` (new feature-flagged Admin shell)
- `public/js/pages/safety-vote-ux-components.js` (new shared presentation primitives)
- `public/js/pages/safety-vote-ux-model.mjs` (new presentation-only filtering/KPI/navigation model)
- `public/js/pages/safety-vote-page-ux1.js` (new feature-flagged User/Juror navigation wrapper)
- `public/js/pages/admin.js` (switch Admin import to the feature-flagged wrapper and cache marker only)
- `public/js/main.js`, `index.html` (switch module imports/cache markers only)
- `public/style.css` (scoped responsive/accessibility styles only)

Local verification and evidence only:

- `backend/scripts/safety-vote-ux-phase1-static.test.js`
- `backend/scripts/safety-vote-ux-phase1-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase1-browser-probe.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (test-only authenticated pages/fixtures)
- `backend/package.json`, root `package.json` (local verification commands only)
- `docs/safety-vote-ux-phase1-*.md`, `AGENTS.md`, `backups/local/safety-vote-ux-phase1-*`

## Explicitly excluded

- All `backend/routes/safety-vote*.js`, backend Safety Vote rules/services, PHP handlers/libraries, shared API contracts and migrations.
- Ballot immutability, privacy, eligibility, jury scoring, certification and result-calculation behavior.
- Database schema or business-data mutation outside guarded disposable local UAT.
- Production connections, deployment, commit and push.
