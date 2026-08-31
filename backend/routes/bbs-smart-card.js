'use strict';

const express = require('express');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const {
    BBS_LEVELS,
    BBS_ELIGIBILITY,
    ASSIGNMENT_TYPES,
    normalizeLevel,
    levelRank,
    normalizeIsoDate,
    validateEffectiveRange,
    validateAssignmentCandidate,
    normalizeWeekdays,
    bangkokIsoDate,
    kpiDueForDate,
} = require('../services/bbs-phase1');

const router = express.Router();

function employeeIdFromUser(user = {}) {
    return String(user.id || user.EmployeeID || '').trim();
}

function positiveInt(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function phase1Error(res, error, label) {
    console.error(`[bbs-phase1] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ success: false, code: 'BBS_SETUP_REQUIRED', message: 'BBS Phase 1 database migration is required.' });
    }
    return res.status(500).json({ success: false, message: 'Unable to load BBS configuration.' });
}

async function loadEmployeeContext(employeeId, asOf = bangkokIsoDate(), queryable = db) {
    const [rows] = await queryable.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                mp.id AS PositionID,md.id AS DepartmentID,su.id AS SafetyUnitID,
                plm.BBSLevel,
                COALESCE(elig.Eligibility,'active') AS Eligibility,
                elig.Reason AS EligibilityReason
           FROM Employees e
           LEFT JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings plm ON plm.PositionID=mp.id AND plm.IsActive=1
           LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
           LEFT JOIN Master_SafetyUnits su
                  ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
           LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(
                SELECT ee.id FROM BBS_Employee_Eligibility ee
                 WHERE LOWER(TRIM(ee.EmployeeID))=LOWER(TRIM(e.EmployeeID))
                   AND ee.IsActive=1 AND ee.EffectiveFrom<=?
                   AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?)
                 ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1
           )
          WHERE LOWER(TRIM(e.EmployeeID))=LOWER(TRIM(?)) LIMIT 1`,
        [asOf, asOf, employeeId]
    );
    return rows[0] || null;
}

async function loadCurrentAssignments(employeeId, asOf, queryable = db) {
    const [rows] = await queryable.query(
        `SELECT a.*,s.EmployeeName AS SupervisorName,m.EmployeeName AS MemberName,
                sm.BBSLevel AS SupervisorLevel,mm.BBSLevel AS MemberLevel,
                d.Name AS DepartmentName,u.name AS SafetyUnitName
           FROM BBS_Hierarchy_Assignments a
           JOIN Employees s ON s.EmployeeID=a.SupervisorEmployeeID
           JOIN Employees m ON m.EmployeeID=a.MemberEmployeeID
           LEFT JOIN Master_Positions sp ON LOWER(TRIM(sp.Name))=LOWER(TRIM(s.Position))
           LEFT JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(m.Position))
           LEFT JOIN BBS_Position_Level_Mappings sm ON sm.PositionID=sp.id AND sm.IsActive=1
           LEFT JOIN BBS_Position_Level_Mappings mm ON mm.PositionID=mp.id AND mm.IsActive=1
           LEFT JOIN Master_Departments d ON d.id=a.DepartmentID
           LEFT JOIN Master_SafetyUnits u ON u.id=a.SafetyUnitID
          WHERE a.IsActive=1 AND a.EffectiveFrom<=?
            AND (a.EffectiveTo IS NULL OR a.EffectiveTo>=?)
            AND (LOWER(TRIM(a.SupervisorEmployeeID))=LOWER(TRIM(?))
                 OR LOWER(TRIM(a.MemberEmployeeID))=LOWER(TRIM(?)))
          ORDER BY a.EffectiveFrom DESC,a.id DESC`,
        [asOf, asOf, employeeId, employeeId]
    );
    return rows;
}

async function loadContextPayload(req) {
    const asOf = normalizeIsoDate(req.query.asOf || bangkokIsoDate(), { required: true });
    if (!asOf) return { error: { status: 400, message: 'asOf must be a valid YYYY-MM-DD date.' } };
    const employeeId = employeeIdFromUser(req.user);
    const employee = await loadEmployeeContext(employeeId, asOf);
    if (!employee) return { error: { status: 404, message: 'Employee is not available in Employee Master.' } };
    const [assignments, kpiRows, pilotRows, analyticsSetting, inspectorEnrollment, batchSettings] = await Promise.all([
        loadCurrentAssignments(employeeId, asOf),
        employee.BBSLevel
            ? db.query(`SELECT * FROM BBS_KPI_Rules WHERE BBSLevel=? AND IsActive=1 ORDER BY id`, [employee.BBSLevel]).then(([rows]) => rows)
            : Promise.resolve([]),
        db.query(
            `SELECT p.*,d.Name AS DepartmentName,u.name AS SafetyUnitName
               FROM BBS_Pilot_Scopes p
               JOIN Master_Departments d ON d.id=p.DepartmentID
               JOIN Master_SafetyUnits u ON u.id=p.SafetyUnitID
              WHERE p.IsActive=1 AND p.EffectiveFrom<=?
                AND (p.EffectiveTo IS NULL OR p.EffectiveTo>=?)`,
            [asOf, asOf]
        ).then(([rows]) => rows),
        db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='analytics_enabled' LIMIT 1").then(([rows]) => rows[0]?.SettingValue).catch(() => '0'),
        db.query(`SELECT * FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND Status='Active' AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EffectiveFrom DESC,id DESC LIMIT 1`, [employeeId, asOf, asOf]).then(([rows]) => rows[0] || null).catch(error => { if (error?.code === 'ER_NO_SUCH_TABLE') return null; throw error; }),
        db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('batch_observation_enabled','mobile_observation_wizard_enabled','draft_autosave_enabled')").then(([rows]) => Object.fromEntries(rows.map(row => [row.SettingKey, String(row.SettingValue) === '1']))).catch(() => ({})),
    ]);
    const role = String(req.user?.role || req.user?.Role || '');
    const isAdminUser = role.toLowerCase() === 'admin';
    const configurationReady = Boolean(employee.BBSLevel) && employee.Eligibility === 'active';
    const inPilot = pilotRows.some(row => Number(row.DepartmentID) === Number(employee.DepartmentID)
        && Number(row.SafetyUnitID) === Number(employee.SafetyUnitID));
    return {
        data: {
            asOf,
            employee,
            bbsLevel: employee.BBSLevel || null,
            eligibility: employee.Eligibility,
            configurationReady,
            denyReason: configurationReady ? null : (!employee.BBSLevel ? 'POSITION_NOT_MAPPED' : 'EMPLOYEE_NOT_ACTIVE'),
            permissions: {
                configure: isAdminUser,
                companyRead: isAdminUser,
                departmentRead: isAdminUser || levelRank(employee.BBSLevel) >= levelRank('Department Head'),
                teamRead: isAdminUser || levelRank(employee.BBSLevel) >= levelRank('Group Leader'),
                selfHistory: true,
                observe: isAdminUser || (configurationReady && levelRank(employee.BBSLevel) >= levelRank('Group Leader') && Boolean(inspectorEnrollment)),
                manageOwnTeam: !isAdminUser && Boolean(inspectorEnrollment) && Number(inspectorEnrollment.AllowSelfManage) === 1,
            },
            inspectorEnrollment,
            assignments,
            kpiRules: kpiRows.map(rule => ({ ...rule, weekdays: normalizeWeekdays(rule.Weekdays), dueToday: kpiDueForDate(rule, asOf) })),
            analyticsEnabled: String(analyticsSetting) === '1',
            batchObservationEnabled: Boolean(batchSettings.batch_observation_enabled),
            mobileObservationWizardEnabled: Boolean(batchSettings.mobile_observation_wizard_enabled),
            draftAutosaveEnabled: Boolean(batchSettings.draft_autosave_enabled),
            pilot: { inPilot, scopes: isAdminUser ? pilotRows : pilotRows.filter(row => Number(row.DepartmentID) === Number(employee.DepartmentID)) },
        },
    };
}

router.get('/levels', (_req, res) => {
    res.json({ success: true, data: BBS_LEVELS });
});

router.get('/me/context', async (req, res) => {
    try {
        const payload = await loadContextPayload(req);
        if (payload.error) return res.status(payload.error.status).json({ success: false, message: payload.error.message });
        return res.json({ success: true, data: payload.data });
    } catch (error) {
        return phase1Error(res, error, 'context');
    }
});

router.get('/me/team', async (req, res) => {
    try {
        const context = await loadContextPayload(req);
        if (context.error) return res.status(context.error.status).json({ success: false, message: context.error.message });
        const employeeId = employeeIdFromUser(req.user);
        const rows = context.data.assignments.filter(row => String(row.SupervisorEmployeeID) === employeeId);
        return res.json({ success: true, data: { asOf: context.data.asOf, bbsLevel: context.data.bbsLevel, rows } });
    } catch (error) {
        return phase1Error(res, error, 'team');
    }
});

router.get('/eligible-employees', async (req, res) => {
    try {
        const context = await loadContextPayload(req);
        if (context.error) return res.status(context.error.status).json({ success: false, message: context.error.message });
        const role = String(req.user?.role || req.user?.Role || '').toLowerCase();
        if (role !== 'admin' && (!context.data.configurationReady || !context.data.permissions.observe)) {
            return res.json({ success: true, data: { asOf: context.data.asOf, rows: [], denyReason: context.data.denyReason || 'OBSERVATION_SCOPE_NOT_GRANTED' } });
        }
        const employeeId = employeeIdFromUser(req.user);
        let rows;
        if (role === 'admin') {
            [rows] = await db.query(
                `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel
                   FROM Employees e
                   JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                   JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
                   LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(
                        SELECT ee.id FROM BBS_Employee_Eligibility ee
                         WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1
                           AND ee.EffectiveFrom<=? AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?)
                         ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
                  WHERE COALESCE(elig.Eligibility,'active')='active'
                  ORDER BY e.Department,e.Unit,e.EmployeeName`,
                [context.data.asOf, context.data.asOf]
            );
        } else {
            [rows] = await db.query(
                `SELECT DISTINCT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,mapping.BBSLevel,
                        a.DepartmentID,a.SafetyUnitID
                   FROM BBS_Hierarchy_Assignments a
                   JOIN Employees e ON e.EmployeeID=a.MemberEmployeeID
                   JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                   JOIN BBS_Position_Level_Mappings mapping ON mapping.PositionID=p.id AND mapping.IsActive=1
                   LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(
                        SELECT ee.id FROM BBS_Employee_Eligibility ee
                         WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1
                           AND ee.EffectiveFrom<=? AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?)
                         ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
                  WHERE a.SupervisorEmployeeID=? AND a.IsActive=1
                    AND a.EffectiveFrom<=? AND (a.EffectiveTo IS NULL OR a.EffectiveTo>=?)
                    AND COALESCE(elig.Eligibility,'active')='active'
                  ORDER BY e.EmployeeName`,
                [context.data.asOf, context.data.asOf, employeeId, context.data.asOf, context.data.asOf]
            );
        }
        return res.json({ success: true, data: { asOf: context.data.asOf, rows, denyReason: null } });
    } catch (error) {
        return phase1Error(res, error, 'eligible employees');
    }
});

router.get('/admin/foundation', isAdmin, async (_req, res) => {
    try {
        const [positions, departments, units, mappings, assignments, kpiRules, pilotScopes, eligibility, employees] = await Promise.all([
            db.query('SELECT id,Name FROM Master_Positions ORDER BY Name').then(([rows]) => rows),
            db.query('SELECT id,Name,Status,is_safety_core FROM Master_Departments ORDER BY Name').then(([rows]) => rows),
            db.query('SELECT id,name,short_code,department_id FROM Master_SafetyUnits ORDER BY department_id,sort_order,name').then(([rows]) => rows),
            db.query(`SELECT m.*,p.Name AS PositionName FROM BBS_Position_Level_Mappings m JOIN Master_Positions p ON p.id=m.PositionID ORDER BY p.Name`).then(([rows]) => rows),
            db.query(
                `SELECT a.*,s.EmployeeName AS SupervisorName,m.EmployeeName AS MemberName,d.Name AS DepartmentName,u.name AS SafetyUnitName
                   FROM BBS_Hierarchy_Assignments a
                   JOIN Employees s ON s.EmployeeID=a.SupervisorEmployeeID
                   JOIN Employees m ON m.EmployeeID=a.MemberEmployeeID
                   JOIN Master_Departments d ON d.id=a.DepartmentID
                   LEFT JOIN Master_SafetyUnits u ON u.id=a.SafetyUnitID
                  ORDER BY a.IsActive DESC,a.EffectiveFrom DESC,a.id DESC`
            ).then(([rows]) => rows),
            db.query('SELECT * FROM BBS_KPI_Rules ORDER BY BBSLevel,MetricKey').then(([rows]) => rows),
            db.query(
                `SELECT p.*,d.Name AS DepartmentName,u.name AS SafetyUnitName
                   FROM BBS_Pilot_Scopes p JOIN Master_Departments d ON d.id=p.DepartmentID
                   JOIN Master_SafetyUnits u ON u.id=p.SafetyUnitID ORDER BY p.IsActive DESC,p.id DESC`
            ).then(([rows]) => rows),
            db.query(
                `SELECT x.*,e.EmployeeName FROM BBS_Employee_Eligibility x
                   JOIN Employees e ON e.EmployeeID=x.EmployeeID ORDER BY x.IsActive DESC,x.EffectiveFrom DESC,x.id DESC`
            ).then(([rows]) => rows),
            db.query('SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees ORDER BY Department,Unit,EmployeeName').then(([rows]) => rows),
        ]);
        const mappingByPosition = new Map(mappings.map(row => [Number(row.PositionID), row]));
        const mappedPositions = positions.map(position => ({ ...position, mapping: mappingByPosition.get(Number(position.id)) || null }));
        res.json({
            success: true,
            data: {
                levels: BBS_LEVELS,
                eligibilityValues: BBS_ELIGIBILITY,
                assignmentTypes: ASSIGNMENT_TYPES,
                positions: mappedPositions,
                departments,
                units,
                assignments,
                kpiRules,
                pilotScopes,
                eligibility,
                employees,
                summary: {
                    positions: positions.length,
                    mappedPositions: mappings.filter(row => Number(row.IsActive) === 1).length,
                    activeAssignments: assignments.filter(row => Number(row.IsActive) === 1).length,
                    activePilotScopes: pilotScopes.filter(row => Number(row.IsActive) === 1).length,
                },
            },
        });
    } catch (error) {
        return phase1Error(res, error, 'admin foundation');
    }
});

router.put('/admin/position-mappings/:positionId', isAdmin, async (req, res) => {
    const positionId = positiveInt(req.params.positionId);
    const level = normalizeLevel(req.body?.bbsLevel);
    const isActiveValue = req.body?.isActive === false || Number(req.body?.isActive) === 0 ? 0 : 1;
    if (!positionId || !level) return res.status(400).json({ success: false, message: 'Valid PositionID and BBSLevel are required.' });
    try {
        const [[position]] = await db.query('SELECT id,Name FROM Master_Positions WHERE id=? LIMIT 1', [positionId]);
        if (!position) return res.status(404).json({ success: false, message: 'Master Position was not found.' });
        await db.query(
            `INSERT INTO BBS_Position_Level_Mappings (PositionID,BBSLevel,IsActive,ReviewedBy,ReviewedAt)
             VALUES (?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE BBSLevel=VALUES(BBSLevel),IsActive=VALUES(IsActive),ReviewedBy=VALUES(ReviewedBy),ReviewedAt=NOW()`,
            [positionId, level, isActiveValue, employeeIdFromUser(req.user)]
        );
        await logAudit(req, { action: 'BBS_POSITION_LEVEL_UPDATE', module: 'bbs', targetType: 'BBS_Position_Level_Mapping', targetId: positionId, detail: `${position.Name} -> ${level}; active=${isActiveValue}` });
        res.json({ success: true, data: { positionId, positionName: position.Name, bbsLevel: level, isActive: isActiveValue }, message: 'BBS position mapping saved.' });
    } catch (error) {
        return phase1Error(res, error, 'position mapping');
    }
});

router.put('/admin/kpi-rules/:level', isAdmin, async (req, res) => {
    const level = normalizeLevel(req.params.level);
    const targetCount = Number(req.body?.targetCount);
    const weekdays = normalizeWeekdays(req.body?.weekdays);
    const isActiveValue = req.body?.isActive === false || Number(req.body?.isActive) === 0 ? 0 : 1;
    if (!level || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 100 || !weekdays.length) {
        return res.status(400).json({ success: false, message: 'Valid BBSLevel, TargetCount (1-100), and Weekdays are required.' });
    }
    try {
        await db.query(
            `INSERT INTO BBS_KPI_Rules (BBSLevel,MetricKey,PeriodType,TargetCount,Weekdays,TimeZone,CountStatus,IsActive,UpdatedBy)
             VALUES (?,'submitted_observation','business_day',?,?,'Asia/Bangkok','submitted',?,?)
             ON DUPLICATE KEY UPDATE TargetCount=VALUES(TargetCount),Weekdays=VALUES(Weekdays),TimeZone='Asia/Bangkok',CountStatus='submitted',IsActive=VALUES(IsActive),UpdatedBy=VALUES(UpdatedBy)`,
            [level, targetCount, weekdays.join(','), isActiveValue, employeeIdFromUser(req.user)]
        );
        await logAudit(req, { action: 'BBS_KPI_RULE_UPDATE', module: 'bbs', targetType: 'BBS_KPI_Rule', targetId: level, detail: `target=${targetCount}; weekdays=${weekdays.join(',')}; timezone=Asia/Bangkok` });
        res.json({ success: true, data: { bbsLevel: level, targetCount, weekdays, timeZone: 'Asia/Bangkok', isActive: isActiveValue }, message: 'BBS KPI rule saved.' });
    } catch (error) {
        return phase1Error(res, error, 'KPI rule');
    }
});

router.put('/admin/pilot-scope', isAdmin, async (req, res) => {
    const departmentId = positiveInt(req.body?.departmentId);
    const safetyUnitId = positiveInt(req.body?.safetyUnitId);
    const range = validateEffectiveRange(req.body?.effectiveFrom, req.body?.effectiveTo);
    if (!departmentId || !safetyUnitId || !range.ok) {
        return res.status(400).json({ success: false, message: range.message || 'Valid Department and Safety Unit are required.' });
    }
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[unit]] = await conn.query(
            `SELECT u.id,u.name,u.department_id,d.Name AS DepartmentName
               FROM Master_SafetyUnits u JOIN Master_Departments d ON d.id=u.department_id
              WHERE u.id=? AND d.id=? LIMIT 1 FOR UPDATE`,
            [safetyUnitId, departmentId]
        );
        if (!unit) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Safety Unit does not belong to the selected Department.' });
        }
        await conn.query('UPDATE BBS_Pilot_Scopes SET IsActive=0,UpdatedBy=? WHERE IsActive=1', [employeeIdFromUser(req.user)]);
        await conn.query(
            `INSERT INTO BBS_Pilot_Scopes (DepartmentID,SafetyUnitID,IsActive,EffectiveFrom,EffectiveTo,UpdatedBy)
             VALUES (?,?,1,?,?,?)
             ON DUPLICATE KEY UPDATE IsActive=1,EffectiveFrom=VALUES(EffectiveFrom),EffectiveTo=VALUES(EffectiveTo),UpdatedBy=VALUES(UpdatedBy)`,
            [departmentId, safetyUnitId, range.from, range.to, employeeIdFromUser(req.user)]
        );
        await conn.commit();
        await logAudit(req, { action: 'BBS_PILOT_SCOPE_UPDATE', module: 'bbs', targetType: 'BBS_Pilot_Scope', targetId: `${departmentId}:${safetyUnitId}`, detail: `${unit.DepartmentName} / ${unit.name}` });
        res.json({ success: true, data: { departmentId, safetyUnitId, departmentName: unit.DepartmentName, safetyUnitName: unit.name, effectiveFrom: range.from, effectiveTo: range.to }, message: 'BBS pilot scope saved.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        return phase1Error(res, error, 'pilot scope');
    } finally {
        conn.release();
    }
});

