# Safety Vote Phase 8.3.1 — Disabled-mode Fail-closed Remediation

Date: 2026-10-08

Parent commit: `d9a861becbd3da407d55b69ae23c2bc47eee7b83`

Contract: `2026-10-08-safety-vote-phase8.3.1-disabled-mode-r1`

## Outcome

Safety Vote is fail-closed while `module_enabled=0` in both Node and PHP. A shared gate runs before every Phase 1–7 router, so direct API calls cannot bypass disabled mode.

The only disabled-mode exceptions are authenticated, read-only control endpoints:

- `GET /api/safety-vote/admin/health`
- `GET /api/safety-vote/admin/campaigns/:id/release-preflight`

All other Safety Vote paths return HTTP `503` with `SAFETY_VOTE_MODULE_DISABLED`, including Admin CRUD, master-data reads, user workspace/gallery, jury/operations/integration routes and ballot submit.

## Migration behavior

Every additive migration from Phase 1 through Phase 7 now leaves `module_enabled=0`. Phase 7 also leaves `phase7_integrations_enabled=0`. Reapplying Phase 1 and applying each later phase after a simulated enabled state returns the module to disabled. Rollbacks remain data-preserving.

Guarded local fixtures explicitly enable the module only for existing positive lifecycle regression. The dedicated disabled-mode fixture sets `SAFETY_VOTE_FIXTURE_KEEP_DISABLED=1` and never enables it.

## Verification

- Focused Node/PHP disabled-mode parity: PASS.
- Authenticated health available and reports disabled: PASS.
- Authenticated read-only release preflight bypasses the disabled gate: PASS.
- Direct bypass probes for campaign list, integration catalog, user workspace and ballot submit: PASS (`503 SAFETY_VOTE_MODULE_DISABLED`).
- Ballot, participation and request-key residue after bypass attempts: zero.
- Phase 1–7 full guarded regression: PASS, including 20-voter concurrency, secret separation, deterministic recount/certification, exports, backup/restore, accessibility/performance and desktop/390 px Browser UAT.
- Phase 1–4 standalone migration regression after the final migration edits: PASS.
- Production connections, migration, configuration changes, deployment and push: none.

## Release posture

The successor commit is suitable for a separately authorized controlled staged deployment with the module and integrations disabled. Deployment, migration execution against Production, menu enablement and accepting real ballots remain outside this phase and require new authorization.

The pre-existing unrelated dirty file `backend/scripts/patrol-checkin-v2.test.js` is excluded from the successor commit.
