# Safety Vote Jury Work Items Phase 5B and Atomic Media Backend Phase 6

Date: 2026-10-25
Environment: Local loopback only
Decision: `PASS_LOCAL_SAFETY_VOTE_JURY_WORK_ITEMS_PHASE5B_AND_ATOMIC_MEDIA_BACKEND_PHASE6`

## Delivered contract

Jury campaigns no longer model an entry as a question, choice or score slider. Wizard step 4 is now a governed Work Item editor and persists one of these sources:

- `admin_curated`: Admin prepares the works and their media.
- `employee_submission`: accepted employee submissions become the work source and participant eligibility remains required.
- `imported`: works retain the source campaign and source candidate lineage.

Each Work Item has a stable work code, title, description, deterministic order, active state and optional import lineage. Existing rows are deactivated rather than physically deleted so audit and result evidence remain traceable. Jury activation readiness requires at least one active Work Item in addition to the Phase 5A criteria and juror checks.

All authenticated employees can read the Work Gallery for a company-visible Jury campaign. This read-only access never grants a score sheet, Jury assignment or participant mutation. The Public Work Gallery uses authenticated private-file delivery and the shared keyboard/touch image viewer.

## Atomic media backend

The Node and PHP implementations expose the same atomic media contract for:

- Question image
- Option image
- Work cover
- Work gallery image

An upload validates campaign and target ownership, Draft editability, MIME signature, 10 MB maximum size, required alternative text and idempotency before the transaction attaches it. A successful response includes `serverConfirmed=true`. Idempotent replay returns the original mutation. A rejected or rolled-back request removes the newly written private bytes so it cannot leave an orphan file.

Replace and remove operations retain file/gallery history, write `SafetyVote_MediaMutations`, and append a campaign audit entry. Existing candidate/submission gallery operations now also append audit evidence and return server confirmation.

## Schema and rollout

Migration `20261025_safety_vote_jury_work_items_atomic_media.sql` is additive and idempotent. It adds:

- `SafetyVote_CampaignVersions.WorkSource`
- nullable legacy `SafetyVote_Candidates.OptionID`
- `SourceType`, `SourceCampaignID` and `SourceCandidateID` lineage
- immutable `SafetyVote_MediaMutations`
- independently checked `jury_work_items_contract` and `atomic_media_contract` capabilities

The rollback disables the two capability contracts without deleting work, file, mutation or audit evidence. The guarded Local migration ran twice. Protected Local counts remained 5 campaigns, 6 versions, 3 eligibility snapshots, 7,633 eligible-voter rows, 0 ballots and 201 audits.

During activation, three older SQL files containing literal escaped newline tokens were corrected so the ordered migration chain is executable and repeatable. No business row was rewritten by that repair.

## Verification

- shared Node/PHP Work Item model and route static checks
- disposable migration, second-run idempotency and data-preserving rollback
- disposable Node/PHP API UAT for Work Items, source persistence, readiness, atomic upload/replay, invalid-target cleanup, private-file access and Jury lifecycle
- responsive authenticated Public Work Gallery Browser UAT at 390x844, 768x1024 and 1366x768
- responsive Admin Adaptive Wizard Browser regression at 390, 430, 768, 1366 and 1920 px
- Local capability health and smoke checks
- changed PHP lint plus project-wide PHP lint across 158 files
- project-wide PHP 7.4 static compatibility across 158 files

Browser evidence is retained at:

- `backups/local/safety-vote-jury-work-items-1792945905248/`
- `backups/local/safety-vote-admin-guided-drafts-1792945677842/`

## Phase boundary

Phase 5B and the Phase 6 backend are complete. Work cover/gallery already use the atomic contract in the adaptive Jury editor. Phase 5C still owns the final Work x Criteria juror scoring workspace. The remaining Phase 6 frontend integration must migrate every legacy Question/Option image interaction to the same atomic endpoint and finish replace/remove UX, unsaved-change semantics and mobile viewer regression across all campaign types.

No Production connection, external delivery, deployment, commit or push was performed.
