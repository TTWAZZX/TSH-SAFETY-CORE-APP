<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/lib/johnny_system_usage.php';

const JOHNNY_PHASE3_SYSTEM_USAGE_KNOWLEDGE_PHP = 'mock-only-no-db-no-network';

$catalog = johnny_usage_catalog();
$checks = [];
$failures = [];
$caseCount = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$checks, &$failures): void {
    $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail];
    if (!$ok) $failures[] = $name . ($detail !== '' ? ': ' . $detail : '');
};

$manifestText = file_get_contents(__DIR__ . '/../../public/js/module-meta.js') ?: '';
$manifestKeys = [];
if (preg_match('/export const MODULE_ORDER\s*=\s*\[(.*?)\];/s', $manifestText, $match)) {
    preg_match_all("/'([^']+)'/", $match[1], $keys);
    $manifestKeys = $keys[1] ?? [];
}
$catalogKeys = array_values(array_map(static fn(array $entry): string => (string) ($entry['key'] ?? ''), $catalog['modules']));
$check('catalog version includes Safety Vote guidance', preg_match('/^2026-10-10-safety-vote-r\d+$/', (string) ($catalog['version'] ?? '')) === 1);
$check('catalog covers registered modules', $catalogKeys === $manifestKeys, count($catalogKeys) . '/' . count($manifestKeys));
$safetyVoteGuide = current(array_filter($catalog['modules'], static fn(array $entry): bool => ($entry['key'] ?? '') === 'safety-vote')) ?: [];
$safetyVoteWarnings = json_encode($safetyVoteGuide['warnings'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
$safetyVoteSteps = json_encode($safetyVoteGuide['steps'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
$check('Safety Vote guidance covers User Juror and Admin', in_array('User', $safetyVoteGuide['audience'] ?? [], true) && in_array('Juror', $safetyVoteGuide['audience'] ?? [], true) && in_array('Admin', $safetyVoteGuide['audience'] ?? [], true));
$check('Safety Vote guidance preserves privacy boundaries', count(array_filter(['voter-to-choice', 'response identity', 'blind identity', 'privacy threshold'], static fn(string $term): bool => strpos($safetyVoteWarnings, $term) !== false)) === 4);
$check('Safety Vote guidance covers drafts and promotion', mb_strpos($safetyVoteSteps, 'ฉบับร่าง') !== false && mb_strpos($safetyVoteSteps, 'ป้ายกิจกรรม') !== false);

foreach ($catalog['modules'] as $module) {
    foreach (($module['questions'] ?? []) as $question) {
        $caseCount++;
        $result = johnny_search_system_usage((string) $question);
        $actual = (string) ($result['entries'][0]['key'] ?? '');
        $check('fixture ' . $module['key'] . ' -> ' . $question, !empty($result['matched']) && $actual === $module['key'], $actual);
    }
    $caseCount++;
    $contextResult = johnny_search_system_usage('หน้านี้ใช้งานอย่างไร', ['page' => $module['route'], 'title' => $module['title']]);
    $contextActual = (string) ($contextResult['entries'][0]['key'] ?? '');
    $check('page context ' . $module['key'], !empty($contextResult['matched']) && $contextActual === $module['key'], $contextActual);
    $citations = johnny_usage_citations($contextResult);
    $check('citation ' . $module['key'], count($citations) > 0 && count(array_filter($citations, static fn(array $item): bool => ($item['type'] ?? '') !== 'system_usage')) === 0);
    $answer = johnny_usage_answer_text($contextResult);
    $check('plain answer ' . $module['key'], $answer !== '' && !preg_match('/[`*]|^#{1,6}\s/m', $answer));
    $caseCount++;
    $purposeResult = johnny_search_system_usage('โมดูล ' . (string) $module['title'] . ' ใช้ทำอะไร');
    $purposeActual = (string) ($purposeResult['entries'][0]['key'] ?? '');
    $check('module purpose ' . $module['key'], !empty($purposeResult['matched']) && $purposeActual === $module['key'], $purposeActual);
}

$caseCount++;
$broad = johnny_search_system_usage('ช่วยแนะนำคู่มือระบบทุกโมดูล');
$check('broad catalog question', !empty($broad['matched']) && !empty($broad['broad']) && mb_strpos(johnny_usage_answer_text($broad), (string) count($catalog['modules'])) !== false);
$caseCount++;
$broadShort = johnny_search_system_usage('วิธีใช้ระบบ');
$check('short broad catalog question', !empty($broadShort['matched']) && !empty($broadShort['broad']) && mb_strpos(johnny_usage_answer_text($broadShort), (string) count($catalog['modules'])) !== false);

$negatives = [
    'วันนี้ Safety Patrol เช็กอินครบกี่คน',
    'มี Hiyari ที่ยังไม่ปิดกี่รายการ',
    'กฎ E-Pass ของบริษัทกำหนดว่าอย่างไร',
    'ถ้าไฟไหม้ต้องทำอะไรทันที',
    'ช่วยวิเคราะห์ความเสี่ยงจากรูปนี้',
    'สวัสดีจอห์นนี่',
];
foreach ($negatives as $index => $question) {
    $caseCount++;
    $result = johnny_search_system_usage($question);
    $check('negative ' . ($index + 1), empty($result['matched']), $question);
}

$passed = count(array_filter($checks, static fn(array $item): bool => $item['ok']));
echo json_encode([
    'marker' => 'JOHNNY_PHASE3_SYSTEM_USAGE_KNOWLEDGE_PHP',
    'mode' => JOHNNY_PHASE3_SYSTEM_USAGE_KNOWLEDGE_PHP,
    'version' => $catalog['version'] ?? null,
    'modules' => count($catalog['modules']),
    'evaluationCases' => $caseCount,
    'passed' => $passed,
    'total' => count($checks),
    'failures' => $failures,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;

if ($failures) exit(1);
