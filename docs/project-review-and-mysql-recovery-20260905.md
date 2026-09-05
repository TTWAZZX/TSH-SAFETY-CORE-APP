# Project review, BBS branch reconciliation and local MySQL recovery

Verified on 2026-09-05 (Asia/Bangkok). This report records an inspection and local database recovery; it does not approve a merge, push, Production deployment or BBS rollout.

## Answers to the original questions

| Question | Verified answer |
| --- | --- |
| Where is the BBS work? | The actual branch is `wip/bbs-card-designer-10f2`, not `wib/...`. GitHub and the local remote-tracking reference both point to `48052918e1468a48c4d6b4b61217268f3de5628c`. |
| Is it merged on this machine? | No. The only working tree is on `main` at `82f741615f38f410a1c498452e28a31881cc2f81`. The commits are available locally in Git, but the Designer files are absent from the main checkout. |
| How far have the branches diverged? | `main` has 12 exclusive commits and the BBS branch has 14. The branch-side change from the common ancestor touches 55 files, including Patrol and CCCF. |
| Is it on Production? | Yes for the BBS frontend and Designer API verified below. The user confirmed `https://dev.tshpcl.com/safety/tsh-safety-core` is the actual Production URL despite its hostname. |
| Is the Designer enabled? | No. A normal Admin login returned 200; the authenticated Designer catalog returned 200 with `designerEnabled=false` and `renderingEnabled=false`. No flag was changed. |
| What phase does the branch contain? | `c4ade7a` preserves 10F-0 through 10F-2; `4805291` adds Personal/Department printing integration and 10F-3/4/5 tests. The branch's handoff still says the next phase is 10F-3, so it is stale. |
| Why did local MySQL fail? | InnoDB startup reported `Missing MLOG_CHECKPOINT between the checkpoint 50875228 and the end 50874880`. No mysqld process or listener on 3306 was present at diagnosis. |
| Is local MySQL working now? | Yes. The recovered database runs normally on 3306 with `innodb_force_recovery=0` and `read_only=0`; XAMPP-equivalent stop/start and post-restart table checks passed. |

## Review scope and limits

Read the repository instructions and relevant architecture, deployment, history and roadmap documents. Inspected Git ancestry and the BBS branch without switching the user's working tree. Reviewed BBS Designer validation, Node/PHP card integration, private resource handling, print snapshots and rendering. Ran syntax checks across selected runtime files covering the project modules, the backend regression/preflight suite, the BBS test matrix and npm dependency audit.

This is a project-wide technical baseline with a deeper BBS review, not an exhaustive browser acceptance test of every business workflow or a penetration test. Production inspection used public file downloads and normal authenticated Admin reads. Production database contents, all PHP file hashes and all five Designer tables were not independently reconciled. The catalog confirms API presence and current flags, not complete readiness for rollout.

## Findings, ordered by priority

### P1 - Production and the main branch are not the same release

Production BBS files match `4805291` while `main` does not contain that implementation. Production `index.html`, `main.js`, `cccf.js` and `patrol.js` do not byte-match either branch tip. Different hashes establish drift, not which unmatched file is newer or correct. The BBS branch also includes unrelated Patrol/CCCF commits.

Deploying the whole main checkout could overwrite deployed features. Merging or deploying the whole BBS branch without reconciliation could replace other module changes. Reconcile each runtime file and migration against the live release, then prepare an integration branch retaining both histories. No merge or deployment was performed in this review.

### P1 - Backend dependency audit reports five high-severity packages

`npm --prefix backend audit --omit=dev --json` reports 8 affected packages: 5 high, 2 moderate, 1 low, and 0 critical. High direct dependencies include `multer`, `mysql2` and `xlsx`; high transitive packages include `ip-address` and `path-to-regexp`. The audit offers no automatic fix for the installed `xlsx` distribution.

