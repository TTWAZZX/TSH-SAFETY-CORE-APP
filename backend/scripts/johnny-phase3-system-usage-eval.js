'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    loadSystemUsageCatalog,
    searchSystemUsageKnowledge,
    usageCitations,
    usageAnswerText,
} = require('../lib/johnny-system-usage');

const root = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(__dirname, 'johnny-phase3-system-usage-php-eval.php');
const nodeRoute = fs.readFileSync(path.join(root, 'backend/routes/johnny-ai.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api/handlers/johnny_ai.php'), 'utf8');
const drawer = fs.readFileSync(path.join(root, 'public/js/johnny-drawer.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'public/js/pages/johnny-ai.js'), 'utf8');

function compact(result) {
    return {
        matched: Boolean(result.matched),
        broad: Boolean(result.broad),
        keys: (result.entries || []).map(entry => entry.key),
        citationTypes: usageCitations(result).map(citation => citation.type),
        answer: usageAnswerText(result),
    };
}

(async () => {
    const catalog = loadSystemUsageCatalog();
    const moduleMetaSource = fs.readFileSync(path.join(root, 'public/js/module-meta.js'), 'utf8');
    const moduleOrderBlock = moduleMetaSource.match(/export const MODULE_ORDER\s*=\s*\[(.*?)\];/s)?.[1] || '';
    const moduleOrder = [...moduleOrderBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
    const checks = [];
    const check = (name, ok, detail = null) => {
        checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
        assert.ok(ok, `${name}${detail ? `: ${detail}` : ''}`);
    };

    check('catalog version is Phase 3', /^2026-10-06-phase3-/.test(catalog.version));
    check('catalog covers every registered module', catalog.modules.length === moduleOrder.length, `${catalog.modules.length}/${moduleOrder.length}`);
    check('catalog keys match module registry order', JSON.stringify(catalog.modules.map(item => item.key)) === JSON.stringify(moduleOrder));
    check('every module has complete usage guidance', catalog.modules.every(item => item.key && item.route && item.title && item.purpose && item.aliases?.length && item.audience?.length && item.steps?.length >= 3 && item.warnings?.length && item.questions?.length >= 2));

    const cases = [];
    for (const module of catalog.modules) {
        for (const question of module.questions) cases.push({ id: `${module.key}:fixture`, question, expected: module.key });
        cases.push({
            id: `${module.key}:page-context`,
            question: 'หน้านี้ใช้งานอย่างไร',
            pageContext: { page: module.route, title: module.title },
            expected: module.key,
        });
        cases.push({ id: `${module.key}:module-purpose`, question: `โมดูล ${module.title} ใช้ทำอะไร`, expected: module.key });
    }
    cases.push({ id: 'broad', question: 'ช่วยแนะนำคู่มือระบบทุกโมดูล', expectedBroad: true });
    cases.push({ id: 'broad-short', question: 'วิธีใช้ระบบ', expectedBroad: true });
    const negatives = [
        'วันนี้ Safety Patrol เช็กอินครบกี่คน',
        'มี Hiyari ที่ยังไม่ปิดกี่รายการ',
        'กฎ E-Pass ของบริษัทกำหนดว่าอย่างไร',
        'ถ้าไฟไหม้ต้องทำอะไรทันที',
        'ช่วยวิเคราะห์ความเสี่ยงจากรูปนี้',
        'สวัสดีจอห์นนี่',
    ];
    negatives.forEach((question, index) => cases.push({ id: `negative:${index + 1}`, question, expectedNoMatch: true }));

    const nodeResults = cases.map(item => compact(searchSystemUsageKnowledge(item.question, item.pageContext || null)));
    cases.forEach((item, index) => {
        const result = nodeResults[index];
        if (item.expected) check(`Node routes ${item.id}`, result.matched && result.keys[0] === item.expected, `${result.keys[0] || 'no-match'} -> ${item.expected}`);
        if (item.expectedBroad) check('Node broad catalog question', result.matched && result.broad && result.answer.includes(String(catalog.modules.length)));
        if (item.expectedNoMatch) check(`Node keeps ${item.id} outside usage catalog`, !result.matched);
    });
    check('usage answers have verified citations', nodeResults.filter(item => item.matched).every(item => item.citationTypes.length > 0 && item.citationTypes.every(type => type === 'system_usage')));
    check('usage answers are deterministic plain text', nodeResults.filter(item => item.matched).every(item => item.answer && !/[`*]|^#{1,6}\s/m.test(item.answer)));

    check('Node chat limits deterministic bypass to pure high-confidence usage', nodeRoute.includes("usageResult.pureUsage && usageResult.confidenceLevel === 'high'") && nodeRoute.includes('const result = deterministicUsage') && nodeRoute.includes("model: 'system-usage-catalog'"));
    check('PHP chat limits deterministic bypass to pure high-confidence usage', phpRoute.includes("!empty($usageResult['pureUsage']) && ($usageResult['confidenceLevel'] ?? '') === 'high'") && phpRoute.includes('$result = $deterministicUsage') && phpRoute.includes("'model' => 'system-usage-catalog'"));
    check('PHP mock evaluator is available for parity run', fs.existsSync(phpRunner) && fs.readFileSync(phpRunner, 'utf8').includes('JOHNNY_PHASE3_SYSTEM_USAGE_KNOWLEDGE_PHP'));
    check('both chat runtimes expose system_usage source', nodeRoute.includes("type: 'system_usage'") && phpRoute.includes("'type' => 'system_usage'"));
    check('Node/PHP persist Phase 3 usage-quality metadata', nodeRoute.includes('usageKnowledge: {') && phpRoute.includes("$answerQuality['usageKnowledge']"));
    check('drawer exposes usage source and route', drawer.includes("system_usage: 'คู่มือการใช้งานระบบ'") && drawer.includes('data-johnny-route'));
    check('full workspace exposes usage source and route', workspace.includes("sourceType === 'system_usage'") && workspace.includes("type === 'system_usage'") && workspace.includes('usageRoute'));

    const passed = checks.filter(item => item.ok).length;
    console.log(JSON.stringify({
        marker: 'JOHNNY_PHASE3_SYSTEM_USAGE_KNOWLEDGE',
        mode: 'mock-only-no-db-no-network',
        version: catalog.version,
        modules: catalog.modules.length,
        evaluationCases: cases.length,
        passed,
        total: checks.length,
        checks,
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
});
