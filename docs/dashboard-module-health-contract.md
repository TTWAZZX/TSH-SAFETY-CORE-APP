# Dashboard Module Health Metric Contract

Phase: D4 - Dashboard Canonical Metric Consumption

Contract source: `config/dashboard-module-health-contract.json`

Effective design date: 2026-07-24

## Scope

This contract covers the 15 cards rendered in `Module Health / Overview 2026`.
D2 implements the documented target calculations in both the Node development
route and the PHP production compatibility route. D3 restricts Personal
Targets to the mandatory current-policy baseline plus effective Admin
configuration. D4 consumes `data.moduleMetrics` directly in the Dashboard. D5
provides a consolidated automated and authenticated Local UAT gate.
The legacy response keys remain available. D1-D5 require no schema, business
data, or upload-storage change.

## Canonical metric shape

Each module metric is returned with these fields:

```json
{
  "key": "training",
  "metricType": "progress",
  "numerator": 2488,
  "denominator": 2599,
  "percent": 96,
  "value": 2488,
  "unit": "people",
  "source": {
    "tables": ["Training_Dept_Records"],
    "description": "Passed eligible records / eligible records"
  },
  "scope": {
    "year": 2026,
    "department": null,
    "unit": null
  },
  "dataAvailable": true,
  "status": "ON_TRACK",
  "statusReason": "96% is at or above the configured 80% threshold",
  "asOf": "2026-07-24T00:00:00.000Z"
}
```

## Percentage rules

- Percentages always use a 0-100 scale.
- Numerator and denominator must have the same business unit and time/scope.
- Progress is `round(min(max(numerator, 0), denominator) / denominator * 100)`.
- A missing or zero denominator is `N_A`; it is never automatic 100%.
- A failed source query is `DATA_UNAVAILABLE`; it is not zero and not On Track.
- A configured pass threshold is separate from progress. An 80% result remains
  80%, even when 80% is sufficient to pass.
- Risk-count and information cards do not receive synthetic percentages.
- Cards without an evaluable health rule must not contribute to Module Signal.

Default progress status thresholds remain:

| Status | Rule |
|---|---|
| `ON_TRACK` | percent >= 80 |
| `WATCH` | percent >= 50 and percent < 80 |
| `CRITICAL` | percent < 50 |
| `N_A` | no applicable denominator/health rule |
| `DATA_UNAVAILABLE` | the configured source could not be read |

Domain-specific thresholds may override these defaults, but the API must return
the applied rule in `statusReason`.

## Source mapping

| Module | Type | D1 source/formula | D2 implementation |
|---|---|---|---|
| Patrol | Progress | Attendance rows / distinct patrol dates | Completed eligible attendance slots / required roster slots due |
| Hiyari | Progress | Current-year reports minus all open reports | Assigned employees with a closed current-year report / current Admin assignments |
| KY | Progress | Average of Department percentages, with fallback target | Sum eligible activities / sum active configured targets |
| CCCF | Progress | Current-year permanent completion / all assignments | Completed eligible assignees / current eligible assignments |
| Yokoten | Progress | Distinct responding Departments / active topics | Responded assigned Department-topic pairs / assigned pairs |
| Training | Progress | Sum PassedCount / sum TotalEmp | Passed eligible training records / eligible records |
| Accident | Risk count | Current-year reports and recordable count | Recordable count with an explicit risk rule; no synthetic percent |
| 4M | Progress | Closed current-year notices / total notices | Same aligned formula, plus real PHP Training/Matrix values |
| KPI | Information | Current-year KPI rows and all announcements | Explicitly scoped counts; no synthetic percent |
| Policy | Progress | Policy count and acknowledgement count | Distinct current-policy acknowledgements / eligible employees |
| Committee | Information | All committee rows | Current committee count; no synthetic percent |
| Machine Safety | Progress | Active machine/open issue/critical counts | Passing checked items / checked non-N/A items on active machines |
| OJT / SCW | Progress | Average latest Department values with overdue cap | Weighted attained-toward-target / target; overdue shown separately |
| Contractor | Information | All documents and rolling 30-day uploads | Explicitly labelled all-time/recent counts; no synthetic percent |
| Safety Culture | Progress | Current-year assessment count | Normalized real assessment score, with PPE compliance separate |

