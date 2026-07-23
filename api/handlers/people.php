<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/cccf_worker_progress.php';

function count_value(string $sql, array $params = []): int
{
    return (int) (safe_scalar($sql, $params) ?? 0);
}

function people_text_length(string $value): int
{
    if (function_exists('mb_strlen')) return mb_strlen($value, 'UTF-8');
    $count = preg_match_all('/./us', $value, $matches);
    return $count === false ? strlen($value) : $count;
}

function people_has_control_characters(string $value): bool
{
    return preg_match('/[\x00-\x1F\x7F]/u', $value) === 1;
}

function people_parse_bounded_integer($value, string $name, int $fallback, int $min, int $max): array
{
    if ($value === null || $value === '') return ['ok' => true, 'value' => $fallback];
    if (is_array($value)) return ['ok' => false, 'message' => "$name must be an integer from $min to $max."];
    $raw = trim((string) $value);
    if (!preg_match('/^\d+$/', $raw)) return ['ok' => false, 'message' => "$name must be an integer from $min to $max."];
    $parsed = (int) $raw;
    return $parsed >= $min && $parsed <= $max
        ? ['ok' => true, 'value' => $parsed]
        : ['ok' => false, 'message' => "$name must be an integer from $min to $max."];
}

function people_escape_like(string $value): string
{
    return strtr($value, ['=' => '==', '%' => '=%', '_' => '=_']);
}

