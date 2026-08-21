'use strict';

function cleanEmployeeId(value) {
    return String(value || '').trim().slice(0, 50);
}

function normalizeCompanyEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@thaisummit-harness\.co\.th$/i.test(email) ? email : null;
}

function selectResponsibleEmployeeId({ isAdmin, requestedEmployeeId, actorEmployeeId }) {
    const actorId = cleanEmployeeId(actorEmployeeId);
    const requestedId = cleanEmployeeId(requestedEmployeeId);
    const selectedId = isAdmin && requestedId ? requestedId : actorId;
    if (!selectedId) throw new Error('Responsible employee is required.');
    return selectedId;
}

function uniqueNoticeRecipients(values = []) {
    const recipients = [];
    const seen = new Set();
    for (const raw of values.flatMap(value => String(value || '').split(','))) {
        const email = normalizeCompanyEmail(raw);
        const key = email?.toLowerCase();
        if (!email || seen.has(key)) continue;
        seen.add(key);
        recipients.push(email);
    }
    return recipients;
}

function noticeDepartmentMismatch(noticeDepartment, responsibleDepartment) {
    const notice = String(noticeDepartment || '').trim().toLocaleLowerCase();
    const responsible = String(responsibleDepartment || '').trim().toLocaleLowerCase();
    return Boolean(notice && responsible && notice !== responsible);
}

module.exports = {
    cleanEmployeeId,
    normalizeCompanyEmail,
    selectResponsibleEmployeeId,
    uniqueNoticeRecipients,
    noticeDepartmentMismatch,
};
