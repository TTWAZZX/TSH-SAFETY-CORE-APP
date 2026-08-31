'use strict';

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });

const nodeBase = String(process.env.LOCAL_NODE_UAT_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const phpBase = String(process.env.LOCAL_PHP_UAT_URL || 'http://127.0.0.1:8099/api/index.php?route=').replace(/\/+$/, '');
const marker = `UAT-BBS9-${Date.now()}`;
const assignmentIds = [];
const onboardingSnapshots = new Map();
let db;
let enrollmentId = 0;
let auditBaseline = 0;
let originalFeatureFlag = '1';
let originalScheduleFlag = '1';

const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'
}).format(new Date());

const tokenFor = row => jwt.sign({
    id:row.EmployeeID,
    name:row.EmployeeName,
    role:row.Role,
    department:row.Department,
    unit:row.Unit,
    position:row.Position
}, process.env.JWT_SECRET, { expiresIn:'30m' });

async function prepareOnboardingFixture(employeeId) {
    if (onboardingSnapshots.has(employeeId)) return;
    const [[row]] = await db.query(
        'SELECT Password,MustChangePassword,Unit FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    assert.ok(row, `Onboarding fixture ${employeeId} unavailable`);
    onboardingSnapshots.set(employeeId, row);
    let unit = row.Unit;
    const [[department]] = await db.query(
        `SELECT d.id FROM Employees e
          JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
         WHERE e.EmployeeID=? LIMIT 1`,
        [employeeId]
    );
    if (department) {
        const [[valid]] = await db.query(
            'SELECT id FROM Master_SafetyUnits WHERE department_id=? AND LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1',
            [department.id, unit || '']
        );
        if (!valid) {
            const [[fallback]] = await db.query(
                'SELECT name FROM Master_SafetyUnits WHERE department_id=? ORDER BY sort_order,id LIMIT 1',
                [department.id]
            );
            if (fallback) unit = fallback.name;
        }
    }
    await db.query(
        'UPDATE Employees SET Password=?,MustChangePassword=0,Unit=? WHERE EmployeeID=?',
        [row.Password || bcrypt.hashSync(`${marker}-${employeeId}`, 4), unit, employeeId]
    );
}

async function call(stack, route, { method='GET', token, body } = {}) {
    const url = stack === 'node'
        ? `${nodeBase}/api/bbs${route}`
        : `${phpBase}bbs${route.includes('?') ? route.replace('?', '&') : route}`;
    const headers = { Accept:'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const response = await fetch(url, { method, headers, body:payload });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); }
    catch { throw new Error(`${stack} ${route} ${response.status}: ${text.slice(0, 300)}`); }
    return { status:response.status, json };
}

async function main() {
    db = await mysql.createConnection({
        host:process.env.DB_HOST,
        user:process.env.DB_USER,
        password:process.env.DB_PASS,
        database:process.env.DB_NAME,
        port:Number(process.env.DB_PORT || 3306)
    });
    const [[flag]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='inspector_team_management_enabled'");
    originalFeatureFlag = String(flag?.SettingValue || '0');
    await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='inspector_team_management_enabled'");
    const [[scheduleFlag]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='inspector_schedule_enabled'");
    originalScheduleFlag = String(scheduleFlag?.SettingValue || '0');
    await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='inspector_schedule_enabled'");

    const [[admin]] = await db.query(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin' LIMIT 1",
        [process.env.PROD_UAT_ADMIN_ID]
    );
    assert.ok(admin, 'Admin fixture unavailable');

    const [leaders] = await db.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                d.id DepartmentID,u.id SafetyUnitID
           FROM Employees e
           JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 AND m.BBSLevel='Group Leader'
           JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
           JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit))
          WHERE LOWER(e.Role)<>'admin'
            AND NOT EXISTS(SELECT 1 FROM BBS_Inspector_Enrollments x WHERE x.InspectorEmployeeID=e.EmployeeID AND x.IsActive=1)
          ORDER BY e.EmployeeID`
    );
    let leader;
    let operators = [];
    for (const candidate of leaders) {
        const [rows] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role
               FROM Employees e
               JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
               JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 AND m.BBSLevel='Operator'
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?)) AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))
                AND NOT EXISTS(SELECT 1 FROM BBS_Hierarchy_Assignments h WHERE h.MemberEmployeeID=e.EmployeeID AND h.IsActive=1)
              ORDER BY e.EmployeeID LIMIT 2`,
            [candidate.Department, candidate.Unit]
        );
        if (rows.length) { leader = candidate; operators = rows; break; }
    }
    assert.ok(leader && operators.length, 'No safe Group Leader/Operator fixture in one Unit');
    await prepareOnboardingFixture(admin.EmployeeID);
    await prepareOnboardingFixture(leader.EmployeeID);
    await prepareOnboardingFixture(operators[0].EmployeeID);

    const adminToken = tokenFor(admin);
    const leaderToken = tokenFor(leader);
    const operatorToken = tokenFor(operators[0]);
    const [[audit]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');
    auditBaseline = Number(audit.id);
    const asOf = today();
    const enrollmentBody = {
        inspectorEmployeeId:leader.EmployeeID,
        departmentId:leader.DepartmentID,
        safetyUnitId:leader.SafetyUnitID,
        status:'Active',
        kpiRequired:true,
        allowSelfManage:true,
        effectiveFrom:asOf,
        effectiveTo:null,
        reason:marker
    };

    let response = await call('node', '/admin/inspectors', {
        method:'POST', token:adminToken, body:enrollmentBody
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    enrollmentId = Number(response.json.data.id);

    for (const stack of ['node', 'php']) {
        response = await call(stack, '/inspectors/me', { token:leaderToken });
        assert.strictEqual(response.status, 200, `${stack}: ${JSON.stringify(response.json)}`);
        assert.strictEqual(Number(response.json.data.enrollment.id), enrollmentId);
        assert.strictEqual(response.json.data.canSelfManage, true, `${stack}: ${JSON.stringify(response.json.data.enrollment)}`);
    }

    response = await call('php', `/inspectors/${enrollmentId}/team`, {
        method:'POST', token:leaderToken,
        body:{ memberEmployeeId:operators[0].EmployeeID, effectiveFrom:asOf, reason:marker }
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    assignmentIds.push(Number(response.json.data.assignmentId));

    response = await call('node', `/inspectors/${enrollmentId}/team`, {
        method:'POST', token:leaderToken,
        body:{ memberEmployeeId:operators[0].EmployeeID, effectiveFrom:asOf, reason:marker }
    });
    assert.strictEqual(response.status, 409);
    assert.strictEqual(response.json.code, 'MEMBER_ALREADY_ASSIGNED');

    for (const stack of ['node', 'php']) {
        response = await call(stack, `/inspectors/${enrollmentId}/team`, { token:adminToken });
        assert.strictEqual(response.status, 200, `${stack}: ${JSON.stringify(response.json)}`);
        assert.ok(response.json.data.team.some(row => String(row.EmployeeID) === String(operators[0].EmployeeID)));
    }

    response = await call('php', `/admin/inspectors/${enrollmentId}`, {
        method:'PUT', token:adminToken, body:{ ...enrollmentBody, rowVersion:1, allowSelfManage:false, isActive:true }
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    response = await call('node', `/inspectors/${enrollmentId}/team/${assignmentIds[0]}`, {
        method:'DELETE', token:leaderToken
    });
    assert.strictEqual(response.status, 403, 'Locked self-service must deny mutation');

    response = await call('node', `/admin/inspectors/${enrollmentId}`, {
        method:'PUT', token:adminToken, body:{ ...enrollmentBody, rowVersion:2, isActive:true }
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    response = await call('php', `/inspectors/${enrollmentId}/team/${assignmentIds[0]}`, {
        method:'DELETE', token:leaderToken
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));

    for (const stack of ['node', 'php']) {
        response = await call(stack, '/workspace', { token:leaderToken });
        assert.strictEqual(response.status, 200, `${stack}: ${JSON.stringify(response.json)}`);
        assert.strictEqual(response.json.data.kpi.enrolled, true);
        assert.ok(Number(response.json.data.kpi.denominator) >= 1);
    }

    const weekday = Number(new Date(`${asOf}T00:00:00Z`).getUTCDay()) || 7;
    response = await call('node', `/admin/inspectors/${enrollmentId}/schedule`, {
        method:'PUT', token:adminToken,
        body:{ scheduleName:marker, weekdays:[weekday], targetCount:2, effectiveFrom:asOf, effectiveTo:null, reason:marker }
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    response = await call('php', `/admin/inspectors/${enrollmentId}/schedule-overrides/${asOf}`, {
        method:'PUT', token:adminToken,
        body:{ overrideType:'Required', targetCount:3, reason:marker }
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    for (const stack of ['node', 'php']) {
        response = await call(stack, `/inspectors/${enrollmentId}/schedule?year=${asOf.slice(0,4)}&month=${Number(asOf.slice(5,7))}`, { token:leaderToken });
        assert.strictEqual(response.status, 200, `${stack}: ${JSON.stringify(response.json)}`);
        const day=response.json.data.compliance.people[0].days.find(row=>row.date===asOf);
        assert.strictEqual(Number(day.target),3, `${stack}: schedule override target`);
        response = await call(stack, `/inspectors/${enrollmentId}/schedule?year=${asOf.slice(0,4)}&month=${Number(asOf.slice(5,7))}`, { token:operatorToken });
        assert.strictEqual(response.status, 403, `${stack}: other employee schedule must remain private`);
    }
    await db.query("UPDATE BBS_Settings SET SettingValue='0' WHERE SettingKey='inspector_schedule_enabled'");
    for (const stack of ['node', 'php']) {
        response = await call(stack, `/inspectors/compliance?year=${asOf.slice(0,4)}&month=${Number(asOf.slice(5,7))}`, { token:adminToken });
        assert.strictEqual(response.status, 503, `${stack}: schedule rollback flag must block schedule API`);
    }
    await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='inspector_schedule_enabled'");

    await db.query("UPDATE BBS_Settings SET SettingValue='0' WHERE SettingKey='inspector_team_management_enabled'");
    for (const stack of ['node', 'php']) {
        response = await call(stack, `/inspectors/${enrollmentId}/team`, { token:adminToken });
        assert.strictEqual(response.status, 503, `${stack} rollback flag must block team API`);
        assert.strictEqual(response.json.code, 'BBS_INSPECTOR_FEATURE_DISABLED');
    }
    await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='inspector_team_management_enabled'");

    console.log('BBS Phase 9/9B Node/PHP appointment, team, schedule version, override, privacy, KPI and rollback flag UAT: PASS');
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (!db) return;
    try {
        await db.query(
            "UPDATE BBS_Settings SET SettingValue=? WHERE SettingKey='inspector_team_management_enabled'",
            [originalFeatureFlag]
        ).catch(() => {});
        await db.query("UPDATE BBS_Settings SET SettingValue=? WHERE SettingKey='inspector_schedule_enabled'",[originalScheduleFlag]).catch(() => {});
        if (enrollmentId) {
            await db.query('DELETE FROM BBS_Inspector_Schedule_Events WHERE EnrollmentID=?',[enrollmentId]).catch(()=>{});
            await db.query('DELETE FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=?',[enrollmentId]).catch(()=>{});
            await db.query('DELETE FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=?',[enrollmentId]).catch(()=>{});
            const [events] = await db.query(
                'SELECT AssignmentID FROM BBS_Inspector_Team_Events WHERE EnrollmentID=?',
                [enrollmentId]
            );
            for (const row of events) {
                if (row.AssignmentID && !assignmentIds.includes(Number(row.AssignmentID))) assignmentIds.push(Number(row.AssignmentID));
            }
            await db.query('DELETE FROM BBS_Inspector_Team_Events WHERE EnrollmentID=?', [enrollmentId]);
        }
        if (assignmentIds.length) {
            await db.query(
                `DELETE FROM BBS_Hierarchy_Assignments WHERE id IN (${assignmentIds.map(() => '?').join(',')})`,
                assignmentIds
            );
        }
        if (enrollmentId) await db.query('DELETE FROM BBS_Inspector_Enrollments WHERE id=?', [enrollmentId]);
        await db.query(
            "DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs' AND Action LIKE 'BBS_INSPECTOR_%'",
            [auditBaseline]
        ).catch(() => {});
        for (const [employeeId, snapshot] of onboardingSnapshots) {
            await db.query(
                'UPDATE Employees SET Password=?,MustChangePassword=?,Unit=? WHERE EmployeeID=?',
                [snapshot.Password, snapshot.MustChangePassword, snapshot.Unit, employeeId]
            );
        }
        const [[remaining]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Inspector_Enrollments WHERE Reason=?) enrollments,
                (SELECT COUNT(*) FROM BBS_Inspector_Team_Events WHERE Reason=?) events`,
            [marker, marker]
        );
        console.log(`BBS Phase 9 UAT cleanup: enrollments=${remaining.enrollments}, events=${remaining.events}, onboardingFixtures=${onboardingSnapshots.size}`);
    } finally {
        await db.end();
    }
});
