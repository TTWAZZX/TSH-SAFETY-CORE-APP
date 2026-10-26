'use strict';
require('./production-deployment-policy').refuseArchivedProductionDeploy(__filename);

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const productionBaseline = '8a6d608286f86fd66871bd50237ab031ce0b6709';
const confirmation = 'DEPLOY_SAFETY_VOTE_PROMOTION_IMAGE_UX';
const runtimePaths = [
    'index.html',
    'public/style.css',
    'public/js/main.js',
    'public/js/pages/safety-vote-page-ux1.js',
];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-promotion-image-ux-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
let preparedRelease = null;
let mutationStarted = false;

function safeRelative(relative) {
    assert(typeof relative === 'string' && relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`);
    return relative;
}

function under(base, relative) {
    const resolvedBase = path.resolve(base);
    const target = path.resolve(base, ...safeRelative(relative).split('/'));
    assert(target.startsWith(`${resolvedBase}${path.sep}`), `Escaped guarded root: ${relative}`);
    return target;
}

function run(program, args, { binary = false, timeout = 120000 } = {}) {
    return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}

function git(args, options) {
    const result = run('git', args, options);
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
    return result.stdout;
}

function gitBlob(revision, relative) {
    return git(['show', `${revision}:${safeRelative(relative)}`], { binary: true });
}

function ftps(action, remotePath, localPath = null) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safeRelative(remotePath)];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args, { timeout: 120000 });
    return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}

function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `Download failed: ${relative}: ${result.error || result.output}`);
    return { bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)), firstPath: target };
}

function doubleDownload(relative, label, expectedSha = null) {
    const first = download(relative, under(path.join(evidenceRoot, `${label}-a`), relative));
    const second = download(relative, under(path.join(evidenceRoot, `${label}-b`), relative));
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed checksum mismatch: ${relative}`);
    return { path: relative, bytes: first.bytes, sha256: first.sha256, normalizedSha256: first.normalizedSha256, firstPath: first.firstPath, doubleDownloadMatched: true };
}

function prepareCandidateAndRollback(commit, tree) {
    const candidate = [], restoreFiles = [], remoteBefore = [];
    fs.mkdirSync(candidateRoot, { recursive: true });
    fs.mkdirSync(rollbackRoot, { recursive: true });
    for (const relative of runtimePaths) {
        const blob = gitBlob(commit, relative);
        const candidatePath = under(candidateRoot, relative);
        fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
        fs.writeFileSync(candidatePath, blob);
        candidate.push({ path: relative, bytes: blob.length, sha256: sha256(blob), candidatePath });
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(gitBlob(productionBaseline, relative)), `Production drift from ${productionBaseline}: ${relative}`);
        const rollbackPath = under(path.join(rollbackRoot, 'runtime-before'), relative);
        fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
        fs.copyFileSync(before.firstPath, rollbackPath);
        restoreFiles.push({ path: relative, bytes: before.bytes, sha256: before.sha256, rollbackPath });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, normalizedSha256: before.normalizedSha256, doubleDownloadMatched: true });
    }
    const manifest = { contract: '2026-10-16-safety-vote-promotion-image-ux-r1', productionBaseline, candidate: { commit, tree }, restoreFiles: restoreFiles.map(({ rollbackPath: ignored, ...file }) => file), removeOnRollback: [], schemaChanged: false };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { candidate, restoreFiles, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

async function resolveSmokeToken() {
    if (bearer && bearer.split('.').length === 3) {
        const probe = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        if (probe.status === 200) return { token: bearer, source: 'existing_bearer', loginPerformed: false };
    }
    assert(adminId && adminPassword, 'Production Admin UAT credentials are required');
    const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ employeeId: adminId, password: adminPassword }) });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, `Production Admin login failed with ${response.status}`);
    assert(body?.token, 'Production Admin token missing');
    return { token: body.token, source: 'ephemeral_admin_login', loginPerformed: true };
}

