# Johnny AI Phase 8 Production Configuration, Drift Inventory & Verified Backup Preflight

Date: 2026-10-07 (Asia/Bangkok)

Candidate: `fa1046c011f9c8359df2fb0b572bc0363a2a3603`

Mode: Production FTPS/HTTPS read-only inventory and download; no runtime upload, deploy, push, schema change or business-data mutation

Final decision after protected-helper closeout: **GO FOR CONTROLLED RELEASE**

## Result

The initial file-only preflight was `HOLD`. A separately authorized checksum-locked, one-time helper subsequently closed the configuration, PHP, schema and database-backup gates. The helper executed only value-suppressed checks, `SELECT`, `SHOW CREATE TABLE`, `INFORMATION_SCHEMA` reads and a read-only transaction. It executed no DDL or DML against Production data.

## Passed gates

- Immutable source commit verified as `fa1046c011f9c8359df2fb0b572bc0363a2a3603`.
- Production root and candidate paths were inventoried over FTPS without upload/delete.
- `api/handlers/johnny_ai.php` and `api/lib/johnny_system_usage.php` were downloaded twice and matched byte-for-byte.
- Both existing runtime files match the deployed Phase 7.1 source after newline normalization; there is no unexplained runtime drift.
- `api/lib/johnny_evidence_ranking.php` and `api/lib/johnny_answer_verification.php` are absent, so rollback must remove exactly these two paths if they are later deployed.
- The deployed `api/config.php` contract matches Phase 7.1 after newline normalization and contains the required Phase 8 configuration interface. Phase 8 adds no configuration key or migration.
- Production `backend/.env` and `api/config.local.php` are present, but their values were not downloaded or exposed.
- HTTPS root returned `200`, anonymous `/api/johnny/status` returned `401`, and both server-side shared contracts returned `404`.
- Four legacy `uploads/johnny-kb-*.pdf` files were downloaded twice. SHA-256 matched `4/4`, PDF signatures passed `4/4`, and the Production `api` inventory showed no private KB directory.
- Runtime plus KB download-back verification passed `6/6`.
- A readable 11-entry file rollback archive was created at `backups/production/johnny-phase8-preflight-20261007-101608/johnny-phase8-file-rollback-package.zip`, SHA-256 `62174c9996b964ace93bf0add1a100041ff2c321ebe697ef61488f9bbc2da337`.

## Protected-helper closeout

- Production PHP is `7.4.33`; PDO/MySQL, JSON, mbstring, fileinfo, ZIP, image metadata and HTTPS client are available.
- All required configuration keys are present/non-empty. Values and secrets were suppressed.
- Six Johnny tables are InnoDB and all required tables, Phase 7.1 columns, `idx_created` and feedback-to-message cascade foreign key passed.
- Current counts are 19 conversations, 88 messages, 1 feedback, 24 documents, 109 chunks, 26 operational logs and one `johnny_avatar_url` row.
- SQL export size is 2,827,661 bytes with SHA-256 `a0a2b769ecfb9019b11a5a1e3ad1edad8f5e1e9dbe8ed99becd1bd83b11b9bdb`. Both FTPS downloads match the server hash and each other.
- Structural validation found exactly six `CREATE TABLE` statements, expected INSERT counts for all six tables plus the one setting, no unexpected table and no `DROP`, `ALTER`, `DELETE`, `UPDATE`, `REPLACE` or `TRUNCATE` statement.
- The readable database archive is `backups/production/johnny-phase8-preflight-20261007-101608/johnny-phase8-database-backup.zip`, SHA-256 `b695c5d0a14128e061a22934cb280974785ed1a20cc6dc428326a8449a24ff4c`; its SQL entry hash matches the downloaded SQL.
- Unauthorized GET and invalid-token POST failed closed. The SQL path returned `403` while present.
- Cleanup removed the SQL, guard file, one-time marker, backup directory and empty private directory; helper self-removal was scheduled and FTPS proved it absent.
- Original `.htaccess` was restored exactly: before/after SHA-256 `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`.
- Final FTPS inventory found zero helper/private residue; final HTTPS did not serve the helper or SQL. Anonymous Johnny remains `401` and shared contracts remain `404`.

## Release boundary

All pre-deployment gates are closed. Candidate `fa1046c011f9c8359df2fb0b572bc0363a2a3603` is **GO FOR CONTROLLED RELEASE**, but no deployment is authorized by this preflight. A separate explicit release instruction is still required. Phase 8 has no migration; a release must upload exactly the four manifest runtime paths, verify FTPS download-back and authenticated/anonymous security behavior, and remove only the two new libraries during rollback because they were proven absent before deployment.