async function assignmentEmployee(employeeId, queryable) {
    return loadEmployeeContext(employeeId, bangkokIsoDate(), queryable);
}

async function validateAssignmentScope(conn, body, excludeId = null) {
    const supervisor = await assignmentEmployee(body.supervisorEmployeeId, conn);
    const member = await assignmentEmployee(body.memberEmployeeId, conn);
    if (!supervisor || !member) return { error: { status: 404, message: 'Supervisor or member was not found.' } };
    const validation = validateAssignmentCandidate({
        ...body,
        supervisorLevel: supervisor.BBSLevel,
        memberLevel: member.BBSLevel,
    });
    if (!validation.ok) return { error: { status: 400, message: validation.message } };
    const departmentId = positiveInt(body.departmentId);
    const safetyUnitId = body.safetyUnitId === null || body.safetyUnitId === '' || body.safetyUnitId === undefined ? null : positiveInt(body.safetyUnitId);
    if (!departmentId || Number(supervisor.DepartmentID) !== departmentId || Number(member.DepartmentID) !== departmentId) {
        return { error: { status: 400, message: 'Both employees must belong to the selected Department.' } };
    }
    if (validation.supervisorLevel === 'Group Leader') {
        if (!safetyUnitId || Number(supervisor.SafetyUnitID) !== safetyUnitId || Number(member.SafetyUnitID) !== safetyUnitId) {
            return { error: { status: 400, message: 'Group Leader assignments require both employees in the selected Safety Unit.' } };
        }
    } else if (safetyUnitId) {
        const [[unit]] = await conn.query('SELECT id FROM Master_SafetyUnits WHERE id=? AND department_id=? LIMIT 1', [safetyUnitId, departmentId]);
        if (!unit) return { error: { status: 400, message: 'Safety Unit does not belong to the selected Department.' } };
    }
    const overlapEnd = validation.to || '9999-12-31';
    const params = [validation.memberId, overlapEnd, validation.from];
    let sql = `SELECT id FROM BBS_Hierarchy_Assignments
                WHERE MemberEmployeeID=? AND IsActive=1
                  AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=?`;
    if (excludeId) { sql += ' AND id<>?'; params.push(excludeId); }
    sql += ' LIMIT 1 FOR UPDATE';
    const [[overlap]] = await conn.query(sql, params);
    if (overlap) return { error: { status: 409, message: 'This member already has an overlapping active hierarchy assignment.' } };
    return { validation, supervisor, member, departmentId, safetyUnitId };
}

