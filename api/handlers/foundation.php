<?php
declare(strict_types=1);

function handle_foundation_routes(string $method, string $path): bool
{
    if ($method === 'GET' && $path === '/onboarding/status') {
        $user = require_user();
        json_response(['success' => true, 'status' => $user['onboardingStatus']]);
    }

    if ($method === 'POST' && $path === '/change-password') {
        $user = require_user();
        $body = json_body();
        if (!is_string($body['currentPassword'] ?? null) || !is_string($body['newPassword'] ?? null)) {
            json_response(['success' => false, 'code' => 'PASSWORD_FIELDS_REQUIRED', 'message' => 'Current and new passwords are required.'], 400);
        }
        $currentPassword = $body['currentPassword'];
        $newPassword = $body['newPassword'];
        if ($currentPassword === '' || $newPassword === '') {
            json_response(['success' => false, 'code' => 'PASSWORD_FIELDS_REQUIRED', 'message' => 'Current and new passwords are required.'], 400);
        }
        if (strlen($newPassword) < 4) {
            json_response(['success' => false, 'code' => 'PASSWORD_POLICY_VIOLATION', 'message' => 'Password must be at least 4 characters.'], 400);
        }
        try {
            $result = password_continuation_execute(
                db(),
                (string)($user['id'] ?? $user['EmployeeID'] ?? ''),
                $currentPassword,
                $newPassword
            );
        } catch (PasswordContinuationException $error) {
            json_response([
                'success' => false,
                'code' => $error->reason,
                'message' => $error->getMessage(),
            ], $error->httpStatus);
        }
        $updatedUser = user_data($result['employee']);
        auth_audit_log('PASSWORD_CHANGED', (string)$updatedUser['id'], 200, [
            'forced' => !empty($user['mustChangePassword']),
            'onboardingStatus' => $result['status'],
        ], $user);
        json_response([
            'success' => true,
            'message' => 'Password changed successfully.',
            'status' => $result['status'],
            'onboardingStatus' => $result['status'],
            'nextAction' => $result['nextAction'],
            'user' => $updatedUser,
            'token' => jwt_sign($updatedUser),
        ]);
    }

    if ($method === 'POST' && $path === '/register/status') {
        $body = json_body();
        $employeeId = trim((string)($body['EmployeeID'] ?? ''));
        $referenceCode = trim((string)($body['ReferenceCode'] ?? ''));
        if ($employeeId === '' || $referenceCode === '') {
            auth_audit_log('ACCOUNT_REGISTRATION_STATUS_FAILED',$employeeId,400,['reason'=>'missing_status_credentials']);
            json_response(['success'=>false,'message'=>'กรุณากรอกรหัสพนักงานและเลขอ้างอิง'],400);
        }
        ensure_auth_security_schema();
        $request = db_row(
            "SELECT ID,Status,RejectionReason,SubmittedAt,ReviewedAt,StatusViewedAt,StatusViewCount,
                    CASE WHEN CompanyEmail IS NULL OR TRIM(CompanyEmail)='' THEN 0 ELSE 1 END HasCompanyEmail
             FROM registration_requests WHERE EmployeeID=? AND ReferenceCode=? LIMIT 1",
            [$employeeId,$referenceCode]
        );
        if (!$request) {
            auth_audit_log('ACCOUNT_REGISTRATION_STATUS_FAILED',$employeeId,404,['reason'=>'status_not_found']);
            json_response(['success'=>false,'message'=>'ไม่พบคำขอจากข้อมูลที่ระบุ กรุณาตรวจสอบรหัสพนักงานและเลขอ้างอิง'],404);
        }
        $status = (string)($request['Status'] ?? 'Pending');
        $reviewedAt = !empty($request['ReviewedAt']) ? strtotime((string)$request['ReviewedAt']) : false;
        $viewedAt = !empty($request['StatusViewedAt']) ? strtotime((string)$request['StatusViewedAt']) : false;
        $unread = $reviewedAt !== false && ($viewedAt === false || $reviewedAt > $viewedAt);
        db_execute('UPDATE registration_requests SET StatusViewedAt=NOW(),StatusViewCount=COALESCE(StatusViewCount,0)+1 WHERE ID=?',[(int)$request['ID']]);
        $nextAction = $status === 'Approved' ? 'LOGIN'
            : ($status === 'Pending' ? 'WAIT_FOR_REVIEW' : 'CONTACT_ADMIN');
        auth_audit_log('ACCOUNT_REGISTRATION_STATUS_VIEWED',$employeeId,200,[
            'requestId'=>(int)$request['ID'],'status'=>$status,'unread'=>$unread,
        ]);
        json_response([
            'success'=>true,
            'data'=>[
                'status'=>$status,
                'submittedAt'=>$request['SubmittedAt'] ?? null,
                'reviewedAt'=>$request['ReviewedAt'] ?? null,
                'rejectionReason'=>$status === 'Rejected' ? ($request['RejectionReason'] ?? null) : null,
                'nextAction'=>$nextAction,
                'notification'=>[
                    'channel'=>'portal',
                    'unread'=>$unread,
                    'emailAvailable'=>!empty($request['HasCompanyEmail']),
                    'viewedAt'=>gmdate('c'),
                    'viewCount'=>(int)($request['StatusViewCount'] ?? 0)+1,
                ],
            ],
        ]);
    }

    if ($method === 'POST' && $path === '/register') {
        $body = json_body();
        $employeeId = trim((string) ($body['EmployeeID'] ?? ''));
        $employeeName = trim((string) ($body['EmployeeName'] ?? ''));
        $department = trim((string) ($body['Department'] ?? ''));
        $position = trim((string) ($body['Position'] ?? ''));
        $unit = trim((string) ($body['Unit'] ?? ''));
        if (!is_string($body['password'] ?? null)) {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason' => 'invalid_password_type']);
            json_response(['success' => false, 'message' => 'Password must be a string.'], 400);
        }
        $password = $body['password'];
        if (trim((string)($body['Website'] ?? '')) !== '') {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED',$employeeId,400,['reason'=>'bot_honeypot']);
            json_response(['success'=>false,'message'=>'ไม่สามารถดำเนินการคำขอได้'],400);
        }
        $registrationMode = strtolower(trim((string)($body['RegistrationMode'] ?? 'auto')));
        if (!in_array($registrationMode,['auto','activate','new'],true)) {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason'=>'invalid_registration_mode']);
            json_response(['success'=>false,'message'=>'โหมดการสมัครไม่ถูกต้อง'],400);
        }
        if ($employeeId === '' || $password === '') {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason' => 'missing_required_fields']);
            json_response(['success' => false, 'message' => 'กรุณากรอกรหัสพนักงานและรหัสผ่าน'], 400);
        }
        if (strlen($password) < 4) {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason' => 'password_too_short']);
            json_response(['success' => false, 'message' => 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
        }
        ensure_auth_security_schema();
        $employee = db_row('SELECT EmployeeID,Password FROM employees WHERE EmployeeID = ? LIMIT 1', [$employeeId]);
        if (!$employee) {
            if ($registrationMode === 'activate') {
                auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason'=>'account_activation_unavailable']);
                json_response([
                    'success'=>false,
                    'code'=>'REGISTRATION_NOT_AVAILABLE',
                    'nextAction'=>'NEW_REGISTRATION_OR_ADMIN',
                    'message'=>'ไม่สามารถเปิดใช้งานบัญชีด้วยข้อมูลนี้ได้ กรุณาเลือกสมัครบัญชีใหม่หรือติดต่อ Admin',
                ],400);
            }
            if (mb_strlen($employeeName) < 2 || $department === '' || $position === '') {
                auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason'=>'missing_applicant_profile']);
                json_response(['success'=>false,'message'=>'กรุณากรอกชื่อ แผนก และตำแหน่งให้ครบถ้วน'],400);
            }
            try {
                $registrationMasters = crosspath_load_profile_masters(db());
                $registrationValidation = profile_validate_cross_path_candidate(
                    [
                        'EmployeeID'=>$employeeId,
                        'EmployeeName'=>$employeeName,
                        'Department'=>$department,
                        'Unit'=>$unit,
                        'Position'=>$position,
                        'Password'=>'PENDING_REGISTRATION_PASSWORD',
                        'MustChangePassword'=>0,
                    ],
                    ['EmployeeName'=>$employeeName,'Department'=>$department,'Unit'=>$unit,'Position'=>$position],
                    $registrationMasters
                );
            } catch (ProfileValidationException $error) {
                auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, $error->httpStatus, ['reason'=>$error->reason]);
                json_response(['success'=>false,'code'=>$error->reason,'message'=>$error->getMessage()],$error->httpStatus);
            }
            $employeeName = $registrationValidation['profile']['EmployeeName'];
            $department = $registrationValidation['profile']['Department'];
            $unit = $registrationValidation['profile']['Unit'];
            $position = $registrationValidation['profile']['Position'];
            $masterPosition = null;
            foreach ($registrationMasters['positions'] as $candidatePosition) {
                if ((string)($candidatePosition['Name'] ?? $candidatePosition['name'] ?? '') === $position) {
                    $masterPosition = $candidatePosition;
                    break;
                }
            }
            if ($masterPosition === null) {
                json_response(['success'=>false,'code'=>'PROFILE_VALIDATION_UNAVAILABLE','message'=>'Profile validation is unavailable.'],503);
            }
            $emailRule = admin8_email_rule();
            $emailRequired = in_array((int)$masterPosition['id'], array_map('intval', $emailRule['requiredPositionIds'] ?? []), true);
            $companyEmail = strtolower(trim((string)($body['CompanyEmail'] ?? '')));
            $emailValid = $companyEmail === '' || preg_match('/^[^\s@]+@thaisummit-harness\.co\.th$/i', $companyEmail) === 1;
            if (!$emailValid || ($emailRequired && $companyEmail === '')) {
                $reason = !$emailValid ? 'invalid_company_email' : 'company_email_required';
                auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 400, ['reason'=>$reason,'positionId'=>(int)$masterPosition['id']]);
                json_response([
                    'success'=>false,
                    'message'=>$emailRequired && $companyEmail === ''
                        ? 'ตำแหน่งนี้ต้องระบุ CompanyEmail'
                        : 'CompanyEmail ต้องใช้ @thaisummit-harness.co.th',
                ],400);
            }
            if ($companyEmail !== '') {
                $duplicateEmail = db_row(
                    'SELECT CompanyEmail FROM employees WHERE LOWER(CompanyEmail)=? UNION ALL SELECT CompanyEmail FROM registration_requests WHERE LOWER(CompanyEmail)=? LIMIT 1',
                    [$companyEmail,$companyEmail]
                );
                if ($duplicateEmail) {
                    auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 409, ['reason'=>'company_email_exists']);
                    json_response(['success'=>false,'message'=>'CompanyEmail นี้ถูกใช้งานแล้ว'],409);
                }
            }
            $existingRequest = db_row('SELECT ReferenceCode,Status FROM registration_requests WHERE EmployeeID=? LIMIT 1', [$employeeId]);
            if ($existingRequest) {
                auth_audit_log('ACCOUNT_REGISTRATION_REQUEST_DUPLICATE', $employeeId, 409, ['status' => $existingRequest['Status'] ?? null]);
                json_response([
                    'success' => false,
                    'pending' => ($existingRequest['Status'] ?? '') === 'Pending',
                    'status' => $existingRequest['Status'] ?? null,
                    'message' => 'มีคำขอสมัครสำหรับรหัสพนักงานนี้แล้ว กรุณาติดต่อ Admin',
                ], 409);
            }
            $referenceCode = auth_registration_reference();
            try {
                db_execute(
                    'INSERT INTO registration_requests(ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail,PasswordHash,Status) VALUES(?,?,?,?,?,?,?,?,?)',
                    [$referenceCode,$employeeId,$employeeName?:null,$department?:null,$unit?:null,$position?:null,$companyEmail?:null,password_hash($password,PASSWORD_BCRYPT),'Pending']
                );
            } catch (Throwable $error) {
                if ((string)$error->getCode() === '23000') {
                    auth_audit_log('ACCOUNT_REGISTRATION_REQUEST_DUPLICATE', $employeeId, 409, ['reason' => 'duplicate_race']);
                    json_response(['success'=>false,'message'=>'มีคำขอสมัครสำหรับรหัสพนักงานนี้แล้ว กรุณาติดต่อ Admin'],409);
                }
                throw $error;
            }
            auth_audit_log('ACCOUNT_REGISTRATION_REQUESTED', $employeeId, 202, ['referenceCode'=>$referenceCode,'status'=>'Pending']);
            json_response([
                'success'=>true,
                'pending'=>true,
                'status'=>'Pending',
                'referenceCode'=>$referenceCode,
                'message'=>'ส่งคำขอสมัครแล้ว กรุณารอ Admin ตรวจสอบและอนุมัติ',
            ],202);
        }
        if (!empty($employee['Password'])) {
            auth_audit_log('ACCOUNT_REGISTRATION_FAILED', $employeeId, 409, ['reason' => 'account_exists']);
            json_response([
                'success'=>false,
                'code'=>'REGISTRATION_NOT_AVAILABLE',
                'nextAction'=>'LOGIN_OR_ADMIN_RESET',
                'message'=>'ไม่สามารถสมัครหรือเปิดบัญชีใหม่ได้ หากเคยมีบัญชีแล้วให้เข้าสู่ระบบ หรือติดต่อ Admin เพื่อรีเซ็ตรหัสผ่าน',
            ],409);
        }
        db_execute(
            'UPDATE employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=? AND Password IS NULL',
            [password_hash($password, PASSWORD_BCRYPT), $employeeId]
        );
        auth_audit_log('ACCOUNT_REGISTERED', $employeeId, 200, ['source' => 'public_registration']);
        json_response([
            'success'=>true,
            'activated'=>true,
            'nextAction'=>'LOGIN',
            'message'=>'เปิดใช้งานบัญชีสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้',
        ]);
    }

    if ($method === 'PUT' && $path === '/profile') {
        $user = require_user();
        $body = json_body();
        try {
            $result = profile_update_execute(
                db(),
                (string)($user['id'] ?? $user['EmployeeID'] ?? ''),
                $body
            );
        } catch (ProfileValidationException $error) {
            json_response([
                'success' => false,
                'code' => $error->reason,
                'message' => $error->getMessage(),
            ], $error->httpStatus);
        }
        $updatedUser = user_data($result['employee']);
        json_response([
            'success' => true,
            'status' => $result['status'],
            'onboardingStatus' => $result['status'],
            'nextAction' => $result['nextAction'],
            'message' => 'Profile updated successfully.',
            'idempotent' => $result['idempotent'],
            'changedFields' => $result['changedFields'],
            'user' => $updatedUser,
            'token' => jwt_sign($updatedUser),
        ]);
    }

    if ($method === 'PUT' && $path === '/profile/safety-unit') {
        $user = require_user();
        $body = json_body();
        if (!is_string($body['Unit'] ?? null) || trim($body['Unit']) === '') {
            json_response([
                'success' => false,
                'code' => 'SAFETY_UNIT_VALUE_REQUIRED',
                'message' => 'Safety Unit is required.',
            ], 400);
        }
        try {
            $result = safety_unit_continuation_execute(
                db(),
                (string)($user['id'] ?? $user['EmployeeID'] ?? ''),
                $body['Unit']
            );
        } catch (SafetyUnitContinuationException $error) {
            json_response([
                'success' => false,
                'code' => $error->reason,
                'message' => $error->getMessage(),
            ], $error->httpStatus);
        }
        $updatedUser = user_data($result['employee']);
        json_response([
            'success' => true,
            'status' => $result['status'],
            'onboardingStatus' => $result['status'],
            'nextAction' => $result['nextAction'],
            'message' => 'Safety Unit saved successfully.',
            'idempotent' => $result['idempotent'],
            'token' => jwt_sign($updatedUser),
            'user' => $updatedUser,
        ]);
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
        $admin = require_admin();
        create_employee(json_body(), $admin, 'manual_legacy');
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
        ensure_auth_security_schema();
        json_response(['success' => true, 'data' => db_rows(
            "SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Team,e.Position,e.CompanyEmail,e.Role,
                    created.ActionTime AS CreatedAt,
                    CASE
                        WHEN created.id IS NULL THEN NULL
                        WHEN LOWER(COALESCE(created.Path,'')) LIKE '%/import%'
                          OR LOWER(COALESCE(created.Detail,'')) LIKE '%source: import%'
                          OR LOWER(COALESCE(created.Metadata,'')) LIKE '%\"source\":\"import%' THEN 'import'
                        ELSE 'manual'
                    END AS CreationSource
             FROM employees e
             LEFT JOIN (
                 SELECT l.id,l.ActionTime,l.Path,l.Detail,l.Metadata,l.TargetID
                 FROM admin_auditlogs l
                 INNER JOIN (
                     SELECT MAX(id) AS AuditID
                     FROM admin_auditlogs
                     WHERE Action='CREATE_EMPLOYEE'
                       AND COALESCE(TRIM(TargetID),'')<>''
                     GROUP BY LOWER(TRIM(TargetID))
                 ) latest ON latest.AuditID=l.id
             ) created ON LOWER(TRIM(created.TargetID))=LOWER(TRIM(e.EmployeeID))
             ORDER BY e.Department,e.EmployeeName"
        )]);
    }
    if ($method === 'POST' && $path === '/admin/employee/create') {
        $admin = require_admin();
        create_employee(json_body(), $admin, 'manual');
    }
    if ($method === 'POST' && $path === '/admin/employee/update') {
        require_admin();
        $body = json_body();
        update_employee((string) ($body['EmployeeID'] ?? ''), $body);
    }
    if ($method === 'POST' && $path === '/admin/employees/import') {
        $admin = require_admin();
        $body = json_body();
        $rows = $body['data'] ?? null;
        if (!is_array($rows)) {
            json_response(['success' => false, 'message' => 'Invalid data'], 400);
        }
        $pdo = db();
        $pdo->beginTransaction();
        $importRow = null;
        $importEmployeeId = null;
        $addedCount = 0;
        $duplicateCount = 0;
        $seenEmployeeIds = [];
        $addedEmployees = [];
        try {
            foreach ($rows as $rowIndex => $employee) {
                $importRow = (int)$rowIndex + 1;
                if (!is_array($employee)) {
                    throw new ProfileValidationException('INVALID_EMPLOYEE_PROFILE','Import row must be an object.',400);
                }
                $employeeId = trim((string) ($employee['EmployeeID'] ?? ''));
                $importEmployeeId = $employeeId;
                $normalizedIdKey = strtolower($employeeId);
                if ($normalizedIdKey !== '' && isset($seenEmployeeIds[$normalizedIdKey])) {
                    $duplicateCount++;
                    continue;
                }
                if ($normalizedIdKey !== '') {
                    $seenEmployeeIds[$normalizedIdKey] = true;
                }
                $email = validate_company_email($employee['CompanyEmail'] ?? $employee['Email'] ?? '');
                if (!$email['ok']) {
                    throw new ProfileValidationException('INVALID_COMPANY_EMAIL',$email['message'],400);
                }
                try {
                    $write = crosspath_write_employee_profile_in_transaction(
                        $pdo,
                        CROSS_PATH_CREATE,
                        $employeeId,
                        [
                            'EmployeeName'=>$employee['EmployeeName']??null,
                            'Department'=>$employee['Department']??'',
                            'Unit'=>$employee['Unit']??'',
                            'Position'=>$employee['Position']??($employee['Team']??''),
                        ],
                        [
                            'Team'=>trim((string)($employee['Team']??'')),
                            'CompanyEmail'=>$email['email'],
                            'Role'=>normalize_role($employee['Role']??'User'),
                        ]
                    );
                    $addedCount++;
                    $addedEmployees[] = $write['employee'];
                } catch (ProfileValidationException $error) {
                    if ($error->reason === 'EMPLOYEE_ALREADY_EXISTS') {
                        $duplicateCount++;
                        continue;
                    }
                    throw $error;
                }
            }
            $pdo->commit();
            foreach ($addedEmployees as $employee) {
                auth_audit_log('CREATE_EMPLOYEE', (string)$employee['EmployeeID'], 200, [
                    'source'=>'import_json',
                    'role'=>$employee['Role'] ?? 'User',
                ], $admin);
            }
        } catch (Throwable $error) {
            $pdo->rollBack();
            if ($error instanceof ProfileValidationException) {
                json_response([
                    'success'=>false,
                    'code'=>$error->reason,
                    'message'=>$error->getMessage(),
                    'row'=>$importRow,
                    'employeeId'=>$importEmployeeId,
                ],$error->httpStatus);
            }
            throw $error;
        }
        json_response([
            'success' => true,
            'message' => 'Added ' . $addedCount . ' new employees; skipped ' . $duplicateCount . ' duplicates',
            'addedCount' => $addedCount,
            'duplicateCount' => $duplicateCount,
            'successCount' => $addedCount,
        ]);
    }
    if ($method === 'POST' && $path === '/admin/employee/import') {
        $admin = require_admin();
        $rows = json_decode((string) ($_POST['rows'] ?? ''), true);
        if (!is_array($rows) && !empty($_POST['rowsBase64'])) {
            $decodedRows = base64_decode((string) $_POST['rowsBase64'], true);
            $rows = $decodedRows === false ? null : json_decode($decodedRows, true);
        }
        if (!is_array($rows)) {
            json_response(['success' => false, 'message' => 'Excel rows were not provided. Please refresh the page and try again.'], 400);
        }
        $details = [];
        $addedCount = 0;
        $duplicateCount = 0;
        $errorCount = 0;
        $seenEmployeeIds = [];
        foreach ($rows as $rowIndex => $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = trim((string) ($row['EmployeeID'] ?? $row['ID'] ?? ''));
            $name = trim((string) ($row['EmployeeName'] ?? $row['Name'] ?? ''));
            if ($id === '' || $name === '') {
                $details[] = ['row'=>(int)$rowIndex+2,'id'=>$id?:'-','name'=>$name?:'-','status'=>'skip','code'=>'INVALID_EMPLOYEE_PROFILE','reason'=>'EmployeeID and EmployeeName are required'];
                $errorCount++;
                continue;
            }
            $department = trim((string) ($row['Department'] ?? $row['Dept'] ?? ''));
            $position = trim((string) ($row['Position'] ?? ''));
            $team = trim((string) ($row['Team'] ?? ''));
            $role = normalize_role($row['Role'] ?? 'User');

            $normalizedIdKey = strtolower($id);
            if (isset($seenEmployeeIds[$normalizedIdKey])) {
                $duplicateCount++;
                $details[] = [
                    'row'=>(int)$rowIndex+2,
                    'id'=>$id,
                    'name'=>$name,
                    'status'=>'duplicate',
                    'code'=>'DUPLICATE_EMPLOYEE_ID_IN_FILE',
                    'reason'=>'EmployeeID ซ้ำภายในไฟล์ จึงข้ามรายการนี้',
                ];
                continue;
            }
            $seenEmployeeIds[$normalizedIdKey] = true;

            $email = validate_company_email($row['CompanyEmail'] ?? $row['Company Email'] ?? $row['Email'] ?? '');
            if (!$email['ok']) {
                $details[] = ['row'=>(int)$rowIndex+2,'id'=>$id,'name'=>$name,'status'=>'skip','code'=>'INVALID_COMPANY_EMAIL','reason'=>$email['message']];
                $errorCount++;
                continue;
            }
            $warnings = [];
            if (isset($row['Role']) && !in_array($row['Role'],['Admin','User','Viewer'],true)) {
                $warnings[]='Role is invalid; User was used';
            }
            try {
                $write = crosspath_execute_employee_profile_write(
                    db(),
                    CROSS_PATH_CREATE,
                    $id,
                    [
                        'EmployeeName'=>$name,
                        'Department'=>$department,
                        'Unit'=>$row['Unit']??'',
                        'Position'=>$position,
                    ],
                    ['Team'=>$team,'CompanyEmail'=>$email['email'],'Role'=>$role]
                );
                $addedCount++;
                auth_audit_log('CREATE_EMPLOYEE', (string)$write['employee']['EmployeeID'], 200, [
                    'source'=>'import_excel',
                    'role'=>$write['employee']['Role'] ?? 'User',
                ], $admin);
                $details[] = [
                    'row'=>(int)$rowIndex+2,
                    'id'=>$id,
                    'name'=>$write['employee']['EmployeeName'],
                    'status'=>$warnings?'warn':'ok',
                    'code'=>null,
                    'reason'=>implode(' | ',$warnings),
                    'onboardingStatus'=>$write['status'],
                ];
            } catch (ProfileValidationException $error) {
                if ($error->reason === 'EMPLOYEE_ALREADY_EXISTS') {
                    $duplicateCount++;
                    $details[] = [
                        'row'=>(int)$rowIndex+2,
                        'id'=>$id,
                        'name'=>$name,
                        'status'=>'duplicate',
                        'code'=>$error->reason,
                        'reason'=>'EmployeeID นี้มีอยู่ในระบบแล้ว ระบบไม่ได้แก้ไขข้อมูลเดิม',
                    ];
                    continue;
                }
                $errorCount++;
                $details[] = [
                    'row'=>(int)$rowIndex+2,
                    'id'=>$id,
                    'name'=>$name,
                    'status'=>'error',
                    'code'=>$error->reason,
                    'reason'=>$error->getMessage(),
                ];
            } catch (Throwable $error) {
                $errorCount++;
                $details[] = [
                    'row'=>(int)$rowIndex+2,
                    'id'=>$id,
                    'name'=>$name,
                    'status'=>'error',
                    'code'=>'PROFILE_VALIDATION_UNAVAILABLE',
                    'reason'=>'Employee profile validation is unavailable.',
                ];
            }
        }
        json_response([
            'success' => true,
            'message' => 'Added ' . $addedCount . ' new employees; skipped ' . $duplicateCount . ' duplicates',
            'addedCount' => $addedCount,
            'duplicateCount' => $duplicateCount,
            'successCount' => $addedCount,
            'errorCount' => $errorCount,
            'warnCount' => count(array_filter($details, static function ($row) {
                return ($row['status'] ?? '') === 'warn';
            })),
            'details' => $details,
        ]);
    }
    if ($method === 'GET' && $path === '/admin/employee/recent-additions') {
        require_admin();
        ensure_auth_security_schema();
        $limit = max(1, min(20, (int)($_GET['limit'] ?? 5)));
        $rows = db_rows(
            "SELECT l.id AS AuditID,l.ActionTime,l.AdminID,l.AdminName,l.Path,l.Detail,l.TargetID AS EmployeeID,
                    e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                    CASE
                        WHEN LOWER(COALESCE(l.Path,'')) LIKE '%/import%'
                          OR LOWER(COALESCE(l.Detail,'')) LIKE '%source: import%'
                          OR LOWER(COALESCE(l.Metadata,'')) LIKE '%\"source\":\"import%' THEN 'import'
                        ELSE 'manual'
                    END AS Source
             FROM admin_auditlogs l
             INNER JOIN employees e
                ON LOWER(TRIM(e.EmployeeID))=LOWER(TRIM(l.TargetID))
             WHERE l.Action='CREATE_EMPLOYEE'
               AND COALESCE(TRIM(l.TargetID),'')<>''
             ORDER BY l.ActionTime DESC,l.id DESC
             LIMIT " . $limit
        );
        json_response(['success'=>true,'data'=>$rows]);
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
        $resetBody = json_body();
        if (!is_string($resetBody['newPassword'] ?? null)) {
            json_response(['success' => false, 'message' => 'Password must be a string.'], 400);
        }
        $newPassword = $resetBody['newPassword'];
        if (strlen($newPassword) < 4) {
            json_response(['success' => false, 'message' => 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'], 400);
        }
        ensure_auth_security_schema();
        if (!db_execute('UPDATE employees SET Password=?,MustChangePassword=1 WHERE EmployeeID=?', [password_hash($newPassword, PASSWORD_BCRYPT), $params['id']])) {
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
            'teams' => array_column(db_rows('SELECT Name FROM master_teams ORDER BY Name'), 'Name'),
            'roles' => ['Admin', 'User', 'Viewer'],
        ]);
    }

    return false;
}

