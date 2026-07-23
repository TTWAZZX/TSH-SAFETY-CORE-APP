<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';
require_once dirname(__DIR__) . '/lib/profile_validator.php';
require_once dirname(__DIR__) . '/lib/employee_profile_write.php';

function crosspath_test_db(string $scenario): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('CREATE TABLE employees (
        EmployeeID TEXT PRIMARY KEY, EmployeeName TEXT, Department TEXT, Unit TEXT,
        Team TEXT, Position TEXT, CompanyEmail TEXT, Role TEXT, Password TEXT, MustChangePassword INTEGER
    )');
    $pdo->exec('CREATE TABLE master_departments (id INTEGER PRIMARY KEY, Name TEXT)');
    $pdo->exec('CREATE TABLE master_safetyunits (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER)');
    $pdo->exec('CREATE TABLE master_positions (id INTEGER PRIMARY KEY, Name TEXT)');
    $pdo->exec("INSERT INTO master_departments(id,Name) VALUES(1,'Production'),(2,'Warehouse'),(3,'Office')");
    $pdo->exec("INSERT INTO master_safetyunits(id,name,department_id) VALUES(1,'Unit A',1),(2,'Unit C',1),(3,'Unit B',2)");
    $pdo->exec("INSERT INTO master_positions(id,Name) VALUES(1,'Operator'),(2,'Manager')");
    if ($scenario === 'duplicate_position') {
        $pdo->exec("INSERT INTO master_positions(id,Name) VALUES(3,' operator ')");
    }
    if (in_array($scenario, ['partial_update','department_change','idempotent','resolver_failure','protected_forbidden','upsert_update'], true)) {
        $pdo->prepare(
            'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword) '
            . 'VALUES(?,?,?,?,?,?,?,?,?,?)'
        )->execute(['E001','Employee One','Production','Unit A','Team X','Operator',null,'User','stored-hash',0]);
    }
    if ($scenario === 'master_failure') $pdo->exec('DROP TABLE master_positions');
    return $pdo;
}

function crosspath_case_options(string $scenario): array
{
    $operation = in_array($scenario, ['partial_update','department_change','idempotent','resolver_failure','protected_forbidden'], true)
        ? CROSS_PATH_UPDATE
        : (str_starts_with($scenario, 'upsert_') ? CROSS_PATH_UPSERT : CROSS_PATH_CREATE);
    $employeeId = 'E001';
    $profile = [
        'EmployeeName'=>" Employee New\r\n ",
        'Department'=>" production\r\n ",
        'Unit'=>' unit a ',
        'Position'=>' operator ',
    ];
    $protected = ['Team'=>'Team Y','CompanyEmail'=>null,'Role'=>'User','Password'=>'new-hash','MustChangePassword'=>1];
    $options = [];

    if ($scenario === 'create_ready') $protected = ['Role'=>'User','Password'=>'new-hash','MustChangePassword'=>0];
    if ($scenario === 'create_password_blank_unit') $profile['Unit']='';
    if ($scenario === 'create_safety') {
        $profile['Unit']='';
        $protected=['Role'=>'User','Password'=>'new-hash','MustChangePassword'=>0];
    }
    if ($scenario === 'invalid_department') $profile['Department']='Unknown';
    if ($scenario === 'invalid_position') $profile['Position']='Unknown';
    if ($scenario === 'invalid_unit') $profile['Unit']='Unit B';
    if ($scenario === 'department_no_units') {
        $profile['Department']='Office';
        $profile['Unit']='Legacy';
        $protected=['Role'=>'User','Password'=>'new-hash','MustChangePassword'=>0];
    }
    if ($scenario === 'partial_update') {
        $profile=['EmployeeName'=>" Employee Partial\r\n "];
        $protected=[];
    }
    if ($scenario === 'department_change') {
        $profile=['Department'=>'Warehouse'];
        $protected=[];
    }
    if ($scenario === 'idempotent') {
        $profile=[];
        $protected=[];
    }
    if ($scenario === 'resolver_failure') {
        $profile=['EmployeeName'=>'Will Roll Back'];
        $protected=[];
        $options['resolveStatus']=static function (): string { throw new RuntimeException('resolver unavailable'); };
    }
    if ($scenario === 'protected_forbidden') {
        $profile=[];
        $protected=['EmployeeID'=>'ADMIN'];
    }
    if ($scenario === 'upsert_update') {
        $profile=['EmployeeName'=>'Imported','Department'=>'Production','Unit'=>'Unit C','Position'=>'Manager'];
        $protected=['Role'=>'Viewer'];
    }
    return compact('operation','employeeId','profile','protected','options');
}

function crosspath_state(PDO $pdo): ?array
{
    $row = $pdo->query('SELECT * FROM employees WHERE EmployeeID=\'E001\'')->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    return [
        'employeeName'=>(string)$row['EmployeeName'],
        'department'=>(string)$row['Department'],
        'unit'=>(string)$row['Unit'],
        'position'=>(string)$row['Position'],
        'team'=>(string)$row['Team'],
        'role'=>(string)$row['Role'],
        'passwordState'=>$row['Password']===null?'NULL':'SET',
        'mustChange'=>(int)$row['MustChangePassword'],
    ];
}

function crosspath_run_case(string $scenario): array
{
    $pdo=crosspath_test_db($scenario);
    $case=crosspath_case_options($scenario);
    try {
        $result=crosspath_execute_employee_profile_write(
            $pdo,$case['operation'],$case['employeeId'],$case['profile'],$case['protected'],$case['options']
        );
        return [
            'outcome'=>'success',
            'status'=>$result['status'],
            'nextAction'=>$result['nextAction'],
            'inserted'=>(bool)$result['inserted'],
            'idempotent'=>(bool)$result['idempotent'],
            'changedFields'=>$result['changedFields'],
            'state'=>crosspath_state($pdo),
        ];
    } catch (ProfileValidationException $error) {
        return [
            'outcome'=>'error',
            'code'=>$error->reason,
            'httpStatus'=>$error->httpStatus,
            'state'=>crosspath_state($pdo),
        ];
    }
}

$scenarios=[
    'create_canonical','create_password_blank_unit','create_ready','create_safety','invalid_department','invalid_position','invalid_unit',
    'department_no_units','partial_update','department_change','duplicate_position','master_failure',
    'resolver_failure','idempotent','protected_forbidden','upsert_update',
];
$results=[];
foreach($scenarios as $scenario) $results[$scenario]=crosspath_run_case($scenario);
echo json_encode(['results'=>$results],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
