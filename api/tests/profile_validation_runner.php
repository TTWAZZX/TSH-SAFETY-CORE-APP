<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';
require_once dirname(__DIR__) . '/lib/profile_validator.php';
require_once dirname(__DIR__) . '/lib/profile_update.php';

function profile_test_db(string $scenario): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('CREATE TABLE employees (
        EmployeeID TEXT PRIMARY KEY, EmployeeName TEXT, Department TEXT, Unit TEXT,
        Team TEXT, Position TEXT, Role TEXT, Password TEXT, MustChangePassword INTEGER
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
    $department = in_array($scenario, ['transition_safety'], true) ? 'Office' : 'Production';
    $unit = $department === 'Production' ? 'Unit A' : '';
    $pdo->prepare(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword) '
        . 'VALUES(?,?,?,?,?,?,?,?,0)'
    )->execute(['E001', 'Employee One', $department, $unit, 'Team X', 'Operator', 'User', 'stored-hash']);
    return $pdo;
}

function profile_payload(string $scenario): array
{
    $payload = [
        'EmployeeName' => " Employee New\r\n ",
        'Department' => " production\r\n ",
        'Unit' => ' unit a ',
        'Position' => ' operator ',
    ];
    if ($scenario === 'idempotent') $payload['EmployeeName'] = 'Employee One';
    if ($scenario === 'empty_name') $payload['EmployeeName'] = " \r\n ";
    if ($scenario === 'name_type') $payload['EmployeeName'] = ['Employee'];
    if ($scenario === 'long_name') $payload['EmployeeName'] = str_repeat('ก', 256);
    if ($scenario === 'invalid_department') $payload['Department'] = 'Unknown';
    if ($scenario === 'invalid_unit') $payload['Unit'] = 'Unit B';
    if ($scenario === 'unit_change') $payload['Unit'] = " unit c\r\n ";
    if ($scenario === 'invalid_position') $payload['Position'] = 'Unknown Position';
    if ($scenario === 'forbidden') {
        $payload['EmployeeID'] = 'ADMIN';
        $payload['Role'] = 'Admin';
        $payload['Team'] = 'Other Team';
        $payload['Password'] = 'plaintext';
        $payload['MustChangePassword'] = 1;
        $payload['CompanyEmail'] = 'other@example.com';
    }
    if (in_array($scenario, ['department_no_units', 'transition_safety'], true)) {
        $payload['Department'] = $scenario === 'department_no_units' ? 'Office' : 'Production';
        $payload['Unit'] = $scenario === 'department_no_units' ? 'Unit B' : '';
        $payload['Position'] = 'Manager';
    }
    return $payload;
}

function profile_state(PDO $pdo): array
{
    $row = $pdo->query("SELECT EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword FROM employees WHERE EmployeeID='E001'")->fetch();
    return [
        'employeeName' => (string)$row['EmployeeName'],
        'department' => (string)$row['Department'],
        'unit' => (string)$row['Unit'],
        'position' => (string)$row['Position'],
        'protectedFieldsPreserved' => $row['Team'] === 'Team X'
            && $row['Role'] === 'User'
            && $row['Password'] === 'stored-hash'
            && (int)$row['MustChangePassword'] === 0,
    ];
}

function run_profile_case(string $scenario): array
{
    $pdo = profile_test_db($scenario);
    $options = [];
    if ($scenario === 'resolver_password') {
        $options['resolveStatus'] = static fn(): string => ONBOARDING_PASSWORD_CHANGE_REQUIRED;
    } elseif ($scenario === 'resolver_failure') {
        $options['resolveStatus'] = static function (): string { throw new RuntimeException('resolver unavailable'); };
    }
    if ($scenario === 'master_failure') $pdo->exec('DROP TABLE master_positions');
    try {
        $result = profile_update_execute($pdo, 'E001', profile_payload($scenario), $options);
        return array_merge([
            'outcome' => 'success',
            'status' => $result['status'],
            'nextAction' => $result['nextAction'],
            'idempotent' => (bool)$result['idempotent'],
            'changedFields' => $result['changedFields'],
            'profileTeam' => (string)$result['employee']['Team'],
            'profileRole' => (string)$result['employee']['Role'],
        ], profile_state($pdo));
    } catch (ProfileValidationException $error) {
        return array_merge([
            'outcome' => 'error',
            'code' => $error->reason,
            'httpStatus' => $error->httpStatus,
        ], profile_state($pdo));
    }
}

$scenarioNames = [
    'canonical', 'idempotent', 'empty_name', 'name_type', 'long_name',
    'invalid_department', 'invalid_unit', 'unit_change', 'invalid_position', 'forbidden',
    'department_no_units', 'transition_safety', 'master_failure',
    'duplicate_position', 'resolver_password', 'resolver_failure',
];
$results = [];
foreach ($scenarioNames as $scenario) $results[$scenario] = run_profile_case($scenario);

$doubleDb = profile_test_db('canonical');
$first = profile_update_execute($doubleDb, 'E001', profile_payload('canonical'));
$second = profile_update_execute($doubleDb, 'E001', profile_payload('canonical'));
$results['double_submit'] = [
    'firstIdempotent' => (bool)$first['idempotent'],
    'secondIdempotent' => (bool)$second['idempotent'],
    'state' => profile_state($doubleDb),
];

echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
