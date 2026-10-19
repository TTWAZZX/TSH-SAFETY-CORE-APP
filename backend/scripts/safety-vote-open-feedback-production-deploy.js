'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const productionBaseline = 'ee49a1d3f0348eb96639a47a43816cc9ca7cb9c9';
const confirmation = 'DEPLOY_SAFETY_VOTE_OPEN_FEEDBACK_HOTFIX';
const runtimePaths = [
    'index.html',
    'public/js/main.js',
    'public/js/pages/admin.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/safety-vote-campaign-wizard.js',
    'public/js/pages/safety-vote-ux-components.js',
];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-open-feedback-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'));
let preparedRelease = null;
let mutationStarted = false;

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

function gitBlob(revision, relative) {
    return git(['show', `${revision}:${safeRelative(relative)}`], { binary: true });
}

function ftps(action, remotePath, localPath = null) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safeRelative(remotePath)];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args);
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

function prepare(commit, tree) {
    const candidate = [];
    const restoreFiles = [];
    const remoteBefore = [];
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

    const index = fs.readFileSync(under(candidateRoot, 'index.html'), 'utf8');
    const wizard = fs.readFileSync(under(candidateRoot, 'public/js/pages/safety-vote-campaign-wizard.js'), 'utf8');
    const components = fs.readFileSync(under(candidateRoot, 'public/js/pages/safety-vote-ux-components.js'), 'utf8');
    assert(index.includes('20261019-safety-vote-open-feedback-r1'), 'Release cache marker missing');
    assert(wizard.includes('/readiness') && wizard.includes('/lifecycle/${command}'), 'Authoritative readiness/open flow missing');
    assert(components.includes('sv-dialog-error') && components.includes("button.textContent = 'กำลังตรวจสอบ...'"), 'Visible asynchronous feedback contract missing');

    const manifest = {
        contract: '2026-10-19-safety-vote-open-feedback-production-r1',
        productionBaseline,
        candidate: { commit, tree },
        restoreFiles: restoreFiles.map(({ rollbackPath: ignored, ...file }) => file),
        removeOnRollback: [],
        schemaChanged: false,
    };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { candidate, restoreFiles, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

async function httpsVerify(candidate, commit) {
    const verified = [];
    for (const file of candidate) {
        const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        assert.equal(response.status, 200, `HTTPS ${file.path} returned ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(body), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        verified.push({ path: file.path, status: 200, bytes: body.length, sha256: sha256(body) });
    }
    const branding = await fetch(`${baseUrl}/api/index.php?route=public/branding&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const brandingBody = await branding.json().catch(() => null);
    assert.equal(branding.status, 200, 'Public Branding endpoint failed');
    assert.equal(brandingBody?.success, true, 'Public Branding response failed');
    const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    assert.equal(anonymous.status, 401, 'Anonymous Safety Vote Admin health must remain denied');
    return { verified, publicBranding: branding.status, anonymousAdminHealth: anonymous.status };
}

function rollback(prepared) {
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

    try {
        preparedRelease = prepare(commit, tree);
        mutationStarted = true;
        for (const file of preparedRelease.candidate) assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed: ${file.path}`);
        const deployed = preparedRelease.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256));
        const https = await httpsVerify(preparedRelease.candidate, commit);
        const result = {
            contract: '2026-10-19-safety-vote-open-feedback-production-r1',
            generatedAt: new Date().toISOString(),
            decision: 'PASS_SAFETY_VOTE_OPEN_FEEDBACK_PRODUCTION_DEPLOYMENT',
            candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length },
            remoteBefore: preparedRelease.remoteBefore,
            deployment: { uploaded: runtimePaths, doubleDownloadVerified: deployed.length, httpsVerified: https.verified.length },
            smoke: { publicBranding: https.publicBranding, anonymousAdminHealth: https.anonymousAdminHealth },
            rollbackPackage: { manifestSha256: preparedRelease.manifestSha256, restoreFiles: preparedRelease.restoreFiles.length, removeOnRollback: 0, verified: true },
            constraints: { schemaChanged: false, productionDatabaseChanged: false, permissionChanged: false, notificationDispatched: false },
            rollback: { attempted: false, packageReady: true },
        };
        const resultPath = path.join(evidenceRoot, 'result.json');
        fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
        const resultSha256 = fileSha(resultPath);
        fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`);
        process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smoke: result.smoke, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
    } catch (error) {
        let rollbackResult = { attempted: false };
        if (mutationStarted && preparedRelease) {
            try { rollbackResult = rollback(preparedRelease); }
            catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
        }
        fs.mkdirSync(evidenceRoot, { recursive: true });
        fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), error: error.message, rollback: rollbackResult }, null, 2)}\n`);
        throw error;
    }
}

main().catch(error => {
    process.stderr.write(`Safety Vote open-feedback deployment failed: ${error.message}\n`);
    process.exitCode = 1;
});
