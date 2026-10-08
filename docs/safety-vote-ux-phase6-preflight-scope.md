# Safety Vote UX/UI Phase 6 — Read-only Preflight and Allowed Scope

วันที่: 2026-10-08
Baseline: `main` / `d0a9b08e3f3b4a230de3991ef663a25daeacdbe5`
Decision: `GO_FOR_UX_PHASE6_LOCAL_IMPLEMENTATION_WITH_BASELINE_LIMITATION`

## Phase 5 diff and rollback

- Phase 0–5 is committed at the immutable baseline above. Runtime UX remains strictly opt-in through boolean `window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true`.
- Flag OFF still renders the legacy Admin/User/Juror surfaces. Server `module_enabled` remains default OFF and rejects operational routes with `503 SAFETY_VOTE_MODULE_DISABLED` before business reads or writes.
- Phase 6 rollback is presentation-only: keep the flag OFF or remove the Phase 6 entry/import. No database, migration, API or result-data rollback is required.
- Phase 5 known limitation remains authoritative: Node and PHP jury-progress SQL selects unqualified `Status`/`ConflictState` across a join and can return an ambiguous-column failure. Phase 6 does not modify that endpoint or conceal it as ready.

## Existing authoritative result and certification contracts

| Area | Existing route | Capability / ownership | Phase 6 use |
|---|---|---|---|
| Snapshot list | `GET /admin/campaigns/:id/results/snapshots` | `SAFETY_VOTE_RESULT_VIEW` | compare status, calculation contract, reconciliation/quorum/tie state, counts and exact hashes |
| Stage context | `GET /admin/campaigns/:id/stages` | `SAFETY_VOTE_MANAGE` | choose an existing stage for calculation handoff; never creates a stage |
| Standard calculation | `POST /admin/campaigns/:id/results/calculate` | `SAFETY_VOTE_RESULT_VIEW` | explicit confirmed handoff to the existing deterministic calculation contract |
| Standard freeze | `POST .../results/:snapshotId/freeze` | `SAFETY_VOTE_CERTIFY` | explicit confirmed `Calculated → Frozen` transition |
| Standard certification | `POST .../results/:snapshotId/certify` | `SAFETY_VOTE_CERTIFY` plus active campaign `certifier` role and exact result hash | irreversible reasoned certification using the server-owned hash check |
| Standard publication | `POST .../results/:snapshotId/publish` | `SAFETY_VOTE_CERTIFY` | publishes only an already Certified snapshot |
| Secret recount | `POST /admin/campaigns/:id/results/recount` | `SAFETY_VOTE_RESULT_VIEW` | explicit reasoned handoff after Closed/Counting; server enforces identity separation and reconciliation |
| Secret certifier assignment | `POST /admin/campaigns/:id/certifiers` | `SAFETY_VOTE_MANAGE`; Draft secret election only | optional assignment form using central employee ID and primary/secondary role |
| Secret certification | `POST .../results/:sid/certify-secret` | `SAFETY_VOTE_CERTIFY` plus active independent assignment | exact-hash, balanced, tie-free certification; two distinct active certifiers required |
| Secret publication | `POST .../results/:sid/publish` | `SAFETY_VOTE_CERTIFY` | server chooses the secret-election dual-control contract before the standard route |
| Published secret result | `GET /campaigns/:id/results` | `SAFETY_VOTE_VIEW`; campaign and snapshot must be Published | publication preview only after server visibility permits it |
| Release verification | `GET /admin/campaigns/:id/release-verification` | `SAFETY_VOTE_AUDIT_VIEW`; governance owner `SHE` | read-only hash, identity-separation and active-certifier evidence |
| Certified report | `POST .../exports/certified-report` | `SAFETY_VOTE_EXPORT` | remains the Phase 5 report workflow; Phase 6 links back without changing report generation |

Node `backend/routes/safety-vote-phase4.js`, `safety-vote-phase6.js`, `safety-vote-phase7.js` and PHP counterparts expose matching guards and deterministic shared service contracts. Phase 1–7 parity gates remain the acceptance source.

## Privacy, visibility and governance boundaries

- Snapshot comparison is metadata-only. It does not request result rows, ballot answers, voter identity, blind candidate identity or organization choice dimensions.
- The UI never calculates, freezes, certifies or publishes locally. It sends only explicit user-confirmed requests to existing routes and reloads authoritative snapshots afterward.
- Certification requires the operator to review and re-enter the complete 64-character result hash plus a bounded reason. The client sends that exact value; the server remains authoritative.
- Secret-election certification uses `certify-secret`; it never falls back to standard single-certifier certification. Publication remains disabled until the snapshot is server-reported Certified.
- Release verification may be unavailable without `SAFETY_VOTE_AUDIT_VIEW`; this is a declared partial state, never interpreted as a pass.
- Result visibility remains server-owned. A pre-publication preview explains the disclosure boundary without showing counts. Published secret rows are read only through the existing authenticated result route.
- SHE governance evidence is read-only in this phase. Acceptance-evidence creation and external integration handoff/dispatch are out of scope.

## Allowed file scope recorded before Runtime edit

Runtime/presentation:

- `public/js/pages/admin-safety-vote-results.js` (new)
- `public/js/pages/safety-vote-results-model.mjs` (new)
- `public/js/pages/safety-vote-ux-components.js` (accessible exact-hash/reason dialog only)
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/style.css`
- `public/js/main.js`, `public/js/pages/admin.js`, `index.html` (cache chain only)

Local verification/documentation only:

- `backend/scripts/safety-vote-ux-phase6-static.test.js` (new)
- `backend/scripts/safety-vote-ux-phase6-browser-uat.js` (new)
- `backend/scripts/safety-vote-ux-phase6-browser-probe.js` (new)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js` (guarded authenticated UX6 route/roles only)
- prior UX static cache-marker assertions where needed
- `backend/package.json`, root `package.json`, `AGENTS.md`
- Phase 6 report and guarded local evidence under ignored `backups/local/`

Explicitly excluded:

- `backend/routes/**`
- `api/**`
- `backend/migrations/**`
- `shared/**`
- ballot immutability, privacy, eligibility freeze, jury/result calculation and certification business contracts
- Production, deployment, commit and push
