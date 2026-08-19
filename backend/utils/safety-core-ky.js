'use strict';

function normalizeSafetyCoreLookup(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseKyParticipants(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const text = String(raw || '').trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
        // Older KY rows may store participants as plain comma/newline separated names.
    }
    return text.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
}

function kyCoverageKey(row, fallbackIndex) {
    if (row.ActivityDate instanceof Date && !Number.isNaN(row.ActivityDate.getTime())) {
        return `${row.ActivityDate.getFullYear()}-${String(row.ActivityDate.getMonth() + 1).padStart(2, '0')}`;
    }
    const date = String(row.ActivityDate || '').trim();
    const match = date.match(/^(\d{4})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;
    const activityId = row.id ?? row.ID ?? row.ActivityID;
    return String(activityId || '').trim() || `ky-${fallbackIndex}`;
}

function buildKySafetyCoreCountMap(kyRows = [], employees = []) {
    const rosterIds = new Set();
    const employeeIdByName = new Map();
    const employeeIdsByDepartmentUnit = new Map();
    const employeeIdsByDepartment = new Map();
    const employeeIdsWithoutUnitByDepartment = new Map();
    const addIndex = (map, key, employeeId) => {
        const normalizedKey = normalizeSafetyCoreLookup(key);
        const id = normalizeSafetyCoreLookup(employeeId);
        if (!normalizedKey || !id) return;
        if (!map.has(normalizedKey)) map.set(normalizedKey, []);
        map.get(normalizedKey).push(id);
    };
    (employees || []).forEach(emp => {
        const id = normalizeSafetyCoreLookup(emp.EmployeeID);
        const name = normalizeSafetyCoreLookup(emp.EmployeeName);
        const department = normalizeSafetyCoreLookup(emp.Department);
        const unit = normalizeSafetyCoreLookup(emp.Unit);
        if (id) rosterIds.add(id);
        if (id && name) employeeIdByName.set(name, id);
        if (department && unit) addIndex(employeeIdsByDepartmentUnit, `${department}\u0000${unit}`, id);
        if (department && !unit) addIndex(employeeIdsWithoutUnitByDepartment, department, id);
        addIndex(employeeIdsByDepartment, department, id);
    });

    const coverageByEmployee = new Map();
    const add = (employeeId, coverageKey) => {
        const id = normalizeSafetyCoreLookup(employeeId);
        if (!id || (rosterIds.size && !rosterIds.has(id))) return;
        if (!coverageByEmployee.has(id)) coverageByEmployee.set(id, new Set());
        coverageByEmployee.get(id).add(coverageKey);
    };
    const resolveParticipant = participant => {
        if (!participant) return '';
        if (typeof participant === 'object') {
            const directId = normalizeSafetyCoreLookup(
                participant.EmployeeID ?? participant.employeeId ?? participant.empId ?? participant.id ?? participant.code
            );
            if (directId) return directId;
            const objectName = normalizeSafetyCoreLookup(
                participant.EmployeeName ?? participant.employeeName ?? participant.name ?? participant.Name
            );
            return employeeIdByName.get(objectName) || '';
        }
        const text = normalizeSafetyCoreLookup(participant);
        if (!text) return '';
        if (rosterIds.has(text)) return text;
        const parenId = text.match(/\(([^()]+)\)\s*$/)?.[1];
        if (parenId && rosterIds.has(normalizeSafetyCoreLookup(parenId))) return normalizeSafetyCoreLookup(parenId);
        return employeeIdByName.get(text) || '';
    };

    (kyRows || []).forEach((row, index) => {
        const coverageKey = kyCoverageKey(row, index + 1);
        add(row.ReporterID, coverageKey);
        add(row.SubmittedByID, coverageKey);
        parseKyParticipants(row.Participants).forEach(participant => {
            add(resolveParticipant(participant), coverageKey);
        });

        const unit = normalizeSafetyCoreLookup(row.SafetyUnit ?? row.Unit);
        const department = normalizeSafetyCoreLookup(row.Department);
        const scopeIds = unit
            ? [
                ...(employeeIdsByDepartmentUnit.get(`${department}\u0000${unit}`) || []),
                ...(employeeIdsWithoutUnitByDepartment.get(department) || []),
            ]
            : employeeIdsByDepartment.get(department) || [];
        scopeIds.forEach(employeeId => add(employeeId, coverageKey));
    });

    return new Map([...coverageByEmployee.entries()]
        .map(([employeeId, coverageKeys]) => [employeeId, coverageKeys.size]));
}

module.exports = {
    buildKySafetyCoreCountMap,
    normalizeSafetyCoreLookup,
    parseKyParticipants,
};
