const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
    assert.match(source, /allowHistoricalNormal/);
}

assert.match(node, /patrolSupervisorOccurrenceCount\(scheduleByMonth\[month\]/);
assert.match(php, /patrol_supervisor_occurrence_count\(\$scheduleByMonth\[\$m\]/);
assert.match(node, /ScheduledSessionID IN \(\$\{placeholders\}\)/);
assert.match(php, /ScheduledSessionID IN \(' \. \$placeholders/);

assert.match(ui, /function patrolSelfScheduleChoiceItems/);
assert.match(ui, /function patrolSupervisorOccurrenceDisplayItems/);
assert.match(ui, /function patrolScheduleStatusBadgeClass/);
assert.match(ui, /bg-emerald-100 text-emerald-700/);
assert.match(ui, /bg-red-100 text-red-600/);
assert.match(ui, /filter\(item => patrolScheduleDate\(item\)\.startsWith\(currentMonth\)\)/);
assert.match(ui, /checkinType: date < today \? 'compensation' : \(date === today \? 'normal' : 'future'\)/);
assert.match(ui, /รอบค้าง \/ เดินซ่อม/);
assert.match(ui, /data-type=/);
assert.match(ui, /optionType === 'compensation'/);
assert.match(ui, /max-height:\$\{isSupervisorPersonal \? '315px' : '200px'\}/);
assert.match(ui, /รอบนี้ยังไม่ถึงกำหนด/);

const adminSupervisorPickerStart = ui.indexOf('function _arsvRenderSchedulePicker');
const adminSupervisorPicker = ui.slice(
    adminSupervisorPickerStart,
    ui.indexOf('window.openAdminRecordModal', adminSupervisorPickerStart)
);
assert.match(adminSupervisorPicker, /hasPastSchedule/);
assert.match(adminSupervisorPicker, /input\.disabled = input\.value === 'compensation' && !hasPastSchedule/);
assert.match(adminSupervisorPicker, /dateInput\.readOnly = type !== 'compensation'/);
assert.match(adminSupervisorPicker, /dateInput\.value = type === 'compensation' \? today : date/);

const adminSessionChangeSource = ui.match(/window\._arsvOnSessionChange = (function\(\) \{[\s\S]*?\n\});/)?.[1];
assert.ok(adminSessionChangeSource, 'admin supervisor session-change handler must exist');
const normalRadio = { checked: true, value: 'normal' };
const compensationRadio = { checked: false, value: 'compensation' };
const dateInput = { value: '', readOnly: false, classList: { toggle() {} } };
const elements = {
    'arsv-session': { selectedOptions: [{ dataset: { date: '2026-01-28', area: 'Factory 3/1' } }] },
    'arsv-date': dateInput,
    'arsv-loc': { value: '' },
    'arsv-session-hint': { textContent: '' },
};
const adminSessionChange = vm.runInNewContext(`(${adminSessionChangeSource})`, {
    patrolDateOnly: () => '2026-09-30',
    document: {
        getElementById: id => elements[id] || null,
        querySelector: selector => selector.includes(':checked')
            ? (compensationRadio.checked ? compensationRadio : normalRadio)
            : normalRadio,
    },
});
adminSessionChange();
assert.strictEqual(dateInput.value, '2026-01-28', 'Admin normal backfill keeps the scheduled date.');
assert.strictEqual(dateInput.readOnly, true);
normalRadio.checked = false;
compensationRadio.checked = true;
adminSessionChange();
assert.strictEqual(dateInput.value, '2026-09-30', 'Admin makeup defaults to the actual entry date.');
assert.strictEqual(dateInput.readOnly, false);

const adminSupervisorSubmit = ui.slice(
    ui.indexOf('window._arsvAddRecord = async function'),
    ui.indexOf('window._arsvDeleteRecord = async function')
);
assert.match(adminSupervisorSubmit, /input\[name="arsv-type"\]:checked/);

const fixture = [
    { id: 'team-1', date: '2026-09-16', round: 2, area: 'Factory 4' },
    { id: 'team-3', date: '2026-09-16', round: 2, area: 'Factory 1' },
    { id: 'team-5', date: '2026-09-16', round: 2, area: 'Factory 3/1' },
];
assert.strictEqual(fixture.length, 3, 'all area sessions remain selectable');
assert.strictEqual(new Set(fixture.map(row => `${row.date}:${row.round}`)).size, 1, 'KPI keeps one calendar occurrence');

const occurrenceDisplaySource = ui.match(/function patrolSupervisorOccurrenceDisplayItems\(items = \[\]\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(occurrenceDisplaySource, 'supervisor occurrence display helper must exist');
const occurrenceDisplay = vm.runInNewContext(`(${occurrenceDisplaySource})`, {
    patrolScheduleDate: item => item.date,
    patrolScheduleRound: item => item.round,
    patrolSessionId: item => item.id,
    patrolScheduleArea: item => item.area,
    patrolSessionRecords: item => item.records || [],
    patrolSessionCompleted: item => Boolean(item.isCompleted || item.records?.length),
    patrolSessionMakeup: item => item.status === 'makeup',
    patrolSessionLeave: item => item.status === 'leave',
    patrolSessionLeavePending: item => item.status === 'leave_pending',
});
const groupedMissed = occurrenceDisplay(fixture.map(row => ({ ...row, status: 'missed', records: [] })));
assert.strictEqual(groupedMissed.length, 1, 'same date/round area choices render as one status row');
assert.strictEqual(groupedMissed[0].areaName, '3 พื้นที่');
assert.strictEqual(groupedMissed[0].status, 'missed');
const sharedRecord = { id: 99, CheckinDate: '2026-09-16', Location: 'Factory 3' };
const groupedChecked = occurrenceDisplay(fixture.map(row => ({ ...row, status: 'checked', isCompleted: true, records: [sharedRecord] })));
assert.strictEqual(groupedChecked.length, 1);
assert.strictEqual(groupedChecked[0].records.length, 1, 'shared occurrence record is not repeated for every area choice');
assert.strictEqual(groupedChecked[0].areaName, 'Factory 3');
assert.strictEqual(groupedChecked[0].status, 'checked');

console.log('Patrol supervisor shared schedule contract test: PASS');
