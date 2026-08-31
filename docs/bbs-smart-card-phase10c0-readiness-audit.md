# BBS Smart Card Phase 10C-0 Readiness Audit

Date: 2026-08-31
Scope: Localhost only, read-only
Pilot: `MAINTENANCE SEC.` / `Tube Cutting`

## Outcome

Current readiness is `CONFIGURATION_REQUIRED`. The approved Pilot Master scope is active and the existing Group Leader KPI rule is correct, but the formal Observation flow and the card/community flow are not yet ready for business UAT.

No application record, database row, upload, UAT fixture or Draft was changed or deleted during this audit.

## Master and Pilot snapshot

| Area | Result |
|---|---:|
| Active Master Departments | 41 |
| Master Safety Units | 26 |
| Master Positions | 23 |
| Employees | 2,492 |
| Pilot employees | 2 |
| Pilot mapped employees | 2 |
| Pilot Group Leaders | 1 |
| Pilot Operators | 0 |

The two Pilot employees map to Group Leader and Section Head. There is currently no mapped Operator in `Tube Cutting`, so a valid team cannot be assigned without first correcting or confirming Employee Master roster data.

## Formal Observation readiness

The approved KPI rule is already correct:

- BBS Level: `Group Leader`
- Target: 1 submitted formal Observation per required day
- Required weekdays: Monday-Friday
- Time zone: `Asia/Bangkok`

Blocking configuration:

1. `NO_OPERATOR`
2. `NO_ACTIVE_INSPECTOR_ENROLLMENT`
3. `NO_ACTIVE_ASSIGNMENT`
4. `NO_ACTIVE_INSPECTOR_SCHEDULE`
5. `NO_APPLICABLE_PUBLISHED_CHECKLIST`

Checklist inventory contains 15 UAT templates/versions. They have no Active Scope Mapping, so they are not applicable business checklists. The resolver checked 175 mapped employees with complete Department/Unit/Position context: 0 resolved, 175 returned `NO_CHECKLIST`, and 0 returned a conflict.

There are 2 existing Draft Observations from browser UAT. They remain untouched and require an explicit owner decision before any later cleanup.

## Card and Community readiness

Blocking configuration for the approved Pilot Department:

1. `NO_ACTIVE_PERSONAL_CARD_TEMPLATE`
2. `NO_ACTIVE_DEPARTMENT_CARD_TEMPLATE`
3. `NO_ACTIVE_DEPARTMENT_QR`
4. `NO_ACTIVE_COMMUNITY_HANDLER`

No Personal Card, Department Card, Community Report or Community Action exists locally.

## Data hygiene

Critical BBS relationships are clean:

- Orphan Checklist scopes: 0
- Orphan Checklist categories: 0
- Orphan Checklist items: 0
- Orphan Observation answers: 0
- Orphan Observation files: 0
- Orphan Action files: 0

Global Employee Master warnings outside the Pilot scope:

- Employees without a matching Master Department: 8
- Employees without a matching Master Position: 1

These global warnings do not change the current Pilot result, but should be reviewed before company-wide rollout.

## Phase 10C-0B safe configuration order

Status update (2026-08-31): the user chose to configure and test these business records directly. Phase 10C-1 therefore proceeds only with code-level reliability work; no synthetic or fallback Pilot data will be created by Codex.

1. Business owner confirms the real `Tube Cutting` roster and identifies which employees are Operators.
2. Employee Master is corrected through the existing System Console workflow; BBS must not create fallback people, Departments, Units or Positions.
3. Admin appoints the confirmed Group Leader as an Active inspector with KPI required and `AllowSelfManage=1`, preserving the approved rule that Admin and the appointed Group Leader may manage the team.
4. Admin assigns the confirmed Operators to that inspector with effective dates.
5. Admin creates the effective Monday-Friday schedule with target 1 per day.
6. Admin creates a real business Checklist Draft, validates Safe/Unsafe/N/A rules and evidence requirements, maps it to Master Department ID 18 and Safety Unit ID 2, then publishes it.
7. Admin uploads and activates the approved Personal Card template.
8. Admin uploads at least one named Department Card template, issues the one shared Department QR and assigns current Admin Owner/Verifier handlers.
9. Re-run `npm --prefix backend run audit:bbs-phase10c0-readiness` and require `READY_FOR_BUSINESS_UAT` before role/mobile UAT.
10. Keep Production `staged_admin_only=1` until business UAT and rollout approval are complete.

## Decisions required before 10C-0B writes

- Confirm the real Operator roster for `Tube Cutting`.
- Provide or approve the real checklist categories/items and Unsafe remark/photo/action rules.
- Provide the approved Personal and Department card artwork.
- Select current Admin accounts for Community Action Owner and Verifier.
- Decide whether the 15 UAT checklists and 2 Draft Observations should remain for audit or be retired later. No cleanup is authorized by this audit.

## Repeatable command

```powershell
npm --prefix backend run audit:bbs-phase10c0-readiness
```
