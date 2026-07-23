<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/cccf_worker_progress.php';

function activity_definitions(): array
{
    return [
        ['key' => 'patrol', 'label' => 'Safety Patrol', 'desc' => 'Safety Patrol attendance', 'metricType' => 'fixed_count', 'scopeType' => 'person_position', 'unitLabel' => 'ครั้ง', 'targetMode' => 'manual'],
        ['key' => 'patrol_issue', 'label' => 'Patrol Issues', 'desc' => 'Department issue closure rate', 'metricType' => 'dynamic_ratio', 'scopeType' => 'department', 'unitLabel' => '%', 'targetMode' => 'system_denominator'],
        ['key' => 'cccf_worker', 'label' => 'CCCF Form A Worker', 'desc' => 'Worker CCCF Form A Unit people coverage', 'metricType' => 'people_coverage', 'scopeType' => 'unit', 'unitLabel' => 'คน', 'targetMode' => 'manual'],
        ['key' => 'cccf_permanent', 'label' => 'CCCF Form A Permanent', 'desc' => 'Permanent CCCF Form A coverage', 'metricType' => 'people_coverage', 'scopeType' => 'unit', 'unitLabel' => 'คน', 'targetMode' => 'manual'],
        ['key' => 'scw', 'label' => 'OJT Stop-Call-Wait', 'desc' => 'Stop-Call-Wait people coverage', 'metricType' => 'people_coverage', 'scopeType' => 'department', 'unitLabel' => 'คน', 'targetMode' => 'manual'],
        ['key' => 'training', 'label' => 'Safety Training', 'desc' => 'Passed training people coverage', 'metricType' => 'people_coverage', 'scopeType' => 'department_course', 'unitLabel' => 'คน', 'targetMode' => 'manual'],
        ['key' => 'yokoten', 'label' => 'Yokoten Response', 'desc' => 'Department assigned-topic response rate', 'metricType' => 'dynamic_ratio', 'scopeType' => 'department', 'unitLabel' => '%', 'targetMode' => 'system_denominator'],
        ['key' => 'hiyari', 'label' => 'Hiyari Near-Miss', 'desc' => 'Near-miss participant coverage', 'metricType' => 'people_coverage', 'scopeType' => 'department_unit', 'unitLabel' => 'คน', 'targetMode' => 'manual'],
        ['key' => 'ky', 'label' => 'KY Activity', 'desc' => 'KY activities', 'metricType' => 'fixed_count', 'scopeType' => 'department_unit', 'unitLabel' => 'เรื่อง', 'targetMode' => 'module_config'],
    ];
}

function valid_activity_key(string $key): bool
{
    return in_array($key, array_column(activity_definitions(), 'key'), true);
}

function activity_target_request_year($value, ?int $default = null): ?int
{
    if ($value === null || $value === '') return $default;
    $raw = trim((string) $value);
    if (!preg_match('/^\d{4}$/', $raw)) {
        json_response(['success' => false, 'message' => 'TargetYear must be an integer from 2000 to 2100.'], 400);
    }
    $year = (int) $raw;
    if ($year < 2000 || $year > 2100) {
        json_response(['success' => false, 'message' => 'TargetYear must be an integer from 2000 to 2100.'], 400);
    }
    return $year;
}

function activity_target_validated_values(array $body, bool $isNA): array
{
    $target = $body['YearlyTarget'] ?? null;
    if (!$isNA && (!is_int($target) && !(is_string($target) && preg_match('/^\d+$/', trim($target))))) {
        json_response(['success' => false, 'message' => 'YearlyTarget must be a non-negative integer.'], 400);
    }
    $targetValue = $isNA ? 0 : (int) $target;
    $passRaw = $body['PassPct'] ?? 80;
    if (!is_int($passRaw) && !(is_string($passRaw) && preg_match('/^\d+$/', trim($passRaw)))) {
        json_response(['success' => false, 'message' => 'PassPct must be an integer from 0 to 100.'], 400);
    }
    $passPct = (int) $passRaw;
    if ($passPct < 0 || $passPct > 100) {
        json_response(['success' => false, 'message' => 'PassPct must be an integer from 0 to 100.'], 400);
    }
    return [$targetValue, $passPct];
}

function activity_target_storage_value(string $key, $yearlyTarget, int $isNA): int
{
    if ($isNA) return 0;
    foreach (activity_definitions() as $activity) {
        if ($activity['key'] === $key && $activity['targetMode'] === 'system_denominator') return 1;
    }
    return (int) ($yearlyTarget ?? 0);
}

function activity_target_parse_list($value): array
{
    if ($value === null || $value === '') return [];
    if (is_array($value)) $items = $value;
    else {
        $decoded = json_decode((string) $value, true);
        $items = is_array($decoded) ? $decoded : explode(',', (string) $value);
    }
    return array_values(array_filter(array_map(static function ($item) {
        return trim((string) $item);
    }, $items), static function ($item) {
        return $item !== '';
    }));
}

