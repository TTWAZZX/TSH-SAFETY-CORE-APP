'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
    CONTRACT_VERSION,
    rankKnowledgeEvidence,
    groupEvidenceSources,
    primaryEvidenceType,
} = require('../lib/johnny-evidence-ranking');

const root = path.resolve(__dirname, '..', '..');
const phpBinary = process.env.PHP_BINARY || 'C:\\xampp\\php\\php.exe';
const phpRunner = path.join(__dirname, 'johnny-phase82-evidence-ranking-php-eval.php');

function row(documentId, chunkId, sourceType, hybridScore, text, extra = {}) {
    return {
        documentId,
        chunkId,
        ChunkIndex: chunkId,
        ChunkText: text,
        SourceType: sourceType,
        semanticScore: hybridScore,
        keywordScore: Math.max(0, hybridScore - 0.1),
        hybridScore,
        score: hybridScore,
        eligible: true,
        ...extra,
    };
}

const mixedRows = [
    row(1, 11, 'document', 0.8, 'Company accident notification rule A'),
    row(1, 12, 'document', 0.78, 'Company accident reporting workflow B'),
    row(2, 21, 'document', 0.74, 'Company escalation matrix C'),
    row(3, 31, 'manual', 0.76, 'Emergency response and first aid D'),
    row(1, 13, 'document', 0.77, 'Company duplicate cap E'),
    row(4, 41, 'document', 0.9, 'Ineligible candidate', { eligible: false }),
];

const cases = [
    {
        id: 'company-multi-source-diversity',
        rows: mixedRows,
        options: { limit: 4, usageResult: { reasons: ['company_document_signal'], mixedIntent: true } },
    },
    {
        id: 'safety-intent-priority',
        rows: mixedRows,
        options: { limit: 3, usageResult: { reasons: ['safety_or_emergency_signal'] } },
    },
    {
        id: 'document-cap-and-deduplication',
        rows: [
            row(7, 71, 'document', 0.9, 'Same normalized evidence'),
            row(7, 72, 'document', 0.89, 'Same   normalized evidence'),
            row(7, 73, 'document', 0.88, 'Second distinct chunk'),
            row(7, 74, 'document', 0.87, 'Third distinct chunk beyond cap'),
            row(8, 81, 'manual', 0.75, 'Independent safety manual'),
        ],
        options: { limit: 6 },
    },
    {
        id: 'scoped-document-keeps-scope',
        rows: [
            row(9, 91, 'document', 0.72, 'Scoped one'),
            row(9, 92, 'document', 0.71, 'Scoped two'),
            row(9, 93, 'document', 0.7, 'Scoped three'),
        ],
        options: { limit: 6, scopedDocument: { id: 9 }, usageResult: { reasons: ['scoped_document'] } },
    },
];

function compact(testCase) {
    const ranked = rankKnowledgeEvidence(testCase.rows, testCase.options);
    return {
        id: testCase.id,
        matches: ranked.matches.map(item => ({
            documentId: Number(item.documentId),
            chunkId: Number(item.chunkId),
            rank: Number(item.rank),
            evidenceType: item.evidenceType,
            intentBoost: Number(item.intentBoost),
            evidenceScore: Number(item.evidenceScore),
            evidenceTier: item.evidenceTier,
            rankingContract: item.rankingContract,
        })),
        summary: ranked.summary,
        groups: groupEvidenceSources(ranked.matches),
        primary: primaryEvidenceType(ranked.matches, testCase.options),
    };
}

const nodeResults = cases.map(compact);
const company = nodeResults[0];
assert.strictEqual(company.primary, 'company_document', 'Company intent must keep company evidence primary');
assert.deepStrictEqual(company.groups.map(group => group.type), ['company_document', 'safety_knowledge'], 'Multi-source groups must remain distinct');
assert.ok(company.summary.distinctDocuments >= 3, 'Diversity must retain multiple documents');
assert.ok(!company.matches.some(item => item.chunkId === 41), 'Ineligible evidence must not be selected');

const safety = nodeResults[1];
assert.strictEqual(safety.primary, 'safety_knowledge', 'Safety intent must prioritize safety knowledge');
assert.strictEqual(safety.matches[0].evidenceType, 'safety_knowledge', 'Safety evidence must rank first after intent boost');

const capped = nodeResults[2];
assert.ok(capped.matches.filter(item => item.documentId === 7).length <= 2, 'One document must not monopolize retrieval');
assert.ok(capped.matches.some(item => item.documentId === 8), 'Independent source must survive diversity selection');

const scoped = nodeResults[3];
assert.ok(scoped.matches.every(item => item.documentId === 9), 'Scoped retrieval must not introduce another document');
assert.strictEqual(scoped.matches.length, 3, 'Scoped retrieval may retain multiple chunks from the selected document');
assert.strictEqual(scoped.summary.diversityApplied, false, 'Cross-document diversity must be disabled in scoped mode');

const php = JSON.parse(execFileSync(phpBinary, [phpRunner], {
    cwd: root,
    input: JSON.stringify({ cases }),
    encoding: 'utf8',
}));
assert.deepStrictEqual(php.results, nodeResults, 'Node/PHP Phase 8.2 evidence ranking parity');

const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'johnny-ai.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'johnny_ai.php'), 'utf8');
const staticChecks = {
    nodeUsesRankingContract: nodeRoute.includes('rankKnowledgeEvidence') && nodeRoute.includes('evidenceRanking'),
    phpUsesRankingContract: phpRoute.includes('johnny_rank_knowledge_evidence') && phpRoute.includes('$evidenceRanking'),
    nodeGroupsRealSourceTypes: nodeRoute.includes('groupEvidenceSources(kbMatches)'),
    phpGroupsRealSourceTypes: phpRoute.includes('johnny_group_evidence_sources($kbMatches)'),
    nodePromptHasSynthesisGuard: nodeRoute.includes('PHASE 8.2 ANSWER SYNTHESIS'),
    phpPromptHasSynthesisGuard: phpRoute.includes('PHASE 8.2 ANSWER SYNTHESIS'),
    nodePersistsRankingMetadata: nodeRoute.includes('evidenceRanking,'),
    phpPersistsRankingMetadata: phpRoute.includes("$answerQuality['evidenceRanking'] = $evidenceRanking"),
    nodePreservesRankingInIntegratedPhase: nodeRoute.includes('phase: 8.3')
        && nodeRoute.includes('answerVerification: verification.audit'),
    phpPreservesRankingInIntegratedPhase: phpRoute.includes("$answerQuality['phase'] = 8.3")
        && phpRoute.includes("$answerQuality['answerVerification'] = $verification['audit']"),
};
Object.entries(staticChecks).forEach(([name, ok]) => assert.ok(ok, name));

console.log(JSON.stringify({
    marker: 'JOHNNY_PHASE82_MULTI_SOURCE_EVIDENCE_RANKING',
    mode: 'mock-only-no-db-no-network',
    decision: 'READY_FOR_AUTHENTICATED_LOCAL_UAT',
    contractVersion: CONTRACT_VERSION,
    cases: cases.length,
    nodePhpParity: true,
    staticChecks,
    results: nodeResults,
}, null, 2));
