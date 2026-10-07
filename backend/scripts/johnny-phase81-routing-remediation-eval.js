'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    loadSystemUsageCatalog,
    searchSystemUsageKnowledge,
} = require('../lib/johnny-system-usage');

const root = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(__dirname, 'johnny-phase81-routing-remediation-php-eval.php');
const phpBinary = process.env.PHP_BINARY || 'C:\\xampp\\php\\php.exe';
const catalog = loadSystemUsageCatalog();

const baseCases = [
    { id: 'page-reference', question: 'หน้านี้ใช้งานอย่างไร', pageContext: { page: 'patrol', title: 'Safety Patrol' }, expected: { matched: true, pureUsage: true, key: 'patrol', requiresKnowledgeBase: false } },
    { id: 'exact-patrol-fixture', question: 'บันทึก Self Patrol อย่างไร', expected: { matched: true, pureUsage: true, key: 'patrol', requiresKnowledgeBase: false } },
    { id: 'accident-analytics-ui', question: 'กดตรงไหนเพื่อเปิด Accident Analytics', expected: { matched: true, pureUsage: true, key: 'accident', requiresKnowledgeBase: false } },
    { id: 'first-aid', question: 'วิธีปฐมพยาบาลผู้หมดสติ', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'ppe-guidance', question: 'วิธีใช้ PPE ที่ถูกต้อง', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'company-policy', question: 'นโยบายความปลอดภัยกำหนดขั้นตอนอย่างไร', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'accident-company-procedure', question: 'ขั้นตอนรายงานอุบัติเหตุตามระเบียบบริษัทคืออะไร', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'forklift-company-requirement', question: 'ขั้นตอนต่ออายุใบอนุญาตรถยกตามข้อกำหนดบริษัท', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'forklift-ui', question: 'กดต่ออายุใบอนุญาตรถยกตรงไหน', expected: { matched: true, pureUsage: true, key: 'forklift', requiresKnowledgeBase: false } },
    { id: 'patrol-live-data', question: 'วันนี้ Safety Patrol เช็กอินครบกี่คน', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: false, reason: 'live_system_data_signal' } },
    { id: 'fire-emergency', question: 'ถ้าไฟไหม้ต้องทำอะไรทันที', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'scoped-document-intent', question: 'เอกสารนี้กำหนดให้ใครอนุมัติ', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'spoken-page', question: 'หน้านี้ใช้ยังไง', pageContext: { page: 'patrol', title: 'Safety Patrol' }, expected: { matched: true, pureUsage: true, key: 'patrol' } },
    { id: 'spoken-button', question: 'ต้องกดไหน', pageContext: { page: 'patrol', title: 'Safety Patrol' }, expected: { matched: true, pureUsage: true, key: 'patrol' } },
    { id: 'spoken-accident-menu', question: 'เมนูอุบัติเหตุอยู่ไหน', expected: { matched: true, pureUsage: true, key: 'accident' } },
    { id: 'english-ui', question: 'How do I open Accident Analytics?', expected: { matched: true, pureUsage: true, key: 'accident', requiresKnowledgeBase: false } },
    { id: 'english-company-policy', question: 'What does company policy require after an accident?', expected: { matched: false, pureUsage: false, requiresKnowledgeBase: true } },
    { id: 'mixed-policy-ui', question: 'ตามระเบียบบริษัทต้องกดเมนูรายงานอุบัติเหตุตรงไหน', expected: { matched: true, pureUsage: false, key: 'accident', requiresKnowledgeBase: true, mixedIntent: true } },
];

const falsePositiveQuestions = [
    'วิธีปฐมพยาบาลผู้หมดสติ',
    'วิธีใช้ PPE ที่ถูกต้อง',
    'นโยบายความปลอดภัยกำหนดขั้นตอนอย่างไร',
    'ขั้นตอนรายงานอุบัติเหตุตามระเบียบบริษัทคืออะไร',
    'ขั้นตอนต่ออายุใบอนุญาตรถยกตามข้อกำหนดบริษัท',
    'วันนี้ Safety Patrol เช็กอินครบกี่คน',
    'ถ้าไฟไหม้ต้องทำอะไรทันที',
];
const matrixCases = catalog.modules.flatMap(module => falsePositiveQuestions.map((question, index) => ({
    id: `matrix:${module.key}:${index + 1}`,
    question,
    pageContext: { page: module.route, title: module.title },
    expected: { matched: false, pureUsage: false },
})));
const cases = [...baseCases, ...matrixCases];

function compact(id, result) {
    const deterministicUsage = Boolean(result.pureUsage && result.confidenceLevel === 'high');
    const liveSystemData = (result.reasons || []).includes('live_system_data_signal');
    return {
        id,
        matched: Boolean(result.matched),
        pureUsage: Boolean(result.pureUsage),
        confidence: Number(result.confidence || 0),
        confidenceLevel: result.confidenceLevel || 'none',
        reasons: result.reasons || [],
        explicitUiIntent: Boolean(result.explicitUiIntent),
        referencedPage: result.referencedPage || null,
        referencedModules: result.referencedModules || [],
        requiresKnowledgeBase: Boolean(result.requiresKnowledgeBase),
        mixedIntent: Boolean(result.mixedIntent),
        broad: Boolean(result.broad),
        keys: (result.entries || []).map(entry => entry.key),
        routingDecision: {
            deterministicUsage,
            retrieveKnowledgeBase: !deterministicUsage,
            allowWebResearch: !deterministicUsage && !result.requiresKnowledgeBase && !liveSystemData,
        },
    };
}

