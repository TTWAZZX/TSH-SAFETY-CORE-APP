// backend/routes/activity-targets.js
// Auth applied at mount level (authenticateToken). Write ops require isAdmin.
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { isAdmin } = require('../middleware/auth');
const { getCccfWorkerProgress } = require('../utils/cccf-worker-progress');
const {
    buildMandatoryPolicyTarget,
    isAdminConfiguredTargetEligible,
} = require('../utils/personal-target-eligibility');

// ─── Activity definitions (static metadata) ───────────────────────────────────
const ACTIVITIES = [
    { key: 'patrol',         label: 'Safety Patrol',           desc: 'จำนวนครั้งเดินตรวจ Safety Patrol',       metricType: 'fixed_count',     scopeType: 'person_position',   unitLabel: 'ครั้ง',   targetMode: 'manual' },
    { key: 'patrol_issue',   label: 'รายงานประเด็นปัญหา',     desc: 'อัตราปิดประเด็นที่แผนกรับผิดชอบ',       metricType: 'dynamic_ratio',   scopeType: 'department',        unitLabel: '%',      targetMode: 'system_denominator' },
    { key: 'cccf_worker',    label: 'CCCF Form A Worker',      desc: 'ความครบถ้วนของพนักงานใน Unit ที่ต้องมี Form A',       metricType: 'people_coverage', scopeType: 'unit',              unitLabel: 'คน',   targetMode: 'manual' },
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

function parseTargetYear(value, fallback = null) {
    if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
    const raw = String(value).trim();
    if (!/^\d{4}$/.test(raw)) {
        return { ok: false, message: 'TargetYear must be an integer from 2000 to 2100.' };
    }
    const year = Number(raw);
    return year >= 2000 && year <= 2100
        ? { ok: true, value: year }
        : { ok: false, message: 'TargetYear must be an integer from 2000 to 2100.' };
}

function validatedTargetValues(body, isNA) {
    const rawTarget = body.YearlyTarget;
    if (!isNA && !/^\d+$/.test(String(rawTarget ?? '').trim())) {
        return { ok: false, message: 'YearlyTarget must be a non-negative integer.' };
    }
    const rawPassPct = body.PassPct ?? 80;
    if (!/^\d+$/.test(String(rawPassPct).trim())) {
        return { ok: false, message: 'PassPct must be an integer from 0 to 100.' };
    }
    const passPct = Number(rawPassPct);
    if (passPct < 0 || passPct > 100) {
        return { ok: false, message: 'PassPct must be an integer from 0 to 100.' };
    }
    return { ok: true, yearlyTarget: isNA ? 0 : Number(rawTarget), passPct };
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
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Position_Template_Years (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            PositionName VARCHAR(100) NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            TargetYear   INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pos_act_year (PositionName, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Scope_Override_Years (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            Department   VARCHAR(150) NOT NULL,
            Unit         VARCHAR(150) NOT NULL DEFAULT '',
            ActivityKey  VARCHAR(50)  NOT NULL,
            TargetYear   INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_scope_act_year (Department, Unit, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Employee_Activity_Target_Years (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID   VARCHAR(50)  NOT NULL,
            ActivityKey  VARCHAR(50)  NOT NULL,
            TargetYear   INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct      INT NOT NULL DEFAULT 80,
            IsNA         TINYINT(1)   NOT NULL DEFAULT 0,
            UpdatedBy    VARCHAR(100),
            UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp_act_year (EmployeeID, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
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

async function getMandatoryPolicyTarget(employeeId, year) {
    try {
        const [[policy]] = await db.query(
            `SELECT p.id, p.PolicyTitle AS title,
                    EXISTS(
                        SELECT 1 FROM Policy_Acknowledgements pa
                         WHERE pa.PolicyID=p.id AND pa.UserID=?
                    ) AS acknowledged
               FROM Policies p
              WHERE p.IsCurrent=1
              ORDER BY p.EffectiveDate DESC, p.id DESC
              LIMIT 1`,
            [employeeId]
        );
        return buildMandatoryPolicyTarget({
            available: true,
            policy: policy ? { id: policy.id, title: policy.title } : null,
            acknowledged: Boolean(policy?.acknowledged),
        }, year);
    } catch (error) {
        return buildMandatoryPolicyTarget({ available: false, error: error.message }, year);
    }
}

// ─── Helper: merge position template + per-person override ────────────────────
async function getMergedTargets(empId, year = new Date().getFullYear(), options = {}) {
    if (options.ensureSchema !== false) await ensureTables();
    const safeYear = Math.max(2000, Math.min(2100, Number(year) || new Date().getFullYear()));
    const [[emp]] = await db.query('SELECT Position, Department, Unit FROM Employees WHERE EmployeeID = ?', [empId]);
    const position = emp?.Position || null;
    const department = emp?.Department || null;
    const unit = emp?.Unit || '';

    const [legacyPosTemplates] = position
        ? await db.query(
            'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates WHERE PositionName = ?',
            [position])
        : [[]];
    const [yearPosTemplates] = position
        ? await db.query(
            `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear
               FROM Activity_Position_Template_Years
              WHERE PositionName = ? AND TargetYear IN (?, 0)
              ORDER BY CASE WHEN TargetYear = ? THEN 0 ELSE 1 END`,
            [position, safeYear, safeYear])
        : [[]];

    const [legacyScopeOverrides] = department
        ? await db.query(
            `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, Department, Unit
               FROM Activity_Scope_Overrides
              WHERE Department = ? AND (Unit = ? OR Unit = '')
              ORDER BY CASE WHEN Unit = ? THEN 0 ELSE 1 END`,
            [department, unit, unit])
        : [[]];
    const [yearScopeOverrides] = department
        ? await db.query(
            `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, Department, Unit, TargetYear
               FROM Activity_Scope_Override_Years
              WHERE Department = ? AND (Unit = ? OR Unit = '') AND TargetYear IN (?, 0)
              ORDER BY CASE WHEN TargetYear = ? THEN 0 ELSE 1 END,
                       CASE WHEN Unit = ? THEN 0 ELSE 1 END`,
            [department, unit, safeYear, safeYear, unit])
        : [[]];

    const [legacyOverrides] = await db.query(
        'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets WHERE EmployeeID = ?',
        [empId]);
    const [yearOverrides] = await db.query(
        `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear
           FROM Employee_Activity_Target_Years
          WHERE EmployeeID = ? AND TargetYear IN (?, 0)
          ORDER BY CASE WHEN TargetYear = ? THEN 0 ELSE 1 END`,
        [empId, safeYear, safeYear]);

    const overrideMap = {};
    legacyOverrides.forEach(o => { overrideMap[o.ActivityKey] = { ...o, source: 'override', targetYear: null }; });
    yearOverrides.forEach(o => {
        if (!overrideMap[o.ActivityKey] || Number(o.TargetYear || 0) === safeYear) {
            overrideMap[o.ActivityKey] = { ...o, source: 'override', targetYear: Number(o.TargetYear || 0) };
        }
    });
    const templateMap = {};
    legacyPosTemplates.forEach(t => { templateMap[t.ActivityKey] = { ...t, source: 'template', targetYear: null }; });
    yearPosTemplates.forEach(t => {
        if (!templateMap[t.ActivityKey] || Number(t.TargetYear || 0) === safeYear) {
            templateMap[t.ActivityKey] = { ...t, source: 'template', targetYear: Number(t.TargetYear || 0) };
        }
    });
    const legacyScopeMap = new Map();
    legacyScopeOverrides.forEach(s => {
        legacyScopeMap.set(`${String(s.Department || '').trim()}::${String(s.Unit || '').trim()}::${s.ActivityKey}`, { ...s, source: 'scope', targetYear: null });
    });
    const yearScopeMap = new Map();
    yearScopeOverrides.forEach(s => {
        const mapKey = `${String(s.Department || '').trim()}::${String(s.Unit || '').trim()}::${s.ActivityKey}`;
        if (!yearScopeMap.has(mapKey) || Number(s.TargetYear || 0) === safeYear) {
            yearScopeMap.set(mapKey, { ...s, source: 'scope', targetYear: Number(s.TargetYear || 0) });
        }
    });
    const scopeMap = {};
    ACTIVITIES.forEach(activity => {
        const unitKey = `${String(department || '').trim()}::${String(unit || '').trim()}::${activity.key}`;
        const departmentKey = `${String(department || '').trim()}::::${activity.key}`;
        const row = yearScopeMap.get(unitKey)
            || legacyScopeMap.get(unitKey)
            || yearScopeMap.get(departmentKey)
            || legacyScopeMap.get(departmentKey);
        if (row) scopeMap[activity.key] = row;
    });

    return { position, department, unit, targetYear: safeYear, overrideMap, scopeMap, templateMap };
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
                `SELECT COUNT(*) AS numerator
                   FROM CCCF_FormA_Worker
                  WHERE TRIM(COALESCE(Department, '')) = ? AND YEAR(SubmitDate) = ?${unitFilter}`,
                params
            );
            return peopleCoverageResult(row?.numerator, yearlyTarget, dept, scopedUnit, 'worker_form_records');
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
            const [[actualRow]] = await db.query(
                `SELECT
                    (SELECT COUNT(*) FROM Patrol_Attendance WHERE UserID = ? AND YEAR(PatrolDate) = ?) +
                    (SELECT COUNT(*) FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?) AS numerator`,
                [empId, year, empId, year]
            );
            return fixedCountResult(
                actualRow?.numerator,
                fallbackTarget,
                { type: 'employee', employeeId: empId },
                'patrol_attendance_plus_self_checkin',
                'activity_target'
            );
        }
        if (activityKey === 'ky') {
            const [[configRow]] = await db.query(
                'SELECT SafetyUnits FROM KY_Program_Config WHERE Year = ? AND Department = ? AND IsActive = 1 LIMIT 1',
                [year, dept]
            );
            const units = parseList(configRow?.SafetyUnits);
            const useUnit = scopedUnit && units.includes(scopedUnit);
            const [[actualRow]] = await db.query(
                `SELECT COUNT(*) AS numerator FROM KY_Activities
                  WHERE Department = ? ${useUnit ? 'AND SafetyUnit = ?' : ''} AND YEAR(ActivityDate) = ?`,
                useUnit ? [dept, scopedUnit, year] : [dept, year]
            );
            return fixedCountResult(
                actualRow?.numerator,
                fallbackTarget,
                { type: useUnit ? 'department_unit' : 'department', department: dept, unit: useUnit ? scopedUnit : '' },
                'ky_scope_activity_count',
                'activity_target'
            );
        }
    } catch {
        return fixedCountResult(0, fallbackTarget, null, 'source_unavailable', 'activity_target');
    }
    return fixedCountResult(0, fallbackTarget, null, 'source_unavailable', 'activity_target');
}

async function getCoverageMatrix(year = new Date().getFullYear(), options = {}) {
    if (options.ensureSchema !== false) await ensureTables();
    const targetYear = Number(year || new Date().getFullYear());
    const versioned = targetYear >= 2000 && targetYear <= 2100;
    const [[employees], [templates], [scopes], [overrides], [yearTemplates], [yearScopes], [yearOverrides]] = await Promise.all([
        db.query(`SELECT EmployeeID, EmployeeName, Department, Unit, Position
                    FROM Employees
                   WHERE COALESCE(EmployeeID, '') <> ''
                   ORDER BY Department, Unit, Position, EmployeeName`),
        db.query('SELECT PositionName, ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates'),
        db.query('SELECT Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Scope_Overrides'),
        db.query('SELECT EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets'),
        versioned
            ? db.query('SELECT PositionName, ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear FROM Activity_Position_Template_Years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [targetYear, targetYear])
            : [[]],
        versioned
            ? db.query('SELECT Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear FROM Activity_Scope_Override_Years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [targetYear, targetYear])
            : [[]],
        versioned
            ? db.query('SELECT EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear FROM Employee_Activity_Target_Years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [targetYear, targetYear])
            : [[]],
    ]);
    const templateMap = new Map(templates.map(r => [`${String(r.PositionName || '').trim()}::${r.ActivityKey}`, r]));
    const scopeMap = new Map(scopes.map(r => [`${String(r.Department || '').trim()}::${String(r.Unit || '').trim()}::${r.ActivityKey}`, r]));
    const overrideMap = new Map(overrides.map(r => [`${r.EmployeeID}::${r.ActivityKey}`, r]));
    yearTemplates.forEach(r => {
        const key = `${String(r.PositionName || '').trim()}::${r.ActivityKey}`;
        if (!templateMap.has(key) || Number(r.TargetYear || 0) === targetYear) templateMap.set(key, { ...r, targetYear: Number(r.TargetYear || 0) });
    });
    yearScopes.forEach(r => {
        const key = `${String(r.Department || '').trim()}::${String(r.Unit || '').trim()}::${r.ActivityKey}`;
        if (!scopeMap.has(key) || Number(r.TargetYear || 0) === targetYear) scopeMap.set(key, { ...r, targetYear: Number(r.TargetYear || 0) });
    });
    yearOverrides.forEach(r => {
        const key = `${r.EmployeeID}::${r.ActivityKey}`;
        if (!overrideMap.has(key) || Number(r.TargetYear || 0) === targetYear) overrideMap.set(key, { ...r, targetYear: Number(r.TargetYear || 0) });
    });
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
            const source = override ? 'override' : scope ? 'scope' : template ? 'template' : 'missing';
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
                targetYear: row?.targetYear ?? null,
                scope: source === 'scope' ? { department: row.Department || '', unit: row.Unit || '' } : null,
            });
            summary.slots += 1;
            summary[source] += 1;
            if (isNA) summary.na += 1;
            if (isZero) summary.zero += 1;
            if (reviewNeeded) summary.review += 1;
        }
    }
    return { targetYear, summary, rows };
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
        const yearResult = parseTargetYear(req.query.TargetYear ?? req.query.year);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;
        const [legacyRows] = position
            ? await db.query(
                'SELECT * FROM Activity_Position_Templates WHERE PositionName = ? ORDER BY ActivityKey',
                [position])
            : await db.query(
                'SELECT * FROM Activity_Position_Templates ORDER BY PositionName, ActivityKey');
        let rows = legacyRows.map(r => ({ ...r, targetYear: null }));
        if (versioned) {
            const [yearRows] = position
                ? await db.query(
                    'SELECT * FROM Activity_Position_Template_Years WHERE PositionName = ? AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END, ActivityKey',
                    [position, targetYear, targetYear])
                : await db.query(
                    'SELECT * FROM Activity_Position_Template_Years WHERE TargetYear IN (?,0) ORDER BY PositionName, ActivityKey, CASE WHEN TargetYear=? THEN 0 ELSE 1 END',
                    [targetYear, targetYear]);
            const map = new Map(rows.map(r => [`${r.PositionName}::${r.ActivityKey}`, r]));
            yearRows.forEach(r => {
                const key = `${r.PositionName}::${r.ActivityKey}`;
                if (!map.has(key) || Number(r.TargetYear || 0) === targetYear) {
                    map.set(key, { ...r, targetYear: Number(r.TargetYear || 0) });
                }
            });
            rows = Array.from(map.values()).sort((a, b) => String(a.PositionName || '').localeCompare(String(b.PositionName || '')) || String(a.ActivityKey || '').localeCompare(String(b.ActivityKey || '')));
        }
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
        const yearResult = parseTargetYear(req.query.TargetYear ?? req.query.year);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;
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
        const [legacyRows] = await db.query(
            `SELECT * FROM Activity_Scope_Overrides${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY Department, Unit, ActivityKey`,
            params);
        let rows = legacyRows.map(r => ({ ...r, targetYear: null }));
        if (versioned) {
            const yearWhere = [...where, 'TargetYear IN (?,0)'];
            const yearParams = [...params, targetYear];
            const [yearRows] = await db.query(
                `SELECT * FROM Activity_Scope_Override_Years WHERE ${yearWhere.join(' AND ')} ORDER BY Department, Unit, ActivityKey, CASE WHEN TargetYear=? THEN 0 ELSE 1`,
                [...yearParams, targetYear]);
            const map = new Map(rows.map(r => [`${r.Department}::${r.Unit || ''}::${r.ActivityKey}`, r]));
            yearRows.forEach(r => {
                const key = `${r.Department}::${r.Unit || ''}::${r.ActivityKey}`;
                if (!map.has(key) || Number(r.TargetYear || 0) === targetYear) {
                    map.set(key, { ...r, targetYear: Number(r.TargetYear || 0) });
                }
            });
            rows = Array.from(map.values()).sort((a, b) => String(a.Department || '').localeCompare(String(b.Department || '')) || String(a.Unit || '').localeCompare(String(b.Unit || '')) || String(a.ActivityKey || '').localeCompare(String(b.ActivityKey || '')));
        }
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/coverage-matrix', isAdmin, async (req, res) => {
    try {
        const yearResult = parseTargetYear(req.query.TargetYear ?? req.query.year, new Date().getFullYear());
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        res.json({ success: true, data: await getCoverageMatrix(yearResult.value) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/scope-overrides — upsert/delete scope override ─
router.put('/scope-overrides', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { Department, Unit = '', ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear } = req.body;
        if (!Department || !ActivityKey)
            return res.status(400).json({ success: false, message: 'Department และ ActivityKey จำเป็น' });
        if (!VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });

        const yearResult = parseTargetYear(TargetYear);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;
        if (YearlyTarget === null || YearlyTarget === undefined) {
            await db.query(
                versioned
                    ? 'DELETE FROM Activity_Scope_Override_Years WHERE Department = ? AND Unit = ? AND ActivityKey = ? AND TargetYear = ?'
                    : 'DELETE FROM Activity_Scope_Overrides WHERE Department = ? AND Unit = ? AND ActivityKey = ?',
                versioned ? [Department, Unit || '', ActivityKey, targetYear] : [Department, Unit || '', ActivityKey]);
            return res.json({ success: true, message: 'ลบ scope override สำเร็จ' });
        }

        const isNA = IsNA ? 1 : 0;
        const values = validatedTargetValues(req.body, Boolean(isNA));
        if (!values.ok) return res.status(400).json({ success: false, message: values.message });
        if (versioned) {
            await db.query(`
                INSERT INTO Activity_Scope_Override_Years (Department, Unit, ActivityKey, TargetYear, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [Department, Unit || '', ActivityKey, targetYear, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        } else {
            await db.query(`
                INSERT INTO Activity_Scope_Overrides (Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [Department, Unit || '', ActivityKey, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        }
        res.json({ success: true, message: isNA ? 'บันทึก scope N/A สำเร็จ' : 'บันทึก scope override สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/position-templates — upsert template (admin) ───
router.put('/position-templates', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { PositionName, ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear } = req.body;
        if (!PositionName || !ActivityKey)
            return res.status(400).json({ success: false, message: 'PositionName และ ActivityKey จำเป็น' });
        if (!VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });
        const isNA = IsNA ? 1 : 0;
        const yearResult = parseTargetYear(TargetYear);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;
        const values = validatedTargetValues(req.body, Boolean(isNA));
        if (!values.ok) return res.status(400).json({ success: false, message: values.message });
        if (versioned) {
            await db.query(`
                INSERT INTO Activity_Position_Template_Years (PositionName, ActivityKey, TargetYear, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [PositionName, ActivityKey, targetYear, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        } else {
            await db.query(`
                INSERT INTO Activity_Position_Templates (PositionName, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [PositionName, ActivityKey, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        }
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
        const { PositionName, TargetYear } = req.body;
        if (!PositionName)
            return res.status(400).json({ success: false, message: 'PositionName จำเป็น' });
        const yearResult = parseTargetYear(TargetYear);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;

        const [templates] = await db.query(
            versioned
                ? `SELECT ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear
                     FROM Activity_Position_Template_Years
                    WHERE PositionName = ? AND TargetYear IN (?,0)
                    ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END`
                : 'SELECT ActivityKey, YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates WHERE PositionName = ?',
            versioned ? [PositionName, targetYear, targetYear] : [PositionName]);
        const effectiveTemplates = versioned
            ? Array.from(templates.reduce((map, row) => {
                if (!map.has(row.ActivityKey) || Number(row.TargetYear || 0) === targetYear) map.set(row.ActivityKey, row);
                return map;
            }, new Map()).values())
            : templates;
        if (!effectiveTemplates.length)
            return res.status(400).json({ success: false, message: 'ยังไม่มีเทมเพลตสำหรับตำแหน่งนี้' });

        const [employees] = await db.query(
            'SELECT EmployeeID FROM Employees WHERE Position = ?', [PositionName]);
        if (!employees.length)
            return res.json({ success: true, message: 'ไม่มีพนักงานตำแหน่งนี้', updated: 0 });

        for (const emp of employees) {
            for (const tpl of effectiveTemplates) {
                if (versioned) {
                    await db.query(`
                        INSERT INTO Employee_Activity_Target_Years (EmployeeID, ActivityKey, TargetYear, YearlyTarget, PassPct, IsNA, UpdatedBy)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
                    `, [emp.EmployeeID, tpl.ActivityKey, targetYear, tpl.YearlyTarget, tpl.PassPct, tpl.IsNA || 0, req.user.name]);
                } else {
                    await db.query(`
                        INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
                    `, [emp.EmployeeID, tpl.ActivityKey, tpl.YearlyTarget, tpl.PassPct, tpl.IsNA || 0, req.user.name]);
                }
            }
        }
        res.json({
            success: true,
            message: `ใช้เทมเพลตกับ ${employees.length} คน (${effectiveTemplates.length} กิจกรรม) สำเร็จ`,
            updated: employees.length * effectiveTemplates.length,
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
        const yearResult = parseTargetYear(req.query.TargetYear ?? req.query.year, new Date().getFullYear());
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const { overrideMap, scopeMap, templateMap, position, department, unit, targetYear } = await getMergedTargets(req.params.empId, yearResult.value);

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
                source:       d?.source       ?? 'none',
                targetYear:   d?.targetYear   ?? null,
                scope:        d?.source === 'scope' ? { department: d.Department, unit: d.Unit || '' } : null,
            };
        });
        res.json({ success: true, data: { empId: req.params.empId, position, department, unit, targetYear, targets } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/activity-targets/employee/:empId — save/delete override (admin) ─
router.put('/employee/:empId', isAdmin, async (req, res) => {
    try {
        await ensureTables();
        const { empId } = req.params;
        const { ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear } = req.body;
        if (!ActivityKey || !VALID_KEYS.has(ActivityKey))
            return res.status(400).json({ success: false, message: 'ActivityKey ไม่ถูกต้อง' });

        const yearResult = parseTargetYear(TargetYear);
        if (!yearResult.ok) return res.status(400).json({ success: false, message: yearResult.message });
        const targetYear = yearResult.value;
        const versioned = targetYear !== null;
        if (YearlyTarget === null || YearlyTarget === undefined) {
            // null = remove override → revert to position template
            await db.query(
                versioned
                    ? 'DELETE FROM Employee_Activity_Target_Years WHERE EmployeeID = ? AND ActivityKey = ? AND TargetYear = ?'
                    : 'DELETE FROM Employee_Activity_Targets WHERE EmployeeID = ? AND ActivityKey = ?',
                versioned ? [empId, ActivityKey, targetYear] : [empId, ActivityKey]);
            return res.json({ success: true, message: 'ลบ override สำเร็จ (ใช้ค่าเทมเพลตตำแหน่ง)' });
        }
        const isNA = IsNA ? 1 : 0;
        const values = validatedTargetValues(req.body, Boolean(isNA));
        if (!values.ok) return res.status(400).json({ success: false, message: values.message });
        if (versioned) {
            await db.query(`
                INSERT INTO Employee_Activity_Target_Years (EmployeeID, ActivityKey, TargetYear, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [empId, ActivityKey, targetYear, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        } else {
            await db.query(`
                INSERT INTO Employee_Activity_Targets (EmployeeID, ActivityKey, YearlyTarget, PassPct, IsNA, UpdatedBy)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget), PassPct=VALUES(PassPct), IsNA=VALUES(IsNA), UpdatedBy=VALUES(UpdatedBy)
            `, [empId, ActivityKey, storedTargetValue(ActivityKey, values.yearlyTarget, isNA), values.passPct, isNA, req.user.name]);
        }
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
        const effectiveTarget = key => overrideMap[key] || scopeMap[key] || templateMap[key] || null;
        const eligibleActivities = ACTIVITIES.filter(activity =>
            isAdminConfiguredTargetEligible(activity, effectiveTarget(activity.key)).eligible
        );
        const eligibleKeys = new Set(eligibleActivities.map(activity => activity.key));
        const mandatoryPolicyTarget = await getMandatoryPolicyTarget(empId, year);
        const dynamicRatios = {};
        for (const activity of eligibleActivities.filter(activity => activity.metricType === 'dynamic_ratio')) {
            dynamicRatios[activity.key] = await getDynamicActivityRatio(
                activity.key,
                req.user.department,
                year
            );
        }
        const peopleCoverages = {};
        for (const activity of eligibleActivities.filter(a => a.metricType === 'people_coverage')) {
            const target = effectiveTarget(activity.key);
            const isPersonalCccfWorker = activity.key === 'cccf_worker'
                && templateMap.cccf_worker
                && !templateMap.cccf_worker.IsNA
                && Number(templateMap.cccf_worker.YearlyTarget || 0) > 0;
            if (isPersonalCccfWorker) continue;
            peopleCoverages[activity.key] = await getPeopleCoverage(
                activity.key,
                { department: req.user.department, unit },
                year,
                target.YearlyTarget
            );
        }
        const fixedCountAlignments = {};
        for (const activity of eligibleActivities.filter(activity => ['patrol', 'ky'].includes(activity.key))) {
            fixedCountAlignments[activity.key] = await getFixedCountAlignment(
                activity.key,
                { employeeId: empId, department: req.user.department, unit },
                year,
                effectiveTarget(activity.key).YearlyTarget
            );
        }
        const cccfWorkerProgress = eligibleKeys.has('cccf_worker')
            ? await getCccfWorkerProgress(db, year).catch(() => ({ employees: [] }))
            : { employees: [] };
        const cccfWorkerSelf = (cccfWorkerProgress.employees || [])
            .find(row => String(row.employeeId || '').trim() === String(empId || '').trim()) || null;

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
            cccf_worker:    cccfWorkerSelf ? Number(cccfWorkerSelf.actualTowardTarget || 0) : cccfWorkerCount,
            cccf_permanent: cccfPermCount,
            scw:            scwCount,
            training:       trainingCount,
            yokoten:        yokotenCount,
            hiyari:         hiyariCount,
            ky:             kyCount,
        };

        const additionalTargets = eligibleActivities.map(a => {
            const d           = overrideMap[a.key] || scopeMap[a.key] || templateMap[a.key] || null;
            const ratio       = dynamicRatios[a.key] || peopleCoverages[a.key] || fixedCountAlignments[a.key] || null;
            const yearlyTarget = a.key === 'cccf_worker' && cccfWorkerSelf
                ? Number(cccfWorkerSelf.target || 0)
                : d?.YearlyTarget ?? null;
            const passPct     = d?.PassPct       ?? 80;
            const isNA        = d?.IsNA ? true : false;
            const actual      = actualMap[a.key];
            const pct         = ratio ? ratio.completionPct : yearlyTarget && !isNA && actual !== null
                ? Math.min(Math.round((actual / yearlyTarget) * 100), 100)
                : null;
            const isPersonalCccfWorker = a.key === 'cccf_worker'
                && templateMap.cccf_worker
                && !templateMap.cccf_worker.IsNA
                && Number(templateMap.cccf_worker.YearlyTarget || 0) > 0;
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
                source:        d.source,
                eligibilityType: 'admin_configured',
                eligibilitySource: d.source,
                isMandatory: false,
                targetYear:    d?.targetYear ?? null,
                scope:         d?.source === 'scope' ? { department: d.Department, unit: d.Unit || '' } : null,
                actualCount:   ratio ? ratio.numerator : actual,
                completionPct: pct,
                passed:        pct !== null ? pct >= passPct : null,
                noData:        ratio ? ratio.noData : false,
                calculationScope: isPersonalCccfWorker
                    ? { type: 'employee', employeeId: empId }
                    : ratio ? (ratio.calculationScope || { type: 'department', department: ratio.department }) : null,
                rawRecords:     a.key === 'cccf_worker' && cccfWorkerSelf ? Number(cccfWorkerSelf.rawRecords || 0) : undefined,
                calculationMethod: isPersonalCccfWorker ? 'cccf_worker_progress_engine_actual_toward_target' : (ratio?.calculationMethod || null),
                targetSource: ratio?.targetSource || null,
                measurementSource: ratio?.targetSource && ratio.targetSource !== 'activity_target'
                    ? 'module'
                    : ratio ? 'system' : 'employee_activity',
            };
        });
        const targets = [mandatoryPolicyTarget, ...additionalTargets];
        const eligibility = {
            mandatoryTargets: 1,
            additionalConfiguredTargets: additionalTargets.length,
            hasAdditionalConfiguredTargets: additionalTargets.length > 0,
            emptyState: additionalTargets.length ? null : 'NO_ADDITIONAL_ADMIN_TARGETS',
        };

        res.json({ success: true, data: { year, targets, eligibility } });
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
