<?php
declare(strict_types=1);

function bbs_schedule_enabled(): bool
{
    $row = db_row("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='inspector_schedule_enabled' LIMIT 1");
    return (string)($row['SettingValue'] ?? '0') === '1';
}

function bbs_schedule_today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d');
}

function bbs_schedule_kpi_status(array $input = []): array
{
    $configured = (bool)($input['configured'] ?? true); $applicable = (bool)($input['applicable'] ?? true);
    $numerator = (int)($input['numerator'] ?? 0); $denominator = (int)($input['denominator'] ?? 0);
    $scheduledDays = (int)($input['scheduledDays'] ?? 0); $upcomingDays = (int)($input['upcomingDays'] ?? 0);
    if (!$configured) return ['code'=>'NOT_CONFIGURED','label'=>'Not configured','description'=>'ยังไม่ได้กำหนดผู้ตรวจและ KPI สำหรับช่วงเวลานี้','percentage'=>null];
    if (!$applicable) return ['code'=>'N_A','label'=>'N/A','description'=>'บุคคลหรือช่วงเวลานี้ไม่อยู่ในเกณฑ์ KPI','percentage'=>null];
    if ($denominator > 0 && $numerator <= 0) return ['code'=>'ZERO_PERCENT','label'=>'0%','description'=>'ถึงกำหนดตรวจแล้ว แต่ยังไม่มีผลงานที่นับ KPI','percentage'=>0];
    if ($denominator > 0) { $percentage=round($numerator*100/$denominator,2); return ['code'=>'PERCENT','label'=>$percentage.'%','description'=>'ผลงานเทียบเป้าหมายที่ถึงกำหนดแล้ว','percentage'=>$percentage]; }
    if ($upcomingDays > 0 || $scheduledDays > 0) return ['code'=>'NOT_INSPECTED','label'=>'ยังไม่ได้ตรวจ','description'=>'มีตารางตรวจ แต่ยังไม่มีเป้าหมายที่ถึงกำหนด','percentage'=>null];
    return ['code'=>'N_A','label'=>'N/A','description'=>'ไม่มีวันตรวจที่นำมาคำนวณในช่วงเวลานี้','percentage'=>null];
}

function bbs_schedule_period(array $query): ?array
{
    $today = bbs_schedule_today();
    $year = (int)($query['year'] ?? substr($today, 0, 4));
    $month = (int)($query['month'] ?? substr($today, 5, 2));
    if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) return null;
    $start = sprintf('%04d-%02d-01', $year, $month);
    $end = (new DateTimeImmutable($start, new DateTimeZone('UTC')))->modify('+1 month')->format('Y-m-d');
    return ['year'=>$year, 'month'=>$month, 'start'=>$start, 'end'=>$end, 'today'=>$today];
}

function bbs_schedule_enrollment(int $id, bool $lock = false): ?array
{
    return db_row(
        "SELECT x.*,e.EmployeeName InspectorName,d.Name DepartmentName,u.name SafetyUnitName,
                r.TargetCount,r.Weekdays
           FROM BBS_Inspector_Enrollments x
           JOIN employees e ON e.EmployeeID=x.InspectorEmployeeID
           JOIN master_departments d ON d.id=x.DepartmentID
           JOIN master_safetyunits u ON u.id=x.SafetyUnitID
           LEFT JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
           LEFT JOIN BBS_KPI_Rules r ON r.BBSLevel=m.BBSLevel AND r.MetricKey='submitted_observation' AND r.IsActive=1
          WHERE x.id=? LIMIT 1" . ($lock ? ' FOR UPDATE' : ''),
        [$id]
    );
}

