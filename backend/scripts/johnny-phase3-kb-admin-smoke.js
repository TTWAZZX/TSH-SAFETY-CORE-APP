'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PHASE3_MARKER = 'JOHNNY_PHASE3_KB_QUALITY_ADMIN';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function check(results, name, pass, details = '') {
    results.push({ name, pass, details });
}

function includesAll(text, markers) {
    return markers.filter(marker => !text.includes(marker));
}

function main() {
    const frontend = read('public/js/pages/johnny-ai.js');
    const nodeRoute = read('backend/routes/johnny-ai.js');
    const phpRoute = read('api/handlers/johnny_ai.php');
    const pkg = read('backend/package.json');
    const results = [];

    check(results, 'frontend has Phase 3 marker', frontend.includes(PHASE3_MARKER));
    check(results, 'frontend renders KB quality dashboard', includesAll(frontend, [
        'renderKbQualityDashboard',
        'data-johnny-phase3-dashboard',
        'KB Quality Dashboard',
        'getKbDashboardSummary',
    ]).length === 0);
    check(results, 'frontend renders KB filters', includesAll(frontend, [
        'renderKbFilterBar',
        'data-johnny-phase3-filters',
        'johnny-kb-filter-quality',
        'johnny-kb-filter-source',
        'johnny-kb-filter-category',
    ]).length === 0);
    check(results, 'frontend renders duplicate warning', includesAll(frontend, [
        'getKbDuplicateGroups',
        'renderKbDuplicateWarning',
        'data-johnny-phase3-duplicates',
        'Duplicate document warning',
    ]).length === 0);
    check(results, 'frontend preserves extracted chunk preview', includesAll(frontend, [
        'viewKbExtracted',
        'renderKbAuditPanel',
        'renderExtractionLogPanel',
        'johnny-kb-refine-extracted',
    ]).length === 0);
    check(results, 'Node KB list exposes quality metadata', includesAll(nodeRoute, [
        'ActualChunkCount',
        'IndexedChars',
        'EmbeddingCount',
        'ArtifactChunkCount',
        "router.get('/kb-documents'",
    ]).length === 0);
    check(results, 'Node extracted endpoint exposes chunk summary', includesAll(nodeRoute, [
        "router.get('/kb-documents/:id/extracted'",
        'summarizeExtractedChunks(chunks, doc)',
        'HasEmbedding',
    ]).length === 0);
    check(results, 'PHP KB list exposes quality metadata', includesAll(phpRoute, [
        'ActualChunkCount',
        'IndexedChars',
        'EmbeddingCount',
        'ArtifactChunkCount',
        "path === '/johnny/kb-documents'",
    ]).length === 0);
    check(results, 'PHP extracted endpoint exposes chunk summary', includesAll(phpRoute, [
        "route_params($path, '/johnny/kb-documents/:id/extracted')",
        'johnny_extracted_summary($rows, $doc)',
        'HasEmbedding',
    ]).length === 0);
    check(results, 'package registers Phase 3 smoke', pkg.includes('smoke:johnny-phase3-kb'));

    console.log('Johnny Phase 3 KB admin smoke summary');
    results.forEach(result => {
        console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
    });
    if (results.some(result => !result.pass)) process.exit(1);
}

main();
