'use strict';

function normalizeScopeValue(value) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
}

function unitName(unit) {
    return String(unit?.name ?? unit?.Name ?? '').trim();
}

function unitDepartment(unit) {
    return String(unit?.department ?? unit?.Department ?? unit?.DeptName ?? unit?.deptName ?? '').trim();
}

function unitAliases(unit) {
    return [
        unitName(unit),
        unit?.short_code,
        unit?.ShortCode,
        unit?.shortCode,
    ].map(normalizeScopeValue).filter(Boolean);
}

function uniqueUnits(units) {
    return [...new Map(units.map(unit => [
        `${normalizeScopeValue(unitDepartment(unit))}::${normalizeScopeValue(unitName(unit))}`,
        unit,
    ])).values()];
}

function resolveTopicUnitScope(topicUnits, masterUnits) {
    const resolved = [];
    const unresolved = [];
    const aliases = [];

    [...new Set((topicUnits || []).map(value => String(value || '').trim()).filter(Boolean))]
        .forEach(requested => {
            const key = normalizeScopeValue(requested);
            let matches = (masterUnits || []).filter(unit => unitAliases(unit).includes(key));
            if (!matches.length) {
                matches = (masterUnits || []).filter(unit => {
                    const nameKey = normalizeScopeValue(unitName(unit));
                    return nameKey.startsWith(`${key} `) || key.startsWith(`${nameKey} `);
                });
            }
            matches = uniqueUnits(matches);
            if (matches.length !== 1) {
                unresolved.push(requested);
                return;
            }
            const unit = matches[0];
            if (normalizeScopeValue(unitName(unit)) !== key) {
                aliases.push({ requested, resolved: unitName(unit) });
            }
            if (!resolved.some(item =>
                normalizeScopeValue(unitName(item)) === normalizeScopeValue(unitName(unit))
                && normalizeScopeValue(unitDepartment(item)) === normalizeScopeValue(unitDepartment(unit))
            )) {
                resolved.push(unit);
            }
        });

    return { units: resolved, unresolved, aliases };
}

function parseDepartmentUnitMap(raw) {
    if (raw == null || raw === '') return null;
    let value = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const result = Object.create(null);
    Object.entries(value).forEach(([department, units]) => {
        const name = String(department || '').trim();
        if (!name || !Array.isArray(units)) return;
        result[name] = [...new Set(units.map(unit => String(unit || '').trim()).filter(Boolean))];
    });
    return result;
}

function buildDepartmentUnitPlan({
    departments,
    departmentUnits,
    fallbackUnits = [],
    topicUnits = [],
    masterUnits = [],
}) {
    const selectedDepartments = [...new Set((departments || []).map(value => String(value || '').trim()).filter(Boolean))];
    const mapping = parseDepartmentUnitMap(departmentUnits);
    const strictMapping = mapping !== null;
    const scope = resolveTopicUnitScope(topicUnits, masterUnits);
    const errors = [];
    const unitMap = {};

    if ((topicUnits || []).length && scope.unresolved.length) {
        errors.push(`Topic Safety Unit scope is not in Master Data: ${scope.unresolved.join(', ')}`);
    }

    const selectedDepartmentKeys = new Set(selectedDepartments.map(normalizeScopeValue));
    if (strictMapping) {
        const extraDepartments = Object.keys(mapping)
            .filter(department => !selectedDepartmentKeys.has(normalizeScopeValue(department)));
        if (extraDepartments.length) {
            errors.push(`Safety Unit mapping contains unselected Department: ${extraDepartments.join(', ')}`);
        }
    }

    selectedDepartments.forEach(department => {
        const departmentKey = normalizeScopeValue(department);
        const scopedUnits = scope.units.filter(unit => normalizeScopeValue(unitDepartment(unit)) === departmentKey);
        const rawSelected = strictMapping
            ? (Object.entries(mapping).find(([name]) => normalizeScopeValue(name) === departmentKey)?.[1] || [])
            : fallbackUnits;
        const canonicalSelected = [];

        rawSelected.forEach(requestedUnit => {
            const unitKey = normalizeScopeValue(requestedUnit);
            const matches = uniqueUnits(masterUnits.filter(unit => normalizeScopeValue(unitName(unit)) === unitKey));
            if (matches.length !== 1) {
                errors.push(`Safety Unit is not in Master Data: ${requestedUnit}`);
                return;
            }
            const unit = matches[0];
            if (normalizeScopeValue(unitDepartment(unit)) !== departmentKey) {
                errors.push(`Safety Unit ${unitName(unit)} does not belong to ${department}`);
                return;
            }
            if (topicUnits.length && !scopedUnits.some(item =>
                normalizeScopeValue(unitName(item)) === normalizeScopeValue(unitName(unit))
            )) {
                errors.push(`Safety Unit ${unitName(unit)} is outside the topic scope for ${department}`);
                return;
            }
            if (!canonicalSelected.includes(unitName(unit))) canonicalSelected.push(unitName(unit));
        });

        if (scopedUnits.length && canonicalSelected.length === 0) {
            errors.push(`Safety Unit is required for ${department}`);
        }
        if (!scopedUnits.length && canonicalSelected.length) {
            errors.push(`No scoped Safety Unit is assigned to ${department}`);
        }
        if (canonicalSelected.join(', ').length > 100) {
            errors.push(`Selected Safety Units exceed the 100-character storage limit for ${department}`);
        }
        unitMap[department] = canonicalSelected;
    });

    return {
        ok: errors.length === 0,
        errors: [...new Set(errors)],
        unitMap,
        unresolved: scope.unresolved,
        aliases: scope.aliases,
    };
}

module.exports = {
    buildDepartmentUnitPlan,
    normalizeScopeValue,
    parseDepartmentUnitMap,
    resolveTopicUnitScope,
};