async function authenticatedSmoke(auth) {
    const requests = [];
    for (const relative of ['/api/index.php?route=safety-vote/admin/health', '/api/index.php?route=safety-vote/admin/campaigns']) {
        const response = await fetch(`${baseUrl}${relative}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        const body = await response.json().catch(() => null);
        assert.equal(response.status, 200, `Authenticated GET failed: ${relative}`);
        assert.equal(body?.success, true, `Authenticated response failed: ${relative}`);
        assert(/private/i.test(response.headers.get('cache-control') || '') && /no-store/i.test(response.headers.get('cache-control') || ''), `Privacy header missing: ${relative}`);
        if (relative.includes('/health')) assert.equal(body.data?.ready, true, 'Safety Vote health is not ready');
        requests.push({ path: relative, status: 200, method: 'GET', privateNoStore: true, responseBodyRecorded: false });
    }
    const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    assert.equal(anonymous.status, 401, 'Anonymous Safety Vote health must remain denied');
    return { requests, anonymousHealthDenied: 401, authenticationSource: auth.source, loginPerformed: auth.loginPerformed, credentialRecorded: false };
}

async function httpsVerify(candidate, commit) {
    const expected = new Map(candidate.map(file => [file.path, file.sha256]));
    const verified = [];
    for (const relative of runtimePaths) {
        const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        assert.equal(response.status, 200, `HTTPS ${relative} returned ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(body), expected.get(relative), `HTTPS checksum mismatch: ${relative}`);
        verified.push({ path: relative, status: 200, bytes: body.length, sha256: sha256(body) });
    }
    return verified;
}

function rollbackRuntime(prepared) {
    for (const file of [...prepared.restoreFiles].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.sha256, `Rollback source changed: ${file.path}`);
        assert(ftps('upload', file.path, file.rollbackPath).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.restoreFiles) doubleDownload(file.path, 'rollback-verified', file.sha256);
    return { attempted: true, pass: true, restored: prepared.restoreFiles.length };
}

async function main() {
    assert.equal(process.argv[2], '--execute', 'Execution requires --execute');
    assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);
    const branch = String(git(['branch', '--show-current'])).trim();
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
    assert.equal(branch, 'main', 'Production deployment requires main');
    assert.equal(String(git(['rev-parse', 'origin/main'])).trim(), commit, 'Production deployment requires pushed origin/main');
    assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Production deployment requires a clean worktree');
    const auth = await resolveSmokeToken();
    const smokeBefore = await authenticatedSmoke(auth);
    try {
        preparedRelease = prepareCandidateAndRollback(commit, tree);
        mutationStarted = true;
        for (const file of preparedRelease.candidate) assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed: ${file.path}`);
        const deployed = preparedRelease.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256));
        const https = await httpsVerify(preparedRelease.candidate, commit);
        const smokeAfter = await authenticatedSmoke(auth);
        const result = {
            contract: '2026-10-16-safety-vote-promotion-image-ux-r1', generatedAt: new Date().toISOString(), decision: 'PASS_SAFETY_VOTE_PROMOTION_IMAGE_UX_PRODUCTION_DEPLOYMENT',
            candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length }, remoteBefore: preparedRelease.remoteBefore,
            deployment: { uploaded: runtimePaths, doubleDownloadVerified: deployed.length, httpsVerified: https.length }, smokeBefore, smokeAfter,
            rollbackPackage: { manifestSha256: preparedRelease.manifestSha256, restoreFiles: preparedRelease.restoreFiles.length, removeOnRollback: 0, verified: true },
            constraints: { schemaChanged: false, productionDatabaseChanged: false, notificationDispatched: false, credentialRecorded: false, responseBodiesRecorded: false }, rollback: { attempted: false, packageReady: true },
        };
        const resultPath = path.join(evidenceRoot, 'result.json');
        fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
        const resultSha256 = fileSha(resultPath);
        fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`);
        process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smokeAfter, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
    } catch (error) {
        let rollback = { attempted: false };
        if (mutationStarted && preparedRelease) {
            try { rollback = rollbackRuntime(preparedRelease); } catch (rollbackError) { rollback = { attempted: true, pass: false, error: rollbackError.message }; }
        }
        fs.mkdirSync(evidenceRoot, { recursive: true });
        fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), error: error.message, rollback, decision: rollback.pass ? 'HOLD_RELEASE_FAILED_ROLLED_BACK' : 'HOLD_RELEASE_FAILED' }, null, 2)}\n`);
        throw error;
    }
}

main().catch(error => { process.stderr.write(`Safety Vote promotion image UX deployment failed: ${error.message}\n`); process.exitCode = 1; });
