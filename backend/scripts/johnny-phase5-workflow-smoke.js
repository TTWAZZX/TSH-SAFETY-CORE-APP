'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PHASE5_MARKER = 'JOHNNY_PHASE5_WORKFLOW_INTEGRATION';
const CACHE_BUST = '20260708-johnny-phase5-workflow';

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
    const hiyari = read('public/js/pages/hiyari.js');
    const ky = read('public/js/pages/ky.js');
    const patrol = read('public/js/pages/patrol.js');
    const permissionAudit = read('backend/scripts/permission-audit.js');
    const index = read('index.html');
    const mainJs = read('public/js/main.js');
    const pkg = read('backend/package.json');
    const results = [];

    check(results, 'frontend has Phase 5 marker', frontend.includes(PHASE5_MARKER));
    check(results, 'frontend renders workflow action buttons', includesAll(frontend, [
        'workflowActionTargets',
        'workflowActionButtons',
        'johnny-workflow-action',
        'openWorkflowTarget',
        'logWorkflowAction',
        '/johnny/workflow-actions',
    ]).length === 0);
    check(results, 'frontend keeps image draft handoff', includesAll(frontend, [
        'imageRiskDraftActions',
        'createRiskDraft',
        'johnny-risk-draft-btn',
        'johnny_ai_image_analysis',
    ]).length === 0);
    check(results, 'Node workflow action log endpoint exists', includesAll(nodeRoute, [
        "router.post('/workflow-actions'",
        "operation: 'workflow_action'",
        "stage: action",
        "Johnny workflow action:",
    ]).length === 0);
    check(results, 'PHP workflow action log endpoint exists', includesAll(phpRoute, [
        "path === '/johnny/workflow-actions'",
        "operation' => 'workflow_action'",
        "stage' => $action",
        'Johnny workflow action:',
    ]).length === 0);
    check(results, 'permission audit allows user workflow action log', permissionAudit.includes('POST /api/johnny/workflow-actions'));
    check(results, 'target modules consume Johnny image drafts', [hiyari, ky, patrol].every(text => text.includes('johnny_image_risk_draft') && text.includes('_consumeJohnnyImageRiskDraft')));
    check(results, 'cache bust updated for Phase 5', index.includes(CACHE_BUST) && mainJs.includes(CACHE_BUST));
    check(results, 'package registers Phase 5 smoke', pkg.includes('smoke:johnny-phase5-workflow'));

    console.log('Johnny Phase 5 workflow smoke summary');
    results.forEach(result => {
        console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
    });
    if (results.some(result => !result.pass)) process.exit(1);
}

main();
