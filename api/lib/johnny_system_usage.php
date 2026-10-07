<?php
declare(strict_types=1);

const JOHNNY_SYSTEM_USAGE_KNOWLEDGE_FILE = __DIR__ . '/../../shared/johnny-system-usage-knowledge.json';

function johnny_usage_normalize($value): string
{
    $text = mb_strtolower((string) $value, 'UTF-8');
    $text = str_replace(['_', '/'], ' ', $text);
    $text = preg_replace('/[^\p{L}\p{M}\p{N}\s-]+/u', ' ', $text) ?: '';
    return trim(preg_replace('/\s+/u', ' ', $text) ?: $text);
}

function johnny_usage_catalog(): array
{
    static $catalog = null;
    if (is_array($catalog)) return $catalog;
    $raw = @file_get_contents(JOHNNY_SYSTEM_USAGE_KNOWLEDGE_FILE);
    $parsed = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($parsed) || empty($parsed['modules']) || !is_array($parsed['modules'])) {
        throw new RuntimeException('Johnny system usage knowledge is empty or invalid');
    }
    $catalog = $parsed;
    return $catalog;
}

function johnny_usage_contains_alias(string $text, string $alias): bool
{
    if ($alias === '') return false;
    if (preg_match('/^[a-z0-9-]{1,3}$/i', $alias)) return in_array($alias, explode(' ', $text), true);
    return mb_strpos($text, $alias) !== false;
}

function johnny_usage_empty_result(array $catalog, array $overrides = []): array
{
    return array_merge([
        'matched' => false,
        'pureUsage' => false,
        'confidence' => 0,
        'confidenceLevel' => 'none',
        'reasons' => [],
        'explicitUiIntent' => false,
        'referencedPage' => null,
        'referencedModules' => [],
        'requiresKnowledgeBase' => false,
        'mixedIntent' => false,
        'broad' => false,
        'entries' => [],
        'version' => $catalog['version'] ?? 'unknown',
        'moduleCount' => count($catalog['modules'] ?? []),
        'catalogTitles' => [],
    ], $overrides);
}

