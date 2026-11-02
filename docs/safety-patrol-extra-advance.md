# Safety Patrol Top & Management Extra Advance Coverage

## Accepted behavior

- Scope is only `Patrol_Attendance` for Top & Management. `Patrol_Self_Checkin` and Supervisor/Sec behavior are unchanged.
- The Check-in modal keeps Scheduled, Makeup, and Extra. With `patrol_extra_advance_enabled=1`, Extra requires one exact future `ScheduledSessionID` from the current or next calendar month.
- Eligibility uses the employee's effective Team/Member Rotation in the target month. The API excludes today/past rounds, cancelled rounds, completed rounds, blocking leave, and rounds from another effective team.
- `PatrolDate` and `CheckinAt` remain the actual Bangkok check-in date/time. The linked future session is completed immediately in its scheduled month, while Actual/Extra activity remains in the actual month.
- Linked Extra is represented by nullable `Patrol_Attendance.CheckinMode='extra'`. Existing `NULL` rows retain the legacy projection. Existing unlinked Extra remains unchanged while the feature flag is off.
- The calendar labels linked coverage as `ทำล่วงหน้าด้วยการเดินเพิ่ม` and displays the actual walk date.

## Safety and concurrency

- Check-in uses the existing idempotency key and unique `(UserID,ScheduledSessionID)` constraint.
- Linked Extra locks the target `Patrol_Sessions`, attendance, and blocking-leave rows in a transaction before insert. A concurrent second completion receives `409`.
- A session with linked attendance cannot be moved, cancelled, or deleted.
- Admin feature activation is audited through `GET/PUT /patrol/admin/extra-advance-feature`; the migration and runtime initializer default the flag to `0`.

## Schema and runtime

- Migration: `backend/migrations/20261102_patrol_extra_advance.sql`
- Operational rollback: `backend/migrations/20261102_patrol_extra_advance.rollback.sql` (flag-only; preserves attendance evidence)
- PHP shared-hosting runtime allowlist: `api/handlers/patrol.php`, `public/js/pages/patrol.js`, `public/js/main.js`, `index.html`
- Guarded deploy command (requires a clean immutable commit already equal to `origin/main`):

```powershell
npm --prefix backend run deploy:patrol-extra-advance-production -- --execute DEPLOY_PATROL_EXTRA_ADVANCE_R1 <40-char-commit>
```

The deploy workflow performs remote double-download drift verification, creates a rollback package, uploads only the allowlist, verifies download-back and public HTTPS hashes, proves the flag is disabled, then activates it only after authenticated smoke. Failure disables the flag and restores runtime files.

## Local verification

```powershell
npm --prefix backend run test:patrol-extra-advance
npm --prefix backend run test:patrol-checkin-v2
npm --prefix backend run test:patrol-supervisor-shared-schedule
npm --prefix backend run uat:patrol-checkin-v2-local
npm --prefix backend run uat:patrol-checkin-v2-php-local
npm --prefix backend run uat:patrol-extra-advance-local
npm --prefix backend run uat:patrol-extra-advance-php-local
npm --prefix backend run uat:patrol-checkin-v2-browser
node backend/scripts/production-deployment-policy.test.js
```

No Production connection, migration, deployment, feature activation, attendance creation, or notification delivery is part of Local acceptance.