function dynamic_activity_ratio(string $key, string $department, int $year): array
{
    $dept = trim($department);
    $empty = ['numerator' => 0, 'denominator' => 0, 'completionPct' => null, 'noData' => true, 'department' => $dept];
    if ($dept === '') return $empty;
    if ($key === 'patrol_issue') {
        $rows = safe_rows(
            "SELECT COUNT(*) AS denominator,
                    SUM(CASE WHEN CurrentStatus='Closed' THEN 1 ELSE 0 END) AS numerator
               FROM patrol_issues
              WHERE TRIM(COALESCE(ResponsibleDept,''))=? AND YEAR(DateFound)=?",
            [$dept, $year]
        );
        $row = $rows[0] ?? [];
        $denominator = (int) ($row['denominator'] ?? 0);
        $numerator = (int) ($row['numerator'] ?? 0);
        return ['numerator' => $numerator, 'denominator' => $denominator, 'completionPct' => $denominator ? (int) round($numerator * 100 / $denominator) : null, 'noData' => $denominator === 0, 'department' => $dept];
    }
    if ($key === 'yokoten') {
        $targetedIds = [];
        foreach (safe_rows('SELECT YokotenID,TargetDepts FROM yokotentopics WHERE IsActive=1') as $topic) {
            $targetDepts = activity_target_parse_list($topic['TargetDepts'] ?? null);
            if (!$targetDepts || in_array($dept, $targetDepts, true)) $targetedIds[] = $topic['YokotenID'];
        }
        if (!$targetedIds) return $empty;
        $placeholders = implode(',', array_fill(0, count($targetedIds), '?'));
        $numerator = (int) (safe_scalar(
            "SELECT COUNT(DISTINCT YokotenID) FROM yokotenresponses
              WHERE TRIM(Department)=? AND YokotenID IN ($placeholders)
                AND (IsDeleted IS NULL OR IsDeleted=0)",
            array_merge([$dept], $targetedIds)
        ) ?? 0);
        $denominator = count($targetedIds);
        return ['numerator' => $numerator, 'denominator' => $denominator, 'completionPct' => (int) round($numerator * 100 / $denominator), 'noData' => false, 'department' => $dept];
    }
    return $empty;
}

function people_coverage_result($numerator, $yearlyTarget, string $department, string $unit, string $method, bool $sourceAvailable = true): array
{
    $denominator = (int) ($yearlyTarget ?? 0);
    $scopedUnit = trim($unit);
    $noData = $denominator <= 0 || !$sourceAvailable;
    return [
        'numerator' => (int) ($numerator ?? 0),
        'denominator' => $denominator,
        'completionPct' => $noData ? null : min(100, (int) round((int) ($numerator ?? 0) * 100 / $denominator)),
        'noData' => $noData,
        'department' => trim($department),
        'unit' => $scopedUnit,
        'calculationMethod' => $method,
        'calculationScope' => ['type' => $scopedUnit !== '' ? 'department_unit' : 'department', 'department' => trim($department), 'unit' => $scopedUnit],
    ];
}

function people_coverage(string $key, string $department, string $unit, int $year, $yearlyTarget): array
{
    $dept = trim($department);
    $scopedUnit = trim($unit);
    $empty = people_coverage_result(0, $yearlyTarget, $dept, $scopedUnit, 'source_unavailable', false);
    if ($dept === '') return $empty;
    if ($key === 'cccf_worker') {
        $params = [$dept, $year];
        $unitFilter = '';
        if ($scopedUnit !== '') {
            $unitFilter = " AND TRIM(COALESCE(SafetyUnit,''))=?";
            $params[] = $scopedUnit;
        }
        $rows = safe_rows("SELECT COUNT(*) AS numerator FROM cccf_forma_worker WHERE TRIM(COALESCE(Department,''))=? AND YEAR(SubmitDate)=?$unitFilter", $params);
        if (!$rows) return $empty;
        return people_coverage_result($rows[0]['numerator'] ?? 0, $yearlyTarget, $dept, $scopedUnit, 'worker_form_records');
    }
    if ($key === 'cccf_permanent') {
        $params = [$dept, $year];
        $unitFilter = '';
        if ($scopedUnit !== '') {
            $unitFilter = " AND EXISTS (SELECT 1 FROM employees e WHERE e.EmployeeID=f.AssigneeID AND TRIM(COALESCE(e.Unit,''))=?)";
            $params[] = $scopedUnit;
        }
        $rows = safe_rows("SELECT COUNT(DISTINCT COALESCE(NULLIF(f.AssigneeID,''),NULLIF(f.SubmitterName,''))) AS numerator FROM cccf_forma_permanent f WHERE TRIM(COALESCE(f.Department,''))=? AND YEAR(f.SubmitDate)=?$unitFilter", $params);
        if (!$rows) return $empty;
        return people_coverage_result($rows[0]['numerator'] ?? 0, $yearlyTarget, $dept, $scopedUnit, 'distinct_permanent_assignees');
    }
    if ($key === 'scw') {
        $rows = safe_rows("SELECT COALESCE(SUM(AttendeeCount),0) AS numerator FROM ojt_records WHERE TRIM(COALESCE(Department,''))=? AND YEAR(OJTDate)=?", [$dept, $year]);
        if (!$rows) return $empty;
        return people_coverage_result($rows[0]['numerator'] ?? 0, $yearlyTarget, $dept, '', 'department_attendee_snapshot');
    }
    if ($key === 'training') {
        $rows = safe_rows("SELECT COUNT(DISTINCT r.EmployeeID) AS numerator FROM training_records r JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE TRIM(COALESCE(e.Department,''))=? AND YEAR(r.TrainingDate)=? AND r.IsPassed=1", [$dept, $year]);
        if (!$rows) return $empty;
        return people_coverage_result($rows[0]['numerator'] ?? 0, $yearlyTarget, $dept, '', 'distinct_passed_employees');
    }
    if ($key === 'hiyari') {
        $params = [$dept, $year];
        $unitFilter = '';
        if ($scopedUnit !== '') {
            $unitFilter = " AND EXISTS (SELECT 1 FROM employees e WHERE e.EmployeeID=h.ReporterID AND TRIM(COALESCE(e.Unit,''))=?)";
            $params[] = $scopedUnit;
        }
        $rows = safe_rows("SELECT COUNT(DISTINCT NULLIF(h.ReporterID,'')) AS numerator FROM hiyarireports h WHERE TRIM(COALESCE(h.Department,''))=? AND YEAR(h.ReportDate)=? AND h.DeletedAt IS NULL$unitFilter", $params);
        if (!$rows) return $empty;
        return people_coverage_result($rows[0]['numerator'] ?? 0, $yearlyTarget, $dept, $scopedUnit, 'distinct_near_miss_reporters');
    }
    return $empty;
}

