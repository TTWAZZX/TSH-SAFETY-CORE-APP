'use strict';

function normalizeBulkCodeOptions(input = {}) {
    const year = Number.parseInt(input.year ?? input.Year, 10);
    const department = String(input.department ?? input.Department ?? 'all').trim() || 'all';
    const find = String(input.find ?? input.Find ?? '').trim().toUpperCase();
    const replace = String(input.replace ?? input.Replace ?? '').trim().toUpperCase();
    const activeOnly = input.activeOnly === undefined && input.ActiveOnly === undefined
        ? true
        : ![false, 0, '0', 'false'].includes(input.activeOnly ?? input.ActiveOnly);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new Error('Invalid curriculum year.');
    }
    if (!find || !replace) {
        throw new Error('Find and replacement code fragments are required.');
    }
    if (find === replace) {
        throw new Error('The replacement must be different from the current code fragment.');
    }
    if (find.length > 50 || replace.length > 50) {
        throw new Error('Code fragments must not exceed 50 characters.');
    }
    if (department.length > 100) {
        throw new Error('Department must not exceed 100 characters.');
    }
    return { year, department, find, replace, activeOnly };
}

function canonicalBulkCodeChanges(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map(row => ({ id: String(row.id || ''), oldCode: String(row.oldCode || ''), newCode: String(row.newCode || '') }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

function countOccurrences(value, token) {
    let count = 0;
    let offset = 0;
    while ((offset = value.indexOf(token, offset)) !== -1) {
        count += 1;
        offset += token.length;
    }
    return count;
}

function curriculumKey(row, code) {
    return `${String(row.Department || '').trim().toLocaleLowerCase()}::${String(code || '').trim().toLocaleLowerCase()}`;
}

function buildBulkCodePreview(allYearRows, rawOptions = {}) {
    const options = normalizeBulkCodeOptions(rawOptions);
    const rows = Array.isArray(allYearRows) ? allYearRows : [];
    const scopedRows = rows.filter(row => {
        if (Number.parseInt(row.Year, 10) !== options.year) return false;
        if (options.department !== 'all' && String(row.Department || '') !== options.department) return false;
        return !options.activeOnly || Number(row.IsActive) === 1;
    });

    const proposedById = new Map();
    const previewRows = [];
    for (const row of scopedRows) {
        const oldCode = String(row.CurriculumCode || '');
        const comparableCode = oldCode.toUpperCase();
        const occurrences = countOccurrences(comparableCode, options.find);
        if (!occurrences) continue;
        const matchOffset = comparableCode.indexOf(options.find);
        const next = {
            id: String(row.id),
            Year: Number.parseInt(row.Year, 10),
            Department: String(row.Department || ''),
            CurriculumTitle: String(row.CurriculumTitle || ''),
            IsActive: Number(row.IsActive) === 1 ? 1 : 0,
            oldCode,
            newCode: occurrences === 1
                ? `${oldCode.slice(0, matchOffset)}${options.replace}${oldCode.slice(matchOffset + options.find.length)}`
                : oldCode,
            status: 'ready',
            reason: '',
        };
        if (occurrences > 1) {
            next.status = 'ambiguous';
            next.reason = 'Current fragment occurs more than once in this code.';
        } else if (next.newCode.length > 50) {
            next.status = 'invalid';
            next.reason = 'Resulting curriculum code exceeds 50 characters.';
        }
        previewRows.push(next);
        if (next.status === 'ready') proposedById.set(next.id, next);
    }

    const finalGroups = new Map();
    for (const row of rows) {
        if (Number.parseInt(row.Year, 10) !== options.year) continue;
        const proposal = proposedById.get(String(row.id));
        const key = curriculumKey(row, proposal ? proposal.newCode : row.CurriculumCode);
        if (!finalGroups.has(key)) finalGroups.set(key, []);
        finalGroups.get(key).push(String(row.id));
    }
    for (const item of previewRows) {
        if (item.status !== 'ready') continue;
        if ((finalGroups.get(curriculumKey(item, item.newCode)) || []).length > 1) {
            item.status = 'conflict';
            item.reason = 'Resulting code already exists in the same year and department.';
            proposedById.delete(item.id);
        }
    }

    const count = status => previewRows.filter(row => row.status === status).length;
    return {
        scope: options,
        scopeCount: scopedRows.length,
        matchedCount: previewRows.length,
        readyCount: count('ready'),
        conflictCount: count('conflict'),
        ambiguousCount: count('ambiguous'),
        invalidCount: count('invalid'),
        rows: previewRows,
    };
}

module.exports = { normalizeBulkCodeOptions, buildBulkCodePreview, canonicalBulkCodeChanges };
