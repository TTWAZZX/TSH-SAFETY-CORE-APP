'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const confirmation = 'DEPLOY_REGISTRATION_AND_FIRST_LOGIN_RUNTIME';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `registration-first-login-deploy-${stamp}`);
const runtimePaths = [
    'api/config.php',
    'api/handlers/foundation.php',
    'api/handlers/admin_phase8.php',
    'public/js/pages/admin.js',
    'public/js/main.js',
    'index.html',
];
const publicPaths = ['index.html', 'public/js/main.js', 'public/js/pages/admin.js'];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizeText = value => Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n');
const normalizedSha = value => sha256(Buffer.from(normalizeText(value), 'utf8'));
let mutationStarted = false;
let rollbackFiles = [];

function under(base, relative) {
    const resolvedBase = path.resolve(base);
    const target = path.resolve(base, ...String(relative).split('/'));
    assert(target.startsWith(`${resolvedBase}${path.sep}`), `Unsafe path: ${relative}`);
    return target;
}

function run(program, args, { binary = false, timeout = 120000 } = {}) {
    return spawnSync(program, args, {
        cwd: root,
        encoding: binary ? null : 'utf8',
        timeout,
        windowsHide: true,
    });
}

function git(args, options) {
    const result = run('git', args, options);
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
    return result.stdout;
}

function gitBlob(revision, relative) {
    return git(['show', `${revision}:${relative}`], { binary: true });
}

function ftps(action, remotePath, localPath = null) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper,
        '-Action', action, '-RemotePath', remotePath];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args, { timeout: 120000 });
    assert.equal(result.status, 0, `FTPS ${action} failed for ${remotePath}: ${String(result.stderr || result.stdout || '').trim()}`);
}

function download(remotePath, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    ftps('download', remotePath, target);
    return {
        bytes: fs.statSync(target).size,
        sha256: fileSha(target),
        normalizedSha256: normalizedSha(fs.readFileSync(target)),
    };
}

function doubleDownload(relative, label) {
    const firstPath = under(path.join(evidenceRoot, `${label}-a`), relative);
    const secondPath = under(path.join(evidenceRoot, `${label}-b`), relative);
    const first = download(relative, firstPath);
    const second = download(relative, secondPath);
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    return { path: relative, ...first, doubleDownloadMatched: true, firstPath };
}

function lintPhp(candidatePath) {
    const result = run(php, ['-l', candidatePath]);
    assert.equal(result.status, 0, `PHP lint failed: ${candidatePath}: ${String(result.stderr || result.stdout || '').trim()}`);
}

