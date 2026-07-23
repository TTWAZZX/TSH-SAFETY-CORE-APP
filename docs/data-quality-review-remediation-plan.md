# Phase 6: Data Quality Review and Remediation Planning

## Scope and safety boundary

Phase 6 is an inventory and planning phase. It does not change the database, application workflow,
schema, authentication, onboarding state machine, or historical snapshots. The audit opens a
`READ ONLY` transaction, issues four ordered `SELECT` statements, and closes the snapshot with
`ROLLBACK`. It never emits a remediation statement or chooses a Safety Unit for an employee.

The audit reads `Password` only to ask the existing onboarding resolver whether the password gate has
priority. Password values, hashes, and tokens are never copied into either report format. Runtime JSON
can contain EmployeeID and profile values needed for review, so it must be handled as restricted data
and must not be committed to the repository.

Run the human report with:

```powershell
npm run audit:data-quality
```

Run the machine-readable report with:

```powershell
npm run audit:data-quality:json
```

The process exits with `0` after a complete audit even when classified findings exist, `1` for a
connection/query/incomplete execution error, and `2` when master data is ambiguous and employee
classification must fail closed.

## Classification model

`EXPECTED_PASSWORD_PENDING` has priority because it is obtained from the shared Phase 1 resolver.
An employee has one primary A-F classification. G, H, and J are additional profile findings, so their
counts can overlap a primary classification. A password-pending record may also be reported in D, E,
or F when a nonblank invalid value is already visible; this does not bypass the password gate.

| Classification | Interpretation | Phase 6 action |
| --- | --- | --- |
| EXPECTED_PASSWORD_PENDING | Password is null or MustChangePassword is set | Observe only; blank Unit is expected |
| EXPECTED_SAFETY_UNIT_PENDING | Password gate passed and a required Unit is blank | User must select through onboarding |
| READY_VALID | Unit is valid, or Department has no units and Unit is blank | No remediation |
| INVALID_UNIT_FOR_DEPARTMENT | Nonblank Unit is not allowed for Department | Owner/user confirmation; never guess |
| UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS | Unit exists for a Department with no master units | Investigate source; never auto-clear |
| UNKNOWN_DEPARTMENT | Department does not match the master after shared normalization | Investigate master and source first |
| INVALID_POSITION | Nonblank Position does not match the global position master | Review manually; no fuzzy matching |
| HIDDEN_WHITESPACE_OR_LINEBREAK | Profile field has leading/trailing whitespace or CR/LF | Exact candidate only; no write-back |
| MASTER_DATA_AMBIGUITY | Normalized duplicate, blank, or orphaned master record | Stop/fail closed; resolve governance first |
| OTHER_PROFILE_ANOMALIES | Blank required value, invalid type, or schema-length violation | Manual review |

Normalization is for comparison only and reuses `normalizeOnboardingName`: CR/LF removal, trim,
whitespace-insensitive comparison, and case-insensitive comparison. The report also shows the less
destructive trim/linebreak-cleaned display candidate for review. Neither value is written back.

## Read-only database result (2026-07-22)

| Metric | Count |
| --- | ---: |
| Employees | 2,492 |
| Master Departments | 41 |
| Master Safety Units | 26 |
| Global Master Positions | 23 |
| PASSWORD_CHANGE_REQUIRED | 2,453 |
| SAFETY_UNIT_REQUIRED | 3 |
| READY | 36 |
| EXPECTED_PASSWORD_PENDING | 2,453 |
| EXPECTED_SAFETY_UNIT_PENDING | 3 |
| READY_VALID | 36 |
| INVALID_UNIT_FOR_DEPARTMENT | 0 |
| UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS | 0 |
| UNKNOWN_DEPARTMENT | 0 |
| INVALID_POSITION | 1 |
| HIDDEN_WHITESPACE_OR_LINEBREAK | 8 |
| MASTER_DATA_AMBIGUITY | 0 |
| OTHER_PROFILE_ANOMALIES | 0 |
| Unique employees with data-defect findings | 9 |