function create_employee(array $body, ?array $actor = null, string $source = 'manual')
{
    $employeeId = trim((string) ($body['EmployeeID'] ?? ''));
    $email = validate_company_email($body['CompanyEmail'] ?? '');
    if (!$email['ok']) {
        json_response(['success' => false, 'message' => $email['message']], 400);
    }
    try {
        $result = crosspath_execute_employee_profile_write(
            db(),
            CROSS_PATH_CREATE,
            $employeeId,
            [
                'EmployeeName'=>$body['EmployeeName']??null,
                'Department'=>$body['Department']??'',
                'Unit'=>$body['Unit']??'',
                'Position'=>$body['Position']??'',
            ],
            [
                'Team'=>trim((string)($body['Team']??'')),
                'CompanyEmail'=>$email['email'],
                'Role'=>normalize_role($body['Role']??'User'),
            ]
        );
    } catch (ProfileValidationException $error) {
        json_response(['success'=>false,'code'=>$error->reason,'message'=>$error->getMessage()],$error->httpStatus);
    }
    if ($actor !== null) {
        auth_audit_log('CREATE_EMPLOYEE', $employeeId, 200, [
            'source'=>$source,
            'role'=>$result['employee']['Role'] ?? 'User',
        ], $actor);
    }
    json_response(['success'=>true,'message'=>'เพิ่มพนักงานสำเร็จ','onboardingStatus'=>$result['status']]);
}