function timeline_record(string $type, string $module, array $row, string $dateKey, string $titleKey, string $statusKey = '', string $detailKey = ''): array
{
    $status = $statusKey !== '' ? (string) ($row[$statusKey] ?? '') : '';
    $lower = strtolower($type . ' ' . $status);
    $severity = strpos($lower, 'accident') !== false || strpos($lower, 'violation') !== false || strpos($lower, 'issue') !== false || strpos($lower, 'not passed') !== false
        ? 'risk'
        : (strpos($lower, '4m') !== false || strpos($lower, 'training') !== false || strpos($lower, 'cccf') !== false ? 'info' : 'normal');
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
    $isAdmin = strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0;
    if ($method === 'GET' && $path === '/person-search/employees') {
        if (is_array($_GET['q'] ?? null) || is_array($_GET['department'] ?? null)) {
            json_response(['success' => false, 'message' => 'Invalid search parameters.'], 400);
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        $department = trim((string) ($_GET['department'] ?? ''));
        $limitResult = people_parse_bounded_integer($_GET['limit'] ?? null, 'limit', 20, 1, 50);
        $pageResult = people_parse_bounded_integer($_GET['page'] ?? null, 'page', 1, 1, 10000);
        if (!$limitResult['ok']) json_response(['success' => false, 'message' => $limitResult['message']], 400);
        if (!$pageResult['ok']) json_response(['success' => false, 'message' => $pageResult['message']], 400);
        if ($isAdmin && (people_text_length($q) < 2 || people_text_length($q) > 100 || people_has_control_characters($q))) {
            json_response(['success' => false, 'message' => 'q must contain 2 to 100 characters.'], 400);
        }
        if (people_text_length($department) > 150 || people_has_control_characters($department)) {
            json_response(['success' => false, 'message' => 'department must contain at most 150 characters.'], 400);
        }
        $limit = (int) $limitResult['value'];
        $page = (int) $pageResult['value'];
        $offset = ($page - 1) * $limit;
        $sql = 'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position FROM employees WHERE ' . ($isAdmin ? '1=1' : 'EmployeeID=?');
        $params = [];
        if (!$isAdmin) {
            $params[] = (string) ($user['id'] ?? '');
        } elseif ($q !== '') {
            $like = '%' . people_escape_like($q) . '%';
            $sql .= " AND (EmployeeID LIKE ? ESCAPE '=' OR EmployeeName LIKE ? ESCAPE '=' OR Department LIKE ? ESCAPE '=' OR Unit LIKE ? ESCAPE '=' OR Position LIKE ? ESCAPE '=')";
            $params = [$like, $like, $like, $like, $like];
        }
        if ($isAdmin && $department !== '' && $department !== 'all') {
            $sql .= ' AND Department=?';
            $params[] = $department;
        }
        $rows = db_rows($sql . ' ORDER BY EmployeeName ASC,EmployeeID ASC LIMIT ' . $limit . ' OFFSET ' . $offset, $params);
        json_response(['success' => true, 'data' => $rows, 'pagination' => ['page' => $page, 'limit' => $limit, 'returned' => count($rows)]]);
    }
    $params = route_params($path, '/person-search/profile/:employeeId');
    if ($params === null || $method !== 'GET') {
        return false;
    }
    $employeeId = trim((string) $params['employeeId']);
    if ($employeeId === '') {
        json_response(['success' => false, 'message' => 'ต้องระบุ EmployeeID'], 400);
    }
    if (people_text_length($employeeId) > 50 || people_has_control_characters($employeeId)) {
        json_response(['success' => false, 'message' => 'EmployeeID must contain at most 50 characters.'], 400);
    }
    $yearResult = people_parse_bounded_integer($_GET['year'] ?? null, 'year', (int) date('Y'), 2000, 2100);
    if (!$yearResult['ok']) json_response(['success' => false, 'message' => $yearResult['message']], 400);
    if (!$isAdmin && (string) ($user['id'] ?? '') !== $employeeId) {
        json_response(['success' => false, 'message' => 'คุณสามารถดู Safety 360 ของตนเองเท่านั้น'], 403);
    }
    $year = (int) $yearResult['value'];
    $employee = db_row('SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$employee) {
        json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    }
    try {
        $cccfWorkerProgress = cccf_worker_progress_data($year, false);
    } catch (Throwable $error) {
        $cccfWorkerProgress = ['employees' => []];
    }
    $cccfWorkerSelf = null;
    foreach (($cccfWorkerProgress['employees'] ?? []) as $progressRow) {
        if ((string) ($progressRow['employeeId'] ?? '') === $employeeId) {
            $cccfWorkerSelf = $progressRow;
            break;
        }
    }
    $cccfWorkerRawCount = count_value('SELECT COUNT(*) FROM cccf_forma_worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?', [$employeeId, $year]);
    $metrics = [
        'patrol' => count_value('SELECT COUNT(*) FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=?', [$employeeId, $year]),
        'patrolIssues' => count_value('SELECT COUNT(*) FROM patrol_issues WHERE ReporterID=? AND YEAR(DateFound)=?', [$employeeId, $year]),
        'cccfWorker' => $cccfWorkerSelf ? (int) ($cccfWorkerSelf['actualTowardTarget'] ?? 0) : $cccfWorkerRawCount,
        'cccfWorkerRaw' => $cccfWorkerSelf ? (int) ($cccfWorkerSelf['rawRecords'] ?? 0) : $cccfWorkerRawCount,
        'cccfWorkerTarget' => $cccfWorkerSelf ? (int) ($cccfWorkerSelf['target'] ?? 0) : 0,
        'cccfPermanent' => count_value('SELECT COUNT(*) FROM cccf_forma_permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=?', [$employeeId, $year]),
        'training' => count_value('SELECT COUNT(*) FROM training_records WHERE EmployeeID=? AND YEAR(TrainingDate)=?', [$employeeId, $year]),
        'trainingPassed' => count_value('SELECT COUNT(*) FROM training_records WHERE EmployeeID=? AND YEAR(TrainingDate)=? AND IsPassed=1', [$employeeId, $year]),
        'hiyari' => count_value('SELECT COUNT(*) FROM hiyarireports WHERE ReporterID=? AND YEAR(ReportDate)=?', [$employeeId, $year]),
        'ky' => count_value('SELECT COUNT(*) FROM ky_activities WHERE ReporterID=? AND YEAR(ActivityDate)=?', [$employeeId, $year]),
        'yokoten' => count_value('SELECT COUNT(*) FROM yokotenresponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?', [$employeeId, $year]),
        'accidents' => count_value('SELECT COUNT(*) FROM accident_reports WHERE EmployeeID=? AND YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)', [$employeeId, $year]),
        'fourmOwner' => count_value('SELECT COUNT(*) FROM fourm_changenotices WHERE ResponsiblePerson=? AND YEAR(RequestDate)=?', [$employee['EmployeeName'], $year]),
        'fourmCreated' => count_value('SELECT COUNT(*) FROM fourm_changenotices WHERE CreatedByID=? AND YEAR(RequestDate)=?', [$employeeId, $year]),
        'policyAck' => count_value('SELECT COUNT(*) FROM policy_acknowledgements WHERE UserID=?', [$employeeId]),
        'ppeViolations' => count_value('SELECT COUNT(*) FROM sc_ppe_violations WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND deleted_at IS NULL', [$employeeId, $year]),
        'scwDocs' => count_value('SELECT COUNT(*) FROM scw_documents WHERE UploadedBy=? AND YEAR(UploadedAt)=?', [$employee['EmployeeName'], $year]),
        'ojtDept' => count_value('SELECT COUNT(*) FROM ojt_records WHERE Department=? AND YEAR(OJTDate)=?', [$employee['Department'], $year]),
    ];
    $fourmScopes = safe_rows(
        'SELECT ce.id AS AssignmentID,ce.Status,ce.AssignedAt,ce.RemovedAt,cur.id AS CurriculumID,cur.CurriculumCode,cur.CurriculumTitle,cur.Department,cur.Year,
                COUNT(DISTINCT CASE WHEN c.IsActive=1 THEN c.id END) AS CourseCount
         FROM fourm_curriculumemployees ce
         JOIN fourm_curriculums cur ON cur.id=ce.CurriculumID
         LEFT JOIN fourm_courses c ON c.CurriculumID=cur.id
         WHERE ce.EmployeeID=? AND cur.Year=?
         GROUP BY ce.id,ce.Status,ce.AssignedAt,ce.RemovedAt,cur.id,cur.CurriculumCode,cur.CurriculumTitle,cur.Department,cur.Year
         ORDER BY ce.Status=\'Assigned\' DESC,ce.AssignedAt DESC LIMIT 8',
        [$employeeId, $year]
    );
    $fourmLogs = safe_rows(
        'SELECT l.id,l.Action,l.CurriculumID,l.CourseID,l.EmployeeID,l.OldValue,l.NewValue,l.PerformedBy,l.PerformedAt,
                cur.CurriculumCode,cur.CurriculumTitle,c.CourseCode,c.CourseTitle
         FROM fourm_curriculumlogs l
         LEFT JOIN fourm_curriculums cur ON cur.id=l.CurriculumID
         LEFT JOIN fourm_courses c ON c.id=l.CourseID
         WHERE l.EmployeeID=? AND YEAR(l.PerformedAt)=?
         ORDER BY l.PerformedAt DESC LIMIT 10',
        [$employeeId, $year]
    );
    $metrics['fourmScopes'] = count(array_filter($fourmScopes, static function ($row) {
        return ($row['Status'] ?? '') === 'Assigned';
    }));
    $metrics['fourmLogs'] = count($fourmLogs);
    $metrics['ppeInspections'] = count_value('SELECT COUNT(*) FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL', [$employeeId, $year]);
    $metrics['ppeInspectionPassed'] = count_value('SELECT COUNT(*) FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL AND IsPass=1', [$employeeId, $year]);
    $ppeSummaryRows = safe_rows(
        'SELECT AVG(CompliancePct) AS avgCompliance FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL',
        [$employeeId, $year]
    );
    $metrics['ppeCompliancePct'] = isset($ppeSummaryRows[0]['avgCompliance']) ? (int) round((float) $ppeSummaryRows[0]['avgCompliance']) : null;
    $activityActuals = [
        'patrol' => $metrics['patrol'], 'patrol_issue' => $metrics['patrolIssues'],
        'cccf_worker' => $metrics['cccfWorker'], 'cccf_permanent' => $metrics['cccfPermanent'],
        'scw' => $metrics['scwDocs'], 'training' => $metrics['trainingPassed'],
        'yokoten' => $metrics['yokoten'], 'hiyari' => $metrics['hiyari'], 'ky' => $metrics['ky'],
    ];
    $mergedTargets = merged_activity_targets($employeeId, $year, false);
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
        if ($activity['key'] === 'cccf_worker' && $cccfWorkerSelf) {
            $target['yearlyTarget'] = (int) ($cccfWorkerSelf['target'] ?? 0);
            $actual = (int) ($cccfWorkerSelf['actualTowardTarget'] ?? 0);
            $target['rawRecords'] = (int) ($cccfWorkerSelf['rawRecords'] ?? 0);
        }
        $completion = $ratio ? $ratio['completionPct'] : ($target['yearlyTarget'] > 0 ? min(100, (int) round($actual / $target['yearlyTarget'] * 100)) : null);
        $target['actualCount'] = $actual;
        $target['completionPct'] = $completion;
        $target['passed'] = $completion !== null ? $completion >= ($target['passPct'] ?? 80) : null;
        $target['noData'] = $ratio ? $ratio['noData'] : false;
        $target['calculationScope'] = $ratio ? ($ratio['calculationScope'] ?? ['type' => 'department', 'department' => $ratio['department']]) : null;
        $target['calculationMethod'] = ($activity['key'] === 'cccf_worker' && $cccfWorkerSelf)
            ? 'cccf_worker_progress_engine_actual_toward_target'
            : ($ratio['calculationMethod'] ?? null);
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
    $score = count($evaluableActivityTargets) > 0
        ? max(0, min(100, (int) round(array_sum(array_map(static function ($row) { return (float) ($row['completionPct'] ?? 0); }, $evaluableActivityTargets)) / count($evaluableActivityTargets))))
        : null;
    $factorWeight = count($evaluableActivityTargets) > 0 ? (int) round(100 / count($evaluableActivityTargets)) : 0;
    $factors = array_map(static function ($row) use ($factorWeight) {
        return [
            'key' => $row['activityKey'] ?? '', 'label' => $row['label'] ?? '',
            'score' => max(0, min(100, (int) ($row['completionPct'] ?? 0))), 'weight' => $factorWeight,
        ];
    }, $evaluableActivityTargets);
    $reasons = [];
    $nextActions = [];
    foreach ($activityTargets as $target) {
        $label = (string) ($target['label'] ?? $target['activityKey'] ?? 'Activity');
        if (!empty($target['noData']) || ($target['completionPct'] ?? null) === null) {
            $reasons[] = $label . ': no data available for the configured target';
            $nextActions[] = 'Verify source data for ' . $label;
        } elseif (($target['passed'] ?? null) === false) {
            $reasons[] = $label . ': ' . (int) ($target['actualCount'] ?? 0) . '/' . (int) ($target['yearlyTarget'] ?? 0) . ' (' . (int) $target['completionPct'] . '%), below ' . (int) ($target['passPct'] ?? 80) . '% pass threshold';
            $nextActions[] = 'Follow up the configured ' . $label . ' target';
        }
    }
    if ($metrics['accidents'] > 0) { $reasons[] = $metrics['accidents'] . ' accident record(s) in selected year'; $nextActions[] = 'Review accident investigation and corrective action status'; }
    if ($metrics['ppeViolations'] > 0) { $reasons[] = $metrics['ppeViolations'] . ' PPE violation(s) in selected year'; $nextActions[] = 'Follow up PPE coaching or escalation records'; }
    if ($metrics['patrolIssues'] > 0) { $reasons[] = $metrics['patrolIssues'] . ' patrol issue(s) reported by this person'; $nextActions[] = 'Review patrol issue closure and responsible department action'; }
    if (count($activityTargets) === 0) $reasons[] = 'No effective activity target configured by Admin';
    if (count($reasons) === 0) $reasons[] = 'All configured targets are on track and no major risk event was detected';
    if (count($nextActions) === 0) $nextActions[] = count($activityTargets) > 0 ? 'Maintain progress against configured targets' : 'No target-based follow-up required';
    $status = $metrics['accidents'] > 0 || $metrics['ppeViolations'] > 0 || ($score !== null && $score < 60)
        ? 'Action Needed'
        : ($metrics['patrolIssues'] > 0 || ($score !== null && $score < 80)
            ? 'Watch'
            : ($score === null ? (count($activityTargets) > 0 ? 'No Data' : 'No Target') : 'Good'));
    $patrolRecords = safe_rows('SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? ORDER BY PatrolDate DESC,id DESC LIMIT 12', [$employeeId, $year]);
    $trainingRecords = safe_rows('SELECT r.id,r.TrainingDate,r.Score,r.IsPassed,c.CourseName,c.CourseCode FROM training_records r LEFT JOIN training_courses c ON c.id=r.CourseID WHERE r.EmployeeID=? AND YEAR(r.TrainingDate)=? ORDER BY r.TrainingDate DESC,r.id DESC LIMIT 8', [$employeeId, $year]);
    $hiyariRecords = safe_rows('SELECT id,ReportDate,Location,Description,Status FROM hiyarireports WHERE ReporterID=? AND YEAR(ReportDate)=? ORDER BY ReportDate DESC LIMIT 6', [$employeeId, $year]);
    $kyRecords = safe_rows('SELECT id,ActivityDate,TeamName,HazardDescription,Status FROM ky_activities WHERE ReporterID=? AND YEAR(ActivityDate)=? ORDER BY ActivityDate DESC LIMIT 6', [$employeeId, $year]);
    $accidentRecords = safe_rows('SELECT id,AccidentDate,AccidentType,Status,Location FROM accident_reports WHERE EmployeeID=? AND YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0) ORDER BY AccidentDate DESC LIMIT 6', [$employeeId, $year]);
    $fourmRecords = safe_rows('SELECT id,NoticeNo,RequestDate,Title,Status,ChangeType FROM fourm_changenotices WHERE (CreatedByID=? OR ResponsiblePerson=?) AND YEAR(RequestDate)=? ORDER BY RequestDate DESC LIMIT 6', [$employeeId, $employee['EmployeeName'], $year]);
    $yokotenRecords = safe_rows('SELECT ResponseID,ResponseDate,YokotenID,ApprovalStatus,IsRelated FROM yokotenresponses WHERE EmployeeID=? AND YEAR(ResponseDate)=? ORDER BY ResponseDate DESC LIMIT 6', [$employeeId, $year]);
    $selfPatrolRecords = safe_rows('SELECT id,CheckinDate,Location,Notes FROM patrol_self_checkin WHERE EmployeeID=? AND Year=? ORDER BY CheckinDate DESC LIMIT 8', [$employeeId, $year]);
    $cccfWorkerRecords = safe_rows('SELECT id,SubmitDate,JobArea,Equipment,SafetyUnit FROM cccf_forma_worker WHERE EmployeeID=? AND YEAR(SubmitDate)=? ORDER BY SubmitDate DESC,id DESC LIMIT 6', [$employeeId, $year]);
    $cccfPermanentRecords = safe_rows('SELECT id,SubmitDate,JobArea,Summary,StopType,`Rank` FROM cccf_forma_permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=? ORDER BY SubmitDate DESC,id DESC LIMIT 6', [$employeeId, $year]);
    $ppeInspectionRecords = safe_rows('SELECT InspectionID,InspectionDate,Area,Department,WorkTypeName,IsPass,CompliancePct FROM sc_ppeinspections WHERE InspectedEmployeeID=? AND YEAR(InspectionDate)=? AND deleted_at IS NULL ORDER BY InspectionDate DESC,CreatedAt DESC LIMIT 8', [$employeeId, $year]);
    $ppeViolationRecords = safe_rows('SELECT ViolationID,ViolationDate,WarningLevel,ViolationNo,InspectorName,Note FROM sc_ppe_violations WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND deleted_at IS NULL ORDER BY ViolationDate DESC,CreatedAt DESC LIMIT 8', [$employeeId, $year]);
    $timeline = [];
    foreach ($patrolRecords as $row) {
        $timeline[] = timeline_record('Patrol', 'patrol', $row, 'PatrolDate', 'Area', 'PatrolType', 'Notes');
    }
    foreach ($trainingRecords as $row) {
        $row['TrainingStatus'] = !empty($row['IsPassed']) ? 'Passed' : 'Not passed';
        $timeline[] = timeline_record('Training', 'training', $row, 'TrainingDate', 'CourseName', 'TrainingStatus', 'CourseCode');
    }
    foreach ($hiyariRecords as $row) {
        $row['TimelineTitle'] = $row['Location'] ?: ($row['Description'] ?: 'Near-miss');
        $timeline[] = timeline_record('Hiyari', 'hiyari', $row, 'ReportDate', 'TimelineTitle', 'Status', 'Description');
    }
    foreach ($kyRecords as $row) {
        $row['TimelineTitle'] = $row['TeamName'] ?: ($row['HazardDescription'] ?: 'KY Activity');
        $timeline[] = timeline_record('KY', 'ky', $row, 'ActivityDate', 'TimelineTitle', 'Status', 'HazardDescription');
    }
    foreach ($accidentRecords as $row) {
        $row['TimelineTitle'] = $row['AccidentType'] ?: ($row['Location'] ?: 'Accident report');
        $timeline[] = timeline_record('Accident', 'accident', $row, 'AccidentDate', 'TimelineTitle', 'Status', 'Location');
    }
    foreach ($fourmRecords as $row) {
        $row['TimelineTitle'] = trim((string) ($row['NoticeNo'] ?? '') . ' ' . (string) ($row['Title'] ?? '')) ?: '4M Notice';
        $timeline[] = timeline_record('4M Notice', 'fourm', $row, 'RequestDate', 'TimelineTitle', 'Status', 'ChangeType');
    }
    foreach ($fourmLogs as $row) {
        $row['TimelineTitle'] = $row['CurriculumTitle'] ?: ($row['CourseTitle'] ?: ($row['Action'] ?: '4M Training Matrix'));
        $row['TimelineDetail'] = $row['CourseTitle'] ?: ($row['CurriculumCode'] ?? '');
        $timeline[] = timeline_record('4M Matrix', 'fourm', $row, 'PerformedAt', 'TimelineTitle', 'Action', 'TimelineDetail');
    }
    foreach ($yokotenRecords as $row) {
        $row['TimelineTitle'] = 'Yokoten #' . (string) ($row['YokotenID'] ?? '');
        $timeline[] = timeline_record('Yokoten', 'yokoten', $row, 'ResponseDate', 'TimelineTitle', 'ApprovalStatus', 'IsRelated');
    }
    foreach ($selfPatrolRecords as $row) {
        $row['TimelineTitle'] = $row['Location'] ?: 'Self Patrol';
        $row['TimelineStatus'] = 'Recorded';
        $timeline[] = timeline_record('Self Patrol', 'patrol', $row, 'CheckinDate', 'TimelineTitle', 'TimelineStatus', 'Notes');
    }
    foreach ($cccfWorkerRecords as $row) {
        $row['TimelineTitle'] = $row['JobArea'] ?: ($row['Equipment'] ?: 'CCCF Worker Form A');
        $timeline[] = timeline_record('CCCF Worker', 'cccf', $row, 'SubmitDate', 'TimelineTitle', 'SafetyUnit', 'Equipment');
    }
    foreach ($cccfPermanentRecords as $row) {
        $row['TimelineTitle'] = $row['JobArea'] ?: ($row['Summary'] ?: 'CCCF Permanent Form A');
        $row['TimelineStatus'] = $row['Rank'] ?: ($row['StopType'] ?? '');
        $timeline[] = timeline_record('CCCF Permanent', 'cccf', $row, 'SubmitDate', 'TimelineTitle', 'TimelineStatus', 'Summary');
    }
    foreach ($ppeInspectionRecords as $row) {
        $row['TimelineTitle'] = $row['WorkTypeName'] ?: ($row['Area'] ?: 'PPE inspection');
        $row['TimelineStatus'] = !empty($row['IsPass']) ? 'Pass' : 'Issue';
        $row['TimelineDetail'] = $row['CompliancePct'] === null ? '' : (int) round((float) $row['CompliancePct']) . '% compliance';
        $timeline[] = timeline_record('PPE Inspection', 'ppe', $row, 'InspectionDate', 'TimelineTitle', 'TimelineStatus', 'TimelineDetail');
    }
    foreach ($ppeViolationRecords as $row) {
        $row['TimelineTitle'] = $row['WarningLevel'] ?: 'PPE violation';
        $row['TimelineStatus'] = !empty($row['ViolationNo']) ? 'No. ' . $row['ViolationNo'] : '';
        $row['TimelineDetail'] = $row['Note'] ?: ($row['InspectorName'] ?? '');
        $timeline[] = timeline_record('PPE Violation', 'ppe', $row, 'ViolationDate', 'TimelineTitle', 'TimelineStatus', 'TimelineDetail');
    }
    usort($timeline, static function ($a, $b) {
        return strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? ''));
    });
    $timeline = array_slice($timeline, 0, 40);
    $timelineSummary = ['total' => count($timeline), 'byModule' => [], 'bySeverity' => []];
    foreach ($timeline as $item) {
        $module = (string) ($item['module'] ?? 'unknown');
        $severity = (string) ($item['severity'] ?? 'normal');
        $timelineSummary['byModule'][$module] = ($timelineSummary['byModule'][$module] ?? 0) + 1;
        $timelineSummary['bySeverity'][$severity] = ($timelineSummary['bySeverity'][$severity] ?? 0) + 1;
    }
    $complianceSignals = [];
    foreach ($activityTargets as $target) {
        if (empty($target['noData']) && ($target['passed'] ?? null) !== false) continue;
        $noData = !empty($target['noData']) || ($target['completionPct'] ?? null) === null;
        $complianceSignals[] = [
            'key' => $target['activityKey'] ?? '', 'label' => $target['label'] ?? '',
            'status' => $noData ? 'Watch' : ((int) ($target['completionPct'] ?? 0) < 60 ? 'Action Needed' : 'Watch'),
            'value' => $noData ? 'No data' : (int) ($target['actualCount'] ?? 0) . '/' . (int) ($target['yearlyTarget'] ?? 0),
            'detail' => $noData ? 'No source data for this configured target' : (int) ($target['completionPct'] ?? 0) . '% complete · pass threshold ' . (int) ($target['passPct'] ?? 80) . '%',
        ];
    }
    if ($riskEvents > 0) {
        $complianceSignals[] = [
            'key' => 'risk', 'label' => 'Risk Events',
            'status' => $metrics['accidents'] > 0 || $metrics['ppeViolations'] > 0 ? 'Action Needed' : 'Watch',
            'value' => $riskEvents . ' events',
            'detail' => $metrics['accidents'] . ' accident, ' . $metrics['ppeViolations'] . ' PPE violation, ' . $metrics['patrolIssues'] . ' patrol issue',
        ];
    }
    $riskProfile = [
        'score' => $score, 'status' => $status, 'factors' => $factors,
        'reasons' => array_slice(array_values(array_unique($reasons)), 0, 8),
        'nextActions' => array_slice(array_values(array_unique($nextActions)), 0, 5),
        'thresholds' => ['good' => 80, 'watch' => 60],
        'counters' => ['riskEventCount' => $riskEvents, 'configuredTargets' => count($activityTargets), 'evaluableTargets' => count($evaluableActivityTargets)],
    ];
    $responseEmployee = $isAdmin ? $employee : [
        'EmployeeID' => $employee['EmployeeID'] ?? '',
        'EmployeeName' => $employee['EmployeeName'] ?? '',
        'Department' => $employee['Department'] ?? '',
        'Unit' => $employee['Unit'] ?? '',
        'Team' => $employee['Team'] ?? '',
        'Position' => $employee['Position'] ?? '',
    ];
    $responseRiskProfile = $isAdmin ? $riskProfile : [
        'score' => $riskProfile['score'], 'status' => $riskProfile['status'],
        'thresholds' => $riskProfile['thresholds'], 'factors' => [], 'reasons' => [],
        'nextActions' => [], 'counters' => [],
    ];
    json_response(['success' => true, 'data' => [
        'year' => $year, 'employee' => $responseEmployee,
        'access' => ['canViewSensitive' => $isAdmin, 'canViewRiskDetail' => $isAdmin, 'canExport' => $isAdmin, 'scope' => $isAdmin ? 'all' : 'self'],
        'metrics' => $metrics, 'complianceScore' => $score, 'overallStatus' => $status, 'riskProfile' => $responseRiskProfile,
        'activityTargets' => $activityTargets, 'activityTargetSummary' => $activityTargetSummary,
        'complianceSignals' => $complianceSignals, 'fourmScopes' => $fourmScopes, 'fourmLogs' => $fourmLogs,
        'cccfRecords' => array_merge($cccfWorkerRecords, $cccfPermanentRecords),
        'ppeInspections' => $ppeInspectionRecords, 'ppeViolations' => $ppeViolationRecords,
        'patrolRecords' => $patrolRecords, 'selfPatrolRecords' => $selfPatrolRecords,
        'trainingRecords' => $trainingRecords, 'timelineSummary' => $timelineSummary, 'timeline' => $timeline,
    ]]);
}
