<?php
declare(strict_types=1);

function db_bool($value): int
{
    return $value === true || $value === 1 || $value === '1' || strtolower((string) $value) === 'true' ? 1 : 0;
}

function json_array_value($value): array
{
    if (is_array($value)) {
        return $value;
    }
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? $decoded : [];
}

function committee_file_urls($value): array
{
    $urls = [];
    foreach (json_array_value($value) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $url = trim((string) ($row['documentUrl'] ?? $row['activeLink'] ?? ''));
        if ($url !== '') {
            $urls[] = $url;
        }
    }
    return array_values(array_unique($urls));
}

function delete_replaced_upload($oldUrl, $newUrl): void
{
    if ($oldUrl && $oldUrl !== $newUrl) {
        delete_uploaded_file($oldUrl);
    }
}

function ensure_content_schema(): void
{
    $alters = [
        "ALTER TABLE policy_acknowledgements ADD COLUMN AckSource VARCHAR(20) NOT NULL DEFAULT 'self' AFTER AcknowledgedAt",
        'ALTER TABLE policy_acknowledgements ADD COLUMN AcknowledgedByAdminID VARCHAR(50) DEFAULT NULL AFTER AckSource',
        'ALTER TABLE policy_acknowledgements ADD COLUMN AcknowledgedByAdminName VARCHAR(100) DEFAULT NULL AFTER AcknowledgedByAdminID',
        'ALTER TABLE committees ADD COLUMN AppointmentDocLink VARCHAR(1024) DEFAULT NULL AFTER MainOrgChartLink',
        'ALTER TABLE kpiannouncements ADD COLUMN DocumentLink VARCHAR(1024) DEFAULT NULL AFTER EffectiveDate',
    ];
    foreach ($alters as $sql) {
        try {
            db()->exec($sql);
        } catch (Throwable $error) {
            // Existing columns are expected on upgraded databases.
        }
    }
}

