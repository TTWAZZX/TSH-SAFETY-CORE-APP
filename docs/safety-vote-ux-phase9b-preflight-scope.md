# Safety Vote UX/UI Phase 9B — Read-only Preflight and Allowed Scope

วันที่: 2026-10-10 (Asia/Bangkok)

Baseline: `main` at `728cecf8ae63a58a2868e679ef156ed75c9c8f7d` plus the complete uncommitted Phase 9A working-tree diff recorded in `docs/safety-vote-ux-phase9a-engagement-promotion-admin-productivity.md`.

## Read-only findings

- Phase 9A is present and internally consistent: `safetyVoteEngagementV1=false`, `engagement_enabled=0`, `module_enabled` remains the earlier independent fail-closed gate, and the data-preserving rollback changes only `engagement_enabled` to `0`.
- Node and PHP expose matching Phase 9A promotion/action-center/notification-read routes. Both reuse `SAFETY_VOTE_MANAGE` and `SAFETY_VOTE_VIEW`; no new privilege key is required.
- Campaign lifecycle and immutable business ownership remain in the Phase 1–10.4 routes. Phase 9B must not reproduce or bypass lifecycle, ballot, eligibility freeze, jury, certification or result mutations.
- The existing Phase 5 API already owns notification audience preview and duplicate-safe queue creation. Dispatch is independently fail-closed unless `SAFETY_VOTE_NOTIFICATION_TRANSPORT=fixture`; Phase 9B will compose and confirm against those APIs and will not add an external dispatcher.
- Private media ownership remains `SafetyVote_Files` → Campaign/CurrentVersion with authenticated `/files/:id` delivery. The Phase 9B asset library may list/upload/reuse only image files belonging to the same campaign and current version.
- The existing campaign wizard already owns real User/Juror preview components. Phase 9B preview will reuse that presentation and server campaign/builder reads without impersonating another account.
- QR generation is already available through the locally loaded `qrcode-generator`; no external QR service or tracking URL is needed.

## Allowed Runtime scope

- Additive Phase 9B engagement migration and data-preserving disable rollback for Admin saved views and reusable configuration templates only.
- Extend the Phase 9A Node/PHP engagement service/handler with planning reads, saved views, sanitized templates/config-copy and same-campaign private asset-library operations.
- Extend the feature-flagged Admin presentation with calendar, saved views, templates/config-only duplication, asset library, User/Juror preview, share/QR and notification composer.
- CSS/cache-key changes required by the feature-flagged presentation.
- Guarded Node/PHP/static/migration/browser tests, fixture-host wiring, package scripts, evidence and documentation.

## Explicitly excluded

- Any change to ballot/answer/participation immutability, privacy modes, eligibility calculation/freeze, jury assignment/scoring, result calculation, recount, certification, publication or campaign lifecycle transitions.
- Copying frozen snapshots, eligible voters, campaign-role assignments, submissions, nominations, ballots, answers, jury scores, results, certifications, audit evidence or notification history.
- Cross-campaign private-file attachment, external QR generation, Production connection, real external notification dispatch, deploy, commit or push.

Decision: `PREFLIGHT_PASS_ALLOWED_SCOPE_RECORDED`.
