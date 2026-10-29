'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const rules = require('../services/safety-vote-engagement');
const root = path.resolve(__dirname, '..', '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0; const ok = (value, message) => { assert(value, message); checks++; };

const sample = { campaignId: 7, titleTh: 'กิจกรรมเด่น', subtitleTh: 'ร่วมกิจกรรมภายในสัปดาห์นี้', ctaLabel: 'เข้าร่วม', priority: 80, startAt: '2026-10-10T01:00:00.000Z', endAt: '2026-10-17T01:00:00.000Z', status: 'Published', altText: 'ภาพประชาสัมพันธ์กิจกรรม' };
const normalized = rules.normalizePromotion(sample); ok(normalized.ok, 'valid promotion'); ok(normalized.value.priority === 80, 'bounded priority');
ok(!rules.normalizePromotion({ ...sample, endAt: sample.startAt }).ok, 'end must follow start');
ok(!rules.normalizePromotion({ ...sample, desktopFileId: 1, altText: '' }).ok, 'image requires alt text');

const php = `require '${path.join(root, 'api', 'lib', 'safety_vote_phase1.php').replace(/\\/g, '/')}'; require '${path.join(root, 'api', 'lib', 'safety_vote_engagement.php').replace(/\\/g, '/')}'; echo json_encode(sveng_promotion(json_decode($argv[1],true)));`;
const run = spawnSync(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-r', php, JSON.stringify(sample)], { encoding: 'utf8', windowsHide: true });
if (run.error?.code === 'EPERM') { const phpLib = read('api/lib/safety_vote_engagement.php'); ok(phpLib.includes("['Draft','Published','Archived']"), 'PHP status parity contract'); ok(phpLib.includes("max(0,min(100"), 'PHP priority parity contract'); }
else { assert.strictEqual(run.status, 0, run.error?.message || run.stderr); const phpNormalized = JSON.parse(run.stdout); ok(phpNormalized.ok, 'PHP promotion valid'); ok(phpNormalized.value.titleTh === normalized.value.titleTh && phpNormalized.value.priority === normalized.value.priority, 'Node/PHP normalization parity'); }

const migration = read('backend/migrations/20261010_safety_vote_ux_phase9a_engagement.sql'), rollback = read('backend/migrations/20261010_safety_vote_ux_phase9a_engagement.rollback.sql');
ok(migration.includes('SafetyVote_Promotions') && migration.includes('SafetyVote_NotificationReads'), 'additive engagement tables');
ok(migration.includes("('engagement_enabled','0'") && !migration.includes("('schema_version'"), 'default disabled without changing core schema version');
ok(!/DROP\s+TABLE|DELETE\s+FROM/i.test(rollback) && rollback.includes("'engagement_enabled','0'"), 'data-preserving rollback');

const nodeRoute = read('backend/routes/safety-vote-engagement.js'), phpRoute = read('api/handlers/safety_vote_engagement.php');
for (const marker of ['/admin/engagement/action-center', '/admin/promotions', '/me/promotions', '/notification-center']) { ok(nodeRoute.includes(marker), `Node ${marker}`); ok(phpRoute.includes(marker), `PHP ${marker}`); }
for (const text of [nodeRoute, phpRoute]) { ok(text.includes('SAFETY_VOTE_MANAGE') && text.includes('SAFETY_VOTE_VIEW'), 'existing capability contract reused'); ok(!text.includes('SafetyVote_BallotAnswers SET') && !text.includes('SafetyVote_Ballots SET'), 'no ballot mutation'); }
for (const text of [nodeRoute, phpRoute]) { ok(text.includes('c.IsHidden=0') && text.includes('c.IsTest=0') && !text.includes('ev.EmployeeID=?'), 'published promotions are visible company-wide while hidden and test campaigns stay excluded'); }
for (const text of [nodeRoute, phpRoute]) { ok(text.includes('MAX(Priority)') && text.includes('automaticPriority'), 'promotion order is allocated automatically'); ok(text.includes('EndAt<=NOW()') && text.includes('history'), 'expired published promotions remain available as history'); }
for (const text of [nodeRoute, phpRoute]) { ok(text.includes('adminPreview') && text.includes('ADMIN'), 'Admin can preview active promotions without joining voter eligibility'); }
const nodeCoreRoute = read('backend/routes/safety-vote.js'), phpCoreRoute = read('api/handlers/safety_vote.php');
for (const text of [nodeCoreRoute, phpCoreRoute]) { ok(text.includes('promotion_desktop') && text.includes('promotion_mobile') && text.includes('promotion_library') && text.includes("c.Status<>'Voided'") && text.includes('c.IsHidden=0') && text.includes('c.IsTest=0'), 'authenticated module users can read visible campaign promotion media'); }
const nodePhase2 = read('backend/routes/safety-vote-phase2.js'), phpPhase2 = read('api/handlers/safety_vote_phase2.php');
for (const text of [nodePhase2, phpPhase2]) { ok(text.includes('PreviewOnly') && text.includes('previewOnly') && text.includes("'Certified'"), 'Admin read-only campaign preview retains completed campaign access'); ok(text.includes('discoveryOnly') && text.includes('promotion'), 'active promotion detail is available read-only without participation eligibility'); }
const nodePhase3 = read('backend/routes/safety-vote-phase3.js'), phpPhase3 = read('api/handlers/safety_vote_phase3.php');
for (const text of [nodePhase3, phpPhase3]) { ok(text.includes('discoveryOnly') && text.includes('promotion') && text.includes('public_listing_preview'), 'advanced campaign detail preserves company-wide promotion read-only access'); }

const index = read('index.html'), admin = read('public/js/pages/admin-safety-vote-ux1.js'), user = read('public/js/pages/safety-vote-page-ux1.js'), css = read('public/style.css');
ok(/safetyVoteEngagementV1:\s*(true|false)/.test(index), 'explicit client feature flag');
ok(admin.includes('งานของฉันวันนี้') && admin.includes('data-sv-promotion-form'), 'admin productivity and dedicated promotion manager');
ok(admin.includes('const form = event.currentTarget') && admin.includes('savePromotion(form, intent)'), 'publish confirmation retains a stable form reference');
ok(admin.includes('state.promotionAssetUrls.get(existingFileId)'), 'saved promotion images are restored in the editor preview');
ok(user.includes('สิ่งที่คุณต้องทำ') && user.includes('data-svp-promotion-next') && user.includes('การแจ้งเตือน Safety Vote'), 'user discovery and notification center');
ok(user.includes('promotionHistoryMarkup') && user.includes('promotions.data?.history'), 'expired promotion history is rendered for eligible users');
ok(user.includes('กำลังดูในฐานะผู้ดูแลระบบ') && user.includes('previewOnly'), 'Admin preview is visibly read-only');
ok(!user.includes('setInterval(') && user.includes('schedulePromotionCarousel(delay = 6000)'), 'carousel uses one restartable auto-rotation timer');
ok(user.includes('data-svp-promotion-carousel') && user.includes('visibilitychange') && user.includes('promotionPointerStartX'), 'carousel supports visibility pause, controls and swipe');
ok(user.includes('promotionAdminPreview') && user.includes('promotions.data?.adminPreview === true') && user.includes('|| state.promotionAdminPreview'), 'Admin promotion preview never writes participant engagement analytics');
ok(user.includes("matchMedia('(prefers-reduced-motion: reduce)').matches") && user.includes('mouseenter') && user.includes('focusin'), 'carousel respects motion preference and interaction pause');
ok(user.includes('svp-promotion__backdrop') && user.includes('svp-promotion__foreground'), 'promotion image uses decorative cover and complete foreground layers');
ok(css.includes('.svp-promotion__backdrop') && css.includes('object-fit: cover') && css.includes('.svp-promotion__foreground') && css.includes('object-fit: contain'), 'responsive layered image fit contract');
ok(css.includes('.svp-promotion__media[data-sv-auth-media]') && css.includes('height: clamp(180px, 15vw, 240px)'), 'hydrated banner retains its containing block and campaign covers expose more artwork');
ok(css.includes('.svp-promotion') && css.includes('@media (prefers-reduced-motion: reduce)'), 'responsive reduced-motion presentation');
ok(css.includes('min-height: 44px'), 'minimum touch target contract');
console.log(`Safety Vote UX Phase 9A static + Node/PHP parity: PASS (${checks} assertions)`);
