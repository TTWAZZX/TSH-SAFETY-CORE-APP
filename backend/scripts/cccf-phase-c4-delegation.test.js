'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/routes/cccf.js');
const php = read('api/handlers/workflow_phase6.php');
const ui = read('public/js/pages/cccf.js');
const migration = read('backend/migrations/20260903_cccf_submit_delegations.sql');

const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

check('Additive migration records actor without touching legacy rows',
    migration.includes('SubmittedByEmployeeID') && migration.includes('SubmittedByName') && migration.includes('CCCF_Submit_Delegations'));
check('Node and PHP expose delegated submission APIs',
    node.includes("router.get('/delegations'") && node.includes("router.post('/delegations'")
    && php.includes("$path==='/cccf/delegations'") && php.includes("route_params($path,'/cccf/delegations/:id')"));
check('Normal user authorization is server enforced and assignment-bound',
    node.includes('INNER JOIN CCCF_Assignments a ON a.EmployeeID = d.OwnerEmployeeID')
    && node.includes('d.OwnerEmployeeID = ? AND d.DelegateEmployeeID = ? AND d.IsActive = 1')
    && php.includes('INNER JOIN cccf_assignments a ON a.EmployeeID=d.OwnerEmployeeID'));
check('New records persist owner separately from the authenticated submitter',
    node.includes('SubmittedByEmployeeID, SubmittedByName')
    && php.includes('SubmittedByEmployeeID,SubmittedByName,DocumentMode'));
check('KPI ownership remains AssigneeID and delegate cannot use owner direct-PDF privilege',
    node.includes('assertDirectSignedAllowed(req, AssigneeID)')
    && php.includes('wf_cccf_direct_signed_allowed($user,$assignee)'));
check('UI labels owner, submitter, and authorized delegated owner selector clearly',
    ui.includes('ยื่นแบบฟอร์มแทนใคร') && ui.includes('เจ้าของแบบฟอร์ม') && ui.includes('ผู้ส่งรายการ'));
check('UI selector uses delegation-limited source and validates the selected owner',
    ui.includes('_delegations.map') && ui.includes('ownerOptions.some(option => String(option.EmployeeID) === selectedOwnerIdForSubmit)'));
check('Admin can manage delegation with searchable Employee Master selectors',
    ui.includes('openSubmitDelegationManager') && ui.includes('cccf-delegation-owner') && ui.includes('cccf-delegation-delegate'));
check('Admin can grant one delegate access to multiple individually selected owners',
    node.includes("Array.isArray(req.body?.OwnerEmployeeIDs)") && node.includes('ownerIds.length > 500')
    && php.includes("is_array($b['OwnerEmployeeIDs']??null)") && ui.includes("ScopeType:'individual'")
    && ui.includes('multiple size="7"'));
check('Department grant resolves only current assigned owners on the server',
    node.includes("scopeType === 'department' || scopeType === 'unit'") && node.includes('TRIM(e.Department) = ?')
    && php.includes("in_array($scope,['department','unit'],true)") && php.includes('TRIM(e.Department)=?')
    && ui.includes('value="department"') && ui.includes('cccf-delegation-department'));
check('Unit grant resolves assigned owners by exact Department and Unit on the server',
    node.includes("scopeType === 'unit'") && node.includes('TRIM(e.Unit) = ?')
    && php.includes("$scope==='unit'") && php.includes('TRIM(e.Unit)=?')
    && ui.includes("value=\"unit\"") && ui.includes('cccf-delegation-unit') && ui.includes('OwnerUnit:ownerUnit'));
check('Bulk grants remain exact owner-delegate rows and are transactional',
    node.includes('await connection.beginTransaction()') && node.includes('VALUES ${values}')
    && php.includes("$pdo->beginTransaction()") && php.includes('foreach($owners as $owner)')
    && node.includes('ON DUPLICATE KEY UPDATE IsActive = 1') && php.includes('ON DUPLICATE KEY UPDATE IsActive=1'));
check('Inactive or unassigned historical grants remain Admin-visible but cannot authorize users',
    node.includes('Number(row.HasAssignment) === 1')
    && php.includes('AS HasAssignment') && php.includes('a2.EmployeeID=d.OwnerEmployeeID'));
check('Existing outbox/template is reused for owner notification',
    node.includes("eventType: 'SubmittedByAdmin'") && php.includes("'EventType'=>'SubmittedByAdmin'"));

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
const failed = checks.filter(item => !item.pass);
assert.strictEqual(failed.length, 0, `${failed.length} CCCF Phase C4 contract check(s) failed`);
console.log(`CCCF Phase C4 delegation contract tests passed ${checks.length}/${checks.length}.`);
