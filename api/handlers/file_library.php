<?php
declare(strict_types=1);

function file_library_private_dir(): string
{
    $dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'file-library';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create file library storage.');
    }
    return $dir;
}

function file_library_rules(): array
{
    return [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'pdf' => 'application/pdf',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
}

function file_library_category_dto(array $row): array
{
    return ['id'=>(int)$row['id'],'code'=>$row['Code'],'labelTh'=>$row['LabelTh'],
        'labelEn'=>$row['LabelEn'] ?? '','sortOrder'=>(int)$row['SortOrder'],
        'isActive'=>(bool)$row['IsActive'],'isSystem'=>(bool)$row['IsSystem']];
}

function file_library_categories(bool $includeInactive = true): array
{
    $sql = 'SELECT * FROM FileLibrary_Categories' . ($includeInactive ? '' : ' WHERE IsActive=1')
        . ' ORDER BY IsActive DESC,SortOrder,LabelTh,id';
    $rows = db()->query($sql)->fetchAll() ?: [];
    return array_map('file_library_category_dto', $rows);
}

function file_library_category($value, bool $activeOnly = true): ?string
{
    $category = file_library_clean($value, 80);
    if (!preg_match('/^[A-Z][A-Z0-9_]{1,79}$/', $category)) return null;
    $row = db_row('SELECT Code FROM FileLibrary_Categories WHERE Code=?' . ($activeOnly ? ' AND IsActive=1' : '') . ' LIMIT 1', [$category]);
    return $row ? (string)$row['Code'] : null;
}

function file_library_category_detail(string $category, $value): ?string
{
    $detail = file_library_clean($value, 120);
    if ($category === 'OTHER' && $detail === '') return null;
    return $category === 'OTHER' ? $detail : '';
}

function file_library_clean($value, int $max): string
{
    $value = trim((string)preg_replace('/[\r\n\x00]+/u', ' ', (string)$value));
    $value = (string)preg_replace('/\s+/u', ' ', $value);
    return mb_substr($value, 0, $max);
}

function file_library_original_name($value): string
{
    $raw = trim(str_replace(["\r","\n","\0"], ' ', (string)$value));
    if ($raw === '' || !preg_match('/[\x{0080}-\x{00FF}]/u', $raw)) return file_library_clean($raw, 255);
    $decoded = @mb_convert_encoding($raw, 'ISO-8859-1', 'UTF-8');
    if ($decoded !== '' && mb_check_encoding($decoded, 'UTF-8') && preg_match('/[^\x00-\x7F]/', $decoded)) {
        return file_library_clean($decoded, 255);
    }
    return file_library_clean($raw, 255);
}

function file_library_expiry($value): ?string
{
    $value = trim((string)$value);
    if ($value === '') return null;
    $timestamp = strtotime($value);
    if ($timestamp === false) json_response(['success'=>false,'message'=>'วันหมดอายุไม่ถูกต้อง'], 400);
    return date('Y-m-d H:i:s', $timestamp);
}

function file_library_verify(string $target, string $extension): ?string
{
    $rules = file_library_rules();
    if (!isset($rules[$extension])) return null;
    $data = file_get_contents($target);
    if ($data === false) return null;
    if (in_array($extension, ['jpg','jpeg'], true) && substr($data, 0, 3) === "\xFF\xD8\xFF") return 'image/jpeg';
    if ($extension === 'png' && substr($data, 0, 8) === "\x89PNG\r\n\x1A\n") return 'image/png';
    if ($extension === 'webp' && substr($data, 0, 4) === 'RIFF' && substr($data, 8, 4) === 'WEBP') return 'image/webp';
    if ($extension === 'pdf' && substr($data, 0, 5) === '%PDF-') return 'application/pdf';
    if (in_array($extension, ['docx','xlsx','pptx'], true) && substr($data, 0, 2) === 'PK') {
        $marker = $extension === 'docx' ? 'word/' : ($extension === 'xlsx' ? 'xl/' : 'ppt/');
        if (strpos($data, $marker) !== false) return $rules[$extension];
    }
    return null;
}

function file_library_public_url(string $token): string
{
    global $config;
    $configured = preg_replace('#/api$#i', '', rtrim(trim((string)($config['public_api_url'] ?? '')), '/'));
    if ($configured !== '') return $configured . '/api/public/file-library/' . rawurlencode($token);
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $base = rtrim(dirname(dirname($script)), '/.');
    $forwarded = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
    $scheme = in_array($forwarded, ['http','https'], true) ? $forwarded : (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http');
    $host = preg_replace('/[^A-Za-z0-9.:[\]-]/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
    $origin = $host !== '' ? $scheme . '://' . $host : '';
    return $origin . ($base !== '' ? $base : '') . '/api/public/file-library/' . rawurlencode($token);
}

function file_library_authenticated_url(string $token): string
{
    global $config;
    $configured = rtrim(trim((string)($config['public_app_url'] ?? '')), '/');
    if ($configured !== '') return $configured . '/index.html#file-library=' . rawurlencode($token);
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $base = rtrim(dirname(dirname($script)), '/.');
    return ($base !== '' ? $base : '') . '/index.html#file-library=' . rawurlencode($token);
}

function file_library_dto(array $row): array
{
    return [
        'id'=>(int)$row['id'],'title'=>$row['Title'],'description'=>$row['Description'] ?? '',
        'category'=>$row['Category'] ?? '','categoryDetail'=>$row['CategoryDetail'] ?? '',
        'originalName'=>file_library_original_name($row['OriginalName']),'mimeType'=>$row['MimeType'],
        'fileExtension'=>$row['FileExtension'],'fileSize'=>(int)$row['FileSize'],'status'=>$row['Status'],
        'accessMode'=>$row['AccessMode'] ?? 'Public','deliveryMode'=>$row['DeliveryMode'] ?? 'Auto',
        'expiresAt'=>$row['ExpiresAt'],'publishedAt'=>$row['PublishedAt'],'createdAt'=>$row['CreatedAt'],
        'updatedAt'=>$row['UpdatedAt'],'uploadedBy'=>$row['UploadedBy'],'viewCount'=>(int)$row['ViewCount'],
        'lastAccessedAt'=>$row['LastAccessedAt'] ?? null,'rowVersion'=>(int)$row['RowVersion'],
        'publicToken'=>$row['PublicToken'],
        'url'=>(($row['AccessMode'] ?? 'Public') === 'Authenticated'
            ? file_library_authenticated_url((string)$row['PublicToken'])
            : file_library_public_url((string)$row['PublicToken'])),
        'canPreview'=>in_array($row['MimeType'], ['image/jpeg','image/png','image/webp','application/pdf'], true)
            && ($row['DeliveryMode'] ?? 'Auto') !== 'Download',
    ];
}

function file_library_store_upload(): array
{
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(['success'=>false,'message'=>'กรุณาเลือกไฟล์'], 400);
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > 25 * 1024 * 1024) json_response(['success'=>false,'message'=>'ไฟล์ต้องมีขนาดไม่เกิน 25 MB'], 400);
    $original = file_library_original_name(clean_upload_name($file['name'] ?? 'upload'));
    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!isset(file_library_rules()[$extension])) json_response(['success'=>false,'message'=>'รองรับเฉพาะ JPG, PNG, WebP, PDF, DOCX, XLSX และ PPTX'], 400);
    $stored = date('YmdHis') . '-' . bin2hex(random_bytes(18)) . '.' . $extension;
    $target = file_library_private_dir() . DIRECTORY_SEPARATOR . $stored;
    if (!move_uploaded_file((string)$file['tmp_name'], $target)) json_response(['success'=>false,'message'=>'ไม่สามารถจัดเก็บไฟล์ได้'], 500);
    $mime = file_library_verify($target, $extension);
    if ($mime === null) {
        @unlink($target);
        json_response(['success'=>false,'code'=>'FILE_SIGNATURE_INVALID','message'=>'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่อนุญาต'], 400);
    }
    return ['target'=>$target,'stored'=>$stored,'original'=>$original,'extension'=>$extension,'mime'=>$mime,'size'=>$size,'sha256'=>hash_file('sha256',$target)];
}

function file_library_send(string $token, bool $publicOnly): void
{
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $token)) { http_response_code(404); exit; }
    $access = $publicOnly ? " AND AccessMode='Public'" : '';
    $row = db_row("SELECT * FROM FileLibrary_Items WHERE PublicToken=?".$access." AND Status='Published' AND (ExpiresAt IS NULL OR ExpiresAt>NOW()) LIMIT 1", [$token]);
    $target = $row ? file_library_private_dir() . DIRECTORY_SEPARATOR . basename((string)$row['StoredName']) : '';
    if (!$row || !is_file($target)) { http_response_code(404); exit; }
    $inline = ($row['DeliveryMode'] ?? 'Auto') !== 'Download'
        && in_array($row['MimeType'], ['image/jpeg','image/png','image/webp','application/pdf'], true);
    $original = file_library_original_name($row['OriginalName']);
    $fallback = preg_replace('/[^\x20-\x7E]/', '_', $original);
    $fallback = str_replace(['"','\\'], '_', (string)$fallback);
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store, max-age=0');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('X-File-Library-Access: ' . ($row['AccessMode'] ?? 'Public'));
    header('Content-Type: ' . $row['MimeType']);
    header('Content-Length: ' . filesize($target));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $fallback . '"; filename*=UTF-8\'\'' . rawurlencode($original));
    try { db_execute('UPDATE FileLibrary_Items SET ViewCount=ViewCount+1,LastAccessedAt=NOW() WHERE id=?', [$row['id']]); } catch (Throwable $e) {}
    readfile($target);
    exit;
}

