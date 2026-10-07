'use strict';

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.resolve(__dirname, '..', '..', 'shared', 'johnny-system-usage-knowledge.json');
const BROAD_PATTERN = /(ทุกโมดูล|ทุกเมนู|เมนูทั้งหมด|ระบบนี้|ภาพรวมการใช้งาน|คู่มือระบบ|เริ่มใช้งานระบบ|วิธีใช้ระบบ|ใช้งานระบบ|ใช้ระบบยังไง)/iu;
const PAGE_REFERENCE_PATTERN = /(หน้านี้|เมนูนี้|ตรงนี้|หน้า(?:นี้)?ใช้|this\s+page|this\s+menu|on\s+this\s+page)/iu;
const CONTEXTUAL_UI_ACTION_PATTERN = /(ต้องกด(?:ตรง)?ไหน|กดตรงไหน|อยู่(?:ตรง)?ไหน|เปิด(?:หน้า|เมนู)?(?:ที่)?ไหน|where\s+(?:is|can\s+i\s+find)|which\s+(?:button|menu|page))/iu;
const UI_ACTION_PATTERN = /((?:กด|คลิก|เปิด|เข้า|เลือก|ไปที่).*(?:ตรงไหน|ที่ไหน|เมนู|หน้า|dashboard|analytics|ปุ่ม)|(?:เมนู|หน้า|โมดูล|dashboard|analytics).*(?:อยู่ไหน|อยู่ตรงไหน|ใช้อย่างไร|ใช้ยังไง|ใช้งาน|ทำอะไร)|workflow|quick\s*start|permission|สิทธิ์|ใครใช้|how\s+do\s+i\s+(?:open|use|access|find|navigate)|how\s+to\s+(?:open|use|access|find|navigate)|where\s+(?:is|can\s+i\s+find))/iu;
const DOCUMENT_PATTERN = /(ตามเอกสาร|เอกสารบริษัท|เอกสารนี้|นโยบาย|ระเบียบ|ข้อกำหนด|มาตรฐาน|กฎหมาย|\bwi\b|company\s+(?:document|policy|rule|requirement)|what\s+does\s+company\s+policy\s+require|regulation|standard)/iu;
const SAFETY_PATTERN = /(วิธีปฏิบัติงานอย่างปลอดภัย|ปฐมพยาบาล|ไฟไหม้|เพลิงไหม้|สารเคมี(?:รั่ว|หก|กระเด็น)|บาดเจ็บ|เหตุฉุกเฉิน|หมดสติ|วิธีใช้\s*ppe|ใช้\s*ppe\s*ที่ถูก|สวม\s*ppe|first\s+aid|fire\s+emergency|chemical\s+(?:spill|leak)|injur(?:y|ed)|emergency)/iu;
const LIVE_DATA_PATTERN = /(วันนี้|ขณะนี้|ตอนนี้|ล่าสุด|กี่คน|กี่รายการ|กี่ครั้ง|จำนวน|สถานะล่าสุด|เช็กอินครบ|ยังไม่ปิด|current\s+(?:count|status)|how\s+many|latest\s+status)/iu;

let cachedCatalog = null;

