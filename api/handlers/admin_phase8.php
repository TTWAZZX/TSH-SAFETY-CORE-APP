<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/cccf_worker_progress.php';

function admin8_registration_login_url(): string
{
    global $config;
    $candidates = [];
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? ''));
    if ($host !== '') {
        $script = (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php');
        $apiPos = strpos($script, '/api/');
        $basePath = $apiPos === false ? '' : substr($script, 0, $apiPos);
        $candidates[] = ($https ? 'https://' : 'http://') . $host . $basePath;
    }
    if (is_array($config ?? null)) {
        foreach (['public_upload_base_url', 'public_app_base_url', 'app_url'] as $key) {
            if (!empty($config[$key])) {
                $candidates[] = (string)$config[$key];
            }
        }
    }
    foreach (['PUBLIC_APP_BASE_URL', 'PUBLIC_UPLOAD_BASE_URL', 'APP_URL'] as $key) {
        $value = getenv($key);
        if ($value !== false && trim((string)$value) !== '') {
            $candidates[] = (string)$value;
        }
    }
    $envPath = dirname(__DIR__, 2) . '/backend/.env';
    if (is_file($envPath)) {
        foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (strpos($line, '=') === false || preg_match('/^\s*#/', $line)) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            if (in_array(trim($key), ['PUBLIC_APP_BASE_URL', 'PUBLIC_UPLOAD_BASE_URL', 'APP_URL'], true)) {
                $candidates[] = trim($value, " \t\n\r\0\x0B\"'");
            }
        }
    }
    foreach ($candidates as $candidate) {
        $url = rtrim(trim((string)$candidate), '/');
        $hostPart = strtolower((string)parse_url($url, PHP_URL_HOST));
        $isLocal = in_array($hostPart, ['localhost', '127.0.0.1', '0.0.0.0', '::1'], true);
        if (preg_match('/^https?:\/\//i', $url) && !$isLocal) {
            return $url;
        }
    }
    return '';
}

function admin8_registration_email_template(array $data): array
{
    $approved = ($data['status'] ?? '') === 'Approved';
    $escape = static fn($value): string => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $color = $approved ? '#059669' : '#dc2626';
    $soft = $approved ? '#ecfdf5' : '#fef2f2';
    $title = $approved ? 'คำขอสมัครบัญชีได้รับการอนุมัติ' : 'ผลการตรวจสอบคำขอสมัครบัญชี';
    $badge = $approved ? 'APPROVED' : 'REJECTED';
    $employeeId = (string)($data['employeeId'] ?? '');
    $employeeName = (string)($data['employeeName'] ?? $employeeId);
    $reference = (string)($data['referenceCode'] ?? '');
    $reason = (string)($data['reason'] ?? '');
    $loginUrl = admin8_registration_login_url();
    $action = $approved
        ? 'บัญชีของคุณพร้อมใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยรหัสพนักงานและรหัสผ่านที่ตั้งไว้'
        : 'กรุณาตรวจสอบเหตุผลด้านล่าง หากต้องการแก้ไขข้อมูลหรือต้องการความช่วยเหลือ กรุณาติดต่อ Safety/Admin';
    $reasonBlock = !$approved && $reason !== ''
        ? '<div style="margin:20px 0;padding:14px 16px;border-radius:10px;background:#fff;border:1px solid #fecaca"><div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:5px">เหตุผล</div><div style="font-size:14px;color:#7f1d1d;line-height:1.6">'.$escape($reason).'</div></div>'
        : '';
    $button = $approved && $loginUrl !== ''
        ? '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0"><tr><td bgcolor="'.$color.'" style="border-radius:10px"><a href="'.$escape($loginUrl).'" target="_blank" rel="noopener" style="display:inline-block;background:'.$color.';color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;line-height:1.2;padding:13px 24px;border-radius:10px;border:1px solid '.$color.'">เข้าสู่ระบบ</a></td></tr></table><div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">หากปุ่มเปิดไม่ได้ ให้คัดลอกลิงก์นี้:<br><a href="'.$escape($loginUrl).'" target="_blank" rel="noopener" style="color:#047857;text-decoration:underline">'.$escape($loginUrl).'</a></div>'
        : '';
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Noto Sans Thai,sans-serif;color:#1e293b">'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px"><tr><td align="center">'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">'
        .'<tr><td style="padding:24px 28px;background:#065f46;color:#fff"><div style="font-size:12px;letter-spacing:.08em;opacity:.85">THAI SUMMIT HARNESS CO., LTD.</div><div style="font-size:21px;font-weight:800;margin-top:6px">TSH Safety Core</div></td></tr>'
        .'<tr><td style="padding:30px 28px"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:'.$soft.';color:'.$color.';font-size:11px;font-weight:800;letter-spacing:.08em">'.$badge.'</span>'
        .'<h1 style="font-size:22px;line-height:1.35;margin:16px 0 8px;color:#0f172a">'.$title.'</h1>'
        .'<p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 20px">เรียน '.$escape($employeeName).',<br>'.$action.'</p>'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">'
        .'<tr><td style="padding:12px 16px;font-size:12px;color:#64748b">รหัสพนักงาน</td><td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:700">'.$escape($employeeId).'</td></tr>'
        .'<tr><td style="padding:12px 16px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">เลขอ้างอิง</td><td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:700;border-top:1px solid #e2e8f0">'.$escape($reference).'</td></tr></table>'
        .$reasonBlock.$button
        .'<p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:26px 0 0">อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้</p></td></tr></table></td></tr></table></body></html>';
    $text = $approved
        ? "คำขอ $reference ได้รับการอนุมัติแล้ว\nรหัสพนักงาน: $employeeId\nเข้าสู่ระบบ: $loginUrl"
        : "คำขอ $reference ไม่ได้รับการอนุมัติ\nรหัสพนักงาน: $employeeId\nเหตุผล: ".($reason ?: '-')."\nกรุณาติดต่อ Safety/Admin";
    return ['subject'=>'TSH Safety Core | '.$title,'text'=>$text,'html'=>$html];
}

function admin8_registration_request_id($value): ?int
{
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $id === false ? null : (int)$id;
}

