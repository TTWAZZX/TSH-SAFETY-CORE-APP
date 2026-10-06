# Johnny AI Phase 7 — Production Pre-deploy Review

Date: 2026-10-06
Mode: Read-only review; no deployment and no Production mutation.

## Release decision

**HOLD — the candidate is not ready to deploy.**

The PHP runtime file set is identifiable and the local syntax/contracts are internally consistent, but the release is not immutable, Production configuration and platform capabilities are not evidenced, schema bootstrap currently performs retention deletion during normal requests, two server-side JSON contracts can be served directly from the web root, no Production backup exists, and the Phase 6 authenticated visual Browser UAT remains incomplete.

No Production connection, upload, schema command, data mutation, commit, push or deployment was performed in this review. No secret value was printed or copied into evidence.

## Candidate release manifest

The review-only machine-readable manifest is `docs/johnny-phase7-candidate-manifest.json`. It contains 13 PHP-target runtime files with byte sizes and SHA-256 hashes from the current working tree.

| Area | Files | Review |
| --- | ---: | --- |
| Frontend/runtime routing | 6 | `.htaccess`, `index.html`, CSS, main JS, Johnny workspace and new drawer |
| PHP configuration/handler | 2 | `api/config.php`, `api/handlers/johnny_ai.php` |
| PHP Johnny libraries | 3 | feedback, system-usage and workflow-action libraries; all new |
| Shared contracts | 2 | answer-feedback and system-usage JSON; both new |

`api/index.php` already dispatches Johnny routes and is unchanged, so it is a prerequisite rather than a candidate upload. The Node files are parity/runtime-development files and must not be uploaded to the PHP shared-hosting target.

The repository root `deploy-manifest.json` belongs to an older BBS release dated 2026-08-27. It is not a Johnny manifest and must not be reused or overwritten during this review.

The current source is `main` at `76bacad71ef1d3cc3c8e6e26ab6f082ba4931aaa`, but the working tree contains Johnny Phase 1–6 changes and unrelated existing changes. Therefore the recorded hashes are diagnostic only. A final manifest must be regenerated from a clean, scoped, immutable release commit.

## Blocking findings

### 1. Schema bootstrap is not migration-only

`johnny_ensure_schema()` creates/changes Johnny tables and then immediately applies retention:

- operational logs older than the configured period are deleted (default 30 days);
- messages and conversations older than the configured period are deleted (default 180 days).

The function runs as part of normal Johnny API startup/request handling. Consequently, the first authenticated Johnny request after deployment can both change schema and delete existing Johnny data. This is not acceptable as a controlled Production migration step.

The `ALTER TABLE` statements also swallow every exception. A duplicate-column case is harmless, but permission, unsupported-type, storage-engine or other migration failures would be indistinguishable and could leave a partially upgraded runtime.

Required closure before deployment:

1. Extract an explicit, idempotent additive migration with preflight checks and visible failure reporting.
2. Separate retention cleanup from schema readiness. Retention activation must be an independently approved action with before/after counts and the agreed retention values.
3. Keep request handling fail-closed when the required schema is not ready; do not silently continue after an unknown migration error.
4. Run the migration first on an isolated copy matching Production MySQL/MariaDB, then perform a separately approved Production change window.

### 2. Production configuration is not evidenced

The local `backend/.env` was checked by key name only. Core database/JWT/Gemini keys, upload base URL and KB upload limit are present. Explicit values are absent for model fallback/base URL, chat/log retention, avatar/risk-image limits, web research controls, system-data switch and public app URL; code defaults exist for several of these, but implicit defaults are not an acceptable Production release record.

`api/config.local.php`, the authoritative ignored Production override file, is absent from this workspace. `api/config.production.example.php` is also incomplete for this release: it does not include `johnny_chat_retention_days`, `public_upload_base_url` or `public_app_url`.

Before deployment, an authorized operator must verify only presence/type/range—not expose values—for:

- database host/port/name/user/password and JWT secret;
- Gemini key, ordered model list, embedding model/base URL, timeout and output limit;
- KB/avatar/risk-image size limits;
- chat retention and operational-log retention, explicitly approved by the data owner;
- web-research enabled state and domain allowlist;
- system-data enabled state;
- public upload/app URLs;
- email/recovery settings remain unchanged by this release.

### 3. Public access to shared contracts is not denied

The PHP handler reads `shared/johnny-answer-feedback.json` and `shared/johnny-system-usage-knowledge.json` server-side, but the current root `.htaccess` has no rule denying direct requests to `shared/`. The files do not contain business records or secrets, but the system-usage catalog exposes internal module routes, audiences and workflow guidance and does not need to be public.

Before release, deny direct HTTP access to these server-only contracts or relocate them outside the document root, then prove authenticated application behavior still works and direct HTTPS requests return a non-success response.

### 4. Target runtime compatibility is incomplete

Local lint passed with PHP 8.2.12, while the documented Production target is PHP 7.4.33. Static inspection found no intentional PHP 8-only syntax, and arrow functions used by the code are PHP 7.4-compatible, but this is not equivalent to a PHP 7.4 runtime check.

The target must evidence these capabilities before deployment:

- PHP 7.4 syntax/runtime compatibility;
- PDO MySQL, JSON, `mbstring`, `fileinfo`, `ZipArchive`, image metadata support and either cURL or allowed HTTPS streams;
- MySQL/MariaDB support for `JSON`, `JSON_VALID`, `JSON_EXTRACT`, InnoDB foreign keys and the configured `utf8mb4` collation;
- write permission for `api/private/johnny-kb/`, with direct HTTP access denied;
- sufficient request/upload/body/time/memory limits for the configured file sizes and Gemini calls.

### 5. Release evidence is not complete

- Phase 6 Node and PHP isolated lifecycle suites passed with zero fixture/database residue.
- The Phase 7 rerun passes Phase 1 `33/33`, Phase 2 `33/33`, Phase 3 Node/PHP `105/105` and `135/135`, Phase 4 Node/PHP `42/42` and `22/22`, observability `7/7`, Phase 5 Node/PHP `49/49` and `37/37`, workflow smoke `9/9`, golden quality `9/9` and mobile compact `14/14`.
- Candidate-manifest verification passes `13/13`; both shared JSON contracts parse; PHP 8.2 lint, Node syntax, the PHP 8-only static token heuristic and whitespace checks pass. PHP 7.4 runtime proof remains required.
- The Phase 6 residue audit passes with zero disposable Johnny databases remaining.
- Authenticated desktop/mobile visual Browser UAT is still missing because the in-app Browser controller failed before tab creation.
- No Production drift comparison, read-only table/count fingerprint, runtime download-back backup or Knowledge Base file inventory has been captured for this candidate.

## Schema inventory and migration scope

The candidate expects these tables:

- `app_settings` (Johnny owns only the `johnny_avatar_url` row);
- `johnny_chat_conversations`;
- `johnny_chat_messages`;
- `johnny_answer_feedback`;
- `johnny_kb_documents`;
- `johnny_kb_chunks`;
- `johnny_operational_logs`.

Additive changes against an older Johnny schema are:

- `johnny_chat_messages.SourcesJson`;
- `johnny_chat_messages.AnswerQualityJson`;
- new `johnny_answer_feedback`, including `MessageID` foreign key with `ON DELETE CASCADE`;
- `johnny_kb_documents.SourceType`, `TextContent`, `AuditStatus`, `AuditJson`, `LastAuditAt`, `ExtractionLogJson`, `LastExtractionAt`;
- `johnny_operational_logs.idx_created`.

There is no standalone checked-in Johnny migration or schema rollback script. Before any Production change, use read-only `INFORMATION_SCHEMA` inspection to produce a target-specific migration and confirm table engine, column definitions, indexes, foreign-key compatibility and existing orphan conditions. Do not drop tables/columns or rewrite legacy rows as part of this release.

## Required pre-deploy backup plan

This plan is for a future approved deployment window; none of it was executed in Phase 7.

1. Create a timestamped release evidence directory under `backups/production/`.
2. Download every one of the 13 target runtime paths before replacement. Record `PRESENT` plus SHA-256 for existing paths and `ABSENT` for genuinely new paths. Include `.htaccess`; do not download or overwrite `api/config.local.php`.
3. Export schema and rows only for the seven Johnny tables listed above, plus the single `app_settings.key_name='johnny_avatar_url'` row. Encrypt/restrict the backup because chats and KB text can contain personal or confidential data.
4. Inventory and back up `api/private/johnny-kb/` and any legacy `uploads/johnny-kb-*` files, preserving paths, byte sizes and SHA-256 hashes. Do not delete or migrate files during backup.
5. Capture read-only before counts/fingerprints for conversations, messages, feedback, documents, chunks and logs; record oldest/newest timestamps so retention impact is explicit.
6. Record Production PHP/MySQL versions, required extension availability, writable-directory result and current public-deny behavior without changing configuration.

## Rollback plan

Runtime rollback must be recoverable and narrowly scoped:

1. Restore only files that existed in the pre-deploy download-back backup.
2. Remove only candidate files proven `ABSENT` before deployment. Never infer absence from the local repository.
3. Restore `.htaccess` atomically with the prior version if the runtime is rolled back.
4. Do not drop additive Johnny columns/tables or delete feedback/chat/KB rows during normal rollback. Retain the schema and data unless a separate, reviewed data-safe schema rollback is explicitly approved.
5. Preserve all newly uploaded private/legacy KB files. If runtime compatibility requires isolation, move them to a protected quarantine with a manifest rather than deleting them.
6. Do not restore, upload or edit `api/config.local.php` as part of the application rollback.
7. After rollback, verify source/download/public hashes, anonymous Johnny `401`, authenticated read-only status/history, direct KB/shared-path denial, PHP error log and unchanged business/Johnny fingerprints.

## Gate checklist before requesting deployment approval

- [ ] Scope Johnny changes into a clean release commit and exclude unrelated dirty-worktree changes.
- [ ] Close schema/retention coupling and validate an explicit migration on a Production-equivalent copy.
- [ ] Add and test direct HTTP denial for server-only shared contracts.
- [ ] Complete PHP 7.4 and required-extension compatibility evidence.
- [ ] Verify Production configuration by key/type/range with secrets suppressed.
- [ ] Complete authenticated desktop and 390 px mobile Browser UAT.
- [ ] Capture read-only Production drift/schema/count/file inventory.
- [ ] Create and verify runtime, narrow database and KB-file backups.
- [ ] Freeze a final manifest from the clean release commit and obtain explicit deployment approval.

Until every item is closed, the Phase 7 decision remains **HOLD / DO NOT DEPLOY**.