function johnny_usage_classify_signals(string $question, ?array $pageContext = null): array
{
    $catalog = johnny_usage_catalog();
    $text = johnny_usage_normalize($question);
    if ($text === '') return johnny_usage_empty_result($catalog);

    $pageKey = str_replace(' ', '-', johnny_usage_normalize($pageContext['page'] ?? ''));
    $pageEntry = null;
    $exactEntries = [];
    $referencedEntries = [];
    foreach ($catalog['modules'] as $entry) {
        if (!is_array($entry)) continue;
        if ($pageKey !== '' && in_array($pageKey, [(string) ($entry['key'] ?? ''), (string) ($entry['route'] ?? '')], true)) $pageEntry = $entry;
        foreach (($entry['questions'] ?? []) as $item) {
            if (johnny_usage_normalize($item) === $text) {
                $exactEntries[] = $entry;
                break;
            }
        }
        $names = array_merge(
            [(string) ($entry['key'] ?? ''), (string) ($entry['route'] ?? ''), (string) ($entry['title'] ?? '')],
            is_array($entry['aliases'] ?? null) ? $entry['aliases'] : []
        );
        foreach ($names as $rawName) {
            $name = johnny_usage_normalize($rawName);
            if (johnny_usage_contains_alias($text, $name)) {
                $referencedEntries[] = $entry;
                break;
            }
        }
    }

    $broad = (bool) preg_match('/ทุกโมดูล|ทุกเมนู|เมนูทั้งหมด|ระบบนี้|ภาพรวมการใช้งาน|คู่มือระบบ|เริ่มใช้งานระบบ|วิธีใช้ระบบ|ใช้งานระบบ|ใช้ระบบยังไง/iu', $text);
    $pageReference = (bool) preg_match('/หน้านี้|เมนูนี้|ตรงนี้|หน้า(?:นี้)?ใช้|this\s+page|this\s+menu|on\s+this\s+page/iu', $text);
    $contextualUiAction = (bool) preg_match('/ต้องกด(?:ตรง)?ไหน|กดตรงไหน|อยู่(?:ตรง)?ไหน|เปิด(?:หน้า|เมนู)?(?:ที่)?ไหน|where\s+(?:is|can\s+i\s+find)|which\s+(?:button|menu|page)/iu', $text);
    $uiAction = (bool) preg_match('/(?:กด|คลิก|เปิด|เข้า|เลือก|ไปที่).*(?:ตรงไหน|ที่ไหน|เมนู|หน้า|dashboard|analytics|ปุ่ม)|(?:เมนู|หน้า|โมดูล|dashboard|analytics).*(?:อยู่ไหน|อยู่ตรงไหน|ใช้อย่างไร|ใช้ยังไง|ใช้งาน|ทำอะไร)|workflow|quick\s*start|permission|สิทธิ์|ใครใช้|how\s+do\s+i\s+(?:open|use|access|find|navigate)|how\s+to\s+(?:open|use|access|find|navigate)|where\s+(?:is|can\s+i\s+find)/iu', $text);
    $modulePurpose = (bool) preg_match('/(?:โมดูล|หน้า|เมนู)/iu', $text) && (bool) preg_match('/(?:ใช้ทำอะไร|ทำอะไร|ใช้งานอย่างไร|ใช้ยังไง)/iu', $text);
    $explicitUiIntent = $broad || count($exactEntries) > 0 || $modulePurpose || $uiAction || $pageReference || $contextualUiAction;
    $documentSignal = count($exactEntries) === 0 && !$modulePurpose && (bool) preg_match('/ตามเอกสาร|เอกสารบริษัท|เอกสารนี้|นโยบาย|ระเบียบ|ข้อกำหนด|มาตรฐาน|กฎหมาย|\bwi\b|company\s+(?:document|policy|rule|requirement)|what\s+does\s+company\s+policy\s+require|regulation|standard/iu', $text);
    $safetySignal = count($exactEntries) === 0 && (bool) preg_match('/วิธีปฏิบัติงานอย่างปลอดภัย|ปฐมพยาบาล|ไฟไหม้|เพลิงไหม้|สารเคมี(?:รั่ว|หก|กระเด็น)|บาดเจ็บ|เหตุฉุกเฉิน|หมดสติ|วิธีใช้\s*ppe|ใช้\s*ppe\s*ที่ถูก|สวม\s*ppe|first\s+aid|fire\s+emergency|chemical\s+(?:spill|leak)|injur(?:y|ed)|emergency/iu', $text);
    $liveDataSignal = count($exactEntries) === 0 && (bool) preg_match('/วันนี้|ขณะนี้|ตอนนี้|ล่าสุด|กี่คน|กี่รายการ|กี่ครั้ง|จำนวน|สถานะล่าสุด|เช็กอินครบ|ยังไม่ปิด|current\s+(?:count|status)|how\s+many|latest\s+status/iu', $text);
    $usePageContext = is_array($pageEntry) && ($pageReference || $contextualUiAction) && count($referencedEntries) === 0;
    $candidates = count($exactEntries) > 0
        ? $exactEntries
        : (count($referencedEntries) > 0 ? $referencedEntries : ($usePageContext ? [$pageEntry] : []));
    $matched = $broad || ($explicitUiIntent && count($candidates) > 0);
    $requiresKnowledgeBase = $documentSignal || $safetySignal;
    $mixedIntent = $matched && ($requiresKnowledgeBase || $liveDataSignal);
    $pureUsage = $matched && !$mixedIntent && !$liveDataSignal;
    $reasons = [];
    if (count($exactEntries) > 0) $reasons[] = 'exact_catalog_question';
    if ($broad) $reasons[] = 'broad_system_usage_request';
    if (count($referencedEntries) > 0) $reasons[] = 'explicit_module_reference';
    if ($usePageContext) $reasons[] = 'explicit_ui_reference_with_page_context';
    if ($documentSignal) $reasons[] = 'company_document_signal';
    if ($safetySignal) $reasons[] = 'safety_or_emergency_signal';
    if ($liveDataSignal) $reasons[] = 'live_system_data_signal';
    if ($explicitUiIntent && !$matched) $reasons[] = 'ui_intent_without_verified_module';
    $confidence = 0.0;
    if ($matched) $confidence = count($exactEntries) > 0 || $broad || $usePageContext ? 1.0 : 0.9;
    if ($mixedIntent) $confidence = min($confidence, 0.75);

    return johnny_usage_empty_result($catalog, [
        'matched' => $matched,
        'pureUsage' => $pureUsage,
        'confidence' => $confidence,
        'confidenceLevel' => $confidence >= 0.85 ? 'high' : ($confidence >= 0.6 ? 'medium' : ($confidence > 0 ? 'low' : 'none')),
        'reasons' => $reasons,
        'explicitUiIntent' => $explicitUiIntent,
        'referencedPage' => $usePageContext ? (string) ($pageEntry['key'] ?? '') : null,
        'referencedModules' => array_values(array_map(static fn(array $entry): string => (string) ($entry['key'] ?? ''), $candidates)),
        'requiresKnowledgeBase' => $requiresKnowledgeBase,
        'mixedIntent' => $mixedIntent,
        'broad' => $broad,
        '_candidates' => $candidates,
    ]);
}