function handle_policy_routes(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/pagedata/policies') {
        $user = require_user();
        ensure_content_schema();
        $items = db_rows('SELECT *,id AS rowIndex FROM policies ORDER BY EffectiveDate DESC');
        $total = (int) (safe_scalar('SELECT COUNT(*) FROM employees') ?? 0);
        $ackMap = [];
        foreach (safe_rows('SELECT PolicyID,COUNT(*) AS cnt FROM policy_acknowledgements GROUP BY PolicyID') as $row) {
            $ackMap[(string) $row['PolicyID']] = (int) $row['cnt'];
        }
        $userAcks = [];
        foreach (safe_rows('SELECT PolicyID FROM policy_acknowledgements WHERE UserID=?', [(string) ($user['id'] ?? '')]) as $row) {
            $userAcks[(string) $row['PolicyID']] = true;
        }
        $ascending = array_reverse($items);
        $versions = [];
        foreach ($ascending as $index => $row) {
            $versions[(string) $row['id']] = $index + 1;
        }
        foreach ($items as &$row) {
            $id = (string) $row['id'];
            $row['ackCount'] = $ackMap[$id] ?? 0;
            $row['totalEmployees'] = $total;
            $row['userAcknowledged'] = !empty($userAcks[$id]);
            $row['version'] = $versions[$id] ?? 1;
        }
        unset($row);
        $current = null;
        foreach ($items as $row) {
            if ((int) ($row['IsCurrent'] ?? 0) === 1) {
                $current = $row;
                break;
            }
        }
        $current = $current ?? ($items[0] ?? null);
        $past = array_values(array_filter($items, static function ($row) use ($current) {
            return !$current || (string) $row['id'] !== (string) $current['id'];
        }));
        json_response(compact('current', 'past') + ['totalEmployees' => $total]);
    }
    if ($method === 'POST' && $path === '/policies') {
        require_admin();
        $body = json_body();
        if (trim((string) ($body['PolicyTitle'] ?? '')) === '' || trim((string) ($body['EffectiveDate'] ?? '')) === '') {
            json_response(['success' => false, 'message' => 'Policy title and effective date are required.'], 400);
        }
        $isCurrent = db_bool($body['IsCurrent'] ?? 0);
        if ($isCurrent) {
            db_execute('UPDATE policies SET IsCurrent=0 WHERE IsCurrent=1');
        }
        db_execute(
            'INSERT INTO policies (PolicyTitle,Description,EffectiveDate,DocumentLink,IsCurrent,Category,ReviewDate) VALUES (?,?,?,?,?,?,?)',
            [$body['PolicyTitle'], $body['Description'] ?? null, $body['EffectiveDate'], $body['DocumentLink'] ?? null, $isCurrent, $body['Category'] ?? null, $body['ReviewDate'] ?? null]
        );
        json_response(['success' => true, 'insertedId' => (int) db()->lastInsertId(), 'message' => 'Policy created successfully'], 201);
    }
    $params = route_params($path, '/policies/:id/acknowledge');
    if ($params !== null && $method === 'POST') {
        $user = require_user();
        ensure_content_schema();
        if (!db_row('SELECT id FROM policies WHERE id=? LIMIT 1', [$params['id']])) {
            json_response(['success' => false, 'message' => 'Policy not found.'], 404);
        }
        db_execute(
            "INSERT IGNORE INTO policy_acknowledgements (PolicyID,UserID,UserName,Department,AckSource) VALUES (?,?,?,?,'self')",
            [$params['id'], (string) ($user['id'] ?? ''), $user['name'] ?? null, $user['department'] ?? null]
        );
        json_response(['success' => true, 'message' => 'Policy acknowledged successfully']);
    }
    $params = route_params($path, '/policies/:id/acknowledge-all');
    if ($params !== null && $method === 'POST') {
        $admin = require_admin();
        ensure_content_schema();
        if (!db_row('SELECT id FROM policies WHERE id=? LIMIT 1', [$params['id']])) {
            json_response(['success' => false, 'message' => 'Policy not found.'], 404);
        }
        $before = (int) (safe_scalar('SELECT COUNT(*) FROM policy_acknowledgements WHERE PolicyID=?', [$params['id']]) ?? 0);
        db_execute(
            "INSERT IGNORE INTO policy_acknowledgements (PolicyID,UserID,UserName,Department,AckSource,AcknowledgedByAdminID,AcknowledgedByAdminName)
             SELECT ?,EmployeeID,EmployeeName,Department,'admin_all',?,? FROM employees WHERE EmployeeID IS NOT NULL AND EmployeeID<>''",
            [$params['id'], $admin['id'] ?? null, $admin['name'] ?? null]
        );
        $total = (int) (safe_scalar("SELECT COUNT(*) FROM employees WHERE EmployeeID IS NOT NULL AND EmployeeID<>''") ?? 0);
        $after = (int) (safe_scalar('SELECT COUNT(*) FROM policy_acknowledgements WHERE PolicyID=?', [$params['id']]) ?? 0);
        json_response(['success' => true, 'added' => $after - $before, 'skipped' => $before, 'totalEmployees' => $total, 'acknowledgedTotal' => $after]);
    }
    $params = route_params($path, '/policies/:id/acknowledgements');
    if ($params !== null && $method === 'GET') {
        require_admin();
        ensure_content_schema();
        $acked = db_rows('SELECT UserID,UserName,Department,AcknowledgedAt,AckSource,AcknowledgedByAdminID,AcknowledgedByAdminName FROM policy_acknowledgements WHERE PolicyID=? ORDER BY AcknowledgedAt DESC', [$params['id']]);
        $notAcked = db_rows('SELECT e.EmployeeID,e.EmployeeName AS Name,e.Department FROM employees e WHERE e.EmployeeID NOT IN (SELECT UserID FROM policy_acknowledgements WHERE PolicyID=?) ORDER BY e.Department,e.EmployeeName', [$params['id']]);
        json_response(['acknowledged' => $acked, 'notAcknowledged' => $notAcked, 'ackCount' => count($acked), 'totalEmployees' => count($acked) + count($notAcked)]);
    }
    $params = route_params($path, '/policies/:id/restore');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        if (!db_row('SELECT id FROM policies WHERE id=? LIMIT 1', [$params['id']])) {
            json_response(['success' => false, 'message' => 'Policy not found.'], 404);
        }
        db_execute('UPDATE policies SET IsCurrent=0 WHERE IsCurrent=1');
        db_execute('UPDATE policies SET IsCurrent=1 WHERE id=?', [$params['id']]);
        json_response(['success' => true, 'message' => 'Policy restored successfully']);
    }
    $params = route_params($path, '/policies/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        $existing = db_row('SELECT DocumentLink FROM policies WHERE id=? LIMIT 1', [$params['id']]);
        if (!$existing) {
            json_response(['success' => false, 'message' => 'Policy not found.'], 404);
        }
        $isCurrent = db_bool($body['IsCurrent'] ?? 0);
        if ($isCurrent) {
            db_execute('UPDATE policies SET IsCurrent=0 WHERE IsCurrent=1 AND id<>?', [$params['id']]);
        }
        db_execute('UPDATE policies SET PolicyTitle=?,Description=?,EffectiveDate=?,DocumentLink=?,IsCurrent=?,Category=?,ReviewDate=? WHERE id=?', [
            $body['PolicyTitle'] ?? '', $body['Description'] ?? null, $body['EffectiveDate'] ?? null, $body['DocumentLink'] ?? null,
            $isCurrent, $body['Category'] ?? null, $body['ReviewDate'] ?? null, $params['id'],
        ]);
        delete_replaced_upload($existing['DocumentLink'] ?? null, $body['DocumentLink'] ?? null);
        json_response(['success' => true, 'message' => 'Policy updated successfully']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        $existing = db_row('SELECT DocumentLink FROM policies WHERE id=? LIMIT 1', [$params['id']]);
        if (!$existing) {
            json_response(['success' => false, 'message' => 'Policy not found.'], 404);
        }
        db_execute('DELETE FROM policy_acknowledgements WHERE PolicyID=?', [$params['id']]);
        db_execute('DELETE FROM policies WHERE id=?', [$params['id']]);
        delete_uploaded_file($existing['DocumentLink'] ?? '');
        json_response(['success' => true, 'message' => 'Policy deleted successfully']);
    }
    return false;
}

