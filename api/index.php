<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mailer.php';
require __DIR__ . '/handlers/foundation.php';
require __DIR__ . '/handlers/platform.php';
require __DIR__ . '/handlers/storage.php';
require __DIR__ . '/handlers/targets.php';
require __DIR__ . '/handlers/people.php';
require __DIR__ . '/handlers/content.php';
require __DIR__ . '/handlers/operational.php';
require __DIR__ . '/handlers/operational_phase5.php';
require __DIR__ . '/handlers/patrol.php';
require __DIR__ . '/handlers/workflow_phase6.php';
require __DIR__ . '/handlers/fourm_phase7.php';
require __DIR__ . '/handlers/admin_phase8.php';

header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = '/' . trim((string) ($_GET['route'] ?? ''), '/');

function dashboard_parse_array($value): array
{
    if ($value === null || $value === '') {
        return [];
    }
    if (is_array($value)) {
        return array_values(array_filter(array_map('strval', $value), static function ($item) {
            return trim($item) !== '';
        }));
    }
    $decoded = json_decode((string) $value, true);
    if (is_array($decoded)) {
        return array_values(array_filter(array_map('strval', $decoded), static function ($item) {
            return trim($item) !== '';
        }));
    }
    return array_values(array_filter(array_map('trim', explode(',', (string) $value)), static function ($item) {
        return $item !== '';
    }));
}

function dashboard_by_department(array $rows, callable $valueFn): array
{
    $out = [];
    foreach ($rows as $row) {
        $dept = trim((string) ($row['Department'] ?? ''));
        if ($dept === '') {
            continue;
        }
        $out[$dept] = $valueFn($row);
    }
    return $out;
}

