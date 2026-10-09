# Safety Vote Phase 9.3 — Rehearsal Runbook

Contract: `2026-10-09-safety-vote-phase9.3-r1`
Scope: Local or separately authorized isolated environment only
Owner: SHE
Default decision: `HOLD`

## Purpose

Use the rehearsal endpoint to prove that a Draft campaign is operationally ready without opening the campaign, freezing new eligibility, creating ballots, recording participation, queuing notifications, generating reports, certifying results or calling an external adapter.

Rehearsal is read-only. A `PASS` is evidence for review, not authorization to deploy or open a campaign.

## Roles

| Role | Responsibility |
| --- | --- |
| SHE owner | Approves rehearsal scope and owns the final operational decision |
| Safety Vote operator | Runs the checklist and captures privacy-safe evidence |
| Eligibility owner | Explains every added, removed or changed Employee ID |
| Privacy observer | Confirms no ballot choice, answer, receipt, personal name or email is captured |
| Technical observer | Monitors API/database health and invokes stop conditions |

The operator must not be the sole reviewer of their own eligibility changes. Production credentials and real voter exports are prohibited in a Local rehearsal.

## Entry criteria

- Campaign and current version are both `Draft`.
- `module_enabled=1` only in the guarded rehearsal database.
- Saved eligibility rules exist.
- At least one active question exists.
- A frozen baseline snapshot exists for comparison.
- The environment is loopback/isolated and its database name matches the approved disposable guard.
- No Production connection, external adapter, SMTP delivery or notification transport is enabled.
- Before-state fingerprint and cleanup owner are recorded.

If any entry criterion is absent, stop with `HOLD`; do not compensate by manually changing database rows during the run.

## Execute

Authenticated endpoint:

```text
POST /api/safety-vote/admin/campaigns/{campaignId}/rehearsal
Permission: SAFETY_VOTE_ADMIN
Content-Type: application/json

{
  "mode": "dry_run",
  "confirmation": "REHEARSE {CampaignCode}"
}
```

The confirmation is case-sensitive and must use the server-owned campaign code. Do not put passwords, bearer tokens or idempotency keys into screenshots, reports or command history.

## Required response checks

- HTTP `200` and `success=true`.
- `rehearsal=true`, `dryRun=true`.
- `businessMutation=false` and `externalDelivery=false`.
- `mutationGuard.businessRows=0`.
- Every item in `checks` is `pass`.
- `eligibility.current.rowsHash` equals the frozen baseline hash.
- Eligibility diff added/removed/changed counts are all zero.
- `decision=PASS` and `ready=true`.
- `rehearsalHash` is a 64-character SHA-256 value.

Any failed check means `HOLD`. Never reinterpret `HOLD` as a warning-only result.

## Stop conditions

Stop immediately and follow the incident runbook if any of these occurs:

- ballot, participation, request-key, score, result, certification, report, notification or export row changes;
- external delivery or SMTP/network activity;
- response contains a voter name, email, answer, ballot choice, receipt or identity-to-choice mapping;
- Node/PHP decisions or diff counts disagree;
- schema/configuration becomes unavailable;
- an unexpected `5xx`, browser exception or database residue appears.

## Evidence and exit

Save only the bounded response summary, check states, counts, hashes, runtime versions and cleanup result. Do not save authorization headers or unbounded eligibility lists.

Exit is successful only when evidence hash verification passes, database/private-file residue is zero and the environment is disabled or dropped. Production release remains governed by its separate immutable-source and authorization gates.
