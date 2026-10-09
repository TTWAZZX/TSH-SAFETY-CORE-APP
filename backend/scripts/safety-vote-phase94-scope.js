'use strict';

const phase8 = require('./safety-vote-phase8-scope');

const uxRuntime = [
  'public/js/pages/admin-safety-vote-ux1.js',
  'public/js/pages/admin-safety-vote-operations.js',
  'public/js/pages/admin-safety-vote-results.js',
  'public/js/pages/admin-safety-vote-governance.js',
  'public/js/pages/safety-vote-campaign-wizard.js',
  'public/js/pages/safety-vote-jury-workspace.js',
  'public/js/pages/safety-vote-page-ux1.js',
  'public/js/pages/safety-vote-ux-components.js',
  'public/js/pages/safety-vote-wizard-model.mjs',
  'public/js/pages/safety-vote-ux-model.mjs',
  'public/js/pages/safety-vote-results-model.mjs',
  'public/js/pages/safety-vote-participation-model.mjs',
  'public/js/pages/safety-vote-operations-model.mjs',
  'public/js/pages/safety-vote-jury-model.mjs',
  'public/js/pages/safety-vote-journey-model.mjs',
  'public/js/pages/safety-vote-governance-model.mjs',
  'public/style.css'
];

const phase94Verification = [
  'backend/scripts/safety-vote-phase91-jury-progress-regression.test.js',
  'backend/scripts/safety-vote-phase92-adversarial-security.test.js',
  'backend/scripts/safety-vote-phase93-rehearsal-regression.test.js',
  'backend/scripts/safety-vote-phase93-runbooks-static.test.js',
  'backend/scripts/safety-vote-phase94-scope.js',
  'backend/scripts/safety-vote-phase94-candidate-manifest.js',
  'backend/scripts/safety-vote-ux-phase1-browser-probe.js',
  'backend/scripts/safety-vote-ux-phase2-browser-probe.js',
  'backend/scripts/safety-vote-ux-phase3-static.test.js',
  'backend/scripts/safety-vote-ux-phase4-static.test.js',
  'backend/scripts/safety-vote-ux-phase5-browser-probe.js',
  'backend/scripts/safety-vote-ux-phase5-static.test.js',
  'backend/scripts/safety-vote-ux-phase6-static.test.js',
  'backend/scripts/safety-vote-ux-phase7-static.test.js',
  'backend/scripts/safety-vote-ux-phase8-evidence.js',
  'backend/scripts/safety-vote-ux-phase8-static.test.js'
];

const documents = [
  'AGENTS.md',
  'docs/safety-vote-ux-phase8-preflight-scope.md',
  'docs/safety-vote-ux-phase8-integrated-journey-accessibility-release-candidate-closeout.md',
  'docs/safety-vote-ux-phase8-candidate-manifest.json',
  'docs/safety-vote-phase91-jury-progress-remediation.md',
  'docs/safety-vote-phase92-security-privacy-hardening.md',
  'docs/safety-vote-phase93-rehearsal-runbook.md',
  'docs/safety-vote-phase93-eligibility-diff-runbook.md',
  'docs/safety-vote-phase93-incident-rollback-runbook.md',
  'docs/safety-vote-phase93-rehearsal-eligibility-diff-operational-runbooks.md',
  'docs/safety-vote-phase94-preflight-scope.md'
];

const unique = values => [...new Set(values)];

module.exports = {
  runtime: unique([...phase8.runtime, ...uxRuntime]),
  migrations: phase8.migrations,
  sourceOnly: unique([...phase8.sourceOnly, ...phase94Verification]),
  documents,
  explicitExclusions: phase8.explicitExclusions
};