function johnny_is_system_usage_question(string $question, ?array $pageContext = null): bool
{
    return !empty(johnny_usage_classify_signals($question, $pageContext)['matched']);
}

function johnny_search_system_usage(string $question, ?array $pageContext = null, int $limit = 3): array
{
    $catalog = johnny_usage_catalog();
    $classified = johnny_usage_classify_signals($question, $pageContext);
    $candidates = !empty($classified['matched']) && is_array($classified['_candidates'] ?? null) ? $classified['_candidates'] : [];
    $entries = [];
    foreach (array_slice($candidates, 0, max(1, $limit)) as $index => $entry) {
        $score = in_array('exact_catalog_question', $classified['reasons'] ?? [], true) ? 100 : ($index === 0 ? 90 : 80);
        $entries[] = array_merge($entry, ['score' => $score]);
    }
    $titles = [];
    if (!empty($classified['broad'])) {
        foreach ($catalog['modules'] as $entry) {
            $titles[] = ['key' => $entry['key'] ?? '', 'route' => $entry['route'] ?? '', 'title' => $entry['title'] ?? ''];
        }
    }
    unset($classified['_candidates']);
    return array_merge($classified, [
        'entries' => $entries,
        'catalogTitles' => $titles,
    ]);
}

function johnny_usage_context_text(array $result): string
{
    if (empty($result['matched'])) return '';
    $blocks = [
        'SYSTEM USAGE KNOWLEDGE (' . (string) ($result['version'] ?? 'unknown') . '): This is verified product guidance from the project module registry and Help Center. It is not live business data and not company policy evidence.',
        'Use only the listed purpose, steps, reports, audience and warnings. Describe role-dependent actions conditionally. Never invent buttons, permissions, statuses or workflow steps.',
    ];
    if (!empty($result['broad']) && !empty($result['catalogTitles'])) {
        $labels = [];
        foreach ($result['catalogTitles'] as $item) $labels[] = (string) ($item['title'] ?? '') . ' (#' . (string) ($item['route'] ?? '') . ')';
        $blocks[] = 'Available modules (' . (int) ($result['moduleCount'] ?? count($labels)) . '): ' . implode('; ', $labels);
    }
    foreach (($result['entries'] ?? []) as $index => $entry) {
        $steps = [];
        foreach (($entry['steps'] ?? []) as $stepIndex => $step) $steps[] = ($stepIndex + 1) . '. ' . $step;
        $blocks[] = implode("\n", [
            '[U' . ($index + 1) . '] ' . (string) ($entry['title'] ?? '') . ' (#' . (string) ($entry['route'] ?? '') . ')',
            'Purpose: ' . (string) ($entry['purpose'] ?? ''),
            'Audience: ' . (!empty($entry['audience']) ? implode(', ', $entry['audience']) : '-'),
            'Steps: ' . ($steps ? implode(' ', $steps) : '-'),
            'Reports: ' . (!empty($entry['reports']) ? implode('; ', $entry['reports']) : 'ไม่มีรายงานเฉพาะที่ยืนยันในคู่มือ'),
            'Warnings: ' . (!empty($entry['warnings']) ? implode('; ', $entry['warnings']) : '-'),
        ]);
    }
    return implode("\n\n", $blocks);
}