async function httpsBytes(relative, commit) {
    const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, {
        headers: { Accept: relative.endsWith('.html') ? 'text/html' : 'text/javascript' },
        cache: 'no-store',
    });
    assert.equal(response.status, 200, `HTTPS ${relative} returned ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

async function anonymousSmoke() {
    const optionsResponse = await fetch(`${baseUrl}/api/index.php?route=register/options`, {
        headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    const optionsBody = await optionsResponse.json().catch(() => null);
    assert.equal(optionsResponse.status, 200, 'Public registration options smoke failed');
    assert.equal(optionsBody?.success, true, 'Public registration options response is invalid');

    const adminResponse = await fetch(`${baseUrl}/api/index.php?route=admin/registration-requests`, {
        headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    assert.equal(adminResponse.status, 401, 'Anonymous registration Admin endpoint must remain denied');
    return { publicRegistrationOptions: 200, anonymousAdminDenied: 401 };
}

function rollback() {
    const restored = [];
    for (const file of [...rollbackFiles].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.beforeSha256, `Rollback checksum changed: ${file.path}`);
        ftps('upload', file.path, file.rollbackPath);
        const verified = doubleDownload(file.path, 'rollback');
        assert.equal(verified.sha256, file.beforeSha256, `Rollback verification failed: ${file.path}`);
        restored.push({ path: file.path, sha256: verified.sha256 });
    }
    return { attempted: true, pass: true, restored };
}

async function main() {
    assert.equal(process.argv[2], '--execute', 'Use --execute with the exact confirmation token');
    assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);

    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const parent = String(git(['rev-parse', `${commit}^`])).trim();
    const tree = String(git(['rev-parse', `${commit}^{tree}`])).trim();
    const branch = String(git(['branch', '--show-current'])).trim();
    const originMain = String(git(['rev-parse', 'origin/main'])).trim();
    assert.equal(branch, 'main', 'Production deployment requires main');
    assert.equal(originMain, commit, 'Push immutable commit to origin/main before deployment');
    assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Working tree must be clean');

    fs.mkdirSync(evidenceRoot, { recursive: true });
    const remoteBefore = [];
    const candidates = [];

    for (const relative of runtimePaths) {
        const beforeBlob = gitBlob(parent, relative);
        const candidateBlob = gitBlob(commit, relative);
        assert.notEqual(sha256(beforeBlob), sha256(candidateBlob), `Runtime path did not change in candidate: ${relative}`);

        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(beforeBlob), `Remote drift from parent commit: ${relative}`);
        const rollbackPath = under(path.join(evidenceRoot, 'rollback-package'), relative);
        fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
        fs.copyFileSync(before.firstPath, rollbackPath);
        rollbackFiles.push({ path: relative, rollbackPath, beforeSha256: before.sha256 });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, normalizedSha256: before.normalizedSha256 });

        const candidatePath = under(path.join(evidenceRoot, 'candidate'), relative);
        fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
        fs.writeFileSync(candidatePath, candidateBlob);
        if (relative.endsWith('.php')) lintPhp(candidatePath);
        candidates.push({ path: relative, candidatePath, bytes: candidateBlob.length, sha256: sha256(candidateBlob) });
    }

    const indexCandidate = fs.readFileSync(under(path.join(evidenceRoot, 'candidate'), 'index.html'), 'utf8');
    const mainCandidate = fs.readFileSync(under(path.join(evidenceRoot, 'candidate'), 'public/js/main.js'), 'utf8');
    assert(indexCandidate.includes('20261010-first-login-reentry-r1'), 'First-login cache marker is missing');
    assert(mainCandidate.includes('20261010-registration-workflow-r1'), 'Registration Admin cache marker is missing');

    mutationStarted = true;
    for (const file of candidates) ftps('upload', file.path, file.candidatePath);

    const deployed = [];
    for (const file of candidates) {
        const verified = doubleDownload(file.path, 'deployed');
        assert.equal(verified.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`);
        deployed.push({ path: file.path, bytes: verified.bytes, sha256: verified.sha256 });
    }

    const https = [];
    for (const relative of publicPaths) {
        const file = candidates.find(candidate => candidate.path === relative);
        const body = await httpsBytes(relative, commit);
        assert.equal(sha256(body), file.sha256, `HTTPS checksum mismatch: ${relative}`);
        https.push({ path: relative, bytes: body.length, sha256: sha256(body) });
    }
    const smoke = await anonymousSmoke();

    const result = {
        contract: '2026-10-10-registration-first-login-production-r1',
        generatedAt: new Date().toISOString(),
        decision: 'RELEASED_GO',
        candidate: { branch, commit, tree, parent, runtimePaths: runtimePaths.length },
        remoteBefore,
        deployed,
        https,
        smoke,
        rollbackPackage: { files: rollbackFiles.length, verified: true },
        constraints: {
            productionDatabaseChanged: false,
            schemaChanged: false,
            registrationCreated: false,
            emailDispatchedBySmoke: false,
            authenticatedProductionSessionUsed: false,
            recipientReadiness: 'NOT_VERIFIED_WITHOUT_AUTHENTICATED_ADMIN_SESSION',
        },
        rollback: { attempted: false },
    };
    const resultPath = path.join(evidenceRoot, 'result.json');
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    const resultSha256 = fileSha(resultPath);
    fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`);
    process.stdout.write(`${JSON.stringify({
        evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'),
        decision: result.decision,
        candidate: result.candidate,
        deployed: deployed.length,
        https: https.length,
        smoke,
        rollbackPackage: result.rollbackPackage,
        constraints: result.constraints,
        resultSha256,
    }, null, 2)}\n`);
}

main().catch(error => {
    let rollbackResult = { attempted: false };
    if (mutationStarted) {
        try { rollbackResult = rollback(); }
        catch (rollbackError) {
            rollbackResult = { attempted: true, pass: false, error: rollbackError.message };
        }
    }
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        error: error.message,
        rollback: rollbackResult,
        decision: 'HOLD_RELEASE_FAILED',
    }, null, 2)}\n`);
    process.stderr.write(`Registration/first-login deploy failed: ${error.message}; rollback attempted=${rollbackResult.attempted}\n`);
    process.exitCode = 1;
});
