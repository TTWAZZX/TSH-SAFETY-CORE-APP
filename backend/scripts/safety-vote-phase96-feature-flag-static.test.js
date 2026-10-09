'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const component = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'safety-vote-ux-components.js'), 'utf8');

const flagAssignment = index.indexOf('safetyVoteUxV1: true');
const mainModule = index.indexOf('<script type="module" src="public/js/main.js?v=20261009-safety-vote-ux8-r1"></script>');

assert(flagAssignment >= 0, 'Production shell must enable safetyVoteUxV1 explicitly');
assert(mainModule > flagAssignment, 'Feature flag must be assigned before main.js evaluates');
assert(index.includes('public/style.css?v=20261009-safety-vote-ux8-r1'), 'Accepted Phase 8 CSS cache key changed unexpectedly');
assert(component.includes('safetyVoteUxV1 === true'), 'Safety Vote UX must remain strict opt-in');
assert(!index.includes('phase7_integrations_enabled'), 'Client shell must not alter the server integration gate');
assert(!index.includes('module_enabled'), 'Client shell must not alter the server module gate');

process.stdout.write(`${JSON.stringify({
  decision: 'PASS_PHASE96_FEATURE_FLAG_STATIC',
  checks: {
    explicitTrue: true,
    assignedBeforeMainModule: true,
    acceptedCacheChainPreserved: true,
    strictOptInPreserved: true,
    serverGatesUntouched: true
  }
}, null, 2)}\n`);
