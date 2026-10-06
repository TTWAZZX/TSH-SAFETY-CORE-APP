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

function johnny_is_system_usage_question(string $question, ?array $pageContext = null): bool
{
    $text = johnny_usage_normalize($question);
    if ($text === '') return false;
    $catalog = johnny_usage_catalog();
    foreach ($catalog['modules'] as $entry) {
        foreach (($entry['questions'] ?? []) as $item) {
            if (johnny_usage_normalize($item) === $text) return true;
        }
    }
    if (preg_match('/วิธีใช้|ใช้งาน|ใช้ยังไง|ใช้อย่างไร|ทำยังไง|ทำอย่างไร|ขั้นตอน|เมนู|โมดูล|อยู่ตรงไหน|เปิดที่ไหน|(?:บันทึก|ส่ง|ดู|ติดตาม|ต่ออายุ|พิมพ์|สร้าง|เพิ่ม|แก้|เลือก|ตอบ).*(?:อย่างไร|ยังไง|ตรงไหน|ที่ไหน)|workflow|quick\s*start|how\s+to|where\s+(?:is|can)|permission|สิทธิ์|ใครใช้|หน้านี้|หน้า(?:นี้)?ใช้|หน้า.*ทำอะไร/iu', $text)) return true;
    if (preg_match('/ทุกโมดูล|ทุกเมนู|เมนูทั้งหมด|ระบบนี้|ภาพรวมการใช้งาน|คู่มือระบบ|เริ่มใช้งานระบบ|วิธีใช้ระบบ|ใช้งานระบบ|ใช้ระบบยังไง/iu', $text)) return true;
    $page = johnny_usage_normalize($pageContext['page'] ?? '');
    return $page !== '' && (bool) preg_match('/หน้านี้|เมนูนี้|ตรงนี้|ใช้งาน|วิธี/u', $text);
}

function johnny_usage_entry_search_text(array $entry): string
{
    return johnny_usage_normalize(implode(' ', array_merge(
        [(string) ($entry['key'] ?? ''), (string) ($entry['route'] ?? ''), (string) ($entry['title'] ?? '')],
        is_array($entry['aliases'] ?? null) ? $entry['aliases'] : [],
        is_array($entry['questions'] ?? null) ? $entry['questions'] : []
    )));
}

function johnny_usage_score_entry(array $entry, string $question, string $pageKey): int
{
    $score = 0;
    if ($pageKey !== '' && in_array($pageKey, [(string) ($entry['key'] ?? ''), (string) ($entry['route'] ?? '')], true)) $score += 100;
    foreach (($entry['aliases'] ?? []) as $rawAlias) {
        $alias = johnny_usage_normalize($rawAlias);
        if ($alias === '') continue;
        if ($question === $alias) $score += 80;
        elseif (mb_strpos($question, $alias) !== false) $score += 35 + min(mb_strlen($alias), 20);
    }
    foreach (($entry['questions'] ?? []) as $rawQuestion) {
        $reference = johnny_usage_normalize($rawQuestion);
        if ($reference !== '' && $question === $reference) $score += 70;
    }
    $key = str_replace(' ', '-', johnny_usage_normalize($entry['key'] ?? ''));
    if ($key !== '' && mb_strpos($question, $key) !== false) $score += 45;
    $terms = array_values(array_unique(array_filter(explode(' ', $question), static fn($term) => mb_strlen($term) >= 2)));
    $haystack = johnny_usage_entry_search_text($entry);
    foreach ($terms as $term) if (mb_strpos($haystack, $term) !== false) $score += 1;
    return $score;
}

function johnny_search_system_usage(string $question, ?array $pageContext = null, int $limit = 3): array
{
    $catalog = johnny_usage_catalog();
    $normalized = johnny_usage_normalize($question);
    if (!johnny_is_system_usage_question($question, $pageContext)) {
        return ['matched' => false, 'broad' => false, 'entries' => [], 'version' => $catalog['version'] ?? 'unknown'];
    }
    $pageKey = str_replace(' ', '-', johnny_usage_normalize($pageContext['page'] ?? ''));
    $broad = (bool) preg_match('/ทุกโมดูล|ทุกเมนู|เมนูทั้งหมด|ระบบนี้|ภาพรวมการใช้งาน|คู่มือระบบ|เริ่มใช้งานระบบ|วิธีใช้ระบบ|ใช้งานระบบ|ใช้ระบบยังไง/iu', $normalized);
    $ranked = [];
    foreach ($catalog['modules'] as $entry) {
        if (!is_array($entry)) continue;
        $score = johnny_usage_score_entry($entry, $normalized, $pageKey);
        if ($score > 0) $ranked[] = ['entry' => $entry, 'score' => $score];
    }
    usort($ranked, static function (array $a, array $b): int {
        $scoreCompare = ((int) $b['score']) <=> ((int) $a['score']);
        return $scoreCompare !== 0 ? $scoreCompare : strcmp((string) ($a['entry']['key'] ?? ''), (string) ($b['entry']['key'] ?? ''));
    });
    $entries = [];
    foreach (array_slice($ranked, 0, max(1, $limit)) as $item) {
        $entries[] = array_merge($item['entry'], ['score' => (int) $item['score']]);
    }
    $titles = [];
    if ($broad) {
        foreach ($catalog['modules'] as $entry) {
            $titles[] = ['key' => $entry['key'] ?? '', 'route' => $entry['route'] ?? '', 'title' => $entry['title'] ?? ''];
        }
    }
    return [
        'matched' => $broad || count($entries) > 0,
        'broad' => $broad,
        'entries' => $entries,
        'version' => $catalog['version'] ?? 'unknown',
        'moduleCount' => count($catalog['modules']),
        'catalogTitles' => $titles,
    ];
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
