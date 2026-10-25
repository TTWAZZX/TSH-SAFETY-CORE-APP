# Safety Vote Company-wide Visibility Remediation Phase 6

Date: 2026-10-25
Environment: loopback Local UAT only
Decision: `PASS_LOCAL_COMPANY_VISIBILITY_REMEDIATION_PHASE6`

## Remediation contract

- Dry-run is the default and performs no business mutation. It classifies each campaign as `remediate`, `unchanged` or `excluded` and produces a deterministic preview hash plus exact confirmation text.
- Apply requires `SAFETY_VOTE_MANAGE`, an enabled independent feature gate, a bounded reason, an idempotency key, the current preview hash and exact `REMEDIATE COMPANY VISIBILITY <hash-prefix>` confirmation.
- Only eligible legacy `eligible_only` campaign rows are changed to `public_listing`. Draft may be remediated for its future publication, while Voided, hidden and test campaigns are excluded.
- Apply locks candidate rows and verifies RowVersion so a stale dry-run cannot overwrite concurrent Admin work.
- Every applied row is retained in an immutable remediation batch/item record and a Safety Vote audit entry. Replaying an idempotency key returns the original outcome.
- Conflict-safe rollback requires exact `ROLLBACK COMPANY VISIBILITY <batch-id>` confirmation and restores only rows that still match the applied target/version. Rollback disables no evidence and deletes no records.

## Local result

- Initial dry-run: 4 total, 1 remediation candidate, 0 unchanged, 3 excluded as Voided.
- Applied batch `1`: campaign `SHE-003-2026` changed from `eligible_only` to `public_listing`.
- Post-remediation dry-run: 4 total, 0 remediation candidates, 1 unchanged company-wide campaign and 3 excluded Voided campaigns.
- Current preview hash: `28498601985ffee91726fcce33ad4fbd3404afa1e40761044b364e72bac65ae2`.

Protected evidence counts remained exact:

| Evidence | Count |
| --- | ---: |
| Eligibility snapshots | 3 |
| Eligible voters | 7,633 |
| Participation / ballots / answers | 0 / 0 / 0 |
| Jury assignments / scores | 0 / 0 |
| Result snapshots / rows | 2 / 10 |
| Certifications / reports | 1 / 1 |

## Verification

- Static security/contract checks: PASS.
- Shared Node/PHP plan/hash parity: PASS.
- Additive migration, repeated migration and data-preserving rollback: PASS.
- Disposable Node/PHP API UAT: PASS for stale-preview rejection, apply, idempotent replay, protected-count preservation and rollback.
- Post-apply Local dry-run: PASS with zero remaining candidates.
- Project-wide PHP 7.4 compatibility: PASS across 149 PHP files; changed PHP files lint clean.

No Production connection, external delivery, deployment, commit or push occurred.\n