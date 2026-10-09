# Safety Vote Phase 9.3 — Eligibility Diff Triage Runbook

Contract: `2026-10-09-safety-vote-phase9.3-r1`
Owner: SHE with the eligibility owner
Default on any unexplained drift: `HOLD`

## Diff meaning

The server compares the latest frozen snapshot with the current result of saved eligibility rules evaluated against current Master Data.

| Category | Meaning | Required action |
| --- | --- | --- |
| Added | Current rules include an Employee ID absent from the frozen snapshot | Confirm onboarding, organization and intended inclusion |
| Removed | Frozen snapshot contains an Employee ID no longer selected | Confirm transfer, termination, rule change or Master correction |
| Changed | Employee remains eligible but department/unit/position/role/team/account readiness changed | Confirm the authoritative Master change and downstream privacy impact |
| Unchanged | Canonical eligibility projection is identical | No individual action; retain aggregate count only |

Names, emails and ballot information are intentionally absent. Employee IDs are bounded to 100 per category; `truncated=true` requires an authorized server-side review, not client-side guessing.

## Triage sequence

1. Confirm the campaign ID/code and frozen snapshot number/hash.
2. Confirm the current rule hash matches the reviewed saved rule set.
3. Assign every added/removed/changed Employee ID to the eligibility owner.
4. Resolve Master warnings and accounts that are not ready.
5. Record a reason outside ballot/audit content for each accepted difference.
6. Update rules or Master Data only through their owning workflow.
7. Run eligibility preview, then perform a separately confirmed freeze if policy permits.
8. Re-run rehearsal; require zero unexplained drift and matching rows hash.

Do not edit `SafetyVote_EligibleVoters`, snapshot hashes or counts directly. Do not delete an old snapshot to make the diff disappear.

## Privacy review

- Review Employee IDs only with personnel authorized for eligibility administration.
- Never join the diff to ballots, answers, receipts, request keys, IP addresses or user-agent data.
- Never email or externally dispatch the raw diff from rehearsal mode.
- For secret/anonymous campaigns, verify identity-mapping rows remain zero independently of the eligibility diff.
- If a small organizational group could be inferred, keep evidence at aggregate count/hash level.

## Decision

Return `PASS` only when added, removed and changed counts are zero, or when an approved new freeze has established the reviewed state and the next rehearsal is stable. Any unexplained item, truncation without authorized review, warning, unready account or hash mismatch remains `HOLD`.
