'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'cccf.js'), 'utf8');

function extractFunction(name) {
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

const assignments = [
    { id: 1, EmployeeID: 'E001', AssigneeName: 'Owner One', Department: 'DEPT A' },
    { id: 2, EmployeeID: 'E002', AssigneeName: 'Owner Two', Department: 'DEPT B' },
];
const permanent = [
    { id: 11, AssigneeID: 'E001', SubmitterName: 'Owner One', Department: 'DEPT A', SubmitDate: '2026-09-07', ReviewStatus: 'Completed', Rank: 'A', StopType: 1, FileUrl: '/assigned.pdf' },
    { id: 10, AssigneeID: 'E001', SubmitterName: 'Owner One', Department: 'DEPT A', SubmitDate: '2026-08-01', ReviewStatus: 'Completed', Rank: 'B', StopType: 2, FileUrl: '/history.pdf' },
    { id: 12, AssigneeID: 'E999', SubmitterName: 'Outside Owner', Department: 'DEPT C', SubmitDate: '2026-09-06', ReviewStatus: 'Approved', Rank: 'C', StopType: 3, FileUrl: '/outside.pdf' },
];

const context = vm.createContext({ Date, String, Number, Array, Set, Map, Math });
context.assignments = assignments;
context.permanent = permanent;
vm.runInContext(`
    const STOP_TYPES = [
        { id: 1, code: 'Stop 1' },
        { id: 2, code: 'Stop 2' },
        { id: 3, code: 'Stop 3' }
    ];
    let _assignments = assignments;
    let _permanentData = permanent;
    let _pFilterScope = 'assigned';
    let _pFilterDept = '';
    let _pFilterStatus = '';
    let _pFilterDue = '';
    let _pFilterRank = '';
    let _pFilterStop = 0;
    let _pSearch = '';
    ${extractFunction('normalizeText')}
    ${extractFunction('getPermanentStatusMeta')}
    ${extractFunction('getDueMeta')}
    ${extractFunction('getLatestPermanentForAssignment')}
    ${extractFunction('getAssignmentForPermanentSubmission')}
    ${extractFunction('buildPermanentTrackingRows')}
    ${extractFunction('getFilteredPermanent')}
    ${extractFunction('getPermanentProgressStats')}
    ${extractFunction('getPermanentDashboardStats')}
`, context);

assert.strictEqual(vm.runInContext("buildPermanentTrackingRows().filter(row => row.rowType === 'assigned').length", context), 2);
assert.strictEqual(vm.runInContext("buildPermanentTrackingRows().filter(row => row.rowType === 'assigned_history').length", context), 1);
assert.strictEqual(vm.runInContext("buildPermanentTrackingRows().filter(row => row.rowType === 'outside_assignment').length", context), 1);
assert.strictEqual(vm.runInContext('getFilteredPermanent().length', context), 3, 'Default table scope must exclude outside-Assignment documents');
assert.strictEqual(vm.runInContext("_pFilterScope='outside'; getFilteredPermanent().length", context), 1, 'Outside scope must expose only outside-Assignment documents');
assert.strictEqual(vm.runInContext("_pFilterScope='all'; getFilteredPermanent().length", context), 4, 'All scope must retain audit/history visibility');
assert.deepStrictEqual(JSON.parse(vm.runInContext('JSON.stringify(getPermanentProgressStats())', context)), {
    totalAssigned: 2,
    completedCount: 1,
    submitPct: 50,
});
assert.deepStrictEqual(JSON.parse(vm.runInContext('JSON.stringify(getPermanentDashboardStats().byRank)', context)), { A: 1, B: 0, C: 0 });
assert.strictEqual(vm.runInContext('getPermanentDashboardStats().submittedCount', context), 1, 'Dashboard must count only the latest submission for assigned owners');

assert.ok(source.includes("let _pFilterScope  = 'assigned';"), 'Assignment scope must be the default');
assert.ok(source.includes('พบเอกสารนอก Assignment ${outsideAssignmentCount} รายการ'), 'Outside-Assignment warning must remain visible');
assert.ok(source.includes('ไม่นำไปรวมใน KPI และความคืบหน้า Permanent'), 'Outside rows must explain KPI exclusion');
assert.ok(source.includes("{ label: 'ผู้ได้รับ Assignment', val: totalAssigned"), 'Hero total must use assigned owners');

console.log('CCCF Permanent Assignment scope regression passed.');
