'use strict';

const MAX_PAGE = 1000000;

function boundedInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function clean(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function dateFilter(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? text
        : null;
}

function parseTrainingLogQuery(query = {}, { admin = false, ownDepartment = '' } = {}) {
    const paged = String(query.paged ?? '') === '1';
    const page = boundedInteger(query.page, 1, 1, MAX_PAGE);
    const pageSize = boundedInteger(query.pageSize ?? query.limit, paged ? 20 : 100, 1, paged ? 100 : 300);
    const rawYear = String(query.year ?? '').trim();
    const year = rawYear === '' ? null : Number.parseInt(rawYear, 10);
    const dateFrom = dateFilter(query.dateFrom);
    const dateTo = dateFilter(query.dateTo);
    if ((rawYear && (!Number.isInteger(year) || year < 2000 || year > 2100))
        || dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) {
        const error = new Error('Invalid Training Matrix log filter.');
        error.statusCode = 400;
        throw error;
    }
    const requestedDepartment = clean(query.department ?? query.dept, 100);
    const department = admin
        ? (requestedDepartment && requestedDepartment !== 'all' ? requestedDepartment : '')
        : clean(ownDepartment, 100);
    return {
        paged,
        page,
        pageSize,
        curriculumId: clean(query.curriculumId, 36),
        courseId: clean(query.courseId, 36),
        employeeId: clean(query.employeeId, 50),
        action: clean(query.action, 50).toUpperCase().replace(/[^A-Z0-9_]/g, ''),
        actorId: clean(query.actorId ?? query.performedById, 50),
        department,
        unit: clean(query.unit, 100),
        year,
        dateFrom,
        dateTo,
        q: clean(query.q, 120),
    };
}

function trainingLogPagination(totalValue, requestedPage, pageSize) {
    const total = Math.max(0, Number(totalValue) || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    return {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
    };
}

module.exports = { parseTrainingLogQuery, trainingLogPagination };
