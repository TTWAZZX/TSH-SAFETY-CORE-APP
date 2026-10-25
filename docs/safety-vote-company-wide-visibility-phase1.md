# Safety Vote Company-wide Visibility — Phase 1

Date: 2026-10-25
Scope: Local only

## Outcome

Safety Vote now has one shared Node/PHP contract that treats campaign visibility and participation authorization as separate decisions:

- Catalog: every authenticated company employee may discover published-lifecycle campaigns.
- Detail: every authenticated company employee may open the campaign detail.
- Participation: only a frozen eligible voter, assigned juror or otherwise authorized participant may act.
- Official results: intended for authenticated company-wide access only after the governed publish step; implementation of the immutable result-publication path remains a later phase.

Published lifecycle statuses are `Scheduled`, `Open`, `Closed`, `Certified` and `Published`. `Draft`, `Voided`, `IsHidden=1` and `IsTest=1` remain excluded.

## Rollout contract

The additive settings migration creates:

- `company_wide_campaign_visibility_contract=2026-10-24-company-wide-campaign-visibility-r1`
- `company_wide_campaign_visibility_enabled=0`

The migration is fail-closed and preserves an already activated gate on rerun. Local was then explicitly activated. Existing campaign rows are not bulk updated; the four current Local campaigns remained byte/value-equivalent for `DiscoveryMode` counts. New campaigns and Draft saves are enforced as `public_listing` while the gate is enabled. Disabling the gate restores the legacy request-driven behavior without deleting data.

## UX

The campaign Wizard defaults new drafts to Company-wide Listing and states that visibility does not grant the right to answer, vote, submit work, nominate or judge. Server responses remain authoritative and refresh the stored discovery mode after save.

## Verification

- Central static/security contract: PASS
- Disposable migration, idempotency, activation preservation and data-preserving rollback: PASS
- Shared Node/PHP Phase 1 fixture parity: PASS
- Authenticated Node/PHP API lifecycle with client downgrade attempt: PASS
- Public discovery permission contract: PASS
- Phase 10.3 advanced-question regression: PASS
- Admin guided Draft regression: PASS
- App bootstrap/cache-chain regression: PASS
- Responsive Wizard at 390, 768, 1366 and 1920 px: PASS
- Changed PHP lint: PASS
- Project-wide PHP 7.4 compatibility across 144 PHP files: PASS
- Local activation: PASS; 4 existing campaigns preserved

No Production connection, deployment, commit or push occurred.

Decision: `PASS_LOCAL_COMPANY_WIDE_VISIBILITY_PHASE1_READY_FOR_REVIEW`\n