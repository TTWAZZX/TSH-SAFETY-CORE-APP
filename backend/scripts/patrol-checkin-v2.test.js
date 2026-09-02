const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
const node = read('backend/routes/patrol.js');
const php = read('api/handlers/patrol.php');
const ui = read('public/js/pages/patrol.js');
const migration = read('backend/migrations/20260902_patrol_checkin_v2.sql');
const liveStatsMigration = read('backend/migrations/20260902_patrol_live_stats.sql');

for (const source of [node, php]) {
    assert.match(source, /patrol_checkin_v2_enabled/);
    assert.match(source, /IdempotencyKey/);
    assert.match(source, /PATROL_TEAM_CONFLICT/);
    assert.match(source, /PATROL_FUTURE_MAKEUP_NOT_ALLOWED/);
    assert.match(source, /PATROL_SESSION_SELECTION_REQUIRED/);
    assert.match(source, /actualActivity/);
    assert.match(source, /CheckinAt/);
    assert.match(source, /scope[^\n]{0,80}all/);
}
assert.match(node, /!options\.checkinV2Enabled/);
assert.match(node, /patrolBangkokDateTime/);
assert.match(node, /Makeup patrol must be linked to a scheduled round in the same month/);
assert.match(php, /empty\(\$options\['checkinV2Enabled'\]\)/);
assert.match(php, /patrol_bangkok_datetime/);
assert.match(php, /Makeup patrol must be linked to a scheduled round in the same month/);
assert.match(ui, /value:'scheduled'/);
assert.match(ui, /value:'makeup'/);
assert.match(ui, /value:'extra'/);
assert.match(ui, /Actual Walks/);
assert.match(ui, /Accepted %/);
assert.match(ui, /patrolCheckinTime/);
assert.match(ui, /checkin\.checkinAt/);
assert.match(ui, /เดินจริง/);
assert.match(ui, /border-violet-100 bg-violet-50/);
assert.match(ui, /bg-emerald-100 text-emerald-700/);
assert.match(migration, /UNIQUE KEY uq_patrol_attendance_user_request \(UserID, IdempotencyKey\)/);
assert.match(migration, /UNIQUE KEY uq_patrol_attendance_user_session \(UserID, ScheduledSessionID\)/);
assert.match(migration, /UNIQUE KEY uq_patrol_team_members_employee \(EmployeeID\)/);
assert.match(migration, /patrol_checkin_v2_enabled', '0'/);
assert.match(liveStatsMigration, /CheckinAt DATETIME NULL DEFAULT NULL/);

console.log('Patrol check-in v2 contract/parity test: PASS');
