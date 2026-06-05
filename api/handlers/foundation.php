<?php
declare(strict_types=1);

function handle_foundation_routes(string $method, string $path): bool
{
    if ($method === 'POST' && $path === '/change-password') {
        $user = require_user();
        $body = json_body();
        $currentPassword = (string) ($body['currentPassword'] ?? '');
        $newPassword = (string) ($body['newPassword'] ?? '');
        if ($currentPassword === '' || $newPassword === '') {
            json_response(['success' => false, 'message' => 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่'], 400);
        }
        if (strlen($newPassword) < 4) {
            json_response(['success' => false, 'message' => 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
        }
        $employee = db_row('SELECT EmployeeID, Password FROM employees WHERE EmployeeID = ? LIMIT 1', [(string) ($user['id'] ?? '')]);
        if (!$employee) {
            json_response(['success' => false, 'message' => 'ไม่พบผู้ใช้'], 404);
        }
        $valid = !empty($employee['Password'])
            ? password_verify($currentPassword, (string) $employee['Password'])
            : hash_equals((string) $employee['EmployeeID'], $currentPassword);
        if (!$valid) {
            json_response(['success' => false, 'message' => 'รหัสผ่านปัจจุบันไม่ถูกต้อง'], 401);
        }
        db_execute('UPDATE employees SET Password = ? WHERE EmployeeID = ?', [
            password_hash($newPassword, PASSWORD_BCRYPT),
            $employee['EmployeeID'],
        ]);
        json_response(['success' => true, 'message' => 'เปลี่ยนรหัสผ่านสำเร็จ']);
    }

    if ($method === 'POST' && $path === '/register') {
        $body = json_body();
        $employeeId = trim((string) ($body['EmployeeID'] ?? ''));
        $employeeName = trim((string) ($body['EmployeeName'] ?? ''));
        $department = trim((string) ($body['Department'] ?? ''));
        $position = trim((string) ($body['Position'] ?? ''));
        $unit = trim((string) ($body['Unit'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($employeeId === '' || $employeeName === '' || $department === '' || $position === '' || $password === '') {
            json_response(['success' => false, 'message' => 'กรุณากรอกข้อมูลให้ครบถ้วน'], 400);
        }
        if (strlen($password) < 4) {
            json_response(['success' => false, 'message' => 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
        }
        if (db_row('SELECT EmployeeID FROM employees WHERE EmployeeID = ? LIMIT 1', [$employeeId])) {
            json_response(['success' => false, 'message' => 'รหัสพนักงานนี้มีอยู่แล้วในระบบ'], 400);
        }
        db_execute(
            'INSERT INTO employees (EmployeeID, EmployeeName, Department, Unit, Team, Position, Role, Password) VALUES (?,?,?,?,?,?,?,?)',
            [$employeeId, $employeeName, $department, $unit, '', $position, 'User', password_hash($password, PASSWORD_BCRYPT)]
        );
        json_response(['success' => true, 'message' => 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสที่ตั้งไว้']);
    }

    if ($method === 'PUT' && $path === '/profile') {
        $user = require_user();
        $body = json_body();
        $employeeName = trim((string) ($body['EmployeeName'] ?? ''));
        if ($employeeName === '') {
            json_response(['success' => false, 'message' => 'กรุณาระบุชื่อ-นามสกุล'], 400);
        }
        db_execute('UPDATE employees SET EmployeeName=?, Department=?, Unit=?, Position=? WHERE EmployeeID=?', [
            $employeeName,
            trim((string) ($body['Department'] ?? '')),
            trim((string) ($body['Unit'] ?? '')),
            trim((string) ($body['Position'] ?? '')),
            (string) ($user['id'] ?? ''),
        ]);
        json_response(['success' => true, 'message' => 'อัปเดตโปรไฟล์สำเร็จ']);
    }

    if ($method === 'PUT' && $path === '/profile/safety-unit') {
        $user = require_user();
        if (strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0) {
            json_response(['success' => false, 'message' => 'Admin does not require Safety Unit gate.'], 400);
        }
        $body = json_body();
        $unit = trim((string) ($body['Unit'] ?? ''));
        if ($unit === '') {
            json_response(['success' => false, 'message' => 'Safety Unit is required.'], 400);
        }
        $employee = db_row('SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role FROM employees WHERE EmployeeID=? LIMIT 1', [
            (string) ($user['id'] ?? ''),
        ]);
        if (!$employee) {
            json_response(['success' => false, 'message' => 'User not found.'], 404);
        }
        $department = trim((string) ($employee['Department'] ?? ''));
        $allowed = db_row(
            'SELECT u.id FROM master_safetyunits u JOIN master_departments d ON d.id=u.department_id
             WHERE TRIM(d.Name)=? AND u.name=? LIMIT 1',
            [$department, $unit]
        );
        if (!$allowed) {
            json_response(['success' => false, 'message' => 'Safety Unit is not allowed for your department.'], 400);
        }
        db_execute('UPDATE employees SET Unit=? WHERE EmployeeID=?', [$unit, (string) $employee['EmployeeID']]);
        $employee['Unit'] = $unit;
        $updatedUser = user_data($employee);
        json_response(['success' => true, 'message' => 'Safety Unit saved.', 'token' => jwt_sign($updatedUser), 'user' => $updatedUser]);
    }

    if ($method === 'PUT' && $path === '/profile/employee-id') {
        $user = require_user();
        $body = json_body();
        $oldId = (string) ($user['id'] ?? '');
        $newId = strtoupper(trim((string) ($body['newEmployeeID'] ?? '')));
        if ($newId === '') {
            json_response(['success' => false, 'message' => 'กรุณาระบุรหัสพนักงานใหม่'], 400);
        }
        if ($newId === $oldId) {
            json_response(['success' => false, 'message' => 'รหัสพนักงานเหมือนเดิม ไม่มีการเปลี่ยนแปลง'], 400);
        }
        if (db_row('SELECT EmployeeID FROM employees WHERE EmployeeID = ? LIMIT 1', [$newId])) {
            json_response(['success' => false, 'message' => 'รหัสพนักงานใหม่มีอยู่แล้วในระบบ'], 400);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            db_execute('UPDATE employees SET EmployeeID = ? WHERE EmployeeID = ?', [$newId, $oldId]);
            $cascades = [
                'UPDATE patrol_attendance SET UserID=? WHERE UserID=?',
                'UPDATE patrol_self_checkin SET EmployeeID=? WHERE EmployeeID=?',
                'UPDATE cccf_activity SET EmployeeID=? WHERE EmployeeID=?',
                'UPDATE ky_activities SET ReporterID=? WHERE ReporterID=?',
                'UPDATE fourm_changenotices SET CreatedByID=? WHERE CreatedByID=?',
                'UPDATE sc_ppeinspections SET InspectorID=? WHERE InspectorID=?',
                'UPDATE yokotenresponses SET EmployeeID=? WHERE EmployeeID=?',
                'UPDATE policy_acknowledgements SET UserID=? WHERE UserID=?',
                'UPDATE admin_auditlogs SET AdminID=? WHERE AdminID=?',
            ];
            foreach ($cascades as $sql) {
                try {
                    db_execute($sql, [$newId, $oldId]);
                } catch (Throwable $error) {
                    error_log('[php-api] cascade EmployeeID skipped: ' . $error->getMessage());
                }
            }
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
        $employee = db_row('SELECT EmployeeID, EmployeeName, Department, Role, Team FROM employees WHERE EmployeeID = ? LIMIT 1', [$newId]);
        $updatedUser = user_data($employee ?: []);
        json_response(['success' => true, 'message' => 'เปลี่ยนรหัสพนักงานสำเร็จ', 'token' => jwt_sign($updatedUser), 'user' => $updatedUser]);
    }

    if ($method === 'GET' && $path === '/employees') {
        require_user();
        json_response(['success' => true, 'data' => db_rows('SELECT * FROM employees ORDER BY EmployeeName ASC')]);
    }

    $params = route_params($path, '/employees/:id');
    if ($params !== null && $method === 'GET') {
        require_user();
        $employee = db_row('SELECT * FROM employees WHERE EmployeeID = ? LIMIT 1', [$params['id']]);
        if (!$employee) {
            json_response(['success' => false, 'message' => 'ไม่พบพนักงาน'], 404);
        }
        json_response(['success' => true, 'data' => $employee]);
    }
    if ($method === 'POST' && $path === '/employees') {
        require_admin();
        create_employee(json_body());
    }
    if ($params !== null && $method === 'PUT') {
        require_admin();
        update_employee($params['id'], json_body());
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        db_execute('DELETE FROM employees WHERE EmployeeID = ?', [$params['id']]);
        json_response(['success' => true, 'message' => 'ลบข้อมูลสำเร็จ']);
    }

    if ($method === 'GET' && $path === '/admin/employees') {
        require_admin();
        json_response(['success' => true, 'data' => db_rows(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail, Role FROM employees ORDER BY Department, EmployeeName'
        )]);
    }
    if ($method === 'POST' && $path === '/admin/employee/create') {
        require_admin();
        create_employee(json_body());
    }
    if ($method === 'POST' && $path === '/admin/employee/update') {
        require_admin();
        $body = json_body();
        update_employee((string) ($body['EmployeeID'] ?? ''), $body);
    }
    if ($method === 'POST' && $path === '/admin/employees/import') {
        require_admin();
        $body = json_body();
        $rows = $body['data'] ?? null;
        if (!is_array($rows)) {
            json_response(['success' => false, 'message' => 'Invalid data'], 400);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            foreach ($rows as $employee) {
                if (!is_array($employee)) {
                    continue;
                }
                $employeeId = trim((string) ($employee['EmployeeID'] ?? ''));
                $employeeName = trim((string) ($employee['EmployeeName'] ?? ''));
                if ($employeeId === '' || $employeeName === '') {
                    continue;
                }
                $email = validate_company_email($employee['CompanyEmail'] ?? $employee['Email'] ?? '');
                if (!$email['ok']) {
                    throw new InvalidArgumentException($email['message']);
                }
                db_execute(
                    'INSERT INTO employees (EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail, Role)
                     VALUES (?,?,?,?,?,?,?,?)
                     ON DUPLICATE KEY UPDATE EmployeeName=VALUES(EmployeeName), Department=VALUES(Department),
                       Unit=VALUES(Unit), Team=VALUES(Team), Position=VALUES(Position),
                       CompanyEmail=VALUES(CompanyEmail), Role=VALUES(Role)',
                    [
                        $employeeId, $employeeName, trim((string) ($employee['Department'] ?? '')),
                        trim((string) ($employee['Unit'] ?? '')), trim((string) ($employee['Team'] ?? '')),
                        trim((string) ($employee['Position'] ?? $employee['Team'] ?? '')),
                        $email['email'], normalize_role($employee['Role'] ?? 'User'),
                    ]
                );
            }
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
        json_response(['success' => true, 'message' => 'Imported ' . count($rows) . ' rows']);
    }
    if ($method === 'POST' && $path === '/admin/employee/import') {
        require_admin();
        $rows = json_decode((string) ($_POST['rows'] ?? ''), true);
        if (!is_array($rows) && !empty($_POST['rowsBase64'])) {
            $decodedRows = base64_decode((string) $_POST['rowsBase64'], true);
            $rows = $decodedRows === false ? null : json_decode($decodedRows, true);
        }
        if (!is_array($rows)) {
            json_response(['success' => false, 'message' => 'Excel rows were not provided. Please refresh the page and try again.'], 400);
        }
        $departments = array_flip(array_column(db_rows('SELECT Name FROM master_departments'), 'Name'));
        $positions = array_flip(array_column(db_rows('SELECT Name FROM master_positions'), 'Name'));
        $details = [];
        $successCount = 0;
        $errorCount = 0;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = trim((string) ($row['EmployeeID'] ?? $row['ID'] ?? ''));
            $name = trim((string) ($row['EmployeeName'] ?? $row['Name'] ?? ''));
            if ($id === '' || $name === '') {
                $details[] = ['id' => $id ?: '-', 'name' => $name ?: '-', 'status' => 'skip', 'reason' => 'EmployeeID and EmployeeName are required'];
                $errorCount++;
                continue;
            }
            $department = trim((string) ($row['Department'] ?? $row['Dept'] ?? ''));
            $position = trim((string) ($row['Position'] ?? ''));
            $role = normalize_role($row['Role'] ?? 'User');
            $email = validate_company_email($row['CompanyEmail'] ?? $row['Company Email'] ?? $row['Email'] ?? '');
            if (!$email['ok']) {
                $details[] = ['id' => $id, 'name' => $name, 'status' => 'skip', 'reason' => $email['message']];
                $errorCount++;
                continue;
            }
            $warnings = [];
            if ($department !== '' && !isset($departments[$department])) {
                $warnings[] = 'Department does not match master';
            }
            if ($position !== '' && !isset($positions[$position])) {
                $warnings[] = 'Position does not match master';
            }
            db_execute(
                'INSERT INTO employees (EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail,Role) VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE EmployeeName=VALUES(EmployeeName),Department=VALUES(Department),Unit=VALUES(Unit),
                   Position=VALUES(Position),CompanyEmail=VALUES(CompanyEmail),Role=VALUES(Role)',
                [$id, $name, $department, trim((string) ($row['Unit'] ?? '')), $position, $email['email'], $role]
            );
            $successCount++;
            $details[] = ['id' => $id, 'name' => $name, 'status' => $warnings ? 'warn' : 'ok', 'reason' => implode(' | ', $warnings)];
        }
        json_response([
            'success' => true, 'message' => 'Imported ' . $successCount . ' rows',
            'successCount' => $successCount, 'errorCount' => $errorCount,
            'warnCount' => count(array_filter($details, static function ($row) {
                return ($row['status'] ?? '') === 'warn';
            })),
            'details' => $details,
        ]);
    }
    $params = route_params($path, '/admin/employee/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        update_employee($params['id'], json_body());
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        db_execute('DELETE FROM employees WHERE EmployeeID = ?', [$params['id']]);
        json_response(['success' => true, 'message' => 'ลบข้อมูลสำเร็จ']);
    }
    $params = route_params($path, '/admin/employee/:id/reset-password');
    if ($params !== null && $method === 'POST') {
        require_admin();
        $newPassword = (string) (json_body()['newPassword'] ?? '');
        if (strlen($newPassword) < 4) {
            json_response(['success' => false, 'message' => 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
        }
        if (!db_execute('UPDATE employees SET Password=? WHERE EmployeeID=?', [password_hash($newPassword, PASSWORD_BCRYPT), $params['id']])) {
            json_response(['success' => false, 'message' => 'ไม่พบพนักงาน'], 404);
        }
        json_response(['success' => true, 'message' => 'รีเซ็ตรหัสผ่านสำเร็จ']);
    }
    if ($method === 'GET' && $path === '/admin/employee/import-template-data') {
        require_admin();
        json_response([
            'success' => true,
            'departments' => array_column(db_rows('SELECT Name FROM master_departments ORDER BY Name'), 'Name'),
            'positions' => array_column(db_rows('SELECT Name FROM master_positions ORDER BY Name'), 'Name'),
            'units' => array_column(db_rows('SELECT name FROM master_safetyunits ORDER BY name'), 'name'),
            'roles' => ['Admin', 'User', 'Viewer'],
        ]);
    }

    return false;
}

function create_employee(array $body)
{
    $employeeId = trim((string) ($body['EmployeeID'] ?? ''));
    $employeeName = trim((string) ($body['EmployeeName'] ?? ''));
    if ($employeeId === '' || $employeeName === '') {
        json_response(['success' => false, 'message' => 'กรุณาระบุรหัสและชื่อพนักงาน'], 400);
    }
    if (db_row('SELECT EmployeeID FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId])) {
        json_response(['success' => false, 'message' => 'รหัสพนักงานนี้มีอยู่แล้วในระบบ'], 400);
    }
    $email = validate_company_email($body['CompanyEmail'] ?? '');
    if (!$email['ok']) {
        json_response(['success' => false, 'message' => $email['message']], 400);
    }
    db_execute(
        'INSERT INTO employees (EmployeeID, EmployeeName, Department, Unit, Team, Position, CompanyEmail, Role) VALUES (?,?,?,?,?,?,?,?)',
        [$employeeId, $employeeName, trim((string) ($body['Department'] ?? '')), trim((string) ($body['Unit'] ?? '')), trim((string) ($body['Team'] ?? '')), trim((string) ($body['Position'] ?? '')), $email['email'], normalize_role($body['Role'] ?? 'User')]
    );
    json_response(['success' => true, 'message' => 'เพิ่มพนักงานสำเร็จ']);
}

function update_employee(string $employeeId, array $body)
{
    $employeeName = trim((string) ($body['EmployeeName'] ?? ''));
    if ($employeeName === '') {
        json_response(['success' => false, 'message' => 'กรุณาระบุชื่อพนักงาน'], 400);
    }
    $email = validate_company_email($body['CompanyEmail'] ?? '');
    if (!$email['ok']) {
        json_response(['success' => false, 'message' => $email['message']], 400);
    }
    $count = db_execute(
        'UPDATE employees SET EmployeeName=?, Department=?, Unit=?, Team=?, Position=?, CompanyEmail=?, Role=? WHERE EmployeeID=?',
        [$employeeName, trim((string) ($body['Department'] ?? '')), trim((string) ($body['Unit'] ?? '')), trim((string) ($body['Team'] ?? '')), trim((string) ($body['Position'] ?? '')), $email['email'], normalize_role($body['Role'] ?? 'User'), $employeeId]
    );
    if (!$count && !db_row('SELECT EmployeeID FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId])) {
        json_response(['success' => false, 'message' => 'ไม่พบพนักงาน'], 404);
    }
    json_response(['success' => true, 'message' => 'อัปเดตข้อมูลสำเร็จ']);
}
