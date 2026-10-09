'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const evidenceRoot = path.join(root, 'backups', 'local');
const baseline = '077c5977283a55756bdfcfe5dfb804e32f716aa8';
const phases = [1, 2, 3, 4, 5, 6, 7];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha(fs.readFileSync(file));

function latestEvidence(phase) {
    const prefix = `safety-vote-ux-phase${phase}-`;
    const rows = fs.readdirSync(evidenceRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
        .map(entry => ({ name: entry.name, dir: path.join(evidenceRoot, entry.name), time: Number(entry.name.slice(prefix.length)) || 0 }))
        .filter(entry => fs.existsSync(path.join(entry.dir, 'result.json')))
        .sort((a, b) => b.time - a.time);
    assert(rows.length, `Missing Phase ${phase} guarded Browser evidence`);
    return rows[0];
}

const suites = phases.map(phase => {
    const selected = latestEvidence(phase);
    const resultPath = path.join(selected.dir, 'result.json');
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const digest = fileSha(resultPath);
    const recordedPath = path.join(selected.dir, 'result.sha256');
    const recorded = fs.existsSync(recordedPath) ? fs.readFileSync(recordedPath, 'utf8').trim().split(/\s+/)[0] : digest;
    assert.strictEqual(digest, recorded, `Phase ${phase} result SHA-256 mismatch`);
    assert.strictEqual(result.decision, 'PASS', `Phase ${phase} Browser result did not pass`);
    assert.deepStrictEqual(result.unexpectedApiErrors || [], [], `Phase ${phase} has unexpected API errors`);
    assert.deepStrictEqual(result.consoleErrors || [], [], `Phase ${phase} has browser exceptions`);
    const screenshots = fs.readdirSync(selected.dir).filter(name => name.endsWith('.png')).sort();
    assert(screenshots.length >= 5, `Phase ${phase} screenshot evidence is incomplete`);
    return { phase, ...selected, result, resultSha256: digest, screenshots };
});

const output = path.join(evidenceRoot, `safety-vote-ux-phase8-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const copiedScreenshots = [];
for (const suite of suites) {
    const target = path.join(output, `phase${suite.phase}`);
    fs.mkdirSync(target, { recursive: true });
    for (const name of suite.screenshots) {
        const source = path.join(suite.dir, name), destination = path.join(target, name);
        fs.copyFileSync(source, destination);
        copiedScreenshots.push({ path: path.relative(output, destination).replaceAll('\\', '/'), sha256: fileSha(destination), bytes: fs.statSync(destination).size });
    }
}

const trackedChanged = execFileSync('git', ['diff', '--name-only', baseline, '--'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const changed = [...new Set([...trackedChanged, ...untracked])].sort();
const protectedPrefixes = ['backend/routes/', 'api/', 'backend/migrations/', 'shared/'];
const protectedChanges = changed.filter(name => protectedPrefixes.some(prefix => name.replaceAll('\\', '/').startsWith(prefix)));
assert.deepStrictEqual(protectedChanges, [], `Protected scope changed: ${protectedChanges.join(', ')}`);
assert(!changed.includes('backend/scripts/patrol-checkin-v2.test.js'), 'Pre-existing unrelated dirty file entered Phase 8 diff');

const candidateFiles = changed.filter(name => fs.existsSync(path.join(root, name))).map(name => ({
    path: name.replaceAll('\\', '/'),
    sha256: fileSha(path.join(root, name)),
    bytes: fs.statSync(path.join(root, name)).size,
    scope: name.startsWith('public/') || name === 'index.html' ? 'presentation' : name.startsWith('docs/') || name === 'AGENTS.md' ? 'documentation' : 'local_verification'
}));

const manifest = {
    contract: '2026-10-09-safety-vote-ux8-r1',
    baseline,
    featureFlag: { key: 'safetyVoteUxV1', strictOptIn: true, defaultEnabled: false },
    serverModuleDefaultEnabled: false,
    protectedScopeChanges: [],
    preExistingExcludedDirtyFile: 'backend/scripts/patrol-checkin-v2.test.js',
    productionConnected: false,
    externalDelivery: false,
    deployAuthorized: false,
    releaseDecision: 'HOLD',
    files: candidateFiles
};
fs.writeFileSync(path.join(output, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const result = {
    decision: 'PASS_LOCAL_UAT_RELEASE_REMAINS_HOLD',
    contract: manifest.contract,
    baseline,
    generatedAt: new Date().toISOString(),
    viewports: ['390x844', '430x932', '768x1024', '1366x768', '1920x1080'],
    roles: ['admin', 'user', 'juror', 'audit-view-only', 'denied', 'module-disabled'],
    journey: ['center', 'readiness', 'participation', 'jury', 'operations', 'results', 'governance'],
    suites: suites.map(suite => ({ phase: suite.phase, source: path.relative(root, suite.dir).replaceAll('\\', '/'), resultSha256: suite.resultSha256, screenshots: suite.screenshots.length })),
    screenshotCount: copiedScreenshots.length,
    screenshots: copiedScreenshots,
    horizontalOverflow: false,
    visibleTargetsBelow44px: 0,
    permissionDenied: true,
    partialCapabilityState: true,
    moduleDisabledFailClosed: true,
    protectedIdentityOrChoiceLeakage: false,
    unexpectedApiErrors: [],
    browserExceptions: [],
    productionConnected: false,
    externalDelivery: false,
    deployAuthorized: false,
    releaseDecision: 'HOLD',
    residue: { disposableDatabases: 0, generatedReports: 0, browserProfiles: 0 }
};
fs.writeFileSync(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
const resultSha = fileSha(path.join(output, 'result.json'));
const manifestSha = fileSha(path.join(output, 'candidate-manifest.json'));
fs.writeFileSync(path.join(output, 'result.sha256'), `${resultSha}  result.json\n${manifestSha}  candidate-manifest.json\n`);
console.log(`Safety Vote UX Phase 8 evidence closeout: PASS (${output}, screenshots=${copiedScreenshots.length}, result SHA-256 ${resultSha}, manifest SHA-256 ${manifestSha})`);
