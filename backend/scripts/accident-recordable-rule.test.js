'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/accident.js');
const phpRoute = read('api/handlers/operational_phase5.php');
const frontend = read('public/js/pages/accident.js');
const nodeDashboard = read('backend/routes/dashboard.js');
const phpDashboard = read('api/index.php');

const nodeCondition = nodeRoute.match(/const STATS_ACCIDENT_CONDITION = `([\s\S]*?)`;/)?.[1] || '';
assert.ok(nodeCondition.includes('IsRecordable = 1'), 'Node counted-stat condition must require the explicit Recordable flag');
assert.ok(nodeCondition.includes("AccidentType NOT IN ('Near Miss', 'First Aid')"), 'Node condition must exclude Near Miss and First Aid');
for (const inferred of ['LostDays', 'Severity', 'Medical Treatment', 'Lost Time', 'Fatal']) {
    assert.ok(!nodeCondition.includes(inferred), `Node condition must not infer Recordable from ${inferred}`);
}

const phpCondition = phpRoute.match(/\$statCond = "([^"]+)";/)?.[1] || '';
assert.strictEqual(phpCondition, "IsRecordable=1 AND AccidentType NOT IN ('Near Miss','First Aid')", 'PHP and Node must use the same explicit Recordable rule');

const frontendCondition = frontend.match(/function _accIsCountedStatReport\(r\) \{([\s\S]*?)\n\}/)?.[1] || '';
assert.ok(frontendCondition.includes('Number(r?.IsRecordable) === 1'), 'UI counted badge/filter must require IsRecordable');
assert.ok(!frontendCondition.includes('LostDays'), 'UI must not infer counted status from lost days');
assert.ok(!frontendCondition.includes("['Medical Treatment', 'Lost Time', 'Fatal'].includes"), 'UI must not infer counted status from accident type');
assert.ok(frontend.includes("if (_filter.quick === 'recordable') return _accIsCountedStatReport(r);"), 'Legacy Recordable filter must use the official counted projection');

for (const contract of [
    'SUM((' + '${STATS_ACCIDENT_CONDITION}' + ") AND AccidentType = 'Lost Time')",
    'SUM(CASE WHEN ${STATS_ACCIDENT_CONDITION} THEN LostDays ELSE 0 END)',
]) assert.ok(nodeRoute.includes(contract), `Node performance projection is missing: ${contract}`);

for (const contract of [
    "SUM(($statCond) AND AccidentType='Lost Time')",
    'SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END)',
]) assert.ok(phpRoute.includes(contract), `PHP performance projection is missing: ${contract}`);

assert.ok(nodeRoute.includes('const effectiveLastAccidentDate = lastStat?.AccidentDate || null;'), 'Node must not revive a stale manual last-accident date');
assert.ok(phpRoute.includes("$effectiveLast = $lastStat['AccidentDate'] ?? null;"), 'PHP must not revive a stale manual last-accident date');

for (const dashboard of [nodeDashboard, phpDashboard]) {
    assert.ok(dashboard.includes("IsRecordable=1"), 'Dashboard must use the explicit Recordable flag');
    assert.ok(dashboard.includes("AccidentType NOT IN ('Near Miss','First Aid')"), 'Dashboard must exclude invalid Recordable types');
}

for (const contract of [
    "['Near Miss', 'First Aid'].includes(type) && isRecordable",
    'recordable.disabled = isNear || isFirstAid',
    'เคสยังถูกเก็บในทะเบียนพร้อม Lost Days ตามจริง แต่จะไม่ถูกนำไปคำนวณสถิติ Recordable',
    'Recordable · นับ KPI',
    'Non-recordable · ไม่นับ KPI',
]) assert.ok(frontend.includes(contract), `Accident UI contract is missing: ${contract}`);

assert.ok(nodeRoute.includes('EXCLUDED_STATS_TYPES.includes(type) && isRecordable'), 'Node must reject Recordable Near Miss/First Aid payloads');
assert.ok(phpRoute.includes("in_array($type, ['Near Miss', 'First Aid'], true) && $recordable"), 'PHP must reject Recordable Near Miss/First Aid payloads');

const counted = row => Number(row.IsRecordable) === 1 && !['Near Miss', 'First Aid'].includes(row.AccidentType);
const cases = [
    [{ AccidentType: 'Lost Time', LostDays: 3, Severity: 'Moderate', IsRecordable: 0 }, false],
    [{ AccidentType: 'Lost Time', LostDays: 3, Severity: 'Moderate', IsRecordable: 1 }, true],
    [{ AccidentType: 'Medical Treatment', LostDays: 0, Severity: 'Critical', IsRecordable: 0 }, false],
    [{ AccidentType: 'Medical Treatment', LostDays: 0, Severity: 'Critical', IsRecordable: 1 }, true],
    [{ AccidentType: 'First Aid', LostDays: 0, Severity: 'Minor', IsRecordable: 1 }, false],
    [{ AccidentType: 'Near Miss', LostDays: 0, Severity: 'Critical', IsRecordable: 1 }, false],
    [{ AccidentType: 'Fatal', LostDays: 0, Severity: 'Critical', IsRecordable: 1 }, true],
];
for (const [row, expected] of cases) assert.strictEqual(counted(row), expected, JSON.stringify(row));

console.log(`Accident Recordable contract passed: ${cases.length} classification scenarios, Node/PHP/API/UI parity.`);