router.post('/admin/hierarchy-assignments', isAdmin, async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const checked = await validateAssignmentScope(conn, req.body || {});
        if (checked.error) { await conn.rollback(); return res.status(checked.error.status).json({ success: false, message: checked.error.message }); }
        const [result] = await conn.query(
            `INSERT INTO BBS_Hierarchy_Assignments
             (SupervisorEmployeeID,MemberEmployeeID,DepartmentID,SafetyUnitID,AssignmentType,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy)
             VALUES (?,?,?,?,?,?,?,1,?,?,?)`,
            [checked.validation.supervisorId, checked.validation.memberId, checked.departmentId, checked.safetyUnitId,
                checked.validation.assignmentType, checked.validation.from, checked.validation.to,
                String(req.body?.reason || '').trim().slice(0, 255) || null, employeeIdFromUser(req.user), employeeIdFromUser(req.user)]
        );
        await conn.commit();
        await logAudit(req, { action: 'BBS_HIERARCHY_ASSIGNMENT_CREATE', module: 'bbs', targetType: 'BBS_Hierarchy_Assignment', targetId: result.insertId, detail: `${checked.validation.supervisorId} -> ${checked.validation.memberId}` });
        res.status(201).json({ success: true, data: { id: result.insertId }, message: 'BBS hierarchy assignment created.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        return phase1Error(res, error, 'create hierarchy assignment');
    } finally {
        conn.release();
    }
});

