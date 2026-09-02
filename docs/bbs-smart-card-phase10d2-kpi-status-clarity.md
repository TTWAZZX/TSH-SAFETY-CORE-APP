# BBS Smart Card Phase 10D-2 — KPI Status Clarity

## Objective

Prevent four different KPI conditions from being displayed as the same `0%` value while preserving the existing KPI formula and data.

## Server contract

| Code | Display | Meaning |
| --- | --- | --- |
| `N_A` | `N/A` | KPI is not applicable, or no scheduled day participates in this period. |
| `NOT_CONFIGURED` | `Not configured` | No effective inspector KPI configuration exists for this period. |
| `NOT_INSPECTED` | `ยังไม่ได้ตรวจ` | A schedule exists, but no scheduled target is due yet. |
| `ZERO_PERCENT` | `0%` | A positive target is due and credited submitted observations are zero. |
| `PERCENT` | Calculated percent | A positive denominator and credited result exist. |

The semantic status is additive. Workspace exposes `kpi.status`; Inspector Compliance and Analytics expose `kpiStatus`. Percentage remains `null` whenever a percent is not applicable.

## Surfaces

- My Dashboard KPI card
- Inspector Schedule & Compliance summary and inspector rows
- Management Analytics KPI card
- Analytics Excel Summary and KPI People sheets

## Preserved behavior

- Effective-dated inspector enrollment and schedule rules
- Required/Exempt overrides and Exempt denominator exclusion
- Per-day capped submitted Observation actuals
- Authorization, scope, immutable Observations and per-employee Batch records
- Master/Pilot configuration, private uploads and staged Admin-only rollout

No database migration or business-data mutation is required.