function admin8_registration_date_filter($value): ?string
{
    $text = trim((string)$value);
    if ($text === '') return '';
    $date = DateTime::createFromFormat('!Y-m-d', $text);
    return $date && $date->format('Y-m-d') === $text ? $text : null;
}

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
    db()->exec("CREATE TABLE IF NOT EXISTS system_health_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        SnapshotAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        Source VARCHAR(40) NOT NULL DEFAULT 'manual',
        BuildId VARCHAR(120),
        CacheBust VARCHAR(160),
        ReadinessScore INT NOT NULL DEFAULT 0,
        ReadinessStatus VARCHAR(40),
        CriticalModules INT NOT NULL DEFAULT 0,
        WarningModules INT NOT NULL DEFAULT 0,
        OkModules INT NOT NULL DEFAULT 0,
        FailedApi24h INT NOT NULL DEFAULT 0,
        StorageStatus VARCHAR(40),
        SecurityStatus VARCHAR(40),
        VersionStatus VARCHAR(40),
        PayloadJson LONGTEXT,
        CreatedBy VARCHAR(80),
        KEY idx_snapshot_at (SnapshotAt),
        KEY idx_status (ReadinessStatus),
        KEY idx_build (BuildId)
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
    db()->exec("CREATE TABLE IF NOT EXISTS safety_core_export_roster (
        id INT AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        SortOrder INT NOT NULL DEFAULT 999,
        IsActive TINYINT(1) NOT NULL DEFAULT 1,
        CreatedBy VARCHAR(50) DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedBy VARCHAR(50) DEFAULT NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_employee (EmployeeID),
        KEY idx_sort (SortOrder),
        KEY idx_employee (EmployeeID),
        KEY idx_active (IsActive)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach (admin8_permission_defaults() as $row) {
        db_execute('INSERT IGNORE INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?)', $row);
    }
    $ready = true;
}

function admin8_permission_defaults(): array
{
    return [
        ['ADMIN','VIEW_DASHBOARD',1], ['ADMIN','MANAGE_USERS',1], ['ADMIN','VIEW_REPORT',1], ['ADMIN','APPROVE_SAFETY',1], ['ADMIN','SUBMIT_SAFETY',1], ['ADMIN','FOURM_TRAINING_MANAGE',1],
        ['USER','VIEW_DASHBOARD',1], ['USER','SUBMIT_SAFETY',1], ['USER','VIEW_REPORT',0], ['USER','APPROVE_SAFETY',0], ['USER','MANAGE_USERS',0], ['USER','FOURM_TRAINING_MANAGE',0],
        ['VIEWER','VIEW_DASHBOARD',1], ['VIEWER','VIEW_REPORT',1], ['VIEWER','SUBMIT_SAFETY',0], ['VIEWER','APPROVE_SAFETY',0], ['VIEWER','MANAGE_USERS',0], ['VIEWER','FOURM_TRAINING_MANAGE',0],
        ['EXECUTIVE','VIEW_DASHBOARD',1], ['EXECUTIVE','VIEW_REPORT',1], ['EXECUTIVE','APPROVE_SAFETY',1], ['EXECUTIVE','MANAGE_USERS',0], ['EXECUTIVE','SUBMIT_SAFETY',0], ['EXECUTIVE','FOURM_TRAINING_MANAGE',0],
        ['MANAGER','VIEW_DASHBOARD',1], ['MANAGER','VIEW_REPORT',1], ['MANAGER','SUBMIT_SAFETY',1], ['MANAGER','APPROVE_SAFETY',0], ['MANAGER','MANAGE_USERS',0], ['MANAGER','FOURM_TRAINING_MANAGE',0],
        ['STAFF','VIEW_DASHBOARD',1], ['STAFF','SUBMIT_SAFETY',1], ['STAFF','VIEW_REPORT',0], ['STAFF','APPROVE_SAFETY',0], ['STAFF','MANAGE_USERS',0], ['STAFF','FOURM_TRAINING_MANAGE',0],
        ['SAFETY_OFFICER','VIEW_DASHBOARD',1], ['SAFETY_OFFICER','VIEW_REPORT',1], ['SAFETY_OFFICER','APPROVE_SAFETY',1], ['SAFETY_OFFICER','SUBMIT_SAFETY',1], ['SAFETY_OFFICER','MANAGE_USERS',0], ['SAFETY_OFFICER','FOURM_TRAINING_MANAGE',0],
        ['ADMIN','FORKLIFT_VIEW',1], ['ADMIN','FORKLIFT_REQUEST',1], ['ADMIN','FORKLIFT_APPROVE',1], ['ADMIN','FORKLIFT_MANAGE',1], ['ADMIN','FORKLIFT_RENEW',1], ['ADMIN','FORKLIFT_SUSPEND',1], ['ADMIN','FORKLIFT_PRINT',1], ['ADMIN','FORKLIFT_EXPORT',1], ['ADMIN','FORKLIFT_DOCUMENT_MANAGE',1], ['ADMIN','FORKLIFT_TEMPLATE_MANAGE',1], ['ADMIN','FORKLIFT_SETTINGS_MANAGE',1], ['ADMIN','FORKLIFT_AUDIT_VIEW',1],
        ['USER','FORKLIFT_VIEW',1], ['USER','FORKLIFT_REQUEST',1],
        ['MANAGER','FORKLIFT_VIEW',1], ['MANAGER','FORKLIFT_REQUEST',1], ['MANAGER','FORKLIFT_PRINT',1], ['MANAGER','FORKLIFT_EXPORT',1],
        ['SAFETY_OFFICER','FORKLIFT_VIEW',1], ['SAFETY_OFFICER','FORKLIFT_REQUEST',1], ['SAFETY_OFFICER','FORKLIFT_APPROVE',1], ['SAFETY_OFFICER','FORKLIFT_MANAGE',1], ['SAFETY_OFFICER','FORKLIFT_RENEW',1], ['SAFETY_OFFICER','FORKLIFT_SUSPEND',1], ['SAFETY_OFFICER','FORKLIFT_PRINT',1], ['SAFETY_OFFICER','FORKLIFT_EXPORT',1], ['SAFETY_OFFICER','FORKLIFT_DOCUMENT_MANAGE',1],
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

function admin8_health_registry(): array
{
    return [
        ['key'=>'core','label'=>'Core Master','group'=>'platform','nav'=>'employees','tables'=>['employees','master_departments','master_teams','master_positions','master_areas','app_settings'],'columns'=>['employees'=>['EmployeeID','EmployeeName','Department','Position','Role']],'api'=>['/api/master/departments','/api/admin/employees']],
        ['key'=>'admin','label'=>'System Console','group'=>'platform','nav'=>'admin','tables'=>['admin_auditlogs','admin_rolepermissions','admin_userpermissions','safety_core_export_roster'],'columns'=>['admin_auditlogs'=>['Module','Path','StatusCode','ActionTime']],'api'=>['/api/admin/system-health','/api/admin/audit-logs','/api/admin/safety-core-data']],
        ['key'=>'registration','label'=>'Account Registration','group'=>'platform','nav'=>'admin','tables'=>['registration_requests'],'columns'=>['registration_requests'=>['ReferenceCode','EmployeeID','Status','SubmittedAt','StatusViewCount']],'api'=>['/api/register/options','/api/admin/registration-requests']],
        ['key'=>'activity-targets','label'=>'Activity Targets','group'=>'platform','nav'=>'admin','tables'=>['activity_position_templates','activity_scope_overrides','employee_activity_targets','activity_position_template_years','activity_scope_override_years','employee_activity_target_years'],'api'=>['/api/activity-targets/activities','/api/activity-targets/coverage-matrix','/api/activity-targets/me']],
        ['key'=>'dashboard','label'=>'Dashboard','group'=>'platform','nav'=>'dashboard','tables'=>['dashboard_config'],'api'=>['/api/dashboard/overview','/api/dashboard/config']],
        ['key'=>'module-forms','label'=>'Module Forms','group'=>'platform','nav'=>'admin','tables'=>['module_forms'],'api'=>['/api/module-forms?module=hiyari']],
        ['key'=>'policy','label'=>'Policy','group'=>'content','nav'=>'policy','tables'=>['policies'],'api'=>['/api/pagedata/policies']],
        ['key'=>'committee','label'=>'Committee','group'=>'content','nav'=>'committee','tables'=>['committees'],'api'=>['/api/pagedata/committees']],
        ['key'=>'kpi','label'=>'KPI','group'=>'content','nav'=>'kpi','tables'=>['kpiannouncements','kpidata'],'api'=>['/api/pagedata/kpi-announcements','/api/kpidata/2026']],
        ['key'=>'patrol','label'=>'Safety Patrol','group'=>'workflow','nav'=>'patrol','tables'=>['patrol_sessions','patrol_issues','patrol_roster','patrol_leave_requests','patrol_emailoutbox','patrol_ranka_hotspot_positions','patrol_ranka_hotspot_issue_positions'],'api'=>['/api/patrol/dashboard-stats','/api/patrol/issues','/api/patrol/roster']],
        ['key'=>'cccf','label'=>'CCCF Activity','group'=>'workflow','nav'=>'cccf','tables'=>['cccf_activity','cccf_forma_worker','cccf_forma_permanent','cccf_unit_targets','cccf_worker_attachments','cccf_permanent_sequences','cccf_assignments','cccf_emailoutbox'],'columns'=>['cccf_forma_worker'=>['SafetyUnit','SubmitDate'],'cccf_forma_permanent'=>['PermanentNo','ReviewStatus']],'api'=>['/api/cccf/form-a-worker','/api/cccf/form-a-permanent','/api/cccf/unit-targets']],
        ['key'=>'hiyari','label'=>'Hiyari-Hatto','group'=>'workflow','nav'=>'hiyari','tables'=>['hiyarireports','hiyari_dashboard_config','hiyari_assignments','hiyari_emailoutbox'],'api'=>['/api/hiyari/stats','/api/hiyari/dashboard-config']],
        ['key'=>'ky','label'=>'KY Activity','group'=>'workflow','nav'=>'ky','tables'=>['ky_activities','ky_program_config','ky_video_reactions','ky_emailoutbox'],'api'=>['/api/ky/stats','/api/ky/program-config']],
        ['key'=>'fourm','label'=>'4M Change','group'=>'workflow','nav'=>'fourm','tables'=>['fourm_changenotices','fourm_manrecords','fourm_actiontasks','fourm_emailoutbox','fourm_curriculums','fourm_coursemaster','fourm_courses','fourm_courseemployees','fourm_curriculumemployees','fourm_curriculumlogs'],'api'=>['/api/fourm/stats','/api/fourm/notices','/api/fourm/man-records']],
        ['key'=>'training','label'=>'Safety Training','group'=>'workflow','nav'=>'training','tables'=>['training_courses','training_records','training_dept_records','training_audit_requirements'],'api'=>['/api/training/courses','/api/training/summary','/api/training/records']],
        ['key'=>'ojt','label'=>'OJT / SCW','group'=>'workflow','nav'=>'ojt','tables'=>['scw_standard','ojt_records','ojt_history','scw_documents','ojt_settings'],'api'=>['/api/ojt/standard','/api/ojt/records','/api/ojt/documents']],
        ['key'=>'forklift','label'=>'Forklift License','group'=>'operations','nav'=>'forklift','tables'=>['forklift_license_types','forklift_licenses','forklift_license_requests','forklift_license_renewals','forklift_license_documents','forklift_card_templates','forklift_card_template_versions','forklift_card_template_fields','forklift_card_template_type_map','forklift_card_print_logs','forklift_verification_tokens','forklift_emailoutbox','forklift_sequences','forklift_settings','forklift_employee_photos'],'api'=>['/api/forklift/dashboard','/api/forklift/license-types','/api/forklift/settings']],
        ['key'=>'contractor','label'=>'Contractor / Supplier','group'=>'operations','nav'=>'contractor','tables'=>['contractor_documents','contractor_activity_log','contractor_companies','contractor_accidentrecords','contractor_accidentfiles'],'api'=>['/api/contractor/documents','/api/contractor/documents/stats','/api/contractor/activity']],
        ['key'=>'machine-safety','label'=>'Machine Device','group'=>'operations','nav'=>'machine-safety','tables'=>['machine_safety','machine_safety_files','machine_safety_compliance','machine_safety_issues'],'api'=>['/api/machine-safety']],
        ['key'=>'accident','label'=>'Accident Reports','group'=>'operations','nav'=>'accident','tables'=>['accident_reports','accident_attachments','accident_performance','accident_monthly_reports','accident_hotspot_positions'],'api'=>['/api/accident/reports','/api/accident/summary','/api/accident/analytics']],
        ['key'=>'safety-culture','label'=>'Safety Culture','group'=>'operations','nav'=>'safety-culture','tables'=>['sc_principles','sc_assessments','sc_assessment_points','sc_assessment_locations','sc_ppe_items','sc_ppe_worktypes','sc_ppe_worktype_items','sc_ppeinspections','sc_ppe_inspection_details','sc_ppe_violations','sc_ppe_auditlog'],'api'=>['/api/safety-culture/dashboard','/api/safety-culture/principles','/api/safety-culture/ppe-inspections']],
        ['key'=>'yokoten','label'=>'Yokoten','group'=>'knowledge','nav'=>'yokoten','tables'=>['yokotentopics','yokotenresponses','yokoten_response_files','yokoten_dashboard_config','yokoten_emailoutbox'],'api'=>['/api/yokoten/topics','/api/yokoten/dashboard-config','/api/yokoten/all-responses']],
        ['key'=>'johnny','label'=>'Johnny AI','group'=>'knowledge','nav'=>'johnny','tables'=>['johnny_chat_conversations','johnny_chat_messages','johnny_kb_documents','johnny_kb_chunks','johnny_operational_logs'],'api'=>['/api/johnny/operational-logs','/api/johnny/kb-documents']],
        ['key'=>'settings','label'=>'Settings','group'=>'platform','nav'=>'admin','tables'=>['app_settings'],'api'=>['/api/settings/public_upload_base_url']],
    ];
}

function admin8_table_count(string $table): ?int
{
    $safe = str_replace('`', '``', $table);
    return safe_scalar("SELECT COUNT(*) FROM `$safe`");
}

function admin8_column_exists(string $table, string $column): bool
{
    return (int) (safe_scalar('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME)=LOWER(?) AND LOWER(COLUMN_NAME)=LOWER(?)', [$table, $column]) ?? 0) > 0;
}

function admin8_health_module_from_path(string $path): string
{
    $clean = preg_replace('#^/api/#', '', strtok($path, '?') ?: $path);
    $first = explode('/', $clean)[0] ?? 'system';
    if (in_array($first, ['pagedata', 'kpidata', 'kpiannouncements'], true)) return 'kpi';
    return str_replace('_', '-', strtolower($first ?: 'system'));
}

function admin8_health_table_requirement(string $moduleKey, string $table): string
{
    $optional = [
        'patrol'=>['patrol_ranka_hotspot_positions','patrol_ranka_hotspot_issue_positions'],
        'cccf'=>['cccf_assignments','cccf_emailoutbox'],
        'hiyari'=>['hiyari_assignments','hiyari_emailoutbox'],
        'ky'=>['ky_video_reactions','ky_emailoutbox'],
        'fourm'=>['fourm_emailoutbox','fourm_coursemaster','fourm_courseemployees','fourm_curriculumlogs'],
        'ojt'=>['ojt_settings'],
        'forklift'=>['forklift_employee_photos'],
        'contractor'=>['contractor_activity_log'],
        'yokoten'=>['yokoten_emailoutbox'],
        'johnny'=>['johnny_operational_logs'],
    ];
    $backlog = [
        'core'=>['master_areas'],
        'contractor'=>['contractor_companies','contractor_accidentrecords','contractor_accidentfiles'],
    ];
    $name = strtolower($table);
    if (in_array($name, $backlog[$moduleKey] ?? [], true)) return 'backlog';
    if (in_array($name, $optional[$moduleKey] ?? [], true)) return 'optional';
    return 'required';
}

function admin8_health_workflow_rules(): array
{
    $rules = [
        ['key'=>'patrol_issue_overdue','module'=>'patrol','label'=>'Patrol issues open beyond SLA','slaDays'=>14,'severity'=>'high','penalty'=>8,'query'=>"SELECT COUNT(*) FROM patrol_issues WHERE (CurrentStatus IS NULL OR CurrentStatus NOT IN ('Closed','Completed')) AND DATEDIFF(CURDATE(),COALESCE(DueDate,DateFound))>14"],
        ['key'=>'patrol_leave_pending','module'=>'patrol','label'=>'Patrol leave pending review','slaDays'=>3,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM patrol_leave_requests WHERE Status='Pending' AND DATEDIFF(CURDATE(),CreatedAt)>3"],
        ['key'=>'cccf_permanent_pending','module'=>'cccf','label'=>'CCCF Permanent pending review','slaDays'=>7,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM cccf_forma_permanent WHERE COALESCE(ReviewStatus,'Pending')='Pending' AND DATEDIFF(CURDATE(),COALESCE(SubmittedAt,CreatedAt))>7"],
        ['key'=>'cccf_unit_target_unset','module'=>'cccf','label'=>'CCCF active Units without yearly target','slaDays'=>0,'severity'=>'low','penalty'=>2,'query'=>"SELECT COUNT(*) FROM master_teams t LEFT JOIN cccf_unit_targets u ON LOWER(TRIM(u.SafetyUnit))=LOWER(TRIM(t.Name)) AND u.TargetYear=YEAR(CURDATE()) WHERE COALESCE(t.Name,'')<>'' AND u.id IS NULL"],
        ['key'=>'hiyari_stale','module'=>'hiyari','label'=>'Hiyari open beyond SLA','slaDays'=>14,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed' AND DATEDIFF(CURDATE(),ReportDate)>14"],
        ['key'=>'fourm_stale','module'=>'fourm','label'=>'4M Change open beyond SLA','slaDays'=>30,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM fourm_changenotices WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30"],
        ['key'=>'forklift_expired','module'=>'forklift','label'=>'Active forklift licenses expired','slaDays'=>0,'severity'=>'high','penalty'=>8,'query'=>"SELECT COUNT(*) FROM forklift_licenses WHERE ExpireDate<CURDATE() AND DeletedAt IS NULL AND UPPER(COALESCE(CurrentStatus,'ACTIVE')) NOT IN ('ARCHIVED','SUSPENDED')"],
        ['key'=>'forklift_request_pending','module'=>'forklift','label'=>'Forklift requests pending review','slaDays'=>7,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM forklift_license_requests WHERE RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND DATEDIFF(CURDATE(),COALESCE(SubmittedAt,RequestedAt))>COALESCE((SELECT CAST(SettingValue AS UNSIGNED) FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1),3)"],
        ['key'=>'training_expired','module'=>'training','label'=>'Training records expired','slaDays'=>0,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM training_records WHERE ExpiryDate IS NOT NULL AND ExpiryDate<CURDATE()"],
        ['key'=>'contractor_docs_expired','module'=>'contractor','label'=>'Contractor documents expired','slaDays'=>0,'severity'=>'high','penalty'=>8,'query'=>"SELECT COUNT(*) FROM contractor_documents WHERE ExpiryDate IS NOT NULL AND ExpiryDate<CURDATE()"],
        ['key'=>'accident_overdue','module'=>'accident','label'=>'Accident investigation/CAPA overdue','slaDays'=>0,'severity'=>'high','penalty'=>8,'query'=>"SELECT COUNT(*) FROM accident_reports WHERE DueDate IS NOT NULL AND DueDate<CURDATE() AND Status!='Closed' AND (IsDeleted IS NULL OR IsDeleted=0)"],
        ['key'=>'safety_culture_pending','module'=>'safety-culture','label'=>'Safety Culture assessments pending','slaDays'=>14,'severity'=>'medium','penalty'=>4,'query'=>"SELECT COUNT(*) FROM sc_assessments WHERE COALESCE(Status,'Draft') NOT IN ('Completed','Closed') AND DATEDIFF(CURDATE(),CreatedAt)>14"],
    ];
    foreach ($rules as &$rule) {
        $value = safe_scalar($rule['query']);
        $rule['count'] = $value === null ? 0 : (int)$value;
        $rule['available'] = $value !== null;
        unset($rule['query']);
    }
    unset($rule);
    return $rules;
}

function admin8_storage_health(): array
{
    $projectRoot = dirname(__DIR__, 2);
    $uploadDirs = [
        $projectRoot . DIRECTORY_SEPARATOR . 'uploads',
        $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'uploads',
    ];
    $sources = [
        ['module'=>'cccf','label'=>'CCCF Worker','table'=>'cccf_worker_attachments','id'=>'id','url'=>'FileUrl','where'=>'IsDeleted=0'],
        ['module'=>'cccf','label'=>'CCCF Permanent','table'=>'cccf_forma_permanent','id'=>'id','url'=>'FileUrl'],
        ['module'=>'cccf','label'=>'CCCF Permanent signed','table'=>'cccf_forma_permanent','id'=>'id','url'=>'SignedFileUrl'],
        ['module'=>'hiyari','label'=>'Hiyari attachment','table'=>'hiyarireports','id'=>'id','url'=>'AttachmentUrl','where'=>'DeletedAt IS NULL'],
        ['module'=>'hiyari','label'=>'Hiyari signed','table'=>'hiyarireports','id'=>'id','url'=>'SignedFileUrl','where'=>'DeletedAt IS NULL'],
        ['module'=>'contractor','label'=>'Contractor document','table'=>'contractor_documents','id'=>'id','url'=>'FileUrl','where'=>'DeletedAt IS NULL'],
        ['module'=>'contractor','label'=>'Contractor accident','table'=>'contractor_accidentfiles','id'=>'id','url'=>'FileUrl'],
        ['module'=>'accident','label'=>'Accident attachment','table'=>'accident_attachments','id'=>'id','url'=>'FileURL'],
        ['module'=>'forklift','label'=>'Forklift document','table'=>'forklift_license_documents','id'=>'ID','url'=>'FileUrl','where'=>'DeletedAt IS NULL'],
        ['module'=>'forklift','label'=>'Forklift employee photo','table'=>'forklift_employee_photos','id'=>'ID','url'=>'PhotoUrl','where'=>'DeletedAt IS NULL'],
        ['module'=>'forklift','label'=>'Forklift card front','table'=>'forklift_card_template_versions','id'=>'ID','url'=>'FrontImageUrl'],
        ['module'=>'forklift','label'=>'Forklift card back','table'=>'forklift_card_template_versions','id'=>'ID','url'=>'BackImageUrl'],
        ['module'=>'machine-safety','label'=>'Machine Safety file','table'=>'machine_safety_files','id'=>'id','url'=>'FileUrl'],
        ['module'=>'yokoten','label'=>'Yokoten response','table'=>'yokoten_response_files','id'=>'FileID','url'=>'FileURL'],
        ['module'=>'ojt','label'=>'OJT / SCW document','table'=>'scw_documents','id'=>'id','url'=>'FileURL'],
        ['module'=>'johnny','label'=>'Johnny AI knowledge','table'=>'johnny_kb_documents','id'=>'id','url'=>'FileUrl'],
    ];
    $references = [];
    $referencedNames = [];
    $sourceSummary = [];
    foreach ($sources as $source) {
        if (!admin8_column_exists($source['table'], $source['url']) || !admin8_column_exists($source['table'], $source['id'])) {
            $sourceSummary[] = ['module'=>$source['module'],'label'=>$source['label'],'available'=>false,'references'=>0,'missing'=>0];
            continue;
        }
        $table = str_replace('`', '``', $source['table']);
        $id = str_replace('`', '``', $source['id']);
        $url = str_replace('`', '``', $source['url']);
        $where = trim((string)($source['where'] ?? ''));
        $filter = $where !== '' ? "($where) AND" : '';
        $rows = safe_rows("SELECT `$id` record_id,`$url` file_url FROM `$table` WHERE $filter `$url` IS NOT NULL AND TRIM(`$url`)<>''");
        $missing = 0;
        foreach ($rows as $row) {
            $fileUrl = trim((string)($row['file_url'] ?? ''));
            $path = (string)(parse_url($fileUrl, PHP_URL_PATH) ?? '');
            $isLocal = strpos($path, '/uploads/') !== false;
            $name = $isLocal ? basename(rawurldecode($path)) : '';
            $exists = $isLocal && $name !== '' && count(array_filter($uploadDirs, fn($dir)=>is_file($dir . DIRECTORY_SEPARATOR . $name))) > 0;
            if ($name !== '') $referencedNames[strtolower($name)] = true;
            if ($isLocal && !$exists) $missing++;
            $references[] = ['module'=>$source['module'],'source'=>$source['label'],'recordId'=>(string)($row['record_id'] ?? ''),'url'=>$fileUrl,'filename'=>$name,'local'=>$isLocal,'exists'=>$isLocal ? $exists : null];
        }
        $sourceSummary[] = ['module'=>$source['module'],'label'=>$source['label'],'available'=>true,'references'=>count($rows),'missing'=>$missing];
    }
    $diskFileMap = [];
    foreach ($uploadDirs as $uploadDir) {
        if (!is_dir($uploadDir) || !is_readable($uploadDir)) continue;
        foreach (scandir($uploadDir) ?: [] as $name) {
            if ($name === '.' || $name === '..' || !is_file($uploadDir . DIRECTORY_SEPARATOR . $name)) continue;
            $diskFileMap[strtolower($name)] = $name;
        }
    }
    $diskFiles = array_values($diskFileMap);
    $missingReferences = array_values(array_filter($references, fn($item)=>$item['local'] && $item['exists'] === false));
    $orphanFiles = array_values(array_filter($diskFiles, fn($name)=>!isset($referencedNames[strtolower($name)])));
    $directoryExists = count(array_filter($uploadDirs, fn($dir)=>is_dir($dir))) > 0;
    $directoryReadable = count(array_filter($uploadDirs, fn($dir)=>is_dir($dir) && is_readable($dir))) > 0;
    $directoryWritable = count(array_filter($uploadDirs, fn($dir)=>is_dir($dir) && is_writable($dir))) > 0;
    $directoryReady = $directoryExists && $directoryReadable;
    return [
        'phase'=>'storage_file_health','readOnly'=>true,
        'config'=>['publicBaseUrlConfigured'=>trim((string)getenv('PUBLIC_UPLOAD_BASE_URL')) !== '','directoryExists'=>$directoryExists,'directoryReadable'=>$directoryReadable,'directoryWritable'=>$directoryWritable,'storageRootsChecked'=>count($uploadDirs)],
        'status'=>!$directoryReady?'critical':(count($missingReferences)?'warning':'ok'),
        'referencesTotal'=>count($references),'localReferences'=>count(array_filter($references, fn($item)=>$item['local'])),'externalReferences'=>count(array_filter($references, fn($item)=>!$item['local'])),
        'missingFiles'=>count($missingReferences),'orphanFiles'=>count($orphanFiles),'diskFiles'=>count($diskFiles),
        'missingDetails'=>array_slice($missingReferences, 0, 100),'orphanDetails'=>array_slice($orphanFiles, 0, 100),'sources'=>$sourceSummary,
    ];
}

function admin8_security_health(): array
{
    global $config;
    $roles = ['ADMIN','USER','VIEWER','EXECUTIVE','MANAGER','STAFF','SAFETY_OFFICER'];
    $permissions = ['VIEW_DASHBOARD','MANAGE_USERS','VIEW_REPORT','APPROVE_SAFETY','SUBMIT_SAFETY','FOURM_TRAINING_MANAGE','FORKLIFT_VIEW','FORKLIFT_REQUEST','FORKLIFT_APPROVE','FORKLIFT_MANAGE','FORKLIFT_RENEW','FORKLIFT_SUSPEND','FORKLIFT_PRINT','FORKLIFT_EXPORT','FORKLIFT_DOCUMENT_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_SETTINGS_MANAGE','FORKLIFT_AUDIT_VIEW'];
    $expectedEntries = count($roles) * count($permissions);
    $roleList = "'" . implode("','", $roles) . "'";
    $permissionList = "'" . implode("','", $permissions) . "'";
    $matrixEntries = admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_rolepermissions WHERE UPPER(role) IN ($roleList) AND permission IN ($permissionList)"));
    $unknownMatrixEntries = admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_rolepermissions WHERE UPPER(role) NOT IN ($roleList) OR permission NOT IN ($permissionList)"));
    $userOverrides = admin8_number(safe_scalar('SELECT COUNT(*) FROM admin_userpermissions'));
    $orphanOverrides = admin8_number(safe_scalar('SELECT COUNT(*) FROM admin_userpermissions p LEFT JOIN employees e ON e.EmployeeID=p.employee_id WHERE e.EmployeeID IS NULL'));
    $employeeTotal = admin8_number(safe_scalar('SELECT COUNT(*) FROM employees'));
    $adminUsers = admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE UPPER(TRIM(COALESCE(Role,'')))='ADMIN'"));
    $unknownRoles = admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE COALESCE(TRIM(Role),'')<>'' AND UPPER(TRIM(Role)) NOT IN ($roleList)"));
    $missingDepartment = admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE COALESCE(TRIM(Department),'')=''"));
    $unitCondition = admin8_column_exists('employees', 'SafetyUnit')
        ? "COALESCE(NULLIF(TRIM(SafetyUnit),''),NULLIF(TRIM(Unit),''),NULLIF(TRIM(Team),'')) IS NULL"
        : "COALESCE(NULLIF(TRIM(Unit),''),NULLIF(TRIM(Team),'')) IS NULL";
    $missingUnit = admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE $unitCondition"));
    $legacyPasswords = admin8_number(safe_scalar("SELECT COUNT(*) FROM employees WHERE Password IS NULL OR TRIM(Password)=''"));
    $forcedPasswordChange = admin8_column_exists('employees', 'MustChangePassword') ? admin8_number(safe_scalar('SELECT COUNT(*) FROM employees WHERE MustChangePassword=1')) : 0;
    $failedLogins24h = admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs WHERE Action='LOGIN_FAILED' AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)"));
    $passwordChanges24h = admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs WHERE Action='PASSWORD_CHANGED' AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)"));
    $jwtConfigured = trim((string)($config['jwt_secret'] ?? '')) !== '';
    $jwtTtl = (int)($config['jwt_ttl'] ?? 0);
    $matrixMissing = max(0, $expectedEntries - $matrixEntries);
    $findings = [
        ['key'=>'jwt_config','label'=>'JWT signing configuration','count'=>$jwtConfigured?0:1,'severity'=>$jwtConfigured?'ok':'critical'],
        ['key'=>'matrix_incomplete','label'=>'Permission matrix entries not explicit','count'=>$matrixMissing,'severity'=>$matrixMissing?'low':'ok'],
        ['key'=>'unknown_roles','label'=>'Employees with unknown roles','count'=>$unknownRoles,'severity'=>$unknownRoles?'medium':'ok'],
        ['key'=>'orphan_overrides','label'=>'Permission overrides without employee','count'=>$orphanOverrides,'severity'=>$orphanOverrides?'medium':'ok'],
        ['key'=>'missing_department','label'=>'Employees missing department','count'=>$missingDepartment,'severity'=>$missingDepartment?'medium':'ok'],
        ['key'=>'missing_unit','label'=>'Employees missing Unit/Safety Unit','count'=>$missingUnit,'severity'=>$missingUnit?'low':'ok'],
        ['key'=>'legacy_passwords','label'=>'Accounts still using legacy first-login password','count'=>$legacyPasswords,'severity'=>$legacyPasswords?'high':'ok'],
        ['key'=>'failed_logins_24h','label'=>'Failed login attempts in 24h','count'=>$failedLogins24h,'severity'=>$failedLogins24h>=20?'high':($failedLogins24h?'low':'ok')],
    ];
    $high = count(array_filter($findings, fn($item)=>in_array($item['severity'], ['critical','high'], true) && $item['count']));
    $medium = count(array_filter($findings, fn($item)=>$item['severity']==='medium' && $item['count']));
    return [
        'phase'=>'permission_security_health','readOnly'=>true,'status'=>$high?'critical':($medium?'warning':'ok'),'findings'=>$findings,
        'permissionMatrix'=>['roles'=>count($roles),'permissions'=>count($permissions),'expectedEntries'=>$expectedEntries,'explicitEntries'=>$matrixEntries,'missingEntries'=>$matrixMissing,'unknownEntries'=>$unknownMatrixEntries,'userOverrides'=>$userOverrides,'orphanOverrides'=>$orphanOverrides],
        'routeGuards'=>['adminApiMountProtected'=>true,'phpAdminHandlerProtected'=>true,'adminHealthRequiresAdmin'=>true],
        'users'=>['total'=>$employeeTotal,'admins'=>$adminUsers,'unknownRoles'=>$unknownRoles,'missingDepartment'=>$missingDepartment,'missingUnit'=>$missingUnit],
        'auth'=>['jwtConfigured'=>$jwtConfigured,'jwtTtlSeconds'=>$jwtTtl,'passwordMinLength'=>4,'legacyPasswords'=>$legacyPasswords,'mustChangePassword'=>$forcedPasswordChange,'failedLogins24h'=>$failedLogins24h,'passwordChanges24h'=>$passwordChanges24h],
    ];
}

function admin8_version_health(): array
{
    $projectRoot = dirname(__DIR__, 2);
    $cacheBust = '20260702-system-health-ky-safetycore-hotfix-v2';
    $manifestPath = $projectRoot . DIRECTORY_SEPARATOR . 'deploy-manifest.json';
    $manifest = [];
    if (is_file($manifestPath) && is_readable($manifestPath)) {
        $decoded = json_decode((string)file_get_contents($manifestPath), true);
        if (is_array($decoded)) $manifest = $decoded;
    }
    $runtimeFiles = [
        ['key'=>'index','path'=>'index.html'],
        ['key'=>'main','path'=>'public/js/main.js'],
        ['key'=>'admin_ui','path'=>'public/js/pages/admin.js'],
        ['key'=>'php_health','path'=>'api/handlers/admin_phase8.php'],
        ['key'=>'node_health','path'=>'backend/routes/admin.js'],
    ];
    $files = [];
    foreach ($runtimeFiles as $item) {
        $absolute = $projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $item['path']);
        $exists = is_file($absolute) && is_readable($absolute);
        $files[] = ['key'=>$item['key'],'path'=>$item['path'],'exists'=>$exists,'size'=>$exists?(int)filesize($absolute):0,'modifiedAt'=>$exists?date(DATE_ATOM,(int)filemtime($absolute)):null,'sha256'=>$exists?substr(hash_file('sha256',$absolute),0,16):null];
    }
    $phpText = is_file(__FILE__) ? (string)file_get_contents(__FILE__) : '';
    $nodePath = $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'routes' . DIRECTORY_SEPARATOR . 'admin.js';
    $nodeText = is_file($nodePath) ? (string)file_get_contents($nodePath) : '';
    $markers = [
        ['key'=>'module_registry','php'=>strpos($phpText,'admin8_health_registry')!==false,'node'=>strpos($nodeText,'SYSTEM_HEALTH_MODULES')!==false],
        ['key'=>'workflow_rules','php'=>strpos($phpText,'admin8_health_workflow_rules')!==false,'node'=>strpos($nodeText,'buildSystemHealthWorkflowRules')!==false],
        ['key'=>'storage_health','php'=>strpos($phpText,'admin8_storage_health')!==false,'node'=>strpos($nodeText,'buildSystemStorageHealth')!==false],
        ['key'=>'security_health','php'=>strpos($phpText,'admin8_security_health')!==false,'node'=>strpos($nodeText,'buildSystemSecurityHealth')!==false],
        ['key'=>'version_health','php'=>strpos($phpText,'admin8_version_health')!==false,'node'=>strpos($nodeText,'buildSystemVersionHealth')!==false],
        ['key'=>'snapshot_health','php'=>strpos($phpText,'admin8_health_snapshot_history')!==false,'node'=>strpos($nodeText,'getSystemHealthSnapshotHistory')!==false],
    ];
    foreach ($markers as &$marker) $marker['parity'] = $marker['php'] && $marker['node'];
    unset($marker);
    $parityMissing = count(array_filter($markers, fn($marker)=>!$marker['parity']));
    $filesMissing = count(array_filter($files, fn($file)=>!$file['exists']));
    $manifestCacheMatch = (string)($manifest['cacheBust'] ?? '') === $cacheBust;
    $smokePassed = (string)($manifest['lastSmoke']['status'] ?? '') === 'passed';
    $status = ($filesMissing || $parityMissing || !$manifestCacheMatch)?'critical':($smokePassed?'ok':'warning');
    return [
        'phase'=>'deploy_version_health','readOnly'=>true,'status'=>$status,'cacheBust'=>$cacheBust,
        'manifest'=>['available'=>!empty($manifest),'buildId'=>$manifest['buildId']??null,'cacheBust'=>$manifest['cacheBust']??null,'deployedAt'=>$manifest['deployedAt']??null,'runtime'=>$manifest['runtime']??null,'cacheMatch'=>$manifestCacheMatch],
        'lastSmoke'=>$manifest['lastSmoke']??['status'=>'unknown','checkedAt'=>null,'summary'=>'No deploy smoke manifest available'],
        'runtime'=>['active'=>'php','phpVersion'=>PHP_VERSION,'nodeExpected'=>true],
        'files'=>$files,'filesMissing'=>$filesMissing,'parityMarkers'=>$markers,'parityMissing'=>$parityMissing,
    ];
}

function admin8_health_modules(): array
{
    $failedRows = safe_rows("SELECT COALESCE(Module,'') Module,COALESCE(Path,'') Path,COUNT(*) total FROM admin_auditlogs WHERE ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY) AND (StatusCode>=400 OR Action LIKE 'FAILED%') GROUP BY COALESCE(Module,''),COALESCE(Path,'')");
    $failedByKey = [];
    $failedPathsByKey = [];
    foreach ($failedRows as $row) {
        $key = strtolower(str_replace('_', '-', trim((string)($row['Module'] ?? '')) ?: admin8_health_module_from_path((string)($row['Path'] ?? ''))));
        $total = (int)($row['total'] ?? 0);
        $failedByKey[$key] = ($failedByKey[$key] ?? 0) + $total;
        $failedPathsByKey[$key] = $failedPathsByKey[$key] ?? [];
        $failedPathsByKey[$key][] = ['path'=>(string)($row['Path'] ?? '-'),'count'=>$total];
    }
    $modules = [];
    foreach (admin8_health_registry() as $mod) {
        $tables = [];
        foreach ($mod['tables'] ?? [] as $table) {
            $count = admin8_table_count($table);
            $requirement = admin8_health_table_requirement($mod['key'], $table);
            $columns = [];
            foreach (($mod['columns'][$table] ?? []) as $col) {
                $columns[] = ['name'=>$col,'ok'=>$count !== null ? admin8_column_exists($table, $col) : false];
            }
            $tables[] = ['name'=>$table,'requirement'=>$requirement,'count'=>$count,'exists'=>$count !== null,'columns'=>$columns,'missingColumns'=>array_values(array_map(fn($c)=>$c['name'], array_filter($columns, fn($c)=>empty($c['ok']))))];
        }
        $missingTables = array_values(array_map(fn($t)=>$t['name'], array_filter($tables, fn($t)=>empty($t['exists']))));
        $missingRequiredTables = array_values(array_map(fn($t)=>$t['name'], array_filter($tables, fn($t)=>empty($t['exists']) && ($t['requirement'] ?? 'required') === 'required')));
        $missingOptionalTables = array_values(array_map(fn($t)=>$t['name'], array_filter($tables, fn($t)=>empty($t['exists']) && ($t['requirement'] ?? '') === 'optional')));
        $missingBacklogTables = array_values(array_map(fn($t)=>$t['name'], array_filter($tables, fn($t)=>empty($t['exists']) && ($t['requirement'] ?? '') === 'backlog')));
        $missingColumns = [];
        foreach ($tables as $t) foreach ($t['missingColumns'] as $col) $missingColumns[] = $t['name'] . '.' . $col;
        $failed = (int)($failedByKey[$mod['key']] ?? 0);
        $failedPaths = $failedPathsByKey[$mod['key']] ?? [];
        $status = count($missingRequiredTables) ? 'critical' : (count($missingOptionalTables) || count($missingColumns) || $failed ? 'warning' : 'ok');
        $api = array_map(fn($path)=>['path'=>$path,'method'=>'GET','configured'=>true], $mod['api'] ?? []);
        $rootCauses = [];
        foreach ($missingRequiredTables as $table) $rootCauses[] = ['type'=>'missing_table','severity'=>'high','label'=>'Required table missing or unreadable: ' . $table,'detail'=>'This table is required by the active runtime and should exist in production.'];
        foreach ($missingOptionalTables as $table) $rootCauses[] = ['type'=>'missing_optional_table','severity'=>'low','label'=>'Optional table not available: ' . $table,'detail'=>'This supports an optional feature and does not block module readiness.'];
        foreach ($missingBacklogTables as $table) $rootCauses[] = ['type'=>'backlog_table','severity'=>'info','label'=>'Backlog table not available: ' . $table,'detail'=>'This table is tracked for future scope and does not reduce readiness score.'];
        foreach ($missingColumns as $column) $rootCauses[] = ['type'=>'missing_column','severity'=>'high','label'=>'Missing expected column: ' . $column,'detail'=>'The module table exists, but the expected schema column was not found.'];
        foreach ($failedPaths as $item) $rootCauses[] = ['type'=>'failed_api','severity'=>'medium','label'=>'Failed API action: ' . ($item['path'] ?? '-'),'detail'=>(int)($item['count'] ?? 0) . ' failed action(s) in the last 24 hours.'];
        $recommendedActions = [];
        if (count($missingRequiredTables)) $recommendedActions[] = 'ตรวจ migration/table name ของ required table ใน production และยืนยันว่า database user อ่านตารางได้';
        if (count($missingOptionalTables)) $recommendedActions[] = 'ทบทวนว่า optional feature นี้เปิดใช้งานจริงหรือไม่ ก่อนตัดสินใจ deploy table เพิ่ม';
        if (count($missingBacklogTables)) $recommendedActions[] = 'เก็บ backlog table ไว้ใน roadmap โดยไม่ต้องแก้ production readiness รอบนี้';
        if (count($missingColumns)) $recommendedActions[] = 'Apply additive schema migration ล่าสุดของ module นี้ หรือ sync column ให้ตรงกับ runtime';
        if ($failed) $recommendedActions[] = 'เปิด Audit Log ด้วย failed preset แล้วดู request ล่าสุดของ module นี้';
        if (!count($recommendedActions)) $recommendedActions[] = 'ยังไม่พบ root cause สำคัญจาก Phase 4';
        $modules[] = ['key'=>$mod['key'],'label'=>$mod['label'],'group'=>$mod['group'],'nav'=>$mod['nav'],'status'=>$status,'tableCount'=>count($tables),'existingTables'=>count(array_filter($tables, fn($t)=>!empty($t['exists']))),'missingTables'=>$missingTables,'missingRequiredTables'=>$missingRequiredTables,'missingOptionalTables'=>$missingOptionalTables,'missingBacklogTables'=>$missingBacklogTables,'missingColumns'=>$missingColumns,'totalRows'=>array_sum(array_map(fn($t)=>(int)($t['count'] ?? 0), $tables)),'apiCount'=>count($api),'failedApi24h'=>$failed,'failedPaths'=>$failedPaths,'rootCauses'=>$rootCauses,'recommendedActions'=>$recommendedActions,'tables'=>$tables,'api'=>$api];
    }
    return $modules;
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
    $moduleHealth = admin8_health_modules();
    $workflowRules = admin8_health_workflow_rules();
    $storageHealth = admin8_storage_health();
    $securityHealth = admin8_security_health();
    $versionHealth = admin8_version_health();
    $criticalModules = array_values(array_filter($moduleHealth, fn($m)=>($m['status'] ?? '') === 'critical'));
    $warningModules = array_values(array_filter($moduleHealth, fn($m)=>($m['status'] ?? '') === 'warning'));
    $allMissingTables = [];
    $allMissingRequiredTables = [];
    $allMissingOptionalTables = [];
    $allMissingBacklogTables = [];
    $allMissingColumns = [];
    $totalTables = 0;
    $existingTables = 0;
    $apiSurfaces = 0;
    $failedByModule = 0;
    foreach ($moduleHealth as $module) {
        $totalTables += (int)($module['tableCount'] ?? 0);
        $existingTables += (int)($module['existingTables'] ?? 0);
        $apiSurfaces += (int)($module['apiCount'] ?? 0);
        $failedByModule += (int)($module['failedApi24h'] ?? 0);
        foreach ($module['missingTables'] ?? [] as $table) $allMissingTables[] = ($module['label'] ?? $module['key']) . ': ' . $table;
        foreach ($module['missingRequiredTables'] ?? [] as $table) $allMissingRequiredTables[] = ($module['label'] ?? $module['key']) . ': ' . $table;
        foreach ($module['missingOptionalTables'] ?? [] as $table) $allMissingOptionalTables[] = ($module['label'] ?? $module['key']) . ': ' . $table;
        foreach ($module['missingBacklogTables'] ?? [] as $table) $allMissingBacklogTables[] = ($module['label'] ?? $module['key']) . ': ' . $table;
        foreach ($module['missingColumns'] ?? [] as $column) $allMissingColumns[] = ($module['label'] ?? $module['key']) . ': ' . $column;
    }
    $signals = [
        ['key'=>'missing_required_tables','label'=>'Required module tables missing or unreadable','count'=>count($allMissingRequiredTables) ?: count($missing),'severity'=>(count($allMissingRequiredTables) || count($missing))?'high':'ok','detail'=>count($allMissingRequiredTables)?$allMissingRequiredTables:$missing,'penalty'=>12],
        ['key'=>'missing_optional_tables','label'=>'Optional module tables not available','count'=>count($allMissingOptionalTables),'severity'=>count($allMissingOptionalTables)?'low':'ok','detail'=>$allMissingOptionalTables,'penalty'=>1],
        ['key'=>'backlog_tables','label'=>'Backlog tables not yet available','count'=>count($allMissingBacklogTables),'severity'=>count($allMissingBacklogTables)?'info':'ok','detail'=>$allMissingBacklogTables,'penalty'=>0],
        ['key'=>'missing_columns','label'=>'Missing expected schema columns','count'=>count($allMissingColumns),'severity'=>count($allMissingColumns)?'high':'ok','detail'=>$allMissingColumns],
        ['key'=>'module_coverage','label'=>'Modules needing review','count'=>count($criticalModules)+count($warningModules),'severity'=>count($criticalModules)?'high':(count($warningModules)?'medium':'ok'),'detail'=>array_values(array_map(fn($m)=>($m['label'] ?? $m['key']) . ': ' . ($m['status'] ?? 'unknown'), array_filter($moduleHealth, fn($m)=>($m['status'] ?? '') !== 'ok'))),'penalty'=>0],
        ['key'=>'failed_api_24h','label'=>'Failed API actions in last 24h','count'=>$failedByModule ?: $failed,'severity'=>($failedByModule ?: $failed)>=10?'high':(($failedByModule ?: $failed)?'medium':'ok'),'detail'=>[],'penalty'=>($failedByModule ?: $failed)>=10?10:(($failedByModule ?: $failed)?4:0)],
        ['key'=>'employee_master','label'=>'Employee and department master data','count'=>empty($counts['Employees'])||empty($counts['Master_Departments'])?1:0,'severity'=>empty($counts['Employees'])||empty($counts['Master_Departments'])?'high':'ok','detail'=>[],'penalty'=>15],
        ['key'=>'storage_missing_files','label'=>'Upload records with missing local files','count'=>(int)$storageHealth['missingFiles'],'severity'=>$storageHealth['missingFiles']?'medium':'ok','detail'=>array_map(fn($item)=>($item['source'] ?? 'File') . ' #' . ($item['recordId'] ?? '-') . ': ' . ($item['filename'] ?? '-'), $storageHealth['missingDetails']),'penalty'=>$storageHealth['missingFiles']?min(8, 2 + (int)$storageHealth['missingFiles']):0],
        ['key'=>'storage_orphan_files','label'=>'Unreferenced files in upload storage','count'=>(int)$storageHealth['orphanFiles'],'severity'=>$storageHealth['orphanFiles']?'low':'ok','detail'=>array_slice($storageHealth['orphanDetails'],0,20),'penalty'=>0],
        ['key'=>'security_legacy_passwords','label'=>'Accounts still using legacy passwords','count'=>(int)$securityHealth['auth']['legacyPasswords'],'severity'=>$securityHealth['auth']['legacyPasswords']?'high':'ok','detail'=>[],'penalty'=>$securityHealth['auth']['legacyPasswords']?6:0],
        ['key'=>'security_profile_gaps','label'=>'Employee profiles missing department','count'=>(int)$securityHealth['users']['missingDepartment'],'severity'=>$securityHealth['users']['missingDepartment']?'medium':'ok','detail'=>[],'penalty'=>$securityHealth['users']['missingDepartment']?2:0],
        ['key'=>'security_failed_logins','label'=>'Failed login attempts in 24h','count'=>(int)$securityHealth['auth']['failedLogins24h'],'severity'=>$securityHealth['auth']['failedLogins24h']>=20?'high':($securityHealth['auth']['failedLogins24h']?'low':'ok'),'detail'=>[],'penalty'=>$securityHealth['auth']['failedLogins24h']>=20?4:0],
        ['key'=>'deploy_version_drift','label'=>'Deploy manifest/runtime parity needs review','count'=>($versionHealth['status']==='ok'?0:1),'severity'=>$versionHealth['status']==='critical'?'high':($versionHealth['status']==='warning'?'low':'ok'),'detail'=>[],'penalty'=>$versionHealth['status']==='critical'?6:0],
    ];
    foreach ($workflowRules as $rule) {
        $signals[] = ['key'=>$rule['key'],'module'=>$rule['module'],'label'=>$rule['label'],'count'=>$rule['count'],'severity'=>$rule['count']?($rule['severity'] ?? 'medium'):'ok','detail'=>[],'slaDays'=>$rule['slaDays'],'available'=>$rule['available'],'penalty'=>$rule['count']?min((int)$rule['penalty'], 8):0];
    }
    $score=100;
    $scoreBreakdown=[];
    foreach($signals as $signal){
        if(!$signal['count'] || empty($signal['penalty'])) continue;
        $deduction = in_array($signal['key'], ['missing_required_tables','missing_columns'], true)
            ? min(24, min((int)$signal['count'], 2) * (int)$signal['penalty'])
            : (int)$signal['penalty'];
        $score -= $deduction;
        $scoreBreakdown[]=['key'=>$signal['key'],'label'=>$signal['label'],'deduction'=>$deduction];
    }
    $score=max(25,$score);
    return ['coverage'=>['modulesTotal'=>count($moduleHealth),'modulesOk'=>count(array_filter($moduleHealth, fn($m)=>($m['status'] ?? '') === 'ok')),'modulesWarning'=>count($warningModules),'modulesCritical'=>count($criticalModules),'tablesTotal'=>$totalTables,'tablesOk'=>$existingTables,'tablesMissing'=>max(0,$totalTables-$existingTables),'requiredTablesMissing'=>count($allMissingRequiredTables),'optionalTablesMissing'=>count($allMissingOptionalTables),'backlogTablesMissing'=>count($allMissingBacklogTables),'apiSurfacesTotal'=>$apiSurfaces,'failedApiByModule24h'=>$failedByModule,'phases'=>['coverage_map','database_schema_health','api_surface_health','workflow_health','health_rules_tuning','storage_file_health','permission_security_health','deploy_version_health','automation_scheduled_snapshot']],'moduleHealth'=>$moduleHealth,'workflowHealth'=>['rules'=>$workflowRules,'active'=>count(array_filter($workflowRules, fn($r)=>!empty($r['count']))),'phase4Complete'=>false,'phase4Gaps'=>['Patrol missed/unreviewed attendance detail','CCCF target mismatch validation','Contractor pending approval','Safety Culture PPE issue aging']],'storageHealth'=>$storageHealth,'securityHealth'=>$securityHealth,'versionHealth'=>$versionHealth,'apiHealth'=>['surfacesTotal'=>$apiSurfaces,'failed24h'=>$failedByModule ?: $failed,'modulesWithFailures'=>array_values(array_map(fn($m)=>['key'=>$m['key'],'label'=>$m['label'],'failed24h'=>$m['failedApi24h']], array_filter($moduleHealth, fn($m)=>(int)($m['failedApi24h'] ?? 0)>0)))],'modules'=>[
        'employees'=>['total'=>$counts['Employees'],'depts'=>$counts['Master_Departments'],'teams'=>$counts['Master_Teams']],
        'patrol'=>['sessions'=>$counts['Patrol_Sessions'],'issues'=>$counts['Patrol_Issues']], 'hiyari'=>['total'=>$counts['HiyariReports'],'open'=>safe_scalar("SELECT COUNT(*) FROM hiyarireports WHERE DeletedAt IS NULL AND Status!='Closed'")],
        'ky'=>['total'=>$counts['KY_Activities']], 'fourm'=>['total'=>$counts['FourM_ChangeNotices'],'open'=>safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Open'"),'manRecords'=>$counts['FourM_ManRecords']],
        'contractor'=>['docs'=>$counts['Contractor_Documents']], 'ojt'=>['docs'=>$counts['SCW_Documents']], 'yokoten'=>['topics'=>$counts['YokotenTopics']],
    ],'alerts'=>['staleChangeNotices'=>$staleNotices,'staleHiyari'=>$staleHiyari],'audit'=>['total'=>$counts['Admin_AuditLogs'],'last24h'=>safe_scalar('SELECT COUNT(*) FROM admin_auditlogs WHERE ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)'),'failed24h'=>$failed],'readiness'=>['score'=>$score,'status'=>$score>=90?'Ready':($score>=70?'Monitor':'Action Needed'),'signals'=>$signals,'scoreFloor'=>25,'scoreBreakdown'=>$scoreBreakdown,'missingTables'=>$missing],'snapshotHealth'=>admin8_health_snapshot_history(48)];
}

function admin8_health_snapshot_summary(array $health): array
{
    $readiness = $health['readiness'] ?? [];
    $coverage = $health['coverage'] ?? [];
    $apiHealth = $health['apiHealth'] ?? [];
    $version = $health['versionHealth'] ?? [];
    $manifest = $version['manifest'] ?? [];
    return [
        'buildId'=>(string)($manifest['buildId'] ?? ''),
        'cacheBust'=>(string)($manifest['cacheBust'] ?? ($version['cacheBust'] ?? '')),
        'readinessScore'=>(int)($readiness['score'] ?? 0),
        'readinessStatus'=>(string)($readiness['status'] ?? 'Unknown'),
        'criticalModules'=>(int)($coverage['modulesCritical'] ?? 0),
        'warningModules'=>(int)($coverage['modulesWarning'] ?? 0),
        'okModules'=>(int)($coverage['modulesOk'] ?? 0),
        'failedApi24h'=>(int)($apiHealth['failed24h'] ?? ($coverage['failedApiByModule24h'] ?? 0)),
        'storageStatus'=>(string)($health['storageHealth']['status'] ?? 'unknown'),
        'securityStatus'=>(string)($health['securityHealth']['status'] ?? 'unknown'),
        'versionStatus'=>(string)($version['status'] ?? 'unknown'),
    ];
}

function admin8_health_snapshot_history(int $limit = 48): array
{
    try {
        $limit = max(1, min(240, $limit));
        $rows = db_rows("SELECT id,SnapshotAt,Source,BuildId,CacheBust,ReadinessScore,ReadinessStatus,CriticalModules,WarningModules,OkModules,FailedApi24h,StorageStatus,SecurityStatus,VersionStatus,CreatedBy FROM system_health_snapshots ORDER BY SnapshotAt DESC LIMIT $limit");
        $latest = $rows[0] ?? null;
        $previous = $rows[1] ?? null;
        return [
            'phase'=>'automation_scheduled_snapshot',
            'readOnly'=>true,
            'latest'=>$latest,
            'previous'=>$previous,
            'trend'=>[
                'scoreDelta'=>$latest && $previous ? (int)$latest['ReadinessScore'] - (int)$previous['ReadinessScore'] : 0,
                'criticalDelta'=>$latest && $previous ? (int)$latest['CriticalModules'] - (int)$previous['CriticalModules'] : 0,
                'failedApiDelta'=>$latest && $previous ? (int)$latest['FailedApi24h'] - (int)$previous['FailedApi24h'] : 0,
            ],
            'rows'=>$rows,
        ];
    } catch (Throwable $error) {
        return ['phase'=>'automation_scheduled_snapshot','readOnly'=>true,'error'=>$error->getMessage(),'rows'=>[]];
    }
}

function admin8_store_health_snapshot(array $health, array $user, string $source = 'manual'): array
{
    $summary = admin8_health_snapshot_summary($health);
    $payload = json_encode([
        'coverage'=>$health['coverage'] ?? [],
        'readiness'=>$health['readiness'] ?? [],
        'apiHealth'=>$health['apiHealth'] ?? [],
        'workflowHealth'=>$health['workflowHealth'] ?? [],
        'storageHealth'=>$health['storageHealth'] ?? [],
        'securityHealth'=>$health['securityHealth'] ?? [],
        'versionHealth'=>$health['versionHealth'] ?? [],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    db_execute('INSERT INTO system_health_snapshots(Source,BuildId,CacheBust,ReadinessScore,ReadinessStatus,CriticalModules,WarningModules,OkModules,FailedApi24h,StorageStatus,SecurityStatus,VersionStatus,PayloadJson,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        substr($source ?: 'manual', 0, 40),
        $summary['buildId'],
        $summary['cacheBust'],
        $summary['readinessScore'],
        $summary['readinessStatus'],
        $summary['criticalModules'],
        $summary['warningModules'],
        $summary['okModules'],
        $summary['failedApi24h'],
        $summary['storageStatus'],
        $summary['securityStatus'],
        $summary['versionStatus'],
        $payload,
        (string)($user['id'] ?? $user['EmployeeID'] ?? $user['name'] ?? 'admin'),
    ]);
    $summary['id'] = (int)db()->lastInsertId();
    return $summary;
}

function admin8_safety_year($value): int
{
    $year = (int) $value;
    if ($year < 2000 || $year > 2100) $year = (int) date('Y');
    return max(2000, min(2100, $year));
}

function admin8_safety_month($value): int
{
    $month = (int) $value;
    if ($month < 1 || $month > 12) $month = (int) date('n');
    return max(1, min(12, $month));
}

function admin8_safety_month_label(int $month): string
{
    $labels = [1=>'Jan',2=>'Feb',3=>'Mar',4=>'Apr',5=>'May',6=>'Jun',7=>'Jul',8=>'Aug',9=>'Sep',10=>'Oct',11=>'Nov',12=>'Dec'];
    return $labels[$month] ?? '';
}

function admin8_safety_count_map(array $rows, string $key = 'EmployeeID', string $count = 'count'): array
{
    $map = [];
    foreach ($rows as $row) {
        $id = trim((string) ($row[$key] ?? ''));
        if ($id === '') continue;
        $map[$id] = (int) ($row[$count] ?? 0);
    }
    return $map;
}

function admin8_safety_normalize_lookup($value): string
{
    return trim((string) preg_replace('/\s+/u', ' ', (string) ($value ?? '')));
}

function admin8_parse_ky_participants($raw): array
{
    if (is_array($raw)) return $raw;
    $text = trim((string) ($raw ?? ''));
    if ($text === '') return [];
    $decoded = json_decode($text, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        if (is_array($decoded)) {
            $isList = $decoded === [] || array_keys($decoded) === range(0, count($decoded) - 1);
            return $isList ? $decoded : [$decoded];
        }
    }
    return array_values(array_filter(array_map('trim', preg_split('/[,;\n]+/', $text) ?: [])));
}

function admin8_safety_ky_coverage_key(array $row, int $fallbackIndex): string
{
    $date = trim((string) ($row['ActivityDate'] ?? ''));
    if (preg_match('/^(\d{4})-(\d{2})/', $date, $match)) {
        return $match[1] . '-' . $match[2];
    }
    $activityId = trim((string) ($row['id'] ?? $row['ID'] ?? $row['ActivityID'] ?? ''));
    return $activityId !== '' ? $activityId : 'ky-' . $fallbackIndex;
}

function admin8_safety_ky_count_map(array $rows, array $employees): array
{
    $rosterIds = [];
    $employeeIdByName = [];
    $employeeIdsByDepartmentUnit = [];
    $employeeIdsByDepartment = [];
    $employeeIdsWithoutUnitByDepartment = [];
    $addIndex = static function (&$map, $key, $employeeId): void {
        $normalizedKey = admin8_safety_normalize_lookup($key);
        $id = admin8_safety_normalize_lookup($employeeId);
        if ($normalizedKey === '' || $id === '') return;
        if (!isset($map[$normalizedKey])) $map[$normalizedKey] = [];
        $map[$normalizedKey][] = $id;
    };
    foreach ($employees as $emp) {
        $id = admin8_safety_normalize_lookup($emp['EmployeeID'] ?? '');
        $name = admin8_safety_normalize_lookup($emp['EmployeeName'] ?? '');
        $department = admin8_safety_normalize_lookup($emp['Department'] ?? '');
        $unit = admin8_safety_normalize_lookup($emp['Unit'] ?? '');
        if ($id !== '') $rosterIds[$id] = true;
        if ($id !== '' && $name !== '') $employeeIdByName[$name] = $id;
        if ($department !== '' && $unit !== '') {
            $addIndex($employeeIdsByDepartmentUnit, $department . "\x1F" . $unit, $id);
        }
        if ($department !== '' && $unit === '') {
            $addIndex($employeeIdsWithoutUnitByDepartment, $department, $id);
        }
        $addIndex($employeeIdsByDepartment, $department, $id);
    }

    $coverageByEmployee = [];
    $add = static function ($employeeId, string $coverageKey) use (&$coverageByEmployee, $rosterIds): void {
        $id = admin8_safety_normalize_lookup($employeeId);
        if ($id === '' || ($rosterIds && !isset($rosterIds[$id]))) return;
        if (!isset($coverageByEmployee[$id])) $coverageByEmployee[$id] = [];
        $coverageByEmployee[$id][$coverageKey] = true;
    };
    $resolveParticipant = static function ($participant) use ($rosterIds, $employeeIdByName): string {
        if (is_array($participant)) {
            $directId = admin8_safety_normalize_lookup(
                $participant['EmployeeID'] ?? $participant['employeeId'] ?? $participant['empId'] ?? $participant['id'] ?? $participant['code'] ?? ''
            );
            if ($directId !== '') return $directId;
            $name = admin8_safety_normalize_lookup(
                $participant['EmployeeName'] ?? $participant['employeeName'] ?? $participant['name'] ?? $participant['Name'] ?? ''
            );
            return $employeeIdByName[$name] ?? '';
        }
        $text = admin8_safety_normalize_lookup($participant);
        if ($text === '') return '';
        if (isset($rosterIds[$text])) return $text;
        if (preg_match('/\(([^()]+)\)\s*$/u', $text, $match)) {
            $parenId = admin8_safety_normalize_lookup($match[1] ?? '');
            if ($parenId !== '' && isset($rosterIds[$parenId])) return $parenId;
        }
        return $employeeIdByName[$text] ?? '';
    };

    foreach ($rows as $index => $row) {
        $coverageKey = admin8_safety_ky_coverage_key($row, $index + 1);
        $add($row['ReporterID'] ?? '', $coverageKey);
        $add($row['SubmittedByID'] ?? '', $coverageKey);
        foreach (admin8_parse_ky_participants($row['Participants'] ?? '') as $participant) {
            $add($resolveParticipant($participant), $coverageKey);
        }
        $unit = admin8_safety_normalize_lookup($row['SafetyUnit'] ?? ($row['Unit'] ?? ''));
        $department = admin8_safety_normalize_lookup($row['Department'] ?? '');
        $scopeIds = $unit !== ''
            ? array_merge(
                $employeeIdsByDepartmentUnit[$department . "\x1F" . $unit] ?? [],
                $employeeIdsWithoutUnitByDepartment[$department] ?? []
            )
            : ($employeeIdsByDepartment[$department] ?? []);
        foreach ($scopeIds as $employeeId) $add($employeeId, $coverageKey);
    }

    $map = [];
    foreach ($coverageByEmployee as $employeeId => $coverageKeys) {
        $map[$employeeId] = count($coverageKeys);
    }
    return $map;
}

function admin8_safety_record($actual, $target, string $unitText = 'เรื่อง/ปี'): string
{
    $target = (int) $target;
    if ($target <= 0) return 'N/A';
    return ((int) $actual) . '/' . $target . ' (' . $unitText . ')';
}

function admin8_safety_patrol_record($actual, $requiredToDate, $yearlyTarget): string
{
    $target = (int) $yearlyTarget;
    if ($target <= 0) return 'N/A';
    return ((int) $actual) . '/' . ((int) $requiredToDate) . ' (' . $target . ') ครั้ง';
}

function admin8_safety_patrol_record_map(array $employees, int $year): array
{
    $ids = [];
    foreach ($employees as $emp) {
        $id = trim((string) ($emp['EmployeeID'] ?? ''));
        if ($id !== '' && !in_array($id, $ids, true)) $ids[] = $id;
    }
    if (!$ids) return [];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $rosterRows = safe_rows(
        "SELECT EmployeeID,RosterGroup,TargetPerYear
         FROM patrol_roster
         WHERE EmployeeID IN ($placeholders)
         ORDER BY CASE WHEN RosterGroup='top_management' THEN 0 ELSE 1 END",
        $ids
    );
    $rosterByEmployee = [];
    foreach ($rosterRows as $row) {
        $id = trim((string) ($row['EmployeeID'] ?? ''));
        if ($id !== '' && !isset($rosterByEmployee[$id])) $rosterByEmployee[$id] = $row;
    }

    $map = [];
    foreach ($rosterByEmployee as $employeeId => $roster) {
        $group = (string) ($roster['RosterGroup'] ?? '');
        try {
            if ($group === 'top_management' && function_exists('patrol_attendance_detail_top')) {
                $detail = patrol_attendance_detail_top($employeeId, $year);
            } elseif ($group === 'supervisor' && function_exists('patrol_attendance_detail_supervisor')) {
                $detail = patrol_attendance_detail_supervisor($employeeId, $year, true);
            } else {
                continue;
            }
            $summary = $detail['summary'] ?? [];
            $rosterDetail = $detail['roster'] ?? [];
            $requiredToDate = (int) ($summary['requiredToDate'] ?? 0);
            $accepted = (int) ($summary['acceptedCoverageToDate'] ?? ($summary['checkedToDate'] ?? ($summary['completedScheduled'] ?? ($summary['completedToDateCapped'] ?? 0))));
            $map[$employeeId] = [
                'accepted' => $accepted,
                'requiredToDate' => $requiredToDate,
                'yearlyTarget' => (int) ($rosterDetail['TargetPerYear'] ?? ($summary['yearlyTarget'] ?? ($roster['TargetPerYear'] ?? 0))),
            ];
        } catch (Throwable $e) {
            // Keep Safety Core Data resilient; rows without schedulable Patrol detail fall back to the configured target view.
        }
    }
    return $map;
}

function admin8_safety_activity_defs(): array
{
    return [
        'patrol' => ['unitLabel' => 'ครั้ง', 'metricType' => 'fixed_count'],
        'patrol_issue' => ['unitLabel' => '%', 'metricType' => 'dynamic_ratio'],
        'cccf_worker' => ['unitLabel' => 'คน', 'metricType' => 'people_coverage'],
        'cccf_permanent' => ['unitLabel' => 'คน', 'metricType' => 'people_coverage'],
        'hiyari' => ['unitLabel' => 'คน', 'metricType' => 'people_coverage'],
        'ky' => ['unitLabel' => 'เรื่อง', 'metricType' => 'fixed_count'],
    ];
}

function admin8_safety_effective_targets(string $employeeId, int $year): array
{
    // Use the same year-aware merge as the Activity Targets tab. This keeps the
    // precedence employee > department/unit > position while retaining legacy fallback.
    $merged = merged_activity_targets($employeeId, $year);
    $templateMap = $merged['templateMap'] ?? [];
    $scopeMap = $merged['scopeMap'] ?? [];
    $overrideMap = $merged['overrideMap'] ?? [];
    $department = trim((string) ($merged['department'] ?? ''));
    $unit = trim((string) ($merged['unit'] ?? ''));
    return [
        'employeeId' => $employeeId,
        'department' => $department,
        'unit' => $unit,
        'target' => static fn(string $key) => $overrideMap[$key] ?? $scopeMap[$key] ?? $templateMap[$key] ?? null,
        'template' => static fn(string $key) => $templateMap[$key] ?? null,
    ];
}

function admin8_safety_target_record($actual, ?array $targetRow, string $activityKey): string
{
    $defs = admin8_safety_activity_defs();
    if (!$targetRow || (int) ($targetRow['IsNA'] ?? 0) === 1) return 'N/A';
    $target = (int) ($targetRow['YearlyTarget'] ?? 0);
    if ($target <= 0) return 'N/A';
    $unit = $activityKey === 'ky' ? 'เดือน' : (string) ($defs[$activityKey]['unitLabel'] ?? 'target');
    return ((int) $actual) . '/' . $target . ' (' . $unit . ')';
}

function admin8_safety_cccf_worker_record(?array $progressEmployee): string
{
    if (!$progressEmployee) return 'N/A';
    $target = (int) ($progressEmployee['target'] ?? 0);
    if ($target <= 0) return 'N/A';
    return ((int) ($progressEmployee['actualTowardTarget'] ?? 0)) . '/' . $target . ' (คน)';
}

function admin8_safety_patrol_issue_ratio(string $department, int $year): array
{
    if ($department === '') return ['numerator' => 0, 'denominator' => 0, 'noData' => true];
    $row = db_row(
        "SELECT COUNT(*) AS denominator,
                SUM(CASE WHEN CurrentStatus='Closed' THEN 1 ELSE 0 END) AS numerator
         FROM patrol_issues
         WHERE TRIM(COALESCE(ResponsibleDept,''))=? AND YEAR(DateFound)=?",
        [$department, $year]
    ) ?: [];
    $denominator = (int) ($row['denominator'] ?? 0);
    return [
        'numerator' => (int) ($row['numerator'] ?? 0),
        'denominator' => $denominator,
        'noData' => $denominator <= 0,
    ];
}

function admin8_safety_ratio_record(array $ratio, ?array $targetRow): string
{
    if (!$targetRow || (int) ($targetRow['IsNA'] ?? 0) === 1) return 'N/A';
    if (($ratio['noData'] ?? true) || (int) ($ratio['denominator'] ?? 0) <= 0) return 'N/A';
    $pct = array_key_exists('completionPct', $ratio) && $ratio['completionPct'] !== null
        ? (int) round((float) $ratio['completionPct'])
        : (int) round(((float) ($ratio['numerator'] ?? 0)) * 100 / max(1, (int) ($ratio['denominator'] ?? 0)));
    return max(0, min(100, $pct)) . '%';
}

function admin8_safety_department_ratio_record(array $ratio, ?array $departmentTargetRow = null): string
{
    if ($departmentTargetRow && (int) ($departmentTargetRow['IsNA'] ?? 0) === 1) return 'N/A';
    if ((int) ($ratio['denominator'] ?? 0) <= 0) return 'No Issue';
    $pct = array_key_exists('completionPct', $ratio) && $ratio['completionPct'] !== null
        ? (int) round((float) $ratio['completionPct'])
        : (int) round(((float) ($ratio['numerator'] ?? 0)) * 100 / max(1, (int) ($ratio['denominator'] ?? 0)));
    return max(0, min(100, $pct)) . '%';
}

function admin8_safety_linked_cccf_worker_record(?array $progressEmployee, ?array $targetRow): string
{
    if (!$targetRow || (int) ($targetRow['IsNA'] ?? 0) === 1) return 'N/A';
    $target = (int) ($targetRow['YearlyTarget'] ?? 0);
    if ($target <= 0) return 'N/A';
    $actual = (int) ($progressEmployee['rawRecords'] ?? ($progressEmployee['actualTowardTarget'] ?? 0));
    return min(max(0, $actual), $target) . '/' . $target . ' (' . (admin8_safety_activity_defs()['cccf_worker']['unitLabel'] ?? 'target') . ')';
}

function admin8_dashboard_config(): array
{
    $default = ['cccfWorkerSource' => 'manual_unit_target'];
    try {
        $row = db_row("SELECT ConfigValue FROM dashboard_config WHERE ConfigKey='enterprise' LIMIT 1");
        $value = $row ? json_decode((string) ($row['ConfigValue'] ?? '{}'), true) : [];
        return array_merge($default, is_array($value) ? $value : []);
    } catch (Throwable $error) {
        return $default;
    }
}

function admin8_safety_cccf_worker_unit_map(int $year): array
{
    $source = (admin8_dashboard_config()['cccfWorkerSource'] ?? 'manual_unit_target') === 'actual_department_worker'
        ? 'actual_department_worker'
        : 'manual_unit_target';
    $rows = safe_rows(
        "SELECT TRIM(t.unit_name) AS UnitName,
                t.yearly_target,
                t.achieved_override,
                COALESCE(w.computed_achieved,0) AS computed_achieved
           FROM cccf_unit_targets t
           LEFT JOIN (
               SELECT TRIM(SafetyUnit) AS UnitName, COUNT(*) AS computed_achieved
                 FROM cccf_forma_worker
                WHERE YEAR(SubmitDate)=?
                GROUP BY TRIM(SafetyUnit)
           ) w ON TRIM(w.UnitName)=TRIM(t.unit_name)
          WHERE t.target_year=?",
        [$year, $year]
    );
    $map = [];
    foreach ($rows as $row) {
        $unit = trim((string) ($row['UnitName'] ?? ''));
        if ($unit === '') continue;
        $target = max(0, (int) ($row['yearly_target'] ?? 0));
        if ($target <= 0) continue;
        $override = $row['achieved_override'] ?? null;
        $computed = max(0, (int) ($row['computed_achieved'] ?? 0));
        $achieved = $source === 'actual_department_worker'
            ? $computed
            : (($override !== null && $override !== '') ? max(0, (int) $override) : $computed);
        $map[$unit] = [
            'target' => $target,
            'achieved' => $achieved,
            'computed' => $computed,
            'source' => $source,
        ];
    }
    return $map;
}

function admin8_safety_cccf_worker_unit_record(string $unit, array $unitMap): string
{
    $unit = trim($unit);
    if ($unit === '' || !isset($unitMap[$unit])) return 'N/A';
    $row = $unitMap[$unit];
    $target = (int) ($row['target'] ?? 0);
    if ($target <= 0) return 'N/A';
    return max(0, (int) ($row['achieved'] ?? 0)) . '/' . $target . ' (' . (admin8_safety_activity_defs()['cccf_worker']['unitLabel'] ?? 'target') . ')';
}

function admin8_safety_department_scope_targets(string $activityKey, int $year): array
{
    $year = max(2000, min(2100, $year));
    $map = [];
    foreach (safe_rows(
        "SELECT Department,Unit,ActivityKey,YearlyTarget,PassPct,IsNA
           FROM activity_scope_overrides
          WHERE ActivityKey=? AND TRIM(COALESCE(Unit,''))=''",
        [$activityKey]
    ) as $row) {
        $dept = trim((string) ($row['Department'] ?? ''));
        if ($dept !== '') {
            $row['source'] = 'scope';
            $row['targetYear'] = null;
            $map[$dept] = $row;
        }
    }
    foreach (safe_rows(
        "SELECT Department,Unit,ActivityKey,YearlyTarget,PassPct,IsNA,TargetYear
           FROM activity_scope_override_years
          WHERE ActivityKey=? AND TRIM(COALESCE(Unit,''))='' AND TargetYear IN (?,0)
          ORDER BY CASE WHEN TargetYear=? THEN 0 ELSE 1 END",
        [$activityKey, $year, $year]
    ) as $row) {
        $dept = trim((string) ($row['Department'] ?? ''));
        if ($dept !== '' && (!isset($map[$dept]) || (int) ($row['TargetYear'] ?? 0) === $year)) {
            $row['source'] = 'scope';
            $row['targetYear'] = (int) ($row['TargetYear'] ?? 0);
            $map[$dept] = $row;
        }
    }
    return $map;
}

function admin8_safety_export_roster(): array
{
    return safe_rows('SELECT r.id AS RosterID,r.EmployeeID,r.SortOrder,e.EmployeeName,e.Department,e.Unit,e.Position
        FROM safety_core_export_roster r
        INNER JOIN employees e ON e.EmployeeID=r.EmployeeID
        WHERE r.IsActive=1
        ORDER BY r.SortOrder ASC,e.EmployeeName ASC');
}

function admin8_safety_core_data(int $year, int $month): array
{
    $employees = admin8_safety_export_roster();
    $patrolRows = safe_rows("SELECT EmployeeID,SUM(count) AS count FROM (
        SELECT UserID AS EmployeeID,COUNT(*) AS count FROM patrol_attendance WHERE YEAR(PatrolDate)=? GROUP BY UserID
        UNION ALL
        SELECT EmployeeID,COUNT(*) AS count FROM patrol_self_checkin WHERE Year=? GROUP BY EmployeeID
    ) x GROUP BY EmployeeID", [$year, $year]);
    $hiyariRows = safe_rows('SELECT ReporterID AS EmployeeID,COUNT(*) AS count FROM hiyarireports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=? GROUP BY ReporterID', [$year]);
    $kyRows = safe_rows('SELECT id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,Participants FROM ky_activities WHERE YEAR(ActivityDate)=?', [$year]);
    $cccfWorkerProgress = cccf_worker_progress_data($year);
    $cccfPermanentRows = safe_rows("SELECT AssigneeID AS EmployeeID,COUNT(*) AS count FROM cccf_forma_permanent WHERE AssigneeID IS NOT NULL AND AssigneeID<>'' AND YEAR(SubmitDate)=? GROUP BY AssigneeID", [$year]);

    $patrolMap = admin8_safety_count_map($patrolRows);
    $patrolRecordMap = admin8_safety_patrol_record_map($employees, $year);
    $hiyariMap = admin8_safety_count_map($hiyariRows);
    $kyMap = admin8_safety_ky_count_map($kyRows, $employees);
    $cccfWorkerProgressMap = [];
    foreach (($cccfWorkerProgress['employees'] ?? []) as $progressRow) {
        $cccfWorkerProgressMap[trim((string) ($progressRow['employeeId'] ?? ''))] = $progressRow;
    }
    $cccfWorkerUnitMap = admin8_safety_cccf_worker_unit_map($year);
    $cccfPermanentMap = admin8_safety_count_map($cccfPermanentRows);
    $patrolIssueDepartmentTargets = admin8_safety_department_scope_targets('patrol_issue', $year);

    $rows = [];
    foreach ($employees as $emp) {
        $employeeId = trim((string) ($emp['EmployeeID'] ?? ''));
        $targets = admin8_safety_effective_targets($employeeId, $year);
        $target = $targets['target'];
        $hiyariCount = $hiyariMap[$employeeId] ?? 0;
        $kyCount = $kyMap[$employeeId] ?? 0;
        $cccfPermanentCount = $cccfPermanentMap[$employeeId] ?? 0;
        $cccfWorkerProgressRow = $cccfWorkerProgressMap[$employeeId] ?? null;
        $cccfWorkerUnit = trim((string) (($cccfWorkerProgressRow['unit'] ?? '') ?: ($emp['Unit'] ?? '')));
        $patrolIssueDepartment = trim((string) (($targets['department'] ?? '') ?: ($emp['Department'] ?? '')));
        $patrolIssueRatio = admin8_safety_patrol_issue_ratio($patrolIssueDepartment, $year);
        $patrolIssueTarget = $patrolIssueDepartmentTargets[$patrolIssueDepartment] ?? null;

        $rows[] = [
            'RosterID' => $emp['RosterID'] ?? null,
            'SortOrder' => (int) ($emp['SortOrder'] ?? 999),
            'EmployeeID' => $employeeId,
            'EmployeeName' => (string) (($emp['EmployeeName'] ?? '') ?: $employeeId),
            'Department' => (string) (($emp['Department'] ?? '') ?: 'N/A'),
            'Position' => (string) (($emp['Position'] ?? '') ?: 'N/A'),
            'SafetyPatrolRecord' => (function () use ($patrolRecordMap, $employeeId, $target, $patrolMap) {
                $targetRow = $target('patrol');
                if (isset($patrolRecordMap[$employeeId])) {
                    $metric = $patrolRecordMap[$employeeId];
                    $yearlyTarget = (int) ($targetRow['YearlyTarget'] ?? ($metric['yearlyTarget'] ?? 0));
                    return admin8_safety_patrol_record($metric['accepted'] ?? 0, $metric['requiredToDate'] ?? 0, $yearlyTarget);
                }
                return admin8_safety_target_record($patrolMap[$employeeId] ?? 0, $targetRow, 'patrol');
            })(),
            'HiyariHatto' => admin8_safety_target_record($hiyariCount, $target('hiyari'), 'hiyari'),
            'KYAbility' => admin8_safety_target_record($kyCount, $target('ky'), 'ky'),
            'CCCFPermanent' => admin8_safety_target_record($cccfPermanentCount, $target('cccf_permanent'), 'cccf_permanent'),
            'CCCFFormA' => admin8_safety_cccf_worker_unit_record($cccfWorkerUnit, $cccfWorkerUnitMap),
            'PatrolSystem' => admin8_safety_department_ratio_record($patrolIssueRatio, $patrolIssueTarget),
            'Status' => admin8_safety_month_label($month),
        ];
    }

    return [
        'year' => $year,
        'month' => $month,
        'statusLabel' => admin8_safety_month_label($month),
        'summary' => [
            'employees' => count($rows),
            'patrolScoped' => count(array_filter($rows, static fn($row) => $row['SafetyPatrolRecord'] !== 'N/A')),
            'hiyariScoped' => count(array_filter($rows, static fn($row) => $row['HiyariHatto'] !== 'N/A')),
            'cccfPermanentScoped' => count(array_filter($rows, static fn($row) => $row['CCCFPermanent'] !== 'N/A')),
        ],
        'rows' => $rows,
    ];
}

function admin8_parse_safety_roster_employee_ids(array $body): array
{
    $values = [];
    if (isset($body['EmployeeIDs']) && is_array($body['EmployeeIDs'])) {
        foreach ($body['EmployeeIDs'] as $value) $values[] = $value;
    }
    if (array_key_exists('EmployeeID', $body)) $values[] = $body['EmployeeID'];
    $ids = [];
    foreach ($values as $value) {
        foreach (preg_split('/[\s,;]+/', (string) $value) ?: [] as $part) {
            $id = trim($part);
            if ($id !== '' && !in_array($id, $ids, true)) $ids[] = $id;
        }
    }
    return $ids;
}

function handle_admin_phase8_routes(string $method, string $path): bool
{
    if (strpos($path, '/admin/') !== 0) return false;
    $user = require_admin();
    if ($method !== 'GET') admin8_ensure_schema();

    if ($method === 'GET' && $path === '/admin/registration-requests') {
        $status = trim((string)($_GET['status'] ?? 'all'));
        $department = trim((string)($_GET['department'] ?? ''));
        $dateFrom = admin8_registration_date_filter($_GET['dateFrom'] ?? '');
        $dateTo = admin8_registration_date_filter($_GET['dateTo'] ?? '');
        $q = mb_substr(trim((string)($_GET['q'] ?? '')), 0, 100);
        $allowed = ['Pending','Approved','Rejected','Cancelled'];
        if ($dateFrom === null || $dateTo === null || ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo)) {
            json_response(['success'=>false,'message'=>'Invalid registration date range.'],400);
        }
        $where = ' WHERE 1=1'; $params = [];
        if ($status !== 'all') {
            if (!in_array($status,$allowed,true)) json_response(['success'=>false,'message'=>'Invalid registration status.'],400);
            $where .= ' AND Status=?'; $params[] = $status;
        }
        if ($department !== '') { $where .= ' AND Department=?'; $params[] = $department; }
        if ($dateFrom !== '') { $where .= ' AND SubmittedAt>=?'; $params[] = $dateFrom.' 00:00:00'; }
        if ($dateTo !== '') { $where .= ' AND SubmittedAt<=?'; $params[] = $dateTo.' 23:59:59'; }
        if ($q !== '') {
            $like = '%'.$q.'%';
            $where .= ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR ReferenceCode LIKE ? OR CompanyEmail LIKE ?)';
            array_push($params,$like,$like,$like,$like);
        }
        $rows = db_rows("SELECT ID,ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail,Status,RejectionReason,SubmittedAt,UpdatedAt,ReviewedAt,ReviewedBy,StatusViewedAt,StatusViewCount FROM registration_requests$where ORDER BY (Status='Pending') DESC,SubmittedAt DESC,ID DESC LIMIT 500",$params);
        $summary = db_row("SELECT COUNT(*) total,SUM(Status='Pending') pending,SUM(Status='Approved') approved,SUM(Status='Rejected') rejected,SUM(Status='Cancelled') cancelled,SUM(Status='Pending' AND SubmittedAt<DATE_SUB(NOW(),INTERVAL 3 DAY)) stalePending,ROUND(AVG(CASE WHEN ReviewedAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE,SubmittedAt,ReviewedAt)/60 END),2) averageReviewHours,SUM(EmployeeName IS NULL OR TRIM(EmployeeName)='' OR Department IS NULL OR TRIM(Department)='' OR Position IS NULL OR TRIM(Position)='') incompleteMaster,SUM(SubmittedAt>=DATE_SUB(NOW(),INTERVAL 1 DAY)) newLast24h FROM registration_requests") ?: [];
        $failed = db_row("SELECT COUNT(*) failed24h,COUNT(DISTINCT TargetID) distinctEmployees24h FROM admin_auditlogs WHERE Module='auth' AND StatusCode>=400 AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)") ?: [];
        $summary['failedAttempts24h']=(int)($failed['failed24h']??0);
        $summary['failedEmployees24h']=(int)($failed['distinctEmployees24h']??0);
        $summary['smtpConfigured']=mailer_smtp_configured();
        $summary['cleanupPolicy']=['processedRequestRetentionDays'=>365,'failedAttemptRetentionDays'=>90,'automaticDelete'=>false];
        json_response(['success'=>true,'data'=>$rows,'summary'=>$summary]);
    }
    $registrationApprove = route_params($path,'/admin/registration-requests/:id/approve');
    if ($registrationApprove !== null && $method === 'POST') {
        $requestId = admin8_registration_request_id($registrationApprove['id']);
        if ($requestId === null) json_response(['success'=>false,'message'=>'Invalid registration request ID.'],400);
        ensure_auth_security_schema();
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('SELECT * FROM registration_requests WHERE ID=? FOR UPDATE');
            $stmt->execute([$requestId]);
            $request = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$request) { $pdo->rollBack(); json_response(['success'=>false,'message'=>'Registration request not found.'],404); }
            if (($request['Status']??'') !== 'Pending') { $pdo->rollBack(); json_response(['success'=>false,'message'=>'Registration request is already '.($request['Status']??'processed').'.'],409); }
            $stmt = $pdo->prepare('SELECT EmployeeID FROM employees WHERE EmployeeID=? LIMIT 1');
            $stmt->execute([$request['EmployeeID']]);
            if ($stmt->fetch()) { $pdo->rollBack(); json_response(['success'=>false,'message'=>'Employee ID already exists in Employee Master.'],409); }
            if (!empty($request['CompanyEmail'])) {
                $stmt = $pdo->prepare('SELECT EmployeeID FROM employees WHERE LOWER(CompanyEmail)=LOWER(?) LIMIT 1');
                $stmt->execute([$request['CompanyEmail']]);
                if ($stmt->fetch()) { $pdo->rollBack(); json_response(['success'=>false,'message'=>'CompanyEmail already belongs to another employee.'],409); }
            }
            $profileWrite = crosspath_write_employee_profile_in_transaction(
                $pdo,
                CROSS_PATH_CREATE,
                (string)$request['EmployeeID'],
                [
                    'EmployeeName'=>(string)($request['EmployeeName']??''),
                    'Department'=>(string)($request['Department']??''),
                    'Unit'=>(string)($request['Unit']??''),
                    'Position'=>(string)($request['Position']??''),
                ],
                [
                    'Team'=>'',
                    'CompanyEmail'=>$request['CompanyEmail']??null,
                    'Role'=>'User',
                    'Password'=>$request['PasswordHash'],
                    'MustChangePassword'=>0,
                ]
            );
            $stmt = $pdo->prepare("UPDATE registration_requests SET Status='Approved',RejectionReason=NULL,PasswordHash=NULL,ReviewedAt=NOW(),ReviewedBy=? WHERE ID=? AND Status='Pending'");
            $stmt->execute([(string)($user['id']??''),$request['ID']]);
            if ($stmt->rowCount() !== 1) throw new RuntimeException('Registration approval state changed before commit.');
            $pdo->commit();
            admin8_log($user,'APPROVE_REGISTRATION_REQUEST','RegistrationRequest',(string)$request['ID'],'Approved '.$request['EmployeeID'].' and created Employee with Role User.');
            if (!empty($request['CompanyEmail'])) {
                try {
                    $mail=admin8_registration_email_template(['status'=>'Approved','employeeName'=>$request['EmployeeName']??'','employeeId'=>$request['EmployeeID'],'referenceCode'=>$request['ReferenceCode']]);
                    $mailResult=mailer_send_mail($request['CompanyEmail'],$mail['subject'],$mail['text'],$mail['html']);
                    admin8_log($user,'REGISTRATION_APPROVAL_EMAIL_SENT','RegistrationRequest',(string)$request['ID'],!empty($mailResult['skipped'])?'SMTP not configured; email skipped.':'Applicant email sent.');
                } catch (Throwable $mailError) {
                    admin8_log($user,'REGISTRATION_APPROVAL_EMAIL_FAILED','RegistrationRequest',(string)$request['ID'],'Applicant email failed.');
                }
            }
            json_response([
                'success'=>true,
                'message'=>'Registration approved and Employee account created.',
                'onboardingStatus'=>$profileWrite['status'],
            ]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($error instanceof ProfileValidationException) {
                json_response(['success'=>false,'code'=>$error->reason,'message'=>$error->getMessage()],$error->httpStatus);
            }
            throw $error;
        }
    }
    $registrationReject = route_params($path,'/admin/registration-requests/:id/reject');
    if ($registrationReject !== null && $method === 'POST') {
        $requestId = admin8_registration_request_id($registrationReject['id']);
        if ($requestId === null) json_response(['success'=>false,'message'=>'Invalid registration request ID.'],400);
        ensure_auth_security_schema();
        $reason = trim((string)(json_body()['reason']??''));
        if (mb_strlen($reason) < 3) json_response(['success'=>false,'message'=>'Rejection reason must contain at least 3 characters.'],400);
        $requestBeforeReject = db_row('SELECT ID,ReferenceCode,EmployeeID,EmployeeName,CompanyEmail,Status FROM registration_requests WHERE ID=?',[$requestId]);
        $affected = db_execute("UPDATE registration_requests SET Status='Rejected',RejectionReason=?,PasswordHash=NULL,ReviewedAt=NOW(),ReviewedBy=? WHERE ID=? AND Status='Pending'",[$reason,(string)($user['id']??''),$requestId]);
        if ($affected < 1) {
            $request = db_row('SELECT Status FROM registration_requests WHERE ID=?',[$requestId]);
            if (!$request) json_response(['success'=>false,'message'=>'Registration request not found.'],404);
            json_response(['success'=>false,'message'=>'Registration request is already '.($request['Status']??'processed').'.'],409);
        }
        admin8_log($user,'REJECT_REGISTRATION_REQUEST','RegistrationRequest',(string)$requestId,$reason);
        if (!empty($requestBeforeReject['CompanyEmail'])) {
            try {
                $mail=admin8_registration_email_template(['status'=>'Rejected','employeeName'=>$requestBeforeReject['EmployeeName']??'','employeeId'=>$requestBeforeReject['EmployeeID'],'referenceCode'=>$requestBeforeReject['ReferenceCode'],'reason'=>$reason]);
                $mailResult=mailer_send_mail($requestBeforeReject['CompanyEmail'],$mail['subject'],$mail['text'],$mail['html']);
                admin8_log($user,'REGISTRATION_REJECTION_EMAIL_SENT','RegistrationRequest',(string)$requestId,!empty($mailResult['skipped'])?'SMTP not configured; email skipped.':'Applicant email sent.');
            } catch (Throwable $mailError) {
                admin8_log($user,'REGISTRATION_REJECTION_EMAIL_FAILED','RegistrationRequest',(string)$requestId,'Applicant email failed.');
            }
        }
        json_response(['success'=>true,'message'=>'Registration request rejected.']);
    }

    if ($method === 'GET' && $path === '/admin/email-requirement-rules') json_response(['success'=>true,'data'=>array_merge(admin8_email_rule(),['defaultPositionNames'=>admin8_default_email_position_names()])]);
    if ($method === 'GET' && $path === '/admin/email-readiness') json_response(['success'=>true,'data'=>admin8_email_readiness()]);
    if ($method === 'GET' && $path === '/admin/safety-core-export-roster') json_response(['success'=>true,'data'=>admin8_safety_export_roster()]);
    if ($method === 'POST' && $path === '/admin/safety-core-export-roster') {
        $b = json_body();
        $employeeIds = admin8_parse_safety_roster_employee_ids($b);
        if (!$employeeIds) json_response(['success'=>false,'message'=>'EmployeeID is required.'],400);
        if (count($employeeIds) > 500) json_response(['success'=>false,'message'=>'Too many EmployeeIDs in one request.'],400);
        $placeholders = implode(',', array_fill(0, count($employeeIds), '?'));
        $employeeRows = db_rows("SELECT EmployeeID FROM employees WHERE EmployeeID IN ($placeholders)", $employeeIds);
        $found = [];
        foreach ($employeeRows as $row) $found[(string)($row['EmployeeID'] ?? '')] = true;
        $missing = [];
        $validIds = [];
        foreach ($employeeIds as $id) {
            if (isset($found[$id])) $validIds[] = $id;
            else $missing[] = $id;
        }
        if (!$validIds) json_response(['success'=>false,'message'=>'Employee not found in Employee Master.'],404);
        $adminId = (string) ($user['id'] ?? '');
        $summary = ['added'=>0,'reactivated'=>0,'already'=>0,'missing'=>$missing];
        db()->beginTransaction();
        try {
            $nextOrder = admin8_number(safe_scalar('SELECT COALESCE(MAX(SortOrder),0)+10 FROM safety_core_export_roster WHERE IsActive=1'));
            if ($nextOrder <= 0) $nextOrder = 10;
            $existingPlaceholders = implode(',', array_fill(0, count($validIds), '?'));
            $existingRows = db_rows("SELECT id,EmployeeID,IsActive FROM safety_core_export_roster WHERE EmployeeID IN ($existingPlaceholders)", $validIds);
            $existingById = [];
            foreach ($existingRows as $row) $existingById[(string)($row['EmployeeID'] ?? '')] = $row;
            foreach ($validIds as $employeeId) {
                $existing = $existingById[$employeeId] ?? null;
                if ($existing && (int) ($existing['IsActive'] ?? 0) === 1) {
                    $summary['already']++;
                    continue;
                }
                if ($existing) {
                    db_execute('UPDATE safety_core_export_roster SET IsActive=1,SortOrder=?,UpdatedBy=? WHERE id=?', [$nextOrder,$adminId,$existing['id']]);
                    $summary['reactivated']++;
                } else {
                    db_execute('INSERT INTO safety_core_export_roster(EmployeeID,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,?,?)', [$employeeId,$nextOrder,$adminId,$adminId]);
                    $summary['added']++;
                }
                $nextOrder += 10;
            }
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        admin8_log($user,'SAFETY_CORE_EXPORT_ROSTER_ADD','Safety_Core_Export_Roster',implode(',',$validIds),'Added '.$summary['added'].', reactivated '.$summary['reactivated'].', already '.$summary['already'].', missing '.count($summary['missing']).' Safety Core export roster employees.');
        $changed = (int)$summary['added'] + (int)$summary['reactivated'];
        $parts = [];
        if ($changed) $parts[] = $changed.' employee(s) added to export roster.';
        if ((int)$summary['already']) $parts[] = $summary['already'].' already in roster.';
        if (count($summary['missing'])) $parts[] = count($summary['missing']).' not found in Employee Master.';
        json_response(['success'=>true,'data'=>admin8_safety_export_roster(),'summary'=>$summary,'message'=>$parts ? implode(' ', $parts) : 'Employee is already in export roster.']);
    }
    if ($method === 'PUT' && $path === '/admin/safety-core-export-roster/reorder') {
        $items = json_body()['items'] ?? [];
        if (!is_array($items) || !$items) json_response(['success'=>false,'message'=>'Invalid reorder payload.'],400);
        $normalized = [];
        foreach ($items as $item) {
            if (!is_array($item)) json_response(['success'=>false,'message'=>'Invalid reorder payload.'],400);
            $id = (int) ($item['id'] ?? $item['RosterID'] ?? 0);
            $sortOrder = (int) ($item['SortOrder'] ?? 0);
            if ($id <= 0 || $sortOrder <= 0) json_response(['success'=>false,'message'=>'Invalid reorder payload.'],400);
            $normalized[] = ['id'=>$id,'SortOrder'=>$sortOrder];
        }
        db()->beginTransaction();
        try {
            foreach ($normalized as $item) {
                db_execute('UPDATE safety_core_export_roster SET SortOrder=?,UpdatedBy=? WHERE id=? AND IsActive=1', [$item['SortOrder'],(string)($user['id']??''),$item['id']]);
            }
            db()->commit();
        } catch (Throwable $error) {
            db()->rollBack();
            throw $error;
        }
        admin8_log($user,'SAFETY_CORE_EXPORT_ROSTER_REORDER','Safety_Core_Export_Roster','bulk','Reordered '.count($normalized).' export roster rows.');
        json_response(['success'=>true,'data'=>admin8_safety_export_roster(),'message'=>'Export roster order updated.']);
    }
    $rosterParam = route_params($path, '/admin/safety-core-export-roster/:id');
    if ($rosterParam !== null && $method === 'PUT') {
        $id = (int) $rosterParam['id'];
        $sortOrder = (int) (json_body()['SortOrder'] ?? 0);
        if ($id <= 0 || $sortOrder <= 0) json_response(['success'=>false,'message'=>'Invalid roster row.'],400);
        $affected = db_execute('UPDATE safety_core_export_roster SET SortOrder=?,UpdatedBy=? WHERE id=? AND IsActive=1', [$sortOrder,(string)($user['id']??''),$id]);
        if ($affected < 1) json_response(['success'=>false,'message'=>'Roster row not found.'],404);
        json_response(['success'=>true,'data'=>admin8_safety_export_roster(),'message'=>'Export roster row updated.']);
    }
    if ($rosterParam !== null && $method === 'DELETE') {
        $id = (int) $rosterParam['id'];
        if ($id <= 0) json_response(['success'=>false,'message'=>'Invalid roster row.'],400);
        $affected = db_execute('UPDATE safety_core_export_roster SET IsActive=0,UpdatedBy=? WHERE id=? AND IsActive=1', [(string)($user['id']??''),$id]);
        if ($affected < 1) json_response(['success'=>false,'message'=>'Roster row not found.'],404);
        admin8_log($user,'SAFETY_CORE_EXPORT_ROSTER_REMOVE','Safety_Core_Export_Roster',(string)$id,'Removed employee from Safety Core export roster.');
        json_response(['success'=>true,'data'=>admin8_safety_export_roster(),'message'=>'Employee removed from export roster.']);
    }
    if ($method === 'GET' && $path === '/admin/safety-core-data') {
        $year = admin8_safety_year($_GET['year'] ?? null);
        $month = admin8_safety_month($_GET['month'] ?? null);
        json_response(['success'=>true,'data'=>admin8_safety_core_data($year, $month)]);
    }
    if ($method === 'GET' && $path === '/admin/schedules') {
        json_response(['success'=>true,'data'=>db_rows('SELECT * FROM patrol_schedule ORDER BY ScheduledDate DESC')]);
    }
    if ($method === 'PUT' && $path === '/admin/email-requirement-rules') {
        $ids=admin8_parse_rule(json_encode(['positionIds'=>json_body()['positionIds']??[]])); $available=[];
        foreach(db_rows('SELECT id FROM master_positions') as $row)$available[(int)$row['id']]=true;
        foreach($ids as $id)if(!isset($available[$id]))json_response(['success'=>false,'message'=>'Position rule contains unknown Master Position IDs.'],400);
        db_execute("INSERT INTO app_settings(key_name,value) VALUES('employee_email_required_positions',?) ON DUPLICATE KEY UPDATE value=VALUES(value),UpdatedAt=NOW()",[json_encode(['positionIds'=>$ids,'updatedBy'=>$user['id']??null,'updatedAt'=>date(DATE_ATOM)],JSON_UNESCAPED_SLASHES)]);
        admin8_log($user,'UPDATE_EMAIL_REQUIREMENT_RULE','App_Setting','employee_email_required_positions','Required email positions: '.count($ids));
        json_response(['success'=>true,'data'=>admin8_email_rule(),'message'=>'Email requirement rule updated.']);
    }
    if ($method === 'GET' && $path === '/admin/dashboard-stats') json_response(['success'=>true,'data'=>admin8_dashboard()]);
    if ($method === 'GET' && $path === '/admin/system-health/snapshots') {
        $limit = max(1, min(240, (int)($_GET['limit'] ?? 48)));
        json_response(['success'=>true,'data'=>admin8_health_snapshot_history($limit)]);
    }
    if ($method === 'POST' && $path === '/admin/system-health/snapshots') {
        $body = json_body();
        $health = is_array($body['health'] ?? null) ? $body['health'] : null;
        if (!$health) json_response(['success'=>false,'message'=>'health payload is required'],400);
        $snapshot = admin8_store_health_snapshot($health, $user, (string)($body['source'] ?? 'manual'));
        json_response(['success'=>true,'data'=>['snapshot'=>$snapshot,'history'=>admin8_health_snapshot_history(48)],'message'=>'System Health snapshot saved.']);
    }
    if ($method === 'GET' && $path === '/admin/system-health') json_response(['success'=>true,'data'=>admin8_health()]);
    if ($method === 'GET' && $path === '/admin/audit-logs') {
        $page=max(1,(int)($_GET['page']??1));$limit=max(1,min(5000,(int)($_GET['limit']??50)));$offset=($page-1)*$limit;$where=' WHERE 1=1';$params=[];
        foreach(['action'=>'Action','adminId'=>'AdminID','module'=>'Module'] as $q=>$column)if(trim((string)($_GET[$q]??''))!==''){$where.=" AND $column=?";$params[]=$_GET[$q];}
        if(($_GET['failed']??'')==='1')$where.=" AND (StatusCode>=400 OR Action LIKE 'FAILED%')";
        if(trim((string)($_GET['q']??''))!==''){$like='%'.trim((string)$_GET['q']).'%';$where.=' AND (AdminName LIKE ? OR AdminID LIKE ? OR Action LIKE ? OR TargetType LIKE ? OR TargetID LIKE ? OR Detail LIKE ? OR Path LIKE ?)';for($i=0;$i<7;$i++)$params[]=$like;}
        if(!empty($_GET['dateFrom'])){$where.=' AND ActionTime>=?';$params[]=$_GET['dateFrom'];} if(!empty($_GET['dateTo'])){$where.=' AND ActionTime<DATE_ADD(?,INTERVAL 1 DAY)';$params[]=$_GET['dateTo'];}
        json_response(['success'=>true,'data'=>db_rows("SELECT * FROM admin_auditlogs$where ORDER BY ActionTime DESC LIMIT $limit OFFSET $offset",$params),'total'=>admin8_number(safe_scalar("SELECT COUNT(*) FROM admin_auditlogs$where",$params)),'page'=>$page,'limit'=>$limit,'facets'=>['modules'=>array_column(db_rows("SELECT DISTINCT Module FROM admin_auditlogs WHERE Module IS NOT NULL AND Module<>'' ORDER BY Module"),'Module'),'actions'=>array_column(db_rows("SELECT DISTINCT Action FROM admin_auditlogs WHERE Action IS NOT NULL AND Action<>'' ORDER BY Action"),'Action')]]);
    }
    $roles=['ADMIN','USER','VIEWER','EXECUTIVE','MANAGER','STAFF','SAFETY_OFFICER'];$permissions=['VIEW_DASHBOARD','MANAGE_USERS','VIEW_REPORT','APPROVE_SAFETY','SUBMIT_SAFETY','FOURM_TRAINING_MANAGE','FORKLIFT_VIEW','FORKLIFT_REQUEST','FORKLIFT_APPROVE','FORKLIFT_MANAGE','FORKLIFT_RENEW','FORKLIFT_SUSPEND','FORKLIFT_PRINT','FORKLIFT_EXPORT','FORKLIFT_DOCUMENT_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_SETTINGS_MANAGE','FORKLIFT_AUDIT_VIEW'];
    if ($method === 'GET' && $path === '/admin/permissions/matrix') {
        $matrix=[];foreach($roles as $role){$matrix[$role]=[];foreach($permissions as $permission)$matrix[$role][$permission]=0;} foreach(db_rows('SELECT role,permission,granted FROM admin_rolepermissions') as $row)if(isset($matrix[$row['role']][$row['permission']]))$matrix[$row['role']][$row['permission']]=(int)$row['granted'];
        json_response(['success'=>true,'data'=>['matrix'=>$matrix,'roles'=>$roles,'permissions'=>$permissions,'roleLabels'=>['ADMIN'=>'Admin','USER'=>'User','VIEWER'=>'Viewer','EXECUTIVE'=>'Executive','MANAGER'=>'Manager','STAFF'=>'Staff','SAFETY_OFFICER'=>'Safety Officer']]]);
    }
    if ($method === 'PUT' && $path === '/admin/permissions/matrix') {
        $body=json_body();$role=(string)($body['role']??'');$permission=(string)($body['permission']??'');$granted=!empty($body['granted'])?1:0;
        if(!in_array($role,$roles,true)||!in_array($permission,$permissions,true))json_response(['success'=>false,'message'=>'role or permission is invalid.'],400);
        db_execute('INSERT INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?) ON DUPLICATE KEY UPDATE granted=VALUES(granted)',[$role,$permission,$granted]);
        admin8_log($user,'UPDATE_PERMISSION','RolePermission',$role.':'.$permission,'granted: '.$granted);json_response(['success'=>true,'message'=>'Permission updated.']);
    }
    return false;
}
