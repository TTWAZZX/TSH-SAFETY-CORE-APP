# Johnny AI Phase 8.3 — Claim-level Grounding, Citation Integrity and Hallucination Guard

Date: 2026-10-07

Scope: Local implementation, deterministic evaluation, authenticated Node/PHP lifecycle and Browser UAT

Decision: `AUTHENTICATED_ANSWER_VERIFICATION_UAT_PASS`

## Outcome

Phase 8.3 adds a versioned post-generation verification contract shared by Node and PHP. Before a grounded answer is persisted or returned, Johnny checks critical measurements, durations, percentages and supported English safety/approval roles against the exact Knowledge Base or System Data context selected for that answer. Citation identifiers must also be present, typed, unique and structurally valid.

If a critical fact or citation contract cannot be verified, the generated text is withheld and replaced with a deterministic fail-closed message. The verified citations remain available so the user can inspect the source. General AI and deterministic System Usage answers are marked `not_applicable` rather than being presented as evidence-verified.

Contract: `2026-10-07-phase8.3-r1`

## Privacy and observability

The persisted `answerVerification` snapshot contains only:

- contract version and verification status;
- checked/fail-closed flags;
- material, supported and unsupported claim counts;
- bounded unsupported claim types;
- citation count, invalid count and duplicate-reference count.

It does not persist extracted claim text or duplicate document content. A fail-closed operational log records only the contract version and bounded claim types, not the prompt, answer or source text.

## Verification

Deterministic evaluation covers:

1. Supported emergency duration and Safety Officer role.
2. Unsupported `30 minutes` when evidence states `15 minutes`.
3. Unsupported General Manager approval when evidence states Plant Manager.
4. Supported Thai duration (`15 นาที`).
5. Duplicate citation identifiers.
6. General AI answer outside the grounded-verification scope.

Authenticated UAT adds an end-to-end deliberately incorrect generation. Both Node and PHP prevented `30 minutes` from reaching the user, retained the Safety Knowledge source/citations and persisted `status=fail_closed` with the Phase 8.3 contract.

Commands:

```text
cd backend
npm run eval:johnny-phase83-answer-verification
npm run uat:johnny-phase83-authenticated-answer-verification
```

Results:

- Focused verification cases: `6/6`
- Node/PHP field parity: pass
- Authenticated Node/PHP matrix: pass (`7` answer paths)
- Unsupported critical fact fail-closed: pass
- Phase 8.2 multi-source/ranking regression: pass
- Full workspace and Side Drawer Browser UAT: pass at desktop and 390 px
- Browser/API failures and web-tool requests: zero
- Conversation/message/feedback residue: `0/0/0`
- Disposable database residue: zero
- Production touched: false

Browser evidence: `backups/local/johnny-phase83-browser-20261007023738/`.

## Files

- `backend/lib/johnny-answer-verification.js`
- `api/lib/johnny_answer_verification.php`
- `backend/routes/johnny-ai.js`
- `api/handlers/johnny_ai.php`
- `backend/scripts/johnny-phase83-answer-verification-eval.js`
- `backend/scripts/johnny-phase83-answer-verification-php-eval.php`
- `backend/scripts/johnny-phase83-authenticated-answer-verification-uat.js`
- Phase 8.1/8.2 isolated lifecycle harnesses extended with guarded Phase 8.3 mode
- `backend/package.json`

## Boundary and next gate

This first Phase 8.3 contract deliberately verifies high-impact deterministic facts; it is not a general semantic theorem prover. Thai job-role extraction, paraphrased obligations without measurable facts and subtle contradictions still depend on retrieval/synthesis instructions and should be expanded through evaluated patterns rather than assumed verified.

The remaining pre-release quality gate is a controlled real-model evaluation using synthetic evidence. It should measure supported-fact retention, unsupported-fact rejection, conflict disclosure and useful-answer rate without connecting to Production. No external network call, real Gemini request, Production connection, deployment, commit or push occurred in this phase.
