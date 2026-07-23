<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';
require_once dirname(__DIR__) . '/lib/safety_unit_continuation.php';

function safety_test_db(string $scenario): PDO
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
    $pdo->exec("INSERT INTO master_departments(id,Name) VALUES(1,'Production'),(2,'Warehouse'),(3,'Office')");
    $pdo->exec("INSERT INTO master_safetyunits(id,name,department_id) VALUES(1,'Unit A',1),(2,'Unit C',1),(3,'Unit B',2)");
    if ($scenario === 'duplicate_master') {
        $pdo->exec("INSERT INTO master_safetyunits(id,name,department_id) VALUES(4,' unit a ',1)");
    }

    $department = " Production\r\n ";
    $unit = '';
    $mustChange = 0;
    if ($scenario === 'unknown_department') $department = 'Unknown';
    if ($scenario === 'no_units') $department = 'Office';
    if (in_array($scenario, ['idempotent', 'already_completed'], true)) $unit = 'Unit A';
    if ($scenario === 'password_required') $mustChange = 1;
    $pdo->prepare(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword) '
        . 'VALUES(?,?,?,?,?,?,?,?,?)'
    )->execute(['E001', 'Employee One', $department, $unit, 'Team X', 'Operator', 'User', 'stored-hash', $mustChange]);
    return $pdo;
}

function safety_requested_unit(string $scenario): string
{
    return match ($scenario) {
        'blank' => " \r\n ",
        'wrong_department' => 'Unit B',
        'invalid' => 'Unknown Unit',
        'already_completed' => 'Unit C',
        default => " unit a\r\n ",
    };
}

function safety_state(PDO $pdo): array
{
    $row = $pdo->query("SELECT EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword FROM employees WHERE EmployeeID='E001'")->fetch();
    return [
        'unit' => (string)$row['Unit'],
        'otherFieldsPreserved' => $row['EmployeeName'] === 'Employee One'
            && $row['Team'] === 'Team X'
            && $row['Position'] === 'Operator'
            && $row['Role'] === 'User'
            && $row['Password'] === 'stored-hash',
    ];
}

function run_safety_case(string $scenario): array
{
    $pdo = safety_test_db($scenario);
    $options = [];
    if ($scenario === 'final_stuck') {
        $options['resolveStatus'] = static fn(): string => ONBOARDING_SAFETY_UNIT_REQUIRED;
    }
    if ($scenario === 'master_failure') {
        $pdo->exec('DROP TABLE master_safetyunits');
    }
    try {
        $result = safety_unit_continuation_execute(
            $pdo,
            'E001',
            safety_requested_unit($scenario),
            $options
        );
        return array_merge([
            'outcome' => 'success',
            'status' => $result['status'],
            'nextAction' => $result['nextAction'],
            'idempotent' => (bool)$result['idempotent'],
            'profileUnit' => (string)$result['employee']['Unit'],
            'profilePosition' => (string)$result['employee']['Position'],
        ], safety_state($pdo));
    } catch (SafetyUnitContinuationException $error) {
        return array_merge([
            'outcome' => 'error',
            'code' => $error->reason,
            'httpStatus' => $error->httpStatus,
        ], safety_state($pdo));
    }
}

$scenarioNames = [
    'canonical', 'blank', 'wrong_department', 'invalid', 'unknown_department',
    'no_units', 'idempotent', 'already_completed', 'master_failure',
    'duplicate_master', 'password_required', 'final_stuck',
];
$results = [];
foreach ($scenarioNames as $scenario) $results[$scenario] = run_safety_case($scenario);

$doubleDb = safety_test_db('canonical');
$first = safety_unit_continuation_execute($doubleDb, 'E001', 'Unit A');
$second = safety_unit_continuation_execute($doubleDb, 'E001', " unit a\r\n");
$results['double_submit'] = [
    'firstIdempotent' => (bool)$first['idempotent'],
    'secondIdempotent' => (bool)$second['idempotent'],
    'state' => safety_state($doubleDb),
];

echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
