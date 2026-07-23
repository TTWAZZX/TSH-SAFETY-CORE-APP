# Phase 7: Cross-path employee profile enforcement

## Boundary

Phase 7 applies the Phase 5 profile master rules to employee writes outside self-profile. It does not
change the schema, migrate existing records, choose a Safety Unit, rewrite historical snapshots, or
change password/EmployeeID workflows. The nine Phase 6 findings remain review-only.

The reusable validator has two layers:

- profile canonicalization validates EmployeeName, Department, Unit, and global Position against fresh
  master data and resolves the candidate onboarding state;
- the calling route retains authorization for EmployeeID, Team, CompanyEmail, Role, Password, and
  MustChangePassword. Self-profile keeps its original strict four-field allowlist.

Blank Unit remains valid input. If the Department has units, the resolver returns
`PASSWORD_CHANGE_REQUIRED` first when applicable, otherwise `SAFETY_UNIT_REQUIRED`. The service never
selects a unit. For a Department without units, the canonical Unit is empty, matching self-profile.

## Write-path matrix

| Runtime/path | Authorization | Profile fields | Enforcement | Transaction/locking | Error/import behavior | Onboarding result |
| --- | --- | --- | --- | --- | --- | --- |
| Node `POST /api/admin/employee/create` | Admin router mount | Full profile plus authorized admin fields | Canonical create | Transaction; employee key checked with `FOR UPDATE`; unique key protects races | HTTP code plus machine code | Returned |
| Node `PUT /api/admin/employee/:id` | Admin router mount | Partial profile/admin fields | Merge with locked current row; omitted fields preserved | Transaction and row lock | 400/403/404/409/422/503 | Returned |
| Node legacy `POST /api/admin/employee/update` | Admin router mount | Partial profile/admin fields | Same update service | Transaction and row lock | Same central codes | Returned |
| Node Excel `POST /api/admin/employee/import` | Admin router mount | Full row | Canonical upsert | One transaction per row | Existing partial-import contract; deterministic row/id/code; invalid rows skipped | Per-row |
| Node legacy `POST /api/employees` | `authenticateToken`, `isAdmin` | Full profile plus Role/email | Canonical create | Transaction and row lock | Central codes | Returned |
| Node legacy `PUT /api/employees/:id` | `authenticateToken`, `isAdmin` | Partial profile/admin fields | Canonical update | Transaction and row lock | Central codes | Returned |
| Node JSON `POST /api/admin/employees/import` | `authenticateToken`, `isAdmin` | Full row | Canonical upsert | Existing batch transaction; every row verified before commit | Atomic rollback; failing row/id/code returned without password | Verified per row |
| Node `POST /api/register` new request | Public, rate limited | Applicant profile | Canonical validation before request insert | Single request insert; employee is not created yet | Invalid master selection is rejected; blank Unit allowed | Candidate verified |
| Node registration approval | Admin router mount | Locked pending request | Canonical employee create against latest masters | Existing approval transaction plus employee lock | Approval rolls back on validation/resolver failure | Returned |
| PHP `POST /admin/employee/create` | `require_admin()` | Full profile/admin fields | Canonical create | Transaction and row lock | Central codes | Returned |
| PHP `PUT /admin/employee/:id` and legacy update | `require_admin()` | Partial profile/admin fields | Canonical update | Transaction and row lock | Central codes | Returned |
| PHP JSON `POST /admin/employees/import` | `require_admin()` | Full row | Canonical upsert | Existing batch transaction | Atomic rollback with row/id/code | Verified per row |
| PHP Excel `POST /admin/employee/import` | `require_admin()` | Full row | Canonical upsert | One transaction per row | Existing partial-import contract; row/id/code details | Per-row |
| PHP `POST /register` new request | Public registration controls | Applicant profile | Canonical validation before request insert | Single request insert | Same master codes; blank Unit allowed | Candidate verified |
| PHP registration approval | Admin handler authorization | Locked pending request | Canonical employee create against latest masters | Existing approval transaction plus employee lock | Approval rolls back on validation/resolver failure | Returned |

## Compatibility decisions

- Admin update is now truly partial. Fields absent from the request are not cleared.
- Import rows with an invalid Department, Unit, or Position are errors; they are no longer warning-only
  writes. Excel imports retain partial success, while JSON imports retain their batch rollback behavior.
- Invalid Role retains the previous path behavior of falling back to `User`; role authorization remains
  with admin routes and is not part of profile validation.
- Registration requests store canonical master values. A blank Unit is accepted and is completed by the
  user after account activation when the resolver requires it.
- Registration approval revalidates the stored request against current master data before creating an
  employee, so stale or ambiguous requests fail closed.
- Existing-account activation only changes Password and remains out of profile enforcement scope.
- EmployeeID changes, password reset/continuation, Safety Unit continuation, self-profile, delete routes,
  and operational snapshot tables remain unchanged.

## Error contract

Profile errors use `INVALID_EMPLOYEE_NAME` (400), `INVALID_DEPARTMENT` (422),
`INVALID_SAFETY_UNIT` (422), and `INVALID_POSITION` (422). Unauthorized field sets use
`PROFILE_FIELD_NOT_ALLOWED` (403). Missing/duplicate employees use 404/409. Master or resolver failures
use 503 and fail closed. Import reports contain row number, EmployeeID, code, and a safe message; they do
not include Password, hashes, or tokens.

## Verification

Run the Phase 7 contract suite with:

```powershell
npm run test:cross-path-profile
```

The suite covers Node/PHP parity, all three onboarding outcomes, password-before-unit priority,
canonical master values, blank and invalid Unit behavior, partial update, protected fields, master and
resolver failures, rollback, idempotency, upsert, batch rollback, and concurrent updates. Phase 1-6
regressions and both read-only database audits must also pass before non-production UAT.