function dashboard_compliance_matrix(int $year, array $config): array
{
    $deptRows = safe_rows('SELECT Name FROM master_departments ORDER BY Name ASC');
    $allDeptNames = array_values(array_filter(array_map(static function ($row) {
        return trim((string) ($row['Name'] ?? ''));
    }, $deptRows)));
    $pinned = dashboard_parse_array($config['pinnedDepartments'] ?? []);
    $deptNames = [];
    if ($pinned) {
        foreach ($pinned as $dept) {
            if (in_array($dept, $allDeptNames, true)) {
                $deptNames[] = $dept;
            }
        }
    } else {
        $deptNames = array_slice($allDeptNames, 0, 12);
    }
    if (!$deptNames) {
        return [];
    }

    $employeeRows = safe_rows("SELECT Department, COUNT(DISTINCT EmployeeID) AS total FROM employees WHERE Department IS NOT NULL AND Department <> '' GROUP BY Department");
    $trainingRows = safe_rows('SELECT Department, SUM(PassedCount) AS passed, SUM(TotalEmp) AS total FROM training_dept_records WHERE Year=? GROUP BY Department', [$year]);
    $kyConfigRows = safe_rows('SELECT Department, SafetyUnits, YearlyTarget FROM ky_program_config WHERE Year=? AND IsActive=1', [$year]);
    $kyRows = safe_rows('SELECT Department, COUNT(*) AS cnt FROM ky_activities WHERE YEAR(ActivityDate)=? GROUP BY Department', [$year]);
    $hiyariRows = safe_rows("SELECT Department, COUNT(*) AS total, COALESCE(SUM(Status IN ('Closed','closed')),0) AS closed FROM hiyarireports WHERE YEAR(ReportDate)=? GROUP BY Department", [$year]);
    $fourmRows = safe_rows("SELECT Department, COUNT(*) AS total, COALESCE(SUM(Status='Closed'),0) AS closed FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department", [$year]);
    $yokotenTopicRows = safe_rows('SELECT YokotenID, TargetDepts FROM yokotentopics WHERE IsActive=1');
    $yokotenResponseRows = safe_rows('SELECT YokotenID, Department, COUNT(*) AS cnt FROM yokotenresponses WHERE YEAR(ResponseDate)=? AND (IsDeleted IS NULL OR IsDeleted=0) GROUP BY YokotenID, Department', [$year]);
    $patrolIssueRows = safe_rows("SELECT ResponsibleDept AS Department, COUNT(*) AS total, COALESCE(SUM(CurrentStatus='Closed'),0) AS closed FROM patrol_issues WHERE YEAR(DateFound)=? GROUP BY ResponsibleDept", [$year]);
    $cccfWorkerRows = safe_rows("SELECT Department, COUNT(DISTINCT NULLIF(EmployeeID,'')) AS submitted FROM cccf_forma_worker WHERE YEAR(SubmitDate)=? GROUP BY Department", [$year]);
    $cccfAssignmentRows = safe_rows('SELECT COALESCE(e.Department,a.Department) AS Department, COUNT(DISTINCT COALESCE(NULLIF(a.EmployeeID,\'\'),a.id)) AS assigned FROM cccf_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID GROUP BY COALESCE(e.Department,a.Department)');
    $cccfPermanentRows = safe_rows("SELECT Department, COUNT(DISTINCT COALESCE(NULLIF(AssigneeID,''),id)) AS completed FROM cccf_forma_permanent WHERE YEAR(SubmitDate)=? GROUP BY Department", [$year]);
    $accidentRows = safe_rows("SELECT Department, COUNT(*) AS total, COALESCE(SUM(Status IN ('Closed','closed')),0) AS closed FROM accident_reports WHERE YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0) GROUP BY Department", [$year]);
    $machineRows = safe_rows("
        SELECT m.Department, COUNT(DISTINCT m.id) AS machines,
               COALESCE(SUM(c.passItems),0) AS passItems, COALESCE(SUM(c.checkedItems),0) AS checkedItems,
               COALESCE(SUM(i.issueTotal),0) AS issueTotal, COALESCE(SUM(i.issueClosed),0) AS issueClosed
        FROM machine_safety m
        LEFT JOIN (
            SELECT MachineID, SUM(Status='pass') AS passItems, SUM(Status<>'na') AS checkedItems
            FROM machine_safety_compliance GROUP BY MachineID
        ) c ON c.MachineID=m.id
        LEFT JOIN (
            SELECT MachineID, COUNT(*) AS issueTotal, SUM(Status='resolved') AS issueClosed
            FROM machine_safety_issues GROUP BY MachineID
        ) i ON i.MachineID=m.id
        WHERE m.Status IS NULL OR m.Status <> 'inactive'
        GROUP BY m.Department
    ");
    $ojtRows = safe_rows('SELECT Department, OJTDate, NextReviewDate, AttendeeCount, YearlyTarget FROM ojt_records');
    $safetyCultureRows = safe_rows('SELECT Department, AVG(CompliancePct) AS pct FROM sc_ppeinspections WHERE YEAR(InspectionDate)=? AND deleted_at IS NULL GROUP BY Department', [$year]);
    $targetMatrix = activity_target_coverage_matrix_data();
    $targetByDept = [];
    foreach ($targetMatrix['rows'] as $row) {
        $dept = trim((string) ($row['department'] ?? ''));
        if ($dept === '') continue;
        if (!isset($targetByDept[$dept])) $targetByDept[$dept] = ['slots'=>0,'covered'=>0,'missing'=>0,'zero'=>0,'na'=>0,'scope'=>0,'override'=>0,'template'=>0];
        $targetByDept[$dept]['slots']++;
        if (!empty($row['isNA'])) $targetByDept[$dept]['na']++;
        elseif (($row['source'] ?? '') === 'missing') $targetByDept[$dept]['missing']++;
        elseif (!empty($row['isZero'])) $targetByDept[$dept]['zero']++;
        else $targetByDept[$dept]['covered']++;
        if (isset($targetByDept[$dept][$row['source'] ?? ''])) $targetByDept[$dept][$row['source']]++;
    }

    $employeeCount = dashboard_by_department($employeeRows, static function ($r) { return (int) ($r['total'] ?? 0); });
    $training = dashboard_by_department($trainingRows, static function ($r) { return percent($r['passed'] ?? 0, $r['total'] ?? 0); });
    $kyActual = dashboard_by_department($kyRows, static function ($r) { return (int) ($r['cnt'] ?? 0); });
    $hiyari = dashboard_by_department($hiyariRows, static function ($r) { return ((int) ($r['total'] ?? 0)) > 0 ? percent($r['closed'] ?? 0, $r['total'] ?? 0) : 100; });
    $fourm = dashboard_by_department($fourmRows, static function ($r) { return percent($r['closed'] ?? 0, $r['total'] ?? 0); });
    $patrolIssues = dashboard_by_department($patrolIssueRows, static function ($r) { return ((int) ($r['total'] ?? 0)) > 0 ? percent($r['closed'] ?? 0, $r['total'] ?? 0) : 100; });
    $cccfWorker = dashboard_by_department($cccfWorkerRows, static function ($r) { return (int) ($r['submitted'] ?? 0); });
    $cccfAssigned = dashboard_by_department($cccfAssignmentRows, static function ($r) { return (int) ($r['assigned'] ?? 0); });
    $cccfPermanent = dashboard_by_department($cccfPermanentRows, static function ($r) { return (int) ($r['completed'] ?? 0); });
    $accident = dashboard_by_department($accidentRows, static function ($r) { return ((int) ($r['total'] ?? 0)) > 0 ? percent($r['closed'] ?? 0, $r['total'] ?? 0) : 100; });
    $machine = dashboard_by_department($machineRows, static function ($r) {
        $machines = (int) ($r['machines'] ?? 0);
        if ($machines <= 0) {
            return null;
        }
        $checked = (int) ($r['checkedItems'] ?? 0);
        $compliancePct = $checked > 0 ? percent($r['passItems'] ?? 0, $checked) : 0;
        $issueTotal = (int) ($r['issueTotal'] ?? 0);
        $issuePct = $issueTotal > 0 ? percent($r['issueClosed'] ?? 0, $issueTotal) : 100;
        return (int) round(((int) $compliancePct + (int) $issuePct) / 2);
    });
    $ojt = dashboard_by_department($ojtRows, static function ($r) {
        if (empty($r['OJTDate'])) {
            return 0;
        }
        $target = (int) ($r['YearlyTarget'] ?? 0);
        $coverage = $target > 0 ? percent($r['AttendeeCount'] ?? 0, $target) : 100;
        $next = (string) ($r['NextReviewDate'] ?? '');
        $overdue = $next !== '' && strtotime($next) !== false && strtotime($next) < strtotime(date('Y-m-d'));
        return $overdue ? min((int) $coverage, 50) : $coverage;
    });
    $safetyCulture = dashboard_by_department($safetyCultureRows, static function ($r) {
        return is_numeric($r['pct'] ?? null) ? max(0, min(100, (int) round((float) $r['pct']))) : null;
    });

    $kyTargets = [];
    foreach ($kyConfigRows as $row) {
        $dept = trim((string) ($row['Department'] ?? ''));
        if ($dept === '') {
            continue;
        }
        $unitCount = max(1, count(dashboard_parse_array($row['SafetyUnits'] ?? '')));
        $kyTargets[$dept] = $unitCount * ((int) ($row['YearlyTarget'] ?? 12) ?: 12);
    }

    $yokotenTargets = [];
    foreach ($yokotenTopicRows as $topic) {
        $targets = dashboard_parse_array($topic['TargetDepts'] ?? '');
        $scoped = $targets ? array_values(array_intersect($targets, $deptNames)) : $deptNames;
        foreach ($scoped as $dept) {
            $yokotenTargets[$dept] = ($yokotenTargets[$dept] ?? 0) + 1;
        }
    }
    $yokotenDone = [];
    foreach ($yokotenResponseRows as $row) {
        $dept = trim((string) ($row['Department'] ?? ''));
        if ($dept !== '') {
            $yokotenDone[$dept] = ($yokotenDone[$dept] ?? 0) + (int) ($row['cnt'] ?? 0);
        }
    }

    $matrix = [];
    foreach ($deptNames as $dept) {
        $empTotal = $employeeCount[$dept] ?? 0;
        $kyTarget = $kyTargets[$dept] ?? 12;
        $yokotenTarget = $yokotenTargets[$dept] ?? 0;
        $cccfAssignedTotal = $cccfAssigned[$dept] ?? 0;
        $targetMeta = $targetByDept[$dept] ?? ['slots'=>0,'covered'=>0,'missing'=>0,'zero'=>0,'na'=>0,'scope'=>0,'override'=>0,'template'=>0];
        $cells = [
            'activityTargets' => $targetMeta['slots'] > 0 ? percent($targetMeta['covered'] + $targetMeta['na'], $targetMeta['slots']) : null,
            'cccfWorker' => $empTotal > 0 ? percent($cccfWorker[$dept] ?? 0, $empTotal) : null,
            'cccfPermanent' => $cccfAssignedTotal > 0 ? percent($cccfPermanent[$dept] ?? 0, $cccfAssignedTotal) : null,
            'patrolIssues' => $patrolIssues[$dept] ?? 100,
            'hiyari' => $hiyari[$dept] ?? 100,
            'ky' => percent($kyActual[$dept] ?? 0, $kyTarget),
            'yokoten' => $yokotenTarget > 0 ? percent($yokotenDone[$dept] ?? 0, $yokotenTarget) : null,
            'training' => $training[$dept] ?? null,
            'fourm' => $fourm[$dept] ?? null,
            'accident' => $accident[$dept] ?? 100,
            'machine' => $machine[$dept] ?? null,
            'ojt' => $ojt[$dept] ?? 0,
            'safetyCulture' => $safetyCulture[$dept] ?? null,
        ];
        $values = array_values(array_filter($cells, static function ($v) {
            return $v !== null;
        }));
        $score = $values ? (int) round(array_sum($values) / count($values)) : 0;
        $matrix[] = array_merge(['department' => $dept, 'score' => $score, 'targetMeta' => $targetMeta], $cells);
    }
    usort($matrix, static function ($a, $b) {
        if ((int) $a['score'] === (int) $b['score']) {
            return strcmp((string) $a['department'], (string) $b['department']);
        }
        return (int) $a['score'] <=> (int) $b['score'];
    });
    return $matrix;
}

try {
    handle_foundation_routes($method, $path);
    handle_platform_routes($method, $path);
    handle_storage_routes($method, $path);
    handle_target_routes($method, $path);
    handle_people_routes($method, $path);
    handle_content_routes($method, $path);
    handle_training_routes($method, $path);
    handle_ojt_routes($method, $path);
    handle_patrol_routes($method, $path);
    handle_accident_routes($method, $path);
    handle_machine_safety_routes($method, $path);
    handle_contractor_routes($method, $path);
    handle_safety_culture_routes($method, $path);
    handle_cccf_routes($method, $path);
    handle_hiyari_routes($method, $path);
    handle_ky_routes($method, $path);
    handle_yokoten_routes($method, $path);
    handle_fourm_routes($method, $path);
    handle_admin_phase8_routes($method, $path);

    if ($method === 'GET' && $path === '/public/branding') {
        $stmt = db()->prepare('SELECT value FROM app_settings WHERE key_name = ? LIMIT 1');
        $stmt->execute(['app_branding']);
        $branding = json_decode((string) ($stmt->fetchColumn() ?: '{}'), true);
        $branding = is_array($branding) ? $branding : [];
        json_response(['success' => true, 'data' => [
            'appName' => mb_substr((string) ($branding['appName'] ?? ''), 0, 80),
            'tagline' => mb_substr((string) ($branding['tagline'] ?? ''), 0, 80),
            'loginHeroTitle' => mb_substr((string) ($branding['loginHeroTitle'] ?? ''), 0, 140),
            'loginHeroSubtitle' => mb_substr((string) ($branding['loginHeroSubtitle'] ?? ''), 0, 180),
            'logoUrl' => mb_substr((string) ($branding['logoUrl'] ?? ''), 0, 1024),
        ]]);
    }

    if ($method === 'POST' && $path === '/login') {
        $body = json_body();
        $employeeId = trim((string) ($body['employeeId'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($employeeId === '' || $password === '') {
            json_response(['success' => false, 'message' => 'กรุณากรอกรหัสพนักงานและรหัสผ่าน'], 400);
        }
        $stmt = db()->prepare('SELECT * FROM employees WHERE EmployeeID = ? LIMIT 1');
        $stmt->execute([$employeeId]);
        $employee = $stmt->fetch();
        $valid = false;
        if ($employee) {
            if (!empty($employee['Password'])) {
                $valid = password_verify($password, (string) $employee['Password']);
            } else {
                $valid = hash_equals((string) $employee['EmployeeID'], $password);
                if ($valid) {
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $update = db()->prepare('UPDATE employees SET Password = ? WHERE EmployeeID = ?');
                    $update->execute([$hash, $employeeId]);
                }
            }
        }
        if (!$employee || !$valid) {
            json_response(['success' => false, 'message' => 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'], 401);
        }
        $user = user_data($employee);
        json_response(['success' => true, 'user' => $user, 'token' => jwt_sign($user)]);
    }

    if ($method === 'POST' && $path === '/session/verify') {
        $decoded = require_user();
        unset($decoded['iat'], $decoded['exp']);
        json_response(['success' => true, 'user' => $decoded, 'token' => jwt_sign($decoded)]);
    }

    if ($method === 'GET' && $path === '/register/options') {
        $departments = safe_rows('SELECT id, Name FROM master_departments ORDER BY Name');
        $positions = safe_rows('SELECT id, Name FROM master_positions ORDER BY Name');
        $units = safe_rows('SELECT id, name, department_id FROM master_safetyunits ORDER BY sort_order, name');
        json_response(['success' => true, 'data' => compact('departments', 'positions', 'units')]);
    }

    if ($method === 'GET' && $path === '/profile') {
        $user = require_user();
        $stmt = db()->prepare(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role FROM employees WHERE EmployeeID = ? LIMIT 1'
        );
        $stmt->execute([(string) ($user['id'] ?? '')]);
        $profile = $stmt->fetch();
        if (!$profile) {
            json_response(['success' => false, 'message' => 'ไม่พบข้อมูลผู้ใช้'], 404);
        }
        json_response(['success' => true, 'data' => $profile]);
    }

    if ($method === 'GET' && $path === '/master/departments') {
        require_user();
        json_response(['success' => true, 'data' => safe_rows('SELECT * FROM master_departments ORDER BY Name ASC')]);
    }

    if ($method === 'GET' && $path === '/dashboard/overview') {
        require_user();
        $year = (int) date('Y');
        $patrolSessions = safe_scalar('SELECT COUNT(DISTINCT DATE(PatrolDate)) FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$year]);
        $patrolAttended = safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$year]);
        $patrolOpenIssues = safe_scalar("SELECT COUNT(*) FROM patrol_issues WHERE CurrentStatus NOT IN ('Closed')");
        $cccfWorker = safe_scalar('SELECT COUNT(*) FROM cccf_forma_worker WHERE YEAR(SubmitDate)=?', [$year]);
        $cccfAssigned = safe_scalar('SELECT COUNT(*) FROM cccf_assignments');
        $cccfCompleted = safe_scalar('SELECT COUNT(DISTINCT AssigneeID) FROM cccf_forma_permanent WHERE YEAR(SubmitDate)=?', [$year]);
        $yokotenTopics = safe_scalar('SELECT COUNT(*) FROM yokotentopics WHERE IsActive=1');
        $yokotenResponded = safe_scalar('SELECT COUNT(DISTINCT Department) FROM yokotenresponses WHERE YEAR(ResponseDate)=?', [$year]);
        $trainingTotal = safe_scalar('SELECT COALESCE(SUM(TotalEmp),0) FROM training_dept_records WHERE Year=?', [$year]);
        $trainingPassed = safe_scalar('SELECT COALESCE(SUM(PassedCount),0) FROM training_dept_records WHERE Year=?', [$year]);
        $hiyariOpen = safe_scalar("SELECT COUNT(*) FROM hiyarireports WHERE Status NOT IN ('Closed','closed')");
        $hiyariYear = safe_scalar('SELECT COUNT(*) FROM hiyarireports WHERE YEAR(ReportDate)=?', [$year]);
        $kyYear = safe_scalar('SELECT COUNT(*) FROM ky_activities WHERE YEAR(ActivityDate)=?', [$year]);
        $accidentYear = safe_scalar('SELECT COUNT(*) FROM accident_reports WHERE YEAR(AccidentDate)=?', [$year]);
        $recordable = safe_scalar('SELECT COUNT(*) FROM accident_reports WHERE YEAR(AccidentDate)=? AND IsRecordable=1', [$year]);
        $fourmTotal = safe_scalar('SELECT COUNT(*) FROM fourm_changenotices WHERE YEAR(RequestDate)=?', [$year]);
        $fourmOpen = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Open' AND YEAR(RequestDate)=?", [$year]);
        $fourmPending = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Pending' AND YEAR(RequestDate)=?", [$year]);
        $fourmClosed = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Closed' AND YEAR(RequestDate)=?", [$year]);
        $active = (int) ($fourmOpen ?? 0) + (int) ($fourmPending ?? 0);
        $config = dashboard_config();
        $positive = array_values(array_filter([
            percent($patrolAttended, $patrolSessions),
            percent($cccfCompleted, $cccfAssigned),
            percent($yokotenResponded, $yokotenTopics),
            percent($trainingPassed, $trainingTotal),
        ], static function ($value) {
            return $value !== null;
        }));
        $base = $positive ? (int) round(array_sum($positive) / count($positive)) : 70;
        $penalty = min((int) ($recordable ?? 0) * 15, 30)
            + min((int) ($hiyariOpen ?? 0) * 2, 18)
            + min($active * 2, 15)
            + min((int) ($patrolOpenIssues ?? 0), 15);
        $score = max(0, min(100, $base - $penalty));
        $status = $score >= $config['healthGreen'] ? 'Good' : ($score >= $config['healthAmber'] ? 'Watch' : 'Critical');
        json_response(['success' => true, 'data' => [
            'year' => $year, 'config' => $config,
            'healthIndex' => ['score' => $score, 'status' => $status, 'base' => $base, 'penalty' => $penalty, 'thresholds' => ['green' => $config['healthGreen'], 'amber' => $config['healthAmber']]],
            'complianceMatrix' => dashboard_compliance_matrix($year, $config),
            'patrol' => ['sessions' => $patrolSessions, 'attended' => $patrolAttended, 'openIssues' => $patrolOpenIssues, 'rate' => percent($patrolAttended, $patrolSessions)],
            'cccf' => ['workerYear' => $cccfWorker, 'assigned' => $cccfAssigned, 'completed' => $cccfCompleted, 'permPct' => percent($cccfCompleted, $cccfAssigned)],
            'yokoten' => ['topics' => $yokotenTopics, 'responded' => $yokotenResponded, 'pct' => percent($yokotenResponded, $yokotenTopics)],
            'training' => ['totalEmp' => $trainingTotal, 'passed' => $trainingPassed, 'passRate' => percent($trainingPassed, $trainingTotal)],
            'hiyari' => ['open' => $hiyariOpen, 'year' => $hiyariYear], 'ky' => ['year' => $kyYear],
            'accident' => ['year' => $accidentYear, 'recordable' => $recordable],
            'fourm' => ['total' => $fourmTotal, 'open' => $fourmOpen, 'pending' => $fourmPending, 'closed' => $fourmClosed, 'active' => $active, 'overdue' => 0, 'trainingRequired' => 0, 'closureRate' => percent($fourmClosed, $fourmTotal), 'matrix' => ['curriculums' => 0, 'courses' => 0, 'employees' => 0, 'transferred' => 0]],
            'safetyCulture' => ['year' => safe_scalar('SELECT COUNT(*) FROM sc_assessments WHERE AssessmentYear=?', [$year])],
            'kpi' => ['metrics' => safe_scalar('SELECT COUNT(*) FROM kpidata WHERE Year=?', [$year]), 'announcements' => safe_scalar('SELECT COUNT(*) FROM kpiannouncements')],
            'policy' => ['total' => safe_scalar('SELECT COUNT(*) FROM policies'), 'acknowledged' => safe_scalar('SELECT COUNT(*) FROM policy_acknowledgements')],
            'committee' => ['total' => safe_scalar('SELECT COUNT(*) FROM committees')],
            'machineSafety' => ['total' => safe_scalar("SELECT COUNT(*) FROM machine_safety WHERE Status IS NULL OR Status <> 'inactive'"), 'openIssues' => safe_scalar("SELECT COUNT(*) FROM machine_safety_issues WHERE Status='open'"), 'critical' => safe_scalar("SELECT COUNT(*) FROM machine_safety WHERE RiskLevel IN ('high','critical')")],
            'ojt' => ['records' => safe_scalar('SELECT COUNT(*) FROM ojt_records'), 'docs' => safe_scalar('SELECT COUNT(*) FROM scw_documents')],
            'contractor' => ['docs' => safe_scalar('SELECT COUNT(*) FROM contractor_documents'), 'recent' => safe_scalar('SELECT COUNT(*) FROM contractor_documents WHERE UploadedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)')],
        ]]);
    }

    if ($method === 'GET' && $path === '/dashboard/alerts') {
        require_user();
        $dashboardConfig = dashboard_config();
        $dueSoonDays = (int) ($dashboardConfig['alertDueSoonDays'] ?? 7);
        json_response(['success' => true, 'data' => [
            'overdueAccident' => safe_rows(
                "SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM accident_reports
                 WHERE DueDate IS NOT NULL AND DueDate < CURDATE()
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10"
            ),
            'dueSoonAccident' => safe_rows(
                "SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM accident_reports
                 WHERE DueDate IS NOT NULL AND DueDate >= CURDATE()
                   AND DueDate <= DATE_ADD(CURDATE(), INTERVAL " . $dueSoonDays . " DAY)
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10"
            ),
            'machineOverdue' => safe_rows(
                "SELECT MachineID, MachineName, Department, NextInspectionDate
                 FROM machine_safety
                 WHERE NextInspectionDate IS NOT NULL AND NextInspectionDate < CURDATE()
                   AND (Status IS NULL OR Status NOT IN ('inactive'))
                 ORDER BY NextInspectionDate ASC LIMIT 10"
            ),
            'yokotenOverdue' => safe_rows(
                "SELECT t.YokotenID, t.Title, t.Deadline, COUNT(r.ResponseID) AS respondedCount
                 FROM yokotentopics t
                 LEFT JOIN yokotenresponses r ON r.YokotenID = t.YokotenID
                   AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)
                 WHERE t.Deadline IS NOT NULL AND t.Deadline < CURDATE() AND t.IsActive = 1
                 GROUP BY t.YokotenID, t.Title, t.Deadline
                 ORDER BY t.Deadline ASC LIMIT 10"
            ),
            'openPatrolIssues' => safe_rows(
                "SELECT id, DateFound, Area, HazardType, ResponsibleDept, `Rank`
                 FROM patrol_issues WHERE CurrentStatus NOT IN ('Closed')
                 ORDER BY DateFound ASC LIMIT 10"
            ),
            'fourmOverdue' => safe_rows(
                "SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM fourm_changenotices
                 WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30
                 ORDER BY RequestDate ASC LIMIT 10"
            ),
            'fourmTrainingRequired' => safe_rows(
                "SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM fourm_changenotices
                 WHERE TrainingRequired = 1 AND Status IN ('Open','Pending')
                 ORDER BY RequestDate ASC LIMIT 10"
            ),
            'dueSoonDays' => $dueSoonDays,
        ]]);
    }

    json_response(['success' => false, 'message' => 'PHP compatibility endpoint is not implemented yet', 'path' => $path], 501);
} catch (Throwable $error) {
    error_log('[php-api] ' . $method . ' ' . $path . ': ' . $error->getMessage());
    if ($method === 'GET' && $path === '/public/branding') {
        json_response(['success' => true, 'data' => []]);
    }
    json_response(['success' => false, 'message' => 'เกิดข้อผิดพลาดในการเชื่อมต่อ API'], 500);
}