function verifyExpected(testCase, result) {
    const expected = testCase.expected || {};
    if ('matched' in expected) assert.strictEqual(result.matched, expected.matched, `${testCase.id}: matched`);
    if ('pureUsage' in expected) assert.strictEqual(result.pureUsage, expected.pureUsage, `${testCase.id}: pureUsage`);
    if ('requiresKnowledgeBase' in expected) assert.strictEqual(result.requiresKnowledgeBase, expected.requiresKnowledgeBase, `${testCase.id}: requiresKnowledgeBase`);
    if ('mixedIntent' in expected) assert.strictEqual(result.mixedIntent, expected.mixedIntent, `${testCase.id}: mixedIntent`);
    if (expected.key) assert.strictEqual(result.keys[0], expected.key, `${testCase.id}: module`);
    if (expected.reason) assert.ok(result.reasons.includes(expected.reason), `${testCase.id}: reason ${expected.reason}`);
    if (result.pureUsage) assert.strictEqual(result.confidenceLevel, 'high', `${testCase.id}: deterministic usage must be high confidence`);
    assert.strictEqual(result.routingDecision.retrieveKnowledgeBase, !result.routingDecision.deterministicUsage, `${testCase.id}: retrieval decision`);
    if (result.requiresKnowledgeBase) assert.strictEqual(result.routingDecision.allowWebResearch, false, `${testCase.id}: company/safety evidence must not use web routing`);
    if (result.reasons.includes('live_system_data_signal')) assert.strictEqual(result.routingDecision.allowWebResearch, false, `${testCase.id}: live system data must not use web routing`);
}

const nodeResults = cases.map(testCase => compact(testCase.id, searchSystemUsageKnowledge(testCase.question, testCase.pageContext || null)));
cases.forEach((testCase, index) => verifyExpected(testCase, nodeResults[index]));

const phpPayload = JSON.parse(execFileSync(phpBinary, [phpRunner], {
    cwd: root,
    input: JSON.stringify({ cases }),
    encoding: 'utf8',
}));
assert.strictEqual(phpPayload.mode, 'mock-only-no-db-no-network', 'PHP evaluator mode');
assert.deepStrictEqual(phpPayload.results, nodeResults, 'Node/PHP routing parity');

const nodeRoute = fs.readFileSync(path.join(root, 'backend/routes/johnny-ai.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api/handlers/johnny_ai.php'), 'utf8');
const staticChecks = {
    nodeUsesPureHighConfidenceGate: nodeRoute.includes("usageResult.pureUsage && usageResult.confidenceLevel === 'high'"),
    phpUsesPureHighConfidenceGate: phpRoute.includes("!empty($usageResult['pureUsage']) && ($usageResult['confidenceLevel'] ?? '') === 'high'"),
    nodeMixedAndUncertainRetrieveKb: nodeRoute.includes('if (!deterministicUsage)') && nodeRoute.includes('searchKnowledgeBase(message'),
    phpMixedAndUncertainRetrieveKb: phpRoute.includes('if (!$deterministicUsage)') && phpRoute.includes('johnny_search_kb(') && phpRoute.includes('$message,'),
    nodeCompanyEvidenceDisablesWeb: nodeRoute.includes('!usageResult.requiresKnowledgeBase'),
    phpCompanyEvidenceDisablesWeb: phpRoute.includes("empty($usageResult['requiresKnowledgeBase'])"),
    nodeLiveDataLoaderClassifierGated: nodeRoute.includes("(usageResult.reasons || []).includes('live_system_data_signal')") && nodeRoute.includes('!requiresLiveSystemData'),
    phpLiveDataLoaderClassifierGated: phpRoute.includes("in_array('live_system_data_signal', $usageResult['reasons'] ?? [], true)") && phpRoute.includes('!$requiresLiveSystemData'),
    scopedDocumentStillDisablesUsage: nodeRoute.includes("reasons: ['scoped_document']") && phpRoute.includes("'reasons' => ['scoped_document']"),
};
Object.entries(staticChecks).forEach(([name, ok]) => assert.ok(ok, name));

console.log(JSON.stringify({
    marker: 'JOHNNY_PHASE81_ROUTING_REMEDIATION',
    mode: 'mock-only-no-db-no-network',
    decision: 'READY_FOR_AUTHENTICATED_LOCAL_UAT',
    catalogModules: catalog.modules.length,
    baseCases: baseCases.length,
    falsePositiveMatrixCases: matrixCases.length,
    totalCases: cases.length,
    nodePhpParity: true,
    staticChecks,
    results: nodeResults.slice(0, baseCases.length),
}, null, 2));
