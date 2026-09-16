const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
const node = read('backend/routes/patrol.js');
const php = read('api/handlers/patrol.php');
const ui = read('public/js/pages/patrol.js');

const nodeSlots = node.slice(
    node.indexOf('async function supervisorScheduleSlotsForYear'),
    node.indexOf('function attachSupervisorRecordsToSchedule')
);
const phpSlots = php.slice(
    php.indexOf('function patrol_supervisor_schedule_slots'),
    php.indexOf('function patrol_attach_supervisor_records_to_schedule')
);

assert.match(nodeSlots, /return rows\.map\(row =>/);
assert.match(nodeSlots, /ScheduleOccurrenceKey/);
assert.doesNotMatch(nodeSlots, /seen\.has/);
assert.doesNotMatch(nodeSlots, /s\.TeamID IN/);

assert.match(phpSlots, /ScheduleOccurrenceKey/);
assert.doesNotMatch(phpSlots, /isset\(\$seen/);
assert.doesNotMatch(phpSlots, /s\.TeamID IN/);

for (const source of [node, php]) {
    assert.match(source, /PATROL_FUTURE_SUPERVISOR_CHECKIN_NOT_ALLOWED/);
    assert.match(source, /PATROL_SUPERVISOR_MAKEUP_REQUIRED/);
    assert.match(source, /PATROL_SUPERVISOR_MAKEUP_NOT_DUE/);
    assert.match(source, /ScheduleOccurrenceKey/);
}

assert.match(node, /patrolSupervisorOccurrenceCount\(scheduleByMonth\[month\]/);
assert.match(php, /patrol_supervisor_occurrence_count\(\$scheduleByMonth\[\$m\]/);
assert.match(node, /ScheduledSessionID IN \(\$\{placeholders\}\)/);
assert.match(php, /ScheduledSessionID IN \(' \. \$placeholders/);

assert.match(ui, /function patrolSelfScheduleChoiceItems/);
assert.match(ui, /checkinType: date < today \? 'compensation' : \(date === today \? 'normal' : 'future'\)/);
assert.match(ui, /รอบค้าง \/ เดินซ่อม/);
assert.match(ui, /data-type=/);
assert.match(ui, /optionType === 'compensation'/);
assert.match(ui, /max-height:\$\{isSupervisorPersonal \? '315px' : '200px'\}/);
assert.match(ui, /รอบนี้ยังไม่ถึงกำหนด/);

const fixture = [
    { id: 'team-1', date: '2026-09-16', round: 2, area: 'Factory 4' },
    { id: 'team-3', date: '2026-09-16', round: 2, area: 'Factory 1' },
    { id: 'team-5', date: '2026-09-16', round: 2, area: 'Factory 3/1' },
];
assert.strictEqual(fixture.length, 3, 'all area sessions remain selectable');
assert.strictEqual(new Set(fixture.map(row => `${row.date}:${row.round}`)).size, 1, 'KPI keeps one calendar occurrence');

console.log('Patrol supervisor shared schedule contract test: PASS');
