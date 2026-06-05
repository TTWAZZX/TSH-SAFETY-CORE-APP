<?php
declare(strict_types=1);

function admin8_try(string $sql): void
{
    try {
        db()->exec($sql);
    } catch (Throwable $error) {
    }
}

function admin8_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;

    db()->exec("CREATE TABLE IF NOT EXISTS app_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS admin_auditlogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ActionTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        AdminID VARCHAR(50) NOT NULL,
        AdminName VARCHAR(100),
        Role VARCHAR(50),
        Department VARCHAR(100),
        Module VARCHAR(80),
        Action VARCHAR(80) NOT NULL,
        Method VARCHAR(10),
        Path VARCHAR(255),
        StatusCode INT,
        TargetType VARCHAR(80),
        TargetID VARCHAR(100),
        Detail TEXT,
        Metadata TEXT,
        IPAddress VARCHAR(80),
        UserAgent VARCHAR(255),
        KEY idx_action(Action),
        KEY idx_admin(AdminID),
        KEY idx_module(Module),
        KEY idx_actiontime(ActionTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        'ALTER TABLE employees ADD COLUMN CompanyEmail VARCHAR(150) DEFAULT NULL AFTER Position',
        'ALTER TABLE admin_auditlogs ADD COLUMN Role VARCHAR(50) AFTER AdminName',
        'ALTER TABLE admin_auditlogs ADD COLUMN Department VARCHAR(100) AFTER Role',
        'ALTER TABLE admin_auditlogs ADD COLUMN Module VARCHAR(80) AFTER Department',
        'ALTER TABLE admin_auditlogs ADD COLUMN Method VARCHAR(10) AFTER Action',
        'ALTER TABLE admin_auditlogs ADD COLUMN Path VARCHAR(255) AFTER Method',
        'ALTER TABLE admin_auditlogs ADD COLUMN StatusCode INT AFTER Path',
        'ALTER TABLE admin_auditlogs ADD COLUMN Metadata TEXT AFTER Detail',
        'ALTER TABLE admin_auditlogs ADD COLUMN IPAddress VARCHAR(80) AFTER Metadata',
        'ALTER TABLE admin_auditlogs ADD COLUMN UserAgent VARCHAR(255) AFTER IPAddress',
        'ALTER TABLE admin_auditlogs ADD INDEX idx_module(Module)',
    ] as $sql) admin8_try($sql);

    db()->exec("CREATE TABLE IF NOT EXISTS admin_rolepermissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        permission VARCHAR(80) NOT NULL,
        granted TINYINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_role_perm(role,permission)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS admin_userpermissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        permission VARCHAR(80) NOT NULL,
        granted TINYINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_perm(employee_id,permission)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach (admin8_permission_defaults() as $row) {
        db_execute('INSERT IGNORE INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?)', $row);
    }
    $ready = true;
}

function admin8_permission_defaults(): array
{
    return [
        ['ADMIN','VIEW_DASHBOARD',1], ['ADMIN','MANAGE_USERS',1], ['ADMIN','VIEW_REPORT',1], ['ADMIN','APPROVE_SAFETY',1], ['ADMIN','SUBMIT_SAFETY',1],
        ['EXECUTIVE','VIEW_DASHBOARD',1], ['EXECUTIVE','VIEW_REPORT',1], ['EXECUTIVE','APPROVE_SAFETY',1], ['EXECUTIVE','MANAGE_USERS',0], ['EXECUTIVE','SUBMIT_SAFETY',0],
        ['MANAGER','VIEW_DASHBOARD',1], ['MANAGER','VIEW_REPORT',1], ['MANAGER','SUBMIT_SAFETY',1], ['MANAGER','APPROVE_SAFETY',0], ['MANAGER','MANAGE_USERS',0],
        ['STAFF','VIEW_DASHBOARD',1], ['STAFF','SUBMIT_SAFETY',1], ['STAFF','VIEW_REPORT',0], ['STAFF','APPROVE_SAFETY',0], ['STAFF','MANAGE_USERS',0],
        ['SAFETY_OFFICER','VIEW_DASHBOARD',1], ['SAFETY_OFFICER','VIEW_REPORT',1], ['SAFETY_OFFICER','APPROVE_SAFETY',1], ['SAFETY_OFFICER','SUBMIT_SAFETY',1], ['SAFETY_OFFICER','MANAGE_USERS',0],
    ];
}

