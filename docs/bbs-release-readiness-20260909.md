# BBS performance release readiness — 2026-09-09

## Decision

The Sets 1-5 candidate is technically ready for a staged Admin-only Production deployment. It is not approved or deployed by this review. Ordinary-user/Pilot rollout remains blocked by business configuration and acceptance evidence; Production must retain `staged_admin_only=1` and `pilot_scope_only=0` during this code release.

This candidate changes no database schema, BBS business records, private-upload path, card/QR lifecycle, or rollout setting. Production runtime scope is expected to be:

- `index.html`
- `public/js/main.js`
- `public/js/pages/bbs-smart-card.js`
- `public/js/pages/bbs-card-designer.js`
- `public/js/utils/bbs-async-ui.js`
- `api/handlers/bbs_smart_card.php`

`backend/routes/bbs-smart-card.js` is the Node/local parity implementation. Test scripts, package scripts, and these evidence documents are not PHP Production runtime files.

## Before and after

The values below are reproducible local control runs and directional comparisons, not Production p75/p95 claims. Absolute values vary with database and browser contention; deterministic request reductions are the stronger evidence.

| Measurement | Before | Final Set 6 run | Change |
| --- | ---: | ---: | ---: |
| Initial BBS page load | 402 ms | 154 ms | 62% faster |
| Active Core workspace | 182 ms | 115 ms | 37% faster |
| Initial BBS requests | approximately 20 | 8 | approximately 60% fewer |
| `eligible-employees` isolated median | 96.1 ms | 38.0 ms | 60% faster |
| `eligible-employees` isolated p95 | 102.5 ms | 51.7 ms | 50% faster |
| Designer Draft create/resource readiness | 261 ms | 154 ms | 41% faster |
| Designer Save | 116 ms | 43 ms | 63% faster |
| Initial Designer image requests | 4 | 1 | 75% fewer |

The final `eligible-employees` audit returned 2,240 rows and matched every employee/Master projection against the legacy SQL result. The final Browser UAT observed the endpoint at 57 ms under concurrent initial workspace load. Save, Apply Preset, and Preset Trash each issued only their own mutation request. Front loaded first; Back issued exactly one background request only when opened, with no Front reload or unused asset request.

## Verification matrix

| Gate | Result |
| --- | --- |
| Complete BBS contract/regression suite | PASS — 53/53 |
| JavaScript syntax for changed runtime/tests | PASS |
| PHP syntax | PASS |
| Node/PHP BBS contract parity | PASS |
| Query projection equality to legacy SQL | PASS — 2,240/2,240 rows |
| Full authenticated BBS navigation | PASS — 8 tabs |
| Responsive/accessibility browser matrix | PASS — 5 viewports |
| Failure state and Retry behavior | PASS |
| Designer desktop and phone preview-only behavior | PASS |
| Master Artwork isolation/snapshot UAT | PASS |
| Layout Preset, Draft-only Apply, Trash/Restore UAT | PASS |
| Designer private asset/auth/immutable layout API UAT | PASS |
| Browser console errors | PASS — zero |
| Temporary template/version/asset/master/preset residue | PASS — zero |
| Diff whitespace validation | PASS |

The Designer API UAT was updated during this gate because its old fixture predated mandatory Personal Front/Back Master Artwork. The corrected UAT now creates isolated temporary Master Artwork, verifies immutable duplex snapshots and restores the prior active Masters during cleanup.

## Rollout boundary

The read-only Phase 10E acceptance audit returned `CONFIGURATION_REQUIRED`. Integrity checks are clean (`OrphanObservationFiles=0`, `OrphanActionFiles=0`, `OrphanActions=0`, `UnsafeMissingAction=0`, queued/failed BBS emails `0`), but the configured Pilot scope is inactive and representative schedule, checklist, active card templates, Department QR, Community handler, and workflow acceptance evidence are incomplete. Action email delivery is also disabled.

Those items do not block deploying this performance candidate behind the existing Admin-only gate. They do block Controlled Pilot or ordinary-user rollout. Do not change the rollout flags as part of this deployment.

## Required deployment gate

Before an explicitly approved deployment:

1. Take fresh verified Production backups of the database, application runtime, and BBS private uploads.
2. Download and hash the six existing Production runtime files; stop if unexpected Production drift overlaps this candidate.
3. Preserve `staged_admin_only=1`, `pilot_scope_only=0`, and the existing Designer feature-flag values.
4. Deploy only the reviewed PHP runtime scope above; no migration is required.
5. Verify FTPS download-back and public HTTPS/cache keys.
6. Run authenticated Admin read smoke, Designer Front/Back preview, one controlled Draft Save/Apply/Trash lifecycle with cleanup, and anonymous/non-Admin authorization checks.
7. Confirm zero helper, SQL, test-row, and test-file residue. Roll back runtime files only on failure; preserve all additive schema and BBS history.

No Git push or Production deployment was performed during Set 6.
