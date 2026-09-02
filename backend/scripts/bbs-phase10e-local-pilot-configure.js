'use strict';

const assert = require('assert');
const app = require('../server');
const db = require('../db');

const INSPECTOR_ID = '002671';
const OPERATOR_ID = '012816';
const EXCLUDED_TEST_ID = '111111';
const DEPARTMENT_ID = 18;
const SAFETY_UNIT_ID = 2;
const DEPARTMENT_NAME = 'MAINTENANCE SEC.';
const SAFETY_UNIT_NAME = 'Tube Cutting';

function bangkokIsoDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

function assertLocalDatabase() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host),
        `Refusing to configure a non-local database host: ${host || '(blank)'}`);
}

async function call(base, path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(`${method} ${path} failed (${response.status}): ${payload.message || 'Unknown error'}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

async function employee(employeeId) {
    const [[row]] = await db.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                d.id DepartmentID,u.id SafetyUnitID,m.BBSLevel
           FROM Employees e
           LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
           LEFT JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit))
           LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
          WHERE e.EmployeeID=? LIMIT 1`,
        [employeeId]
    );
    return row || null;
}

async function main() {
    assertLocalDatabase();
    const today = bangkokIsoDate();
    const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
    const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
    assert.ok(adminId && adminPassword, 'Local Admin UAT credentials are required in backend/.env.');

    const [[gate]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='staged_admin_only' LIMIT 1");
    assert.strictEqual(String(gate?.SettingValue || ''), '1', 'staged_admin_only must remain 1 during Pilot configuration.');

    const [[scope]] = await db.query(
        `SELECT d.id DepartmentID,d.Name DepartmentName,u.id SafetyUnitID,u.name SafetyUnitName
           FROM Master_Departments d
           JOIN Master_SafetyUnits u ON u.department_id=d.id
          WHERE d.id=? AND u.id=? LIMIT 1`,
        [DEPARTMENT_ID, SAFETY_UNIT_ID]
    );
    assert.strictEqual(String(scope?.DepartmentName || '').trim(), DEPARTMENT_NAME);
    assert.strictEqual(String(scope?.SafetyUnitName || '').trim(), SAFETY_UNIT_NAME);

    const beforeInspector = await employee(INSPECTOR_ID);
    const beforeOperator = await employee(OPERATOR_ID);
    const excluded = await employee(EXCLUDED_TEST_ID);
    assert.ok(beforeInspector, `Inspector ${INSPECTOR_ID} was not found.`);
    assert.ok(beforeOperator, `Operator ${OPERATOR_ID} was not found.`);
    assert.ok(excluded, `Excluded test account ${EXCLUDED_TEST_ID} was not found.`);
    assert.strictEqual(beforeInspector.BBSLevel, 'Group Leader');
    assert.strictEqual(Number(beforeInspector.DepartmentID), DEPARTMENT_ID);
    assert.strictEqual(Number(beforeInspector.SafetyUnitID), SAFETY_UNIT_ID);
    assert.strictEqual(beforeOperator.BBSLevel, 'Operator');
    assert.strictEqual(Number(beforeOperator.DepartmentID), DEPARTMENT_ID);

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const changes = [];

    try {
        const login = await call(base, '/api/login', {
            method: 'POST', body: { employeeId: adminId, password: adminPassword }
        });
        assert.strictEqual(String(login.user?.role || '').toLowerCase(), 'admin');
        const token = login.token;

        if (String(beforeOperator.Unit || '').trim() !== SAFETY_UNIT_NAME) {
            await call(base, `/api/admin/employee/${encodeURIComponent(OPERATOR_ID)}`, {
                method: 'PUT', token, body: { Unit: SAFETY_UNIT_NAME }
            });
            changes.push('OPERATOR_UNIT_ASSIGNED');
        }

        const configuredOperator = await employee(OPERATOR_ID);
        assert.strictEqual(Number(configuredOperator.SafetyUnitID), SAFETY_UNIT_ID,
            'Operator Unit did not resolve to the approved Master Safety Unit.');

        const inspectorList = await call(base, '/api/bbs/admin/inspectors', { token });
        const overlapping = (inspectorList.data?.enrollments || []).filter(row =>
            String(row.InspectorEmployeeID) === INSPECTOR_ID
            && Number(row.IsActive) === 1
            && String(row.Status) === 'Active'
            && String(row.EffectiveFrom).slice(0, 10) <= today
            && (!row.EffectiveTo || String(row.EffectiveTo).slice(0, 10) >= today)
        );
        assert.ok(overlapping.length <= 1, 'Inspector has multiple effective Active enrollments.');

        let enrollmentId = Number(overlapping[0]?.id || 0);
        if (enrollmentId) {
            assert.strictEqual(Number(overlapping[0].DepartmentID), DEPARTMENT_ID);
            assert.strictEqual(Number(overlapping[0].SafetyUnitID), SAFETY_UNIT_ID);
            assert.strictEqual(Number(overlapping[0].KpiRequired), 1);
            assert.strictEqual(Number(overlapping[0].AllowSelfManage), 1);
        } else {
            const created = await call(base, '/api/bbs/admin/inspectors', {
                method: 'POST', token, body: {
                    inspectorEmployeeId: INSPECTOR_ID,
                    departmentId: DEPARTMENT_ID,
                    safetyUnitId: SAFETY_UNIT_ID,
                    status: 'Active',
                    kpiRequired: true,
                    allowSelfManage: true,
                    effectiveFrom: today,
                    effectiveTo: null,
                    reason: 'Phase 10E approved Local Pilot configuration'
                }
            });
            enrollmentId = Number(created.data?.id || 0);
            assert.ok(enrollmentId > 0, 'Inspector enrollment ID was not returned.');
            changes.push('INSPECTOR_ENROLLED');
        }

        const excludedEnrollment = (inspectorList.data?.enrollments || []).find(row =>
            String(row.InspectorEmployeeID) === EXCLUDED_TEST_ID && Number(row.IsActive) === 1
        );
        assert.ok(!excludedEnrollment, 'Excluded test account already has an Active inspector enrollment; manual review is required.');

        let team = await call(base, `/api/bbs/inspectors/${enrollmentId}/team?asOf=${today}`, { token });
        const existingMember = (team.data?.team || []).find(row => String(row.EmployeeID) === OPERATOR_ID);
        if (!existingMember) {
            await call(base, `/api/bbs/inspectors/${enrollmentId}/team`, {
                method: 'POST', token, body: {
                    memberEmployeeId: OPERATOR_ID,
                    effectiveFrom: today,
                    reason: 'Phase 10E approved Local Pilot team assignment'
                }
            });
            changes.push('OPERATOR_ASSIGNED_TO_TEAM');
        }

        team = await call(base, `/api/bbs/inspectors/${enrollmentId}/team?asOf=${today}`, { token });
        assert.ok((team.data?.team || []).some(row => String(row.EmployeeID) === OPERATOR_ID),
            'Operator is not visible in the effective inspector team.');
        assert.ok(!(team.data?.team || []).some(row => String(row.EmployeeID) === EXCLUDED_TEST_ID),
            'Excluded test account must not be in the Pilot team.');

        const month = Number(today.slice(5, 7));
        const year = Number(today.slice(0, 4));
        let schedule = await call(base, `/api/bbs/inspectors/${enrollmentId}/schedule?year=${year}&month=${month}`, { token });
        const activeRule = (schedule.data?.rules || []).find(row =>
            String(row.Status) === 'Active'
            && String(row.EffectiveFrom).slice(0, 10) <= today
            && (!row.EffectiveTo || String(row.EffectiveTo).slice(0, 10) >= today)
        );
        if (activeRule) {
            assert.strictEqual(String(activeRule.Weekdays), '1,2,3,4,5');
            assert.strictEqual(Number(activeRule.TargetCount), 1);
        } else {
            await call(base, `/api/bbs/admin/inspectors/${enrollmentId}/schedule`, {
                method: 'PUT', token, body: {
                    scheduleName: 'Phase 10E Pilot - Weekday Daily Inspection',
                    weekdays: [1, 2, 3, 4, 5],
                    targetCount: 1,
                    effectiveFrom: today,
                    effectiveTo: null,
                    reason: 'Business owner approved Monday-Friday target of one inspection per day'
                }
            });
            changes.push('INSPECTOR_SCHEDULE_CREATED');
        }

        schedule = await call(base, `/api/bbs/inspectors/${enrollmentId}/schedule?year=${year}&month=${month}`, { token });
        assert.ok((schedule.data?.rules || []).some(row =>
            String(row.Status) === 'Active'
            && String(row.Weekdays) === '1,2,3,4,5'
            && Number(row.TargetCount) === 1
        ), 'Approved weekday schedule was not found.');

        const [[gateAfter]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='staged_admin_only' LIMIT 1");
        assert.strictEqual(String(gateAfter?.SettingValue || ''), '1');

        console.log(JSON.stringify({
            phase: '10E', localOnly: true, rolloutChanged: false, stagedAdminOnly: true,
            asOf: today, inspectorEmployeeId: INSPECTOR_ID, operatorEmployeeId: OPERATOR_ID,
            excludedTestEmployeeId: EXCLUDED_TEST_ID, enrollmentId,
            schedule: { weekdays: [1, 2, 3, 4, 5], targetCount: 1 }, changes
        }, null, 2));
        console.log('BBS Phase 10E Local Pilot configuration: PASS');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

main()
    .then(() => db.end())
    .catch(async error => {
        console.error(`BBS Phase 10E Local Pilot configuration: FAIL - ${error.message}`);
        try { await db.end(); } catch (_) {}
        process.exitCode = 1;
    });

