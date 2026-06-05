// backend/routes/activity-targets.js
// Auth applied at mount level (authenticateToken). Write ops require isAdmin.
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');

// ─── Activity definitions (static metadata) ───────────────────────────────────
const ACTIVITIES = [
    { key: 'patrol',         label: 'Safety Patrol',           desc: 'จำนวนครั้งเดินตรวจ Safety Patrol',       metricType: 'fixed_count',     scopeType: 'person_position',   unitLabel: 'ครั้ง',   targetMode: 'manual' },
    { key: 'patrol_issue',   label: 'รายงานประเด็นปัญหา',     desc: 'อัตราปิดประเด็นที่แผนกรับผิดชอบ',       metricType: 'dynamic_ratio',   scopeType: 'department',        unitLabel: '%',      targetMode: 'system_denominator' },
    { key: 'cccf_worker',    label: 'CCCF Form A Worker',      desc: 'ความครบถ้วนของผู้เกี่ยวข้อง (พนักงาน)', metricType: 'people_coverage', scopeType: 'unit',              unitLabel: 'คน',     targetMode: 'manual' },
    { key: 'cccf_permanent', label: 'CCCF Form A Permanent',   desc: 'ความครบถ้วนของผู้เกี่ยวข้อง (ถาวร)',    metricType: 'people_coverage', scopeType: 'unit',              unitLabel: 'คน',     targetMode: 'manual' },
    { key: 'scw',            label: 'OJT Stop-Call-Wait',      desc: 'ความครบถ้วนของผู้เกี่ยวข้อง SCW',       metricType: 'people_coverage', scopeType: 'department',        unitLabel: 'คน',     targetMode: 'manual' },
    { key: 'training',       label: 'Safety Training',         desc: 'ผู้เกี่ยวข้องที่ผ่านหลักสูตรอบรม',       metricType: 'people_coverage', scopeType: 'department_course', unitLabel: 'คน',     targetMode: 'manual' },
    { key: 'yokoten',        label: 'Yokoten Response',        desc: 'อัตราตอบกลับหัวข้อที่มอบหมายให้แผนก',   metricType: 'dynamic_ratio',   scopeType: 'department',        unitLabel: '%',      targetMode: 'system_denominator' },
    { key: 'hiyari',         label: 'Hiyari Near-Miss',        desc: 'การมีส่วนร่วมของผู้เกี่ยวข้อง',          metricType: 'people_coverage', scopeType: 'department_unit',   unitLabel: 'คน',     targetMode: 'manual' },
    { key: 'ky',             label: 'KY Activity',             desc: 'กิจกรรมทำนายอันตราย (Kiken Yochi)',     metricType: 'fixed_count',     scopeType: 'department_unit',   unitLabel: 'เรื่อง', targetMode: 'module_config' },
];
const VALID_KEYS = new Set(ACTIVITIES.map(a => a.key));
const ACTIVITY_MAP = new Map(ACTIVITIES.map(a => [a.key, a]));

function storedTargetValue(activityKey, yearlyTarget, isNA) {
    if (isNA) return 0;
    if (ACTIVITY_MAP.get(activityKey)?.targetMode === 'system_denominator') return 1;
    return yearlyTarget ?? 0;
}

