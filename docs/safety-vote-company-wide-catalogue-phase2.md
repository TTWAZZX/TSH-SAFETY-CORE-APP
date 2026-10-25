# Safety Vote Company-wide Campaign Catalogue — Phase 2

Date: 2026-10-25
Scope: Local only

## Outcome

The member-facing Safety Vote workspace now acts as a company-wide campaign catalogue when the Phase 1 visibility contract is enabled. Every authenticated employee can discover and open a published-lifecycle campaign, while participation remains governed by the campaign's frozen eligibility snapshot and role assignments.

The catalogue includes `Scheduled`, `Open`, `Closed`, `Certified` and `Published` campaigns. It continues to exclude `Draft`, `Voided`, `IsHidden=1` and `IsTest=1` campaigns.

## Access behavior

Node and PHP use the same access projection for every campaign:

- `catalogueVisible`: the authenticated employee may see the campaign in the catalogue.
- `detailVisible`: the authenticated employee may open its detail.
- `participationAllowed`: the employee is currently eligible to perform participant actions.
- `readOnlyDetail`: the campaign is visible but participation is not authorized.
- `accessMode` and `reasonCode`: stable machine-readable context for UI and audit-friendly troubleshooting.

When an employee is not in the current frozen eligibility snapshot, the detail endpoint returns campaign metadata in read-only mode, omits questions and own responses, and reports `canSubmit=false`. Participant mutation requests are rejected server-side with `403 CAMPAIGN_NOT_ELIGIBLE`; hiding controls in the browser is not the security boundary.

Existing campaigns whose stored discovery mode is `eligible_only` are projected as `public_listing` only while the company-wide gate is active. Their stored value is returned separately as `StoredDiscoveryMode` and is not rewritten, preserving rollback behavior and historical configuration.

## User experience

The member workspace now presents `แคมเปญทั้งหมด` and explains that all employees may view campaign information but only authorized employees may participate. Ineligible cards and detail views retain the existing read-only disclosure. The detail response does not expose question content, prior answers or participation actions to an ineligible employee.

## Verification

- Company-wide catalogue static/security contract: PASS
- Shared Node/PHP visibility fixture parity: PASS
- Existing public-discovery regression: PASS
- Authenticated Node/PHP API lifecycle: PASS
- Legacy stored `eligible_only` campaign appears without database rewrite: PASS
- Ineligible read-only detail shape and participant mutation denial: PASS
- Existing Phase 2 desktop/390px browser regression: PASS
- Dedicated Catalogue browser UAT at 390, 768 and 1366 px: PASS
- Phase 3 authenticated User/Admin desktop/390px browser regression: PASS
- Changed PHP lint: PASS
- Project-wide PHP 7.4 compatibility across 144 PHP files: PASS
- Disposable databases cleaned after UAT: PASS

No Production connection, schema migration, deployment, commit or push occurred.

Decision: `PASS_LOCAL_COMPANY_WIDE_CATALOGUE_PHASE2_READY_FOR_REVIEW`\n