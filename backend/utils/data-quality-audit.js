'use strict';

const {
    ONBOARDING_STATUS,
    OnboardingResolutionError,
    createOnboardingResolver,
    normalizeOnboardingName,
} = require('./onboarding-resolver');

const DATA_QUALITY_CLASSIFICATION = Object.freeze({
    EXPECTED_PASSWORD_PENDING: 'EXPECTED_PASSWORD_PENDING',
    EXPECTED_SAFETY_UNIT_PENDING: 'EXPECTED_SAFETY_UNIT_PENDING',
    READY_VALID: 'READY_VALID',
    INVALID_UNIT_FOR_DEPARTMENT: 'INVALID_UNIT_FOR_DEPARTMENT',
    UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS: 'UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS',
    UNKNOWN_DEPARTMENT: 'UNKNOWN_DEPARTMENT',
    INVALID_POSITION: 'INVALID_POSITION',
    HIDDEN_WHITESPACE_OR_LINEBREAK: 'HIDDEN_WHITESPACE_OR_LINEBREAK',
    MASTER_DATA_AMBIGUITY: 'MASTER_DATA_AMBIGUITY',
    OTHER_PROFILE_ANOMALIES: 'OTHER_PROFILE_ANOMALIES',
});

const CLASSIFICATION_ORDER = Object.freeze(Object.values(DATA_QUALITY_CLASSIFICATION));
const PROFILE_LIMITS = Object.freeze({
    EmployeeName: 255,
    Department: 100,
    Unit: 100,
    Position: 100,
});

function characterLength(value) {
    return Array.from(String(value ?? '')).length;
}

function cleanedDisplayValue(value) {
    return String(value ?? '').replace(/[\r\n]/g, '').trim();
}

function isBlank(value) {
    return normalizeOnboardingName(value) === '';
}

function hasHiddenWhitespaceOrLinebreak(value) {
    const raw = String(value ?? '');
    return /[\r\n]/.test(raw) || raw !== raw.trim();
}

function sortedRows(rows, valueSelector) {
    return [...rows].sort((left, right) => (
        String(valueSelector(left)).localeCompare(String(valueSelector(right)), 'en')
    ));
}

