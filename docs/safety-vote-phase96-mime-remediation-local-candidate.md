# Safety Vote Phase 9.6 MIME Remediation Candidate

Date: 2026-10-09  
Mode: Local only / review only  
Decision: `MIME_REMEDIATION_CANDIDATE_READY_FOR_REVIEW_NOT_AUTHORIZED`

## Diagnosis

The retained Production `.htaccess` evidence is byte-exact with the repository baseline:

- Bytes: `1,246`
- SHA-256: `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`
- No `AddType` or other MIME mapping exists for `.mjs`.

Safety Vote imports eight `.mjs` runtime modules. During the failed Phase 9.6 browser gate, Chrome rejected the first three module requests because their response MIME type was empty. Since ES module imports are resolved before feature-flag fallback evaluation completes, the problem blocks both the new UX and the legacy Safety Vote wrapper.

## Bounded correction

The root `.htaccess` adds exactly:

```apache
# ES modules must be served with a JavaScript MIME type on shared hosting.
AddType application/javascript .mjs
```

The correction does not change API rewrites, authorization forwarding, directory indexing, protected-file denial, ordinary `.js` handling, application permissions, database settings or feature flags.

## Immutable candidate

- Commit: `5a6e6c4daa706647df1036cc65c57c92186d97fb`
- Tree: `92e0d3a9da2c1ca14660affa1344b0727421a668`
- Production runtime allowlist: `.htaccess` only
- Immutable Git-blob bytes: `1,328`
- Immutable Git-blob SHA-256: `7c648d9a72e469b427cb65e40aff98d329bd2631d5a9fea0dc3787d9b9bb730d`

The Git-blob digest is authoritative for a future deployment. The working-tree checksum may differ because Git normalizes line endings; a guarded deployment must extract the file directly from the named Git object.

## Regression results

- Phase 9.6 MIME bounded-scope regression: PASS
- Production evidence checksum: PASS
- Eight imported `.mjs` files inventoried and checksum-locked: PASS
- No `.js` MIME override or file-access broadening: PASS
- Local Apache `httpd -t`: `Syntax OK`
- Loopback `.mjs` response: `200 application/javascript`
- Safety Vote UX Phase 1–8 static contracts: PASS
- Disabled-mode Node/PHP parity: PASS
- `git diff --check`: PASS

## Review manifest and rollback candidate

Manifest: `docs/safety-vote-phase96-mime-remediation-manifest.json`  
Manifest SHA-256: `73cb28d24e81782e88d7bf34548290a9a337c6a74afc7aa5283d6a4646168ab4`

Rollback restores the retained Production `.htaccess` evidence:

- Source: `backups/production/safety-vote-phase82-preflight-20261009063228/htaccess-before-a`
- Bytes: `1,246`
- SHA-256: `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`
- Remove-on-rollback paths: none
- Local in-memory restore drill: PASS

The review runner validates the manifest, immutable candidate, rollback source and all eight already-deployed `.mjs` Git blobs. It accepts only `--validate-local`; no upload, FTPS, HTTPS or Production execution code path exists.

```text
npm run review:safety-vote-phase96-mime
```

## Required gates for any later authorized Production remediation

1. Reconfirm current remote `.htaccess` by double download against the exact Production-before SHA-256.
2. Reconfirm module enabled, integrations/providers disabled, zero business rows and the authenticated bearer session.
3. Extract `.htaccess` only from immutable commit `5a6e6c4daa706647df1036cc65c57c92186d97fb` and verify its Git-blob SHA-256.
4. Upload exactly one path and double-download it byte-exact.
5. GET all eight `.mjs` paths and require `200` plus `Content-Type: application/javascript`; compare response SHA-256 with the locked runtime blobs.
6. Run authenticated GET-only legacy browser smoke before any feature-flag retry, including anonymous denial and no non-GET requests.
7. Run the protected settings/schema/zero-residue postcheck.
8. On any failure, restore the exact rollback `.htaccess`, double-download verify it, run enabled-state API smoke and stop at HOLD.

## Constraints

No Production connection or change, deployment, login, push, permission mutation, campaign creation, business-data write, email/notification or external integration action occurred. Production execution requires separate explicit authorization.
