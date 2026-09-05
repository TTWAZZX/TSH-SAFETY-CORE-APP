# BBS integration: Admin review candidate (2026-09-05)

## BBS Admin-only integration deployed (2026-09-05)

User explicitly approved push and deployment, then explicitly approved the temporary protected backup helper after automatic review initially rejected that helper. Source commit `c822277` is pushed on `integration/production-bbs-20260905`. Deployment completed at 2026-09-05T08:54:15.039Z to `https://dev.tshpcl.com/safety/tsh-safety-core`.

- Uploaded only the eight files in the review manifest. FTPS download-back SHA-256 matched **8/8**; HTTPS static SHA-256 matched **5/5**; authenticated Admin, ordinary-user denial, anonymous denial and invalid empty print-log checks passed (**17 combined API/static checks**).
- Four protected Patrol/CCCF runtime files are byte-identical to the fresh pre-deploy backup. No Production schema/data migration, upload-path or setting change. Flags remain `staged_admin_only=1`, `pilot_scope_only=0`, `visual_card_designer_enabled=0`, `visual_card_designer_rendering_enabled=0`.
- Fresh backup: `backups/production/bbs-admin-deploy-20260905T083722Z/`. `production-before.zip` contains SQL plus manifest; `application-before/` holds all **1,037** application/upload files (1,330,893,322 bytes), each verified against remote SHA-256. SQL has **191 tables**, 15,385,425 bytes, SHA-256 `91a9cc729a54242d76c50a44d477b1bf81b4f567f0b0698139bd2a96338f3672`. Archive SHA-256: `4f5dde072bf3e4ebcd7697e8e06e52808f52aea56e382cc21955dfa13121f974`. SQL uses a consistent transaction; file hashes agree between inspection and SQL manifest. No company-wide write freeze was imposed.
- The host could not close a combined 1.3 GB ZIP, so SQL was archived separately and application/uploads downloaded through authenticated FTPS. The helper was deleted before deployment; FTPS absence and HTTP 404 verified. No temporary business test rows were created: **0**. Normal authentication logs are retained.
- Local rollback rehearsal restored all six pre-existing candidate paths with matching hashes. Production rollback was not needed or executed. Restore those six paths from this fresh backup if needed; the two new dependency files can remain inert after callers are restored. Keep staged Admin-only and Designer flags off, preserve all database/upload history.
- Evidence: `deployment-verification.json`, `smoke-before.json`, `smoke-after.json`, `backup-content-verification.json`, `files-backup-verification.json`, `helper-cleanup-verification.json`, `rollback-rehearsal.json` within the backup directory.
- This deployment does **not** activate Designer rendering or ordinary-user BBS rollout. Signed-receipt endpoint lifecycle, desktop/mobile and physical duplex acceptance, plus Department asset authorization review, remain the next separate activation gate.


## Scope and current state

Authorized scope: close BBS regression, protect deployed Patrol/CCCF, prepare an Admin-only review package. No push, deployment, Production database write or flag change is authorized by this package.

Working branch: `integration/production-bbs-20260905`. Recovery evidence commit `f9fda41`; integration merge `126f5be` retains main and `origin/wip/bbs-card-designer-10f2` history. The branch name is `wip`, not `wib`. Subsequent implementation remains in the working tree.

Production is `https://dev.tshpcl.com/safety/tsh-safety-core`. The 92-file read-only download is retained in `backups/production/reconcile-bbs-20260905/`. Correction to the earlier review: 89/92 files match the BBS branch after newline normalization; other differences concern the example config, trailing whitespace and deployment metadata. Raw hashes alone overstated runtime drift. Patrol/CCCF PHP and frontend are preserved from Production; Node Patrol follows the matching branch baseline.

## Changes

- `public/js/utils/bbs-card-print.js`: shared constrained style rendering, physical paper sizing, separate front/back sheets, duplex alignment, image/font readiness and required-resource validation.
- `public/js/pages/bbs-card-designer.js`: shared style projection and Draft/desktop edit guards.
- `public/js/pages/bbs-smart-card.js`: designer printing and signed print receipts; legacy print remains supported.
- `backend/services/bbs-card-print-receipt.js`, `api/lib/bbs_card_print_receipt.php`: actor/card/QR-bound HMAC receipts expire after 24 hours. Snapshots retain the prepared layout and values; raw QR secrets are excluded.
- Node `bbs-cards.js` / `bbs-community.js` and PHP `bbs_cards.php` / `bbs_community.php`: verify optional `designerReceipts` / `designerReceipt` before recording the original snapshot. Legacy requests still log prints but do not fabricate a designer snapshot from later state.
- `index.html`, `public/js/main.js`: BBS cache version updates only.
- Backend BBS test scripts and package scripts: run all BBS suites, validate actual versioned assets instead of obsolete phase dates, test rendering and cross-runtime receipt integrity.

