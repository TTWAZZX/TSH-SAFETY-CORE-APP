'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };

const admin = read('public/js/pages/admin-safety-vote-ux1.js');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const components = read('public/js/pages/safety-vote-ux-components.js');
const css = read('public/style.css');
const nodeRoute = read('backend/routes/safety-vote.js');
const phpRoute = read('api/handlers/safety_vote.php');

for (const label of ['ภาพรวม', 'แคมเปญ', 'ป้ายประชาสัมพันธ์', 'วางแผนและสื่อสาร']) ok(admin.includes(label), `workspace ${label}`);
ok(!admin.includes('Admin Action Center') && !admin.includes('Phase 9B'), 'internal phase wording removed from Admin center');
ok(admin.includes('data-sv-edit-draft') && admin.includes('openCampaignWizard(Number(button.dataset.svEditDraft))'), 'Draft edit action opens existing campaign');
ok(admin.includes('data-sv-void-draft') && admin.includes('openSafetyVoteReasonDialog'), 'Draft void action requires a reason dialog');
ok(admin.includes("API.delete(`/safety-vote/admin/campaigns/${Number(row.id)}`") && admin.includes('เก็บประวัติไว้ใน Audit'), 'Draft void reuses audited API');
ok(nodeRoute.includes("router.delete('/admin/campaigns/:id'") && nodeRoute.includes("Status='Voided'") && nodeRoute.includes('SAFETY_VOTE_CAMPAIGN_VOID'), 'Node safe-void contract');
ok(phpRoute.includes("$method==='DELETE'") && phpRoute.includes("Status='Voided'") && phpRoute.includes('SAFETY_VOTE_CAMPAIGN_VOID'), 'PHP safe-void parity');
ok(admin.includes('1600×800 px') && admin.includes('1080×1350 px') && admin.includes('data-sv-promotion-image'), 'responsive image guidance and preview hook');
ok(admin.includes("['image/jpeg', 'image/png', 'image/webp']") && admin.includes('10 * 1024 * 1024'), 'client upload allowlist and hard limit');
ok(admin.includes('data-sv-image-status') && admin.includes('is-warning'), 'dimension, ratio and size feedback');
ok(wizard.includes('campaignId = null') && wizard.includes('กำลังเปิดแคมเปญฉบับร่าง'), 'wizard supports existing Draft hydration');
ok(wizard.includes('/builder`)') && wizard.includes('/media`)'), 'Draft hydration loads builder and media');
ok(wizard.includes('preservedMedia') && wizard.includes('optionMediaKeys'), 'existing media remains preserved during edit');
ok(components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true') && components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteEngagementV1 === true'), 'strict client gates remain fail-closed');
ok(css.includes('.sv-admin-workspaces') && css.includes('.sv-promotion-editor__layout') && css.includes('.sv-context-actions'), 'task-oriented responsive CSS');
ok(css.includes('min-height: 44px') && css.includes('@media (prefers-reduced-motion: reduce)'), 'touch and reduced-motion semantics');
ok(!admin.includes('/notifications/dispatch') && !admin.includes('SafetyVote_Ballots'), 'Admin simplification does not dispatch or touch ballots');

console.log(`Safety Vote Admin simplification static/contract: PASS (${checks} assertions)`);
