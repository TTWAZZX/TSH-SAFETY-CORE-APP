'use strict';

const CONTRACT_VERSION = '2026-10-07-phase8.3-r1';
const GROUNDED_SOURCE_TYPES = new Set(['company_document', 'safety_knowledge', 'system_data']);

function normalize(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[“”‘’]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function extractCriticalFacts(text) {
    const value = String(text || '');
    const measurements = value.match(/\b\d+(?:[.,]\d+)?\s*(?:%|minutes?|hours?|days?|weeks?|months?|years?|meters?|metres?|mm|cm|km|ครั้ง|คน|รายการ|นาที|ชั่วโมง|วัน|สัปดาห์|เดือน|ปี|เปอร์เซ็นต์|เมตร)(?=$|[\s.,;:!?])/giu) || [];
    const roles = value.match(/\b(?:plant|she|safety|factory|department|general|managing|site|direct)\s+(?:manager|director|supervisor|officer|head)\b/giu) || [];
    return {
        measurement: unique(measurements.map(normalize)),
        role: unique(roles.map(normalize)),
    };
}

function citationIntegrity(citations) {
    const rows = Array.isArray(citations) ? citations : [];
    const ids = rows.map(row => String(row?.referenceId || '').trim());
    const invalidCount = rows.filter((row, index) => {
        const id = ids[index];
        return !id || !/^[A-Z]\d+$/.test(id) || !String(row?.type || '').trim();
    }).length;
    return {
        valid: invalidCount === 0 && unique(ids).length === ids.length,
        citationCount: rows.length,
        invalidCount,
        duplicateReferenceCount: ids.length - unique(ids).length,
    };
}

function failClosedAnswer(answerText) {
    const thai = /[\u0E00-\u0E7F]/u.test(String(answerText || ''));
    return thai
        ? 'จอห์นนี่ยังไม่สามารถยืนยันรายละเอียดสำคัญบางส่วนของคำตอบนี้จากหลักฐานที่เลือกได้ จึงไม่แสดงรายละเอียดที่อาจคลาดเคลื่อน กรุณาตรวจสอบเอกสารอ้างอิงที่แนบหรือสอบถามผู้รับผิดชอบก่อนดำเนินการครับ'
        : 'Johnny could not verify one or more critical details in this answer against the selected evidence, so the potentially inaccurate details were withheld. Please review the attached sources or confirm with the responsible owner before acting.';
}

function verifyGroundedAnswer({ answerText, sourceType, evidenceTexts = [], citations = [] } = {}) {
    const corpus = normalize((evidenceTexts || []).join('\n'));
    const integrity = citationIntegrity(citations);
    const grounded = GROUNDED_SOURCE_TYPES.has(String(sourceType || '')) && corpus.length > 0;
    if (!grounded) {
        return {
            answerText: String(answerText || ''),
            audit: {
                version: CONTRACT_VERSION,
                checked: false,
                status: 'not_applicable',
                materialClaimCount: 0,
                supportedClaimCount: 0,
                unsupportedClaimCount: 0,
                unsupportedClaimTypes: [],
                citationIntegrity: integrity,
                failClosed: false,
            },
        };
    }

    const facts = extractCriticalFacts(answerText);
    const unsupported = [];
    for (const [type, values] of Object.entries(facts)) {
        for (const value of values) {
            if (!corpus.includes(value)) unsupported.push({ type, value });
        }
    }
    if (!integrity.valid) unsupported.push({ type: 'citation_integrity', value: '' });
    const materialClaimCount = Object.values(facts).reduce((sum, values) => sum + values.length, 0);
    const failClosed = unsupported.length > 0;
    return {
        answerText: failClosed ? failClosedAnswer(answerText) : String(answerText || ''),
        audit: {
            version: CONTRACT_VERSION,
            checked: true,
            status: failClosed ? 'fail_closed' : (materialClaimCount ? 'verified' : 'no_material_claims'),
            materialClaimCount,
            supportedClaimCount: Math.max(0, materialClaimCount - unsupported.filter(item => item.type !== 'citation_integrity').length),
            unsupportedClaimCount: unsupported.length,
            unsupportedClaimTypes: unique(unsupported.map(item => item.type)),
            citationIntegrity: integrity,
            failClosed,
        },
    };
}

module.exports = { CONTRACT_VERSION, extractCriticalFacts, citationIntegrity, verifyGroundedAnswer };
