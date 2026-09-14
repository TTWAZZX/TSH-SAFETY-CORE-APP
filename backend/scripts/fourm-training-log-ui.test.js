'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'fourm.js'), 'utf8');
const start = source.indexOf('async function showTrainingAuditLogModal');
const end = source.indexOf('function _quarantinedLegacyTrainingMatrixMerge');
assert.ok(start > 0 && end > start, 'active Audit Log UI block must exist before the quarantined legacy block');
const active = source.slice(start, end);

for (const marker of [
    "p.set('paged', '1')", "p.set('pageSize', '20')", 'tm-log-pagination',
    'tm-log-department', 'tm-log-unit', 'tm-log-action', 'tm-log-actor',
    'tm-log-employee', 'tm-log-search', 'tm-log-date-from', 'tm-log-date-to',
    '_tmRenderAuditRow', 'requestVersion',
]) assert.ok(active.includes(marker), `missing active Audit Log UI contract: ${marker}`);

assert.ok(!active.includes("p.set('limit', '120')"), 'active Audit Log UI must use server pagination');
assert.ok(!active.includes('data-tm-delete-log'), 'active Audit Log UI must not expose permanent deletion');
assert.match(source, /รายละเอียดก่อน–หลัง \/ View before-after/);
assert.match(source, /ก่อน \/ Before/);
assert.match(source, /หลัง \/ After/);
assert.match(source, /Legacy log has no before-after snapshot/);
assert.match(source, /function _tmRenderAuditChanges/);

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'main.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
assert.match(main, /fourm\.js\?v=20260914-fourm-audit-log-immutable-r1/);
assert.match(index, /main\.js\?v=20260914-fourm-audit-log-immutable-r1/);

console.log('4M Training Matrix Audit Log UI tests passed.');