function handle_committee_routes(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/pagedata/committees') {
        require_user();
        ensure_content_schema();
        $items = db_rows('SELECT *,id AS rowIndex FROM committees ORDER BY TermStartDate DESC');
        foreach ($items as &$row) {
            $row['SubCommitteeData'] = json_array_value($row['SubCommitteeData'] ?? []);
        }
        unset($row);
        $current = null;
        foreach ($items as $row) {
            if ((int) ($row['IsCurrent'] ?? 0) === 1) {
                $current = $row;
                break;
            }
        }
        $current = $current ?? ($items[0] ?? null);
        $past = array_values(array_filter($items, static function ($row) use ($current) {
            return !$current || (string) $row['id'] !== (string) $current['id'];
        }));
        json_response(compact('current', 'past'));
    }
    if ($method === 'POST' && $path === '/committees') {
        require_admin();
        $body = json_body();
        if (empty($body['CommitteeTitle']) || empty($body['TermStartDate']) || empty($body['TermEndDate'])) {
            json_response(['success' => false, 'message' => 'Required committee fields are missing.'], 400);
        }
        ensure_content_schema();
        $isCurrent = db_bool($body['IsCurrent'] ?? 0);
        if ($isCurrent) {
            db_execute('UPDATE committees SET IsCurrent=0 WHERE IsCurrent=1');
        }
        db_execute('INSERT INTO committees (CommitteeTitle,TermStartDate,TermEndDate,MainOrgChartLink,AppointmentDocLink,IsCurrent,SubCommitteeData) VALUES (?,?,?,?,?,?,?)', [
            $body['CommitteeTitle'], $body['TermStartDate'], $body['TermEndDate'], $body['MainOrgChartLink'] ?? null,
            $body['AppointmentDocLink'] ?? null, $isCurrent, json_encode(json_array_value($body['SubCommitteeData'] ?? []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        json_response(['success' => true, 'insertedId' => (int) db()->lastInsertId(), 'message' => 'Committee created successfully'], 201);
    }
    $params = route_params($path, '/committees/:id/restore');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        db_execute('UPDATE committees SET IsCurrent=0 WHERE IsCurrent=1');
        db_execute('UPDATE committees SET IsCurrent=1 WHERE id=?', [$params['id']]);
        json_response(['success' => true, 'message' => 'Committee restored successfully']);
    }
    $params = route_params($path, '/committees/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        $existing = db_row('SELECT MainOrgChartLink,AppointmentDocLink,SubCommitteeData FROM committees WHERE id=? LIMIT 1', [$params['id']]);
        if (!$existing) {
            json_response(['success' => false, 'message' => 'Committee not found.'], 404);
        }
        $isCurrent = db_bool($body['IsCurrent'] ?? 0);
        if ($isCurrent) {
            db_execute('UPDATE committees SET IsCurrent=0 WHERE IsCurrent=1 AND id<>?', [$params['id']]);
        }
        $nextJson = json_encode(json_array_value($body['SubCommitteeData'] ?? []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        db_execute('UPDATE committees SET CommitteeTitle=?,TermStartDate=?,TermEndDate=?,MainOrgChartLink=?,AppointmentDocLink=?,IsCurrent=?,SubCommitteeData=? WHERE id=?', [
            $body['CommitteeTitle'] ?? '', $body['TermStartDate'] ?? null, $body['TermEndDate'] ?? null, $body['MainOrgChartLink'] ?? null,
            $body['AppointmentDocLink'] ?? null, $isCurrent, $nextJson, $params['id'],
        ]);
        delete_replaced_upload($existing['MainOrgChartLink'] ?? null, $body['MainOrgChartLink'] ?? null);
        delete_replaced_upload($existing['AppointmentDocLink'] ?? null, $body['AppointmentDocLink'] ?? null);
        $nextUrls = committee_file_urls($nextJson);
        foreach (committee_file_urls($existing['SubCommitteeData'] ?? []) as $url) {
            if (!in_array($url, $nextUrls, true)) {
                delete_uploaded_file($url);
            }
        }
        json_response(['success' => true, 'message' => 'Committee updated successfully']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        $existing = db_row('SELECT MainOrgChartLink,AppointmentDocLink,SubCommitteeData FROM committees WHERE id=? LIMIT 1', [$params['id']]);
        if (!$existing) {
            json_response(['success' => false, 'message' => 'Committee not found.'], 404);
        }
        db_execute('DELETE FROM committees WHERE id=?', [$params['id']]);
        delete_uploaded_file($existing['MainOrgChartLink'] ?? '');
        delete_uploaded_file($existing['AppointmentDocLink'] ?? '');
        foreach (committee_file_urls($existing['SubCommitteeData'] ?? []) as $url) {
            delete_uploaded_file($url);
        }
        json_response(['success' => true, 'message' => 'Committee deleted successfully']);
    }
    return false;
}

function kpi_fields(): array
{
    return ['Year','AnnouncementID','Metric','Department','Target','Unit','Direction','Weight','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
}

function kpi_safe_data(array $body): array
{
    return array_intersect_key($body, array_flip(kpi_fields()));
}

function kpi_announcement_id(string $date): string
{
    $year = (int) substr($date, 0, 4) ?: (int) date('Y');
    $base = 'KPI-' . $year;
    $id = $base;
    $suffix = 2;
    while (db_row('SELECT AnnouncementID FROM kpiannouncements WHERE AnnouncementID=? LIMIT 1', [$id])) {
        $id = $base . '-' . $suffix++;
    }
    return $id;
}

function kpi_announcement_payload(array $body, ?array $existing = null): array
{
    return [
        'AnnouncementTitle' => $body['AnnouncementTitle'] ?? ($existing['AnnouncementTitle'] ?? ''),
        'EffectiveDate' => $body['EffectiveDate'] ?? ($existing['EffectiveDate'] ?? null),
        'DocumentLink' => array_key_exists('DocumentLink', $body) ? ($body['DocumentLink'] ?: null) : ($existing['DocumentLink'] ?? null),
        'IsCurrent' => db_bool($body['IsCurrent'] ?? ($existing['IsCurrent'] ?? 0)),
    ];
}

function kpi_update_announcement(string $id, array $body): void
{
    $existing = db_row('SELECT AnnouncementTitle,EffectiveDate,DocumentLink,IsCurrent FROM kpiannouncements WHERE AnnouncementID=? LIMIT 1', [$id]);
    if (!$existing) {
        json_response(['success' => false, 'message' => 'KPI announcement not found.'], 404);
    }
    $data = kpi_announcement_payload($body, $existing);
    if (empty($data['AnnouncementTitle']) || empty($data['EffectiveDate'])) {
        json_response(['success' => false, 'message' => 'Announcement title and effective date are required.'], 400);
    }
    if ($data['IsCurrent']) {
        db_execute('UPDATE kpiannouncements SET IsCurrent=0 WHERE IsCurrent=1 AND AnnouncementID<>?', [$id]);
    }
    db_execute('UPDATE kpiannouncements SET AnnouncementTitle=?,EffectiveDate=?,DocumentLink=?,IsCurrent=? WHERE AnnouncementID=?', [
        $data['AnnouncementTitle'],
        $data['EffectiveDate'],
        $data['DocumentLink'],
        $data['IsCurrent'],
        $id,
    ]);
    delete_replaced_upload($existing['DocumentLink'] ?? null, $data['DocumentLink'] ?? null);
}

function kpi_delete_announcement(string $id): void
{
    $existing = db_row('SELECT DocumentLink FROM kpiannouncements WHERE AnnouncementID=? LIMIT 1', [$id]);
    if (!$existing) {
        json_response(['success' => false, 'message' => 'KPI announcement not found.'], 404);
    }
    if ((int) (safe_scalar('SELECT COUNT(*) FROM kpidata WHERE AnnouncementID=?', [$id]) ?? 0) > 0) {
        json_response(['success' => false, 'message' => 'ประกาศนี้มี KPI ผูกอยู่ กรุณาย้ายหรือลบ KPI ก่อนลบประกาศ'], 409);
    }
    db_execute('DELETE FROM kpiannouncements WHERE AnnouncementID=?', [$id]);
    delete_uploaded_file($existing['DocumentLink'] ?? '');
}

function kpi_update(int $id, array $data): void
{
    if (!$data) {
        return;
    }
    $sets = [];
    $params = [];
    foreach ($data as $field => $value) {
        $sets[] = '`' . $field . '`=?';
        $params[] = $value === '' ? null : $value;
    }
    $params[] = $id;
    db_execute('UPDATE kpidata SET ' . implode(',', $sets) . ' WHERE id=?', $params);
}

function handle_kpi_routes(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/pagedata/kpi-announcements') {
        require_user();
        ensure_content_schema();
        $items = db_rows('SELECT *,AnnouncementID AS id,AnnouncementID AS rowIndex FROM kpiannouncements ORDER BY EffectiveDate DESC');
        $current = null;
        foreach ($items as $row) {
            if ((int) ($row['IsCurrent'] ?? 0) === 1) {
                $current = $row;
                break;
            }
        }
        $current = $current ?? ($items[0] ?? null);
        $past = array_values(array_filter($items, static function ($row) use ($current) {
            return !$current || (string) $row['AnnouncementID'] !== (string) $current['AnnouncementID'];
        }));
        json_response(compact('current', 'past'));
    }
    if ($method === 'GET' && $path === '/kpiannouncements') {
        require_admin();
        ensure_content_schema();
        json_response(db_rows('SELECT *,AnnouncementID AS id FROM kpiannouncements ORDER BY EffectiveDate DESC'));
    }
    if ($method === 'POST' && $path === '/kpiannouncements') {
        require_admin();
        ensure_content_schema();
        $body = json_body();
        if (empty($body['AnnouncementTitle']) || empty($body['EffectiveDate'])) {
            json_response(['success' => false, 'message' => 'Announcement title and effective date are required.'], 400);
        }
        $id = kpi_announcement_id((string) $body['EffectiveDate']);
        $isCurrent = db_bool($body['IsCurrent'] ?? 0);
        if ($isCurrent) {
            db_execute('UPDATE kpiannouncements SET IsCurrent=0 WHERE IsCurrent=1');
        }
        db_execute('INSERT INTO kpiannouncements (AnnouncementID,AnnouncementTitle,EffectiveDate,DocumentLink,IsCurrent) VALUES (?,?,?,?,?)', [$id, $body['AnnouncementTitle'], $body['EffectiveDate'], $body['DocumentLink'] ?? null, $isCurrent]);
        json_response(['success' => true, 'insertedId' => $id, 'message' => 'KPI announcement created successfully'], 201);
    }
    if ($path === '/kpiannouncements/item' && in_array($method, ['PUT', 'DELETE'], true)) {
        require_admin();
        ensure_content_schema();
        $body = $method === 'PUT' ? json_body() : [];
        $id = (string) ($_GET['id'] ?? $body['id'] ?? $body['AnnouncementID'] ?? '');
        if ($id === '') {
            json_response(['success' => false, 'message' => 'KPI announcement id is required.'], 400);
        }
        if ($method === 'PUT') {
            kpi_update_announcement($id, $body);
            json_response(['success' => true, 'message' => 'KPI announcement updated successfully']);
        }
        kpi_delete_announcement($id);
        json_response(['success' => true, 'message' => 'KPI announcement deleted successfully']);
    }
    $params = route_params($path, '/kpiannouncements/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        ensure_content_schema();
        kpi_update_announcement((string) $params['id'], json_body());
        json_response(['success' => true, 'message' => 'KPI announcement updated successfully']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        ensure_content_schema();
        kpi_delete_announcement((string) $params['id']);
        json_response(['success' => true, 'message' => 'KPI announcement deleted successfully']);
    }
    if ($method === 'PUT' && $path === '/kpidata/bulk') {
        require_admin();
        $rows = json_body();
        if (isset($rows['id'])) {
            $rows = [$rows];
        }
        $updated = 0;
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['id'])) {
                continue;
            }
            $id = (int) $row['id'];
            unset($row['id']);
            kpi_update($id, kpi_safe_data($row));
            $updated++;
        }
        json_response(['success' => true, 'updated' => $updated]);
    }
    $params = route_params($path, '/kpidata/:id');
    if ($params !== null && $method === 'GET') {
        require_user();
        json_response(db_rows('SELECT *,id AS rowIndex FROM kpidata WHERE Year=?', [$params['id']]));
    }
    if ($method === 'POST' && $path === '/kpidata') {
        require_admin();
        $data = kpi_safe_data(json_body());
        if (empty($data['Year']) || empty($data['AnnouncementID']) || empty($data['Metric']) || !array_key_exists('Target', $data)) {
            json_response(['success' => false, 'message' => 'Year, announcement, metric, and target are required.'], 400);
        }
        $fields = array_keys($data);
        db_execute('INSERT INTO kpidata (`' . implode('`,`', $fields) . '`) VALUES (' . implode(',', array_fill(0, count($fields), '?')) . ')', array_values($data));
        json_response(['success' => true, 'insertedId' => (int) db()->lastInsertId(), 'message' => 'KPI created successfully'], 201);
    }
    if ($params !== null && $method === 'PUT') {
        require_admin();
        if (!db_row('SELECT id FROM kpidata WHERE id=? LIMIT 1', [$params['id']])) {
            json_response(['success' => false, 'message' => 'KPI not found.'], 404);
        }
        kpi_update((int) $params['id'], kpi_safe_data(json_body()));
        json_response(['success' => true, 'message' => 'KPI updated successfully']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        db_execute('DELETE FROM kpidata WHERE id=?', [$params['id']]);
        json_response(['success' => true, 'message' => 'KPI deleted successfully']);
    }
    return false;
}

function handle_content_routes(string $method, string $path): bool
{
    handle_policy_routes($method, $path);
    handle_committee_routes($method, $path);
    handle_kpi_routes($method, $path);
    return false;
}
