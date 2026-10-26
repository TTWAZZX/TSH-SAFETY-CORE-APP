'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    projectRoot,
    protectedEnvironmentFiles,
    expandRuntimeClosure,
    missingRuntimeDependencies,
    dependencyManifest,
} = require('./production-dependency-closure');

const php = expandRuntimeClosure(['api/index.php']);
for (const required of [
    'api/config.php', 'api/bootstrap.php', 'api/mailer.php',
    'api/handlers/branding.php', 'api/handlers/johnny_ai.php',
    'api/handlers/safety_vote.php', 'api/handlers/workflow_phase6.php',
    'api/lib/safety_vote_workflow_profile.php',
]) assert.ok(php.includes(required), `PHP entry closure is missing ${required}`);

for (const protectedPath of protectedEnvironmentFiles) {
    assert.ok(!php.includes(protectedPath), `Protected environment file must not enter deployment closure: ${protectedPath}`);
}

const frontend = expandRuntimeClosure(['index.html']);
for (const required of ['public/style.css', 'public/js/main.js', 'public/js/api.js', 'public/js/pages/admin.js', 'public/js/pages/safety-vote.js']) {
    assert.ok(frontend.includes(required), `Frontend entry closure is missing ${required}`);
}

const incomplete = missingRuntimeDependencies(['api/index.php']);
assert.ok(incomplete.includes('api/bootstrap.php'), 'Partial PHP entry deployment must be rejected');
assert.ok(incomplete.includes('api/handlers/branding.php'), 'Transitive handler omission must be rejected');
assert.deepStrictEqual(missingRuntimeDependencies(php), [], 'Expanded PHP closure must be complete');
assert.deepStrictEqual(missingRuntimeDependencies(frontend), [], 'Expanded frontend closure must be complete');

const checkedIn = JSON.parse(fs.readFileSync(path.join(projectRoot, 'production-dependency-manifest.json'), 'utf8'));
assert.deepStrictEqual(checkedIn, dependencyManifest(), 'Checked-in Production dependency manifest is stale');

const latestDeploy = fs.readFileSync(path.join(projectRoot, 'backend', 'scripts', 'safety-vote-phase7-production-deploy.js'), 'utf8');
assert.match(latestDeploy, /expandRuntimeClosure\(/, 'Latest Production deploy must expand dependency closure before upload');

console.log(`Project-wide Production dependency closure: PASS (PHP ${php.length}, frontend ${frontend.length})`);
