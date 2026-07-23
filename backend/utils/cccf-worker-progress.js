async function ensureCccfWorkerVersionTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Position_Template_Years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            PositionName VARCHAR(100) NOT NULL,
            ActivityKey VARCHAR(50) NOT NULL,
            TargetYear INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pos_act_year (PositionName, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Activity_Scope_Override_Years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Department VARCHAR(150) NOT NULL,
            Unit VARCHAR(150) NOT NULL DEFAULT '',
            ActivityKey VARCHAR(50) NOT NULL,
            TargetYear INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_scope_act_year (Department, Unit, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS Employee_Activity_Target_Years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID VARCHAR(50) NOT NULL,
            ActivityKey VARCHAR(50) NOT NULL,
            TargetYear INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp_act_year (EmployeeID, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS CCCF_Worker_Target_Snapshots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID VARCHAR(50) NOT NULL,
            TargetYear INT NOT NULL,
            Department VARCHAR(150) NOT NULL DEFAULT '',
            Unit VARCHAR(150) NOT NULL DEFAULT '',
            PositionName VARCHAR(150) NOT NULL DEFAULT '',
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            TargetSource VARCHAR(30) NOT NULL DEFAULT 'position',
            SnapshotReason VARCHAR(80) NOT NULL DEFAULT 'manual',
            SnapshotAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_employee_year (EmployeeID, TargetYear),
            KEY idx_target_year (TargetYear),
            KEY idx_unit_year (Unit, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const migrations = [
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD COLUMN YearlyTarget INT NOT NULL DEFAULT 0 AFTER PositionName",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD COLUMN TargetSource VARCHAR(30) NOT NULL DEFAULT 'position' AFTER IsNA",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD COLUMN SnapshotReason VARCHAR(80) NOT NULL DEFAULT 'manual' AFTER TargetSource",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD COLUMN SnapshotAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER SnapshotReason",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD COLUMN UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER CreatedAt",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD UNIQUE KEY uq_employee_year (EmployeeID, TargetYear)",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD KEY idx_target_year (TargetYear)",
        "ALTER TABLE CCCF_Worker_Target_Snapshots ADD KEY idx_unit_year (Unit, TargetYear)",
        "UPDATE CCCF_Worker_Target_Snapshots SET YearlyTarget=TargetValue WHERE YearlyTarget=0 AND TargetValue IS NOT NULL",
        "UPDATE CCCF_Worker_Target_Snapshots SET TargetSource=SourceType WHERE (TargetSource='' OR TargetSource='position') AND SourceType IS NOT NULL AND SourceType<>''",
    ];
    for (const sql of migrations) {
        try { await db.query(sql); } catch (_) {}
    }
}

function mapLatestByKey(rows, keyFn, year) {
    const out = new Map();
    for (const row of rows || []) {
        const key = keyFn(row);
        if (!key) continue;
        const rowYear = Number(row.TargetYear || 0);
        if (!out.has(key) || rowYear === year) out.set(key, row);
    }
    return out;
}

async function getCccfWorkerProgress(db, year, options = {}) {
    const safeYear = Math.max(2000, Math.min(2100, Number(year) || new Date().getFullYear()));
    if (options.ensureSchema !== false) await ensureCccfWorkerVersionTables(db);
    const [[employees], [legacyScopes], [legacyOverrides], [recordCounts], [rawUnits], [unitTargets], [masterUnits], [templateYears], [scopeYears], [overrideYears], [snapshots]] = await Promise.all([
        db.query(`SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,
                         p.YearlyTarget AS TemplateTarget,p.PassPct AS TemplatePassPct
                    FROM Employees e
                    LEFT JOIN Activity_Position_Templates p
                      ON p.PositionName=e.Position
                     AND p.ActivityKey='cccf_worker'
                     AND COALESCE(p.IsNA,0)=0
                   WHERE COALESCE(e.EmployeeID,'')<>''`),
        db.query("SELECT Department,Unit,YearlyTarget,PassPct,IsNA FROM Activity_Scope_Overrides WHERE ActivityKey='cccf_worker'"),
        db.query("SELECT EmployeeID,YearlyTarget,PassPct,IsNA FROM Employee_Activity_Targets WHERE ActivityKey='cccf_worker'"),
        db.query('SELECT EmployeeID,COUNT(*) AS recordCount FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=? GROUP BY EmployeeID', [safeYear]),
        db.query("SELECT TRIM(COALESCE(SafetyUnit,'')) AS Unit,MAX(TRIM(COALESCE(Department,''))) AS Department,COUNT(*) AS rawRecords FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=? GROUP BY TRIM(COALESCE(SafetyUnit,''))", [safeYear]),
        db.query('SELECT unit_name AS Unit,yearly_target AS UnitTarget FROM CCCF_Unit_Targets WHERE target_year=?', [safeYear]),
        db.query("SELECT TRIM(u.name) AS Unit,TRIM(COALESCE(d.Name,'')) AS Department FROM Master_SafetyUnits u LEFT JOIN Master_Departments d ON d.id=u.department_id"),
        db.query("SELECT PositionName,YearlyTarget,PassPct,IsNA,TargetYear FROM Activity_Position_Template_Years WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END", [safeYear, safeYear]),
        db.query("SELECT Department,Unit,YearlyTarget,PassPct,IsNA,TargetYear FROM Activity_Scope_Override_Years WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END", [safeYear, safeYear]),
        db.query("SELECT EmployeeID,YearlyTarget,PassPct,IsNA,TargetYear FROM Employee_Activity_Target_Years WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END", [safeYear, safeYear]),
        db.query('SELECT EmployeeID,Department,Unit,PositionName,YearlyTarget,PassPct,IsNA,TargetSource,TargetYear FROM CCCF_Worker_Target_Snapshots WHERE TargetYear=?', [safeYear]),
    ]);

    const legacyScopeMap = new Map(legacyScopes.map(row => [`${String(row.Department || '').trim()}::${String(row.Unit || '').trim()}`, row]));
    const legacyOverrideMap = new Map(legacyOverrides.map(row => [String(row.EmployeeID || '').trim(), row]));
    const templateYearMap = mapLatestByKey(templateYears, row => String(row.PositionName || '').trim(), safeYear);
    const scopeYearMap = mapLatestByKey(scopeYears, row => `${String(row.Department || '').trim()}::${String(row.Unit || '').trim()}`, safeYear);
    const overrideYearMap = mapLatestByKey(overrideYears, row => String(row.EmployeeID || '').trim(), safeYear);
    const snapshotMap = new Map(snapshots.map(row => [String(row.EmployeeID || '').trim(), row]));
    const recordMap = new Map(recordCounts.map(row => [String(row.EmployeeID || '').trim(), Number(row.recordCount || 0)]));
    const unitMap = new Map();
    const ensureUnit = (unit, department = '') => {
        const key = String(unit || '').trim();
        if (!unitMap.has(key)) {
            unitMap.set(key, { unit: key, department: String(department || '').trim(), unitTarget: 0, targetConfigured: false, personalTargetTotal: 0, actualTowardTarget: 0, rawRecords: 0, eligibleEmployees: 0, notStarted: 0, inProgress: 0, completed: 0, exceeded: 0 });
        } else if (department && !unitMap.get(key).department) {
            unitMap.get(key).department = String(department).trim();
        }
        return unitMap.get(key);
    };
    masterUnits.forEach(row => ensureUnit(row.Unit, row.Department));
    rawUnits.forEach(row => { ensureUnit(row.Unit, row.Department).rawRecords = Number(row.rawRecords || 0); });
    unitTargets.forEach(row => { const item = ensureUnit(row.Unit); item.unitTarget = Math.max(0, Number(row.UnitTarget || 0)); item.targetConfigured = true; });

    const employeeRows = [];
    for (const employee of employees) {
        const employeeId = String(employee.EmployeeID || '').trim();
        const snapshot = snapshotMap.get(employeeId);
        const department = String(snapshot?.Department ?? employee.Department ?? '').trim();
        const unit = String(snapshot?.Unit ?? employee.Unit ?? '').trim();
        const position = String(snapshot?.PositionName ?? employee.Position ?? '').trim();
        const employeeOverride = overrideYearMap.get(employeeId) || legacyOverrideMap.get(employeeId);
        const unitOverride = scopeYearMap.get(`${department}::${unit}`) || legacyScopeMap.get(`${department}::${unit}`);
        const departmentOverride = scopeYearMap.get(`${department}::`) || legacyScopeMap.get(`${department}::`);
        const positionTemplate = templateYearMap.get(position) || { YearlyTarget: employee.TemplateTarget, PassPct: employee.TemplatePassPct, IsNA: 0 };
        const effective = snapshot
            ? { YearlyTarget: snapshot.YearlyTarget, PassPct: snapshot.PassPct, IsNA: snapshot.IsNA, targetSource: snapshot.TargetSource || 'snapshot' }
            : employeeOverride || unitOverride || departmentOverride || positionTemplate;
        if (effective.IsNA) continue;
        const target = Math.max(0, Number(effective.YearlyTarget || 0));
        if (!target) continue;
        const actual = Math.max(0, Number(recordMap.get(employeeId) || 0));
        const credited = Math.min(actual, target);
        const status = actual <= 0 ? 'not_started' : actual < target ? 'in_progress' : actual === target ? 'completed' : 'exceeded';
        const source = snapshot ? `snapshot:${effective.targetSource || 'unknown'}` : employeeOverride ? 'employee' : unitOverride ? 'unit' : departmentOverride ? 'department' : 'position';
        const item = ensureUnit(unit, department);
        item.personalTargetTotal += target;
        item.actualTowardTarget += credited;
        item.eligibleEmployees += 1;
        item[status === 'not_started' ? 'notStarted' : status === 'in_progress' ? 'inProgress' : status] += 1;
        employeeRows.push({ employeeId, employeeName: employee.EmployeeName || employeeId, department, unit, position, target, passPct: Number(effective.PassPct || 100), actualTowardTarget: credited, rawRecords: actual, remaining: Math.max(0, target - credited), status, targetSource: source, targetYear: safeYear, targetSnapshot: Boolean(snapshot) });
    }

    employeeRows.sort((a, b) => `${a.department}|${a.unit}|${a.employeeName}`.localeCompare(`${b.department}|${b.unit}|${b.employeeName}`));
    const units = [...unitMap.values()].sort((a, b) => a.unit.localeCompare(b.unit)).map(row => ({ ...row, allocationDifference: row.unitTarget - row.personalTargetTotal }));
    const departmentMap = new Map();
    for (const unit of units) {
        if (!departmentMap.has(unit.department)) departmentMap.set(unit.department, { department: unit.department, unitTarget: 0, personalTargetTotal: 0, actualTowardTarget: 0, rawRecords: 0, eligibleEmployees: 0 });
        const row = departmentMap.get(unit.department);
        for (const field of ['unitTarget','personalTargetTotal','actualTowardTarget','rawRecords','eligibleEmployees']) row[field] += unit[field];
    }
    const departments = [...departmentMap.values()].map(row => ({ ...row, allocationDifference: row.unitTarget - row.personalTargetTotal })).sort((a, b) => a.department.localeCompare(b.department));
    const sum = field => units.reduce((total, row) => total + Number(row[field] || 0), 0);
    return {
        year: safeYear,
        overall: { unitTarget: sum('unitTarget'), personalTargetTotal: sum('personalTargetTotal'), actualTowardTarget: sum('actualTowardTarget'), rawRecords: sum('rawRecords'), eligibleEmployees: sum('eligibleEmployees'), notStarted: sum('notStarted'), inProgress: sum('inProgress'), completed: sum('completed'), exceeded: sum('exceeded'), allocationDifference: sum('unitTarget') - sum('personalTargetTotal') },
        units,
        departments,
        employees: employeeRows,
        calculation: { eligible: 'positive_cccf_worker_position_template', targetPriority: ['snapshot','employee_year','employee','unit_year','unit','department_year','department','position_year','position'], actualTowardTarget: 'sum(min(rawRecordsByEmployee, effectivePersonalTarget))', rawRecords: 'all_cccf_forma_worker_records', targetVersioning: 'TargetYear first, legacy fallback' },
    };
}

async function snapshotCccfWorkerTarget(db, employeeId, year, reason = 'form_submit') {
    const safeYear = Math.max(2000, Math.min(2100, Number(year) || new Date().getFullYear()));
    await ensureCccfWorkerVersionTables(db);
    const data = await getCccfWorkerProgress(db, safeYear);
    const row = (data.employees || []).find(item => String(item.employeeId || '').trim() === String(employeeId || '').trim());
    if (!row) return null;
    const cleanSource = String(row.targetSource || 'position').replace(/^snapshot:/, '').slice(0, 30);
    await db.query(`
        INSERT INTO CCCF_Worker_Target_Snapshots
          (EmployeeID,TargetYear,Department,Unit,PositionName,YearlyTarget,PassPct,IsNA,TargetSource,SnapshotReason)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          Department=VALUES(Department),
          Unit=VALUES(Unit),
          PositionName=VALUES(PositionName),
          YearlyTarget=VALUES(YearlyTarget),
          PassPct=VALUES(PassPct),
          IsNA=VALUES(IsNA),
          TargetSource=VALUES(TargetSource),
          SnapshotReason=VALUES(SnapshotReason),
          SnapshotAt=NOW()
    `, [row.employeeId, safeYear, row.department, row.unit, row.position, row.target, row.passPct || 100, 0, cleanSource, reason]);
    return row;
}

module.exports = { getCccfWorkerProgress, snapshotCccfWorkerTarget, ensureCccfWorkerVersionTables };