function fixed_count_result($actual, $yearlyTarget, ?array $scope, string $method, string $targetSource): array
{
    $denominator = (int) ($yearlyTarget ?? 0);
    $numerator = (int) ($actual ?? 0);
    $noData = $denominator <= 0;
    return [
        'numerator' => $numerator,
        'denominator' => $denominator,
        'completionPct' => $noData ? null : min(100, (int) round($numerator * 100 / $denominator)),
        'noData' => $noData,
        'calculationScope' => $scope,
        'calculationMethod' => $method,
        'targetSource' => $targetSource,
    ];
}

function fixed_count_alignment(string $key, string $employeeId, string $department, string $unit, int $year, $fallbackTarget): array
{
    $empId = trim($employeeId);
    $dept = trim($department);
    $scopedUnit = trim($unit);
    if ($key === 'patrol') {
        $actual = (int) (safe_scalar(
            'SELECT
                (SELECT COUNT(*) FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=?) +
                (SELECT COUNT(*) FROM patrol_self_checkin WHERE EmployeeID=? AND Year=?)',
            [$empId, $year, $empId, $year]
        ) ?? 0);
        return fixed_count_result($actual, $fallbackTarget, ['type' => 'employee', 'employeeId' => $empId], 'patrol_attendance_plus_self_checkin', 'activity_target');
    }
    if ($key === 'ky') {
        $config = safe_rows('SELECT SafetyUnits FROM ky_program_config WHERE Year=? AND Department=? AND IsActive=1 LIMIT 1', [$year, $dept]);
        $units = activity_target_parse_list($config[0]['SafetyUnits'] ?? null);
        $useUnit = $scopedUnit !== '' && in_array($scopedUnit, $units, true);
        $actual = (int) (safe_scalar(
            "SELECT COUNT(*) FROM ky_activities WHERE Department=? " . ($useUnit ? 'AND SafetyUnit=? ' : '') . 'AND YEAR(ActivityDate)=?',
            $useUnit ? [$dept, $scopedUnit, $year] : [$dept, $year]
        ) ?? 0);
        return fixed_count_result($actual, $fallbackTarget, ['type' => $useUnit ? 'department_unit' : 'department', 'department' => $dept, 'unit' => $useUnit ? $scopedUnit : ''], 'ky_scope_activity_count', 'activity_target');
    }
    return fixed_count_result(0, $fallbackTarget, null, 'source_unavailable', 'activity_target');
}

