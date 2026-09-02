'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/routes/bbs-community.js');
const php = read('api/handlers/bbs_community.php');
const ui = read('public/js/pages/bbs-smart-card.js');
const main = read('public/js/main.js');
const index = read('index.html');

assert.ok(node.includes('/admin/community-reports/:id'), 'Node Admin Community Risk detail route must exist');
assert.ok(php.includes('/bbs/admin/community-reports/:id'), 'PHP Admin Community Risk detail route must exist');
for (const source of [node, php]) {
    assert.ok(source.includes("r.ReportType='Risky'"), 'Risk detail must fail closed to Risky reports');
    assert.ok(source.includes('BBS_Community_Report_Files'), 'Risk detail must expose authorized evidence metadata');
    assert.ok(source.includes('BBS_Community_Action_History'), 'Risk detail must expose Action History');
    assert.ok(source.includes('ActorName'), 'Action History must identify its actor');
    assert.ok(source.includes('OwnerName') && source.includes('VerifierName'), 'Action responsibility must be readable');
}
assert.match(node, /router\.get\('\/admin\/community-reports\/:id',isAdmin/, 'Node Risk detail must be Admin-only');
assert.match(php, /if\(strpos\(\$path,'\/bbs\/admin\/'\)!==0\)return false;\$admin=require_admin\(\);[\s\S]*\$riskDetail=/, 'PHP Risk detail must pass the Admin gate');
for (const query of [
    'SELECT id,ReportID,OriginalName,MimeType,FileSize,UploadedBy,CreatedAt',
    'SELECT h.id,h.ActionID,h.FromStatus,h.ToStatus,h.ActorEmployeeID'
]) {
    assert.ok(node.includes(query), `Node detail projection missing ${query}`);
    assert.ok(php.includes(query), `PHP detail projection missing ${query}`);
}

for (const token of ['data-inspector-agenda','data-inspector-schedule-mode','aria-pressed','data-community-risk-detail','data-community-risk-dialog','data-risk-evidence','Action History','openCommunityRiskDetail']) {
    assert.ok(ui.includes(token), `Phase 10D-5 UI is missing ${token}`);
}
assert.ok(ui.includes("inspectorScheduleMode:'agenda'"), 'Agenda must be the default schedule view');
assert.match(ui, /min-h-11/, 'Agenda and Risk controls must keep mobile touch targets');
assert.match(ui, /apiFetch\(`\/bbs\/community\/reports\/\$\{reportId\}\/evidence\/\$\{fileId\}`\)/, 'Evidence must use the existing authenticated private endpoint');
assert.match(main, /bbs-smart-card\.js\?v=20260901-bbs-phase10d5/, 'BBS page cache bust must include Phase 10D-5');
assert.match(index, /main\.js\?v=(?:20260901-bbs-phase10d5|20260902-bbs-auto-reference-r1)/, 'Application cache bust must include Phase 10D-5');

console.log('BBS Phase 10D-5 Mobile Agenda and Community Risk Detail contract tests passed.');
