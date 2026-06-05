const COMPANY_EMAIL_DOMAIN = '@thaisummit-harness.co.th';

function normalizeCompanyEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return email || null;
}

function validateCompanyEmail(value) {
    const email = normalizeCompanyEmail(value);
    if (!email) return { ok: true, email: null };
    const re = /^[^\s@]+@thaisummit-harness\.co\.th$/i;
    if (!re.test(email)) {
        return {
            ok: false,
            email,
            message: `CompanyEmail must use ${COMPANY_EMAIL_DOMAIN}`,
        };
    }
    return { ok: true, email };
}

let ensurePromise = null;
async function ensureEmployeeCompanyEmailColumn(db) {
    if (!ensurePromise) {
        ensurePromise = (async () => {
            await db.query('ALTER TABLE Employees ADD COLUMN CompanyEmail VARCHAR(150) DEFAULT NULL AFTER Position').catch(() => {});
            await db.query('ALTER TABLE Employees ADD INDEX idx_employees_company_email (CompanyEmail)').catch(() => {});
        })();
    }
    return ensurePromise;
}

module.exports = {
    COMPANY_EMAIL_DOMAIN,
    normalizeCompanyEmail,
    validateCompanyEmail,
    ensureEmployeeCompanyEmailColumn,
};
