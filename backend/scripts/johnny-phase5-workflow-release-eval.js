'use strict';

const fs = require('fs');
const path = require('path');
const { loadSystemUsageCatalog } = require('../lib/johnny-system-usage');
const { getWorkflowActionContract, normalizeWorkflowAction } = require('../lib/johnny-workflow-actions');

const ROOT = path.join(__dirname, '..', '..');
const results = [];
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const check = (name, pass, details = '') => results.push({ name, pass: Boolean(pass), details });

function expectRejected(name, input, messagePart) {
    let error = null;
    try { normalizeWorkflowAction(input); } catch (caught) { error = caught; }
    check(name, error?.statusCode === 400 && String(error.message).includes(messagePart), error?.message || 'not rejected');
}

function main() {
    const catalog = loadSystemUsageCatalog();
    const contract = getWorkflowActionContract();
    const nodeRoute = read('backend/routes/johnny-ai.js');
    const phpRoute = read('api/handlers/johnny_ai.php');
    const workspace = read('public/js/pages/johnny-ai.js');
    const drawer = read('public/js/johnny-drawer.js');
    const hiyari = read('public/js/pages/hiyari.js');
    const ky = read('public/js/pages/ky.js');
    const patrol = read('public/js/pages/patrol.js');
    const permissionAudit = read('backend/scripts/permission-audit.js');

    check('Phase 5 contract version', contract.version === '2026-10-06-phase5-r1');
    check('navigation covers every knowledge module', contract.navigationTargets.length === catalog.modules.length && contract.navigationTargets.length === 21);
    check('navigation order matches knowledge catalog', contract.navigationTargets.every((item, index) => item.key === catalog.modules[index].key && item.route === catalog.modules[index].route));
    check('draft targets remain restricted', JSON.stringify(contract.draftTargets.map(item => item.key)) === JSON.stringify(['patrol', 'hiyari', 'ky'].sort((a, b) => catalog.modules.findIndex(x => x.key === a) - catalog.modules.findIndex(x => x.key === b))));
    check('contract forbids automatic submission', contract.autoSubmit === false && contract.businessMutation === false);

    catalog.modules.forEach(module => {
        const action = normalizeWorkflowAction({ target: module.route, action: 'navigate' });
        check(`navigate ${module.key}`, action.target === module.key && action.route === module.route && action.action === 'navigate');
    });
    const alias = normalizeWorkflowAction({ target: 'accident', action: 'deep_link' });
    check('legacy deep link normalizes to navigate', alias.action === 'navigate' && alias.route === 'accident');
    ['hiyari', 'ky', 'patrol'].forEach(target => {
        const action = normalizeWorkflowAction({ target, action: 'draft' });
        check(`draft ${target}`, action.action === 'draft' && action.target === target && action.autoSubmit === false);
    });
    expectRejected('reject unknown target', { target: 'payroll', action: 'navigate' }, 'target');
    expectRejected('reject unknown action', { target: 'dashboard', action: 'delete' }, 'action');
    expectRejected('reject draft outside allowlist', { target: 'dashboard', action: 'draft' }, 'not available');

    [nodeRoute, phpRoute].forEach((source, index) => {
        const stack = index ? 'PHP' : 'Node';
        check(`${stack} exposes workflow contract in status`, source.includes('workflow') && source.includes('getWorkflowActionContract') || source.includes('johnny_workflow_action_contract'));
        check(`${stack} validates shared workflow action`, source.includes(index ? 'johnny_normalize_workflow_action' : 'normalizeWorkflowAction'));
        check(`${stack} requires persisted assistant ownership`, source.includes("UserID=? AND Role='assistant'"));
        check(`${stack} derives conversation/source server-side`, source.includes(index ? "$message['ConversationID']" : 'message.ConversationID') && source.includes(index ? "$message['SourceType']" : 'message.SourceType'));
        check(`${stack} records no business mutation`, source.includes("operation' => 'workflow_action'") || source.includes("operation: 'workflow_action'"));
        check(`${stack} observability includes workflow handoffs`, source.includes('workflowActions') && source.includes("Operation='workflow_action'"));
    });
    check('workspace uses status registry and canonical route', workspace.includes('_status?.workflow?.navigationTargets') && workspace.includes('data-route=') && workspace.includes("action || 'navigate'"));
    check('drawer logs usage navigation', drawer.includes('openWorkflowRoute') && drawer.includes("action: 'navigate'") && drawer.includes('/johnny/workflow-actions'));
    check('draft consumer remains explicit in three modules', [hiyari, ky, patrol].every(source => source.includes('johnny_image_risk_draft') && source.includes('_consumeJohnnyImageRiskDraft')));
    check('workflow route remains reviewed user workflow', permissionAudit.includes("'POST /api/johnny/workflow-actions'"));

    const failures = results.filter(item => !item.pass);
    console.log(JSON.stringify({
        marker: 'JOHNNY_PHASE5_SAFE_WORKFLOW_INTEGRATION',
        mode: 'mock-only-no-db-no-network',
        modules: contract.navigationTargets.length,
        draftTargets: contract.draftTargets.map(item => item.key),
        checks: results.length,
        passed: results.length - failures.length,
        failed: failures.length,
        failures,
    }, null, 2));
    if (failures.length) process.exit(1);
}

main();
