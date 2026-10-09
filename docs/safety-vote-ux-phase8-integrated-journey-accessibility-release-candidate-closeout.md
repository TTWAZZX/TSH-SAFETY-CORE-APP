# Safety Vote UX/UI Phase 8 — Integrated Journey, Accessibility and Release Candidate Closeout

วันที่: 2026-10-09 (Asia/Bangkok)

สถานะ: `PASS_LOCAL_UAT_RELEASE_REMAINS_HOLD`

Authoritative baseline: `main` / `077c5977283a55756bdfcfe5dfb804e32f716aa8`; `origin/main` matched before Runtime edits.

## Preflight decision and allowed scope

Read-only preflight is recorded in `docs/safety-vote-ux-phase8-preflight-scope.md`. It confirmed the Phase 7 committed diff, existing Admin/User/Juror and limited-role routes, Node/PHP ownership, feature-OFF rollback, module-disabled fail-closed behavior, privacy/result/certification boundaries, immutable evidence and authoritative release HOLD.

The only pre-existing dirty file was `backend/scripts/patrol-checkin-v2.test.js`; it remained excluded and untouched. Phase 8 was authorized only for frontend presentation, local verification and documentation. No file under `backend/routes/**`, `api/**`, `backend/migrations/**` or `shared/**` changed.

## Implementation

- Added a shared campaign-adaptive journey model and responsive journey component spanning Campaign Center → creation/readiness → participation → jury → operations → results → governance.
- Added accessible breadcrumbs, `aria-current="step"`, polite screen-reader step status and role-scoped journey visibility. Popular Vote/Survey does not manufacture a Jury step; Jury-capable campaign types retain it.
- Connected the Campaign Center journey actions to the established wizard, advanced workspace, Operations, Results and Governance renderers. Every destination continues to call only its existing authenticated API routes.
- Applied the same journey context to the User and Juror surfaces without exposing Admin actions or protected identities.
- Added responsive containment, keyboard focus indicators, 44 px+ journey targets, mobile internal step scrolling and reduced-motion behavior.
- Preserved existing standardized loading, empty, retry, denied, partial-capability and module-disabled states. Missing/403/503/5xx data is never interpreted as PASS.
- Preserved strict feature opt-in, legacy flag-OFF fallback, server-owned permissions/readiness/eligibility/results and authoritative governance `HOLD`.

## Files changed

Runtime/presentation:

