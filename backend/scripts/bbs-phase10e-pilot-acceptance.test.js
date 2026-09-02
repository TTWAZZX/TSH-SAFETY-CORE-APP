'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const audit = fs.readFileSync(path.join(root, 'backend/scripts/bbs-phase10e-pilot-acceptance-audit.js'), 'utf8');
const deployment = fs.readFileSync(path.join(root, 'DEPLOYMENT.md'), 'utf8');

for (const token of [
    'staged_admin_only', 'pilot_scope_only', 'STAGED_ADMIN_ONLY_SETTING_MISSING', 'PILOT_SCOPE_ONLY_SETTING_MISSING', 'NO_OPERATOR', 'NO_ACTIVE_INSPECTOR_ENROLLMENT', 'NO_ACTIVE_ASSIGNMENT',
    'BATCH_PILOT_REQUIRES_TWO_ACTIVE_ASSIGNMENTS', 'NO_ACTIVE_INSPECTOR_SCHEDULE', 'NO_APPLICABLE_PUBLISHED_CHECKLIST',
    'NO_ACTIVE_PERSONAL_CARD_TEMPLATE', 'NO_ACTIVE_DEPARTMENT_CARD_TEMPLATE',
    'NO_ACTIVE_DEPARTMENT_QR', 'NO_ACTIVE_COMMUNITY_HANDLER',
    'NO_SUBMITTED_SINGLE_OBSERVATION', 'NO_SUBMITTED_BATCH_OBSERVATION',
    'NO_COMMUNITY_GOOD_ACCEPTANCE', 'NO_COMMUNITY_RISK_ACTION_ACCEPTANCE',
    'UnsafeMissingAction', 'FailedEmails', 'READY_FOR_ROLLOUT_REVIEW',
]) assert.ok(audit.includes(token), `Phase 10E gate is missing ${token}`);

assert.doesNotMatch(audit, /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|TRUNCATE)\s+/i, 'Phase 10E acceptance audit must remain SELECT-only');
assert.ok(audit.includes("rolloutMode === 'COMPANY_WIDE'"), 'Company-wide mode must remain blocked before rollout approval');
assert.ok(audit.includes('rolloutChanged: false'), 'Audit must state that it does not open rollout');
assert.match(deployment, /staged_admin_only=1/, 'Deployment runbook must preserve the staged rollout gate');
assert.match(deployment, /business owner[\s\S]{0,80}approv[\s\S]{0,80}ordinary-user rollout/i, 'Deployment runbook must require explicit rollout approval');

console.log('BBS Phase 10E Pilot acceptance and rollout gate contract: PASS');