There are 2,111 password-pending users whose Unit is blank across all Departments. Of those, 1,900
belong to a Department that will require a Safety Unit later. The other 3 blank required Units belong
to users already at `SAFETY_UNIT_REQUIRED`. Therefore, the earlier raw “missing required Unit” total of
1,903 is exactly 1,900 expected password-pending records plus 3 users who must select for themselves.
None of these 1,903 records is an administrator bulk-fill candidate.

The current remediation candidates are one invalid Position and eight employees with formatting
findings. The unique affected count is nine. The detailed runtime JSON identifies EmployeeID and exact
candidate values for authorized review without exposing passwords. No candidate was applied.

## Remediation decision matrix

| Finding | State/defect | Risk | Decision owner | Proposed next action | User choice | Automatic fix | Approval/backup | Verification | Rollback concept |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Password-pending blank Unit | Expected state | Low if untouched; high if guessed | User/onboarding owner | Let Phase 3 then Phase 4 run | Required where Department has units | No | Not applicable | Resolver moves through gates | Not applicable |
| Safety-Unit-pending blank Unit | Expected state | High if selected by admin | User | Select through Phase 4 | Required | No | Not applicable | Fresh resolver returns READY | Phase 4 transaction already protects failure |
| Invalid Unit | Data defect | Wrong safety routing | User and data owner | Confirm the correct Unit against master | Required | No | Explicit approval and point-in-time backup | Audit plus resolver after approved change | Restore captured original value |
| Unexpected Unit | Data defect | Loss of possibly meaningful legacy value | Data owner | Investigate Department/master/source | Usually | No | Explicit approval and point-in-time backup | Audit classification clears | Restore captured original value |
| Unknown Department | Data/master defect | Resolver fails closed | Master-data owner | Fix source/master governance before employee data | Possibly | No | Explicit approval and point-in-time backup | Resolver and cross-system audit | Restore original/master snapshot |
| Invalid Position | Data defect | Incorrect profile/permission interpretation | HR/data owner | Confirm exact global master value; no fuzzy match | Owner confirmation | No in Phase 6 | Explicit approval and point-in-time backup | Profile audit returns valid Position | Restore captured original value |
| Hidden whitespace/CR/LF | Formatting defect | Integration mismatch if left; unintended display change if guessed | Data owner | Review exact before/after candidate | Usually no, but owner review required | No in Phase 6 | Explicit approval and point-in-time backup | Rerun audit and compare affected EmployeeID | Restore captured original value |
| Master ambiguity | Master governance defect | Non-deterministic validation | Master-data owner | Resolve duplicate/orphan first | No | No | Change-control approval and backup | Audit exits 0 and resolver builds index | Restore master snapshot |
| Other profile anomaly | Data defect | Validation or display failure | HR/data owner | Case-by-case correction plan | Depends | No | Explicit approval and point-in-time backup | Rerun validator/audit | Restore captured original value |

Any future remediation must be a separately approved phase with an exact target list, captured original
values, transaction boundaries, dry-run review, post-change resolver/audit checks, and a rollback artifact.
Phase 6 intentionally contains no executable remediation SQL.

## Cross-system and historical-data boundary

The audit calls the Phase 1 Node resolver for onboarding state. Phase 6 tests send the same sanitized
fixture set to the existing PHP resolver and require identical results. Existing Phase 1-5 regression
tests remain the authority for Node/PHP endpoint behavior.

Current employee profile data remains canonical in `employees`. Historical Patrol, CCCF, KY, Hiyari,
4M, Yokoten, training, accident, and other workflow snapshots are not inspected as write targets and
are never rewritten by this audit.

## Next phase boundary

Phase 7 should adopt the reusable profile validator at ADMIN, IMPORT, and REGISTRATION employee write
paths without altering the self-profile or onboarding flows. It must preserve each path's authorization
and response contract, validate against fresh master data, and use transactions for actual writes. That
work is separate from the remediation candidates recorded here.
