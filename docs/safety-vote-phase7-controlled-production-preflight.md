# Safety Vote Phase 7 Controlled Production Preflight

Date: 2026-10-26 (Asia/Bangkok)

This preflight is an offline, fail-closed release-candidate gate. It does not connect to Production, deploy files, run Production migrations or enable external delivery.

The gate requires:

- the complete Phase 7 Final Acceptance command to pass;
- branch `main` and an exact Safety Vote-only changed-file scope;
- `.env`, private uploads, business files and backup evidence to remain outside the commit;
- a bounded secret-pattern scan and `git diff --check` to pass;
- the current additive migration and data-preserving rollback to be present;
- the temporary PHP deployment helper template to be explicitly included in the Phase 7 release scope and linted before upload;
- Local configuration to remain loopback-only during candidate preparation;
- a deterministic SHA-256 manifest for every candidate file.

Commands:

```powershell
npm run preflight:safety-vote-phase7-controlled-production
npm --prefix backend run preflight:safety-vote-phase7-controlled-production:immutable
```

The first command validates the working-tree candidate after rerunning Final Acceptance. After commit, the immutable command requires a clean tree and hashes the exact `HEAD` commit. Push is allowed only when both decisions pass. Actual Production backup, drift/download-back verification, database migration and deployment remain separate IT-controlled actions.

## Candidate result

- Decision: `PASS_WORKING_TREE_READY_FOR_IMMUTABLE_COMMIT`
- Candidate files: 65
- Scope SHA-256: recorded in the timestamped ignored result to avoid hashing a tracked file that embeds its own digest
- Local evidence: `backups/local/safety-vote-phase7-production-preflight-*/` (ignored and intentionally excluded from Git)
- Production connected: no
- Deployment performed: no

The candidate scan also rejected a hard-coded registration-validation password placeholder. The placeholder was removed and validation now uses the already validated request password in memory; no credential value is committed or logged by this change.
