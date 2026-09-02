'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'bbs-smart-card.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

for (const marker of [
    "departmentConfigQuery:''",
    "departmentConfigStatus:'all'",
    'departmentConfigSelectedId:null',
    'function departmentConfigurationRows()',
    'function departmentConfigurationView()',
    'function searchableAdminOptions(',
    'function applyDepartmentConfigFilters()',
    'data-department-configuration',
    'data-department-config-search',
    'data-department-config-status',
    'data-department-config-row',
    'data-department-config-detail',
    'data-admin-picker-search="bbs-owner-admin"',
    'data-admin-picker-search="bbs-verifier-admin"',
    'data-admin-option-search',
    'ค้นหาด้วยชื่อ รหัสพนักงาน หรือแผนก',
    'input type="hidden" name="departmentId"',
    '${departmentConfigurationView()}'
]) {
    assert.ok(ui.includes(marker), `Phase 10B-3 UI missing ${marker}`);
}

assert.match(ui, /masterDepartments\(\)\.map\(department =>/);
assert.match(ui, /state\.departmentConfigSelectedId=n\(btn\.dataset\.departmentId\)/);
assert.match(ui, /option\.hidden=Boolean\(query\)/);
assert.match(main, /bbs-smart-card\.js\?v=(?:20260831-bbs-phase10c[123]|20260901-bbs-phase10(?:b4|d[1-5]))/);
assert.match(html, /main\.js\?v=(?:20260831-bbs-phase10c[123]-forklift-renewal-ky-chunk-r1|20260901-bbs-phase10(?:b4|d[1-5])|20260902-bbs-auto-reference-r1)/);

for (const preserved of [
    "API.get('/bbs/admin/department-cards')",
    "API.post('/bbs/admin/department-card-templates'",
    "API.put(`/bbs/admin/community-handlers/${event.currentTarget.dataset.communityHandler}`",
    'data-dept-qr-issue',
    'data-dept-template-preview',
    'data-dept-template-action'
]) {
    assert.ok(ui.includes(preserved), `Existing Department Card behavior missing ${preserved}`);
}

console.log('BBS Phase 10B-3 searchable Master pickers/Department workspace contract: PASS');
