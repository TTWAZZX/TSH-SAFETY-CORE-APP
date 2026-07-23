<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';
require_once dirname(__DIR__) . '/lib/password_continuation.php';

function continuation_test_db(string $scenario): PDO
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
    $pdo->prepare('INSERT INTO master_departments(id,Name) VALUES(1,?)')->execute(['Production']);
    if ($scenario === 'safety') {
        $pdo->prepare('INSERT INTO master_safetyunits(id,name,department_id) VALUES(1,?,1)')->execute(['Unit A']);
    }
    $department = $scenario === 'unknown_department' ? 'Unknown' : " Production\r\n";
    $pdo->prepare(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword) '
        . 'VALUES(?,?,?,?,?,?,?,?,1)'
    )->execute(['E001', 'Employee One', $department, '', 'A', 'Operator', 'User', password_hash('oldpass', PASSWORD_BCRYPT)]);
    return $pdo;
}

function continuation_state(PDO $pdo): array
{
    $row = $pdo->query("SELECT Password,MustChangePassword FROM employees WHERE EmployeeID='E001'")->fetch();
    return [
        'mustChangePassword' => (int)$row['MustChangePassword'],
        'newPasswordStored' => password_verify('newpass', (string)$row['Password']),
        'oldPasswordStored' => password_verify('oldpass', (string)$row['Password']),
    ];
}

function run_continuation_case(string $scenario): array
{
    $pdo = continuation_test_db($scenario);
    $current = $scenario === 'wrong_current' ? 'incorrect' : 'oldpass';
    $new = $scenario === 'reuse' ? 'oldpass' : ($scenario === 'short' ? 'abc' : 'newpass');
    $options = [];
    if ($scenario === 'resolver_failure') {
        $options['resolveStatus'] = static function (): string {
            throw new RuntimeException('master read failed');
        };
    } elseif ($scenario === 'password_state_stuck') {
        $options['resolveStatus'] = static fn(): string => ONBOARDING_PASSWORD_CHANGE_REQUIRED;
    }
    try {
        $result = password_continuation_execute($pdo, 'E001', $current, $new, $options);
        return array_merge([
            'outcome' => 'success',
            'status' => $result['status'],
            'nextAction' => $result['nextAction'],
        ], continuation_state($pdo));
    } catch (PasswordContinuationException $error) {
        return array_merge([
            'outcome' => 'error',
            'code' => $error->reason,
            'httpStatus' => $error->httpStatus,
        ], continuation_state($pdo));
    }
}

$scenarioNames = ['ready', 'safety', 'wrong_current', 'reuse', 'short', 'resolver_failure', 'unknown_department', 'password_state_stuck'];
$results = [];
foreach ($scenarioNames as $scenario) {
    $results[$scenario] = run_continuation_case($scenario);
}

$doubleDb = continuation_test_db('ready');
$first = password_continuation_execute($doubleDb, 'E001', 'oldpass', 'newpass');
try {
    password_continuation_execute($doubleDb, 'E001', 'oldpass', 'newpass');
    $second = ['outcome' => 'success'];
} catch (PasswordContinuationException $error) {
    $second = ['outcome' => 'error', 'code' => $error->reason, 'httpStatus' => $error->httpStatus];
}
$results['double_submit'] = [
    'first' => ['status' => $first['status'], 'nextAction' => $first['nextAction']],
    'second' => $second,
    'state' => continuation_state($doubleDb),
];

echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
