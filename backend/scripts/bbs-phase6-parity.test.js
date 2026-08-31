'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const rules = require('../services/bbs-analytics');

const fixture = {
    year:2026,
    month:8,
    today:'2026-08-25',
    risks:['critical', 'HIGH', 'Medium', 'x'],
    percentages:[[1, 3], [0, 0], [87, 100]],
    weekdays:'1,2,3,4,5',
    ages:[0, 3, 4, 7, 8, 14, 15, 40]
};
const range = rules.periodRange(fixture.year, fixture.month, fixture.today);
const js = {
    risks:fixture.risks.map(rules.normalizeRisk),
    percentages:fixture.percentages.map(([a, b]) => rules.percent(a, b)),
    range,
    dates:rules.requiredDates(range.start, range.end, range.through, fixture.weekdays),
    aging:fixture.ages.map(rules.agingBucket)
};
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const result = spawnSync(php, [path.join(__dirname, '..', '..', 'api', 'tests', 'bbs_analytics_fixture_runner.php')], {
    input:JSON.stringify(fixture),
    encoding:'utf8'
});
assert.strictEqual(result.status, 0, result.stderr);
assert.deepStrictEqual(JSON.parse(result.stdout), js, 'Node/PHP analytics formula parity mismatch');

const kpi = rules.computeKpi(
    [{ EmployeeID:'GL1', EmployeeName:'Leader', TargetCount:1, Weekdays:'1,2,3,4,5' }],
    [{ ObserverEmployeeID:'GL1', ObservationDate:'2026-08-03', ActualCount:2 }],
    { start:'2026-08-03', end:'2026-08-05', through:'2026-08-04' }
);
assert.deepStrictEqual(
    { n:kpi.numerator, d:kpi.denominator, p:kpi.percentage },
    { n:1, d:2, p:50 },
    'daily KPI must cap actual at target'
);
console.log('BBS Phase 6 Node/PHP period, percentage, risk and aging parity: PASS');
