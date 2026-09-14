'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseTrainingLogQuery, trainingLogPagination } = require('../utils/fourmTrainingLogQuery');

const defaults = parseTrainingLogQuery({}, { admin: true });
assert.deepStrictEqual(
    { paged: defaults.paged, page: defaults.page, pageSize: defaults.pageSize },
    { paged: false, page: 1, pageSize: 100 },
    'legacy requests must retain the array-compatible 100-row default'
);

const paged = parseTrainingLogQuery({
    paged: '1', page: '3', pageSize: '20', department: 'PRODUCTION 1 SEC.', unit: 'Element 1',
    action: 'assignment_transfer', actorId: 'A001', employeeId: 'E001', year: '2026',
    dateFrom: '2026-01-01', dateTo: '2026-12-31', q: 'laser',
}, { admin: true });
assert.deepStrictEqual(
    {
        paged: paged.paged, page: paged.page, pageSize: paged.pageSize,
        department: paged.department, unit: paged.unit, action: paged.action,
        actorId: paged.actorId, employeeId: paged.employeeId, year: paged.year,
        dateFrom: paged.dateFrom, dateTo: paged.dateTo, q: paged.q,
    },
    {
        paged: true, page: 3, pageSize: 20,
        department: 'PRODUCTION 1 SEC.', unit: 'Element 1', action: 'ASSIGNMENT_TRANSFER',
        actorId: 'A001', employeeId: 'E001', year: 2026,
        dateFrom: '2026-01-01', dateTo: '2026-12-31', q: 'laser',
    }
);

const scoped = parseTrainingLogQuery({ department: 'OTHER', pageSize: '999' }, {
    admin: false, ownDepartment: 'MAINTENANCE SEC.',
});
assert.strictEqual(scoped.department, 'MAINTENANCE SEC.', 'non-Admin must not escape their server-derived Department');
assert.strictEqual(scoped.pageSize, 300, 'legacy limit must be bounded');
assert.strictEqual(parseTrainingLogQuery({ paged: '1', pageSize: '999' }, { admin: true }).pageSize, 100);

for (const query of [
    { year: '1999' }, { year: '20260' }, { dateFrom: '2026-02-30' },
    { dateTo: '2026-01-011' }, { dateFrom: '2026-02-01', dateTo: '2026-01-31' },
]) assert.throws(() => parseTrainingLogQuery(query, { admin: true }), /Invalid Training Matrix log filter/);

assert.deepStrictEqual(trainingLogPagination(45, 2, 20), {
    page: 2, pageSize: 20, total: 45, totalPages: 3, hasPrevious: true, hasNext: true,
});
assert.strictEqual(trainingLogPagination(45, 99, 20).page, 3, 'out-of-range pages must be clamped');
assert.deepStrictEqual(trainingLogPagination(0, 4, 20), {
    page: 1, pageSize: 20, total: 0, totalPages: 1, hasPrevious: false, hasNext: false,
});

const nodeRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'fourm.js'), 'utf8');
const nodeQuery = fs.readFileSync(path.join(__dirname, '..', 'utils', 'fourmTrainingLogQuery.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
for (const source of [nodeRoute, phpRoute]) {
    assert.match(source, /JSON_VALID\(/, 'legacy invalid JSON must be guarded');
    assert.match(source, /curriculumDepartment/, 'Department filters must use the audit snapshot');
    assert.match(source, /employeeUnit/, 'Unit filters must use the audit snapshot');
    assert.match(source, /PerformedByID/, 'actor filter must be supported');
    assert.match(source, /dateFrom/);
    assert.match(source, /dateTo/);
}
for (const source of [nodeQuery, phpRoute]) {
    assert.match(source, /totalPages/);
    assert.match(source, /hasPrevious/);
    assert.match(source, /hasNext/);
}
assert.match(nodeRoute, /parseTrainingLogQuery\(req\.query/);
assert.match(nodeRoute, /l\.CurriculumID = \? OR .*newCurriculumId.* = \? OR .*oldCurriculumId.* = \?/s);
assert.match(nodeRoute, /newDepartment.* = \? OR .*oldDepartment.* = \?/s);
assert.match(nodeRoute, /SourceDepartment/);
assert.match(nodeRoute, /DestinationDepartment/);
assert.match(phpRoute, /fm_training_logs_response\(\$u\)/);
assert.match(phpRoute, /\$department=\$admin\?/);
assert.match(phpRoute, /l\.CurriculumID=\? OR \$newCurriculumId=\? OR \$oldCurriculumId=\?/);

console.log('4M Training Matrix log query contract tests passed.');