function bbs_schedule_target(array $enrollment, array $rules, array $overrides, string $date): array
{
    $enrollmentId = (int)($enrollment['EnrollmentID'] ?? $enrollment['id']);
    foreach ($overrides as $row) {
        if ((int)$row['EnrollmentID'] !== $enrollmentId || substr((string)$row['ScheduleDate'], 0, 10) !== $date || (int)($row['IsActive'] ?? 1) !== 1) continue;
        if ($row['OverrideType'] === 'Exempt') return ['target'=>0, 'source'=>'Exempt', 'reason'=>(string)($row['Reason'] ?? '')];
        return ['target'=>max(1, (int)($row['TargetCount'] ?: ($enrollment['TargetCount'] ?? 1))), 'source'=>'Required override', 'reason'=>(string)($row['Reason'] ?? '')];
    }
    $selected = null;
    foreach ($rules as $row) {
        if ((int)$row['EnrollmentID'] !== $enrollmentId || $row['Status'] !== 'Active') continue;
        $from = substr((string)$row['EffectiveFrom'], 0, 10); $to = !empty($row['EffectiveTo']) ? substr((string)$row['EffectiveTo'], 0, 10) : null;
        if ($from <= $date && (!$to || $to >= $date) && (!$selected || $from > substr((string)$selected['EffectiveFrom'], 0, 10) || ($from === substr((string)$selected['EffectiveFrom'], 0, 10) && (int)$row['id'] > (int)$selected['id']))) $selected = $row;
    }
    $weekdays = bbs_phase1_weekdays($selected['Weekdays'] ?? ($enrollment['Weekdays'] ?? '1,2,3,4,5'));
    $weekday = (int)(new DateTimeImmutable($date, new DateTimeZone('UTC')))->format('N');
    if (!in_array($weekday, $weekdays, true)) return ['target'=>0, 'source'=>$selected ? 'Schedule rule' : 'Default KPI', 'reason'=>''];
    return ['target'=>max(1, (int)($selected['TargetCount'] ?? ($enrollment['TargetCount'] ?? 1))), 'source'=>$selected ? 'Schedule rule' : 'Default KPI', 'reason'=>(string)($selected['Reason'] ?? '')];
}

