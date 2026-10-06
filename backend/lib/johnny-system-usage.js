'use strict';

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.resolve(__dirname, '..', '..', 'shared', 'johnny-system-usage-knowledge.json');
const USAGE_PATTERN = /(วิธีใช้|ใช้งาน|ใช้ยังไง|ใช้อย่างไร|ทำยังไง|ทำอย่างไร|ขั้นตอน|เมนู|โมดูล|อยู่ตรงไหน|เปิดที่ไหน|(?:บันทึก|ส่ง|ดู|ติดตาม|ต่ออายุ|พิมพ์|สร้าง|เพิ่ม|แก้|เลือก|ตอบ).*(?:อย่างไร|ยังไง|ตรงไหน|ที่ไหน)|workflow|quick\s*start|how\s+to|where\s+(?:is|can)|permission|สิทธิ์|ใครใช้|หน้านี้|หน้า(?:นี้)?ใช้|หน้า.*ทำอะไร)/iu;
const BROAD_PATTERN = /(ทุกโมดูล|ทุกเมนู|เมนูทั้งหมด|ระบบนี้|ภาพรวมการใช้งาน|คู่มือระบบ|เริ่มใช้งานระบบ|วิธีใช้ระบบ|ใช้งานระบบ|ใช้ระบบยังไง)/iu;

let cachedCatalog = null;

function normalize(value) {
    return String(value || '')
        .normalize('NFKC')
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

function isSystemUsageQuestion(question, pageContext = null) {
    const text = normalize(question);
    if (!text) return false;
    const catalog = loadSystemUsageCatalog();
    if (catalog.modules.some(entry => (entry.questions || []).some(item => normalize(item) === text))) return true;
    if (USAGE_PATTERN.test(text) || BROAD_PATTERN.test(text)) return true;
    const page = normalize(pageContext?.page).replace(/\s+/g, '-');
    return Boolean(page && /(หน้านี้|เมนูนี้|ตรงนี้|ใช้งาน|วิธี)/u.test(text));
}

function entrySearchText(entry) {
    return normalize([
        entry.key,
        entry.route,
        entry.title,
        ...(entry.aliases || []),
        ...(entry.questions || []),
    ].join(' '));
}

function scoreEntry(entry, normalizedQuestion, pageKey) {
    let score = 0;
    if (pageKey && (entry.key === pageKey || entry.route === pageKey)) score += 100;
    for (const rawAlias of entry.aliases || []) {
        const alias = normalize(rawAlias);
        if (!alias) continue;
        if (normalizedQuestion === alias) score += 80;
        else if (normalizedQuestion.includes(alias)) score += 35 + Math.min(alias.length, 20);
    }
    for (const rawQuestion of entry.questions || []) {
        const reference = normalize(rawQuestion);
        if (reference && normalizedQuestion === reference) score += 70;
    }
    const key = normalize(entry.key).replace(/\s+/g, '-');
    if (key && normalizedQuestion.includes(key)) score += 45;
    const terms = new Set(normalizedQuestion.split(' ').filter(term => term.length >= 2));
    const haystack = entrySearchText(entry);
    for (const term of terms) if (haystack.includes(term)) score += 1;
    return score;
}

function searchSystemUsageKnowledge(question, pageContext = null, limit = 3) {
    const catalog = loadSystemUsageCatalog();
    const normalizedQuestion = normalize(question);
    const usageQuestion = isSystemUsageQuestion(question, pageContext);
    if (!usageQuestion) return { matched: false, broad: false, entries: [], version: catalog.version };
    const pageKey = normalize(pageContext?.page).replace(/\s+/g, '-');
    const broad = BROAD_PATTERN.test(normalizedQuestion);
    const ranked = catalog.modules
        .map(entry => ({ entry, score: scoreEntry(entry, normalizedQuestion, pageKey) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.key.localeCompare(b.entry.key));
    const entries = ranked.slice(0, Math.max(1, Number(limit) || 3)).map(item => ({ ...item.entry, score: item.score }));
    return {
        matched: broad || entries.length > 0,
        broad,
        entries,
        version: catalog.version,
        moduleCount: catalog.modules.length,
        catalogTitles: broad ? catalog.modules.map(entry => ({ key: entry.key, route: entry.route, title: entry.title })) : [],
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
