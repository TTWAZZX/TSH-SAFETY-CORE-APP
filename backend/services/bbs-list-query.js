'use strict';

const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

function listQuery(query = {}, options = {}) {
    const defaultPageSize = positiveInt(options.defaultPageSize) || 20;
    const maxPageSize = positiveInt(options.maxPageSize) || 100;
    const page = positiveInt(query.page) || 1;
    const requestedSize = positiveInt(query.pageSize) || defaultPageSize;
    const pageSize = Math.min(requestedSize, maxPageSize);
    const paged = String(query.paged || '') === '1';
    return { paged, page, pageSize, offset: (page - 1) * pageSize };
}

function pagination(total, page, pageSize) {
    const count = Math.max(0, Number(total) || 0);
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    return {
        page: currentPage,
        pageSize,
        total: count,
        totalPages,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
    };
}

function searchText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

module.exports = { listQuery, pagination, searchText };
