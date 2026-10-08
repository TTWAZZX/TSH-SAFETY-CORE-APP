# Safety Vote Phase 8.1 — SHE Internal Governance Amendment

Date: 2026-10-08
Base contract: `2026-10-08-safety-vote-phase0-r1`
Amendment: `2026-10-08-safety-vote-phase8.1-she-governance-r1`

## Decision

Safety Vote is an internal SHE-owned platform. SHE controls campaign design, eligibility, operation, publication and incident handling. The former fixed six-area acceptance list is superseded by one explicit `she_owner` acceptance per campaign.

This is an organizational governance simplification, not a reduction of technical privacy or integrity controls.

## Runtime rules

- Every campaign requires authenticated SHE Admin acceptance using `I ACCEPT SHE_OWNER <CAMPAIGN_CODE>`.
- The server derives and stores evidence SHA-256 when the internal UI is used; an externally supplied valid SHA-256 remains supported.
- Standard Activity Vote, Survey, Feedback, Nomination, Submission and Jury campaigns do not require cross-department acceptance or two result certifiers.
- `secret_election` or `secret_ballot` campaigns still require two distinct active certifiers for the immutable result hash.
- Secret participation/ballot separation, no-result-before-close, deterministic reconciliation, receipt unlinkability, private files and privacy-safe audit remain unchanged.
- Certified-result handoff still requires dual certification, a verified report hash and explicit confirmation.

## UX

The Admin governance panel identifies SHE as owner and provides an `Approve by SHE` action. It shows missing `she_owner` evidence and continues to show technical preflight blocks independently.

## Release boundary

The former six-party acceptance blocker is removed. Remaining Production blockers are technical: dirty/non-immutable source, fresh protected Production PHP/config/schema/privilege/clock/provider checks, privacy-safe database backup/restore evidence and authenticated non-mutating smoke.
