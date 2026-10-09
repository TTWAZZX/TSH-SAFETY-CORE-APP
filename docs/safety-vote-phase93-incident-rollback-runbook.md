# Safety Vote Phase 9.3 — Rehearsal Incident and Rollback Runbook

Contract: `2026-10-09-safety-vote-phase9.3-r1`
Owner: SHE incident owner
Safety principle: fail closed and preserve evidence

## Severity

| Severity | Example | Immediate response |
| --- | --- | --- |
| SEV-1 | Production/external delivery, protected answer disclosure, identity-to-choice mapping | Disable module/integration, stop access, preserve evidence, escalate immediately |
| SEV-2 | Rehearsal created business rows, hash/integrity failure, permission bypass | Disable module, isolate database/files, begin scoped investigation |
| SEV-3 | Eligibility drift, warning, unready account, Node/PHP mismatch without disclosure | Keep campaign Draft and decision `HOLD`; assign correction |

## Containment

1. Stop the rehearsal client and any fixture processes.
2. Set `module_enabled=0` through the approved environment control when the database is retained.
3. Set Phase 7 integrations disabled and verify no external adapter/SMTP dispatch occurred.
4. Do not delete audit, request, ballot or evidence rows during investigation.
5. Capture value-suppressed timestamps, error codes, table counts and hashes.
6. Rotate any credential shown in logs or screenshots.

## Rollback

Rehearsal mode has no migration and should perform no write, so normal rollback is to stop the process and drop the guard-named disposable database after evidence capture.

If an unexpected write occurred:

- do not issue ad-hoc `DELETE` against a shared or Production database;
- compare against the before fingerprint and identify exact synthetic markers;
- use the approved narrow backup/restore or data-preserving disable procedure;
- require independent review before removing synthetic residue;
- verify ballot/participation/identity counts and private-file inventory afterward.

Runtime rollback must restore the exact pre-change file hashes from the authorized release package. Never use broad recursive deletion or reset unrelated working-tree changes.

## Recovery and closeout

- Root cause and affected scope are documented.
- Node/PHP regression and independent adversarial suites pass.
- Eligibility diff is explained and stable.
- Database/private-file/process residue is zero.
- Evidence SHA-256 is verified.
- SHE incident owner explicitly closes the incident.

Recovery does not authorize Production deployment. Return to the immutable release-preflight and require separate deployment authorization.
