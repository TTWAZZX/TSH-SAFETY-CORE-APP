'use strict';

const { authenticateToken, isAdmin } = require('../middleware/auth');

const BBS_ROLLOUT_MODE = Object.freeze({
    ADMIN_ONLY: 'admin_only',
    CONTROLLED_PILOT: 'controlled_pilot',
    COMPANY_WIDE: 'company_wide',
});

function employeeIdFromUser(user = {}) {
    return String(user.id || user.EmployeeID || user.employeeId || '').trim();
}

function isAdminUser(user = {}) {
    return String(user.role || user.Role || '').trim().toLowerCase() === 'admin';
}

function resolveBbsRolloutMode(settings = {}) {
    if (String(settings.staged_admin_only || '0') === '1') return BBS_ROLLOUT_MODE.ADMIN_ONLY;
    if (String(settings.pilot_scope_only || '0') === '1') return BBS_ROLLOUT_MODE.CONTROLLED_PILOT;
    return BBS_ROLLOUT_MODE.COMPANY_WIDE;
}

async function loadBbsRolloutMode(db) {
    try {
        const [rows] = await db.query(
            `SELECT SettingKey,SettingValue
               FROM BBS_Settings
              WHERE SettingKey IN ('staged_admin_only','pilot_scope_only')`
        );
        const settings = Object.fromEntries(rows.map(row => [String(row.SettingKey), String(row.SettingValue)]));
        return { mode: resolveBbsRolloutMode(settings), settings };
    } catch (error) {
        if (error?.code === 'ER_NO_SUCH_TABLE') {
            return { mode: BBS_ROLLOUT_MODE.COMPANY_WIDE, settings: {} };
        }
        throw error;
    }
}

async function isEffectivePilotParticipant(db, employeeId, asOf = new Date().toISOString().slice(0, 10)) {
    const normalizedEmployeeId = String(employeeId || '').trim();
    if (!normalizedEmployeeId) return false;

    const [rows] = await db.query(
        `SELECT 1
           FROM BBS_Pilot_Scopes p
          WHERE p.IsActive=1
            AND p.EffectiveFrom<=?
            AND COALESCE(p.EffectiveTo,'9999-12-31')>=?
            AND (
                EXISTS (
                    SELECT 1
                      FROM BBS_Inspector_Enrollments e
                     WHERE e.InspectorEmployeeID=?
                       AND e.DepartmentID=p.DepartmentID
                       AND e.SafetyUnitID=p.SafetyUnitID
                       AND e.Status='Active'
                       AND e.IsActive=1
                       AND e.EffectiveFrom<=?
                       AND COALESCE(e.EffectiveTo,'9999-12-31')>=?
                )
                OR EXISTS (
                    SELECT 1
                      FROM BBS_Hierarchy_Assignments a
                     WHERE a.MemberEmployeeID=?
                       AND a.DepartmentID=p.DepartmentID
                       AND a.SafetyUnitID=p.SafetyUnitID
                       AND a.IsActive=1
                       AND a.EffectiveFrom<=?
                       AND COALESCE(a.EffectiveTo,'9999-12-31')>=?
                )
            )
          LIMIT 1`,
        [asOf, asOf, normalizedEmployeeId, asOf, asOf, normalizedEmployeeId, asOf, asOf]
    );
    return rows.length > 0;
}

function createBbsRolloutAccessMiddleware(db, dependencies = {}) {
    const authenticate = dependencies.authenticateToken || authenticateToken;
    const requireAdmin = dependencies.isAdmin || isAdmin;
    const participantCheck = dependencies.isEffectivePilotParticipant || isEffectivePilotParticipant;
    return async function bbsRolloutAccess(req, res, next) {
        try {
            const rollout = await loadBbsRolloutMode(db);
            req.bbsRolloutMode = rollout.mode;

            if (rollout.mode === BBS_ROLLOUT_MODE.COMPANY_WIDE) return next();

            const headerValue = rollout.mode === BBS_ROLLOUT_MODE.ADMIN_ONLY
                ? 'staged-admin-only'
                : 'controlled-pilot';
            res.setHeader('X-BBS-Rollout-Mode', headerValue);

            return authenticate(req, res, () => {
                if (rollout.mode === BBS_ROLLOUT_MODE.ADMIN_ONLY) {
                    return requireAdmin(req, res, next);
                }
                if (isAdminUser(req.user)) return next();
                return participantCheck(db, employeeIdFromUser(req.user))
                    .then(permitted => {
                        if (permitted) return next();
                        return res.status(403).json({
                            success: false,
                            code: 'BBS_PILOT_ACCESS_REQUIRED',
                            message: 'BBS Smart Card is currently available only to approved Pilot participants.',
                        });
                    })
                    .catch(next);
            });
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = {
    BBS_ROLLOUT_MODE,
    resolveBbsRolloutMode,
    loadBbsRolloutMode,
    isEffectivePilotParticipant,
    createBbsRolloutAccessMiddleware,
};
