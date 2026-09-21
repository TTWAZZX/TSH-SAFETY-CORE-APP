'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const ui = fs.readFileSync(path.join(root, 'public/js/pages/bbs-smart-card.js'), 'utf8');
const node = fs.readFileSync(path.join(root, 'backend/routes/bbs-cards.js'), 'utf8');
const php = fs.readFileSync(path.join(root, 'api/handlers/bbs_cards.php'), 'utf8');

for (const token of [
    "state.personalIssue={templateId:'',selected:new Map()}",
    'เลือกออกบัตรใหม่ ${issueCount} / 100 คน',
    'data-card-select-page',
    'data-card-selection-clear',
    'function selectedPersonalIssueRows()',
    'const employees=selectedPersonalIssueRows()',
    'batchCount:employeeIds.length',
    'Batch Preflight:',
    'state.personalIssue.selected.clear()',
]) assert.ok(ui.includes(token), `Admin Personal batch selection missing ${token}`);

const issueStart = ui.indexOf('async function issueCards(');
const issueEnd = ui.indexOf('async function replaceCard(', issueStart);
const issue = ui.slice(issueStart, issueEnd);
assert.ok(issue.includes('selectedPersonalIssueRows()'), 'Issue must use the cross-page Admin selection store.');
assert.ok(!issue.includes("querySelectorAll('[data-card-employee]:checked')"), 'Issue must not lose off-page selections by reading only current DOM checkboxes.');
assert.ok(issue.includes('unavailable.EmployeeName'), 'Client preflight must reject a selected employee with an Active card.');
assert.ok(issue.includes('personalTemplateMatchesEmployee'), 'Client preflight must validate every employee against one Personal template.');

for (const [source, route] of [[node, '/admin/cards/issue'], [php, '/bbs/admin/cards/issue']]) {
    assert.ok(source.includes(route), 'Server issue endpoint must remain available.');
    assert.match(source, /(?:ids\.length>100|count\(\$ids\)>100)/, 'Server must cap a batch at 100 employees.');
    assert.ok(source.includes('ACTIVE_CARD_EXISTS'), 'Server must fail closed when any selected employee already has an Active card.');
}
assert.ok(node.includes('beginTransaction()') && node.includes('await connection.commit()'), 'Node batch issuance must remain transactional.');
assert.ok(php.includes('beginTransaction()') && php.includes('$pdo->commit()'), 'PHP batch issuance must remain transactional.');
assert.ok(!ui.slice(ui.indexOf('function personalCardsView()'), ui.indexOf('function communityAdminView()')).includes('data-dept-template-print'), 'Personal batch selection must not mix Department output controls.');

console.log('BBS Admin cross-page Personal batch selection and transactional preflight contract: PASS');
