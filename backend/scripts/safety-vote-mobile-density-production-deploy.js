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
const productionBaseline = 'a188e35c6aaf7f3f73591b370539a63092d284f0';
const confirmation = 'DEPLOY_SAFETY_VOTE_OFFICIAL_TOPN_R1';
const runtimePaths = Object.freeze([
    'index.html',
    'public/js/main.js',
    'public/js/pages/admin.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/safety-vote-campaign-wizard.js',
    'public/js/pages/safety-vote-wizard-model.mjs',
    'api/handlers/safety_vote.php',
    'api/handlers/safety_vote_phase10_4.php',
    'api/lib/safety_vote_phase1.php',
    'api/lib/safety_vote_phase5.php',
]);
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-official-topn-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizeText = value => Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n');
const normalizedSha = value => sha256(Buffer.from(normalizeText(value), 'utf8'));
let prepared = null;
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
    return { ok: result.status === 0, status: result.status, output: String(result.stdout || ''), error: String(result.stderr || '') };
}

function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `FTPS download failed: ${relative}: ${result.error}`);
    return { bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)), target };
}

function doubleDownload(relative, label, expectedSha = null) {
    const firstPath = under(path.join(evidenceRoot, `${label}-a`), relative);
    const secondPath = under(path.join(evidenceRoot, `${label}-b`), relative);
    const first = download(relative, firstPath);
    const second = download(relative, secondPath);
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed SHA-256 mismatch: ${relative}`);
    return { path: relative, bytes: first.bytes, sha256: first.sha256, normalizedSha256: first.normalizedSha256, doubleDownloadMatched: true, source: firstPath };
}

function prepare(commit, tree) {
    fs.mkdirSync(candidateRoot, { recursive: true });
    fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidate = [];
    const restore = [];
    const remoteBefore = [];
    for (const relative of runtimePaths) {
        const bytes = gitBlob(commit, relative);
        const target = under(candidateRoot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        if (relative.endsWith('.php')) assert.equal(run(php, ['-l', target]).status, 0, `PHP lint failed: ${relative}`);
        candidate.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes), target });

        const baseline = gitBlob(productionBaseline, relative);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(baseline), `Production drift from baseline: ${relative}`);
        const rollback = under(path.join(rollbackRoot, 'runtime-before'), relative);
        fs.mkdirSync(path.dirname(rollback), { recursive: true });
        fs.copyFileSync(before.source, rollback);
        restore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, rollback });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, normalizedSha256: before.normalizedSha256, doubleDownloadMatched: true });
    }

    const index = gitBlob(commit, 'index.html').toString('utf8');
    const main = gitBlob(commit, 'public/js/main.js').toString('utf8');
    const admin = gitBlob(commit, 'public/js/pages/admin.js').toString('utf8');
    const adminUx = gitBlob(commit, 'public/js/pages/admin-safety-vote-ux1.js').toString('utf8');
    const wizard = gitBlob(commit, 'public/js/pages/safety-vote-campaign-wizard.js').toString('utf8');
    const model = gitBlob(commit, 'public/js/pages/safety-vote-wizard-model.mjs').toString('utf8');
    const phpCore = gitBlob(commit, 'api/handlers/safety_vote.php').toString('utf8');
    const phpPhase1 = gitBlob(commit, 'api/lib/safety_vote_phase1.php').toString('utf8');
    assert(index.includes('public/style.css?v=20261028-safety-vote-density-r5'), 'Mobile density stylesheet cache marker missing');
    assert(index.includes('public/js/main.js?v=20261028-safety-vote-official-topn-r1'), 'Official Top N main cache marker missing');
    assert(main.includes('./pages/admin.js?v=20261028-safety-vote-official-topn-r1'), 'Official Top N Admin cache marker missing');
    assert(admin.includes('./admin-safety-vote-ux1.js?v=20261028-safety-vote-official-topn-r1'), 'Official Top N Admin UX cache marker missing');
    assert(adminUx.includes('./safety-vote-campaign-wizard.js?v=20261028-safety-vote-official-topn-r1'), 'Official Top N Wizard cache marker missing');
    assert(wizard.includes('data-svw-official-topn-preset') && wizard.includes('กำหนดจำนวนเอง'), 'Official Top N custom UI missing');
    assert(model.includes('OFFICIAL_RESULT_TOP_N_MAX = 100') && model.includes('officialResultTopNValid'), 'Official Top N Browser validation missing');
    assert(phpCore.includes('SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MAX') && phpCore.includes('OfficialResultTopN,ResultReleasePolicy'), 'Official Top N PHP lifecycle integration missing');
    assert(/SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MAX\s*=\s*100/.test(phpPhase1), 'Official Top N PHP validation missing');

    const manifest = {
        contract: '2026-10-28-safety-vote-official-topn-r1',
        productionBaseline,
        candidate: { commit, tree },
        runtimePaths,
        restore: restore.map(({ rollback: ignored, ...item }) => item),
        schemaChanged: false,
        businessDataChanged: false,
    };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { candidate, restore, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

async function httpsVerify(candidate, commit) {
    const publicFiles = [];
    for (const file of candidate.filter(item => !item.path.startsWith('api/'))) {
        const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        assert.equal(response.status, 200, `HTTPS ${file.path} returned ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        publicFiles.push({ path: file.path, status: response.status, bytes: bytes.length, sha256: file.sha256 });
    }
    const branding = await fetch(`${baseUrl}/api/index.php?route=public/branding&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const brandingBody = await branding.json().catch(() => null);
    assert.equal(branding.status, 200, 'Public Branding endpoint failed');
    assert.equal(brandingBody?.success, true, 'Public Branding response failed');
    const health = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    assert.equal(health.status, 401, 'Anonymous Admin health must remain denied');
    return { publicFiles, publicBranding: branding.status, anonymousAdminHealth: health.status };
}

async function authenticatedSmoke() {
    const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
    const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
    assert(employeeId && password, 'Production UAT Admin credentials are required');
    const login = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ employeeId, password }) });
    const loginBody = await login.json().catch(() => null);
    assert.equal(login.status, 200, 'Production Admin login failed');
    assert(loginBody?.token, 'Production Admin token missing');
    const get = async route => {
        const response = await fetch(`${baseUrl}/api/index.php?route=${route}&release=${Date.now()}`, { headers: { Authorization: `Bearer ${loginBody.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        return { response, body: await response.json().catch(() => null) };
    };
    const health = await get('safety-vote/admin/health');
    const campaigns = await get('safety-vote/admin/campaigns');
    assert.equal(health.response.status, 200, 'Authenticated Safety Vote health failed');
    assert.equal(health.body?.success, true, 'Authenticated Safety Vote health response failed');
    assert.equal(health.body?.data?.ready, true, 'Safety Vote health is not ready');
    assert.equal(campaigns.response.status, 200, 'Authenticated campaign catalogue failed');
    assert.equal(campaigns.body?.success, true, 'Authenticated campaign catalogue response failed');
    assert(/no-store/i.test(health.response.headers.get('cache-control') || ''), 'Authenticated health must be no-store');
    return { schemaVersion: health.body?.data?.schemaVersion || null, campaignTotal: Number(campaigns.body?.data?.total), capabilities: health.body?.data?.capabilities || {}, responseBodiesRecorded: false };
}