function update_employee(string $employeeId, array $body)
{
    $email = array_key_exists('CompanyEmail',$body)
        ? validate_company_email($body['CompanyEmail'])
        : ['ok'=>true,'email'=>null];
    if (!$email['ok']) {
        json_response(['success' => false, 'message' => $email['message']], 400);
    }
    $profilePayload = [];
    foreach (PROFILE_ALLOWED_FIELDS as $field) {
        if (array_key_exists($field,$body)) $profilePayload[$field]=$body[$field];
    }
    $protectedFields = [];
    if (array_key_exists('Team',$body)) $protectedFields['Team']=trim((string)$body['Team']);
    if (array_key_exists('CompanyEmail',$body)) $protectedFields['CompanyEmail']=$email['email'];
    if (array_key_exists('Role',$body)) $protectedFields['Role']=normalize_role($body['Role']);
    try {
        $result = crosspath_execute_employee_profile_write(
            db(),
            CROSS_PATH_UPDATE,
            $employeeId,
            $profilePayload,
            $protectedFields
        );
    } catch (ProfileValidationException $error) {
        json_response(['success'=>false,'code'=>$error->reason,'message'=>$error->getMessage()],$error->httpStatus);
    }
    json_response([
        'success'=>true,
        'message'=>'อัปเดตข้อมูลสำเร็จ',
        'onboardingStatus'=>$result['status'],
        'idempotent'=>$result['idempotent'],
    ]);
}
