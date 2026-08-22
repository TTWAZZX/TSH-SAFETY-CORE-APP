<?php
declare(strict_types=1);

function dashboard_default_config(): array
{
    return ['healthGreen' => 85, 'healthAmber' => 65, 'alertDueSoonDays' => 7, 'hiddenModules' => [], 'pinnedDepartments' => [], 'cccfWorkerSource' => 'manual_unit_target', 'cccfWorkerSourceByYear' => []];
}

function dashboard_config(): array
{
    $default = dashboard_default_config();
    $row = db_row("SELECT ConfigValue FROM dashboard_config WHERE ConfigKey='enterprise' LIMIT 1");
    $value = $row ? json_decode((string) ($row['ConfigValue'] ?? '{}'), true) : [];
    return array_merge($default, is_array($value) ? $value : []);
}

function dashboard_cccf_worker_source_for_year(array $config, int $year): string
{
    $annual = is_array($config['cccfWorkerSourceByYear'] ?? null) ? $config['cccfWorkerSourceByYear'] : [];
    $source = $annual[(string) $year] ?? ($config['cccfWorkerSource'] ?? 'manual_unit_target');
    return $source === 'actual_department_worker' ? 'actual_department_worker' : 'manual_unit_target';
}

function platform_normalize_patrol_flexible_monthly_requirement($value): ?int
{
    if (is_bool($value) || (!is_int($value) && !is_float($value) && !is_string($value))) return null;
    if (is_string($value)) {
        $value = trim($value);
        if ($value === '' || !is_numeric($value)) return null;
    }
    $number = (float) $value;
    if (!is_finite($number)) return null;
    return max(1, min(10, (int) $number));
}

