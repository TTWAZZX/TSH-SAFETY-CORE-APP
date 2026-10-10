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
const css = read('public/style.css');
const nodePlanning = read('backend/routes/safety-vote-planning.js');
const phpPlanning = read('api/handlers/safety_vote_planning.php');
const nodeCampaign = read('backend/routes/safety-vote.js');
const phpCampaign = read('api/handlers/safety_vote.php');

ok(admin.includes('data-sv-built-in-template') && admin.includes('data-sv-reusable-template'), 'guided template chooser');
ok(admin.includes('/planning/templates/${Number(templateId)}') && admin.includes('initialConfig'), 'saved template opens the wizard before persistence');
ok(admin.includes('/planning/campaigns/${Number(campaignId)}/config-copy') && admin.includes('ทำสำเนาเฉพาะการตั้งค่า'), 'config-only duplicate action');
ok(admin.includes('ระบบจะสร้างรหัสใหม่เมื่อบันทึกครั้งแรก') && admin.includes('ไม่คัดลอกไฟล์'), 'copy exclusions are explicit');
ok(wizard.includes('initialTemplateKey') && wizard.includes('configDraft(initialConfig)'), 'wizard accepts built-in and reusable configurations');
ok(wizard.includes("campaignCode: '', openAt: '', closeAt: ''") && wizard.includes('eligibilityFrozen: false'), 'copied draft resets identity, schedule and frozen eligibility');
ok(wizard.includes('sessionStorage.setItem(recoveryKey') && wizard.includes('sessionStorage.removeItem(recoveryKey)'), 'session-scoped draft recovery');
ok(wizard.includes("window.addEventListener('beforeunload', beforeUnload)") && wizard.includes("window.removeEventListener('beforeunload', beforeUnload)"), 'unsaved-change browser guard has cleanup');
ok(wizard.includes('data-svw-recovery="restore"') && wizard.includes('data-svw-recovery="discard"'), 'recovery requires explicit user choice');
ok(wizard.includes('svw-readiness-summary') && wizard.includes('serverUpdatedAt'), 'readiness and last-edited metadata');
ok(admin.includes('data-sv-draft-select-all') && admin.includes('data-sv-bulk-void'), 'bulk Draft selection');
ok(admin.includes('for (const row of rows)') && admin.includes('API.delete(`/safety-vote/admin/campaigns/${Number(row.id)}`'), 'bulk action reuses audited safe void endpoint');
ok(admin.includes('ไม่มีการลบข้อมูลแบบถาวร') && admin.includes('เก็บ Audit'), 'bulk confirmation explains non-destructive behavior');
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
