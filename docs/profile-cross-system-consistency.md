# Profile cross-system consistency

## Canonical profile

`employees` is the canonical source for the current employee identity and profile. Session verification,
the application header, the profile drawer, onboarding enforcement, person search, permission checks,
admin employee screens, and current-roster exports must refresh current values from this table rather
than trusting JWT profile claims.

The self-profile flow may update only `EmployeeName`, `Department`, `Unit`, and `Position`. Department,
Unit, and Position values are validated against `master_departments`, `master_safetyunits`, and the global
`master_positions` table. Role, Team, EmployeeID, Password, MustChangePassword, and CompanyEmail are not
self-profile fields.

## Employee write-path classification

| Class | Current write paths | Current behavior |
| --- | --- | --- |
| SELF_PROFILE | Node/PHP `PUT /api/profile` | Central validation, transaction, row lock, resolver, fresh token |
| ONBOARDING | Password and Safety Unit continuation services | Unchanged; continue using their Phase 3/4 transactions |
| ADMIN | Node admin employee create/update and PHP admin/foundation employee handlers | Phase 7 canonical profile validation, transaction, row lock, resolver verification |
| IMPORT | Node/PHP employee import handlers | Phase 7 canonical per-row validation; JSON remains atomic and Excel remains partial |
| REGISTRATION | Registration activation, approval, and account creation | Phase 7 validates requests and revalidates latest masters at approval; password-only activation remains unchanged |
| IDENTITY | Node/PHP EmployeeID change and cascade handlers | Unchanged |
| AUTH | Legacy login migration and password reset/change paths | Unchanged |

Phase 7 uses the reusable canonicalization layer for ADMIN, IMPORT, and REGISTRATION while keeping
self-profile authorization separate. See `docs/cross-path-profile-enforcement.md` for the route matrix.

## Historical snapshots

Operational tables in Patrol, CCCF, KY, Hiyari, 4M, Yokoten, training, accident, and other workflow modules
may store the employee name, Department, Unit, or Position as a submission-time snapshot. Profile updates
must not bulk rewrite those records. Reports that intentionally show historical context continue using the
snapshot; reports that need the current roster should join or query `employees` explicitly.

No historical table is updated by the Phase 5 profile service.