function handle_platform_routes(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/dashboard/config') {
        require_user();
        json_response(['success' => true, 'data' => dashboard_config()]);
    }
    if ($method === 'PUT' && $path === '/dashboard/config') {
        $user = require_admin();
        $body = json_body();
        $clamp = function ($value, $fallback, $min, $max) {
            return is_numeric($value) ? max($min, min($max, (int) $value)) : $fallback;
        };
        $strings = function ($value) {
            return array_slice(array_values(array_filter(array_map('strval', is_array($value) ? $value : []))), 0, 30);
        };
        $sourceByYear = [];
        foreach (is_array($body['cccfWorkerSourceByYear'] ?? null) ? $body['cccfWorkerSourceByYear'] : [] as $year => $source) {
            $yearNo = (int) $year;
            if ($yearNo < 2000 || $yearNo > 2100) continue;
            $sourceByYear[(string) $yearNo] = $source === 'actual_department_worker' ? 'actual_department_worker' : 'manual_unit_target';
        }
        $config = [
            'healthGreen' => $clamp($body['healthGreen'] ?? null, 85, 1, 100),
            'healthAmber' => $clamp($body['healthAmber'] ?? null, 65, 1, 100),
            'alertDueSoonDays' => $clamp($body['alertDueSoonDays'] ?? null, 7, 1, 60),
            'hiddenModules' => $strings($body['hiddenModules'] ?? []),
            'pinnedDepartments' => $strings($body['pinnedDepartments'] ?? []),
            'cccfWorkerSource' => ($body['cccfWorkerSource'] ?? '') === 'actual_department_worker' ? 'actual_department_worker' : 'manual_unit_target',
            'cccfWorkerSourceByYear' => $sourceByYear,
        ];
        db_execute(
            "INSERT INTO dashboard_config (ConfigKey, ConfigValue, UpdatedBy) VALUES ('enterprise', ?, ?)
             ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), UpdatedBy=VALUES(UpdatedBy)",
            [json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (string) ($user['name'] ?? $user['id'] ?? 'Admin')]
        );
        json_response(['success' => true, 'data' => $config, 'message' => 'อัปเดต Dashboard config สำเร็จ']);
    }

    $params = route_params($path, '/settings/:key');
    if ($params !== null && $method === 'GET') {
        require_user();
        $row = db_row('SELECT value FROM app_settings WHERE key_name=? LIMIT 1', [$params['key']]);
        json_response(['value' => $row['value'] ?? null]);
    }
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        if (!array_key_exists('value', $body) || $body['value'] === null) {
            db_execute('DELETE FROM app_settings WHERE key_name=?', [$params['key']]);
        } else {
            if ($params['key'] === 'patrol_flexible_monthly_requirement') {
                $normalized = platform_normalize_patrol_flexible_monthly_requirement($body['value']);
                if ($normalized === null) {
                    json_response(['ok' => false, 'message' => 'Flexible Self-Patrol quota must be a number.'], 400);
                }
                $value = (string) $normalized;
            } else {
                $value = is_string($body['value']) ? $body['value'] : json_encode($body['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            db_execute(
                'INSERT INTO app_settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value), UpdatedAt=NOW()',
                [$params['key'], $value]
            );
        }
        json_response(['ok' => true]);
    }

    $masters = [
        'departments' => ['table' => 'master_departments', 'order' => 'Name ASC'],
        'teams' => ['table' => 'master_teams', 'order' => 'Name ASC'],
        'roles' => ['table' => 'master_roles', 'order' => 'Name ASC'],
        'positions' => ['table' => 'master_positions', 'order' => 'Name ASC'],
        'areas' => ['table' => 'patrol_areas', 'order' => 'SortOrder, id'],
    ];
    foreach ($masters as $key => $meta) {
        if ($method === 'GET' && $path === '/master/' . $key) {
            require_user();
            json_response(['success' => true, 'data' => db_rows('SELECT * FROM ' . $meta['table'] . ' ORDER BY ' . $meta['order'])]);
        }
        if ($method === 'POST' && $path === '/master/' . $key) {
            require_admin();
            $body = json_body();
            if ($key === 'areas') {
                if (trim((string) ($body['Name'] ?? '')) === '' || trim((string) ($body['Code'] ?? '')) === '') {
                    json_response(['success' => false, 'message' => 'กรุณาระบุชื่อและรหัสพื้นที่'], 400);
                }
                db_execute('INSERT INTO patrol_areas (Name, Code, SortOrder) VALUES (?,?,?)', [$body['Name'], $body['Code'], (int) ($body['SortOrder'] ?? 99)]);
            } else {
                if (trim((string) ($body['Name'] ?? '')) === '') {
                    json_response(['success' => false, 'message' => 'กรุณาระบุชื่อ'], 400);
                }
                db_execute('INSERT INTO ' . $meta['table'] . ' (Name) VALUES (?)', [trim((string) $body['Name'])]);
            }
            json_response(['success' => true, 'message' => 'เพิ่มข้อมูลสำเร็จ']);
        }
        $item = route_params($path, '/master/' . $key . '/:id');
        if ($item !== null && $method === 'PUT') {
            require_admin();
            $body = json_body();
            if ($key === 'areas') {
                db_execute('UPDATE patrol_areas SET Name=?, Code=?, SortOrder=? WHERE id=?', [$body['Name'] ?? '', $body['Code'] ?? '', (int) ($body['SortOrder'] ?? 99), $item['id']]);
            } elseif ($key === 'positions') {
                db_execute('UPDATE master_positions SET Name=?, IsSupervisorPatrol=? WHERE id=?', [$body['Name'] ?? '', !empty($body['IsSupervisorPatrol']) ? 1 : 0, $item['id']]);
            } else {
                db_execute('UPDATE ' . $meta['table'] . ' SET Name=? WHERE id=?', [$body['Name'] ?? '', $item['id']]);
            }
            json_response(['success' => true, 'message' => 'อัปเดตข้อมูลสำเร็จ']);
        }
        if ($item !== null && $method === 'DELETE') {
            require_admin();
            db_execute('DELETE FROM ' . $meta['table'] . ' WHERE id=?', [$item['id']]);
            json_response(['success' => true, 'message' => 'ลบข้อมูลสำเร็จ']);
        }
    }

    $params = route_params($path, '/master/positions/:id/supervisor-toggle');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $row = db_row('SELECT IsSupervisorPatrol FROM master_positions WHERE id=? LIMIT 1', [$params['id']]);
        if (!$row) {
            json_response(['success' => false, 'message' => 'ไม่พบตำแหน่ง'], 404);
        }
        $value = !empty($row['IsSupervisorPatrol']) ? 0 : 1;
        db_execute('UPDATE master_positions SET IsSupervisorPatrol=? WHERE id=?', [$value, $params['id']]);
        json_response(['success' => true, 'data' => ['IsSupervisorPatrol' => $value]]);
    }

    if ($method === 'GET' && $path === '/master/safety-units') {
        require_user();
        json_response(['success' => true, 'data' => db_rows(
            'SELECT u.id, u.name, u.short_code, u.department_id, u.sort_order, d.Name AS DeptName
             FROM master_safetyunits u LEFT JOIN master_departments d ON d.id=u.department_id
             ORDER BY u.department_id, u.sort_order, u.name'
        )]);
    }

    if ($method === 'GET' && $path === '/admin/org/departments') {
        require_admin();
        json_response(['success' => true, 'data' => db_rows(
            'SELECT d.id, d.Name, d.is_safety_core, COUNT(u.id) AS unit_count
             FROM master_departments d LEFT JOIN master_safetyunits u ON u.department_id=d.id
             GROUP BY d.id, d.Name, d.is_safety_core ORDER BY d.Name ASC'
        )]);
    }
    $params = route_params($path, '/admin/org/departments/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        $name = trim((string) ($body['Name'] ?? ''));
        if ($name === '') {
            json_response(['success' => false, 'message' => 'กรุณาระบุชื่อแผนก'], 400);
        }
        db_execute('UPDATE master_departments SET Name=?, is_safety_core=? WHERE id=?', [
            $name, !empty($body['is_safety_core']) ? 1 : 0, $params['id'],
        ]);
        json_response(['success' => true, 'message' => 'อัปเดตข้อมูลแผนกสำเร็จ']);
    }
    if ($method === 'GET' && $path === '/admin/org/units') {
        require_admin();
        json_response(['success' => true, 'data' => db_rows(
            'SELECT * FROM master_safetyunits ORDER BY department_id, sort_order, name ASC'
        )]);
    }
    $params = route_params($path, '/admin/org/units/:id');
    if ($params !== null && $method === 'GET') {
        require_admin();
        json_response(['success' => true, 'data' => db_rows(
            'SELECT * FROM master_safetyunits WHERE department_id=? ORDER BY sort_order, name ASC',
            [$params['id']]
        )]);
    }
    if ($method === 'POST' && $path === '/admin/org/units') {
        require_admin();
        $body = json_body();
        $name = trim((string) ($body['name'] ?? ''));
        $departmentId = (int) ($body['department_id'] ?? 0);
        if ($name === '' || !$departmentId) {
            json_response(['success' => false, 'message' => 'กรุณาระบุชื่อ unit และ department_id'], 400);
        }
        db_execute('INSERT INTO master_safetyunits (name, short_code, department_id, sort_order) VALUES (?,?,?,?)', [
            $name, trim((string) ($body['short_code'] ?? '')), $departmentId, (int) ($body['sort_order'] ?? 0),
        ]);
        json_response(['success' => true, 'message' => 'เพิ่ม Safety Unit สำเร็จ']);
    }
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            json_response(['success' => false, 'message' => 'กรุณาระบุชื่อ unit'], 400);
        }
        db_execute('UPDATE master_safetyunits SET name=?, short_code=?, sort_order=? WHERE id=?', [
            $name, trim((string) ($body['short_code'] ?? '')), (int) ($body['sort_order'] ?? 0), $params['id'],
        ]);
        json_response(['success' => true, 'message' => 'แก้ไข Safety Unit สำเร็จ']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        db_execute('DELETE FROM master_safetyunits WHERE id=?', [$params['id']]);
        json_response(['success' => true, 'message' => 'ลบ Safety Unit สำเร็จ']);
    }

    return false;
}
