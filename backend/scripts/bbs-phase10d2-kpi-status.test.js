'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { kpiStatus, computeCompliance } = require('../services/bbs-inspector-schedule');

const root = path.resolve(__dirname, '..', '..');
const fixtures = [
    { configured:false },
    { configured:true, applicable:false },
    { configured:true, applicable:true, scheduledDays:5, upcomingDays:5 },
    { configured:true, applicable:true, numerator:0, denominator:5, scheduledDays:5 },
    { configured:true, applicable:true, numerator:4, denominator:5, scheduledDays:5 },
];
const nodeStatuses = fixtures.map(kpiStatus);
assert.deepStrictEqual(nodeStatuses.map(row => row.code), ['NOT_CONFIGURED','N_A','NOT_INSPECTED','ZERO_PERCENT','PERCENT']);
assert.deepStrictEqual(nodeStatuses.map(row => row.percentage), [null,null,null,0,80]);

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const result = spawnSync(php, [path.join(root, 'api', 'tests', 'bbs_kpi_status_fixture_runner.php')], { input:JSON.stringify({ statuses:fixtures }), encoding:'utf8' });
assert.strictEqual(result.status, 0, result.stderr);
assert.deepStrictEqual(JSON.parse(result.stdout), nodeStatuses, 'Node/PHP KPI semantic status mismatch');

const compliance = computeCompliance({
    enrollments:[{ EnrollmentID:1, InspectorEmployeeID:'GL001', EnrollmentFrom:'2026-09-01', TargetCount:1, Weekdays:'1,2,3,4,5' }],
    rules:[], overrides:[], actualRows:[], range:{ start:'2026-09-01', end:'2026-09-08' }, today:'2026-09-01'
});
assert.strictEqual(compliance.people[0].kpiStatus.code, 'ZERO_PERCENT');
assert.strictEqual(compliance.people[0].percentage, 0);
assert.strictEqual(compliance.summary.kpiStatus.code, 'ZERO_PERCENT');
const future = computeCompliance({
    enrollments:[{ EnrollmentID:2, InspectorEmployeeID:'GL002', EnrollmentFrom:'2026-09-02', TargetCount:1, Weekdays:'1,2,3,4,5' }],
    rules:[], overrides:[], actualRows:[], range:{ start:'2026-09-01', end:'2026-09-08' }, today:'2026-09-01'
});
assert.strictEqual(future.people[0].kpiStatus.code, 'NOT_INSPECTED');
assert.strictEqual(future.people[0].percentage, null);

const sources = {
    nodeObservation:fs.readFileSync(path.join(root,'backend','routes','bbs-observations.js'),'utf8'),
    phpObservation:fs.readFileSync(path.join(root,'api','handlers','bbs_observations.php'),'utf8'),
    nodeAnalytics:fs.readFileSync(path.join(root,'backend','routes','bbs-analytics.js'),'utf8'),
    phpAnalytics:fs.readFileSync(path.join(root,'api','handlers','bbs_analytics.php'),'utf8'),
    ui:fs.readFileSync(path.join(root,'public','js','pages','bbs-smart-card.js'),'utf8'),
    main:fs.readFileSync(path.join(root,'public','js','main.js'),'utf8'),
    html:fs.readFileSync(path.join(root,'index.html'),'utf8'),
};
for (const source of [sources.nodeObservation,sources.phpObservation,sources.nodeAnalytics,sources.phpAnalytics]) {
    for (const marker of ['kpiStatus','percentage']) assert.ok(source.includes(marker), `KPI API projection missing ${marker}`);
}
for (const marker of ['function kpiSemantic(','function kpiStatusBadge(','N_A','NOT_CONFIGURED','NOT_INSPECTED','ZERO_PERCENT','KPI status code','ตารางสถานะ KPI ผู้ตรวจ']) assert.ok(sources.ui.includes(marker), `KPI clarity UI/export missing ${marker}`);
assert.match(sources.ui, /tabindex="0" role="region" aria-label="ตารางสถานะ KPI ผู้ตรวจ"/);
assert.match(sources.main, /bbs-smart-card\.js\?v=20260901-bbs-phase10d[2-5]/);
assert.match(sources.html, /main\.js\?v=(?:20260901-bbs-phase10d[2-5]|20260902-bbs-auto-reference-r1)/);

console.log('BBS Phase 10D-2 KPI Status Clarity Node/PHP/UI/export: PASS');
