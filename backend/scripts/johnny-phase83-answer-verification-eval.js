'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    CONTRACT_VERSION,
    verifyGroundedAnswer,
} = require('../lib/johnny-answer-verification');

const cases = [
    {
        id: 'supported-emergency-duration',
        input: {
            answerText: 'Flush continuously for at least 15 minutes and contact the Safety Officer.',
            sourceType: 'safety_knowledge',
            evidenceTexts: ['Use the eyewash for at least 15 minutes and contact the Safety Officer immediately.'],
            citations: [{ referenceId: 'D1', type: 'safety_knowledge' }],
        },
        expected: { status: 'verified', failClosed: false, materialClaimCount: 2 },
    },
    {
        id: 'unsupported-duration-fails-closed',
        input: {
            answerText: 'Flush continuously for 30 minutes.',
            sourceType: 'safety_knowledge',
            evidenceTexts: ['Use the eyewash for at least 15 minutes.'],
            citations: [{ referenceId: 'D1', type: 'safety_knowledge' }],
        },
        expected: { status: 'fail_closed', failClosed: true, unsupportedClaimTypes: ['measurement'] },
    },
    {
        id: 'unsupported-approver-fails-closed',
        input: {
            answerText: 'The General Manager is the final approver.',
            sourceType: 'company_document',
            evidenceTexts: ['The Plant Manager is the sole final approver.'],
            citations: [{ referenceId: 'D1', type: 'company_document' }],
        },
        expected: { status: 'fail_closed', failClosed: true, unsupportedClaimTypes: ['role'] },
    },
    {
        id: 'thai-duration-supported',
        input: {
            answerText: 'ให้ล้างตาต่อเนื่องอย่างน้อย 15 นาที',
            sourceType: 'safety_knowledge',
            evidenceTexts: ['กรณีสารเคมีเข้าตา ให้ล้างตาต่อเนื่องอย่างน้อย 15 นาที'],
            citations: [{ referenceId: 'D1', type: 'safety_knowledge' }],
        },
        expected: { status: 'verified', failClosed: false, materialClaimCount: 1 },
    },
    {
        id: 'duplicate-citation-fails-closed',
        input: {
            answerText: 'Notify the direct supervisor.',
            sourceType: 'company_document',
            evidenceTexts: ['Notify the direct supervisor.'],
            citations: [{ referenceId: 'D1', type: 'company_document' }, { referenceId: 'D1', type: 'company_document' }],
        },
        expected: { status: 'fail_closed', failClosed: true, unsupportedClaimTypes: ['citation_integrity'] },
    },
    {
        id: 'general-answer-not-applicable',
        input: {
            answerText: 'Hello, how can I help?',
            sourceType: 'ai_general',
            evidenceTexts: [],
            citations: [],
        },
        expected: { status: 'not_applicable', failClosed: false, materialClaimCount: 0 },
    },
];

const nodeResults = cases.map(testCase => ({ id: testCase.id, result: verifyGroundedAnswer(testCase.input) }));
for (let index = 0; index < cases.length; index += 1) {
    const audit = nodeResults[index].result.audit;
    for (const [key, value] of Object.entries(cases[index].expected)) assert.deepStrictEqual(audit[key], value, `${cases[index].id}: ${key}`);
    if (audit.failClosed) assert.doesNotMatch(nodeResults[index].result.answerText, /30 minutes|General Manager/, `${cases[index].id}: unsafe detail leaked`);
}

const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpRunner = path.join(__dirname, 'johnny-phase83-answer-verification-php-eval.php');
const php = spawnSync(phpBin, [phpRunner], { input: JSON.stringify({ cases }), encoding: 'utf8', windowsHide: true });
assert.strictEqual(php.status, 0, php.stderr || 'PHP Phase 8.3 evaluator failed');
const phpPayload = JSON.parse(php.stdout);
assert.strictEqual(phpPayload.version, CONTRACT_VERSION, 'PHP verification contract mismatch');
assert.deepStrictEqual(phpPayload.results, nodeResults, 'Node/PHP answer verification parity');

const nodeRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'johnny-ai.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'handlers', 'johnny_ai.php'), 'utf8');
const staticChecks = {
    nodeRunsVerifier: nodeRoute.includes('verifyGroundedAnswer({'),
    phpRunsVerifier: phpRoute.includes('johnny_verify_grounded_answer(['),
    nodePersistsAudit: nodeRoute.includes('answerVerification: verification.audit'),
    phpPersistsAudit: phpRoute.includes("$answerQuality['answerVerification'] = $verification['audit']"),
    nodeLogsBoundedFailure: nodeRoute.includes("stage: 'answer_verification'") && !nodeRoute.includes('unsupportedClaims: verification'),
    phpLogsBoundedFailure: phpRoute.includes("'stage' => 'answer_verification'") && !phpRoute.includes("'unsupportedClaims' => $verification"),
};
assert.ok(Object.values(staticChecks).every(Boolean), `Static integration checks failed: ${JSON.stringify(staticChecks)}`);

console.log(JSON.stringify({
    marker: 'JOHNNY_PHASE83_CLAIM_GROUNDING_AND_HALLUCINATION_GUARD',
    mode: 'deterministic-no-db-no-network',
    decision: 'READY_FOR_AUTHENTICATED_LOCAL_UAT',
    contractVersion: CONTRACT_VERSION,
    cases: cases.length,
    nodePhpParity: true,
    staticChecks,
    results: nodeResults.map(item => ({ id: item.id, audit: item.result.audit })),
}, null, 2));
