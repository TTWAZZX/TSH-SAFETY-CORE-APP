# Safety Vote Official Excel/PDF Report

Local implementation completed on 2026-10-16. No Production deployment, commit, or push was performed.

## Report policy

- `Certified` and `Published` snapshots produce `OFFICIAL_CERTIFIED_RESULT` through the certified-report endpoint.
- `Frozen` snapshots remain exportable as `CONTROLLED_RESULT_COPY` and are explicitly marked as not certified.
- Every report is `AUTHORIZED_AGGREGATE_ONLY` and records `containsVoterIdentity=false`.
- The report is generated from an immutable result snapshot and retains the exact Result SHA-256, generated-file SHA-256, report ID, version, generator, and audit event.

## Excel workbook

- `Summary`: campaign metadata, document status, snapshot, KPI, turnout, and privacy classification.
- `Results`: ordered aggregate candidate/option result rows.
- `Verification`: quorum, tie, reconciliation, active certification count, Result SHA-256, and verification note.

## PDF report

- Formal Safety Vote header and document status.
- Campaign/snapshot metadata, aggregate KPI, governance evidence, ordered results, classification, Result SHA-256, and template version.
- Multi-page output with page numbering and UTF-16BE Thai text handling in both Node and PHP runtimes.

## Verification

- Official report static contract: 20 assertions passed.
- Campaign Result Dashboard static contract: 22 assertions passed.
- Phase 5 Node/PHP parity passed.
- Privacy/permission contract: 21 assertions passed.
- UX Phase 8 regression: 48 assertions passed.
- Guarded disposable Phase 5 Node/PHP API and desktop/390 px browser UAT passed.
- PHP syntax and `git diff --check` passed; only existing CRLF normalization warnings remain.
