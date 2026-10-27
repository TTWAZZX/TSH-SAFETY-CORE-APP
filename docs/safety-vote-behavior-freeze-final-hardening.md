# Safety Vote Behavior-Freeze Final Hardening

Date: 2026-10-27 (Asia/Bangkok)

Decision: `PASS_LOCAL_SAFETY_VOTE_BEHAVIOR_FREEZE_FINAL_HARDENING`

## Objective

Preserve the accepted Safety Vote behavior while making the final acceptance suite repeatable and complete across the current six workflow profiles. This hardening changes test infrastructure and contracts only; it does not change runtime UI, workflow rules, permissions, schema or business data.

## Frozen behavior

- Survey, Popular Vote, Secret Election, Submission Challenge, Nomination and Jury Scoring retain their existing content, action, participant, eligibility and public-gallery contracts.
- The Admin Wizard retains its governed nine-step sequence.
- Company-wide visibility never grants participation.
- Jury `admin_curated` and `imported` sources do not require participant enrollment; `employee_submission` does.
- Jury assignment add/revoke remains available only in Draft, Scheduled and Open.
- Submitted Jury assignments remain immutable and require Reopen; revoked Draft assignments retain Draft score evidence and restore it when reassigned.
- Jury scoring retains slider, direct numeric input, minus/plus controls, quick scores, progress, autosave, review and immutable submit.
- Preview controls remain non-mutating.

## Acceptance improvements

- The central Final Acceptance cache contract accepts the current `20261027-safety-vote-jury-score-ux-r1` release chain.
- A Behavior Freeze matrix now guards all six workflow profiles, three Jury work sources, nine Wizard steps, Jury lifecycle rules and score-control markers.
- All-workflow preview parity and Browser UAT are first-class Final Acceptance gates.
- Preview Browser UAT now covers 390, 430, 768, 1366 and 1920 px and verifies that Jury score/submit controls remain disabled while image viewing remains available.
- Local company-visibility API UAT starts and owns a loopback API only when no existing Local API is available.
- Completed-catalogue Browser UAT starts and owns loopback API/static servers only when the expected Local services are unavailable.
- The accepted Juror five-viewport Browser UAT is now part of the central Browser gate.

## Verification

- Static/parity acceptance: PASS, including Node/PHP parity and PHP 7.4 compatibility across 158 PHP files.
- Additive/idempotent migration and data-preserving rollback suite: PASS.
- Local runtime, company visibility, Survey, Submission, Nomination, Jury, Gallery, Popular Vote and Secret Election Node/PHP API UAT: PASS.
- Concurrent Secret Election load: PASS for 20 voters with recount, dual certification, report and revocation.
- Browser acceptance: PASS for six workflow previews, five Admin Wizard viewports, three Public Work Gallery viewports, three completed-result viewports, five Juror score-sheet viewports and six Eligibility viewports.
- Juror mutation ledger: five submitted assignments, one recusal, twenty submitted score rows and zero forbidden rows.
- Disposable database residue: zero.

## Preserved boundaries

- External delivery remains disabled and queue-only. No email/provider adapter was enabled.
- Completed campaigns now require the governed non-destructive next-cycle action; see `docs/safety-vote-non-destructive-next-cycle-guard.md`.
- No Production connection, deployment, schema mutation, business-row mutation, commit or push occurred in this hardening pass.
