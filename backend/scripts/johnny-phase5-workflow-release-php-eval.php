<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/lib/johnny_system_usage.php';
require_once __DIR__ . '/../../api/lib/johnny_workflow_actions.php';

const JOHNNY_PHASE5_WORKFLOW_RELEASE_PHP = 'mock-only-no-db-no-network';
$results = [];
$check = static function (string $name, bool $pass, string $details = '') use (&$results): void {
    $results[] = ['name' => $name, 'pass' => $pass, 'details' => $details];
};
$contract = johnny_workflow_action_contract();
$catalog = johnny_usage_catalog();
$check('Phase 5 contract version', ($contract['version'] ?? '') === '2026-10-06-phase5-r1');
$check('navigation covers 21 modules', count($contract['navigationTargets'] ?? []) === 21 && count($catalog['modules'] ?? []) === 21);
$check('navigation matches catalog', array_map(static fn($item) => $item['key'], $contract['navigationTargets']) === array_map(static fn($item) => $item['key'], $catalog['modules']));
$check('draft targets restricted', array_map(static fn($item) => $item['key'], $contract['draftTargets']) === ['patrol', 'hiyari', 'ky']);
$check('automatic submission forbidden', ($contract['autoSubmit'] ?? null) === false && ($contract['businessMutation'] ?? null) === false);
foreach ($catalog['modules'] as $module) {
    $action = johnny_normalize_workflow_action(['target' => $module['route'], 'action' => 'navigate']);
    $check('navigate ' . $module['key'], $action['target'] === $module['key'] && $action['route'] === $module['route']);
}
$alias = johnny_normalize_workflow_action(['target' => 'accident', 'action' => 'deep_link']);
$check('legacy deep link normalized', $alias['action'] === 'navigate');
foreach (['hiyari', 'ky', 'patrol'] as $target) {
    $action = johnny_normalize_workflow_action(['target' => $target, 'action' => 'draft']);
    $check('draft ' . $target, $action['action'] === 'draft' && $action['autoSubmit'] === false);
}
$rejections = [
    ['unknown target', ['target' => 'payroll', 'action' => 'navigate']],
    ['unknown action', ['target' => 'dashboard', 'action' => 'delete']],
    ['draft outside allowlist', ['target' => 'dashboard', 'action' => 'draft']],
];
foreach ($rejections as [$name, $input]) {
    $rejected = false;
    try { johnny_normalize_workflow_action($input); } catch (InvalidArgumentException $error) { $rejected = true; }
    $check('reject ' . $name, $rejected);
}
$phpRoute = (string) file_get_contents(__DIR__ . '/../../api/handlers/johnny_ai.php');
$workspace = (string) file_get_contents(__DIR__ . '/../../public/js/pages/johnny-ai.js');
$drawer = (string) file_get_contents(__DIR__ . '/../../public/js/johnny-drawer.js');
$contains = static function (string $haystack, string $needle): bool { return strpos($haystack, $needle) !== false; };
$check('PHP validates workflow contract', $contains($phpRoute, 'johnny_normalize_workflow_action'));
$check('PHP requires owned assistant answer', $contains($phpRoute, "UserID=? AND Role='assistant'"));
$check('workspace uses workflow registry', $contains($workspace, '_status?.workflow?.navigationTargets'));
$check('drawer logs navigation', $contains($drawer, 'openWorkflowRoute') && $contains($drawer, '/johnny/workflow-actions'));
$failures = array_values(array_filter($results, static fn($item) => !$item['pass']));
echo json_encode([
    'marker' => 'JOHNNY_PHASE5_SAFE_WORKFLOW_INTEGRATION_PHP',
    'mode' => JOHNNY_PHASE5_WORKFLOW_RELEASE_PHP,
    'modules' => count($contract['navigationTargets']),
    'checks' => count($results),
    'passed' => count($results) - count($failures),
    'failed' => count($failures),
    'failures' => $failures,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failures ? 1 : 0);
