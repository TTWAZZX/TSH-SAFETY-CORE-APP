<?php
declare(strict_types=1);

function fl_roles(): array { return ['ADMIN','USER','VIEWER','EXECUTIVE','MANAGER','STAFF','SAFETY_OFFICER']; }
function fl_permissions(): array { return ['FORKLIFT_VIEW','FORKLIFT_REQUEST','FORKLIFT_MANAGE','FORKLIFT_APPROVE','FORKLIFT_RENEW','FORKLIFT_SUSPEND','FORKLIFT_PRINT','FORKLIFT_EXPORT','FORKLIFT_DOCUMENT_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_SETTINGS_MANAGE','FORKLIFT_AUDIT_VIEW']; }
function fl_user_id(array $u): string { return (string)($u['id'] ?? $u['EmployeeID'] ?? ''); }
function fl_user_name(array $u): string { return (string)($u['name'] ?? $u['EmployeeName'] ?? fl_user_id($u) ?: 'System'); }
function fl_role(array $u): string { return strtoupper((string)($u['role'] ?? $u['Role'] ?? 'USER')); }
function fl_is_admin(array $u): bool { return fl_role($u) === 'ADMIN'; }
function fl_text($v, int $max = 255): string { $s = trim((string)($v ?? '')); return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max); }
function fl_date($v): ?string { $s = fl_text($v, 10); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null; return strtotime($s) === false ? null : $s; }
function fl_status($v): string { $s = strtoupper(fl_text($v, 30)); return in_array($s, ['ACTIVE','SUSPENDED','ARCHIVED'], true) ? $s : 'ACTIVE'; }

function fl_seed_permissions(): void
{
    static $ready = false;
    if ($ready) return;
    try {
        $expected = count(fl_roles()) * count(fl_permissions());
        $row = db_row("SELECT COUNT(*) n FROM admin_rolepermissions WHERE permission LIKE 'FORKLIFT\\_%' ESCAPE '\\\\'");
        if ((int)($row['n'] ?? 0) >= $expected) { $ready = true; return; }
    } catch (Throwable $e) {}
    db()->exec("CREATE TABLE IF NOT EXISTS admin_rolepermissions (id INT AUTO_INCREMENT PRIMARY KEY,role VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_role_perm(role,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS admin_userpermissions (id INT AUTO_INCREMENT PRIMARY KEY,employee_id VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_user_perm(employee_id,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach (fl_roles() as $role) {
        foreach (fl_permissions() as $permission) {
            $granted = 0;
            if ($role === 'ADMIN') $granted = 1;
            elseif ($role === 'SAFETY_OFFICER') $granted = !in_array($permission, ['FORKLIFT_SETTINGS_MANAGE','FORKLIFT_TEMPLATE_MANAGE','FORKLIFT_AUDIT_VIEW'], true) ? 1 : 0;
            elseif ($role === 'MANAGER') $granted = in_array($permission, ['FORKLIFT_VIEW','FORKLIFT_PRINT','FORKLIFT_EXPORT'], true) ? 1 : 0;
            db_execute('INSERT IGNORE INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?)', [$role, $permission, $granted]);
        }
    }
    $ready = true;
}

function fl_has_permission(array $u, string $permission): bool
{
    if (fl_is_admin($u)) return true;
    if (in_array($permission, ['FORKLIFT_VIEW','FORKLIFT_REQUEST'], true)) return true;
    fl_seed_permissions();
    $eid = fl_user_id($u);
    if ($eid !== '') {
        $row = db_row('SELECT granted FROM admin_userpermissions WHERE employee_id=? AND permission=? ORDER BY updated_at DESC LIMIT 1', [$eid, $permission]);
        if ($row) return (int)$row['granted'] === 1;
    }
    $role = fl_role($u);
    $row = db_row('SELECT granted FROM admin_rolepermissions WHERE role=? AND permission=? LIMIT 1', [$role, $permission]);
    return $row ? (int)$row['granted'] === 1 : false;
}

function fl_require_permission(array $u, string $permission): void
{
    if (!fl_has_permission($u, $permission)) json_response(['success'=>false,'message'=>'Permission denied.'],403);
}

