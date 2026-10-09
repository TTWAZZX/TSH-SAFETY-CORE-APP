# Safety Vote Phase 9.4 — Immutable Candidate and Fresh Protected Production Preflight Scope

Date: 2026-10-09
Contract: `2026-10-09-safety-vote-phase9.4-r1`
Production target: `https://dev.tshpcl.com/safety/tsh-safety-core/`

## Authorized work

Phase 9.4 may create one scoped immutable Git candidate containing the accepted Safety Vote UX Phase 8 and Phase 9.1–9.3 changes, their tests, documentation and release tooling. It may then perform a fresh protected Production preflight using the already-reviewed checksum-locked Phase 8.2 helper contract.

The protected preflight is limited to value-suppressed configuration/capability checks, `INFORMATION_SCHEMA`, `SHOW GRANTS`, row counts, schema-only Safety Vote export, private-storage presence and clock checks in a read-only database transaction. A privacy-safe backup may be created, downloaded twice, hash-verified, restored only into a guarded disposable local database and removed from Production.

## Prohibited work

- No application runtime deployment, migration, module enablement, configuration change or business-data mutation.
- No Production login, synthetic account, authentication bypass or external notification/handoff.
- No reading or exporting ballot choices, answers, participation, eligibility identities, submissions, nominations, jury scores or voter-to-choice mappings.
- No commit of `.env`, credentials, private files, backups or `backend/scripts/patrol-checkin-v2.test.js`.
- No push. Deployment requires a separate explicit instruction after this phase.

## Fail-closed gates

- Candidate delta contains only classified Safety Vote paths and all bytes are read from immutable Git blobs.
- Local Phase 9.3 aggregate verification and UX Phase 1–8 static contracts pass before commit.
- Candidate manifest records commit, tree, parent, per-file SHA-256 and scope digests.
- The helper and guard download-back hashes match; unauthenticated GET and invalid token fail closed.
- Production `.htaccess` is restored byte-exact and helper, guard, backup and temporary directories leave zero residue.
- Any unexpected Safety Vote business row, private file, schema/configuration drift, privilege failure, restore mismatch or cleanup failure yields `HOLD`.

An immutable candidate and successful technical preflight do not authorize deployment. Missing authenticated non-mutating Production smoke remains a release blocker unless separately resolved or accepted by the SHE owner.
