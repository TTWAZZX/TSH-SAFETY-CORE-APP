# Safety Vote Result Release Policy — Phase 4

Date: 2026-10-25
Scope: Local UAT only
Decision: `PASS_LOCAL_SAFETY_VOTE_RESULT_RELEASE_POLICY_PHASE4`

## Outcome

Safety Vote now stores a versioned `manual` or `automatic` result-release policy on each campaign version. New Drafts default to `automatic`; existing versions remain `manual` after migration unless an Admin changes a Draft. The policy is immutable after the campaign leaves Draft and every change is audited.

The Wizard exposes the policy beside Official Top N and explains the workflow for the selected campaign type. Visibility remains independent from participation authorization.

## Release behavior

| Campaign workflow | Automatic policy | Manual policy |
| --- | --- | --- |
| Popular Vote | Closing or expiry creates an immutable snapshot and publishes it immediately. Zero accepted ballots produce explicit `no_result` rows with null rank. | Closing creates a Frozen snapshot for the existing Admin review/certify/publish flow. |
| Jury Scoring | Calculation and freeze remain required. Publication occurs only after the configured certification step succeeds. | Admin continues Calculate → Freeze → Certify → Publish. |
| Secret Election | Recount and reconciliation remain required. Publication occurs only after both independent certifiers approve the exact result hash. | Admin continues Recount → dual certify → Publish. |
| Other governed workflows | The shared contract holds publication until the workflow reaches Certified with governance ready. | The existing governed release actions remain available. |

Automatic release never bypasses reconciliation, tie handling, jury assignment, independent certification or result-hash verification.

## Runtime and schema

- Additive/idempotent migration: `20261025_safety_vote_result_release_policy.sql`
- Data-preserving rollback retains `ResultReleasePolicy` and removes only the contract marker.
- Shared decision contract: `2026-10-25-result-release-policy-r1`
- Node/PHP campaign, close-finalization, jury-certification and secret-election paths use the same policy decisions.
- Lifecycle responses now return the effective `Published` state when close finalization publishes immediately.
- The Local UAT schema is active at `2026-10-25-result-release-policy-r1`; protected business-row counts remained unchanged.

## Verification evidence

- Result release Node/PHP parity and static contract: PASS.
- Popular Vote early close with zero ballots: Node PASS, PHP PASS; two `no_result` rows, no fabricated rank, snapshot/campaign Published.
- Jury manual and automatic certification workflows: Node PASS, PHP PASS.
- Secret Election automatic release: Node PASS, PHP PASS; first certification remains pending, publication occurs only after the second independent certification.
- Phase 4 responsive authenticated Browser UAT at desktop and 390 px: PASS.
- Admin guided Draft Browser UAT across five viewports: PASS.
- Official Results Browser UAT at 390×844 and 1366×768: Published/no-result, no overflow, no server 5xx.
- Company-wide final Local API regression: PASS; anonymous 401, ordinary-user Admin 403, closed mutation 409, immutable official result 200 with no identity fields.
- PHP lint: PASS across 245 discovered local PHP files.
- Project PHP 7.4 static compatibility: PASS across 156 project PHP files.

Evidence directories:

- `backups/local/safety-vote-phase4-browser-1792930072087/`
- `backups/local/safety-vote-admin-guided-drafts-1792930190540/`
- `backups/local/safety-vote-workflow-results-phase01-1792930181825/`
- `backups/local/safety-vote-close-finalization-browser-1792930274132/`

No Production connection, external delivery, deployment, commit or push occurred.\n