function normalize(value) {
    return String(value || '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[_/]+/g, ' ')
        .replace(/[^\p{L}\p{M}\p{N}\s-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadSystemUsageCatalog() {
    if (cachedCatalog) return cachedCatalog;
    const parsed = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.modules) || !parsed.modules.length) {
        throw new Error('Johnny system usage knowledge is empty or invalid');
    }
    cachedCatalog = parsed;
    return cachedCatalog;
}

function containsAlias(text, alias) {
    if (!alias) return false;
    if (/^[a-z0-9-]{1,3}$/i.test(alias)) return text.split(' ').includes(alias);
    return text.includes(alias);
}

function emptyResult(catalog, overrides = {}) {
    return {
        matched: false,
        pureUsage: false,
        confidence: 0,
        confidenceLevel: 'none',
        reasons: [],
        explicitUiIntent: false,
        referencedPage: null,
        referencedModules: [],
        requiresKnowledgeBase: false,
        mixedIntent: false,
        broad: false,
        entries: [],
        version: catalog.version,
        moduleCount: catalog.modules.length,
        catalogTitles: [],
        ...overrides,
    };
}

function classifySignals(question, pageContext = null) {
    const catalog = loadSystemUsageCatalog();
    const text = normalize(question);
    if (!text) return emptyResult(catalog);

    const pageKey = normalize(pageContext?.page).replace(/\s+/g, '-');
    const pageEntry = catalog.modules.find(entry => entry.key === pageKey || entry.route === pageKey) || null;
    const exactEntries = catalog.modules.filter(entry => (entry.questions || []).some(item => normalize(item) === text));
    const referencedEntries = catalog.modules.filter(entry => {
        const names = [entry.key, entry.route, entry.title, ...(entry.aliases || [])].map(normalize).filter(Boolean);
        return names.some(name => containsAlias(text, name));
    });
    const broad = BROAD_PATTERN.test(text);
    const pageReference = PAGE_REFERENCE_PATTERN.test(text);
    const contextualUiAction = CONTEXTUAL_UI_ACTION_PATTERN.test(text);
    const modulePurpose = /(?:โมดูล|หน้า|เมนู)/iu.test(text) && /(?:ใช้ทำอะไร|ทำอะไร|ใช้งานอย่างไร|ใช้ยังไง)/iu.test(text);
    const explicitUiIntent = broad || exactEntries.length > 0 || modulePurpose || UI_ACTION_PATTERN.test(text) || pageReference || contextualUiAction;
    const documentSignal = DOCUMENT_PATTERN.test(text) && exactEntries.length === 0 && !modulePurpose;
    const safetySignal = SAFETY_PATTERN.test(text) && exactEntries.length === 0;
    const liveDataSignal = LIVE_DATA_PATTERN.test(text) && exactEntries.length === 0;
    const usePageContext = Boolean(pageEntry && (pageReference || contextualUiAction) && !referencedEntries.length);
    const candidates = exactEntries.length
        ? exactEntries
        : referencedEntries.length
            ? referencedEntries
            : usePageContext
                ? [pageEntry]
                : [];
    const matched = Boolean(broad || (explicitUiIntent && candidates.length > 0));
    const requiresKnowledgeBase = Boolean(documentSignal || safetySignal);
    const mixedIntent = Boolean(matched && (requiresKnowledgeBase || liveDataSignal));
    const pureUsage = Boolean(matched && !mixedIntent && !liveDataSignal);
    const reasons = [];
    if (exactEntries.length) reasons.push('exact_catalog_question');
    if (broad) reasons.push('broad_system_usage_request');
    if (referencedEntries.length) reasons.push('explicit_module_reference');
    if (usePageContext) reasons.push('explicit_ui_reference_with_page_context');
    if (documentSignal) reasons.push('company_document_signal');
    if (safetySignal) reasons.push('safety_or_emergency_signal');
    if (liveDataSignal) reasons.push('live_system_data_signal');
    if (explicitUiIntent && !matched) reasons.push('ui_intent_without_verified_module');

    let confidence = 0;
    if (matched) confidence = exactEntries.length || broad || usePageContext ? 1 : 0.9;
    if (mixedIntent) confidence = Math.min(confidence, 0.75);
    return emptyResult(catalog, {
        matched,
        pureUsage,
        confidence,
        confidenceLevel: confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : confidence > 0 ? 'low' : 'none',
        reasons,
        explicitUiIntent,
        referencedPage: usePageContext ? pageEntry.key : null,
        referencedModules: candidates.map(entry => entry.key),
        requiresKnowledgeBase,
        mixedIntent,
        broad,
        _candidates: candidates,
    });
}

function isSystemUsageQuestion(question, pageContext = null) {
    return classifySignals(question, pageContext).matched;
}

function searchSystemUsageKnowledge(question, pageContext = null, limit = 3) {
    const catalog = loadSystemUsageCatalog();
    const classified = classifySignals(question, pageContext);
    const { _candidates = [], ...publicClassification } = classified;
    const candidates = classified.matched ? _candidates : [];
    const entries = candidates.slice(0, Math.max(1, Number(limit) || 3)).map((entry, index) => ({
        ...entry,
        score: classified.reasons.includes('exact_catalog_question') ? 100 : index === 0 ? 90 : 80,
    }));
    return {
        ...publicClassification,
        entries,
        catalogTitles: classified.broad ? catalog.modules.map(entry => ({ key: entry.key, route: entry.route, title: entry.title })) : [],
    };
}

function usageContextText(result) {
    if (!result?.matched) return '';
    const blocks = [
        `SYSTEM USAGE KNOWLEDGE (${result.version}): This is verified product guidance from the project module registry and Help Center. It is not live business data and not company policy evidence.`,
        'Use only the listed purpose, steps, reports, audience and warnings. Describe role-dependent actions conditionally. Never invent buttons, permissions, statuses or workflow steps.',
    ];
    if (result.broad && result.catalogTitles?.length) {
        blocks.push(`Available modules (${result.moduleCount}): ${result.catalogTitles.map(item => `${item.title} (#${item.route})`).join('; ')}`);
    }
    result.entries.forEach((entry, index) => {
        blocks.push([
            `[U${index + 1}] ${entry.title} (#${entry.route})`,
            `Purpose: ${entry.purpose}`,
            `Audience: ${(entry.audience || []).join(', ') || '-'}`,
            `Steps: ${(entry.steps || []).map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join(' ') || '-'}`,
            `Reports: ${(entry.reports || []).join('; ') || 'ไม่มีรายงานเฉพาะที่ยืนยันในคู่มือ'}`,
            `Warnings: ${(entry.warnings || []).join('; ') || '-'}`,
        ].join('\n'));
    });
    return blocks.join('\n\n');
}

function usageCitations(result) {
    if (!result?.matched) return [];
    if (result.broad && !(result.entries || []).length) {
        return [{
            index: 1,
            referenceId: 'U1',
            type: 'system_usage',
            sourceLabel: 'คู่มือการใช้งานระบบ',
            module: 'all',
            title: 'คู่มือการใช้งานระบบทุกโมดูล',
            route: 'dashboard',
            version: result.version,
            excerpt: `ทะเบียนคู่มือ ${result.moduleCount || 0} โมดูล`,
        }];
    }
    return (result.entries || []).map((entry, index) => ({
        index: index + 1,
        referenceId: `U${index + 1}`,
        type: 'system_usage',
        sourceLabel: 'คู่มือการใช้งานระบบ',
        module: entry.key,
        title: `คู่มือการใช้งาน: ${entry.title}`,
        route: entry.route,
        version: result.version,
        excerpt: entry.purpose,
    }));
}

function usageAnswerText(result) {
    if (!result?.matched) return '';
    if (result.broad && result.catalogTitles?.length) {
        const modules = result.catalogTitles.map((item, index) => `${index + 1}. ${item.title} เปิดที่เมนู ${item.route}`).join('\n');
        return `ระบบมีคู่มือการใช้งาน ${result.moduleCount} โมดูลครับ\n\n${modules}\n\nพี่สามารถถามชื่อโมดูลต่อได้ เช่น “ใช้ Safety Patrol อย่างไร” หรือเปิดปุ่มถาม Johnny จากหน้าที่กำลังใช้งานอยู่ครับ`;
    }
    return result.entries.map(entry => {
        const lines = [entry.title, entry.purpose];
        if (entry.steps?.length) lines.push('วิธีใช้งาน', ...entry.steps.map((step, index) => `${index + 1}. ${step}`));
        if (entry.audience?.length) lines.push(`ผู้ใช้งานตามสิทธิ์: ${entry.audience.join(', ')}`);
        if (entry.reports?.length) lines.push(`รายงานที่เกี่ยวข้อง: ${entry.reports.join(', ')}`);
        if (entry.warnings?.length) lines.push(`ข้อควรระวัง: ${entry.warnings.join('; ')}`);
        lines.push(`เปิดโมดูลที่เมนู ${entry.route}`);
        return lines.join('\n');
    }).join('\n\n').replace(/ครับ\s*$/u, '') + 'ครับ';
}

module.exports = {
    KNOWLEDGE_PATH,
    loadSystemUsageCatalog,
    isSystemUsageQuestion,
    searchSystemUsageKnowledge,
    usageContextText,
    usageCitations,
    usageAnswerText,
};
