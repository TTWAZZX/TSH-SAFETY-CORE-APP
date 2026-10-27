'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const ok = (value, message) => { assert(value, message); checks += 1; };

const admin = read('public/js/pages/admin-safety-vote-ux1.js');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const components = read('public/js/pages/safety-vote-ux-components.js');
const css = read('public/style.css');
const nodePlanning = read('backend/routes/safety-vote-planning.js');
const phpPlanning = read('api/handlers/safety_vote_planning.php');
const nodePlanningService = read('backend/services/safety-vote-planning.js');
const phpPlanningService = read('api/lib/safety_vote_planning.php');
const nodeCampaign = read('backend/routes/safety-vote.js');
const phpCampaign = read('api/handlers/safety_vote.php');
const nodeRevision = read('backend/routes/safety-vote-phase10-4.js');
const phpRevision = read('api/handlers/safety_vote_phase10_4.php');
const adminEntry = read('public/js/pages/admin.js');
const mainEntry = read('public/js/main.js');
const index = read('index.html');

ok(admin.includes('data-sv-built-in-template') && admin.includes('data-sv-reusable-template'), 'guided template chooser');
ok(admin.includes('/planning/templates/${Number(templateId)}') && admin.includes('initialConfig'), 'saved template opens the wizard before persistence');
ok(admin.includes('duplicateCampaignButton') && admin.includes("if (!allowed) return ''"), 'duplicate button is hidden unless the capability is granted');
const duplicateFlow = admin.slice(admin.indexOf('async function duplicateCampaignConfig'), admin.indexOf('function bulkVoidDrafts'));
ok(duplicateFlow.includes('/campaigns/${Number(campaignId)}/duplicate'), 'duplicate action uses the atomic server endpoint');
ok(!duplicateFlow.includes('/config-copy') && !duplicateFlow.includes('/builder`') && !duplicateFlow.includes('/eligibility/rules`'), 'duplicate action performs no client-side partial copy writes');
ok(duplicateFlow.includes("state.view = 'draft'") && duplicateFlow.includes('state.selectedId = newCampaignId') && duplicateFlow.includes('await load()'), 'duplicate action returns to and selects the new Draft');
ok(!duplicateFlow.includes('openCampaignWizard('), 'duplicate action does not redirect into the creation wizard');
ok(admin.includes('safety-vote-campaign-wizard.js?v=20261027-safety-vote-option-image-r1'), 'lifecycle cache-bust chain');
ok(admin.includes('/safety-vote/admin/permissions') && admin.includes('duplicateCampaign: false'), 'permission capability fails closed in the UI');
ok(duplicateFlow.includes('เป็นฉบับร่างครบถ้วนแล้ว'), 'duplicate completion is explicit');

for (const source of [nodeCampaign, phpCampaign]) {
    ok(source.includes('SAFETY_VOTE_MANAGE') && source.includes('SAFETY_VOTE_CREATE') && source.includes('SAFETY_VOTE_ELIGIBILITY_MANAGE'), 'duplicate requires all three permissions');
    ok(source.includes('duplicateCampaign') && source.includes('grantedPermissions'), 'permission discovery exposes duplicate capability');
    ok(source.includes('SAFETY_VOTE_CAMPAIGN_DUPLICATE') && source.includes('CAMPAIGN_DUPLICATE_FAILED'), 'duplicate has audit and fail-closed contract');
    ok(source.includes('MaxParticipationAttempts') && source.includes('LiveLeaderboardPrivacyThreshold'), 'create/update/copy include participation and live-result settings');
    ok(source.includes('FileID') && source.includes('NULL') && source.includes('employee_id') && source.includes('copiedOptionImages'), 'copy stages options, reattaches cloned private images and strips employee-specific rules');
    ok(source.includes("'ballots'") && source.includes("'certifications'") && source.includes("'notifications'"), 'copy response declares protected exclusions');
}
ok(nodeCampaign.includes("router.post('/admin/campaigns/:id/duplicate'") && nodeCampaign.includes('db.getConnection()') && nodeCampaign.includes('beginTransaction()'), 'Node duplicate is one database transaction');
ok(phpCampaign.includes("'/safety-vote/admin/campaigns/:id/duplicate'") && phpCampaign.includes('beginTransaction()'), 'PHP duplicate is one database transaction');

