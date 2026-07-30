'use strict';

const assert = require('assert');
const db = require('../db');
const dashboardRoute = require('../routes/dashboard');
const { createDashboardMetric } = require('../utils/dashboard-metric-contract');

const {
    buildPatrolCompanyProgress,
    buildHiyariCompanyProgress,
    buildKyCompanyProgress,
    buildYokotenCompanyProgress,
    dashboardRowState,
} = dashboardRoute.dashboardMetricBuilders;

const year = new Date().getFullYear();

async function fingerprint() {
    const [rows] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Employees) employees,
            (SELECT COUNT(*) FROM Patrol_Roster) patrolRoster,
            (SELECT COUNT(*) FROM Patrol_Attendance) patrolAttendance,
            (SELECT COUNT(*) FROM Patrol_Self_Checkin) patrolSelfCheckin,
            (SELECT COUNT(*) FROM Hiyari_Assignments) hiyariAssignments,
            (SELECT COUNT(*) FROM HiyariReports) hiyariReports,
            (SELECT COUNT(*) FROM KY_Program_Config) kyConfig,
            (SELECT COUNT(*) FROM KY_Activities) kyActivities,
            (SELECT COUNT(*) FROM YokotenTopics) yokotenTopics,
            (SELECT COUNT(*) FROM YokotenResponses) yokotenResponses,
            (SELECT COUNT(*) FROM Machine_Safety_Compliance) machineCompliance,
            (SELECT COUNT(*) FROM OJT_Records) ojtRecords,
            (SELECT COUNT(*) FROM SC_Assessments) safetyCultureAssessments
    `);
    return rows[0];
}

function assertEvaluableMetric(metric) {
    assert.strictEqual(metric.dataAvailable, true, `${metric.key}: source must be available`);
    if (metric.denominator > 0) {
        assert.ok(metric.percent >= 0 && metric.percent <= 100, `${metric.key}: percent range`);
        assert.ok(['ON_TRACK', 'WATCH', 'CRITICAL'].includes(metric.status), `${metric.key}: evaluable status`);
    } else {
        assert.strictEqual(metric.percent, null, `${metric.key}: zero denominator has no percentage`);
        assert.strictEqual(metric.status, 'N_A', `${metric.key}: zero denominator is N_A`);
    }
}

async function main() {
    const before = await fingerprint();
    const [patrol, hiyari, ky, yokoten, machine, ojt, safetyCulture] = await Promise.all([
        buildPatrolCompanyProgress(year),
        buildHiyariCompanyProgress(year),
        buildKyCompanyProgress(year),
        buildYokotenCompanyProgress(year),
        dashboardRowState(`
            SELECT COALESCE(SUM(c.Status='pass'),0) numerator,
                   COALESCE(SUM(c.Status<>'na'),0) denominator
              FROM Machine_Safety m
              JOIN Machine_Safety_Compliance c ON c.MachineID=m.id
             WHERE m.Status IS NULL OR m.Status<>'inactive'
        `),
        dashboardRowState(`
            SELECT COALESCE(SUM(LEAST(GREATEST(COALESCE(AttendeeCount,0),0),
                                          GREATEST(COALESCE(YearlyTarget,0),0))),0) numerator,
                   COALESCE(SUM(GREATEST(COALESCE(YearlyTarget,0),0)),0) denominator
              FROM OJT_Records
             WHERE YEAR(OJTDate)=?
        `, [year]),
        dashboardRowState(`
            SELECT COALESCE(SUM(COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+
                                COALESCE(T3_Score,0)+COALESCE(T4_Score,0)+
                                COALESCE(T5_Score,0)+COALESCE(T7_Score,0)),0) numerator,
                   COALESCE(SUM((T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+
                                (T3_Score IS NOT NULL)+(T4_Score IS NOT NULL)+
                                (T5_Score IS NOT NULL)+(T7_Score IS NOT NULL)),0)*100 denominator
              FROM SC_Assessments
             WHERE AssessmentYear=?
        `, [year]),
    ]);

    assert.strictEqual(patrol.available, true, patrol.error);
    assert.strictEqual(hiyari.available, true, hiyari.error);
    assert.ok(hiyari.numerator <= hiyari.denominator, 'Hiyari closed assignments cannot exceed Admin assignments');
    assert.strictEqual(ky.available, true, ky.error);
    assert.strictEqual(yokoten.available, true, yokoten.error);
    assert.deepStrictEqual(yokoten.unknownDepartments, [], 'Yokoten target Departments must resolve to master data');
    assert.strictEqual(machine.available, true, machine.error);
    assert.strictEqual(ojt.available, true, ojt.error);
    assert.strictEqual(safetyCulture.available, true, safetyCulture.error);

    const metrics = [
        createDashboardMetric('patrol', { numerator: patrol.numerator, denominator: patrol.denominator }),
        createDashboardMetric('hiyari', { numerator: hiyari.numerator, denominator: hiyari.denominator }),
        createDashboardMetric('ky', { numerator: ky.numerator, denominator: ky.denominator }),
        createDashboardMetric('yokoten', { numerator: yokoten.numerator, denominator: yokoten.denominator }),
        createDashboardMetric('machine-safety', {
            numerator: machine.row.numerator,
            denominator: machine.row.denominator,
        }),
        createDashboardMetric('ojt', {
            numerator: ojt.row.numerator,
            denominator: ojt.row.denominator,
        }),
        createDashboardMetric('safety-culture', {
            numerator: safetyCulture.row.numerator,
            denominator: safetyCulture.row.denominator,
        }),
    ];
    metrics.forEach(assertEvaluableMetric);

    const after = await fingerprint();
    assert.deepStrictEqual(after, before, 'D2 read-only integration test must not change source row counts');

    console.table(metrics.map(metric => ({
        module: metric.key,
        numerator: metric.numerator,
        denominator: metric.denominator,
        percent: metric.percent,
        status: metric.status,
    })));
    console.log('PASS Dashboard Module Health D2 read-only source integration; database fingerprint unchanged');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
