# Johnny AI Phase 8.2 — Multi-source Retrieval, Evidence Ranking and Answer Synthesis

Date: 2026-10-07

Scope: Local implementation, deterministic evaluation, authenticated Node/PHP lifecycle and Browser UAT

Decision: `AUTHENTICATED_MULTI_SOURCE_UAT_PASS`

## Outcome

Phase 8.2 replaces the direct hybrid-score Top-K cut with a versioned evidence-ranking contract shared by Node and PHP. Retrieved chunks now carry an evidence type, intent boost, final evidence score, evidence tier, deterministic rank and trace contract. Selection limits document monopolization, removes duplicate chunks and retains relevant evidence from multiple documents and source types.

The answer pipeline now preserves separate `company_document` and `safety_knowledge` source groups instead of labelling every selected KB chunk as Safety Knowledge whenever one manual is present. The primary source follows the top ranked evidence, except safety/emergency intent explicitly prefers available Safety Knowledge.

No Production connection, deployment, schema change, external network call, real Gemini call, commit or push was used.

## Ranking contract

Contract: `2026-10-07-phase8.2-r1`

Each candidate starts from the existing semantic/keyword hybrid score. Phase 8.2 then applies a bounded intent adjustment:

- Company/document intent: `+0.10` for company documents.
- Safety/emergency intent: `+0.12` for Safety Knowledge and `-0.02` for company documents.
- Explicit selected-document scope: `+0.04` without allowing another document into the result.
- General questions: no source-type boost.

Final evidence score is clamped to `0..1` and classified as:

- `strong`: at least `0.82`
- `high`: at least `0.68`
- `supported`: at least `0.55`
- `weak`: below `0.55`

The existing semantic, keyword and hybrid thresholds still decide eligibility. Intent ranking does not allow a failed candidate to bypass those thresholds.

## Diversity and deduplication

- Exact normalized chunk duplicates from the same document are removed.
- Non-scoped retrieval selects at most two chunks per document.
- The first relevant chunk from each document within `0.18` of the top evidence score receives a diversity opportunity before remaining slots are filled.
- Final ordering remains deterministic by evidence, hybrid, semantic and keyword scores, then document/chunk identity.
- Scoped-document retrieval disables cross-document diversity and can retain multiple chunks from the selected document only.

The persisted ranking summary records candidate, eligible, rankable and selected counts; distinct documents; source types; strong-evidence count; top score; diversity state; and intent signals. It contains no prompt, answer or document text.

## Answer synthesis contract

Node and PHP prompts receive the same ranked context and instructions:

- Use stronger evidence before weaker evidence.
- Combine corroborating sources without merging different rules into one claim.
- If selected evidence conflicts, state the conflict and what must be verified instead of silently choosing one source.
- Answer the exact question first, then include only evidence-supported actions or explanation.
- Keep company documents, Safety Knowledge, System Usage and live System Data roles separate.
- Product-usage guidance cannot prove policy or current operational status.

Citation metadata now exposes `evidenceScore`, `evidencePercent`, `evidenceTier`, `intentBoost`, ranking contract and a `phase8.2_multi_source_hybrid` trace. The answer-quality snapshot persists the bounded ranking summary as `evidenceRanking` with `phase=8.2`.

## Evaluation

Focused cases cover:

1. Company intent with multiple company documents and Safety Knowledge.
2. Safety intent promoting Safety Knowledge to the primary/top evidence.
3. Duplicate removal and two-chunk-per-document cap.
4. Selected-document isolation with diversity disabled.

The evaluator sends identical fixtures to Node and PHP and compares selected order, scores, tiers, source groups, primary source and summary metadata.

Command:

```text
cd backend
npm run eval:johnny-phase82-evidence-ranking
```

Result:

- Phase 8.2 focused cases: `4/4`
- Node/PHP field parity: pass
- Authenticated multi-source Node/PHP matrix: pass
- Full workspace and Side Drawer Browser UAT: pass at desktop and 390 px
- Conflicting-document synthesis guard: pass
- Duplicate removal, two-chunk document cap and multi-document diversity: pass
- Safety Knowledge priority with company evidence preserved separately: pass
- Conversation/feedback residue: `0/0/0` on both stacks
- Disposable database residue: zero
- Browser/API failures and web-tool requests: zero
- Phase 8.1 authenticated Node/PHP answer matrix: pass
- Phase 8.1 routing: `165/165`
- Phase 3 Node/PHP: `105/105`, `135/135`
- Phase 1: `33/33`
- Phase 2: `33/33`
- Golden quality: `9/9`
- Mobile compact: `14/14`
- Phase 4 quality/observability: `42/42`, `7/7`
- Phase 5 release/workflow: `49/49`, `9/9`
- Phase 7.1 static gate: `40/40`

## Files

- `backend/lib/johnny-evidence-ranking.js`
- `api/lib/johnny_evidence_ranking.php`
- `backend/routes/johnny-ai.js`
- `api/handlers/johnny_ai.php`
- `backend/scripts/johnny-phase82-evidence-ranking-eval.js`
- `backend/scripts/johnny-phase82-evidence-ranking-php-eval.php`
- `backend/scripts/johnny-phase82-authenticated-multi-source-uat.js`
- `backend/scripts/johnny-phase81-authenticated-local-uat.js`
- `backend/scripts/johnny-phase81-browser-local-uat.js`
- `backend/scripts/johnny-phase81-node-fixture-host.js`
- `backend/scripts/johnny-phase81-php-router.php`
- `backend/package.json`
- `docs/johnny-phase8.2-multi-source-retrieval-evidence-ranking.md`

## Release boundary

Phase 8.2 authenticated local UAT is complete. The guarded fixture used five documents and seven chunks, including a normalized duplicate, corroborating company sources, a Safety Knowledge manual, a company emergency plan and two conflicting notification deadlines. Node and PHP returned matching routing/ranking outcomes and removed all disposable data.

Browser evidence is under `backups/local/johnny-phase82-browser-20261007021350/` and includes the full workspace, desktop Side Drawer and 390 px emergency view. The result records no overflow, no failed Johnny API, denied shared contracts, 44 px mobile controls and zero remaining conversations.

The remaining pre-release quality gate is a controlled real-model run against the same bounded fixture set. Deterministic orchestration, retrieval, metadata and UI are proven; natural-language faithfulness under the configured production model has not yet been used as release evidence. No Production connection, deployment, commit or push occurred.
