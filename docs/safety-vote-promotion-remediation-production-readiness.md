# Safety Vote Promotion Remediation — Production Readiness

Status: `PASS_LOCAL_PROMOTION_REMEDIATION_PRODUCTION_CANDIDATE_READY`  
Date: 2026-10-15  
Scope: Local implementation and UAT; no application deploy, Production schema change, commit or push

## Corrected behavior

- Publish now retains the submit form before the confirmation callback, so clicking **เผยแพร่** performs the save instead of silently stopping after confirmation.
- Draft and edit screens resolve existing private Desktop/Mobile file IDs to authenticated blob URLs, so saved images remain visible after reopening.
- Promotion order is server-assigned. Node and PHP serialize creation on the engagement setting row and allocate `MAX(Priority)+1`; updates preserve the current priority and ignore client attempts to change it.
- Promotion visibility now follows the promotion's own Published status and StartAt/EndAt window; it is no longer coupled to the campaign voting window. Eligible users see an active banner immediately, including while the linked Open campaign is still before its voting start time.
- Published campaigns remain visible to eligible users before voting opens. Campaign detail is read-only until `OpenAt`; both UI and Node/PHP submission endpoints reject early voting. Admin can preview the same banner/detail even when not included in the frozen eligibility snapshot, but cannot submit on a user's behalf.
- Published promotions whose end time has passed move from the active banner area to **ป้ายกิจกรรมที่ผ่านมา**. Eligibility remains frozen-snapshot scoped and the campaign detail remains available for Scheduled, Open, Closed, Certified and Published campaigns.
- Campaign history remains governed by the existing campaign status tabs; expiration does not delete a campaign, promotion, private-file metadata or audit evidence.

## Verification

- Static/security and Node/PHP parity: PASS, 41 assertions.
- Guarded Node/PHP API lifecycle: PASS for automatic order, order preservation, saved asset persistence and expired history, with zero protected business mutation and zero fixture residue.
- Dedicated Chromium workflow: PASS at Admin 1366×768 and User 390×844/1366×768. It uploaded an image, saved Draft, reopened the saved preview, published through confirmation, showed an active banner independently of a future voting start, blocked early submission at UI/API, verified safe Admin preview, expired the banner and opened the linked campaign from history.
- Live Results/regression suite: PASS for Phase 10.4, UX Phase 8, Phase 9A/9B/9C and Phase 8.3.1 disabled mode.
- Cache keys were advanced through `index.html`, `main.js`, `admin.js` and the Safety Vote child imports so Production browsers do not retain the pre-fix modules or stylesheet.

## Release boundary

The promotion change is schema-neutral. It ships with the combined checksum manifest in `docs/safety-vote-live-results-promotion-production-candidate-manifest.json` (SHA-256 `5cc5a9bbcfdad5a0a174f400b93f5fac301a5e37c69d3e340087a7cf7c4e7e65`). Deployment is explicitly authorized and must use the immutable pushed commit, verify Production drift, build byte-exact runtime rollback files, and run authenticated Admin/User smoke after upload.

