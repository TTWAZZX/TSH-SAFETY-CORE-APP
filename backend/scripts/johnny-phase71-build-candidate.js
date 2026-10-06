'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const outputRoot = path.join(root, 'output');
const candidateRoot = path.join(outputRoot, 'johnny-ai-phase7.1-release-candidate');
if (!candidateRoot.startsWith(outputRoot + path.sep)) throw new Error('Unsafe candidate output path');
const approvalRequested = process.argv.includes('--approved');
const approvalConfirmed = process.env.JOHNNY_RELEASE_APPROVAL === 'PRODUCTION_DEPLOYMENT_APPROVED';

const runtimeFiles = [
    '.htaccess', 'index.html', 'public/style.css', 'public/js/main.js',
    'public/js/pages/johnny-ai.js', 'public/js/johnny-drawer.js',
    'api/config.php', 'api/handlers/johnny_ai.php',
    'api/lib/johnny_quality_feedback.php', 'api/lib/johnny_system_usage.php',
    'api/lib/johnny_workflow_actions.php',
    'shared/johnny-answer-feedback.json', 'shared/johnny-system-usage-knowledge.json',
];
const operationsFiles = [
    'backend/migrations/20261006_johnny_phase7_schema.sql',
    'backend/migrations/20261006_johnny_phase7_schema.rollback.sql',
    'api/config.production.example.php',
    'backend/scripts/johnny-phase7-config-preflight.php',
    'backend/scripts/johnny-phase7-config-preflight-runner.js',
    'backend/scripts/johnny-retention-maintenance.js',
    'backend/scripts/johnny-phase7-php74-verify.js',
];

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const copySet = (files, directory) => files.map(relative => {
    const source = path.join(root, relative);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Candidate input missing: ${relative}`);
    const data = fs.readFileSync(source);
    const destination = path.join(candidateRoot, directory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    return { path: relative.replace(/\\/g, '/'), bytes: data.length, sha256: sha256(data) };
});

fs.rmSync(candidateRoot, { recursive: true, force: true });
fs.mkdirSync(candidateRoot, { recursive: true });
const runtime = copySet(runtimeFiles, 'runtime');
const operations = copySet(operationsFiles, 'operations');
const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const workingTreeClean = status.trim() === '';
if (approvalRequested && !approvalConfirmed) {
    throw new Error('Approved candidate requires JOHNNY_RELEASE_APPROVAL=PRODUCTION_DEPLOYMENT_APPROVED');
}
if (approvalRequested && !workingTreeClean) {
    throw new Error('Approved candidate requires a clean immutable working tree');
}
const approved = approvalRequested && approvalConfirmed && workingTreeClean;
const manifest = {
    schemaVersion: 2,
    name: 'Johnny AI Phase 7.1 clean staged release candidate',
    status: approved ? 'READY_FOR_APPROVED_PRODUCTION_DEPLOYMENT' : 'HOLD_PRODUCTION_PREFLIGHT_AND_IMMUTABLE_COMMIT_REQUIRED',
    deploymentApproved: approved,
    productionDeployForbidden: !approved,
    generatedAt: new Date().toISOString(),
    source: {
        branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        workingTreeClean,
    },
    runtime,
    operations,
    excludedPatterns: ['.env', 'api/config.local.php', 'backups/', 'uploads/', 'backend/uploads/', 'node_modules/'],
    remainingGates: approved ? [] : [
        'authorized Production configuration preflight with values suppressed',
        'read-only Production runtime/schema/drift and KB inventory',
        'verified predeploy runtime/database/KB backup',
        'clean immutable scoped release commit and regenerated hashes',
    ],
};
fs.writeFileSync(path.join(candidateRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const packaged = [...runtime, ...operations];
for (const file of packaged) {
    if (/\.env$/i.test(file.path) || /config\.local\.php$/i.test(file.path)) throw new Error(`Secret-bearing path entered candidate: ${file.path}`);
}
console.log(JSON.stringify({
    success: true,
    candidateRoot,
    status: manifest.status,
    runtimeFiles: runtime.length,
    operationsFiles: operations.length,
    workingTreeClean: manifest.source.workingTreeClean,
    deploymentApproved: manifest.deploymentApproved,
}, null, 2));
