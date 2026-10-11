'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(ROOT, 'public', 'js', 'pages', 'johnny-ai.js'), 'utf8').replace(/^\uFEFF/, '');
const main = fs.readFileSync(path.join(ROOT, 'public', 'js', 'main.js'), 'utf8').replace(/^\uFEFF/, '');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/^\uFEFF/, '');
const results = [];

function check(name, pass, details = '') {
    results.push({ name, pass: Boolean(pass), details });
}

function includesAll(text, values) {
    return values.filter(value => !text.includes(value));
}

const sections = ['overview', 'create', 'library', 'operations', 'appearance'];
const missingSections = sections.filter(section => !frontend.includes(`data-johnny-admin-section-panel="${section}"`));
const missingTabs = sections.filter(section => !frontend.includes(`key: '${section}'`));

check('workspace marker is present', frontend.includes('JOHNNY_ADMIN_WORKSPACE_V1'));
check('five bounded workspace sections are rendered', missingSections.length === 0, missingSections.join(', '));
check('five accessible tabs are generated from the section contract', frontend.includes('JOHNNY_ADMIN_SECTIONS.map') && missingTabs.length === 0, missingTabs.join(', '));
check('tab and panel semantics are linked', includesAll(frontend, [
    'role="tablist"',
    'role="tab"',
    'role="tabpanel"',
    'aria-selected=',
    'aria-controls="johnny-admin-workspace-panel-',
    'aria-labelledby="johnny-admin-workspace-tab-',
]).length === 0);
check('keyboard navigation supports arrows and boundaries', includesAll(frontend, [
    "'ArrowLeft'", "'ArrowRight'", "'ArrowUp'", "'ArrowDown'", "'Home'", "'End'",
    '{ focusTab: true }',
]).length === 0);
check('mobile tab navigation scrolls instead of widening the page', frontend.includes('overflow-x-auto') && frontend.includes('shrink-0'));
check('existing admin controls remain available', includesAll(frontend, [
    'id="johnny-avatar-form"',
    'id="johnny-avatar-file"',
    'id="johnny-kb-form"',
    'id="johnny-kb-file"',
    'id="johnny-knowledge-form"',
    'id="johnny-kb-list"',
    'id="johnny-observability-days"',
    'id="johnny-log-level"',
    'id="johnny-log-operation"',
    'id="johnny-log-refresh"',
    'id="johnny-observability-dashboard"',
    'id="johnny-operational-log-list"',
]).length === 0);
check('existing submit and operational handlers remain bound', includesAll(frontend, [
    "addEventListener('submit', uploadJohnnyAvatar)",
    "addEventListener('click', resetJohnnyAvatar)",
    "addEventListener('submit', uploadKbDocument)",
    "addEventListener('submit', saveManualKnowledge)",
    "addEventListener('change', event =>",
    'loadObservability();',
    'loadOperationalLogs();',
]).length === 0);
check('manual edit opens its owning section before focus', /function editManualKnowledge\(id\)[\s\S]*?activateJohnnyAdminSection\('create'\);[\s\S]*?topic\?\.focus\(\);/.test(frontend));
check('section state survives admin rerenders', frontend.includes("let _johnnyAdminSection = 'overview';") && frontend.includes('syncJohnnyAdminWorkspace();'));
check('Johnny page cache key is updated', main.includes('20261011-johnny-admin-workspace-r1'));
check('application entry cache key includes Johnny workspace release', index.includes('johnny-admin-workspace-r1'));

console.log('Johnny Admin Workspace static regression');
for (const result of results) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
}
const failed = results.filter(result => !result.pass);
console.log(`${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) process.exit(1);

