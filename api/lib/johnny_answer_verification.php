<?php
declare(strict_types=1);

const JOHNNY_ANSWER_VERIFICATION_VERSION = '2026-10-07-phase8.3-r1';

function johnny_verification_normalize($value): string
{
    $text = mb_strtolower((string) $value);
    $text = str_replace(['“', '”', '‘', '’'], "'", $text);
    return trim((string) preg_replace('/\s+/u', ' ', $text));
}

function johnny_verification_unique(array $values): array
{
    return array_values(array_unique(array_values(array_filter($values, static fn($value): bool => $value !== ''))));
}

function johnny_extract_critical_facts(string $text): array
{
    preg_match_all('/\b\d+(?:[.,]\d+)?\s*(?:%|minutes?|hours?|days?|weeks?|months?|years?|meters?|metres?|mm|cm|km|ครั้ง|คน|รายการ|นาที|ชั่วโมง|วัน|สัปดาห์|เดือน|ปี|เปอร์เซ็นต์|เมตร)(?=$|[\s.,;:!?])/iu', $text, $measurements);
    preg_match_all('/\b(?:plant|she|safety|factory|department|general|managing|site|direct)\s+(?:manager|director|supervisor|officer|head)\b/iu', $text, $roles);
    return [
        'measurement' => johnny_verification_unique(array_map('johnny_verification_normalize', $measurements[0] ?? [])),
        'role' => johnny_verification_unique(array_map('johnny_verification_normalize', $roles[0] ?? [])),
    ];
}

function johnny_citation_integrity(array $citations): array
{
    $ids = [];
    $invalid = 0;
    foreach ($citations as $citation) {
        $id = trim((string) ($citation['referenceId'] ?? ''));
        $ids[] = $id;
        if ($id === '' || !preg_match('/^[A-Z]\d+$/', $id) || trim((string) ($citation['type'] ?? '')) === '') $invalid++;
    }
    return [
        'valid' => $invalid === 0 && count(array_unique($ids)) === count($ids),
        'citationCount' => count($citations),
        'invalidCount' => $invalid,
        'duplicateReferenceCount' => count($ids) - count(array_unique($ids)),
    ];
}

function johnny_verification_fail_closed_answer(string $answerText): string
{
    return preg_match('/[\x{0E00}-\x{0E7F}]/u', $answerText)
        ? 'จอห์นนี่ยังไม่สามารถยืนยันรายละเอียดสำคัญบางส่วนของคำตอบนี้จากหลักฐานที่เลือกได้ จึงไม่แสดงรายละเอียดที่อาจคลาดเคลื่อน กรุณาตรวจสอบเอกสารอ้างอิงที่แนบหรือสอบถามผู้รับผิดชอบก่อนดำเนินการครับ'
        : 'Johnny could not verify one or more critical details in this answer against the selected evidence, so the potentially inaccurate details were withheld. Please review the attached sources or confirm with the responsible owner before acting.';
}

function johnny_verify_grounded_answer(array $args): array
{
    $answerText = (string) ($args['answerText'] ?? '');
    $sourceType = (string) ($args['sourceType'] ?? '');
    $evidenceTexts = is_array($args['evidenceTexts'] ?? null) ? $args['evidenceTexts'] : [];
    $citations = is_array($args['citations'] ?? null) ? $args['citations'] : [];
    $corpus = johnny_verification_normalize(implode("\n", array_map('strval', $evidenceTexts)));
    $integrity = johnny_citation_integrity($citations);
    $grounded = in_array($sourceType, ['company_document', 'safety_knowledge', 'system_data'], true) && $corpus !== '';
    if (!$grounded) {
        return ['answerText' => $answerText, 'audit' => [
            'version' => JOHNNY_ANSWER_VERIFICATION_VERSION, 'checked' => false, 'status' => 'not_applicable',
            'materialClaimCount' => 0, 'supportedClaimCount' => 0, 'unsupportedClaimCount' => 0,
            'unsupportedClaimTypes' => [], 'citationIntegrity' => $integrity, 'failClosed' => false,
        ]];
    }

    $facts = johnny_extract_critical_facts($answerText);
    $unsupported = [];
    foreach ($facts as $type => $values) {
        foreach ($values as $value) if (mb_strpos($corpus, $value) === false) $unsupported[] = ['type' => $type, 'value' => $value];
    }
    if (empty($integrity['valid'])) $unsupported[] = ['type' => 'citation_integrity', 'value' => ''];
    $materialCount = array_sum(array_map('count', $facts));
    $unsupportedFacts = count(array_filter($unsupported, static fn(array $item): bool => $item['type'] !== 'citation_integrity'));
    $failClosed = count($unsupported) > 0;
    return [
        'answerText' => $failClosed ? johnny_verification_fail_closed_answer($answerText) : $answerText,
        'audit' => [
            'version' => JOHNNY_ANSWER_VERIFICATION_VERSION,
            'checked' => true,
            'status' => $failClosed ? 'fail_closed' : ($materialCount ? 'verified' : 'no_material_claims'),
            'materialClaimCount' => $materialCount,
            'supportedClaimCount' => max(0, $materialCount - $unsupportedFacts),
            'unsupportedClaimCount' => count($unsupported),
            'unsupportedClaimTypes' => johnny_verification_unique(array_map(static fn(array $item): string => $item['type'], $unsupported)),
            'citationIntegrity' => $integrity,
            'failClosed' => $failClosed,
        ],
    ];
}
