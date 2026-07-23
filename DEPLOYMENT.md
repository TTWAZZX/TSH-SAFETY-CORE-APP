# TSH Safety Core Activity - Deployment

## Local Run Instructions

## Running Locally

```bash
cd backend
node server.js      # runs on PORT=5000
```

Run verification from the repo root:

```bash
npm test
npm run backup
```

## Shared Hosting / PHP Production Target

Production currently targets the company shared hosting/PHP API path backed by Company MySQL/MariaDB and local server upload storage. Node/Express is retained for local/dev parity unless a task explicitly changes the production target.

## Company Server Deployment

Run the backend as a normal Node.js process on the company server and serve the frontend static files from Apache/IIS/Nginx or another approved web server.

Required server items:
- Company MySQL/MariaDB database imported with the latest `safety_core_activity` SQL.
- `backend/.env` configured for company MySQL.
- `PUBLIC_UPLOAD_BASE_URL` set to the backend URL users can reach.
- `ALLOWED_ORIGINS` set to the real frontend origins only.
- `backend/uploads/` retained on disk and backed up together with MySQL.

Example production env shape:

```env
PORT=5000
JWT_SECRET=...
ALLOWED_ORIGINS=http://company-frontend
DB_HOST=company-mysql-host
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=safety_core_activity
DB_SSL=false
PUBLIC_UPLOAD_BASE_URL=http://company-backend:5000
```

Before rollout:

```bash
npm test
npm run backup
```

## FTP Path Notes

- Upload only the files required for the phase.
- Preserve directory paths exactly, especially `api/`, `public/js/`, `public/js/pages/`, `backend/routes/`, and root files such as `index.html`.
- Do not leave temporary smoke helper files on production.

## Backup Process

- Take a production backup before production-impacting changes.
- Include changed code files and a read-only data snapshot when the smoke test needs DB verification.
- Back up upload storage together with MySQL when upload/file behavior changes.
- Record backup folder names and timestamps in `CHANGELOG.md`.

## SHA-256 Verification Process

- After FTP upload, download each uploaded file into a verify folder.
- Compare local and downloaded SHA-256 hashes.
- Keep verify downloads under the matching `backups/production/*-upload-verify-*` folder when used for a phase.
- Do not proceed to smoke testing until changed production files verify.

## Smoke Test Process

- Use a unique marker for each smoke run.
- Prefer read-only smoke tests when possible.
- When a write smoke is required, create temporary rows with a marker, verify behavior, delete them, and confirm remaining count `0`.
- Verify HTTP status, JSON content type/shape, auth boundaries, and route dispatch before declaring production smoke passed.

## Rollback Notes

- Restore files from the matching phase backup folder.
- Restore DB from the matching production backup only when schema/data changes were applied.
- Re-run SHA-256 verification after rollback upload.
- Re-run the smoke path that failed plus a basic login/API health check.

## Cleanup Rules For Temporary Test Data

- Delete temporary smoke helpers from production and verify HTTP `404` or absent FTP listing.
- Delete temporary employees/records/files created by smoke tests.
- Record cleanup result and remaining count.
- Never leave test data in production as a handoff shortcut.
