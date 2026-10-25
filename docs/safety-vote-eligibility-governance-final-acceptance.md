# Safety Vote Eligibility Governance Final Acceptance

Date: 2026-10-24
Environment: Local loopback and disposable databases only
Decision: `PASS_LOCAL_ELIGIBILITY_GOVERNANCE_FINAL_ACCEPTANCE`

## Accepted scope

- Node and PHP implement the same eligibility-addition and governed-removal contract.
- Removal is permission-gated, feature-gated, limited to `Scheduled`/`Open`, requires `admin_approval`, exact confirmation and the fixed `unstarted_only` policy.
- Historical evidence is append-only: a removal creates a child eligibility snapshot and does not rewrite prior eligibility snapshots, participation, ballots or frozen results.

## Verification matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Node/PHP parity | Preview hashes, candidate hashes, applied row hashes, event-chain hashes, response shapes and retained result evidence compared across both runtimes | PASS |
| Access control | Anonymous `401`; ordinary authenticated user `403`; explicit `SAFETY_VOTE_ELIGIBILITY_MANAGE` user grant `200`; Admin allowed | PASS |
| Removal policy | Disabled gate, wrong confirmation, protected activity, duplicate removal and idempotent replay covered | PASS |
| Snapshot integrity | Only the current eligibility lineage advances; prior snapshot rows and the submitted participant's original `SnapshotID` remain unchanged | PASS |
| Ballot integrity | Accepted ballot status, identity, canonical hash and participation receipt hash remain unchanged | PASS |
| Result integrity | Frozen result `EligibilitySnapshotID`, input/result hashes, counts, result rows and active certification remain unchanged | PASS |
| Mobile and responsive UX | 320×667, 390×844, 430×932, 768×1024, 1366×768 and 1920×1080; exact-confirmation interaction, removal disclosure, 44 px targets and no horizontal overflow | PASS |
| PHP compatibility | Project-wide PHP 7.4 static contract across 144 PHP files | PASS |

## Final command

```text
npm run verify:safety-vote-eligibility-final
```

The command passed the eligibility static/API/migration suites, guarded Node/PHP lifecycle UAT, responsive Browser UAT, People Picker, campaign dashboard, official reports, Phase 5 parity, UX Phase 5/8 and PHP 7.4 compatibility.

No Production connection, deployment, commit or push occurred. Disposable Node/PHP databases were removed after the run.\n