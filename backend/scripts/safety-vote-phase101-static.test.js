'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const contract = require('../services/safety-vote-phase1');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const admin = read('public/js/pages/admin.js');
const style = read('public/style.css');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const model = read('public/js/pages/safety-vote-wizard-model.mjs');
const nodeRoute = read('backend/routes/safety-vote.js');
const phpRoute = read('api/handlers/safety_vote.php');
const phpLib = read('api/lib/safety_vote_phase1.php');

assert.deepStrictEqual([1, 9, 999, 0, 1000].map(value => contract.formatCampaignCode(value, 2026)), [
    'SHE-001-2026', 'SHE-009-2026', 'SHE-999-2026', null, null
]);
assert.strictEqual(contract.normalizeCampaign({ titleTh: 'ทดสอบ' }, { requireCampaignCode: false }).ok, true);
assert.strictEqual(contract.normalizeCampaign({ titleTh: 'ทดสอบ' }).ok, false);

assert.match(nodeRoute, /campaignCodeGenerated:true/);
assert.match(nodeRoute, /CAMPAIGN_CODE_IMMUTABLE/);
assert.match(nodeRoute, /attempt<5/);
assert.match(phpRoute, /campaignCodeGenerated.*true/);
assert.match(phpRoute, /CAMPAIGN_CODE_IMMUTABLE/);
assert.match(phpRoute, /\$attempt<5/);
assert.match(phpLib, /SHE-%03d-%04d/);

assert.match(wizard, /ระบบสร้างรหัสรูปแบบ SHE-001-YYYY อัตโนมัติ/);
assert.match(wizard, /readonly aria-describedby="svw-campaign-code-help"/);
assert.match(wizard, /PRIVACY_DETAILS/);
assert.match(wizard, /ป้องกันการตอบซ้ำ/);
assert.match(wizard, /ข้อมูลลับไม่เท่ากับไม่ระบุตัวตน/);
assert.match(wizard, /หลังตรึงรายชื่อหรือเปิดรับคำตอบแล้ว/);
assert.doesNotMatch(model, /กรุณาระบุรหัสแคมเปญ/);

for (const label of ['ภาพรวม', 'การดำเนินงาน', 'บุคลากรและสิทธิ์', 'การกำกับดูแล']) assert(admin.includes(label), `Missing System Console group: ${label}`);
assert.doesNotMatch(admin, /label:\s*'Safety Vote',\s*badge:\s*'UX'/);
assert.match(style, /admin-console-tab\[hidden\]/);

for (const file of ['backend/routes/safety-vote.js', 'backend/services/safety-vote-phase1.js', 'public/js/pages/admin.js', 'public/js/pages/safety-vote-campaign-wizard.js']) {
    const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
    assert.strictEqual(checked.status, 0, checked.stderr || `${file} syntax failed`);
}

console.log('Safety Vote Phase 10.1 static contract: PASS (automatic immutable code, grouped console, retired UX badge, expanded privacy explanation)');
