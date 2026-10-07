# Johnny AI Phase 8 Immutable Candidate Closeout

Date: 2026-10-07 (Asia/Bangkok)

Scope: local remediation, full verification and scoped commit preparation

Decision: **GO FOR PRODUCTION PREFLIGHT / HOLD FOR DEPLOYMENT**

## Remediation

The Phase 8.2 evaluator no longer couples evidence-ranking persistence to the obsolete top-level `phase: 8.2` marker. It now independently requires:

- persisted `evidenceRanking` metadata in Node and PHP;
- integrated `phase: 8.3` metadata in Node and PHP; and
- persisted Phase 8.3 `answerVerification` audit metadata.

This preserves the Phase 8.2 ranking assertion while recognizing the integrated Phase 8.3 answer-verification pipeline. Runtime behavior was not weakened or changed by this remediation.

## Fresh verification

- Phase 8.1 routing: PASS, 165 cases and Node/PHP parity.
- Phase 8.2 evidence ranking: PASS, four scenarios, Node/PHP parity and all ten static integration checks.
- Phase 8.3 answer verification: PASS, six scenarios and Node/PHP parity.
- PHP 7.4.33: nine PHP files linted; value-suppressed configuration/capability fixture passed; Phase 8.1–8.3 evaluators passed using the portable PHP binary.
- Phase 1 and 2: PASS, 33/33 each.
- Phase 3: PASS, 105/105 with PHP parity.
- Golden quality and mobile compact: PASS, 9/9 and 14/14.
- Phase 4: PASS, 42/42 plus observability 7/7.
- Phase 5: PASS, 49/49 plus workflow smoke 9/9.
- Phase 6 authenticated isolated lifecycle: PASS for Node/PHP, seven tables, 21 modules and zero disposable-database residue.
- Phase 7.1 static gate: PASS, 40/40.
- Phase 8.3 authenticated isolated lifecycle and Browser UAT: PASS for pure usage, mixed policy/UI, scoped document, live data, emergency, conflicting documents and unsupported critical fact; desktop and 390 px; zero chat/message/feedback/database residue. Evidence: `backups/local/johnny-phase83-browser-20261007030948/`.
- Phase 8.4 controlled real model: PASS, safety 4/4, useful 3/4, conflict passed and adversarial unsupported duration failed closed. Evidence: `backups/local/johnny-phase84-real-model-20261007031013/result.json`.
- `git diff --check`: PASS.

The portable PHP runtime under `.tmp` and all backup evidence are excluded from the commit and Production package. No Production connection, mutation, push or deployment occurred.

## Candidate boundary

The PHP Production candidate remains exactly four runtime paths recorded with SHA-256 in `docs/johnny-phase8-candidate-manifest.json`. Node parity code, evaluators and documents belong to the source commit but not the PHP Production upload. The unrelated `backend/scripts/patrol-checkin-v2.test.js` remains outside the candidate.

## Decision boundary

Local blockers are closed, so the immutable candidate is approved to enter a separately authorized Production configuration, drift and verified-backup preflight. Deployment remains held until that preflight passes and a separate deploy instruction is given.
