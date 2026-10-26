'use strict';
require('./production-deployment-policy').refuseArchivedProductionDeploy(__filename);

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const confirmation = 'DEPLOY_SAFETY_VOTE_DUPLICATE_MEDIA';
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runtimePaths = [
    'api/handlers/safety_vote.php',
    'index.html',
    'public/js/main.js',
    'public/js/pages/admin-safety-vote-operations.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/admin.js',
    'public/js/pages/safety-vote-live-results.js',
    'public/js/pages/safety-vote-page-ux1.js',
    'public/js/pages/safety-vote.js',
    'public/js/utils/safety-vote-auth-image.js',
];
const publicPaths = runtimePaths.filter(relative => relative === 'index.html' || relative.startsWith('public/'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-duplicate-media-deploy-${stamp}`);
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'));
let mutationStarted = false;
let rollbackFiles = [];

function safeRelative(relative) {
    assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`);
    return relative;
}
function under(base, relative) {
    const resolvedBase = path.resolve(base);
    const target = path.resolve(base, ...safeRelative(relative).split('/'));
    assert(target.startsWith(`${resolvedBase}${path.sep}`), `Escaped guarded root: ${relative}`);
    return target;
}
function run(program, args, { binary = false, timeout = 180000 } = {}) {
    return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}
