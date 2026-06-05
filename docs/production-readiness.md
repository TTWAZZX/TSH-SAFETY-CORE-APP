# Production Readiness Checklist

Use this checklist before each production rollout. It keeps the current app flow intact and focuses on configuration, verification, and controlled release.

## 1. Dependency/runtime

- Root `package.json` should stay aligned with `backend/package.json` for backend runtime packages.
- Run `npm install --package-lock-only --ignore-scripts` after dependency edits.
- Run `npm audit --omit=dev` and review any production vulnerabilities.

## 2. Environment and CORS

Required backend environment variables:

- `JWT_SECRET`
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `DB_PORT`
- `PUBLIC_UPLOAD_BASE_URL`
- `ALLOWED_ORIGINS`

Production `ALLOWED_ORIGINS` must include only real app origins, for example:

```text
http://company-frontend,http://company-frontend:80
```

Keep localhost origins in local `.env`, not in production.

## 3. Manual UAT

Run these checks with real browser sessions before opening access broadly:

- Login as Admin, User, and Viewer/test role.
- Verify invalid login shows an error and does not enter the app.
- Upload a document in Policy.
- Upload a document in Committee.
- Upload a document in OJT.
- Upload an attachment in Yokoten.
- Upload a KPI announcement document.
- Confirm User cannot access admin-only screens.
- Confirm Admin can open dashboard, admin console, employee import, and audit logs.

## 4. Backup

Back up MySQL and uploaded files together before every production change. For the current DirectAdmin/PHP shared-hosting production target, follow the full runbook:

- `docs/backup-restore-runbook.md`

Do not store SQL dumps or upload archives under the public web root. Production backup is normally:

- Database export from DirectAdmin/phpMyAdmin.
- FTP download of `/tsh-safety-core/uploads/`.
- Manifest with timestamp, DB name, upload file count, owner, and reason.

For local XAMPP development only, this helper remains available:

```powershell
npm run backup
```

## 5. Staging deploy

Deploy first to a company staging/test server when available.

After deployment, run a remote smoke check against the staging URL:

```powershell
$env:SMOKE_BASE_URL="http://company-staging-frontend"
npm run smoke:remote
```

The remote smoke script only checks read and permission surfaces. It does not write to the database.

## 6. Local verification

Before promoting to production:

```powershell
npm test
```

This delegates to the backend test suite:

- permission audit
- local API smoke test
- UAT preflight against the configured database

## 7. Database backup

Before production rollout:

- Confirm the latest DB backup completed successfully.
- Confirm who can restore it.
- Confirm the restore target and expected recovery time.
- Record the backup timestamp in the release note.

## 8. Controlled rollout

- Open production to a small pilot group for one working day.
- Watch server logs for 500 errors, DB timeout, CORS failures, and upload failures.
- Keep a simple issue log with module, user role, time, and screenshot.
- Open to all users after the pilot day is clean or after critical issues are fixed.

## 9. Monitoring

After rollout, follow the operations checklist:

- `docs/monitoring-error-review-checklist.md`

Minimum daily review:

- Admin Console > System Health.
- Admin Console > Audit Log with `Failed Only`.
- Failed email outboxes for Hiyari, KY, CCCF, and 4M.
- Basic security probes for blocked config files and `/uploads/` directory listing.
