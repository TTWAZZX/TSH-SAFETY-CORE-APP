# Johnny AI Phase 8.1 — Authenticated Local UAT & Closeout

Date: 2026-10-07

Scope: Local-only authenticated runtime, isolated disposable databases, and loopback Browser UAT

Decision: `PASS — READY FOR RELEASE REVIEW`

## Outcome

Phase 8.1 authenticated local UAT passed for Node and PHP with matching routing/source results. The full Johnny workspace and global Side Drawer passed desktop and 390 px Edge checks. Pure usage, mixed policy/UI, selected-document, live-system-data, and emergency questions all retained the intended evidence path.

This closeout did not connect to or mutate Production, call the public internet, use a real Gemini endpoint, deploy, commit, or push.

## Defect found and remediated during UAT

The first runtime run exposed a false live-data activation. In a mixed question such as “According to company policy, how do I open the Accident reporting screen?”, the legacy system-data detector interpreted the UI verb `open` as an Open-status query. With no related source tables in the isolated fixture, the request correctly failed closed but incorrectly replaced valid company-document evidence with `not_verified`.

Node and PHP now invoke the live system-data loader only when the Phase 8.1 classifier emits `live_system_data_signal`. The same flag also blocks web routing. The rerun proved that:

- UI wording containing `open` no longer triggers system-data reads by itself.
- Mixed policy/UI retains both `company_document` and `system_usage` sources.
- A genuine live Patrol question still returns only `system_data`.
- Node and PHP produce the same routing/source result.

## Authenticated answer matrix

| Case | Expected/observed primary source | Evidence |
|---|---|---|
| Pure usage | `system_usage` | Deterministic catalog answer; zero embedding and generation calls |
| Mixed policy/UI | `company_document` | Company document plus System Usage citations; `mixedIntent=true` |
| Selected document | `company_document` | Every citation is restricted to the selected document ID |
| Live Patrol data | `system_data` | Fixture totals: 3 walks, 2 open/in-progress issues, 1 closed |
| Emergency eye splash | `safety_knowledge` | Curated manual evidence; 15-minute eyewash instruction |

Each stack persisted five authenticated conversations and assistant metadata, then deleted them through the normal authenticated endpoint. Final chat, message, and feedback counts were zero before each disposable database was dropped.

## Runtime isolation

- Database host must be loopback.
- Database names must match guarded Phase 8.1 Node/PHP prefixes.
- Each stack receives a new database, applies the additive Johnny migration twice, and seeds only three KB documents/chunks plus minimal Patrol fixture tables.
- Gemini-compatible embedding and generation calls go only to a deterministic HTTP service on `127.0.0.1`.
- Web research is disabled and the mock recorded `webToolRequests=0`.
- Both disposable databases were dropped; no fixture schema remained.

## Browser evidence

Authenticated Edge UAT passed with no Johnny API failures:

- Full workspace at 1366×768: pure Dashboard usage answer, verified source, no horizontal overflow.
- Side Drawer at 1366×768: mixed policy/UI answer with company-document and usage citations.
- Side Drawer at 390×844: emergency answer with Safety Knowledge citation, 44 px minimum visible controls, no overflow.
- The same authenticated browser session verified selected-document isolation and live-system-data source metadata through the runtime API.
- Both server-only shared contracts returned `404`.
- Browser cleanup left zero conversations.

Evidence directory:

`backups/local/johnny-phase81-browser-20261007013706/`

Artifacts:

- `workspace-pure-usage-desktop.png`
- `drawer-mixed-policy-ui-desktop.png`
- `drawer-emergency-mobile-390.png`
- `result.json`

## Verification

Authenticated runtime command:

```text
cd backend
npm run uat:johnny-phase81-authenticated-local
```

Observed runtime result:

- Node answer matrix: pass
- PHP answer matrix: pass
- Node/PHP source-routing parity: pass
- Browser workspace/drawer: pass
- Embedding calls: 12
- Generation calls: 12
- Web tool requests: 0
- Unexpected Johnny API failures: 0
- Chat/message/feedback residue: 0/0/0 per stack
- Disposable database residue: 0

Focused/static regression commands remain documented in `docs/johnny-phase8.1-routing-remediation.md`.

## Files added for UAT

- `backend/scripts/johnny-phase81-authenticated-local-uat.js`
- `backend/scripts/johnny-phase81-browser-local-uat.js`
- `backend/scripts/johnny-phase81-node-fixture-host.js`
- `backend/scripts/johnny-phase81-php-router.php`
- `docs/johnny-phase8.1-authenticated-local-uat-closeout.md`

## Release boundary

Phase 8.1 routing remediation and controlled authenticated local UAT are complete and ready for release review. This is not a Production deployment approval by itself.

The loopback model intentionally makes answer content deterministic so routing, retrieval, citations, persistence, parity, and UI can be evaluated without external data disclosure or model variance. A controlled real-model acceptance run is still recommended before release if the release gate requires judging natural-language synthesis quality rather than orchestration correctness alone.
