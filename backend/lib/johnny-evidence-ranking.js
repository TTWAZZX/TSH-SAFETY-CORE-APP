'use strict';

const CONTRACT_VERSION = '2026-10-07-phase8.2-r1';
const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 2;
const DEFAULT_DIVERSITY_MARGIN = 0.18;

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number(value) || 0));
}

function evidenceType(sourceType) {
    return String(sourceType || 'document').toLowerCase() === 'manual'
        ? 'safety_knowledge'
        : 'company_document';
}

function intentSignals(options = {}) {
    const reasons = Array.isArray(options.usageResult?.reasons) ? options.usageResult.reasons : [];
    return {
        scoped: Boolean(options.scopedDocument),
        safety: reasons.includes('safety_or_emergency_signal'),
        company: reasons.includes('company_document_signal'),
        mixed: Boolean(options.usageResult?.mixedIntent),
    };
}

function intentBoostFor(type, signals) {
    if (signals.scoped) return 0.04;
    if (signals.safety) return type === 'safety_knowledge' ? 0.12 : -0.02;
    if (signals.company) return type === 'company_document' ? 0.1 : 0;
    return 0;
}

function evidenceTier(score) {
    if (score >= 0.82) return 'strong';
    if (score >= 0.68) return 'high';
    if (score >= 0.55) return 'supported';
    return 'weak';
}

function normalizedChunkKey(row) {
    const text = String(row.ChunkText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return `${Number(row.documentId || 0)}:${text}`;
}

function compareEvidence(a, b) {
    return b.evidenceScore - a.evidenceScore
        || b.hybridScore - a.hybridScore
        || b.semanticScore - a.semanticScore
        || b.keywordScore - a.keywordScore
        || Number(a.documentId || 0) - Number(b.documentId || 0)
        || Number(a.ChunkIndex || 0) - Number(b.ChunkIndex || 0);
}

function rankKnowledgeEvidence(rows, options = {}) {
    const limit = Math.max(1, Number(options.limit || 6));
    const scoped = Boolean(options.scopedDocument);
    const maxPerDocument = scoped
        ? limit
        : Math.max(1, Number(options.maxChunksPerDocument || DEFAULT_MAX_CHUNKS_PER_DOCUMENT));
    const diversityMargin = clamp(options.diversityMargin ?? DEFAULT_DIVERSITY_MARGIN, 0, 0.5);
    const signals = intentSignals(options);
    const seen = new Set();
    const perDocument = new Map();
    const thresholdEligibleCount = (rows || []).filter(row => row && row.eligible !== false).length;

    const ranked = (rows || [])
        .filter(row => row && row.eligible !== false)
        .map(row => {
            const type = evidenceType(row.SourceType);
            const boost = intentBoostFor(type, signals);
            const hybridScore = clamp(row.hybridScore ?? row.score);
            const evidenceScore = clamp(hybridScore + boost);
            return {
                ...row,
                semanticScore: clamp(row.semanticScore),
                keywordScore: clamp(row.keywordScore),
                hybridScore,
                evidenceType: type,
                intentBoost: boost,
                evidenceScore,
                evidenceTier: evidenceTier(evidenceScore),
                rankingContract: CONTRACT_VERSION,
                score: evidenceScore,
            };
        })
        .sort(compareEvidence)
        .filter(row => {
            const key = normalizedChunkKey(row);
            if (seen.has(key)) return false;
            const documentId = Number(row.documentId || 0);
            const count = perDocument.get(documentId) || 0;
            if (count >= maxPerDocument) return false;
            seen.add(key);
            perDocument.set(documentId, count + 1);
            return true;
        });

    const selected = [];
    const selectedKeys = new Set();
    const topScore = ranked[0]?.evidenceScore || 0;
    if (!scoped) {
        const firstByDocument = new Map();
        for (const row of ranked) {
            const documentId = Number(row.documentId || 0);
            if (!firstByDocument.has(documentId)) firstByDocument.set(documentId, row);
        }
        [...firstByDocument.values()]
            .filter(row => row.evidenceScore >= Math.max(0.55, topScore - diversityMargin))
            .sort(compareEvidence)
            .slice(0, limit)
            .forEach(row => {
                selected.push(row);
                selectedKeys.add(`${row.documentId}:${row.chunkId ?? row.id ?? row.ChunkIndex}`);
            });
    }
    for (const row of ranked) {
        if (selected.length >= limit) break;
        const key = `${row.documentId}:${row.chunkId ?? row.id ?? row.ChunkIndex}`;
        if (selectedKeys.has(key)) continue;
        selected.push(row);
        selectedKeys.add(key);
    }
    selected.sort(compareEvidence).forEach((row, index) => {
        row.rank = index + 1;
        row.score = row.evidenceScore;
    });

    const sourceTypes = [...new Set(selected.map(row => row.evidenceType))];
    const summary = {
        version: CONTRACT_VERSION,
        candidateCount: (rows || []).length,
        eligibleCount: thresholdEligibleCount,
        rankableCount: ranked.length,
        selectedCount: selected.length,
        distinctDocuments: new Set(selected.map(row => Number(row.documentId || 0))).size,
        sourceTypes,
        strongEvidenceCount: selected.filter(row => row.evidenceTier === 'strong').length,
        topEvidenceScore: selected.length ? selected[0].evidenceScore : 0,
        diversityApplied: !scoped,
        maxChunksPerDocument: maxPerDocument,
        signals,
    };
    return { matches: selected, summary };
}

function groupEvidenceSources(matches) {
    const counts = new Map();
    for (const row of matches || []) {
        const type = row.evidenceType || evidenceType(row.SourceType);
        counts.set(type, (counts.get(type) || 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({
        type,
        label: type === 'safety_knowledge' ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท',
        count,
        contractVersion: CONTRACT_VERSION,
    }));
}

function primaryEvidenceType(matches, options = {}) {
    const groups = groupEvidenceSources(matches);
    if (!groups.length) return null;
    const signals = intentSignals(options);
    if (signals.safety && groups.some(group => group.type === 'safety_knowledge')) return 'safety_knowledge';
    return matches[0]?.evidenceType || evidenceType(matches[0]?.SourceType);
}

module.exports = {
    CONTRACT_VERSION,
    evidenceType,
    evidenceTier,
    rankKnowledgeEvidence,
    groupEvidenceSources,
    primaryEvidenceType,
};
