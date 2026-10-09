# Safety Vote Phase 9.5A — Guarded Runtime Deployment

Date: 2026-10-09

Decision: `PHASE_9_5A_RUNTIME_DEPLOY_PASS_MODULE_DISABLED`

## Outcome

The checksum-locked 41-path Production runtime from immutable commit `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b` was deployed through the guarded FTPS workflow. Every candidate byte came from the immutable Git object, not the working tree. Production remains fail-closed: the Safety Vote module and Phase 7 integrations are disabled, external providers are unconfigured and no controlled-pilot user access has been opened.

No migration, login, business-data write, email/notification delivery, external integration, module enablement or push occurred. Rollback was ready throughout and was not triggered because all deployment and post-deployment gates passed.

## Pre-deployment gates

- Candidate tree: `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`.
- Candidate manifest SHA-256: `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c`.
- Runtime scope SHA-256: `d4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc`.
- Rollback manifest SHA-256: `31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd`.
- Rollback ZIP: 306,679 bytes, SHA-256 `df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394`.
- Fresh protected evidence: `backups/production/safety-vote-phase82-preflight-20261009045630/`, result SHA-256 `ce9d5df49f2f8e980921933a2d9805c6398e3932a71c4e8d2c1e9d97ccd4ffe1`.
- Fresh bearer smoke: `backups/production/safety-vote-phase95-auth-smoke-20261009045655/`, result SHA-256 `75c2ce2c12e28b99e7c4a3a60838df653f8d0df4832f4d0880a1f4c0dbd41bc9`.

The protected gate confirmed PHP/config/capabilities/privileges, 39 Safety Vote tables, 11 permissions, zero business rows, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured external providers, privacy-safe backup/restore and zero helper/backup residue. Its historical Phase 8.2 top-level evaluator reports `HOLD` whenever schema already exists; Phase 9.5A therefore evaluates the explicit protected fields rather than treating that pre-first-deployment label as a failure.

## Runtime deployment and rollback protection

The guarded orchestrator is `backend/scripts/safety-vote-phase95a-guarded-runtime-deploy.js`. It has no package shortcut and requires an exact execution confirmation. Before mutation it revalidated all 41 remote paths against the rollback manifest: 25 existing files matched by two byte-exact downloads and 16 paths remained absent. It then uploaded exactly the 41 allowlisted paths and verified every deployed file with two downloads against the immutable candidate SHA-256.

Deployment evidence: `backups/production/safety-vote-phase95a-deploy-20261009045708/`

- Uploaded: `41/41`.
- Double-download verified: `41/41`.
- Deployment result SHA-256: `225959272bccf3a1b24eead9a6633a65c12edc2fabf40e6233ece18312f69e94`.
- Rollback coverage: restore 25 verified remote-before files and remove 16 proven-new files.
- Automatic rollback trigger: any upload or checksum failure.
- Separate guarded rollback entrypoint: first double-verifies all 41 deployed candidate files, then restores/removes only the manifest paths and verifies the restored state.

## Post-deployment gates

Fresh protected postcheck evidence: `backups/production/safety-vote-phase82-preflight-20261009050056/`, result SHA-256 `4de2dc781fbe36a2dd00706ae4b245576cdc9be98c98ee3a800db0f9322a0ae7`.

It independently confirmed `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured providers, 39 tables, zero business rows, no DDL/DML, verified privacy-safe backup/restore, byte-exact `.htaccess` restoration and zero remote helper/backup residue.

Authenticated GET-only smoke evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009050124/`, result SHA-256 `4883f4b204e2d3b47fad371c65aa008d46b2323ba7564893c938cdbe4ed1b0a3`.

- Authenticated health: `200`, ready, module disabled.
- Operational campaigns route: fail-closed `503 SAFETY_VOTE_MODULE_DISABLED`.
- Both responses: JSON and `Cache-Control: private, no-store, max-age=0`.
- Credential value/hash and response body were not recorded.

Phase 9.5A is complete. Phase 9.5B requires separate authorization to enable a bounded pilot while keeping external integrations disabled. Phase 9.6 has not started.
