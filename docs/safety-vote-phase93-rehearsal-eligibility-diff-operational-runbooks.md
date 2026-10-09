# Safety Vote Phase 9.3 — Rehearsal, Eligibility Diff and Operational Runbooks

Date: 2026-10-09
Contract: `2026-10-09-safety-vote-phase9.3-r1`
Authoritative source baseline: `077c5977283a55756bdfcfe5dfb804e32f716aa8`
Scope: Local only
Decision: `PASS_LOCAL_REHEARSAL_RELEASE_REMAINS_HOLD`

## Outcome

Phase 9.3 adds a fail-closed, read-only rehearsal to both Node and PHP without adding a table or migration. An Admin can evaluate a Draft campaign against current Master data, compare it with the latest frozen eligibility snapshot and obtain bounded operational readiness evidence without opening the campaign or creating Safety Vote business data.

Production was not connected, deployment was not attempted, and no commit or push occurred. Production release remains `HOLD` because the candidate source is not committed/immutable and the existing release-preflight authorization has not changed.

## Rehearsal contract

`POST /api/safety-vote/admin/campaigns/{campaignId}/rehearsal` requires `SAFETY_VOTE_ADMIN`, a Draft campaign/current version and the exact body:

```json
{
  "mode": "dry_run",
  "confirmation": "REHEARSE {CampaignCode}"
}
```

The response explicitly reports `rehearsal=true`, `dryRun=true`, `businessMutation=false` and `externalDelivery=false`. Readiness checks cover Draft state, saved eligibility rules, active questions, frozen baseline, eligible population, account readiness, Master-data warnings, eligibility drift and pre-existing business residue. Any blocking check yields `HOLD`; a rehearsal `PASS` does not authorize opening, deployment or external delivery.

The mutation guard checks ballots, participation, request keys, jury scores, result snapshots, certifications, reports, notifications and export jobs. The regression fingerprints every Safety Vote table before and after the stable, drift and residue rehearsals and requires byte-equivalent canonical state.

## Eligibility diff and privacy boundary

The server derives a canonical current eligibility projection and compares it with the latest frozen snapshot. It reports added, removed, changed and unchanged counts. Lists contain Employee IDs only, are deterministically sorted and are capped at 100 entries per category with an explicit truncation flag.

Names, emails, answers, ballot choices, receipts and voter-to-choice mappings are excluded. A non-zero added, removed or changed count blocks readiness until the eligibility owner has explained and approved the change through the normal governed process; rehearsal never modifies or replaces the frozen snapshot.

## Operational runbooks

- `docs/safety-vote-phase93-rehearsal-runbook.md` — entry criteria, roles, exact execution, PASS/HOLD interpretation, evidence and cleanup.
- `docs/safety-vote-phase93-eligibility-diff-runbook.md` — diff semantics, privacy boundaries, triage and approval rules.
- `docs/safety-vote-phase93-incident-rollback-runbook.md` — severity, containment, disable procedure, data-preserving rollback and recovery gates.

The runbooks prohibit ad hoc deletion, manual status repair and use of Production credentials in Local rehearsal. Unexpected mutation, external delivery, protected-data disclosure, runtime disagreement, `5xx` or residue is a stop condition.

## Verification

The final Phase 9.3 gate passed:

- Operational runbook/static contract: 18 assertions.
- Guarded Node/PHP rehearsal and eligibility-diff regression: stable `PASS`; exact one added, removed and changed identity produces `HOLD`; notification residue produces `HOLD`; exact-confirmation and permission denial pass.
- Full Safety Vote table fingerprints remain unchanged across rehearsal requests.
- Node/PHP normalized response parity passes, including a 64-character rehearsal SHA-256.
- Phase 9.2 independent adversarial security suite passes with zero database/private-file residue.
- Phase 9.1 Jury Progress regression and Phase 8.3.1 disabled-mode parity pass.
- Existing Phase 1/2 campaign, eligibility, ballot, concurrency, result/export lifecycle passes for Node/PHP and authenticated desktop/390 px Browser UAT.
- Existing Phase 3 survey/submission/nomination lifecycle passes for Node/PHP and authenticated desktop/390 px Browser UAT.
- PHP syntax, Node syntax/static checks and `git diff --check` pass; only pre-existing line-ending warnings are emitted.

Accepted evidence: `backups/local/safety-vote-phase93-1791513012687/`
Result SHA-256: `c0efd22bde566e1aa095f58448941e46a4977369f096a7af97661af916178c7c`
Disposable database residue: `0`

Additional compatibility evidence:

- `backups/local/safety-vote-phase2-browser-1791512899277/`
- `backups/local/safety-vote-phase3-browser-1791512935963/`

## Residual risk and release decision

Rehearsal validates server-visible readiness and governed drift; it does not simulate a real external notification provider, prove cryptographic anonymity against database/server operators, authorize a campaign opening or replace Production backup/restore and authenticated smoke requirements. An Employee ID remains personal data and the bounded evidence must stay in restricted storage under the documented retention process.

Decision: `PASS_LOCAL_REHEARSAL_RELEASE_REMAINS_HOLD`.
