# Safety Vote Live Results / Live Leaderboard

Status: `PASS_LOCAL_LIVE_RESULTS_PRODUCTION_CANDIDATE_READY`  
Date: 2026-10-15  
Scope: Runtime/schema changes remain Local only; a separately authorized read-only full Production database snapshot was restored to Local. No application deploy, Production schema mutation, commit or push.

## Delivered contract

- Version-scoped configuration on `SafetyVote_CampaignVersions`, default OFF.
- Supported scope: `popular_vote` and active single-choice questions only.
- Top 5 or Top 10 summary, with competition ranking and ties retained across the Top N boundary.
- Count, percentage or combined display; percentages use each question's valid option answers as the denominator.
- User visibility: after submit, always or Admin only. Permissions and frozen eligibility remain mandatory.
- Server privacy threshold: `max(5, campaign threshold, live threshold)`. Below it, exact Accepted totals and all option results are withheld.
- Current-version Accepted ballots only. Rejected/superseded/non-current data is not counted.
- Live results are provisional and independent from snapshot, certification and official publishing workflows.

## Runtime and UX

Node and PHP expose matching User/Admin read endpoints. User receives Top N aggregate rows; Admin receives all options. Responses contain no Employee ID, voter identity, ballot identity, receipt hash or per-person answer data.

The Admin operations workspace and User participation page render responsive boards with tie labels, progress bars, private option images, refresh countdown, manual refresh and pause/resume. Polling has a single-flight guard, visibility pause, AbortController cleanup and bounded exponential backoff up to 60 seconds.

## Database

Migration: `backend/migrations/20261015_safety_vote_live_results.sql`  
Rollback: `backend/migrations/20261015_safety_vote_live_results.rollback.sql`

The migration is additive and idempotent. Rollback disables the feature while preserving versioned configuration and business records. After the full Production snapshot was restored and verified on a disposable database, the guarded Local migration verified six columns, default OFF and unchanged campaign/version/ballot/answer counts.

## Verification

- Static/security plus Node/PHP parity: PASS, 26 assertions.
- Disposable migration: PASS, applied twice; disabled default and data-preserving rollback verified.
- Guarded Node/PHP API UAT: PASS for create persistence, permissions, eligibility, after-submit, Admin-only, disabled/non-Open states, threshold suppression, Accepted-only counting, ranking and response parity.
- Chromium UAT: PASS for User/Admin at 390×844, 430×932 and 1366×768, including refresh/pause, no overflow and no console errors.
- Regressions: Phase 10.4, UX Phase 8, UX Phase 9A/9B/9C and Phase 8.3.1 disabled mode PASS.
- Repository-wide `npm --prefix backend test`: stopped at the existing permission audit because ten unrelated mutation routes are already classified `UNREVIEWED`; all preceding onboarding/profile/data-quality/email checks passed.

## Release boundary

Production runtime and schema remain unchanged. A checksum-locked working-tree candidate manifest is available at `docs/safety-vote-live-results-promotion-production-candidate-manifest.json`; it is not immutable until committed. Deployment still requires a fresh Production drift check, private rollback artifacts, authenticated read-only smoke and explicit deployment authorization. Live Results must remain OFF unless the campaign has passed business and privacy review.