// ─── Auto-create tables ───────────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables() {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Position_Templates (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            PositionName VARCHAR(100) NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pos_act (PositionName, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    try {
        await db.query('ALTER TABLE Activity_Position_Templates ADD COLUMN IsNA TINYINT(1) NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists — ignore */ }
    await db.query(`
        CREATE TABLE IF NOT EXISTS Employee_Activity_Targets (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID   VARCHAR(50)  NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp_act (EmployeeID, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Scope_Overrides (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            Department   VARCHAR(150) NOT NULL,
            Unit         VARCHAR(150) NOT NULL DEFAULT '',
            ActivityKey  VARCHAR(50)  NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_scope_act (Department, Unit, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // migrate existing table — add IsNA if not exists
    try {
        await db.query('ALTER TABLE Employee_Activity_Targets ADD COLUMN IsNA TINYINT(1) NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists — ignore */ }
    tablesReady = true;
}

// ─── Helper: safe count query (silent fail if table doesn't exist yet) ─────────
async function safeCount(sql, params) {
    try {
        const [[r]] = await db.query(sql, params);
        return r?.cnt ?? 0;
    } catch { return 0; }
}

// ─── Helper: merge position template + per-person override ────────────────────
async function getMergedTargets(empId) {
    const [[emp]] = await db.query('SELECT Position, Department, Unit FROM Employees WHERE EmployeeID = ?', [empId]);
    const position = emp?.Position || null;
    const department = emp?.Department || null;
    const unit = emp?.Unit || '';

    const [posTemplates] = position
        ? await db.query(
            'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates WHERE PositionName = ?',
            [position])
        : [[]];

    const [scopeOverrides] = department
        ? await db.query(
            `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, Department, Unit
               FROM Activity_Scope_Overrides
              WHERE Department = ? AND (Unit = ? OR Unit = '')
              ORDER BY CASE WHEN Unit = ? THEN 0 ELSE 1 END`,
            [department, unit, unit])
        : [[]];

    const [overrides] = await db.query(
        'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets WHERE EmployeeID = ?',
        [empId]);

    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.ActivityKey] = { ...o, source: 'override' }; });
    const templateMap = {};
    posTemplates.forEach(t => { templateMap[t.ActivityKey] = { ...t, source: 'template' }; });
    const scopeMap = {};
    scopeOverrides.forEach(s => {
        if (!scopeMap[s.ActivityKey]) scopeMap[s.ActivityKey] = { ...s, source: 'scope' };
    });

    return { position, department, unit, overrideMap, scopeMap, templateMap };
}

function parseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [];
    } catch {
        return String(value).split(',').map(v => v.trim()).filter(Boolean);
    }
}

async function getDynamicActivityRatio(activityKey, department, year = new Date().getFullYear()) {
    const dept = String(department || '').trim();
    const empty = { numerator: 0, denominator: 0, completionPct: null, noData: true, department: dept };
    if (!dept) return empty;
    try {
        if (activityKey === 'patrol_issue') {
            const [[row]] = await db.query(
                `SELECT COUNT(*) AS denominator,
                        SUM(CASE WHEN CurrentStatus = 'Closed' THEN 1 ELSE 0 END) AS numerator
                   FROM Patrol_Issues
                  WHERE TRIM(COALESCE(ResponsibleDept, '')) = ? AND YEAR(DateFound) = ?`,
                [dept, year]
            );
            const denominator = Number(row?.denominator || 0);
            const numerator = Number(row?.numerator || 0);
            return { numerator, denominator, completionPct: denominator ? Math.round(numerator * 100 / denominator) : null, noData: denominator === 0, department: dept };
        }
        if (activityKey === 'yokoten') {
            const [topics] = await db.query('SELECT YokotenID, TargetDepts FROM YokotenTopics WHERE IsActive = 1');
            const targetedIds = topics
                .filter(topic => {
                    const targetDepts = parseList(topic.TargetDepts);
                    return targetDepts.length === 0 || targetDepts.includes(dept);
                })
                .map(topic => topic.YokotenID);
            if (!targetedIds.length) return empty;
            const placeholders = targetedIds.map(() => '?').join(',');
            const [[row]] = await db.query(
                `SELECT COUNT(DISTINCT YokotenID) AS numerator
                   FROM YokotenResponses
                  WHERE TRIM(Department) = ?
                    AND YokotenID IN (${placeholders})
                    AND (IsDeleted IS NULL OR IsDeleted = 0)`,
                [dept, ...targetedIds]
            );
            const numerator = Number(row?.numerator || 0);
            const denominator = targetedIds.length;
            return { numerator, denominator, completionPct: Math.round(numerator * 100 / denominator), noData: false, department: dept };
        }
    } catch {
        return empty;
    }
    return empty;
}

function peopleCoverageResult(numerator, yearlyTarget, department, unit, calculationMethod, sourceAvailable = true) {
    const denominator = Number(yearlyTarget || 0);
    const scopedUnit = String(unit || '').trim();
    const noData = denominator <= 0 || !sourceAvailable;
    return {
        numerator: Number(numerator || 0),
        denominator,
        completionPct: noData ? null : Math.min(100, Math.round(Number(numerator || 0) * 100 / denominator)),
        noData,
        department: String(department || '').trim(),
        unit: scopedUnit,
        calculationMethod,
        calculationScope: { type: scopedUnit ? 'department_unit' : 'department', department: String(department || '').trim(), unit: scopedUnit },
    };
}

async function getPeopleCoverage(activityKey, { department, unit = '' } = {}, year = new Date().getFullYear(), yearlyTarget = 0) {
    const dept = String(department || '').trim();
    const scopedUnit = String(unit || '').trim();
    const empty = peopleCoverageResult(0, yearlyTarget, dept, scopedUnit, 'source_unavailable', false);
    if (!dept) return empty;
    try {
        if (activityKey === 'cccf_worker') {
            const params = [dept, year];
            const unitFilter = scopedUnit ? ' AND TRIM(COALESCE(SafetyUnit, \'\')) = ?' : '';
            if (scopedUnit) params.push(scopedUnit);
            const [[row]] = await db.query(
                `SELECT COUNT(DISTINCT NULLIF(EmployeeID, '')) AS numerator
                   FROM CCCF_FormA_Worker
                  WHERE TRIM(COALESCE(Department, '')) = ? AND YEAR(SubmitDate) = ?${unitFilter}`,
                params
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, scopedUnit, 'distinct_worker_submitters');
        }
        if (activityKey === 'cccf_permanent') {
            const params = [dept, year];
            const unitFilter = scopedUnit
                ? ' AND EXISTS (SELECT 1 FROM Employees e WHERE e.EmployeeID = f.AssigneeID AND TRIM(COALESCE(e.Unit, \'\')) = ?)'
                : '';
            if (scopedUnit) params.push(scopedUnit);
            const [[row]] = await db.query(
                `SELECT COUNT(DISTINCT COALESCE(NULLIF(f.AssigneeID, ''), NULLIF(f.SubmitterName, ''))) AS numerator
                   FROM CCCF_FormA_Permanent f
                  WHERE TRIM(COALESCE(f.Department, '')) = ? AND YEAR(f.SubmitDate) = ?${unitFilter}`,
                params
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, scopedUnit, 'distinct_permanent_assignees');
        }
        if (activityKey === 'scw') {
            const [[row]] = await db.query(
                `SELECT COALESCE(SUM(AttendeeCount), 0) AS numerator
                   FROM OJT_Records
                  WHERE TRIM(COALESCE(Department, '')) = ? AND YEAR(OJTDate) = ?`,
                [dept, year]
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, '', 'department_attendee_snapshot');
        }
        if (activityKey === 'training') {
            const [[row]] = await db.query(
                `SELECT COUNT(DISTINCT r.EmployeeID) AS numerator
                   FROM Training_Records r
                   JOIN Employees e ON e.EmployeeID = r.EmployeeID
                  WHERE TRIM(COALESCE(e.Department, '')) = ? AND YEAR(r.TrainingDate) = ? AND r.IsPassed = 1`,
                [dept, year]
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, '', 'distinct_passed_employees');
        }
        if (activityKey === 'hiyari') {
            const params = [dept, year];
            const unitFilter = scopedUnit
                ? ' AND EXISTS (SELECT 1 FROM Employees e WHERE e.EmployeeID = h.ReporterID AND TRIM(COALESCE(e.Unit, \'\')) = ?)'
                : '';
            if (scopedUnit) params.push(scopedUnit);
            const [[row]] = await db.query(
                `SELECT COUNT(DISTINCT NULLIF(h.ReporterID, '')) AS numerator
                   FROM HiyariReports h
                  WHERE TRIM(COALESCE(h.Department, '')) = ? AND YEAR(h.ReportDate) = ?
                    AND h.DeletedAt IS NULL${unitFilter}`,
                params
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, scopedUnit, 'distinct_near_miss_reporters');
        }
    } catch {
        return empty;
    }
    return empty;
}

function fixedCountResult(actualCount, yearlyTarget, scope, calculationMethod, targetSource) {
    const denominator = Number(yearlyTarget || 0);
    const actual = Number(actualCount || 0);
    const noData = denominator <= 0;
    return {
        numerator: actual,
        denominator,
        completionPct: noData ? null : Math.min(100, Math.round(actual * 100 / denominator)),
        noData,
        calculationScope: scope,
        calculationMethod,
        targetSource,
    };
}

async function getFixedCountAlignment(activityKey, { employeeId = '', department = '', unit = '' } = {}, year = new Date().getFullYear(), fallbackTarget = 0) {
    const empId = String(employeeId || '').trim();
    const dept = String(department || '').trim();
    const scopedUnit = String(unit || '').trim();
    try {
        if (activityKey === 'patrol') {
            const [[[actualRow]], [[rosterRow]]] = await Promise.all([
                db.query(
                    `SELECT
                        (SELECT COUNT(*) FROM Patrol_Attendance WHERE UserID = ? AND YEAR(PatrolDate) = ?) +
                        (SELECT COUNT(*) FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?) AS numerator`,
                    [empId, year, empId, year]
                ),
                db.query('SELECT TargetPerYear FROM Patrol_Roster WHERE EmployeeID = ? ORDER BY id LIMIT 1', [empId]),
            ]);
            const rosterTarget = Number(rosterRow?.TargetPerYear || 0);
            return fixedCountResult(
                actualRow?.numerator,
                rosterTarget || fallbackTarget,
                { type: 'employee', employeeId: empId },
                'patrol_attendance_plus_self_checkin',
                rosterTarget > 0 ? 'patrol_roster' : 'activity_target'
            );
        }
        if (activityKey === 'ky') {
            const [[configRow]] = await db.query(
                'SELECT SafetyUnits, YearlyTarget FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1',
                [year, dept]
            );
            const units = parseList(configRow?.SafetyUnits);
            const useUnit = scopedUnit && units.includes(scopedUnit);
            const [[actualRow]] = await db.query(
                `SELECT COUNT(*) AS numerator FROM KY_Activities
                  WHERE Department = ? ${useUnit ? 'AND SafetyUnit = ?' : ''} AND YEAR(ActivityDate) = ?`,
                useUnit ? [dept, scopedUnit, year] : [dept, year]
            );
            const moduleTarget = Number(configRow?.YearlyTarget || 0);
            return fixedCountResult(
                actualRow?.numerator,
                moduleTarget || fallbackTarget,
                { type: useUnit ? 'department_unit' : 'department', department: dept, unit: useUnit ? scopedUnit : '' },
                'ky_scope_activity_count',
                moduleTarget > 0 ? 'ky_program_config' : 'activity_target'
            );
        }
    } catch {
        return fixedCountResult(0, fallbackTarget, null, 'source_unavailable', 'activity_target');
    }
    return fixedCountResult(0, fallbackTarget, null, 'source_unavailable', 'activity_target');
}

async function getCoverageMatrix() {
    await ensureTables();
    const [[employees], [templates], [scopes], [overrides]] = await Promise.all([
        db.query(`SELECT EmployeeID, EmployeeName, Department, Unit, Position
                    FROM Employees
                   WHERE COALESCE(EmployeeID, '') <> ''
                   ORDER BY Department, Unit, Position, EmployeeName`),
        db.query('SELECT PositionName, ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates'),
        db.query('SELECT Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Scope_Overrides'),
        db.query('SELECT EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets'),
    ]);
    const templateMap = new Map(templates.map(r => [`${String(r.PositionName || '').trim()}::${r.ActivityKey}`, r]));
    const scopeMap = new Map(scopes.map(r => [`${String(r.Department || '').trim()}::${String(r.Unit || '').trim()}::${r.ActivityKey}`, r]));
    const overrideMap = new Map(overrides.map(r => [`${r.EmployeeID}::${r.ActivityKey}`, r]));
    const summary = { employees: employees.length, slots: 0, override: 0, scope: 0, template: 0, system: 0, missing: 0, na: 0, zero: 0, review: 0 };
    const rows = [];
    for (const employee of employees) {
        const employeeId = String(employee.EmployeeID || '');
        const department = String(employee.Department || '').trim();
        const unit = String(employee.Unit || '').trim();
        const position = String(employee.Position || '').trim();
        for (const activity of ACTIVITIES) {
            const key = activity.key;
            const scope = department
                ? scopeMap.get(`${department}::${unit}::${key}`) || scopeMap.get(`${department}::::${key}`) || null
                : null;
            const override = overrideMap.get(`${employeeId}::${key}`);
            const template = templateMap.get(`${position}::${key}`);
            const row = override || scope || template || null;
            const isDynamic = activity.metricType === 'dynamic_ratio';
            const source = override ? 'override' : scope ? 'scope' : template ? 'template' : isDynamic ? 'system' : 'missing';
            const isNA = Boolean(row?.IsNA);
            const yearlyTarget = row ? Number(row.YearlyTarget) : null;
            const isZero = !isDynamic && !isNA && yearlyTarget === 0;
            const reviewNeeded = source === 'missing' || isZero;
            rows.push({
                employeeId, employeeName: employee.EmployeeName || '', department, unit, position,
                activityKey: key, activityLabel: activity.label, yearlyTarget,
                metricType: activity.metricType, scopeType: activity.scopeType,
                unitLabel: activity.unitLabel, targetMode: activity.targetMode,
                passPct: row ? Number(row.PassPct) : null, isNA, isZero, reviewNeeded, source,
                scope: source === 'scope' ? { department: row.Department || '', unit: row.Unit || '' } : null,
            });
            summary.slots += 1;
            summary[source] += 1;
            if (isNA) summary.na += 1;
            if (isZero) summary.zero += 1;
            if (reviewNeeded) summary.review += 1;
        }
    }
    return { summary, rows };
}

// ─── GET /api/activity-targets/activities — static list ───────────────────────
router.get('/activities', (req, res) => {
    res.json({ success: true, data: ACTIVITIES });
});

// ─── GET /api/activity-targets/position-templates?position=X ─────────────────
router.get('/position-templates', async (req, res) => {
    try {
        await ensureTables();
        const { position } = req.query;
        const [rows] = position
            ? await db.query(
                'SELECT * FROM Activity_Position_Templates WHERE PositionName = ? ORDER BY ActivityKey',
                [position])
            : await db.query(
                'SELECT * FROM Activity_Position_Templates ORDER BY PositionName, ActivityKey');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/activity-targets/scope-overrides?department=X&unit=Y ───────────
router.get('/scope-overrides', async (req, res) => {
    try {
        await ensureTables();
        const { department } = req.query;
        const hasUnit = Object.prototype.hasOwnProperty.call(req.query, 'unit');
        const unit = hasUnit ? String(req.query.unit || '') : null;
        const where = [];
        const params = [];
        if (department) {
            where.push('Department = ?');
            params.push(department);
        }
        if (hasUnit) {
            where.push('Unit = ?');
            params.push(unit);
        }
        const [rows] = await db.query(
            `SELECT * FROM Activity_Scope_Overrides${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY Department, Unit, ActivityKey`,
            params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/coverage-matrix', isAdmin, async (_req, res) => {
    try {
        res.json({ success: true, data: await getCoverageMatrix() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/scope-overrides — upsert/delete scope override ─
router.put('/scope-overrides', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, Unit = '', ActivityKey, YearlyTarget, PassPct, IsNA } = req.body;
        if (!Department || !ActivityKey)
            return res.status(400).json({ success: false, message: 'Department และ ActivityKey จำเป็น' });
        if (!VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });

        if (YearlyTarget === null || YearlyTarget === undefined) {
            await db.query(
                'DELETE FROM Activity_Scope_Overrides WHERE Department = ? AND Unit = ? AND ActivityKey = ?',
                [Department, Unit || '', ActivityKey]);
            return res.json({ success: true, message: 'ลบ scope override สำเร็จ' });
        }

        const isNA = IsNA ? 1 : 0;
        await db.query(`
            INSERT INTO Activity_Scope_Overrides (Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
        `, [Department, Unit || '', ActivityKey, storedTargetValue(ActivityKey, YearlyTarget, isNA), PassPct ?? 80, isNA, req.user.name]);
        res.json({ success: true, message: isNA ? 'บันทึก scope N/A สำเร็จ' : 'บันทึก scope override สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/position-templates — upsert template (admin) ───
router.put('/position-templates', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { PositionName, ActivityKey, YearlyTarget, PassPct, IsNA } = req.body;
        if (!PositionName || !ActivityKey)
            return res.status(400).json({ success: false, message: 'PositionName และ ActivityKey จำเป็น' });
        if (!VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });
        const isNA = IsNA ? 1 : 0;
        await db.query(`
            INSERT INTO Activity_Position_Templates (PositionName, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
        `, [PositionName, ActivityKey, storedTargetValue(ActivityKey, YearlyTarget, isNA), PassPct ?? 80, isNA, req.user.name]);
        res.json({ success: true, message: isNA ? 'บันทึก N/A สำเร็จ' : 'บันทึกเทมเพลตสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/activity-targets/position-templates/bulk-apply ─────────────────
// Apply position template to ALL employees in that position (admin)
router.post('/position-templates/bulk-apply', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { PositionName } = req.body;
        if (!PositionName)
            return res.status(400).json({ success: false, message: 'PositionName จำเป็น' });

        const [templates] = await db.query(
            'SELECT ActivityKey, YearlyTarget, PassPct FROM Activity_Position_Templates WHERE PositionName = ?',
            [PositionName]);
        if (!templates.length)
            return res.status(400).json({ success: false, message: 'ยังไม่มีเทมเพลตสำหรับตำแหน่งนี้' });

        const [employees] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE Position = ?', [PositionName]);
        if (!employees.length)
            return res.json({ success: true, message: 'ไม่มีพนักงานตำแหน่งนี้', updated: 0 });

        for (const emp of employees) {
            for (const tpl of templates) {
                await db.query(`
                    INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, UpdatedBy)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), UpdatedBy=VALUES(UpdatedBy)
                `, [emp.EmployeeID, tpl.ActivityKey, tpl.YearlyTarget, tpl.PassPct, req.user.name]);
            }
        }
        res.json({
            success: true,
            message: `ใช้เทมเพลตกับ ${employees.length} คน (${templates.length} กิจกรรม) สำเร็จ`,
            updated: employees.length * templates.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/activity-targets/employee/:empId ────────────────────────────────
// Merged targets for one employee (admin view)
router.get('/employee/:empId', async (req, res) => {
    try {
        await ensureTables();
        const { overrideMap, scopeMap, templateMap, position, department, unit } = await getMergedTargets(req.params.empId);

        const targets = ACTIVITIES.map(a => {
            const d = overrideMap[a.key] || scopeMap[a.key] || templateMap[a.key] || null;
            return {
                activityKey:  a.key,
                label:        a.label,
                desc:         a.desc,
                metricType:   a.metricType,
                scopeType:    a.scopeType,
                unitLabel:    a.unitLabel,
                targetMode:   a.targetMode,
                yearlyTarget: d?.YearlyTarget ?? null,
                passPct:      d?.PassPct      ?? null,
                isNA:         d?.IsNA ?? 0,
                source:       d?.source       ?? (a.metricType === 'dynamic_ratio' ? 'system' : 'none'),
                scope:        d?.source === 'scope' ? { department: d.Department, unit: d.Unit || '' } : null,
            };
        });
        res.json({ success: true, data: { empId: req.params.empId, position, department, unit, targets } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/employee/:empId — save/delete override (admin) ─
router.put('/employee/:empId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { empId } = req.params;
        const { ActivityKey, YearlyTarget, PassPct, IsNA } = req.body;
        if (!ActivityKey || !VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });

        if (YearlyTarget === null || YearlyTarget === undefined) {
            // null = remove override → revert to position template
            await db.query(
                'DELETE FROM Employee_Activity_Targets WHERE EmployeeID = ? AND ActivityKey = ?',
                [empId, ActivityKey]);
            return res.json({ success: true, message: 'ลบ override สำเร็จ (ใช้ค่าเทมเพลตตำแหน่ง)' });
        }
        const isNA = IsNA ? 1 : 0;
        await db.query(`
            INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
        `, [empId, ActivityKey, storedTargetValue(ActivityKey, YearlyTarget, isNA), PassPct ?? 80, isNA, req.user.name]);
        res.json({ success: true, message: isNA ? 'บันทึก N/A สำเร็จ' : 'บันทึก override สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/activity-targets/me — my targets + actual counts for current year
router.get('/me', async (req, res) => {
    try {
        await ensureTables();
        const empId   = req.user.id;
        const empName = req.user.name;
        const year    = new Date().getFullYear();

        const { overrideMap, scopeMap, templateMap, unit } = await getMergedTargets(empId);
        const dynamicRatios = {
            patrol_issue: await getDynamicActivityRatio('patrol_issue', req.user.department, year),
            yokoten: await getDynamicActivityRatio('yokoten', req.user.department, year),
        };
        const effectiveTarget = key => overrideMap[key] || scopeMap[key] || templateMap[key] || null;
        const peopleCoverages = {};
        for (const activity of ACTIVITIES.filter(a => a.metricType === 'people_coverage')) {
            const target = effectiveTarget(activity.key);
            if (!target) continue;
            peopleCoverages[activity.key] = await getPeopleCoverage(
                activity.key,
                { department: req.user.department, unit },
                year,
                target.YearlyTarget
            );
        }
        const fixedCountAlignments = {
            patrol: await getFixedCountAlignment('patrol', { employeeId: empId, department: req.user.department, unit }, year, effectiveTarget('patrol')?.YearlyTarget),
            ky: await getFixedCountAlignment('ky', { employeeId: empId, department: req.user.department, unit }, year, effectiveTarget('ky')?.YearlyTarget),
        };

        // Actual counts in parallel (silent fail per table)
        const [
            patrolCount, patrolIssueCount, cccfWorkerCount, cccfPermCount, scwCount,
            trainingCount, yokotenCount, hiyariCount, kyCount,
        ] = await Promise.all([
            safeCount('SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE UserID = ? AND YEAR(PatrolDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM Patrol_Issues WHERE ReporterID = ? AND YEAR(DateFound) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE EmployeeID = ? AND YEAR(SubmitDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM CCCF_FormA_Permanent WHERE SubmitterName = ? AND YEAR(SubmitDate) = ?', [empName, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM SCW_Documents WHERE UploadedBy = ? AND YEAR(UploadedAt) = ?', [empName, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID = ? AND YEAR(TrainingDate) = ? AND IsPassed = 1', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE EmployeeID = ? AND YEAR(ResponseDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM HiyariReports WHERE ReporterID = ? AND YEAR(ReportDate) = ?', [empId, year]),
            safeCount('SELECT COUNT(*) AS cnt FROM KY_Activities WHERE ReporterID = ? AND YEAR(ActivityDate) = ?', [empId, year]),
        ]);

        const actualMap = {
            patrol:         patrolCount,
            patrol_issue:   patrolIssueCount,
            cccf_worker:    cccfWorkerCount,
            cccf_permanent: cccfPermCount,
            scw:            scwCount,
            training:       trainingCount,
            yokoten:        yokotenCount,
            hiyari:         hiyariCount,
            ky:             kyCount,
        };

        const targets = ACTIVITIES.map(a => {
            const d           = overrideMap[a.key] || scopeMap[a.key] || templateMap[a.key] || null;
            const ratio       = dynamicRatios[a.key] || peopleCoverages[a.key] || fixedCountAlignments[a.key] || null;
            const yearlyTarget = d?.YearlyTarget ?? null;
            const passPct     = d?.PassPct       ?? 80;
            const isNA        = d?.IsNA ? true : false;
            const actual      = actualMap[a.key];
            const pct         = ratio ? ratio.completionPct : yearlyTarget && !isNA && actual !== null
                ? Math.min(Math.round((actual / yearlyTarget) * 100), 100)
                : null;
            return {
                activityKey:   a.key,
                label:         a.label,
                desc:          a.desc,
                metricType:    a.metricType,
                scopeType:     a.scopeType,
                unitLabel:     a.unitLabel,
                targetMode:    a.targetMode,
                yearlyTarget:  ratio ? ratio.denominator : yearlyTarget,
                passPct,
                isNA,
                source:        d?.source || (ratio?.targetSource && ratio.targetSource !== 'activity_target' ? 'module' : ratio ? 'system' : 'none'),
                scope:         d?.source === 'scope' ? { department: d.Department, unit: d.Unit || '' } : null,
                actualCount:   ratio ? ratio.numerator : actual,
                completionPct: pct,
                passed:        pct !== null ? pct >= passPct : null,
                noData:        ratio ? ratio.noData : false,
                calculationScope: ratio ? (ratio.calculationScope || { type: 'department', department: ratio.department }) : null,
                calculationMethod: ratio?.calculationMethod || null,
                targetSource: ratio?.targetSource || null,
            };
        }).filter(t => t.metricType === 'dynamic_ratio' ? !t.isNA : t.yearlyTarget !== null && !t.isNA);

        res.json({ success: true, data: { year, targets } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
module.exports.getCoverageMatrix = getCoverageMatrix;
module.exports.getMergedTargets = getMergedTargets;
module.exports.getDynamicActivityRatio = getDynamicActivityRatio;
module.exports.getPeopleCoverage = getPeopleCoverage;
module.exports.getFixedCountAlignment = getFixedCountAlignment;
module.exports.ACTIVITIES = ACTIVITIES;
