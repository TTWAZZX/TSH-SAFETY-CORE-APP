<?php
declare(strict_types=1);
require_once __DIR__ . '/bbs_list_query.php';

require_once __DIR__ . '/../lib/bbs_observation.php';
require_once __DIR__ . '/../lib/bbs_action.php';

function bbs_observation_is_admin(array $user): bool { return strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0; }
function bbs_observation_today(): string { return (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'); }
function bbs_observation_private_dir(): string { $dir = dirname(__DIR__, 2) . '/backend/private-uploads/bbs'; if (!is_dir($dir)) mkdir($dir, 0750, true); return $dir; }

function bbs_observation_detail(int $id): ?array
{
    $observation = db_row('SELECT o.*,v.VersionNo,t.TemplateCode,t.TemplateName FROM BBS_Observations o JOIN BBS_Checklist_Versions v ON v.id=o.ChecklistVersionID JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID WHERE o.id=? LIMIT 1', [$id]);
    if (!$observation) return null;
    $observation['answers'] = db_rows('SELECT a.*,(SELECT COUNT(*) FROM BBS_Observation_Files f WHERE f.AnswerID=a.id) EvidenceCount FROM BBS_Observation_Answers a WHERE a.ObservationID=? ORDER BY a.SortOrder,a.id', [$id]);
    $observation['files'] = db_rows('SELECT id,ObservationID,AnswerID,OriginalName,MimeType,FileSize,CreatedAt FROM BBS_Observation_Files WHERE ObservationID=? ORDER BY id', [$id]);
    return $observation;
}

function bbs_observation_can_observe(array $user, array $observed, string $asOf): bool
{
    if (bbs_observation_is_admin($user)) return true;
    $observer = bbs_phase1_employee_context((string) $user['id'], $asOf);
    if (!$observer || ($observer['Eligibility'] ?? '') !== 'active' || bbs_phase1_level_rank($observer['BBSLevel'] ?? null) < bbs_phase1_level_rank('Group Leader')) return false;
    if (!db_row("SELECT id FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND DepartmentID=? AND SafetyUnitID=? AND Status='Active' AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [(string)$user['id'],$observer['DepartmentID'],$observer['SafetyUnitID'],$asOf,$asOf])) return false;
    if (!db_row("SELECT id FROM BBS_Pilot_Scopes WHERE DepartmentID=? AND SafetyUnitID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [$observer['DepartmentID'], $observer['SafetyUnitID'], $asOf, $asOf])) return false;
    return (bool) db_row("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [(string) $user['id'], $observed['EmployeeID'], $asOf, $asOf]);
}

function bbs_observation_can_read(array $user, array $observation): bool
{
    if (bbs_observation_is_admin($user)) return true;
    $id = (string) $user['id'];
    if ($id === (string) $observation['ObserverEmployeeID'] || $id === (string) $observation['ObservedEmployeeID']) return true;
    $date = substr((string) $observation['ObservationDate'], 0, 10);
    return (bool) db_row("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND DepartmentID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [$id, $observation['ObservedEmployeeID'], $observation['ObservedDepartmentID'], $date, $date]);
}

function bbs_observation_resolve(array $observed, string $asOf): array
{
    $candidates = db_rows("SELECT s.*,v.id VersionID,v.VersionNo,v.EffectiveFrom,v.EffectiveTo,t.id TemplateID,t.TemplateCode,t.TemplateName FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published' JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1 WHERE s.IsActive=1 AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?", [$asOf, $asOf]);
    return bbs_checklist_resolve_candidates($candidates, ['departmentId' => $observed['DepartmentID'], 'safetyUnitId' => $observed['SafetyUnitID'], 'positionId' => $observed['PositionID'], 'bbsLevel' => $observed['BBSLevel']]);
}

function bbs_batch_enabled(): bool
{
    $row = db_row("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='batch_observation_enabled' LIMIT 1");
    return (string) ($row['SettingValue'] ?? '0') === '1';
}

function bbs_batch_employee_ids($value): ?array
{
    if (!is_array($value)) return null;
    $ids = [];
    foreach ($value as $item) { $id = bbs_observation_clean($item, 20); if ($id !== '' && !in_array($id, $ids, true)) $ids[] = $id; }
    return count($ids) >= 2 && count($ids) <= 50 ? $ids : null;
}

function bbs_batch_normalize_members($value): array
{
    if (!is_array($value) || count($value) < 2 || count($value) > 50) return ['ok'=>false,'message'=>'Batch members must contain 2-50 employees.'];
    $seen = []; $members = [];
    foreach ($value as $entry) {
        $observationId = bbs_phase1_positive_int($entry['observationId'] ?? null);
        $parsed = bbs_observation_normalize_answers($entry['answers'] ?? null);
        if (!$observationId || isset($seen[$observationId]) || empty($parsed['ok'])) return ['ok'=>false,'message'=>$parsed['message'] ?? 'Each batch member must have a unique observationId.'];
        $seen[$observationId] = true;
        $members[] = ['observationId'=>$observationId,'rowVersion'=>array_key_exists('rowVersion',$entry)?(int)$entry['rowVersion']:null,'generalRemark'=>bbs_observation_clean($entry['generalRemark']??''),'answers'=>$parsed['answers']];
    }
    return ['ok'=>true,'members'=>$members];
}

function bbs_batch_detail(int $id): ?array
{
    $batch = db_row('SELECT * FROM BBS_Observation_Batches WHERE id=? LIMIT 1', [$id]);
    if (!$batch) return null;
    $rows = db_rows('SELECT * FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY ChecklistVersionID,SortOrder,id', [$id]);
    $members = []; $groups = [];
    foreach ($rows as $row) {
        $row['observation'] = bbs_observation_detail((int)$row['ObservationID']); $members[] = $row;
        $versionId = (int)$row['ChecklistVersionID'];
        if (!isset($groups[$versionId])) $groups[$versionId] = ['checklistVersionId'=>$versionId,'templateName'=>$row['observation']['TemplateName']??'','versionNo'=>(int)($row['observation']['VersionNo']??0),'members'=>[]];
        $groups[$versionId]['members'][] = $row;
    }
    $batch['members'] = $members; $batch['groups'] = array_values($groups); return $batch;
}

function bbs_batch_resolve_employees(array $user, array $employeeIds, string $date): array
{
    $observer = bbs_phase1_employee_context((string)$user['id'], $date);
    if (!$observer) return ['ok'=>false,'status'=>404,'message'=>'Observer is not available in Employee Master.'];
    $employees = [];
    foreach ($employeeIds as $employeeId) {
        if (strcasecmp($employeeId,(string)$user['id'])===0) return ['ok'=>false,'status'=>400,'message'=>'Self-observation is not allowed.'];
        $observed = bbs_phase1_employee_context($employeeId,$date);
        if (!$observed) return ['ok'=>false,'status'=>404,'message'=>"Employee $employeeId is not available in Employee Master."];
        if (!bbs_observation_can_observe($user,$observed,$date)) return ['ok'=>false,'status'=>403,'code'=>'OBSERVATION_SCOPE_DENIED','message'=>"Employee $employeeId is outside your active assignment scope."];
        $resolved = bbs_observation_resolve($observed,$date);
        if (empty($resolved['ok'])) return array_merge(['ok'=>false,'status'=>(($resolved['code']??'')==='CHECKLIST_CONFLICT'?409:404),'employeeId'=>$employeeId],$resolved);
        $versionId=(int)$resolved['selected']['VersionID'];
        $items=db_rows('SELECT i.*,c.CategoryName,c.SortOrder CategorySort FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=? ORDER BY c.SortOrder,c.id,i.SortOrder,i.id',[$versionId]);
        if (!$items) return ['ok'=>false,'status'=>409,'message'=>"Resolved checklist for $employeeId has no items."];
        $employees[]=['observed'=>$observed,'resolved'=>$resolved,'versionId'=>$versionId,'items'=>$items];
    }
    return ['ok'=>true,'observer'=>$observer,'employees'=>$employees];
}

function bbs_batch_apply_answers(PDO $pdo, array $batch, array $parsed): array
{
    $members=db_rows('SELECT * FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY id FOR UPDATE',[(int)$batch['id']]);$owned=[];
    foreach($members as $member)$owned[(int)$member['ObservationID']]=$member;
    if(count($parsed['members'])!==count($members))return ['ok'=>false,'status'=>400,'message'=>'Batch payload must contain every selected employee exactly once.'];
    foreach($parsed['members'] as $entry){
        $observationId=(int)$entry['observationId'];if(!isset($owned[$observationId]))return ['ok'=>false,'status'=>400,'message'=>'Batch payload must contain every selected employee exactly once.'];
        $observation=db_row('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE',[$observationId]);
        if(!$observation||$observation['Status']!=='Draft')return ['ok'=>false,'status'=>409,'code'=>'IMMUTABLE_OBSERVATION','message'=>'A batch member is no longer editable.'];
        if($entry['rowVersion']!==null&&(int)$entry['rowVersion']!==(int)$observation['RowVersion'])return ['ok'=>false,'status'=>409,'code'=>'VERSION_CONFLICT','message'=>'A batch member changed in another session. Reload before saving.'];
        $answerIds=array_flip(array_map(static fn($row)=>(int)$row['id'],db_rows('SELECT id FROM BBS_Observation_Answers WHERE ObservationID=?',[$observationId])));
        foreach($entry['answers'] as $answer){if(!isset($answerIds[(int)$answer['answerId']]))return ['ok'=>false,'status'=>400,'message'=>'An answer does not belong to its batch member.'];$stmt=$pdo->prepare('UPDATE BBS_Observation_Answers SET Response=?,Remark=?,ImmediateAction=? WHERE id=? AND ObservationID=?');$stmt->execute([$answer['response'],$answer['remark']?:null,$answer['immediateAction']?:null,$answer['answerId'],$observationId]);}
        $stmt=$pdo->prepare('UPDATE BBS_Observations SET GeneralRemark=?,RowVersion=RowVersion+1 WHERE id=?');$stmt->execute([$entry['generalRemark']?:null,$observationId]);
    }
    return ['ok'=>true,'memberRows'=>$members];
}

function handle_bbs_observation_routes(string $method, string $path): bool
{
    if (strpos($path, '/bbs/') !== 0) return false;
    $isObservationRoute = $path === '/bbs/workspace' || $path === '/bbs/observations' || strpos($path, '/bbs/observations/') === 0 || strpos($path, '/bbs/batch-observations') === 0;
    if (!$isObservationRoute) return false;
    $user = require_user(); $actorId = (string) $user['id'];

    // Preflight keeps PHP idempotency behavior in parity with Node and limits
    // the request key so the existing per-member derived keys remain unique.
    if ($method === 'POST' && $path === '/bbs/batch-observations/draft') {
        $preflightBody = json_body();
        $preflightIds = bbs_batch_employee_ids($preflightBody['observedEmployeeIds'] ?? null);
        $preflightDate = bbs_phase1_iso_date($preflightBody['observationDate'] ?? bbs_observation_today(), true);
        $preflightKey = bbs_observation_clean($preflightBody['idempotencyKey'] ?? '', 80);
        if (!$preflightIds || !$preflightDate || !preg_match('/^[A-Za-z0-9._:-]{8,55}$/', $preflightKey)) json_response(['success'=>false,'message'=>'Select 2-50 employees, a valid date, and an idempotency key.'],400);
        $preflightExisting = db_row('SELECT id,ObservationDate FROM BBS_Observation_Batches WHERE ObserverEmployeeID=? AND IdempotencyKey=? LIMIT 1', [$actorId,$preflightKey]);
        if ($preflightExisting) {
            $prior = array_map(static fn($row): string => strtolower((string)$row['ObservedEmployeeID']), db_rows('SELECT ObservedEmployeeID FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY ObservedEmployeeID', [(int)$preflightExisting['id']]));
            $requested = array_map('strtolower', $preflightIds); sort($requested);
            if (substr((string)$preflightExisting['ObservationDate'],0,10) !== $preflightDate || $prior !== $requested) json_response(['success'=>false,'code'=>'IDEMPOTENCY_CONFLICT','message'=>'This request key is already used for another batch selection.'],409);
        }
    }

    if ($method === 'POST' && $path === '/bbs/batch-observations/preview') {
        if(!bbs_batch_enabled())json_response(['success'=>false,'code'=>'BATCH_OBSERVATION_DISABLED','message'=>'Batch observation is currently disabled.'],503);
        $body=json_body();$ids=bbs_batch_employee_ids($body['observedEmployeeIds']??null);$date=bbs_phase1_iso_date($body['observationDate']??bbs_observation_today(),true);
        if(!$ids||!$date)json_response(['success'=>false,'message'=>'Select 2-50 unique employees and a valid observation date.'],400);
        $result=bbs_batch_resolve_employees($user,$ids,$date);if(empty($result['ok']))json_response(array_merge(['success'=>false],$result),(int)$result['status']);$groups=[];
        foreach($result['employees'] as $item){$versionId=(int)$item['versionId'];if(!isset($groups[$versionId]))$groups[$versionId]=['checklistVersionId'=>$versionId,'templateName'=>$item['resolved']['selected']['TemplateName'],'versionNo'=>(int)$item['resolved']['selected']['VersionNo'],'employees'=>[],'items'=>$item['items']];$groups[$versionId]['employees'][]=$item['observed'];}
        json_response(['success'=>true,'data'=>['observationDate'=>$date,'employeeCount'=>count($ids),'groupCount'=>count($groups),'groups'=>array_values($groups)]]);
    }

    if($method==='GET'&&$path==='/bbs/batch-observations/draft/active'){
        if(!bbs_batch_enabled())json_response(['success'=>true,'data'=>null]);$row=db_row("SELECT id FROM BBS_Observation_Batches WHERE ObserverEmployeeID=? AND Status='Draft' ORDER BY UpdatedAt DESC,id DESC LIMIT 1",[$actorId]);json_response(['success'=>true,'data'=>$row?bbs_batch_detail((int)$row['id']):null]);
    }

    if($method==='POST'&&$path==='/bbs/batch-observations/draft'){
        $body=json_body();$ids=bbs_batch_employee_ids($body['observedEmployeeIds']??null);$date=bbs_phase1_iso_date($body['observationDate']??bbs_observation_today(),true);$key=bbs_observation_clean($body['idempotencyKey']??'',80);
        if(!$ids||!$date||!preg_match('/^[A-Za-z0-9._:-]{8,80}$/',$key))json_response(['success'=>false,'message'=>'Select 2-50 employees, a valid date, and an idempotency key.'],400);
        $pdo=db();$pdo->beginTransaction();try{
            if(!bbs_batch_enabled()){$pdo->rollBack();json_response(['success'=>false,'code'=>'BATCH_OBSERVATION_DISABLED','message'=>'Batch observation is currently disabled.'],503);}
            $existing=db_row('SELECT id FROM BBS_Observation_Batches WHERE ObserverEmployeeID=? AND IdempotencyKey=? FOR UPDATE',[$actorId,$key]);if($existing){$pdo->commit();json_response(['success'=>true,'reused'=>true,'data'=>bbs_batch_detail((int)$existing['id'])]);}
            $result=bbs_batch_resolve_employees($user,$ids,$date);if(empty($result['ok'])){$pdo->rollBack();json_response(array_merge(['success'=>false],$result),(int)$result['status']);}$versions=[];foreach($result['employees'] as $item)$versions[(int)$item['versionId']]=true;
            $batchNo='BBS-BATCH-'.str_replace('-','',$date).'-'.strtoupper(bin2hex(random_bytes(5)));$stmt=$pdo->prepare("INSERT INTO BBS_Observation_Batches(BatchNo,ObserverEmployeeID,ObservationDate,Status,IdempotencyKey,EmployeeCount,ChecklistGroupCount) VALUES(?,?,?,'Draft',?,?,?)");$stmt->execute([$batchNo,$actorId,$date,$key,count($ids),count($versions)]);$batchId=(int)$pdo->lastInsertId();$memberSort=0;
            foreach($result['employees'] as $item){$memberSort++;$observed=$item['observed'];$no='BBS-'.str_replace('-','',$date).'-'.strtoupper(bin2hex(random_bytes(5)));$observationKey=bbs_observation_clean($key.':'.$observed['EmployeeID'],80);$stmt=$pdo->prepare("INSERT INTO BBS_Observations(ObservationNo,ObserverEmployeeID,ObservedEmployeeID,ChecklistVersionID,Status,ObservationDate,ObservedAt,ResolutionReason,ObserverNameSnapshot,ObserverDepartmentSnapshot,ObserverUnitSnapshot,ObserverPositionSnapshot,ObservedNameSnapshot,ObservedDepartmentSnapshot,ObservedUnitSnapshot,ObservedPositionSnapshot,ObservedDepartmentID,ObservedSafetyUnitID,ObservedPositionID,ObservedBBSLevel,IdempotencyKey) VALUES(?,?,?,?,'Draft',?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)");$observer=$result['observer'];$stmt->execute([$no,$observer['EmployeeID'],$observed['EmployeeID'],$item['versionId'],$date,$item['resolved']['reason'],$observer['EmployeeName'],$observer['Department'],$observer['Unit'],$observer['Position'],$observed['EmployeeName'],$observed['Department'],$observed['Unit'],$observed['Position'],$observed['DepartmentID'],$observed['SafetyUnitID'],$observed['PositionID'],$observed['BBSLevel'],$observationKey]);$observationId=(int)$pdo->lastInsertId();$sort=0;$answerStmt=$pdo->prepare('INSERT INTO BBS_Observation_Answers(ObservationID,ChecklistItemID,CategoryNameSnapshot,ItemCodeSnapshot,ItemPromptSnapshot,IsRequiredSnapshot,UnsafeRequiresRemarkSnapshot,UnsafeRequiresPhotoSnapshot,UnsafeRequiresActionSnapshot,SortOrder) VALUES(?,?,?,?,?,?,?,?,?,?)');foreach($item['items'] as $checklistItem){$sort++;$answerStmt->execute([$observationId,$checklistItem['id'],$checklistItem['CategoryName'],$checklistItem['ItemCode'],$checklistItem['ItemPrompt'],$checklistItem['IsRequired'],$checklistItem['UnsafeRequiresRemark'],$checklistItem['UnsafeRequiresPhoto'],$checklistItem['UnsafeRequiresAction'],$sort]);}$stmt=$pdo->prepare("INSERT INTO BBS_Observation_Batch_Members(BatchID,ObservationID,ObservedEmployeeID,ChecklistVersionID,ResolutionReason,SortOrder,Status) VALUES(?,?,?,?,?,?,'Draft')");$stmt->execute([$batchId,$observationId,$observed['EmployeeID'],$item['versionId'],$item['resolved']['reason'],$memberSort]);}
            $pdo->commit();bbs_phase1_audit($user,'BBS_BATCH_DRAFT_CREATE','BBS_Observation_Batch',(string)$batchId,'employees='.count($ids).'; groups='.count($versions));json_response(['success'=>true,'reused'=>false,'data'=>bbs_batch_detail($batchId)],201);
        }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();if($error instanceof PDOException&&(string)$error->getCode()==='23000')json_response(['success'=>false,'code'=>'DUPLICATE_BATCH_REQUEST','message'=>'This batch request already exists.'],409);throw $error;}
    }

    $batchSave=route_params($path,'/bbs/batch-observations/:id/draft');
    if($method==='PUT'&&$batchSave!==null&&!bbs_batch_enabled())json_response(['success'=>false,'code'=>'BATCH_OBSERVATION_DISABLED','message'=>'Batch observation is currently disabled.'],503);
    if($method==='PUT'&&$batchSave!==null){$id=bbs_phase1_positive_int($batchSave['id']);$body=json_body();$parsed=bbs_batch_normalize_members($body['members']??null);if(!$id||empty($parsed['ok']))json_response(['success'=>false,'message'=>$parsed['message']??'Invalid batch ID.'],400);$pdo=db();$pdo->beginTransaction();try{$batch=db_row('SELECT * FROM BBS_Observation_Batches WHERE id=? FOR UPDATE',[$id]);if(!$batch){$pdo->rollBack();json_response(['success'=>false,'message'=>'Batch was not found.'],404);}if(!bbs_observation_is_admin($user)&&(string)$batch['ObserverEmployeeID']!==$actorId){$pdo->rollBack();json_response(['success'=>false,'message'=>'Only the observer can edit this batch.'],403);}if($batch['Status']!=='Draft'){$pdo->rollBack();json_response(['success'=>false,'code'=>'IMMUTABLE_BATCH','message'=>'Submitted batches cannot be edited.'],409);}if(isset($body['rowVersion'])&&(int)$body['rowVersion']!==(int)$batch['RowVersion']){$pdo->rollBack();json_response(['success'=>false,'code'=>'VERSION_CONFLICT','message'=>'This batch changed in another session. Reload before saving.'],409);}$applied=bbs_batch_apply_answers($pdo,$batch,$parsed);if(empty($applied['ok'])){$pdo->rollBack();json_response(array_merge(['success'=>false],$applied),(int)$applied['status']);}$payload=json_encode(['step'=>max(1,min(4,(int)($body['step']??1)))],JSON_UNESCAPED_UNICODE);$stmt=$pdo->prepare('UPDATE BBS_Observation_Batches SET GeneralRemark=?,DraftPayload=?,RowVersion=RowVersion+1 WHERE id=?');$stmt->execute([bbs_observation_clean($body['generalRemark']??'')?:null,$payload,$id]);$pdo->commit();json_response(['success'=>true,'data'=>bbs_batch_detail($id),'message'=>'Batch draft saved.']);}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}}

    $batchSubmit=route_params($path,'/bbs/batch-observations/:id/submit');
    if($method==='POST'&&$batchSubmit!==null&&!bbs_batch_enabled())json_response(['success'=>false,'code'=>'BATCH_OBSERVATION_DISABLED','message'=>'Batch observation is currently disabled.'],503);
    if($method==='POST'&&$batchSubmit!==null){$id=bbs_phase1_positive_int($batchSubmit['id']);$body=json_body();$parsed=bbs_batch_normalize_members($body['members']??null);if(!$id||empty($parsed['ok']))json_response(['success'=>false,'message'=>$parsed['message']??'Invalid batch ID.'],400);$pdo=db();$pdo->beginTransaction();try{$batch=db_row('SELECT * FROM BBS_Observation_Batches WHERE id=? FOR UPDATE',[$id]);if(!$batch){$pdo->rollBack();json_response(['success'=>false,'message'=>'Batch was not found.'],404);}if(!bbs_observation_is_admin($user)&&(string)$batch['ObserverEmployeeID']!==$actorId){$pdo->rollBack();json_response(['success'=>false,'message'=>'Only the observer can submit this batch.'],403);}if($batch['Status']==='Submitted'){$pdo->commit();json_response(['success'=>true,'reused'=>true,'data'=>bbs_batch_detail($id),'message'=>'Batch was already submitted.']);}if($batch['Status']!=='Draft'){$pdo->rollBack();json_response(['success'=>false,'code'=>'IMMUTABLE_BATCH','message'=>'Batch is not in Draft status.'],409);}if(isset($body['rowVersion'])&&(int)$body['rowVersion']!==(int)$batch['RowVersion']){$pdo->rollBack();json_response(['success'=>false,'code'=>'VERSION_CONFLICT','message'=>'This batch changed in another session. Reload before submitting.'],409);}$applied=bbs_batch_apply_answers($pdo,$batch,$parsed);if(empty($applied['ok'])){$pdo->rollBack();json_response(array_merge(['success'=>false],$applied),(int)$applied['status']);}$actionCount=0;foreach($applied['memberRows'] as $member){$observation=db_row('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE',[$member['ObservationID']]);$answers=db_rows('SELECT a.*,(SELECT COUNT(*) FROM BBS_Observation_Files f WHERE f.AnswerID=a.id) EvidenceCount FROM BBS_Observation_Answers a WHERE a.ObservationID=? ORDER BY a.SortOrder',[$member['ObservationID']]);$validation=bbs_observation_validate_submission($answers);if(empty($validation['ok'])){$pdo->rollBack();json_response(array_merge(['success'=>false,'observedEmployeeId'=>$member['ObservedEmployeeID']],$validation),400);}$stmt=$pdo->prepare("UPDATE BBS_Observations SET Status='Submitted',SubmittedAt=NOW(),RowVersion=RowVersion+1 WHERE id=?");$stmt->execute([$member['ObservationID']]);$actionCount+=count(bbs_action_create_for_observation($pdo,$observation,$answers,$actorId));}$pdo->prepare("UPDATE BBS_Observation_Batch_Members SET Status='Submitted' WHERE BatchID=?")->execute([$id]);$pdo->prepare("UPDATE BBS_Observation_Batches SET Status='Submitted',GeneralRemark=?,SubmittedAt=NOW(),DraftPayload=NULL,RowVersion=RowVersion+1 WHERE id=?")->execute([bbs_observation_clean($body['generalRemark']??'')?:null,$id]);$pdo->commit();bbs_phase1_audit($user,'BBS_BATCH_SUBMIT','BBS_Observation_Batch',(string)$id,'employees='.$batch['EmployeeCount'].'; actions='.$actionCount);json_response(['success'=>true,'reused'=>false,'actionCount'=>$actionCount,'data'=>bbs_batch_detail($id),'message'=>'Batch submitted atomically.']);}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}}

    $batchDetail=route_params($path,'/bbs/batch-observations/:id');
    if($method==='GET'&&$batchDetail!==null&&!bbs_batch_enabled())json_response(['success'=>false,'code'=>'BATCH_OBSERVATION_DISABLED','message'=>'Batch observation is currently disabled.'],503);
    if($method==='GET'&&$batchDetail!==null){$id=bbs_phase1_positive_int($batchDetail['id']);$batch=$id?bbs_batch_detail($id):null;if(!$batch)json_response(['success'=>false,'message'=>'Batch was not found.'],404);if(!bbs_observation_is_admin($user)&&(string)$batch['ObserverEmployeeID']!==$actorId)json_response(['success'=>false,'message'=>'Batch detail is visible only to its observer.'],403);json_response(['success'=>true,'data'=>$batch]);}

    if ($method === 'GET' && $path === '/bbs/workspace') {
        $today = bbs_observation_today(); $year = max(2000, min(2100, (int) ($_GET['year'] ?? substr($today, 0, 4)))); $month = max(1, min(12, (int) ($_GET['month'] ?? substr($today, 5, 2))));
        $observer = bbs_phase1_employee_context($actorId, $today); if (!$observer) json_response(['success' => false, 'message' => 'Employee is not available in Employee Master.'], 404);
        $from = sprintf('%04d-%02d-01', $year, $month); $to = (new DateTimeImmutable($from, new DateTimeZone('Asia/Bangkok')))->modify('+1 month')->format('Y-m-d');
        $metric = db_row("SELECT COUNT(DISTINCT o.id) SubmittedCount,COUNT(DISTINCT o.ObservedEmployeeID) UniqueObserved,COALESCE(SUM(a.Response='Safe'),0) SafeCount,COALESCE(SUM(a.Response='Unsafe'),0) UnsafeCount FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE o.ObserverEmployeeID=? AND o.Status='Submitted' AND o.ObservationDate>=? AND o.ObservationDate<?", [$actorId, $from, $to]) ?: [];
        $nowYear = (int) substr($today, 0, 4); $nowMonth = (int) substr($today, 5, 2); $through = ($year < $nowYear || ($year === $nowYear && $month < $nowMonth)) ? null : (($year === $nowYear && $month === $nowMonth) ? (int) substr($today, 8, 2) : 0);
        $rule = !empty($observer['BBSLevel']) ? db_row("SELECT TargetCount,Weekdays FROM BBS_KPI_Rules WHERE BBSLevel=? AND MetricKey='submitted_observation' AND IsActive=1 ORDER BY id LIMIT 1", [$observer['BBSLevel']]) : null;
        $enrollment=db_row("SELECT id EnrollmentID,InspectorEmployeeID,KpiRequired,EffectiveFrom EnrollmentFrom,EffectiveTo EnrollmentTo FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND Status='Active' AND IsActive=1 AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EffectiveFrom DESC,id DESC LIMIT 1",[$actorId,$to,$from]);$throughDate=$through===null?(new DateTimeImmutable($from,new DateTimeZone('UTC')))->modify('last day of this month')->format('Y-m-d'):($through>0?sprintf('%04d-%02d-%02d',$year,$month,$through):'0000-00-00');
        $dailyActual=db_rows("SELECT ObserverEmployeeID,ObservationDate,COUNT(*) ActualCount FROM BBS_Observations WHERE ObserverEmployeeID=? AND Status='Submitted' AND ObservationDate>=? AND ObservationDate<? GROUP BY ObservationDate",[$actorId,$from,$to]);$compliance=['summary'=>['numerator'=>0,'denominator'=>0,'percentage'=>0]];
        if($enrollment&&(int)$enrollment['KpiRequired']===1){$rules=db_rows("SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? AND Status='Active' AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=?",[$enrollment['EnrollmentID'],$to,$from]);$overrides=db_rows("SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1",[$enrollment['EnrollmentID'],$from,$to]);$enrollment['TargetCount']=(int)($rule['TargetCount']??1);$enrollment['Weekdays']=(string)($rule['Weekdays']??'1,2,3,4,5');$compliance=bbs_schedule_compliance([$enrollment],$rules,$overrides,$dailyActual,['start'=>$from,'end'=>$to,'today'=>$throughDate]);}$numerator=(int)$compliance['summary']['numerator'];$target=(int)$compliance['summary']['denominator'];$semanticStatus=$enrollment&&(int)$enrollment['KpiRequired']===1?($compliance['summary']['kpiStatus']??bbs_schedule_kpi_status(['configured'=>true,'applicable'=>false])):bbs_schedule_kpi_status(['configured'=>(bool)$enrollment,'applicable'=>false]);
        $team = db_rows("SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,COUNT(o.id) SubmittedCount,MAX(o.SubmittedAt) LastObservedAt FROM BBS_Hierarchy_Assignments h JOIN employees e ON e.EmployeeID=h.MemberEmployeeID LEFT JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 LEFT JOIN BBS_Observations o ON o.ObservedEmployeeID=e.EmployeeID AND o.ObserverEmployeeID=? AND o.Status='Submitted' AND o.ObservationDate>=? AND o.ObservationDate<? WHERE h.SupervisorEmployeeID=? AND h.IsActive=1 AND h.EffectiveFrom<=? AND COALESCE(h.EffectiveTo,'9999-12-31')>=? GROUP BY e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel ORDER BY e.EmployeeName", [$actorId, $from, $to, $actorId, $today, $today]);
        $recent = db_rows('SELECT id,ObservationNo,ObservedEmployeeID,ObservedNameSnapshot,Status,ObservationDate,SubmittedAt FROM BBS_Observations WHERE ObserverEmployeeID=? ORDER BY CreatedAt DESC LIMIT 8', [$actorId]);
        json_response(['success' => true, 'data' => ['observer' => $observer, 'period' => compact('year', 'month', 'from', 'to'), 'kpi' => ['numerator' => $numerator, 'denominator' => $target, 'percentage' => $semanticStatus['percentage'], 'status'=>$semanticStatus, 'formula' => 'Capped submitted observations / effective inspector schedule target (Asia/Bangkok)', 'enrolled'=>(bool)$enrollment, 'kpiRequired'=>(bool)((int)($enrollment['KpiRequired']??0)), 'uniqueObserved' => (int) ($metric['UniqueObserved'] ?? 0), 'safe' => (int) ($metric['SafeCount'] ?? 0), 'unsafe' => (int) ($metric['UnsafeCount'] ?? 0)], 'team' => $team, 'recent' => $recent]]);
    }

    if ($method === 'POST' && $path === '/bbs/observations/draft') {
        $body = json_body(); $observedId = bbs_observation_clean($body['observedEmployeeId'] ?? '', 20); $date = bbs_phase1_iso_date($body['observationDate'] ?? bbs_observation_today(), true); $key = bbs_observation_clean($body['idempotencyKey'] ?? '', 80);
        if ($observedId === '' || !$date || !preg_match('/^[A-Za-z0-9._:-]{8,80}$/', $key)) json_response(['success' => false, 'message' => 'Observed employee, valid date, and idempotency key are required.'], 400);
        if (strcasecmp($observedId, $actorId) === 0) json_response(['success' => false, 'message' => 'Self-observation is not allowed.'], 400);
        $pdo = db(); $pdo->beginTransaction();
        try {
            $existing = db_row('SELECT id,ObservedEmployeeID FROM BBS_Observations WHERE ObserverEmployeeID=? AND IdempotencyKey=? LIMIT 1 FOR UPDATE', [$actorId, $key]);
            if ($existing) { $pdo->commit(); if (strcasecmp((string) $existing['ObservedEmployeeID'], $observedId) !== 0) json_response(['success' => false, 'code' => 'IDEMPOTENCY_CONFLICT', 'message' => 'This request key is already used for another employee.'], 409); json_response(['success' => true, 'reused' => true, 'data' => bbs_observation_detail((int) $existing['id'])]); }
            $observer = bbs_phase1_employee_context($actorId, $date); $observed = bbs_phase1_employee_context($observedId, $date);
            if (!$observer || !$observed) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Observer or observed employee is not available in Employee Master.'], 404); }
            if (!bbs_observation_can_observe($user, $observed, $date)) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'OBSERVATION_SCOPE_DENIED', 'message' => 'Employee is outside your active BBS pilot assignment scope.'], 403); }
            $resolved = bbs_observation_resolve($observed, $date); if (empty($resolved['ok'])) { $pdo->rollBack(); json_response(array_merge(['success' => false], $resolved), ($resolved['code'] ?? '') === 'CHECKLIST_CONFLICT' ? 409 : 404); }
            $versionId = (int) $resolved['selected']['VersionID']; $items = db_rows('SELECT i.*,c.CategoryName,c.SortOrder CategorySort FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=? ORDER BY c.SortOrder,c.id,i.SortOrder,i.id', [$versionId]);
            if (!$items) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Resolved checklist has no items.'], 409); }
            $no = 'BBS-' . str_replace('-', '', $date) . '-' . strtoupper(bin2hex(random_bytes(5)));
            $stmt = $pdo->prepare("INSERT INTO BBS_Observations(ObservationNo,ObserverEmployeeID,ObservedEmployeeID,ChecklistVersionID,Status,ObservationDate,ObservedAt,ResolutionReason,ObserverNameSnapshot,ObserverDepartmentSnapshot,ObserverUnitSnapshot,ObserverPositionSnapshot,ObservedNameSnapshot,ObservedDepartmentSnapshot,ObservedUnitSnapshot,ObservedPositionSnapshot,ObservedDepartmentID,ObservedSafetyUnitID,ObservedPositionID,ObservedBBSLevel,IdempotencyKey) VALUES(?,?,?,?,'Draft',?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([$no,$observer['EmployeeID'],$observed['EmployeeID'],$versionId,$date,$resolved['reason'],$observer['EmployeeName'],$observer['Department'],$observer['Unit'],$observer['Position'],$observed['EmployeeName'],$observed['Department'],$observed['Unit'],$observed['Position'],$observed['DepartmentID'],$observed['SafetyUnitID'],$observed['PositionID'],$observed['BBSLevel'],$key]); $id = (int) $pdo->lastInsertId(); $sort = 0;
            $stmt = $pdo->prepare('INSERT INTO BBS_Observation_Answers(ObservationID,ChecklistItemID,CategoryNameSnapshot,ItemCodeSnapshot,ItemPromptSnapshot,IsRequiredSnapshot,UnsafeRequiresRemarkSnapshot,UnsafeRequiresPhotoSnapshot,UnsafeRequiresActionSnapshot,SortOrder) VALUES(?,?,?,?,?,?,?,?,?,?)');
            foreach ($items as $item) { $sort++; $stmt->execute([$id,$item['id'],$item['CategoryName'],$item['ItemCode'],$item['ItemPrompt'],$item['IsRequired'],$item['UnsafeRequiresRemark'],$item['UnsafeRequiresPhoto'],$item['UnsafeRequiresAction'],$sort]); }
            $pdo->commit(); bbs_phase1_audit($user, 'BBS_OBSERVATION_DRAFT_CREATE', 'BBS_Observation', (string) $id, 'observed=' . $observedId . '; checklistVersion=' . $versionId); json_response(['success' => true, 'reused' => false, 'data' => bbs_observation_detail($id)], 201);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); if (($error instanceof PDOException) && (string) $error->getCode() === '23000') json_response(['success' => false, 'code' => 'DUPLICATE_OBSERVATION_REQUEST', 'message' => 'The observation request was already created.'], 409); throw $error; }
    }

    $save = route_params($path, '/bbs/observations/:id');
    if ($method === 'PUT' && $save !== null) {
        $id = bbs_phase1_positive_int($save['id']); $body = json_body(); $parsed = bbs_observation_normalize_answers($body['answers'] ?? null); if (!$id || empty($parsed['ok'])) json_response(['success' => false, 'message' => $parsed['message'] ?? 'Invalid observation ID.'], 400);
        $pdo = db(); $pdo->beginTransaction(); try { $observation = db_row('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE', [$id]); if (!$observation) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Observation was not found.'], 404); } if (!bbs_observation_is_admin($user) && (string) $observation['ObserverEmployeeID'] !== $actorId) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Only the observer can edit this draft.'], 403); } if ($observation['Status'] !== 'Draft') { $pdo->rollBack(); json_response(['success' => false, 'code' => 'IMMUTABLE_OBSERVATION', 'message' => 'Submitted observations cannot be edited.'], 409); } if (isset($body['rowVersion']) && (int) $body['rowVersion'] !== (int) $observation['RowVersion']) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'VERSION_CONFLICT', 'message' => 'This draft changed in another session. Reload before saving.'], 409); } $owned = array_flip(array_map(static fn($row) => (int) $row['id'], db_rows('SELECT id FROM BBS_Observation_Answers WHERE ObservationID=?', [$id]))); foreach ($parsed['answers'] as $answer) { if (!isset($owned[$answer['answerId']])) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'An answer does not belong to this observation.'], 400); } db_execute('UPDATE BBS_Observation_Answers SET Response=?,Remark=?,ImmediateAction=? WHERE id=? AND ObservationID=?', [$answer['response'],$answer['remark'] ?: null,$answer['immediateAction'] ?: null,$answer['answerId'],$id]); } db_execute('UPDATE BBS_Observations SET GeneralRemark=?,RowVersion=RowVersion+1 WHERE id=?', [bbs_observation_clean($body['generalRemark'] ?? '') ?: null,$id]); $pdo->commit(); json_response(['success' => true, 'data' => bbs_observation_detail($id), 'message' => 'Draft saved.']); } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }

    $submit = route_params($path, '/bbs/observations/:id/submit');
    if ($method === 'POST' && $submit !== null) {
        $id = bbs_phase1_positive_int($submit['id']); if (!$id) json_response(['success' => false, 'message' => 'Invalid observation ID.'], 400); $body = json_body(); $pdo = db(); $pdo->beginTransaction();
        try { $observation = db_row('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE', [$id]); if (!$observation) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Observation was not found.'], 404); } if (!bbs_observation_is_admin($user) && (string) $observation['ObserverEmployeeID'] !== $actorId) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Only the observer can submit this observation.'], 403); } if ($observation['Status'] === 'Submitted') { $pdo->commit(); json_response(['success' => true, 'reused' => true, 'data' => bbs_observation_detail($id), 'message' => 'Observation was already submitted.']); } if (isset($body['rowVersion']) && (int) $body['rowVersion'] !== (int) $observation['RowVersion']) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'VERSION_CONFLICT', 'message' => 'This draft changed in another session. Reload before submitting.'], 409); } $answers = db_rows('SELECT a.*,(SELECT COUNT(*) FROM BBS_Observation_Files f WHERE f.AnswerID=a.id) EvidenceCount FROM BBS_Observation_Answers a WHERE a.ObservationID=? ORDER BY a.SortOrder', [$id]); $validation = bbs_observation_validate_submission($answers); if (empty($validation['ok'])) { $pdo->rollBack(); json_response(array_merge(['success' => false], $validation), 400); } db_execute("UPDATE BBS_Observations SET Status='Submitted',SubmittedAt=NOW(),RowVersion=RowVersion+1 WHERE id=?", [$id]); $actions=bbs_action_create_for_observation($pdo,$observation,$answers,$actorId); $pdo->commit(); bbs_phase1_audit($user, 'BBS_OBSERVATION_SUBMIT', 'BBS_Observation', (string) $id, 'observed=' . $observation['ObservedEmployeeID']); json_response(['success' => true, 'reused' => false, 'actionCount'=>count($actions), 'data' => bbs_observation_detail($id), 'message' => 'Observation submitted.']); } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }

    if ($method === 'GET' && $path === '/bbs/observations') {
        $view = in_array($_GET['view'] ?? '', ['observer','observed','team'], true) ? (string) $_GET['view'] : 'observer'; $params = []; $where = '1=1';
        if (!bbs_observation_is_admin($user)) { if ($view === 'observer') { $where .= ' AND o.ObserverEmployeeID=?'; $params[] = $actorId; } elseif ($view === 'observed') { $where .= ' AND o.ObservedEmployeeID=?'; $params[] = $actorId; } else { $where .= " AND EXISTS(SELECT 1 FROM BBS_Hierarchy_Assignments h WHERE h.SupervisorEmployeeID=? AND h.MemberEmployeeID=o.ObservedEmployeeID AND h.DepartmentID=o.ObservedDepartmentID AND h.IsActive=1 AND h.EffectiveFrom<=o.ObservationDate AND COALESCE(h.EffectiveTo,'9999-12-31')>=o.ObservationDate)"; $params[] = $actorId; } }
        if (in_array($_GET['status'] ?? '', ['Draft','Submitted'], true)) { $where .= ' AND o.Status=?'; $params[] = $_GET['status']; } $year = (int) ($_GET['year'] ?? 0); if ($year >= 2000 && $year <= 2100) { $where .= ' AND YEAR(o.ObservationDate)=?'; $params[] = $year; }
        $departmentId=bbs_phase1_positive_int($_GET['departmentId']??null);$unitId=bbs_phase1_positive_int($_GET['safetyUnitId']??null);$q=bbs_list_search($_GET['q']??'');$paging=bbs_list_query($_GET);if($departmentId){$where.=' AND o.ObservedDepartmentID=?';$params[]=$departmentId;}if($unitId){$where.=' AND o.ObservedSafetyUnitID=?';$params[]=$unitId;}if($q!==''){$where.=' AND (o.ObservationNo LIKE ? OR o.ObserverEmployeeID LIKE ? OR o.ObserverNameSnapshot LIKE ? OR o.ObservedEmployeeID LIKE ? OR o.ObservedNameSnapshot LIKE ? OR o.ObservedDepartmentSnapshot LIKE ? OR o.ObservedUnitSnapshot LIKE ?)';for($i=0;$i<7;$i++)$params[]='%'.$q.'%';}
        $select="SELECT o.id,o.ObservationNo,o.ObserverEmployeeID,o.ObserverNameSnapshot,o.ObservedEmployeeID,o.ObservedNameSnapshot,o.ObservedDepartmentID,o.ObservedSafetyUnitID,o.ObservedDepartmentSnapshot,o.ObservedUnitSnapshot,o.Status,o.ObservationDate,o.SubmittedAt,(SELECT COUNT(*) FROM BBS_Observation_Answers a WHERE a.ObservationID=o.id AND a.Response='Safe') SafeCount,(SELECT COUNT(*) FROM BBS_Observation_Answers a WHERE a.ObservationID=o.id AND a.Response='Unsafe') UnsafeCount,(SELECT COUNT(*) FROM BBS_Observation_Answers a WHERE a.ObservationID=o.id AND a.Response='N/A') NACount FROM BBS_Observations o WHERE $where";if(!$paging['paged'])json_response(['success'=>true,'data'=>db_rows($select.' ORDER BY o.ObservationDate DESC,o.id DESC LIMIT 250',$params)]);$count=db_row("SELECT COUNT(*) total FROM BBS_Observations o WHERE $where",$params);$meta=bbs_list_pagination((int)($count['total']??0),$paging['page'],$paging['pageSize']);$rows=db_rows($select.' ORDER BY o.ObservationDate DESC,o.id DESC LIMIT '.(int)$meta['pageSize'].' OFFSET '.(($meta['page']-1)*$meta['pageSize']),$params);json_response(['success'=>true,'data'=>['rows'=>$rows,'pagination'=>$meta]]);
    }

    $evidence = route_params($path, '/bbs/observations/:id/evidence/:fileId');
    if ($evidence !== null && in_array($method, ['GET','DELETE'], true)) {
        $id = bbs_phase1_positive_int($evidence['id']); $fileId = bbs_phase1_positive_int($evidence['fileId']); $observation = $id ? bbs_observation_detail($id) : null; if (!$observation) json_response(['success' => false, 'message' => 'Observation was not found.'], 404); $file = db_row('SELECT * FROM BBS_Observation_Files WHERE id=? AND ObservationID=?', [$fileId,$id]); if (!$file) json_response(['success' => false, 'message' => 'Evidence was not found.'], 404);
        $disk = bbs_observation_private_dir() . '/' . basename((string) $file['StoredName']);
        if ($method === 'GET') { if (!bbs_observation_can_read($user, $observation)) json_response(['success' => false, 'message' => 'Evidence is outside your permitted scope.'], 403); if (!is_file($disk)) json_response(['success' => false, 'message' => 'Evidence file is unavailable.'], 404); header('Content-Type: ' . $file['MimeType']); header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode((string) $file['OriginalName'])); header('Content-Length: ' . filesize($disk)); readfile($disk); exit; }
        if ($observation['Status'] !== 'Draft' || (!bbs_observation_is_admin($user) && (string) $observation['ObserverEmployeeID'] !== $actorId)) json_response(['success' => false, 'message' => 'Evidence can only be removed by the observer while Draft.'], 403); db_execute('DELETE FROM BBS_Observation_Files WHERE id=? AND ObservationID=?', [$fileId,$id]); if (is_file($disk)) @unlink($disk); json_response(['success' => true, 'message' => 'Evidence removed.']);
    }

    $upload = route_params($path, '/bbs/observations/:id/evidence');
    if ($method === 'POST' && $upload !== null) {
        $id = bbs_phase1_positive_int($upload['id']); $answerId = bbs_phase1_positive_int($_POST['answerId'] ?? null); $file = $_FILES['evidence'] ?? null; if (!$id || !$answerId || !$file || (int) $file['error'] !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'A JPEG, PNG, or WebP evidence image and answerId are required.'], 400); if ((int) $file['size'] > 10 * 1024 * 1024) json_response(['success' => false, 'message' => 'Evidence image must not exceed 10 MB.'], 400);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']); $ext = ['image/jpeg'=>'.jpg','image/png'=>'.png','image/webp'=>'.webp'][$mime] ?? null; if (!$ext) json_response(['success' => false, 'message' => 'Evidence must be JPEG, PNG, or WebP.'], 400); $observation = bbs_observation_detail($id); if (!$observation) json_response(['success' => false, 'message' => 'Observation was not found.'], 404); if ($observation['Status'] !== 'Draft' || (!bbs_observation_is_admin($user) && (string) $observation['ObserverEmployeeID'] !== $actorId)) json_response(['success' => false, 'message' => 'Evidence can only be added by the observer while Draft.'], 403); if (!db_row('SELECT id FROM BBS_Observation_Answers WHERE id=? AND ObservationID=?', [$answerId,$id])) json_response(['success' => false, 'message' => 'Answer does not belong to this observation.'], 400);
        $stored = time() . '-' . bin2hex(random_bytes(18)) . $ext; $target = bbs_observation_private_dir() . '/' . $stored; if (!move_uploaded_file((string) $file['tmp_name'], $target)) json_response(['success' => false, 'message' => 'Evidence upload failed.'], 500); try { $pdo = db(); $stmt = $pdo->prepare('INSERT INTO BBS_Observation_Files(ObservationID,AnswerID,StoredName,OriginalName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)'); $original = bbs_observation_clean($file['name'] ?? 'evidence', 255); $stmt->execute([$id,$answerId,$stored,$original,$mime,(int)$file['size'],$actorId]); json_response(['success' => true, 'data' => ['id' => (int)$pdo->lastInsertId(),'answerId'=>$answerId,'originalName'=>$original,'mimeType'=>$mime,'fileSize'=>(int)$file['size']], 'message' => 'Evidence uploaded securely.'], 201); } catch (Throwable $error) { @unlink($target); throw $error; }
    }

    $detail = route_params($path, '/bbs/observations/:id');
    if ($method === 'GET' && $detail !== null) { $id = bbs_phase1_positive_int($detail['id']); $observation = $id ? bbs_observation_detail($id) : null; if (!$observation) json_response(['success' => false, 'message' => 'Observation was not found.'], 404); if (!bbs_observation_can_read($user, $observation)) json_response(['success' => false, 'message' => 'Observation is outside your permitted scope.'], 403); if (bbs_observation_is_admin($user)) bbs_phase1_audit($user, 'BBS_OBSERVATION_DETAIL_VIEW', 'BBS_Observation', (string)$id, 'observed=' . $observation['ObservedEmployeeID']); json_response(['success' => true, 'data' => $observation]); }
    return false;
}
