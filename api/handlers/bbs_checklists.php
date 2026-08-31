<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bbs_phase1.php';
require_once __DIR__ . '/../lib/bbs_checklist.php';

function bbs_checklist_version(int $versionId): ?array
{
    $version = db_row('SELECT v.*,t.TemplateCode,t.TemplateName,t.Description,t.IsActive TemplateIsActive FROM BBS_Checklist_Versions v JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID WHERE v.id=? LIMIT 1', [$versionId]);
    if (!$version) return null;
    $categories = db_rows('SELECT * FROM BBS_Checklist_Categories WHERE VersionID=? ORDER BY SortOrder,id', [$versionId]);
    foreach ($categories as &$category) $category['items'] = db_rows('SELECT * FROM BBS_Checklist_Items WHERE CategoryID=? ORDER BY SortOrder,id', [(int) $category['id']]);
    unset($category);
    $version['categories'] = $categories;
    $version['scopes'] = db_rows('SELECT s.*,d.Name DepartmentName,u.name SafetyUnitName,p.Name PositionName FROM BBS_Checklist_Scope_Mappings s LEFT JOIN master_departments d ON d.id=s.DepartmentID LEFT JOIN master_safetyunits u ON u.id=s.SafetyUnitID LEFT JOIN master_positions p ON p.id=s.PositionID WHERE s.VersionID=? ORDER BY s.Priority DESC,s.id', [$versionId]);
    return $version;
}

function bbs_checklist_validate_masters(array $scopes): ?string
{
    foreach ($scopes as $scope) {
        if ($scope['departmentId'] && !db_row('SELECT id FROM master_departments WHERE id=? LIMIT 1', [$scope['departmentId']])) return 'DepartmentID ' . $scope['departmentId'] . ' was not found.';
        if ($scope['safetyUnitId'] && !db_row('SELECT id FROM master_safetyunits WHERE id=? AND department_id=? LIMIT 1', [$scope['safetyUnitId'], $scope['departmentId']])) return 'SafetyUnitID ' . $scope['safetyUnitId'] . ' does not belong to the selected Department.';
        if ($scope['positionId'] && !db_row('SELECT id FROM master_positions WHERE id=? LIMIT 1', [$scope['positionId']])) return 'PositionID ' . $scope['positionId'] . ' was not found.';
    }
    return null;
}

