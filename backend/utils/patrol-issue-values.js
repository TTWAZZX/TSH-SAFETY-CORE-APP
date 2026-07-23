'use strict';

function issueMultiValues(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    const text = String(value || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(v => String(v || '').trim()).filter(Boolean);
        } catch (_) {}
    }
    return text.split(/\s*(?:\|+|;)\s*/).map(v => v.trim()).filter(Boolean);
}

function issueMultiDisplay(value, fallback = '-') {
    const values = issueMultiValues(value);
    return values.length ? values.join(', ') : fallback;
}

function issueMultiJson(value) {
    return JSON.stringify([...new Set(issueMultiValues(value))]);
}

function issueStopIds(value) {
    return [...new Set(issueMultiValues(value)
        .map(v => String(v || '').match(/STOP\s*(\d)/i))
        .filter(Boolean)
        .map(match => Number(match[1]))
        .filter(id => id >= 1 && id <= 6))];
}

function aggregateIssueCountsByMultiValue(issues, field) {
    const counts = new Map();
    for (const issue of issues || []) {
        for (const value of new Set(issueMultiValues(issue?.[field]))) {
            const current = counts.get(value) || { total: 0, closed: 0 };
            current.total += 1;
            if (issue?.CurrentStatus === 'Closed') current.closed += 1;
            counts.set(value, current);
        }
    }
    return counts;
}

function canUpdatePatrolIssue(user, issue) {
    if (String(issue?.CurrentStatus || '').trim() === 'Closed') return false;
    const employeeId = String(user?.id || user?.EmployeeID || '').trim();
    if (employeeId && employeeId === String(issue?.ReporterID || '').trim()) return true;
    const department = String(user?.department || user?.Department || '').trim();
    const unit = String(user?.unit || user?.Unit || '').trim();
    const departments = issueMultiValues(issue?.ResponsibleDept);
    const units = issueMultiValues(issue?.ResponsibleUnit);
    return Boolean((department && departments.includes(department)) || (unit && units.includes(unit)));
}

function hasInitialIssueFieldChanges(data, issue) {
    const fields = ['DateFound', 'FoundByTeam', 'Area', 'MachineName', 'HazardDescription', 'Rank', 'DueDate', 'BeforeImage'];
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(data || {}, field)) continue;
        const normalize = value => {
            if (!value) return '';
            if (['DateFound', 'DueDate'].includes(field)) {
                const date = value instanceof Date ? value : new Date(value);
                if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
            }
            return String(value ?? '').trim();
        };
        const incoming = normalize(data[field]);
        const current = normalize(issue?.[field]);
        if (incoming !== current) return true;
    }
    for (const field of ['HazardType', 'ResponsibleDept', 'ResponsibleUnit']) {
        if (!Object.prototype.hasOwnProperty.call(data || {}, field)) continue;
        const incoming = [...new Set(issueMultiValues(data[field]))].sort();
        const current = [...new Set(issueMultiValues(issue?.[field]))].sort();
        if (JSON.stringify(incoming) !== JSON.stringify(current)) return true;
    }
    return false;
}

module.exports = {
    aggregateIssueCountsByMultiValue,
    canUpdatePatrolIssue,
    hasInitialIssueFieldChanges,
    issueMultiDisplay,
    issueMultiJson,
    issueMultiValues,
    issueStopIds,
};
