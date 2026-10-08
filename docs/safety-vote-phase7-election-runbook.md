# Safety Vote Election Runbook

Date: 2026-10-08
Contract: `2026-10-08-safety-vote-phase0-r1`
Phase 7 runtime contract: `2026-10-08-safety-vote-phase7-r1`
Governance amendment: `2026-10-08-safety-vote-phase8.1-she-governance-r1`

## Ownership and separation of duties

- SHE Owner: internally approves scope, eligible population, schedule, privacy mode, publication rule, retention and incident contacts; cannot alter accepted ballots.
- SHE Admin/Operations: performs backup/restore, clock, monitoring and rollback rehearsal.
- Certifier 1 and Certifier 2: for Certified Secret Election only, independently verify and bind the same result hash. They must be distinct authenticated employees.
- No adapter, Johnny workflow or Admin permission can vote, disclose hidden results or bypass dual certification.

## Pre-open checklist

1. Record immutable source revision and scoped file manifest; a dirty working tree is a blocker.
2. Verify configuration hash, frozen eligibility RuleHash/RowsHash and candidate/position membership.
3. Confirm every eligible account is usable and every exception has a reason/audit event.
4. Confirm Asia/Bangkok schedule, notification preview and duplicate-suppression window.
5. Verify private files, retention, report directory permissions and schema health fail closed.
6. Record authenticated SHE Owner acceptance with the exact phrase `I ACCEPT SHE_OWNER <CAMPAIGN_CODE>`; the system stores evidence and statement hashes.
7. Run authenticated desktop/mobile, accessibility, performance, load, concurrency and privacy adversarial gates.

## Close, count and certify

1. Close the campaign; do not inspect results while Open.
2. Run deterministic recount and require balanced participation/accepted-ballot reconciliation with zero secret identity mappings.
3. Resolve or formally void every boundary tie before certification.
4. Each assigned certifier independently verifies ResultHash and records a reason.
5. Publish only after two distinct active certifications bind the exact hash.
6. Generate certified PDF/Excel, verify ReportID, ResultHashSnapshot and ContentSha256 against the private file.

## Confirmed integration handoff

1. Read the adapter catalog and provider capability in read-only mode.
2. Preview the certified aggregate payload. It must declare `containsVoterIdentity=false`, `containsBallotChoice=false` and `externalMutation=false`.
3. Compare PreviewHash, ResultHash, ReportID and ReportSha256 with the signed runbook.
4. Type the exact phrase `CONFIRM CERTIFIED HANDOFF <RESULT_HASH_PREFIX>`.
5. Confirm only through an explicitly configured provider. Fixture mode records a receipt and performs no external delivery.
6. Duplicate confirmation must fail with `409`; hidden or singly certified results must fail closed.

## Incident, revocation and rollback

- On hash mismatch, identity mapping, unexpected adapter mode, missing certification or report corruption: stop, do not hand off, open an operational alert and preserve evidence.
- Certification revocation withdraws publication. Do not delete ballots, score sheets, result snapshots, reports, handoffs or audit history.
- Phase 7 rollback sets `phase7_integrations_enabled=0`; it does not drop tables or erase evidence.
- Runtime rollback restores only verified prior files. Additive Phase 7 tables remain unless a separately authorized data-retention decision is made.

## Verification commands

```powershell
npm run verify:safety-vote-phase7
npm run permission:audit
git diff --check
```

The repository-wide permission audit currently retains two unrelated FourM findings. Any new Safety Vote finding is a release blocker.
