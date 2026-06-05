<?php
declare(strict_types=1);

function wf_user_name(array $user): string
{
    return trim((string)($user['name'] ?? $user['EmployeeName'] ?? $user['id'] ?? 'System')) ?: 'System';
}

function wf_user_id(array $user): string
{
    return trim((string)($user['id'] ?? $user['EmployeeID'] ?? $user['employeeId'] ?? '')) ?: 'unknown';
}

function wf_is_admin(array $user): bool
{
    return strcasecmp((string)($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0;
}

function wf_date($value): ?string
{
    return function_exists('p5_date') ? p5_date($value) : null;
}

function wf_bool($value): int
{
    if (function_exists('p5_bool')) return p5_bool($value);
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
}

function wf_uuid(): string
{
    return function_exists('p5_uuid') ? p5_uuid() : bin2hex(random_bytes(16));
}

function wf_json($value, array $fallback = []): array
{
    if (is_array($value)) return $value;
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function wf_put_multipart(): array
{
    static $parsed = null;
    if ($parsed !== null) return $parsed;
    $parsed = ['fields' => [], 'files' => []];
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT') return $parsed;
    $type = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (!preg_match('/boundary=(?:"([^"]+)"|([^;]+))/', $type, $match)) return $parsed;
    $boundary = $match[1] ?: trim($match[2]);
    $raw = (string)file_get_contents('php://input');
    foreach (explode('--' . $boundary, $raw) as $part) {
        $part = ltrim($part, "\r\n");
        if ($part === '' || $part === "--\r\n" || $part === '--') continue;
        $pair = explode("\r\n\r\n", $part, 2);
        if (count($pair) !== 2) continue;
        [$head, $value] = $pair;
        $value = preg_replace("/\r\n--$/", '', $value);
        if (!preg_match('/name="([^"]+)"/', $head, $nameMatch)) continue;
        $name = $nameMatch[1];
        if (!preg_match('/filename="([^"]*)"/', $head, $fileMatch)) {
            $parsed['fields'][$name] = rtrim($value, "\r\n");
            continue;
        }
        $tmp = tempnam(sys_get_temp_dir(), 'wf6-');
        file_put_contents($tmp, $value);
        $mime = 'application/octet-stream';
        if (preg_match('/Content-Type:\s*([^\r\n]+)/i', $head, $typeMatch)) $mime = trim($typeMatch[1]);
        $parsed['files'][$name] = [
            'name' => $fileMatch[1],
            'type' => $mime,
            'tmp_name' => $tmp,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($tmp) ?: 0,
            'local_tmp' => true,
        ];
    }
    return $parsed;
}

function wf_body(): array
{
    $put = wf_put_multipart();
    return $_POST ?: ($put['fields'] ?: json_body());
}

function wf_text($value, int $max = 1000): ?string
{
    $v = trim((string)($value ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $max);
}

function wf_email_outbox(string $table, array $cols): void
{
    try {
        db_execute(
            "INSERT INTO {$table} (" . implode(',', array_keys($cols)) . ") VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")",
            array_values($cols)
        );
        $id = (int) db()->lastInsertId();
        $recipientColumn = array_key_exists('Recipient', $cols) ? 'Recipient' : 'Recipients';
        mailer_outbox_best_effort($table, $id, $recipientColumn, array_key_exists('HtmlBody', $cols) ? 'HtmlBody' : null);
    } catch (Throwable $e) {
        // Email delivery is best-effort; never fail the user workflow.
    }
}

function wf_store_files(string $field, int $max = 20, int $maxBytes = 20971520): array
{
    $put = wf_put_multipart();
    if (!isset($_FILES[$field]) && !isset($put['files'][$field])) return [];
    $input = $_FILES[$field] ?? $put['files'][$field];
    $files = [];
    if (is_array($input['name'])) {
        $count = min(count($input['name']), $max);
        for ($i = 0; $i < $count; $i++) {
            $files[] = [
                'name' => $input['name'][$i],
                'type' => $input['type'][$i],
                'tmp_name' => $input['tmp_name'][$i],
                'error' => $input['error'][$i],
                'size' => $input['size'][$i],
            ];
        }
    } else {
        $files[] = $input;
    }

    $allowed = [
        'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp'], 'image/gif' => ['gif'],
        'application/pdf' => ['pdf'],
        'application/msword' => ['doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
        'application/vnd.ms-excel' => ['xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
        'application/vnd.ms-powerpoint' => ['ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx'],
        'text/plain' => ['txt'], 'text/csv' => ['csv'],
        'video/mp4' => ['mp4'], 'video/quicktime' => ['mov'], 'video/webm' => ['webm'], 'video/x-msvideo' => ['avi'],
        'video/x-matroska' => ['mkv'], 'video/mpeg' => ['mpeg', 'mpg'],
    ];

    $stored = [];
    foreach ($files as $file) {
        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        if ((int)($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'Upload failed.'], 400);
        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > $maxBytes) json_response(['success' => false, 'message' => 'Uploaded file is too large.'], 400);
        $tmp = (string)($file['tmp_name'] ?? '');
        $info = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
        $mime = $info ? (string)finfo_file($info, $tmp) : (string)($file['type'] ?? '');
        if ($info) finfo_close($info);
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!isset($allowed[$mime]) || !in_array($ext, $allowed[$mime], true)) {
            json_response(['success' => false, 'message' => 'Unsupported file type: ' . $mime], 400);
        }
        $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
        $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
        $moved = !empty($file['local_tmp']) ? rename($tmp, $target) : move_uploaded_file($tmp, $target);
        if (!$moved) json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
        if (!empty($file['local_tmp'])) @chmod($target, 0644);
        $stored[] = [
            'url' => upload_public_url($storedName, (string)$file['name']),
            'name' => clean_upload_name($file['name'] ?? $storedName),
            'stored' => $storedName,
            'type' => $mime,
            'ext' => $ext,
            'size' => $size,
        ];
    }
    return $stored;
}

function wf_cleanup_files(array $files): void
{
    foreach ($files as $f) delete_uploaded_file($f['url'] ?? null);
}

function wf_try_exec(string $sql): void
{
    try {
        db()->exec($sql);
    } catch (Throwable $e) {
        // Idempotent schema compatibility: column/index may already exist.
    }
}

function wf_ensure_cccf_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_activity (id INT AUTO_INCREMENT PRIMARY KEY,ActivityDate DATE NOT NULL,Area VARCHAR(255),Department VARCHAR(100),Description TEXT,Outcome TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_forma_worker (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeName VARCHAR(100),EmployeeID VARCHAR(50),Department VARCHAR(100),SafetyUnit VARCHAR(100) NOT NULL DEFAULT '',SubmitDate DATE NOT NULL,JobArea VARCHAR(255),Equipment VARCHAR(255),HazardDescription TEXT,HowItHappened TEXT,BodyPart VARCHAR(255),Suggestion TEXT,StopType INT,`Rank` VARCHAR(10),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_forma_permanent (id INT AUTO_INCREMENT PRIMARY KEY,SubmitterName VARCHAR(100),Department VARCHAR(100),JobArea VARCHAR(255),SubmitDate DATE NOT NULL,Summary TEXT,StopType INT,`Rank` VARCHAR(10),FileUrl TEXT,ExcelFileUrl TEXT,SignedFileUrl TEXT,SignedUploadedAt DATETIME,AssigneeID VARCHAR(50),DocumentMode VARCHAR(30) NOT NULL DEFAULT 'legacy',ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'Completed',ReviewComment TEXT,ReviewedBy VARCHAR(100),ReviewedAt DATETIME,CompletedBy VARCHAR(100),CompletedAt DATETIME,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_assignments (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50),AssigneeName VARCHAR(100) NOT NULL,Department VARCHAR(100),AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0,DueDate DATE,Note TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cccf_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_unit_targets (id INT AUTO_INCREMENT PRIMARY KEY,unit_name VARCHAR(200) NOT NULL,target_year INT NOT NULL DEFAULT 2026,yearly_target INT NOT NULL DEFAULT 1,achieved_override INT DEFAULT NULL,UpdatedBy VARCHAR(100),UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_unit_year(unit_name,target_year)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,PermanentID INT DEFAULT NULL,EventType VARCHAR(80) NOT NULL DEFAULT 'General',Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,SentAt DATETIME DEFAULT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_status(Status),KEY idx_perm(PermanentID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    wf_try_exec("ALTER TABLE cccf_forma_worker ADD COLUMN SafetyUnit VARCHAR(100) NOT NULL DEFAULT '' AFTER Department");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN StopType INT DEFAULT NULL AFTER Summary");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN `Rank` VARCHAR(10) DEFAULT NULL AFTER StopType");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN DocumentMode VARCHAR(30) NOT NULL DEFAULT 'legacy' AFTER AssigneeID");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'Completed' AFTER DocumentMode");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewComment TEXT DEFAULT NULL AFTER ReviewStatus");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewedBy VARCHAR(100) DEFAULT NULL AFTER ReviewComment");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewedAt DATETIME DEFAULT NULL AFTER ReviewedBy");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ExcelFileUrl TEXT DEFAULT NULL AFTER FileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN SignedFileUrl TEXT DEFAULT NULL AFTER ExcelFileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN SignedUploadedAt DATETIME DEFAULT NULL AFTER SignedFileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN CompletedBy VARCHAR(100) DEFAULT NULL AFTER ReviewedAt");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN CompletedAt DATETIME DEFAULT NULL AFTER CompletedBy");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN EmployeeID VARCHAR(50) DEFAULT NULL AFTER id");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0 AFTER Department");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN DueDate DATE DEFAULT NULL AFTER AllowDirectSignedPdf");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN Note TEXT DEFAULT NULL AFTER DueDate");
}

