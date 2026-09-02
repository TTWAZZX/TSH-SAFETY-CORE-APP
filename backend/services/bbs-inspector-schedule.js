'use strict';

const { databaseIsoDate, isoWeekday, normalizeWeekdays } = require('./bbs-phase1');

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function percent(numerator, denominator) { return denominator > 0 ? Math.round(numerator * 10000 / denominator) / 100 : 0; }
function kpiStatus({ configured = true, applicable = true, numerator = 0, denominator = 0, scheduledDays = 0, upcomingDays = 0 } = {}) {
    if (!configured) return { code:'NOT_CONFIGURED', label:'Not configured', description:'ยังไม่ได้กำหนดผู้ตรวจและ KPI สำหรับช่วงเวลานี้', percentage:null };
    if (!applicable) return { code:'N_A', label:'N/A', description:'บุคคลหรือช่วงเวลานี้ไม่อยู่ในเกณฑ์ KPI', percentage:null };
    if (number(denominator) > 0 && number(numerator) <= 0) return { code:'ZERO_PERCENT', label:'0%', description:'ถึงกำหนดตรวจแล้ว แต่ยังไม่มีผลงานที่นับ KPI', percentage:0 };
    if (number(denominator) > 0) return { code:'PERCENT', label:`${percent(numerator, denominator)}%`, description:'ผลงานเทียบเป้าหมายที่ถึงกำหนดแล้ว', percentage:percent(numerator, denominator) };
    if (number(upcomingDays) > 0 || number(scheduledDays) > 0) return { code:'NOT_INSPECTED', label:'ยังไม่ได้ตรวจ', description:'มีตารางตรวจ แต่ยังไม่มีเป้าหมายที่ถึงกำหนด', percentage:null };
    return { code:'N_A', label:'N/A', description:'ไม่มีวันตรวจที่นำมาคำนวณในช่วงเวลานี้', percentage:null };
}
function dateRows(start, end) {
    const rows = [];
    for (let cursor = new Date(`${start}T00:00:00Z`); cursor < new Date(`${end}T00:00:00Z`); cursor = new Date(cursor.getTime() + 86400000)) rows.push(cursor.toISOString().slice(0, 10));
    return rows;
}
function inRange(row, date, fromKey = 'EffectiveFrom', toKey = 'EffectiveTo') {
    const from = databaseIsoDate(row?.[fromKey]);
    const to = databaseIsoDate(row?.[toKey]);
    return Boolean(from && from <= date && (!to || to >= date));
}
function scheduleTarget({ enrollment, rules = [], overrides = [], date }) {
    const override = overrides.find(row => Number(row.EnrollmentID) === Number(enrollment.EnrollmentID || enrollment.id)
        && databaseIsoDate(row.ScheduleDate) === date && Number(row.IsActive ?? 1) === 1);
    if (override) {
        if (override.OverrideType === 'Exempt') return { target:0, source:'Exempt', reason:override.Reason || '' };
        return { target:Math.max(1, number(override.TargetCount) || number(enrollment.TargetCount) || 1), source:'Required override', reason:override.Reason || '' };
    }
    const rule = rules
        .filter(row => Number(row.EnrollmentID) === Number(enrollment.EnrollmentID || enrollment.id) && row.Status === 'Active' && inRange(row, date))
        .sort((a, b) => databaseIsoDate(b.EffectiveFrom).localeCompare(databaseIsoDate(a.EffectiveFrom)) || Number(b.id) - Number(a.id))[0];
    const weekdays = normalizeWeekdays(rule?.Weekdays || enrollment.Weekdays || '1,2,3,4,5');
    if (!weekdays.includes(isoWeekday(date))) return { target:0, source:rule ? 'Schedule rule' : 'Default KPI', reason:'' };
    return { target:Math.max(1, number(rule?.TargetCount) || number(enrollment.TargetCount) || 1), source:rule ? 'Schedule rule' : 'Default KPI', reason:rule?.Reason || '' };
}
function computeCompliance({ enrollments = [], rules = [], overrides = [], actualRows = [], range, today }) {
    const actual = new Map();
    for (const row of actualRows) actual.set(`${row.ObserverEmployeeID}::${databaseIsoDate(row.ObservationDate)}`, number(row.ActualCount));
    const people = [];
    for (const enrollment of enrollments) {
        const enrollmentId = Number(enrollment.EnrollmentID || enrollment.id);
        const from = [range.start, databaseIsoDate(enrollment.EnrollmentFrom || enrollment.EffectiveFrom)].filter(Boolean).sort().pop();
        const toCandidates = [range.end, databaseIsoDate(enrollment.EnrollmentTo || enrollment.EffectiveTo)].filter(Boolean).sort();
        let end = toCandidates[0] || range.end;
        if (end !== range.end) {
            const next = new Date(`${end}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); end = next.toISOString().slice(0, 10);
        }
        const days = dateRows(from, end).map(date => {
            const schedule = scheduleTarget({ enrollment:{ ...enrollment, EnrollmentID:enrollmentId }, rules, overrides, date });
            const actualCount = actual.get(`${enrollment.InspectorEmployeeID || enrollment.EmployeeID}::${date}`) || 0;
            const future = date > today;
            const achieved = schedule.target > 0 && !future ? Math.min(schedule.target, actualCount) : 0;
            let status = 'Not scheduled';
            if (schedule.source === 'Exempt') status = 'Exempt';
            else if (schedule.target > 0 && future) status = 'Upcoming';
            else if (schedule.target > 0 && actualCount >= schedule.target) status = 'Completed';
            else if (schedule.target > 0 && actualCount > 0) status = 'Partial';
            else if (schedule.target > 0) status = 'Missed';
            return { date, target:schedule.target, actual:actualCount, achieved, status, source:schedule.source, reason:schedule.reason };
        });
        const due = days.filter(row => row.target > 0 && row.date <= today);
        const scheduled = days.filter(row => row.target > 0);
        const numerator = due.reduce((sum, row) => sum + row.achieved, 0);
        const denominator = due.reduce((sum, row) => sum + row.target, 0);
        const upcomingDays = days.filter(row => row.status === 'Upcoming').length;
        const exemptDays = days.filter(row => row.status === 'Exempt').length;
        people.push({
            enrollmentId,
            inspectorEmployeeId:String(enrollment.InspectorEmployeeID || enrollment.EmployeeID),
            inspectorName:String(enrollment.InspectorName || enrollment.EmployeeName || ''),
            department:String(enrollment.DepartmentName || enrollment.Department || ''),
            unit:String(enrollment.SafetyUnitName || enrollment.Unit || ''),
            scheduledDays:scheduled.length,
            dueDays:due.length,
            completedDays:due.filter(row => row.status === 'Completed').length,
            partialDays:due.filter(row => row.status === 'Partial').length,
            missedDays:due.filter(row => row.status === 'Missed').length,
            upcomingDays,
            exemptDays,
            actualObservations:days.reduce((sum, row) => sum + row.actual, 0),
            numerator,
            denominator,
            percentage:denominator > 0 ? percent(numerator, denominator) : null,
            kpiStatus:kpiStatus({ configured:true, applicable:scheduled.length > 0, numerator, denominator, scheduledDays:scheduled.length, upcomingDays }),
            days
        });
    }
    const numerator = people.reduce((sum, row) => sum + row.numerator, 0);
    const denominator = people.reduce((sum, row) => sum + row.denominator, 0);
    return {
        summary:{
            inspectors:people.length,
            scheduledDays:people.reduce((sum, row) => sum + row.scheduledDays, 0),
            dueDays:people.reduce((sum, row) => sum + row.dueDays, 0),
            completedDays:people.reduce((sum, row) => sum + row.completedDays, 0),
            partialDays:people.reduce((sum, row) => sum + row.partialDays, 0),
            missedDays:people.reduce((sum, row) => sum + row.missedDays, 0),
            upcomingDays:people.reduce((sum, row) => sum + row.upcomingDays, 0),
            exemptDays:people.reduce((sum, row) => sum + row.exemptDays, 0),
            actualObservations:people.reduce((sum, row) => sum + row.actualObservations, 0),
            numerator, denominator, percentage:denominator > 0 ? percent(numerator, denominator) : null,
            kpiStatus:kpiStatus({ configured:people.length > 0, applicable:people.some(row => row.scheduledDays > 0), numerator, denominator, scheduledDays:people.reduce((sum, row) => sum + row.scheduledDays, 0), upcomingDays:people.reduce((sum, row) => sum + row.upcomingDays, 0) })
        },
        people
    };
}

module.exports = { dateRows, inRange, scheduleTarget, kpiStatus, computeCompliance };
