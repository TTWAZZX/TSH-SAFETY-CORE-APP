'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/routes/patrol.js');
const php = read('api/handlers/patrol.php');
const ui = read('public/js/pages/patrol.js');
const migration = read('backend/migrations/20261102_patrol_extra_advance.sql');
const rollback = read('backend/migrations/20261102_patrol_extra_advance.rollback.sql');

for (const source of [node, php]) {
    assert.match(source, /patrol_extra_advance_enabled/);
    assert.match(source, /my-extra-advance-sessions/);
    assert.match(source, /PATROL_EXTRA_ADVANCE_SESSION_REQUIRED/);
    assert.match(source, /PATROL_EXTRA_ADVANCE_DATE_NOT_ALLOWED/);
    assert.match(source, /PATROL_SESSION_HAS_ATTENDANCE/);
    assert.match(source, /CheckinMode/);
    assert.match(source, /FOR UPDATE/);
    assert.match(source, /current_and_next_month/);
    assert.match(source, /top_management/);
}

assert.match(node, /patrolNextYearMonth/);
assert.match(node, /month === 12 \? \{ year: year \+ 1, month: 1 \}/);
assert.match(php, /\$currentMonth === 12 \? \$currentYear \+ 1/);
assert.match(ui, /ExtraScheduledSessionID/);
assert.match(ui, /ทำล่วงหน้าด้วยการเดินเพิ่ม/);
assert.match(ui, /วันที่เดินจริง/);
assert.match(ui, /checkin\.isExtraAdvance/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS CheckinMode VARCHAR\(20\) NULL/);
assert.match(migration, /patrol_extra_advance_enabled', '0'/);
assert.match(rollback, /patrol_extra_advance_enabled', '0'/);
assert.doesNotMatch(node, /Patrol_Self_Checkin[\s\S]{0,200}CheckinMode/);
assert.doesNotMatch(php, /patrol_self_checkin[\s\S]{0,200}CheckinMode/i);

console.log('Patrol Extra advance contract/parity test: PASS');
