<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/bootstrap.php';
require_once __DIR__ . '/../../api/mailer.php';
require_once __DIR__ . '/../../api/handlers/workflow_phase6.php';

$pdo = db();
wf_ensure_yokoten_tables();
$topic = db_row(
    'SELECT * FROM yokotentopics WHERE IsActive=1 ORDER BY DateIssued DESC LIMIT 1'
);
if (!$topic) {
    fwrite(STDERR, "No active Yokoten topic is available.\n");
    exit(1);
}

$targetDepartments = wf_yokoten_scope_list($topic['TargetDepts'] ?? null);
if (!$targetDepartments) {
    $targetDepartments = wf_yokoten_master_depts();
}
$activeResponses = db_rows(
    'SELECT Department FROM yokotenresponses
      WHERE YokotenID=? AND (IsDeleted IS NULL OR IsDeleted=0)',
    [$topic['YokotenID']]
);
$answered = array_fill_keys(array_map(
    static fn(array $row): string => trim((string)($row['Department'] ?? '')),
    $activeResponses
), true);
$departments = array_values(array_filter(
    $targetDepartments,
    static fn(string $department): bool => !isset($answered[$department])
));
if (!$departments) {
    fwrite(STDERR, "The latest Yokoten topic has no unanswered Department.\n");
    exit(1);
}

$masterUnits = wf_yokoten_master_unit_rows();
$scope = yokoten_scope_resolve_topic_units(
    wf_yokoten_scope_list($topic['TargetUnits'] ?? null),
    $masterUnits
);
if ($scope['unresolved']) {
    fwrite(STDERR, 'Unresolved topic Safety Units: ' . implode(', ', $scope['unresolved']) . "\n");
    exit(1);
}

$departmentUnits = array_fill_keys($departments, []);
foreach ($scope['units'] as $unit) {
    $department = yokoten_scope_unit_department($unit);
    if (array_key_exists($department, $departmentUnits)) {
        $departmentUnits[$department][] = yokoten_scope_unit_name($unit);
    }
}
$selectedUnits = array_values(array_unique(array_merge(...array_values($departmentUnits))));

$admin = db_row(
    "SELECT EmployeeID,EmployeeName,Department,Unit,Role
       FROM employees
      WHERE LOWER(Role)='admin'
      ORDER BY EmployeeID
      LIMIT 1"
);
if (!$admin) {
    fwrite(STDERR, "No local Admin employee is available.\n");
    exit(1);
}

$before = db_row(
    "SELECT COUNT(*) AS total,
            COALESCE(SUM(CRC32(CONCAT_WS('|',id,ResponseID,YokotenID,Department,COALESCE(IsDeleted,0)))),0) AS signature
       FROM yokotenresponses"
);
$beforeFiles = db_row(
    "SELECT COUNT(*) AS total,
            COALESCE(SUM(CRC32(CONCAT_WS('|',FileID,ResponseID,YokotenID,COALESCE(FileURL,'')))),0) AS signature
       FROM yokoten_response_files"
);

$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . jwt_sign([
    'id' => (string)$admin['EmployeeID'],
    'name' => (string)$admin['EmployeeName'],
    'department' => (string)$admin['Department'],
    'unit' => (string)($admin['Unit'] ?? ''),
    'role' => 'Admin',
]);
$_GET['route'] = 'yokoten/respond';
$_POST = [
    'yokotenId' => (string)$topic['YokotenID'],
    'isRelated' => 'No',
    'comment' => '',
    'correctiveAction' => '',
    'departments' => json_encode($departments, JSON_UNESCAPED_UNICODE),
    'departmentUnits' => json_encode($departmentUnits, JSON_UNESCAPED_UNICODE),
    'safetyUnits' => json_encode($selectedUnits, JSON_UNESCAPED_UNICODE),
    'safetyUnit' => implode(', ', $selectedUnits),
];
$_FILES = [];

$pdo->beginTransaction();
$firstDepartment = $departments[0];
$deletedCollision = db_row(
    'SELECT ResponseID FROM yokotenresponses
      WHERE YokotenID=? AND Department=? AND IsDeleted=1
      LIMIT 1',
    [$topic['YokotenID'], $firstDepartment]
);
if (!$deletedCollision) {
    $deletedResponseId = wf_uuid();
    db_execute(
        'INSERT INTO yokotenresponses
         (ResponseID,YokotenID,Department,SafetyUnit,EmployeeID,EmployeeName,IsRelated,ApprovalStatus,IsDeleted)
         VALUES (?,?,?,?,?,?,?,?,1)',
        [
            $deletedResponseId,
            $topic['YokotenID'],
            $firstDepartment,
            null,
            (string)$admin['EmployeeID'],
            'Rollback-only deleted collision',
            'No',
            null,
        ]
    );
} else {
    $deletedResponseId = (string)$deletedCollision['ResponseID'];
}
db_execute(
    'INSERT INTO yokoten_response_files
     (FileID,ResponseID,YokotenID,Department,FileName,FileURL,PublicID,FileType,FileSize,UploadedBy)
     VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
        wf_uuid(),
        $deletedResponseId,
        (string)$topic['YokotenID'],
        $firstDepartment,
        'rollback-only-stale-file.txt',
        '/uploads/rollback-only-stale-file.txt',
        'rollback-only-stale-file.txt',
        'text/plain',
        0,
        'Rollback probe',
    ]
);
register_shutdown_function(static function () use (
    $pdo,
    $before,
    $beforeFiles,
    $topic,
    $firstDepartment,
    $deletedResponseId
): void {
    $restored = db_row(
        'SELECT ResponseID,IsDeleted FROM yokotenresponses
          WHERE YokotenID=? AND Department=?
          LIMIT 1',
        [$topic['YokotenID'], $firstDepartment]
    );
    $staleFiles = (int)(safe_scalar(
        'SELECT COUNT(*) FROM yokoten_response_files
          WHERE ResponseID=? AND FileName=?',
        [$deletedResponseId, 'rollback-only-stale-file.txt']
    ) ?? 0);
    $reused = (string)($restored['ResponseID'] ?? '') === $deletedResponseId
        && (int)($restored['IsDeleted'] ?? 1) === 0;
    fwrite(STDERR, "\nRESTORED_RESPONSE_ID_REUSED=" . ($reused ? 'true' : 'false') . "\n");
    fwrite(STDERR, "STALE_RESPONSE_FILES_CLEARED=" . ($staleFiles === 0 ? 'true' : 'false') . "\n");
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $after = db_row(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(CRC32(CONCAT_WS('|',id,ResponseID,YokotenID,Department,COALESCE(IsDeleted,0)))),0) AS signature
           FROM yokotenresponses"
    );
    $afterFiles = db_row(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(CRC32(CONCAT_WS('|',FileID,ResponseID,YokotenID,COALESCE(FileURL,'')))),0) AS signature
           FROM yokoten_response_files"
    );
    $sameResponses = (string)($before['total'] ?? '') === (string)($after['total'] ?? '')
        && (string)($before['signature'] ?? '') === (string)($after['signature'] ?? '');
    $sameFiles = (string)($beforeFiles['total'] ?? '') === (string)($afterFiles['total'] ?? '')
        && (string)($beforeFiles['signature'] ?? '') === (string)($afterFiles['signature'] ?? '');
    $same = $sameResponses && $sameFiles;
    fwrite(STDERR, "\nROLLBACK_FINGERPRINT_MATCH=" . ($same ? 'true' : 'false') . "\n");
    if (!$same) {
        fwrite(STDERR, "The rollback fingerprint changed unexpectedly.\n");
    }
});

handle_yokoten_routes('POST', '/yokoten/respond');
