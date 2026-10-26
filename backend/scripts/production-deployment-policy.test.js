'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    activeProductionDeployScripts,
    archivedProductionDeployScripts,
} = require('./production-deployment-policy');

const scriptsRoot = __dirname;
const discovered = fs.readdirSync(scriptsRoot)
    .filter(name => name.endsWith('deploy.js'))
    .sort();
const governed = [...activeProductionDeployScripts, ...archivedProductionDeployScripts].sort();

assert.deepStrictEqual(governed, discovered, 'Every Production deploy script must be classified exactly once');
assert.equal(new Set(governed).size, governed.length, 'Production deploy classifications must not overlap');

for (const name of archivedProductionDeployScripts) {
    const source = fs.readFileSync(path.join(scriptsRoot, name), 'utf8');
    assert.match(
        source,
        /require\(['"]\.\/production-deployment-policy['"]\)\.refuseArchivedProductionDeploy\(__filename\);/,
        `${name} must fail closed through the central archival policy`
    );
    const probe = spawnSync(process.execPath, [path.join(scriptsRoot, name)], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH || '' },
    });
    assert.notEqual(probe.status, 0, `${name} must not be executable`);
    assert.match(`${probe.stdout}\n${probe.stderr}`, /ARCHIVED_PRODUCTION_DEPLOYMENT/, `${name} must explain the refusal`);
}

const phase7 = fs.readFileSync(path.join(scriptsRoot, 'safety-vote-phase7-production-deploy.js'), 'utf8');
assert.match(phase7, /expandRuntimeClosure\(/, 'Current full release workflow must expand dependency closure');

console.log(`Production deployment policy: PASS (${activeProductionDeployScripts.length} active, ${archivedProductionDeployScripts.length} archived fail-closed)`);