function git(args, options) {
    const result = run('git', args, options);
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
    return result.stdout;
}
function gitBlob(revision, relative) { return git(['show', `${revision}:${safeRelative(relative)}`], { binary: true }); }
function ftps(action, remotePath, localPath = null) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safeRelative(remotePath)];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args);
    assert.equal(result.status, 0, `FTPS ${action} failed for ${remotePath}: ${String(result.stderr || result.stdout || '').trim()}`);
}
function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    ftps('download', relative, target);
    return { path: relative, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)), firstPath: target };
}
function doubleDownload(relative, label, expectedSha = null) {
    const first = download(relative, under(path.join(evidenceRoot, `${label}-a`), relative));
    const second = download(relative, under(path.join(evidenceRoot, `${label}-b`), relative));
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed checksum mismatch: ${relative}`);
    return { ...first, doubleDownloadMatched: true };
}
async function resolveAuth() {
    if (bearer && bearer.split('.').length === 3) {
        const probe = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, cache: 'no-store' });
        if (probe.status === 200) return { token: bearer, source: 'existing_bearer', loginPerformed: false };
    }
    assert(adminId && adminPassword, 'Production Admin credentials are required when the existing bearer is unavailable');
    const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ employeeId: adminId, password: adminPassword }) });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Production Admin login failed');
    assert(body?.token, 'Production Admin token missing');
    return { token: body.token, source: 'ephemeral_admin_login', loginPerformed: true };
}
async function authenticatedSmoke(auth, requireRecoveredImage) {
    const requests = [];
    for (const route of ['safety-vote/admin/health', 'safety-vote/admin/campaigns', 'safety-vote/me/campaigns']) {
        const response = await fetch(`${baseUrl}/api/index.php?route=${route}&release=${Date.now()}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        const body = await response.json().catch(() => null);
        assert.equal(response.status, 200, `Authenticated smoke failed: ${route}: ${body?.code || ''}`);
        assert.equal(body?.success, true, `Invalid authenticated response: ${route}`);
        assert(/no-store/i.test(response.headers.get('cache-control') || ''), `No-store policy missing: ${route}`);
        requests.push({ route, status: 200, method: 'GET', noStore: true, responseBodyRecorded: false });
    }
    const image = await fetch(`${baseUrl}/api/index.php?route=safety-vote/files/9&release=${Date.now()}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'image/*', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const bytes = Buffer.from(await image.arrayBuffer());
    if (requireRecoveredImage) {
        assert.equal(image.status, 200, 'Private response image recovery smoke failed for file 9');
        assert(/^image\//i.test(image.headers.get('content-type') || ''), 'Recovered private file is not an image');
        assert(bytes.length > 1024, 'Recovered private image is unexpectedly empty');
    } else assert([200, 404].includes(image.status), `Unexpected pre-deploy private image status: ${image.status}`);
    return { requests, privateImage: { fileId: 9, status: image.status, contentType: image.headers.get('content-type'), bytes: image.status === 200 ? bytes.length : 0 }, authenticationSource: auth.source, loginPerformed: auth.loginPerformed, tokenRecorded: false };
}
async function anonymousSmoke() {
    const registration = await fetch(`${baseUrl}/api/index.php?route=register/options&release=${Date.now()}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const registrationBody = await registration.json().catch(() => null);
    assert.equal(registration.status, 200, 'Registration options smoke failed');
    assert.equal(registrationBody?.success, true, 'Registration options response is invalid');
    const protectedRoute = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health&release=${Date.now()}`, { cache: 'no-store' });
    assert.equal(protectedRoute.status, 401, 'Anonymous Safety Vote Admin health must remain denied');
    return { registrationOptions: 200, anonymousSafetyVoteAdminDenied: 401 };
}
function rollback() {
    const restored = [];
    for (const file of [...rollbackFiles].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.beforeSha256, `Rollback checksum changed: ${file.path}`);
        ftps('upload', file.path, file.rollbackPath);
        const verified = doubleDownload(file.path, 'rollback', file.beforeSha256);
        restored.push({ path: file.path, sha256: verified.sha256 });
    }
    return { attempted: true, pass: true, restored };
}
function writeEvidence(name, value) {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const target = path.join(evidenceRoot, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    const digest = fileSha(target);
    fs.writeFileSync(path.join(evidenceRoot, `${name}.sha256`), `${digest}  ${name}\n`);
    return digest;
}

async function main() {
    assert.equal(process.argv[2], '--execute');
    assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);
    const branch = String(git(['branch', '--show-current'])).trim();
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const parent = String(git(['rev-parse', 'HEAD^'])).trim();
    const origin = String(git(['rev-parse', 'origin/main'])).trim();
    const tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
    assert.equal(branch, 'main', 'Production deployment requires main');
    assert.equal(commit, origin, 'Candidate must be pushed to origin/main');
    assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Worktree must be clean');
    fs.mkdirSync(evidenceRoot, { recursive: true });

    const auth = await resolveAuth();
    const smokeBefore = await authenticatedSmoke(auth, false);
    const remoteBefore = [], candidates = [];
    for (const relative of runtimePaths) {
        const beforeBlob = gitBlob(parent, relative), candidateBlob = gitBlob(commit, relative);
        assert.notEqual(sha256(beforeBlob), sha256(candidateBlob), `Runtime path did not change: ${relative}`);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(beforeBlob), `Production drift from parent commit: ${relative}`);
        const rollbackPath = under(path.join(evidenceRoot, 'rollback-package'), relative);
        fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
        fs.copyFileSync(before.firstPath, rollbackPath);
        rollbackFiles.push({ path: relative, rollbackPath, beforeSha256: before.sha256 });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, doubleDownloadMatched: true });
        const candidatePath = under(path.join(evidenceRoot, 'candidate'), relative);
        fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
        fs.writeFileSync(candidatePath, candidateBlob);
        if (relative.endsWith('.php')) assert.equal(run(php, ['-l', candidatePath]).status, 0, `PHP lint failed: ${relative}`);
        candidates.push({ path: relative, candidatePath, bytes: candidateBlob.length, sha256: sha256(candidateBlob) });
    }
    const manifest = { contract: '2026-10-20-safety-vote-duplicate-media-r3', candidate: { commit, tree, parent }, runtimePaths, restoreFiles: rollbackFiles.map(file => ({ path: file.path, bytes: fs.statSync(file.rollbackPath).size, sha256: file.beforeSha256 })), schemaRollbackPolicy: 'No schema mutation.' };
    const manifestPath = path.join(evidenceRoot, 'rollback-package', 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    mutationStarted = true;
    for (const file of candidates) ftps('upload', file.path, file.candidatePath);
    const deployed = candidates.map(file => doubleDownload(file.path, 'deployed', file.sha256));
    const https = [];
    for (const relative of publicPaths) {
        const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        assert.equal(response.status, 200, `HTTPS failed: ${relative}`);
        const body = Buffer.from(await response.arrayBuffer()), expected = candidates.find(item => item.path === relative);
        assert.equal(sha256(body), expected.sha256, `HTTPS checksum mismatch: ${relative}`);
        https.push({ path: relative, status: 200, bytes: body.length, sha256: sha256(body) });
    }
    const smokeAfter = await authenticatedSmoke(auth, true);
    const anonymous = await anonymousSmoke();
    const result = { contract: manifest.contract, generatedAt: new Date().toISOString(), decision: 'PASS_SAFETY_VOTE_DUPLICATE_MEDIA_PRODUCTION_DEPLOYMENT', candidate: { branch, commit, tree, parent, runtimePaths: runtimePaths.length }, remoteBefore, deployment: { uploaded: runtimePaths, doubleDownloadVerified: deployed.length, httpsVerified: https.length }, smokeBefore, smokeAfter, anonymous, rollbackPackage: { files: rollbackFiles.length, manifestSha256: fileSha(manifestPath), verified: true }, posture: { schemaChanged: false, permissionsChanged: false, businessRowsMutated: false, externalDelivery: false }, rollback: { attempted: false } };
    const resultSha256 = writeEvidence('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smokeAfter: result.smokeAfter, anonymous, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
}

main().catch(error => {
    let rollbackResult = { attempted: false };
    if (mutationStarted) {
        try { rollbackResult = rollback(); }
        catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
    }
    const failure = { generatedAt: new Date().toISOString(), decision: rollbackResult.attempted && rollbackResult.pass !== true ? 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE' : 'HOLD_DEPLOYMENT_FAILED_ROLLED_BACK', error: String(error.message || error), rollback: rollbackResult };
    const failureSha256 = writeEvidence('failure.json', failure);
    process.stderr.write(`${JSON.stringify({ ...failure, evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), failureSha256 }, null, 2)}\n`);
    process.exitCode = 1;
});
