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
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ALLOWED_ORIGINS`

Production `ALLOWED_ORIGINS` must include only real app origins, for example:

```text
https://your-preview-domain.vercel.app,https://your-production-domain.com
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

## 4. Staging deploy

Deploy a Vercel preview first:

```powershell
vercel deploy
```

After deployment, run a remote smoke check against the preview URL:

```powershell
$env:SMOKE_BASE_URL="https://your-preview-url.vercel.app"
npm run smoke:remote
```

The remote smoke script only checks read and permission surfaces. It does not write to the database.

## 5. Local verification

Before promoting to production:

```powershell
npm test
```

This delegates to the backend test suite:

- permission audit
- local API smoke test
- UAT preflight against the configured database

## 6. Database backup

Before production rollout:

- Confirm the latest DB backup completed successfully.
- Confirm who can restore it.
- Confirm the restore target and expected recovery time.
- Record the backup timestamp in the release note.

## 7. Controlled rollout

- Open production to a small pilot group for one working day.
- Watch server logs for 500 errors, DB timeout, CORS failures, and upload failures.
- Keep a simple issue log with module, user role, time, and screenshot.
- Open to all users after the pilot day is clean or after critical issues are fixed.
