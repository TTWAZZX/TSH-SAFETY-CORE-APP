'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const sql = fs.readFileSync(path.join(root, 'backend/migrations/20260901_bbs_phase10e_staged_admin_gate.sql'), 'utf8');
const migrate = fs.readFileSync(path.join(root, 'backend/scripts/bbs-phase10e-staged-gate-migrate-local.js'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'backend/scripts/uat-preflight.js'), 'utf8');

assert.match(sql, /INSERT INTO BBS_Settings/i);
assert.match(sql, /'staged_admin_only'\s*,\s*'1'/);
assert.match(sql, /ON DUPLICATE KEY UPDATE[\s\S]*SettingValue\s*=\s*'1'/i);
assert.doesNotMatch(sql, /\b(?:DELETE|DROP|TRUNCATE|ALTER)\b/i);
assert.doesNotMatch(sql, /BBS_(?:Observations|Corrective_Actions|Cards|Checklist_|Community_)/i);
assert.match(migrate, /businessRowsCreated:\s*0/);
assert.match(migrate, /SELECT SettingKey,SettingValue,UpdatedBy/);
assert.match(preflight, /SettingKey IN \('staged_admin_only','pilot_scope_only'\)/);
assert.match(preflight, /bbsRestrictedToApprovedParticipants\s*&&\s*path\.startsWith\('\/bbs\/'\)\s*\?\s*403\s*:\s*200/);

console.log('BBS Phase 10E staged Admin-only gate migration contract: PASS');
