# Safety Vote Phase 9.5 — Controlled Pilot Preflight

Date: 2026-10-09

Decision: `PASS_AUTHENTICATED_ENTRY_GATE_PILOT_DEPLOYMENT_NOT_STARTED`

## Outcome

Phase 9.5 completed its pre-deployment checks and authenticated GET-only entry smoke, then stopped before deployment as required. Candidate integrity, disabled Production posture, remote-drift coverage, rollback packaging and authenticated-session readiness pass.

No Production login, authentication bypass, runtime deployment, module opening, external delivery, SMTP authentication, email or push occurred.

## Credential hygiene

The user attested that the exposed Gmail App Password was revoked at the provider and replaced in `backend/.env`. Value-suppressed checks establish only that:

- an SMTP credential is present;
- `backend/.env` is not tracked and is ignored by Git;
- no credential value or credential hash was written to output/evidence;
- no email was sent and SMTP authentication was not attempted.

The preflight does not claim provider-side rotation independently because doing so would require an external authentication operation outside this gate.

## Immutable runtime candidate

- Commit: `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b`
- Tree: `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`
- Candidate manifest SHA-256: `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c`
- Runtime scope SHA-256: `d4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc`
- Runtime paths: `41`

Every runtime record was verified against the immutable Git blob referenced by the Phase 9.4 manifest. Later commits contain remediation/release tooling and documentation, not a different runtime payload.

## Production posture

The accepted independent Phase 9.4 postcheck at `backups/production/safety-vote-phase82-preflight-20261009034316/` establishes:

- `module_enabled=0`;
- `phase7_integrations_enabled=0`;
- external provider environment keys unconfigured;
- Phase 7 schema with 39 tables and 11 permissions;
- Safety Vote business rows `0` and private Safety Vote files absent;
- privacy-safe backup/restore and helper cleanup passed with zero residue.

Phase 9.5 did not reconnect to or mutate Production after that accepted postcheck.

## Remote drift and rollback package

Source drift evidence: `backups/production/safety-vote-phase94-drift-20261009025816/`

The read-only evidence covers all 41 runtime paths. It records four remote-drift shell files and fifteen parent-runtime UX files absent remotely; one candidate-new path is also absent as expected.

Offline rollback evidence: `backups/production/safety-vote-phase95-preflight-20261009035440/`

- Restore from verified remote-before bytes: `25` paths.
- Remove on rollback only because absence was proven: `16` paths.
- Rollback ZIP entries: `26` (manifest plus 25 remote-before files).
- Rollback ZIP bytes: `306,679`.
- Rollback ZIP SHA-256: `df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394`.
- Rollback manifest SHA-256: `31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd`.
- Phase 9.5 result SHA-256: `1ebf04a97d223965e7cc3eb9d3ae6e720a07b2004a641f51e7de03f78f732bfa`.

The archive contains no `.env`, credential, database business data or private Safety Vote content. Database rollback for this phase is not applicable because no schema migration is authorized; the safe posture remains module/integrations disabled.

## Authenticated GET-only gate

The initial preflight found no existing bearer token/session. Logging in would create login/audit mutations, so authentication was not attempted or bypassed.

The dedicated value-suppressed GET-only smoke runner accepts exactly one of `SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN` or `SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE` from ignored `backend/.env`. It never records the credential value or response body and permits only the authenticated health GET plus a module-disabled campaigns GET. The first guarded run found neither key, emitted zero HTTP requests and stopped at `HOLD_NO_EXISTING_AUTHENTICATED_SESSION`. Evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009042622/`; result SHA-256: `079e36795c59b7d21b7d490d5f76b50a426f336fac1334612027c3ad02a43be9`.

After the user stored an existing bearer token directly in ignored `backend/.env`, the fresh guarded smoke passed without login. Authenticated health returned `200`, reported ready and confirmed `module_enabled=false`. The campaigns GET returned the required fail-closed `503 SAFETY_VOTE_MODULE_DISABLED`. Both responses used JSON and `Cache-Control: no-store`; no token, response body or protected business value was recorded. Evidence: `backups/production/safety-vote-phase95-auth-smoke-20261009044244/`; result SHA-256: `83f677656dd736e7cb74e3e8328cae32be6bf085819eeb887c714dcf74b2992b`.

The authenticated entry gate is resolved. Controlled pilot deployment was explicitly prohibited in this run and has not started. Module and external integrations remain disabled; Phase 9.6 must not begin until the controlled pilot is separately authorized, executed and accepted.
