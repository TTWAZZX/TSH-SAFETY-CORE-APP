'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const nodeSource = fs.readFileSync(path.join(root, 'backend/routes/dashboard.js'), 'utf8');
const phpSource = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');
const sourceLabel = 'Distinct annual Hiyari assignees submitted / current assignments';

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notStrictEqual(start, -1, `Missing ${name}()`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${name}()`);
}

const context = vm.createContext({ Map, Set, String, Number });
vm.runInContext(`
    ${extractFunction(nodeSource, 'pct')}
    ${extractFunction(nodeSource, 'normalizeDepartmentKey')}
    ${extractFunction(nodeSource, 'buildHiyariAssignmentCoverage')}
`, context);

context.assignmentRows = [
    { EmployeeID: ' 001 ', Department: 'Maintenance Sec.' },
    { EmployeeID: '002', Department: 'MAINTENANCE SEC' },
    { EmployeeID: '003', Department: 'Production 1 Sec.' },
];
context.submissionRows = [
    { ReporterID: '001' },
    { ReporterID: ' 001 ' },
    { ReporterID: '003' },
    { ReporterID: 'UNASSIGNED' },
];
const coverage = vm.runInContext(
    'buildHiyariAssignmentCoverage(assignmentRows, submissionRows)',
    context
);

assert.deepStrictEqual(JSON.parse(JSON.stringify(coverage.get('MAINTENANCE SEC'))), {
    numerator: 1,
    denominator: 2,
    source: sourceLabel,
    value: 50,
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(coverage.get('PRODUCTION 1 SEC'))), {
    numerator: 1,
    denominator: 1,
    source: sourceLabel,
    value: 100,
});
assert.strictEqual(coverage.has('UNASSIGNED'), false, 'Unassigned reporters must not create coverage rows');

for (const [label, source] of [['Node', nodeSource], ['PHP', phpSource]]) {
    assert.ok(source.includes('Hiyari_Assignments') || source.includes('hiyari_assignments'), `${label} must use current Hiyari assignments`);
    assert.ok(source.includes('SELECT DISTINCT ReporterID'), `${label} must count annual reporters once`);
    assert.ok(source.includes('DeletedAt IS NULL'), `${label} must exclude soft-deleted reports`);
    assert.ok(source.includes(sourceLabel), `${label} must expose assignment coverage metadata`);
    assert.ok(!source.includes("source: 'Distinct Hiyari reporters / employees'") && !source.includes("'source'=>'Distinct Hiyari reporters / employees'"), `${label} must not use Employee Master as the Hiyari denominator`);
}

console.log('Dashboard Hiyari assignment coverage passed: 2/2 departments and Node/PHP source parity');
