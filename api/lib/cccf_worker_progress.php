<?php

function cccf_worker_ensure_version_tables(): void
{
    static $ready = false;
    if ($ready) return;
    foreach ([
        "CREATE TABLE IF NOT EXISTS activity_position_template_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS activity_scope_override_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS employee_activity_target_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS cccf_worker_target_snapshots (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ] as $sql) {
        try { db()->exec($sql); } catch (Throwable $e) {}
    }
    foreach ([
        "ALTER TABLE cccf_worker_target_snapshots ADD COLUMN YearlyTarget INT NOT NULL DEFAULT 0 AFTER PositionName",
        "ALTER TABLE cccf_worker_target_snapshots ADD COLUMN TargetSource VARCHAR(30) NOT NULL DEFAULT 'position' AFTER IsNA",
        "ALTER TABLE cccf_worker_target_snapshots ADD COLUMN SnapshotReason VARCHAR(80) NOT NULL DEFAULT 'manual' AFTER TargetSource",
        "ALTER TABLE cccf_worker_target_snapshots ADD COLUMN SnapshotAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER SnapshotReason",
        "ALTER TABLE cccf_worker_target_snapshots ADD COLUMN UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER CreatedAt",
        "ALTER TABLE cccf_worker_target_snapshots ADD UNIQUE KEY uq_employee_year (EmployeeID, TargetYear)",
        "ALTER TABLE cccf_worker_target_snapshots ADD KEY idx_target_year (TargetYear)",
        "ALTER TABLE cccf_worker_target_snapshots ADD KEY idx_unit_year (Unit, TargetYear)",
    ] as $sql) {
        try { db()->exec($sql); } catch (Throwable $e) {}
    }
    try { db()->exec("UPDATE cccf_worker_target_snapshots SET YearlyTarget=TargetValue WHERE YearlyTarget=0 AND TargetValue IS NOT NULL"); } catch (Throwable $e) {}
    try { db()->exec("UPDATE cccf_worker_target_snapshots SET TargetSource=SourceType WHERE (TargetSource='' OR TargetSource='position') AND SourceType IS NOT NULL AND SourceType<>''"); } catch (Throwable $e) {}
    $ready = true;
}

function cccf_worker_latest_map(array $rows, callable $keyFn, int $year): array
{
    $out = [];
    foreach ($rows as $row) {
        $key = $keyFn($row);
        if ($key === '') continue;
        $rowYear = (int) ($row['TargetYear'] ?? 0);
        if (!isset($out[$key]) || $rowYear === $year) $out[$key] = $row;
    }
    return $out;
}

function cccf_worker_progress_data(int $year, bool $ensureSchema = true): array
{
    $year = max(2000, min(2100, $year));
    if ($ensureSchema) {
        ensure_activity_target_tables();
        cccf_worker_ensure_version_tables();
    }

    $employees = db_rows(
        "SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,
                p.YearlyTarget TemplateTarget,p.PassPct TemplatePassPct
           FROM employees e
           LEFT JOIN activity_position_templates p
             ON p.PositionName=e.Position
            AND p.ActivityKey='cccf_worker'
            AND COALESCE(p.IsNA,0)=0
          WHERE COALESCE(e.EmployeeID,'')<>''"
    );
    $scopes = db_rows(
        "SELECT Department,Unit,YearlyTarget,PassPct,IsNA
           FROM activity_scope_overrides
          WHERE ActivityKey='cccf_worker'"
    );
    $overrides = db_rows(
        "SELECT EmployeeID,YearlyTarget,PassPct,IsNA
           FROM employee_activity_targets
          WHERE ActivityKey='cccf_worker'"
    );
    $templateYears = db_rows(
        "SELECT PositionName,YearlyTarget,PassPct,IsNA,TargetYear
           FROM activity_position_template_years
          WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0)
          ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END",
        [$year, $year]
    );
    $scopeYears = db_rows(
        "SELECT Department,Unit,YearlyTarget,PassPct,IsNA,TargetYear
           FROM activity_scope_override_years
          WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0)
          ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END",
        [$year, $year]
    );
    $overrideYears = db_rows(
        "SELECT EmployeeID,YearlyTarget,PassPct,IsNA,TargetYear
           FROM employee_activity_target_years
          WHERE ActivityKey='cccf_worker' AND TargetYear IN (?,0)
          ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END",
        [$year, $year]
    );
    $snapshots = db_rows(
        'SELECT EmployeeID,Department,Unit,PositionName,YearlyTarget,PassPct,IsNA,TargetSource,TargetYear
           FROM cccf_worker_target_snapshots
          WHERE TargetYear=?',
        [$year]
    );
    $recordCounts = db_rows(
        "SELECT EmployeeID,COUNT(*) recordCount
           FROM cccf_forma_worker
          WHERE YEAR(SubmitDate)=?
          GROUP BY EmployeeID",
        [$year]
    );
    $rawUnits = db_rows(
        "SELECT TRIM(COALESCE(SafetyUnit,'')) Unit,
                MAX(TRIM(COALESCE(Department,''))) Department,
                COUNT(*) rawRecords
           FROM cccf_forma_worker
          WHERE YEAR(SubmitDate)=?
          GROUP BY TRIM(COALESCE(SafetyUnit,''))",
        [$year]
    );
    $unitTargets = db_rows(
        'SELECT unit_name Unit,yearly_target UnitTarget FROM cccf_unit_targets WHERE target_year=?',
        [$year]
    );
    $masterUnits = db_rows(
        "SELECT TRIM(u.name) Unit,TRIM(COALESCE(d.Name,'')) Department
           FROM master_safetyunits u
           LEFT JOIN master_departments d ON d.id=u.department_id"
    );

    $scopeMap = [];
    foreach ($scopes as $row) {
        $key = trim((string) ($row['Department'] ?? '')) . '::' . trim((string) ($row['Unit'] ?? ''));
        $scopeMap[$key] = $row;
    }
    $overrideMap = [];
    foreach ($overrides as $row) $overrideMap[trim((string) ($row['EmployeeID'] ?? ''))] = $row;
    $templateYearMap = cccf_worker_latest_map($templateYears, static fn($row): string => trim((string) ($row['PositionName'] ?? '')), $year);
    $scopeYearMap = cccf_worker_latest_map($scopeYears, static fn($row): string => trim((string) ($row['Department'] ?? '')) . '::' . trim((string) ($row['Unit'] ?? '')), $year);
    $overrideYearMap = cccf_worker_latest_map($overrideYears, static fn($row): string => trim((string) ($row['EmployeeID'] ?? '')), $year);
    $snapshotMap = [];
    foreach ($snapshots as $row) $snapshotMap[trim((string) ($row['EmployeeID'] ?? ''))] = $row;
    $recordMap = [];
    foreach ($recordCounts as $row) $recordMap[trim((string) ($row['EmployeeID'] ?? ''))] = (int) ($row['recordCount'] ?? 0);

    $unitMap = [];
    $ensureUnit = static function (string $unit, string $department = '') use (&$unitMap): void {
        if (!isset($unitMap[$unit])) {
            $unitMap[$unit] = [
                'unit'=>$unit,
                'department'=>$department,
                'unitTarget'=>0,
                'targetConfigured'=>false,
                'personalTargetTotal'=>0,
                'actualTowardTarget'=>0,
                'rawRecords'=>0,
                'eligibleEmployees'=>0,
                'notStarted'=>0,
                'inProgress'=>0,
                'completed'=>0,
                'exceeded'=>0,
            ];
        } elseif ($department !== '' && $unitMap[$unit]['department'] === '') {
            $unitMap[$unit]['department'] = $department;
        }
    };
    foreach ($masterUnits as $row) $ensureUnit(trim((string) ($row['Unit'] ?? '')), trim((string) ($row['Department'] ?? '')));
    foreach ($rawUnits as $row) {
        $unit = trim((string) ($row['Unit'] ?? ''));
        $ensureUnit($unit, trim((string) ($row['Department'] ?? '')));
        $unitMap[$unit]['rawRecords'] = (int) ($row['rawRecords'] ?? 0);
    }
    foreach ($unitTargets as $row) {
        $unit = trim((string) ($row['Unit'] ?? ''));
        $ensureUnit($unit);
        $unitMap[$unit]['unitTarget'] = max(0, (int) ($row['UnitTarget'] ?? 0));
        $unitMap[$unit]['targetConfigured'] = true;
    }

    $employeeRows = [];
    foreach ($employees as $employee) {
        $employeeId = trim((string) ($employee['EmployeeID'] ?? ''));
        $snapshot = $snapshotMap[$employeeId] ?? null;
        $department = trim((string) (($snapshot['Department'] ?? null) ?? ($employee['Department'] ?? '')));
        $unit = trim((string) (($snapshot['Unit'] ?? null) ?? ($employee['Unit'] ?? '')));
        $position = trim((string) (($snapshot['PositionName'] ?? null) ?? ($employee['Position'] ?? '')));
        $employeeOverride = $overrideYearMap[$employeeId] ?? ($overrideMap[$employeeId] ?? null);
        $unitOverride = $scopeYearMap[$department . '::' . $unit] ?? ($scopeMap[$department . '::' . $unit] ?? null);
        $departmentOverride = $scopeYearMap[$department . '::'] ?? ($scopeMap[$department . '::'] ?? null);
        $positionTemplate = $templateYearMap[$position] ?? ['YearlyTarget'=>$employee['TemplateTarget'] ?? 0,'PassPct'=>$employee['TemplatePassPct'] ?? 100,'IsNA'=>0];
        $effective = $snapshot
            ? ['YearlyTarget'=>$snapshot['YearlyTarget'] ?? 0,'PassPct'=>$snapshot['PassPct'] ?? 100,'IsNA'=>$snapshot['IsNA'] ?? 0,'TargetSource'=>$snapshot['TargetSource'] ?? 'snapshot']
            : ($employeeOverride ?? $unitOverride ?? $departmentOverride ?? $positionTemplate);
        if (!empty($effective['IsNA'])) continue;
        $target = max(0, (int) ($effective['YearlyTarget'] ?? 0));
        if ($target <= 0) continue;
        $actual = max(0, (int) ($recordMap[$employeeId] ?? 0));
        $credited = min($actual, $target);
        $status = $actual <= 0 ? 'not_started' : ($actual < $target ? 'in_progress' : ($actual === $target ? 'completed' : 'exceeded'));
        $source = $snapshot ? ('snapshot:' . (string) ($effective['TargetSource'] ?? 'unknown')) : ($employeeOverride ? 'employee' : ($unitOverride ? 'unit' : ($departmentOverride ? 'department' : 'position')));
        $ensureUnit($unit, $department);
        $unitMap[$unit]['personalTargetTotal'] += $target;
        $unitMap[$unit]['actualTowardTarget'] += $credited;
        $unitMap[$unit]['eligibleEmployees']++;
        $unitMap[$unit][$status === 'not_started' ? 'notStarted' : ($status === 'in_progress' ? 'inProgress' : $status)]++;
        $employeeRows[] = [
            'employeeId'=>$employeeId,
            'employeeName'=>(string) ($employee['EmployeeName'] ?? $employeeId),
            'department'=>$department,
            'unit'=>$unit,
            'position'=>$position,
            'target'=>$target,
            'passPct'=>(int) ($effective['PassPct'] ?? 100),
            'actualTowardTarget'=>$credited,
            'rawRecords'=>$actual,
            'remaining'=>max(0, $target - $credited),
            'status'=>$status,
            'targetSource'=>$source,
            'targetYear'=>$year,
            'targetSnapshot'=>(bool) $snapshot,
        ];
    }

    ksort($unitMap, SORT_NATURAL | SORT_FLAG_CASE);
    $units = [];
    $departments = [];
    foreach ($unitMap as $row) {
        $row['allocationDifference'] = $row['unitTarget'] - $row['personalTargetTotal'];
        $units[] = $row;
        $dept = $row['department'];
        if (!isset($departments[$dept])) {
            $departments[$dept] = ['department'=>$dept,'unitTarget'=>0,'personalTargetTotal'=>0,'actualTowardTarget'=>0,'rawRecords'=>0,'eligibleEmployees'=>0];
        }
        foreach (['unitTarget','personalTargetTotal','actualTowardTarget','rawRecords','eligibleEmployees'] as $field) {
            $departments[$dept][$field] += $row[$field];
        }
    }
    foreach ($departments as &$row) $row['allocationDifference'] = $row['unitTarget'] - $row['personalTargetTotal'];
    unset($row);
    ksort($departments, SORT_NATURAL | SORT_FLAG_CASE);
    usort($employeeRows, static function (array $a, array $b): int {
        return strnatcasecmp(
            ($a['department'] ?? '') . '|' . ($a['unit'] ?? '') . '|' . ($a['employeeName'] ?? ''),
            ($b['department'] ?? '') . '|' . ($b['unit'] ?? '') . '|' . ($b['employeeName'] ?? '')
        );
    });

    $sum = static fn(string $field): int => array_sum(array_map(static fn($row) => (int) ($row[$field] ?? 0), $units));
    return [
        'year'=>$year,
        'overall'=>[
            'unitTarget'=>$sum('unitTarget'),
            'personalTargetTotal'=>$sum('personalTargetTotal'),
            'actualTowardTarget'=>$sum('actualTowardTarget'),
            'rawRecords'=>$sum('rawRecords'),
            'eligibleEmployees'=>$sum('eligibleEmployees'),
            'notStarted'=>$sum('notStarted'),
            'inProgress'=>$sum('inProgress'),
            'completed'=>$sum('completed'),
            'exceeded'=>$sum('exceeded'),
            'allocationDifference'=>$sum('unitTarget') - $sum('personalTargetTotal'),
        ],
        'units'=>$units,
        'departments'=>array_values($departments),
        'employees'=>$employeeRows,
        'calculation'=>[
            'eligible'=>'positive_cccf_worker_position_template',
            'targetPriority'=>['snapshot','employee_year','employee','unit_year','unit','department_year','department','position_year','position'],
            'actualTowardTarget'=>'sum(min(rawRecordsByEmployee, effectivePersonalTarget))',
            'rawRecords'=>'all_cccf_forma_worker_records',
            'targetVersioning'=>'TargetYear first, legacy fallback',
        ],
    ];
}

function cccf_worker_snapshot_target(string $employeeId, int $year, string $reason = 'form_submit'): ?array
{
    $employeeId = trim($employeeId);
    if ($employeeId === '') return null;
    $year = max(2000, min(2100, $year));
    $data = cccf_worker_progress_data($year);
    $match = null;
    foreach (($data['employees'] ?? []) as $row) {
        if ((string) ($row['employeeId'] ?? '') === $employeeId) {
            $match = $row;
            break;
        }
    }
    if (!$match) return null;
    $source = preg_replace('/^snapshot:/', '', (string) ($match['targetSource'] ?? 'position'));
    $source = substr($source ?: 'position', 0, 30);
    db_execute(
        "INSERT INTO cccf_worker_target_snapshots
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
          SnapshotAt=NOW()",
        [
            $employeeId,
            $year,
            (string) ($match['department'] ?? ''),
            (string) ($match['unit'] ?? ''),
            (string) ($match['position'] ?? ''),
            (int) ($match['target'] ?? 0),
            (int) ($match['passPct'] ?? 100),
            0,
            $source,
            substr($reason, 0, 80),
        ]
    );
    return $match;
}