function bbs_schedule_compliance(array $enrollments, array $rules, array $overrides, array $actualRows, array $range): array
{
    $actual = [];
    foreach ($actualRows as $row) $actual[(string)$row['ObserverEmployeeID'].'::'.substr((string)$row['ObservationDate'], 0, 10)] = (int)$row['ActualCount'];
    $people = [];
    foreach ($enrollments as $enrollment) {
        $start = max($range['start'], substr((string)($enrollment['EnrollmentFrom'] ?? $enrollment['EffectiveFrom']), 0, 10));
        $end = $range['end'];
        $enrollmentTo = !empty($enrollment['EnrollmentTo']) ? substr((string)$enrollment['EnrollmentTo'], 0, 10) : (!empty($enrollment['EffectiveTo']) ? substr((string)$enrollment['EffectiveTo'], 0, 10) : null);
        if ($enrollmentTo && $enrollmentTo < $end) $end = (new DateTimeImmutable($enrollmentTo, new DateTimeZone('UTC')))->modify('+1 day')->format('Y-m-d');
        $days = [];
        for ($cursor = new DateTimeImmutable($start, new DateTimeZone('UTC')); $cursor->format('Y-m-d') < $end; $cursor = $cursor->modify('+1 day')) {
            $date = $cursor->format('Y-m-d'); $schedule = bbs_schedule_target($enrollment, $rules, $overrides, $date);
            $actualCount = $actual[(string)($enrollment['InspectorEmployeeID'] ?? $enrollment['EmployeeID']).'::'.$date] ?? 0;
            $future = $date > $range['today']; $achieved = $schedule['target'] > 0 && !$future ? min($schedule['target'], $actualCount) : 0;
            $status = 'Not scheduled';
            if ($schedule['source'] === 'Exempt') $status = 'Exempt';
            elseif ($schedule['target'] > 0 && $future) $status = 'Upcoming';
            elseif ($schedule['target'] > 0 && $actualCount >= $schedule['target']) $status = 'Completed';
            elseif ($schedule['target'] > 0 && $actualCount > 0) $status = 'Partial';
            elseif ($schedule['target'] > 0) $status = 'Missed';
            $days[] = ['date'=>$date, 'target'=>$schedule['target'], 'actual'=>$actualCount, 'achieved'=>$achieved, 'status'=>$status, 'source'=>$schedule['source'], 'reason'=>$schedule['reason']];
        }
        $due = array_values(array_filter($days, static fn($row) => $row['target'] > 0 && $row['date'] <= $range['today']));
        $scheduled = array_values(array_filter($days, static fn($row) => $row['target'] > 0));
        $numerator = array_sum(array_column($due, 'achieved')); $denominator = array_sum(array_column($due, 'target'));
        $upcomingDays=count(array_filter($days, static fn($row) => $row['status'] === 'Upcoming')); $exemptDays=count(array_filter($days, static fn($row) => $row['status'] === 'Exempt'));
        $people[] = [
            'enrollmentId'=>(int)($enrollment['EnrollmentID'] ?? $enrollment['id']),
            'inspectorEmployeeId'=>(string)($enrollment['InspectorEmployeeID'] ?? $enrollment['EmployeeID']),
            'inspectorName'=>(string)($enrollment['InspectorName'] ?? $enrollment['EmployeeName'] ?? ''),
            'department'=>(string)($enrollment['DepartmentName'] ?? $enrollment['Department'] ?? ''),
            'unit'=>(string)($enrollment['SafetyUnitName'] ?? $enrollment['Unit'] ?? ''),
            'scheduledDays'=>count($scheduled), 'dueDays'=>count($due),
            'completedDays'=>count(array_filter($due, static fn($row) => $row['status'] === 'Completed')),
            'partialDays'=>count(array_filter($due, static fn($row) => $row['status'] === 'Partial')),
            'missedDays'=>count(array_filter($due, static fn($row) => $row['status'] === 'Missed')),
            'upcomingDays'=>$upcomingDays, 'exemptDays'=>$exemptDays,
            'actualObservations'=>array_sum(array_column($days, 'actual')),
            'numerator'=>$numerator, 'denominator'=>$denominator,
            'percentage'=>$denominator > 0 ? round($numerator * 100 / $denominator, 2) : null,
            'kpiStatus'=>bbs_schedule_kpi_status(['configured'=>true,'applicable'=>count($scheduled)>0,'numerator'=>$numerator,'denominator'=>$denominator,'scheduledDays'=>count($scheduled),'upcomingDays'=>$upcomingDays]),
            'days'=>$days
        ];
    }
    $summary = ['inspectors'=>count($people)];
    foreach (['scheduledDays','dueDays','completedDays','partialDays','missedDays','upcomingDays','exemptDays','actualObservations','numerator','denominator'] as $key) $summary[$key] = array_sum(array_column($people, $key));
    $summary['percentage'] = $summary['denominator'] > 0 ? round($summary['numerator'] * 100 / $summary['denominator'], 2) : null;
    $summary['kpiStatus'] = bbs_schedule_kpi_status(['configured'=>count($people)>0,'applicable'=>count(array_filter($people,static fn($row)=>$row['scheduledDays']>0))>0,'numerator'=>$summary['numerator'],'denominator'=>$summary['denominator'],'scheduledDays'=>$summary['scheduledDays'],'upcomingDays'=>$summary['upcomingDays']]);
    return ['summary'=>$summary, 'people'=>$people];
}

