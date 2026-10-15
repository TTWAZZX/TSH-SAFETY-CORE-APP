# Production Full Database → Local Sync

Decision: `PASS_PRODUCTION_FULL_DATABASE_LOCAL_RESTORE`  
Date: 2026-10-15  
Authorization: the user explicitly approved a full database copy including identity, voting and other sensitive rows.

- The previous Local database and public uploads were backed up first at `backups/20261015-195254/`.
- A token-bound, integrity-checked, one-shot PHP helper opened a `REPEATABLE READ` / `READ ONLY` transaction and exported all 256 base tables and 28,521 rows.
- The compressed snapshot was downloaded twice. Both copies matched SHA-256 `8c1a19215802284fd9612f0701ce4805b78e23279275dbd9658b0f70976521fc`; direct public access to the private artifact was denied.
- The helper, guard and remote export were removed. An independent FTPS postcheck confirmed Production `.htaccess` was restored byte-exact to SHA-256 `7c648d9a72e469b427cb65e40aff98d329bd2631d5a9fea0dc3787d9b9bb730d`.
- The SQL was restored into a disposable loopback database first. Its 256-table/28,521-row inventory matched the export, after which the Local `uattshpc_safetytsh` database was replaced and independently matched again. The disposable database was removed.
- The additive Live Results migration was then applied to Local with its feature default OFF and protected business counts unchanged.

Sensitive SQL artifacts remain only under the Git-ignored `backups/production/full-db-local-sync-20261015125836/`. After separate explicit authorization, all seven Active Safety Vote private files referenced by the restored database were downloaded read-only, checked against stored size and SHA-256 metadata, and copied into Local after backing up the previous Local directory. Other application upload stores were not included.