function handle_file_library_routes(string $method, string $path): bool
{
    $public = route_params($path, '/public/file-library/:token');
    if ($method === 'GET' && $public !== null) file_library_send((string)$public['token'], true);
    $authenticated = route_params($path, '/file-library/:token');
    if ($method === 'GET' && $authenticated !== null) {
        require_user();
        file_library_send((string)$authenticated['token'], false);
    }
    if (strpos($path, '/admin/file-library') !== 0) return false;
    $user = require_admin();

    if ($method === 'GET' && $path === '/admin/file-library') {
        $q = file_library_clean($_GET['q'] ?? '', 120);
        $status = file_library_clean($_GET['status'] ?? '', 16);
        $categoryFilter = file_library_clean($_GET['category'] ?? '', 80);
        $page = max(1, (int)($_GET['page'] ?? 1)); $limit = 20; $offset = ($page - 1) * $limit;
        $where=[]; $params=[];
        if (in_array($status, ['Draft','Published','Revoked'], true)) { $where[]='Status=?'; $params[]=$status; }
        if (preg_match('/^[A-Z][A-Z0-9_]{1,79}$/', $categoryFilter)) { $where[]='Category=?'; $params[]=$categoryFilter; }
        if ($q !== '') { $where[]='(Title LIKE ? OR OriginalName LIKE ? OR Category LIKE ?)'; array_push($params, "%$q%", "%$q%", "%$q%"); }
        $clause = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $count = db_row('SELECT COUNT(*) total FROM FileLibrary_Items'.$clause, $params);
        $stmt = db()->prepare('SELECT * FROM FileLibrary_Items'.$clause.' ORDER BY CreatedAt DESC LIMIT '.$limit.' OFFSET '.$offset);
        $stmt->execute($params); $rows=$stmt->fetchAll() ?: [];
        $summary=db_row("SELECT COUNT(*) total,SUM(Status='Published' AND (ExpiresAt IS NULL OR ExpiresAt>NOW())) published,SUM(Status='Draft') drafts,SUM(Status='Revoked' OR (ExpiresAt IS NOT NULL AND ExpiresAt<=NOW())) unavailable,COALESCE(SUM(FileSize),0) bytes FROM FileLibrary_Items") ?: [];
        foreach ($summary as $key=>$value) $summary[$key]=(int)$value;
        json_response(['success'=>true,'data'=>['rows'=>array_map('file_library_dto',$rows),'categories'=>file_library_categories(true),'page'=>$page,'total'=>(int)($count['total']??0),'totalPages'=>max(1,(int)ceil((int)($count['total']??0)/$limit)),'summary'=>$summary]]);
    }

    if ($method === 'GET' && $path === '/admin/file-library/categories') {
        json_response(['success'=>true,'data'=>file_library_categories(true)]);
    }

    if ($method === 'POST' && $path === '/admin/file-library/categories') {
        $body=json_body();
        $labelTh=file_library_clean($body['labelTh']??'',120); $labelEn=file_library_clean($body['labelEn']??'',120);
        if ($labelTh==='') json_response(['success'=>false,'code'=>'FILE_CATEGORY_LABEL_REQUIRED','message'=>'กรุณาระบุชื่อหมวดหมู่ภาษาไทย'],400);
        $code='CUSTOM_'.strtoupper(bin2hex(random_bytes(8)));
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        db_execute('INSERT INTO FileLibrary_Categories(Code,LabelTh,LabelEn,SortOrder,IsActive,IsSystem,CreatedBy,UpdatedBy) SELECT ?,?,?,COALESCE(MAX(SortOrder),0)+10,1,0,?,? FROM FileLibrary_Categories',[$code,$labelTh,$labelEn?:null,$actor,$actor]);
        $id=(int)db()->lastInsertId();
        auth_audit_log('FILE_LIBRARY_CATEGORY_CREATE',$actor,201,['module'=>'file_library','categoryId'=>$id,'code'=>$code,'labelTh'=>$labelTh],$user);
        json_response(['success'=>true,'data'=>file_library_category_dto(db_row('SELECT * FROM FileLibrary_Categories WHERE id=?',[$id]) ?: [])],201);
    }

    $categoryItem=route_params($path,'/admin/file-library/categories/:id');
    if ($categoryItem!==null && $method==='PUT') {
        $body=json_body(); $id=(int)$categoryItem['id'];
        $labelTh=file_library_clean($body['labelTh']??'',120); $labelEn=file_library_clean($body['labelEn']??'',120);
        $sortOrder=min(9999,max(0,(int)($body['sortOrder']??0)));
        if ($id<=0||$labelTh==='') json_response(['success'=>false,'code'=>'FILE_CATEGORY_INVALID','message'=>'ข้อมูลหมวดหมู่ไม่ถูกต้อง'],400);
        $current=db_row('SELECT * FROM FileLibrary_Categories WHERE id=? LIMIT 1',[$id]);
        if (!$current) json_response(['success'=>false,'message'=>'ไม่พบหมวดหมู่'],404);
        $requestedActive=$body['isActive']??true;
        $isActive=$current['Code']==='OTHER'?1:(filter_var($requestedActive,FILTER_VALIDATE_BOOLEAN)?1:0);
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        db_execute('UPDATE FileLibrary_Categories SET LabelTh=?,LabelEn=?,SortOrder=?,IsActive=?,UpdatedBy=? WHERE id=?',[$labelTh,$labelEn?:null,$sortOrder,$isActive,$actor,$id]);
        auth_audit_log('FILE_LIBRARY_CATEGORY_UPDATE',$actor,200,['module'=>'file_library','categoryId'=>$id,'code'=>$current['Code'],'isActive'=>(bool)$isActive],$user);
        json_response(['success'=>true,'data'=>file_library_category_dto(db_row('SELECT * FROM FileLibrary_Categories WHERE id=?',[$id]) ?: [])]);
    }
    if ($categoryItem!==null && $method==='DELETE') {
        $id=(int)$categoryItem['id']; $current=db_row('SELECT * FROM FileLibrary_Categories WHERE id=? LIMIT 1',[$id]);
        if (!$current) json_response(['success'=>false,'message'=>'ไม่พบหมวดหมู่'],404);
        if ($current['Code']==='OTHER') json_response(['success'=>false,'code'=>'FILE_CATEGORY_OTHER_REQUIRED','message'=>'หมวดหมู่อื่นๆ ต้องเปิดใช้งานเสมอ'],409);
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        db_execute('UPDATE FileLibrary_Categories SET IsActive=0,UpdatedBy=? WHERE id=?',[$actor,$id]);
        auth_audit_log('FILE_LIBRARY_CATEGORY_ARCHIVE',$actor,200,['module'=>'file_library','categoryId'=>$id,'code'=>$current['Code']],$user);
        json_response(['success'=>true,'message'=>'ปิดใช้งานหมวดหมู่แล้ว โดยไฟล์เดิมยังคงข้อมูลครบถ้วน']);
    }

    if ($method === 'POST' && $path === '/admin/file-library') {
        $file = file_library_store_upload();
        try {
            $title=file_library_clean($_POST['title'] ?? pathinfo($file['original'],PATHINFO_FILENAME),200);
            if ($title==='') throw new InvalidArgumentException('กรุณาระบุชื่อไฟล์');
            $categoryCode=file_library_category($_POST['category']??'');
            if ($categoryCode===null) throw new InvalidArgumentException('กรุณาเลือกหมวดหมู่มาตรฐาน');
            $categoryDetail=file_library_category_detail($categoryCode,$_POST['categoryDetail']??'');
            if ($categoryDetail===null) { @unlink($file['target']); json_response(['success'=>false,'code'=>'FILE_CATEGORY_DETAIL_REQUIRED','message'=>'กรุณาระบุรายละเอียดเมื่อเลือกหมวดหมู่อื่นๆ'],400); }
            $status=((string)($_POST['publishNow']??'1'))==='0'?'Draft':'Published';
            $accessMode=(string)($_POST['accessMode']??'Public');
            $deliveryMode=(string)($_POST['deliveryMode']??'Auto');
            if (!in_array($accessMode,['Public','Authenticated'],true) || !in_array($deliveryMode,['Auto','Download'],true)) json_response(['success'=>false,'code'=>'FILE_ACCESS_INVALID','message'=>'รูปแบบการเข้าถึงไฟล์ไม่ถูกต้อง'],400);
            $token=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
            $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
            db_execute("INSERT INTO FileLibrary_Items(PublicToken,Title,Description,Category,CategoryDetail,OriginalName,StoredName,MimeType,FileExtension,FileSize,ContentSha256,Status,AccessMode,DeliveryMode,ExpiresAt,PublishedAt,UploadedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,".($status==='Published'?'NOW()':'NULL').",?,?)",[$token,$title,file_library_clean($_POST['description']??'',1000)?:null,$categoryCode,$categoryDetail?:null,$file['original'],$file['stored'],$file['mime'],$file['extension'],$file['size'],$file['sha256'],$status,$accessMode,$deliveryMode,file_library_expiry($_POST['expiresAt']??''),$actor,$actor]);
            $id=(int)db()->lastInsertId();
            auth_audit_log('FILE_LIBRARY_UPLOAD',$actor,201,['module'=>'file_library','itemId'=>$id,'mime'=>$file['mime'],'size'=>$file['size'],'status'=>$status,'accessMode'=>$accessMode,'deliveryMode'=>$deliveryMode],$user);
            json_response(['success'=>true,'data'=>file_library_dto(db_row('SELECT * FROM FileLibrary_Items WHERE id=?',[$id]) ?: [])],201);
        } catch (Throwable $e) {
            @unlink($file['target']);
            if ($e instanceof InvalidArgumentException) json_response(['success'=>false,'message'=>$e->getMessage()],400);
            throw $e;
        }
    }

    $item = route_params($path, '/admin/file-library/:id');
    if ($item !== null && $method === 'PUT') {
        $body=json_body(); $id=(int)$item['id']; $version=(int)($body['rowVersion']??0);
        $status=file_library_clean($body['status']??'',16); $title=file_library_clean($body['title']??'',200);
        $categoryCode=file_library_category($body['category']??'');
        $categoryDetail=$categoryCode===null?null:file_library_category_detail($categoryCode,$body['categoryDetail']??'');
        $accessMode=(string)($body['accessMode']??'Public');
        $deliveryMode=(string)($body['deliveryMode']??'Auto');
        if (!in_array($accessMode,['Public','Authenticated'],true) || !in_array($deliveryMode,['Auto','Download'],true)) json_response(['success'=>false,'code'=>'FILE_ACCESS_INVALID','message'=>'รูปแบบการเข้าถึงไฟล์ไม่ถูกต้อง'],400);
        if ($id<=0||$version<=0||$title===''||$categoryCode===null||!in_array($status,['Draft','Published'],true)) json_response(['success'=>false,'code'=>$categoryCode===null?'FILE_CATEGORY_INVALID':'FILE_ITEM_INVALID','message'=>$categoryCode===null?'กรุณาเลือกหมวดหมู่มาตรฐาน':'ข้อมูลรายการไม่ถูกต้อง'],400);
        if ($categoryDetail===null) json_response(['success'=>false,'code'=>'FILE_CATEGORY_DETAIL_REQUIRED','message'=>'กรุณาระบุรายละเอียดเมื่อเลือกหมวดหมู่อื่นๆ'],400);
        $stmt=db()->prepare("UPDATE FileLibrary_Items SET Title=?,Description=?,Category=?,CategoryDetail=?,Status=?,AccessMode=?,DeliveryMode=?,ExpiresAt=?,PublishedAt=CASE WHEN ?='Published' AND PublishedAt IS NULL THEN NOW() ELSE PublishedAt END,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=? AND Status<>'Revoked'");
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        $stmt->execute([$title,file_library_clean($body['description']??'',1000)?:null,$categoryCode,$categoryDetail?:null,$status,$accessMode,$deliveryMode,file_library_expiry($body['expiresAt']??''),$status,$actor,$id,$version]);
        if ($stmt->rowCount()!==1) json_response(['success'=>false,'code'=>'ROW_VERSION_CONFLICT','message'=>'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่'],409);
        auth_audit_log('FILE_LIBRARY_UPDATE',$actor,200,['module'=>'file_library','itemId'=>$id,'status'=>$status,'accessMode'=>$accessMode,'deliveryMode'=>$deliveryMode],$user);
        json_response(['success'=>true,'data'=>file_library_dto(db_row('SELECT * FROM FileLibrary_Items WHERE id=?',[$id]) ?: [])]);
    }
    $purge = route_params($path, '/admin/file-library/:id/purge');
    if ($purge !== null && $method === 'POST') {
        $body=json_body(); $id=(int)$purge['id']; $version=(int)($body['rowVersion']??0);
        if ($id<=0||$version<=0) json_response(['success'=>false,'code'=>'FILE_PURGE_INVALID','message'=>'ข้อมูลยืนยันการลบไม่ถูกต้อง'],400);
        $row=db_row('SELECT * FROM FileLibrary_Items WHERE id=? LIMIT 1',[$id]);
        if (!$row) json_response(['success'=>false,'message'=>'ไม่พบรายการไฟล์'],404);
        if (($row['Status']??'')!=='Revoked') json_response(['success'=>false,'code'=>'FILE_PURGE_REVOKE_FIRST','message'=>'ต้องยกเลิกลิงก์ก่อนจึงจะลบไฟล์ถาวรได้'],409);
        if ((int)$row['RowVersion']!==$version) json_response(['success'=>false,'code'=>'ROW_VERSION_CONFLICT','message'=>'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่'],409);
        if (trim((string)($body['confirmTitle']??''))!==(string)$row['Title']) json_response(['success'=>false,'code'=>'FILE_PURGE_CONFIRMATION_MISMATCH','message'=>'กรุณาพิมพ์ชื่อไฟล์ให้ตรงก่อนลบถาวร'],400);
        $target=file_library_private_dir().DIRECTORY_SEPARATOR.basename((string)$row['StoredName']);
        $quarantine=$target.'.purge-'.bin2hex(random_bytes(8)); $quarantined=false;
        try {
            if (is_file($target)) {
                if (!rename($target,$quarantine)) throw new RuntimeException('Cannot quarantine file before permanent deletion.');
                $quarantined=true;
            }
            $stmt=db()->prepare("DELETE FROM FileLibrary_Items WHERE id=? AND Status='Revoked' AND RowVersion=?");
            $stmt->execute([$id,$version]);
            if ($stmt->rowCount()!==1) {
                if ($quarantined&&is_file($quarantine)) @rename($quarantine,$target);
                json_response(['success'=>false,'code'=>'ROW_VERSION_CONFLICT','message'=>'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่'],409);
            }
        } catch (Throwable $e) {
            if ($quarantined&&is_file($quarantine)&&!is_file($target)) @rename($quarantine,$target);
            throw $e;
        }
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        auth_audit_log('FILE_LIBRARY_PURGE',$actor,200,['module'=>'file_library','itemId'=>$id,'title'=>$row['Title'],'originalName'=>file_library_original_name($row['OriginalName']),'size'=>(int)$row['FileSize'],'sha256'=>$row['ContentSha256'],'bytesRemoved'=>$quarantined],$user);
        if ($quarantined&&!@unlink($quarantine)) error_log('File Library purge residue: '.basename($quarantine));
        json_response(['success'=>true,'message'=>'ลบรายการและไฟล์จริงออกจากระบบถาวรแล้ว']);
    }
    $rotate = route_params($path, '/admin/file-library/:id/rotate-link');
    if ($rotate !== null && $method === 'POST') {
        $body=json_body(); $id=(int)$rotate['id']; $version=(int)($body['rowVersion']??0);
        if ($id<=0||$version<=0) json_response(['success'=>false,'message'=>'Invalid item version'],400);
        $newToken=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
        $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        $stmt=db()->prepare("UPDATE FileLibrary_Items SET PublicToken=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=? AND Status<>'Revoked'");
        $stmt->execute([$newToken,$actor,$id,$version]);
        if ($stmt->rowCount()!==1) json_response(['success'=>false,'code'=>'ROW_VERSION_CONFLICT','message'=>'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่'],409);
        auth_audit_log('FILE_LIBRARY_ROTATE_LINK',$actor,200,['module'=>'file_library','itemId'=>$id],$user);
        json_response(['success'=>true,'data'=>file_library_dto(db_row('SELECT * FROM FileLibrary_Items WHERE id=?',[$id]) ?: [])]);
    }
    if ($item !== null && $method === 'DELETE') {
        $id=(int)$item['id']; $actor=file_library_clean($user['id']??$user['EmployeeID']??'system',50);
        $stmt=db()->prepare("UPDATE FileLibrary_Items SET Status='Revoked',RemovedAt=NOW(),RemovedBy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND Status<>'Revoked'");
        $stmt->execute([$actor,$actor,$id]);
        if ($stmt->rowCount()!==1) json_response(['success'=>false,'message'=>'ไม่พบรายการที่เปิดใช้งาน'],404);
        auth_audit_log('FILE_LIBRARY_REVOKE',$actor,200,['module'=>'file_library','itemId'=>$id,'bytesRetained'=>true],$user);
        json_response(['success'=>true,'message'=>'ยกเลิกลิงก์แล้ว โดยยังเก็บไฟล์ไว้สำหรับการตรวจสอบ']);
    }
    return false;
}