function johnny_usage_citations(array $result): array
{
    if (empty($result['matched'])) return [];
    if (!empty($result['broad']) && empty($result['entries'])) {
        return [[
            'index' => 1,
            'referenceId' => 'U1',
            'type' => 'system_usage',
            'sourceLabel' => 'คู่มือการใช้งานระบบ',
            'module' => 'all',
            'title' => 'คู่มือการใช้งานระบบทุกโมดูล',
            'route' => 'dashboard',
            'version' => $result['version'] ?? 'unknown',
            'excerpt' => 'ทะเบียนคู่มือ ' . (int) ($result['moduleCount'] ?? 0) . ' โมดูล',
        ]];
    }
    $citations = [];
    foreach (($result['entries'] ?? []) as $index => $entry) {
        $citations[] = [
            'index' => $index + 1,
            'referenceId' => 'U' . ($index + 1),
            'type' => 'system_usage',
            'sourceLabel' => 'คู่มือการใช้งานระบบ',
            'module' => $entry['key'] ?? '',
            'title' => 'คู่มือการใช้งาน: ' . (string) ($entry['title'] ?? ''),
            'route' => $entry['route'] ?? '',
            'version' => $result['version'] ?? 'unknown',
            'excerpt' => $entry['purpose'] ?? '',
        ];
    }
    return $citations;
}

function johnny_usage_answer_text(array $result): string
{
    if (empty($result['matched'])) return '';
    if (!empty($result['broad']) && !empty($result['catalogTitles'])) {
        $lines = [];
        foreach ($result['catalogTitles'] as $index => $item) {
            $lines[] = ($index + 1) . '. ' . (string) ($item['title'] ?? '') . ' เปิดที่เมนู ' . (string) ($item['route'] ?? '');
        }
        return 'ระบบมีคู่มือการใช้งาน ' . (int) ($result['moduleCount'] ?? count($lines)) . " โมดูลครับ\n\n" . implode("\n", $lines) . "\n\nพี่สามารถถามชื่อโมดูลต่อได้ เช่น “ใช้ Safety Patrol อย่างไร” หรือเปิดปุ่มถาม Johnny จากหน้าที่กำลังใช้งานอยู่ครับ";
    }
    $blocks = [];
    foreach (($result['entries'] ?? []) as $entry) {
        $lines = [(string) ($entry['title'] ?? ''), (string) ($entry['purpose'] ?? '')];
        if (!empty($entry['steps'])) {
            $lines[] = 'วิธีใช้งาน';
            foreach ($entry['steps'] as $index => $step) $lines[] = ($index + 1) . '. ' . $step;
        }
        if (!empty($entry['audience'])) $lines[] = 'ผู้ใช้งานตามสิทธิ์: ' . implode(', ', $entry['audience']);
        if (!empty($entry['reports'])) $lines[] = 'รายงานที่เกี่ยวข้อง: ' . implode(', ', $entry['reports']);
        if (!empty($entry['warnings'])) $lines[] = 'ข้อควรระวัง: ' . implode('; ', $entry['warnings']);
        $lines[] = 'เปิดโมดูลที่เมนู ' . (string) ($entry['route'] ?? '');
        $blocks[] = implode("\n", $lines);
    }
    $answer = trim(implode("\n\n", $blocks));
    return preg_match('/ครับ$/u', $answer) ? $answer : $answer . 'ครับ';
}