router.put('/admin/hierarchy-assignments/:id', isAdmin, async (req, res) => {
    const id = positiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid assignment ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[existing]] = await conn.query('SELECT id FROM BBS_Hierarchy_Assignments WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        if (!existing) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Hierarchy assignment was not found.' }); }
        const checked = await validateAssignmentScope(conn, req.body || {}, id);
        if (checked.error) { await conn.rollback(); return res.status(checked.error.status).json({ success: false, message: checked.error.message }); }
        await conn.query(
            `UPDATE BBS_Hierarchy_Assignments
                SET SupervisorEmployeeID=?,MemberEmployeeID=?,DepartmentID=?,SafetyUnitID=?,AssignmentType=?,
                    EffectiveFrom=?,EffectiveTo=?,IsActive=?,Reason=?,UpdatedBy=?
              WHERE id=?`,
            [checked.validation.supervisorId, checked.validation.memberId, checked.departmentId, checked.safetyUnitId,
                checked.validation.assignmentType, checked.validation.from, checked.validation.to,
                req.body?.isActive === false || Number(req.body?.isActive) === 0 ? 0 : 1,
                String(req.body?.reason || '').trim().slice(0, 255) || null, employeeIdFromUser(req.user), id]
        );
        await conn.commit();
        await logAudit(req, { action: 'BBS_HIERARCHY_ASSIGNMENT_UPDATE', module: 'bbs', targetType: 'BBS_Hierarchy_Assignment', targetId: id, detail: `${checked.validation.supervisorId} -> ${checked.validation.memberId}` });
        res.json({ success: true, data: { id }, message: 'BBS hierarchy assignment updated.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        return phase1Error(res, error, 'update hierarchy assignment');
    } finally {
        conn.release();
    }
});

