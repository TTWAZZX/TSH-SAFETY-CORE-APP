<?php
declare(strict_types=1);

function fm_uuid(): string { return function_exists('p5_uuid') ? p5_uuid() : bin2hex(random_bytes(16)); }
function fm_actor(array $u): string { return trim((string)($u['name'] ?? $u['EmployeeName'] ?? $u['id'] ?? 'User')) ?: 'User'; }
function fm_uid(array $u): string { return trim((string)($u['id'] ?? $u['EmployeeID'] ?? '')); }
function fm_admin(array $u): bool { return strcasecmp((string)($u['role'] ?? $u['Role'] ?? ''), 'Admin') === 0; }
function fm_text($v, int $max = 255): string { return mb_substr(trim((string)($v ?? '')), 0, $max); }
function fm_bool($v): int { return in_array(strtolower(trim((string)$v)), ['1','true','yes','on','required'], true) ? 1 : 0; }
function fm_is_duplicate(Throwable $e): bool {
    $driverCode = $e instanceof PDOException ? (int)($e->errorInfo[1] ?? 0) : 0;
    return $driverCode === 1062 || ((string)$e->getCode() === '23000' && stripos($e->getMessage(),'duplicate') !== false);
}
function fm_write(callable $callback, string $duplicateMessage) {
    try { return $callback(); }
    catch (Throwable $e) {
        if (fm_is_duplicate($e)) json_response(['success'=>false,'code'=>'FOURM_DUPLICATE','message'=>$duplicateMessage],409);
        throw $e;
    }
}
function fm_duplicate_response(string $message): void {
    json_response(['success'=>false,'code'=>'FOURM_DUPLICATE','message'=>$message],409);
}
function fm_key($value): string { return mb_strtolower(trim((string)$value),'UTF-8'); }
function fm_course_master_duplicate(string $code,?string $excludeId=null): bool {
    foreach(db_rows('SELECT id,CourseCode FROM fourm_coursemaster') as $row){
        if(($excludeId===null||(string)$row['id']!==$excludeId)&&fm_key($row['CourseCode']??'')===fm_key($code))return true;
    }
    return false;
}
function fm_curriculum_duplicate(int $year,string $department,string $code,?string $excludeId=null): bool {
    foreach(db_rows('SELECT id,`Year`,Department,CurriculumCode FROM fourm_curriculums WHERE `Year`=?',[$year]) as $row){
        if(($excludeId===null||(string)$row['id']!==$excludeId)&&fm_key($row['Department']??'')===fm_key($department)&&fm_key($row['CurriculumCode']??'')===fm_key($code))return true;
    }
    return false;
}
function fm_find_course(string $curriculumId,string $code,?string $excludeId=null): ?array {
    foreach(db_rows('SELECT id,CourseCode FROM fourm_courses WHERE CurriculumID=?',[$curriculumId]) as $row){
        if(($excludeId===null||(string)$row['id']!==$excludeId)&&fm_key($row['CourseCode']??'')===fm_key($code))return $row;
    }
    return null;
}
function fm_course_duplicate(string $curriculumId,string $code,?string $excludeId=null): bool { return fm_find_course($curriculumId,$code,$excludeId)!==null; }
function fm_transaction(callable $callback) {
    $pdo=db(); $owns=!$pdo->inTransaction();
    if($owns)$pdo->beginTransaction();
    try { $result=$callback(); if($owns)$pdo->commit(); return $result; }
    catch(Throwable $e){ if($owns&&$pdo->inTransaction())$pdo->rollBack(); throw $e; }
}
function fm_bulk_code_options(array $body): array {
    $year=(int)($body['year']??$body['Year']??0);
    $department=trim((string)($body['department']??$body['Department']??'all'))?:'all';
    $find=strtoupper(trim((string)($body['find']??$body['Find']??'')));
    $replace=strtoupper(trim((string)($body['replace']??$body['Replace']??'')));
    $activeRaw=$body['activeOnly']??$body['ActiveOnly']??true;
    $activeOnly=!in_array($activeRaw,[false,0,'0','false'],true);
    if($year<2000||$year>2100)json_response(['success'=>false,'message'=>'Invalid curriculum year.'],400);
    if($find===''||$replace==='')json_response(['success'=>false,'message'=>'Find and replacement code fragments are required.'],400);
    if($find===$replace)json_response(['success'=>false,'message'=>'The replacement must be different from the current code fragment.'],400);
    if(strlen($find)>50||strlen($replace)>50)json_response(['success'=>false,'message'=>'Code fragments must not exceed 50 characters.'],400);
    if(strlen($department)>100)json_response(['success'=>false,'message'=>'Department must not exceed 100 characters.'],400);
    return ['year'=>$year,'department'=>$department,'find'=>$find,'replace'=>$replace,'activeOnly'=>$activeOnly];
}
function fm_bulk_code_key(array $row,string $code): string {
    return strtolower(trim((string)($row['Department']??''))).'::'.strtolower(trim($code));
}
function fm_bulk_code_changes($rows): array {
    if(!is_array($rows))return [];$out=[];
    foreach($rows as $row)$out[]=['id'=>(string)($row['id']??''),'oldCode'=>(string)($row['oldCode']??''),'newCode'=>(string)($row['newCode']??'')];
    usort($out,fn($a,$b)=>strcmp($a['id'],$b['id']));return $out;
}
function fm_bulk_code_preview(array $rows,array $options): array {
    $scoped=[];
    foreach($rows as $row){
        if((int)($row['Year']??0)!==$options['year'])continue;
        if($options['department']!=='all'&&(string)($row['Department']??'')!==$options['department'])continue;
        if($options['activeOnly']&&(int)($row['IsActive']??0)!==1)continue;
        $scoped[]=$row;
    }
    $preview=[];$proposed=[];
    foreach($scoped as $row){
        $old=(string)($row['CurriculumCode']??'');$upper=strtoupper($old);
        $occurrences=substr_count($upper,$options['find']);
        if($occurrences<1)continue;
        $offset=strpos($upper,$options['find']);
        $new=$occurrences===1?substr($old,0,$offset).$options['replace'].substr($old,$offset+strlen($options['find'])):$old;
        $item=['id'=>(string)$row['id'],'Year'=>(int)$row['Year'],'Department'=>(string)($row['Department']??''),'CurriculumTitle'=>(string)($row['CurriculumTitle']??''),'IsActive'=>(int)($row['IsActive']??0)===1?1:0,'oldCode'=>$old,'newCode'=>$new,'status'=>'ready','reason'=>''];
        if($occurrences>1){$item['status']='ambiguous';$item['reason']='Current fragment occurs more than once in this code.';}
        elseif(strlen($new)>50){$item['status']='invalid';$item['reason']='Resulting curriculum code exceeds 50 characters.';}
        $preview[]=$item;
        if($item['status']==='ready')$proposed[$item['id']]=$item;
    }
    $groups=[];
    foreach($rows as $row){
        if((int)($row['Year']??0)!==$options['year'])continue;
        $id=(string)$row['id'];$code=isset($proposed[$id])?$proposed[$id]['newCode']:(string)($row['CurriculumCode']??'');
        $key=fm_bulk_code_key($row,$code);$groups[$key][]=$id;
    }
    foreach($preview as &$item){
        if($item['status']!=='ready')continue;
        if(count($groups[fm_bulk_code_key($item,$item['newCode'])]??[])>1){$item['status']='conflict';$item['reason']='Resulting code already exists in the same year and department.';}
    }
    unset($item);
    $counts=['ready'=>0,'conflict'=>0,'ambiguous'=>0,'invalid'=>0];
    foreach($preview as $item)if(isset($counts[$item['status']]))$counts[$item['status']]++;
    return ['scope'=>$options,'scopeCount'=>count($scoped),'matchedCount'=>count($preview),'readyCount'=>$counts['ready'],'conflictCount'=>$counts['conflict'],'ambiguousCount'=>$counts['ambiguous'],'invalidCount'=>$counts['invalid'],'rows'=>$preview];
}
function fm_required($value,int $max,string $message): string {
    $clean=fm_text($value,$max); if($clean==='')json_response(['success'=>false,'message'=>$message],400); return $clean;
}
function fm_parse_put_multipart_raw(string $raw,string $type): array {
    $parsed=['fields'=>[],'files'=>[]];
    if(!preg_match('/boundary=(?:"([^"]+)"|([^;]+))/',$type,$m))return $parsed;
    $boundary=$m[1]?:trim($m[2]);
    foreach(explode('--'.$boundary,$raw) as $part){
        $part=ltrim($part,"\r\n"); if($part===''||$part==="--\r\n"||$part==='--')continue;
        $pair=explode("\r\n\r\n",$part,2); if(count($pair)!==2)continue;
        [$head,$value]=$pair;
        if(substr($value,-2)==="\r\n")$value=substr($value,0,-2);
        if(!preg_match('/name="([^"]+)"/',$head,$nm))continue; $name=$nm[1];
        if(preg_match('/filename="([^"]*)"/',$head,$fn)){
            if(trim((string)$fn[1])==='')continue;
            $tmp=tempnam(sys_get_temp_dir(),'fm7-'); file_put_contents($tmp,$value);
            $mime='application/octet-stream'; if(preg_match('/Content-Type:\\s*([^\\r\\n]+)/i',$head,$ct))$mime=trim($ct[1]);
            $parsed['files'][$name]=['name'=>$fn[1],'tmp'=>$tmp,'type'=>$mime,'size'=>filesize($tmp)?:0];
        } else $parsed['fields'][$name]=rtrim($value,"\r\n");
    }
    return $parsed;
}
function fm_put_multipart(): array {
    static $parsed=null; if($parsed!==null)return $parsed;
    $parsed=['fields'=>[],'files'=>[]];
    if(($_SERVER['REQUEST_METHOD']??'')!=='PUT')return $parsed;
    return $parsed=fm_parse_put_multipart_raw((string)file_get_contents('php://input'),(string)($_SERVER['CONTENT_TYPE']??''));
}
function fm_body(): array { $put=fm_put_multipart(); return $_POST ?: ($put['fields'] ?: json_body()); }
function fm_dept_ok(array $u, $dept): bool { return fm_admin($u) || (fm_text($u['department'] ?? $u['Department'] ?? '', 100) !== '' && fm_text($dept, 100) === fm_text($u['department'] ?? $u['Department'] ?? '', 100)); }
function fm_role_keys(array $u): array {
    $raw=strtoupper(fm_text($u['role'] ?? $u['Role'] ?? '',50)); $keys=[];
    if($raw)$keys[]=$raw;
    return array_values(array_unique(array_filter($keys)));
}
function fm_permission_seed(): void {
    static $done=false; if($done)return;
    db()->exec("CREATE TABLE IF NOT EXISTS admin_rolepermissions (id INT AUTO_INCREMENT PRIMARY KEY,role VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_role_perm(role,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS admin_userpermissions (id INT AUTO_INCREMENT PRIMARY KEY,employee_id VARCHAR(50) NOT NULL,permission VARCHAR(80) NOT NULL,granted TINYINT NOT NULL DEFAULT 1,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_user_perm(employee_id,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach([['ADMIN',1],['USER',0],['VIEWER',0],['STAFF',0],['MANAGER',0],['EXECUTIVE',0],['SAFETY_OFFICER',0]] as $row){
        db_execute('INSERT IGNORE INTO admin_rolepermissions(role,permission,granted) VALUES(?,?,?)',[$row[0],'FOURM_TRAINING_MANAGE',$row[1]]);
    }
    $done=true;
}
function fm_has_permission(array $u,string $permission): bool {
    if(fm_admin($u))return true;
    try{
        fm_permission_seed();
        $aliases=array_values(array_unique([$permission,strtolower($permission)]));
        $eid=fm_uid($u);
        if($eid){
            $marks=implode(',',array_fill(0,count($aliases),'?'));
            $row=db_row("SELECT granted FROM admin_userpermissions WHERE employee_id=? AND permission IN ($marks) ORDER BY updated_at DESC LIMIT 1",array_merge([$eid],$aliases));
            if($row)return (int)$row['granted']===1;
        }
        $roles=fm_role_keys($u); if(!$roles)return false;
        $roleMarks=implode(',',array_fill(0,count($roles),'?')); $permMarks=implode(',',array_fill(0,count($aliases),'?'));
        return (int)(db_row("SELECT COUNT(*) n FROM admin_rolepermissions WHERE role IN ($roleMarks) AND permission IN ($permMarks) AND granted=1",array_merge($roles,$aliases))['n']??0)>0;
    }catch(Throwable $e){return false;}
}
function fm_training_manage_ok(array $u,$dept): bool { return fm_admin($u) || (fm_dept_ok($u,$dept) && fm_has_permission($u,'FOURM_TRAINING_MANAGE')); }
function fm_deny(): void { json_response(['success'=>false,'message'=>'Permission denied for this department.'],403); }
function fm_url(string $url): string { return (string)preg_replace('#^/+#','/',str_replace('\\','/',$url)); }
function fm_upload(string $field): ?array {
    $put=fm_put_multipart();
    if(isset($put['files'][$field])){
        $f=$put['files'][$field]; $ext=strtolower(pathinfo((string)$f['name'],PATHINFO_EXTENSION));
        $allowed=['txt','csv','pdf','jpg','jpeg','png','webp','gif','doc','docx','xls','xlsx','ppt','pptx'];
        if((int)$f['size']<=0||(int)$f['size']>20*1024*1024||!in_array($ext,$allowed,true)){@unlink($f['tmp']);json_response(['success'=>false,'message'=>'Unsupported upload.'],400);}
        $stored=date('YmdHis').'-'.bin2hex(random_bytes(8)).'.'.$ext; $target=upload_dir().DIRECTORY_SEPARATOR.$stored;
        if(!rename($f['tmp'],$target))json_response(['success'=>false,'message'=>'Cannot store uploaded file.'],500);
        @chmod($target,0644);
        return ['url'=>fm_url(upload_public_url($stored,(string)$f['name'])),'name'=>clean_upload_name($f['name']),'stored'=>$stored,'type'=>$f['type'],'size'=>$f['size']];
    }
    $a=function_exists('wf_store_files') ? wf_store_files($field,1) : [];
    if(isset($a[0]['url']))$a[0]['url']=fm_url($a[0]['url']);
    return $a[0]??null;
}
function fm_cleanup(?array $f): void { if($f) delete_uploaded_file($f['url']??null); }
function fm_try(string $sql): void {
    try { db()->exec($sql); }
    catch(Throwable $e) {
        $driverCode=$e instanceof PDOException?(int)($e->errorInfo[1]??0):0;
        if(!in_array($driverCode,[1060,1061],true))error_log('[fourm/migration] '.$e->getMessage());
    }
}
function fm_json($v): ?string { return $v===null?null:json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); }
function fm_log(array $u,string $action,?string $cur=null,?string $course=null,?string $emp=null,$old=null,$new=null): void {
    db_execute('INSERT INTO fourm_curriculumlogs (Action,CurriculumID,CourseID,EmployeeID,OldValue,NewValue,PerformedByID,PerformedBy) VALUES (?,?,?,?,?,?,?,?)',[$action,$cur,$course,$emp,fm_json($old),fm_json($new),fm_uid($u),fm_actor($u)]);
}
function fm_admin_email(): string {
    global $config;
    $email = trim((string)($config['fourm_admin_email'] ?? ''));
    if ($email === '') $email = trim((string)($config['admin_email'] ?? ''));
    return $email !== '' ? $email : 'sattaya_w@thaisummit-harness.co.th';
}
function fm_valid_email($value): ?string {
    $email=strtolower(trim((string)($value??'')));
    return preg_match('/^[^\s@]+@thaisummit-harness\.co\.th$/i',$email)===1?$email:null;
}
function fm_company_email(?string $employeeId): ?string {
    $id=fm_text($employeeId,50); if(!$id)return null;
    $row=db_row("SELECT CompanyEmail FROM employees WHERE EmployeeID=? AND CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>'' LIMIT 1",[$id]);
    return fm_valid_email($row['CompanyEmail']??null);
}
function fm_responsible_employee(array $u,$requestedEmployeeId=null): array {
    $selected=fm_admin($u)&&fm_text($requestedEmployeeId,50)!==''?fm_text($requestedEmployeeId,50):fm_uid($u);
    if($selected==='')json_response(['success'=>false,'message'=>'Responsible employee is required.'],400);
    $employee=db_row('SELECT EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1',[$selected]);
    if(!$employee)json_response(['success'=>false,'message'=>'Responsible employee was not found in Employee Master.'],400);
    $employee['CompanyEmail']=fm_valid_email($employee['CompanyEmail']??null);
    $employee['EmailReady']=$employee['CompanyEmail']!==null;
    return $employee;
}
function fm_notice_department_mismatch($noticeDepartment,$responsibleDepartment): bool {
    $notice=fm_key($noticeDepartment);$responsible=fm_key($responsibleDepartment);
    return $notice!==''&&$responsible!==''&&$notice!==$responsible;
}
function fm_recipients(array $values): string {
    $out=[];$seen=[];
    foreach($values as $value){foreach(explode(',',(string)$value) as $raw){$email=fm_valid_email($raw);$key=$email?strtolower($email):'';if($email&&!isset($seen[$key])){$seen[$key]=true;$out[]=$email;}}}
    return implode(',',$out);
}
function fm_mail_subject(string $action,string $detail=''): string { return '[4M Change] '.$action.($detail!==''?' - '.$detail:''); }
function fm_mail(string $subject,string $title,string $tone,array $intro,array $details,array $actions=[],string $note=''): array {
    if(function_exists('wf_hiyari_mail')){
        return wf_hiyari_mail([
            'subject'=>$subject,
            'title'=>$title,
            'kicker'=>'4M CHANGE MANAGEMENT',
            'moduleLabel'=>'4M Change Management Module',
            'tone'=>$tone,
            'greeting'=>'เรียน ผู้เกี่ยวข้อง / Dear user',
            'intro'=>$intro,
            'details'=>$details,
            'actions'=>$actions,
            'note'=>$note,
        ]);
    }
    return ['subject'=>$subject,'body'=>$title."\n\n".implode("\n",$intro),'html'=>null];
}
function fm_notice_mail(array $notice,string $event,string $status=null): array {
    $no=(string)($notice['NoticeNo']??'-');
    $title=(string)($notice['Title']??'-');
    $tone=$event==='NoticeClosed'?'completed':($event==='NoticePending'?'pending':'neutral');
    $headline=[
        'NoticeCreated'=>'มี 4M Change Notice ใหม่ / New 4M Change Notice',
        'NoticePending'=>'4M Change Notice ถูกปรับเป็น Pending',
        'NoticeClosed'=>'4M Change Notice ปิดงานแล้ว / Notice Closed',
    ][$event]??'4M Change Notification';
    $intro=[
        $event==='NoticeCreated'?'ระบบได้รับ 4M Change Notice ใหม่ กรุณาตรวจสอบรายละเอียดและดำเนินการตามความเหมาะสม':'ระบบแจ้งสถานะล่าสุดของ 4M Change Notice กรุณาตรวจสอบรายละเอียดในระบบ',
    ];
    return fm_mail(fm_mail_subject(str_replace('Notice','Notice ',$event),$no),$headline,$tone,$intro,[
        ['label'=>'Notice No','value'=>$no,'highlight'=>true],
        ['label'=>'Title','value'=>$title,'highlight'=>true],
        ['label'=>'Change Type','value'=>$notice['ChangeType']??'-'],
        ['label'=>'Department','value'=>$notice['Department']??'-'],
        ['label'=>'Request Date','value'=>$notice['RequestDate']??'-'],
        ['label'=>'Created By','value'=>$notice['CreatedBy']??'-'],
        ['label'=>'Responsible Person','value'=>$notice['ResponsiblePerson']??'-'],
        ['label'=>'Status','value'=>$status??($notice['Status']??'Open'),'highlight'=>true],
    ],['เปิดระบบเพื่อตรวจสอบรายละเอียด 4M Change Notice และติดตาม action plan']);
}
function fm_notice_reassigned_mail(array $notice): array {
    return fm_mail(
        fm_mail_subject('Responsible Person Assigned',(string)($notice['NoticeNo']??'-')),
        'มอบหมายผู้รับผิดชอบ 4M Change Notice / Notice Assignment',
        'pending',
        ['คุณได้รับมอบหมายให้เป็นผู้รับผิดชอบ Change Notice นี้ กรุณาตรวจสอบรายละเอียดและติดตามการดำเนินงานในระบบ'],
        [
            ['label'=>'Notice No','value'=>$notice['NoticeNo']??'-','highlight'=>true],
            ['label'=>'Title','value'=>$notice['Title']??'-','highlight'=>true],
            ['label'=>'Notice Department','value'=>$notice['Department']??'-'],
            ['label'=>'Responsible Person','value'=>$notice['ResponsiblePerson']??'-','highlight'=>true],
            ['label'=>'Responsible Department','value'=>$notice['ResponsibleDepartment']??'-'],
            ['label'=>'Status','value'=>$notice['Status']??'Open'],
        ],
        ['เปิดระบบเพื่อตรวจสอบ Change Notice ที่ได้รับมอบหมาย'],
        'แผนกของ Notice และแผนกของผู้รับผิดชอบสามารถแตกต่างกันได้ตามลักษณะงาน'
    );
}
function fm_task_mail(array $notice,array $task,string $eventLabel): array {
    $done=strcasecmp($eventLabel,'Done')===0;
    return fm_mail(fm_mail_subject('Action Plan '.$eventLabel,(string)($notice['NoticeNo']??'-')),$done?'4M Action Plan เสร็จสิ้นแล้ว':'มี 4M Action Plan ใหม่','pending',[
        $done?'Action Plan ของ 4M Change Notice ถูกอัปเดตเป็น Done แล้ว':'มีการสร้าง Action Plan สำหรับ 4M Change Notice กรุณาติดตามตามกำหนด',
    ],[
        ['label'=>'Notice No','value'=>$notice['NoticeNo']??'-','highlight'=>true],
        ['label'=>'Notice Title','value'=>$notice['Title']??'-'],
        ['label'=>'Task','value'=>$task['TaskTitle']??'-','highlight'=>true],
        ['label'=>'Owner','value'=>$task['OwnerName']??'-'],
        ['label'=>'Due Date','value'=>$task['DueDate']??'-'],
        ['label'=>'Status','value'=>$task['Status']??'-','highlight'=>true],
    ],['เปิดระบบเพื่อตรวจสอบ/อัปเดต Action Plan ในโมดูล 4M Change']);
}
function fm_queue(?string $notice,?string $task,string $event,string $subject,string $body,?string $html=null,?string $recipients=null): void {
    try {
        db_execute("INSERT INTO fourm_emailoutbox (NoticeID,TaskID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES (?,?,?,?,?,?,?,'Queued')",[$notice,$task,$event,$recipients?:fm_admin_email(),$subject,$body,$html]);
        mailer_outbox_best_effort('fourm_emailoutbox',(int)db()->lastInsertId(),'Recipients','HtmlBody');
    } catch(Throwable $e) { error_log('[fourm/email] queue failed: '.$e->getMessage()); }
}
function fm_notice_no($date): string {
    $year=(int)substr((string)($date?:date('Y-m-d')),0,4); if($year<2000)$year=(int)date('Y');
    $prefix='4M-'.$year.'-'; $n=(int)(db_row('SELECT MAX(CAST(SUBSTRING(NoticeNo,?) AS UNSIGNED)) n FROM fourm_changenotices WHERE NoticeNo LIKE ?',[strlen($prefix)+1,$prefix.'%'])['n']??0);
    return $prefix.str_pad((string)($n+1),3,'0',STR_PAD_LEFT);
}
function fm_ensure(): void {
    static $done=false; if($done)return;
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_manrecords (id VARCHAR(36) PRIMARY KEY,Department VARCHAR(100) NOT NULL,TotalAttendance INT DEFAULT 0,Pass INT DEFAULT 0,Fail INT DEFAULT 0,Status VARCHAR(20) DEFAULT 'Pending',ExamDate DATE,Notes TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_dept(Department),KEY idx_date(ExamDate)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_changenotices (id VARCHAR(36) PRIMARY KEY,NoticeNo VARCHAR(50) NOT NULL,RequestDate DATE NOT NULL,Title VARCHAR(255) NOT NULL,Description TEXT,ChangeType VARCHAR(20) NOT NULL,ResponsiblePerson VARCHAR(100),ResponsibleEmployeeID VARCHAR(50),Department VARCHAR(100),AttachmentUrl TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Open',ClosingComment TEXT,ClosingDocUrl TEXT,ClosedDate DATE,ClosedBy VARCHAR(100),SafetyImpact VARCHAR(20) DEFAULT 'N/A',QualityImpact VARCHAR(20) DEFAULT 'N/A',ProductionImpact VARCHAR(20) DEFAULT 'N/A',EnvironmentImpact VARCHAR(20) DEFAULT 'N/A',TrainingRequired TINYINT(1) DEFAULT 0,ImpactNote TEXT,CreatedByID VARCHAR(50) NOT NULL,CreatedBy VARCHAR(100) NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_noticeno(NoticeNo),KEY idx_status(Status),KEY idx_date(RequestDate),KEY idx_responsible_employee(ResponsibleEmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_actiontasks (id VARCHAR(36) PRIMARY KEY,NoticeID VARCHAR(36) NOT NULL,TaskTitle VARCHAR(255) NOT NULL,OwnerName VARCHAR(100),DueDate DATE,Status VARCHAR(20) NOT NULL DEFAULT 'Pending',Notes TEXT,CompletedAt DATETIME,CompletedBy VARCHAR(100),CreatedByID VARCHAR(50) NOT NULL,CreatedBy VARCHAR(100) NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_notice(NoticeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,NoticeID VARCHAR(36),TaskID VARCHAR(36),EventType VARCHAR(50) NOT NULL,Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body TEXT NOT NULL,HtmlBody MEDIUMTEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Queued',SentAt DATETIME,Error TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculums (id VARCHAR(36) PRIMARY KEY,`Year` INT NOT NULL,Department VARCHAR(100) NOT NULL,CurriculumCode VARCHAR(50) NOT NULL,CurriculumTitle VARCHAR(255) NOT NULL,Notes TEXT,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cur(`Year`,Department,CurriculumCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_coursemaster (id VARCHAR(36) PRIMARY KEY,CourseCode VARCHAR(50) NOT NULL,CourseTitle VARCHAR(255) NOT NULL,Category VARCHAR(100),Notes TEXT,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_code(CourseCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_courses (id VARCHAR(36) PRIMARY KEY,CurriculumID VARCHAR(36) NOT NULL,CourseMasterID VARCHAR(36),CourseCode VARCHAR(50) NOT NULL,CourseTitle VARCHAR(255) NOT NULL,SortOrder INT NOT NULL DEFAULT 99,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_course(CurriculumID,CourseCode),KEY idx_cur(CurriculumID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_courseemployees (id VARCHAR(36) PRIMARY KEY,CourseID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100) NOT NULL,Department VARCHAR(100),Position VARCHAR(100),Status VARCHAR(20) NOT NULL DEFAULT 'Assigned',AssignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,AssignedByID VARCHAR(50),AssignedBy VARCHAR(100),RemovedAt DATETIME,RemovedByID VARCHAR(50),RemovedBy VARCHAR(100),Notes TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_course_emp(CourseID,EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculumemployees (id VARCHAR(36) PRIMARY KEY,CurriculumID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100) NOT NULL,Department VARCHAR(100),Position VARCHAR(100),Status VARCHAR(20) NOT NULL DEFAULT 'Assigned',AssignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,AssignedByID VARCHAR(50),AssignedBy VARCHAR(100),RemovedAt DATETIME,RemovedByID VARCHAR(50),RemovedBy VARCHAR(100),Notes TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cur_emp(CurriculumID,EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculumlogs (id INT AUTO_INCREMENT PRIMARY KEY,Action VARCHAR(50) NOT NULL,CurriculumID VARCHAR(36),CourseID VARCHAR(36),EmployeeID VARCHAR(50),OldValue LONGTEXT,NewValue LONGTEXT,PerformedByID VARCHAR(50),PerformedBy VARCHAR(100),PerformedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_time(PerformedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach(["SafetyImpact VARCHAR(20) DEFAULT 'N/A'","QualityImpact VARCHAR(20) DEFAULT 'N/A'","ProductionImpact VARCHAR(20) DEFAULT 'N/A'","EnvironmentImpact VARCHAR(20) DEFAULT 'N/A'","TrainingRequired TINYINT(1) DEFAULT 0","ImpactNote TEXT","ResponsibleEmployeeID VARCHAR(50) DEFAULT NULL AFTER ResponsiblePerson"] as $col) fm_try("ALTER TABLE fourm_changenotices ADD COLUMN $col");
    fm_try('ALTER TABLE fourm_changenotices ADD INDEX idx_responsible_employee (ResponsibleEmployeeID)');
    fm_try("ALTER TABLE fourm_emailoutbox ADD COLUMN HtmlBody MEDIUMTEXT");
    fm_try("ALTER TABLE fourm_courses ADD COLUMN CourseMasterID VARCHAR(36)");
    $done=true;
}
function fm_cur(string $id): ?array { return db_row('SELECT * FROM fourm_curriculums WHERE id=?',[$id]); }
function fm_course(string $id): ?array { return db_row('SELECT c.*,cur.`Year`,cur.Department,cur.CurriculumCode,cur.CurriculumTitle FROM fourm_courses c JOIN fourm_curriculums cur ON cur.id=c.CurriculumID WHERE c.id=?',[$id]); }
function fm_emp(string $id): ?array { return db_row('SELECT EmployeeID,EmployeeName,Department,Position FROM employees WHERE EmployeeID=? LIMIT 1',[$id]); }
function fm_cur_ass(string $id): ?array { return db_row('SELECT a.*,c.`Year`,c.Department CurriculumDepartment,c.CurriculumCode,c.CurriculumTitle FROM fourm_curriculumemployees a JOIN fourm_curriculums c ON c.id=a.CurriculumID WHERE a.id=?',[$id]); }
function fm_course_ass(string $id): ?array { return db_row('SELECT a.*,co.CurriculumID,co.CourseCode,co.CourseTitle,cur.`Year`,cur.Department CurriculumDepartment,cur.CurriculumCode,cur.CurriculumTitle FROM fourm_courseemployees a JOIN fourm_courses co ON co.id=a.CourseID JOIN fourm_curriculums cur ON cur.id=co.CurriculumID WHERE a.id=?',[$id]); }
function fm_task_payload(array $b,?array $old=null): array {
    $title=fm_text($b['TaskTitle']??($old['TaskTitle']??''),255); $status=fm_text($b['Status']??($old['Status']??'Pending'),20);
    if(!$title) json_response(['success'=>false,'message'=>'Task title is required.'],400);
    if(!in_array($status,['Pending','In Progress','Done'],true)) json_response(['success'=>false,'message'=>'Task status is invalid.'],400);
    return ['TaskTitle'=>$title,'OwnerName'=>fm_text($b['OwnerName']??($old['OwnerName']??''),100)?:null,'DueDate'=>fm_text($b['DueDate']??($old['DueDate']??''),10)?:null,'Status'=>$status,'Notes'=>fm_text($b['Notes']??($old['Notes']??''),1000)?:null];
}
function fm_counts(array $b,?array $old=null): array {
    $t=(int)($b['TotalAttendance']??($old['TotalAttendance']??0)); $p=(int)($b['Pass']??($old['Pass']??0)); $f=array_key_exists('Fail',$b)?(int)$b['Fail']:$t-$p;
    if($t<0||$p<0||$f<0||$p+$f!==$t) json_response(['success'=>false,'message'=>'Invalid attendance totals.'],400);
    return [$t,$p,$f];
}
function fm_assign(array $u,string $kind,string $parent,array $ids,?string $notes,?array $scope=null): array {
    $table=$kind==='curriculum'?'fourm_curriculumemployees':'fourm_courseemployees'; $parentCol=$kind==='curriculum'?'CurriculumID':'CourseID';
    $out=['created'=>[],'reassigned'=>[],'skipped'=>[],'missing'=>[],'blocked'=>[]];
    foreach(array_unique(array_filter(array_map(fn($v)=>fm_text($v,50),$ids))) as $eid){
        $e=fm_emp($eid); if(!$e){$out['missing'][]=$eid;continue;}
        $old=db_row("SELECT * FROM $table WHERE $parentCol=? AND EmployeeID=?",[$parent,$eid]);
        if(($old['Status']??'')==='Assigned'){$out['skipped'][]=$eid;continue;}
        if($scope){
            $active=db_row("SELECT a.EmployeeID,c.id CurriculumID,c.CurriculumCode,c.CurriculumTitle FROM fourm_curriculumemployees a JOIN fourm_curriculums c ON c.id=a.CurriculumID WHERE a.EmployeeID=? AND a.Status='Assigned' AND c.IsActive=1 AND c.`Year`=? AND c.Department=? AND c.id<>? LIMIT 1",[$eid,$scope['Year'],$scope['Department'],$scope['CurriculumID']]);
            if($active){$out['blocked'][]=$active;continue;}
        }
        if($old){db_execute("UPDATE $table SET EmployeeName=?,Department=?,Position=?,Status='Assigned',AssignedAt=NOW(),AssignedByID=?,AssignedBy=?,RemovedAt=NULL,RemovedByID=NULL,RemovedBy=NULL,Notes=? WHERE id=?",[$e['EmployeeName'],$e['Department'],$e['Position'],fm_uid($u),fm_actor($u),$notes,$old['id']]);$out['reassigned'][]=$eid;}
        else{$id=fm_uuid();db_execute("INSERT INTO $table (id,$parentCol,EmployeeID,EmployeeName,Department,Position,AssignedByID,AssignedBy,Notes) VALUES (?,?,?,?,?,?,?,?,?)",[$id,$parent,$eid,$e['EmployeeName'],$e['Department'],$e['Position'],fm_uid($u),fm_actor($u),$notes]);$out['created'][]=$eid;}
        $prefix=$kind==='curriculum'?'CURRICULUM_ASSIGNMENT':'ASSIGNMENT';
        fm_log($u,$prefix.($old?'_REASSIGN':'_CREATE'),$kind==='curriculum'?$parent:($scope['CurriculumID']??null),$kind==='course'?$parent:null,$eid,$old,array_merge($e,['Status'=>'Assigned','Notes'=>$notes]));
    } return $out;
}
function fm_save_courses(array $u,array $b,string $curriculumId,array $masterIds): array {
    $out=['created'=>[],'skipped'=>[]];
    foreach($masterIds as $masterId){
        $master=db_row('SELECT * FROM fourm_coursemaster WHERE id=? AND IsActive=1',[$masterId]);
        if(!$master){$out['skipped'][]=$masterId;continue;}
        $match=fm_find_course($curriculumId,(string)$master['CourseCode']);
        $old=$match?db_row('SELECT * FROM fourm_courses WHERE id=?',[$match['id']]):null;
        if($old){
            db_execute('UPDATE fourm_courses SET CourseMasterID=?,CourseTitle=?,IsActive=1 WHERE id=?',[$masterId,$master['CourseTitle'],$old['id']]);
            $out['created'][]=$old['id'];
            fm_log($u,'COURSE_RESTORE',$curriculumId,$old['id'],null,$old,['CourseMasterID'=>$masterId,'CourseTitle'=>$master['CourseTitle'],'IsActive'=>1]);
        }else{
            $id=fm_uuid();
            db_execute('INSERT INTO fourm_courses (id,CurriculumID,CourseMasterID,CourseCode,CourseTitle,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$curriculumId,$masterId,$master['CourseCode'],$master['CourseTitle'],fm_uid($u),fm_actor($u)]);
            $out['created'][]=$id;
            fm_log($u,'COURSE_CREATE',$curriculumId,$id,null,null,['CourseMasterID'=>$masterId,'CourseCode'=>$master['CourseCode'],'CourseTitle'=>$master['CourseTitle']]);
        }
    }
    if(!$masterIds){
        $code=fm_required($b['CourseCode']??'',50,'Course code required.');
        $title=fm_required($b['CourseTitle']??'',255,'Course title required.');
        if(fm_course_duplicate($curriculumId,$code))fm_duplicate_response('Course code already exists in this curriculum.');
        $sort=max(1,(int)($b['SortOrder']??99)); $id=fm_uuid();
        db_execute('INSERT INTO fourm_courses (id,CurriculumID,CourseCode,CourseTitle,SortOrder,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$curriculumId,$code,$title,$sort,fm_uid($u),fm_actor($u)]);
        $out['created'][]=$id;
        fm_log($u,'COURSE_CREATE',$curriculumId,$id,null,null,['CourseCode'=>$code,'CourseTitle'=>$title,'SortOrder'=>$sort]);
    }
    return $out;
}
function handle_fourm_routes(string $method,string $path): bool {
    if(strpos($path,'/fourm')!==0)return false; $u=require_user();
    try{fm_ensure();}catch(Throwable $e){error_log('[fourm/schema] '.$e->getMessage());json_response(['success'=>false,'code'=>'FOURM_SCHEMA_ERROR','message'=>'4M database schema is unavailable.'],500);}
    $b=fm_body();
    if($method==='GET'&&$path==='/fourm/stats'){
        $y=(int)($_GET['year']??date('Y'));
        $coverage="EXISTS (SELECT 1 FROM fourm_curriculums cur WHERE cur.IsActive=1 AND cur.`Year`=YEAR(n.RequestDate) AND COALESCE(NULLIF(TRIM(cur.Department),''),'__UNSPECIFIED__')=COALESCE(NULLIF(TRIM(n.Department),''),'__UNSPECIFIED__') LIMIT 1)";
        $isAdmin=fm_admin($u);
        $userDept=fm_text($u['department']??$u['Department']??'',100);
        $canTrainingOps=$isAdmin||($userDept!==''&&fm_has_permission($u,'FOURM_TRAINING_MANAGE'));
        $curDeptWhere=$isAdmin?'':($canTrainingOps?' AND cur.Department=?':' AND 1=0');
        $curDeptParams=$isAdmin?[]:($canTrainingOps?[$userDept]:[]);
        $noticeDeptWhere=$isAdmin?'':($canTrainingOps?" AND COALESCE(NULLIF(TRIM(n.Department),''),'__UNSPECIFIED__')=?":' AND 1=0');
        $noticeDeptParams=$isAdmin?[]:($canTrainingOps?[$userDept?:'__UNSPECIFIED__']:[]);
        $k=db_row("SELECT COUNT(*) total,COALESCE(SUM(Status='Open'),0) open,COALESCE(SUM(Status='Pending'),0) pending,COALESCE(SUM(Status='Closed'),0) closed FROM fourm_changenotices WHERE YEAR(RequestDate)=?",[$y])?:[];
        $trainingSummary=db_row("SELECT COUNT(DISTINCT cur.id) curriculums,COUNT(DISTINCT CASE WHEN co.IsActive=1 THEN co.id END) courses,COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END) employees,SUM(ce.Status='Transferred') transferred FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.IsActive=1 AND cur.`Year`=?$curDeptWhere",array_merge([$y],$curDeptParams))?:[];
        $trainingRequiredSummary=db_row("SELECT COUNT(*) total,COALESCE(SUM(n.Status IN ('Open','Pending')),0) active,COALESCE(SUM(n.Status='Closed'),0) closed,COALESCE(SUM($coverage),0) covered,COALESCE(SUM(NOT $coverage),0) missing FROM fourm_changenotices n WHERE n.TrainingRequired=1 AND YEAR(n.RequestDate)=?$noticeDeptWhere",array_merge([$y],$noticeDeptParams))?:[];
        $trainingRequiredGapList=db_rows("SELECT n.id,n.NoticeNo,n.Title,n.Department,n.ChangeType,n.Status,n.RequestDate,n.ResponsiblePerson,DATEDIFF(CURDATE(),n.RequestDate) ageDays FROM fourm_changenotices n WHERE n.TrainingRequired=1 AND YEAR(n.RequestDate)=?$noticeDeptWhere AND NOT $coverage ORDER BY (n.Status='Closed') ASC,ageDays DESC,n.RequestDate ASC LIMIT 6",array_merge([$y],$noticeDeptParams));
        $trainingRequiredDeptGap=db_rows("SELECT COALESCE(NULLIF(TRIM(n.Department),''),'Unspecified') Department,COUNT(*) total,COALESCE(SUM($coverage),0) covered,COALESCE(SUM(NOT $coverage),0) missing FROM fourm_changenotices n WHERE n.TrainingRequired=1 AND YEAR(n.RequestDate)=?$noticeDeptWhere GROUP BY COALESCE(NULLIF(TRIM(n.Department),''),'Unspecified') ORDER BY missing DESC,total DESC,Department LIMIT 8",array_merge([$y],$noticeDeptParams));
        $trainingMatrixHealthRows=db_rows("SELECT * FROM (SELECT cur.id,cur.Department,cur.CurriculumCode,cur.CurriculumTitle,COALESCE(COUNT(DISTINCT CASE WHEN co.IsActive=1 THEN co.id END),0) CourseCount,COALESCE(COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END),0) AssignedCount,COALESCE(SUM(CASE WHEN ce.Status='Transferred' THEN 1 ELSE 0 END),0) TransferredCount,COALESCE(SUM(CASE WHEN ce.Status='Removed' THEN 1 ELSE 0 END),0) RemovedCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.IsActive=1 AND cur.`Year`=?$curDeptWhere GROUP BY cur.id,cur.Department,cur.CurriculumCode,cur.CurriculumTitle) h WHERE h.CourseCount=0 OR h.AssignedCount=0 OR h.TransferredCount+h.RemovedCount>=GREATEST(3,h.AssignedCount) ORDER BY (h.CourseCount=0) DESC,(h.AssignedCount=0) DESC,(h.TransferredCount+h.RemovedCount) DESC,h.Department,h.CurriculumCode LIMIT 8",array_merge([$y],$curDeptParams));
        $trainingMatrixHealthSummary=db_row("SELECT COUNT(*) curriculums,COALESCE(SUM(CourseCount=0),0) noCourses,COALESCE(SUM(AssignedCount=0),0) noEmployees,COALESCE(SUM(TransferredCount+RemovedCount>=GREATEST(3,AssignedCount)),0) movementWatch,COALESCE(SUM(CourseCount>0 AND AssignedCount>0),0) ready FROM (SELECT cur.id,COALESCE(COUNT(DISTINCT CASE WHEN co.IsActive=1 THEN co.id END),0) CourseCount,COALESCE(COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END),0) AssignedCount,COALESCE(SUM(CASE WHEN ce.Status='Transferred' THEN 1 ELSE 0 END),0) TransferredCount,COALESCE(SUM(CASE WHEN ce.Status='Removed' THEN 1 ELSE 0 END),0) RemovedCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.IsActive=1 AND cur.`Year`=?$curDeptWhere GROUP BY cur.id) h",array_merge([$y],$curDeptParams))?:[];
        json_response(['success'=>true,'data'=>[
            'noticeKpi'=>$k,
            'byType'=>db_rows('SELECT ChangeType label,COUNT(*) count FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY ChangeType',[$y]),
            'monthly'=>db_rows('SELECT MONTH(RequestDate) month,COUNT(*) count FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY MONTH(RequestDate)',[$y]),
            'byDept'=>db_rows('SELECT COALESCE(Department,?) label,COUNT(*) count FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department ORDER BY count DESC LIMIT 12',['Unspecified',$y]),
            'manSummary'=>db_rows('SELECT Department,SUM(TotalAttendance) totalAtt,SUM(Pass) totalPass,SUM(Fail) totalFail,MAX(ExamDate) lastExam FROM fourm_manrecords WHERE YEAR(ExamDate)=? OR ExamDate IS NULL GROUP BY Department',[$y]),
            'overdueCount'=>(int)(db_row("SELECT COUNT(*) n FROM fourm_changenotices WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30 AND YEAR(RequestDate)=?",[$y])['n']??0),
            'byDeptType'=>db_rows('SELECT COALESCE(Department,?) Department,ChangeType,COUNT(*) count FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department,ChangeType',['Unspecified',$y]),
            'trainingSummary'=>$trainingSummary,
            'trainingRequiredSummary'=>$trainingRequiredSummary,
            'trainingRequiredGapList'=>$trainingRequiredGapList,
            'trainingRequiredDeptGap'=>$trainingRequiredDeptGap,
            'trainingMatrixHealthSummary'=>$trainingMatrixHealthSummary,
            'trainingMatrixHealthRows'=>$trainingMatrixHealthRows,
            'adminInsights'=>[
                'deptRank'=>db_rows("SELECT COALESCE(NULLIF(TRIM(Department),''),'Unspecified') Department,COUNT(*) total,SUM(Status='Open') open,SUM(Status='Pending') pending,SUM(Status='Closed') closed,SUM(Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30) overdue FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department ORDER BY total DESC,overdue DESC LIMIT 10",[$y]),
                'pendingAging'=>db_rows("SELECT id,NoticeNo,Title,Department,ChangeType,Status,RequestDate,ResponsiblePerson,DATEDIFF(CURDATE(),RequestDate) ageDays FROM fourm_changenotices WHERE Status IN ('Open','Pending') AND YEAR(RequestDate)=? ORDER BY ageDays DESC LIMIT 10",[$y]),
                'monthlyClosure'=>db_rows("SELECT MONTH(RequestDate) month,COUNT(*) total,SUM(Status='Closed') closed,ROUND(SUM(Status='Closed')/NULLIF(COUNT(*),0)*100) closureRate FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY MONTH(RequestDate)",[$y]),
                'lowClosureDept'=>db_rows("SELECT COALESCE(NULLIF(TRIM(Department),''),'Unspecified') Department,COUNT(*) total,SUM(Status='Closed') closed,SUM(Status IN ('Open','Pending')) active,ROUND(SUM(Status='Closed')/NULLIF(COUNT(*),0)*100) closureRate FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department ORDER BY closureRate ASC,active DESC LIMIT 6",[$y]),
                'typePendingRisk'=>db_rows("SELECT ChangeType,COUNT(*) total,SUM(Status='Open') open,SUM(Status='Pending') pending,SUM(Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30) overdue FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY ChangeType ORDER BY pending DESC,overdue DESC LIMIT 6",[$y])
            ]
        ]]);
    }
    if($method==='GET'&&$path==='/fourm/man-records'){ $sql='SELECT * FROM fourm_manrecords WHERE 1=1';$pa=[];foreach(['dept'=>'Department','status'=>'Status'] as $q=>$c)if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}if(!empty($_GET['year'])){$sql.=' AND YEAR(ExamDate)=?';$pa[]=(int)$_GET['year'];}if(!empty($_GET['q'])){$sql.=' AND Department LIKE ?';$pa[]='%'.fm_text($_GET['q'],100).'%';}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ExamDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='POST'&&$path==='/fourm/man-records'){require_admin();[$t,$p,$f]=fm_counts($b);$dept=fm_required($b['Department']??'',100,'Department required.');$status=fm_text($b['Status']??'Pending',20);if(!in_array($status,['Pending','Pass','Fail'],true))json_response(['success'=>false,'message'=>'Invalid Man Record status.'],400);db_execute('INSERT INTO fourm_manrecords (id,Department,TotalAttendance,Pass,Fail,Status,ExamDate,Notes,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?)',[fm_uuid(),$dept,$t,$p,$f,$status,$b['ExamDate']??null,fm_text($b['Notes']??'',1000)?:null,fm_actor($u)]);json_response(['success'=>true],201);}
    $p=route_params($path,'/fourm/man-records/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$old=db_row('SELECT * FROM fourm_manrecords WHERE id=?',[$p['id']]);if(!$old)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){db_execute('DELETE FROM fourm_manrecords WHERE id=?',[$p['id']]);json_response(['success'=>true]);}[$t,$pa,$f]=fm_counts($b,$old);$status=fm_text($b['Status']??$old['Status'],20);if(!in_array($status,['Pending','Pass','Fail'],true))json_response(['success'=>false,'message'=>'Invalid Man Record status.'],400);db_execute('UPDATE fourm_manrecords SET Department=?,TotalAttendance=?,Pass=?,Fail=?,Status=?,ExamDate=?,Notes=? WHERE id=?',[fm_required($b['Department']??$old['Department'],100,'Department required.'),$t,$pa,$f,$status,$b['ExamDate']??$old['ExamDate'],array_key_exists('Notes',$b)?(fm_text($b['Notes'],1000)?:null):$old['Notes'],$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-department-scopes'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT cur.Department,COUNT(DISTINCT cur.id) CurriculumCount,COUNT(DISTINCT CASE WHEN co.IsActive=1 THEN co.id END) CourseCount,COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END) ScopeEmployees,COUNT(DISTINCT CASE WHEN ce.Status='Transferred' THEN ce.id END) TransferredCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.IsActive=1 AND cur.`Year`=?";$pa=[$y];$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=' AND cur.Department=?';$pa[]=$d;}if(!empty($_GET['q'])){$sql.=' AND cur.Department LIKE ?';$pa[]='%'.fm_text($_GET['q'],100).'%';}json_response(['success'=>true,'data'=>db_rows($sql.' GROUP BY cur.Department ORDER BY cur.Department',$pa)]);}
    if($method==='POST'&&$path==='/fourm/training-curriculums/bulk-code-preview'){require_admin();$options=fm_bulk_code_options($b);$rows=db_rows('SELECT id,`Year`,Department,CurriculumCode,CurriculumTitle,IsActive FROM fourm_curriculums WHERE `Year`=?',[$options['year']]);json_response(['success'=>true,'data'=>fm_bulk_code_preview($rows,$options)]);}
    if($method==='PUT'&&$path==='/fourm/training-curriculums/bulk-code'){
        require_admin();$options=fm_bulk_code_options($b);$expected=fm_bulk_code_changes($b['expectedChanges']??[]);
        $result=fm_write(fn()=>fm_transaction(function()use($u,$options,$expected){
            $rows=db_rows('SELECT id,`Year`,Department,CurriculumCode,CurriculumTitle,IsActive FROM fourm_curriculums WHERE `Year`=? FOR UPDATE',[$options['year']]);
            $preview=fm_bulk_code_preview($rows,$options);$blocked=$preview['conflictCount']+$preview['ambiguousCount']+$preview['invalidCount'];
            if(!$preview['matchedCount'])return ['state'=>'empty','preview'=>$preview];
            if($blocked||$preview['readyCount']!==$preview['matchedCount'])return ['state'=>'blocked','preview'=>$preview];
            if(!$expected||json_encode($expected)!==json_encode(fm_bulk_code_changes($preview['rows'])))return ['state'=>'stale','preview'=>$preview];
            foreach($preview['rows'] as $item)db_execute('UPDATE fourm_curriculums SET CurriculumCode=? WHERE id=?',['__BULK__'.fm_uuid(),$item['id']]);
            foreach($preview['rows'] as $item){db_execute('UPDATE fourm_curriculums SET CurriculumCode=? WHERE id=?',[$item['newCode'],$item['id']]);fm_log($u,'CURRICULUM_CODE_BULK_UPDATE',$item['id'],null,null,['CurriculumCode'=>$item['oldCode']],['CurriculumCode'=>$item['newCode'],'BatchScope'=>$options]);}
            return ['state'=>'updated','preview'=>$preview];
        }),'A resulting curriculum code already exists in the same year and department.');
        if($result['state']==='empty')json_response(['success'=>false,'message'=>'No curriculum codes match the requested fragment.','data'=>$result['preview']],400);
        if($result['state']==='blocked')json_response(['success'=>false,'message'=>'Bulk change blocked. Resolve every preview conflict first.','data'=>$result['preview']],409);
        if($result['state']==='stale')json_response(['success'=>false,'message'=>'Curriculum data changed after preview. Preview the batch again.','data'=>$result['preview']],409);
        $result['preview']['changedCount']=$result['preview']['readyCount'];json_response(['success'=>true,'message'=>'Curriculum codes updated.','data'=>$result['preview']]);
    }
    if($method==='POST'&&$path==='/fourm/training-course-master'){require_admin();$code=fm_text($b['CourseCode']??'',50);if($code!==''&&fm_course_master_duplicate($code))fm_duplicate_response('Course code already exists in master.');}
    if($method==='POST'&&$path==='/fourm/training-curriculums'){require_admin();$year=(int)($b['Year']??date('Y'));$dept=fm_text($b['Department']??'',100);$code=fm_text($b['CurriculumCode']??'',50);if($dept!==''&&$code!==''&&fm_curriculum_duplicate($year,$dept,$code))fm_duplicate_response('Curriculum code already exists for this year and department.');}
    $duplicateParams=route_params($path,'/fourm/training-course-master/:id');if($duplicateParams!==null&&$method==='PUT'){require_admin();$master=db_row('SELECT * FROM fourm_coursemaster WHERE id=?',[$duplicateParams['id']]);$code=fm_text($b['CourseCode']??($master['CourseCode']??''),50);if($master&&$code!==''&&fm_course_master_duplicate($code,$duplicateParams['id']))fm_duplicate_response('Course code already exists in master.');}
    $duplicateParams=route_params($path,'/fourm/training-curriculums/:id');if($duplicateParams!==null&&$method==='PUT'){require_admin();$curriculum=fm_cur($duplicateParams['id']);$year=(int)($b['Year']??($curriculum['Year']??0));$dept=fm_text($b['Department']??($curriculum['Department']??''),100);$code=fm_text($b['CurriculumCode']??($curriculum['CurriculumCode']??''),50);if($curriculum&&fm_curriculum_duplicate($year,$dept,$code,$duplicateParams['id']))fm_duplicate_response('Curriculum code already exists for this year and department.');}
    $duplicateParams=route_params($path,'/fourm/training-courses/:id');if($duplicateParams!==null&&$method==='PUT'){require_admin();$course=fm_course($duplicateParams['id']);$code=fm_text($b['CourseCode']??($course['CourseCode']??''),50);if($course&&$code!==''&&fm_course_duplicate((string)$course['CurriculumID'],$code,$duplicateParams['id']))fm_duplicate_response('Course code already exists in this curriculum.');}
    if($method==='GET'&&$path==='/fourm/training-curriculums'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT cur.*,COUNT(DISTINCT co.id) CourseCount,COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END) AssignedCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id AND co.IsActive=1 LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.`Year`=?";$pa=[$y];if(($_GET['includeInactive']??'')!=='1')$sql.=' AND cur.IsActive=1';$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=' AND cur.Department=?';$pa[]=$d;}json_response(['success'=>true,'data'=>db_rows($sql.' GROUP BY cur.id ORDER BY cur.Department,cur.CurriculumCode',$pa)]);}
    if($method==='POST'&&$path==='/fourm/training-curriculums'){require_admin();$d=fm_required($b['Department']??'',100,'Department required.');$code=fm_required($b['CurriculumCode']??'',50,'Curriculum code required.');$title=fm_required($b['CurriculumTitle']??'',255,'Curriculum title required.');$year=(int)($b['Year']??date('Y'));if($year<2000||$year>2100)json_response(['success'=>false,'message'=>'Invalid curriculum year.'],400);if(db_row('SELECT id FROM fourm_curriculums WHERE `Year`=? AND LOWER(TRIM(Department))=LOWER(TRIM(?)) AND LOWER(TRIM(CurriculumCode))=LOWER(TRIM(?)) LIMIT 1',[$year,$d,$code]))fm_duplicate_response('Curriculum code already exists for this year and department.');$id=fm_uuid();fm_write(fn()=>fm_transaction(function()use($u,$b,$id,$year,$d,$code,$title){db_execute('INSERT INTO fourm_curriculums (id,`Year`,Department,CurriculumCode,CurriculumTitle,Notes,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?)',[$id,$year,$d,$code,$title,fm_text($b['Notes']??'',1000)?:null,fm_uid($u),fm_actor($u)]);fm_log($u,'CURRICULUM_CREATE',$id,null,null,null,['Year'=>$year,'Department'=>$d,'CurriculumCode'=>$code,'CurriculumTitle'=>$title]);}),'Curriculum code already exists for this year and department.');json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/training-curriculums/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){fm_transaction(function()use($u,$p,$cur){db_execute('UPDATE fourm_curriculums SET IsActive=0 WHERE id=?',[$p['id']]);db_execute('UPDATE fourm_courses SET IsActive=0 WHERE CurriculumID=?',[$p['id']]);fm_log($u,'CURRICULUM_DISABLE',$p['id'],null,null,$cur,['IsActive'=>0]);});json_response(['success'=>true]);}$next=['Year'=>(int)($b['Year']??$cur['Year']),'Department'=>fm_required($b['Department']??$cur['Department'],100,'Department required.'),'CurriculumCode'=>fm_required($b['CurriculumCode']??$cur['CurriculumCode'],50,'Curriculum code required.'),'CurriculumTitle'=>fm_required($b['CurriculumTitle']??$cur['CurriculumTitle'],255,'Curriculum title required.'),'Notes'=>array_key_exists('Notes',$b)?(fm_text($b['Notes'],1000)?:null):$cur['Notes'],'IsActive'=>isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$cur['IsActive']];if($next['Year']<2000||$next['Year']>2100)json_response(['success'=>false,'message'=>'Invalid curriculum year.'],400);if(db_row('SELECT id FROM fourm_curriculums WHERE id<>? AND `Year`=? AND LOWER(TRIM(Department))=LOWER(TRIM(?)) AND LOWER(TRIM(CurriculumCode))=LOWER(TRIM(?)) LIMIT 1',[$p['id'],$next['Year'],$next['Department'],$next['CurriculumCode']]))fm_duplicate_response('Curriculum code already exists for this year and department.');fm_write(fn()=>fm_transaction(function()use($u,$p,$cur,$next){db_execute('UPDATE fourm_curriculums SET `Year`=?,Department=?,CurriculumCode=?,CurriculumTitle=?,Notes=?,IsActive=? WHERE id=?',[$next['Year'],$next['Department'],$next['CurriculumCode'],$next['CurriculumTitle'],$next['Notes'],$next['IsActive'],$p['id']]);fm_log($u,'CURRICULUM_UPDATE',$p['id'],null,null,$cur,$next);}),'Curriculum code already exists for this year and department.');json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-permissions')json_response(['success'=>true,'data'=>['permissionKey'=>'FOURM_TRAINING_MANAGE','canManageTraining'=>fm_admin($u)||(fm_text($u['department']??$u['Department']??'',100)!==''&&fm_has_permission($u,'FOURM_TRAINING_MANAGE')),'canManageAll'=>fm_admin($u),'canDeleteHistory'=>fm_admin($u),'department'=>fm_text($u['department']??$u['Department']??'',100),'stabilizationVersion'=>'20260819-app-duplicate-guard']]);
    if($method==='GET'&&$path==='/fourm/training-course-master'){ $sql='SELECT * FROM fourm_coursemaster WHERE 1=1';$pa=[];if(($_GET['includeInactive']??'')!=='1')$sql.=' AND IsActive=1';if(!empty($_GET['q'])){$like='%'.strtolower(fm_text($_GET['q'],120)).'%';$sql.=' AND (LOWER(CourseCode) LIKE ? OR LOWER(CourseTitle) LIKE ? OR LOWER(Category) LIKE ?)';$pa=[$like,$like,$like];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CourseCode',$pa)]);}
    if($method==='POST'&&$path==='/fourm/training-course-master'){require_admin();$code=fm_required($b['CourseCode']??'',50,'Course code required.');$title=fm_required($b['CourseTitle']??'',255,'Course title required.');if(db_row('SELECT id FROM fourm_coursemaster WHERE LOWER(TRIM(CourseCode))=LOWER(TRIM(?)) LIMIT 1',[$code]))fm_duplicate_response('Course code already exists in master.');$id=fm_uuid();$next=['CourseCode'=>$code,'CourseTitle'=>$title,'Category'=>fm_text($b['Category']??'',100)?:null,'Notes'=>fm_text($b['Notes']??'',1000)?:null];fm_write(fn()=>fm_transaction(function()use($u,$id,$next){db_execute('INSERT INTO fourm_coursemaster (id,CourseCode,CourseTitle,Category,Notes,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$next['CourseCode'],$next['CourseTitle'],$next['Category'],$next['Notes'],fm_uid($u),fm_actor($u)]);fm_log($u,'COURSE_MASTER_CREATE',null,null,null,null,$next);}),'Course code already exists in master.');json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/training-course-master/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$m=db_row('SELECT * FROM fourm_coursemaster WHERE id=?',[$p['id']]);if(!$m)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){if(($_GET['hard']??'')==='1'){if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CourseMasterID=?',[$p['id']])['n']??0)>0)json_response(['success'=>false,'message'=>'Course is linked.'],409);fm_transaction(function()use($u,$p,$m){fm_log($u,'COURSE_MASTER_DELETE',null,null,null,$m,null);db_execute('DELETE FROM fourm_coursemaster WHERE id=?',[$p['id']]);});}else fm_transaction(function()use($u,$p,$m){db_execute('UPDATE fourm_coursemaster SET IsActive=0 WHERE id=?',[$p['id']]);fm_log($u,'COURSE_MASTER_DISABLE',null,null,null,$m,['IsActive'=>0]);});json_response(['success'=>true]);}$next=['CourseCode'=>fm_required($b['CourseCode']??$m['CourseCode'],50,'Course code required.'),'CourseTitle'=>fm_required($b['CourseTitle']??$m['CourseTitle'],255,'Course title required.'),'Category'=>array_key_exists('Category',$b)?(fm_text($b['Category'],100)?:null):$m['Category'],'Notes'=>array_key_exists('Notes',$b)?(fm_text($b['Notes'],1000)?:null):$m['Notes'],'IsActive'=>isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$m['IsActive']];if(db_row('SELECT id FROM fourm_coursemaster WHERE id<>? AND LOWER(TRIM(CourseCode))=LOWER(TRIM(?)) LIMIT 1',[$p['id'],$next['CourseCode']]))fm_duplicate_response('Course code already exists in master.');fm_write(fn()=>fm_transaction(function()use($u,$p,$m,$next){db_execute('UPDATE fourm_coursemaster SET CourseCode=?,CourseTitle=?,Category=?,Notes=?,IsActive=? WHERE id=?',[$next['CourseCode'],$next['CourseTitle'],$next['Category'],$next['Notes'],$next['IsActive'],$p['id']]);db_execute('UPDATE fourm_courses SET CourseCode=?,CourseTitle=? WHERE CourseMasterID=?',[$next['CourseCode'],$next['CourseTitle'],$p['id']]);fm_log($u,'COURSE_MASTER_UPDATE',null,null,null,$m,$next);}),'Course code already exists in master.');json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-curriculums/:id/courses');if($p!==null&&$method==='GET'){ $cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$cur['Department']))fm_deny();json_response(['success'=>true,'data'=>db_rows("SELECT c.*,COUNT(DISTINCT CASE WHEN e.Status='Assigned' THEN e.EmployeeID END) AssignedCount FROM fourm_courses c LEFT JOIN fourm_courseemployees e ON e.CourseID=c.id WHERE c.CurriculumID=? AND c.IsActive=1 GROUP BY c.id ORDER BY c.SortOrder,c.CourseCode",[$p['id']])]);}
    if($p!==null&&$method==='POST'){require_admin();$cur=fm_cur($p['id']);if(!$cur||!(int)$cur['IsActive'])json_response(['success'=>false,'message'=>'Active curriculum not found.'],404);$ids=$b['CourseMasterIDs']??[];if(!is_array($ids))$ids=[];if(!empty($b['CourseMasterID']))$ids[]=$b['CourseMasterID'];$ids=array_values(array_unique(array_filter(array_map(fn($v)=>fm_text($v,36),$ids))));if(!$ids){$b['CourseCode']=fm_required($b['CourseCode']??'',50,'Course code is required.');$b['CourseTitle']=fm_required($b['CourseTitle']??'',255,'Course title is required.');}$out=fm_write(fn()=>fm_transaction(fn()=>fm_save_courses($u,$b,$p['id'],$ids)),'Course code already exists in this curriculum.');json_response(['success'=>true,'data'=>$out],201);}
    $p=route_params($path,'/fourm/training-courses/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$co=fm_course($p['id']);if(!$co)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){fm_transaction(function()use($u,$p,$co){db_execute('UPDATE fourm_courses SET IsActive=0 WHERE id=?',[$p['id']]);fm_log($u,'COURSE_DISABLE',$co['CurriculumID'],$p['id'],null,$co,['IsActive'=>0]);});json_response(['success'=>true]);}$next=['CourseCode'=>fm_required($b['CourseCode']??$co['CourseCode'],50,'Course code required.'),'CourseTitle'=>fm_required($b['CourseTitle']??$co['CourseTitle'],255,'Course title required.'),'SortOrder'=>max(1,(int)($b['SortOrder']??$co['SortOrder'])),'IsActive'=>isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$co['IsActive']];if(db_row('SELECT id FROM fourm_courses WHERE id<>? AND CurriculumID=? AND LOWER(TRIM(CourseCode))=LOWER(TRIM(?)) LIMIT 1',[$p['id'],$co['CurriculumID'],$next['CourseCode']]))fm_duplicate_response('Course code already exists in this curriculum.');fm_write(fn()=>fm_transaction(function()use($u,$p,$co,$next){db_execute('UPDATE fourm_courses SET CourseCode=?,CourseTitle=?,SortOrder=?,IsActive=? WHERE id=?',[$next['CourseCode'],$next['CourseTitle'],$next['SortOrder'],$next['IsActive'],$p['id']]);fm_log($u,'COURSE_UPDATE',$co['CurriculumID'],$p['id'],null,$co,$next);}),'Course code already exists in this curriculum.');json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-employee-scopes'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT a.id AssignmentID,a.*,NULL CourseID,NULL CourseCode,NULL CourseTitle,c.id CurriculumID,c.`Year`,c.Department CurriculumDepartment,c.CurriculumCode,c.CurriculumTitle FROM fourm_curriculumemployees a JOIN fourm_curriculums c ON c.id=a.CurriculumID WHERE a.Status='Assigned' AND c.IsActive=1 AND c.`Year`=?";$pa=[$y];if(!fm_admin($u)){$sql.=' AND c.Department=?';$pa[]=fm_text($u['department']??'',100);}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY c.Department,a.EmployeeName',$pa)]);}
    $p=route_params($path,'/fourm/training-curriculums/:id/assignments');if($p!==null&&$method==='GET'){ $cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$cur['Department']))fm_deny();$sql='SELECT * FROM fourm_curriculumemployees WHERE CurriculumID=?';$pa=[$p['id']];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY EmployeeName',$pa)]);}
    if($p!==null&&$method==='POST'){ $cur=fm_cur($p['id']);if(!$cur||!(int)$cur['IsActive'])json_response(['success'=>false,'message'=>'Active curriculum not found.'],404);if(!fm_training_manage_ok($u,$cur['Department']))fm_deny();if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CurriculumID=? AND IsActive=1',[$p['id']])['n']??0)<1)json_response(['success'=>false,'message'=>'Add at least one course before assigning employees.'],400);$ids=$b['EmployeeIDs']??[$b['EmployeeID']??null];if(!is_array($ids)||!array_filter($ids,fn($v)=>fm_text($v,50)!==''))json_response(['success'=>false,'message'=>'Select at least one employee.'],400);$out=fm_transaction(fn()=>fm_assign($u,'curriculum',$p['id'],$ids,fm_text($b['Notes']??'',1000)?:null,['Year'=>$cur['Year'],'Department'=>$cur['Department'],'CurriculumID'=>$cur['id']]));if(!$out['created']&&!$out['reassigned']&&$out['blocked'])json_response(['success'=>false,'message'=>'Employee is already active in another 4M curriculum.','data'=>$out],409);json_response(['success'=>true,'data'=>$out],201);}
    $p=route_params($path,'/fourm/training-curriculum-assignments/:id');if($p!==null&&$method==='DELETE'){ $a=fm_cur_ass($p['id']);if(!$a)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment']))fm_deny();if(($a['Status']??'')!=='Assigned')json_response(['success'=>false,'message'=>'Only assigned employees can be removed.'],400);fm_transaction(function()use($u,$p,$a){db_execute("UPDATE fourm_curriculumemployees SET Status='Removed',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);fm_log($u,'CURRICULUM_ASSIGNMENT_REMOVE',$a['CurriculumID'],null,$a['EmployeeID'],$a,['Status'=>'Removed']);});json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-curriculum-assignments/:id/transfer');if($p!==null&&$method==='POST'){ $a=fm_cur_ass($p['id']);$targetId=fm_text($b['TargetCurriculumID']??'',36);$target=fm_cur($targetId);if(!$a||!$target)json_response(['success'=>false,'message'=>'Active destination curriculum not found.'],404);if(($a['Status']??'')!=='Assigned')json_response(['success'=>false,'message'=>'Only assigned employees can be transferred.'],400);if($targetId===(string)$a['CurriculumID'])json_response(['success'=>false,'message'=>'Select a different destination curriculum.'],400);if(!(int)$target['IsActive'])json_response(['success'=>false,'message'=>'Active destination curriculum not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment'])||!fm_training_manage_ok($u,$target['Department']))fm_deny();if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CurriculumID=? AND IsActive=1',[$target['id']])['n']??0)<1)json_response(['success'=>false,'message'=>'Destination curriculum must have at least one active course.'],400);$out=fm_transaction(function()use($u,$b,$p,$a,$target){db_execute("UPDATE fourm_curriculumemployees SET Status='Transferred',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);$result=fm_assign($u,'curriculum',$target['id'],[$a['EmployeeID']],fm_text($b['Notes']??'',1000)?:null,['Year'=>$target['Year'],'Department'=>$target['Department'],'CurriculumID'=>$target['id']]);fm_log($u,'CURRICULUM_ASSIGNMENT_TRANSFER',$a['CurriculumID'],null,$a['EmployeeID'],$a,['TargetCurriculumID'=>$target['id'],'Status'=>'Assigned']);return $result;});json_response(['success'=>true,'data'=>$out]);}
    $p=route_params($path,'/fourm/training-courses/:id/assignments');if($p!==null&&$method==='GET'){ $co=fm_course($p['id']);if(!$co)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$co['Department']))fm_deny();$sql='SELECT * FROM fourm_courseemployees WHERE CourseID=?';$pa=[$p['id']];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY EmployeeName',$pa)]);}
    if($p!==null&&$method==='POST'){ $co=fm_course($p['id']);if(!$co||!(int)$co['IsActive'])json_response(['success'=>false,'message'=>'Active course not found.'],404);if(!fm_training_manage_ok($u,$co['Department']))fm_deny();$ids=$b['EmployeeIDs']??[$b['EmployeeID']??null];if(!is_array($ids)||!array_filter($ids,fn($v)=>fm_text($v,50)!==''))json_response(['success'=>false,'message'=>'Select at least one employee.'],400);$out=fm_transaction(fn()=>fm_assign($u,'course',$p['id'],$ids,fm_text($b['Notes']??'',1000)?:null,['Year'=>$co['Year'],'Department'=>$co['Department'],'CurriculumID'=>$co['CurriculumID']]));json_response(['success'=>true,'data'=>$out],201);}
    $p=route_params($path,'/fourm/training-assignments/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){ $a=fm_course_ass($p['id']);if(!$a)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment']))fm_deny();$st=$method==='DELETE'?'Removed':fm_text($b['Status']??$a['Status'],20);if(!in_array($st,['Assigned','Removed','Transferred'],true))json_response(['success'=>false,'message'=>'Invalid assignment status.'],400);if($method==='DELETE'&&($a['Status']??'')!=='Assigned')json_response(['success'=>false,'message'=>'Only assigned employees can be removed.'],400);$notes=array_key_exists('Notes',$b)?(fm_text($b['Notes'],1000)?:null):$a['Notes'];fm_transaction(function()use($u,$p,$a,$st,$notes){db_execute("UPDATE fourm_courseemployees SET Status=?,Notes=?,RemovedAt=IF(?='Removed',NOW(),RemovedAt),RemovedByID=IF(?='Removed',?,RemovedByID),RemovedBy=IF(?='Removed',?,RemovedBy) WHERE id=?",[$st,$notes,$st,$st,fm_uid($u),$st,fm_actor($u),$p['id']]);fm_log($u,$st==='Removed'?'ASSIGNMENT_REMOVE':'ASSIGNMENT_UPDATE',$a['CurriculumID'],$a['CourseID'],$a['EmployeeID'],$a,['Status'=>$st,'Notes'=>$notes]);});json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-assignments/:id/transfer');if($p!==null&&$method==='POST'){ $a=fm_course_ass($p['id']);$targetId=fm_text($b['TargetCourseID']??$b['NewCourseID']??'',36);$target=fm_course($targetId);if(!$a||!$target||!(int)$target['IsActive'])json_response(['success'=>false,'message'=>'Active destination course not found.'],404);if(($a['Status']??'')!=='Assigned')json_response(['success'=>false,'message'=>'Only assigned employees can be transferred.'],400);if($targetId===(string)$a['CourseID'])json_response(['success'=>false,'message'=>'Select a different destination course.'],400);if(!fm_training_manage_ok($u,$a['CurriculumDepartment'])||!fm_training_manage_ok($u,$target['Department']))fm_deny();$out=fm_transaction(function()use($u,$b,$p,$a,$target){db_execute("UPDATE fourm_courseemployees SET Status='Transferred',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);$result=fm_assign($u,'course',$target['id'],[$a['EmployeeID']],fm_text($b['Notes']??'',1000)?:null,['Year'=>$target['Year'],'Department'=>$target['Department'],'CurriculumID'=>$target['CurriculumID']]);fm_log($u,'ASSIGNMENT_TRANSFER',$a['CurriculumID'],$a['CourseID'],$a['EmployeeID'],$a,['TargetCurriculumID'=>$target['CurriculumID'],'TargetCourseID'=>$target['id'],'Status'=>'Assigned']);return $result;});json_response(['success'=>true,'data'=>$out]);}
    if($method==='GET'&&$path==='/fourm/training-logs'){ $sql='SELECT l.*,c.Department,c.`Year`,c.CurriculumCode,c.CurriculumTitle,co.CourseCode,co.CourseTitle FROM fourm_curriculumlogs l LEFT JOIN fourm_curriculums c ON c.id=l.CurriculumID LEFT JOIN fourm_courses co ON co.id=l.CourseID WHERE 1=1';$pa=[];foreach(['curriculumId'=>'l.CurriculumID','courseId'=>'l.CourseID','employeeId'=>'l.EmployeeID','action'=>'l.Action'] as $q=>$col)if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $col=?";$pa[]=fm_text($_GET[$q],100);}if(!empty($_GET['year'])){$sql.=' AND (c.`Year`=? OR l.CurriculumID IS NULL)';$pa[]=(int)$_GET['year'];}$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=fm_admin($u)?' AND (c.Department=? OR l.CurriculumID IS NULL)':' AND c.Department=?';$pa[]=$d;}$limit=min(300,max(1,(int)($_GET['limit']??100)));json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY l.PerformedAt DESC,l.id DESC LIMIT '.$limit,$pa)]);}
    $p=route_params($path,'/fourm/training-logs/:id');if($p!==null&&$method==='DELETE'){require_admin();$id=(int)$p['id'];if($id<=0)json_response(['success'=>false,'message'=>'Invalid training log id.'],400);$row=db_row('SELECT * FROM fourm_curriculumlogs WHERE id=?',[$id]);if(!$row)json_response(['success'=>false,'message'=>'Training log not found.'],404);db_execute('DELETE FROM fourm_curriculumlogs WHERE id=?',[$id]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/responsible-employees'){require_admin();$q=fm_text($_GET['q']??'',100);if(mb_strlen($q,'UTF-8')<2)json_response(['success'=>false,'message'=>'Search must contain 2 to 100 characters.'],400);$limit=max(1,min(30,(int)($_GET['limit']??20)));$like='%'.$q.'%';$rows=db_rows("SELECT EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Position LIKE ? ORDER BY (EmployeeID=?) DESC,EmployeeName,EmployeeID LIMIT $limit",[$like,$like,$like,$like,$q]);foreach($rows as &$row){$row['CompanyEmail']=fm_valid_email($row['CompanyEmail']??null);$row['EmailReady']=$row['CompanyEmail']!==null;}unset($row);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='GET'&&$path==='/fourm/notices'){ $sql='SELECT * FROM fourm_changenotices WHERE 1=1';$pa=[];if(($_GET['overdue']??'')==='1')$sql.=" AND Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30";elseif(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}foreach(['type'=>'ChangeType','dept'=>'Department'] as $q=>$c)if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}if(($_GET['mine']??'')==='1'){$sql.=' AND (CreatedByID=? OR ResponsibleEmployeeID=?)';$pa[]=fm_uid($u);$pa[]=fm_uid($u);}if(($_GET['trainingRequired']??'')==='1')$sql.=' AND TrainingRequired=1';if(!empty($_GET['year'])){$sql.=' AND YEAR(RequestDate)=?';$pa[]=(int)$_GET['year'];}if(!empty($_GET['q'])){$like='%'.fm_text($_GET['q'],120).'%';$sql.=' AND (Title LIKE ? OR NoticeNo LIKE ? OR ResponsiblePerson LIKE ?)';array_push($pa,$like,$like,$like);}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY RequestDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='GET'&&$path==='/fourm/notice-next-no')json_response(['success'=>true,'data'=>['NoticeNo'=>fm_notice_no($_GET['date']??null)]]);
    if($method==='GET'&&$path==='/fourm/email-outbox'){require_admin();json_response(['success'=>true,'data'=>db_rows('SELECT id,NoticeID,TaskID,EventType,Recipients,Subject,Status,SentAt,Error,CreatedAt FROM fourm_emailoutbox ORDER BY CreatedAt DESC,id DESC LIMIT 200'),'smtpConfigured'=>mailer_smtp_configured()]);}
    $p=route_params($path,'/fourm/email-outbox/:id/retry');if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('fourm_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Cannot retry 4M email.','error'=>$e->getMessage()],500);}}
    $p=route_params($path,'/fourm/notices/:id/tasks');if($p!==null&&$method==='GET'){json_response(['success'=>true,'data'=>db_rows("SELECT * FROM fourm_actiontasks WHERE NoticeID=? ORDER BY Status='Done',COALESCE(DueDate,'9999-12-31'),CreatedAt",[$p['id']])]);}
    if($p!==null&&$method==='POST'){ $n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_admin($u)&&fm_uid($u)!==(string)$n['CreatedByID'])fm_deny();$t=fm_task_payload($b);$id=fm_uuid();db_execute('INSERT INTO fourm_actiontasks (id,NoticeID,TaskTitle,OwnerName,DueDate,Status,Notes,CompletedAt,CompletedBy,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$p['id'],$t['TaskTitle'],$t['OwnerName'],$t['DueDate'],$t['Status'],$t['Notes'],$t['Status']==='Done'?date('Y-m-d H:i:s'):null,$t['Status']==='Done'?fm_actor($u):null,fm_uid($u),fm_actor($u)]);$mail=fm_task_mail($n,array_merge($t,['id'=>$id]),'Created');fm_queue($p['id'],$id,'ActionTaskCreated',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null)]));json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/notice-tasks/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){ $t=db_row('SELECT t.*,n.NoticeNo,n.Title,n.Department,n.ChangeType,n.Status NoticeStatus,n.CreatedByID NoticeCreatedByID FROM fourm_actiontasks t JOIN fourm_changenotices n ON n.id=t.NoticeID WHERE t.id=?',[$p['id']]);if(!$t)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_admin($u)&&fm_uid($u)!==(string)$t['NoticeCreatedByID'])fm_deny();if($method==='DELETE'){db_execute('DELETE FROM fourm_actiontasks WHERE id=?',[$p['id']]);json_response(['success'=>true]);}$v=fm_task_payload($b,$t);db_execute('UPDATE fourm_actiontasks SET TaskTitle=?,OwnerName=?,DueDate=?,Status=?,Notes=?,CompletedAt=?,CompletedBy=? WHERE id=?',[$v['TaskTitle'],$v['OwnerName'],$v['DueDate'],$v['Status'],$v['Notes'],$v['Status']==='Done'?($t['CompletedAt']?:date('Y-m-d H:i:s')):null,$v['Status']==='Done'?($t['CompletedBy']?:fm_actor($u)):null,$p['id']]);if($v['Status']==='Done'&&($t['Status']??'')!=='Done'){$mail=fm_task_mail($t,array_merge($t,$v),'Done');fm_queue($t['NoticeID']??null,$p['id'],'ActionTaskDone',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($t['NoticeCreatedByID']??null)]));}json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/notices/:id/close');if($p!==null&&$method==='POST'){ $file=fm_upload('closingDoc');$n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n){fm_cleanup($file);json_response(['success'=>false,'message'=>'Not found.'],404);}if(!fm_admin($u)&&fm_uid($u)!==(string)$n['CreatedByID']){fm_cleanup($file);fm_deny();}if(fm_text($b['ClosingComment']??'',1000)===''){fm_cleanup($file);json_response(['success'=>false,'message'=>'Closing comment is required.'],400);}try{db_execute("UPDATE fourm_changenotices SET Status='Closed',ClosingComment=?,ClosingDocUrl=COALESCE(?,ClosingDocUrl),ClosedDate=?,ClosedBy=? WHERE id=?",[$b['ClosingComment'], $file['url']??null,$b['ClosedDate']??date('Y-m-d'),fm_actor($u),$p['id']]);if($file)delete_uploaded_file($n['ClosingDocUrl']??null);$mail=fm_notice_mail($n,'NoticeClosed','Closed');fm_queue($p['id'],null,'NoticeClosed',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null),fm_company_email($n['ResponsibleEmployeeID']??null)]));json_response(['success'=>true]);}catch(Throwable $e){fm_cleanup($file);throw $e;}}
    $p=route_params($path,'/fourm/notices/:id');if($p!==null&&$method==='GET'){ $n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);json_response(['success'=>true,'data'=>$n]);}
    if($p!==null&&$method==='DELETE'){require_admin();$n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);db_execute('DELETE FROM fourm_actiontasks WHERE NoticeID=?',[$p['id']]);db_execute('DELETE FROM fourm_changenotices WHERE id=?',[$p['id']]);delete_uploaded_file($n['AttachmentUrl']??null);delete_uploaded_file($n['ClosingDocUrl']??null);json_response(['success'=>true]);}
    if($p!==null&&$method==='PUT'){
        require_admin();$file=null;
        $n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);
        if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);
        if(($b['Status']??'')==='Closed')json_response(['success'=>false,'message'=>'Use the close workflow to close a notice.'],400);
        $responsible=null;
        if(fm_text($b['ResponsibleEmployeeID']??'',50)!=='')$responsible=fm_responsible_employee($u,$b['ResponsibleEmployeeID']);
        $responsibleChanged=$responsible&&((string)$responsible['EmployeeID']!==(string)($n['ResponsibleEmployeeID']??''));
        try{
            $file=fm_upload('attachment');$newStatus=$b['Status']??$n['Status'];
            $responsibleName=$responsible['EmployeeName']??$n['ResponsiblePerson'];
            $responsibleId=$responsible['EmployeeID']??$n['ResponsibleEmployeeID'];
            db_execute('UPDATE fourm_changenotices SET RequestDate=?,Title=?,Description=?,ChangeType=?,ResponsiblePerson=?,ResponsibleEmployeeID=?,Department=?,AttachmentUrl=?,Status=?,SafetyImpact=?,QualityImpact=?,ProductionImpact=?,EnvironmentImpact=?,TrainingRequired=?,ImpactNote=? WHERE id=?',[$b['RequestDate']??$n['RequestDate'],$b['Title']??$n['Title'],$b['Description']??$n['Description'],$b['ChangeType']??$n['ChangeType'],$responsibleName,$responsibleId,$b['Department']??$n['Department'],$file['url']??$n['AttachmentUrl'],$newStatus,$b['SafetyImpact']??$n['SafetyImpact'],$b['QualityImpact']??$n['QualityImpact'],$b['ProductionImpact']??$n['ProductionImpact'],$b['EnvironmentImpact']??$n['EnvironmentImpact'],isset($b['TrainingRequired'])?fm_bool($b['TrainingRequired']):(int)$n['TrainingRequired'],$b['ImpactNote']??$n['ImpactNote'],$p['id']]);
            if($file)delete_uploaded_file($n['AttachmentUrl']??null);
            $notice=array_merge($n,['Title'=>$b['Title']??$n['Title'],'Department'=>$b['Department']??$n['Department'],'ResponsiblePerson'=>$responsibleName,'ResponsibleEmployeeID'=>$responsibleId,'Status'=>$newStatus]);
            $recipients=fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null),$responsible['CompanyEmail']??fm_company_email($responsibleId)]);
            if($newStatus==='Pending'&&($n['Status']??'')!=='Pending'){$mail=fm_notice_mail($notice,'NoticePending','Pending');fm_queue($p['id'],null,'NoticePending',$mail['subject'],$mail['body'],$mail['html'],$recipients);}
            if($responsibleChanged){$notice['ResponsibleDepartment']=$responsible['Department']??null;$mail=fm_notice_reassigned_mail($notice);fm_queue($p['id'],null,'NoticeReassigned',$mail['subject'],$mail['body'],$mail['html'],$recipients);}
            json_response(['success'=>true,'data'=>['ResponsibleEmployeeID'=>$responsibleId,'ResponsiblePerson'=>$responsibleName,'ResponsibleEmailReady'=>$responsible?$responsible['EmailReady']:null,'DepartmentMismatch'=>$responsible?fm_notice_department_mismatch($notice['Department'],$responsible['Department']??null):null]]);
        }catch(Throwable $e){fm_cleanup($file);throw $e;}
    }
    if($method==='POST'&&$path==='/fourm/notices'){
        $file=null;
        try{
            if(empty($b['RequestDate'])||empty($b['Title'])||!in_array($b['ChangeType']??'', ['Man','Machine','Material','Method'],true))json_response(['success'=>false,'message'=>'Invalid notice.'],400);
            $responsible=fm_responsible_employee($u,$b['ResponsibleEmployeeID']??null);$file=fm_upload('attachment');$id=fm_uuid();$no=fm_notice_no($b['RequestDate']);
            db_execute('INSERT INTO fourm_changenotices (id,NoticeNo,RequestDate,Title,Description,ChangeType,ResponsiblePerson,ResponsibleEmployeeID,Department,AttachmentUrl,SafetyImpact,QualityImpact,ProductionImpact,EnvironmentImpact,TrainingRequired,ImpactNote,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$no,$b['RequestDate'],$b['Title'],$b['Description']??null,$b['ChangeType'],$responsible['EmployeeName'],$responsible['EmployeeID'],$b['Department']??null,$file['url']??null,$b['SafetyImpact']??'N/A',$b['QualityImpact']??'N/A',$b['ProductionImpact']??'N/A',$b['EnvironmentImpact']??'N/A',fm_bool($b['TrainingRequired']??0),$b['ImpactNote']??null,fm_uid($u),fm_actor($u)]);
            $notice=['NoticeNo'=>$no,'Title'=>$b['Title'],'ChangeType'=>$b['ChangeType'],'Department'=>$b['Department']??null,'RequestDate'=>$b['RequestDate'],'CreatedBy'=>fm_actor($u),'ResponsiblePerson'=>$responsible['EmployeeName'],'ResponsibleEmployeeID'=>$responsible['EmployeeID'],'Status'=>'Open'];
            $mail=fm_notice_mail($notice,'NoticeCreated','Open');
            fm_queue($id,null,'NoticeCreated',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),$responsible['CompanyEmail']]));
            json_response(['success'=>true,'data'=>['NoticeNo'=>$no,'ResponsibleEmployeeID'=>$responsible['EmployeeID'],'ResponsiblePerson'=>$responsible['EmployeeName'],'ResponsibleDepartment'=>$responsible['Department']??null,'ResponsibleEmailReady'=>$responsible['EmailReady'],'DepartmentMismatch'=>fm_notice_department_mismatch($b['Department']??null,$responsible['Department']??null)]],201);
        }catch(Throwable $e){fm_cleanup($file);throw $e;}
    }
    return false;
}
