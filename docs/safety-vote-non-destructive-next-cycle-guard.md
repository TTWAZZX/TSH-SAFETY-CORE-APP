# Safety Vote Completed Campaign Non-destructive Next-cycle Guard

Date: 2026-10-27
Scope: Local implementation and verification only

## Outcome

Completed campaigns are immutable at the campaign identity level. A direct request to activate an offline Draft revision against a `Closed`, `Certified` or `Published` campaign returns HTTP `409` with code `NEXT_CYCLE_REQUIRED` in both Node and PHP.

The guard no longer depends on company-wide catalogue configuration or the presence of a result snapshot. This closes the direct-API path that could otherwise return a completed campaign to Draft even though the Admin UI already selected the non-destructive next-cycle action.

The supported action remains `POST /admin/campaigns/:id/versions/:versionId/activate-next-cycle` with exact `CREATE NEXT CYCLE <campaign-code> V<version>` confirmation. It creates a separate Draft campaign and lineage, preserving the source campaign, its current version and official-result evidence.

## Compatibility

- Non-completed campaign revision activation keeps its existing behavior.
- The Admin UI continues to show the governed next-cycle action for completed campaigns.
- Node and PHP expose matching `requiresNextCycle`, `directActivationAllowed` and `activationMode` policy fields.
- No schema migration or frontend cache-key change is required.

## Verification

- Phase 10.4 static and Node/PHP parity: PASS, 30 assertions.
- Official Top N and non-destructive next-cycle database parity: PASS with transaction rollback and source evidence preserved.
- Close finalization, company catalogue and schedule revision regression: PASS.
- Full Safety Vote Phase 7 static acceptance across all six workflows: PASS.
- PHP 7.4 compatibility: PASS across 158 PHP files.
- `git diff --check`: PASS.

No Production connection, external delivery, deployment, commit or push occurred.