router.delete('/admin/hierarchy-assignments/:id', isAdmin, async (req, res) => {
    const id = positiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid assignment ID.' });
    try {
        const [result] = await db.query('UPDATE BBS_Hierarchy_Assignments SET IsActive=0,UpdatedBy=? WHERE id=? AND IsActive=1', [employeeIdFromUser(req.user), id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Active hierarchy assignment was not found.' });
        await logAudit(req, { action: 'BBS_HIERARCHY_ASSIGNMENT_DEACTIVATE', module: 'bbs', targetType: 'BBS_Hierarchy_Assignment', targetId: id, detail: 'Soft-deactivated hierarchy assignment.' });
        res.json({ success: true, message: 'BBS hierarchy assignment deactivated.' });
    } catch (error) {
        return phase1Error(res, error, 'deactivate hierarchy assignment');
    }
});

router.put('/admin/eligibility/:employeeId', isAdmin, async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    const eligibility = String(req.body?.eligibility || '').trim().toLowerCase();
    const range = validateEffectiveRange(req.body?.effectiveFrom, req.body?.effectiveTo);
    if (!employeeId || !BBS_ELIGIBILITY.includes(eligibility) || !range.ok) {
        return res.status(400).json({ success: false, message: range.message || 'Valid EmployeeID and eligibility are required.' });
    }
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[employee]] = await conn.query('SELECT EmployeeID FROM Employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE', [employeeId]);
        if (!employee) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Employee was not found.' }); }
        const [[overlap]] = await conn.query(
            `SELECT id FROM BBS_Employee_Eligibility
              WHERE EmployeeID=? AND IsActive=1 AND EffectiveFrom<=?
                AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1 FOR UPDATE`,
            [employeeId, range.to || '9999-12-31', range.from]
        );
        if (overlap) { await conn.rollback(); return res.status(409).json({ success: false, message: 'Employee already has an overlapping eligibility period.' }); }
        const [result] = await conn.query(
            `INSERT INTO BBS_Employee_Eligibility
             (EmployeeID,Eligibility,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy)
             VALUES (?,?,?,?,1,?,?,?)`,
            [employeeId, eligibility, range.from, range.to, String(req.body?.reason || '').trim().slice(0, 255) || null, employeeIdFromUser(req.user), employeeIdFromUser(req.user)]
        );
        await conn.commit();
        await logAudit(req, { action: 'BBS_ELIGIBILITY_CREATE', module: 'bbs', targetType: 'BBS_Employee_Eligibility', targetId: result.insertId, detail: `${employeeId} -> ${eligibility}` });
        res.status(201).json({ success: true, data: { id: result.insertId, employeeId, eligibility }, message: 'BBS employee eligibility saved.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        return phase1Error(res, error, 'employee eligibility');
    } finally {
        conn.release();
    }
});

module.exports = router;
