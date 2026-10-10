# Safety Vote Admin UX Improvement Phase 1–3 — Production Release Preparation

วันที่: 2026-10-10

สถานะ: `READY_FOR_AUTHORIZED_IMMUTABLE_COMMIT`

ฐานอ้างอิง: `main` commit `20b09f9b1a3369d3d989614e0ed7b93fc096db42`

## Release decision

งาน Phase 1–3 ผ่าน cumulative local regression, Node/PHP parity และ authenticated Local Browser UAT แล้ว แต่ยังไม่ถือเป็น immutable candidate จนกว่าจะได้รับอนุมัติให้สร้าง commit ตาม exact scope ด้านล่าง

ไม่มีการเชื่อม Production, deploy, commit หรือ push ในขั้นตอนนี้

## Production runtime allowlist — 10 paths

1. `api/handlers/safety_vote_planning.php`
2. `api/lib/safety_vote_planning.php`
3. `backend/routes/safety-vote-planning.js`
4. `backend/services/safety-vote-planning.js`
5. `index.html`
6. `public/js/pages/admin-safety-vote-ux1.js`
7. `public/js/pages/admin.js`
8. `public/js/pages/safety-vote-campaign-wizard.js`
9. `public/style.css`
10. `public/js/pages/admin-safety-vote-review.js` — new path; rollback removal is permitted only when Production read-only preflight proves the path absent

Detailed size/SHA-256 values are locked in `docs/safety-vote-admin-phase123-release-manifest.json`.

## Test/tooling scope — 10 paths

1. `backend/package.json`
2. `backend/scripts/safety-vote-ux-phase8-static.test.js`
3. `backend/scripts/safety-vote-ux-phase9a-static.test.js`
4. `backend/scripts/safety-vote-ux-phase9b-static.test.js`
5. `backend/scripts/safety-vote-ux-phase9c-static.test.js`
6. `backend/scripts/safety-vote-admin-simplification-static.test.js`
7. `backend/scripts/safety-vote-admin-guided-drafts-static.test.js`
8. `backend/scripts/safety-vote-admin-guided-drafts-browser-uat.js`
9. `backend/scripts/safety-vote-admin-review-governance-static.test.js`
10. `backend/scripts/safety-vote-admin-review-governance-browser-uat.js`

## Documentation/release scope — 5 paths

1. `docs/safety-vote-admin-ux-simplification-phase1.md`
2. `docs/safety-vote-admin-ux-improvement-phase2-guided-drafts.md`
3. `docs/safety-vote-admin-ux-improvement-phase3-review-queue-governance.md`
4. `docs/safety-vote-admin-phase123-release-manifest.json`
5. `docs/safety-vote-admin-phase123-production-release-preparation.md`

Exact proposed commit scope: **25 paths**. No file outside this list is authorized for the candidate commit.

## Schema manifest

- New migrations: 0
- Schema changes: 0
- Rollback SQL: 0
- Phase 3 review notes reuse `SafetyVote_AuditLogs`
- Production preflight must not run DDL/DML

## Rollback package

Local package: `backups/local/safety-vote-admin-phase123-release-prep-20261010-224232/`

- Candidate ZIP: SHA-256 `30685ce2784c344298f316b910008cfdbf7cbcd7dfe151c599a6a6cfc16da642`
- Rollback ZIP from base `HEAD`: SHA-256 `7a4fec5fa82669dd8ca81d751b3598af759fca6b032b24db36a9cfa89b63850f`
- Restore files: 9
- Conditional removal: `public/js/pages/admin-safety-vote-review.js` only after remote-absence proof

The rollback archive is an offline base-commit package. Before any Production deploy it must be superseded or confirmed by a byte-exact remote-before backup and double-download hashes.

## Verification

- Admin Phase 1 static: PASS, 20 assertions
- Admin Phase 2 static: PASS, 32 assertions
- Admin Phase 3 static/Node-PHP pure parity: PASS, 27 assertions
- UX Phase 9A static/parity: PASS, 29 assertions
- UX Phase 9B static/parity: PASS, 44 assertions
- UX Phase 9C static/contract: PASS, 43 assertions
- UX Phase 8 regression: PASS, 48 assertions
- Phase 10.3 static: PASS
- Phase 10.4 static/Node-PHP parity: PASS, 26 assertions
- Phase 8.3.1 disabled-mode Node/PHP parity: PASS
- Phase 9B guarded Node/PHP API lifecycle: PASS, queue-only and external delivery 0
- Phase 1–2 authenticated Browser UAT: PASS, 5 Admin viewports
- Phase 3 authenticated Node/PHP route parity + Browser UAT: PASS, 5 Admin viewports
- Viewports: 390×844, 430×932, 768×1024, 1366×768, 1920×1080
- Horizontal overflow: 0
- Interactive targets below 44 px: 0
- Console/page errors: 0
- Disposable database residue: 0
- `git diff --check`: PASS

Latest evidence:

- `backups/local/safety-vote-admin-guided-drafts-1791646869593/`
- `backups/local/safety-vote-admin-review-governance-1791646884680/`
- `backups/local/safety-vote-ux-phase9b-api-1791646927922/`

## Required next gates

1. Explicit authorization for the exact 25-path immutable commit
2. Verify commit tree and regenerate candidate hashes directly from Git objects
3. Production read-only drift/preflight against the 10-path allowlist
4. Byte-exact remote-before rollback package and conditional-new-path proof
5. Separate explicit Production deployment authorization

Decision: `READY_FOR_EXACT_SCOPE_COMMIT_AUTHORIZATION_NO_DEPLOY_NO_PUSH`
