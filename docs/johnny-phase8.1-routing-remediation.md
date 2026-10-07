# Johnny AI Phase 8.1 — Intent Routing Remediation and Evidence Preservation

Date: 2026-10-07

Scope: Local implementation, static evaluation, authenticated isolated lifecycle and Browser UAT

Decision: `PASS — READY FOR RELEASE REVIEW`

## Outcome

Phase 8.1 removes the routing condition that allowed a broad usage keyword plus Side Drawer `pageContext` to suppress Knowledge Base, Safety Knowledge and live-system retrieval. Only a pure, high-confidence product-usage request can now use the deterministic System Usage Catalog shortcut. Mixed, uncertain, document-signalled, safety-critical and live-data questions retain their evidence paths.

No Production connection, deployment, commit, push, external network call or real Gemini call was used. Authenticated closeout used guarded disposable local databases and loopback-only deterministic model fixtures; see `docs/johnny-phase8.1-authenticated-local-uat-closeout.md`.

## Root cause

The Phase 3 classifier treated broad terms such as `วิธีใช้`, `ขั้นตอน` and `ทำอย่างไร` as product-usage intent. When the Side Drawer supplied `pageContext`, the current module received 100 points even when the question did not refer to the UI. Any score greater than zero became a usage match.

The chat orchestration then used `usageResult.matched` as an exclusive switch. A match skipped Knowledge Base and system-data retrieval, disabled web/Gemini generation and returned a deterministic catalog answer. Valid catalog content was therefore presented for the wrong user intent.

## Behavior before and after

| Question | Before | Phase 8.1 |
|---|---|---|
| `หน้านี้ใช้งานอย่างไร` on Patrol | Patrol usage guide | Patrol usage guide, pure/high-confidence |
| `วิธีปฐมพยาบาลผู้หมดสติ` on Patrol | Could become Patrol usage guide | Not usage; preserves Safety Knowledge/general safety path |
| `วิธีใช้ PPE ที่ถูกต้อง` | Could match Safety Culture from one token | Not usage; requires safety evidence |
| `นโยบายความปลอดภัยกำหนดขั้นตอนอย่างไร` | Could become Policy module guide | Not pure usage; Knowledge Base required |
| `ขั้นตอนรายงานอุบัติเหตุตามระเบียบบริษัทคืออะไร` | Could become Accident module guide | Knowledge Base required |
| `กดต่ออายุใบอนุญาตรถยกตรงไหน` | Forklift usage guide | Forklift usage guide, pure/high-confidence |
| Policy question plus an explicit UI action | One source won exclusively | Mixed intent; usage context and KB retrieval are both retained |
| `วันนี้ Safety Patrol เช็กอินครบกี่คน` | Non-usage negative case | Explicit live-data signal; system-data path retained |

## Routing contract

The Node and PHP classifiers now return:

- `matched`
- `pureUsage`
- `confidence` and `confidenceLevel`
- `reasons`
- `explicitUiIntent`
- `referencedPage`
- `referencedModules`
- `requiresKnowledgeBase`
- `mixedIntent`
- catalog `entries` and `version`

`pageContext` can select a module only when the question explicitly refers to the current UI, for example `หน้านี้`, `เมนูนี้`, `ตรงนี้` or contextual wording such as `ต้องกดไหน`. A named module takes precedence over the current page.

Pure catalog routing requires a verified module plus explicit UI intent, an exact curated catalog question, a broad system-guide request, or an explicit current-page reference. Generic token overlap no longer creates a match.

Document/policy, safety/emergency and live-data signals are recorded independently. A question with both UI and document signals is `mixedIntent`; it is not eligible for deterministic bypass.

## Evidence orchestration

The deterministic `system-usage-catalog` response is limited to:

```text
pureUsage = true AND confidenceLevel = high
```

All other questions retain Knowledge Base retrieval. Non-scoped questions also retain the existing system-data detector. Company/safety evidence signals disable web routing. A mixed answer can expose multiple source groups; System Usage citations no longer make an unverified company-policy answer appear verified when KB retrieval found no evidence.

The selected-document contract remains fail-closed: a valid `documentId` disables usage routing and searches only the selected active document; an invalid or inactive selection still returns 404 before chat processing.

## Test matrix

