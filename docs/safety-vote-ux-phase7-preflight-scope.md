# Safety Vote UX/UI Phase 7 — Read-only Preflight and Allowed Scope

วันที่: 2026-10-08

Input baseline: `main` / `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5` plus the uncommitted, tested UX Phase 6 working tree

Decision: `GO_FOR_UX_PHASE7_LOCAL_IMPLEMENTATION`

## Phase 6 diff and rollback

- UX Phase 6 is an uncommitted presentation-layer continuation over immutable Phase 0–5 commit `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5`; its accepted report is `docs/safety-vote-ux-phase6-result-review-certification-publication-workspace.md`.
- The strict opt-in condition remains `window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true`. Flag OFF retains the legacy Admin/User/Juror UI.
- Server `module_enabled` remains independently default OFF and fail-closed. Phase 7 UX must not bypass, simulate or cache a successful operational response after a disabled response.
- Phase 7 rollback is presentation-only: keep the flag OFF or remove the Phase 7 entry/import. No database, API, migration or evidence-data rollback is required.

## Existing authoritative governance contracts

| Area | Existing route | Capability / ownership | Phase 7 use |
|---|---|---|---|
| Immutable verification | `GET /admin/campaigns/:id/release-verification` | `SAFETY_VOTE_AUDIT_VIEW` | compare stored/calculated eligibility, result-certification and report hashes; read privacy/dual-control metadata |
| Acceptance evidence | `GET /admin/campaigns/:id/acceptance-evidence` | `SAFETY_VOTE_AUDIT_VIEW` | show required `she_owner` evidence and active/revoked/expired state |
| SHE acceptance | `POST /admin/campaigns/:id/acceptance-evidence` | `SAFETY_VOTE_ADMIN` | explicit `I ACCEPT SHE_OWNER <CampaignCode>` confirmation plus evidence reference; server derives/validates SHA-256 |
| Observability | `GET /admin/campaigns/:id/observability` | `SAFETY_VOTE_AUDIT_VIEW` | aggregate delivered/failed handoffs and open alerts only; voter-choice and receipt lookup remain false |
| Adapter catalog/providers | `GET /admin/integrations/catalog`, `GET /admin/integrations/providers` | `SAFETY_VOTE_MANAGE` | read-only adapter/mode/capability description; never mutates an external system |
| Handoff preview | `POST /admin/campaigns/:id/integrations/handoffs/preview` | `SAFETY_VOTE_EXPORT` | build certified aggregate payload and deterministic preview hash with `externalMutation=false` |
| Fixture confirmation | `POST /admin/campaigns/:id/integrations/handoffs/confirm` | `SAFETY_VOTE_CERTIFY` | exact preview-hash/confirmation handoff; server fails closed unless adapter mode is fixture and returns `externalDelivery=false` |
| Release preflight | `GET /admin/campaigns/:id/release-preflight` | `SAFETY_VOTE_ADMIN` | show authoritative readiness/HOLD checklist only; never authorizes deployment |

Node `backend/routes/safety-vote-phase7.js` and PHP `api/handlers/safety_vote_phase7.php` use the same Phase 7 service contract, SHE governance amendment, permissions, exact confirmation and privacy-safe metadata allowlist. Phase 1–7 parity and Phase 8.3.1 disabled-mode gates remain authoritative acceptance gates.

## Fail-closed and privacy boundaries

- Missing/failed release verification is never rendered as pass. A `403` becomes a denied/partial capability state and a `503 SAFETY_VOTE_MODULE_DISABLED` becomes the module-disabled state.
- `release-preflight` currently sets `immutableSource=false`; therefore the workspace must display `HOLD` and must not imply Production authorization.
- Handoff preview exposes only certified aggregate metadata: adapter, campaign code, snapshot ID, result/report hashes, classification and false identity/choice flags.
- Handoff confirmation is available only after a fresh preview and exact typed confirmation. It must show `externalDelivery=false`; no real adapter dispatch is permitted in Phase 7.
- Acceptance evidence must be SHE-owned, explicitly confirmed and server-persisted. The UI cannot manufacture an accepted state locally.
- The timeline is constructed only from existing bounded acceptance evidence plus current-session privacy-safe receipts; no prompt, ballot, answer, voter identity, blind identity or unrestricted audit payload is requested.

## Allowed file scope recorded before Runtime edit

Runtime/presentation:

- `public/js/pages/admin-safety-vote-governance.js` (new)
- `public/js/pages/safety-vote-governance-model.mjs` (new)
- `public/js/pages/safety-vote-ux-components.js` (accessible typed-confirmation dialogs only)
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/style.css`
- `public/js/main.js`, `public/js/pages/admin.js`, `index.html` (cache chain only)

Local verification/documentation only:

- `backend/scripts/safety-vote-ux-phase7-static.test.js` (new)
- `backend/scripts/safety-vote-ux-phase7-browser-uat.js` (new)
- `backend/scripts/safety-vote-ux-phase7-browser-probe.js` (new)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (guarded UX7 route/roles only)
- prior UX static cache-marker assertions where required
- `backend/package.json`, root `package.json`, `AGENTS.md`
- Phase 7 report and ignored local evidence under `backups/local/`

Explicitly excluded:

- `backend/routes/**`, `api/**`, `backend/migrations/**`, `shared/**`
- ballot immutability, privacy, eligibility freeze, jury/result calculation, certification and result-visibility contracts
- real external integration dispatch, Production connection, deployment, commit and push
