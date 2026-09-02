# BBS Smart Card Phase 10D-1 — Checklist Readiness & Observation Eligibility

Status: Local complete; not deployed.

## Outcome

The existing permission-scoped employee list now includes a server-calculated `ChecklistReadiness` object. The calculation uses the same Employee Master Department, Safety Unit, Position, BBS Level, effective date and Checklist scope rules used when an Observation is created.

Only `READY` enables a new Single or Batch Observation. The UI explains `NO_CHECKLIST`, `SCOPE_MISMATCH`, `VERSION_NOT_PUBLISHED`, `VERSION_NOT_EFFECTIVE`, `CHECKLIST_CONFLICT` and unknown results. Existing Drafts remain resumable because their Checklist version and answer snapshots were already frozen.

## Server authority

The readiness projection prevents avoidable starts but does not replace workflow validation. Single Draft creation and Batch preview/draft resolve each employee again on the server. The client never sends or chooses a Checklist version.

## Compatibility

- No database migration or data update.
- No route, authorization, Master/Pilot configuration or rollout change.
- No change to Observation immutability, Batch atomicity or per-employee records.
- No upload or private-storage change.
- Production remains behind `staged_admin_only=1`.

## Verification

- Node/PHP readiness fixture parity.
- Single/Batch server-guard contract coverage.
- Phase 10A, 10B-1 through 10B-4 and 10C-1 through 10C-3 regression contracts.
- Authenticated Chrome UAT at 390 px and 1365 px with accessible disabled-control reasons and no horizontal overflow.