- `public/js/pages/safety-vote-journey-model.mjs`
- `public/js/pages/safety-vote-ux-components.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/safety-vote-campaign-wizard.js`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/pages/safety-vote-jury-workspace.js`
- `public/js/pages/admin-safety-vote-operations.js`
- `public/js/pages/admin-safety-vote-results.js`
- `public/js/pages/admin-safety-vote-governance.js`
- `public/js/pages/admin.js`, `public/js/main.js`, `public/style.css`, `index.html`

Local verification/documentation:

- `backend/scripts/safety-vote-ux-phase8-static.test.js`
- `backend/scripts/safety-vote-ux-phase8-evidence.js`
- Phase 1/2 Browser probe selector maintenance for the current User presentation selector
- Phase 3–7 static later-phase cache-marker assertions
- `backend/package.json`, root `package.json`
- Phase 8 preflight, this report, candidate manifest and `AGENTS.md`

## Verification results

- JavaScript syntax: PASS for every changed module.
- `git diff --check`: PASS.
- UX Phase 8/7/6/5/4/3/2/1 static/unit/accessibility contracts: PASS — 48/59/58/54/50/45/43/30 assertions.
- Safety Vote Phase 1–7 Node/PHP parity: PASS for every phase.
- Safety Vote Phase 8.3.1 disabled-mode Node/PHP parity: PASS.
- Strict feature-OFF contract: PASS; `renderLegacySafetyVoteFoundation(container)` remains the fallback and the cache chain is versioned independently.

The initial Phase 1 and Phase 2 Browser reruns exposed stale local probe selectors (`[data-sv-open]`) left behind after the accepted Phase 3 User presentation renamed the selector to `[data-svp-campaign]`. Only those two local probe selectors were updated; both complete suites then passed. This was a verification-harness maintenance issue, not a Runtime/API defect.

## Authenticated guarded Browser matrix

All rows passed at `390×844`, `430×932`, `768×1024`, `1366×768` and `1920×1080`.

| Surface / role | Evidence suite | Key acceptance |
|---|---|---|
| Campaign Center — Admin/User/Juror | UX Phase 1 | role navigation, adaptive campaign navigation, cards/table/drawer, empty/denied/module-disabled states |
| Creation/readiness — Admin/User/Juror preview | UX Phase 2 | eight-step wizard, role previews, guarded open, feature and module boundaries |
| Participation — User | UX Phase 3 | review-before-submit, immutable retry, privacy-safe receipt, permission denial |
| Scoring — Juror | UX Phase 4 | blind alias, autosave/review, immutable submit/recusal, unassigned denial |
| Operations — Admin/limited/denied | UX Phase 5 | threshold suppression, partial capability, confirmed aggregate actions |
| Results — Admin/certifiers/viewer/denied | UX Phase 6 | snapshot/hash review, recount, standard and dual certification/publication |
| Governance — Admin/audit-view-only/denied | UX Phase 7 | immutable verification, SHE acceptance, no-external preview, fixture confirmation and HOLD |
| Module disabled | all applicable suites | `503 SAFETY_VOTE_MODULE_DISABLED` remains fail-closed |

Across the matrix: page horizontal overflow = false, visible actionable target below 44 px = 0, keyboard/focus/dialog/screen-reader semantics pass, protected voter/choice/blind identity leakage = false, unexpected API errors = 0 and browser exceptions = 0.

## Evidence, SHA-256 and mutation ledger

Accepted combined evidence: `backups/local/safety-vote-ux-phase8-1791509833562/`

- 102 PNG screenshots copied from the fresh guarded Phase 1–7 runs.
- `result.json` SHA-256: `a774b2ce207d600a48b2b042776829476bdf45e56056befa430be3ffb0df8b45`.
- evidence `candidate-manifest.json` SHA-256: `4d19ab601a24f0ebf6d1ed125e1788f2abf199308b2a68d045bdd35d0798f88d`.
- `result.sha256` contains both values; every Phase 3–7 source `result.sha256` was verified before aggregation. Phase 1/2 source results were hashed during aggregation.

Mutation ledger across the independently disposable suites:

- Phase 2: 5 wizard campaigns, 5 questions, 5 frozen eligibility snapshots; forbidden business rows 0.
- Phase 3: 6 ballots, 6 participations, 6 request keys; secret identity mappings 0; forbidden mutations 0.
- Phase 4: 5 submitted assignments, 1 recusal, 20 submitted score rows; forbidden mutations 0.
- Phase 5: 11 fixture notifications, 1 report/export; identity mappings and certifications 0; report files after cleanup 0.
- Phase 6: 2 ballots, 2 participations, identity mappings 0, 3 certifications and 1 reasoned recount.
- Phase 7: 2 retained fixture ballots, identity mappings 0, 1 SHE acceptance, 1 fixture handoff, `externalDelivery=false`, 1 result snapshot, 2 certifications and 1 open fixture alert.

Every suite used a guarded disposable database name with loopback-only DB host validation. Final disposable database, generated private report and browser-profile residue is zero.

## Known limitations

- The baseline Phase 5 jury-progress query still has an ambiguous unqualified `Status` column when data exists. Phase 8 did not change the route/API and preserves the partial-state wording.
- Browser runs use the guarded Node fixture; PHP equivalence is established by deterministic Phase 1–7 and disabled-mode parity, not by repeating the complete browser matrix against PHP.
- No real Production account/data, Production server, external adapter or real delivery was used.
- The working tree is intentionally uncommitted, so the source is not an immutable release artifact.

## Candidate and release decision

Privacy-safe candidate manifest: `docs/safety-vote-ux-phase8-candidate-manifest.json`. Rollback is presentation-only: keep `safetyVoteUxV1` OFF or revert the Phase 8 presentation/cache-chain files. No schema/data rollback is needed.

Final decision: `PASS_LOCAL_UAT_RELEASE_REMAINS_HOLD`.

This is not Production authorization. `productionConnected=false`, `externalDelivery=false` and `deployAuthorized=false`. Release remains `HOLD — NOT AUTHORIZED FOR PRODUCTION DEPLOYMENT` until the authoritative immutable release-preflight passes independently.

## Separate commands after authorization

Commit only after explicit approval and review of the candidate manifest:

```powershell
git add -- AGENTS.md index.html package.json backend/package.json backend/scripts/safety-vote-ux-phase1-browser-probe.js backend/scripts/safety-vote-ux-phase2-browser-probe.js backend/scripts/safety-vote-ux-phase3-static.test.js backend/scripts/safety-vote-ux-phase4-static.test.js backend/scripts/safety-vote-ux-phase5-static.test.js backend/scripts/safety-vote-ux-phase6-static.test.js backend/scripts/safety-vote-ux-phase7-static.test.js backend/scripts/safety-vote-ux-phase8-static.test.js backend/scripts/safety-vote-ux-phase8-evidence.js docs/safety-vote-ux-phase8-preflight-scope.md docs/safety-vote-ux-phase8-integrated-journey-accessibility-release-candidate-closeout.md docs/safety-vote-ux-phase8-candidate-manifest.json public/js/main.js public/js/pages/admin.js public/js/pages/admin-safety-vote-ux1.js public/js/pages/admin-safety-vote-governance.js public/js/pages/admin-safety-vote-operations.js public/js/pages/admin-safety-vote-results.js public/js/pages/safety-vote-campaign-wizard.js public/js/pages/safety-vote-journey-model.mjs public/js/pages/safety-vote-jury-workspace.js public/js/pages/safety-vote-page-ux1.js public/js/pages/safety-vote-ux-components.js public/style.css
git commit -m "Close out Safety Vote UX integrated journey"
```

Push separately only after explicit approval:

```powershell
git push origin main
```

Do not include the unrelated dirty `backend/scripts/patrol-checkin-v2.test.js`.