function ensure_activity_target_tables(): void
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS activity_position_templates (
            id INT AUTO_INCREMENT PRIMARY KEY, PositionName VARCHAR(100) NOT NULL, ActivityKey VARCHAR(50) NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0, PassPct INT NOT NULL DEFAULT 80, IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100), UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pos_act (PositionName, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS employee_activity_targets (
            id INT AUTO_INCREMENT PRIMARY KEY, EmployeeID VARCHAR(50) NOT NULL, ActivityKey VARCHAR(50) NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0, PassPct INT NOT NULL DEFAULT 80, IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100), UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_emp_act (EmployeeID, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS activity_scope_overrides (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Department VARCHAR(150) NOT NULL,
            Unit VARCHAR(150) NOT NULL DEFAULT \'\',
            ActivityKey VARCHAR(50) NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_scope_act (Department, Unit, ActivityKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS activity_position_template_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS activity_scope_override_years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Department VARCHAR(150) NOT NULL,
            Unit VARCHAR(150) NOT NULL DEFAULT \'\',
            ActivityKey VARCHAR(50) NOT NULL,
            TargetYear INT NOT NULL,
            YearlyTarget INT NOT NULL DEFAULT 0,
            PassPct INT NOT NULL DEFAULT 80,
            IsNA TINYINT(1) NOT NULL DEFAULT 0,
            UpdatedBy VARCHAR(100),
            UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_scope_act_year (Department, Unit, ActivityKey, TargetYear),
            KEY idx_activity_year (ActivityKey, TargetYear)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS employee_activity_target_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
}

function merged_activity_targets(string $employeeId, ?int $year = null, bool $ensureSchema = true): array
{
    if ($ensureSchema) ensure_activity_target_tables();
    $targetYear = max(2000, min(2100, (int) ($year ?: date('Y'))));
    $employee = db_row('SELECT Position,Department,Unit FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    $position = $employee['Position'] ?? null;
    $department = $employee['Department'] ?? null;
    $unit = $employee['Unit'] ?? null;
    $templates = $position ? db_rows('SELECT ActivityKey,YearlyTarget,PassPct,IsNA FROM activity_position_templates WHERE PositionName=?', [$position]) : [];
    $templateYears = $position ? db_rows(
        'SELECT ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM activity_position_template_years
         WHERE PositionName=? AND TargetYear IN (?,0)
         ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END',
        [$position, $targetYear, $targetYear]
    ) : [];
    $scopeRows = [];
    $scopeYearRows = [];
    if ($department) {
        $scopeRows = db_rows(
            'SELECT ActivityKey,YearlyTarget,PassPct,IsNA,Department,Unit FROM activity_scope_overrides
             WHERE Department=? AND (Unit=? OR Unit=\'\') ORDER BY CASE WHEN Unit=? THEN 0 ELSE 1 END',
            [$department, (string) $unit, (string) $unit]
        );
        $scopeYearRows = db_rows(
            'SELECT ActivityKey,YearlyTarget,PassPct,IsNA,Department,Unit,TargetYear FROM activity_scope_override_years
             WHERE Department=? AND (Unit=? OR Unit=\'\') AND TargetYear IN (?,0)
             ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END, CASE WHEN Unit=? THEN 0 ELSE 1 END',
            [$department, (string) $unit, $targetYear, $targetYear, (string) $unit]
        );
    }
    $overrides = db_rows('SELECT ActivityKey,YearlyTarget,PassPct,IsNA FROM employee_activity_targets WHERE EmployeeID=?', [$employeeId]);
    $overrideYears = db_rows(
        'SELECT ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM employee_activity_target_years
         WHERE EmployeeID=? AND TargetYear IN (?,0)
         ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END',
        [$employeeId, $targetYear, $targetYear]
    );
    $templateMap = [];
    foreach ($templates as $row) {
        $row['targetYear'] = null;
        $templateMap[$row['ActivityKey']] = $row;
    }
    foreach ($templateYears as $row) {
        if (!isset($templateMap[$row['ActivityKey']]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $templateMap[$row['ActivityKey']] = $row;
        }
    }
    $legacyScopeMap = [];
    foreach ($scopeRows as $row) {
        $row['targetYear'] = null;
        $mapKey = trim((string) ($row['Department'] ?? '')) . '::' . trim((string) ($row['Unit'] ?? '')) . '::' . $row['ActivityKey'];
        $legacyScopeMap[$mapKey] = $row;
    }
    $yearScopeMap = [];
    foreach ($scopeYearRows as $row) {
        $mapKey = trim((string) ($row['Department'] ?? '')) . '::' . trim((string) ($row['Unit'] ?? '')) . '::' . $row['ActivityKey'];
        if (!isset($yearScopeMap[$mapKey]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $yearScopeMap[$mapKey] = $row;
        }
    }
    $scopeMap = [];
    foreach (activity_definitions() as $activity) {
        $activityKey = $activity['key'];
        $unitKey = trim((string) $department) . '::' . trim((string) $unit) . '::' . $activityKey;
        $departmentKey = trim((string) $department) . '::::' . $activityKey;
        $row = $yearScopeMap[$unitKey]
            ?? $legacyScopeMap[$unitKey]
            ?? $yearScopeMap[$departmentKey]
            ?? $legacyScopeMap[$departmentKey]
            ?? null;
        if ($row !== null) $scopeMap[$activityKey] = $row;
    }
    $overrideMap = [];
    foreach ($overrides as $row) {
        $row['targetYear'] = null;
        $overrideMap[$row['ActivityKey']] = $row;
    }
    foreach ($overrideYears as $row) {
        if (!isset($overrideMap[$row['ActivityKey']]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $overrideMap[$row['ActivityKey']] = $row;
        }
    }
    return ['position' => $position, 'department' => $department, 'unit' => $unit, 'targetYear' => $targetYear, 'templateMap' => $templateMap, 'scopeMap' => $scopeMap, 'overrideMap' => $overrideMap];
}

function target_row(array $activity, array $merged): array
{
    $key = $activity['key'];
    $row = $merged['overrideMap'][$key] ?? $merged['scopeMap'][$key] ?? $merged['templateMap'][$key] ?? null;
    $source = 'none';
    if (isset($merged['overrideMap'][$key])) {
        $source = 'override';
    } elseif (isset($merged['scopeMap'][$key])) {
        $source = 'scope';
    } elseif (isset($merged['templateMap'][$key])) {
        $source = 'template';
    } elseif ($activity['metricType'] === 'dynamic_ratio') {
        $source = 'system';
    }
    return [
        'activityKey' => $key, 'label' => $activity['label'], 'desc' => $activity['desc'],
        'metricType' => $activity['metricType'], 'scopeType' => $activity['scopeType'],
        'unitLabel' => $activity['unitLabel'], 'targetMode' => $activity['targetMode'],
        'yearlyTarget' => $row !== null ? (int) $row['YearlyTarget'] : null,
        'passPct' => $row !== null ? (int) $row['PassPct'] : null,
        'isNA' => $row !== null ? (int) $row['IsNA'] : 0,
        'source' => $source,
        'targetYear' => $row['targetYear'] ?? null,
        'scope' => $source === 'scope' ? ['department' => $row['Department'] ?? null, 'unit' => $row['Unit'] ?? ''] : null,
    ];
}

function activity_target_coverage_matrix_data(?int $year = null, bool $ensureSchema = true): array
{
    if ($ensureSchema) ensure_activity_target_tables();
    $targetYear = (int) ($year ?: date('Y'));
    $versioned = $targetYear >= 2000 && $targetYear <= 2100;
    $employees = db_rows(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position
         FROM employees
         WHERE COALESCE(EmployeeID,'')<>''
         ORDER BY Department,Unit,Position,EmployeeName"
    );
    $templates = db_rows('SELECT PositionName,ActivityKey,YearlyTarget,PassPct,IsNA FROM activity_position_templates');
    $scopes = db_rows('SELECT Department,Unit,ActivityKey,YearlyTarget,PassPct,IsNA FROM activity_scope_overrides');
    $overrides = db_rows('SELECT EmployeeID,ActivityKey,YearlyTarget,PassPct,IsNA FROM employee_activity_targets');
    $yearTemplates = $versioned ? db_rows('SELECT PositionName,ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM activity_position_template_years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [$targetYear, $targetYear]) : [];
    $yearScopes = $versioned ? db_rows('SELECT Department,Unit,ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM activity_scope_override_years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [$targetYear, $targetYear]) : [];
    $yearOverrides = $versioned ? db_rows('SELECT EmployeeID,ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM employee_activity_target_years WHERE TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [$targetYear, $targetYear]) : [];
    $templateMap = [];
    foreach ($templates as $row) $templateMap[trim((string) $row['PositionName']) . '::' . $row['ActivityKey']] = $row;
    foreach ($yearTemplates as $row) {
        $mapKey = trim((string) $row['PositionName']) . '::' . $row['ActivityKey'];
        if (!isset($templateMap[$mapKey]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $templateMap[$mapKey] = $row;
        }
    }
    $scopeMap = [];
    foreach ($scopes as $row) $scopeMap[trim((string) $row['Department']) . '::' . trim((string) $row['Unit']) . '::' . $row['ActivityKey']] = $row;
    foreach ($yearScopes as $row) {
        $mapKey = trim((string) $row['Department']) . '::' . trim((string) $row['Unit']) . '::' . $row['ActivityKey'];
        if (!isset($scopeMap[$mapKey]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $scopeMap[$mapKey] = $row;
        }
    }
    $overrideMap = [];
    foreach ($overrides as $row) $overrideMap[(string) $row['EmployeeID'] . '::' . $row['ActivityKey']] = $row;
    foreach ($yearOverrides as $row) {
        $mapKey = (string) $row['EmployeeID'] . '::' . $row['ActivityKey'];
        if (!isset($overrideMap[$mapKey]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $overrideMap[$mapKey] = $row;
        }
    }
    $rows = [];
    $summary = ['employees' => count($employees), 'slots' => 0, 'override' => 0, 'scope' => 0, 'template' => 0, 'system' => 0, 'missing' => 0, 'na' => 0, 'zero' => 0, 'review' => 0];
    foreach ($employees as $employee) {
        $empId = (string) ($employee['EmployeeID'] ?? '');
        $department = trim((string) ($employee['Department'] ?? ''));
        $unit = trim((string) ($employee['Unit'] ?? ''));
        $position = trim((string) ($employee['Position'] ?? ''));
        foreach (activity_definitions() as $activity) {
            $key = $activity['key'];
            $scope = null;
            if ($department !== '') {
                $scope = $scopeMap[$department . '::' . $unit . '::' . $key]
                    ?? $scopeMap[$department . '::::' . $key]
                    ?? null;
            }
            $row = $overrideMap[$empId . '::' . $key] ?? $scope ?? $templateMap[$position . '::' . $key] ?? null;
            $isDynamic = $activity['metricType'] === 'dynamic_ratio';
            $source = isset($overrideMap[$empId . '::' . $key]) ? 'override' : ($scope !== null ? 'scope' : (isset($templateMap[$position . '::' . $key]) ? 'template' : ($isDynamic ? 'system' : 'missing')));
            $isNA = $row !== null && !empty($row['IsNA']);
            $target = $row !== null ? (int) $row['YearlyTarget'] : null;
            $zero = !$isDynamic && !$isNA && $target !== null && $target === 0;
            $review = $source === 'missing' || $zero;
            $rows[] = [
                'employeeId' => $empId, 'employeeName' => (string) ($employee['EmployeeName'] ?? ''),
                'department' => $department, 'unit' => $unit, 'position' => $position,
                'activityKey' => $key, 'activityLabel' => $activity['label'],
                'metricType' => $activity['metricType'], 'scopeType' => $activity['scopeType'],
                'unitLabel' => $activity['unitLabel'], 'targetMode' => $activity['targetMode'],
                'yearlyTarget' => $target, 'passPct' => $row !== null ? (int) $row['PassPct'] : null,
                'isNA' => $isNA, 'isZero' => $zero, 'reviewNeeded' => $review, 'source' => $source,
                'targetYear' => $row['targetYear'] ?? null,
                'scope' => $source === 'scope' ? ['department' => (string) ($row['Department'] ?? ''), 'unit' => (string) ($row['Unit'] ?? '')] : null,
            ];
            $summary['slots']++;
            $summary[$source]++;
            if ($isNA) $summary['na']++;
            if ($zero) $summary['zero']++;
            if ($review) $summary['review']++;
        }
    }
    return ['targetYear' => $targetYear, 'summary' => $summary, 'rows' => $rows];
}

function handle_target_routes(string $method, string $path): bool
{
    if (strpos($path, '/activity-targets') !== 0) {
        return false;
    }
    $user = require_user();
    ensure_activity_target_tables();
    if ($method === 'GET' && $path === '/activity-targets/activities') {
        json_response(['success' => true, 'data' => activity_definitions()]);
    }
    if ($method === 'GET' && $path === '/activity-targets/position-templates') {
        $position = trim((string) ($_GET['position'] ?? ''));
        $targetYear = activity_target_request_year($_GET['TargetYear'] ?? $_GET['year'] ?? null);
        $versioned = $targetYear !== null;
        $rows = $position !== ''
            ? db_rows('SELECT * FROM activity_position_templates WHERE PositionName=? ORDER BY ActivityKey', [$position])
            : db_rows('SELECT * FROM activity_position_templates ORDER BY PositionName,ActivityKey');
        foreach ($rows as &$row) $row['targetYear'] = null;
        unset($row);
        if ($versioned) {
            $yearRows = $position !== ''
                ? db_rows('SELECT * FROM activity_position_template_years WHERE PositionName=? AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END,ActivityKey', [$position, $targetYear, $targetYear])
                : db_rows('SELECT * FROM activity_position_template_years WHERE TargetYear IN (?,0) ORDER BY PositionName,ActivityKey,CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [$targetYear, $targetYear]);
            $map = [];
            foreach ($rows as $row) $map[trim((string) $row['PositionName']) . '::' . $row['ActivityKey']] = $row;
            foreach ($yearRows as $row) {
                $key = trim((string) $row['PositionName']) . '::' . $row['ActivityKey'];
                if (!isset($map[$key]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
                    $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
                    $map[$key] = $row;
                }
            }
            $rows = array_values($map);
            usort($rows, static fn(array $a, array $b): int => [trim((string) ($a['PositionName'] ?? '')), (string) ($a['ActivityKey'] ?? '')] <=> [trim((string) ($b['PositionName'] ?? '')), (string) ($b['ActivityKey'] ?? '')]);
        }
        json_response(['success' => true, 'data' => $rows]);
    }
    if ($method === 'GET' && $path === '/activity-targets/scope-overrides') {
        $department = trim((string) ($_GET['department'] ?? ''));
        $unit = trim((string) ($_GET['unit'] ?? ''));
        $targetYear = activity_target_request_year($_GET['TargetYear'] ?? $_GET['year'] ?? null);
        $versioned = $targetYear !== null;
        $sql = 'SELECT * FROM activity_scope_overrides';
        $params = [];
        $where = [];
        if ($department !== '') {
            $where[] = 'Department=?';
            $params[] = $department;
        }
        if (array_key_exists('unit', $_GET)) {
            $where[] = 'Unit=?';
            $params[] = $unit;
        }
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY Department,Unit,ActivityKey';
        $rows = db_rows($sql, $params);
        foreach ($rows as &$row) $row['targetYear'] = null;
        unset($row);
        if ($versioned) {
            $yearWhere = $where;
            $yearParams = $params;
            $yearWhere[] = 'TargetYear IN (?,0)';
            $yearParams[] = $targetYear;
            $yearSql = 'SELECT * FROM activity_scope_override_years WHERE ' . implode(' AND ', $yearWhere) . ' ORDER BY Department,Unit,ActivityKey,CASE WHEN TargetYear=? THEN 0 ELSE 1 END';
            $yearParams[] = $targetYear;
            $map = [];
            foreach ($rows as $row) $map[(string) $row['Department'] . '::' . (string) ($row['Unit'] ?? '') . '::' . $row['ActivityKey']] = $row;
            foreach (db_rows($yearSql, $yearParams) as $row) {
                $key = (string) $row['Department'] . '::' . (string) ($row['Unit'] ?? '') . '::' . $row['ActivityKey'];
                if (!isset($map[$key]) || (int) ($row['TargetYear'] ?? 0) === $targetYear) {
                    $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
                    $map[$key] = $row;
                }
            }
            $rows = array_values($map);
            usort($rows, static fn(array $a, array $b): int => [trim((string) ($a['Department'] ?? '')), trim((string) ($a['Unit'] ?? '')), (string) ($a['ActivityKey'] ?? '')] <=> [trim((string) ($b['Department'] ?? '')), trim((string) ($b['Unit'] ?? '')), (string) ($b['ActivityKey'] ?? '')]);
        }
        json_response(['success' => true, 'data' => $rows]);
    }
    if ($method === 'GET' && $path === '/activity-targets/coverage-matrix') {
        require_admin();
        $targetYear = activity_target_request_year($_GET['TargetYear'] ?? $_GET['year'] ?? null, (int) date('Y'));
        json_response(['success' => true, 'data' => activity_target_coverage_matrix_data($targetYear)]);
    }
    if ($method === 'PUT' && $path === '/activity-targets/scope-overrides') {
        $admin = require_admin();
        $body = json_body();
        $department = trim((string) ($body['Department'] ?? ''));
        $unit = trim((string) ($body['Unit'] ?? ''));
        $key = trim((string) ($body['ActivityKey'] ?? ''));
        if ($department === '' || !valid_activity_key($key)) {
            json_response(['success' => false, 'message' => 'Department and valid ActivityKey are required.'], 400);
        }
        $targetYear = activity_target_request_year($body['TargetYear'] ?? null);
        $versioned = $targetYear !== null;
        if (!array_key_exists('YearlyTarget', $body) || $body['YearlyTarget'] === null) {
            if ($versioned) {
                db_execute('DELETE FROM activity_scope_override_years WHERE Department=? AND Unit=? AND ActivityKey=? AND TargetYear=?', [$department, $unit, $key, $targetYear]);
            } else {
                db_execute('DELETE FROM activity_scope_overrides WHERE Department=? AND Unit=? AND ActivityKey=?', [$department, $unit, $key]);
            }
            json_response(['success' => true, 'message' => 'Scope override removed successfully']);
        }
        $isNA = !empty($body['IsNA']) ? 1 : 0;
        [$yearlyTarget, $passPct] = activity_target_validated_values($body, $isNA === 1);
        if ($versioned) {
            db_execute(
                'INSERT INTO activity_scope_override_years (Department,Unit,ActivityKey,TargetYear,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$department, $unit, $key, $targetYear, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        } else {
            db_execute(
                'INSERT INTO activity_scope_overrides (Department,Unit,ActivityKey,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$department, $unit, $key, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        }
        json_response(['success' => true, 'message' => 'Scope override saved successfully']);
    }
    if ($method === 'PUT' && $path === '/activity-targets/position-templates') {
        $admin = require_admin();
        $body = json_body();
        $position = trim((string) ($body['PositionName'] ?? ''));
        $key = trim((string) ($body['ActivityKey'] ?? ''));
        if ($position === '' || !valid_activity_key($key)) {
            json_response(['success' => false, 'message' => 'PositionName and valid ActivityKey are required.'], 400);
        }
        $isNA = !empty($body['IsNA']) ? 1 : 0;
        $targetYear = activity_target_request_year($body['TargetYear'] ?? null);
        $versioned = $targetYear !== null;
        [$yearlyTarget, $passPct] = activity_target_validated_values($body, $isNA === 1);
        if ($versioned) {
            db_execute(
                'INSERT INTO activity_position_template_years (PositionName,ActivityKey,TargetYear,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$position, $key, $targetYear, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        } else {
            db_execute(
                'INSERT INTO activity_position_templates (PositionName,ActivityKey,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$position, $key, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        }
        json_response(['success' => true, 'message' => 'Template saved successfully']);
    }
    if ($method === 'POST' && $path === '/activity-targets/position-templates/bulk-apply') {
        $admin = require_admin();
        $body = json_body();
        $position = trim((string) ($body['PositionName'] ?? ''));
        $targetYear = activity_target_request_year($body['TargetYear'] ?? null);
        $versioned = $targetYear !== null;
        $templates = $versioned
            ? db_rows('SELECT ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear FROM activity_position_template_years WHERE PositionName=? AND TargetYear IN (?,0) ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END', [$position, $targetYear, $targetYear])
            : db_rows('SELECT ActivityKey,YearlyTarget,PassPct,IsNA FROM activity_position_templates WHERE PositionName=?', [$position]);
        if ($versioned) {
            $map = [];
            foreach ($templates as $template) {
                $key = (string) $template['ActivityKey'];
                if (!isset($map[$key]) || (int) ($template['TargetYear'] ?? 0) === $targetYear) $map[$key] = $template;
            }
            $templates = array_values($map);
        }
        if ($position === '' || !$templates) {
            json_response(['success' => false, 'message' => 'Position template is required.'], 400);
        }
        $employees = db_rows('SELECT EmployeeID FROM employees WHERE Position=?', [$position]);
        foreach ($employees as $employee) {
            foreach ($templates as $template) {
                if ($versioned) {
                    db_execute(
                        'INSERT INTO employee_activity_target_years (EmployeeID,ActivityKey,TargetYear,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?,?)
                         ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                        [$employee['EmployeeID'], $template['ActivityKey'], $targetYear, $template['YearlyTarget'], $template['PassPct'], $template['IsNA'], (string) ($admin['name'] ?? '')]
                    );
                } else {
                    db_execute(
                        'INSERT INTO employee_activity_targets (EmployeeID,ActivityKey,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?)
                         ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                        [$employee['EmployeeID'], $template['ActivityKey'], $template['YearlyTarget'], $template['PassPct'], $template['IsNA'], (string) ($admin['name'] ?? '')]
                    );
                }
            }
        }
        json_response(['success' => true, 'updated' => count($employees) * count($templates), 'message' => 'Templates applied successfully']);
    }
    $params = route_params($path, '/activity-targets/employee/:empId');
    if ($params !== null && $method === 'GET') {
        $targetYear = activity_target_request_year($_GET['TargetYear'] ?? $_GET['year'] ?? null, (int) date('Y'));
        $merged = merged_activity_targets($params['empId'], $targetYear);
        $targets = [];
        foreach (activity_definitions() as $activity) {
            $targets[] = target_row($activity, $merged);
        }
        json_response(['success' => true, 'data' => ['empId' => $params['empId'], 'position' => $merged['position'], 'department' => $merged['department'], 'unit' => $merged['unit'], 'targetYear' => $merged['targetYear'], 'targets' => $targets]]);
    }
    if ($params !== null && $method === 'PUT') {
        $admin = require_admin();
        $body = json_body();
        $key = trim((string) ($body['ActivityKey'] ?? ''));
        if (!valid_activity_key($key)) {
            json_response(['success' => false, 'message' => 'Valid ActivityKey is required.'], 400);
        }
        $targetYear = activity_target_request_year($body['TargetYear'] ?? null);
        $versioned = $targetYear !== null;
        if (!array_key_exists('YearlyTarget', $body) || $body['YearlyTarget'] === null) {
            if ($versioned) {
                db_execute('DELETE FROM employee_activity_target_years WHERE EmployeeID=? AND ActivityKey=? AND TargetYear=?', [$params['empId'], $key, $targetYear]);
            } else {
                db_execute('DELETE FROM employee_activity_targets WHERE EmployeeID=? AND ActivityKey=?', [$params['empId'], $key]);
            }
            json_response(['success' => true, 'message' => 'Override removed successfully']);
        }
        $isNA = !empty($body['IsNA']) ? 1 : 0;
        [$yearlyTarget, $passPct] = activity_target_validated_values($body, $isNA === 1);
        if ($versioned) {
            db_execute(
                'INSERT INTO employee_activity_target_years (EmployeeID,ActivityKey,TargetYear,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$params['empId'], $key, $targetYear, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        } else {
            db_execute(
                'INSERT INTO employee_activity_targets (EmployeeID,ActivityKey,YearlyTarget,PassPct,IsNA,UpdatedBy) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE YearlyTarget=VALUES(YearlyTarget),PassPct=VALUES(PassPct),IsNA=VALUES(IsNA),UpdatedBy=VALUES(UpdatedBy)',
                [$params['empId'], $key, activity_target_storage_value($key, $yearlyTarget, $isNA), $passPct, $isNA, (string) ($admin['name'] ?? '')]
            );
        }
        json_response(['success' => true, 'message' => 'Override saved successfully']);
    }
    if ($method === 'GET' && $path === '/activity-targets/me') {
        $merged = merged_activity_targets((string) ($user['id'] ?? ''));
        $year = (int) date('Y');
        $cccfWorkerProgress = cccf_worker_progress_data($year);
        $cccfWorkerSelf = null;
        foreach (($cccfWorkerProgress['employees'] ?? []) as $progressRow) {
            if ((string) ($progressRow['employeeId'] ?? '') === (string) ($user['id'] ?? '')) {
                $cccfWorkerSelf = $progressRow;
                break;
            }
        }
        $dynamicRatios = [
            'patrol_issue' => dynamic_activity_ratio('patrol_issue', (string) ($user['department'] ?? ''), $year),
            'yokoten' => dynamic_activity_ratio('yokoten', (string) ($user['department'] ?? ''), $year),
        ];
        $peopleCoverages = [];
        foreach (activity_definitions() as $activity) {
            if ($activity['metricType'] !== 'people_coverage') continue;
            $target = target_row($activity, $merged);
            if ($target['yearlyTarget'] === null) continue;
            $isPersonalCccfWorker = $activity['key'] === 'cccf_worker'
                && isset($merged['templateMap']['cccf_worker'])
                && empty($merged['templateMap']['cccf_worker']['IsNA'])
                && (int) ($merged['templateMap']['cccf_worker']['YearlyTarget'] ?? 0) > 0;
            if ($isPersonalCccfWorker) continue;
            $peopleCoverages[$activity['key']] = people_coverage(
                $activity['key'],
                (string) ($user['department'] ?? ''),
                (string) ($merged['unit'] ?? ''),
                $year,
                $target['yearlyTarget']
            );
        }
        $fixedCountAlignments = [];
        foreach (activity_definitions() as $activity) {
            if (!in_array($activity['key'], ['patrol', 'ky'], true)) continue;
            $target = target_row($activity, $merged);
            $fixedCountAlignments[$activity['key']] = fixed_count_alignment(
                $activity['key'],
                (string) ($user['id'] ?? ''),
                (string) ($user['department'] ?? ''),
                (string) ($merged['unit'] ?? ''),
                $year,
                $target['yearlyTarget']
            );
        }
        $actuals = [
            'patrol' => safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=?', [$user['id'], $year]),
            'patrol_issue' => safe_scalar('SELECT COUNT(*) FROM patrol_issues WHERE ReporterID=? AND YEAR(DateFound)=?', [$user['id'], $year]),
            'cccf_worker' => $cccfWorkerSelf ? (int) ($cccfWorkerSelf['actualTowardTarget'] ?? 0) : safe_scalar('SELECT COUNT(*) FROM cccf_forma_worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?', [$user['id'], $year]),
            'cccf_permanent' => safe_scalar('SELECT COUNT(*) FROM cccf_forma_permanent WHERE SubmitterName=? AND YEAR(SubmitDate)=?', [$user['name'], $year]),
            'scw' => safe_scalar('SELECT COUNT(*) FROM scw_documents WHERE UploadedBy=? AND YEAR(UploadedAt)=?', [$user['name'], $year]),
            'training' => safe_scalar('SELECT COUNT(*) FROM training_records WHERE EmployeeID=? AND YEAR(TrainingDate)=? AND IsPassed=1', [$user['id'], $year]),
            'yokoten' => safe_scalar('SELECT COUNT(*) FROM yokotenresponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?', [$user['id'], $year]),
            'hiyari' => safe_scalar('SELECT COUNT(*) FROM hiyarireports WHERE ReporterID=? AND YEAR(ReportDate)=?', [$user['id'], $year]),
            'ky' => safe_scalar('SELECT COUNT(*) FROM ky_activities WHERE ReporterID=? AND YEAR(ActivityDate)=?', [$user['id'], $year]),
        ];
        $targets = [];
        foreach (activity_definitions() as $activity) {
            $row = target_row($activity, $merged);
            $ratio = $dynamicRatios[$activity['key']] ?? $peopleCoverages[$activity['key']] ?? $fixedCountAlignments[$activity['key']] ?? null;
            if ($row['isNA'] || ($ratio === null && $row['metricType'] !== 'dynamic_ratio' && $row['yearlyTarget'] === null)) {
                continue;
            }
            $actual = $ratio ? (int) $ratio['numerator'] : (int) ($actuals[$activity['key']] ?? 0);
            if ($ratio) $row['yearlyTarget'] = (int) $ratio['denominator'];
            if ($activity['key'] === 'cccf_worker' && $cccfWorkerSelf) {
                $row['yearlyTarget'] = (int) ($cccfWorkerSelf['target'] ?? 0);
                $actual = (int) ($cccfWorkerSelf['actualTowardTarget'] ?? 0);
                $row['rawRecords'] = (int) ($cccfWorkerSelf['rawRecords'] ?? 0);
            }
            $pct = $ratio ? $ratio['completionPct'] : ($row['yearlyTarget'] > 0 ? min(100, (int) round($actual / $row['yearlyTarget'] * 100)) : null);
            $row['actualCount'] = $actual;
            $row['completionPct'] = $pct;
            $row['passed'] = $pct !== null ? $pct >= ($row['passPct'] ?? 80) : null;
            $row['noData'] = $ratio ? $ratio['noData'] : false;
            $row['calculationScope'] = $ratio ? ($ratio['calculationScope'] ?? ['type' => 'department', 'department' => $ratio['department']]) : null;
            $row['calculationMethod'] = $ratio['calculationMethod'] ?? null;
            $row['targetSource'] = $ratio['targetSource'] ?? null;
            if ($activity['key'] === 'cccf_worker'
                && isset($merged['templateMap']['cccf_worker'])
                && empty($merged['templateMap']['cccf_worker']['IsNA'])
                && (int) ($merged['templateMap']['cccf_worker']['YearlyTarget'] ?? 0) > 0) {
                $row['calculationScope'] = ['type' => 'employee', 'employeeId' => (string) ($user['id'] ?? '')];
                $row['calculationMethod'] = 'cccf_worker_progress_engine_actual_toward_target';
            }
            if ($row['source'] === 'none' && !empty($row['targetSource']) && $row['targetSource'] !== 'activity_target') $row['source'] = 'module';
            $targets[] = $row;
        }
        json_response(['success' => true, 'data' => compact('year', 'targets')]);
    }
    return false;
}
