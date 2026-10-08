# Safety Vote UX/UI Phase 5 — Read-only Preflight and Allowed Scope

วันที่: 2026-10-08
Baseline: `main` / `84914eb0ba69f4b12ace9ed5be3d671bf69e718b`
Decision: `GO_FOR_UX_PHASE5_LOCAL_IMPLEMENTATION`

## Phase 4 diff and rollback

- Phase 4 is presentation-only behind the strict opt-in check `window.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true`.
- Flag OFF still enters the legacy Admin/User/Juror surfaces. No Safety Vote Node/PHP route, migration, schema or shared business contract was changed by UX Phase 1–4.
- Server `module_enabled` is independently default OFF and the common operational gate returns `503 SAFETY_VOTE_MODULE_DISABLED` before operational reads/writes.
- UX Phase 5 rollback is therefore to keep/remove the Phase 5 presentation entry while leaving the feature flag OFF; it does not require database or API rollback.

## Existing authoritative contracts

| Area | Existing route | Capability / ownership | UX use |
|---|---|---|---|
| Operations | `GET /admin/campaigns/:id/operations` | `SAFETY_VOTE_RESULT_VIEW` | campaign schedule, privacy-safe funnel, bounded timeline, notification/export counts and reconciliation health |
| Organization analytics | `GET /admin/campaigns/:id/analytics/organization` | `SAFETY_VOTE_RESULT_VIEW` | participation counts only; server suppression is authoritative |
| Jury progress | `GET /admin/campaigns/:id/jury/progress` | `SAFETY_VOTE_MANAGE` | aggregate assignment status/conflict totals only |
| Stages | `GET /admin/campaigns/:id/stages` | `SAFETY_VOTE_MANAGE` | stage name/type/status/sequence for operational context |
| Result readiness | `GET /admin/campaigns/:id/results/snapshots` | `SAFETY_VOTE_RESULT_VIEW` | snapshot status/hash/readiness metadata; no result recalculation |
| Schedule processor | `POST /admin/operations/process-due` | `SAFETY_VOTE_MANAGE` | explicit confirmed action using existing Asia/Bangkok transition contract |
| Reminder preview/queue | `GET .../notifications/preview`, `POST .../notifications/queue` | `SAFETY_VOTE_MANAGE` | UI displays aggregate audience total only and queues existing bounded metadata |
| Aggregate export | `POST .../exports` and authenticated report file GET | `SAFETY_VOTE_EXPORT` | Frozen/Certified/Published snapshots only |
| Certified report | `POST .../exports/certified-report` | `SAFETY_VOTE_EXPORT` | Certified/Published snapshots only; does not certify or publish |
| Certification | result freeze/certify/publish routes | `SAFETY_VOTE_CERTIFY` plus active campaign certifier assignment and exact result hash | out of Phase 5 mutation scope; show ownership/readiness only |

Node `backend/routes/safety-vote-phase4.js` / `safety-vote-phase5.js` and PHP `api/handlers/safety_vote_phase4.php` / `safety_vote_phase5.php` expose matching route, permission, suppression, schedule, export and certification guards. Existing Phase 4/5 parity gates remain the acceptance source.

## Privacy and result boundaries

- Funnel values are displayed only from server-provided `{ visible, suppressed, reason, value }`; the client never derives a hidden value from percentages or related metrics.
- `secret_ballot` organization analytics returns `403 SECRET_DIMENSION_FORBIDDEN`; the UX must show a deliberate privacy state, not retry or replace it with another identity dimension.
- Suppressed department values remain “ปกปิดตามเกณฑ์ความเป็นส่วนตัว”. No ballot choice, answer, voter-to-choice mapping, employee list from notification preview or blind identity is rendered.
- Result snapshots may show lifecycle status, snapshot number, reconciliation/quorum state and shortened hash. Result rows, candidate scores and choice totals are not read by this workspace.
- Aggregate export requires a Frozen/Certified/Published snapshot. Certified-report generation requires Certified/Published. Certification and publication remain separately owned by `SAFETY_VOTE_CERTIFY` and campaign-role guards.
- Notification dispatch is not exposed in this UX; queueing reminders does not claim external delivery. Delivery status comes only from aggregate server status counts.

## Allowed file scope recorded before Runtime edit

Runtime/presentation:

- `public/js/pages/admin-safety-vote-operations.js` (new)
- `public/js/pages/safety-vote-operations-model.mjs` (new)
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js` (cache chain only)
- `public/style.css`
- `public/js/main.js`
- `index.html`

Local verification/documentation only:

- `backend/scripts/safety-vote-ux-phase5-static.test.js` (new)
- `backend/scripts/safety-vote-ux-phase5-browser-uat.js` (new)
- `backend/scripts/safety-vote-ux-phase5-browser-probe.js` (new)
- `backend/scripts/safety-vote-phase1-node-fixture-host.js`
- prior UX static cache-marker assertions where needed
- `backend/package.json`, root `package.json`, `AGENTS.md`
- Phase 5 report and guarded local evidence under `backups/local/`

Explicitly excluded:

- `backend/routes/**`
- `api/**`
- `backend/migrations/**`
- `shared/**`
- ballot/privacy/eligibility/jury calculation/certification/result-calculation logic
- Production, deployment, commit and push
