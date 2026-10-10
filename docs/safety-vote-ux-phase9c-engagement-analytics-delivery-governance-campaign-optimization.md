# Safety Vote UX/UI Phase 9C — Engagement Analytics, Delivery Governance and Campaign Optimization

Date: 2026-10-10 (Asia/Bangkok)
Decision: `PASS_LOCAL_UAT_READY_FOR_UX_PHASE9D`
Scope: Local only — no Production connection, deployment, commit or push

## Outcome

Phase 9C adds an independently gated Admin engagement dashboard to the Phase 9B planning workspace. It compares campaigns using privacy-thresholded reach, participation and conversion; reports anonymous promotion/CTA performance; groups notification queue outcomes without recipient details; detects campaign/channel schedule conflicts; produces deterministic optimization recommendations; and exports only authorized aggregate CSV.

The User promotion surface records only daily aggregate `impression` and `cta_click` counters after existing authentication, published-promotion and frozen-eligibility checks. The counter schema contains no Employee ID, recipient, ballot, answer, candidate or voter field.

`safetyVoteEngagementV1=false` and `engagement_enabled=0` remain the source and migration defaults. `module_enabled` remains independently fail-closed. For review convenience, the existing loopback Local database was migrated and its `engagement_enabled` setting was explicitly set to `1`; no Production host was contacted.

## Delivered workspace

- All-campaign or single-campaign date-range comparison.
- Privacy-safe eligible, started, submitted, conversion, notification reach/read, promotion impression and CTA metrics.
- Strict suppression for every count below each campaign privacy threshold, including identified campaigns.
- Content and CTA performance without person-level attribution.
- Queue/delivery grouping by campaign, channel, state and bounded error code.
- Failed and suppressed delivery summaries without notification IDs or recipients.
- Schedule-conflict warnings scoped by campaign and channel within 30 minutes.
- Thai actionable recommendations for conversion, CTA, delivery and scheduling conditions.
- Authorized aggregate CSV using `SUPPRESSED` placeholders for hidden values.
- Responsive Admin workspace plus User-side aggregate promotion event capture.
- Loading, retry, empty, denied, module-disabled and engagement-disabled behavior.

## Security and invariants

- Dashboard permission: existing `SAFETY_VOTE_RESULT_VIEW`.
- Export permission: existing `SAFETY_VOTE_EXPORT`.
- Promotion event permission: existing `SAFETY_VOTE_VIEW` plus frozen eligibility.
- No new permission, ballot, privacy, eligibility-freeze, jury, certification or result-calculation contract.
- No notification dispatch/retry endpoint is called by Phase 9C.
- Node and PHP expose the same three routes and response shape.
- The Phase 9C gate is route-scoped and does not intercept legacy read-only release preflight.
- Rollback disables `engagement_enabled` while preserving aggregate rows.

## Files added

- `backend/services/safety-vote-analytics.js`
- `backend/routes/safety-vote-analytics.js`
- `api/lib/safety_vote_analytics.php`
- `api/handlers/safety_vote_analytics.php`
- `api/tests/safety_vote_analytics_contract_test.php`
- `backend/migrations/20261010_safety_vote_ux_phase9c_engagement_analytics.sql`
- `backend/migrations/20261010_safety_vote_ux_phase9c_engagement_analytics.rollback.sql`
- `backend/scripts/safety-vote-ux-phase9c-static.test.js`
- `backend/scripts/safety-vote-ux-phase9c-migration.test.js`
- `backend/scripts/safety-vote-ux-phase9c-api-uat.js`
- `backend/scripts/safety-vote-ux-phase9c-browser-uat.js`
- `backend/scripts/safety-vote-ux-phase9c-migrate-local.js`
- `backend/scripts/safety-vote-ux-phase9c-residue-audit.js`
- `docs/safety-vote-ux-phase9c-preflight-scope.md`
- `docs/safety-vote-ux-phase9c-engagement-analytics-delivery-governance-campaign-optimization.md`

## Files updated for integration

- `backend/server.js`
- `backend/scripts/safety-vote-phase1-node-fixture-host.js`
- `backend/scripts/safety-vote-phase1-php-router.php`
- `api/index.php`
- `public/js/pages/admin-safety-vote-planning.js`
- `public/js/pages/admin-safety-vote-ux1.js`
- `public/js/pages/admin.js`
- `public/js/pages/safety-vote-page-ux1.js`
- `public/js/main.js`
- `public/style.css`
- `index.html`
- `backend/package.json`
- `package.json`
- `AGENTS.md`

