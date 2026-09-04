'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/routes/cccf.js');
const php = read('api/handlers/workflow_phase6.php');
const ui = read('public/js/pages/cccf.js');

const checks = [];
function check(name, condition) {
    checks.push({ name, pass: Boolean(condition) });
}

check('Submit-on-behalf picker is an accessible searchable combobox',
    ui.includes('id="permanent-owner-search"')
    && ui.includes('role="combobox"')
    && ui.includes('role="listbox"')
    && ui.includes('data-owner-id'));
check('Search covers Employee ID, name and Department',
    ui.includes('${option.EmployeeID} ${option.EmployeeName} ${option.Department}'));
check('Review transition replaces detail content without close/open race',
    ui.includes('onclick="window._cccfReviewPermanent')
    && !ui.includes('onclick="closeModal();window._cccfReviewPermanent'));
check('Review form retains inline errors instead of replacing the dialog',
    ui.includes('id="cccf-review-error"')
    && ui.includes('reviewComment?.focus()')
    && ui.includes("btn.setAttribute('aria-busy', 'true')"));
check('Node authorizes ordinary delegated submission only through active server delegation',
    node.includes('CCCF_Submit_Delegations d')
    && node.includes('INNER JOIN CCCF_Assignments a ON a.EmployeeID = d.OwnerEmployeeID')
    && node.includes('d.OwnerEmployeeID = ? AND d.DelegateEmployeeID = ? AND d.IsActive = 1'));
check('PHP authorizes ordinary delegated submission only through active server delegation',
    php.includes('function wf_cccf_resolve_submitter')
    && php.includes('cccf_submit_delegations d INNER JOIN cccf_assignments'));
check('Ownerless Admin edits retain the existing assignee in Node and PHP',
    node.includes('currentRow.AssigneeID')
    && php.includes("$existing['AssigneeID']"));
check('Node review locks state and rejects stale transitions',
    node.includes('LIMIT 1 FOR UPDATE')
    && node.includes('CCCF_REVIEW_STATE_CONFLICT')
    && node.includes('alreadyReviewed'));
check('PHP review locks state and rejects stale transitions',
    php.includes('LIMIT 1 FOR UPDATE')
    && php.includes('CCCF_REVIEW_STATE_CONFLICT')
    && php.includes('alreadyReviewed'));
check('Reject comment is required in Node and PHP',
    node.includes("reviewStatus === 'Rejected' && !reviewComment")
    && php.includes("$st==='Rejected'&&$comment===''"));
check('PHP review notification resolves the record owner',
    php.includes('wf_cccf_owner_recipient($mailRecord)')
    && php.includes("'Recipients'=>$owner['email']"));

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
const failed = checks.filter(item => !item.pass);
assert.strictEqual(failed.length, 0, `${failed.length} CCCF Phase C1-C3 contract check(s) failed`);
console.log(`CCCF Phase C1-C3 contract tests passed ${checks.length}/${checks.length}.`);
