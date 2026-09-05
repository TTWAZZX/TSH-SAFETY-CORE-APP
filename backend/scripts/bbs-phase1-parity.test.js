'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rules = require('../services/bbs-phase1');

const root = path.resolve(__dirname, '..', '..');
const fixture = {
    levels: ['operator', 'Group Leader', 'bad-level', ' Manager '],
    weekdays: ['5,1,2,2,9', [1, 3, 5], ''],
    assignments: [
        {
            supervisorEmployeeId: '010001', memberEmployeeId: '010002',
            supervisorLevel: 'Group Leader', memberLevel: 'Operator', assignmentType: 'permanent',
            effectiveFrom: '2026-08-25', effectiveTo: '',
        },
        {
            supervisorEmployeeId: '010001', memberEmployeeId: '010002',
            supervisorLevel: 'Department Head', memberLevel: 'Operator', assignmentType: 'permanent',
            effectiveFrom: '2026-08-25', effectiveTo: '',
        },
        {
            supervisorEmployeeId: '010001', memberEmployeeId: '010001',
            supervisorLevel: 'Group Leader', memberLevel: 'Operator', assignmentType: 'permanent',
            effectiveFrom: '2026-08-25', effectiveTo: '',
        },
        {
            supervisorEmployeeId: '010001', memberEmployeeId: '010002',
            supervisorLevel: 'Group Leader', memberLevel: 'Operator', assignmentType: 'temporary',
            effectiveFrom: '2026-08-30', effectiveTo: '2026-08-25',
        },
    ],
    kpi: [
        { rule: { IsActive: 1, Weekdays: '1,2,3,4,5' }, date: '2026-08-24' },
        { rule: { IsActive: 1, Weekdays: '1,2,3,4,5' }, date: '2026-08-29' },
        { rule: { IsActive: 0, Weekdays: '1,2,3,4,5' }, date: '2026-08-24' },
    ],
};

function jsResults() {
    return {
        assignments: fixture.assignments.map(item => rules.validateAssignmentCandidate(item)),
        kpi: fixture.kpi.map(item => rules.kpiDueForDate(item.rule, item.date)),
        levels: fixture.levels.map(rules.normalizeLevel),
        weekdays: fixture.weekdays.map(rules.normalizeWeekdays),
    };
}

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runner = path.join(root, 'api', 'tests', 'bbs_phase1_fixture_runner.php');
const result = spawnSync(php, [runner], { input: JSON.stringify(fixture), encoding: 'utf8' });
assert.strictEqual(result.status, 0, result.stderr || 'PHP fixture runner failed.');
const phpResults = JSON.parse(result.stdout);
assert.deepStrictEqual(phpResults, jsResults(), 'Node/PHP BBS Phase 1 rule parity mismatch.');

assert.deepStrictEqual(rules.BBS_LEVELS, ['Operator', 'Group Leader', 'Department Head', 'Section Head', 'Manager']);
assert.strictEqual(jsResults().assignments[0].ok, true);
assert.strictEqual(jsResults().assignments[1].ok, false);
assert.strictEqual(jsResults().assignments[2].ok, false);
assert.strictEqual(jsResults().assignments[3].ok, false);
assert.deepStrictEqual(jsResults().kpi, [true, false, false]);

const route = fs.readFileSync(path.join(root, 'backend', 'routes', 'bbs-smart-card.js'), 'utf8');
const phpHandler = fs.readFileSync(path.join(root, 'api', 'handlers', 'bbs_smart_card.php'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(root, 'api', 'index.php'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'admin.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20260825_bbs_phase1_foundation.sql'), 'utf8');

for (const endpoint of ['/me/context', '/me/team', '/eligible-employees', '/admin/foundation', '/admin/position-mappings/:positionId', '/admin/hierarchy-assignments']) {
    assert.ok(route.includes(endpoint), `Node route missing ${endpoint}`);
}
for (const endpoint of ['/bbs/me/context', '/bbs/me/team', '/bbs/eligible-employees', '/bbs/admin/foundation', '/bbs/admin/position-mappings/:positionId', '/bbs/admin/hierarchy-assignments']) {
    assert.ok(phpHandler.includes(endpoint), `PHP route missing ${endpoint}`);
}
assert.ok(server.includes("app.use('/api/bbs',"), 'Node BBS route is not mounted.');
assert.ok(apiIndex.includes('handle_bbs_smart_card_routes($method, $path);'), 'PHP BBS handler is not dispatched.');
assert.ok(admin.includes("key: 'bbs-foundation'"), 'Admin BBS Foundation tab is missing.');
assert.ok(admin.includes("API.get('/bbs/admin/foundation')"), 'Admin BBS Foundation API load is missing.');
// Phase 3 introduced workspace navigation. The Phase 1 migration must still default it off;
// current runtime authorization is covered by the Phase 10E staged/Pilot gate tests.
assert.ok(migration.includes("('main_menu_enabled', '0'"), 'Migration must keep main menu disabled.');
assert.ok(migration.includes("d.Name = 'MAINTENANCE SEC.'"));
assert.ok(migration.includes("u.name = 'Tube Cutting'"));

console.log('BBS Phase 1 parity/contracts: PASS');