function fl_audit(array $u, string $action, string $targetType, $targetId, array $metadata = [], int $status = 200): void
{
    try {
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
            INDEX idx_action(Action),
            INDEX idx_admin(AdminID),
            INDEX idx_module(Module),
            INDEX idx_actiontime(ActionTime)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db_execute(
            'INSERT INTO admin_auditlogs(AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                fl_user_id($u) ?: 'system',
                fl_user_name($u),
                fl_role($u),
                (string)($u['department'] ?? $u['Department'] ?? ''),
                'forklift',
                $action,
                (string)($_SERVER['REQUEST_METHOD'] ?? ''),
                (string)($_GET['route'] ?? ''),
                $status,
                $targetType,
                (string)$targetId,
                $action . ' ' . $targetType . ' ' . (string)$targetId,
                json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                (string)($_SERVER['REMOTE_ADDR'] ?? ''),
                substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $e) {}
}

function fl_upload_max_bytes(): int
{
    $mb = (int)(safe_scalar("SELECT SettingValue FROM forklift_settings WHERE SettingKey='document_max_upload_mb'") ?? 5);
    return max(1, min(20, $mb)) * 1024 * 1024;
}

function fl_validate_upload_size(string $field): void
{
    if (!isset($_FILES[$field])) return;
    $sizes = is_array($_FILES[$field]['size'] ?? null) ? $_FILES[$field]['size'] : [$_FILES[$field]['size'] ?? 0];
    $max = fl_upload_max_bytes();
    foreach ($sizes as $size) {
        if ((int)$size > $max) json_response(['success'=>false,'message'=>'Uploaded file is too large.'],400);
    }
}

function fl_upload_guard(array $files): object
{
    $guard = (object)['files'=>array_values(array_filter($files)), 'persisted'=>false];
    register_shutdown_function(static function () use ($guard): void {
        if (!$guard->persisted && $guard->files) p5_cleanup($guard->files);
    });
    return $guard;
}
function fl_upload_persist(object $guard): void { $guard->persisted = true; }

function fl_effective_status(array $row, ?int $warningDays = null): string
{
    $base = strtoupper((string)($row['CurrentStatus'] ?? 'ACTIVE'));
    if (($row['DeletedAt'] ?? null) || $base === 'ARCHIVED') return 'ARCHIVED';
    if ($base === 'SUSPENDED') return 'SUSPENDED';
    $expire = (string)($row['ExpireDate'] ?? '');
    if ($expire !== '' && strtotime($expire) < strtotime(date('Y-m-d'))) return 'EXPIRED';
    $warn = $warningDays ?? (int)(safe_scalar("SELECT SettingValue FROM forklift_settings WHERE SettingKey='expiry_warn_days_primary'") ?? 60);
    if ($expire !== '' && strtotime($expire) <= strtotime('+' . max(1, $warn) . ' days')) return 'EXPIRING_SOON';
    return 'ACTIVE';
}

function fl_attach_effective(array $rows): array
{
    $warn = (int)(safe_scalar("SELECT SettingValue FROM forklift_settings WHERE SettingKey='expiry_warn_days_primary'") ?? 60);
    foreach ($rows as &$r) $r['EffectiveStatus'] = fl_effective_status($r, $warn);
    unset($r);
    return $rows;
}

function fl_effective_status_where(string $status, int $warningDays): ?string
{
    $warn = max(1, min(365, $warningDays));
    $base = "UPPER(COALESCE(l.CurrentStatus,'ACTIVE'))";
    $current = "l.DeletedAt IS NULL AND $base NOT IN ('ARCHIVED','SUSPENDED')";
    $clauses = [
        'ACTIVE' => "$current AND (l.ExpireDate IS NULL OR l.ExpireDate>DATE_ADD(CURDATE(),INTERVAL $warn DAY))",
        'EXPIRING_SOON' => "$current AND l.ExpireDate>=CURDATE() AND l.ExpireDate<=DATE_ADD(CURDATE(),INTERVAL $warn DAY)",
        'EXPIRED' => "$current AND l.ExpireDate<CURDATE()",
        'SUSPENDED' => "l.DeletedAt IS NULL AND $base='SUSPENDED'",
        'ARCHIVED' => "(l.DeletedAt IS NOT NULL OR $base='ARCHIVED')",
    ];
    return $clauses[strtoupper($status)] ?? null;
}

function fl_license_no_order_sql(): string
{
    return "CASE WHEN l.LicenseNo IS NULL OR TRIM(l.LicenseNo)='' THEN 1 ELSE 0 END,l.LicenseNo ASC,l.ID ASC";
}

function fl_schema_ready(): bool
{
    try {
        $tables = [
            'forklift_license_types','forklift_licenses','forklift_license_requests','forklift_license_type_map',
            'forklift_request_type_map','forklift_request_documents','forklift_request_events','forklift_license_renewals',
            'forklift_license_documents','forklift_employee_photos','forklift_card_templates','forklift_card_template_versions',
            'forklift_card_template_fields','forklift_layout_presets','forklift_card_print_logs','forklift_verification_tokens',
            'forklift_emailoutbox','forklift_sequences','forklift_settings',
        ];
        $placeholders = implode(',', array_fill(0, count($tables), '?'));
        $sql = "SELECT COUNT(DISTINCT LOWER(TABLE_NAME)) table_count,
                    SUM(CASE WHEN LOWER(TABLE_NAME)='forklift_license_requests' AND COLUMN_NAME IN ('RequestKind','SourceLicenseID','RequestedByID','SubmittedAt','ReviewStartedAt','ReturnedAt') THEN 1 ELSE 0 END)
                    + SUM(CASE WHEN LOWER(TABLE_NAME)='forklift_card_templates' AND COLUMN_NAME IN ('ArchivedAt','ArchivedBy') THEN 1 ELSE 0 END) required_columns
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN ($placeholders)";
        $row = db_row($sql, $tables);
        return (int)($row['table_count'] ?? 0) === count($tables) && (int)($row['required_columns'] ?? 0) === 8;
    } catch (Throwable $e) {
        return false;
    }
}

function fl_ensure(): void
{
    // Deployed/ready environments stay read-only on normal requests. The legacy
    // bootstrap below is retained only for an incomplete local/new environment.
    if (fl_schema_ready()) return;
    fl_seed_permissions();
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_license_types (ID INT AUTO_INCREMENT PRIMARY KEY,Code VARCHAR(40) NOT NULL,NameTH VARCHAR(120) NOT NULL,NameEN VARCHAR(120),Description TEXT,DefaultValidityMonths INT NOT NULL DEFAULT 12,Color VARCHAR(30) DEFAULT 'emerald',IsActive TINYINT(1) NOT NULL DEFAULT 1,SortOrder INT NOT NULL DEFAULT 100,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_type_code(Code),KEY idx_active(IsActive,SortOrder)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_licenses (ID INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,LicenseTypeID INT NOT NULL,LicenseNo VARCHAR(80),CardNo VARCHAR(80),IssueDate DATE NOT NULL,LastRenewalDate DATE NULL,ExpireDate DATE NOT NULL,CertificateNo VARCHAR(120),CurrentStatus VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',SuspensionReason TEXT,SuspendedAt DATETIME NULL,Note TEXT,EmployeeNameSnapshot VARCHAR(150),DepartmentSnapshot VARCHAR(120),UnitSnapshot VARCHAR(120),PositionSnapshot VARCHAR(120),CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),UNIQUE KEY uq_fl_license_no(LicenseNo),UNIQUE KEY uq_fl_card_no(CardNo),KEY idx_emp(EmployeeID),KEY idx_type(LicenseTypeID),KEY idx_expire(ExpireDate),KEY idx_status(CurrentStatus),KEY idx_deleted(DeletedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_license_requests (ID INT AUTO_INCREMENT PRIMARY KEY,RequestNo VARCHAR(80) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,LicenseTypeID INT NOT NULL,IssueDate DATE NOT NULL,ExpireDate DATE NOT NULL,CertificateNo VARCHAR(120),RequestStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING',RequestNote TEXT,ReviewNote TEXT,LicenseID INT NULL,EmployeeNameSnapshot VARCHAR(150),DepartmentSnapshot VARCHAR(120),UnitSnapshot VARCHAR(120),PositionSnapshot VARCHAR(120),RequestedBy VARCHAR(100),RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,ReviewedBy VARCHAR(100),ReviewedAt DATETIME NULL,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_request_no(RequestNo),KEY idx_status(RequestStatus,RequestedAt),KEY idx_emp(EmployeeID),KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_license_type_map (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,LicenseTypeID INT NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_license_type(LicenseID,LicenseTypeID),KEY idx_type(LicenseTypeID),KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_request_type_map (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,LicenseTypeID INT NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_request_type(RequestID,LicenseTypeID),KEY idx_type(LicenseTypeID),KEY idx_request(RequestID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_request_documents (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,DocumentType VARCHAR(40) NOT NULL,OriginalName VARCHAR(255),StoredName VARCHAR(255),FileUrl TEXT NOT NULL,MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_request_doc(RequestID,DeletedAt),KEY idx_doc_type(DocumentType)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_request_events (ID INT AUTO_INCREMENT PRIMARY KEY,RequestID INT NOT NULL,EventType VARCHAR(40) NOT NULL,FromStatus VARCHAR(30),ToStatus VARCHAR(30),Comment TEXT,ActorID VARCHAR(50),ActorName VARCHAR(150),ActorRole VARCHAR(50),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_request_event(RequestID,CreatedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_license_renewals (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,OldIssueDate DATE,NewIssueDate DATE,OldExpireDate DATE,NewExpireDate DATE,OldCertificateNo VARCHAR(120),NewCertificateNo VARCHAR(120),RenewalNote TEXT,OperatedBy VARCHAR(100),OperatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_license(LicenseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_license_documents (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,DocumentType VARCHAR(50) NOT NULL DEFAULT 'certificate',OriginalName VARCHAR(255),StoredName VARCHAR(255),FileUrl TEXT,MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_license(LicenseID,DeletedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_employee_photos (ID INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,PhotoUrl TEXT NOT NULL,OriginalName VARCHAR(255),StoredName VARCHAR(255),MimeType VARCHAR(100),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_emp(EmployeeID,DeletedAt),KEY idx_uploaded(UploadedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_card_templates (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseTypeID INT NULL,TemplateName VARCHAR(150) NOT NULL,IsActive TINYINT(1) NOT NULL DEFAULT 1,IsDefault TINYINT(1) NOT NULL DEFAULT 0,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_card_template_versions (ID INT AUTO_INCREMENT PRIMARY KEY,TemplateID INT NOT NULL,VersionNo INT NOT NULL DEFAULT 1,FrontImageUrl TEXT,BackImageUrl TEXT,CardWidthMm DECIMAL(8,2) DEFAULT 60.00,CardHeightMm DECIMAL(8,2) DEFAULT 82.00,Dpi INT DEFAULT 300,Status VARCHAR(30) NOT NULL DEFAULT 'draft',CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PublishedAt DATETIME NULL,UNIQUE KEY uq_template_version(TemplateID,VersionNo)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_card_template_fields (ID INT AUTO_INCREMENT PRIMARY KEY,TemplateVersionID INT NOT NULL,FieldKey VARCHAR(80) NOT NULL,FieldConfig JSON NULL,SortOrder INT NOT NULL DEFAULT 100,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_version(TemplateVersionID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_layout_presets (ID INT AUTO_INCREMENT PRIMARY KEY,PresetName VARCHAR(150) NOT NULL,FieldsJson LONGTEXT NOT NULL,CreatedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_layout_preset_name(PresetName)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_card_print_logs (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,TemplateVersionID INT NULL,Action VARCHAR(40) NOT NULL,PrintedBy VARCHAR(100),PrintedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SnapshotJson JSON NULL,RenderMetadata JSON NULL,KEY idx_license(LicenseID),KEY idx_printed(PrintedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_verification_tokens (ID INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NOT NULL,Token VARCHAR(120) NOT NULL,IsActive TINYINT(1) NOT NULL DEFAULT 1,RevokedAt DATETIME NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,LastAccessedAt DATETIME NULL,AccessCount INT NOT NULL DEFAULT 0,UNIQUE KEY uq_fl_token(Token),KEY idx_license(LicenseID,IsActive)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS Forklift_EmailOutbox (id INT AUTO_INCREMENT PRIMARY KEY,LicenseID INT NULL,EmployeeID VARCHAR(50),EventType VARCHAR(80) NOT NULL DEFAULT 'General',Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,SentAt DATETIME NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_license(LicenseID),KEY idx_status(Status),KEY idx_created(CreatedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_sequences (ID INT AUTO_INCREMENT PRIMARY KEY,SequenceKey VARCHAR(80) NOT NULL,SeqYear INT NOT NULL,NextSeq INT NOT NULL DEFAULT 1,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_fl_seq(SequenceKey,SeqYear)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS forklift_settings (SettingKey VARCHAR(80) PRIMARY KEY,SettingValue VARCHAR(255),UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([['FORKLIFT','Forklift','Forklift',12,'emerald',10],['STACKER','Stacker','Stacker',12,'sky',20]] as $t) {
        db_execute('INSERT IGNORE INTO forklift_license_types(Code,NameTH,NameEN,DefaultValidityMonths,Color,SortOrder) VALUES(?,?,?,?,?,?)', $t);
    }
    foreach ([['expiry_warn_days_primary','60'],['expiry_warn_days_secondary','30'],['expiry_warn_days_urgent','7'],['default_validity_months','12'],['document_max_upload_mb','5'],['manager_signature_url',''],['approval_queue_enabled','1'],['request_sla_days','3']] as $s) {
        db_execute('INSERT IGNORE INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?)', $s);
    }
    try { db()->exec("ALTER TABLE forklift_card_templates ADD COLUMN ArchivedAt DATETIME NULL AFTER IsDefault"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_card_templates ADD COLUMN ArchivedBy VARCHAR(100) NULL AFTER ArchivedAt"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_card_templates ADD KEY idx_fl_tpl_archive (ArchivedAt,IsActive)"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN RequestKind VARCHAR(20) NOT NULL DEFAULT 'NEW' AFTER RequestNo"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN SourceLicenseID INT NULL AFTER RequestKind"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN RequestedByID VARCHAR(50) NULL AFTER RequestedBy"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN SubmittedAt DATETIME NULL AFTER RequestedAt"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN ReviewStartedAt DATETIME NULL AFTER ReviewedBy"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE forklift_license_requests ADD COLUMN ReturnedAt DATETIME NULL AFTER ReviewStartedAt"); } catch (Throwable $e) {}
    db_execute('INSERT IGNORE INTO forklift_license_type_map(LicenseID,LicenseTypeID) SELECT ID,LicenseTypeID FROM forklift_licenses WHERE LicenseTypeID IS NOT NULL');
    db_execute('INSERT IGNORE INTO forklift_request_type_map(RequestID,LicenseTypeID) SELECT ID,LicenseTypeID FROM forklift_license_requests WHERE LicenseTypeID IS NOT NULL');
}

function fl_next_no(PDO $pdo, string $key, string $prefix): string
{
    $year = (int)date('Y');
    $stmt = $pdo->prepare('INSERT INTO forklift_sequences(SequenceKey,SeqYear,NextSeq) VALUES(?,?,1) ON DUPLICATE KEY UPDATE NextSeq=NextSeq');
    $stmt->execute([$key, $year]);
    $stmt = $pdo->prepare('SELECT NextSeq FROM forklift_sequences WHERE SequenceKey=? AND SeqYear=? FOR UPDATE');
    $stmt->execute([$key, $year]);
    $seq = max(1, (int)($stmt->fetchColumn() ?: 1));
    $stmt = $pdo->prepare('UPDATE forklift_sequences SET NextSeq=? WHERE SequenceKey=? AND SeqYear=?');
    $stmt->execute([$seq + 1, $key, $year]);
    return $prefix . $year . '-' . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
}

function fl_employee(string $id): ?array
{
    return db_row('SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position FROM employees WHERE EmployeeID=? LIMIT 1', [$id]);
}

function fl_employee_photo_url(string $employeeId): string
{
    $photo = db_row("SELECT PhotoUrl FROM forklift_employee_photos WHERE EmployeeID=? AND DeletedAt IS NULL AND PhotoUrl IS NOT NULL AND TRIM(PhotoUrl)<>'' AND LOWER(TRIM(PhotoUrl)) NOT IN ('0','false','null','undefined') ORDER BY UploadedAt DESC,ID DESC LIMIT 1", [$employeeId]);
    return trim((string)($photo['PhotoUrl'] ?? ''));
}

function fl_license_select(): string
{
    return "SELECT l.*,t.Code AS LicenseTypeCode,t.NameTH AS LicenseTypeNameTH,t.NameEN AS LicenseTypeNameEN,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail
            FROM forklift_licenses l
            JOIN forklift_license_types t ON t.ID=l.LicenseTypeID
            LEFT JOIN employees e ON e.EmployeeID=l.EmployeeID";
}

function fl_request_select(): string
{
    return "SELECT r.*,t.Code AS LicenseTypeCode,t.NameTH AS LicenseTypeNameTH,t.NameEN AS LicenseTypeNameEN,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail,src.LicenseNo AS SourceLicenseNo,src.CardNo AS SourceCardNo,src.IssueDate AS SourceIssueDate,src.ExpireDate AS SourceExpireDate,src.CertificateNo AS SourceCertificateNo
            FROM forklift_license_requests r
            JOIN forklift_license_types t ON t.ID=r.LicenseTypeID
            LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID
            LEFT JOIN forklift_licenses src ON src.ID=r.SourceLicenseID";
}

function fl_request_kind(array $request): string
{
    return strtoupper((string)($request['RequestKind'] ?? 'NEW')) === 'RENEWAL' ? 'RENEWAL' : 'NEW';
}

function fl_request_document_definitions(): array
{
    return [
        ['type'=>'TRAINING_CERTIFICATE','label'=>'Certificate อบรม','requiredFor'=>['NEW','RENEWAL'],'accept'=>'.pdf,.jpg,.jpeg,.png,.webp','mimeTypes'=>['application/pdf','image/jpeg','image/png','image/webp'],'licenseDocumentType'=>'training_certificate'],
        ['type'=>'EMPLOYEE_PHOTO','label'=>'รูปพนักงาน','requiredFor'=>['NEW','RENEWAL'],'accept'=>'.jpg,.jpeg,.png,.webp','mimeTypes'=>['image/jpeg','image/png','image/webp'],'syncEmployeePhoto'=>true],
        ['type'=>'RENEWAL_DOCUMENT','label'=>'เอกสารต่ออายุ','requiredFor'=>['RENEWAL'],'accept'=>'.pdf,.jpg,.jpeg,.png,.webp','mimeTypes'=>['application/pdf','image/jpeg','image/png','image/webp'],'licenseDocumentType'=>'renewal_document'],
        ['type'=>'OTHER','label'=>'อื่นๆ','requiredFor'=>[],'accept'=>'.pdf,.jpg,.jpeg,.png,.webp','mimeTypes'=>['application/pdf','image/jpeg','image/png','image/webp'],'licenseDocumentType'=>'other'],
    ];
}

function fl_request_document_items(array $request): array
{
    $kind = fl_request_kind($request);
    $items = [];
    foreach (fl_request_document_definitions() as $item) {
        $required = in_array($kind, $item['requiredFor'], true);
        if ($required || $item['type'] === 'OTHER') {
            $item['required'] = $required;
            $items[] = $item;
        }
    }
    return $items;
}

function fl_request_required_documents(array $request): array
{
    return array_values(array_filter(fl_request_document_items($request), static fn($item) => !empty($item['required'])));
}

function fl_request_document_meta(string $type): ?array
{
    $type = strtoupper($type);
    foreach (fl_request_document_definitions() as $item) {
        if ($item['type'] === $type) return $item;
    }
    return null;
}

function fl_request_can_access(array $user, array $request): bool
{
    return fl_has_permission($user,'FORKLIFT_MANAGE') || fl_has_permission($user,'FORKLIFT_APPROVE') || (string)($request['EmployeeID']??'')===fl_user_id($user) || ((string)($request['RequestedByID']??'')!=='' && (string)$request['RequestedByID']===fl_user_id($user));
}

function fl_request_event(int $requestId, string $type, ?string $from, ?string $to, string $comment, array $user): void
{
    db_execute('INSERT INTO forklift_request_events(RequestID,EventType,FromStatus,ToStatus,Comment,ActorID,ActorName,ActorRole) VALUES(?,?,?,?,?,?,?,?)',[$requestId,$type,$from,$to,$comment?:null,fl_user_id($user),fl_user_name($user),fl_role($user)]);
}

function fl_request_detail(int $id, array $user): ?array
{
    $row=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$id]);
    if(!$row||!fl_request_can_access($user,$row))return null;
    $row=fl_attach_type_names([$row],'forklift_request_type_map','RequestID')[0];
    $docs=db_rows('SELECT ID,RequestID,DocumentType,OriginalName,FileUrl,MimeType,FileSize,UploadedBy,UploadedAt FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL ORDER BY UploadedAt DESC,ID DESC',[$id]);
    $events=db_rows('SELECT * FROM forklift_request_events WHERE RequestID=? ORDER BY CreatedAt ASC,ID ASC',[$id]);
    $present=[];foreach($docs as $doc)$present[(string)$doc['DocumentType']]=true;
    $checklist=[];foreach(fl_request_document_items($row) as $item)$checklist[]=$item+['complete'=>!empty($present[$item['type']])];
    $required=array_values(array_filter($checklist,static fn($item)=>!empty($item['required'])));
    $row['Documents']=$docs;$row['Events']=$events;$row['Checklist']=$checklist;$row['CanSubmit']=!in_array(false,array_column($required,'complete'),true);
    return $row;
}

function fl_carry_over_request_documents(PDO $pdo, int $requestId, int $licenseId, string $employeeId, string $actor): int
{
    $stmt=$pdo->prepare('SELECT * FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL ORDER BY UploadedAt ASC,ID ASC');
    $stmt->execute([$requestId]);
    $docs=$stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach($docs as $doc){
        $meta=fl_request_document_meta((string)$doc['DocumentType']);
        if(!$meta)continue;
        if(!empty($meta['licenseDocumentType'])){
            $pdo->prepare('INSERT INTO forklift_license_documents(LicenseID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)')->execute([$licenseId,$meta['licenseDocumentType'],$doc['OriginalName']??null,$doc['StoredName']??null,$doc['FileUrl'],$doc['MimeType']??null,$doc['FileSize']??0,$actor]);
        }
        if(!empty($meta['syncEmployeePhoto'])){
            $pdo->prepare('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL')->execute([$actor,$employeeId]);
            $pdo->prepare('INSERT INTO forklift_employee_photos(EmployeeID,PhotoUrl,OriginalName,StoredName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)')->execute([$employeeId,$doc['FileUrl'],$doc['OriginalName']??null,$doc['StoredName']??null,$doc['MimeType']??null,$doc['FileSize']??0,$actor]);
        }
    }
    return count($docs);
}

function fl_type_ids_from($body, array $fallback = []): array
{
    $raw = $body['LicenseTypeIDs'] ?? $body['LicenseTypeIds'] ?? $body['licenseTypeIds'] ?? $body['LicenseTypes'] ?? $body['LicenseTypeID'] ?? $fallback;
    $values = is_array($raw) ? $raw : preg_split('/[|,]/', (string)$raw);
    $ids = [];
    foreach ($values ?: [] as $value) {
        $id = (int)$value;
        if ($id > 0 && !in_array($id, $ids, true)) $ids[] = $id;
    }
    return array_slice($ids, 0, 2);
}

function fl_sync_type_map(PDO $pdo, string $table, string $ownerColumn, int $ownerId, array $typeIds): void
{
    $pdo->prepare("DELETE FROM {$table} WHERE {$ownerColumn}=?")->execute([$ownerId]);
    $stmt = $pdo->prepare("INSERT IGNORE INTO {$table}({$ownerColumn},LicenseTypeID) VALUES(?,?)");
    foreach (array_slice($typeIds, 0, 2) as $typeId) $stmt->execute([$ownerId, (int)$typeId]);
}

function fl_attach_type_names(array $rows, string $table = 'forklift_license_type_map', string $ownerColumn = 'LicenseID'): array
{
    if (!$rows) return $rows;
    $ids = array_values(array_filter(array_map(static fn($r) => (int)($r['ID'] ?? 0), $rows)));
    if (!$ids) return $rows;
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $maps = db_rows("SELECT m.{$ownerColumn} AS OwnerID,t.ID,t.Code,t.NameTH,t.NameEN FROM {$table} m JOIN forklift_license_types t ON t.ID=m.LicenseTypeID WHERE m.{$ownerColumn} IN ($placeholders) ORDER BY m.ID ASC", $ids);
    $grouped = [];
    foreach ($maps as $m) {
        $owner = (int)$m['OwnerID'];
        $grouped[$owner][] = ['ID'=>(int)$m['ID'],'Code'=>$m['Code'],'NameTH'=>$m['NameTH'],'NameEN'=>$m['NameEN']];
    }
    foreach ($rows as &$row) {
        $types = $grouped[(int)($row['ID'] ?? 0)] ?? [['ID'=>(int)($row['LicenseTypeID'] ?? 0),'Code'=>$row['LicenseTypeCode'] ?? '','NameTH'=>$row['LicenseTypeNameTH'] ?? '','NameEN'=>$row['LicenseTypeNameEN'] ?? '']];
        $row['LicenseTypes'] = $types;
        $row['LicenseTypeIDs'] = array_values(array_filter(array_map(static fn($t) => (int)($t['ID'] ?? 0), $types)));
        $row['LicenseTypeNames'] = implode(', ', array_values(array_filter(array_map(static fn($t) => $t['NameTH'] ?: ($t['Code'] ?? ''), $types))));
    }
    unset($row);
    return $rows;
}

function fl_has_active_license_type(string $employeeId, array $typeIds, ?int $excludeId = null): ?array
{
    if (!$typeIds) return null;
    $placeholders = implode(',', array_fill(0, count($typeIds), '?'));
    $p = array_merge([$employeeId], $typeIds);
    $exclude = '';
    if ($excludeId) { $exclude = 'AND l.ID<>?'; $p[] = $excludeId; }
    return db_row("SELECT l.ID FROM forklift_licenses l LEFT JOIN forklift_license_type_map m ON m.LicenseID=l.ID WHERE l.EmployeeID=? AND COALESCE(m.LicenseTypeID,l.LicenseTypeID) IN ($placeholders) AND l.DeletedAt IS NULL AND l.CurrentStatus<>'ARCHIVED' AND l.ExpireDate>=CURDATE() $exclude LIMIT 1", $p);
}

function fl_has_pending_request_type(string $employeeId, array $typeIds): ?array
{
    if (!$typeIds) return null;
    $placeholders = implode(',', array_fill(0, count($typeIds), '?'));
    $p = array_merge([$employeeId], $typeIds);
    return db_row("SELECT r.ID FROM forklift_license_requests r LEFT JOIN forklift_request_type_map m ON m.RequestID=r.ID WHERE r.EmployeeID=? AND COALESCE(m.LicenseTypeID,r.LicenseTypeID) IN ($placeholders) AND r.RequestStatus IN ('DRAFT','RETURNED','SUBMITTED','UNDER_REVIEW','PENDING') LIMIT 1", $p);
}

function fl_mail_escape($value): string
{
    return htmlspecialchars(trim((string)($value ?? '')), ENT_QUOTES, 'UTF-8');
}

function fl_mail_row(string $label, $value, bool $strong = false, string $color = '#0f172a'): string
{
    $safeValue = fl_mail_escape($value !== null && $value !== '' ? $value : '-');
    if ($strong) $safeValue = '<strong>' . $safeValue . '</strong>';
    return '<tr><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;vertical-align:top">' . fl_mail_escape($label) . '</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:' . $color . ';font-size:14px;vertical-align:top">' . $safeValue . '</td></tr>';
}

function fl_mail_layout(array $options): string
{
    $tone = (string)($options['tone'] ?? '#047857');
    $soft = (string)($options['soft'] ?? '#ecfdf5');
    $eyebrow = fl_mail_escape($options['eyebrow'] ?? 'TSH SAFETY CORE');
    $title = fl_mail_escape($options['title'] ?? 'Forklift License');
    $subtitle = fl_mail_escape($options['subtitle'] ?? 'ระบบบริหารใบอนุญาตรถยก');
    $badge = fl_mail_escape($options['badge'] ?? 'แจ้งเตือน');
    $intro = (string)($options['intro'] ?? '');
    $rows = (string)($options['rows'] ?? '');
    $note = trim((string)($options['note'] ?? ''));
    $ctaUrl = trim((string)($options['ctaUrl'] ?? ''));
    $ctaHtml = $ctaUrl === '' ? '' : '<tr><td style="padding:0 28px 22px"><a href="' . fl_mail_escape($ctaUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:10px;background:' . $tone . ';color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">เปิดรายละเอียดใบอนุญาต · View details</a></td></tr>';
    $noteHtml = $note === '' ? '' : '<tr><td style="padding:0 28px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:14px 16px"><div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:5px">หมายเหตุ / Note</div><div style="font-size:14px;color:#334155;line-height:1.6">' . nl2br(fl_mail_escape($note)) . '</div></td></tr></table></td></tr>';
    return '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,\'Noto Sans Thai\',Tahoma,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:' . $tone . ';font-size:0">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:11px;letter-spacing:1.4px;font-weight:700;color:' . $tone . '">' . $eyebrow . '</div><div style="font-size:24px;line-height:1.3;font-weight:700;color:#0f172a;margin-top:7px">' . $title . '</div><div style="font-size:13px;color:#64748b;margin-top:5px">' . $subtitle . '</div></td><td align="right" valign="top"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:' . $soft . ';color:' . $tone . ';font-size:12px;font-weight:700">' . $badge . '</span></td></tr></table></td></tr><tr><td style="padding:0 28px 18px;font-size:14px;line-height:1.7;color:#334155">' . $intro . '</td></tr><tr><td style="padding:0 28px 22px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">' . $rows . '</table></td></tr>' . $noteHtml . $ctaHtml . '<tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b;line-height:1.6">อีเมลนี้ส่งอัตโนมัติจาก <strong>TSH Safety Core</strong><br>Please do not reply directly to this automated message.</div></td></tr></table></td></tr></table></body></html>';
}

function fl_request_mail(array $request, string $eventType, ?array $license = null): array
{
    $name = $request['EmployeeName'] ?: ($request['EmployeeNameSnapshot'] ?? ($request['EmployeeID'] ?? '-'));
    $type = $request['LicenseTypeNames'] ?? ($request['LicenseTypeNameTH'] ?: ($request['LicenseTypeCode'] ?? 'Forklift'));
    $status = strtoupper($eventType);
    $requestKind = fl_request_kind($request);
    $requestKindLabel = $requestKind === 'RENEWAL' ? 'ต่ออายุใบอนุญาต / RENEWAL' : 'ออกใบอนุญาตใหม่ / NEW';
    $requiredDocLabels = implode(', ', array_map(static fn($item) => $item['label'], fl_request_required_documents($request)));
    $statusMap = [
        'PENDING' => ['subject'=>'คำขอใบอนุญาตรถยกรอตรวจสอบ','title'=>'คำขอใบอนุญาตรถยกใหม่','badge'=>'รอตรวจสอบ · PENDING','tone'=>'#b45309','soft'=>'#fffbeb','intro'=>'มีคำขอใบอนุญาตรถยกใหม่เข้าสู่ระบบ กรุณาตรวจสอบรายละเอียดและดำเนินการอนุมัติหรือปฏิเสธ'],
        'APPROVED' => ['subject'=>'อนุมัติคำขอใบอนุญาตรถยกแล้ว','title'=>'คำขอใบอนุญาตรถยกได้รับการอนุมัติ','badge'=>'อนุมัติแล้ว · APPROVED','tone'=>'#047857','soft'=>'#ecfdf5','intro'=>'คำขอได้รับการอนุมัติและระบบได้สร้างข้อมูลใบอนุญาตเรียบร้อยแล้ว'],
        'REJECTED' => ['subject'=>'คำขอใบอนุญาตรถยกไม่ผ่านการอนุมัติ','title'=>'คำขอใบอนุญาตรถยกถูกปฏิเสธ','badge'=>'ไม่อนุมัติ · REJECTED','tone'=>'#b91c1c','soft'=>'#fef2f2','intro'=>'คำขอนี้ไม่ได้รับการอนุมัติ กรุณาตรวจสอบหมายเหตุจากผู้พิจารณาด้านล่าง'],
        'CANCELLED' => ['subject'=>'ยกเลิกคำขอใบอนุญาตรถยกแล้ว','title'=>'คำขอใบอนุญาตรถยกถูกยกเลิก','badge'=>'ยกเลิก · CANCELLED','tone'=>'#475569','soft'=>'#f1f5f9','intro'=>'คำขอนี้ถูกยกเลิกแล้ว กรุณาตรวจสอบหมายเหตุประกอบด้านล่าง'],
    ];
    $view = $statusMap[$status] ?? $statusMap['PENDING'];
    $subject = '[TSH Safety] ' . $view['subject'] . ' | ' . ($request['RequestNo'] ?? '-');
    $lines = [
        "Forklift license request {$status}",
        "Request No.: " . ($request['RequestNo'] ?? '-'),
        "Employee: {$name} (" . ($request['EmployeeID'] ?? '-') . ")",
        "Request kind: {$requestKind}",
        "Type: {$type}",
        "Required documents: " . ($requiredDocLabels ?: '-'),
        "Issue: " . substr((string)($request['IssueDate'] ?? ''), 0, 10),
        "Expire: " . substr((string)($request['ExpireDate'] ?? ''), 0, 10),
    ];
    if ($license) {
        $lines[] = "License No.: " . ($license['LicenseNo'] ?? '-');
        $lines[] = "Card No.: " . ($license['CardNo'] ?? '-');
    }
    if (trim((string)($request['ReviewNote'] ?? '')) !== '') $lines[] = "Review note: " . trim((string)$request['ReviewNote']);
    $body = implode("\n", $lines);
    $rows = fl_mail_row('เลขที่คำขอ / Request No.', $request['RequestNo'] ?? '-', true)
        . fl_mail_row('พนักงาน / Employee', $name . ' (' . ($request['EmployeeID'] ?? '-') . ')')
        . fl_mail_row('ประเภทคำขอ / Request Kind', $requestKindLabel, true)
        . fl_mail_row('ฝ่าย / Department', $request['Department'] ?: ($request['DepartmentSnapshot'] ?? '-'))
        . fl_mail_row('ประเภท / License Type', $type)
        . fl_mail_row('เอกสารบังคับ / Required Documents', $requiredDocLabels ?: '-')
        . fl_mail_row('วันที่ออก / Issue Date', substr((string)($request['IssueDate'] ?? ''), 0, 10))
        . fl_mail_row('วันหมดอายุ / Expire Date', substr((string)($request['ExpireDate'] ?? ''), 0, 10));
    if ($license) {
        $rows .= fl_mail_row('เลขที่ใบอนุญาต / License No.', $license['LicenseNo'] ?? '-', true, '#047857');
        $rows .= fl_mail_row('เลขที่บัตร / Card No.', $license['CardNo'] ?? '-', true);
    }
    $detailUrl = $license && !empty($license['ID']) ? fl_public_base_url() . '/?forkliftLicense=' . rawurlencode((string)$license['ID']) . '#forklift' : '';
    $html = fl_mail_layout(['tone'=>$view['tone'],'soft'=>$view['soft'],'eyebrow'=>'TSH SAFETY · FORKLIFT LICENSE','title'=>$view['title'],'subtitle'=>'Forklift & Powered Industrial Truck License','badge'=>$view['badge'],'intro'=>$view['intro'],'rows'=>$rows,'note'=>$request['ReviewNote'] ?? '','ctaUrl'=>$detailUrl]);
    return ['subject'=>$subject,'body'=>$body,'html'=>$html];
}

function fl_settings_map(): array
{
    $rows = db_rows('SELECT SettingKey,SettingValue FROM forklift_settings ORDER BY SettingKey');
    $out = [];
    foreach ($rows as $r) $out[(string)$r['SettingKey']] = (string)$r['SettingValue'];
    return $out;
}

function fl_report_data(array $q): array
{
    $where=[]; $p=[];
    if (($q['includeArchived'] ?? '') !== '1' && ($q['includeArchived'] ?? '') !== 'true') $where[]='l.DeletedAt IS NULL';
    if (!empty($q['year'])) { $where[]='YEAR(l.ExpireDate)=?'; $p[]=(int)$q['year']; }
    if (!empty($q['type']) && $q['type'] !== 'all') { $where[]='EXISTS (SELECT 1 FROM forklift_license_type_map lm WHERE lm.LicenseID=l.ID AND lm.LicenseTypeID=?)'; $p[]=$q['type']; }
    if (!empty($q['department']) && $q['department'] !== 'all') { $where[]='COALESCE(e.Department,l.DepartmentSnapshot)=?'; $p[]=$q['department']; }
    if (!empty($q['unit']) && $q['unit'] !== 'all') { $where[]='COALESCE(e.Unit,l.UnitSnapshot)=?'; $p[]=$q['unit']; }
    if (!empty($q['expireDays'])) { $where[]='l.ExpireDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'; $p[]=max(0,(int)$q['expireDays']); }
    $whereSql = $where ? ' WHERE '.implode(' AND ',$where) : '';
    $rows = fl_attach_type_names(fl_attach_effective(db_rows(fl_license_select().$whereSql.' ORDER BY l.ExpireDate ASC,l.ID DESC',$p)));
    if (!empty($q['status']) && $q['status'] !== 'all') {
        $status = (string)$q['status'];
        $rows = array_values(array_filter($rows, static fn($r) => ($r['EffectiveStatus'] ?? '') === $status || strtoupper((string)($r['CurrentStatus'] ?? '')) === $status));
    }
    $summary=['total'=>count($rows),'active'=>0,'expiringSoon'=>0,'expired'=>0,'suspended'=>0,'archived'=>0,'missingCertificate'=>0,'byType'=>[],'byDepartment'=>[],'byUnit'=>[]];
    foreach($rows as $r){
        if(($r['EffectiveStatus']??'')==='ACTIVE')$summary['active']++;
        if(($r['EffectiveStatus']??'')==='EXPIRING_SOON')$summary['expiringSoon']++;
        if(($r['EffectiveStatus']??'')==='EXPIRED')$summary['expired']++;
        if(($r['EffectiveStatus']??'')==='SUSPENDED')$summary['suspended']++;
        if(($r['EffectiveStatus']??'')==='ARCHIVED')$summary['archived']++;
        if(trim((string)($r['CertificateNo']??''))==='')$summary['missingCertificate']++;
        $type=$r['LicenseTypeNames']?:($r['LicenseTypeNameTH']?:($r['LicenseTypeCode']??'Unknown'));
        $dept=$r['Department']?:($r['DepartmentSnapshot']?:'ไม่ระบุ');
        $unit=$r['Unit']?:($r['UnitSnapshot']?:'ไม่ระบุ');
        $summary['byType'][$type]=($summary['byType'][$type]??0)+1;
        $summary['byDepartment'][$dept]=($summary['byDepartment'][$dept]??0)+1;
        $summary['byUnit'][$unit]=($summary['byUnit'][$unit]??0)+1;
    }
    return ['rows'=>$rows,'summary'=>$summary];
}

function fl_valid_email($value): string
{
    $email = trim((string)($value ?? ''));
    return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
}

function fl_admin_email(): string
{
    global $config;
    $config = is_array($config ?? null) ? $config : [];
    foreach (['forklift_admin_email','safety_admin_email','admin_email','hiyari_admin_email','smtp_from','smtp_user'] as $key) {
        $v = $config[$key] ?? '';
        if ($v && fl_valid_email($v)) return (string)$v;
    }
    foreach (['FORKLIFT_ADMIN_EMAIL','SAFETY_ADMIN_EMAIL','ADMIN_EMAIL','HIYARI_ADMIN_EMAIL','SMTP_FROM','SMTP_USER'] as $key) {
        $v = getenv($key);
        if ($v && fl_valid_email($v)) return (string)$v;
    }
    return defined('SMTP_FROM') && fl_valid_email(SMTP_FROM) ? SMTP_FROM : '';
}

function fl_reminder_mail(array $row, string $eventType = 'ExpiryReminder'): array
{
    $name = $row['EmployeeName'] ?: ($row['EmployeeNameSnapshot'] ?? ($row['EmployeeID'] ?? '-'));
    $expire = isset($row['ExpireDate']) ? substr((string)$row['ExpireDate'], 0, 10) : '';
    $expired = $eventType === 'ExpiredReminder';
    $subject = '[TSH Safety] ' . ($expired ? 'ใบอนุญาตรถยกหมดอายุแล้ว' : 'แจ้งเตือนใบอนุญาตรถยกใกล้หมดอายุ') . ' | ' . ($row['LicenseNo'] ?: ($row['CardNo'] ?? $row['EmployeeID'] ?? '-'));
    $body = "เรียน {$name}\n\nระบบแจ้งเตือนใบอนุญาต " . ($row['LicenseTypeNameTH'] ?: ($row['LicenseTypeCode'] ?? 'Forklift')) . " ของคุณ\nLicense No.: " . ($row['LicenseNo'] ?? '-') . "\nCard No.: " . ($row['CardNo'] ?? '-') . "\nวันหมดอายุ: " . ($expire ?: '-') . "\nสถานะ: " . ($row['EffectiveStatus'] ?? '-') . "\n\nกรุณาติดต่อ Safety/Admin เพื่อดำเนินการต่ออายุหรือทบทวนข้อมูล";
    $type = $row['LicenseTypeNames'] ?? ($row['LicenseTypeNameTH'] ?: ($row['LicenseTypeCode'] ?? 'Forklift'));
    $rows = fl_mail_row('พนักงาน / Employee', $name . ' (' . ($row['EmployeeID'] ?? '-') . ')')
        . fl_mail_row('ประเภท / License Type', $type)
        . fl_mail_row('เลขที่ใบอนุญาต / License No.', $row['LicenseNo'] ?? '-', true)
        . fl_mail_row('เลขที่บัตร / Card No.', $row['CardNo'] ?? '-')
        . fl_mail_row('วันหมดอายุ / Expire Date', $expire ?: '-', true, '#b91c1c')
        . fl_mail_row('สถานะ / Status', $row['EffectiveStatus'] ?? '-', true, $expired ? '#b91c1c' : '#b45309');
    $html = fl_mail_layout([
        'tone'=>$expired ? '#b91c1c' : '#b45309',
        'soft'=>$expired ? '#fef2f2' : '#fffbeb',
        'eyebrow'=>'TSH SAFETY · FORKLIFT LICENSE',
        'title'=>$expired ? 'ใบอนุญาตรถยกหมดอายุแล้ว' : 'ใบอนุญาตรถยกใกล้หมดอายุ',
        'subtitle'=>'Forklift License Expiry Notification',
        'badge'=>$expired ? 'หมดอายุ · EXPIRED' : 'ใกล้หมดอายุ · EXPIRING',
        'intro'=>'เรียน <strong>' . fl_mail_escape($name) . '</strong><br>กรุณาติดต่อ Safety/Admin เพื่อดำเนินการต่ออายุหรือตรวจสอบข้อมูลใบอนุญาต',
        'rows'=>$rows,
        'ctaUrl'=>!empty($row['ID']) ? fl_public_base_url() . '/?forkliftLicense=' . rawurlencode((string)$row['ID']) . '#forklift' : '',
    ]);
    return ['subject'=>$subject,'body'=>$body,'html'=>$html];
}

function fl_queue_email(array $cols): array
{
    db_execute('INSERT INTO Forklift_EmailOutbox(LicenseID,EmployeeID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES(?,?,?,?,?,?,?,?)', [
        $cols['LicenseID'] ?? null,
        $cols['EmployeeID'] ?? null,
        $cols['EventType'] ?? 'General',
        $cols['Recipients'],
        $cols['Subject'],
        $cols['Body'] ?? '',
        $cols['HtmlBody'] ?? null,
        'Queued',
    ]);
    $id = (int)db()->lastInsertId();
    if ($id > 0 && function_exists('mailer_outbox_best_effort')) mailer_outbox_best_effort('Forklift_EmailOutbox', $id, 'Recipients', 'HtmlBody');
    return ['outboxId'=>$id,'status'=>'Queued'];
}

function fl_reminder_queue(array $q): array
{
    $days = max(0, min(365, (int)($q['days'] ?? $q['expireDays'] ?? (safe_scalar("SELECT SettingValue FROM forklift_settings WHERE SettingKey='expiry_warn_days_primary'") ?? 60))));
    $data = fl_report_data([]);
    $cutoff = strtotime('today +' . $days . ' days');
    $sentRows = db_rows("SELECT LicenseID,EventType FROM Forklift_EmailOutbox WHERE CreatedAt>=CURDATE() AND EventType IN ('ExpiryReminder','ExpiredReminder') AND Status IN ('Queued','Sent')");
    $sentKeys = [];foreach($sentRows as $sent)$sentKeys[(string)$sent['LicenseID'].':'.(string)$sent['EventType']]=true;
    $rows = [];
    foreach ($data['rows'] as $row) {
        if (!in_array($row['EffectiveStatus'] ?? '', ['ACTIVE','EXPIRING_SOON','EXPIRED'], true)) continue;
        if (($row['EffectiveStatus'] ?? '') !== 'EXPIRED' && strtotime((string)($row['ExpireDate'] ?? '')) > $cutoff) continue;
        $recipients = [];
        $email = fl_valid_email($row['CompanyEmail'] ?? '');
        $admin = fl_admin_email();
        if ($email !== '') $recipients[] = $email;
        if ($admin !== '' && !in_array($admin, $recipients, true)) $recipients[] = $admin;
        $eventType=($row['EffectiveStatus']??'')==='EXPIRED'?'ExpiredReminder':'ExpiryReminder';$alreadySent=!empty($sentKeys[(string)$row['ID'].':'.$eventType]);
        $rows[] = ['key'=>$row['ID'].':'.substr((string)$row['ExpireDate'],0,10),'readiness'=>$alreadySent?'already_sent_today':($recipients?'ready':'missing_email'),'reason'=>$alreadySent?'Reminder already queued or sent today':($recipients?'':'ไม่พบ CompanyEmail หรือ admin email'),'recipients'=>$recipients,'license'=>$row,'eventType'=>$eventType];
    }
    return $rows;
}

function fl_template_default_fields(): array
{
    return [
        ['employee_photo','รูปพนักงาน','front',8,12,18,24,'',10,'#111827','center'],
        ['employee_name','ชื่อพนักงาน','front',30,18,40,6,'Kanit',10,'#111827','left'],
        ['employee_id','รหัสพนักงาน','front',30,27,28,5,'Kanit',8,'#334155','left'],
        ['department','Department','front',30,35,36,5,'Kanit',8,'#334155','left'],
        ['unit','Unit','front',30,43,36,5,'Kanit',8,'#334155','left'],
        ['position','Position','front',30,51,36,5,'Kanit',8,'#334155','left'],
        ['license_type','License Type','front',30,63,36,5,'Kanit',8,'#064e3b','left'],
        ['license_no','License No.','front',8,72,32,5,'Kanit',8,'#111827','left'],
        ['card_no','Card No.','front',48,72,32,5,'Kanit',8,'#111827','left'],
        ['issue_date','Issue Date','front',8,80,28,5,'Kanit',8,'#111827','left'],
        ['expire_date','Expire Date','front',48,80,28,5,'Kanit',8,'#111827','left'],
        ['manager_signature','Manager Signature','back',42,58,32,12,'Kanit',7,'#111827','center'],
        ['qr_code','QR Code','back',76,58,16,16,'',8,'#111827','center'],
        ['static_text','บริษัท ไทยซัมมิท ฮาร์เนส จำกัด','back',8,82,70,5,'Kanit',7,'#475569','left'],
    ];
}

function fl_field_config(array $row): array
{
    return [
        'label'=>$row[1],
        'side'=>$row[2],
        'x'=>$row[3],
        'y'=>$row[4],
        'width'=>$row[5],
        'height'=>$row[6],
        'fontFamily'=>$row[7] ?: 'Kanit',
        'fontSize'=>$row[8],
        'fontWeight'=>'700',
        'fontColor'=>$row[9],
        'textAlign'=>$row[10],
        'lineHeight'=>1.2,
        'fit'=>'cover',
        'photoFitMode'=>'cover',
        'objectX'=>50,
        'objectY'=>50,
        'objectScale'=>1,
        'rotation'=>0,
        'zIndex'=>10,
        'visible'=>true,
    ];
}

function fl_template_image(string $field, array $priorFiles = []): ?array
{
    fl_validate_upload_size($field);
    $files = p5_store_files($field, 1);
    if (!$files) return null;
    $file = $files[0];
    if (!in_array($file['type'] ?? '', ['image/jpeg','image/png','image/webp'], true)) {
        p5_cleanup(array_merge($priorFiles, $files));
        json_response(['success'=>false,'message'=>'Template image must be JPG, PNG, or WebP.'],400);
    }
    return $file;
}

function fl_template_payload(?int $templateId = null): array
{
    $where = $templateId ? ' WHERE tpl.ID=?' : '';
    $params = $templateId ? [$templateId] : [];
    $templates = db_rows("SELECT tpl.*,typ.Code AS LicenseTypeCode,typ.NameTH AS LicenseTypeNameTH,(SELECT COUNT(*) FROM forklift_card_template_versions pv JOIN forklift_card_print_logs pl ON pl.TemplateVersionID=pv.ID WHERE pv.TemplateID=tpl.ID) AS PrintLogCount FROM forklift_card_templates tpl LEFT JOIN forklift_license_types typ ON typ.ID=tpl.LicenseTypeID$where ORDER BY COALESCE(tpl.ArchivedAt,'1000-01-01') ASC,tpl.UpdatedAt DESC,tpl.ID DESC", $params);
    foreach ($templates as &$tpl) {
        $versions = db_rows('SELECT * FROM forklift_card_template_versions WHERE TemplateID=? ORDER BY VersionNo DESC,ID DESC', [$tpl['ID']]);
        foreach ($versions as &$ver) {
            $fields = db_rows('SELECT * FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC,ID ASC', [$ver['ID']]);
            foreach ($fields as &$field) {
                $field['FieldConfig'] = json_decode((string)($field['FieldConfig'] ?? '{}'), true) ?: [];
            }
            unset($field);
            $ver['Fields'] = $fields;
        }
        unset($ver);
        $tpl['Versions'] = $versions;
        $current = null;
        foreach ($versions as $v) {
            if (strtolower((string)($v['Status'] ?? '')) === 'published') { $current = $v; break; }
        }
        $tpl['CurrentVersion'] = $current ?: ($versions[0] ?? null);
        $tpl['PrintLogCount'] = (int)($tpl['PrintLogCount'] ?? 0);
        $tpl['TemplateStatus'] = !empty($tpl['ArchivedAt']) ? 'archived' : (($current && strtolower((string)($current['Status'] ?? '')) === 'published') ? 'published' : 'draft');
    }
    unset($tpl);
    return $templates;
}

function fl_template_row(int $templateId): ?array
{
    return db_row('SELECT * FROM forklift_card_templates WHERE ID=? LIMIT 1', [$templateId]);
}

function fl_template_print_log_count(int $templateId): int
{
    return (int)(safe_scalar('SELECT COUNT(*) FROM forklift_card_template_versions v JOIN forklift_card_print_logs l ON l.TemplateVersionID=v.ID WHERE v.TemplateID=?', [$templateId]) ?? 0);
}

function fl_seed_template_fields(PDO $pdo, int $versionId): void
{
    $sort = 10;
    $stmt = $pdo->prepare('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)');
    foreach (fl_template_default_fields() as $row) {
        $stmt->execute([$versionId, $row[0], json_encode(fl_field_config($row), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sort]);
        $sort += 10;
    }
}

function fl_public_base_url(): string
{
    global $config;
    $config = is_array($config ?? null) ? $config : [];
    foreach (['PUBLIC_APP_BASE_URL','PUBLIC_APP_URL','APP_BASE_URL'] as $key) {
        $env = rtrim((string)getenv($key), '/');
        if ($env !== '') return $env;
    }
    $configured = rtrim((string)($config['public_app_url'] ?? ''), '/');
    if ($configured !== '') return $configured;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $base = rtrim(dirname(dirname($script)), '/.');
    return ($https ? 'https' : 'http') . '://' . $host . ($base !== '' ? $base : '');
}

function fl_active_token(PDO $pdo, int $licenseId): string
{
    $stmt = $pdo->prepare('SELECT Token FROM forklift_verification_tokens WHERE LicenseID=? AND IsActive=1 AND RevokedAt IS NULL ORDER BY ID DESC LIMIT 1');
    $stmt->execute([$licenseId]);
    $token = (string)($stmt->fetchColumn() ?: '');
    if ($token !== '') return $token;
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)');
    $stmt->execute([$licenseId, $token]);
    return $token;
}

function fl_card_payload(int $licenseId, ?int $templateVersionId = null): ?array
{
    $license = db_row(fl_license_select() . ' WHERE l.ID=? AND l.DeletedAt IS NULL LIMIT 1', [$licenseId]);
    if (!$license) return null;
    $license = fl_attach_type_names(fl_attach_effective([$license]))[0];
    $where = "v.Status='published'";
    $params = [];
    if ($templateVersionId) {
        $where = 'v.ID=?';
        $params[] = $templateVersionId;
    }
    $params[] = $license['LicenseTypeID'];
    $params[] = $license['LicenseTypeID'];
    $version = db_row("SELECT v.*,tpl.TemplateName,tpl.LicenseTypeID AS TemplateLicenseTypeID,tpl.IsDefault
        FROM forklift_card_template_versions v
        JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID
        WHERE $where AND tpl.IsActive=1 AND tpl.ArchivedAt IS NULL AND (tpl.LicenseTypeID IS NULL OR tpl.LicenseTypeID=?)
        ORDER BY CASE WHEN tpl.LicenseTypeID=? THEN 0 ELSE 1 END, tpl.IsDefault DESC, v.PublishedAt DESC, v.ID DESC
        LIMIT 1", $params);
    if (!$version) return ['license'=>$license,'template'=>null,'version'=>null,'fields'=>[],'values'=>[],'verification'=>null];
    $fields = db_rows('SELECT * FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC,ID ASC', [$version['ID']]);
    foreach ($fields as &$field) $field['FieldConfig'] = json_decode((string)($field['FieldConfig'] ?? '{}'), true) ?: [];
    unset($field);
    $token = fl_active_token(db(), (int)$license['ID']);
    $url = fl_public_base_url() . '/api/forklift/verify/' . rawurlencode($token);
    $settings = fl_settings_map();
    $values = [
        'employee_photo'=>fl_employee_photo_url((string)($license['EmployeeID'] ?? '')),
        'employee_name'=>$license['EmployeeName'] ?: ($license['EmployeeNameSnapshot'] ?? ''),
        'employee_id'=>$license['EmployeeID'] ?? '',
        'department'=>$license['Department'] ?: ($license['DepartmentSnapshot'] ?? ''),
        'unit'=>$license['Unit'] ?: ($license['UnitSnapshot'] ?? ''),
        'position'=>$license['Position'] ?: ($license['PositionSnapshot'] ?? ''),
        'license_no'=>$license['LicenseNo'] ?? '',
        'card_no'=>$license['CardNo'] ?? '',
        'issue_date'=>isset($license['IssueDate']) ? substr((string)$license['IssueDate'], 0, 10) : '',
        'expire_date'=>isset($license['ExpireDate']) ? substr((string)$license['ExpireDate'], 0, 10) : '',
        'certificate_no'=>$license['CertificateNo'] ?? '',
        'license_type'=>$license['LicenseTypeNames'] ?: ($license['LicenseTypeNameTH'] ?: ($license['LicenseTypeCode'] ?? '')),
        'manager_signature'=>$settings['manager_signature_url'] ?? '',
        'qr_code'=>$url,
        'static_text'=>'',
    ];
    $version['Fields'] = $fields;
    return [
        'license'=>$license,
        'template'=>['ID'=>$version['TemplateID'],'TemplateName'=>$version['TemplateName'],'LicenseTypeID'=>$version['TemplateLicenseTypeID'],'IsDefault'=>$version['IsDefault']],
        'version'=>$version,
        'fields'=>$fields,
        'values'=>$values,
        'verification'=>['token'=>$token,'url'=>$url],
    ];
}

function fl_public_verify(string $token): void
{
    fl_ensure();
    $row = db_row(fl_license_select() . ' JOIN forklift_verification_tokens vt ON vt.LicenseID=l.ID WHERE vt.Token=? AND vt.IsActive=1 AND vt.RevokedAt IS NULL AND l.DeletedAt IS NULL LIMIT 1', [$token]);
    $wantsHtml = strpos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') !== false;
    if (!$row) {
        if ($wantsHtml) fl_verify_html(['success'=>false,'message'=>'Verification token not found.'],404);
        json_response(['success'=>false,'message'=>'Verification token not found.'],404);
    }
    db_execute('UPDATE forklift_verification_tokens SET LastAccessedAt=NOW(),AccessCount=AccessCount+1 WHERE Token=?', [$token]);
    $license = fl_attach_effective([$row])[0];
    $payload = ['success'=>true,'data'=>[
        'valid'=>in_array($license['EffectiveStatus'], ['ACTIVE','EXPIRING_SOON'], true),
        'status'=>$license['EffectiveStatus'],
        'EmployeeID'=>$license['EmployeeID'],
        'EmployeeName'=>$license['EmployeeName'] ?: ($license['EmployeeNameSnapshot'] ?? ''),
        'EmployeePhotoUrl'=>fl_employee_photo_url((string)$license['EmployeeID']),
        'Department'=>$license['Department'] ?: ($license['DepartmentSnapshot'] ?? ''),
        'Unit'=>$license['Unit'] ?: ($license['UnitSnapshot'] ?? ''),
        'Position'=>$license['Position'] ?: ($license['PositionSnapshot'] ?? ''),
        'LicenseType'=>$license['LicenseTypeNameTH'] ?: ($license['LicenseTypeCode'] ?? ''),
        'LicenseNo'=>$license['LicenseNo'],
        'CardNo'=>$license['CardNo'],
        'IssueDate'=>$license['IssueDate'],
        'ExpireDate'=>$license['ExpireDate'],
        'CertificateNo'=>$license['CertificateNo'],
    ]];
    if ($wantsHtml) fl_verify_html($payload);
    json_response($payload);
}

function fl_verify_html(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
    $valid = !empty($data['valid']);
    $state = (string)($data['status'] ?? (!empty($payload['success']) ? 'UNKNOWN' : 'INVALID'));
    $h = static fn($v) => htmlspecialchars((string)($v ?? ''), ENT_QUOTES, 'UTF-8');
    $rows = [
        ['Employee', (($data['EmployeeName'] ?? '-') . ' (' . ($data['EmployeeID'] ?? '-') . ')')],
        ['Department / Unit', (($data['Department'] ?? '-') . ' / ' . ($data['Unit'] ?? '-'))],
        ['Position', $data['Position'] ?? '-'],
        ['License type', $data['LicenseType'] ?? '-'],
        ['License no.', $data['LicenseNo'] ?? '-'],
        ['Card no.', $data['CardNo'] ?? '-'],
        ['Issue date', isset($data['IssueDate']) ? substr((string)$data['IssueDate'], 0, 10) : '-'],
        ['Expire date', isset($data['ExpireDate']) ? substr((string)$data['ExpireDate'], 0, 10) : '-'],
        ['Certificate no.', $data['CertificateNo'] ?? '-'],
    ];
    $rowHtml = '';
    foreach ($rows as $r) $rowHtml .= '<div class="row"><div class="label">'.$h($r[0]).'</div><div class="value">'.$h($r[1]).'</div></div>';
    $body = !empty($payload['success']) ? $rowHtml : '<p>'.$h($payload['message'] ?? 'Verification failed.').'</p>';
    $photoUrl = trim((string)($data['EmployeePhotoUrl'] ?? ''));
    $photoHtml = $photoUrl !== '' ? '<img class="photo" src="'.$h($photoUrl).'" alt="'.$h($data['EmployeeName'] ?? 'Employee photo').'">' : '';
    $headColor = $valid ? '#047857' : '#b91c1c';
    $soft = $valid ? '#ecfdf5' : '#fef2f2';
    $text = $valid ? '#047857' : '#b91c1c';
    echo '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forklift License Verification</title><style>body{margin:0;font-family:Kanit,Arial,sans-serif;background:#ecfdf5;color:#0f172a}.wrap{max-width:680px;margin:0 auto;padding:28px 16px}.card{background:#fff;border:1px solid #bbf7d0;border-radius:18px;box-shadow:0 16px 40px rgba(15,23,42,.12);overflow:hidden}.head{padding:22px;background:'.$headColor.';color:#fff}.photo{display:block;width:84px;height:104px;object-fit:cover;object-position:center;border-radius:10px;background:#fff;margin:14px 0 10px;box-shadow:0 0 0 3px rgba(255,255,255,.3)}.badge{display:inline-block;border-radius:999px;background:rgba(255,255,255,.18);padding:5px 10px;font-size:12px;font-weight:800}.title{font-size:24px;font-weight:900;margin:12px 0 4px}.body{padding:18px}.status{border-radius:14px;padding:14px;margin-bottom:14px;background:'.$soft.';color:'.$text.';font-weight:900}.row{display:grid;grid-template-columns:150px 1fr;gap:10px;padding:11px 0;border-bottom:1px solid #e2e8f0}.label{color:#64748b;font-size:13px;font-weight:800}.value{font-weight:800}.foot{padding:14px 18px;background:#f8fafc;color:#64748b;font-size:12px}@media(max-width:520px){.row{grid-template-columns:1fr}.label{font-size:12px}.title{font-size:20px}}</style></head><body><main class="wrap"><section class="card"><div class="head"><span class="badge">TSH Safety Core</span>'.$photoHtml.'<h1 class="title">Forklift License Verification</h1><div>'.$h($data['EmployeeName'] ?? ($payload['message'] ?? '-')).'</div></div><div class="body"><div class="status">'.($valid ? 'VALID' : 'NOT VALID').' · '.$h($state).'</div>'.$body.'</div><div class="foot">This page verifies the current forklift license status from TSH Safety Core Activity.</div></section></main></body></html>';
    exit;
}

function handle_forklift_routes(string $method, string $path): bool
{
    if (strpos($path, '/forklift') !== 0) return false;
    $verify = route_params($path, '/forklift/verify/:token');
    if ($verify !== null && $method === 'GET') { fl_public_verify((string)$verify['token']); }
    $user = require_user(); fl_ensure();
    if ($method === 'GET' && $path === '/forklift/permissions') {
        $data=[]; foreach(fl_permissions() as $p) $data[$p]=fl_has_permission($user,$p); $data['IS_ADMIN']=fl_is_admin($user); json_response(['success'=>true,'data'=>$data]);
    }
    fl_require_permission($user, 'FORKLIFT_VIEW');
    if ($method === 'GET' && $path === '/forklift/license-types') json_response(['success'=>true,'data'=>db_rows('SELECT * FROM forklift_license_types ORDER BY SortOrder,NameTH')]);
    if ($method === 'GET' && $path === '/forklift/employees') {
        $q = '%' . fl_text($_GET['q'] ?? '', 100) . '%'; $limit = max(1, min(50, (int)($_GET['limit'] ?? 20)));
        json_response(['success'=>true,'data'=>db_rows("SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position FROM employees WHERE (?='%%' OR EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Unit LIKE ? OR Position LIKE ?) ORDER BY EmployeeName LIMIT $limit", [$q,$q,$q,$q,$q,$q])]);
    }
    if ($method === 'GET' && $path === '/forklift/dashboard') {
        $rows = fl_attach_type_names(fl_attach_effective(db_rows(fl_license_select() . " WHERE l.DeletedAt IS NULL")));
        $counts=['distinctEmployees'=>0,'total'=>count($rows),'forklift'=>0,'stacker'=>0,'active'=>0,'expiring60'=>0,'expiring30'=>0,'expiring7'=>0,'expired'=>0,'suspended'=>0];
        $emp=[]; $byType=[]; $byDept=[]; $byUnit=[];
        foreach($rows as $r){ $emp[$r['EmployeeID']]=1; $codes=array_map(static fn($t)=>$t['Code']??'', $r['LicenseTypes']??[]); $code=$r['LicenseTypeCode']??''; if(in_array('FORKLIFT',$codes,true)||$code==='FORKLIFT')$counts['forklift']++; if(in_array('STACKER',$codes,true)||$code==='STACKER')$counts['stacker']++; $st=$r['EffectiveStatus']; if($st==='ACTIVE')$counts['active']++; if($st==='EXPIRED')$counts['expired']++; if($st==='SUSPENDED')$counts['suspended']++; $days=(strtotime($r['ExpireDate'])-strtotime(date('Y-m-d')))/86400; if($days>=0&&$days<=60)$counts['expiring60']++; if($days>=0&&$days<=30)$counts['expiring30']++; if($days>=0&&$days<=7)$counts['expiring7']++; $type=$r['LicenseTypeNames']?:($r['LicenseTypeNameTH']??($r['LicenseTypeCode']??'Unknown')); $byType[$type]=($byType[$type]??0)+1; $d=$r['Department']?:$r['DepartmentSnapshot']?:'ไม่ระบุ'; $u=$r['Unit']?:$r['UnitSnapshot']?:'ไม่ระบุ'; $byDept[$d]=($byDept[$d]??0)+1; $byUnit[$u]=($byUnit[$u]??0)+1; }
        $counts['distinctEmployees']=count($emp);
        $alerts = [
            'expired' => array_values(array_filter($rows, static fn($r) => ($r['EffectiveStatus'] ?? '') === 'EXPIRED')),
            'urgent7' => array_values(array_filter($rows, static function ($r) {
                $days = (strtotime((string)$r['ExpireDate']) - strtotime(date('Y-m-d'))) / 86400;
                return $days >= 0 && $days <= 7;
            })),
            'missingCertificate' => array_values(array_filter($rows, static fn($r) => trim((string)($r['CertificateNo'] ?? '')) === '')),
        ];
        json_response(['success'=>true,'data'=>['counts'=>$counts,'byType'=>$byType,'byDepartment'=>$byDept,'byUnit'=>$byUnit,'recent'=>array_slice($rows,0,8),'alerts'=>['expired'=>array_slice($alerts['expired'],0,10),'urgent7'=>array_slice($alerts['urgent7'],0,10),'missingCertificate'=>array_slice($alerts['missingCertificate'],0,10)]]]);
    }
    if ($method === 'GET' && $path === '/forklift/settings') { json_response(['success'=>true,'data'=>fl_settings_map()]); }
    if ($method === 'PUT' && $path === '/forklift/settings') {
        fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE'); $b=json_body();
        $allowed=['expiry_warn_days_primary'=>[1,365],'expiry_warn_days_secondary'=>[1,365],'expiry_warn_days_urgent'=>[0,90],'default_validity_months'=>[1,120],'document_max_upload_mb'=>[1,20],'request_sla_days'=>[1,30]];
        foreach($allowed as $key=>$range){ if(!array_key_exists($key,$b))continue; $value=max($range[0],min($range[1],(int)$b[$key])); db_execute('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)',[$key,(string)$value]); }
        if(array_key_exists('approval_queue_enabled',$b)){ $value=!empty($b['approval_queue_enabled'])&&$b['approval_queue_enabled']!=='0'?'1':'0'; db_execute('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)',['approval_queue_enabled',$value]); }
        fl_audit($user,'UPDATE_SETTINGS','forklift_settings','global',$b); json_response(['success'=>true,'data'=>fl_settings_map()]);
    }
    if ($method === 'POST' && $path === '/forklift/settings/manager-signature') {
        fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE'); fl_validate_upload_size('signature'); $files=p5_store_files('signature',1); if(!$files)json_response(['success'=>false,'message'=>'No signature uploaded.'],400); $guard=fl_upload_guard($files); $file=$files[0]; if(!in_array($file['type']??'', ['image/jpeg','image/png','image/webp'],true))json_response(['success'=>false,'message'=>'Signature must be JPG, PNG, or WebP.'],400); db_execute('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)',['manager_signature_url',$file['url']??'']); fl_upload_persist($guard); fl_audit($user,'UPDATE_SETTINGS','forklift_settings','manager_signature_url',['file'=>$file['name']??'signature']); json_response(['success'=>true,'data'=>fl_settings_map()]);
    }
    if ($method === 'DELETE' && $path === '/forklift/settings/manager-signature') {
        fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE');
        db_execute('INSERT INTO forklift_settings(SettingKey,SettingValue) VALUES(?,?) ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)', ['manager_signature_url', '']);
        fl_audit($user,'UPDATE_SETTINGS','forklift_settings','manager_signature_url',['removed'=>true]);
        json_response(['success'=>true,'data'=>fl_settings_map()]);
    }
    if ($method === 'GET' && $path === '/forklift/reports') { fl_require_permission($user,'FORKLIFT_EXPORT'); $data=fl_report_data($_GET); $data['generatedAt']=date('c'); json_response(['success'=>true,'data'=>$data]); }
    if ($method === 'GET' && $path === '/forklift/audit') {
        fl_require_permission($user,'FORKLIFT_AUDIT_VIEW'); $where=["Module='forklift'"]; $p=[];
        if(!empty($_GET['action'])&&$_GET['action']!=='all'){ $where[]='Action=?'; $p[]=fl_text($_GET['action'],80); }
        if(!empty($_GET['targetId'])){ $where[]='TargetID=?'; $p[]=fl_text($_GET['targetId'],100); }
        $limit=max(1,min(200,(int)($_GET['limit']??50)));
        $rows=db_rows('SELECT id,ActionTime,AdminID,AdminName,Role,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata FROM admin_auditlogs WHERE '.implode(' AND ',$where)." ORDER BY ActionTime DESC,id DESC LIMIT $limit",$p);
        foreach($rows as &$r)$r['Metadata']=json_decode((string)($r['Metadata']??'{}'),true)?:[]; unset($r);
        json_response(['success'=>true,'data'=>$rows]);
    }
    if ($method === 'GET' && $path === '/forklift/reminder-queue') { fl_require_permission($user,'FORKLIFT_EXPORT'); $rows=fl_reminder_queue($_GET); json_response(['success'=>true,'data'=>['rows'=>$rows,'ready'=>count(array_filter($rows,static fn($r)=>$r['readiness']==='ready')),'missingEmail'=>count(array_filter($rows,static fn($r)=>$r['readiness']==='missing_email')),'sentToday'=>count(array_filter($rows,static fn($r)=>$r['readiness']==='already_sent_today')),'smtpConfigured'=>mailer_smtp_configured()]]); }
    if ($method === 'POST' && $path === '/forklift/reminders/send') {
        fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE'); $b=json_body(); $rows=fl_reminder_queue($b); $keys=is_array($b['keys']??null)?array_map('strval',$b['keys']):null; $results=[];
        foreach($rows as $r){ if($r['readiness']!=='ready')continue; if($keys!==null&&!in_array((string)$r['key'],$keys,true))continue; $mail=fl_reminder_mail($r['license'],$r['eventType']); $results[]=['key'=>$r['key'],'licenseId'=>$r['license']['ID'],'recipients'=>$r['recipients']] + fl_queue_email(['LicenseID'=>$r['license']['ID'],'EmployeeID'=>$r['license']['EmployeeID'],'EventType'=>$r['eventType'],'Recipients'=>implode(',',$r['recipients']),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]); }
        fl_audit($user,'SEND_REMINDERS','forklift_email','bulk',['requested'=>$keys?count($keys):'all','queued'=>count($results)]);
        json_response(['success'=>true,'data'=>['queued'=>count($results),'results'=>$results,'smtpConfigured'=>mailer_smtp_configured()]]);
    }
    if ($method === 'GET' && $path === '/forklift/email-outbox') {
        fl_require_permission($user,'FORKLIFT_AUDIT_VIEW'); $where=[]; $p=[]; if(!empty($_GET['status'])&&$_GET['status']!=='all'){$where[]='Status=?';$p[]=fl_text($_GET['status'],30);} $limit=max(1,min(200,(int)($_GET['limit']??50))); $sql='SELECT id,LicenseID,EmployeeID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM Forklift_EmailOutbox'.($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY CreatedAt DESC,id DESC LIMIT $limit"; json_response(['success'=>true,'data'=>db_rows($sql,$p),'smtpConfigured'=>mailer_smtp_configured()]);
    }
    if ($method === 'POST' && $path === '/forklift/email-outbox/retry-queued') { fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE'); if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400); $b=json_body(); $r=mailer_outbox_retry_queued('Forklift_EmailOutbox','Recipients','HtmlBody',(int)($b['limit']??20)); json_response(['success'=>true,'data'=>$r,'processed'=>$r['processed']]); }
    $emRetry=route_params($path,'/forklift/email-outbox/:id/retry');
    if($emRetry!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_SETTINGS_MANAGE'); if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400); $r=mailer_outbox_send('Forklift_EmailOutbox',(int)$emRetry['id'],'Recipients','HtmlBody'); json_response(['success'=>true,'data'=>$r]); }
    if ($method === 'POST' && $path === '/forklift/licenses/bulk-renew') {
        fl_require_permission($user,'FORKLIFT_RENEW'); $b=json_body(); $ids=array_values(array_unique(array_filter(array_map('intval', is_array($b['ids']??null)?$b['ids']:[]), static fn($v)=>$v>0))); if(!$ids)json_response(['success'=>false,'message'=>'No licenses selected.'],400);
        $newIssue=fl_date($b['NewIssueDate']??$b['IssueDate']??null); $newExpire=fl_date($b['NewExpireDate']??$b['ExpireDate']??null); if(!$newIssue||!$newExpire||strtotime($newExpire)<strtotime($newIssue))json_response(['success'=>false,'message'=>'ข้อมูลการต่ออายุไม่ถูกต้อง'],400);
        $results=[]; $ok=0; $fail=0; $pdo=db();
        foreach($ids as $id){ try{ $pdo->beginTransaction(); $row=db_row('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$id]); if(!$row)throw new Exception('License not found.'); $newCert=fl_text($b['NewCertificateNo']??$b['CertificateNo']??'',120)?:($row['CertificateNo']??null); $note=$b['RenewalNote']??'Bulk renewal campaign'; $stmt=$pdo->prepare('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)'); $stmt->execute([$id,$row['IssueDate'],$newIssue,$row['ExpireDate'],$newExpire,$row['CertificateNo'],$newCert,$note,fl_user_name($user)]); $pdo->prepare("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=?,ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?")->execute([$newIssue,date('Y-m-d'),$newExpire,$newCert,fl_user_name($user),$id]); $pdo->commit(); $ok++; $results[]=['id'=>$id,'success'=>true]; }catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); $fail++; $results[]=['id'=>$id,'success'=>false,'message'=>$e->getMessage()]; } }
        fl_audit($user,'BULK_RENEW_LICENSE','forklift_license','bulk',['requested'=>count($ids),'success'=>$ok,'failed'=>$fail,'newExpireDate'=>$newExpire]);
        json_response(['success'=>true,'data'=>['requested'=>count($ids),'success'=>$ok,'failed'=>$fail,'results'=>$results]]);
    }
    if ($method === 'POST' && $path === '/forklift/licenses/bulk-status') {
        $b=json_body(); $action=strtoupper(fl_text($b['action']??'',30)); $ids=array_values(array_unique(array_filter(array_map('intval', is_array($b['ids']??null)?$b['ids']:[]), static fn($v)=>$v>0))); if(!$ids)json_response(['success'=>false,'message'=>'No licenses selected.'],400);
        if(!in_array($action,['SUSPEND','RESTORE','ARCHIVE'],true))json_response(['success'=>false,'message'=>'Invalid bulk action.'],400);
        fl_require_permission($user,$action==='ARCHIVE'?'FORKLIFT_MANAGE':'FORKLIFT_SUSPEND');
        $results=[]; $ok=0; $fail=0; $reason=fl_text($b['reason']??$b['ReviewNote']??'',500);
        foreach($ids as $id){ try{ if($action==='SUSPEND')$changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='SUSPENDED',SuspensionReason=?,SuspendedAt=NOW(),UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL",[$reason?:'Bulk suspend',fl_user_name($user),$id]); elseif($action==='RESTORE')$changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL",[fl_user_name($user),$id]); else $changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='ARCHIVED',DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL",[fl_user_name($user),$id]); if($changed!==1)throw new RuntimeException('License not found or state did not change.');$ok++; $results[]=['id'=>$id,'success'=>true]; }catch(Throwable $e){ $fail++; $results[]=['id'=>$id,'success'=>false,'message'=>$e->getMessage()]; } }
        fl_audit($user,'BULK_'.$action.'_LICENSE','forklift_license','bulk',['requested'=>count($ids),'success'=>$ok,'failed'=>$fail,'reason'=>$reason]);
        json_response(['success'=>true,'data'=>['requested'=>count($ids),'success'=>$ok,'failed'=>$fail,'results'=>$results]]);
    }
    if ($method === 'GET' && $path === '/forklift/requests') {
        fl_require_permission($user,'FORKLIFT_REQUEST'); $manage=fl_has_permission($user,'FORKLIFT_MANAGE')||fl_has_permission($user,'FORKLIFT_APPROVE');
        $where=[]; $p=[];
        if(!$manage){$where[]='(r.EmployeeID=? OR r.RequestedByID=?)';$p[]=fl_user_id($user);$p[]=fl_user_id($user);}
        if(!empty($_GET['status'])&&$_GET['status']!=='all'){ $where[]='r.RequestStatus=?'; $p[]=strtoupper(fl_text($_GET['status'],30)); }
        if(!empty($_GET['kind'])&&$_GET['kind']!=='all'){ $where[]='r.RequestKind=?'; $p[]=strtoupper(fl_text($_GET['kind'],20)); }
        if(($_GET['overdue']??'')==='1'){ $sla=max(1,min(30,(int)(db_row("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1")['SettingValue']??3)));$where[]="r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?";$p[]=$sla; }
        if(!empty($_GET['q'])){ $where[]='(r.RequestNo LIKE ? OR r.EmployeeID LIKE ? OR e.EmployeeName LIKE ?)'; $q='%'.fl_text($_GET['q'],100).'%'; array_push($p,$q,$q,$q); }
        $limit=max(1,min(200,(int)($_GET['limit']??100)));
        $sql=fl_request_select().($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY CASE r.RequestStatus WHEN 'SUBMITTED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'RETURNED' THEN 3 WHEN 'DRAFT' THEN 4 WHEN 'APPROVED' THEN 5 WHEN 'REJECTED' THEN 6 ELSE 7 END,COALESCE(r.SubmittedAt,r.RequestedAt) DESC,r.ID DESC LIMIT $limit";
        json_response(['success'=>true,'data'=>fl_attach_type_names(db_rows($sql,$p),'forklift_request_type_map','RequestID')]);
    }
    if ($method === 'GET' && $path === '/forklift/request-profile') { fl_require_permission($user,'FORKLIFT_REQUEST'); $emp=fl_employee(fl_user_id($user)); if(!$emp)json_response(['success'=>false,'message'=>'ไม่พบข้อมูลผู้ใช้ใน Employee Master'],404); json_response(['success'=>true,'data'=>$emp]); }
    if ($method === 'POST' && $path === '/forklift/requests') {
        fl_require_permission($user,'FORKLIFT_REQUEST'); $b=json_body(); $manage=fl_has_permission($user,'FORKLIFT_MANAGE'); $employeeId=$manage?fl_text($b['EmployeeID']??'',50):fl_user_id($user); $emp=fl_employee($employeeId); if(!$emp)json_response(['success'=>false,'message'=>'ไม่พบพนักงานใน Employee Master'],404);
        $typeIds=fl_type_ids_from($b); $type=(int)($typeIds[0]??0); $issue=fl_date($b['IssueDate']??null); $expire=fl_date($b['ExpireDate']??null); if($type<=0||!$issue||!$expire||strtotime($expire)<strtotime($issue))json_response(['success'=>false,'message'=>'ข้อมูลคำขอใบอนุญาตไม่ถูกต้อง'],400);
        if(fl_has_active_license_type($emp['EmployeeID'],$typeIds))json_response(['success'=>false,'message'=>'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว'],409);
        if(fl_has_pending_request_type($emp['EmployeeID'],$typeIds))json_response(['success'=>false,'message'=>'มีคำขอที่รออนุมัติอยู่แล้ว'],409);
        $pdo=db(); try{$pdo->beginTransaction(); $requestNo=fl_next_no($pdo,'REQUEST','FLR'); $stmt=$pdo->prepare("INSERT INTO forklift_license_requests(RequestNo,RequestKind,EmployeeID,LicenseTypeID,IssueDate,ExpireDate,CertificateNo,RequestStatus,RequestNote,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,RequestedBy,RequestedByID) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"); $stmt->execute([$requestNo,'NEW',$emp['EmployeeID'],$type,$issue,$expire,fl_text($b['CertificateNo']??'',120)?:null,'DRAFT',$b['Note']??$b['RequestNote']??null,$emp['EmployeeName'],$emp['Department'],$emp['Unit'],$emp['Position'],fl_user_name($user),fl_user_id($user)]); $id=(int)$pdo->lastInsertId(); fl_sync_type_map($pdo,'forklift_request_type_map','RequestID',$id,$typeIds); fl_request_event($id,'CREATED',null,'DRAFT','',$user); $pdo->commit(); fl_audit($user,'CREATE_REQUEST_DRAFT','forklift_license_request',$id,['RequestNo'=>$requestNo,'EmployeeID'=>$emp['EmployeeID']],201); json_response(['success'=>true,'id'=>$id,'RequestNo'=>$requestNo,'RequestStatus'=>'DRAFT'],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    $renewalDraft=route_params($path,'/forklift/licenses/:id/renewal-request');
    if($renewalDraft!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_REQUEST');
        $license=db_row('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$renewalDraft['id']]);
        if(!$license)json_response(['success'=>false,'message'=>'License not found.'],404);
        if(!fl_has_permission($user,'FORKLIFT_MANAGE')&&(string)$license['EmployeeID']!==fl_user_id($user))json_response(['success'=>false,'message'=>'You can only renew your own license.'],403);
        $existing=db_row("SELECT ID FROM forklift_license_requests WHERE SourceLicenseID=? AND RequestKind='RENEWAL' AND RequestStatus IN ('DRAFT','RETURNED','SUBMITTED','UNDER_REVIEW','PENDING') LIMIT 1",[$license['ID']]);
        if($existing)json_response(['success'=>false,'message'=>'A renewal request is already open for this license.','id'=>$existing['ID']],409);
        $body=json_body();$body['RequestStatus']='DRAFT';$issue=fl_date($body['NewIssueDate']??$body['IssueDate']??null);$expire=fl_date($body['NewExpireDate']??$body['ExpireDate']??null);
        if(!$issue||!$expire||strtotime($expire)<strtotime($issue))json_response(['success'=>false,'message'=>'Invalid renewal dates.'],400);
        $emp=fl_employee((string)$license['EmployeeID']);
        $mapped=db_rows('SELECT LicenseTypeID FROM forklift_license_type_map WHERE LicenseID=? ORDER BY ID ASC',[$license['ID']]);
        $typeIds=$mapped?array_map(static fn($row)=>(int)$row['LicenseTypeID'],$mapped):[(int)$license['LicenseTypeID']];
        $pdo=db();try{$pdo->beginTransaction();$requestNo=fl_next_no($pdo,'REQUEST','FLR');$stmt=$pdo->prepare("INSERT INTO forklift_license_requests(RequestNo,RequestKind,SourceLicenseID,EmployeeID,LicenseTypeID,IssueDate,ExpireDate,CertificateNo,RequestStatus,RequestNote,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,RequestedBy,RequestedByID) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");$stmt->execute([$requestNo,'RENEWAL',$license['ID'],$license['EmployeeID'],$license['LicenseTypeID'],$issue,$expire,fl_text($body['NewCertificateNo']??$body['CertificateNo']??'',120)?:$license['CertificateNo'],$body['RequestStatus']??'DRAFT',$body['RenewalNote']??$body['Note']??null,$emp['EmployeeName']??$license['EmployeeNameSnapshot'],$emp['Department']??$license['DepartmentSnapshot'],$emp['Unit']??$license['UnitSnapshot'],$emp['Position']??$license['PositionSnapshot'],fl_user_name($user),fl_user_id($user)]);$id=(int)$pdo->lastInsertId();fl_sync_type_map($pdo,'forklift_request_type_map','RequestID',$id,$typeIds);fl_request_event($id,'RENEWAL_DRAFT_CREATED',null,'DRAFT','License '.($license['LicenseNo']??$license['ID']),$user);$pdo->commit();fl_audit($user,'CREATE_RENEWAL_REQUEST_DRAFT','forklift_license_request',$id,['SourceLicenseID'=>$license['ID'],'EmployeeID'=>$license['EmployeeID']],201);json_response(['success'=>true,'id'=>$id,'RequestNo'=>$requestNo,'RequestStatus'=>'DRAFT','RequestKind'=>'RENEWAL'],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    if($method==='GET'&&$path==='/forklift/requests/summary'){
        fl_require_permission($user,'FORKLIFT_REQUEST');$global=fl_has_permission($user,'FORKLIFT_MANAGE')||fl_has_permission($user,'FORKLIFT_APPROVE');$sla=max(1,min(30,(int)(db_row("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1")['SettingValue']??3)));$where=$global?'':' WHERE (r.EmployeeID=? OR r.RequestedByID=?)';$params=$global?[]:[fl_user_id($user),fl_user_id($user)];array_unshift($params,$sla);$row=db_row("SELECT COUNT(*) total,SUM(r.RequestStatus='DRAFT') draft,SUM(r.RequestStatus='RETURNED') returned,SUM(r.RequestStatus IN ('SUBMITTED','PENDING')) submitted,SUM(r.RequestStatus='UNDER_REVIEW') underReview,SUM(r.RequestStatus='APPROVED') approved,SUM(r.RequestStatus='REJECTED') rejected,SUM(r.RequestKind='RENEWAL') renewals,SUM(r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?) overdue,ROUND(AVG(CASE WHEN r.ReviewedAt IS NOT NULL AND r.SubmittedAt IS NOT NULL THEN TIMESTAMPDIFF(HOUR,r.SubmittedAt,r.ReviewedAt) END),1) avgReviewHours FROM forklift_license_requests r".$where,$params)?:[];$row['slaDays']=$sla;$row['scope']=$global?'ALL':'SELF';json_response(['success'=>true,'data'=>$row]);
    }
    if($method==='GET'&&$path==='/forklift/requests/overdue'){
        fl_require_permission($user,'FORKLIFT_APPROVE');$sla=max(1,min(30,(int)(db_row("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1")['SettingValue']??3)));$rows=fl_attach_type_names(db_rows(fl_request_select()." WHERE r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>? ORDER BY COALESCE(r.SubmittedAt,r.RequestedAt) ASC",[$sla]),'forklift_request_type_map','RequestID');foreach($rows as &$row){$row['AgeDays']=max(0,(int)floor((time()-strtotime((string)($row['SubmittedAt']?:$row['RequestedAt'])))/86400));$row['SlaDays']=$sla;}unset($row);json_response(['success'=>true,'data'=>$rows]);
    }
    if($method==='POST'&&$path==='/forklift/requests/escalations/send'){
        fl_require_permission($user,'FORKLIFT_APPROVE');$body=json_body();$ids=array_values(array_unique(array_filter(array_map('intval',is_array($body['ids']??null)?$body['ids']:[]))));$sla=max(1,min(30,(int)(db_row("SELECT SettingValue FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1")['SettingValue']??3)));$params=[$sla];$idSql='';if($ids){$idSql=' AND r.ID IN ('.implode(',',array_fill(0,count($ids),'?')).')';array_push($params,...$ids);}$rows=db_rows(fl_request_select()." WHERE r.RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND TIMESTAMPDIFF(DAY,COALESCE(r.SubmittedAt,r.RequestedAt),NOW())>?".$idSql.' ORDER BY r.ID',$params);$recipient=fl_admin_email();if($recipient==='')json_response(['success'=>false,'message'=>'Forklift admin email is not configured.'],400);$queued=0;foreach($rows as $row){$age=max(0,(int)floor((time()-strtotime((string)($row['SubmittedAt']?:$row['RequestedAt'])))/86400));$subject='[SLA] Forklift request '.$row['RequestNo'].' overdue '.$age.' days';$text='Forklift request '.$row['RequestNo'].' for '.($row['EmployeeName']?:$row['EmployeeID']).' is '.$age.' days old (SLA '.$sla.' days).';fl_queue_email(['EmployeeID'=>$row['EmployeeID'],'EventType'=>'ForkliftRequestSlaEscalation','Recipients'=>$recipient,'Subject'=>$subject,'Body'=>$text,'HtmlBody'=>'<p>'.htmlspecialchars($text,ENT_QUOTES,'UTF-8').'</p>']);fl_request_event((int)$row['ID'],'SLA_ESCALATED',$row['RequestStatus'],$row['RequestStatus'],$age.' days',$user);$queued++;}fl_audit($user,'ESCALATE_OVERDUE_REQUESTS','forklift_license_request','bulk',['requested'=>$ids?count($ids):'all','queued'=>$queued,'slaDays'=>$sla]);json_response(['success'=>true,'data'=>['queued'=>$queued,'slaDays'=>$sla]]);
    }
    $reqDetail=route_params($path,'/forklift/requests/:id');
    if($reqDetail!==null&&$method==='GET'){ $detail=fl_request_detail((int)$reqDetail['id'],$user);if(!$detail)json_response(['success'=>false,'message'=>'Request not found.'],404);json_response(['success'=>true,'data'=>$detail]); }
    $reqDocs=route_params($path,'/forklift/requests/:id/documents');
    if($reqDocs!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_REQUEST');$request=db_row('SELECT * FROM forklift_license_requests WHERE ID=?',[$reqDocs['id']]);if(!$request||!fl_request_can_access($user,$request))json_response(['success'=>false,'message'=>'Request not found.'],404);if(!in_array((string)$request['RequestStatus'],['DRAFT','RETURNED'],true))json_response(['success'=>false,'message'=>'Documents can only be changed in Draft or Returned status.'],409);$type=strtoupper(fl_text($_POST['DocumentType']??'',40));$meta=fl_request_document_meta($type);if(!$meta)json_response(['success'=>false,'message'=>'Invalid document type.'],400);fl_validate_upload_size('file');$files=p5_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);$guard=fl_upload_guard($files);$f=$files[0];if(!in_array($f['type']??'',$meta['mimeTypes'],true))json_response(['success'=>false,'message'=>'Invalid document type or file format.'],400);$pdo=db();try{$pdo->beginTransaction();$pdo->prepare('UPDATE forklift_request_documents SET DeletedAt=NOW(),DeletedBy=? WHERE RequestID=? AND DocumentType=? AND DeletedAt IS NULL')->execute([fl_user_name($user),$reqDocs['id'],$type]);$pdo->prepare('INSERT INTO forklift_request_documents(RequestID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)')->execute([$reqDocs['id'],$type,$f['name'],$f['stored'],$f['url'],$f['type'],$f['size'],fl_user_name($user)]);$docId=(int)$pdo->lastInsertId();fl_request_event((int)$reqDocs['id'],'DOCUMENT_UPLOADED',$request['RequestStatus'],$request['RequestStatus'],$type,$user);$pdo->commit();fl_upload_persist($guard);fl_audit($user,'UPLOAD_REQUEST_DOCUMENT','forklift_request_document',$docId,['RequestID'=>$reqDocs['id'],'DocumentType'=>$type],201);json_response(['success'=>true,'id'=>$docId],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    $reqDocDelete=route_params($path,'/forklift/request-documents/:id');
    if($reqDocDelete!==null&&$method==='DELETE'){ $doc=db_row('SELECT d.*,r.EmployeeID,r.RequestedByID,r.RequestStatus FROM forklift_request_documents d JOIN forklift_license_requests r ON r.ID=d.RequestID WHERE d.ID=? AND d.DeletedAt IS NULL',[$reqDocDelete['id']]);if(!$doc||!fl_request_can_access($user,$doc))json_response(['success'=>false,'message'=>'Document not found.'],404);if(!in_array((string)$doc['RequestStatus'],['DRAFT','RETURNED'],true))json_response(['success'=>false,'message'=>'Document cannot be removed after submission.'],409);db_execute('UPDATE forklift_request_documents SET DeletedAt=NOW(),DeletedBy=? WHERE ID=?',[fl_user_name($user),$reqDocDelete['id']]);fl_request_event((int)$doc['RequestID'],'DOCUMENT_REMOVED',$doc['RequestStatus'],$doc['RequestStatus'],$doc['DocumentType'],$user);json_response(['success'=>true]); }
    $reqSubmit=route_params($path,'/forklift/requests/:id/submit');
    if($reqSubmit!==null&&$method==='POST'){ $request=db_row('SELECT * FROM forklift_license_requests WHERE ID=?',[$reqSubmit['id']]);if(!$request||!fl_request_can_access($user,$request))json_response(['success'=>false,'message'=>'Request not found.'],404);if(!in_array((string)$request['RequestStatus'],['DRAFT','RETURNED'],true))json_response(['success'=>false,'message'=>'Request is not ready for submission.'],409);$detail=fl_request_detail((int)$reqSubmit['id'],$user);if(empty($detail['CanSubmit']))json_response(['success'=>false,'message'=>'Required documents are incomplete.','checklist'=>$detail['Checklist']],409);db_execute("UPDATE forklift_license_requests SET RequestStatus='SUBMITTED',SubmittedAt=NOW(),ReviewNote=NULL,ReturnedAt=NULL WHERE ID=?",[$reqSubmit['id']]);fl_request_event((int)$reqSubmit['id'],'SUBMITTED',$request['RequestStatus'],'SUBMITTED','',$user);$updated=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$reqSubmit['id']]);$admin=fl_admin_email();if($admin!==''){try{$mail=fl_request_mail($updated,'Pending');fl_queue_email(['EmployeeID'=>$request['EmployeeID'],'EventType'=>'ForkliftRequestSubmitted','Recipients'=>$admin,'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}fl_audit($user,'SUBMIT_REQUEST','forklift_license_request',$reqSubmit['id']);json_response(['success'=>true]); }
    $reqReview=route_params($path,'/forklift/requests/:id/start-review');
    if($reqReview!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_APPROVE');$request=db_row('SELECT * FROM forklift_license_requests WHERE ID=?',[$reqReview['id']]);if(!$request||!in_array((string)$request['RequestStatus'],['SUBMITTED','PENDING'],true))json_response(['success'=>false,'message'=>'Request is not awaiting review.'],409);db_execute("UPDATE forklift_license_requests SET RequestStatus='UNDER_REVIEW',ReviewedBy=?,ReviewStartedAt=NOW() WHERE ID=?",[fl_user_name($user),$reqReview['id']]);fl_request_event((int)$reqReview['id'],'REVIEW_STARTED',$request['RequestStatus'],'UNDER_REVIEW','',$user);json_response(['success'=>true]); }
    $reqReturn=route_params($path,'/forklift/requests/:id/return');
    if($reqReturn!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_APPROVE');$b=json_body();$note=fl_text($b['ReviewNote']??$b['reason']??'',1000);if($note==='')json_response(['success'=>false,'message'=>'Return reason is required.'],400);$request=db_row('SELECT * FROM forklift_license_requests WHERE ID=?',[$reqReturn['id']]);if(!$request||!in_array((string)$request['RequestStatus'],['SUBMITTED','UNDER_REVIEW','PENDING'],true))json_response(['success'=>false,'message'=>'Request cannot be returned.'],409);db_execute("UPDATE forklift_license_requests SET RequestStatus='RETURNED',ReviewNote=?,ReviewedBy=?,ReturnedAt=NOW() WHERE ID=?",[$note,fl_user_name($user),$reqReturn['id']]);fl_request_event((int)$reqReturn['id'],'RETURNED',$request['RequestStatus'],'RETURNED',$note,$user);$updated=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$reqReturn['id']]);$email=fl_valid_email($updated['CompanyEmail']??'');if($email!==''){try{$mail=fl_request_mail($updated,'Returned');fl_queue_email(['EmployeeID'=>$updated['EmployeeID'],'EventType'=>'ForkliftRequestReturned','Recipients'=>$email,'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}fl_audit($user,'RETURN_REQUEST','forklift_license_request',$reqReturn['id'],['ReviewNote'=>$note]);json_response(['success'=>true]); }
    $renewalApprove=route_params($path,'/forklift/requests/:id/approve');
    if($renewalApprove!==null&&$method==='POST'){
        $candidate=db_row('SELECT * FROM forklift_license_requests WHERE ID=?',[$renewalApprove['id']]);
        if($candidate&&strtoupper((string)($candidate['RequestKind']??''))==='RENEWAL'){
            fl_require_permission($user,'FORKLIFT_APPROVE');
            if(!in_array((string)$candidate['RequestStatus'],['SUBMITTED','UNDER_REVIEW','PENDING'],true))json_response(['success'=>false,'message'=>'Request is not ready for approval.'],409);
            $body=json_body();$overrideReason=fl_text($body['OverrideReason']??'',500);$selfApproval=(string)($candidate['RequestedByID']?:$candidate['EmployeeID'])===fl_user_id($user);
            if($selfApproval&&!(strcasecmp(fl_role($user),'Admin')===0&&$overrideReason!==''))json_response(['success'=>false,'message'=>'The requester cannot approve this request. Admin override requires a reason.'],403);
            $docs=db_rows('SELECT DocumentType FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL',[$renewalApprove['id']]);$present=[];foreach($docs as $doc)$present[(string)$doc['DocumentType']]=true;$missing=[];foreach(fl_request_required_documents($candidate) as $item){if(empty($present[$item['type']]))$missing[]=$item;}if($missing){$checklist=[];foreach(fl_request_document_items($candidate) as $item)$checklist[]=$item+['complete'=>!empty($present[$item['type']])];json_response(['success'=>false,'message'=>'Required documents are incomplete.','checklist'=>$checklist],409);}
            $pdo=db();try{
                $pdo->beginTransaction();
                $stmt=$pdo->prepare('SELECT * FROM forklift_license_requests WHERE ID=? FOR UPDATE');$stmt->execute([$renewalApprove['id']]);$request=$stmt->fetch(PDO::FETCH_ASSOC);
                $stmt=$pdo->prepare('SELECT * FROM forklift_licenses WHERE ID=? AND EmployeeID=? AND DeletedAt IS NULL FOR UPDATE');$stmt->execute([$request['SourceLicenseID'],$request['EmployeeID']]);$source=$stmt->fetch(PDO::FETCH_ASSOC);
                if(!$source){$pdo->rollBack();json_response(['success'=>false,'message'=>'Source license is unavailable for renewal.'],409);}
                $pdo->prepare('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$source['ID'],$source['IssueDate'],$request['IssueDate'],$source['ExpireDate'],$request['ExpireDate'],$source['CertificateNo'],$request['CertificateNo']?:$source['CertificateNo'],$request['RequestNote']??$body['ReviewNote']??null,fl_user_name($user)]);
                $pdo->prepare("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=CURDATE(),ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?")->execute([$request['IssueDate'],$request['ExpireDate'],$request['CertificateNo']?:$source['CertificateNo'],fl_user_name($user),$source['ID']]);
                $copiedDocumentCount=fl_carry_over_request_documents($pdo,(int)$renewalApprove['id'],(int)$source['ID'],(string)$request['EmployeeID'],fl_user_name($user));
                $pdo->prepare("UPDATE forklift_license_requests SET RequestStatus='APPROVED',ReviewNote=?,LicenseID=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=?")->execute([$body['ReviewNote']??$overrideReason?:null,$source['ID'],fl_user_name($user),$renewalApprove['id']]);
                fl_request_event((int)$renewalApprove['id'],'APPROVED',$request['RequestStatus'],'APPROVED',$body['ReviewNote']??$overrideReason,$user);
                $pdo->commit();
                $requestFull=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$renewalApprove['id']]);$license=db_row(fl_license_select().' WHERE l.ID=? LIMIT 1',[$source['ID']]);$recipients=[];$email=fl_valid_email($requestFull['CompanyEmail']??'');$admin=fl_admin_email();if($email!=='')$recipients[]=$email;if($admin!==''&&!in_array($admin,$recipients,true))$recipients[]=$admin;if($recipients){try{$mail=fl_request_mail($requestFull,'Approved',$license);fl_queue_email(['LicenseID'=>$source['ID'],'EmployeeID'=>$requestFull['EmployeeID'],'EventType'=>'ForkliftRenewalRequestApproved','Recipients'=>implode(',',$recipients),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}
                fl_audit($user,'APPROVE_RENEWAL_REQUEST','forklift_license_request',$renewalApprove['id'],['LicenseID'=>$source['ID'],'LicenseNo'=>$source['LicenseNo'],'copiedDocumentCount'=>$copiedDocumentCount]);
                json_response(['success'=>true,'id'=>(int)$source['ID'],'LicenseNo'=>$source['LicenseNo'],'CardNo'=>$source['CardNo'],'RequestKind'=>'RENEWAL','copiedDocumentCount'=>$copiedDocumentCount]);
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }
    }
    $reqApprove=route_params($path,'/forklift/requests/:id/approve');
    if($reqApprove!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_APPROVE');
        $b=json_body();
        $pdo=db();
        try{
            $pdo->beginTransaction();
            $stmt=$pdo->prepare('SELECT * FROM forklift_license_requests WHERE ID=? FOR UPDATE');
            $stmt->execute([$reqApprove['id']]);
            $req=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$req){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request not found.'],404);}
            if(!in_array((string)$req['RequestStatus'],['SUBMITTED','UNDER_REVIEW','PENDING'],true)){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request is not ready for approval.'],409);}
            $overrideReason=fl_text($b['OverrideReason']??'',500);
            $selfApproval=(string)($req['RequestedByID']?:$req['EmployeeID'])===fl_user_id($user);
            if($selfApproval&&!(strcasecmp(fl_role($user),'Admin')===0&&$overrideReason!=='')){$pdo->rollBack();json_response(['success'=>false,'message'=>'The requester cannot approve this request. Admin override requires a reason.'],403);}
            $docsStmt=$pdo->prepare('SELECT DocumentType FROM forklift_request_documents WHERE RequestID=? AND DeletedAt IS NULL');
            $docsStmt->execute([$reqApprove['id']]);
            $present=[];foreach($docsStmt->fetchAll(PDO::FETCH_ASSOC) as $doc)$present[(string)$doc['DocumentType']]=true;
            $missing=[];foreach(fl_request_required_documents($req) as $item){if(empty($present[$item['type']]))$missing[]=$item;}
            if($missing){$checklist=[];foreach(fl_request_document_items($req) as $item)$checklist[]=$item+['complete'=>!empty($present[$item['type']])];$pdo->rollBack();json_response(['success'=>false,'message'=>'Required documents are incomplete.','checklist'=>$checklist],409);}
            $requestTypes=db_rows('SELECT LicenseTypeID FROM forklift_request_type_map WHERE RequestID=? ORDER BY ID ASC',[$reqApprove['id']]);
            $typeIds=$requestTypes?array_map(static fn($r)=>(int)$r['LicenseTypeID'],$requestTypes):[(int)$req['LicenseTypeID']];
            if(fl_has_active_license_type($req['EmployeeID'],$typeIds)){$pdo->rollBack();json_response(['success'=>false,'message'=>'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว'],409);}
            $licenseNo=fl_next_no($pdo,'LICENSE','FL');
            $cardNo=fl_next_no($pdo,'CARD','FLC');
            $ins=$pdo->prepare('INSERT INTO forklift_licenses(EmployeeID,LicenseTypeID,LicenseNo,CardNo,IssueDate,ExpireDate,CertificateNo,CurrentStatus,Note,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $ins->execute([$req['EmployeeID'],$req['LicenseTypeID'],$licenseNo,$cardNo,$req['IssueDate'],$req['ExpireDate'],$req['CertificateNo'],'ACTIVE',$req['RequestNote'],$req['EmployeeNameSnapshot'],$req['DepartmentSnapshot'],$req['UnitSnapshot'],$req['PositionSnapshot'],fl_user_name($user)]);
            $licenseId=(int)$pdo->lastInsertId();
            fl_sync_type_map($pdo,'forklift_license_type_map','LicenseID',$licenseId,$typeIds);
            $pdo->prepare('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)')->execute([$licenseId,bin2hex(random_bytes(32))]);
            $copiedDocumentCount=fl_carry_over_request_documents($pdo,(int)$reqApprove['id'],$licenseId,(string)$req['EmployeeID'],fl_user_name($user));
            $reviewNote=fl_text($b['ReviewNote']??'',500)?:$overrideReason?:null;
            $pdo->prepare("UPDATE forklift_license_requests SET RequestStatus='APPROVED',ReviewNote=?,LicenseID=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=?")->execute([$reviewNote,$licenseId,fl_user_name($user),$reqApprove['id']]);
            fl_request_event((int)$reqApprove['id'],'APPROVED',$req['RequestStatus'],'APPROVED',$reviewNote??'',$user);
            $pdo->commit();
            $request=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$reqApprove['id']]);
            $license=db_row(fl_license_select().' WHERE l.ID=? LIMIT 1',[$licenseId]);
            $recipients=[];$email=fl_valid_email($request['CompanyEmail']??'');$admin=fl_admin_email();if($email!=='')$recipients[]=$email;if($admin!==''&&!in_array($admin,$recipients,true))$recipients[]=$admin;
            if($recipients){try{$mail=fl_request_mail($request,'Approved',$license); fl_queue_email(['LicenseID'=>$licenseId,'EmployeeID'=>$request['EmployeeID'],'EventType'=>'ForkliftRequestApproved','Recipients'=>implode(',',$recipients),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}
            fl_audit($user,'APPROVE_REQUEST','forklift_license_request',$reqApprove['id'],['LicenseID'=>$licenseId,'LicenseNo'=>$licenseNo,'copiedDocumentCount'=>$copiedDocumentCount]);
            json_response(['success'=>true,'id'=>$licenseId,'LicenseNo'=>$licenseNo,'CardNo'=>$cardNo,'copiedDocumentCount'=>$copiedDocumentCount]);
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    $reqReject=route_params($path,'/forklift/requests/:id/reject');
    if($reqReject!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_APPROVE');$b=json_body();$note=fl_text($b['ReviewNote']??$b['reason']??'',500);
        if($note==='')json_response(['success'=>false,'message'=>'Rejection reason is required.'],400);
        $pdo=db();try{$pdo->beginTransaction();$stmt=$pdo->prepare('SELECT * FROM forklift_license_requests WHERE ID=? FOR UPDATE');$stmt->execute([$reqReject['id']]);$before=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$before){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request not found.'],404);}
            if(!in_array((string)$before['RequestStatus'],['SUBMITTED','UNDER_REVIEW','PENDING'],true)){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request cannot be rejected.'],409);}
            $stmt=$pdo->prepare("UPDATE forklift_license_requests SET RequestStatus='REJECTED',ReviewNote=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=? AND RequestStatus=?");$stmt->execute([$note,fl_user_name($user),$reqReject['id'],$before['RequestStatus']]);
            if($stmt->rowCount()!==1){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request state changed before rejection.'],409);}
            fl_request_event((int)$reqReject['id'],'REJECTED',$before['RequestStatus'],'REJECTED',$note,$user);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        $request=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$reqReject['id']]);$recipients=[];$email=fl_valid_email($request['CompanyEmail']??'');$admin=fl_admin_email();if($email!=='')$recipients[]=$email;if($admin!==''&&!in_array($admin,$recipients,true))$recipients[]=$admin;if($recipients){try{$mail=fl_request_mail($request,'Rejected');fl_queue_email(['LicenseID'=>null,'EmployeeID'=>$request['EmployeeID'],'EventType'=>'ForkliftRequestRejected','Recipients'=>implode(',',$recipients),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}
        fl_audit($user,'REJECT_REQUEST','forklift_license_request',$reqReject['id'],['ReviewNote'=>$note]);json_response(['success'=>true]);
    }
    $reqCancel=route_params($path,'/forklift/requests/:id/cancel');
    if($reqCancel!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_REQUEST');$b=json_body();$note=fl_text($b['ReviewNote']??'',500);$pdo=db();try{$pdo->beginTransaction();$stmt=$pdo->prepare('SELECT * FROM forklift_license_requests WHERE ID=? FOR UPDATE');$stmt->execute([$reqCancel['id']]);$before=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$before||!fl_request_can_access($user,$before)){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request not found.'],404);}
            if(!in_array((string)$before['RequestStatus'],['DRAFT','RETURNED','SUBMITTED','PENDING'],true)){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request cannot be cancelled after review starts.'],409);}
            $stmt=$pdo->prepare("UPDATE forklift_license_requests SET RequestStatus='CANCELLED',ReviewNote=?,ReviewedBy=?,ReviewedAt=NOW() WHERE ID=? AND RequestStatus=?");$stmt->execute([$note,fl_user_name($user),$reqCancel['id'],$before['RequestStatus']]);
            if($stmt->rowCount()!==1){$pdo->rollBack();json_response(['success'=>false,'message'=>'Request state changed before cancellation.'],409);}
            fl_request_event((int)$reqCancel['id'],'CANCELLED',$before['RequestStatus'],'CANCELLED',$note,$user);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        $request=db_row(fl_request_select().' WHERE r.ID=? LIMIT 1',[$reqCancel['id']]);$recipients=[];$email=fl_valid_email($request['CompanyEmail']??'');$admin=fl_admin_email();if($email!=='')$recipients[]=$email;if($admin!==''&&!in_array($admin,$recipients,true))$recipients[]=$admin;if($recipients){try{$mail=fl_request_mail($request,'Cancelled');fl_queue_email(['LicenseID'=>null,'EmployeeID'=>$request['EmployeeID'],'EventType'=>'ForkliftRequestCancelled','Recipients'=>implode(',',$recipients),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html']]);}catch(Throwable $e){}}
        fl_audit($user,'CANCEL_REQUEST','forklift_license_request',$reqCancel['id'],['ReviewNote'=>$note]);json_response(['success'=>true]);
    }
    if ($method === 'GET' && $path === '/forklift/licenses') {
        $requestedStatus=strtoupper((string)($_GET['status']??'ALL'));
        $allowedStatuses=['ALL','ACTIVE','EXPIRING_SOON','EXPIRED','SUSPENDED','ARCHIVED'];
        if(!in_array($requestedStatus,$allowedStatuses,true))json_response(['success'=>false,'message'=>'Invalid forklift license status filter.'],400);
        $where=[]; $p=[];
        if($requestedStatus==='ALL')$where[]='l.DeletedAt IS NULL';
        else{$warningDays=(int)(safe_scalar("SELECT SettingValue FROM forklift_settings WHERE SettingKey='expiry_warn_days_primary'")??60);$where[]=fl_effective_status_where($requestedStatus,$warningDays);}
        foreach(['department'=>'e.Department','unit'=>'e.Unit'] as $k=>$col){ if(isset($_GET[$k])&&$_GET[$k]!==''&&$_GET[$k]!=='all'){ $where[]="$col=?"; $p[]=$_GET[$k]; } }
        if(isset($_GET['type'])&&$_GET['type']!==''&&$_GET['type']!=='all'){ $where[]='EXISTS (SELECT 1 FROM forklift_license_type_map lm WHERE lm.LicenseID=l.ID AND lm.LicenseTypeID=?)'; $p[]=$_GET['type']; }
        if(!empty($_GET['q'])){ $where[]='(l.EmployeeID LIKE ? OR e.EmployeeName LIKE ? OR l.LicenseNo LIKE ? OR l.CardNo LIKE ? OR l.CertificateNo LIKE ?)'; $q='%'.fl_text($_GET['q'],100).'%'; array_push($p,$q,$q,$q,$q,$q); }
        if(!empty($_GET['expireFrom'])){ $date=fl_date($_GET['expireFrom']);if(!$date)json_response(['success'=>false,'message'=>'Invalid expireFrom date.'],400);$where[]='l.ExpireDate>=?';$p[]=$date; }
        if(!empty($_GET['expireTo'])){ $date=fl_date($_GET['expireTo']);if(!$date)json_response(['success'=>false,'message'=>'Invalid expireTo date.'],400);$where[]='l.ExpireDate<=?';$p[]=$date; }
        if(isset($_GET['certificate'])&&$_GET['certificate']==='yes'){ $where[]="l.CertificateNo IS NOT NULL AND TRIM(l.CertificateNo)<>''"; }
        if(isset($_GET['certificate'])&&$_GET['certificate']==='no'){ $where[]="(l.CertificateNo IS NULL OR TRIM(l.CertificateNo)='')"; }
        $page=max(1,(int)($_GET['page']??1)); $limit=max(1,min(100,(int)($_GET['limit']??20))); $offset=($page-1)*$limit; $whereSql=' WHERE '.implode(' AND ',$where);
        $total=(int)(db_row('SELECT COUNT(*) n FROM forklift_licenses l LEFT JOIN employees e ON e.EmployeeID=l.EmployeeID'.$whereSql,$p)['n']??0);
        $rows=db_rows(fl_license_select().$whereSql.' ORDER BY '.fl_license_no_order_sql()." LIMIT $limit OFFSET $offset",$p);
        json_response(['success'=>true,'data'=>fl_attach_type_names(fl_attach_effective($rows)),'total'=>$total,'page'=>$page,'limit'=>$limit]);
    }
    $rp=route_params($path,'/forklift/licenses/:id');
    if($rp!==null&&$method==='GET'){ $row=db_row(fl_license_select().' WHERE l.ID=? LIMIT 1',[$rp['id']]); if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404); $row['EffectiveStatus']=fl_effective_status($row); json_response(['success'=>true,'data'=>fl_attach_type_names([$row])[0]]); }
    if($method==='POST'&&$path==='/forklift/licenses'){
        fl_require_permission($user,'FORKLIFT_MANAGE'); $b=json_body(); $emp=fl_employee(fl_text($b['EmployeeID']??'',50)); if(!$emp)json_response(['success'=>false,'message'=>'ไม่พบพนักงานใน Employee Master'],404);
        $typeIds=fl_type_ids_from($b); $type=(int)($typeIds[0]??0); $issue=fl_date($b['IssueDate']??null); $expire=fl_date($b['ExpireDate']??null); if($type<=0||!$issue||!$expire||strtotime($expire)<strtotime($issue))json_response(['success'=>false,'message'=>'ข้อมูลใบอนุญาตไม่ถูกต้อง'],400);
        if(fl_has_active_license_type($emp['EmployeeID'],$typeIds))json_response(['success'=>false,'message'=>'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว'],409);
        $pdo=db(); try{$pdo->beginTransaction(); $licenseNo=fl_text($b['LicenseNo']??'',80)?:fl_next_no($pdo,'LICENSE','FL'); $cardNo=fl_text($b['CardNo']??'',80)?:fl_next_no($pdo,'CARD','FLC'); $stmt=$pdo->prepare('INSERT INTO forklift_licenses(EmployeeID,LicenseTypeID,LicenseNo,CardNo,IssueDate,ExpireDate,CertificateNo,CurrentStatus,Note,EmployeeNameSnapshot,DepartmentSnapshot,UnitSnapshot,PositionSnapshot,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'); $stmt->execute([$emp['EmployeeID'],$type,$licenseNo,$cardNo,$issue,$expire,fl_text($b['CertificateNo']??'',120)?:null,fl_status($b['CurrentStatus']??'ACTIVE'),$b['Note']??null,$emp['EmployeeName'],$emp['Department'],$emp['Unit'],$emp['Position'],fl_user_name($user)]); $id=(int)$pdo->lastInsertId(); fl_sync_type_map($pdo,'forklift_license_type_map','LicenseID',$id,$typeIds); $token=bin2hex(random_bytes(32)); $pdo->prepare('INSERT INTO forklift_verification_tokens(LicenseID,Token) VALUES(?,?)')->execute([$id,$token]); $pdo->commit(); fl_audit($user,'CREATE_LICENSE','forklift_license',$id,['EmployeeID'=>$emp['EmployeeID'],'LicenseNo'=>$licenseNo],201); json_response(['success'=>true,'id'=>$id,'LicenseNo'=>$licenseNo,'CardNo'=>$cardNo],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    if($rp!==null&&$method==='PUT'){
        fl_require_permission($user,'FORKLIFT_MANAGE'); $b=json_body(); $row=db_row('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$rp['id']]); if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);
        $emp=fl_employee(fl_text($b['EmployeeID']??$row['EmployeeID'],50)); if(!$emp)json_response(['success'=>false,'message'=>'ไม่พบพนักงานใน Employee Master'],404);
        $typeIds=fl_type_ids_from($b,[(int)$row['LicenseTypeID']]); $type=(int)($typeIds[0]??0); $issue=fl_date($b['IssueDate']??$row['IssueDate']); $expire=fl_date($b['ExpireDate']??$row['ExpireDate']); if($type<=0||!$issue||!$expire||strtotime($expire)<strtotime($issue))json_response(['success'=>false,'message'=>'ข้อมูลใบอนุญาตไม่ถูกต้อง'],400);
        if(fl_has_active_license_type($emp['EmployeeID'],$typeIds,(int)$rp['id']))json_response(['success'=>false,'message'=>'พนักงานมีใบอนุญาตประเภทนี้ที่ยัง Active อยู่แล้ว'],409);
        db_execute('UPDATE forklift_licenses SET EmployeeID=?,LicenseTypeID=?,LicenseNo=?,CardNo=?,IssueDate=?,ExpireDate=?,CertificateNo=?,CurrentStatus=?,SuspensionReason=?,SuspendedAt=?,Note=?,UpdatedBy=? WHERE ID=?',[$emp['EmployeeID'],$type,fl_text($b['LicenseNo']??'',80)?:null,fl_text($b['CardNo']??'',80)?:null,$issue,$expire,fl_text($b['CertificateNo']??'',120)?:null,fl_status($b['CurrentStatus']??$row['CurrentStatus']),$b['SuspensionReason']??null,!empty($b['SuspensionReason'])?date('Y-m-d H:i:s'):($row['SuspendedAt']??null),$b['Note']??null,fl_user_name($user),$rp['id']]);
        fl_sync_type_map(db(),'forklift_license_type_map','LicenseID',(int)$rp['id'],$typeIds);
        fl_audit($user,'UPDATE_LICENSE','forklift_license',$rp['id'],['EmployeeID'=>$emp['EmployeeID'],'ExpireDate'=>$expire]);
        json_response(['success'=>true]);
    }
    if($rp!==null&&$method==='DELETE'){ fl_require_permission($user,'FORKLIFT_MANAGE'); $changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='ARCHIVED',DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL",[fl_user_name($user),$rp['id']]);if($changed!==1)json_response(['success'=>false,'message'=>'License not found or already archived.'],404);fl_audit($user,'ARCHIVE_LICENSE','forklift_license',$rp['id']); json_response(['success'=>true]); }
    $sp=route_params($path,'/forklift/licenses/:id/suspend');
    if($sp!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_SUSPEND'); $b=json_body(); $changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='SUSPENDED',SuspensionReason=?,SuspendedAt=NOW(),UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL",[$b['reason']??null,fl_user_name($user),$sp['id']]);if($changed!==1)json_response(['success'=>false,'message'=>'License not found.'],404);fl_audit($user,'SUSPEND_LICENSE','forklift_license',$sp['id'],['reason'=>$b['reason']??null]); json_response(['success'=>true]); }
    $rp2=route_params($path,'/forklift/licenses/:id/restore');
    if($rp2!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_SUSPEND'); $changed=db_execute("UPDATE forklift_licenses SET CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=? AND DeletedAt IS NULL",[fl_user_name($user),$rp2['id']]);if($changed!==1)json_response(['success'=>false,'message'=>'License not found.'],404);fl_audit($user,'RESTORE_LICENSE','forklift_license',$rp2['id']); json_response(['success'=>true]); }
    $card=route_params($path,'/forklift/licenses/:id/card');
    if($card!==null&&$method==='GET'){ $payload=fl_card_payload((int)$card['id'],isset($_GET['templateVersionId'])?(int)$_GET['templateVersionId']:null); if(!$payload)json_response(['success'=>false,'message'=>'License not found.'],404); if(empty($payload['version']))json_response(['success'=>false,'message'=>'No published card template found for this license type.'],404); json_response(['success'=>true,'data'=>$payload]); }
    $logs=route_params($path,'/forklift/licenses/:id/print-logs');
    if($logs!==null&&$method==='GET'){ $rows=db_rows('SELECT ID,LicenseID,TemplateVersionID,Action,PrintedBy,PrintedAt,RenderMetadata FROM forklift_card_print_logs WHERE LicenseID=? ORDER BY PrintedAt DESC,ID DESC LIMIT 50',[$logs['id']]); foreach($rows as &$r)$r['RenderMetadata']=json_decode((string)($r['RenderMetadata']??'{}'),true)?:[]; unset($r); json_response(['success'=>true,'data'=>$rows]); }
    $plog=route_params($path,'/forklift/licenses/:id/print-log');
    if($plog!==null&&$method==='POST'){ $b=json_body(); $action=strtoupper(fl_text($b['Action']??'PREVIEW',30)); if(!in_array($action,['PREVIEW','PRINT','EXPORT_PNG','EXPORT_PDF'],true))$action='PREVIEW'; fl_require_permission($user,($action==='EXPORT_PNG'||$action==='EXPORT_PDF')?'FORKLIFT_EXPORT':'FORKLIFT_PRINT'); if(!db_row('SELECT ID FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$plog['id']]))json_response(['success'=>false,'message'=>'License not found.'],404); $snapshot=is_array($b['Snapshot']??null)?$b['Snapshot']:[]; $meta=is_array($b['RenderMetadata']??null)?$b['RenderMetadata']:[]; db_execute('INSERT INTO forklift_card_print_logs(LicenseID,TemplateVersionID,Action,PrintedBy,SnapshotJson,RenderMetadata) VALUES(?,?,?,?,?,?)',[$plog['id'],$b['TemplateVersionID']??null,$action,fl_user_name($user),json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),json_encode($meta,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]); $logId=(int)db()->lastInsertId(); fl_audit($user,'CARD_'.$action,'forklift_license',$plog['id'],['printLogId'=>$logId,'TemplateVersionID'=>$b['TemplateVersionID']??null],201); json_response(['success'=>true,'id'=>$logId],201); }
    $ren=route_params($path,'/forklift/licenses/:id/renewals');
    if($ren!==null&&$method==='GET'){ json_response(['success'=>true,'data'=>db_rows('SELECT * FROM forklift_license_renewals WHERE LicenseID=? ORDER BY OperatedAt DESC,ID DESC',[$ren['id']])]); }
    $renew=route_params($path,'/forklift/licenses/:id/renew');
    if($renew!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_RENEW'); $b=json_body(); $row=db_row('SELECT * FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$renew['id']]); if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);
        $newIssue=fl_date($b['NewIssueDate']??$b['IssueDate']??null); $newExpire=fl_date($b['NewExpireDate']??$b['ExpireDate']??null); if(!$newIssue||!$newExpire||strtotime($newExpire)<strtotime($newIssue))json_response(['success'=>false,'message'=>'ข้อมูลการต่ออายุไม่ถูกต้อง'],400);
        $newCert=fl_text($b['NewCertificateNo']??$b['CertificateNo']??'',120)?:($row['CertificateNo']??null); $pdo=db(); try{$pdo->beginTransaction(); $stmt=$pdo->prepare('INSERT INTO forklift_license_renewals(LicenseID,OldIssueDate,NewIssueDate,OldExpireDate,NewExpireDate,OldCertificateNo,NewCertificateNo,RenewalNote,OperatedBy) VALUES(?,?,?,?,?,?,?,?,?)'); $stmt->execute([$renew['id'],$row['IssueDate'],$newIssue,$row['ExpireDate'],$newExpire,$row['CertificateNo'],$newCert,$b['RenewalNote']??null,fl_user_name($user)]); $pdo->prepare("UPDATE forklift_licenses SET IssueDate=?,LastRenewalDate=?,ExpireDate=?,CertificateNo=?,CurrentStatus='ACTIVE',SuspensionReason=NULL,SuspendedAt=NULL,UpdatedBy=? WHERE ID=?")->execute([$newIssue,date('Y-m-d'),$newExpire,$newCert,fl_user_name($user),$renew['id']]); $pdo->commit(); fl_audit($user,'RENEW_LICENSE','forklift_license',$renew['id'],['oldExpireDate'=>$row['ExpireDate'],'newExpireDate'=>$newExpire]); json_response(['success'=>true]);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    $docs=route_params($path,'/forklift/licenses/:id/documents');
    if($docs!==null&&$method==='GET'){ json_response(['success'=>true,'data'=>db_rows('SELECT * FROM forklift_license_documents WHERE LicenseID=? AND DeletedAt IS NULL ORDER BY UploadedAt DESC,ID DESC',[$docs['id']])]); }
    if($docs!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_DOCUMENT_MANAGE');$row=db_row('SELECT ID FROM forklift_licenses WHERE ID=? AND DeletedAt IS NULL',[$docs['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);fl_validate_upload_size('file');$files=p5_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);$guard=fl_upload_guard($files);$f=$files[0];$type=fl_text($_POST['DocumentType']??'certificate',50)?:'certificate';db_execute('INSERT INTO forklift_license_documents(LicenseID,DocumentType,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?,?)',[$docs['id'],$type,$f['name'],$f['stored'],$f['url'],$f['type'],$f['size'],fl_user_name($user)]);$docId=(int)db()->lastInsertId();fl_upload_persist($guard);fl_audit($user,'UPLOAD_DOCUMENT','forklift_document',$docId,['LicenseID'=>$docs['id'],'DocumentType'=>$type,'OriginalName'=>$f['name']]);json_response(['success'=>true,'id'=>$docId],201);
    }
    $photo=route_params($path,'/forklift/employees/:id/photo');
    if($photo!==null&&$method==='GET'){ $emp=fl_employee(fl_text($photo['id'],50)); if(!$emp)json_response(['success'=>false,'message'=>'Employee not found.'],404); json_response(['success'=>true,'data'=>['EmployeeID'=>$emp['EmployeeID'],'PhotoUrl'=>fl_employee_photo_url($emp['EmployeeID'])]]); }
    if($photo!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_DOCUMENT_MANAGE');$emp=fl_employee(fl_text($photo['id'],50));if(!$emp)json_response(['success'=>false,'message'=>'Employee not found.'],404);fl_validate_upload_size('photo');$files=p5_store_files('photo',1);if(!$files)json_response(['success'=>false,'message'=>'No photo uploaded.'],400);$guard=fl_upload_guard($files);$f=$files[0];if(!in_array($f['type']??'', ['image/jpeg','image/png','image/webp'],true))json_response(['success'=>false,'message'=>'Photo must be JPG, PNG, or WebP.'],400);$pdo=db();try{$pdo->beginTransaction();$pdo->prepare('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL')->execute([fl_user_name($user),$emp['EmployeeID']]);$pdo->prepare('INSERT INTO forklift_employee_photos(EmployeeID,PhotoUrl,OriginalName,StoredName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)')->execute([$emp['EmployeeID'],$f['url'],$f['name'],$f['stored'],$f['type'],$f['size'],fl_user_name($user)]);$id=(int)$pdo->lastInsertId();$pdo->commit();fl_upload_persist($guard);fl_audit($user,'UPLOAD_EMPLOYEE_PHOTO','forklift_employee_photo',$emp['EmployeeID'],['photoId'=>$id]);json_response(['success'=>true,'data'=>['EmployeeID'=>$emp['EmployeeID'],'PhotoUrl'=>$f['url'],'id'=>$id]],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    if($photo!==null&&$method==='DELETE'){ fl_require_permission($user,'FORKLIFT_DOCUMENT_MANAGE'); db_execute('UPDATE forklift_employee_photos SET DeletedAt=NOW(),DeletedBy=? WHERE EmployeeID=? AND DeletedAt IS NULL',[fl_user_name($user),fl_text($photo['id'],50)]); fl_audit($user,'DELETE_EMPLOYEE_PHOTO','forklift_employee_photo',$photo['id']); json_response(['success'=>true]); }
    $doc=route_params($path,'/forklift/documents/:docId');
    if($doc!==null&&$method==='DELETE'){ fl_require_permission($user,'FORKLIFT_DOCUMENT_MANAGE'); db_execute('UPDATE forklift_license_documents SET DeletedAt=NOW(),DeletedBy=? WHERE ID=? AND DeletedAt IS NULL',[fl_user_name($user),$doc['docId']]); fl_audit($user,'DELETE_DOCUMENT','forklift_document',$doc['docId']); json_response(['success'=>true]); }
    if($method==='GET'&&$path==='/forklift/layout-presets'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $rows=db_rows('SELECT ID,PresetName,FieldsJson,CreatedBy,CreatedAt,UpdatedBy,UpdatedAt FROM forklift_layout_presets ORDER BY PresetName'); foreach($rows as &$row){$row['fields']=json_decode((string)$row['FieldsJson'],true)?:[];unset($row['FieldsJson']);}unset($row);json_response(['success'=>true,'data'=>$rows]); }
    if($method==='POST'&&$path==='/forklift/layout-presets'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $b=json_body();$name=fl_text($b['PresetName']??'',150);$items=is_array($b['fields']??null)?$b['fields']:[];if($name===''||!$items)json_response(['success'=>false,'message'=>'PresetName and fields are required.'],400);$json=json_encode($items,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);db_execute('INSERT INTO forklift_layout_presets(PresetName,FieldsJson,CreatedBy,UpdatedBy) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE FieldsJson=VALUES(FieldsJson),UpdatedBy=VALUES(UpdatedBy)',[$name,$json,fl_user_name($user),fl_user_name($user)]);fl_audit($user,'SAVE_LAYOUT_PRESET','forklift_layout_preset',$name,['fieldCount'=>count($items)]);json_response(['success'=>true]); }
    $presetDelete=route_params($path,'/forklift/layout-presets/:id');
    if($presetDelete!==null&&$method==='DELETE'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE');db_execute('DELETE FROM forklift_layout_presets WHERE ID=?',[(int)$presetDelete['id']]);fl_audit($user,'DELETE_LAYOUT_PRESET','forklift_layout_preset',$presetDelete['id']);json_response(['success'=>true]); }
    if($method==='GET'&&$path==='/forklift/templates'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); json_response(['success'=>true,'data'=>fl_template_payload()]); }
    if($method==='POST'&&$path==='/forklift/templates'){
        fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $name=fl_text($_POST['TemplateName']??'',150); if($name==='')json_response(['success'=>false,'message'=>'TemplateName is required.'],400);
        $front=fl_template_image('FrontImage'); $guard=fl_upload_guard(array_values(array_filter([$front]))); $back=fl_template_image('BackImage',array_values(array_filter([$front]))); $guard->files=array_values(array_filter([$front,$back])); $pdo=db(); try{$pdo->beginTransaction(); $stmt=$pdo->prepare('INSERT INTO forklift_card_templates(LicenseTypeID,TemplateName,IsActive,IsDefault) VALUES(?,?,1,?)'); $stmt->execute([($_POST['LicenseTypeID']??'')!==''?(int)$_POST['LicenseTypeID']:null,$name,!empty($_POST['IsDefault'])?1:0]); $templateId=(int)$pdo->lastInsertId(); $stmt=$pdo->prepare('INSERT INTO forklift_card_template_versions(TemplateID,VersionNo,FrontImageUrl,BackImageUrl,CardWidthMm,CardHeightMm,Dpi,Status,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?)'); $stmt->execute([$templateId,1,$front['url']??null,$back['url']??null,(float)($_POST['CardWidthMm']??60),(float)($_POST['CardHeightMm']??82),(int)($_POST['Dpi']??300),'draft',fl_user_name($user)]); $versionId=(int)$pdo->lastInsertId(); fl_seed_template_fields($pdo,$versionId); $pdo->commit(); fl_upload_persist($guard); fl_audit($user,'UPDATE_TEMPLATE','forklift_card_template',$templateId,['versionId'=>$versionId],201); json_response(['success'=>true,'id'=>$templateId,'versionId'=>$versionId],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack(); if($front)p5_cleanup([$front]); if($back)p5_cleanup([$back]); throw $e;}
    }
    $tpl=route_params($path,'/forklift/templates/:id');
    if($tpl!==null&&$method==='GET'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $rows=fl_template_payload((int)$tpl['id']); if(!$rows)json_response(['success'=>false,'message'=>'Not found.'],404); json_response(['success'=>true,'data'=>$rows[0]]); }
    if($tpl!==null&&$method==='DELETE'){
        fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $templateId=(int)$tpl['id']; $row=fl_template_row($templateId); if(!$row)json_response(['success'=>false,'message'=>'Template not found.'],404);
        $used=fl_template_print_log_count($templateId); $force=(string)($_GET['force']??'')==='1';if($force&&!fl_is_admin($user))json_response(['success'=>false,'message'=>'Force delete is restricted to Admin.'],403);if($used>0&&!$force)json_response(['success'=>false,'message'=>'Template has print/export history. Archive it instead of hard delete.','printLogCount'=>$used],409);
        $pdo=db(); try{$pdo->beginTransaction(); $versions=db_rows('SELECT ID FROM forklift_card_template_versions WHERE TemplateID=?',[$templateId]); foreach($versions as $v){if($force)$pdo->prepare('DELETE FROM forklift_card_print_logs WHERE TemplateVersionID=?')->execute([(int)$v['ID']]); $pdo->prepare('DELETE FROM forklift_card_template_fields WHERE TemplateVersionID=?')->execute([(int)$v['ID']]);} $pdo->prepare('DELETE FROM forklift_card_template_versions WHERE TemplateID=?')->execute([$templateId]); $pdo->prepare('DELETE FROM forklift_card_templates WHERE ID=?')->execute([$templateId]); $pdo->commit(); fl_audit($user,$force?'DELETE_TEMPLATE_FORCE':'DELETE_TEMPLATE','forklift_card_template',$templateId,['printLogCount'=>$used,'force'=>$force]); json_response(['success'=>true]);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack(); throw $e;}
    }
    $tplArchive=route_params($path,'/forklift/templates/:id/archive');
    if($tplArchive!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $templateId=(int)$tplArchive['id']; if(!fl_template_row($templateId))json_response(['success'=>false,'message'=>'Template not found.'],404); db_execute('UPDATE forklift_card_templates SET IsActive=0,ArchivedAt=NOW(),ArchivedBy=? WHERE ID=? AND ArchivedAt IS NULL',[fl_user_name($user),$templateId]); fl_audit($user,'ARCHIVE_TEMPLATE','forklift_card_template',$templateId); json_response(['success'=>true]); }
    $tplRestore=route_params($path,'/forklift/templates/:id/restore');
    if($tplRestore!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $templateId=(int)$tplRestore['id']; if(!fl_template_row($templateId))json_response(['success'=>false,'message'=>'Template not found.'],404); db_execute('UPDATE forklift_card_templates SET IsActive=1,ArchivedAt=NULL,ArchivedBy=NULL WHERE ID=?',[$templateId]); fl_audit($user,'RESTORE_TEMPLATE','forklift_card_template',$templateId); json_response(['success'=>true]); }
    $tplActive=route_params($path,'/forklift/templates/:id/active');
    if($tplActive!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $templateId=(int)$tplActive['id']; $row=fl_template_row($templateId); if(!$row)json_response(['success'=>false,'message'=>'Template not found.'],404); if(!empty($row['ArchivedAt']))json_response(['success'=>false,'message'=>'Restore archived template before activating it.'],409); $b=json_body(); $active=!array_key_exists('IsActive',$b)||!empty($b['IsActive'])?1:0; db_execute('UPDATE forklift_card_templates SET IsActive=? WHERE ID=?',[$active,$templateId]); fl_audit($user,'UPDATE_TEMPLATE','forklift_card_template',$templateId,['IsActive'=>$active]); json_response(['success'=>true]); }
    $tplVer=route_params($path,'/forklift/templates/:id/versions');
    if($tplVer!==null&&$method==='POST'){
        fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $templateRow=fl_template_row((int)$tplVer['id']); if(!$templateRow)json_response(['success'=>false,'message'=>'Template not found.'],404); if(!empty($templateRow['ArchivedAt']))json_response(['success'=>false,'message'=>'Archived template cannot create a new version. Restore it first.'],409); $prev=db_row('SELECT * FROM forklift_card_template_versions WHERE TemplateID=? ORDER BY VersionNo DESC,ID DESC LIMIT 1',[$tplVer['id']]); if(!$prev)json_response(['success'=>false,'message'=>'Template not found.'],404);
        $front=fl_template_image('FrontImage'); $guard=fl_upload_guard(array_values(array_filter([$front]))); $back=fl_template_image('BackImage',array_values(array_filter([$front]))); $guard->files=array_values(array_filter([$front,$back])); $pdo=db(); try{$pdo->beginTransaction(); $next=(int)$prev['VersionNo']+1; $stmt=$pdo->prepare('INSERT INTO forklift_card_template_versions(TemplateID,VersionNo,FrontImageUrl,BackImageUrl,CardWidthMm,CardHeightMm,Dpi,Status,CreatedBy) VALUES(?,?,?,?,?,?,?,?,?)'); $stmt->execute([$tplVer['id'],$next,$front['url']??$prev['FrontImageUrl'],$back['url']??$prev['BackImageUrl'],$prev['CardWidthMm'],$prev['CardHeightMm'],$prev['Dpi'],'draft',fl_user_name($user)]); $versionId=(int)$pdo->lastInsertId(); $fields=db_rows('SELECT FieldKey,FieldConfig,SortOrder FROM forklift_card_template_fields WHERE TemplateVersionID=? ORDER BY SortOrder ASC',[$prev['ID']]); if($fields){$ins=$pdo->prepare('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)'); foreach($fields as $f)$ins->execute([$versionId,$f['FieldKey'],$f['FieldConfig'],$f['SortOrder']]);} else fl_seed_template_fields($pdo,$versionId); $pdo->commit(); fl_upload_persist($guard); fl_audit($user,'UPDATE_TEMPLATE','forklift_card_template',$tplVer['id'],['versionId'=>$versionId,'versionNo'=>$next],201); json_response(['success'=>true,'versionId'=>$versionId,'versionNo'=>$next],201);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack(); if($front)p5_cleanup([$front]); if($back)p5_cleanup([$back]); throw $e;}
    }
    $fields=route_params($path,'/forklift/template-versions/:versionId/fields');
    if($fields!==null&&$method==='PUT'){
        fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $ver=db_row('SELECT v.*,tpl.ArchivedAt FROM forklift_card_template_versions v JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID WHERE v.ID=? LIMIT 1',[$fields['versionId']]); if(!$ver)json_response(['success'=>false,'message'=>'Version not found.'],404); if(!empty($ver['ArchivedAt']))json_response(['success'=>false,'message'=>'Archived template cannot be edited. Restore it first.'],409); if(($ver['Status']??'')==='published'&&!fl_is_admin($user))json_response(['success'=>false,'message'=>'Published template version can only be edited by Admin.'],409);
        $b=json_body(); $items=is_array($b['fields']??null)?$b['fields']:[]; $pdo=db(); try{$pdo->beginTransaction(); $pdo->prepare('DELETE FROM forklift_card_template_fields WHERE TemplateVersionID=?')->execute([$fields['versionId']]); $stmt=$pdo->prepare('INSERT INTO forklift_card_template_fields(TemplateVersionID,FieldKey,FieldConfig,SortOrder) VALUES(?,?,?,?)'); $sort=10; foreach($items as $item){$key=fl_text($item['FieldKey']??$item['fieldKey']??'',80); if($key==='')continue; $cfg=$item['FieldConfig']??$item['config']??[]; if(!is_array($cfg))$cfg=[]; $stmt->execute([$fields['versionId'],$key,json_encode($cfg,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$sort]); $sort+=10;} $pdo->commit(); fl_audit($user,'UPDATE_TEMPLATE','forklift_card_template_version',$fields['versionId'],['fieldCount'=>count($items)]); json_response(['success'=>true]);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack(); throw $e;}
    }
    $pub=route_params($path,'/forklift/template-versions/:versionId/publish');
    if($pub!==null&&$method==='POST'){ fl_require_permission($user,'FORKLIFT_TEMPLATE_MANAGE'); $ver=db_row('SELECT v.TemplateID,tpl.ArchivedAt FROM forklift_card_template_versions v JOIN forklift_card_templates tpl ON tpl.ID=v.TemplateID WHERE v.ID=? LIMIT 1',[$pub['versionId']]); if(!$ver)json_response(['success'=>false,'message'=>'Version not found.'],404); if(!empty($ver['ArchivedAt']))json_response(['success'=>false,'message'=>'Archived template cannot be published. Restore it first.'],409); db_execute("UPDATE forklift_card_template_versions SET Status='published',PublishedAt=NOW() WHERE ID=?",[$pub['versionId']]); fl_audit($user,'UPDATE_TEMPLATE','forklift_card_template_version',$pub['versionId'],['published'=>true]); json_response(['success'=>true]); }
    return false;
}