The worktree also contains the prior uncommitted Phase 9A/9B files; they were preserved and remain part of the local baseline.

## Verification

- Phase 9C static and Node/PHP contract: PASS, 43 assertions.
- PHP analytics contract: PASS, 9 assertions.
- Additive/idempotent migration: PASS, 45 Safety Vote tables; identity-free counter schema; default OFF; data-preserving rollback.
- Guarded Node/PHP API lifecycle: PASS with matching response shapes, permission denial, module/engagement fail-closed behavior, aggregate export and no protected mutation.
- Phase 9A static: PASS, 29 assertions.
- Phase 9B static: PASS, 44 assertions.
- UX Phase 8 static/accessibility: PASS, 48 assertions.
- Phase 10.4 Node/PHP static parity: PASS, 26 assertions.
- Phase 8.3.1 disabled-mode Node/PHP parity: PASS.
- `git diff --check`: PASS (line-ending notices only).
- Disposable database residue audit: PASS, zero databases.
- External notification delivery: zero.

## Authenticated Browser UAT

Admin analytics and User promotion surfaces passed at:

- 390×844
- 430×932
- 768×1024
- 1366×768
- 1920×1080

Ten viewport/role combinations plus permission denied, engagement disabled and module disabled states passed with zero document horizontal overflow, zero visible interactive targets below 44×44 px, zero console/page errors, keyboard focus present and semantic headings/tables/labels. Protected ballot, answer, jury-score and certification rows stayed zero in the disposable fixtures.

Evidence:

- `backups/local/safety-vote-ux-phase9c-api-1791622224578/` — result SHA-256 `445d215d7f21dece58cf04b19496abd113da43afaa328c4cb412ce53e78577f8`
- `backups/local/safety-vote-ux-phase9c-1791622241462/` — result SHA-256 `54e78a9e52853f477aa1010f75f9972758b15a2114e5eb25aca701f9e8146250`

## Limitations

- Promotion impressions and CTA clicks are aggregate interaction counts, not unique-person analytics; this avoids identity storage but means repeated sessions may increase counts.
- Historical promotion interaction metrics begin only after the Phase 9C counter table exists. No backfill is inferred.
- Recommendations are deterministic rules, not automated campaign changes, A/B testing or personal profiling.
- Delivery governance reads existing queue/audit state and does not perform dispatch, retry or provider calls.
- No Production rollout or migration was evaluated in this phase.

## Local review

The Local frontend is available at `http://127.0.0.1:5510/index.html#safety-vote` and the Local backend is listening on port `5000`. Sign in as usual, open Admin **จัดการ Safety Vote**, choose **เปิดพื้นที่วางแผน**, then open the **Analytics และธรรมาภิบาล** tab.

## Command for the next phase

```text
เริ่ม Safety Vote UX/UI Phase 9D — Engagement Release Hardening and Controlled Rollout Readiness ต่อจาก docs/safety-vote-ux-phase9c-engagement-analytics-delivery-governance-campaign-optimization.md โดยคง safetyVoteEngagementV1 และ engagement_enabled default OFF รวมทั้ง module_enabled fail-closed ก่อนแก้ Runtime ให้ตรวจ Phase 9C diff, privacy-threshold behavior, aggregate counter growth/retention, export authorization, notification adapter isolation, Node/PHP parity และ rollback แบบ read-only แล้วทำเฉพาะ feature-flagged Admin release-readiness workspace, data-quality/coverage diagnostics, bounded retention and maintenance dry-run, accessibility/performance budget, audit-ready evidence manifest และ controlled-pilot checklist โดยใช้ API/capability/schema เดิมหรือ additive engagement schema เท่านั้น ห้ามเปิดเผยหรือสร้าง voter-to-choice, response identity, blind identity หรือข้อมูลต่ำกว่า privacy threshold ห้ามเปลี่ยน ballot immutability, privacy, eligibility freeze, jury scoring, certification หรือ result calculation และห้ามส่ง notification ภายนอกระหว่าง fixture UAT ให้ทดสอบ static/unit/regression, Node/PHP parity และ authenticated Browser UAT ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 ตรวจ no horizontal overflow, 44px touch targets, keyboard/focus/screen-reader semantics, permission denial, module/engagement disabled และ zero disposable residue ห้ามเชื่อม Production ห้าม deploy ห้าม commit และห้าม push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผลทดสอบ หลักฐาน ข้อจำกัด และคำสั่ง Phase ถัดไป
```
