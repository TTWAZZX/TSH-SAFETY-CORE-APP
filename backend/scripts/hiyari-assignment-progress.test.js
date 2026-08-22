const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'hiyari.js');
const source = fs.readFileSync(sourcePath, 'utf8');

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

const context = vm.createContext({ Date, Map, Set, Number, String, Array });
vm.runInContext(`
    let _statsYear = 2026;
    ${extractFunction('_getAssignmentPeriod')}
    ${extractFunction('_isReportInPeriod')}
    ${extractFunction('_normalizeEmployeeKey')}
    ${extractFunction('_buildAssignmentRoster')}
    ${extractFunction('_buildAssignmentProgress')}
`, context);

const assignments = [
    { EmployeeID: '000001', Department: 'PRODUCTION 1 SEC.' },
    { EmployeeID: '000002', Department: 'PRODUCTION 1 SEC.' },
    { EmployeeID: 'AP0001', Department: 'WAREHOUSE SEC.' },
];
const reports = [
    { ReporterID: '000001', ReportDate: '2026-01-15', Status: 'Closed' },
    { ReporterID: ' ap0001 ', ReportDate: '2026-06-20', Status: 'In Progress' },
    { ReporterID: '000002', ReportDate: '2025-12-31' },
];

context.assignments = assignments;
context.reports = reports;
const progress = vm.runInContext('_buildAssignmentProgress(assignments, reports, 2026)', context);

assert.strictEqual(progress.period.year, 2026, 'Assignment scope must use the selected year');
assert.strictEqual(progress.period.label, '2569', 'Assignment scope must show the Buddhist calendar year');
assert.strictEqual(progress.submittedIds.size, 2, 'Every assignee who submitted during the year must count once');
assert.strictEqual(progress.depts.find(row => row.dept === 'PRODUCTION 1 SEC.').submitted, 1);
assert.strictEqual(progress.depts.find(row => row.dept === 'WAREHOUSE SEC.').submitted, 1);

const roster = vm.runInContext('_buildAssignmentRoster(assignments, reports, 2026)', context);
assert.strictEqual(roster.find(row => row.EmployeeID === '000001').submissionStatus, 'ส่งแล้ว');
assert.strictEqual(roster.find(row => row.EmployeeID === '000001').followUpStatus, 'ปิดแล้ว');
assert.strictEqual(roster.find(row => row.EmployeeID === 'AP0001').followUpStatus, 'กำลังดำเนินการ');
assert.strictEqual(roster.find(row => row.EmployeeID === '000002').submissionStatus, 'ยังไม่ส่ง');
assert.strictEqual(roster.find(row => row.EmployeeID === '000002').followUpStatus, 'รอส่ง');
assert.ok(source.includes('ปี ${escHtml(progress.period.label)} · ส่งแล้ว'), 'Progress card must describe annual scope');
assert.ok(source.includes('รายงานเหตุการณ์เกือบเกิดอุบัติเหตุ'), 'Hiyari heading must use the requested Thai wording');
assert.ok(!source.includes('รายงานเหตุการณ์เฉียดอุบัติเหตุ'), 'Old Hiyari heading must be removed');
assert.ok(source.includes('data-hiyari-card-image="hiyari-assignment-list"'), 'The complete assignment panel must support right-click image export');
assert.ok(source.includes("if (name === 'hiyari-assignment-list')"), 'Only the assignment panel should opt into the shared tall-card exporter');
assert.ok(source.includes('await captureCardImage(card'), 'Assignment image export must use the deterministic shared exporter');
assert.ok(source.includes('const canvas = await html2canvas(card'), 'Existing Hiyari card image export must remain as the fallback');
assert.ok(source.includes('Assignment Submission Register'), 'PDF must include an assignment submission register');
assert.ok(source.includes('Page ${page} of ${totalPdfPages}'), 'PDF footer must reflect the appended assignment pages');
assert.ok(source.includes('for (const [i, el] of pages.entries())'), 'PDF export must render the original report and appended register pages');

console.log('Hiyari assignment regression passed: annual status, image export, and PDF roster remain linked.');
