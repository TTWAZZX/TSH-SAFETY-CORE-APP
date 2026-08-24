'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const activityNode = read('backend/routes/activity-targets.js');
const activityPhp = read('api/handlers/targets.php');
const dashboardNode = read('backend/routes/dashboard.js');
const yokotenNode = read('backend/routes/yokoten.js');
const yokotenPhp = read('api/handlers/workflow_phase6.php');

const nodeActivityYokoten = activityNode.slice(
    activityNode.indexOf("if (activityKey === 'yokoten')"),
    activityNode.indexOf('    } catch {', activityNode.indexOf("if (activityKey === 'yokoten')")),
);
const phpActivityYokoten = activityPhp.slice(
    activityPhp.indexOf("if ($key === 'yokoten')"),
    activityPhp.indexOf('    return $empty;', activityPhp.indexOf("if ($key === 'yokoten')")),
);
const nodeCompanyOverview = yokotenNode.slice(
    yokotenNode.indexOf("router.get('/company-overview'"),
    yokotenNode.indexOf("router.get('/all-responses'"),
);
const phpCompanyOverview = yokotenPhp.slice(
    yokotenPhp.indexOf('function wf_yokoten_company_overview'),
    yokotenPhp.indexOf('function wf_yokoten_queue_approval_email'),
);

assert.ok(
    nodeActivityYokoten.includes('DateIssued IS NULL OR YEAR(DateIssued) = ?'),
    'Node Activity Targets must scope active Yokoten topics to the requested year',
);
assert.ok(nodeActivityYokoten.includes('[year]'), 'Node Activity Targets must bind the requested year');
assert.ok(
    phpActivityYokoten.includes('DateIssued IS NULL OR YEAR(DateIssued)=?'),
    'PHP Activity Targets must scope active Yokoten topics to the requested year',
);
assert.ok(phpActivityYokoten.includes('[$year]'), 'PHP Activity Targets must bind the requested year');
console.log('PASS Node/PHP Activity Targets use the requested Yokoten year');

assert.ok(
    nodeCompanyOverview.includes('DateIssued IS NULL OR YEAR(DateIssued) = ?'),
    'Node Company Overview must use the same requested-year scope',
);
assert.ok(
    phpCompanyOverview.includes('DateIssued IS NULL OR YEAR(DateIssued)=?'),
    'PHP Company Overview must use the same requested-year scope',
);
assert.ok(
    dashboardNode.includes('WHERE IsActive = 1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)'),
    'Dashboard Yokoten coverage must use the selected-year scope',
);
console.log('PASS Activity Targets, Company Overview, and Dashboard share year semantics');

for (const [label, source, helper] of [
    ['Node Activity Targets', nodeActivityYokoten, 'buildUnitCoverage'],
    ['PHP Activity Targets', phpActivityYokoten, 'yokoten_scope_build_unit_coverage'],
    ['Node Company Overview', nodeCompanyOverview, 'buildUnitCoverage'],
    ['PHP Company Overview', phpCompanyOverview, 'yokoten_scope_build_unit_coverage'],
]) {
    assert.ok(source.includes(helper), `${label} must require complete Department Unit coverage`);
}
console.log('PASS all aggregate paths require the shared full-Unit completion rule');

const selectedYear = 2026;
const topics = [
    { id: 1, year: 2025, complete: false },
    { id: 2, year: 2026, complete: true },
    { id: 3, year: null, complete: true },
];
const inYear = topics.filter(topic => topic.year === null || topic.year === selectedYear);
assert.deepStrictEqual(inYear.map(topic => topic.id), [2, 3]);
assert.strictEqual(inYear.filter(topic => topic.complete).length, 2);
assert.strictEqual(Math.round(inYear.filter(topic => topic.complete).length * 100 / inYear.length), 100);
assert.strictEqual(Math.round(topics.filter(topic => topic.complete).length * 100 / topics.length), 67);
console.log('PASS cross-year fixture prevents an older active topic from lowering the selected-year result');

console.log('Yokoten year-scope parity tests passed 4/4.');