The JSON contract is the detailed source of truth for table names, time scope,
zero-denominator behavior, and the recorded current gap for every module.

## D2 backend corrections

The overview endpoints now:

1. Return all 15 canonical metrics from real module sources.
2. Use same-unit numerator and denominator pairs for Patrol and Yokoten.
3. Calculate Hiyari Module Health from current Admin assignments, counting each
   assigned employee once after they have a non-deleted closed report in the
   selected year. Raw report/open counts remain available as operational
   details but do not define the card percentage.
4. Use active KY configuration only, without a fallback target.
5. Return real 4M Training Required and matrix counts in PHP.
6. Scope Policy acknowledgement to the current policy and distinct employees.
7. Use checked applicable items, configured targets, and entered score points
   for Machine Safety, OJT, and Safety Culture respectively.
8. Preserve legacy fields but derive their percentages from canonical metrics.

## D3 Personal Target eligibility

- Every employee receives one mandatory `policy_acknowledgement` target for the
  current safety policy.
- Additional targets are returned only when an effective non-N/A Admin
  configuration exists through employee override, Department/Unit scope, or
  position template.
- Manual targets without a positive effective target are omitted.
- Patrol Issue and Yokoten system ratios measure an eligible target but never
  create eligibility themselves.
- Employees without additional Admin targets receive
  `NO_ADDITIONAL_ADMIN_TARGETS`; the frontend shows a company-baseline-only
  notice instead of unrelated 0% failures.

## D4 frontend consumption

- All 15 cards read percentage, status, value, reason, source, and scope from
  `data.moduleMetrics`.
- `N_A` and `DATA_UNAVAILABLE` are visible states and are excluded from On
  Track counts.
- Risk-count and information cards show canonical values without synthetic
  percentages.
- Module Signal displays Unavailable, Critical, Watch, On Track, and N/A
  totals.

## D5 automated tests and Local UAT

- `verify:dashboard-d5` runs the contract, Node/PHP parity, authenticated
  read-only source tests, population audits, Department Coverage smoke, and
  Chrome UAT as one release gate.
- READY employees are selected without data mutation for both Personal Target
  eligibility states: mandatory Policy baseline only and additional effective
  Admin configuration.
- Browser assertions compare all 15 card statuses with `moduleMetrics`, compare
  Personal Target DOM/API row counts, verify the baseline-only notice, and
  check desktop/mobile page overflow.
- Logs, JSON reports, and screenshots are written only to `backups/local`.

## Personal target boundary

Personal target behavior is implemented in D3, but D1 fixes its source boundary:

- Mandatory baseline for every employee: current safety policy acknowledgement.
- Additional targets: only effective Admin configuration from employee,
  Department/Unit, position, or explicit module configuration.
- `IsNA=1`: omitted from progress and status calculations.
- No additional assignment: show an informational empty state, not 0% failure.
- System ratios cannot appear merely because the employee has a Department.

## Verification commands

```powershell
npm --prefix backend run test:dashboard-metric-contract
npm --prefix backend run test:dashboard-metric-parity
npm --prefix backend run test:dashboard-module-health-d2
npm --prefix backend run test:dashboard-module-health-php
npm --prefix backend run test:personal-target-eligibility
npm --prefix backend run test:personal-target-runtime
npm --prefix backend run test:personal-target-variants
npm --prefix backend run audit:personal-target-eligibility
npm --prefix backend run uat:dashboard-d5-browser
npm --prefix backend run audit:dashboard-metric-baseline
npm --prefix backend run verify:dashboard-d5
```

The contract and parity tests are database-independent. The D2 source and PHP
overview tests use authenticated/read-only queries and check their database
fingerprints before and after. The baseline audit permits SELECT statements
only.