function rollbackRuntime() {
    if (!prepared || !mutationStarted) return { attempted: false };
    for (const file of [...prepared.restore].reverse()) {
        assert.equal(fileSha(file.rollback), file.sha256, `Rollback checksum changed: ${file.path}`);
        assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.restore) doubleDownload(file.path, 'rollback-verified', file.sha256);
    return { attempted: true, pass: true, restored: prepared.restore.length };
}

function writeJson(name, value) {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const target = path.join(evidenceRoot, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    return fileSha(target);
}

async function main() {
    assert.equal(process.argv[2], '--execute', 'Use --execute with the exact confirmation token');
    assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);
    const branch = String(git(['branch', '--show-current'])).trim();
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim();
    const originMain = String(git(['rev-parse', 'origin/main'])).trim();
    assert.equal(branch, 'main', 'Production deployment requires main');
    assert.equal(originMain, commit, 'Production deployment requires pushed origin/main');
    assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Production deployment requires a clean worktree');

    prepared = prepare(commit, tree);
    mutationStarted = true;
    for (const file of prepared.candidate) assert(ftps('upload', file.path, file.target).ok, `Upload failed: ${file.path}`);
    const deployed = prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256));
    const https = await httpsVerify(prepared.candidate, commit);
    const authenticated = await authenticatedSmoke();
    const result = {
        contract: '2026-10-28-safety-vote-official-topn-r1',
        generatedAt: new Date().toISOString(),
        decision: 'PASS_SAFETY_VOTE_OFFICIAL_TOPN_PRODUCTION_DEPLOYMENT',
        candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length },
        remoteBefore: prepared.remoteBefore,
        deployment: { uploaded: prepared.candidate.length, doubleDownloadVerified: deployed.length, httpsVerified: https.publicFiles.length },
        smoke: { publicBranding: https.publicBranding, anonymousAdminHealth: https.anonymousAdminHealth, authenticated },
        rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length, verified: true },
        constraints: { schemaChanged: false, businessDataChanged: false, externalDeliveryChanged: false, notificationsSent: false },
        rollback: { attempted: false, packageReady: true },
    };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployment: result.deployment, smoke: result.smoke, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
}

main().catch(error => {
    let rollback = { attempted: false };
    try { rollback = rollbackRuntime(); }
    catch (rollbackError) { rollback = { attempted: true, pass: false, error: rollbackError.message }; }
    const decision = !mutationStarted
        ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION'
        : rollback.attempted && rollback.pass
            ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK'
            : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE';
    writeJson('failure.json', { generatedAt: new Date().toISOString(), decision, error: error.message, rollback });
    process.stderr.write(`Safety Vote Official Top N deployment failed: ${error.message}\n`);
    process.exitCode = 1;
});
