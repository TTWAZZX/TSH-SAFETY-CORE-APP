'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildBulkCodePreview, normalizeBulkCodeOptions, canonicalBulkCodeChanges } = require('../utils/fourmCurriculumBulkCode');

const rows = [
    { id: 'a', Year: 2026, Department: 'PD2', CurriculumCode: 'PD2CU681008', CurriculumTitle: 'A', IsActive: 1 },
    { id: 'b', Year: 2026, Department: 'PE1', CurriculumCode: 'PE1cu681001', CurriculumTitle: 'B', IsActive: 1 },
    { id: 'c', Year: 2026, Department: 'PD2', CurriculumCode: 'PD2CU691099', CurriculumTitle: 'C', IsActive: 1 },
    { id: 'd', Year: 2026, Department: 'PD2', CurriculumCode: 'CU68-CU68', CurriculumTitle: 'D', IsActive: 1 },
    { id: 'e', Year: 2026, Department: 'PD2', CurriculumCode: 'INACTIVE-CU68', CurriculumTitle: 'E', IsActive: 0 },
    { id: 'f', Year: 2025, Department: 'PD2', CurriculumCode: 'OLD-CU68', CurriculumTitle: 'F', IsActive: 1 },
];

const normal = buildBulkCodePreview(rows, { year: 2026, department: 'PE1', find: 'cu68', replace: 'cu69' });
assert.strictEqual(normal.matchedCount, 1);
assert.strictEqual(normal.readyCount, 1);
assert.strictEqual(normal.rows[0].newCode, 'PE1CU691001');

const all = buildBulkCodePreview(rows, { year: 2026, department: 'all', find: 'CU68', replace: 'CU69' });
assert.strictEqual(all.matchedCount, 3, 'inactive and other-year rows must be excluded by default');
assert.strictEqual(all.readyCount, 2);
assert.strictEqual(all.ambiguousCount, 1);

const conflictRows = rows.concat({ id: 'g', Year: 2026, Department: 'PD2', CurriculumCode: 'PD2CU691008', CurriculumTitle: 'G', IsActive: 1 });
const conflict = buildBulkCodePreview(conflictRows, { year: 2026, department: 'PD2', find: 'CU68', replace: 'CU69' });
assert.strictEqual(conflict.conflictCount, 1);
assert.strictEqual(conflict.rows.find(row => row.id === 'a').status, 'conflict');

const includeInactive = buildBulkCodePreview(rows, { year: 2026, department: 'PD2', find: 'INACTIVE', replace: 'ACTIVE', activeOnly: false });
assert.strictEqual(includeInactive.readyCount, 1);

assert.throws(() => normalizeBulkCodeOptions({ year: 2026, find: 'CU68', replace: 'CU68' }), /different/);
assert.deepStrictEqual(canonicalBulkCodeChanges([all.rows[1], all.rows[0]]).map(row => row.id), ['a', 'b']);

const root = path.resolve(__dirname, '..', '..');
const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'fourm.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'fourm.js'), 'utf8');
assert(nodeRoute.indexOf("router.put('/training-curriculums/bulk-code'") < nodeRoute.indexOf("router.put('/training-curriculums/:id'"), 'Node bulk route must precede parameter route');
assert(phpRoute.indexOf("$path==='/fourm/training-curriculums/bulk-code'") < phpRoute.indexOf("route_params($path,'/fourm/training-curriculums/:id')"), 'PHP bulk route must precede parameter route');
assert.match(nodeRoute, /FOR UPDATE/);
assert.match(nodeRoute, /CURRICULUM_CODE_BULK_UPDATE/);
assert.match(nodeRoute, /Curriculum data changed after preview/);
assert.match(phpRoute, /CURRICULUM_CODE_BULK_UPDATE/);
assert.match(phpRoute, /Curriculum data changed after preview/);
assert.match(frontend, /id="btn-tm-bulk-code"/);
assert.match(frontend, /bulk-code-preview/);

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpResult = spawnSync(php, [path.join(root, 'api', 'tests', 'fourm_bulk_code_runner.php')], {
    cwd: root,
    input: JSON.stringify(rows),
    encoding: 'utf8',
});
assert.strictEqual(phpResult.status, 0, phpResult.stderr || phpResult.stdout);
const phpPreview = JSON.parse(phpResult.stdout);
assert.deepStrictEqual(
    {
        matchedCount: phpPreview.matchedCount,
        readyCount: phpPreview.readyCount,
        conflictCount: phpPreview.conflictCount,
        ambiguousCount: phpPreview.ambiguousCount,
        invalidCount: phpPreview.invalidCount,
        changes: phpPreview.rows.map(row => [row.id, row.oldCode, row.newCode, row.status]),
    },
    {
        matchedCount: all.matchedCount,
        readyCount: all.readyCount,
        conflictCount: all.conflictCount,
        ambiguousCount: all.ambiguousCount,
        invalidCount: all.invalidCount,
        changes: all.rows.map(row => [row.id, row.oldCode, row.newCode, row.status]),
    },
    'Node and PHP bulk-code previews must stay in parity'
);

console.log('4M bulk curriculum code tests passed.');