The focused evaluator covers 18 direct cases and 147 false-positive combinations (seven questions across all 21 registered module page contexts), for 165 total cases. It sends the same payload to the PHP evaluator and compares every classification and routing-decision field with Node.

Covered cases include:

- Exact catalog questions and current-page references
- Thai spoken UI wording
- Thai and English named-module UI questions
- Company policy, regulation and document wording
- PPE, first aid and fire emergency wording
- Live Patrol counts/status
- Mixed policy plus UI intent
- Scoped-document orchestration markers
- Deterministic/KB/web routing decisions

Machine-readable output marker: `JOHNNY_PHASE81_ROUTING_REMEDIATION`.

## Files changed

- `backend/lib/johnny-system-usage.js`
- `api/lib/johnny_system_usage.php`
- `backend/routes/johnny-ai.js`
- `api/handlers/johnny_ai.php`
- `backend/scripts/johnny-phase3-system-usage-eval.js`
- `backend/scripts/johnny-phase81-routing-remediation-eval.js`
- `backend/scripts/johnny-phase81-routing-remediation-php-eval.php`
- `backend/scripts/johnny-phase81-authenticated-local-uat.js`
- `backend/scripts/johnny-phase81-browser-local-uat.js`
- `backend/scripts/johnny-phase81-node-fixture-host.js`
- `backend/scripts/johnny-phase81-php-router.php`
- `backend/package.json`
- `docs/johnny-phase8.1-routing-remediation.md`
- `docs/johnny-phase8.1-authenticated-local-uat-closeout.md`

No frontend behavior, shared catalog content, schema, feedback, workflow action, retention, KB authorization or authenticated file delivery behavior changed.

## Verification commands

From `backend/`:

```text
node scripts/johnny-phase81-routing-remediation-eval.js
node scripts/johnny-phase3-system-usage-eval.js
C:\xampp\php\php.exe scripts/johnny-phase3-system-usage-php-eval.php
node scripts/johnny-phase1-production-foundation-smoke.js
node scripts/johnny-phase2-global-drawer-smoke.js
node scripts/johnny-golden-quality-smoke.js
node scripts/johnny-mobile-compact-smoke.js
node scripts/johnny-phase4-quality-release-eval.js
node scripts/johnny-phase4-observability-smoke.js
node scripts/johnny-phase5-workflow-release-eval.js
node scripts/johnny-phase5-workflow-smoke.js
node scripts/johnny-phase71-release-gate-smoke.js
```

Syntax and repository checks:

```text
node --check lib/johnny-system-usage.js
node --check routes/johnny-ai.js
node --check scripts/johnny-phase81-routing-remediation-eval.js
C:\xampp\php\php.exe -l ..\api\lib\johnny_system_usage.php
C:\xampp\php\php.exe -l ..\api\handlers\johnny_ai.php
C:\xampp\php\php.exe -l scripts\johnny-phase81-routing-remediation-php-eval.php
git diff --check
```

## Verification result

- Phase 8.1 routing: 165/165 cases, Node/PHP field parity
- Phase 3 Node: 105/105
- Phase 3 PHP: 135/135
- Phase 1: 33/33
- Phase 2: 33/33
- Golden quality: 9/9
- Mobile compact: 14/14
- Phase 4 quality: 42/42
- Phase 4 observability: 7/7
- Phase 5 release: 49/49
- Phase 5 workflow smoke: 9/9
- Phase 7.1 static gate: 40/40

## Known limitations

- Phase 8.1 remains a deterministic Thai/English ruleset. It does not yet implement model-based multi-intent classification or a retrieval reranker.
- Knowledge Base chunking, embedding quality and document revision ranking are unchanged.
- Mixed-source synthesis, persistence and Browser behavior passed with a deterministic Gemini-compatible loopback service. A controlled real-model run remains recommended if release acceptance includes natural-language synthesis quality.
- The safety signal currently requests the existing KB/Safety Knowledge path; a dedicated curated emergency knowledge tier is future work.

## Release gate

Phase 8.1 implementation and controlled authenticated local UAT are `PASS — READY FOR RELEASE REVIEW`. This does not authorize Production deployment. Release review must still decide whether a controlled real-model synthesis run and Production preflight/backup/drift gates are required before deployment.
