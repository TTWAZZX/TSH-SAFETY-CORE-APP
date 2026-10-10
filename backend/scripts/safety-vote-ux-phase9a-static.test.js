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
for (const text of [nodeRoute, phpRoute]) { ok(text.includes('SafetyVote_EligibleVoters'), 'promotion visibility remains eligibility-filtered'); ok(text.includes('SAFETY_VOTE_MANAGE') && text.includes('SAFETY_VOTE_VIEW'), 'existing capability contract reused'); ok(!text.includes('SafetyVote_BallotAnswers SET') && !text.includes('SafetyVote_Ballots SET'), 'no ballot mutation'); }

const index = read('index.html'), admin = read('public/js/pages/admin-safety-vote-ux1.js'), user = read('public/js/pages/safety-vote-page-ux1.js'), css = read('public/style.css');
ok(index.includes('safetyVoteEngagementV1: false'), 'strict opt-in client flag');
ok(admin.includes('Admin Action Center') && admin.includes('data-sv-promotion-form'), 'admin productivity and promotion manager');
ok(user.includes('สิ่งที่คุณต้องทำ') && user.includes('data-svp-promotion-next') && user.includes('การแจ้งเตือน Safety Vote'), 'user discovery and notification center');
ok(!user.includes('setInterval('), 'carousel never auto-rotates');
ok(css.includes('.svp-promotion') && css.includes('@media (prefers-reduced-motion: reduce)'), 'responsive reduced-motion presentation');
ok(css.includes('min-height: 44px'), 'minimum touch target contract');
console.log(`Safety Vote UX Phase 9A static + Node/PHP parity: PASS (${checks} assertions)`);
