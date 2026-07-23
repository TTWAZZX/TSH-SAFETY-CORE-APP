# Monitoring / Error Review Checklist

This checklist is for the DirectAdmin/PHP shared-hosting production app:

- App URL: `https://dev.tshpcl.com/safety/tsh-safety-core/`
- API base: `/api/...`
- Upload storage: `/tsh-safety-core/uploads/`
- Admin console: `#admin`, especially System Health and Audit Log
- Backup runbook: `docs/backup-restore-runbook.md`

The goal is early detection without changing production data. Default checks are read-only.

## Daily 10-Minute Check

1. Login as Admin.
2. Open Admin Console > System Health.
   - Check failed API count in the last 24 hours.
   - Check missing/unreadable table signals.
   - Check stale work indicators.
3. Open Admin Console > Audit Log.
   - Apply `Failed Only`.
   - Review today's failures by module, user, path, and status code.
   - Export CSV if there are repeated failures or an incident.
4. Check email outboxes for failed delivery.
   - Hiyari: `/api/hiyari/email-outbox?status=Failed&limit=50`
   - KY: `/api/ky/email-outbox?status=Failed&limit=50`
   - CCCF: `/api/cccf/email-outbox?status=Failed`
   - 4M: `/api/fourm/email-outbox?status=Failed&limit=50`
5. Confirm public/API basics.
   - `GET /api/public/branding` returns JSON 200.
   - A clearly unknown API path returns JSON 501, not an HTML error page.

Record only exceptions. If everything is clean, no long report is needed.

## Weekly Check

1. Review queued email older than one business day.

```sql
SELECT 'hiyari' module_name, COUNT(*) queued_old
FROM hiyari_emailoutbox
WHERE Status='Queued' AND CreatedAt < NOW() - INTERVAL 1 DAY
UNION ALL
SELECT 'ky', COUNT(*)
FROM ky_emailoutbox
WHERE Status='Queued' AND CreatedAt < NOW() - INTERVAL 1 DAY
UNION ALL
SELECT 'cccf', COUNT(*)
FROM cccf_emailoutbox
WHERE Status='Queued' AND CreatedAt < NOW() - INTERVAL 1 DAY
UNION ALL
SELECT 'fourm', COUNT(*)
FROM fourm_emailoutbox
WHERE Status='Queued' AND CreatedAt < NOW() - INTERVAL 1 DAY;
```

2. Review failed email by module.

```sql
SELECT 'hiyari' module_name, COUNT(*) failed
FROM hiyari_emailoutbox
WHERE Status='Failed'
UNION ALL
SELECT 'ky', COUNT(*)
FROM ky_emailoutbox
WHERE Status='Failed'
UNION ALL
SELECT 'cccf', COUNT(*)
FROM cccf_emailoutbox
WHERE Status='Failed'
UNION ALL
SELECT 'fourm', COUNT(*)
FROM fourm_emailoutbox
WHERE Status='Failed';
```

3. Review upload directory listing by FTP.
   - Confirm `/tsh-safety-core/uploads/.htaccess` exists.
   - Confirm there are no probe/temp files such as `codx_*`, `phase*_*.php`, or old cleanup scripts.
   - Confirm there are no executable/browser-scriptable extensions in uploads:
     - `.php`, `.phtml`, `.phar`, `.cgi`, `.pl`, `.py`, `.sh`
     - `.html`, `.htm`, `.js`, `.mjs`, `.svg`, `.shtml`, `.xhtml`

4. Review static security probes.
   - These should be blocked:
     - `/api/config.php`
     - `/api/config.local.php`
     - `/.env`
     - `/package.json`
     - `/uploads/`
   - Expected status is 403 for sensitive files/directories.

5. Check backup freshness.
   - Confirm the most recent backup timestamp.
   - Confirm the latest backup includes DB SQL + `uploads/` snapshot + manifest.

## Monthly Check

1. Run a read-only production smoke:
   - Public branding
   - Dashboard overview
   - Person search
   - Admin system health
   - Admin audit log
   - At least one read endpoint per major module
2. Review failed audit activity trend.
3. Review old outbox rows.
   - Decide whether failed rows should be retried, kept for evidence, or manually marked after investigation.
4. Run one restore drill in a non-production target at least quarterly.
   - Follow `docs/backup-restore-runbook.md`.

## Incident Triggers

Treat any of these as an incident:

