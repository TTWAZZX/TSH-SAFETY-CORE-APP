# Backup / Restore Runbook

This runbook is for the current shared-hosting production target:

- App URL: `https://dev.tshpcl.com/safety/tsh-safety-core/`
- Runtime: DirectAdmin / Apache / PHP shared hosting
- No Node.js process, SSH, terminal, PM2, Passenger, or server-side shell execution
- Production file root over FTP: `/tsh-safety-core/`
- Production upload storage: `/tsh-safety-core/uploads/`
- Production database: MySQL/MariaDB database used by `api/config.local.php`

The backup unit is always **database + uploads together**. A database dump without the matching `uploads/` snapshot can leave records pointing at missing documents. An `uploads/` snapshot without the matching database may leave orphan files.

## Recovery Targets

- RPO target: one verified backup before every production change, plus scheduled hosting backups when available.
- RTO target: restore the database first, restore `uploads/` second, then run smoke tests before reopening normal use.
- Owner: Admin/developer with DirectAdmin or phpMyAdmin access and FTP access.
- Storage rule: keep backup archives outside the public web root. Do not store `.sql`, `.zip`, or backup manifests under `/tsh-safety-core/`.

## What To Back Up

1. MySQL/MariaDB database:
   - All application tables, including lowercase PHP-production tables such as `employees`, `app_settings`, `module_forms`, `patrol_issues`, `hiyarireports`, `ky_activities`, `fourm_changenotices`, and email outbox tables.
   - Use UTF-8 / `utf8mb4`.
   - Include routines/triggers/events if the export tool offers those options. The app normally does not depend on stored routines, but including them is safer.

2. Uploaded files:
   - Entire FTP directory `/tsh-safety-core/uploads/`
   - Keep `uploads/.htaccess` in the archive. It blocks script execution and directory listing.
   - Uploaded URLs in the database may include `?filename=...`; the physical file name is the basename before the query string.

3. Deployment metadata:
   - Backup timestamp
   - Production URL
   - DB name
   - Upload file count and approximate size
   - Person who created the backup
   - Reason, for example `pre-phase-f`, `pre-hotfix`, or `monthly-drill`

## Backup Procedure - Production

Use this before every production change.

1. Announce a short write freeze.
   - Ask Admin users to stop uploads and record edits.
   - Existing users may continue reading if needed.

2. Export the database from DirectAdmin or phpMyAdmin.
   - Open DirectAdmin > MySQL Management or phpMyAdmin.
   - Select the production database.
   - Export as SQL.
   - Recommended options:
     - Quick export is acceptable for routine backup.
     - Custom export is preferred before risky changes.
     - Format: SQL.
     - Character set: UTF-8 / utf8mb4.
     - Include `DROP TABLE` only if this dump is intended for full restore to an empty or replaceable target.
   - Save locally as:

```text
backups/production/YYYYMMDD-HHMMSS/db.sql
```

3. Download `uploads/` by FTP.
   - In FileZilla, download remote `/tsh-safety-core/uploads/` to:

```text
backups/production/YYYYMMDD-HHMMSS/uploads/
```

   - Alternative PowerShell/curl pattern when FileZilla saved credentials are available:

```powershell
$xml = [xml](Get-Content -Raw $env:APPDATA\FileZilla\sitemanager.xml)
$server = $xml.FileZilla3.Servers.Server |
  Where-Object { $_.Host -eq 'dev.tshpcl.com' -and $_.Port -eq '2002' } |
  Select-Object -First 1
$user = $server.User
$pass = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($server.Pass.'#text'))

# For full recursive download, FileZilla GUI is usually safer than curl.
# Use curl mainly for spot verification/listing on this shared host.
curl.exe --fail --silent --show-error --user "$user`:$pass" `
  "ftp://dev.tshpcl.com:2002/tsh-safety-core/uploads/"
