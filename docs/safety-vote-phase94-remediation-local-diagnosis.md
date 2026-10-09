# Safety Vote Phase 9.4 — Remediation Local Diagnosis and Corrected Review Candidate

Date: 2026-10-09

Scope: Local only

Decision: `CORRECTED_REMEDIATION_CANDIDATE_READY_FOR_REVIEW_NOT_AUTHORIZED_FOR_PRODUCTION_RETRY`

## Outcome

The `REMEDIATION_FAILED` cause was reproduced and corrected using only the previously downloaded Production schema/settings evidence. No Production network connection, retry, mutation, protected recheck, runtime deployment or push occurred during diagnosis.

The corrected source is a review candidate only. It deliberately has no package command for Production execution. The current Production value of `module_enabled` remains unverified after the failed attempt and must not be inferred from Local results.

## Root cause

The Production schema defines:

```text
SafetyVote_Settings.UpdatedBy VARCHAR(20)
```

The failed helper attempted to write:

```text
phase94_guarded_disable
```

That actor is 23 characters. Against the restored schema, `STRICT_TRANS_TABLES` reproduces `ER_DATA_TOO_LONG`. With Local non-strict SQL mode, the same value is silently truncated to `phase94_guarded_disa`, confirming that the source violates the column contract even when a development database does not throw.

This is the concrete transaction defect consistent with the value-suppressed Production `500`. Because the failed helper did not return a bounded failure stage, the historical response cannot independently prove its internal exception line; this observability limitation is also corrected.

A second defect was found during exact restored-fixture execution: the helper required a case-sensitive `SafetyVote_Settings` name from `INFORMATION_SCHEMA`. Windows MySQL normalizes the restored table name to lowercase, causing a false `SCHEMA_NOT_EXPECTED_PHASE7`. Production evidence preserved mixed-case names, so this explains the initial Local reproduction failure rather than the Production `500`, but it is a real portability defect.

## Corrected review candidate

- Replaces the oversized actor with `phase94_disable` (15 characters).
- Normalizes the 39-table inventory by lowercase table name while retaining the actual identifier for bounded count queries.
- Returns only a bounded `failureStage` enum with `REMEDIATION_FAILED`; it does not expose SQL, configuration, credentials or exception text.
- Preserves exact contract/schema, integrations-disabled and zero-business-row preconditions.
- Retains serializable transaction, exact one-row update, automatic rollback on exception, private rollback artifact, double-download hash verification, `.htaccess` byte-exact restoration and zero-residue cleanup controls.
- Keeps the corrected Production orchestrator without an npm command so it cannot be invoked accidentally.

Review files:

- `backend/scripts/safety-vote-phase94-disable-helper.php.template`
- `backend/scripts/safety-vote-phase94-disable-production.js`
- `backend/scripts/safety-vote-phase94-remediation-local-regression.test.js`

## Regression evidence

Command:

```text
npm run test:safety-vote-phase94-remediation-local
```

The test ran twice successfully. Each run:

- required loopback DB host and a guarded disposable database name;
- restored the accepted 61,012-byte, 39-table Production schema/settings snapshot;
- reproduced `ER_DATA_TOO_LONG` for the old actor under strict SQL mode;
- verified the corrected helper changes exactly one `module_enabled` row from `1` to `0`;
- kept `phase7_integrations_enabled=0`;
- kept Safety Vote business rows at zero before and after;
- verified rollback SQL preserves the prior value, timestamp and actor;
- removed helper, guard, rollback directory, temporary config and tokens;
- dropped the disposable database and reported residue `0`.

Compatibility gates also pass:

- Phase 9.3 aggregate, including Phase 9.2 adversarial, Phase 9.1 Jury Progress and disabled-mode parity;
- UX Phase 8 static/unit/accessibility contract: 48 assertions;
- Node syntax, PHP lint and `git diff --check`.

## Release posture

This diagnosis does not authorize a Production retry. A separate instruction must explicitly name the corrected candidate commit and authorize a fresh one-time attempt. That attempt must first perform a read-only setting/schema/business-row check, then use a new random helper/token/guard and stop at any bounded failure stage. A successful change must still be followed by a fresh protected preflight before Phase 9.5 can be considered.