## Verification and limits

- `npm --prefix backend test`: PASS, including BBS 49/49 suites and the existing local API/preflight checks. Full log: `output/bbs-integration-full-test.log`; BBS results: `output/bbs-integration-regression.json`.
- New print/receipt behavior checks: 23/23, including Node/PHP interoperability, tampering, actor/QR binding, duplex positioning, style constraints and missing resources.
- CCCF C1-C3: 11/11; C4: 9/9; worker-mode regression: PASS.
- Packaging independently compares four Patrol/CCCF runtime files with the verified Production copy, ignoring CRLF only, and checks shared entry files differ only in cache versions.
- The separate `patrol-checkin-v2.test.js` currently fails on main-only `CheckinAt` expectations. It also expects same-month Makeup, conflicting with the cross-month deployed contract. This is retained and reported as test debt; no Production behavior was changed to satisfy it. File equality is not a new authenticated Patrol lifecycle UAT.
- Fresh authenticated BBS issue/replace/print-log endpoint UAT and desktop/mobile/physical duplex acceptance have NOT been completed for this integration. Existing controlled-runtime UAT must send the new receipt fields before rerunning. Department designer assets require ordinary-role access review before any later user rollout. This package is review-only, not a declaration of rollout readiness.

## Local database and backups

Local-only setup applied the existing `20260903_cccf_submit_delegations.sql` and `20260902_bbs_phase10f1_visual_card_designer_foundation.sql`: six additive tables and two CCCF actor columns. Existing table row counts were preserved. No new schema is needed for the receipt fix; no upload path changed.

Fresh pre-migration SQL/private-upload backup: `backups/bbs-integration-local-2026-09-05T08-17-05-534Z`; SQL SHA-256 `b2b4f087467a3364a714cb7a6db2d784c707bf0162ffc0986601bf4f25b2fd78`. Preserve this and the earlier MySQL recovery backups. Local flags remain staged=1, pilot=0, designer=0, rendering=0. No business UAT fixtures were created in this narrowed completion task.

## Candidate and deployment gate

Run `node backend/scripts/bbs-integration-review-package.js` to produce `output/bbs-admin-review-20260905/`: eight PHP/frontend files, SHA-256 manifest and historical rollback references. Node changes and local setup/test helpers are not shared-hosting uploads. No .env, secret config, database dump or private upload is packaged.

Before any approved deployment: obtain a NEW Production SQL, private-upload and application backup; verify its hashes and record the backup ID. Recheck current remote files against the review baseline and inspect required existing designer tables/settings without mutation. If schema is missing, separately review the exact original migration and backup before applying; do not automatically rerun the CCCF migration. Keep `staged_admin_only=1`, `pilot_scope_only=0` and both Designer flags=0. The package contains no flag-changing SQL or auto-deploy command.

After approved scoped upload, download every file and verify SHA-256 against the manifest; check unauthenticated/non-Admin BBS rejection and authenticated Admin legacy smoke. Designer activation/testing requires a separately approved controlled configuration and endpoint/browser acceptance. Preserve the Phase 10E Pilot gate. Remove any temporary helpers and confirm HTTP/FTP absence and zero test residue. Do not enable company-wide access.

## Rollback

Before runtime rollback, keep staged Admin-only enabled and set both Designer flags to 0 if a later approved test enabled them. Restore ONLY the eight candidate paths that existed, from the fresh pre-deployment application backup, including paired index/main cache references. The packaged rollback-reference is historical evidence and must not replace that fresh backup. Newly added helper/utility files may remain inert after restoring callers; do not delete private uploads, card records, print history or additive tables. Verify restored hashes, Admin legacy printing and ordinary-user denial. This BBS rollback does not change `patrol_checkin_v2_enabled`, Patrol or CCCF files.

## Exact continuation

Read this report and current worktree. Do not repeat Git/Production discovery. Update controlled BBS API UAT to exercise signed receipts and unchanged snapshots after layout activation, verify cleanup, then run authenticated Node/PHP and desktop/mobile print acceptance. Address Department asset authorization before ordinary-role testing. Only after review and fresh backups seek/execute a separately authorized Admin-only deployment; no GitHub push or user rollout is implied.
