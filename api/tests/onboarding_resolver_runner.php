<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';

$payload = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($payload)) {
    fwrite(STDERR, "Invalid JSON input.\n");
    exit(2);
}

$masterData = $payload['masterData'] ?? [];
$employees = $payload['employees'] ?? [];
$results = [];

try {
    $index = onboarding_build_master_index($masterData);
    foreach ($employees as $position => $employee) {
        $result = [
            'name' => (string)($employee['_testName'] ?? ''),
            'employeeId' => (string)($employee['EmployeeID'] ?? $position),
        ];
        try {
            $result['status'] = onboarding_resolve_with_index($employee, $index);
        } catch (OnboardingResolutionException $error) {
            $result['error'] = $error->reason;
        }
        $results[] = $result;
    }

    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE employees (EmployeeID TEXT PRIMARY KEY, Password TEXT NULL, MustChangePassword INTEGER, Department TEXT, Unit TEXT)');
    $pdo->exec('CREATE TABLE master_departments (id INTEGER PRIMARY KEY, Name TEXT)');
    $pdo->exec('CREATE TABLE master_safetyunits (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER)');
    $pdo->exec("INSERT INTO employees VALUES ('T-PHP','hash',0,'Production','Unit A')");
    $pdo->exec("INSERT INTO master_departments VALUES (1,'Production')");
    $pdo->exec("INSERT INTO master_safetyunits VALUES (1,'Unit A',1)");
    $adapterStatus = onboarding_resolve_employee($pdo, 'T-PHP');

    $invalidMasterError = null;
    try {
        onboarding_build_master_index(['departments' => [], 'units' => []]);
    } catch (OnboardingResolutionException $error) {
        $invalidMasterError = $error->reason;
    }

    echo json_encode(
        ['results' => $results, 'adapterStatus' => $adapterStatus, 'invalidMasterError' => $invalidMasterError],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
