# Safety Vote Participation Authorization Guard — Phase 3

Local acceptance date: 2026-10-25
Decision: `PASS_LOCAL_SAFETY_VOTE_PARTICIPATION_AUTHORIZATION_PHASE3`

## Outcome

Safety Vote now has one server-side participation authorization contract shared by Node and PHP. Company-wide catalogue and read-only campaign detail remain available to authenticated employees, but visibility never grants permission to vote, upload answers, create or change submissions, nominate, consent, score as a juror, recuse, or manage a submission gallery.

The contract version is `2026-10-25-safety-vote-participation-authorization-r1`.

## Governed actions

- Ballot: `ballot_submit`, including ordinary and secret-election ballots.
- Answer evidence: `answer_file_upload`.
- Submission: create, update, submit, withdraw and private file upload.
- Submission gallery: upload, metadata update and logical removal.
- Nomination: create and nominee consent.
- Jury: save scores, submit scores and recuse.

Every decision verifies the campaign exists, is not hidden/test, supports the requested action, uses the current campaign version, is Open inside its authoritative voting window and satisfies the action entitlement:

- frozen-snapshot eligibility for ballots, uploads, submissions and nominations;
- resource ownership for submission mutation;
- nominee identity for consent;
- current individual jury assignment for scoring and recusal.

Stable denial codes include `CAMPAIGN_NOT_FOUND`, `CAMPAIGN_NOT_PARTICIPATABLE`, `PARTICIPATION_ACTION_NOT_SUPPORTED`, `PARTICIPATION_VERSION_CONFLICT`, `CAMPAIGN_NOT_IN_VOTING_WINDOW`, `CAMPAIGN_NOT_ELIGIBLE`, `PARTICIPATION_OWNERSHIP_REQUIRED`, `PARTICIPATION_NOMINEE_REQUIRED` and `PARTICIPATION_ASSIGNMENT_REQUIRED`.

## Production safeguards

- Enforcement is server-side in both runtimes; the UI is not a security boundary.
- Authorization is fail-closed when the campaign, entitlement or authorization dependency cannot be resolved.
- Existing business data and schemas are unchanged by this phase.
- Read-only company catalogue behavior remains separate from mutation authorization.
- The implementation uses PHP 7.4-compatible syntax and APIs.
- Local UAT does not enable external delivery and made no Production connection, deployment, commit or push.

## Verification evidence

- Central Node/PHP decision parity: 15 governed actions and 15 positive/negative fixtures.
- Existing Phase 3, Phase 4 and Phase 6 calculation/validation parity suites pass.
- Phase 3 disposable Node/PHP API UAT passes eligibility, ownership, nomination identity and closed-window denial; responsive authenticated User/Admin Browser UAT passes desktop and 390 px. Latest evidence: `backups/local/safety-vote-phase3-browser-1792910063275/`.
- Jury disposable Node/PHP API UAT passes assignment, closed-window denial, recusal and immutable score behavior; Browser UAT passes desktop and 390 px. Latest evidence: `backups/local/safety-vote-phase4-browser-1792910103281/`.
- Candidate/Submission Gallery disposable Node/PHP API UAT passes ownership, blind access, private-file delivery, update/removal, MIME rejection and closed-window denial.
- Secret Election disposable Node/PHP API UAT passes concurrent voting, separation, recount, certification, reporting, revocation and closed-window denial.
- Company-wide catalogue static regression passes, including read-only detail and mutation denial.
- Local runtime smoke passes with `catalogAudience=company_authenticated`, `detailAudience=company_authenticated` and `participationAudience=eligible_only`.
- Changed PHP files lint clean; the project-wide PHP 7.4 compatibility contract passes across 146 PHP files.

Phase 4 official-result implementation was deliberately not started in this acceptance cycle.\n