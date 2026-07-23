# Phase 8-9 Local Readiness Report

> Phase 10 update (2026-07-23): the real-browser gate in item 3 below is now
> resolved, including visual review and cleanup fingerprint verification. See
> `docs/phase10-browser-uat-release-candidate.md`. Deployment remains NO-GO for
> the production configuration, clean release artifact, ownership, backup, and
> explicit approval gates documented there.

Date: 2026-07-22 (Asia/Bangkok)

Deployment status: **not deployed**. No production, staging, FTP, hosting, or
remote database action was performed.

## Safety baseline

- Target proved local: MariaDB on `DESKTOP-CP3M7TL`, connected through
  `localhost:3306`.
- Database proved UAT: `uattshpc_safetytsh`.
- Local backup completed before write UAT:
  `backups/20260722-174115`.
- Email delivery was forced off during UAT. Node/PHP kill-switch parity passed
  and disabled mode opened no SMTP connection.
- Git worktree was already dirty and was preserved. No reset, checkout,
  deletion of existing work, or commit was performed.

## Phase 8 result

The local write UAT passed **18/18** checks across the real Express API and the
PHP API served by local Apache:

- public master options;
- User rejected from admin operations;
- admin create with CR/LF/case/whitespace canonical matching;
- unknown department fail-closed;
- partial update idempotency and rollback;
- atomic JSON import rollback;
- partial Excel/row import isolation;
- password gate -> password continuation -> Safety Unit gate -> READY;
- self-profile update after READY;
- concurrent registration approval returning one success and one conflict.

Cleanup passed. Pre/post fingerprints for employees, registration requests,
admin audit logs, login attempts, and relevant schema matched. Final synthetic
residue is zero.

UAT exposed a cross-platform table-name defect: Node used
`RegistrationRequests` while PHP and the populated UAT table used
`registration_requests`. On Windows/MariaDB this created a second table with a
different name. Node was changed to the canonical `registration_requests` in
all registration paths. The UAT-created duplicate contained only the exact
synthetic row, was removed, and no duplicate table remains.

## Phase 9 verification

- Phase 1 resolver: 10 cases, Node/PHP parity passed.
- Phase 2 enforcement: 11 cases, Node/PHP parity passed.
- Phase 3 password continuation: 8 cases, parity/concurrency/recovery passed.
- Phase 4 Safety Unit continuation: 12 cases, parity/concurrency/recovery passed.
- Phase 5 profile validation: 16 cases, parity/rollback/recovery passed.
- Phase 6 data quality: 14 cases, read-only guard passed.
- Phase 7 cross-path profile: 16 cases, parity/import/concurrency passed.
- Email delivery switch: 4 Node/PHP checks passed.
- Permission inventory: ADMIN 219, INLINE_GUARD 55, USER_WORKFLOW 41.
- API smoke: 6/6 passed.
- Read-only API preflight: 90/90 passed.
- Database audit: 2,492 employees, 41 departments, 26 Safety Units;
  PASSWORD_CHANGE_REQUIRED 2,453, SAFETY_UNIT_REQUIRED 3, READY 36;
  unknown departments 0; resolver errors 0; Node/PHP parity true.
- Data defects remain review-only: invalid position 1 and hidden whitespace 8.
  Blank Unit for users who have not completed onboarding is not mass-remediated.

Final database state after all UAT cleanup:

- employees: 2,492
- registration requests: 9
- admin audit logs: 1,436
- login attempts: 126
- synthetic `U8%` residue across those tables: 0
- duplicate `registrationrequests` table: absent

## Remaining release gates

Local code/API readiness is complete, but deployment remains **NO-GO** until a
separate deployment approval because:

1. Production environment variables, origins, SMTP mode, and secrets were not
   inspected or changed.
2. A production backup/restore owner and rollback window were not confirmed.
3. Automated real-browser UAT could not run in this environment: Chrome/Edge
   headless CDP did not respond under Node 24, and the renderer was blocked by
   local GPU sandbox/CDN constraints. Backend flow, frontend contracts, and
   local HTTP APIs passed, but the password modal and Safety Unit page still
   require one manual browser pass before deployment.
4. The existing dirty worktree is not a reviewed release commit or artifact.

No deployment command should be run as part of Phase 8 or Phase 9.