```

4. Create a local manifest.

```text
BackupID=YYYYMMDD-HHMMSS
CreatedAt=2026-06-01T15:00:00+07:00
Environment=production
AppUrl=https://dev.tshpcl.com/safety/tsh-safety-core/
DbName=<production-db-name>
DbExport=db.sql
UploadsPath=uploads/
UploadsFileCount=<count>
UploadsTotalSize=<size>
CreatedBy=<name>
Reason=<reason>
```

5. Verify the backup.
   - Confirm `db.sql` is not empty and contains `CREATE TABLE` or `INSERT` statements.
   - Confirm the downloaded `uploads/` folder contains `uploads/.htaccess`.
   - Confirm file count is plausible compared with FTP listing.
   - Keep at least one copy on a trusted local drive or company backup storage outside the web root.

6. End the write freeze only after verification.

## Local Developer Backup

For local XAMPP development, the existing script can still be used:

```powershell
npm run backup
```

This reads `backend/.env`, runs `mysqldump`, and zips `backend/uploads/` into `backups/<yyyyMMdd-HHmmss>/`.

Important: local `backend/uploads/` is not production `uploads/`. After the PHP shared-hosting migration, production uploads live at root `/tsh-safety-core/uploads/`.

## Restore Procedure - Production

Use this only after confirming the restore target and receiving approval from the system owner.

1. Freeze writes.
   - Ask all Admin users to stop edits/uploads.
   - If possible, temporarily restrict access at the web/app level during restore.

2. Take a pre-restore safety backup.
   - Export the current production DB.
   - Download the current production `uploads/`.
   - Store it as:

```text
backups/production/YYYYMMDD-HHMMSS-pre-restore/
```

3. Restore the database.
   - Preferred: create a new empty database, import there, then switch `api/config.local.php` only after verification if the host allows it.
   - If restoring into the current production database:
     - Use phpMyAdmin Import or DirectAdmin database restore.
     - Ensure the SQL dump matches the intended restore mode.
     - If the dump includes `DROP TABLE`, it can replace current tables.
     - If the dump does not include `DROP TABLE`, import into an empty database to avoid duplicate-key conflicts.

4. Restore `uploads/`.
   - Keep a copy of the current `uploads/` directory until verification is complete.
   - Upload the backed-up files to `/tsh-safety-core/uploads/`.
   - Preserve `uploads/.htaccess`.
   - Do not upload executable/script files into `uploads/`; Phase D hardening blocks them, but the archive should remain clean.

5. Verify file/database consistency.
   - Run a few SQL checks in phpMyAdmin for rows with file URLs:

```sql
SELECT COUNT(*) AS module_forms_with_files FROM module_forms WHERE FileUrl IS NOT NULL AND FileUrl <> '';
SELECT COUNT(*) AS patrol_issue_images FROM patrol_issues
WHERE COALESCE(BeforeImageUrl, TempImageUrl, AfterImageUrl, '') <> '';
SELECT COUNT(*) AS hiyari_files FROM hiyarireports
WHERE COALESCE(AttachmentUrl, SignedFileUrl, AdditionalFileUrl, '') <> '';
SELECT COUNT(*) AS fourm_files FROM fourm_changenotices
WHERE COALESCE(AttachmentUrl, ClosingDocUrl, '') <> '';
```

   - Open sample uploaded files from the app UI, not by direct directory browsing.

6. Smoke test before reopening.
   - Login as Admin.
   - Login as User.
   - Open Dashboard overview.
   - Open Person Search and one employee profile.
   - Open modules with uploaded files: Module Forms, Patrol issue, Hiyari, KY, Yokoten, Accident, Contractor, 4M.
   - Create one temporary low-risk record only if needed, then delete it and confirm cleanup.
   - Check email outbox read surfaces and confirm no unexpected flood of queued retry sends.

7. Reopen writes.
   - Record restore timestamp, operator, backup ID, and smoke-test result.

## Partial Restore Patterns

Use partial restore only when the blast radius is clearly understood.

- Single deleted uploaded file:
  - Restore only that physical file into `/tsh-safety-core/uploads/`.
  - Do not change the database if the original DB URL still points to that file.

- Single bad table edit:
  - Prefer restoring to a temporary database first.
  - Copy only the affected rows manually in phpMyAdmin after review.
  - Avoid importing a full SQL dump into production just to recover one row.

- Broken code deploy with good data:
  - Restore only code files from the previous deployment package.
  - Do not restore DB/uploads unless data was changed.

## Restore Drill

Run this at least quarterly, or after major migration phases.

1. Take a fresh production backup.
2. Restore it into a local XAMPP database or a non-production hosting database.
3. Restore `uploads/` into a non-production uploads folder.
4. Point local `api/config.local.php` to the restored DB.
5. Run:

```powershell
npm --prefix backend test
```

6. Manually open sample uploaded documents from the local/non-production app.
7. Record drill result in the release or operations notes.

## Common Failure Modes

- Database restored but files missing:
  - Symptoms: records exist, document/image links return 404.
  - Fix: restore matching `uploads/` snapshot.

- Files restored but database missing rows:
  - Symptoms: files exist by FTP, app does not show them.
  - Fix: restore matching DB rows or full matching DB snapshot.

- `.htaccess` missing from uploads:
  - Symptoms: security hardening weakened; directory/script protection may be incomplete.
  - Fix: re-upload `uploads/.htaccess` from the repo or backup.

- Import fails due to duplicate keys:
  - Cause: importing a dump without drop statements into a non-empty database.
  - Fix: import to an empty DB, or use a dump intended for replace/restore.

- Character encoding looks wrong:
  - Cause: wrong import charset/collation.
  - Fix: export/import as UTF-8 / utf8mb4 and verify Thai text in phpMyAdmin before reopening.

## Do Not Do

- Do not store production SQL dumps or upload archives under `/tsh-safety-core/`.
- Do not run ad hoc cleanup scripts against production without a fresh backup.
- Do not restore database and uploads from different timestamps unless the mismatch is intentional and documented.
- Do not use destructive Git commands as a data restore tool; Git does not contain production database or uploaded documents.
- Do not rely on PHP `exec`, `shell_exec`, or `proc_open` for backup on this shared host; those functions are disabled.
