'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let checks = 0;
const check = (value, message) => { assert(value, message); checks += 1; };

const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const participantModel = read('public/js/pages/safety-vote-participation-model.mjs');
const nodeCore = read('backend/routes/safety-vote.js');
const phpCore = read('api/handlers/safety_vote.php');
const nodePhase3 = read('backend/routes/safety-vote-phase3.js');
const phpPhase3 = read('api/handlers/safety_vote_phase3.php');
const nodeResults = read('backend/routes/safety-vote-phase4.js');
const phpResults = read('api/handlers/safety_vote_phase4.php');
const nodeLive = read('backend/routes/safety-vote-live-results.js');
const phpLive = read('api/handlers/safety_vote_live_results.php');

check(wizard.includes('Privacy ใช้กำหนดการเก็บและเชื่อมโยงคำตอบของผู้เข้าร่วม'), 'privacy scope explanation is missing');
check(wizard.includes('ไม่ใช่การปิดสิทธิ์ Admin'), 'Admin/privacy distinction is missing');
check(wizard.includes('การแสดงผลและประกาศผลสำหรับผู้เข้าร่วม'), 'result visibility audience is ambiguous');
check(wizard.includes('Role Admin') && wizard.includes('Result View, Export, Certify หรือ Audit View'), 'permission guidance is incomplete');
check(wizard.includes('Anonymous/Secret ไม่สามารถใช้สิทธิ์ใดข้ามข้อจำกัดนี้ได้'), 'privacy invariant warning is missing');
check(participantModel.includes('แม้เป็น Admin ก็ไม่สามารถเชื่อมว่าคุณเลือกอะไรได้'), 'secret-ballot participant disclosure is incomplete');
check(participantModel.includes('Admin ดูได้เฉพาะผลรวมที่ผ่านเกณฑ์'), 'anonymous participant disclosure is incomplete');

check(nodeCore.includes("if(role(req)==='ADMIN')return true"), 'Node Role Admin bypass is missing');
check(phpCore.includes("if(sv_role($user)==='ADMIN')return true"), 'PHP Role Admin bypass is missing');
for (const source of [nodeResults, phpResults, nodeLive, phpLive]) {
    check(source.includes('SAFETY_VOTE_RESULT_VIEW'), 'aggregate result endpoint is not permission guarded');
    check(!source.includes("ResultVisibility==='admin_only'") && !source.includes("ResultVisibility']==='admin_only'"), 'Admin aggregate endpoint must not be blocked by participant result visibility');
}

check(nodePhase3.includes("['identified','confidential'].includes(c.PrivacyMode)"), 'Node identity mapping allowlist regressed');
check(phpPhase3.includes("in_array($c['PrivacyMode'],['identified','confidential'],true)"), 'PHP identity mapping allowlist regressed');
check(!nodePhase3.includes("['identified','confidential','anonymous'") && !phpPhase3.includes("['identified','confidential','anonymous'"), 'anonymous identity mapping must remain impossible');
check(nodeLive.includes("permit('SAFETY_VOTE_RESULT_VIEW')") && phpLive.includes("'SAFETY_VOTE_RESULT_VIEW'"), 'Admin live aggregate permission parity regressed');

console.log(`Safety Vote privacy explanation + permission contract: PASS (${checks} assertions)`);
