'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    ADMIN_ON_BEHALF_LABEL,
    responseForViewer,
} = require('../utils/yokoten-response-visibility');

const projectRoot = path.resolve(__dirname, '..', '..');
const nodeSource = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'yokoten.js'), 'utf8');
const nodeVisibilitySource = fs.readFileSync(path.join(projectRoot, 'backend', 'utils', 'yokoten-response-visibility.js'), 'utf8');
const phpSource = fs.readFileSync(path.join(projectRoot, 'api', 'handlers', 'workflow_phase6.php'), 'utf8');

const nodeOverview = nodeSource.slice(
    nodeSource.indexOf("router.get('/company-overview'"),
    nodeSource.indexOf("router.get('/all-responses'"),
);
const phpOverview = phpSource.slice(
    phpSource.indexOf('function wf_yokoten_company_overview'),
    phpSource.indexOf('function wf_yokoten_queue_approval_email'),
);

assert.ok(nodeOverview.includes('SELECT r.YokotenID, r.Department'), 'Node overview must count department-topic responses');
assert.ok(nodeOverview.includes('EffectiveSafetyUnit'), 'Node overview must read response Unit coverage');
assert.ok(nodeOverview.includes('buildUnitCoverage'), 'Node overview must require full target Unit coverage');
const nodeResponseIndex = nodeOverview.indexOf('const responseMap');
const nodeSharedIndex = nodeOverview.indexOf('const [sharedRows]');
assert.ok(!nodeOverview.slice(nodeResponseIndex, nodeSharedIndex).includes('scopeUnits'), 'Node overview must not discard a response using configured dashboard Units');
assert.ok(phpOverview.includes('SELECT r.YokotenID,r.Department'), 'PHP overview must count department-topic responses');
assert.ok(phpOverview.includes('EffectiveSafetyUnit'), 'PHP overview must read response Unit coverage');
assert.ok(phpOverview.includes('yokoten_scope_build_unit_coverage'), 'PHP overview must require full target Unit coverage');
assert.ok(!phpOverview.includes('array_intersect($units, $configuredUnits)'), 'PHP overview must not re-filter response existence by configured Unit');
console.log('PASS Node/PHP Company Overview count completed Department + Topic Unit coverage');

const nodeSubmit = nodeSource.slice(
    nodeSource.indexOf("router.post('/respond'"),
    nodeSource.indexOf("router.put('/respond/:id'"),
);
assert.ok(nodeSubmit.indexOf('const incompleteDepartments') < nodeSubmit.indexOf('const connection = await db.getConnection()'), 'Node create must reject incomplete Unit coverage before transaction');
const phpSubmit = phpSource.slice(
    phpSource.indexOf("if(($method==='POST'&&$path==='/yokoten/respond')"),
    phpSource.indexOf("route_params($path,'/yokoten/respond/:id'); if($p!==null&&$method==='DELETE')"),
);
assert.ok(phpSubmit.indexOf('$coverageErrors=[]') < phpSubmit.indexOf('$pdo->beginTransaction()'), 'PHP create must reject incomplete Unit coverage before transaction');
assert.ok(nodeSource.includes('Missing Safety Units:'), 'Node update must reject legacy incomplete Unit coverage');
assert.ok(phpSubmit.includes('Missing Safety Units:'), 'PHP update must reject legacy incomplete Unit coverage');
console.log('PASS Node/PHP create and update enforce Unit completeness before persistence');

const adminRow = {
    ResponseID: 'R1',
    EmployeeID: '012609',
    EmployeeName: 'Admin Name',
    SubmitterRole: 'Admin',
};
const viewerResult = responseForViewer(adminRow, false);
assert.strictEqual(viewerResult.SubmittedByAdmin, 1);
assert.strictEqual(viewerResult.EmployeeID, null);
assert.strictEqual(viewerResult.EmployeeName, ADMIN_ON_BEHALF_LABEL);
assert.strictEqual(viewerResult.ResponderDisplayName, ADMIN_ON_BEHALF_LABEL);
assert.ok(!Object.prototype.hasOwnProperty.call(viewerResult, 'SubmitterRole'));

const adminResult = responseForViewer(adminRow, true);
assert.strictEqual(adminResult.EmployeeID, adminRow.EmployeeID);
assert.strictEqual(adminResult.EmployeeName, adminRow.EmployeeName);
assert.strictEqual(adminResult.SubmittedByAdmin, 1);

const userRow = responseForViewer({ ...adminRow, SubmitterRole: 'User' }, false);
assert.strictEqual(userRow.EmployeeID, adminRow.EmployeeID);
assert.strictEqual(userRow.EmployeeName, adminRow.EmployeeName);
assert.strictEqual(userRow.SubmittedByAdmin, 0);
console.log('PASS Node responder visibility preserves Admin audit identity and masks Viewer output');

const phpCode = `
require ${JSON.stringify(path.join(projectRoot, 'api', 'handlers', 'workflow_phase6.php').replace(/\\/g, '/'))};
$row=['ResponseID'=>'R1','EmployeeID'=>'012609','EmployeeName'=>'Admin Name','SubmitterRole'=>'Admin'];
echo json_encode([
  'viewer'=>wf_yokoten_response_for_viewer($row,false),
  'admin'=>wf_yokoten_response_for_viewer($row,true),
  'user'=>wf_yokoten_response_for_viewer(array_merge($row,['SubmitterRole'=>'User']),false),
], JSON_UNESCAPED_UNICODE);
`;
const phpCandidates = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean);
let phpResult = null;
for (const executable of phpCandidates) {
    const result = spawnSync(executable, ['-r', phpCode], { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
    if (!result.error && result.status === 0) { phpResult = JSON.parse(result.stdout); break; }
}
assert.ok(phpResult, 'PHP responder visibility runner failed');
assert.deepStrictEqual(phpResult.viewer, viewerResult, 'Viewer masking must have Node/PHP parity');
assert.deepStrictEqual(phpResult.admin, adminResult, 'Admin visibility must have Node/PHP parity');
assert.deepStrictEqual(phpResult.user, userRow, 'Ordinary responder visibility must have Node/PHP parity');
console.log('PASS PHP responder visibility matches Node');

assert.ok(nodeSource.includes('SubmitterRole'), 'Node response reads must attach the responder role');
assert.ok(nodeVisibilitySource.includes('ResponderDisplayName'), 'Node response payload must expose a safe display label');
assert.ok(phpSource.includes('SubmitterRole'), 'PHP response reads must attach the responder role');
assert.ok(phpSource.includes('ResponderDisplayName'), 'PHP response payload must expose a safe display label');
console.log('Yokoten Company Overview and responder privacy tests passed 5/5.');
