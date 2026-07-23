'use strict';

const {
    ONBOARDING_STATUS,
    resolveEmployeeOnboarding,
} = require('../utils/onboarding-resolver');

const ALLOWED_REQUESTS = Object.freeze({
    [ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED]: new Set([
        'POST /change-password',
        'POST /session/verify',
        'GET /onboarding/status',
    ]),
    [ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED]: new Set([
        'POST /change-password',
        'POST /session/verify',
        'GET /onboarding/status',
        'PUT /profile/safety-unit',
    ]),
});

function canonicalOnboardingPath(value) {
    let path = String(value || '').split('?')[0].trim();
    if (!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+/g, '/').replace(/^\/api(?=\/|$)/i, '') || '/';
    if (path.length > 1) path = path.replace(/\/$/, '');
    return path;
}

function onboardingRequestKey(method, path) {
    return `${String(method || 'GET').toUpperCase()} ${canonicalOnboardingPath(path)}`;
}

function onboardingUnavailableResponse() {
    return {
        httpStatus: 503,
        payload: {
            success: false,
            code: 'ONBOARDING_STATE_UNAVAILABLE',
            message: 'Unable to verify onboarding state.',
        },
    };
}

function onboardingBlock(status, method, path) {
    if (status === ONBOARDING_STATUS.READY) return null;
    const allowed = ALLOWED_REQUESTS[status];
    if (!allowed) return onboardingUnavailableResponse();
    if (allowed.has(onboardingRequestKey(method, path))) return null;

    return {
        httpStatus: 428,
        payload: {
            success: false,
            code: status,
            onboardingStatus: status,
            message: status === ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED
                ? 'Password change is required before using the system.'
                : 'Safety Unit selection is required before using the system.',
        },
    };
}

function createOnboardingEnforcement({ queryable, resolveStatus = resolveEmployeeOnboarding }) {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Onboarding enforcement requires a database query interface.');
    }

    return async function enforceOnboarding(req, res, next) {
        const employeeId = String(req.user?.id ?? req.user?.EmployeeID ?? '').trim();
        if (!employeeId) {
            const unavailable = onboardingUnavailableResponse();
            return res.status(unavailable.httpStatus).json(unavailable.payload);
        }

        try {
            const status = await resolveStatus(queryable, employeeId);
            req.onboardingStatus = status;
            const block = onboardingBlock(status, req.method, req.originalUrl || req.path);
            if (block) return res.status(block.httpStatus).json(block.payload);
            return next();
        } catch (error) {
            console.warn('[onboarding] state resolution failed:', error?.code || error?.message || error);
            const unavailable = onboardingUnavailableResponse();
            return res.status(unavailable.httpStatus).json(unavailable.payload);
        }
    };
}

module.exports = {
    ALLOWED_REQUESTS,
    canonicalOnboardingPath,
    onboardingRequestKey,
    onboardingBlock,
    onboardingUnavailableResponse,
    createOnboardingEnforcement,
};
