# Johnny AI Phase 8 Release Candidate & Pre-deployment Review

Review date: 2026-10-07 (Asia/Bangkok)

Mode: local read-only review; no Production connection, mutation, commit, push or deploy

Base: `main` at `167a9b2558f7644e64b20e47194e0237bebf82ca`

Original decision: **HOLD**

Closeout: local blockers were subsequently remediated and verified; see `docs/johnny-phase8-immutable-candidate-closeout.md`. Deployment remains held pending Production preflight.

## Executive decision

Phase 8 runtime behavior is locally coherent and the authenticated Node/PHP lifecycle, legacy regressions, PHP 7.4 lint/configuration fixture and controlled real-model safety gate provide strong positive evidence. It is not yet a releasable immutable candidate.

Release is held for three reasons:

1. The Phase 8 source is a dirty working tree, not a scoped immutable commit.
2. `eval:johnny-phase82-evidence-ranking` fails its release regression. Ranking output and Node/PHP calculation parity complete successfully, but the static assertion still requires persisted `phase: 8.2`; the integrated runtime correctly advances the persisted phase to `8.3` after answer verification. The evaluator must be updated to assert the current integrated contract without weakening ranking coverage.
3. Production configuration values/capabilities, remote runtime drift, verified download-back backup and exact rollback inputs remain unverified by design because this review was prohibited from connecting to Production.

No Production release may start while any of these conditions remains open.

## Source scope

The PHP Production runtime candidate is exactly four files:

- Replace `api/handlers/johnny_ai.php`.
- Replace `api/lib/johnny_system_usage.php`.
- Add `api/lib/johnny_evidence_ranking.php`, subject to the future Production drift inventory proving that it is actually absent.
- Add `api/lib/johnny_answer_verification.php`, subject to the same check.

The Node implementation has four parity counterparts and is not part of the PHP Production upload: `backend/routes/johnny-ai.js`, `backend/lib/johnny-system-usage.js`, `backend/lib/johnny-evidence-ranking.js` and `backend/lib/johnny-answer-verification.js`.

Test harnesses, package scripts, Phase 8 documentation and `AGENTS.md` are operations/evidence scope only. The pre-existing dirty `backend/scripts/patrol-checkin-v2.test.js` is unrelated and explicitly excluded. No frontend/static asset, migration or configuration file belongs in the Phase 8 Production runtime scope.

The machine-readable path, byte and SHA-256 inventory is `docs/johnny-phase8-candidate-manifest.json`. Its hashes describe the reviewed dirty-tree snapshot only and must be regenerated from the final immutable commit.

## Code and safety review

- The PHP handler and Node route load their corresponding evidence-ranking and answer-verification modules.
- Phase 8 adds no DDL and no new database mutation statement. Existing chat, feedback and Knowledge Base mutations remain existing authenticated product behavior.
- Pure high-confidence product-usage questions can use deterministic System Usage Knowledge. Mixed policy/UI, company-document and emergency questions retain Knowledge Base retrieval; live system data retains its fail-closed source path.
- Multi-source results retain ranked evidence metadata and conflict signals. Phase 8.3 verifies critical material claims and citation integrity, replacing unverifiable critical output with a fail-closed response.
- A bounded secret-pattern scan of the eight runtime/parity files found no embedded credential. The only match was the expected runtime read/use of `gemini_api_key`, not a literal secret.
- `git diff --check` passed; line-ending notices are advisory and must not create remote drift during packaging.

## Node/PHP parity and regression evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Phase 8.1 routing | PASS | 165 cases; Node/PHP parity; pure/mixed/live/emergency/scoped routing checks |
| Phase 8.2 ranking | **FAIL release gate** | Ranking cases and Node/PHP comparison complete, then stale `nodePersistsRankingMetadata` assertion fails on `phase: 8.2` versus integrated `phase: 8.3` |
| Phase 8.3 verification | PASS | 6 cases; Node/PHP parity; fail-closed unsupported facts and citation integrity |
| Phase 8.3 authenticated lifecycle | PASS | Seven answer classes on isolated Node/PHP databases; zero chat/feedback/database residue; no web request |
| Phase 8.4 controlled real model | PASS | Four cases; safety 4/4, useful 3/4, conflict passed; adversarial case failed closed |
| Phase 1 / Phase 2 | PASS | 33/33 and 33/33 |
| Phase 3 / golden / mobile | PASS | 105/105 with PHP parity, 9/9 and 14/14 |
| Phase 4 | PASS | 42/42 plus observability 7/7 |
| Phase 5 | PASS | 49/49 plus workflow smoke 9/9 |
| Phase 6 isolated lifecycle | PASS | Node/PHP, seven tables, 21 modules, zero disposable-database residue |
| Phase 7.1 static release gate | PASS | 40/40 |

