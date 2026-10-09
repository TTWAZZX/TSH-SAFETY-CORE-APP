# Safety Vote Phase 10.4 Production Closeout

Date: 2026-10-09
Decision: `PASS_PHASE104_PRODUCTION_DEPLOYMENT_RECOVERED`

## Released candidate

- Source commit: `035be38f8dd1dd44bb43501ffa9dc0a876716d0b`
- Source tree: `7b889e8aadb9db17db1b8529020b39c25a2e7e2b`
- Production runtime allowlist: 14 paths sourced directly from immutable Git objects
- Additive schema: 39 to 40 `SafetyVote_*` tables with `SafetyVote_MediaLinks`, version lineage columns and Phase 10.4 settings contract

## Guarded deployment result

- All 12 prior runtime files were double-downloaded and matched the Phase 9.6 Production baseline. The two Phase 10.4 PHP paths were proven absent before upload.
- The final Production runtime was double-downloaded and matched the candidate SHA-256 for all 14 paths.
- The private schema rollback artifact was double-downloaded at 558 bytes with SHA-256 `47bf46953e6269416d046ae2159b95985a9ebfc77cf3b62632f87d863437e29b`; direct HTTPS returned `403`.
- Runtime rollback manifest SHA-256: `0ca24058b334bb14827b2d7fcb2c2d00a782612cdcb7f993239c715d103709ff` (restore 12 paths, remove 2 proven-new paths).
- The migration preserved all 2,575 existing Safety Vote business rows and the existing campaign count of 1. No campaign content or personal data was written to evidence.
- `module_enabled=1` remained enabled. `phase7_integrations_enabled=0` and all external provider configuration remained disabled/unconfigured.
- The temporary checksum-locked helper self-cleaned, the private backup was removed after verification, `.htaccess` was restored byte-exact to SHA-256 `7c648d9a72e469b427cb65e40aff98d329bd2631d5a9fea0dc3787d9b9bb730d`, and remote helper/backup residue is zero.

## Recovery event

The first attempt stopped before mutation because the historical zero-campaign gate found one legitimate Production campaign. A corrected preservation gate was used. On the next attempt the schema migration completed, but one obsolete client-side assertion still expected zero total business rows. Runtime rollback completed successfully, while the already-successful additive schema remained at Phase 10.4 and old runtime consequently returned health `503`.

The bounded recovery path verified 40 tables, zero Phase 10.4 media/lineage rows, unchanged existing data, module/integration posture and a fresh private rollback artifact before deploying the immutable runtime candidate. Final authenticated health returned `200`, ready, module enabled and schema `2026-10-09-phase10.4-r1`. This event is retained as release evidence rather than hidden.

## Production smoke

- Authenticated Admin/User browser smoke passed at 390x844, 430x932, 768x1024, 1366x768 and 1920x1080.
- The smoke observed 39 Safety Vote API responses; all returned `200` with `private, no-store` policy.
- Anonymous health access returned `401` with the privacy policy.
- Browser console errors, runtime exceptions, horizontal overflow and non-GET Production requests were all zero.
- No login, permission mutation, campaign creation, email, notification or external delivery occurred.

## Evidence

- Successful guarded deployment: `backups/production/safety-vote-phase104-deploy-20261009091414/`
- Deployment result SHA-256: `d8194aee56bcf487e6ee7e54b56e1aa701cab1b2f33e83221ff21e9271205d76`
- Browser smoke: `backups/production/safety-vote-phase96-browser-smoke-20261009091539/`
- Earlier safe holds: `backups/production/safety-vote-phase104-deploy-20261009090749/` and `backups/production/safety-vote-phase104-deploy-20261009091047/`

Secrets, secret hashes, response bodies and personal data were not recorded. Local evidence directories remain ignored and are not committed.
