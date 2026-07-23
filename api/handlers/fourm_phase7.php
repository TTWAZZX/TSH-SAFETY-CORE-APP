<?php
declare(strict_types=1);

function fm_uuid(): string { return function_exists('p5_uuid') ? p5_uuid() : bin2hex(random_bytes(16)); }
function fm_actor(array $u): string { return trim((string)($u['name'] ?? $u['EmployeeName'] ?? $u['id'] ?? 'User')) ?: 'User'; }
function fm_uid(array $u): string { return trim((string)($u['id'] ?? $u['EmployeeID'] ?? '')); }
function fm_admin(array $u): bool { return strcasecmp((string)($u['role'] ?? $u['Role'] ?? ''), 'Admin') === 0; }
function fm_text($v, int $max = 255): string { return mb_substr(trim((string)($v ?? '')), 0, $max); }
function fm_bool($v): int { return in_array(strtolower(trim((string)$v)), ['1','true','yes','on','required'], true) ? 1 : 0; }
function fm_put_multipart(): array {
    static $parsed=null; if($parsed!==null)return $parsed;
    $parsed=['fields'=>[],'files'=>[]];
    if(($_SERVER['REQUEST_METHOD']??'')!=='PUT')return $parsed;
    $type=(string)($_SERVER['CONTENT_TYPE']??'');
    if(!preg_match('/boundary=(?:"([^"]+)"|([^;]+))/',$type,$m))return $parsed;
    $boundary=$m[1]?:trim($m[2]); $raw=(string)file_get_contents('php://input');
    foreach(explode('--'.$boundary,$raw) as $part){
        $part=ltrim($part,"\r\n"); if($part===''||$part==="--\r\n"||$part==='--')continue;
        $pair=explode("\r\n\r\n",$part,2); if(count($pair)!==2)continue;
        [$head,$value]=$pair; $value=preg_replace("/\r\n--$/",'',$value);
        if(!preg_match('/name="([^"]+)"/',$head,$nm))continue; $name=$nm[1];
        if(preg_match('/filename="([^"]*)"/',$head,$fn)){
            $tmp=tempnam(sys_get_temp_dir(),'fm7-'); file_put_contents($tmp,$value);
            $mime='application/octet-stream'; if(preg_match('/Content-Type:\\s*([^\\r\\n]+)/i',$head,$ct))$mime=trim($ct[1]);
            $parsed['files'][$name]=['name'=>$fn[1],'tmp'=>$tmp,'type'=>$mime,'size'=>filesize($tmp)?:0];
        } else $parsed['fields'][$name]=rtrim($value,"\r\n");
    }
    return $parsed;
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
function fm_try(string $sql): void { try { db()->exec($sql); } catch(Throwable $e) {} }
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
function fm_company_email(?string $employeeId): ?string {
    $id=fm_text($employeeId,50); if(!$id)return null;
    $row=db_row("SELECT CompanyEmail FROM employees WHERE EmployeeID=? AND CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>'' LIMIT 1",[$id]);
    return $row['CompanyEmail']??null;
}
function fm_recipients(array $values): string {
    $out=[];
    foreach($values as $value){foreach(explode(',',(string)$value) as $email){$email=trim($email);if($email&&!in_array($email,$out,true))$out[]=$email;}}
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
        ['label'=>'Status','value'=>$status??($notice['Status']??'Open'),'highlight'=>true],
    ],['เปิดระบบเพื่อตรวจสอบรายละเอียด 4M Change Notice และติดตาม action plan']);
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
    } catch(Throwable $e) {}
}
function fm_notice_no($date): string {
    $year=(int)substr((string)($date?:date('Y-m-d')),0,4); if($year<2000)$year=(int)date('Y');
    $prefix='4M-'.$year.'-'; $n=(int)(db_row('SELECT MAX(CAST(SUBSTRING(NoticeNo,?) AS UNSIGNED)) n FROM fourm_changenotices WHERE NoticeNo LIKE ?',[strlen($prefix)+1,$prefix.'%'])['n']??0);
    return $prefix.str_pad((string)($n+1),3,'0',STR_PAD_LEFT);
}
function fm_ensure(): void {
    static $done=false; if($done)return;
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_manrecords (id VARCHAR(36) PRIMARY KEY,Department VARCHAR(100) NOT NULL,TotalAttendance INT DEFAULT 0,Pass INT DEFAULT 0,Fail INT DEFAULT 0,Status VARCHAR(20) DEFAULT 'Pending',ExamDate DATE,Notes TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_dept(Department),KEY idx_date(ExamDate)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_changenotices (id VARCHAR(36) PRIMARY KEY,NoticeNo VARCHAR(50) NOT NULL,RequestDate DATE NOT NULL,Title VARCHAR(255) NOT NULL,Description TEXT,ChangeType VARCHAR(20) NOT NULL,ResponsiblePerson VARCHAR(100),Department VARCHAR(100),AttachmentUrl TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Open',ClosingComment TEXT,ClosingDocUrl TEXT,ClosedDate DATE,ClosedBy VARCHAR(100),SafetyImpact VARCHAR(20) DEFAULT 'N/A',QualityImpact VARCHAR(20) DEFAULT 'N/A',ProductionImpact VARCHAR(20) DEFAULT 'N/A',EnvironmentImpact VARCHAR(20) DEFAULT 'N/A',TrainingRequired TINYINT(1) DEFAULT 0,ImpactNote TEXT,CreatedByID VARCHAR(50) NOT NULL,CreatedBy VARCHAR(100) NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_noticeno(NoticeNo),KEY idx_status(Status),KEY idx_date(RequestDate)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_actiontasks (id VARCHAR(36) PRIMARY KEY,NoticeID VARCHAR(36) NOT NULL,TaskTitle VARCHAR(255) NOT NULL,OwnerName VARCHAR(100),DueDate DATE,Status VARCHAR(20) NOT NULL DEFAULT 'Pending',Notes TEXT,CompletedAt DATETIME,CompletedBy VARCHAR(100),CreatedByID VARCHAR(50) NOT NULL,CreatedBy VARCHAR(100) NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_notice(NoticeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,NoticeID VARCHAR(36),TaskID VARCHAR(36),EventType VARCHAR(50) NOT NULL,Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body TEXT NOT NULL,HtmlBody MEDIUMTEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Queued',SentAt DATETIME,Error TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculums (id VARCHAR(36) PRIMARY KEY,`Year` INT NOT NULL,Department VARCHAR(100) NOT NULL,CurriculumCode VARCHAR(50) NOT NULL,CurriculumTitle VARCHAR(255) NOT NULL,Notes TEXT,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cur(`Year`,Department,CurriculumCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_coursemaster (id VARCHAR(36) PRIMARY KEY,CourseCode VARCHAR(50) NOT NULL,CourseTitle VARCHAR(255) NOT NULL,Category VARCHAR(100),Notes TEXT,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_code(CourseCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_courses (id VARCHAR(36) PRIMARY KEY,CurriculumID VARCHAR(36) NOT NULL,CourseMasterID VARCHAR(36),CourseCode VARCHAR(50) NOT NULL,CourseTitle VARCHAR(255) NOT NULL,SortOrder INT NOT NULL DEFAULT 99,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedByID VARCHAR(50),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_course(CurriculumID,CourseCode),KEY idx_cur(CurriculumID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_courseemployees (id VARCHAR(36) PRIMARY KEY,CourseID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100) NOT NULL,Department VARCHAR(100),Position VARCHAR(100),Status VARCHAR(20) NOT NULL DEFAULT 'Assigned',AssignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,AssignedByID VARCHAR(50),AssignedBy VARCHAR(100),RemovedAt DATETIME,RemovedByID VARCHAR(50),RemovedBy VARCHAR(100),Notes TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_course_emp(CourseID,EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculumemployees (id VARCHAR(36) PRIMARY KEY,CurriculumID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100) NOT NULL,Department VARCHAR(100),Position VARCHAR(100),Status VARCHAR(20) NOT NULL DEFAULT 'Assigned',AssignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,AssignedByID VARCHAR(50),AssignedBy VARCHAR(100),RemovedAt DATETIME,RemovedByID VARCHAR(50),RemovedBy VARCHAR(100),Notes TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cur_emp(CurriculumID,EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS fourm_curriculumlogs (id INT AUTO_INCREMENT PRIMARY KEY,Action VARCHAR(50) NOT NULL,CurriculumID VARCHAR(36),CourseID VARCHAR(36),EmployeeID VARCHAR(50),OldValue LONGTEXT,NewValue LONGTEXT,PerformedByID VARCHAR(50),PerformedBy VARCHAR(100),PerformedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_time(PerformedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach(["SafetyImpact VARCHAR(20) DEFAULT 'N/A'","QualityImpact VARCHAR(20) DEFAULT 'N/A'","ProductionImpact VARCHAR(20) DEFAULT 'N/A'","EnvironmentImpact VARCHAR(20) DEFAULT 'N/A'","TrainingRequired TINYINT(1) DEFAULT 0","ImpactNote TEXT"] as $col) fm_try("ALTER TABLE fourm_changenotices ADD COLUMN $col");
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
        fm_log($u,strtoupper($kind).'_ASSIGNMENT_CREATE',$kind==='curriculum'?$parent:null,$kind==='course'?$parent:null,$eid,$old,$e);
    } return $out;
}
function handle_fourm_routes(string $method,string $path): bool {
    if(strpos($path,'/fourm')!==0)return false; $u=require_user(); fm_ensure(); $b=fm_body();
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
    if($method==='POST'&&$path==='/fourm/man-records'){require_admin();[$t,$p,$f]=fm_counts($b);if(empty($b['Department']))json_response(['success'=>false,'message'=>'Department required.'],400);db_execute('INSERT INTO fourm_manrecords (id,Department,TotalAttendance,Pass,Fail,Status,ExamDate,Notes,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?)',[fm_uuid(),$b['Department'],$t,$p,$f,$b['Status']??'Pending',$b['ExamDate']??null,$b['Notes']??null,fm_actor($u)]);json_response(['success'=>true],201);}
    $p=route_params($path,'/fourm/man-records/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$old=db_row('SELECT * FROM fourm_manrecords WHERE id=?',[$p['id']]);if(!$old)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){db_execute('DELETE FROM fourm_manrecords WHERE id=?',[$p['id']]);json_response(['success'=>true]);}[$t,$pa,$f]=fm_counts($b,$old);db_execute('UPDATE fourm_manrecords SET Department=?,TotalAttendance=?,Pass=?,Fail=?,Status=?,ExamDate=?,Notes=? WHERE id=?',[$b['Department']??$old['Department'],$t,$pa,$f,$b['Status']??$old['Status'],$b['ExamDate']??$old['ExamDate'],$b['Notes']??$old['Notes'],$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-department-scopes'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT cur.Department,COUNT(DISTINCT cur.id) CurriculumCount,COUNT(DISTINCT CASE WHEN co.IsActive=1 THEN co.id END) CourseCount,COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END) ScopeEmployees,COUNT(DISTINCT CASE WHEN ce.Status='Transferred' THEN ce.id END) TransferredCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.IsActive=1 AND cur.`Year`=?";$pa=[$y];$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=' AND cur.Department=?';$pa[]=$d;}if(!empty($_GET['q'])){$sql.=' AND cur.Department LIKE ?';$pa[]='%'.fm_text($_GET['q'],100).'%';}json_response(['success'=>true,'data'=>db_rows($sql.' GROUP BY cur.Department ORDER BY cur.Department',$pa)]);}
    if($method==='GET'&&$path==='/fourm/training-curriculums'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT cur.*,COUNT(DISTINCT co.id) CourseCount,COUNT(DISTINCT CASE WHEN ce.Status='Assigned' THEN ce.EmployeeID END) AssignedCount FROM fourm_curriculums cur LEFT JOIN fourm_courses co ON co.CurriculumID=cur.id AND co.IsActive=1 LEFT JOIN fourm_curriculumemployees ce ON ce.CurriculumID=cur.id WHERE cur.`Year`=?";$pa=[$y];if(($_GET['includeInactive']??'')!=='1')$sql.=' AND cur.IsActive=1';$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=' AND cur.Department=?';$pa[]=$d;}json_response(['success'=>true,'data'=>db_rows($sql.' GROUP BY cur.id ORDER BY cur.Department,cur.CurriculumCode',$pa)]);}
    if($method==='POST'&&$path==='/fourm/training-curriculums'){require_admin();$d=fm_text($b['Department']??'',100);if(!$d||empty($b['CurriculumCode'])||empty($b['CurriculumTitle']))json_response(['success'=>false,'message'=>'Invalid curriculum.'],400);$id=fm_uuid();db_execute('INSERT INTO fourm_curriculums (id,`Year`,Department,CurriculumCode,CurriculumTitle,Notes,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?)',[$id,(int)($b['Year']??date('Y')),$d,$b['CurriculumCode'],$b['CurriculumTitle'],$b['Notes']??null,fm_uid($u),fm_actor($u)]);fm_log($u,'CURRICULUM_CREATE',$id);json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/training-curriculums/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){db_execute('UPDATE fourm_curriculums SET IsActive=0 WHERE id=?',[$p['id']]);db_execute('UPDATE fourm_courses SET IsActive=0 WHERE CurriculumID=?',[$p['id']]);json_response(['success'=>true]);}db_execute('UPDATE fourm_curriculums SET `Year`=?,Department=?,CurriculumCode=?,CurriculumTitle=?,Notes=?,IsActive=? WHERE id=?',[(int)($b['Year']??$cur['Year']),$b['Department']??$cur['Department'],$b['CurriculumCode']??$cur['CurriculumCode'],$b['CurriculumTitle']??$cur['CurriculumTitle'],$b['Notes']??$cur['Notes'],isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$cur['IsActive'],$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-permissions')json_response(['success'=>true,'data'=>['permissionKey'=>'FOURM_TRAINING_MANAGE','canManageTraining'=>fm_admin($u)||(fm_text($u['department']??$u['Department']??'',100)!==''&&fm_has_permission($u,'FOURM_TRAINING_MANAGE')),'canManageAll'=>fm_admin($u),'canDeleteHistory'=>fm_admin($u),'department'=>fm_text($u['department']??$u['Department']??'',100)]]);
    if($method==='GET'&&$path==='/fourm/training-course-master'){ $sql='SELECT * FROM fourm_coursemaster WHERE 1=1';$pa=[];if(($_GET['includeInactive']??'')!=='1')$sql.=' AND IsActive=1';if(!empty($_GET['q'])){$like='%'.strtolower(fm_text($_GET['q'],120)).'%';$sql.=' AND (LOWER(CourseCode) LIKE ? OR LOWER(CourseTitle) LIKE ? OR LOWER(Category) LIKE ?)';$pa=[$like,$like,$like];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CourseCode',$pa)]);}
    if($method==='POST'&&$path==='/fourm/training-course-master'){require_admin();$id=fm_uuid();db_execute('INSERT INTO fourm_coursemaster (id,CourseCode,CourseTitle,Category,Notes,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$b['CourseCode']??'',$b['CourseTitle']??'',$b['Category']??null,$b['Notes']??null,fm_uid($u),fm_actor($u)]);fm_log($u,'COURSE_MASTER_CREATE');json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/training-course-master/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$m=db_row('SELECT * FROM fourm_coursemaster WHERE id=?',[$p['id']]);if(!$m)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){if(($_GET['hard']??'')==='1'){if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CourseMasterID=?',[$p['id']])['n']??0)>0)json_response(['success'=>false,'message'=>'Course is linked.'],409);db_execute('DELETE FROM fourm_coursemaster WHERE id=?',[$p['id']]);}else db_execute('UPDATE fourm_coursemaster SET IsActive=0 WHERE id=?',[$p['id']]);json_response(['success'=>true]);}db_execute('UPDATE fourm_coursemaster SET CourseCode=?,CourseTitle=?,Category=?,Notes=?,IsActive=? WHERE id=?',[$b['CourseCode']??$m['CourseCode'],$b['CourseTitle']??$m['CourseTitle'],$b['Category']??$m['Category'],$b['Notes']??$m['Notes'],isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$m['IsActive'],$p['id']]);db_execute('UPDATE fourm_courses SET CourseCode=?,CourseTitle=? WHERE CourseMasterID=?',[$b['CourseCode']??$m['CourseCode'],$b['CourseTitle']??$m['CourseTitle'],$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-curriculums/:id/courses');if($p!==null&&$method==='GET'){ $cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$cur['Department']))fm_deny();json_response(['success'=>true,'data'=>db_rows("SELECT c.*,COUNT(DISTINCT CASE WHEN e.Status='Assigned' THEN e.EmployeeID END) AssignedCount FROM fourm_courses c LEFT JOIN fourm_courseemployees e ON e.CourseID=c.id WHERE c.CurriculumID=? AND c.IsActive=1 GROUP BY c.id ORDER BY c.SortOrder,c.CourseCode",[$p['id']])]);}
    if($p!==null&&$method==='POST'){require_admin();$cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);$ids=$b['CourseMasterIDs']??[];if(!is_array($ids))$ids=[];if(!empty($b['CourseMasterID']))$ids[]=$b['CourseMasterID'];$made=[];foreach(array_unique($ids) as $mid){$m=db_row('SELECT * FROM fourm_coursemaster WHERE id=? AND IsActive=1',[$mid]);if(!$m)continue;$old=db_row('SELECT * FROM fourm_courses WHERE CurriculumID=? AND CourseCode=?',[$p['id'],$m['CourseCode']]);if($old){db_execute('UPDATE fourm_courses SET CourseMasterID=?,CourseTitle=?,IsActive=1 WHERE id=?',[$mid,$m['CourseTitle'],$old['id']]);$made[]=$old['id'];}else{$id=fm_uuid();db_execute('INSERT INTO fourm_courses (id,CurriculumID,CourseMasterID,CourseCode,CourseTitle,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$p['id'],$mid,$m['CourseCode'],$m['CourseTitle'],fm_uid($u),fm_actor($u)]);$made[]=$id;}}if(!$ids){$id=fm_uuid();db_execute('INSERT INTO fourm_courses (id,CurriculumID,CourseCode,CourseTitle,SortOrder,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$id,$p['id'],$b['CourseCode']??'',$b['CourseTitle']??'',(int)($b['SortOrder']??99),fm_uid($u),fm_actor($u)]);$made[]=$id;}json_response(['success'=>true,'data'=>['created'=>$made]],201);}
    $p=route_params($path,'/fourm/training-courses/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){require_admin();$co=fm_course($p['id']);if(!$co)json_response(['success'=>false,'message'=>'Not found.'],404);if($method==='DELETE'){db_execute('UPDATE fourm_courses SET IsActive=0 WHERE id=?',[$p['id']]);json_response(['success'=>true]);}db_execute('UPDATE fourm_courses SET CourseCode=?,CourseTitle=?,SortOrder=?,IsActive=? WHERE id=?',[$b['CourseCode']??$co['CourseCode'],$b['CourseTitle']??$co['CourseTitle'],(int)($b['SortOrder']??$co['SortOrder']),isset($b['IsActive'])?fm_bool($b['IsActive']):(int)$co['IsActive'],$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/training-employee-scopes'){ $y=(int)($_GET['year']??date('Y'));$sql="SELECT a.id AssignmentID,a.*,NULL CourseID,NULL CourseCode,NULL CourseTitle,c.id CurriculumID,c.`Year`,c.Department CurriculumDepartment,c.CurriculumCode,c.CurriculumTitle FROM fourm_curriculumemployees a JOIN fourm_curriculums c ON c.id=a.CurriculumID WHERE a.Status='Assigned' AND c.IsActive=1 AND c.`Year`=?";$pa=[$y];if(!fm_admin($u)){$sql.=' AND c.Department=?';$pa[]=fm_text($u['department']??'',100);}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY c.Department,a.EmployeeName',$pa)]);}
    $p=route_params($path,'/fourm/training-curriculums/:id/assignments');if($p!==null&&$method==='GET'){ $cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$cur['Department']))fm_deny();$sql='SELECT * FROM fourm_curriculumemployees WHERE CurriculumID=?';$pa=[$p['id']];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY EmployeeName',$pa)]);}
    if($p!==null&&$method==='POST'){ $cur=fm_cur($p['id']);if(!$cur)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$cur['Department']))fm_deny();if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CurriculumID=? AND IsActive=1',[$p['id']])['n']??0)<1)json_response(['success'=>false,'message'=>'Add at least one course before assigning employees.'],400);$ids=$b['EmployeeIDs']??[$b['EmployeeID']??null];json_response(['success'=>true,'data'=>fm_assign($u,'curriculum',$p['id'],is_array($ids)?$ids:[],$b['Notes']??null,['Year'=>$cur['Year'],'Department'=>$cur['Department'],'CurriculumID'=>$cur['id']])],201);}
    $p=route_params($path,'/fourm/training-curriculum-assignments/:id');if($p!==null&&$method==='DELETE'){ $a=fm_cur_ass($p['id']);if(!$a)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment']))fm_deny();db_execute("UPDATE fourm_curriculumemployees SET Status='Removed',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-curriculum-assignments/:id/transfer');if($p!==null&&$method==='POST'){ $a=fm_cur_ass($p['id']);$target=fm_cur((string)($b['TargetCurriculumID']??''));if(!$a||!$target)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment'])||!fm_training_manage_ok($u,$target['Department']))fm_deny();if((int)(db_row('SELECT COUNT(*) n FROM fourm_courses WHERE CurriculumID=? AND IsActive=1',[$target['id']])['n']??0)<1)json_response(['success'=>false,'message'=>'Destination curriculum must have at least one active course.'],400);db()->beginTransaction();try{db_execute("UPDATE fourm_curriculumemployees SET Status='Transferred',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);$out=fm_assign($u,'curriculum',$target['id'],[$a['EmployeeID']],$b['Notes']??null,['Year'=>$target['Year'],'Department'=>$target['Department'],'CurriculumID'=>$target['id']]);db()->commit();json_response(['success'=>true,'data'=>$out]);}catch(Throwable $e){db()->rollBack();throw $e;}}
    $p=route_params($path,'/fourm/training-courses/:id/assignments');if($p!==null&&$method==='GET'){ $co=fm_course($p['id']);if(!$co)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_dept_ok($u,$co['Department']))fm_deny();$sql='SELECT * FROM fourm_courseemployees WHERE CourseID=?';$pa=[$p['id']];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY EmployeeName',$pa)]);}
    if($p!==null&&$method==='POST'){ $co=fm_course($p['id']);if(!$co)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$co['Department']))fm_deny();$ids=$b['EmployeeIDs']??[$b['EmployeeID']??null];json_response(['success'=>true,'data'=>fm_assign($u,'course',$p['id'],is_array($ids)?$ids:[],$b['Notes']??null,['Year'=>$co['Year'],'Department'=>$co['Department'],'CurriculumID'=>$co['CurriculumID']])],201);}
    $p=route_params($path,'/fourm/training-assignments/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){ $a=fm_course_ass($p['id']);if(!$a)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment']))fm_deny();$st=$method==='DELETE'?'Removed':($b['Status']??$a['Status']);db_execute("UPDATE fourm_courseemployees SET Status=?,Notes=?,RemovedAt=IF(?='Removed',NOW(),RemovedAt),RemovedByID=IF(?='Removed',?,RemovedByID),RemovedBy=IF(?='Removed',?,RemovedBy) WHERE id=?",[$st,$b['Notes']??$a['Notes'],$st,$st,fm_uid($u),$st,fm_actor($u),$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/training-assignments/:id/transfer');if($p!==null&&$method==='POST'){ $a=fm_course_ass($p['id']);$target=fm_course((string)($b['TargetCourseID']??$b['NewCourseID']??''));if(!$a||!$target)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_training_manage_ok($u,$a['CurriculumDepartment'])||!fm_training_manage_ok($u,$target['Department']))fm_deny();db()->beginTransaction();try{db_execute("UPDATE fourm_courseemployees SET Status='Transferred',RemovedAt=NOW(),RemovedByID=?,RemovedBy=? WHERE id=?",[fm_uid($u),fm_actor($u),$p['id']]);$out=fm_assign($u,'course',$target['id'],[$a['EmployeeID']],$b['Notes']??null,['Year'=>$target['Year'],'Department'=>$target['Department'],'CurriculumID'=>$target['CurriculumID']]);db()->commit();json_response(['success'=>true,'data'=>$out]);}catch(Throwable $e){db()->rollBack();throw $e;}}
    if($method==='GET'&&$path==='/fourm/training-logs'){ $sql='SELECT l.*,c.Department,c.`Year`,c.CurriculumCode,c.CurriculumTitle,co.CourseCode,co.CourseTitle FROM fourm_curriculumlogs l LEFT JOIN fourm_curriculums c ON c.id=l.CurriculumID LEFT JOIN fourm_courses co ON co.id=l.CourseID WHERE 1=1';$pa=[];foreach(['curriculumId'=>'l.CurriculumID','courseId'=>'l.CourseID','employeeId'=>'l.EmployeeID','action'=>'l.Action'] as $q=>$col)if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $col=?";$pa[]=fm_text($_GET[$q],100);}if(!empty($_GET['year'])){$sql.=' AND c.`Year`=?';$pa[]=(int)$_GET['year'];}$d=fm_admin($u)?fm_text($_GET['dept']??'',100):fm_text($u['department']??'',100);if($d&&$d!=='all'){$sql.=' AND c.Department=?';$pa[]=$d;}$limit=min(300,max(1,(int)($_GET['limit']??100)));json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY l.PerformedAt DESC,l.id DESC LIMIT '.$limit,$pa)]);}
    $p=route_params($path,'/fourm/training-logs/:id');if($p!==null&&$method==='DELETE'){require_admin();$id=(int)$p['id'];if($id<=0)json_response(['success'=>false,'message'=>'Invalid training log id.'],400);$row=db_row('SELECT * FROM fourm_curriculumlogs WHERE id=?',[$id]);if(!$row)json_response(['success'=>false,'message'=>'Training log not found.'],404);db_execute('DELETE FROM fourm_curriculumlogs WHERE id=?',[$id]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/fourm/notices'){ $sql='SELECT * FROM fourm_changenotices WHERE 1=1';$pa=[];if(($_GET['overdue']??'')==='1')$sql.=" AND Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30";elseif(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' AND Status=?';$pa[]=$_GET['status'];}foreach(['type'=>'ChangeType','dept'=>'Department'] as $q=>$c)if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}if(($_GET['mine']??'')==='1'){$sql.=' AND CreatedByID=?';$pa[]=fm_uid($u);}if(($_GET['trainingRequired']??'')==='1')$sql.=' AND TrainingRequired=1';if(!empty($_GET['year'])){$sql.=' AND YEAR(RequestDate)=?';$pa[]=(int)$_GET['year'];}if(!empty($_GET['q'])){$like='%'.fm_text($_GET['q'],120).'%';$sql.=' AND (Title LIKE ? OR NoticeNo LIKE ? OR ResponsiblePerson LIKE ?)';array_push($pa,$like,$like,$like);}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY RequestDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='GET'&&$path==='/fourm/notice-next-no')json_response(['success'=>true,'data'=>['NoticeNo'=>fm_notice_no($_GET['date']??null)]]);
    if($method==='GET'&&$path==='/fourm/email-outbox'){require_admin();json_response(['success'=>true,'data'=>db_rows('SELECT id,NoticeID,TaskID,EventType,Recipients,Subject,Status,SentAt,Error,CreatedAt FROM fourm_emailoutbox ORDER BY CreatedAt DESC,id DESC LIMIT 200'),'smtpConfigured'=>mailer_smtp_configured()]);}
    $p=route_params($path,'/fourm/email-outbox/:id/retry');if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('fourm_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Cannot retry 4M email.','error'=>$e->getMessage()],500);}}
    $p=route_params($path,'/fourm/notices/:id/tasks');if($p!==null&&$method==='GET'){json_response(['success'=>true,'data'=>db_rows("SELECT * FROM fourm_actiontasks WHERE NoticeID=? ORDER BY Status='Done',COALESCE(DueDate,'9999-12-31'),CreatedAt",[$p['id']])]);}
    if($p!==null&&$method==='POST'){ $n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_admin($u)&&fm_uid($u)!==(string)$n['CreatedByID'])fm_deny();$t=fm_task_payload($b);$id=fm_uuid();db_execute('INSERT INTO fourm_actiontasks (id,NoticeID,TaskTitle,OwnerName,DueDate,Status,Notes,CompletedAt,CompletedBy,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$p['id'],$t['TaskTitle'],$t['OwnerName'],$t['DueDate'],$t['Status'],$t['Notes'],$t['Status']==='Done'?date('Y-m-d H:i:s'):null,$t['Status']==='Done'?fm_actor($u):null,fm_uid($u),fm_actor($u)]);$mail=fm_task_mail($n,array_merge($t,['id'=>$id]),'Created');fm_queue($p['id'],$id,'ActionTaskCreated',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null)]));json_response(['success'=>true,'data'=>['id'=>$id]],201);}
    $p=route_params($path,'/fourm/notice-tasks/:id');if($p!==null&&in_array($method,['PUT','DELETE'],true)){ $t=db_row('SELECT t.*,n.NoticeNo,n.Title,n.Department,n.ChangeType,n.Status NoticeStatus,n.CreatedByID NoticeCreatedByID FROM fourm_actiontasks t JOIN fourm_changenotices n ON n.id=t.NoticeID WHERE t.id=?',[$p['id']]);if(!$t)json_response(['success'=>false,'message'=>'Not found.'],404);if(!fm_admin($u)&&fm_uid($u)!==(string)$t['NoticeCreatedByID'])fm_deny();if($method==='DELETE'){db_execute('DELETE FROM fourm_actiontasks WHERE id=?',[$p['id']]);json_response(['success'=>true]);}$v=fm_task_payload($b,$t);db_execute('UPDATE fourm_actiontasks SET TaskTitle=?,OwnerName=?,DueDate=?,Status=?,Notes=?,CompletedAt=?,CompletedBy=? WHERE id=?',[$v['TaskTitle'],$v['OwnerName'],$v['DueDate'],$v['Status'],$v['Notes'],$v['Status']==='Done'?($t['CompletedAt']?:date('Y-m-d H:i:s')):null,$v['Status']==='Done'?($t['CompletedBy']?:fm_actor($u)):null,$p['id']]);if($v['Status']==='Done'&&($t['Status']??'')!=='Done'){$mail=fm_task_mail($t,array_merge($t,$v),'Done');fm_queue($t['NoticeID']??null,$p['id'],'ActionTaskDone',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($t['NoticeCreatedByID']??null)]));}json_response(['success'=>true]);}
    $p=route_params($path,'/fourm/notices/:id/close');if($p!==null&&$method==='POST'){ $file=fm_upload('closingDoc');$n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n){fm_cleanup($file);json_response(['success'=>false,'message'=>'Not found.'],404);}if(!fm_admin($u)&&fm_uid($u)!==(string)$n['CreatedByID']){fm_cleanup($file);fm_deny();}if(fm_text($b['ClosingComment']??'',1000)===''){fm_cleanup($file);json_response(['success'=>false,'message'=>'Closing comment is required.'],400);}try{db_execute("UPDATE fourm_changenotices SET Status='Closed',ClosingComment=?,ClosingDocUrl=COALESCE(?,ClosingDocUrl),ClosedDate=?,ClosedBy=? WHERE id=?",[$b['ClosingComment'], $file['url']??null,$b['ClosedDate']??date('Y-m-d'),fm_actor($u),$p['id']]);if($file)delete_uploaded_file($n['ClosingDocUrl']??null);$mail=fm_notice_mail($n,'NoticeClosed','Closed');fm_queue($p['id'],null,'NoticeClosed',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null)]));json_response(['success'=>true]);}catch(Throwable $e){fm_cleanup($file);throw $e;}}
    $p=route_params($path,'/fourm/notices/:id');if($p!==null&&$method==='GET'){ $n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);json_response(['success'=>true,'data'=>$n]);}
    if($p!==null&&$method==='DELETE'){require_admin();$n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n)json_response(['success'=>false,'message'=>'Not found.'],404);db_execute('DELETE FROM fourm_actiontasks WHERE NoticeID=?',[$p['id']]);db_execute('DELETE FROM fourm_changenotices WHERE id=?',[$p['id']]);delete_uploaded_file($n['AttachmentUrl']??null);delete_uploaded_file($n['ClosingDocUrl']??null);json_response(['success'=>true]);}
    if($p!==null&&$method==='PUT'){require_admin();$file=fm_upload('attachment');$n=db_row('SELECT * FROM fourm_changenotices WHERE id=?',[$p['id']]);if(!$n){fm_cleanup($file);json_response(['success'=>false,'message'=>'Not found.'],404);}if(($b['Status']??'')==='Closed'){fm_cleanup($file);json_response(['success'=>false,'message'=>'Use the close workflow to close a notice.'],400);}try{$newStatus=$b['Status']??$n['Status'];db_execute('UPDATE fourm_changenotices SET RequestDate=?,Title=?,Description=?,ChangeType=?,ResponsiblePerson=?,Department=?,AttachmentUrl=?,Status=?,SafetyImpact=?,QualityImpact=?,ProductionImpact=?,EnvironmentImpact=?,TrainingRequired=?,ImpactNote=? WHERE id=?',[$b['RequestDate']??$n['RequestDate'],$b['Title']??$n['Title'],$b['Description']??$n['Description'],$b['ChangeType']??$n['ChangeType'],$b['ResponsiblePerson']??$n['ResponsiblePerson'],$b['Department']??$n['Department'],$file['url']??$n['AttachmentUrl'],$newStatus,$b['SafetyImpact']??$n['SafetyImpact'],$b['QualityImpact']??$n['QualityImpact'],$b['ProductionImpact']??$n['ProductionImpact'],$b['EnvironmentImpact']??$n['EnvironmentImpact'],isset($b['TrainingRequired'])?fm_bool($b['TrainingRequired']):(int)$n['TrainingRequired'],$b['ImpactNote']??$n['ImpactNote'],$p['id']]);if($file)delete_uploaded_file($n['AttachmentUrl']??null);if($newStatus==='Pending'&&($n['Status']??'')!=='Pending'){$mail=fm_notice_mail(array_merge($n,['Title'=>$b['Title']??$n['Title'],'Department'=>$b['Department']??$n['Department']]),'NoticePending','Pending');fm_queue($p['id'],null,'NoticePending',$mail['subject'],$mail['body'],$mail['html'],fm_recipients([fm_admin_email(),fm_company_email($n['CreatedByID']??null)]));}json_response(['success'=>true]);}catch(Throwable $e){fm_cleanup($file);throw $e;}}
    if($method==='POST'&&$path==='/fourm/notices'){ $file=fm_upload('attachment');try{if(empty($b['RequestDate'])||empty($b['Title'])||!in_array($b['ChangeType']??'', ['Man','Machine','Material','Method'],true))json_response(['success'=>false,'message'=>'Invalid notice.'],400);$id=fm_uuid();$no=fm_notice_no($b['RequestDate']);db_execute('INSERT INTO fourm_changenotices (id,NoticeNo,RequestDate,Title,Description,ChangeType,ResponsiblePerson,Department,AttachmentUrl,SafetyImpact,QualityImpact,ProductionImpact,EnvironmentImpact,TrainingRequired,ImpactNote,CreatedByID,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$no,$b['RequestDate'],$b['Title'],$b['Description']??null,$b['ChangeType'],fm_actor($u),$b['Department']??null,$file['url']??null,$b['SafetyImpact']??'N/A',$b['QualityImpact']??'N/A',$b['ProductionImpact']??'N/A',$b['EnvironmentImpact']??'N/A',fm_bool($b['TrainingRequired']??0),$b['ImpactNote']??null,fm_uid($u),fm_actor($u)]);$mail=fm_notice_mail(['NoticeNo'=>$no,'Title'=>$b['Title'],'ChangeType'=>$b['ChangeType'],'Department'=>$b['Department']??null,'RequestDate'=>$b['RequestDate'],'CreatedBy'=>fm_actor($u),'Status'=>'Open'],'NoticeCreated','Open');fm_queue($id,null,'NoticeCreated',$mail['subject'],$mail['body'],$mail['html'],fm_admin_email());json_response(['success'=>true,'data'=>['NoticeNo'=>$no]],201);}catch(Throwable $e){fm_cleanup($file);throw $e;}}
    return false;
}