function findDuplicateGroups(rows, keySelector, valueSelector, type) {
    const groups = new Map();
    for (const row of rows) {
        const key = keySelector(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(valueSelector(row));
    }
    return [...groups.entries()]
        .filter(([key, values]) => !key || values.length > 1)
        .map(([normalizedKey, values]) => ({
            type,
            normalizedKey,
            values: values.map(value => String(value ?? '')).sort((a, b) => a.localeCompare(b, 'en')),
        }))
        .sort((left, right) => (
            left.normalizedKey.localeCompare(right.normalizedKey, 'en')
            || left.type.localeCompare(right.type, 'en')
        ));
}

function inspectMasterData(masterData) {
    const departments = Array.isArray(masterData?.departments) ? masterData.departments : [];
    const units = Array.isArray(masterData?.units) ? masterData.units : [];
    const positions = Array.isArray(masterData?.positions) ? masterData.positions : [];
    const ambiguities = [
        ...findDuplicateGroups(
            departments,
            row => normalizeOnboardingName(row?.Name ?? row?.name),
            row => row?.Name ?? row?.name,
            'DEPARTMENT_NORMALIZED_DUPLICATE_OR_BLANK'
        ),
        ...findDuplicateGroups(
            units,
            row => `${String(row?.department_id ?? row?.DepartmentID ?? '')}|${normalizeOnboardingName(row?.name ?? row?.Name)}`,
            row => row?.name ?? row?.Name,
            'SAFETY_UNIT_NORMALIZED_DUPLICATE_OR_BLANK'
        ).filter(item => !item.normalizedKey.endsWith('|')),
        ...findDuplicateGroups(
            positions,
            row => normalizeOnboardingName(row?.Name ?? row?.name),
            row => row?.Name ?? row?.name,
            'POSITION_NORMALIZED_DUPLICATE_OR_BLANK'
        ),
    ];

    if (departments.length === 0) {
        ambiguities.push({ type: 'DEPARTMENT_MASTER_UNAVAILABLE', values: [] });
    }
    if (positions.length === 0) {
        ambiguities.push({ type: 'POSITION_MASTER_UNAVAILABLE', values: [] });
    }
    for (const [field, rows, selector] of [
        ['Department', departments, row => row?.Name ?? row?.name],
        ['Unit', units, row => row?.name ?? row?.Name],
        ['Position', positions, row => row?.Name ?? row?.name],
    ]) {
        for (const row of rows) {
            if (characterLength(selector(row)) > PROFILE_LIMITS[field]) {
                ambiguities.push({
                    type: 'MASTER_FIELD_OVER_SCHEMA_LIMIT',
                    field,
                    values: [String(selector(row) ?? '')],
                });
            }
        }
    }

    const departmentIds = new Set(departments.map(row => String(row?.id ?? row?.ID ?? '')));
    if (departmentIds.size !== departments.length || departmentIds.has('')) {
        ambiguities.push({ type: 'DEPARTMENT_ID_DUPLICATE_OR_BLANK', values: [] });
    }
    for (const unit of units) {
        const departmentId = String(unit?.department_id ?? unit?.DepartmentID ?? '');
        const name = String(unit?.name ?? unit?.Name ?? '');
        if (!departmentId || !departmentIds.has(departmentId) || !normalizeOnboardingName(name)) {
            ambiguities.push({
                type: 'SAFETY_UNIT_ORPHAN_OR_INVALID',
                departmentId,
                values: [name],
            });
        }
    }

    return ambiguities.sort((left, right) => (
        left.type.localeCompare(right.type, 'en')
        || String(left.normalizedKey ?? left.departmentId ?? '').localeCompare(
            String(right.normalizedKey ?? right.departmentId ?? ''),
            'en'
        )
    ));
}

function createFindingBuckets() {
    return Object.fromEntries(CLASSIFICATION_ORDER.map(name => [name, []]));
}

function createCounts() {
    return Object.fromEntries(CLASSIFICATION_ORDER.map(name => [name, 0]));
}

function primaryClassification(employee, masterIndex, onboardingStatus) {
    if (onboardingStatus === ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED) {
        return DATA_QUALITY_CLASSIFICATION.EXPECTED_PASSWORD_PENDING;
    }

    const departmentId = masterIndex.departmentsByName.get(normalizeOnboardingName(employee.Department));
    if (!departmentId) return DATA_QUALITY_CLASSIFICATION.UNKNOWN_DEPARTMENT;
    const allowedUnits = masterIndex.unitsByDepartmentId.get(departmentId);
    const unitKey = normalizeOnboardingName(employee.Unit);

    if (allowedUnits.size === 0) {
        return unitKey
            ? DATA_QUALITY_CLASSIFICATION.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS
            : DATA_QUALITY_CLASSIFICATION.READY_VALID;
    }
    if (!unitKey) return DATA_QUALITY_CLASSIFICATION.EXPECTED_SAFETY_UNIT_PENDING;
    return allowedUnits.has(unitKey)
        ? DATA_QUALITY_CLASSIFICATION.READY_VALID
        : DATA_QUALITY_CLASSIFICATION.INVALID_UNIT_FOR_DEPARTMENT;
}

function inspectOtherProfileAnomalies(employee) {
    const issues = [];
    const values = {
        EmployeeName: employee.EmployeeName,
        Department: employee.Department,
        Unit: employee.Unit,
        Position: employee.Position,
    };
    for (const [field, value] of Object.entries(values)) {
        if (value !== null && value !== undefined && typeof value !== 'string') {
            issues.push({ field, issue: 'INVALID_TYPE' });
            continue;
        }
        if (characterLength(value) > PROFILE_LIMITS[field]) {
            issues.push({ field, issue: 'OVER_SCHEMA_LIMIT', limit: PROFILE_LIMITS[field] });
        }
    }
    if (!cleanedDisplayValue(employee.EmployeeName)) {
        issues.push({ field: 'EmployeeName', issue: 'BLANK_REQUIRED_VALUE' });
    }
    if (isBlank(employee.Position)) {
        issues.push({ field: 'Position', issue: 'BLANK_REQUIRED_VALUE' });
    }
    return issues;
}

function buildDataQualityReport({ employees, departments, units, positions }, options = {}) {
    if (!Array.isArray(employees)) throw new TypeError('employees must be an array.');
    const masterData = { departments, units, positions };
    const masterAmbiguities = inspectMasterData(masterData);
    const findings = createFindingBuckets();
    findings[DATA_QUALITY_CLASSIFICATION.MASTER_DATA_AMBIGUITY] = masterAmbiguities;
    const classificationCounts = createCounts();
    classificationCounts[DATA_QUALITY_CLASSIFICATION.MASTER_DATA_AMBIGUITY] = masterAmbiguities.length;
    const onboardingStatusCounts = {
        [ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED]: 0,
        [ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED]: 0,
        [ONBOARDING_STATUS.READY]: 0,
    };
    const normalizationFindings = [];
    const executionErrors = [];
    const dataDefectEmployeeIds = new Set();
    let expectedPasswordPendingWithBlankUnit = 0;
    let expectedPasswordPendingWithBlankRequiredUnit = 0;
    let expectedSafetyUnitPendingWithBlankUnit = 0;

    if (masterAmbiguities.length > 0) {
        return {
            generatedAt: options.generatedAt || new Date().toISOString(),
            readOnly: true,
            auditComplete: false,
            totalEmployees: employees.length,
            masters: {
                departments: Array.isArray(departments) ? departments.length : 0,
                safetyUnits: Array.isArray(units) ? units.length : 0,
                positions: Array.isArray(positions) ? positions.length : 0,
                positionRelationship: 'GLOBAL',
            },
            onboardingStatusCounts,
            classificationCounts,
            expectedStateCounts: {
                passwordPendingWithBlankUnit: 0,
                passwordPendingWithBlankRequiredUnit: 0,
                safetyUnitPendingWithBlankUnit: 0,
                totalBlankRequiredUnit: 0,
                totalPending: 0,
            },
            dataDefectEmployeeCount: 0,
            findings,
            masterAmbiguities,
            normalizationFindings,
            executionErrors,
            databaseMutationAttempted: false,
        };
    }

    const resolver = createOnboardingResolver({ departments, units });
    const positionsByName = new Map(
        positions.map(row => [normalizeOnboardingName(row?.Name ?? row?.name), String(row?.Name ?? row?.name ?? '')])
    );
    const orderedEmployees = sortedRows(employees, row => row?.EmployeeID ?? '');

    for (const employee of orderedEmployees) {
        const employeeId = String(employee?.EmployeeID ?? '');
        let onboardingStatus = null;
        let onboardingError = null;
        try {
            onboardingStatus = resolver.resolve(employee);
            onboardingStatusCounts[onboardingStatus] += 1;
        } catch (error) {
            if (!(error instanceof OnboardingResolutionError)) throw error;
            onboardingError = error.code;
        }

        const primary = primaryClassification(employee, resolver.masterIndex, onboardingStatus);
        classificationCounts[primary] += 1;
        const primaryFinding = { employeeId, onboardingStatus, onboardingError };
        const departmentId = resolver.masterIndex.departmentsByName.get(normalizeOnboardingName(employee.Department));
        const allowedUnits = departmentId ? resolver.masterIndex.unitsByDepartmentId.get(departmentId) : null;
        if (primary === DATA_QUALITY_CLASSIFICATION.EXPECTED_PASSWORD_PENDING) {
            primaryFinding.unitBlank = isBlank(employee.Unit);
            primaryFinding.departmentHasSafetyUnits = allowedUnits ? allowedUnits.size > 0 : null;
            if (primaryFinding.unitBlank) {
                expectedPasswordPendingWithBlankUnit += 1;
                if (primaryFinding.departmentHasSafetyUnits) {
                    expectedPasswordPendingWithBlankRequiredUnit += 1;
                }
            }
        } else if (primary === DATA_QUALITY_CLASSIFICATION.EXPECTED_SAFETY_UNIT_PENDING) {
            primaryFinding.requiresUserSelection = true;
            expectedSafetyUnitPendingWithBlankUnit += 1;
        } else if (primary === DATA_QUALITY_CLASSIFICATION.INVALID_UNIT_FOR_DEPARTMENT) {
            primaryFinding.currentUnit = String(employee.Unit ?? '');
            primaryFinding.automaticReplacementAllowed = false;
            dataDefectEmployeeIds.add(employeeId);
        } else if (primary === DATA_QUALITY_CLASSIFICATION.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS) {
            primaryFinding.currentUnit = String(employee.Unit ?? '');
            primaryFinding.automaticClearAllowed = false;
            dataDefectEmployeeIds.add(employeeId);
        } else if (primary === DATA_QUALITY_CLASSIFICATION.UNKNOWN_DEPARTMENT) {
            primaryFinding.currentDepartment = String(employee.Department ?? '');
            dataDefectEmployeeIds.add(employeeId);
        }
        findings[primary].push(primaryFinding);

        if (primary === DATA_QUALITY_CLASSIFICATION.EXPECTED_PASSWORD_PENDING) {
            const unitKey = normalizeOnboardingName(employee.Unit);
            if (!departmentId) {
                findings[DATA_QUALITY_CLASSIFICATION.UNKNOWN_DEPARTMENT].push({
                    employeeId,
                    currentDepartment: String(employee.Department ?? ''),
                    deferredByPasswordGate: true,
                });
                classificationCounts[DATA_QUALITY_CLASSIFICATION.UNKNOWN_DEPARTMENT] += 1;
                dataDefectEmployeeIds.add(employeeId);
            } else if (allowedUnits.size > 0 && unitKey && !allowedUnits.has(unitKey)) {
                findings[DATA_QUALITY_CLASSIFICATION.INVALID_UNIT_FOR_DEPARTMENT].push({
                    employeeId,
                    currentUnit: String(employee.Unit ?? ''),
                    automaticReplacementAllowed: false,
                    deferredByPasswordGate: true,
                });
                classificationCounts[DATA_QUALITY_CLASSIFICATION.INVALID_UNIT_FOR_DEPARTMENT] += 1;
                dataDefectEmployeeIds.add(employeeId);
            } else if (allowedUnits.size === 0 && unitKey) {
                findings[DATA_QUALITY_CLASSIFICATION.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS].push({
                    employeeId,
                    currentUnit: String(employee.Unit ?? ''),
                    automaticClearAllowed: false,
                    deferredByPasswordGate: true,
                });
                classificationCounts[DATA_QUALITY_CLASSIFICATION.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS] += 1;
                dataDefectEmployeeIds.add(employeeId);
            }
        }

        const positionKey = normalizeOnboardingName(employee.Position);
        if (positionKey && !positionsByName.has(positionKey)) {
            findings[DATA_QUALITY_CLASSIFICATION.INVALID_POSITION].push({
                employeeId,
                currentPosition: String(employee.Position ?? ''),
                canonicalCandidates: [],
                automaticCorrectionAllowed: false,
            });
            classificationCounts[DATA_QUALITY_CLASSIFICATION.INVALID_POSITION] += 1;
            dataDefectEmployeeIds.add(employeeId);
        }

        const hiddenFields = [];
        for (const field of ['EmployeeName', 'Department', 'Unit', 'Position']) {
            const rawValue = employee[field];
            if (!hasHiddenWhitespaceOrLinebreak(rawValue)) continue;
            const comparisonKey = normalizeOnboardingName(rawValue);
            let masterMatched = null;
            if (field === 'Department') masterMatched = resolver.masterIndex.departmentsByName.has(comparisonKey);
            if (field === 'Position') masterMatched = positionsByName.has(comparisonKey);
            if (field === 'Unit') masterMatched = Boolean(allowedUnits?.has(comparisonKey));
            hiddenFields.push({
                field,
                before: String(rawValue ?? ''),
                afterTrimAndLinebreakRemoval: cleanedDisplayValue(rawValue),
                comparisonKey,
                masterMatched,
            });
        }
        if (hiddenFields.length > 0) {
            const finding = { employeeId, fields: hiddenFields, automaticCorrectionAllowed: false };
            findings[DATA_QUALITY_CLASSIFICATION.HIDDEN_WHITESPACE_OR_LINEBREAK].push(finding);
            normalizationFindings.push(finding);
            classificationCounts[DATA_QUALITY_CLASSIFICATION.HIDDEN_WHITESPACE_OR_LINEBREAK] += 1;
            dataDefectEmployeeIds.add(employeeId);
        }

        const otherIssues = inspectOtherProfileAnomalies(employee);
        if (otherIssues.length > 0) {
            findings[DATA_QUALITY_CLASSIFICATION.OTHER_PROFILE_ANOMALIES].push({ employeeId, issues: otherIssues });
            classificationCounts[DATA_QUALITY_CLASSIFICATION.OTHER_PROFILE_ANOMALIES] += 1;
            dataDefectEmployeeIds.add(employeeId);
        }
    }

    const expectedPendingTotal = (
        classificationCounts[DATA_QUALITY_CLASSIFICATION.EXPECTED_PASSWORD_PENDING]
        + classificationCounts[DATA_QUALITY_CLASSIFICATION.EXPECTED_SAFETY_UNIT_PENDING]
    );
    return {
        generatedAt: options.generatedAt || new Date().toISOString(),
        readOnly: true,
        auditComplete: true,
        totalEmployees: employees.length,
        masters: {
            departments: departments.length,
            safetyUnits: units.length,
            positions: positions.length,
            positionRelationship: 'GLOBAL',
        },
        onboardingStatusCounts,
        classificationCounts,
        expectedStateCounts: {
            passwordPendingWithBlankUnit: expectedPasswordPendingWithBlankUnit,
            passwordPendingWithBlankRequiredUnit: expectedPasswordPendingWithBlankRequiredUnit,
            safetyUnitPendingWithBlankUnit: expectedSafetyUnitPendingWithBlankUnit,
            totalBlankRequiredUnit: (
                expectedPasswordPendingWithBlankRequiredUnit
                + expectedSafetyUnitPendingWithBlankUnit
            ),
            totalPending: expectedPendingTotal,
        },
        dataDefectEmployeeCount: dataDefectEmployeeIds.size,
        findings,
        masterAmbiguities,
        normalizationFindings,
        executionErrors,
        databaseMutationAttempted: false,
    };
}

function formatHumanReport(report) {
    const lines = [
        'Phase 6 Data Quality Review (READ ONLY)',
        `Generated: ${report.generatedAt}`,
        `Audit complete: ${report.auditComplete ? 'yes' : 'no'}`,
        `Employees: ${report.totalEmployees}`,
        `Masters: departments=${report.masters.departments}, safetyUnits=${report.masters.safetyUnits}, positions=${report.masters.positions} (global)`,
        '',
        'Onboarding statuses:',
        ...Object.entries(report.onboardingStatusCounts).map(([name, count]) => `  ${name}: ${count}`),
        '',
        'Data-quality classifications:',
        ...CLASSIFICATION_ORDER.map(name => `  ${name}: ${report.classificationCounts[name]}`),
        '',
        `Password-pending users with blank Unit (expected; no remediation): ${report.expectedStateCounts.passwordPendingWithBlankUnit}`,
        `  of which their Department requires a Unit later: ${report.expectedStateCounts.passwordPendingWithBlankRequiredUnit}`,
        `Safety-Unit-pending users with blank Unit (user must select): ${report.expectedStateCounts.safetyUnitPendingWithBlankUnit}`,
        `Total blank Unit in Departments that require one: ${report.expectedStateCounts.totalBlankRequiredUnit}`,
        `Unique employees with data-defect findings: ${report.dataDefectEmployeeCount}`,
        `Master ambiguities: ${report.masterAmbiguities.length}`,
        `Execution errors: ${report.executionErrors.length}`,
        'Database mutation attempted: no',
    ];
    return lines.join('\n');
}

module.exports = {
    DATA_QUALITY_CLASSIFICATION,
    CLASSIFICATION_ORDER,
    PROFILE_LIMITS,
    cleanedDisplayValue,
    hasHiddenWhitespaceOrLinebreak,
    inspectMasterData,
    buildDataQualityReport,
    formatHumanReport,
};