function admin8_log(array $user, string $action, string $targetType, string $targetId, string $detail): void
{
    try {
        db_execute(
            'INSERT INTO admin_auditlogs(AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                (string) ($user['id'] ?? 'system'), (string) ($user['name'] ?? 'System'),
                (string) ($user['role'] ?? ''), (string) ($user['department'] ?? ''), 'admin',
                $action, (string) ($_SERVER['REQUEST_METHOD'] ?? ''), (string) ($_SERVER['REQUEST_URI'] ?? ''),
                200, $targetType, $targetId, $detail, '{}',
                (string) ($_SERVER['REMOTE_ADDR'] ?? ''), mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $error) {
    }
}

function admin8_parse_rule($raw): array
{
    $value = json_decode((string) $raw, true);
    $ids = is_array($value) && isset($value['positionIds']) ? $value['positionIds'] : $value;
    $out = [];
    foreach (is_array($ids) ? $ids : [] as $id) {
        $id = (int) $id;
        if ($id > 0) $out[$id] = $id;
    }
    return array_values($out);
}

function admin8_default_email_position_names(): array
{
    return [
        'ประธานกิตติมศักดิ์',
        'ผู้จัดการ',
        'ผู้จัดการทั่วไป',
        'ผู้ชำนาญการพิเศษ',
        'ผู้ช่วยผู้จัดการทั่วไป',
        'ผู้อำนวยการสายธุรกิจ Wiring Harness',
        'รักษาการผู้จัดการ',
        'หัวหน้าส่วน',
        'หัวหน้าแผนก',
    ];
}

function admin8_email_rule(): array
{
    $positions = db_rows('SELECT id,Name FROM master_positions ORDER BY Name');
    $setting = db_row("SELECT value FROM app_settings WHERE key_name='employee_email_required_positions' LIMIT 1");
    $available = [];
    foreach ($positions as $position) $available[(int) $position['id']] = true;
    $ids = [];
    foreach (admin8_parse_rule($setting['value'] ?? '') as $id) if (isset($available[$id])) $ids[] = $id;
    if (!$setting) {
        $defaults = array_flip(admin8_default_email_position_names());
        foreach ($positions as $position) if (isset($defaults[(string) $position['Name']])) $ids[] = (int) $position['id'];
    }
    return ['positions' => $positions, 'requiredPositionIds' => $ids, 'isUsingDefault' => !$setting];
}

function admin8_email_readiness(): array
{
    $rule = admin8_email_rule();
    $requiredNames = [];
    foreach ($rule['positions'] as $position) {
        if (in_array((int) $position['id'], $rule['requiredPositionIds'], true)) $requiredNames[(string) $position['Name']] = true;
    }
    $rows = db_rows('SELECT EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail FROM employees ORDER BY Department,Position,EmployeeName');
    $summary = ['totalEmployees' => count($rows), 'requiredEmployees' => 0, 'readyRequired' => 0, 'missingRequired' => 0, 'invalidDomain' => 0];
    foreach ($rows as &$row) {
        $email = strtolower(trim((string) ($row['CompanyEmail'] ?? '')));
        $required = isset($requiredNames[trim((string) ($row['Position'] ?? ''))]);
        $status = 'optional';
        if ($email !== '' && !preg_match('/^[^\s@]+@thaisummit-harness\.co\.th$/i', $email)) $status = 'invalid_domain';
        elseif ($required && $email === '') $status = 'missing_required';
        elseif ($email !== '') $status = 'ready';
        $row['CompanyEmail'] = $email !== '' ? $email : null;
        $row['IsEmailRequired'] = $required;
        $row['EmailReadinessStatus'] = $status;
        if ($required) $summary['requiredEmployees']++;
        if ($required && $status === 'ready') $summary['readyRequired']++;
        if ($status === 'missing_required') $summary['missingRequired']++;
        if ($status === 'invalid_domain') $summary['invalidDomain']++;
    }
    unset($row);
    $requiredPositions = [];
    foreach ($rule['positions'] as $position) if (in_array((int) $position['id'], $rule['requiredPositionIds'], true)) $requiredPositions[] = $position;
    return ['summary' => $summary, 'rule' => ['requiredPositionIds' => $rule['requiredPositionIds'], 'requiredPositions' => $requiredPositions, 'isUsingDefault' => $rule['isUsingDefault']], 'rows' => $rows];
}

function admin8_number($value): int
{
    return is_numeric($value) ? (int) $value : 0;
}

function admin8_dashboard(): array
{
    $targetCoverage = activity_target_coverage_matrix_data();
    $targetMissing = (int) ($targetCoverage['summary']['missing'] ?? 0);
    $overdueIssues = safe_rows("SELECT IssueID AS id,Area,HazardDescription AS IssueDetail,DateFound AS CreatedAt FROM patrol_issues WHERE (CurrentStatus IS NULL OR CurrentStatus NOT IN ('Closed','Completed')) AND DATEDIFF(CURDATE(),DateFound)>14 ORDER BY DateFound LIMIT 5");
    $staleNotices = safe_rows("SELECT id,NoticeNo,Department,RequestDate AS ChangeDate FROM fourm_changenotices WHERE Status='Open' AND DATEDIFF(CURDATE(),RequestDate)>30 ORDER BY RequestDate LIMIT 5");
    $staleHiyari = safe_rows("SELECT id,Department,ReportDate FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed' AND DATEDIFF(CURDATE(),ReportDate)>14 ORDER BY ReportDate LIMIT 5");
    $actionRequired = [
        ['key'=>'patrol_issues','label'=>'Patrol issues overdue','count'=>count($overdueIssues),'severity'=>count($overdueIssues)?'high':'ok','tab'=>'health','items'=>$overdueIssues],
        ['key'=>'change_notices','label'=>'4M Change Notice older than 30 days','count'=>count($staleNotices),'severity'=>count($staleNotices)?'high':'ok','tab'=>'health','items'=>$staleNotices],
        ['key'=>'hiyari','label'=>'Hiyari open longer than 14 days','count'=>count($staleHiyari),'severity'=>count($staleHiyari)?'medium':'ok','tab'=>'health','items'=>$staleHiyari],
        ['key'=>'training','label'=>'Training records expired','count'=>admin8_number(safe_scalar('SELECT COUNT(*) FROM training_records WHERE ExpiryDate IS NOT NULL AND ExpiryDate<CURDATE()')),'severity'=>'medium','tab'=>'health','items'=>[]],
        ['key'=>'yokoten','label'=>'Yokoten responses pending review','count'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM yokotenresponses WHERE ApprovalStatus='Pending'")),'severity'=>'medium','tab'=>'health','items'=>[]],
        ['key'=>'profiles','label'=>'Employee profiles missing department/position','count'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE COALESCE(Department,'')='' OR COALESCE(Position,'')=''")),'severity'=>'medium','tab'=>'employees','items'=>[]],
        ['key'=>'targets','label'=>'Activity target slots without effective source','count'=>$targetMissing,'severity'=>'low','tab'=>'targets','items'=>[]],
        ['key'=>'audit_failures','label'=>'Failed API actions in last 7 days','count'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs WHERE ActionTime>=DATE_SUB(NOW(),INTERVAL 7 DAY) AND (Action LIKE 'FAILED%' OR StatusCode>=400)")),'severity'=>'high','tab'=>'audit','items'=>[]],
    ];
    $score = 100;
    foreach ($actionRequired as $item) {
        $weight = $item['severity'] === 'high' ? 8 : ($item['severity'] === 'medium' ? 5 : ($item['severity'] === 'low' ? 2 : 0));
        $score -= min($item['count'], 10) * $weight;
    }
    return [
        'totalEmployees'=>admin8_number(safe_scalar('SELECT COUNT(*) FROM employees')),
        'schedulesThisMonth'=>admin8_number(safe_scalar('SELECT COUNT(*) FROM patrol_sessions WHERE MONTH(PatrolDate)=MONTH(CURDATE()) AND YEAR(PatrolDate)=YEAR(CURDATE())')),
        'pendingSchedules'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM patrol_sessions WHERE Status='Pending' AND PatrolDate>=CURDATE()")),
        'openHiyari'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed'")),
        'kyThisMonth'=>admin8_number(safe_scalar('SELECT COUNT(*) FROM ky_activities WHERE MONTH(ActivityDate)=MONTH(CURDATE()) AND YEAR(ActivityDate)=YEAR(CURDATE())')),
        'openChangeNotices'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Open'")),
        'auditToday'=>admin8_number(safe_scalar('SELECT COUNT(*) FROM admin_auditlogs WHERE DATE(ActionTime)=CURDATE()')),
        'deptBreakdown'=>safe_rows('SELECT Department,COUNT(*) cnt FROM employees GROUP BY Department ORDER BY cnt DESC LIMIT 10'),
        'recentAudit'=>safe_rows('SELECT * FROM admin_auditlogs ORDER BY ActionTime DESC LIMIT 5'),
        'actionRequired'=>$actionRequired,
        'uxHealth'=>['score'=>max(0,$score),'high'=>count(array_filter($actionRequired,function($i){return $i['severity']==='high'&&$i['count']>0;})),'medium'=>count(array_filter($actionRequired,function($i){return $i['severity']==='medium'&&$i['count']>0;})),'low'=>count(array_filter($actionRequired,function($i){return $i['severity']==='low'&&$i['count']>0;}))],
    ];
}

function admin8_health(): array
{
    $counts = [
        'Employees'=>safe_scalar('SELECT COUNT(*) FROM employees'), 'Master_Departments'=>safe_scalar('SELECT COUNT(*) FROM master_departments'),
        'Master_Teams'=>safe_scalar('SELECT COUNT(*) FROM master_teams'), 'Patrol_Sessions'=>safe_scalar('SELECT COUNT(*) FROM patrol_sessions'),
        'Patrol_Issues'=>safe_scalar('SELECT COUNT(*) FROM patrol_issues'), 'HiyariReports'=>safe_scalar('SELECT COUNT(*) FROM hiyarireports'),
        'KY_Activities'=>safe_scalar('SELECT COUNT(*) FROM ky_activities'), 'FourM_ChangeNotices'=>safe_scalar('SELECT COUNT(*) FROM fourm_changenotices'),
        'FourM_ManRecords'=>safe_scalar('SELECT COUNT(*) FROM fourm_manrecords'), 'Contractor_Documents'=>safe_scalar('SELECT COUNT(*) FROM contractor_documents'),
        'SCW_Documents'=>safe_scalar('SELECT COUNT(*) FROM scw_documents'), 'YokotenTopics'=>safe_scalar('SELECT COUNT(*) FROM yokotentopics'),
        'Admin_AuditLogs'=>safe_scalar('SELECT COUNT(*) FROM admin_auditlogs'),
    ];
    $missing = [];
    foreach ($counts as $key=>$value) if ($value === null) $missing[] = $key;
    $staleNotices = safe_rows("SELECT id,NoticeNo,Department,RequestDate AS ChangeDate FROM fourm_changenotices WHERE Status='Open' AND DATEDIFF(CURDATE(),RequestDate)>30 ORDER BY RequestDate LIMIT 10");
    $staleHiyari = safe_rows("SELECT id,Department,ReportDate FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed' AND DATEDIFF(CURDATE(),ReportDate)>14 ORDER BY ReportDate LIMIT 10");
    $failed = admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs WHERE ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY) AND (StatusCode>=400 OR Action LIKE 'FAILED%')"));
    $signals = [
        ['key'=>'missing_tables','label'=>'Missing or unreadable module tables','count'=>count($missing),'severity'=>count($missing)?'high':'ok','detail'=>$missing],
        ['key'=>'failed_api_24h','label'=>'Failed API actions in last 24h','count'=>$failed,'severity'=>$failed?'high':'ok','detail'=>[]],
        ['key'=>'stale_change','label'=>'4M Change Notice older than 30 days','count'=>count($staleNotices),'severity'=>count($staleNotices)?'medium':'ok','detail'=>$staleNotices],
        ['key'=>'stale_hiyari','label'=>'Hiyari open longer than 14 days','count'=>count($staleHiyari),'severity'=>count($staleHiyari)?'medium':'ok','detail'=>$staleHiyari],
        ['key'=>'employee_master','label'=>'Employee and department master data','count'=>empty($counts['Employees'])||empty($counts['Master_Departments'])?1:0,'severity'=>empty($counts['Employees'])||empty($counts['Master_Departments'])?'medium':'ok','detail'=>[]],
    ];
    $score=100; foreach($signals as $signal){if(!$signal['count'])continue;$score-=min($signal['count'],5)*($signal['severity']==='high'?20:10);} $score=max(0,$score);
    return ['modules'=>[
        'employees'=>['total'=>$counts['Employees'],'depts'=>$counts['Master_Departments'],'teams'=>$counts['Master_Teams']],
        'patrol'=>['sessions'=>$counts['Patrol_Sessions'],'issues'=>$counts['Patrol_Issues']], 'hiyari'=>['total'=>$counts['HiyariReports'],'open'=>safe_scalar("SELECT COUNT(*) FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed'")],
        'ky'=>['total'=>$counts['KY_Activities']], 'fourm'=>['total'=>$counts['FourM_ChangeNotices'],'open'=>safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Open'"),'manRecords'=>$counts['FourM_ManRecords']],
        'contractor'=>['docs'=>$counts['Contractor_Documents']], 'ojt'=>['docs'=>$counts['SCW_Documents']], 'yokoten'=>['topics'=>$counts['YokotenTopics']],
    ],'alerts'=>['staleChangeNotices'=>$staleNotices,'staleHiyari'=>$staleHiyari],'audit'=>['total'=>$counts['Admin_AuditLogs'],'last24h'=>safe_scalar('SELECT COUNT(*) FROM admin_auditlogs WHERE ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)'),'failed24h'=>$failed],'readiness'=>['score'=>$score,'status'=>$score>=90?'Ready':($score>=70?'Monitor':'Action Needed'),'signals'=>$signals,'missingTables'=>$missing]];
}

function handle_admin_phase8_routes(string $method, string $path): bool
{
    if (strpos($path, '/admin/') !== 0) return false;
    $user = require_admin();
    admin8_ensure_schema();

    if ($method === 'GET' && $path === '/admin/email-requirement-rules') json_response(['success'=>true,'data'=>array_merge(admin8_email_rule(),['defaultPositionNames'=>admin8_default_email_position_names()])]);
    if ($method === 'GET' && $path === '/admin/email-readiness') json_response(['success'=>true,'data'=>admin8_email_readiness()]);
    if ($method === 'PUT' && $path === '/admin/email-requirement-rules') {
        $ids=admin8_parse_rule(json_encode(['positionIds'=>json_body()['positionIds']??[]])); $available=[];
        foreach(db_rows('SELECT id FROM master_positions') as $row)$available[(int)$row['id']]=true;
        foreach($ids as $id)if(!isset($available[$id]))json_response(['success'=>false,'message'=>'Position rule contains unknown Master Position IDs.'],400);
        db_execute("INSERT INTO app_settings(key_name,value) VALUES('employee_email_required_positions',?) ON DUPLICATE KEY UPDATE value=VALUES(value),UpdatedAt=NOW()",[json_encode(['positionIds'=>$ids,'updatedBy'=>$user['id']??null,'updatedAt'=>date(DATE_ATOM)],JSON_UNESCAPED_SLASHES)]);
        admin8_log($user,'UPDATE_EMAIL_REQUIREMENT_RULE','App_Setting','employee_email_required_positions','Required email positions: '.count($ids));
        json_response(['success'=>true,'data'=>admin8_email_rule(),'message'=>'Email requirement rule updated.']);
    }
    if ($method === 'GET' && $path === '/admin/dashboard-stats') json_response(['success'=>true,'data'=>admin8_dashboard()]);
    if ($method === 'GET' && $path === '/admin/system-health') json_response(['success'=>true,'data'=>admin8_health()]);
    if ($method === 'GET' && $path === '/admin/audit-logs') {
        $page=max(1,(int)($_GET['page']??1));$limit=max(1,min(5000,(int)($_GET['limit']??50)));$offset=($page-1)*$limit;$where=' WHERE 1=1';$params=[];
        foreach(['action'=>'Action','adminId'=>'AdminID','module'=>'Module'] as $q=>$column)if(trim((string)($_GET[$q]??''))!==''){$where.=" AND $column=?";$params[]=$_GET[$q];}
        if(($_GET['failed']??'')==='1')$where.=" AND (StatusCode>=400 OR Action LIKE 'FAILED%')";
        if(trim((string)($_GET['q']??''))!==''){$like='%'.trim((string)$_GET['q']).'%';$where.=' AND (AdminName LIKE ? OR AdminID LIKE ? OR Action LIKE ? OR TargetType LIKE ? OR TargetID LIKE ? OR Detail LIKE ? OR Path LIKE ?)';for($i=0;$i<7;$i++)$params[]=$like;}
        if(!empty($_GET['dateFrom'])){$where.=' AND ActionTime>=?';$params[]=$_GET['dateFrom'];} if(!empty($_GET['dateTo'])){$where.=' AND ActionTime<DATE_ADD(?,INTERVAL 1 DAY)';$params[]=$_GET['dateTo'];}
        json_response(['success'=>true,'data'=>db_rows("SELECT * FROM admin_auditlogs$where ORDER BY ActionTime DESC LIMIT $limit OFFSET $offset",$params),'total'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs$where",$params)),'page'=>$page,'limit'=>$limit,'facets'=>['modules'=>array_column(db_rows("SELECT DISTINCT Module FROM admin_auditlogs WHERE Module IS NOT NULL AND Module<>'' ORDER BY Module"),'Module'),'actions'=>array_column(db_rows("SELECT DISTINCT Action FROM admin_auditlogs WHERE Action IS NOT NULL AND Action<>'' ORDER BY Action"),'Action')]]);
    }
    $roles=['ADMIN','EXECUTIVE','MANAGER','STAFF','SAFETY_OFFICER'];$permissions=['VIEW_DASHBOARD','MANAGE_USERS','VIEW_REPORT','APPROVE_SAFETY','SUBMIT_SAFETY'];
    if ($method === 'GET' && $path === '/admin/permissions/matrix') {
        $matrix=[];foreach($roles as $role){$matrix[$role]=[];foreach($permissions as $permission)$matrix[$role][$permission]=0;} foreach(db_rows('SELECT role,permission,granted FROM admin_rolepermissions') as $row)if(isset($matrix[$row['role']][$row['permission']]))$matrix[$row['role']][$row['permission']]=(int)$row['granted'];
        json_response(['success'=>true,'data'=>['matrix'=>$matrix,'roles'=>$roles,'permissions'=>$permissions,'roleLabels'=>['ADMIN'=>'Admin','EXECUTIVE'=>'Executive','MANAGER'=>'Manager','STAFF'=>'Staff','SAFETY_OFFICER'=>'Safety Officer']]]);
    }
    if ($method === 'PUT' && $path === '/admin/permissions/matrix') {
        $body=json_body();$role=(string)($body['role']??'');$permission=(string)($body['permission']??'');$granted=!empty($body['granted'])?1:0;
        if(!in_array($role,$roles,true)||!in_array($permission,$permissions,true))json_response(['success'=>false,'message'=>'role or permission is invalid.'],400);
        db_execute('INSERT INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?) ON DUPLICATE KEY UPDATE granted=VALUES(granted)',[$role,$permission,$granted]);
        admin8_log($user,'UPDATE_PERMISSION','RolePermission',$role.':'.$permission,'granted: '.$granted);json_response(['success'=>true,'message'=>'Permission updated.']);
    }
    return false;
}
