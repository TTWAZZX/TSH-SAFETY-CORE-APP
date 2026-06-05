<?php
declare(strict_types=1);

function count_value(string $sql, array $params = []): int
{
    return (int) (safe_scalar($sql, $params) ?? 0);
}

function timeline_record(string $type, string $module, array $row, string $dateKey, string $titleKey, string $statusKey = '', string $detailKey = ''): array
{
    $status = $statusKey !== '' ? (string) ($row[$statusKey] ?? '') : '';
    $lower = strtolower($type . ' ' . $status);
    $severity = strpos($lower, 'accident') !== false || strpos($lower, 'violation') !== false || strpos($lower, 'issue') !== false ? 'risk' : 'normal';
    return [
        'type' => $type, 'module' => $module, 'date' => $row[$dateKey] ?? null,
        'title' => (string) ($row[$titleKey] ?? $type), 'status' => $status,
        'detail' => $detailKey !== '' ? (string) ($row[$detailKey] ?? '') : '',
        'severity' => $severity, 'refId' => $row['id'] ?? $row['ResponseID'] ?? $row['InspectionID'] ?? $row['ViolationID'] ?? null,
    ];
}

function handle_people_routes(string $method, string $path): bool
{
    if (strpos($path, '/person-search') !== 0) {
        return false;
    }
    $user = require_user();
    if ($method === 'GET' && $path === '/person-search/employees') {
        $q = trim((string) ($_GET['q'] ?? ''));
        $department = trim((string) ($_GET['department'] ?? ''));
        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 20)));
        $sql = 'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role FROM employees WHERE 1=1';
        $params = [];
        if ($q !== '') {
            $like = '%' . $q . '%';
            $sql .= ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Unit LIKE ? OR Position LIKE ?)';
            $params = [$like, $like, $like, $like, $like];
        }
        if ($department !== '' && $department !== 'all') {
            $sql .= ' AND Department=?';
            $params[] = $department;
        }
        json_response(['success' => true, 'data' => db_rows($sql . ' ORDER BY EmployeeName ASC LIMIT ' . $limit, $params)]);
    }
    $params = route_params($path, '/person-search/profile/:employeeId');
    if ($params === null || $method !== 'GET') {
        return false;
    }
    $employeeId = trim((string) $params['employeeId']);
    $year = (int) ($_GET['year'] ?? date('Y'));
    $employee = db_row('SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$employee) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    }
    $metrics = [
        'patrol' => count_value('SELECT COUNT(*) FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=?', [$employeeId, $year]),
        'patrolIssues' => count_value('SELECT COUNT(*) FROM patrol_issues WHERE ReporterID=? AND YEAR(DateFound)=?', [$employeeId, $year]),
        'cccfWorker' => count_value('SELECT COUNT(*) FROM cccf_forma_worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?', [$employeeId, $year]),
        'cccfPermanent' => count_value('SELECT COUNT(*) FROM cccf_forma_permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=?', [$employeeId, $year]),
        'training' => count_value('SELECT COUNT(*) FROM training_records WHERE EmployeeID=? AND YEAR(TrainingDate)=?', [$employeeId, $year]),
        'trainingPassed' => count_value('SELECT COUNT(*) FROM training_records WHERE EmployeeID=? AND YEAR(TrainingDate)=? AND IsPassed=1', [$employeeId, $year]),
        'hiyari' => count_value('SELECT COUNT(*) FROM hiyarireports WHERE ReporterID=? AND YEAR(ReportDate)=?', [$employeeId, $year]),
        'ky' => count_value('SELECT COUNT(*) FROM ky_activities WHERE ReporterID=? AND YEAR(ActivityDate)=?', [$employeeId, $year]),
        'yokoten' => count_value('SELECT COUNT(*) FROM yokotenresponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?', [$employeeId, $year]),
        'accidents' => count_value('SELECT COUNT(*) FROM accident_reports WHERE EmployeeID=? AND YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)', [$employeeId, $year]),
        'policyAck' => count_value('SELECT COUNT(*) FROM policy_acknowledgements WHERE UserID=?', [$employeeId]),
        'ppeViolations' => count_value('SELECT COUNT(*) FROM sc_ppe_violations WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND deleted_at IS NULL', [$employeeId, $year]),
        'scwDocs' => count_value('SELECT COUNT(*) FROM scw_documents WHERE UploadedBy=? AND YEAR(UploadedAt)=?', [$employee['EmployeeName'], $year]),
        'ojtDept' => count_value('SELECT COUNT(*) FROM ojt_records WHERE Department=? AND YEAR(OJTDate)=?', [$employee['Department'], $year]),
    ];
    $fourmScopes = safe_rows(
        'SELECT ce.id AS AssignmentID,ce.Status,ce.AssignedAt,ce.RemovedAt,cur.id AS CurriculumID,cur.CurriculumCode,cur.CurriculumTitle,cur.Department,cur.Year
         FROM fourm_curriculumemployees ce JOIN fourm_curriculums cur ON cur.id=ce.CurriculumID WHERE ce.EmployeeID=? AND cur.Year=? ORDER BY ce.AssignedAt DESC LIMIT 8',
        [$employeeId, $year]
    );
    $metrics['fourmScopes'] = count(array_filter($fourmScopes, static function ($row) {
        return ($row['Status'] ?? '') === 'Assigned';
    }));
    $metrics['fourmLogs'] = 0;
    $metrics['ppeInspections'] = count_value('SELECT COUNT(*) FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL', [$employeeId, $year]);
    $metrics['ppeInspectionPassed'] = count_value('SELECT COUNT(*) FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL AND IsPass=1', [$employeeId, $year]);
    $metrics['ppeCompliancePct'] = null;
    $trainingRate = percent($metrics['trainingPassed'], $metrics['training']);
    $activityCount = $metrics['hiyari'] + $metrics['ky'] + $metrics['cccfWorker'] + $metrics['cccfPermanent'];
    $activityActuals = [
        'patrol' => $metrics['patrol'], 'patrol_issue' => $metrics['patrolIssues'],
        'cccf_worker' => $metrics['cccfWorker'], 'cccf_permanent' => $metrics['cccfPermanent'],
        'scw' => $metrics['scwDocs'], 'training' => $metrics['trainingPassed'],
        'yokoten' => $metrics['yokoten'], 'hiyari' => $metrics['hiyari'], 'ky' => $metrics['ky'],
    ];
    ensure_activity_target_tables();
    $mergedTargets = merged_activity_targets($employeeId);
    $dynamicRatios = [
        'patrol_issue' => dynamic_activity_ratio('patrol_issue', (string) ($employee['Department'] ?? ''), $year),
        'yokoten' => dynamic_activity_ratio('yokoten', (string) ($employee['Department'] ?? ''), $year),
    ];
    $peopleCoverages = [];
    foreach (activity_definitions() as $activity) {
        if ($activity['metricType'] !== 'people_coverage') continue;
        $target = target_row($activity, $mergedTargets);
        if ($target['yearlyTarget'] === null) continue;
        $peopleCoverages[$activity['key']] = people_coverage(
            $activity['key'],
            (string) ($employee['Department'] ?? ''),
            (string) ($mergedTargets['unit'] ?? ''),
            $year,
            $target['yearlyTarget']
        );
    }
    $fixedCountAlignments = [];
    foreach (activity_definitions() as $activity) {
        if (!in_array($activity['key'], ['patrol', 'ky'], true)) continue;
        $target = target_row($activity, $mergedTargets);
        $fixedCountAlignments[$activity['key']] = fixed_count_alignment(
            $activity['key'],
            $employeeId,
            (string) ($employee['Department'] ?? ''),
            (string) ($mergedTargets['unit'] ?? ''),
            $year,
            $target['yearlyTarget']
        );
    }
    $activityTargets = [];
    foreach (activity_definitions() as $activity) {
        $target = target_row($activity, $mergedTargets);
        $ratio = $dynamicRatios[$activity['key']] ?? $peopleCoverages[$activity['key']] ?? $fixedCountAlignments[$activity['key']] ?? null;
        if ($target['isNA'] || ($ratio === null && $target['yearlyTarget'] === null)) continue;
        $actual = $ratio ? (int) $ratio['numerator'] : (int) ($activityActuals[$activity['key']] ?? 0);
        if ($ratio) $target['yearlyTarget'] = (int) $ratio['denominator'];
        $completion = $ratio ? $ratio['completionPct'] : ($target['yearlyTarget'] > 0 ? min(100, (int) round($actual / $target['yearlyTarget'] * 100)) : null);
        $target['actualCount'] = $actual;
        $target['completionPct'] = $completion;
        $target['passed'] = $completion !== null ? $completion >= ($target['passPct'] ?? 80) : null;
        $target['noData'] = $ratio ? $ratio['noData'] : false;
        $target['calculationScope'] = $ratio ? ($ratio['calculationScope'] ?? ['type' => 'department', 'department' => $ratio['department']]) : null;
        $target['calculationMethod'] = $ratio['calculationMethod'] ?? null;
        $target['targetSource'] = $ratio['targetSource'] ?? null;
        if ($target['source'] === 'none' && !empty($target['targetSource']) && $target['targetSource'] !== 'activity_target') $target['source'] = 'module';
        $activityTargets[] = $target;
    }
    $evaluableActivityTargets = array_values(array_filter($activityTargets, static function ($row) {
        return empty($row['noData']) && ($row['passed'] ?? null) !== null;
    }));
    $activityTargetSummary = [
        'configured' => count($activityTargets),
        'evaluable' => count($evaluableActivityTargets),
        'passed' => count(array_filter($evaluableActivityTargets, static function ($row) { return ($row['passed'] ?? null) === true; })),
        'noData' => count($activityTargets) - count($evaluableActivityTargets),
    ];
    $riskEvents = $metrics['accidents'] + $metrics['ppeViolations'] + $metrics['patrolIssues'];
    $score = max(0, min(100, 100 - min(40, $riskEvents * 15) - ($metrics['training'] ? max(0, 80 - (int) $trainingRate) : 15) - ($activityCount ? 0 : 10)));
    $status = $metrics['accidents'] || $metrics['ppeViolations'] || $score < 60 ? 'Action Needed' : ($score < 80 || !$activityCount ? 'Watch' : 'Good');
    $patrolRecords = safe_rows('SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? ORDER BY PatrolDate DESC,id DESC LIMIT 12', [$employeeId, $year]);
    $trainingRecords = safe_rows('SELECT r.id,r.TrainingDate,r.Score,r.IsPassed,c.CourseName,c.CourseCode FROM training_records r LEFT JOIN training_courses c ON c.id=r.CourseID WHERE r.EmployeeID=? AND YEAR(r.TrainingDate)=? ORDER BY r.TrainingDate DESC,r.id DESC LIMIT 8', [$employeeId, $year]);
    $timeline = [];
    foreach ($patrolRecords as $row) {
        $timeline[] = timeline_record('Patrol', 'patrol', $row, 'PatrolDate', 'Area', 'PatrolType', 'Notes');
    }
    foreach ($trainingRecords as $row) {
        $row['TrainingStatus'] = !empty($row['IsPassed']) ? 'Passed' : 'Not passed';
        $timeline[] = timeline_record('Training', 'training', $row, 'TrainingDate', 'CourseName', 'TrainingStatus', 'CourseCode');
    }
    usort($timeline, static function ($a, $b) {
        return strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? ''));
    });
    $timeline = array_slice($timeline, 0, 40);
    $complianceSignals = [
        ['key' => 'training', 'label' => 'Training', 'status' => $metrics['training'] && $trainingRate >= 80 ? 'Good' : 'Watch', 'value' => $metrics['trainingPassed'] . '/' . $metrics['training'], 'detail' => $trainingRate === null ? 'No training records' : $trainingRate . '% pass rate'],
        ['key' => 'fourm', 'label' => '4M Scope', 'status' => $metrics['fourmScopes'] ? 'Good' : 'Watch', 'value' => $metrics['fourmScopes'] . ' active', 'detail' => 'Active curriculum scope'],
        ['key' => 'risk', 'label' => 'Risk Events', 'status' => $riskEvents ? 'Action Needed' : 'Good', 'value' => $riskEvents . ' events', 'detail' => 'Accident, PPE violation, and patrol issue'],
        ['key' => 'activity', 'label' => 'Safety Activity', 'status' => $activityCount ? 'Good' : 'Watch', 'value' => $activityCount . ' records', 'detail' => 'KY, Hiyari, and CCCF records'],
        ['key' => 'ppe', 'label' => 'PPE', 'status' => $metrics['ppeViolations'] ? 'Action Needed' : 'Good', 'value' => $metrics['ppeViolations'] . ' violations', 'detail' => 'PPE compliance events'],
    ];
    $riskProfile = ['score' => $score, 'status' => $status, 'factors' => [], 'reasons' => [], 'nextActions' => [], 'thresholds' => ['good' => 80, 'watch' => 60], 'counters' => ['trainingPassRate' => $trainingRate, 'riskEventCount' => $riskEvents, 'currentYearActivity' => $activityCount]];
    json_response(['success' => true, 'data' => [
        'year' => $year, 'employee' => $employee,
        'access' => ['canManagePatrol' => strcasecmp((string) ($user['role'] ?? ''), 'Admin') === 0, 'canViewSensitive' => strcasecmp((string) ($user['role'] ?? ''), 'Admin') === 0 || (string) ($user['id'] ?? '') === $employeeId],
        'metrics' => $metrics, 'complianceScore' => $score, 'overallStatus' => $status, 'riskProfile' => $riskProfile,
        'activityTargets' => $activityTargets, 'activityTargetSummary' => $activityTargetSummary,
        'complianceSignals' => $complianceSignals, 'fourmScopes' => $fourmScopes, 'fourmLogs' => [], 'cccfRecords' => [],
        'ppeInspections' => [], 'ppeViolations' => [], 'patrolRecords' => $patrolRecords, 'selfPatrolRecords' => [],
        'trainingRecords' => $trainingRecords, 'timelineSummary' => ['total' => count($timeline), 'byModule' => [], 'bySeverity' => []], 'timeline' => $timeline,
    ]]);
}