Prioritize a reviewed dependency update and upload/Excel/database regression matrix. These are dependency advisories, not proof of an exploitable application path; Node dependency findings do not by themselves demonstrate a vulnerability in the PHP Production runtime. Relevant reports include [Multer upload cleanup](https://github.com/advisories/GHSA-3p4h-7m6x-2hcm), [MySQL2 authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), and [SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). No packages were updated.

### P2 - Two-sided Designer output does not impose front/back sheets

Source: `4805291`, `public/js/pages/bbs-smart-card.js:1391-1392`.

`designerPrintPages()` emits Front then Back as adjacent articles, and `printIssuedCards()` places them in the same two-column sheet. `duplexFlip` is only a data attribute; no page-side ordering or mirrored back-sheet placement uses it. A single two-sided card produces two adjacent articles rather than front and back on opposite sheets. The grid also remains fixed at 85.6 mm despite configurable card dimensions.

An isolated execution of the actual rendering functions confirmed two articles, no page-break instruction and a fixed grid. Add proper page imposition and test one/multiple cards, portrait/landscape, both flip modes and real duplex alignment before enabling Designer rendering.

### P2 - Personal print audit can capture a different layout from the printed card

Source: `4805291`, `backend/routes/bbs-cards.js:114-120,222-224`; matching PHP logic in `api/handlers/bbs_cards.php:20`; client print submission at `public/js/pages/bbs-smart-card.js:1392`.

The issue response supplies a Designer layout and print snapshot, but the client submits only card IDs and reason to the print-log endpoint. The server reconstructs the snapshot from the layout that is Active at logging time and current Employee Master values. If another Admin activates a new version between issue and print logging, the stored audit can describe version B while the printed output used version A. Issue-date values are also reconstructed using a different representation.

Freeze the authorized render contract at issuance/preparation and bind the print log to that immutable contract without storing a raw Personal QR. Verify concurrency and employee changes between rendering and logging. This is a code-level finding; no Production card was issued to reproduce it.

### P2 - Designer style choices are silently lost in printed output

Source: `4805291`, `public/js/pages/bbs-smart-card.js:1390` and the allowlisted styles in `backend/services/bbs-card-designer.js`.

The print renderer handles text/images/QR but falls through to an empty text div for Shape. It ignores shape type, fill, border and several other allowed visual properties. Executing the actual function with an Ellipse and red fill produced neither the requested fill nor ellipse styling. Implement the supported style contract consistently, or reject unsupported options before activation; compare rendered output with the editor.

### P2 - The test gate does not include the full BBS suite, and historical assertions are stale

Source: `backend/package.json:32-33`, `backend/scripts/bbs-phase1-parity.test.js:82`, and cache-key assertions in Phase 10B/10C/10D tests.

`npm test` runs the onboarding/regression/preflight chain, not all named BBS tests. The separate BBS matrix leaves 12 assertion failures: one obsolete Phase-1 navigation expectation and eleven fixed cache-version expectations. A green main test command therefore does not mean all BBS contracts pass.

The 10F-3/4/5 tests mainly assert source tokens and do not catch the print issues above. Maintain current phase-aware cache/module assertions and add behavior-based print/snapshot tests. Do not weaken authorization tests to obtain a green result.

### P2 - Release documentation and manifest are insufficient to establish deployed phase

The branch handoff says 10F-2 is local-only and 10F-3 is next, but the newer commit and live files contradict that statement. The live manifest still labels itself `bbs-smart-card-phases1-10a-staged-admin-20260827`. Local recovered application schema has 187 tables and no Designer layout/snapshot tables, so local Git availability is not evidence of a migrated local Designer database.

Update phase handoff and deployment evidence as part of the next reconciled release. Preserve historical notes and append verified current status rather than deleting history. Apply any later local Designer migration only as a separately scoped implementation action.

## Production evidence

GitHub heads were verified with read-only `git ls-remote`; no fetch/reset/push was needed.

| Public file | HTTP | SHA-256 | Comparison |
| --- | --- | --- | --- |
| `public/js/pages/bbs-smart-card.js` | 200 | `38ba217957c64703b043287da80f97301ffb1c3b6cdc7b9e636c3f93657c8c70` | Exact match to `4805291`; differs from main |
| `public/js/pages/bbs-card-designer.js` | 200 | `0d36a380c9ab12eb84c7c819e256fba5d33c590dbd693515fd139056e52b61b1` | Exact match to `4805291`; absent from main |

Live `main.js` references `bbs-smart-card.js?v=20260904-bbs-phase10f5-r2`. Normal Admin login, `GET /bbs/admin/card-designer/catalog`, and `GET /bbs/admin/foundation` all returned 200. The catalog reported both Designer flags false. This review did not change BBS flags, issue cards, send workflow notifications or upload Production files. The ordinary-user Pilot rollout remains a separate business gate; its current full configuration was not audited here.

## Local MySQL recovery and preservation

1. Confirmed MariaDB 10.4.32 startup failure and absence of a port conflict.
2. Took a cold copy of `C:/xampp/mysql/data` and `bin/my.ini`; all 515 original file SHA-256 hashes matched. Created a separate working copy.
3. Tried recovery modes 1 through 6 on localhost 3307 against the working copy only. Modes 1-5 failed; mode 6 allowed reads. All application tables were readable; only `mysql.transaction_registry` lacked its tablespace.
4. Exported application/phpMyAdmin databases and readable MySQL system tables, preserving accounts. Initialized a clean MariaDB data directory and rebuilt the damaged system table using the standard initializer. SQL export omitted LOCK TABLES because system log tables do not permit those locks.
5. Imported into an isolated server on 3308 without force recovery. All 236 readable source tables/views had identical row counts and all base-table checks passed. The application had 187 tables with 16,013 rows at recovery verification.
6. Copied the stopped, verified data directory into XAMPP staging with 512 matching file hashes. Preserved the original directory under `C:/xampp/mysql/data-before-recovery-20260905`; promoted the rebuilt copy to `C:/xampp/mysql/data`. Retained the original `bin/my.ini`, credentials, port and application upload paths.
7. Verified port 3306 and normal mode, ran the application tests and seven isolated BBS database tests, then verified a normal restart with XAMPP's working directory and `--standalone`. A diagnostic restart attempt initially exited without an InnoDB error; subsequent console and XAMPP-equivalent starts succeeded. Final base-table checks passed and temporary BBS databases were absent.

The application test/runtime checks exercised existing retention behavior: `auth_login_attempts` decreased from 114 to 97 and `johnny_operational_logs` from 20 to 13. These 24 technical log rows remain in the cold backup and SQL export. All other recovered table counts remained unchanged. No application schema migration or stored attachment change was part of the recovery; the damaged MySQL system table was reinitialized empty.

Recovery mode 6 skips redo application. The checks prove preservation of the readable recovered contents, not that every write immediately before the original crash reached disk. Keep the cold copy for any later reconciliation. See the official [MariaDB recovery modes](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-troubleshooting/innodb-recovery-modes) guidance. Force recovery is not enabled in the running server or normal config.

Backup root: `backups/local-mysql-recovery-20260905/` (Git-ignored).

- `original-data/`, `original-my.ini`, `cold-backup-sha256.json`: preserved cold source and manifest.
- `recovered-all-databases.sql`: 16,189,850 bytes; SHA-256 `a9a5102b6ab60dab5204230473d109e43fb111ca501e679c583f19ac910132b5`.
- `integrity-3308.json`: clean restore comparison before application testing.
- `integrity-3306-after-tests.json`: final normal-mode checks and explicit retention differences.
- `recovery-tools.cjs`: local recovery/export/check helper; not an application runtime file.

## Test results and remaining work

| Check | Result |
| --- | --- |
| Syntax: 146 main runtime files plus 10 selected BBS branch files | 156/156 passed |
| `npm --prefix backend test` after recovery | Passed; read/permission preflight 131/131 |
| Separate BBS matrix | 36/48 passed after retesting the 7 initial DB blockers; 12 stale assertions remain |
| Designer 10F-1 through 10F-5 static contracts | 5/5 passed; does not imply visual/lifecycle acceptance |
| BBS migration/performance retest | 7/7 passed in temporary isolated databases; remaining temporary databases 0 |
| Local data-quality audit | 9 employees flagged: 1 invalid Position and 8 whitespace/linebreak anomalies; no remediation performed |
| Dependency audit | 8 affected packages; 5 high, 2 moderate, 1 low |
| Final database checks | Normal mode; table checks passed; only documented technical-log retention differences |

Next work: reconcile main/branch/Production first; update the release handoff; address the three Designer print findings and stale tests; review dependency upgrades; then perform controlled Admin visual/API acceptance before any Designer activation. Keep ordinary-user rollout separately gated. The review did not merge, push or deploy code.

Local evidence is under `output/project-review-20260905-*`, `output/project-review-production-api.json`, public download copies named `output/review-live-*`, and the recovery backup above. `output/` was already untracked at task start; unrelated contents were left alone. A branch archive/snapshot under output allowed source inspection without switching the working tree.
