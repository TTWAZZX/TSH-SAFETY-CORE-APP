'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rehearsal = read('docs/safety-vote-phase93-rehearsal-runbook.md');
const eligibility = read('docs/safety-vote-phase93-eligibility-diff-runbook.md');
const incident = read('docs/safety-vote-phase93-incident-rollback-runbook.md');
const node = read('backend/routes/safety-vote.js');
const php = read('api/handlers/safety_vote.php');
const checks = [
    [rehearsal.includes('SAFETY_VOTE_ADMIN') && rehearsal.includes('REHEARSE {CampaignCode}'), 'exact confirmation/permission missing'],
    [rehearsal.includes('businessMutation=false') && rehearsal.includes('externalDelivery=false'), 'zero-mutation boundary missing'],
    [rehearsal.includes('Stop conditions') && rehearsal.includes('HOLD'), 'stop/decision contract missing'],
    [rehearsal.includes('Production credentials') && rehearsal.includes('residue is zero'), 'environment/cleanup rules missing'],
    [eligibility.includes('Added') && eligibility.includes('Removed') && eligibility.includes('Changed') && eligibility.includes('Unchanged'), 'diff taxonomy missing'],
    [eligibility.includes('truncated=true') && eligibility.includes('100'), 'bounded diff rule missing'],
    [eligibility.includes('Never join the diff to ballots') && eligibility.includes('identity-mapping rows remain zero'), 'privacy triage rule missing'],
    [eligibility.includes('Do not edit `SafetyVote_EligibleVoters`'), 'direct database mutation prohibition missing'],
    [incident.includes('SEV-1') && incident.includes('SEV-2') && incident.includes('SEV-3'), 'incident severity missing'],
    [incident.includes('module_enabled=0') && incident.includes('data-preserving disable'), 'containment/rollback missing'],
    [incident.includes('do not issue ad-hoc `DELETE`') && incident.includes('Never use broad recursive deletion'), 'destructive-action guard missing'],
    [incident.includes('separate deployment authorization'), 'Production authorization boundary missing'],
    [node.includes("'/admin/campaigns/:id/rehearsal'") && php.includes("'/safety-vote/admin/campaigns/:id/rehearsal'"), 'Node/PHP rehearsal route missing'],
    [node.includes('eligibilityDiff') && php.includes('sv_eligibility_diff'), 'Node/PHP eligibility diff missing'],
    [node.includes('REHEARSAL_CONFIRMATION_REQUIRED') && php.includes('REHEARSAL_CONFIRMATION_REQUIRED'), 'confirmation parity missing'],
    [node.includes('businessMutation:false') && php.includes("'businessMutation'=>false"), 'mutation flag parity missing'],
    [node.includes('externalDelivery:false') && php.includes("'externalDelivery'=>false"), 'external delivery flag parity missing'],
    [node.includes('business_residue') && php.includes('business_residue'), 'business residue check missing']
];
checks.forEach(([ok, message]) => assert(ok, message));
console.log(`Safety Vote Phase 9.3 operational runbook/static contract: PASS (${checks.length} assertions)`);