function bbs_schedule_payload(array $user, array $range, ?int $requestedEnrollmentId = null): array
{
    $isAdmin = strtolower((string)($user['Role'] ?? $user['role'] ?? '')) === 'admin'; $params = [$range['end'], $range['start']]; $filter = '';
    if (!$isAdmin) { $filter = ' AND x.InspectorEmployeeID=?'; $params[] = bbs_inspector_actor($user); }
    elseif ($requestedEnrollmentId) { $filter = ' AND x.id=?'; $params[] = $requestedEnrollmentId; }
    $enrollments = db_rows("SELECT x.id EnrollmentID,x.InspectorEmployeeID,e.EmployeeName InspectorName,d.Name DepartmentName,u.name SafetyUnitName,x.EffectiveFrom EnrollmentFrom,x.EffectiveTo EnrollmentTo,COALESCE(r.TargetCount,1) TargetCount,COALESCE(r.Weekdays,'1,2,3,4,5') Weekdays FROM BBS_Inspector_Enrollments x JOIN employees e ON e.EmployeeID=x.InspectorEmployeeID JOIN master_departments d ON d.id=x.DepartmentID JOIN master_safetyunits u ON u.id=x.SafetyUnitID LEFT JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 LEFT JOIN BBS_KPI_Rules r ON r.BBSLevel=m.BBSLevel AND r.MetricKey='submitted_observation' AND r.IsActive=1 WHERE x.Status='Active' AND x.KpiRequired=1 AND x.IsActive=1 AND x.EffectiveFrom<? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?{$filter} ORDER BY d.Name,u.name,e.EmployeeName", $params);
    $ids = array_map(static fn($row)=>(int)$row['EnrollmentID'], $enrollments); $rules=[]; $overrides=[]; $actualRows=[];
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $rules = db_rows("SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID IN ({$marks}) AND Status='Active' AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EnrollmentID,EffectiveFrom,id", array_merge($ids, [$range['end'],$range['start']]));
        $overrides = db_rows("SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID IN ({$marks}) AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1 ORDER BY EnrollmentID,ScheduleDate", array_merge($ids, [$range['start'],$range['end']]));
        $actualRows = db_rows("SELECT ObserverEmployeeID,ObservationDate,COUNT(*) ActualCount FROM BBS_Observations WHERE Status='Submitted' AND ObservationDate>=? AND ObservationDate<? AND ObserverEmployeeID IN (SELECT InspectorEmployeeID FROM BBS_Inspector_Enrollments WHERE id IN ({$marks})) GROUP BY ObserverEmployeeID,ObservationDate", array_merge([$range['start'],$range['end']], $ids));
    }
    return array_merge(['enabled'=>true, 'period'=>$range], bbs_schedule_compliance($enrollments, $rules, $overrides, $actualRows, $range));
}

