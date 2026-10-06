<?php
declare(strict_types=1);

const JOHNNY_WORKFLOW_CONTRACT_VERSION = '2026-10-06-phase5-r1';
const JOHNNY_WORKFLOW_DRAFT_TARGETS = ['hiyari', 'ky', 'patrol'];

function johnny_workflow_action_contract(): array
{
    $catalog = johnny_usage_catalog();
    $navigationTargets = array_map(static fn($entry) => [
        'key' => (string) ($entry['key'] ?? ''),
        'route' => (string) ($entry['route'] ?? ''),
        'title' => (string) ($entry['title'] ?? ''),
    ], $catalog['modules'] ?? []);
    return [
        'version' => JOHNNY_WORKFLOW_CONTRACT_VERSION,
        'navigationTargets' => $navigationTargets,
        'draftTargets' => array_values(array_filter($navigationTargets, static fn($entry) => in_array($entry['key'], JOHNNY_WORKFLOW_DRAFT_TARGETS, true))),
        'autoSubmit' => false,
        'businessMutation' => false,
    ];
}

function johnny_normalize_workflow_action(array $input): array
{
    $contract = johnny_workflow_action_contract();
    $requestedTarget = strtolower(trim((string) ($input['target'] ?? '')));
    $requestedAction = strtolower(trim((string) ($input['action'] ?? '')));
    $action = $requestedAction === 'deep_link' ? 'navigate' : $requestedAction;
    if (!in_array($action, ['navigate', 'draft'], true)) {
        throw new InvalidArgumentException('Invalid Johnny workflow action');
    }
    $target = null;
    foreach ($contract['navigationTargets'] as $entry) {
        if ($entry['key'] === $requestedTarget || $entry['route'] === $requestedTarget) {
            $target = $entry;
            break;
        }
    }
    if (!$target) throw new InvalidArgumentException('Invalid Johnny workflow target');
    if ($action === 'draft' && !in_array($target['key'], JOHNNY_WORKFLOW_DRAFT_TARGETS, true)) {
        throw new InvalidArgumentException('Johnny draft handoff is not available for this module');
    }
    return [
        'version' => JOHNNY_WORKFLOW_CONTRACT_VERSION,
        'action' => $action,
        'target' => $target['key'],
        'route' => $target['route'],
        'title' => $target['title'],
        'autoSubmit' => false,
        'businessMutation' => false,
    ];
}