- Login failure for multiple valid users.
- API returns HTML instead of JSON.
- Repeated 500 responses in Audit Log.
- Email outbox `Failed` grows after retry.
- Gmail SMTP returns authentication, quota, or rate-limit errors.
- Uploaded documents/images return 404 from normal app UI.
- `uploads/.htaccess` missing.
- Sensitive files are reachable by browser.
- Unknown scripts or archives appear in production root or `uploads/`.
- Production DB export/import or backup verification fails.

## Response Playbooks

### API 500 / HTML Error

1. Reproduce with the smallest read-only URL.
2. Check whether JSON is returned.
3. Open Admin > Audit Log > Failed Only.
4. Check DirectAdmin PHP error log if available.
5. If the issue started after a deploy, restore only the changed code files if data is intact.
6. If DB/schema looks wrong, take a pre-restore safety backup before any restore.

### Email Outbox Failed

1. Open the module outbox panel or call the read endpoint with `status=Failed`.
2. Inspect `Error`.
3. Common causes:
   - Gmail App Password revoked or changed.
   - Gmail sending quota/rate limit reached.
   - Recipient address invalid.
   - Hosting cannot connect to `smtp.gmail.com:587`.
4. Fix config or recipient first.
5. Retry one row before retrying a batch.
6. Batch retry should stay small, normally 10-20 rows, to avoid shared-hosting timeout.

### Upload Link 404

1. Copy the app-visible file URL.
2. Extract the physical filename before `?filename=...`.
3. Check FTP `/tsh-safety-core/uploads/<filename>`.
4. If missing:
   - Restore that file from the matching backup.
   - Do not change DB if the DB URL is still correct.
5. If present but blocked:
   - Check extension and `uploads/.htaccess`.
   - Confirm the file type is allowed for direct serving.

### Upload Leftovers / Orphans

Use caution: old records may intentionally keep files after soft delete. Do not bulk delete files without a backup.

Recommended safe process:

1. Take a fresh backup or confirm a recent verified backup exists.
2. List suspicious files by FTP:
   - `codx_*`
   - `phase*_probe*`
   - `phase*_cleanup*`
   - unknown executable/script-like extensions
3. Delete only files known to be temporary smoke/probe artifacts.
4. For ordinary uploaded documents, check DB references before deletion.

Reference SQL patterns:

```sql
SELECT FileUrl FROM module_forms WHERE FileUrl LIKE '%/uploads/%';
SELECT BeforeImageUrl, TempImageUrl, AfterImageUrl FROM patrol_issues;
SELECT AttachmentUrl, SignedFileUrl, AdditionalFileUrl FROM hiyarireports;
SELECT AttachmentUrl, VideoUrl FROM ky_activities;
SELECT AttachmentUrl, ClosingDocUrl FROM fourm_changenotices;
```

### Security Probe Failure

If a sensitive file returns 200:

1. Re-upload root `.htaccess`.
2. Re-upload `uploads/.htaccess`.
3. Retest:
   - `/api/config.php`
   - `/api/config.local.php`
   - `/.env`
   - `/uploads/`
4. Check that no temporary root scripts remain.
5. If a secret was exposed, rotate it.

## Useful Production Smoke Commands

Use from Windows PowerShell. Add `--ssl-no-revoke` because Windows Schannel may fail revocation checks on this host.

```powershell
$base = 'https://dev.tshpcl.com/safety/tsh-safety-core'
curl.exe --ssl-no-revoke --fail --silent --show-error "$base/api/public/branding"
curl.exe --ssl-no-revoke --silent --show-error "$base/api/definitely-not-a-route"
curl.exe --ssl-no-revoke --silent --show-error "$base/api/config.php"
curl.exe --ssl-no-revoke --silent --show-error "$base/uploads/"
```

For authenticated checks, use a short-lived Admin JWT generated locally from the current JWT secret, or login through the app and use browser DevTools to call read-only endpoints.

## Review Log Template

```text
Date:
Reviewer:
Scope: daily / weekly / monthly / incident
System Health:
Audit Failed Count:
Email Failed Count:
Queued Older Than 1 Day:
Upload Probe Result:
Security Probe Result:
Backup Freshness:
Actions Taken:
Follow-up Owner:
```

## Do Not Do

- Do not run cleanup scripts without a fresh backup.
- Do not bulk retry thousands of emails from shared hosting.
- Do not delete ordinary uploads just because a record is soft-deleted.
- Do not store diagnostic scripts in production root after use.
- Do not expose logs, SQL dumps, or backup archives under `/tsh-safety-core/`.