function handle_cccf_routes(string $method, string $path): bool
{
    if (strpos($path, '/cccf') !== 0) return false;
    $user = require_user(); wf_ensure_cccf_tables(); $admin = wf_is_admin($user); $actor = wf_user_name($user);
    if ($method === 'GET' && $path === '/cccf') json_response(db_rows('SELECT * FROM cccf_activity ORDER BY ActivityDate DESC,id DESC'));
    if ($method === 'POST' && $path === '/cccf/activity') { $b=json_body(); if(!wf_date($b['ActivityDate']??null)||empty($b['Area'])||empty($b['Department'])||empty($b['Description'])) json_response(['success'=>false,'message'=>'Invalid CCCF activity payload.'],400); db_execute('INSERT INTO cccf_activity (ActivityDate,Area,Department,Description,Outcome,CreatedBy) VALUES (?,?,?,?,?,?)',[wf_date($b['ActivityDate']),$b['Area'],$b['Department'],$b['Description'],$b['Outcome']??null,$actor]); json_response(['success'=>true]); }
    if ($method === 'GET' && $path === '/cccf/form-a-worker') json_response(db_rows('SELECT * FROM cccf_forma_worker ORDER BY SubmitDate DESC,id DESC'));
    if ($method === 'POST' && $path === '/cccf/form-a-worker') { $b=json_body(); if(!wf_date($b['SubmitDate']??null)||empty($b['JobArea'])||empty($b['SafetyUnit'])||empty($b['HazardDescription'])||empty($b['StopType'])||empty($b['Rank'])) json_response(['success'=>false,'message'=>'Invalid worker form payload.'],400); db_execute('INSERT INTO cccf_forma_worker (EmployeeName,EmployeeID,Department,SafetyUnit,SubmitDate,JobArea,Equipment,HazardDescription,HowItHappened,BodyPart,Suggestion,StopType,`Rank`,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$actor,wf_user_id($user),$user['department']??'',wf_text($b['SafetyUnit']??'',100),wf_date($b['SubmitDate']),wf_text($b['JobArea']??'',255),wf_text($b['Equipment']??'',255),$b['HazardDescription'],$b['HowItHappened']??null,$b['BodyPart']??null,$b['Suggestion']??null,(int)$b['StopType'],$b['Rank'],$actor]); json_response(['success'=>true]); }
    $p=route_params($path,'/cccf/form-a-worker/:id');
    if($p!==null&&($method==='PUT'||$method==='DELETE')){ $row=db_row('SELECT EmployeeID FROM cccf_forma_worker WHERE id=?',[$p['id']]); if(!$row) json_response(['success'=>false,'message'=>'Not found.'],404); if(!$admin && (string)$row['EmployeeID']!==wf_user_id($user)) json_response(['success'=>false,'message'=>'Permission denied.'],403); if($method==='DELETE'){db_execute('DELETE FROM cccf_forma_worker WHERE id=?',[$p['id']]);json_response(['success'=>true]);} $b=json_body(); db_execute('UPDATE cccf_forma_worker SET SafetyUnit=?,SubmitDate=?,JobArea=?,Equipment=?,HazardDescription=?,HowItHappened=?,BodyPart=?,Suggestion=?,StopType=?,`Rank`=? WHERE id=?',[$b['SafetyUnit']??'',wf_date($b['SubmitDate']??null),$b['JobArea']??'',$b['Equipment']??'',$b['HazardDescription']??'',$b['HowItHappened']??'',$b['BodyPart']??'',$b['Suggestion']??'',(int)($b['StopType']??0),$b['Rank']??null,$p['id']]); json_response(['success'=>true]); }
    if ($method === 'GET' && $path === '/cccf/form-a-permanent') json_response(db_rows('SELECT * FROM cccf_forma_permanent ORDER BY SubmitDate DESC,id DESC'));
    if (($method==='POST'&&$path==='/cccf/form-a-permanent')||(($p=route_params($path,'/cccf/form-a-permanent/:id'))!==null&&$method==='PUT')) { if($method==='PUT')require_admin(); $files=wf_store_files('FormFile',1); $b=wf_body(); try{ if(!wf_date($b['SubmitDate']??null)||empty($b['JobArea'])||empty($b['StopType'])||empty($b['Rank'])) json_response(['success'=>false,'message'=>'Invalid permanent form payload.'],400); $mode=$b['DocumentMode']??$b['documentMode']??'excel_review'; if(!in_array($mode,['excel_review','direct_signed','legacy'],true))$mode='excel_review'; $file=$files[0]['url']??null; $submitter=$admin&& !empty($b['SubmitterName'])?$b['SubmitterName']:$actor; $dept=$admin&& !empty($b['Department'])?$b['Department']:($user['department']??''); $assignee=$b['AssigneeID']??($admin?null:wf_user_id($user)); $review=$mode==='excel_review'?'PendingReview':($mode==='direct_signed'?'Completed':'Completed'); $excel=$mode==='excel_review'?$file:null; $signed=$mode==='direct_signed'?$file:null; if($method==='POST'){db_execute('INSERT INTO cccf_forma_permanent (SubmitterName,Department,JobArea,SubmitDate,Summary,StopType,`Rank`,FileUrl,ExcelFileUrl,SignedFileUrl,SignedUploadedAt,AssigneeID,DocumentMode,ReviewStatus,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$submitter,$dept,$b['JobArea'],wf_date($b['SubmitDate']),$b['Summary']??'',(int)$b['StopType'],$b['Rank'],$file,$excel,$signed,$signed?date('Y-m-d H:i:s'):null,$assignee,$mode,$review,$actor]);$id=(int)db()->lastInsertId();}else{$old=db_row('SELECT FileUrl,ExcelFileUrl,SignedFileUrl FROM cccf_forma_permanent WHERE id=?',[$p['id']]); if(!$old)json_response(['success'=>false,'message'=>'Not found.'],404); $file=$file?:($old['FileUrl']??null); db_execute('UPDATE cccf_forma_permanent SET SubmitterName=?,Department=?,JobArea=?,SubmitDate=?,Summary=?,StopType=?,`Rank`=?,FileUrl=?,ExcelFileUrl=COALESCE(?,ExcelFileUrl),DocumentMode=? WHERE id=?',[$submitter,$dept,$b['JobArea'],wf_date($b['SubmitDate']),$b['Summary']??'',(int)$b['StopType'],$b['Rank'],$file,$excel,$mode,$p['id']]);$id=(int)$p['id'];} wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$id,'EventType'=>'Submitted','Recipients'=>'sattaya_w@thaisummit-harness.co.th','Subject'=>'[CCCF] Submitted','Body'=>'CCCF submitted','Status'=>'Queued']); json_response(['success'=>true,'id'=>$id]); } catch(Throwable $e){wf_cleanup_files($files);throw $e;} }
    $p=route_params($path,'/cccf/form-a-permanent/:id/review'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();$st=$b['ReviewStatus']??'Approved';if(!in_array($st,['PendingReview','Approved','Rejected','Completed'],true))json_response(['success'=>false,'message'=>'Invalid review status.'],400);db_execute('UPDATE cccf_forma_permanent SET ReviewStatus=?,ReviewComment=?,ReviewedBy=?,ReviewedAt=NOW() WHERE id=?',[$st,$b['ReviewComment']??null,$actor,$p['id']]);wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$p['id'],'EventType'=>$st,'Recipients'=>'sattaya_w@thaisummit-harness.co.th','Subject'=>'[CCCF] '.$st,'Body'=>'Review updated','Status'=>'Queued']);json_response(['success'=>true]);}
    $p=route_params($path,'/cccf/form-a-permanent/:id/signed-file'); if($p!==null&&$method==='POST'){ $files=wf_store_files('FormFile',1); if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400); $row=db_row('SELECT AssigneeID,SignedFileUrl,ReviewStatus FROM cccf_forma_permanent WHERE id=?',[$p['id']]); if(!$row) {wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);} if(!$admin && (string)($row['AssigneeID']??'')!==wf_user_id($user)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);} delete_uploaded_file($row['SignedFileUrl']??null); db_execute("UPDATE cccf_forma_permanent SET SignedFileUrl=?,SignedUploadedAt=NOW(),ReviewStatus='Completed' WHERE id=?",[$files[0]['url'],$p['id']]); json_response(['success'=>true,'url'=>$files[0]['url']]); }
    $p=route_params($path,'/cccf/form-a-permanent/:id/complete'); if($p!==null&&$method==='POST'){require_admin();db_execute("UPDATE cccf_forma_permanent SET ReviewStatus='Completed',CompletedBy=?,CompletedAt=NOW() WHERE id=?",[$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/cccf/form-a-permanent/:id'); if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT FileUrl,ExcelFileUrl,SignedFileUrl FROM cccf_forma_permanent WHERE id=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);foreach(array_unique(array_filter([$row['FileUrl']??null,$row['ExcelFileUrl']??null,$row['SignedFileUrl']??null])) as $u)delete_uploaded_file($u);db_execute('DELETE FROM cccf_forma_permanent WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/cccf/email-outbox'){require_admin();$sql='SELECT * FROM cccf_emailoutbox';$pa=[];if(!empty($_GET['status'])){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT 200',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    $p=route_params($path,'/cccf/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('cccf_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    if($method==='POST'&&$path==='/cccf/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('cccf_emailoutbox','Recipients','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retry email queue completed: sent {$r['sent']}, failed {$r['failed']}",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    if($method==='GET'&&$path==='/cccf/unit-targets')json_response(db_rows('SELECT * FROM cccf_unit_targets ORDER BY target_year DESC,unit_name ASC'));
    $p=route_params($path,'/cccf/unit-targets/:unit'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();$year=(int)($b['target_year']??date('Y'));db_execute('INSERT INTO cccf_unit_targets (unit_name,target_year,yearly_target,achieved_override,UpdatedBy) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE yearly_target=VALUES(yearly_target),achieved_override=VALUES(achieved_override),UpdatedBy=VALUES(UpdatedBy)',[$p['unit'],$year,max(0,(int)($b['yearly_target']??0)),isset($b['achieved_override'])?(int)$b['achieved_override']:null,$actor]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/cccf/assignments')json_response(db_rows('SELECT a.*,COALESCE(e.EmployeeName,a.AssigneeName) AS AssigneeName,COALESCE(e.Department,a.Department) AS Department,e.CompanyEmail FROM cccf_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID ORDER BY Department,AssigneeName'));
    if(($method==='POST'&&$path==='/cccf/assignments')||(($p=route_params($path,'/cccf/assignments/:id'))!==null&&$method==='PUT')){require_admin();$b=json_body();$emp=$b['EmployeeID']??null;$name=$b['AssigneeName']??null;$dept=$b['Department']??null;if($emp){$er=db_row('SELECT EmployeeName,Department FROM employees WHERE EmployeeID=?',[$emp]);if(!$er)json_response(['success'=>false,'message'=>'Employee not found.'],404);$name=$er['EmployeeName'];$dept=$er['Department'];} if(!$emp&&(!$name||!$dept))json_response(['success'=>false,'message'=>'Invalid assignment payload.'],400); if($method==='POST'){db_execute('INSERT INTO cccf_assignments (EmployeeID,AssigneeName,Department,AllowDirectSignedPdf,DueDate,Note,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),wf_date($b['DueDate']??null),$b['Note']??null,$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);} db_execute('UPDATE cccf_assignments SET EmployeeID=?,AssigneeName=?,Department=?,AllowDirectSignedPdf=?,DueDate=?,Note=?,CreatedBy=? WHERE id=?',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),wf_date($b['DueDate']??null),$b['Note']??null,$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/cccf/assignments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM cccf_assignments WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    return false;
}

function wf_ensure_hiyari_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS hiyarireports (
        id VARCHAR(36) PRIMARY KEY,ReportDate DATE NOT NULL,ReporterID VARCHAR(50) NOT NULL,ReporterName VARCHAR(100) NOT NULL,
        Department VARCHAR(100) NOT NULL,SubmittedByID VARCHAR(50),SubmittedByName VARCHAR(100),IsSubmittedOnBehalf TINYINT(1) NOT NULL DEFAULT 0,
        CompanyEmail VARCHAR(255),Location VARCHAR(255),Description TEXT NOT NULL,PotentialConsequence VARCHAR(100),RiskLevel VARCHAR(20) DEFAULT 'Low',
        RiskRank VARCHAR(1),StopType INT,Suggestion TEXT,AttachmentUrl TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Open',
        ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'PendingReview',ReviewComment TEXT,ReviewedAt DATETIME,ReviewedBy VARCHAR(100),
        ReviewOverrideReason TEXT,ReviewOverrideBy VARCHAR(100),ReviewOverrideAt DATETIME,SignedFileUrl TEXT,SignedUploadedAt DATETIME,
        CorrectiveAction TEXT,AdminComment TEXT,AdditionalFileUrl TEXT,ClosedAt DATETIME,ClosedBy VARCHAR(100),DeletedAt DATETIME,DeletedBy VARCHAR(100),
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_status(Status),KEY idx_dept(Department),KEY idx_date(ReportDate),KEY idx_rank(RiskRank),KEY idx_deleted(DeletedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_dashboard_config (ConfigKey VARCHAR(100) PRIMARY KEY,ConfigValue TEXT,UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_assignments (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50),AssigneeName VARCHAR(100) NOT NULL,Department VARCHAR(100),AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0,Note TEXT,DueDate DATE,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,ReportID VARCHAR(36),EventType VARCHAR(50),Recipients TEXT,Subject VARCHAR(255),Body TEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SentAt DATETIME,KEY idx_report(ReportID),KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE hiyarireports ADD COLUMN SubmittedByID VARCHAR(50)",
        "ALTER TABLE hiyarireports ADD COLUMN SubmittedByName VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN IsSubmittedOnBehalf TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE hiyarireports ADD COLUMN CompanyEmail VARCHAR(255)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'PendingReview'",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewComment TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewedBy VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideReason TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideBy VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN SignedFileUrl TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN SignedUploadedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN DeletedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN DeletedBy VARCHAR(100)",
        "ALTER TABLE hiyari_assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE hiyari_assignments ADD COLUMN DueDate DATE",
    ] as $sql) wf_try_exec($sql);
}

function wf_hiyari_row_with_timeline(string $id): ?array
{
    $row = db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL', [$id]);
    if (!$row) return null;
    $row['timeline'] = [
        ['label' => 'Created', 'at' => $row['CreatedAt'] ?? null, 'by' => $row['SubmittedByName'] ?? $row['ReporterName'] ?? null],
        ['label' => 'Reviewed', 'at' => $row['ReviewedAt'] ?? null, 'by' => $row['ReviewedBy'] ?? null],
        ['label' => 'Signed File', 'at' => $row['SignedUploadedAt'] ?? null, 'by' => $row['ReporterName'] ?? null],
        ['label' => 'Closed', 'at' => $row['ClosedAt'] ?? null, 'by' => $row['ClosedBy'] ?? null],
    ];
    return $row;
}

function wf_hiyari_admin_email(): string
{
    return defined('SMTP_FROM') && SMTP_FROM ? SMTP_FROM : 'sattaya_w@thaisummit-harness.co.th';
}

function wf_app_url(): string
{
    $env = getenv('PUBLIC_APP_URL') ?: getenv('APP_BASE_URL');
    $url = trim((string)($env ?: 'https://dev.tshpcl.com/safety/tsh-safety-core/'));
    return $url !== '' ? $url : 'https://dev.tshpcl.com/safety/tsh-safety-core/';
}

function wf_hiyari_mail_subject(string $action, string $detail = ''): string
{
    return '[Hiyari-Hatto] ' . $action . ($detail !== '' ? ' - ' . $detail : '');
}

function wf_hiyari_mail(array $args): array
{
    $subject = (string)($args['subject'] ?? wf_hiyari_mail_subject('Notification'));
    $title = (string)($args['title'] ?? 'Hiyari-Hatto Notification');
    $kicker = (string)($args['kicker'] ?? 'HIYARI-HATTO / NEAR-MISS REPORTING');
    $moduleLabel = (string)($args['moduleLabel'] ?? 'Hiyari-Hatto / Near-Miss Reporting Module');
    $tone = (string)($args['tone'] ?? 'pending');
    $greeting = (string)($args['greeting'] ?? 'เรียน ผู้เกี่ยวข้อง / Dear user');
    $intro = (array)($args['intro'] ?? []);
    $details = (array)($args['details'] ?? []);
    $actions = (array)($args['actions'] ?? []);
    $note = (string)($args['note'] ?? '');
    $colors = [
        'approved' => ['#166534', '#dcfce7', '#86efac', 'อนุมัติแล้ว'],
        'rejected' => ['#9f1239', '#ffe4e6', '#fda4af', 'ต้องแก้ไข'],
        'completed' => ['#166534', '#dcfce7', '#86efac', 'เสร็จสิ้น'],
        'pending' => ['#9a3412', '#ffedd5', '#fdba74', 'ต้องดำเนินการ'],
    ];
    $c = $colors[$tone] ?? $colors['pending'];
    $textLines = [$title, '', $greeting, ''];
    foreach ($intro as $line) $textLines[] = (string)$line;
    if ($details) {
        $textLines[] = '';
        $textLines[] = 'Details / รายละเอียด';
        foreach ($details as $d) $textLines[] = '- ' . ($d['label'] ?? '') . ': ' . (($d['value'] ?? '') !== '' ? $d['value'] : '-');
    }
    if ($actions) {
        $textLines[] = '';
        $textLines[] = 'Next action / สิ่งที่ต้องดำเนินการ';
        foreach ($actions as $a) $textLines[] = '- ' . $a;
    }
    if ($note !== '') {
        $textLines[] = '';
        $textLines[] = $note;
    }
    $appUrl = wf_app_url();
    if ($appUrl !== '') {
        $textLines[] = '';
        $textLines[] = 'เข้าสู่ระบบ / Open Safety Core';
        $textLines[] = $appUrl;
    }
    $detailHtml = '';
    foreach ($details as $d) {
        $label = htmlspecialchars((string)($d['label'] ?? ''), ENT_QUOTES, 'UTF-8');
        $value = htmlspecialchars((string)(($d['value'] ?? '') !== '' ? $d['value'] : '-'), ENT_QUOTES, 'UTF-8');
        $weight = !empty($d['highlight']) ? 'font-weight:700;color:#0f172a' : 'color:#334155';
        $detailHtml .= '<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;width:38%">' . $label . '</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;' . $weight . '">' . nl2br($value) . '</td></tr>';
    }
    $introHtml = '';
    foreach ($intro as $line) $introHtml .= '<p style="margin:0 0 10px 0;color:#334155;font-size:14px;line-height:1.65">' . htmlspecialchars((string)$line, ENT_QUOTES, 'UTF-8') . '</p>';
    $actionHtml = '';
    foreach ($actions as $a) $actionHtml .= '<li style="margin:0 0 6px 0;color:#334155;font-size:14px;line-height:1.7">' . htmlspecialchars((string)$a, ENT_QUOTES, 'UTF-8') . '</li>';
    $actionsBlock = $actionHtml ? '<div style="margin-top:18px;padding:16px;border:1px solid ' . $c[2] . ';border-radius:12px;background:' . $c[1] . '"><div style="font-size:12px;font-weight:800;color:' . $c[0] . ';letter-spacing:.04em;margin-bottom:10px">สิ่งที่ต้องดำเนินการ</div><ol style="margin:0;padding-left:20px">' . $actionHtml . '</ol></div>' : '';
    $safeAppUrl = htmlspecialchars($appUrl, ENT_QUOTES, 'UTF-8');
    $ctaHtml = $appUrl !== '' ? '<div style="margin-top:22px;text-align:center"><a href="' . $safeAppUrl . '" target="_blank" rel="noopener" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;line-height:1.2;padding:13px 22px;border-radius:999px;border:1px solid #0f766e">เข้าสู่ระบบ / Open Safety Core</a><div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">หากปุ่มเปิดไม่ได้ ให้คัดลอกลิงก์นี้ / If the button does not open, copy this link:<br><a href="' . $safeAppUrl . '" target="_blank" rel="noopener" style="color:#0f766e;text-decoration:underline">' . $safeAppUrl . '</a></div></div>' : '';
    $noteHtml = $note !== '' ? '<div style="margin-top:18px;padding:14px;border-left:4px solid ' . $c[0] . ';background:#f8fafc;border-radius:10px"><div style="font-size:12px;font-weight:800;color:#475569;letter-spacing:.04em;margin-bottom:8px">หมายเหตุ</div><p style="margin:0;color:#334155;font-size:14px;line-height:1.65">' . htmlspecialchars($note, ENT_QUOTES, 'UTF-8') . '</p></div>' : '';
    $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</title></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,Tahoma,sans-serif"><div style="display:none;max-height:0;overflow:hidden;color:transparent">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center" style="padding:0 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,.08)"><tr><td bgcolor="#f8fafc" style="padding:0;background:#f8fafc;border-bottom:1px solid #e2e8f0"><div style="padding:28px 28px 24px 28px;border-top:5px solid ' . $c[0] . '"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">' . htmlspecialchars($kicker, ENT_QUOTES, 'UTF-8') . '</div><h1 style="margin:16px 0 0 0;color:#0f172a;font-size:26px;line-height:1.25;font-weight:800">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1><div style="margin-top:14px;display:inline-block;padding:7px 12px;border-radius:999px;background:' . $c[1] . ';color:' . $c[0] . ';font-size:12px;font-weight:800;border:1px solid ' . $c[2] . '">' . htmlspecialchars($c[3], ENT_QUOTES, 'UTF-8') . '</div></div></td></tr><tr><td style="padding:26px 28px 8px 28px"><p style="margin:0 0 14px 0;color:#0f172a;font-size:15px;font-weight:800">' . htmlspecialchars($greeting, ENT_QUOTES, 'UTF-8') . '</p>' . $introHtml . '</td></tr><tr><td style="padding:8px 28px 0 28px"><div style="font-size:12px;font-weight:800;color:#64748b;letter-spacing:.04em;margin-bottom:10px">สรุปรายงาน</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff">' . ($detailHtml ?: '<tr><td style="padding:14px;color:#64748b;font-size:14px">No details available</td></tr>') . '</table>' . $actionsBlock . $ctaHtml . $noteHtml . '</td></tr><tr><td style="padding:24px 28px 28px 28px"><p style="margin:0;color:#334155;font-size:14px;line-height:1.6">ขอบคุณครับ/ค่ะ</p></td></tr><tr><td style="padding:18px 28px;background:#0f172a"><div style="color:#e2e8f0;font-size:13px;font-weight:800">TSH Safety Core Activity System</div><div style="color:#94a3b8;font-size:12px;margin-top:4px">' . htmlspecialchars($moduleLabel, ENT_QUOTES, 'UTF-8') . '</div><div style="color:#94a3b8;font-size:11px;margin-top:10px;line-height:1.5">อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ TSH Safety Core Activity กรุณาอย่าตอบกลับอีเมลนี้</div></td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'body' => implode("\n", $textLines), 'html' => $html];
}

function wf_hiyari_new_report_mail(array $data, bool $direct = false): array
{
    return wf_hiyari_mail([
        'subject' => $direct ? wf_hiyari_mail_subject('ผู้รายงานอัปโหลด PDF ที่ลงนามแล้ว', (string)($data['reporterName'] ?? '')) : wf_hiyari_mail_subject('มีรายงานใหม่รอตรวจสอบ Excel', (string)($data['reporterName'] ?? '')),
        'title' => $direct ? 'มีการอัปโหลด PDF ที่ลงนามแล้ว' : 'มีรายงาน Hiyari-Hatto ใหม่ รอตรวจสอบ',
        'tone' => $direct ? 'completed' : 'pending',
        'greeting' => 'เรียน ผู้ดูแลระบบความปลอดภัย / Dear Safety Admin',
        'intro' => $direct ? [
            'ผู้รายงานได้ส่งรายงาน Hiyari-Hatto / Near-Miss พร้อมไฟล์ PDF ที่ลงนามแล้ว',
            'กรุณาตรวจสอบเอกสารฉบับลงนาม และดำเนินการปิดงานเมื่อข้อมูลครบถ้วน',
        ] : [
            'ระบบได้รับรายงาน Hiyari-Hatto / Near-Miss ฉบับใหม่ และรอการตรวจสอบไฟล์ Excel',
            'กรุณาตรวจสอบความครบถ้วนของข้อมูล และบันทึกผลการตรวจในระบบ',
        ],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $data['reportId'] ?? '-', 'highlight' => true],
            ['label' => 'ผู้รายงาน / Reporter', 'value' => $data['reporterName'] ?? '-', 'highlight' => true],
            ['label' => 'รหัสพนักงาน / Employee ID', 'value' => $data['reporterId'] ?? '-'],
            ['label' => 'แผนก / Department', 'value' => $data['department'] ?? '-'],
            ['label' => 'ผู้ส่งข้อมูล / Submitter', 'value' => $data['submitterName'] ?? '-'],
            ['label' => 'วันที่รายงาน / Report Date', 'value' => $data['date'] ?? '-'],
            ['label' => 'พื้นที่ / Location', 'value' => $data['location'] ?? '-'],
            ['label' => 'ประเภทอันตราย / Stop Type', 'value' => !empty($data['stopType']) ? 'Stop ' . $data['stopType'] : '-'],
            ['label' => 'ระดับความรุนแรง / Rank', 'value' => $data['rank'] ?? '-', 'highlight' => true],
            ['label' => 'อีเมลแจ้งผล / Company Email', 'value' => $data['companyEmail'] ?? '-'],
        ],
        'actions' => $direct ? [
            'เปิดเมนู Hiyari-Hatto และตรวจสอบไฟล์ PDF ที่ลงนามแล้ว',
            'บันทึก Corrective Action / Admin Comment และปิดรายงานเมื่อครบถ้วน',
        ] : [
            'เปิดเมนู Hiyari-Hatto > จัดการ > ตรวจรายงาน',
            'ตรวจสอบไฟล์ Excel ที่แนบมาและความครบถ้วนของข้อมูล',
            'บันทึกผลเป็นผ่านการตรวจสอบ หรือ ตีกลับเพื่อแก้ไข พร้อมหมายเหตุที่ชัดเจน',
        ],
        'note' => $direct ? 'อีเมลนี้ถูกส่งถึง Safety Admin เมื่อผู้รายงานส่ง PDF ที่ลงนามแล้วผ่าน workflow' : 'อีเมลนี้ถูกส่งถึง Safety Admin เนื่องจากมีรายงาน Near-Miss ใหม่เข้าสู่ขั้นตอนตรวจสอบ Excel',
    ]);
}

function wf_hiyari_user_review_mail(array $row, string $reviewStatus, string $reviewComment): array
{
    $approved = in_array($reviewStatus, ['Approved', 'Completed'], true);
    return wf_hiyari_mail([
        'subject' => $approved ? wf_hiyari_mail_subject('ผลการตรวจรายงานผ่านแล้ว กรุณาดำเนินการลงนาม') : wf_hiyari_mail_subject('รายงานต้องแก้ไขก่อนดำเนินการต่อ'),
        'title' => $approved ? 'รายงาน Hiyari ผ่านการตรวจสอบแล้ว' : 'รายงาน Hiyari ต้องแก้ไขเพิ่มเติม',
        'tone' => $approved ? 'approved' : 'rejected',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => $approved ? [
            'รายงาน Hiyari-Hatto / Near-Miss ของท่านผ่านการตรวจสอบไฟล์ Excel แล้ว',
            'กรุณาพิมพ์รายงาน ดำเนินการลงนามตามขั้นตอน และอัปโหลดไฟล์ PDF ที่ลงนามแล้วกลับเข้าสู่ระบบ',
        ] : [
            'รายงาน Hiyari-Hatto / Near-Miss ของท่านยังไม่ผ่านการตรวจสอบไฟล์ Excel และต้องแก้ไขเพิ่มเติม',
            'กรุณาตรวจสอบหมายเหตุจาก Safety Admin และแก้ไข/ประสานงานเพิ่มเติมตามความจำเป็น',
        ],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'ผลการตรวจ / Review Status', 'value' => $approved ? 'ผ่านการตรวจสอบ / Approved' : 'ตีกลับเพื่อแก้ไข / Rejected', 'highlight' => true],
            ['label' => 'หมายเหตุจากผู้ตรวจ / Review Comment', 'value' => $reviewComment ?: '-'],
        ],
        'actions' => $approved ? ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังดำเนินการลงนามครบถ้วน'] : ['แก้ไขไฟล์ Excel ตามหมายเหตุจากผู้ตรวจ', 'ประสาน Safety Admin หากต้องการข้อมูลหรือคำชี้แจงเพิ่มเติม'],
        'note' => $approved ? 'รายงานนี้เข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว' : 'รายงานนี้ยังอยู่ในขั้นตอนแก้ไขจนกว่าข้อมูลจะครบถ้วน',
    ]);
}

function wf_hiyari_user_status_mail(array $row, string $status, string $correctiveAction, string $adminComment): array
{
    $closed = $status === 'Closed';
    return wf_hiyari_mail([
        'subject' => $closed ? wf_hiyari_mail_subject('ปิดรายงานเรียบร้อยแล้ว') : wf_hiyari_mail_subject('รายงานถูกเปิดกลับเพื่อดำเนินการต่อ'),
        'title' => $closed ? 'ปิดรายงาน Hiyari เรียบร้อยแล้ว' : 'รายงาน Hiyari ถูกเปิดกลับเพื่อดำเนินการต่อ',
        'tone' => $closed ? 'completed' : 'pending',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => $closed ? ['รายงาน Hiyari-Hatto / Near-Miss ของท่านได้รับการดำเนินการและปิดรายงานเรียบร้อยแล้ว'] : ['รายงาน Hiyari-Hatto / Near-Miss ของท่านถูกเปิดกลับเพื่อดำเนินการเพิ่มเติม', 'กรุณาติดตามสถานะในระบบหรือประสาน Safety Admin ตามหมายเหตุด้านล่าง'],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'สถานะปัจจุบัน / Current Status', 'value' => $closed ? 'ปิดรายงานแล้ว / Closed' : $status, 'highlight' => true],
            ['label' => 'Corrective Action', 'value' => $correctiveAction ?: '-'],
            ['label' => 'หมายเหตุจากผู้ดูแล / Admin Comment', 'value' => $adminComment ?: '-'],
        ],
        'actions' => $closed ? [] : ['ตรวจสอบสถานะล่าสุดในเมนู Hiyari-Hatto', 'ประสาน Safety Admin หากต้องดำเนินการเพิ่มเติม'],
        'note' => $closed ? 'รายงานนี้ดำเนินการครบตามขั้นตอน Hiyari close-out แล้ว' : 'รายงานนี้ถูกเปิดกลับและอาจต้องติดตามเพิ่มเติม',
    ]);
}

function wf_hiyari_override_mail(array $row, string $reason, string $actor): array
{
    return wf_hiyari_mail([
        'subject' => wf_hiyari_mail_subject('Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว'),
        'title' => 'Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว',
        'tone' => 'approved',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => ['Safety Admin ได้อนุญาตให้รายงาน Hiyari-Hatto / Near-Miss ของท่านเข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว โดยใช้สิทธิ์ Admin Override'],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'ผู้อนุญาต / Approved by', 'value' => $actor, 'highlight' => true],
            ['label' => 'เหตุผล / Reason', 'value' => $reason ?: '-'],
        ],
        'actions' => ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังลงนามครบถ้วน'],
        'note' => 'การอนุญาตกรณีพิเศษนี้ถูกบันทึกไว้เพื่อการตรวจสอบย้อนหลัง',
    ]);
}

function handle_hiyari_routes(string $method, string $path): bool
{
    if (strpos($path, '/hiyari') !== 0) return false;
    $user=require_user(); wf_ensure_hiyari_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/hiyari/stats'){ $year=(int)($_GET['year']??date('Y')); $base='FROM hiyarireports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=?'; json_response(['success'=>true,'data'=>[
        'kpi'=>db_row("SELECT COUNT(*) AS total,SUM(Status='Open') AS open,SUM(Status='In Progress') AS inProgress,SUM(Status='Closed') AS closed,0 AS overdueCount $base",[$year])?:['total'=>0,'open'=>0,'inProgress'=>0,'closed'=>0,'overdueCount'=>0],
        'monthly'=>safe_rows("SELECT MONTH(ReportDate) AS month,COUNT(*) AS count $base GROUP BY MONTH(ReportDate) ORDER BY month",[$year]),
        'consequence'=>safe_rows("SELECT COALESCE(PotentialConsequence,'Unspecified') AS label,COUNT(*) AS count $base GROUP BY PotentialConsequence ORDER BY count DESC",[$year]),
        'riskDist'=>safe_rows("SELECT COALESCE(RiskLevel,'Low') AS level,COUNT(*) AS count $base GROUP BY RiskLevel",[$year]),
        'stopDist'=>safe_rows("SELECT StopType,COUNT(*) AS count $base AND StopType IS NOT NULL GROUP BY StopType ORDER BY StopType",[$year]),
        'rankDist'=>safe_rows("SELECT RiskRank AS `Rank`,COUNT(*) AS count $base AND RiskRank IS NOT NULL GROUP BY RiskRank",[$year]),
        'deptRank'=>safe_rows("SELECT Department,COUNT(*) AS count $base GROUP BY Department ORDER BY count DESC LIMIT 20",[$year]),
        'areaRank'=>safe_rows("SELECT COALESCE(NULLIF(Location,''),'Unspecified') AS Location,COUNT(*) AS count $base GROUP BY Location ORDER BY count DESC LIMIT 12",[$year]),
        'monthlyRank'=>safe_rows("SELECT MONTH(ReportDate) AS month,RiskRank AS `Rank`,COUNT(*) AS count $base AND RiskRank IS NOT NULL GROUP BY MONTH(ReportDate),RiskRank",[$year]),
        'monthlyStatus'=>safe_rows("SELECT MONTH(ReportDate) AS month,Status,COUNT(*) AS count $base GROUP BY MONTH(ReportDate),Status",[$year]),
    ]]);}
    if($method==='GET'&&$path==='/hiyari/dashboard-config'){ $cfg=['pinnedDepts'=>[]]; foreach(db_rows('SELECT ConfigKey,ConfigValue FROM hiyari_dashboard_config') as $r)$cfg[$r['ConfigKey']]=wf_json($r['ConfigValue'],[]); json_response(['success'=>true,'data'=>$cfg]);}
    if($method==='PUT'&&$path==='/hiyari/dashboard-config'){require_admin();$b=json_body(); if(array_key_exists('pinnedDepts',$b))db_execute('INSERT INTO hiyari_dashboard_config (ConfigKey,ConfigValue,UpdatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue),UpdatedBy=VALUES(UpdatedBy)',['pinnedDepts',json_encode($b['pinnedDepts'],JSON_UNESCAPED_UNICODE),$actor]); json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/hiyari/assignments')json_response(['success'=>true,'data'=>db_rows('SELECT a.*,COALESCE(e.EmployeeName,a.AssigneeName) AS AssigneeName,COALESCE(e.Department,a.Department) AS Department,e.CompanyEmail FROM hiyari_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID ORDER BY Department,AssigneeName')]);
    if(($method==='POST'&&$path==='/hiyari/assignments')||(($p=route_params($path,'/hiyari/assignments/:id'))!==null&&$method==='PUT')){require_admin();$b=json_body();$emp=$b['EmployeeID']??null;$name=$b['AssigneeName']??null;$dept=$b['Department']??null;if($emp){$er=db_row('SELECT EmployeeName,Department FROM employees WHERE EmployeeID=?',[$emp]);if(!$er)json_response(['success'=>false,'message'=>'Employee not found.'],404);$name=$er['EmployeeName'];$dept=$er['Department'];} if(!$emp&&(!$name||!$dept))json_response(['success'=>false,'message'=>'Invalid assignment payload.'],400); if($method==='POST'){db_execute('INSERT INTO hiyari_assignments (EmployeeID,AssigneeName,Department,AllowDirectSignedPdf,Note,DueDate,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),$b['Note']??null,wf_date($b['DueDate']??null),$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);} db_execute('UPDATE hiyari_assignments SET EmployeeID=?,AssigneeName=?,Department=?,AllowDirectSignedPdf=?,Note=?,DueDate=?,CreatedBy=? WHERE id=?',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),$b['Note']??null,wf_date($b['DueDate']??null),$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/hiyari/assignments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM hiyari_assignments WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/hiyari/email-outbox'){require_admin();$limit=min(max((int)($_GET['limit']??50),1),200);$sql='SELECT * FROM hiyari_emailoutbox';$pa=[];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}$pa[]=$limit;json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT ?',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    $p=route_params($path,'/hiyari/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('hiyari_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    if($method==='POST'&&$path==='/hiyari/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('hiyari_emailoutbox','Recipients','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retry email queue completed: sent {$r['sent']}, failed {$r['failed']}",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    if($method==='GET'&&$path==='/hiyari'){ $sql='SELECT * FROM hiyarireports WHERE DeletedAt IS NULL';$pa=[];foreach(['status'=>'Status','department'=>'Department','risk'=>'RiskLevel','rank'=>'RiskRank','reviewStatus'=>'ReviewStatus'] as $q=>$c){if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}} if(!empty($_GET['year'])){$sql.=' AND YEAR(ReportDate)=?';$pa[]=(int)$_GET['year'];} json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ReportDate DESC,CreatedAt DESC',$pa)]);}
    $p=route_params($path,'/hiyari/:id/timeline'); if($p!==null&&$method==='GET'){require_admin();$row=wf_hiyari_row_with_timeline($p['id']);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);json_response(['success'=>true,'data'=>$row['timeline']]);}
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='GET'){ $row=wf_hiyari_row_with_timeline($p['id']);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);json_response(['success'=>true,'data'=>$row]);}
    if(($method==='POST'&&($path==='/hiyari'||$path==='/hiyari/direct-signed'))){ $field=isset($_FILES['attachment'])?'attachment':'file';$files=wf_store_files($field,1);$b=wf_body(); try{$direct=$path==='/hiyari/direct-signed'; if(!wf_date($b['ReportDate']??null)||empty($b['Description']))json_response(['success'=>false,'message'=>'Invalid Hiyari payload.'],400); $id=wf_uuid(); $reporter=$b['ReporterID']??wf_user_id($user); $emp=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$reporter]); $reporterName=$emp['EmployeeName']??($b['ReporterName']??$actor); $dept=$emp['Department']??($b['Department']??($user['department']??'')); $companyEmail=$emp['CompanyEmail']??($b['CompanyEmail']??null); $date=wf_date($b['ReportDate']); $file=$files[0]['url']??null; db_execute('INSERT INTO hiyarireports (id,ReportDate,ReporterID,ReporterName,Department,SubmittedByID,SubmittedByName,IsSubmittedOnBehalf,CompanyEmail,Location,Description,PotentialConsequence,RiskLevel,RiskRank,StopType,Suggestion,AttachmentUrl,ReviewStatus,SignedFileUrl,SignedUploadedAt,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$date,$reporter,$reporterName,$dept,wf_user_id($user),$actor,$reporter!==wf_user_id($user)?1:0,$companyEmail,$b['Location']??null,$b['Description'],$b['PotentialConsequence']??null,$b['RiskLevel']??'Low',$b['RiskRank']??($b['Rank']??null),isset($b['StopType'])?(int)$b['StopType']:null,$b['Suggestion']??null,$direct?null:$file,$direct?'Completed':'PendingReview',$direct?$file:null,$direct?date('Y-m-d H:i:s'):null,'Open']); $mail=wf_hiyari_new_report_mail(['reportId'=>$id,'reporterName'=>$reporterName,'reporterId'=>$reporter,'department'=>$dept,'submitterName'=>$actor,'date'=>$date,'companyEmail'=>$companyEmail,'location'=>$b['Location']??null,'rank'=>$b['RiskRank']??($b['Rank']??null),'stopType'=>$b['StopType']??null],$direct); wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$id,'EventType'=>$direct?'DirectSignedSubmitted':'Submitted','Recipients'=>wf_hiyari_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']); json_response(['success'=>true,'id'=>$id]);}catch(Throwable $e){wf_cleanup_files($files);throw $e;}}
    $p=route_params($path,'/hiyari/:id/approve-pdf-override'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();$row=db_row('SELECT id,ReporterName,CompanyEmail FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$reason=(string)($b['reason']??$b['Reason']??'');db_execute("UPDATE hiyarireports SET ReviewStatus='Approved',ReviewOverrideReason=?,ReviewOverrideBy=?,ReviewOverrideAt=NOW() WHERE id=? AND DeletedAt IS NULL",[$reason,$actor,$p['id']]);if(!empty($row['CompanyEmail'])){$mail=wf_hiyari_override_mail($row,$reason,$actor);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'ReviewOverrideApproved','Recipients'=>$row['CompanyEmail'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}json_response(['success'=>true]);}
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();$row=db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$status=$b['Status']??$row['Status'];$review=$b['ReviewStatus']??$row['ReviewStatus'];if($status==='Closed'&&trim((string)($b['CorrectiveAction']??$row['CorrectiveAction']??''))==='')json_response(['success'=>false,'message'=>'CorrectiveAction is required.'],400);$reviewComment=(string)($b['ReviewComment']??$row['ReviewComment']??'');$corrective=(string)($b['CorrectiveAction']??$row['CorrectiveAction']??'');$adminComment=(string)($b['AdminComment']??$row['AdminComment']??'');db_execute('UPDATE hiyarireports SET Status=?,CorrectiveAction=COALESCE(?,CorrectiveAction),AdminComment=COALESCE(?,AdminComment),ReviewStatus=?,ReviewComment=COALESCE(?,ReviewComment),ReviewedAt=CASE WHEN ?<>ReviewStatus THEN NOW() ELSE ReviewedAt END,ReviewedBy=CASE WHEN ?<>ReviewStatus THEN ? ELSE ReviewedBy END,ClosedAt=CASE WHEN ?="Closed" THEN NOW() ELSE ClosedAt END,ClosedBy=CASE WHEN ?="Closed" THEN ? ELSE ClosedBy END WHERE id=?',[$status,$b['CorrectiveAction']??null,$b['AdminComment']??null,$review,$b['ReviewComment']??null,$review,$review,$actor,$status,$status,$actor,$p['id']]);if(!empty($row['CompanyEmail'])&&$review!==$row['ReviewStatus']&&in_array($review,['Approved','Rejected','Completed'],true)){$mail=wf_hiyari_user_review_mail($row,$review,$reviewComment);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>$review,'Recipients'=>$row['CompanyEmail'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}if(!empty($row['CompanyEmail'])&&$status!==$row['Status']&&($status==='Closed'||$row['Status']==='Closed')){$mail=wf_hiyari_user_status_mail($row,$status,$corrective,$adminComment);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>$status==='Closed'?'Closed':'Reopened','Recipients'=>$row['CompanyEmail'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}json_response(['success'=>true]);}
    $p=route_params($path,'/hiyari/:id/attachment'); if($p!==null&&$method==='POST'){require_admin();$files=wf_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);$row=db_row('SELECT AdditionalFileUrl FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}delete_uploaded_file($row['AdditionalFileUrl']??null);db_execute('UPDATE hiyarireports SET AdditionalFileUrl=? WHERE id=?',[$files[0]['url'],$p['id']]);json_response(['success'=>true,'url'=>$files[0]['url']]);}
    $p=route_params($path,'/hiyari/:id/signed-file'); if($p!==null&&$method==='POST'){ $files=wf_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);$row=db_row('SELECT id,ReporterID,SubmittedByID,ReporterName,Department,ReportDate,CompanyEmail,Location,RiskRank,StopType,ReviewStatus,SignedFileUrl FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}if(!$admin&&!in_array(wf_user_id($user),[(string)$row['ReporterID'],(string)$row['SubmittedByID']],true)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}delete_uploaded_file($row['SignedFileUrl']??null);db_execute("UPDATE hiyarireports SET SignedFileUrl=?,SignedUploadedAt=NOW(),ReviewStatus='Completed' WHERE id=?",[$files[0]['url'],$p['id']]);$mail=wf_hiyari_new_report_mail(['reportId'=>$p['id'],'reporterName'=>$row['ReporterName']??'-','reporterId'=>$row['ReporterID']??'-','department'=>$row['Department']??'-','submitterName'=>$actor,'date'=>$row['ReportDate']??'-','companyEmail'=>$row['CompanyEmail']??'-','location'=>$row['Location']??null,'rank'=>$row['RiskRank']??null,'stopType'=>$row['StopType']??null],true);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'SignedFileUploaded','Recipients'=>wf_hiyari_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);json_response(['success'=>true,'url'=>$files[0]['url']]);}
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE hiyarireports SET DeletedAt=NOW(),DeletedBy=? WHERE id=? AND DeletedAt IS NULL',[$actor,$p['id']]);json_response(['success'=>true]);}
    return false;
}

function wf_ensure_ky_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS ky_activities (
        id VARCHAR(36) PRIMARY KEY,ActivityDate DATE NOT NULL,ReporterID VARCHAR(50) NOT NULL,ReporterName VARCHAR(100) NOT NULL,ReporterEmail VARCHAR(150),
        SubmittedByID VARCHAR(50),SubmittedByName VARCHAR(100),Department VARCHAR(100) NOT NULL,SafetyUnit VARCHAR(100),TeamName VARCHAR(100),Participants TEXT,
        KYTKeyword VARCHAR(255),RiskCategory VARCHAR(50) DEFAULT 'General',HazardDescription TEXT NOT NULL,Countermeasure TEXT,AttachmentUrl TEXT,VideoUrl TEXT,
        ShowVideoOnDashboard TINYINT(1) NOT NULL DEFAULT 1,IsVideoPinned TINYINT(1) NOT NULL DEFAULT 0,Status VARCHAR(20) NOT NULL DEFAULT 'Open',AdminComment TEXT,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_dept_ym(Department,ActivityDate),KEY idx_status(Status),KEY idx_date(ActivityDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_program_config (id INT AUTO_INCREMENT PRIMARY KEY,Year INT NOT NULL,Department VARCHAR(100) NOT NULL,SafetyUnits TEXT,YearlyTarget INT NOT NULL DEFAULT 12,DeadlineDay TINYINT DEFAULT 15,DeadlineNote VARCHAR(255),IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedBy VARCHAR(50),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_year_dept(Year,Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_video_reactions (id INT AUTO_INCREMENT PRIMARY KEY,ActivityID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,Reaction VARCHAR(30) NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_react(ActivityID,EmployeeID),KEY idx_activity(ActivityID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,ActivityID VARCHAR(36),EventType VARCHAR(60) NOT NULL,Recipient VARCHAR(180) NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Queued',Error TEXT,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SentAt DATETIME NULL,KEY idx_activity(ActivityID),KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE ky_activities ADD COLUMN ReporterEmail VARCHAR(150)",
        "ALTER TABLE ky_activities ADD COLUMN SubmittedByID VARCHAR(50)",
        "ALTER TABLE ky_activities ADD COLUMN SubmittedByName VARCHAR(100)",
        "ALTER TABLE ky_activities ADD COLUMN SafetyUnit VARCHAR(100)",
        "ALTER TABLE ky_activities ADD COLUMN ShowVideoOnDashboard TINYINT(1) NOT NULL DEFAULT 1",
        "ALTER TABLE ky_activities ADD COLUMN IsVideoPinned TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE ky_emailoutbox ADD COLUMN HtmlBody MEDIUMTEXT",
    ] as $sql) wf_try_exec($sql);
}

function wf_ky_stats(int $year): array
{
    $base = 'FROM ky_activities WHERE YEAR(ActivityDate)=?';
    return [
        'kpi' => db_row("SELECT COUNT(*) AS total,SUM(Status='Open') AS open,SUM(Status='Reviewed') AS reviewed,SUM(Status='Closed') AS closed,COUNT(DISTINCT Department) AS departments $base", [$year]) ?: ['total'=>0,'open'=>0,'reviewed'=>0,'closed'=>0,'departments'=>0],
        'monthly' => safe_rows("SELECT MONTH(ActivityDate) AS month,COUNT(*) AS count $base GROUP BY MONTH(ActivityDate) ORDER BY month", [$year]),
        'statusDist' => safe_rows("SELECT Status,COUNT(*) AS count $base GROUP BY Status", [$year]),
        'riskDist' => safe_rows("SELECT RiskCategory AS label,COUNT(*) AS count $base GROUP BY RiskCategory ORDER BY count DESC", [$year]),
        'deptRank' => safe_rows("SELECT Department,COUNT(*) AS count $base GROUP BY Department ORDER BY count DESC LIMIT 20", [$year]),
        'unitRank' => safe_rows("SELECT SafetyUnit,COUNT(*) AS count $base AND SafetyUnit IS NOT NULL GROUP BY SafetyUnit ORDER BY count DESC LIMIT 20", [$year]),
        'keywordRank' => safe_rows("SELECT KYTKeyword,COUNT(*) AS count $base AND KYTKeyword IS NOT NULL GROUP BY KYTKeyword ORDER BY count DESC LIMIT 20", [$year]),
        'recent' => safe_rows("SELECT * FROM ky_activities WHERE YEAR(ActivityDate)=? ORDER BY ActivityDate DESC,CreatedAt DESC LIMIT 10", [$year]),
    ];
}

function handle_ky_routes(string $method, string $path): bool
{
    if (strpos($path, '/ky') !== 0) return false;
    $user=require_user(); wf_ensure_ky_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/ky/employees'){ $q='%'.trim((string)($_GET['q']??'')).'%'; json_response(['success'=>true,'data'=>db_rows('SELECT EmployeeID,EmployeeName,Department,Position,CompanyEmail FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? ORDER BY EmployeeName LIMIT 50',[$q,$q])]);}
    if($method==='GET'&&$path==='/ky/email-profile'){ $row=db_row('SELECT EmployeeID,EmployeeName,Department,Position,CompanyEmail FROM employees WHERE EmployeeID=?',[wf_user_id($user)]); json_response(['success'=>true,'data'=>$row]);}
    if($method==='GET'&&$path==='/ky/stats'){json_response(['success'=>true,'data'=>wf_ky_stats((int)($_GET['year']??date('Y')))]);}
    if($method==='GET'&&$path==='/ky/check'){ $dept=$_GET['dept']??($user['department']??''); $year=(int)($_GET['year']??date('Y')); $month=(int)($_GET['month']??0); $unit=$_GET['unit']??null; $sql='SELECT id FROM ky_activities WHERE Department=? AND YEAR(ActivityDate)=?';$pa=[$dept,$year]; if($month>0){$sql.=' AND MONTH(ActivityDate)=?';$pa[]=$month;} if($unit){$sql.=' AND SafetyUnit=?';$pa[]=$unit;} $rows=db_rows($sql.' ORDER BY ActivityDate DESC',$pa); json_response(['success'=>true,'submitted'=>count($rows)>0,'count'=>count($rows),'items'=>$rows]);}
    if($method==='GET'&&$path==='/ky/program-config'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>db_rows('SELECT * FROM ky_program_config WHERE Year=? ORDER BY Department',[$year])]);}
    if($method==='POST'&&$path==='/ky/program-config'){require_admin();$b=json_body();$year=(int)($b['Year']??date('Y'));$dept=wf_text($b['Department']??'',100);if(!$dept)json_response(['success'=>false,'message'=>'Department is required.'],400);db_execute('INSERT INTO ky_program_config (Year,Department,SafetyUnits,YearlyTarget,DeadlineDay,DeadlineNote,IsActive,CreatedBy) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE SafetyUnits=VALUES(SafetyUnits),YearlyTarget=VALUES(YearlyTarget),DeadlineDay=VALUES(DeadlineDay),DeadlineNote=VALUES(DeadlineNote),IsActive=VALUES(IsActive)',[$year,$dept,is_array($b['SafetyUnits']??null)?json_encode($b['SafetyUnits'],JSON_UNESCAPED_UNICODE):($b['SafetyUnits']??null),(int)($b['YearlyTarget']??12),(int)($b['DeadlineDay']??15),$b['DeadlineNote']??null,wf_bool($b['IsActive']??1),$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);}
    $p=route_params($path,'/ky/program-config/:cfgId'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE ky_program_config SET Department=COALESCE(?,Department),SafetyUnits=COALESCE(?,SafetyUnits),YearlyTarget=COALESCE(?,YearlyTarget),DeadlineDay=COALESCE(?,DeadlineDay),DeadlineNote=COALESCE(?,DeadlineNote),IsActive=COALESCE(?,IsActive) WHERE id=?',[$b['Department']??null,isset($b['SafetyUnits'])?(is_array($b['SafetyUnits'])?json_encode($b['SafetyUnits'],JSON_UNESCAPED_UNICODE):$b['SafetyUnits']):null,isset($b['YearlyTarget'])?(int)$b['YearlyTarget']:null,isset($b['DeadlineDay'])?(int)$b['DeadlineDay']:null,$b['DeadlineNote']??null,isset($b['IsActive'])?wf_bool($b['IsActive']):null,$p['cfgId']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM ky_program_config WHERE id=?',[$p['cfgId']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/ky/reminder-queue'){require_admin();json_response(['success'=>true,'data'=>['year'=>(int)($_GET['year']??date('Y')),'missing'=>[],'items'=>[]]]);}
    if($method==='POST'&&$path==='/ky/reminders/send'){require_admin();json_response(['success'=>true,'queued'=>0,'skipped'=>0]);}
    if($method==='GET'&&$path==='/ky/video-showcase'){ $year=(int)($_GET['year']??date('Y'));$limit=min(max((int)($_GET['limit']??6),1),50); json_response(['success'=>true,'data'=>db_rows("SELECT a.*,(SELECT COUNT(*) FROM ky_video_reactions r WHERE r.ActivityID=a.id) AS ReactionCount FROM ky_activities a WHERE a.VideoUrl IS NOT NULL AND a.VideoUrl<>'' AND a.ShowVideoOnDashboard=1 AND YEAR(a.ActivityDate)=? ORDER BY a.IsVideoPinned DESC,a.ActivityDate DESC LIMIT ?",[$year,$limit])]);}
    $p=route_params($path,'/ky/:id/reaction'); if($p!==null&&$method==='POST'){ $b=json_body();$reaction=$b['reaction']??'useful';if(!in_array($reaction,['useful','practice','awareness','attention'],true))json_response(['success'=>false,'message'=>'Invalid reaction.'],400);db_execute('INSERT INTO ky_video_reactions (ActivityID,EmployeeID,Reaction) VALUES (?,?,?) ON DUPLICATE KEY UPDATE Reaction=VALUES(Reaction)',[$p['id'],wf_user_id($user),$reaction]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){db_execute('DELETE FROM ky_video_reactions WHERE ActivityID=? AND EmployeeID=?',[$p['id'],wf_user_id($user)]);json_response(['success'=>true]);}
    $p=route_params($path,'/ky/:id/video-dashboard'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE ky_activities SET ShowVideoOnDashboard=COALESCE(?,ShowVideoOnDashboard),IsVideoPinned=COALESCE(?,IsVideoPinned) WHERE id=?',[array_key_exists('show',$b)?wf_bool($b['show']):null,array_key_exists('pinned',$b)?wf_bool($b['pinned']):null,$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/ky'){ $sql='SELECT * FROM ky_activities WHERE 1=1';$pa=[];foreach(['status'=>'Status','department'=>'Department','safetyUnit'=>'SafetyUnit','riskCategory'=>'RiskCategory'] as $q=>$c){if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}} if(!empty($_GET['year'])){$sql.=' AND YEAR(ActivityDate)=?';$pa[]=(int)$_GET['year'];} if(!empty($_GET['month'])){$sql.=' AND MONTH(ActivityDate)=?';$pa[]=(int)$_GET['month'];} json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ActivityDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='GET'&&$path==='/ky/email-outbox'){require_admin();$limit=min(max((int)($_GET['limit']??50),1),200);$sql='SELECT * FROM ky_emailoutbox';$pa=[];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}$pa[]=$limit;json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT ?',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    if($method==='POST'&&$path==='/ky/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('ky_emailoutbox','Recipient','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retried {$r['processed']} KY email queue item(s)",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    $p=route_params($path,'/ky/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('ky_emailoutbox',(int)$p['id'],'Recipient','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='GET'){ $row=db_row('SELECT * FROM ky_activities WHERE id=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$row['reactions']=db_rows('SELECT Reaction,COUNT(*) AS count FROM ky_video_reactions WHERE ActivityID=? GROUP BY Reaction',[$p['id']]);json_response(['success'=>true,'data'=>$row]);}
    if($method==='POST'&&$path==='/ky'){ $files=wf_store_files('attachment',1);$videos=wf_store_files('video',1,200*1024*1024);$b=wf_body();try{ if(!wf_date($b['ActivityDate']??null)||empty($b['HazardDescription']))json_response(['success'=>false,'message'=>'Invalid KY payload.'],400);$id=wf_uuid();$reporter=$b['ReporterID']??wf_user_id($user);$emp=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$reporter]);db_execute('INSERT INTO ky_activities (id,ActivityDate,ReporterID,ReporterName,ReporterEmail,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,wf_date($b['ActivityDate']),$reporter,$emp['EmployeeName']??($b['ReporterName']??$actor),$emp['CompanyEmail']??($b['ReporterEmail']??null),wf_user_id($user),$actor,$b['Department']??($emp['Department']??($user['department']??'')),$b['SafetyUnit']??null,$b['TeamName']??null,$b['Participants']??null,$b['KYTKeyword']??null,$b['RiskCategory']??'General',$b['HazardDescription'],$b['Countermeasure']??null,$files[0]['url']??null,$videos[0]['url']??null,'Open']);wf_email_outbox('ky_emailoutbox',['ActivityID'=>$id,'EventType'=>'Submitted','Recipient'=>$emp['CompanyEmail']??'sattaya_w@thaisummit-harness.co.th','Subject'=>'[KY] Submitted','Body'=>'KY submitted','Status'=>'Queued']);json_response(['success'=>true,'id'=>$id]);}catch(Throwable $e){wf_cleanup_files($files);wf_cleanup_files($videos);throw $e;}}
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='PUT'){require_admin();$files=wf_store_files('attachment',1);$videos=wf_store_files('video',1,200*1024*1024);try{$row=db_row('SELECT AttachmentUrl,VideoUrl FROM ky_activities WHERE id=?',[$p['id']]);if(!$row){wf_cleanup_files($files);wf_cleanup_files($videos);json_response(['success'=>false,'message'=>'Not found.'],404);}$b=wf_body();$attachment=$files?$files[0]['url']:($row['AttachmentUrl']??null);$video=$videos?$videos[0]['url']:($row['VideoUrl']??null);if($files)delete_uploaded_file($row['AttachmentUrl']??null);if($videos)delete_uploaded_file($row['VideoUrl']??null);db_execute('UPDATE ky_activities SET ActivityDate=COALESCE(?,ActivityDate),Department=COALESCE(?,Department),SafetyUnit=COALESCE(?,SafetyUnit),KYTKeyword=COALESCE(?,KYTKeyword),RiskCategory=COALESCE(?,RiskCategory),HazardDescription=COALESCE(?,HazardDescription),Countermeasure=COALESCE(?,Countermeasure),AttachmentUrl=?,VideoUrl=?,Status=COALESCE(?,Status),AdminComment=COALESCE(?,AdminComment) WHERE id=?',[wf_date($b['ActivityDate']??null),$b['Department']??null,$b['SafetyUnit']??null,$b['KYTKeyword']??null,$b['RiskCategory']??null,$b['HazardDescription']??null,$b['Countermeasure']??null,$attachment,$video,$b['Status']??null,$b['AdminComment']??null,$p['id']]);json_response(['success'=>true]);}catch(Throwable $e){wf_cleanup_files($files);wf_cleanup_files($videos);throw $e;}}
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT AttachmentUrl,VideoUrl FROM ky_activities WHERE id=?',[$p['id']]);if($row){delete_uploaded_file($row['AttachmentUrl']??null);delete_uploaded_file($row['VideoUrl']??null);}db_execute('DELETE FROM ky_video_reactions WHERE ActivityID=?',[$p['id']]);db_execute('DELETE FROM ky_activities WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    return false;
}

function wf_ensure_yokoten_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS yokotentopics (
        YokotenID VARCHAR(36) PRIMARY KEY,Title VARCHAR(200),TopicDescription TEXT NOT NULL,Category VARCHAR(50) DEFAULT 'General',
        RiskLevel VARCHAR(20) DEFAULT 'Low',DateIssued DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,Deadline DATE,AttachmentUrl TEXT,AttachmentName VARCHAR(255),
        TargetDepts TEXT,TargetUnits TEXT,IsActive TINYINT(1) DEFAULT 1,CreatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokotenresponses (
        ResponseID VARCHAR(36) PRIMARY KEY,YokotenID VARCHAR(36) NOT NULL,Department VARCHAR(100) NOT NULL,SafetyUnit VARCHAR(100),EmployeeID VARCHAR(50) NOT NULL,
        EmployeeName VARCHAR(100),IsRelated VARCHAR(10) DEFAULT 'No',Comment TEXT,CorrectiveAction TEXT,ApprovalStatus VARCHAR(20),ApprovalComment TEXT,
        ApprovedBy VARCHAR(100),ApprovedAt DATETIME,ResponseDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        IsDeleted TINYINT(1) DEFAULT 0,UNIQUE KEY uq_dept_topic(YokotenID,Department),KEY idx_yokoten(YokotenID),KEY idx_dept(Department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokoten_response_files (
        FileID VARCHAR(36) PRIMARY KEY,ResponseID VARCHAR(36) NOT NULL,YokotenID VARCHAR(36) NOT NULL,Department VARCHAR(100),FileName VARCHAR(255) NOT NULL,
        FileURL TEXT NOT NULL,PublicID VARCHAR(255),FileType VARCHAR(100),FileSize INT,UploadedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_response(ResponseID),KEY idx_yokoten(YokotenID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokoten_dashboard_config (id INT AUTO_INCREMENT PRIMARY KEY,ConfigKey VARCHAR(50) NOT NULL UNIQUE,ConfigValue TEXT,UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE yokotentopics ADD COLUMN Title VARCHAR(200)",
        "ALTER TABLE yokotentopics ADD COLUMN Category VARCHAR(50) DEFAULT 'General'",
        "ALTER TABLE yokotentopics ADD COLUMN RiskLevel VARCHAR(20) DEFAULT 'Low'",
        "ALTER TABLE yokotentopics ADD COLUMN Deadline DATE",
        "ALTER TABLE yokotentopics ADD COLUMN AttachmentUrl TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN AttachmentName VARCHAR(255)",
        "ALTER TABLE yokotentopics ADD COLUMN TargetDepts TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN TargetUnits TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN IsActive TINYINT(1) DEFAULT 1",
        "ALTER TABLE yokotenresponses ADD COLUMN SafetyUnit VARCHAR(100)",
        "ALTER TABLE yokotenresponses ADD COLUMN CorrectiveAction TEXT",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovalStatus VARCHAR(20)",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovalComment TEXT",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovedBy VARCHAR(100)",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovedAt DATETIME",
        "ALTER TABLE yokotenresponses ADD COLUMN IsDeleted TINYINT(1) DEFAULT 0",
        "ALTER TABLE yokotenresponses MODIFY COLUMN EmployeeID VARCHAR(50) NOT NULL",
    ] as $sql) wf_try_exec($sql);
}

function wf_yokoten_attach_responses(array $topics, array $user): array
{
    foreach ($topics as &$t) {
        $t['targetDepts'] = wf_json($t['TargetDepts'] ?? null, []);
        $t['targetUnits'] = wf_json($t['TargetUnits'] ?? null, []);
        unset($t['TargetDepts'], $t['TargetUnits']);
        $responses = db_rows('SELECT * FROM yokotenresponses WHERE YokotenID=? AND (IsDeleted IS NULL OR IsDeleted=0) ORDER BY ResponseDate DESC', [$t['YokotenID']]);
        foreach ($responses as &$r) {
            $r['files'] = db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC', [$r['ResponseID']]);
        }
        unset($r);
        $t['responses'] = $responses;
        $dept = (string)($user['department'] ?? '');
        $mine = null;
        foreach ($responses as $r) {
            if ((string)$r['Department'] === $dept || (string)$r['EmployeeID'] === wf_user_id($user)) { $mine = $r; break; }
        }
        $t['myResponse'] = $mine;
        $t['responseCount'] = count($responses);
    }
    unset($t);
    return $topics;
}

function handle_yokoten_routes(string $method, string $path): bool
{
    if (strpos($path, '/yokoten') !== 0) return false;
    $user=require_user(); wf_ensure_yokoten_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/yokoten/topics'){ $topics=db_rows('SELECT * FROM yokotentopics WHERE IsActive=1 ORDER BY DateIssued DESC'); json_response(['success'=>true,'data'=>wf_yokoten_attach_responses($topics,$user)]);}
    if($method==='GET'&&$path==='/yokoten/dept-completion'){require_admin();$depts=db_rows('SELECT Name FROM master_departments ORDER BY Name');$topics=db_rows('SELECT YokotenID,Title,TopicDescription FROM yokotentopics WHERE IsActive=1');$rows=[];foreach($depts as $d){$dept=$d['Name'];$target=count($topics);$done=(int)(safe_scalar('SELECT COUNT(DISTINCT YokotenID) FROM yokotenresponses WHERE Department=? AND (IsDeleted IS NULL OR IsDeleted=0)',[$dept])??0);$rows[]=['Department'=>$dept,'targetCount'=>$target,'completedCount'=>$done,'pendingCount'=>max(0,$target-$done),'completionPct'=>$target?round($done*100/$target):0];}json_response(['success'=>true,'data'=>$rows]);}
    if($method==='GET'&&$path==='/yokoten/all-responses'){require_admin();$rows=db_rows('SELECT r.*,t.Title,t.TopicDescription,t.Category,t.RiskLevel FROM yokotenresponses r JOIN yokotentopics t ON t.YokotenID=r.YokotenID WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0) ORDER BY r.ResponseDate DESC');foreach($rows as &$r)$r['files']=db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC',[$r['ResponseID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='GET'&&$path==='/yokoten/dept-history'){ $dept=$_GET['department']??($user['department']??'');$rows=db_rows('SELECT r.*,t.Title,t.TopicDescription,t.Category,t.RiskLevel FROM yokotenresponses r JOIN yokotentopics t ON t.YokotenID=r.YokotenID WHERE r.Department=? AND (r.IsDeleted IS NULL OR r.IsDeleted=0) ORDER BY r.ResponseDate DESC',[$dept]);foreach($rows as &$r)$r['files']=db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC',[$r['ResponseID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='GET'&&$path==='/yokoten/employee-completion'){require_admin();$emps=db_rows('SELECT EmployeeID,EmployeeName,Department,Position FROM employees ORDER BY Department,EmployeeName');$topicCount=(int)(safe_scalar('SELECT COUNT(*) FROM yokotentopics WHERE IsActive=1')??0);$out=[];foreach($emps as $e){$cnt=(int)(safe_scalar('SELECT COUNT(*) FROM yokotenresponses WHERE EmployeeID=? AND (IsDeleted IS NULL OR IsDeleted=0)',[$e['EmployeeID']])??0);$e['completedCount']=$cnt;$e['targetCount']=$topicCount;$e['completionPct']=$topicCount?round($cnt*100/$topicCount):0;$out[]=$e;}json_response(['success'=>true,'data'=>$out]);}
    if(($method==='POST'&&$path==='/yokoten/respond')||(($p=route_params($path,'/yokoten/respond/:id'))!==null&&$method==='PUT')){ $files=wf_store_files('responseFiles',10);$b=wf_body();try{ if($method==='POST'){if(empty($b['YokotenID']))json_response(['success'=>false,'message'=>'YokotenID is required.'],400);$topic=db_row('SELECT * FROM yokotentopics WHERE YokotenID=? AND IsActive=1',[$b['YokotenID']]);if(!$topic)json_response(['success'=>false,'message'=>'Topic not found.'],404);$rid=wf_uuid();$dept=$b['Department']??($user['department']??'');db_execute('INSERT INTO yokotenresponses (ResponseID,YokotenID,Department,SafetyUnit,EmployeeID,EmployeeName,IsRelated,Comment,CorrectiveAction,ApprovalStatus) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE SafetyUnit=VALUES(SafetyUnit),EmployeeID=VALUES(EmployeeID),EmployeeName=VALUES(EmployeeName),IsRelated=VALUES(IsRelated),Comment=VALUES(Comment),CorrectiveAction=VALUES(CorrectiveAction),ApprovalStatus=NULL,ApprovalComment=NULL,ApprovedBy=NULL,ApprovedAt=NULL,IsDeleted=0',[$rid,$b['YokotenID'],$dept,$b['SafetyUnit']??null,wf_user_id($user),$actor,$b['IsRelated']??'No',$b['Comment']??null,$b['CorrectiveAction']??null,null]);$existing=db_row('SELECT ResponseID FROM yokotenresponses WHERE YokotenID=? AND Department=?',[$b['YokotenID'],$dept]);$rid=$existing['ResponseID']??$rid;}else{$row=db_row('SELECT * FROM yokotenresponses WHERE ResponseID=? AND (IsDeleted IS NULL OR IsDeleted=0)',[$p['id']]);if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}if(!$admin&&(string)$row['EmployeeID']!==wf_user_id($user)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}$rid=$p['id'];db_execute('UPDATE yokotenresponses SET SafetyUnit=COALESCE(?,SafetyUnit),IsRelated=COALESCE(?,IsRelated),Comment=COALESCE(?,Comment),CorrectiveAction=COALESCE(?,CorrectiveAction),ApprovalStatus=NULL,ApprovalComment=NULL,ApprovedBy=NULL,ApprovedAt=NULL WHERE ResponseID=?',[$b['SafetyUnit']??null,$b['IsRelated']??null,$b['Comment']??null,$b['CorrectiveAction']??null,$rid]);}$resp=db_row('SELECT * FROM yokotenresponses WHERE ResponseID=?',[$rid]);foreach($files as $f)db_execute('INSERT INTO yokoten_response_files (FileID,ResponseID,YokotenID,Department,FileName,FileURL,PublicID,FileType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',[wf_uuid(),$rid,$resp['YokotenID'],$resp['Department'],$f['name'],$f['url'],$f['stored'],$f['type'],$f['size'],$actor]);json_response(['success'=>true,'id'=>$rid]);}catch(Throwable $e){wf_cleanup_files($files);throw $e;}}
    $p=route_params($path,'/yokoten/respond/:id'); if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT ResponseID FROM yokotenresponses WHERE ResponseID=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);db_execute('UPDATE yokotenresponses SET IsDeleted=1 WHERE ResponseID=?',[$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/yokoten/respond/:id/approve'); if($p!==null&&$method==='POST'){require_admin();db_execute("UPDATE yokotenresponses SET ApprovalStatus='Approved',ApprovalComment=NULL,ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=?",[$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/yokoten/respond/:id/reject'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();db_execute("UPDATE yokotenresponses SET ApprovalStatus='Rejected',ApprovalComment=?,ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=?",[$b['comment']??$b['ApprovalComment']??null,$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/yokoten/response-files/:fileId'); if($p!==null&&$method==='DELETE'){require_admin();$f=db_row('SELECT FileURL FROM yokoten_response_files WHERE FileID=?',[$p['fileId']]);db_execute('DELETE FROM yokoten_response_files WHERE FileID=?',[$p['fileId']]);if($f)delete_uploaded_file($f['FileURL']);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/yokoten/dashboard-config'){ $cfg=['pinnedDepts'=>[]];foreach(db_rows('SELECT ConfigKey,ConfigValue FROM yokoten_dashboard_config') as $r)$cfg[$r['ConfigKey']]=wf_json($r['ConfigValue'],[]);json_response(['success'=>true,'data'=>$cfg]);}
    if($method==='PUT'&&$path==='/yokoten/dashboard-config'){require_admin();$b=json_body();if(array_key_exists('pinnedDepts',$b))db_execute('INSERT INTO yokoten_dashboard_config (ConfigKey,ConfigValue,UpdatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue),UpdatedBy=VALUES(UpdatedBy)',['pinnedDepts',json_encode($b['pinnedDepts'],JSON_UNESCAPED_UNICODE),$actor]);json_response(['success'=>true]);}
    if($method==='POST'&&$path==='/yokoten/topics'){require_admin();$b=json_body();$id=wf_uuid();db_execute('INSERT INTO yokotentopics (YokotenID,Title,TopicDescription,Category,RiskLevel,DateIssued,Deadline,AttachmentUrl,AttachmentName,TargetDepts,TargetUnits,IsActive,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$b['Title']??null,$b['TopicDescription']??($b['Description']??''),$b['Category']??'General',$b['RiskLevel']??'Low',!empty($b['DateIssued'])?$b['DateIssued']:date('Y-m-d H:i:s'),wf_date($b['Deadline']??null),$b['AttachmentUrl']??null,$b['AttachmentName']??null,isset($b['TargetDepts'])?json_encode($b['TargetDepts'],JSON_UNESCAPED_UNICODE):null,isset($b['TargetUnits'])?json_encode($b['TargetUnits'],JSON_UNESCAPED_UNICODE):null,1,$actor]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/yokoten/topics/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE yokotentopics SET Title=?,TopicDescription=?,Category=?,RiskLevel=?,Deadline=?,AttachmentUrl=?,AttachmentName=?,TargetDepts=?,TargetUnits=? WHERE YokotenID=?',[$b['Title']??null,$b['TopicDescription']??($b['Description']??''),$b['Category']??'General',$b['RiskLevel']??'Low',wf_date($b['Deadline']??null),$b['AttachmentUrl']??null,$b['AttachmentName']??null,isset($b['TargetDepts'])?json_encode($b['TargetDepts'],JSON_UNESCAPED_UNICODE):null,isset($b['TargetUnits'])?json_encode($b['TargetUnits'],JSON_UNESCAPED_UNICODE):null,$p['id']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE yokotentopics SET IsActive=0 WHERE YokotenID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='POST'&&$path==='/yokoten/bulk-approve'){require_admin();$b=json_body();$ids=$b['ids']??[];$n=0;foreach($ids as $id){$n+=db_execute("UPDATE yokotenresponses SET ApprovalStatus='Approved',ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=?",[$actor,$id]);}json_response(['success'=>true,'approved'=>$n]);}
    return false;
}