for (const source of [nodeRevision, phpRevision]) {
    ok(source.includes('MaxParticipationAttempts') && source.includes('LiveLeaderboardEnabled') && source.includes('LiveLeaderboardPrivacyThreshold'), 'offline revision preserves participation and all live-result settings');
}
for (const source of [nodePlanning, phpPlanning]) ok(source.includes('MaxParticipationAttempts') && source.includes('LiveLeaderboardEnabled') && source.includes('LiveLeaderboardPrivacyThreshold'), 'planning query preserves participation and live-result settings');
for (const source of [nodePlanningService, phpPlanningService]) ok(source.includes('maxParticipationAttempts') && source.includes('liveLeaderboardEnabled') && source.includes('liveLeaderboardPrivacyThreshold'), 'safe template payload preserves participation and live-result settings');
ok(!wizard.includes('/participation-policy`'), 'wizard saves max attempts atomically with campaign metadata');
ok(wizard.includes('initialTemplateKey') && wizard.includes('configDraft(initialConfig)'), 'wizard accepts built-in and reusable configurations');
ok(wizard.includes("campaignCode: '', openAt: '', closeAt: ''") && wizard.includes('eligibilityFrozen: false'), 'copied draft resets identity, schedule and frozen eligibility');
ok(wizard.includes('sessionStorage.setItem(recoveryKey') && wizard.includes('sessionStorage.removeItem(recoveryKey)'), 'session-scoped draft recovery');
ok(wizard.includes("window.addEventListener('beforeunload', beforeUnload)") && wizard.includes("window.removeEventListener('beforeunload', beforeUnload)"), 'unsaved-change browser guard has cleanup');
ok(wizard.includes('data-svw-recovery="restore"') && wizard.includes('data-svw-recovery="discard"'), 'recovery requires explicit user choice');
ok(wizard.includes('svw-readiness-summary') && wizard.includes('serverUpdatedAt'), 'readiness and last-edited metadata');
const openCampaignFlow = wizard.slice(wizard.indexOf('const openCampaign = () =>'), wizard.indexOf('const beforeUnload'));
ok(openCampaignFlow.includes('/readiness') && openCampaignFlow.indexOf('/readiness') < openCampaignFlow.indexOf('/lifecycle/${command}'), 'campaign open checks authoritative server readiness before lifecycle mutation');
ok(openCampaignFlow.includes('readiness.data?.blockers') && wizard.includes('PRODUCTION_VISIBILITY'), 'campaign open maps authoritative readiness blockers for Admin feedback');
ok(components.includes('id="sv-dialog-error"') && components.includes('caught?.details') && components.includes("error.hidden = false") && components.includes("button.textContent = 'กำลังตรวจสอบ...'"), 'confirmation dialog exposes progress and asynchronous API failures without closing');
ok(admin.includes('data-sv-draft-select-all') && admin.includes('data-sv-bulk-void'), 'bulk Draft selection');
ok(admin.includes('for (const row of rows)') && admin.includes('API.delete(`/safety-vote/admin/campaigns/${Number(row.id)}`'), 'bulk action reuses audited safe void endpoint');
ok(admin.includes('/planning/campaigns/${id}/assets') && admin.includes('data-sv-library-asset'), 'promotion asset library is campaign scoped');
ok(admin.includes('/planning/promotions/${id}/assets/${libraryFileId}') && admin.includes('{ slot }'), 'asset reuse uses guarded planning attach API');

for (const marker of ['/config-copy', '/planning/templates/:id', '/planning/campaigns/:id/assets', '/planning/promotions/:promotionId/assets/:fileId']) {
    ok(nodePlanning.includes(marker), `Node planning contract ${marker}`);
    ok(phpPlanning.includes(marker), `PHP planning parity ${marker}`);
}
for (const source of [nodePlanning, phpPlanning]) {
    ok(source.includes('ASSET_OWNERSHIP_CONFLICT') && source.includes('ASSET_ALT_TEXT_REQUIRED'), 'private asset ownership and alt-text gates');
    ok(!/UPDATE\s+SafetyVote_(Ballots|BallotAnswers|JuryScores|Results|Certifications)/i.test(source), 'planning route does not mutate protected voting data');
}
ok(nodeCampaign.includes("router.delete('/admin/campaigns/:id'") && nodeCampaign.includes("Status='Voided'"), 'Node Draft void contract');
ok(phpCampaign.includes("$method==='DELETE'") && phpCampaign.includes("Status='Voided'"), 'PHP Draft void parity');
ok(css.includes('.sv-campaign-launcher') && css.includes('.svw-recovery') && css.includes('.sv-promotion-library__grid'), 'guided workflow responsive styling');
ok(css.includes('min-height: 44px') && css.includes('@media (max-width: 767px)'), 'touch target and mobile breakpoint coverage');
ok(!admin.includes('/notifications/dispatch') && !wizard.includes('SafetyVote_Ballots'), 'no external delivery or ballot mutation');

console.log(`Safety Vote Admin guided Drafts static/contract: PASS (${checks} assertions)`);