function bbs_checklist_replace_draft(PDO $pdo, int $versionId, array $validation, string $userId): void
{
    $stmt = $pdo->prepare('DELETE FROM BBS_Checklist_Scope_Mappings WHERE VersionID=?'); $stmt->execute([$versionId]);
    $stmt = $pdo->prepare('DELETE FROM BBS_Checklist_Categories WHERE VersionID=?'); $stmt->execute([$versionId]);
    foreach ($validation['categories'] as $category) {
        $stmt = $pdo->prepare('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)');
        $stmt->execute([$versionId,$category['name'],$category['sortOrder']]); $categoryId = (int) $pdo->lastInsertId();
        foreach ($category['items'] as $item) {
            $stmt = $pdo->prepare('INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([$categoryId,$item['code'],$item['prompt'],$item['responseType'],$item['helpText'],$item['sortOrder'],$item['isRequired'],$item['unsafeRequiresRemark'],$item['unsafeRequiresPhoto'],$item['unsafeRequiresAction']]);
        }
    }
    foreach ($validation['scopes'] as $scope) {
        $stmt = $pdo->prepare('INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,1)');
        $stmt->execute([$versionId,$scope['departmentId'],$scope['safetyUnitId'],$scope['positionId'],$scope['bbsLevel'],$scope['priority']]);
    }
    $stmt = $pdo->prepare('UPDATE BBS_Checklist_Versions SET EffectiveFrom=?,EffectiveTo=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?');
    $stmt->execute([$validation['from'],$validation['to'],$userId,$versionId]);
}

function handle_bbs_checklist_routes(string $method, string $path): bool
{
    if (strpos($path, '/bbs/admin/checklist') !== 0 && $path !== '/bbs/checklists/resolve') return false;
    $user = require_user();

    if ($method === 'GET' && $path === '/bbs/admin/checklists') {
        require_admin();
        $rows = db_rows("SELECT t.*,COUNT(v.id) VersionCount,SUM(v.Status='Draft') DraftCount,SUM(v.Status='Published') PublishedCount,MAX(v.VersionNo) LatestVersionNo FROM BBS_Checklist_Templates t LEFT JOIN BBS_Checklist_Versions v ON v.TemplateID=t.id GROUP BY t.id ORDER BY t.IsActive DESC,t.UpdatedAt DESC,t.id DESC");
        json_response(['success' => true, 'data' => $rows]);
    }
    $templateParams = route_params($path, '/bbs/admin/checklists/:templateId');
    if ($method === 'GET' && $templateParams !== null) {
        require_admin(); $templateId = bbs_phase1_positive_int($templateParams['templateId']);
        if (!$templateId) json_response(['success' => false, 'message' => 'Invalid checklist template ID.'], 400);
        $template = db_row('SELECT * FROM BBS_Checklist_Templates WHERE id=? LIMIT 1', [$templateId]);
        if (!$template) json_response(['success' => false, 'message' => 'Checklist template was not found.'], 404);
        $versions = db_rows('SELECT id FROM BBS_Checklist_Versions WHERE TemplateID=? ORDER BY VersionNo DESC', [$templateId]);
        json_response(['success' => true, 'data' => ['template' => $template, 'versions' => array_map(static fn($row) => bbs_checklist_version((int) $row['id']), $versions)]]);
    }
    if ($method === 'POST' && $path === '/bbs/admin/checklists') {
        $admin = require_admin(); $body = json_body();
        $code = strtoupper(bbs_checklist_clean_text($body['templateCode'] ?? '', 50)); $name = bbs_checklist_clean_text($body['templateName'] ?? '', 160); $description = bbs_checklist_clean_text($body['description'] ?? '', 2000) ?: null;
        $effectiveFrom = bbs_phase1_iso_date($body['effectiveFrom'] ?? (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'), true);
        if (!preg_match('/^[A-Z0-9][A-Z0-9_-]{1,49}$/', $code) || $name === '' || !$effectiveFrom) json_response(['success' => false, 'message' => 'Template code, name, and valid effective date are required.'], 400);
        $pdo = db(); $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('INSERT INTO BBS_Checklist_Templates(TemplateCode,TemplateName,Description,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?)'); $stmt->execute([$code,$name,$description,(string)$admin['id'],(string)$admin['id']]); $templateId=(int)$pdo->lastInsertId();
            $stmt=$pdo->prepare("INSERT INTO BBS_Checklist_Versions(TemplateID,VersionNo,Status,EffectiveFrom,CreatedBy,UpdatedBy) VALUES(?,1,'Draft',?,?,?)");$stmt->execute([$templateId,$effectiveFrom,(string)$admin['id'],(string)$admin['id']]);$versionId=(int)$pdo->lastInsertId();$pdo->commit();
            bbs_phase1_audit($admin,'BBS_CHECKLIST_CREATE','BBS_Checklist_Template',(string)$templateId,$code.'; draftVersion='.$versionId);
            json_response(['success'=>true,'data'=>compact('templateId','versionId'),'message'=>'Checklist template and first draft created.'],201);
        } catch (PDOException $error) { if($pdo->inTransaction())$pdo->rollBack(); if((string)$error->getCode()==='23000')json_response(['success'=>false,'message'=>'Template code already exists.'],409); throw $error; }
    }
    $statusParams = route_params($path, '/bbs/admin/checklists/:templateId/status');
    if ($method === 'PUT' && $statusParams !== null) {
        $admin=require_admin();$templateId=bbs_phase1_positive_int($statusParams['templateId']);$body=json_body();$isActive=(isset($body['isActive'])&&($body['isActive']===false||(int)$body['isActive']===0))?0:1;
        if(!$templateId)json_response(['success'=>false,'message'=>'Invalid checklist template ID.'],400);
        $count=db_execute('UPDATE BBS_Checklist_Templates SET IsActive=?,UpdatedBy=? WHERE id=?',[$isActive,(string)$admin['id'],$templateId]);if(!$count)json_response(['success'=>false,'message'=>'Checklist template was not found.'],404);
        bbs_phase1_audit($admin,'BBS_CHECKLIST_TEMPLATE_STATUS','BBS_Checklist_Template',(string)$templateId,'active='.$isActive);json_response(['success'=>true,'data'=>['templateId'=>$templateId,'isActive'=>$isActive],'message'=>$isActive?'Checklist template activated.':'Checklist template deactivated without deleting versions.']);
    }
    $versionParams = route_params($path, '/bbs/admin/checklist-versions/:versionId');
    if ($method === 'PUT' && $versionParams !== null) {
        $admin=require_admin();$versionId=bbs_phase1_positive_int($versionParams['versionId']);$body=json_body();$validation=bbs_checklist_validate_draft($body);
        if(!$versionId||empty($validation['ok']))json_response(['success'=>false,'message'=>$validation['message']??'Invalid version ID.'],400);
        $pdo=db();$pdo->beginTransaction();
        try{
            $version=db_row('SELECT * FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE',[$versionId]);if(!$version){$pdo->rollBack();json_response(['success'=>false,'message'=>'Checklist version was not found.'],404);}if($version['Status']!=='Draft'){$pdo->rollBack();json_response(['success'=>false,'code'=>'IMMUTABLE_VERSION','message'=>'Published or archived checklist versions are immutable. Clone the version to edit it.'],409);}if(array_key_exists('rowVersion',$body)&&(int)$body['rowVersion']!==(int)$version['RowVersion']){$pdo->rollBack();json_response(['success'=>false,'code'=>'VERSION_CONFLICT','message'=>'This draft changed in another session. Reload before saving.'],409);}
            $masterError=bbs_checklist_validate_masters($validation['scopes']);if($masterError){$pdo->rollBack();json_response(['success'=>false,'message'=>$masterError],400);}
            db_execute('DELETE FROM BBS_Checklist_Scope_Mappings WHERE VersionID=?',[$versionId]);db_execute('DELETE FROM BBS_Checklist_Categories WHERE VersionID=?',[$versionId]);
            foreach($validation['categories'] as $category){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)');$stmt->execute([$versionId,$category['name'],$category['sortOrder']]);$categoryId=(int)$pdo->lastInsertId();foreach($category['items'] as $item){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)');$stmt->execute([$categoryId,$item['code'],$item['prompt'],$item['responseType'],$item['helpText'],$item['sortOrder'],$item['isRequired'],$item['unsafeRequiresRemark'],$item['unsafeRequiresPhoto'],$item['unsafeRequiresAction']]);}}
            foreach($validation['scopes'] as $scope){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,1)');$stmt->execute([$versionId,$scope['departmentId'],$scope['safetyUnitId'],$scope['positionId'],$scope['bbsLevel'],$scope['priority']]);}
            db_execute('UPDATE BBS_Checklist_Versions SET EffectiveFrom=?,EffectiveTo=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?',[$validation['from'],$validation['to'],(string)$admin['id'],$versionId]);$pdo->commit();bbs_phase1_audit($admin,'BBS_CHECKLIST_DRAFT_SAVE','BBS_Checklist_Version',(string)$versionId,'categories='.count($validation['categories']).'; items='.$validation['itemCount'].'; scopes='.count($validation['scopes']));json_response(['success'=>true,'data'=>bbs_checklist_version($versionId),'message'=>'Checklist draft saved.']);
        }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    }
    $previewParams = route_params($path, '/bbs/admin/checklist-versions/:versionId/import-preview');
    if ($method === 'POST' && $previewParams !== null) {
        require_admin(); $versionId = bbs_phase1_positive_int($previewParams['versionId']); $body = json_body(); $preview = bbs_checklist_import_preview($body);
        if (!$versionId || empty($preview['ok'])) json_response(['success'=>false,'code'=>'CHECKLIST_IMPORT_INVALID','message'=>$preview['message']??'Invalid version ID.'],400);
        $version = db_row('SELECT Status,RowVersion FROM BBS_Checklist_Versions WHERE id=? LIMIT 1',[$versionId]);
        if (!$version) json_response(['success'=>false,'message'=>'Checklist version was not found.'],404);
        if ($version['Status'] !== 'Draft') json_response(['success'=>false,'code'=>'IMMUTABLE_VERSION','message'=>'Only a Draft version can receive imported data.'],409);
        if (array_key_exists('rowVersion',$body) && (int)$body['rowVersion'] !== (int)$version['RowVersion']) json_response(['success'=>false,'code'=>'VERSION_CONFLICT','message'=>'This draft changed in another session. Reload before importing.'],409);
        $masterError = bbs_checklist_validate_masters($preview['scopes']);
        if ($masterError) json_response(['success'=>false,'code'=>'CHECKLIST_IMPORT_INVALID','message'=>$masterError],400);
        json_response(['success'=>true,'data'=>['summary'=>$preview['summary'],'normalized'=>$preview['normalized'],'rowVersion'=>(int)$version['RowVersion']],'message'=>'Checklist import preview is valid. No data has been changed.']);
    }
    $importParams = route_params($path, '/bbs/admin/checklist-versions/:versionId/import');
    if ($method === 'POST' && $importParams !== null) {
        $admin = require_admin(); $versionId = bbs_phase1_positive_int($importParams['versionId']); $body = json_body(); $preview = bbs_checklist_import_preview($body);
        if (!$versionId || empty($preview['ok'])) json_response(['success'=>false,'code'=>'CHECKLIST_IMPORT_INVALID','message'=>$preview['message']??'Invalid version ID.'],400);
        if (($body['confirmed'] ?? false) !== true) json_response(['success'=>false,'code'=>'IMPORT_CONFIRMATION_REQUIRED','message'=>'Preview and confirm the checklist import before saving.'],400);
        $pdo = db(); $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT Status,RowVersion FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE'); $stmt->execute([$versionId]); $version = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$version) { $pdo->rollBack(); json_response(['success'=>false,'message'=>'Checklist version was not found.'],404); }
            if ($version['Status'] !== 'Draft') { $pdo->rollBack(); json_response(['success'=>false,'code'=>'IMMUTABLE_VERSION','message'=>'Only a Draft version can receive imported data.'],409); }
            if (array_key_exists('rowVersion',$body) && (int)$body['rowVersion'] !== (int)$version['RowVersion']) { $pdo->rollBack(); json_response(['success'=>false,'code'=>'VERSION_CONFLICT','message'=>'This draft changed after preview. Reload and preview the file again.'],409); }
            $masterError = bbs_checklist_validate_masters($preview['scopes']);
            if ($masterError) { $pdo->rollBack(); json_response(['success'=>false,'code'=>'CHECKLIST_IMPORT_INVALID','message'=>$masterError],400); }
            bbs_checklist_replace_draft($pdo,$versionId,$preview,(string)$admin['id']); $pdo->commit();
            bbs_phase1_audit($admin,'BBS_CHECKLIST_IMPORT','BBS_Checklist_Version',(string)$versionId,'categories='.$preview['summary']['categoryCount'].'; items='.$preview['summary']['itemCount'].'; scopes='.$preview['summary']['scopeCount']);
            json_response(['success'=>true,'data'=>bbs_checklist_version($versionId),'summary'=>$preview['summary'],'message'=>'Checklist imported atomically into the Draft version.']);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }
    $publishParams=route_params($path,'/bbs/admin/checklist-versions/:versionId/publish');
    if ($method === 'POST' && $publishParams !== null) {
        $admin = require_admin(); $versionId = bbs_phase1_positive_int($publishParams['versionId']);
        if (!$versionId) json_response(['success' => false, 'message' => 'Invalid version ID.'], 400);
        $pdo = db(); $pdo->beginTransaction();
        try {
            $version = db_row('SELECT * FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE', [$versionId]);
            if (!$version) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Checklist version was not found.'], 404); }
            if ($version['Status'] !== 'Draft') { $pdo->rollBack(); json_response(['success' => false, 'code' => 'IMMUTABLE_VERSION', 'message' => 'Only a Draft version can be published.'], 409); }
            $counts = db_row('SELECT (SELECT COUNT(*) FROM BBS_Checklist_Categories WHERE VersionID=?) Categories,(SELECT COUNT(*) FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=?) Items,(SELECT COUNT(*) FROM BBS_Checklist_Scope_Mappings WHERE VersionID=? AND IsActive=1) Scopes', [$versionId,$versionId,$versionId]);
            if (!(int)$counts['Categories'] || !(int)$counts['Items'] || !(int)$counts['Scopes']) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Save at least one category, item, and scope before publishing.'], 400); }
            $mine = db_rows('SELECT * FROM BBS_Checklist_Scope_Mappings WHERE VersionID=? AND IsActive=1', [$versionId]);
            $others = db_rows("SELECT s.*,v.id VersionID FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published' WHERE s.IsActive=1 AND v.EffectiveFrom<=COALESCE(?,'9999-12-31') AND COALESCE(v.EffectiveTo,'9999-12-31')>=?", [$version['EffectiveTo'],$version['EffectiveFrom']]);
            $conflicts = bbs_checklist_publish_conflicts($mine, $others);
            if ($conflicts) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'CHECKLIST_CONFLICT', 'message' => 'A published checklist has an overlapping scope with equal specificity and priority.', 'conflicts' => $conflicts], 409); }
            db_execute("UPDATE BBS_Checklist_Versions SET Status='Published',PublishedAt=NOW(),PublishedBy=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?", [(string)$admin['id'],(string)$admin['id'],$versionId]);
            $pdo->commit(); bbs_phase1_audit($admin,'BBS_CHECKLIST_PUBLISH','BBS_Checklist_Version',(string)$versionId,'version='.$version['VersionNo']);
            json_response(['success'=>true,'data'=>bbs_checklist_version($versionId),'message'=>'Checklist version published and is now immutable.']);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }
    $cloneParams=route_params($path,'/bbs/admin/checklist-versions/:versionId/clone');
    if($method==='POST'&&$cloneParams!==null){$admin=require_admin();$sourceId=bbs_phase1_positive_int($cloneParams['versionId']);if(!$sourceId)json_response(['success'=>false,'message'=>'Invalid version ID.'],400);$source=bbs_checklist_version($sourceId);if(!$source)json_response(['success'=>false,'message'=>'Checklist version was not found.'],404);$pdo=db();$pdo->beginTransaction();try{db_row('SELECT id FROM BBS_Checklist_Templates WHERE id=? FOR UPDATE',[(int)$source['TemplateID']]);$latest=db_row('SELECT MAX(VersionNo) MaxVersion FROM BBS_Checklist_Versions WHERE TemplateID=?',[(int)$source['TemplateID']]);$stmt=$pdo->prepare("INSERT INTO BBS_Checklist_Versions(TemplateID,VersionNo,Status,EffectiveFrom,CreatedBy,UpdatedBy) VALUES(?,?,'Draft',?,?,?)");$stmt->execute([(int)$source['TemplateID'],(int)($latest['MaxVersion']??0)+1,(new DateTimeImmutable('now',new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'),(string)$admin['id'],(string)$admin['id']]);$versionId=(int)$pdo->lastInsertId();foreach($source['categories'] as $category){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)');$stmt->execute([$versionId,$category['CategoryName'],$category['SortOrder']]);$categoryId=(int)$pdo->lastInsertId();foreach($category['items'] as $item){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)');$stmt->execute([$categoryId,$item['ItemCode'],$item['ItemPrompt'],$item['ResponseType'],$item['HelpText'],$item['SortOrder'],$item['IsRequired'],$item['UnsafeRequiresRemark'],$item['UnsafeRequiresPhoto'],$item['UnsafeRequiresAction']]);}}foreach($source['scopes'] as $scope){$stmt=$pdo->prepare('INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,?)');$stmt->execute([$versionId,$scope['DepartmentID'],$scope['SafetyUnitID'],$scope['PositionID'],$scope['BBSLevel'],$scope['Priority'],$scope['IsActive']]);}$pdo->commit();bbs_phase1_audit($admin,'BBS_CHECKLIST_CLONE','BBS_Checklist_Version',(string)$versionId,'source='.$sourceId);json_response(['success'=>true,'data'=>bbs_checklist_version($versionId),'message'=>'Checklist cloned as a new Draft version.'],201);}catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}}
    $archiveParams=route_params($path,'/bbs/admin/checklist-versions/:versionId/archive');
    if($method==='POST'&&$archiveParams!==null){$admin=require_admin();$versionId=bbs_phase1_positive_int($archiveParams['versionId']);if(!$versionId)json_response(['success'=>false,'message'=>'Invalid version ID.'],400);$count=db_execute("UPDATE BBS_Checklist_Versions SET Status='Archived',ArchivedAt=NOW(),ArchivedBy=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=? AND Status='Published'",[(string)$admin['id'],(string)$admin['id'],$versionId]);if(!$count)json_response(['success'=>false,'message'=>'Only a Published version can be archived.'],409);bbs_phase1_audit($admin,'BBS_CHECKLIST_ARCHIVE','BBS_Checklist_Version',(string)$versionId,'Published version archived without deleting history.');json_response(['success'=>true,'message'=>'Checklist version archived.']);}
    if($method==='GET'&&$path==='/bbs/checklists/resolve'){$employeeId=trim((string)($_GET['employeeId']??''));$asOf=bbs_phase1_iso_date($_GET['asOf']??(new DateTimeImmutable('now',new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'),true);if($employeeId===''||!$asOf)json_response(['success'=>false,'message'=>'employeeId and valid asOf date are required.'],400);$employee=db_row('SELECT e.EmployeeID,e.EmployeeName,md.id DepartmentID,su.id SafetyUnitID,mp.id PositionID,m.BBSLevel FROM employees e LEFT JOIN master_departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN master_safetyunits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit)) LEFT JOIN master_positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=mp.id AND m.IsActive=1 WHERE e.EmployeeID=? LIMIT 1',[$employeeId]);if(!$employee)json_response(['success'=>false,'message'=>'Observed employee was not found.'],404);if(strcasecmp((string)($user['role']??''),'Admin')!==0&&!db_row("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1",[(string)$user['id'],$employeeId,$asOf,$asOf]))json_response(['success'=>false,'message'=>'Employee is outside your active BBS assignment scope.'],403);$candidates=db_rows("SELECT s.*,v.id VersionID,v.VersionNo,v.EffectiveFrom,v.EffectiveTo,t.id TemplateID,t.TemplateCode,t.TemplateName FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published' JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1 WHERE s.IsActive=1 AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?",[$asOf,$asOf]);$resolved=bbs_checklist_resolve_candidates($candidates,['departmentId'=>$employee['DepartmentID'],'safetyUnitId'=>$employee['SafetyUnitID'],'positionId'=>$employee['PositionID'],'bbsLevel'=>$employee['BBSLevel']]);if(empty($resolved['ok']))json_response(array_merge(['success'=>false],$resolved),($resolved['code']??'')==='CHECKLIST_CONFLICT'?409:404);json_response(['success'=>true,'data'=>['employee'=>$employee,'reason'=>$resolved['reason'],'checklist'=>bbs_checklist_version((int)$resolved['selected']['VersionID'])]]);}
    return false;
}
