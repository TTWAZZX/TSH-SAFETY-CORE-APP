'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PHASE4_MARKER = 'JOHNNY_PHASE4_OBSERVABILITY';
const CACHE_BUST = '20260708-johnny-phase4-observability';

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
    const index = read('index.html');
    const mainJs = read('public/js/main.js');
    const pkg = read('backend/package.json');
    const results = [];

    check(results, 'frontend has Phase 4 marker', frontend.includes(PHASE4_MARKER));
    check(results, 'frontend renders observability dashboard', includesAll(frontend, [
        'johnny-observability-dashboard',
        'data-johnny-phase4-dashboard',
        'renderObservability',
        'loadObservability',
        '/johnny/observability?days=',
    ]).length === 0);
    check(results, 'frontend keeps operational log controls', includesAll(frontend, [
        'johnny-log-level',
        'johnny-log-operation',
        'loadOperationalLogs',
        '/johnny/operational-logs?',
    ]).length === 0);
    check(results, 'Node observability endpoint is admin-only and read-only', includesAll(nodeRoute, [
        "router.get('/observability', isAdmin",
        'getJohnnyObservability(days)',
        'johnny_operational_logs',
        'johnny_chat_messages',
        'johnny_kb_documents',
        'JOHNNY_PHASE4_OBSERVABILITY',
    ]).length === 0);
    check(results, 'PHP observability endpoint is admin-only and read-only', includesAll(phpRoute, [
        "path === '/johnny/observability'",
        'require_admin();',
        'johnny_observability_summary($days)',
        'johnny_operational_logs',
        'johnny_chat_messages',
        'johnny_kb_documents',
        'JOHNNY_PHASE4_OBSERVABILITY',
    ]).length === 0);
    check(results, 'cache bust updated for Phase 4', index.includes(CACHE_BUST) && mainJs.includes(CACHE_BUST));
    check(results, 'package registers Phase 4 smoke', pkg.includes('smoke:johnny-phase4-observability'));

    console.log('Johnny Phase 4 observability smoke summary');
    results.forEach(result => {
        console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
    });
    if (results.some(result => !result.pass)) process.exit(1);
}

main();