Accepted Browser evidence remains under `backups/local/johnny-phase83-browser-20261007023738/`. The controlled real-model result is `backups/local/johnny-phase84-real-model-20261007024731/result.json`. Neither directory is deployment content.

## PHP 7.4 compatibility

An official PHP 7.4.33 Windows x64 archive was downloaded twice from PHP project hosts. Both copies matched SHA-256 `cdbb85b45f38f282f05764ca08648b5f92db99c75b2fb3848eb4a559f6553b48` before execution.

- PHP version: 7.4.33.
- Four PHP Production candidate files: lint PASS.
- Value-suppressed fixture capabilities: PDO/MySQL, JSON, mbstring, fileinfo, ZIP, image metadata and HTTPS client PASS.
- Phase 8.1 and Phase 8.3 evaluators PASS with the portable PHP binary.
- Phase 8.2 reaches successful Node/PHP calculation parity but its overall command fails at the stale integrated-phase assertion.

The temporary runtime is removed after review and is not candidate content.

## Production configuration requirements

Phase 8 introduces no new Production configuration key. Before release, run the value-suppressed preflight against the actual server and prove:

- valid database connection settings and JWT secret;
- HTTPS public application/upload origins;
- non-placeholder Gemini API key, primary/fallback models, embedding model/base URL, timeout and output-token limit;
- bounded upload and retention settings;
- explicit web-research switch and non-empty allowlist when enabled, plus explicit system-data switch;
- PHP >= 7.4 with PDO/MySQL, JSON, mbstring, fileinfo, ZIP, image metadata and HTTPS client;
- all seven Johnny tables and Phase 7.1 additive schema exist, because runtime must remain schema-read-only and fail closed with `JOHNNY_SCHEMA_NOT_READY`;
- shared contracts remain denied over HTTP and private Knowledge Base delivery remains authenticated.

Values and secrets must remain suppressed. A local fixture pass does not prove Production configuration.

## Required Production drift and backup preflight

The next Production-authorized preflight must be read-only except for backup creation/download:

1. Record the final immutable commit and regenerate the manifest from it.
2. Inventory the exact four remote runtime paths. Download each existing file, record present/absent, bytes and SHA-256, and compare known Phase 7.1 paths after newline normalization. Stop on unexplained drift.
3. Download a scoped backup of the seven Johnny tables and `johnny_avatar_url`, plus private/legacy Johnny Knowledge Base files with hashes. Do not export unrelated business tables.
4. Verify archive readability, row/file counts, SHA-256 and download-back copies before upload.
5. Confirm no migration is required. Do not run schema bootstrap, retention or cleanup as part of deployment.
6. Keep evidence outside the web root and do not record credentials, tokens, prompts, answers or configuration values.

## Rollback plan

1. Restore exact pre-deploy copies of `api/handlers/johnny_ai.php` and `api/lib/johnny_system_usage.php`.
2. Remove each new library only if the pre-deploy inventory recorded it absent; otherwise restore its exact prior copy.
3. Download back all four resulting paths and verify rollback hashes.
4. Recheck anonymous Johnny status (`401`), direct shared-contract denial (`404`), authenticated smoke behavior and PHP logs.
5. Do not roll back schema or delete chats, feedback, logs, Knowledge Base content or business data. Phase 8 has no migration.

## Conditions to move from HOLD to GO

- Correct the Phase 8.2 evaluator for integrated Phase 8.3 metadata while still requiring ranking persistence, then rerun all local gates to green.
- Review and commit only declared Phase 8 scope; exclude the unrelated Patrol change and non-source artifacts.
- Regenerate hashes from the clean immutable commit.
- In a separately authorized Production preflight, pass value-suppressed configuration/capability checks, drift inventory and verified scoped backup.
- Only then issue separate explicit Production release authorization.

Until these conditions are met, the decision remains **HOLD**.