function handle_bbs_inspector_schedule_routes(string $method, string $path): bool
{
    if (strpos($path, '/bbs/inspectors') !== 0 && strpos($path, '/bbs/admin/inspectors') !== 0) return false;
    $user = require_user(); $actor = bbs_inspector_actor($user);
    $isScheduleRoute = $path === '/bbs/inspectors/compliance' || strpos($path, '/schedule') !== false;
    if (!$isScheduleRoute) return false;
    if (!bbs_schedule_enabled()) json_response(['success'=>false,'code'=>'BBS_INSPECTOR_SCHEDULE_DISABLED','message'=>'BBS inspector schedule is currently disabled.'],503);

    if ($method === 'GET' && $path === '/bbs/inspectors/compliance') {
        $range = bbs_schedule_period($_GET); if (!$range) json_response(['success'=>false,'message'=>'Valid year and month are required.'],400);
        $id = bbs_phase1_positive_int($_GET['enrollmentId'] ?? null);
        json_response(['success'=>true,'data'=>bbs_schedule_payload($user,$range,$id)]);
    }

    $detail = route_params($path, '/bbs/inspectors/:id/schedule');
    if ($method === 'GET' && $detail !== null) {
        $id = bbs_phase1_positive_int($detail['id']); $range = bbs_schedule_period($_GET);
        if (!$id || !$range) json_response(['success'=>false,'message'=>'Valid enrollment, year and month are required.'],400);
        $enrollment = bbs_schedule_enrollment($id); if (!$enrollment) json_response(['success'=>false,'message'=>'Inspector enrollment was not found.'],404);
        $isAdmin = strtolower((string)($user['Role'] ?? $user['role'] ?? '')) === 'admin';
        if (!$isAdmin && (string)$enrollment['InspectorEmployeeID'] !== $actor) json_response(['success'=>false,'message'=>'You cannot view another inspector schedule.'],403);
        json_response(['success'=>true,'data'=>[
            'enrollment'=>$enrollment,
            'rules'=>db_rows('SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? ORDER BY EffectiveFrom DESC,id DESC',[$id]),
            'overrides'=>db_rows('SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1 ORDER BY ScheduleDate',[$id,$range['start'],$range['end']]),
            'events'=>db_rows('SELECT * FROM BBS_Inspector_Schedule_Events WHERE EnrollmentID=? ORDER BY id DESC LIMIT 50',[$id]),
            'compliance'=>bbs_schedule_payload($user,$range,$id)
        ]]);
    }

    $save = route_params($path, '/bbs/admin/inspectors/:id/schedule');
    if ($method === 'PUT' && $save !== null) {
        $admin = require_admin(); $id = bbs_phase1_positive_int($save['id']); $body = json_body();
        $from = bbs_phase1_iso_date($body['effectiveFrom'] ?? null, true); $to = bbs_phase1_iso_date($body['effectiveTo'] ?? null); $weekdays = bbs_phase1_weekdays($body['weekdays'] ?? []); $target = bbs_phase1_positive_int($body['targetCount'] ?? null); $reason = bbs_inspector_clean($body['reason'] ?? ''); $name = bbs_inspector_clean($body['scheduleName'] ?? 'Inspection schedule',120) ?: 'Inspection schedule';
        if (!$id || !$from || $to === false || ($to && $to < $from) || !$weekdays || !$target || $target > 20 || $reason === '') json_response(['success'=>false,'message'=>'Enrollment, weekdays, target, effective dates and reason are required.'],400);
        if ($from < bbs_schedule_today()) json_response(['success'=>false,'code'=>'HISTORICAL_SCHEDULE_IMMUTABLE','message'=>'Schedule versions cannot start in the past.'],409);
        $pdo=db();$pdo->beginTransaction();try{$enrollment=bbs_schedule_enrollment($id,true);if(!$enrollment){$pdo->rollBack();json_response(['success'=>false,'message'=>'Inspector enrollment was not found.'],404);}if($from<substr((string)$enrollment['EffectiveFrom'],0,10)||(!empty($enrollment['EffectiveTo'])&&$from>substr((string)$enrollment['EffectiveTo'],0,10))||($to&&!empty($enrollment['EffectiveTo'])&&$to>substr((string)$enrollment['EffectiveTo'],0,10))){$pdo->rollBack();json_response(['success'=>false,'message'=>'Schedule dates must stay inside the inspector enrollment period.'],400);}foreach(db_rows("SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? AND Status='Active' ORDER BY EffectiveFrom,id FOR UPDATE",[$id])as$rule){$ruleFrom=substr((string)$rule['EffectiveFrom'],0,10);$ruleTo=!empty($rule['EffectiveTo'])?substr((string)$rule['EffectiveTo'],0,10):null;if($ruleFrom>=$from)db_execute("UPDATE BBS_Inspector_Schedule_Rules SET Status='Replaced',RowVersion=RowVersion+1 WHERE id=?",[$rule['id']]);elseif(!$ruleTo||$ruleTo>=$from)db_execute('UPDATE BBS_Inspector_Schedule_Rules SET EffectiveTo=?,RowVersion=RowVersion+1 WHERE id=?',[(new DateTimeImmutable($from))->modify('-1 day')->format('Y-m-d'),$rule['id']]);}$stmt=$pdo->prepare("INSERT INTO BBS_Inspector_Schedule_Rules(EnrollmentID,ScheduleName,Weekdays,TargetCount,EffectiveFrom,EffectiveTo,Status,Reason,CreatedBy) VALUES(?,?,?,?,?,?,'Active',?,?)");$stmt->execute([$id,$name,implode(',',$weekdays),$target,$from,$to,$reason,$actor]);$ruleId=(int)$pdo->lastInsertId();db_execute("INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,RuleID,EventType,ActorEmployeeID,DetailText) VALUES(?,?,'RuleVersionCreated',?,?)",[$id,$ruleId,$actor,json_encode(['scheduleName'=>$name,'weekdays'=>$weekdays,'targetCount'=>$target,'effectiveFrom'=>$from,'effectiveTo'=>$to,'reason'=>$reason])]);$pdo->commit();bbs_phase1_audit($admin,'BBS_INSPECTOR_SCHEDULE_VERSION','BBS_Inspector_Schedule_Rule',(string)$ruleId,'enrollment='.$id.'; target='.$target.'; from='.$from);json_response(['success'=>true,'data'=>['id'=>$ruleId],'message'=>'Inspector schedule version created.'],201);}catch(Throwable$error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
    }

    $override = route_params($path, '/bbs/admin/inspectors/:id/schedule-overrides/:date');
    if ($method === 'PUT' && $override !== null) {
        $admin=require_admin();$id=bbs_phase1_positive_int($override['id']);$date=bbs_phase1_iso_date($override['date'],true);$body=json_body();$type=in_array($body['overrideType']??'', ['Required','Exempt'],true)?$body['overrideType']:null;$target=$type==='Required'?bbs_phase1_positive_int($body['targetCount']??null):null;$reason=bbs_inspector_clean($body['reason']??'');if(!$id||!$date||!$type||($type==='Required'&&(!$target||$target>20))||$reason==='')json_response(['success'=>false,'message'=>'Valid date, override type, target and reason are required.'],400);if($date<bbs_schedule_today())json_response(['success'=>false,'code'=>'HISTORICAL_SCHEDULE_IMMUTABLE','message'=>'Past schedule dates cannot be changed.'],409);$pdo=db();$pdo->beginTransaction();try{$enrollment=bbs_schedule_enrollment($id,true);if(!$enrollment){$pdo->rollBack();json_response(['success'=>false,'message'=>'Inspector enrollment was not found.'],404);}if($date<substr((string)$enrollment['EffectiveFrom'],0,10)||(!empty($enrollment['EffectiveTo'])&&$date>substr((string)$enrollment['EffectiveTo'],0,10))){$pdo->rollBack();json_response(['success'=>false,'message'=>'Override date must stay inside the inspector enrollment period.'],400);}db_execute("INSERT INTO BBS_Inspector_Schedule_Overrides(EnrollmentID,ScheduleDate,OverrideType,TargetCount,Reason,IsActive,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE OverrideType=VALUES(OverrideType),TargetCount=VALUES(TargetCount),Reason=VALUES(Reason),IsActive=1,RowVersion=RowVersion+1,UpdatedBy=VALUES(UpdatedBy)",[$id,$date,$type,$target,$reason,$actor,$actor]);$saved=db_row('SELECT id FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate=?',[$id,$date]);db_execute("INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,OverrideID,EventType,ScheduleDate,ActorEmployeeID,DetailText) VALUES(?,?,'OverrideSaved',?,?,?)",[$id,$saved['id'],$date,$actor,json_encode(['type'=>$type,'targetCount'=>$target,'reason'=>$reason])]);$pdo->commit();bbs_phase1_audit($admin,'BBS_INSPECTOR_SCHEDULE_OVERRIDE','BBS_Inspector_Schedule_Override',(string)$saved['id'],'enrollment='.$id.'; date='.$date.'; type='.$type);json_response(['success'=>true,'data'=>['id'=>(int)$saved['id']],'message'=>'Schedule date override saved.']);}catch(Throwable$error){if($pdo->inTransaction())$pdo->rollBack();throw$error;}
    }

    if ($method === 'DELETE' && $override !== null) {
        $admin=require_admin();$id=bbs_phase1_positive_int($override['id']);$date=bbs_phase1_iso_date($override['date'],true);if(!$id||!$date)json_response(['success'=>false,'message'=>'Valid enrollment and date are required.'],400);if($date<bbs_schedule_today())json_response(['success'=>false,'code'=>'HISTORICAL_SCHEDULE_IMMUTABLE','message'=>'Past schedule dates cannot be changed.'],409);$changed=db_execute('UPDATE BBS_Inspector_Schedule_Overrides SET IsActive=0,RowVersion=RowVersion+1,UpdatedBy=? WHERE EnrollmentID=? AND ScheduleDate=? AND IsActive=1',[$actor,$id,$date]);if(!$changed)json_response(['success'=>false,'message'=>'Active schedule override was not found.'],404);db_execute("INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,EventType,ScheduleDate,ActorEmployeeID,DetailText) VALUES(?,'OverrideRemoved',?,?,?)",[$id,$date,$actor,'Override removed']);bbs_phase1_audit($admin,'BBS_INSPECTOR_SCHEDULE_OVERRIDE_REMOVE','BBS_Inspector_Schedule_Override',$id.':'.$date,'Override removed');json_response(['success'=>true,'message'=>'Schedule date override removed.']);
    }
    return false;
}
