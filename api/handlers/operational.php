<?php
declare(strict_types=1);

function operational_user_name(array $user): string
{
    return (string) ($user['name'] ?? $user['id'] ?? 'System');
}

function ensure_training_tables(): void
{
    db()->exec('CREATE TABLE IF NOT EXISTS training_courses (
        id INT AUTO_INCREMENT PRIMARY KEY, CourseCode VARCHAR(50), CourseName VARCHAR(255) NOT NULL, Description TEXT,
        DurationHours DECIMAL(5,1) DEFAULT 0, PassScore DECIMAL(5,2) DEFAULT 70, IsActive TINYINT(1) DEFAULT 1,
        CreatedBy VARCHAR(100), CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_code (CourseCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    db()->exec('CREATE TABLE IF NOT EXISTS training_records (
        id INT AUTO_INCREMENT PRIMARY KEY, CourseID INT NOT NULL, EmployeeID VARCHAR(50) NOT NULL, TrainingDate DATE NOT NULL,
        Score DECIMAL(5,2), IsPassed TINYINT(1) DEFAULT 0, Trainer VARCHAR(255), Notes TEXT, CreatedBy VARCHAR(100),
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_course (CourseID), KEY idx_employee (EmployeeID), KEY idx_date (TrainingDate)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    db()->exec('CREATE TABLE IF NOT EXISTS training_dept_records (
        id INT AUTO_INCREMENT PRIMARY KEY, Department VARCHAR(100) NOT NULL, Year INT NOT NULL, CourseID INT DEFAULT NULL,
        TotalEmp INT NOT NULL DEFAULT 0, PassedCount INT NOT NULL DEFAULT 0, Notes TEXT, CreatedBy VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_dept (Department), KEY idx_year (Year), KEY idx_course (CourseID),
        UNIQUE KEY uq_dept_year_course (Department,Year,CourseID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function training_filters(array $query, string $alias = 'r'): array
{
    $where = [];
    $params = [];
    if (!empty($query['year'])) {
        $where[] = $alias . '.Year=?';
        $params[] = (int) $query['year'];
    }
    if (!empty($query['department'])) {
        $where[] = $alias . '.Department=?';
        $params[] = trim((string) $query['department']);
    }
    return [$where ? ' AND ' . implode(' AND ', $where) : '', $params];
}

function handle_training_routes(string $method, string $path): bool
{
    if (strpos($path, '/training') !== 0) {
        return false;
    }
    $user = require_user();
    ensure_training_tables();
    if ($method === 'GET' && $path === '/training/courses') {
        json_response(['success' => true, 'data' => db_rows('SELECT c.*,COUNT(r.id) AS TotalRecords,COALESCE(SUM(r.IsPassed),0) AS PassedCount FROM training_courses c LEFT JOIN training_records r ON r.CourseID=c.id GROUP BY c.id ORDER BY c.IsActive DESC,c.CourseName')]);
    }
    if ($method === 'POST' && $path === '/training/courses') {
        require_admin(); $b = json_body(); $name = trim((string) ($b['CourseName'] ?? ''));
        if ($name === '') json_response(['success' => false, 'message' => 'CourseName is required.'], 400);
        db_execute('INSERT INTO training_courses (CourseCode,CourseName,Description,DurationHours,PassScore,IsActive,CreatedBy) VALUES (?,?,?,?,?,1,?)', [trim((string) ($b['CourseCode'] ?? '')) ?: null,$name,$b['Description'] ?? null,(float) ($b['DurationHours'] ?? 0),(float) ($b['PassScore'] ?? 70),operational_user_name($user)]);
        json_response(['success' => true, 'id' => (int) db()->lastInsertId()]);
    }
    $p = route_params($path, '/training/courses/:id');
    if ($p !== null && $method === 'PUT') {
        require_admin(); $b=json_body();
        db_execute('UPDATE training_courses SET CourseCode=?,CourseName=?,Description=?,DurationHours=?,PassScore=?,IsActive=? WHERE id=?', [trim((string)($b['CourseCode']??''))?:null,trim((string)($b['CourseName']??'')),$b['Description']??null,(float)($b['DurationHours']??0),(float)($b['PassScore']??70),db_bool($b['IsActive']??0),$p['id']]);
        json_response(['success'=>true]);
    }
    if ($p !== null && $method === 'DELETE') {
        require_admin();
        if ((int)(safe_scalar('SELECT COUNT(*) FROM training_records WHERE CourseID=?',[$p['id']])??0) || (int)(safe_scalar('SELECT COUNT(*) FROM training_dept_records WHERE CourseID=?',[$p['id']])??0)) json_response(['success'=>false,'message'=>'Course has linked records.'],400);
        db_execute('DELETE FROM training_courses WHERE id=?',[$p['id']]); json_response(['success'=>true]);
    }
    if ($method === 'GET' && $path === '/training/summary') {
        $year=(int)($_GET['year']??0); $filter=$year?' AND YEAR(r.TrainingDate)=?':''; $params=$year?[$year]:[];
        $overall=db_row('SELECT COUNT(*) AS total,COALESCE(SUM(IsPassed),0) AS passed,COUNT(DISTINCT EmployeeID) AS uniqueTrainees,COUNT(DISTINCT CourseID) AS coursesUsed FROM training_records r WHERE 1=1'.$filter,$params)?:[];
        $byCourse=db_rows('SELECT c.id,c.CourseName,c.CourseCode,c.PassScore,c.IsActive,COUNT(r.id) AS total,COALESCE(SUM(r.IsPassed),0) AS passed,COUNT(DISTINCT r.EmployeeID) AS uniqueTrainees FROM training_courses c LEFT JOIN training_records r ON r.CourseID=c.id'.($year?' AND YEAR(r.TrainingDate)=?':'').' GROUP BY c.id ORDER BY c.IsActive DESC,total DESC,c.CourseName',$params);
        $byDept=db_rows('SELECT COALESCE(e.Department,\'(Unspecified)\') AS Department,COUNT(r.id) AS total,COALESCE(SUM(r.IsPassed),0) AS passed,COUNT(DISTINCT r.EmployeeID) AS uniqueTrainees FROM training_records r LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE 1=1'.$filter.' GROUP BY e.Department ORDER BY total DESC',$params);
        json_response(['success'=>true,'data'=>compact('overall','byCourse','byDept')]);
    }
    if ($method === 'GET' && $path === '/training/records') {
        $sql='SELECT r.*,c.CourseName,c.CourseCode,e.EmployeeName,e.Department FROM training_records r LEFT JOIN training_courses c ON c.id=r.CourseID LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE 1=1'; $params=[];
        if(!empty($_GET['courseId'])){$sql.=' AND r.CourseID=?';$params[]=$_GET['courseId'];} if(!empty($_GET['employeeId'])){$sql.=' AND r.EmployeeID=?';$params[]=$_GET['employeeId'];} if(!empty($_GET['year'])){$sql.=' AND YEAR(r.TrainingDate)=?';$params[]=(int)$_GET['year'];}
        json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY r.TrainingDate DESC,r.id DESC',$params)]);
    }
    if ($method === 'POST' && $path === '/training/records') {
        require_admin();$b=json_body();$course=db_row('SELECT PassScore FROM training_courses WHERE id=?',[$b['CourseID']??0]); if(!$course)json_response(['success'=>false,'message'=>'Course not found.'],400);
        $score=$b['Score']??null;$passed=$score!==null&&$score!==''&&(float)$score>=(float)$course['PassScore']?1:0;
        db_execute('INSERT INTO training_records (CourseID,EmployeeID,TrainingDate,Score,IsPassed,Trainer,Notes,CreatedBy) VALUES (?,?,?,?,?,?,?,?)',[$b['CourseID'],trim((string)($b['EmployeeID']??'')),$b['TrainingDate']??null,$score===''?null:$score,$passed,$b['Trainer']??null,$b['Notes']??null,operational_user_name($user)]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);
    }
    $p=route_params($path,'/training/records/:id');
    if($p!==null&&$method==='PUT'){require_admin();$b=json_body();$course=db_row('SELECT PassScore FROM training_courses WHERE id=?',[$b['CourseID']??0]);if(!$course)json_response(['success'=>false,'message'=>'Course not found.'],400);$score=$b['Score']??null;$passed=$score!==null&&$score!==''&&(float)$score>=(float)$course['PassScore']?1:0;db_execute('UPDATE training_records SET CourseID=?,EmployeeID=?,TrainingDate=?,Score=?,IsPassed=?,Trainer=?,Notes=? WHERE id=?',[$b['CourseID'],$b['EmployeeID'],$b['TrainingDate'],$score===''?null:$score,$passed,$b['Trainer']??null,$b['Notes']??null,$p['id']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM training_records WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/training/dept-summary'){[$filter,$params]=training_filters($_GET);$rows=db_rows('SELECT Department,SUM(TotalEmp) AS TotalEmp,SUM(PassedCount) AS PassedCount,COUNT(*) AS RecordCount FROM training_dept_records r WHERE 1=1'.$filter.' GROUP BY Department ORDER BY Department',$params);$totalEmp=0;$totalPassed=0;foreach($rows as $r){$totalEmp+=(int)$r['TotalEmp'];$totalPassed+=(int)$r['PassedCount'];}json_response(['success'=>true,'data'=>['byDept'=>$rows,'overall'=>['deptCount'=>count($rows),'totalEmp'=>$totalEmp,'totalPassed'=>$totalPassed,'passRate'=>$totalEmp?(int)round($totalPassed*100/$totalEmp):0]]]);}
    if($method==='GET'&&$path==='/training/dept-records'){[$filter,$params]=training_filters($_GET);json_response(['success'=>true,'data'=>db_rows('SELECT r.*,c.CourseName,c.CourseCode FROM training_dept_records r LEFT JOIN training_courses c ON c.id=r.CourseID WHERE 1=1'.$filter.' ORDER BY r.Year DESC,r.Department,c.CourseName',$params)]);}
    if($method==='POST'&&$path==='/training/dept-records'){require_admin();$b=json_body();if((int)($b['PassedCount']??0)>(int)($b['TotalEmp']??0))json_response(['success'=>false,'message'=>'PassedCount cannot exceed TotalEmp.'],400);db_execute('INSERT INTO training_dept_records (Department,Year,CourseID,TotalEmp,PassedCount,Notes,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$b['Department'],$b['Year'],($b['CourseID']??null)?:null,(int)$b['TotalEmp'],(int)$b['PassedCount'],$b['Notes']??null,operational_user_name($user)]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);}
    $p=route_params($path,'/training/dept-records/:id');
    if($p!==null&&$method==='PUT'){require_admin();$b=json_body();if((int)($b['PassedCount']??0)>(int)($b['TotalEmp']??0))json_response(['success'=>false,'message'=>'PassedCount cannot exceed TotalEmp.'],400);db_execute('UPDATE training_dept_records SET Department=?,Year=?,CourseID=?,TotalEmp=?,PassedCount=?,Notes=? WHERE id=?',[$b['Department'],$b['Year'],($b['CourseID']??null)?:null,(int)$b['TotalEmp'],(int)$b['PassedCount'],$b['Notes']??null,$p['id']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM training_dept_records WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/training/course-summary'){[$filter,$params]=training_filters($_GET);json_response(['success'=>true,'data'=>db_rows('SELECT r.CourseID,COALESCE(c.CourseName,\'(Unspecified)\') AS CourseName,c.CourseCode,COUNT(DISTINCT r.Department) AS deptCount,SUM(r.TotalEmp) AS totalEmp,SUM(r.PassedCount) AS passedCount FROM training_dept_records r LEFT JOIN training_courses c ON c.id=r.CourseID WHERE 1=1'.$filter.' GROUP BY r.CourseID,c.CourseName,c.CourseCode ORDER BY c.CourseName',$params)]);}
    if($method==='GET'&&$path==='/training/employees'){json_response(['success'=>true,'data'=>db_rows('SELECT EmployeeID,EmployeeName,Department,Position FROM employees ORDER BY EmployeeName')]);}
    return false;
}

function ensure_ojt_tables(): void
{
    db()->exec('CREATE TABLE IF NOT EXISTS scw_standard (id INT AUTO_INCREMENT PRIMARY KEY,Content TEXT,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    db()->exec('CREATE TABLE IF NOT EXISTS ojt_records (
        id INT AUTO_INCREMENT PRIMARY KEY,Department VARCHAR(100) NOT NULL,OJTDate DATE,NextReviewDate DATE,
        ReviewIntervalMonths INT DEFAULT 12,TrainerName VARCHAR(255),AttendeeCount INT DEFAULT 0,Notes TEXT,
        CreatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        YearlyTarget INT DEFAULT NULL,UNIQUE KEY uq_dept (Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    db()->exec('CREATE TABLE IF NOT EXISTS ojt_history (
        id INT AUTO_INCREMENT PRIMARY KEY,Department VARCHAR(100) NOT NULL,OJTDate DATE,NextReviewDate DATE,
        ReviewIntervalMonths INT DEFAULT 12,TrainerName VARCHAR(255),AttendeeCount INT DEFAULT 0,Notes TEXT,
        RecordedBy VARCHAR(100),RecordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,KEY idx_dept (Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    db()->exec('CREATE TABLE IF NOT EXISTS scw_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,Title VARCHAR(255) NOT NULL,FileURL TEXT NOT NULL,FileType VARCHAR(50),
        FileSizeKB INT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    foreach ([
        'ALTER TABLE ojt_records ADD COLUMN AttendeeCount INT DEFAULT 0',
        'ALTER TABLE ojt_records ADD COLUMN YearlyTarget INT DEFAULT NULL',
        'ALTER TABLE scw_documents ADD COLUMN Title VARCHAR(255) NULL',
        'ALTER TABLE scw_documents ADD COLUMN FileURL TEXT NULL',
        'ALTER TABLE scw_documents ADD COLUMN FileType VARCHAR(50)',
        'ALTER TABLE scw_documents ADD COLUMN FileSizeKB INT DEFAULT 0',
        'ALTER TABLE scw_documents ADD COLUMN UploadedBy VARCHAR(100)',
        'ALTER TABLE scw_documents ADD COLUMN UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    ] as $sql) {
        try { db()->exec($sql); } catch (Throwable $error) {}
    }
    try {
        db()->exec("UPDATE scw_documents SET Title=COALESCE(NULLIF(Title,''),DocumentName),FileURL=COALESCE(NULLIF(FileURL,''),DocumentLink) WHERE Title IS NULL OR Title='' OR FileURL IS NULL OR FileURL=''");
    } catch (Throwable $error) {}
    if(!db_row('SELECT id FROM scw_standard LIMIT 1'))db_execute('INSERT INTO scw_standard (Content,UpdatedBy) VALUES (?,?)',['<h3>STOP</h3><p>Stop work when unsafe.</p><h3>CALL</h3><p>Call the responsible person.</p><h3>WAIT</h3><p>Wait for approval.</p>','System']);
}

function handle_ojt_routes(string $method,string $path): bool
{
    if(strpos($path,'/ojt')!==0)return false;$user=require_user();ensure_ojt_tables();
    if($method==='GET'&&$path==='/ojt/standard')json_response(['success'=>true,'data'=>db_row('SELECT * FROM scw_standard ORDER BY id DESC LIMIT 1')]);
    if($method==='PUT'&&$path==='/ojt/standard'){require_admin();$b=json_body();$content=trim((string)($b['Content']??''));if($content==='')json_response(['success'=>false,'message'=>'Content is required.'],400);$row=db_row('SELECT id FROM scw_standard LIMIT 1');if($row)db_execute('UPDATE scw_standard SET Content=?,UpdatedBy=? WHERE id=?',[$content,operational_user_name($user),$row['id']]);else db_execute('INSERT INTO scw_standard (Content,UpdatedBy) VALUES (?,?)',[$content,operational_user_name($user)]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/ojt/records'){$depts=db_rows('SELECT Name FROM master_departments ORDER BY Name');$records=db_rows('SELECT * FROM ojt_records ORDER BY Department');$map=[];foreach($records as $r)$map[$r['Department']]=$r;$out=[];foreach($depts as $d)$out[]=$map[$d['Name']]??['id'=>null,'Department'=>$d['Name'],'OJTDate'=>null,'NextReviewDate'=>null,'ReviewIntervalMonths'=>12,'TrainerName'=>null,'AttendeeCount'=>0,'Notes'=>null];foreach($records as $r)if(!in_array($r['Department'],array_column($depts,'Name'),true))$out[]=$r;json_response(['success'=>true,'data'=>$out]);}
    if($method==='POST'&&$path==='/ojt/records'){require_admin();$b=json_body();$department=trim((string)($b['Department']??''));$rawDate=trim((string)($b['OJTDate']??''));if($department===''||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$rawDate))json_response(['success'=>false,'message'=>'Department and a valid OJTDate are required.'],400);$date=DateTime::createFromFormat('!Y-m-d',$rawDate);if(!$date||$date->format('Y-m-d')!==$rawDate)json_response(['success'=>false,'message'=>'OJTDate is invalid.'],400);$interval=(int)($b['ReviewIntervalMonths']??12);if(!in_array($interval,[6,12,24],true))json_response(['success'=>false,'message'=>'Invalid review interval.'],400);$next=(clone $date)->modify('+'.$interval.' months')->format('Y-m-d');db_execute('INSERT INTO ojt_records (Department,OJTDate,NextReviewDate,ReviewIntervalMonths,TrainerName,AttendeeCount,Notes,YearlyTarget,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE OJTDate=VALUES(OJTDate),NextReviewDate=VALUES(NextReviewDate),ReviewIntervalMonths=VALUES(ReviewIntervalMonths),TrainerName=VALUES(TrainerName),AttendeeCount=VALUES(AttendeeCount),Notes=VALUES(Notes),YearlyTarget=VALUES(YearlyTarget)',[$department,$date->format('Y-m-d'),$next,$interval,$b['TrainerName']??null,(int)($b['AttendeeCount']??0),$b['Notes']??null,$b['YearlyTarget']??null,operational_user_name($user)]);db_execute('INSERT INTO ojt_history (Department,OJTDate,NextReviewDate,ReviewIntervalMonths,TrainerName,AttendeeCount,Notes,RecordedBy) VALUES (?,?,?,?,?,?,?,?)',[$department,$date->format('Y-m-d'),$next,$interval,$b['TrainerName']??null,(int)($b['AttendeeCount']??0),$b['Notes']??null,operational_user_name($user)]);json_response(['success'=>true]);}
    $p=route_params($path,'/ojt/history/:department');if($p!==null&&$method==='GET')json_response(['success'=>true,'data'=>db_rows('SELECT * FROM ojt_history WHERE Department=? ORDER BY RecordedAt DESC LIMIT 20',[$p['department']])]);
    if($method==='GET'&&$path==='/ojt/documents')json_response(['success'=>true,'data'=>db_rows('SELECT * FROM scw_documents ORDER BY id DESC')]);
    if($method==='POST'&&$path==='/ojt/documents'){require_admin();$b=json_body();$url=trim((string)($b['FileURL']??''));if(strpos($url,'/uploads/')===false)json_response(['success'=>false,'message'=>'Invalid upload URL.'],400);db_execute('INSERT INTO scw_documents (Title,FileURL,FileType,FileSizeKB,UploadedBy) VALUES (?,?,?,?,?)',[$b['Title'],$url,$b['FileType']??null,(int)($b['FileSizeKB']??0),operational_user_name($user)]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);}
    $p=route_params($path,'/ojt/documents/:id');if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT FileURL FROM scw_documents WHERE id=?',[$p['id']]);db_execute('DELETE FROM scw_documents WHERE id=?',[$p['id']]);if($row)delete_uploaded_file($row['FileURL']);json_response(['success'=>true]);}
    $p=route_params($path,'/ojt/records/:id');if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM ojt_records WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    return false;
}
