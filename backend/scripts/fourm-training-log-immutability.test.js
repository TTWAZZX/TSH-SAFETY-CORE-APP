'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const node = fs.readFileSync(path.join(__dirname, '..', 'routes', 'fourm.js'), 'utf8');
const php = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'fourm.js'), 'utf8');

assert.match(node, /router\.delete\('\/training-logs\/:id',[\s\S]*?status\(405\)[\s\S]*?AUDIT_LOG_IMMUTABLE/);
const nodeDelete = node.match(/router\.delete\('\/training-logs\/:id',[\s\S]*?\n\}\);/)?.[0] || '';
assert.ok(nodeDelete && !/DELETE FROM|db\.query|logAudit/.test(nodeDelete), 'Node immutable route must not access or mutate the database');
assert.match(php, /training-logs\/:id'[\s\S]*?AUDIT_LOG_IMMUTABLE[\s\S]*?,405/);
const phpDeleteLine = php.split(/\r?\n/).find(line => line.includes("training-logs/:id") && line.includes("$method==='DELETE'")) || '';
assert.ok(phpDeleteLine && !/db_(row|execute)|DELETE FROM|fm_log/.test(phpDeleteLine), 'PHP immutable route must not access or mutate the database');
assert.match(node, /canDeleteHistory:\s*false/);
assert.match(php, /'canDeleteHistory'=>false/);
assert.ok(!ui.includes('data-tm-delete-log'), 'Audit Log UI must expose no delete button');
assert.ok(!ui.includes('function deleteTrainingLog'), 'Audit Log UI must expose no delete function');
assert.ok(!ui.includes('API.delete(`/fourm/training-logs/'), 'Audit Log UI must make no delete request');

console.log('4M Training Matrix immutable Audit Log tests passed.');
