'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');
const db = require('../db');
const dashboardRoute = require('../routes/dashboard');
const { contract, createDashboardMetric } = require('../utils/dashboard-metric-contract');
const { loadReadyTestUsers } = require('./ready-test-users');

const {
    buildPatrolCompanyProgress,
    buildHiyariCompanyProgress,
    buildKyCompanyProgress,
    buildYokotenCompanyProgress,
} = dashboardRoute.dashboardMetricBuilders;

const baseUrl = String(
    process.env.LOCAL_PHP_API_URL || 'http://localhost/tsh-safety-core/api/index.php?route='
);

async function fingerprint() {
    const [rows] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Employees) employees,
            (SELECT COUNT(*) FROM Patrol_Attendance) patrolAttendance,
            (SELECT COUNT(*) FROM HiyariReports) hiyari,
            (SELECT COUNT(*) FROM Hiyari_Assignments) hiyariAssignments,
            (SELECT COUNT(*) FROM KY_Activities) ky,
            (SELECT COUNT(*) FROM CCCF_FormA_Permanent) cccf,
            (SELECT COUNT(*) FROM YokotenResponses) yokoten,
            (SELECT COUNT(*) FROM Training_Dept_Records) training,
            (SELECT COUNT(*) FROM Accident_Reports) accident,
            (SELECT COUNT(*) FROM FourM_ChangeNotices) fourm,
            (SELECT COUNT(*) FROM Policy_Acknowledgements) policyAck,
            (SELECT COUNT(*) FROM Machine_Safety_Compliance) machineCompliance,
            (SELECT COUNT(*) FROM OJT_Records) ojt,
            (SELECT COUNT(*) FROM SC_Assessments) safetyCulture
    `);
    return rows[0];
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const before = await fingerprint();
    const { user } = await loadReadyTestUsers(db);
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const response = await fetch(`${baseUrl}dashboard/overview`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await response.text();
    assert.strictEqual(response.status, 200, text.slice(0, 500));
    const body = JSON.parse(text);
    const data = body.data;
    assert.ok(data?.moduleMetrics, 'PHP overview must return moduleMetrics');
    assert.deepStrictEqual(
        Object.keys(data.moduleMetrics),
        contract.modules.map(module => module.key),
        'PHP overview must return all contract modules in contract order'
    );

    for (const module of contract.modules) {
        const metric = data.moduleMetrics[module.key];
        for (const field of contract.requiredMetricFields) {
            assert.ok(Object.prototype.hasOwnProperty.call(metric, field), `${module.key}.${field} is required`);
        }
        assert.strictEqual(metric.metricType, module.metricType, `${module.key}: metric type`);
        assert.strictEqual(metric.dataAvailable, true, `${module.key}: ${metric.statusReason}`);
        assert.ok(contract.statuses.includes(metric.status), `${module.key}: valid status`);
        if (metric.percent !== null) {
            assert.ok(metric.percent >= 0 && metric.percent <= 100, `${module.key}: percentage range`);
        }
        if (module.metricType !== 'progress') {
            assert.strictEqual(metric.percent, null, `${module.key}: no synthetic percentage`);
        }
    }

    assert.strictEqual(data.patrol.rate, data.moduleMetrics.patrol.percent);
    assert.strictEqual(data.hiyari.closureRate, data.moduleMetrics.hiyari.percent);
    assert.strictEqual(data.hiyari.assignmentClosed, data.moduleMetrics.hiyari.numerator);
    assert.strictEqual(data.hiyari.assignmentTarget, data.moduleMetrics.hiyari.denominator);
    assert.strictEqual(data.cccf.permPct, data.moduleMetrics.cccf.percent);
    assert.strictEqual(data.yokoten.pct, data.moduleMetrics.yokoten.percent);
    assert.strictEqual(data.training.passRate, data.moduleMetrics.training.percent);
    assert.strictEqual(data.fourm.closureRate, data.moduleMetrics.fourm.percent);
    assert.strictEqual(data.policy.pct, data.moduleMetrics.policy.percent);
    assert.strictEqual(data.machineSafety.pct, data.moduleMetrics['machine-safety'].percent);
    assert.strictEqual(data.ojt.pct, data.moduleMetrics.ojt.percent);
    assert.strictEqual(data.safetyCulture.pct, data.moduleMetrics['safety-culture'].percent);

    const [nodePatrolState, nodeHiyariState, nodeKyState, nodeYokotenState] = await Promise.all([
        buildPatrolCompanyProgress(data.year),
        buildHiyariCompanyProgress(data.year),
        buildKyCompanyProgress(data.year),
        buildYokotenCompanyProgress(data.year),
    ]);
    for (const [key, state] of [
        ['patrol', nodePatrolState],
        ['hiyari', nodeHiyariState],
        ['ky', nodeKyState],
        ['yokoten', nodeYokotenState],
    ]) {
        assert.strictEqual(state.available, true, `${key}: Node source unavailable`);
        const nodeMetric = createDashboardMetric(key, {
            numerator: state.numerator,
            denominator: state.denominator,
        });
        const phpMetric = data.moduleMetrics[key];
        assert.strictEqual(phpMetric.numerator, nodeMetric.numerator, `${key}: Node/PHP numerator parity`);
        assert.strictEqual(phpMetric.denominator, nodeMetric.denominator, `${key}: Node/PHP denominator parity`);
        assert.strictEqual(phpMetric.percent, nodeMetric.percent, `${key}: Node/PHP percentage parity`);
        assert.strictEqual(phpMetric.status, nodeMetric.status, `${key}: Node/PHP status parity`);
    }

    const after = await fingerprint();
    assert.deepStrictEqual(after, before, 'Authenticated PHP overview test must not change source row counts');
    console.log(`PASS PHP Dashboard overview contract (${contract.modules.length} modules), live Node/PHP source parity, database fingerprint unchanged`);
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
