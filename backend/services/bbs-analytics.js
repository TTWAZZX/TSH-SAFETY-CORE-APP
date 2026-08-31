'use strict';

const { normalizeWeekdays, isoWeekday, databaseIsoDate } = require('./bbs-phase1');

const ANALYTICS_SCOPES = ['personal', 'team', 'department', 'company'];
const ANALYTICS_RISKS = ['Critical', 'High', 'Medium', 'Low'];

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function percent(numerator, denominator) { return denominator > 0 ? Math.round((number(numerator) * 10000) / number(denominator)) / 100 : 0; }
function iso(value) { return databaseIsoDate(value) || String(value || '').slice(0, 10); }
function validYear(value, fallback = new Date().getFullYear()) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback; }
function validMonth(value) { const parsed = Number(value || 0); return Number.isInteger(parsed) && parsed >= 0 && parsed <= 12 ? parsed : 0; }
function normalizeRisk(value) { return ANALYTICS_RISKS.find(item => item.toLowerCase() === String(value || '').trim().toLowerCase()) || '';
}
function periodRange(year, month, todayIso) {
    const start = `${year}-${String(month || 1).padStart(2, '0')}-01`;
    const endDate = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    const end = endDate.toISOString().slice(0, 10);
    const through = todayIso < start ? start : (todayIso >= end ? new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10) : todayIso);
    return { start, end, through };
}
function requiredDates(start, end, through, weekdays) {
    if (through < start) return [];
    const allowed = new Set(normalizeWeekdays(weekdays));
    const rows = [];
    for (let cursor = new Date(`${start}T00:00:00Z`); cursor < new Date(`${end}T00:00:00Z`) && cursor.toISOString().slice(0, 10) <= through; cursor = new Date(cursor.getTime() + 86400000)) {
        const date = cursor.toISOString().slice(0, 10);
        if (allowed.has(isoWeekday(date))) rows.push(date);
    }
    return rows;
}
function computeKpi(people = [], actualRows = [], range) {
    const actual = new Map();
    for (const row of actualRows) actual.set(`${row.ObserverEmployeeID}::${iso(row.ObservationDate)}`, number(row.ActualCount));
    let numerator = 0, denominator = 0, peopleMeeting = 0;
    const grouped = new Map();
    for (const person of people) {
        const key=String(person.EmployeeID);const target=grouped.get(key)||{...person,periods:[]};
        target.periods.push({from:iso(person.EnrollmentFrom||person.EffectiveFrom||range.start),to:iso(person.EnrollmentTo||person.EffectiveTo||'9999-12-31')});grouped.set(key,target);
    }
    const peopleRows = [...grouped.values()].map(person => {
        const dates = [...new Set(person.periods.flatMap(period => requiredDates(period.from>range.start?period.from:range.start, range.end, period.to<range.through?period.to:range.through, person.Weekdays)))].sort();
        const target = Math.max(1, number(person.TargetCount));
        const expected = dates.length * target;
        const achieved = dates.reduce((sum, date) => sum + Math.min(target, actual.get(`${person.EmployeeID}::${date}`) || 0), 0);
        numerator += achieved; denominator += expected;
        const met = expected > 0 && achieved >= expected;
        if (met) peopleMeeting += 1;
        return { employeeId: String(person.EmployeeID), employeeName: String(person.EmployeeName || ''), targetPerDay: target, numerator: achieved, denominator: expected, percentage: percent(achieved, expected), met };
    });
    return { numerator, denominator, percentage: percent(numerator, denominator), peopleMeeting, peopleTotal: peopleRows.length, people: peopleRows };
}
function agingBucket(days) { const value = Math.max(0, number(days)); return value <= 3 ? '0-3 days' : value <= 7 ? '4-7 days' : value <= 14 ? '8-14 days' : '15+ days'; }

module.exports = { ANALYTICS_SCOPES, ANALYTICS_RISKS, number, percent, iso, validYear, validMonth, normalizeRisk, periodRange, requiredDates, computeKpi, agingBucket };
