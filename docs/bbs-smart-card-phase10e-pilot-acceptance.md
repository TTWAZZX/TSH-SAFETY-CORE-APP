# BBS Smart Card Phase 10E - Pilot Acceptance & Production Rollout

Status: Pilot acceptance in progress; ordinary-user rollout is not approved.

## Safety boundary

- Keep `BBS_Settings.staged_admin_only=1` during Pilot preparation. Controlled multi-role UAT uses the separately approved `staged_admin_only=0`, `pilot_scope_only=1` mode; company-wide `0/0` remains prohibited until final approval.
- Controlled Pilot access is based on effective inspector enrollment or effective team membership inside an Active Pilot scope. A matching Department/Unit alone does not grant access.
- The acceptance audit is SELECT-only. It does not create Pilot data, change a feature flag, send email, deploy files, or open access to ordinary users.
- Opening access is a separate business decision after the gate reports `READY_FOR_ROLLOUT_REVIEW` and the business owner gives explicit approval.

## Repeatable gate

Run:

```powershell
npm --prefix backend run audit:bbs-phase10e
```

Possible decisions:

- `PLATFORM_BLOCKED`: staged safety, feature flags, data integrity, or Unsafe-to-Action reconciliation failed.
- `CONFIGURATION_REQUIRED`: the approved Maintenance / Tube Cutting roster, inspector, team, schedule, Checklist, card, QR, or Community handler is incomplete.
- `PILOT_EXECUTION_REQUIRED`: configuration is ready but representative business workflows have not yet been accepted.
- `READY_FOR_ROLLOUT_REVIEW`: technical/configuration/evidence gates pass; this is not permission to open rollout automatically.

## Required Pilot acceptance evidence

1. Group Leader can open the module on a real phone and sees only the effective assigned team.
2. Checklist readiness is `Ready`; unavailable employees are disabled with the server reason.
3. Submit one Single Observation and one Batch Observation covering at least two separate employees.
4. Exercise Safe, Unsafe and N/A answers. Unsafe requirements and automatic Corrective Action creation must match the Published Checklist snapshot.
5. Confirm Draft autosave/recovery, duplicate-submit protection, immutable Submitted history and private evidence retrieval.
6. Confirm inspector schedule/KPI states, dashboard, History filters/pagination and Analytics export agree.
7. Preview/issue/print one Personal Card and preview/print one Department Card without exposing the one-time QR secret.
8. Submit one Community Good report and one Community Risk report. Good hides reporter identity; Risk detail/evidence/Action History remains Admin-only.
9. Review Action Email Outbox. Queued/Failed rows require an accepted operational result or a successful Admin retry; tests must not send real mail without explicit approval.
10. Verify Admin, appointed Group Leader, Operator, unrelated authenticated user and anonymous access on representative desktop and mobile devices.

## Current local gate result (2026-09-01)

The local safety gate remains `staged_admin_only=1`; `pilot_scope_only=0` is installed but not activated. After explicit business-owner approval, Local Pilot configuration assigns Employee `012816` to Master Unit `Tube Cutting`, appoints Group Leader `002671` as the KPI-required self-managing inspector, assigns `012816` to that team and creates an effective Monday-Friday schedule with target 1 per day. A repeat execution creates no duplicate rows. Test account `111111` remains outside the inspector enrollment and team.

The supplied `Employees_2026-09-01.xlsx` was inspected read-only and not imported. It contains 14 Maintenance / Tube Cutting reference rows. These rows do not become Pilot participants until Admin creates an effective enrollment or team assignment through the existing workflow.

The acceptance decision remains `CONFIGURATION_REQUIRED`. Batch acceptance requires at least two separately assigned Operators but the approved team currently has one. The Pilot also has no applicable Published business Checklist, Active Personal/Department templates, Department QR, Community handler or representative submitted/print/Community evidence. No missing Checklist, template, QR, handler or workflow evidence was fabricated.

## Production rollout procedure after approval

1. Rerun all Phase 7-10E contracts, the full Backend suite and authenticated browser UAT.
2. Take a fresh verified Production MySQL plus private-upload backup.
3. Deploy only the reviewed Phase files and verify SHA-256 download-back.
4. Smoke Admin while `staged_admin_only=1`, then verify ordinary user `403` and anonymous `401` before any gate change.
5. For approved Pilot UAT, change only to `staged_admin_only=0`, `pilot_scope_only=1`, then run the complete multi-role smoke matrix. Company-wide `0/0` remains a later decision.
6. Confirm no temporary rows/files remain and record rollback artifacts. Re-enable the gate immediately if a critical acceptance condition fails.
