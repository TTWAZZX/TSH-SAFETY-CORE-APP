'use strict';

const ADMIN_ON_BEHALF_LABEL = 'ผู้ดูแลระบบตอบแทนหน่วยงาน';

function isAdminRole(role) {
    return ['admin', 'super_admin'].includes(String(role || '').trim().toLowerCase());
}

function responseForViewer(row, canSeeActor) {
    const submittedByAdmin = isAdminRole(row?.SubmitterRole);
    const result = {
        ...row,
        SubmittedByAdmin: submittedByAdmin ? 1 : 0,
        ResponderDisplayName: row?.EmployeeName || row?.EmployeeID || '-',
    };
    delete result.SubmitterRole;
    if (!canSeeActor && submittedByAdmin) {
        result.EmployeeID = null;
        result.EmployeeName = ADMIN_ON_BEHALF_LABEL;
        result.ResponderDisplayName = ADMIN_ON_BEHALF_LABEL;
    }
    return result;
}

module.exports = {
    ADMIN_ON_BEHALF_LABEL,
    isAdminRole,
    responseForViewer,
};
