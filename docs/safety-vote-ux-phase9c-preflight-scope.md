# Safety Vote UX/UI Phase 9C — Read-only Preflight and Allowed Scope

วันที่: 2026-10-10 (Asia/Bangkok)

Baseline: `main` at `728cecf8ae63a58a2868e679ef156ed75c9c8f7d` plus the complete uncommitted Phase 9A/9B working-tree diff recorded in the accepted Phase 9A and Phase 9B reports.

## Read-only findings

- Phase 9B is present as an uncommitted local diff. Its Node/PHP planning routes, two additive tables, private-asset ownership checks and data-preserving rollback remain internally consistent.
- `module_enabled` is still the authoritative fail-closed gate. Engagement endpoints additionally require the additive schema and `engagement_enabled=1`; the migration default remains `0`.
- Phase 5 owns privacy-safe turnout, organization suppression, aggregate reports/exports, notification queue creation, fixture-only dispatch and per-notification retry. Phase 9C must consume these contracts and must not create another dispatcher.
- `SafetyVote_Notifications` owns recipient-level queue rows. Phase 9C may read only grouped counts and bounded error codes; it must never return recipient IDs or notification IDs in analytics responses.
- Duplicate queue suppression is already represented by the unique suppression key and bounded `SAFETY_VOTE_NOTIFICATION_QUEUE` audit detail. Phase 9C may aggregate those audit counts without exposing the underlying recipient.
- Campaign lifecycle, frozen eligibility, participation, ballots, answers, jury scores, results and certification remain owned by Phase 1–7/10.4 and are outside this phase.
- Existing `SAFETY_VOTE_MANAGE`, `SAFETY_VOTE_RESULT_VIEW` and `SAFETY_VOTE_EXPORT` capabilities are sufficient. No permission or role schema change is required.

## Allowed runtime scope

- One additive, idempotent engagement-counter table containing campaign/promotion/day/metric/count only, with no employee, voter, response, ballot, jury or identity column.
- A data-preserving rollback that sets `engagement_enabled=0` and never drops or deletes engagement data.
- Feature-gated Node/PHP parity routes for anonymous aggregate promotion-event increments, privacy-thresholded analytics, grouped delivery governance and authorized aggregate CSV export.
- A feature-gated Admin analytics/governance tab integrated into the Phase 9B workspace, including comparison, delivery/suppression review, schedule warnings and deterministic recommendations.
- Local-only presentation opt-in, cache keys, fixture wiring, static/unit/migration/API/browser tests, evidence and documentation.

## Explicitly excluded

- Voter-to-choice, response identity, blind identity, recipient lists, notification IDs, ballot/answer rows or any metric below its campaign privacy threshold.
- Changes to ballot immutability, privacy modes, eligibility calculation/freeze, jury scoring, result calculation, certification, publication or lifecycle transitions.
- A new notification dispatcher, provider call, external delivery, Production connection, deployment, commit or push.

## Rollback

Rollback changes only `SafetyVote_Settings.engagement_enabled` to `0`. The additive counter table and all existing Phase 9A/9B tables/data are retained for auditability and later re-enable.
