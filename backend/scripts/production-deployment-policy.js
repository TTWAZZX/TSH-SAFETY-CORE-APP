'use strict';

const path = require('node:path');

const activeProductionDeployScripts = Object.freeze([
    'bbs-access-discovery-production-deploy.js',
    'patrol-self-checkin-mode-production-deploy.js',
    'safety-vote-phase7-production-deploy.js',
    'safety-vote-mobile-density-production-deploy.js',
    'safety-vote-eligibility-freeze-race-production-deploy.js',
    'safety-vote-jury-assignment-access-production-deploy.js',
    'safety-vote-company-promotion-visibility-production-deploy.js',
    'safety-vote-live-topn-production-deploy.js',
    'safety-vote-phase96-guarded-feature-deploy.js',
    'safety-vote-wizard-layout-production-deploy.js',
    'safety-vote-workflow-observation-production-deploy.js',
]);

const archivedProductionDeployScripts = Object.freeze([
    'app-bootstrap-production-deploy.js',
    'app-compact-safety-vote-production-deploy.js',
    'file-library-production-deploy.js',
    'registration-first-login-production-deploy.js',
    'safety-vote-account-advisory-production-deploy.js',
    'safety-vote-eligibility-amendments-production-deploy.js',
    'safety-vote-gallery-choice-production-deploy.js',
    'safety-vote-independent-banner-production-deploy.js',
    'safety-vote-live-promotion-production-deploy.js',
    'safety-vote-open-feedback-production-deploy.js',
    'safety-vote-option-image-production-deploy.js',
    'safety-vote-phase104-production-deploy.js',
    'safety-vote-phase95a-guarded-runtime-deploy.js',
    'safety-vote-phase96-admin-target-production-deploy.js',
    'safety-vote-phase96-mime-production-deploy.js',
    'safety-vote-preview-gallery-production-deploy.js',
    'safety-vote-promotion-image-ux-production-deploy.js',
    'safety-vote-public-discovery-preview-production-deploy.js',
    'safety-vote-response-media-first-login-production-deploy.js',
    'safety-vote-seven-plan-production-deploy.js',
    'safety-vote-thai-time-production-deploy.js',
]);

function refuseArchivedProductionDeploy(filename) {
    const script = path.basename(filename);
    if (!archivedProductionDeployScripts.includes(script)) {
        throw new Error(`Production deployment policy does not classify ${script} as archived`);
    }
    const error = new Error(
        `[ARCHIVED_PRODUCTION_DEPLOYMENT] ${script} is historical evidence and cannot execute. `
        + 'Prepare a new immutable release using the current dependency manifest and an active guarded deploy workflow.'
    );
    error.code = 'ARCHIVED_PRODUCTION_DEPLOYMENT';
    throw error;
}

module.exports = {
    activeProductionDeployScripts,
    archivedProductionDeployScripts,
    refuseArchivedProductionDeploy,
};
