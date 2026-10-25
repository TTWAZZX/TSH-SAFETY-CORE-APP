# Safety Vote Phase 7 Final Acceptance

Date: 2026-10-26 (Asia/Bangkok)
Scope: Local UAT only
Decision: `PASS_LOCAL_SAFETY_VOTE_PHASE7_FINAL_ACCEPTANCE_READY_FOR_CONTROLLED_PRODUCTION_PREFLIGHT`

## Accepted release scope

- Shared Node/PHP/Browser Workflow Profile covers Survey, Popular Vote, Secret Election, Submission Challenge, Nomination and Jury Scoring.
- The governed nine-step Admin Wizard adapts steps 4-6 by campaign type and applies conditional eligibility for Jury work sources.
- Company-wide catalogue/detail visibility remains independent from participant eligibility or Jury assignment.
- Every participant mutation is fail-closed by the shared authorization contract.
- Completed campaigns use Published immutable snapshots for company-wide official results, including explicit zero-participation/no-result rows.
- Manual and automatic release policies preserve Jury and Secret Election governance.
- Jury scoring uses the governed Work x Criteria Matrix and binds submitted score rows into Frozen Result integrity hashes.
- Question Image, Option Image, Work Cover and Work Gallery use atomic server-confirmed media mutations with retained audit evidence.
- The frontend release cache chain is unified at `20261025-safety-vote-final-phase7-r1`.

## Verification evidence

### Static, parity and compatibility

- Final integration contract: PASS for six campaign types.
- Workflow Profile Node/PHP/Browser parity: PASS for eight variants.
- Participation authorization Node/PHP parity: PASS for 15 actions and fixtures.
- Phase 1, 3, 4, 5 and 6 Node/PHP parity: PASS.
- Adaptive Wizard, Work Items, Jury Matrix, Company Visibility, close/finalization and release-policy static gates: PASS.
- Project-wide PHP 7.4 compatibility: PASS across 158 PHP files.

### Schema lifecycle

- Company-wide visibility, remediation, result-release policy, Jury Work Items/Atomic Media and Eligibility amendment migrations: PASS.
- Every tested migration is additive and idempotent; rollback is data-preserving.
- Phase 3 clean-install UAT now applies the current Official Top N, result-release and Jury Work Item migrations before runtime boot.

### API and integrity

- Local runtime health reports `ready=true`; Jury Work Items, Atomic Media and Company-wide Visibility capabilities are ready.
- Anonymous catalogue/result access is `401`; ordinary-user Admin access is `403`; closed mutation is `409` with ballots unchanged.
- Survey, Submission, Gallery, Nomination, Jury, Popular Vote and Secret Election UAT passes in Node and PHP.
- Jury manual/automatic governance, zero-vote automatic release, concurrent 20-voter load, recount, dual certification, reports and revocation pass.
- Local integrity audit reports 5 campaigns, 3 eligibility snapshots, 7,633 eligible-voter rows, 0 ballots, 2 result snapshots, 10 result rows, 1 certification and 1 report. Invalid result hashes: 0. Remaining visibility remediation candidates: 0.
- Post-run residue audit is zero after removing two explicitly identified stale disposable test schemas; the Local UAT business database was not modified by that cleanup.

### Responsive browser

- Admin Wizard: PASS at 390, 430, 768, 1366 and 1920 px.
- Public Work Gallery/viewer: PASS at 390, 768 and 1366 px.
- Completed official results: PASS at 390, 768 and 1366 px with immutable snapshot, explicit no-result, no horizontal overflow, no Safety Vote 5xx and 44 px minimum controls.
- Eligibility Admin/User UX: PASS at 320, 390, 430, 768, 1366 and 1920 px.

Evidence directories:

- `backups/local/safety-vote-admin-guided-drafts-1792948441950/`
- `backups/local/safety-vote-jury-work-items-1792948456483/`
- `backups/local/safety-vote-close-finalization-browser-1792948464816/`
- `backups/local/safety-vote-phase3-browser-1792948338557/`
- `backups/local/safety-vote-phase4-browser-1792948382252/`

## XAMPP Local UAT recovery

XAMPP MariaDB failed to start because the Aria checkpoint log was corrupt. Before repair, the Aria log and `mysql` system tables were copied to `backups/local/xampp-aria-repair-20261026-0005/`. All 24 Aria system tables were recovered and verified offline, the corrupt numbered log was retained in the backup, and MariaDB returned to `mysqladmin ping` healthy on port 3306. No business database directory was deleted or replaced.

## Release boundary

- Local frontend, backend and MariaDB remain available for UAT.
- External delivery/adapters remain disabled.
- No Production connection, Production migration, deployment, commit or push occurred.
- Production rollout still requires an IT-controlled backup, configuration review, migration dry-run, approved maintenance window and post-deploy smoke test.

## Repeatable gate

Run from the repository root:

```powershell
npm run verify:safety-vote-final-acceptance-phase7
```

The command executes static/parity/PHP 7.4 checks, disposable migration/rollback tests, Local/disposable Node/PHP API UAT and responsive Browser UAT.
