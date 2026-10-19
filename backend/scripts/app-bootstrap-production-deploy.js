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
const productionBaseline = '4163efb34c09d80e2147b31effef1f87e854642b';
const confirmation = 'DEPLOY_APP_BOOTSTRAP_LOCAL_CSS_AND_LAZY_VENDORS';
const runtimePaths = [
    'index.html',
    'public/js/main.js',
    'public/js/session.js',
    'public/js/pages/bbs-smart-card.js',
    'public/js/utils/vendor-loader.js',
    'public/tailwind.production.css',
];
const newPaths = new Set([
    'public/js/utils/vendor-loader.js',
    'public/tailwind.production.css',
]);
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `app-bootstrap-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizeText = value => Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n');
const normalizedSha = value => sha256(Buffer.from(normalizeText(value), 'utf8'));
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

function remoteExists(relative) {
    const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const listingArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', 'list', '-RemotePath', parent];
    const result = run('powershell.exe', listingArgs, { timeout: 120000 });
    assert.equal(result.status, 0, `Unable to list Production directory: ${parent || '/'}`);
    const escaped = path.posix.basename(relative).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${escaped}(?:\\r?\\n|$)`, 'm').test(String(result.stdout || ''));
}

function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `FTPS download failed: ${relative}: ${result.error}`);
    return { bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)) };
}

function doubleDownload(relative, label, expectedSha = null) {
    const firstPath = under(path.join(evidenceRoot, `${label}-a`), relative);
    const secondPath = under(path.join(evidenceRoot, `${label}-b`), relative);
    const first = download(relative, firstPath);
    const second = download(relative, secondPath);
    assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`);
    if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed SHA-256 mismatch: ${relative}`);
    return { path: relative, ...first, doubleDownloadMatched: true, firstPath };
}

function prepare(commit, tree) {
    fs.mkdirSync(candidateRoot, { recursive: true });
    fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidate = [];
    const restoreFiles = [];
    const removeOnRollback = [];
    const remoteBefore = [];

    for (const relative of runtimePaths) {
        const blob = gitBlob(commit, relative);
        const candidatePath = under(candidateRoot, relative);
        fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
        fs.writeFileSync(candidatePath, blob);
        candidate.push({ path: relative, bytes: blob.length, sha256: sha256(blob), candidatePath });

        if (newPaths.has(relative)) {
            assert.equal(remoteExists(relative), false, `Expected new Production path already exists: ${relative}`);
            removeOnRollback.push({ path: relative });
            remoteBefore.push({ path: relative, absent: true, absenceRevalidated: true });
            continue;
        }

        const baselineBlob = gitBlob(productionBaseline, relative);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(baselineBlob), `Production drift from baseline: ${relative}`);
        const rollbackPath = under(path.join(rollbackRoot, 'runtime-before'), relative);
        fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
        fs.copyFileSync(before.firstPath, rollbackPath);
        restoreFiles.push({ path: relative, bytes: before.bytes, sha256: before.sha256, rollbackPath });
        remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, normalizedSha256: before.normalizedSha256, doubleDownloadMatched: true });
    }

    const index = gitBlob(commit, 'index.html').toString('utf8');
    const main = gitBlob(commit, 'public/js/main.js').toString('utf8');
    const session = gitBlob(commit, 'public/js/session.js').toString('utf8');
    const loader = gitBlob(commit, 'public/js/utils/vendor-loader.js').toString('utf8');
    assert(index.includes('app-critical-css'), 'Critical CSS marker missing');
    assert(index.includes('public/tailwind.production.css?v=20261019-local-production-r1'), 'Local Production CSS marker missing');
    assert(index.includes('public/js/main.js?v=20261019-route-vendors-r1'), 'Application cache marker missing');
    assert(main.includes('./utils/vendor-loader.js?v=20261019-route-vendors-r1'), 'Lazy vendor loader integration missing');
    assert(main.includes('APP_BOOTSTRAP_TIMEOUTS') && main.includes('SESSION_VERIFY_TIMEOUT'), 'Session bootstrap timeout missing');
    assert(session.includes('const signal = options?.signal') && session.includes('throwOnFailure'), 'Abortable session verification contract missing');
    assert(loader.includes('ensureRouteVendors'), 'Route vendor loader contract missing');

    const manifest = {
        contract: '2026-10-19-app-bootstrap-local-css-lazy-vendors-r1',
        productionBaseline,
        candidate: { commit, tree },
        restoreFiles: restoreFiles.map(({ rollbackPath: ignored, ...file }) => file),
        removeOnRollback,
        schemaChanged: false,
    };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { candidate, restoreFiles, removeOnRollback, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

async function httpsVerify(candidate, commit) {
    const verified = [];
    for (const file of candidate) {
        const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, {
            headers: { Accept: file.path.endsWith('.html') ? 'text/html' : file.path.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-cache' },
            cache: 'no-store',
        });
        assert.equal(response.status, 200, `HTTPS ${file.path} returned ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(body), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        verified.push({ path: file.path, status: response.status, bytes: body.length, sha256: file.sha256 });
    }
    const branding = await fetch(`${baseUrl}/api/index.php?route=public/branding&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    const brandingBody = await branding.json().catch(() => null);
    assert.equal(branding.status, 200, 'Public Branding endpoint failed');
    assert.equal(brandingBody?.success, true, 'Public Branding response failed');
    const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
    assert.equal(anonymous.status, 401, 'Anonymous Admin health must remain denied');
    return { public: verified, publicBranding: branding.status, anonymousAdminHealth: anonymous.status };
}

function rollback(prepared) {
    for (const file of [...prepared.restoreFiles].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.sha256, `Rollback checksum changed: ${file.path}`);
        assert(ftps('upload', file.path, file.rollbackPath).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.removeOnRollback) {
        if (remoteExists(file.path)) assert(ftps('delete', file.path).ok, `Rollback delete failed: ${file.path}`);
        assert.equal(remoteExists(file.path), false, `Rollback residue: ${file.path}`);
    }
    for (const file of prepared.restoreFiles) doubleDownload(file.path, 'rollback-verified', file.sha256);
    return { attempted: true, pass: true, restored: prepared.restoreFiles.length, removed: prepared.removeOnRollback.length };
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

    let prepared;
    try {
        prepared = prepare(commit, tree);
        mutationStarted = true;
        for (const file of prepared.candidate) {
            const uploaded = ftps('upload', file.path, file.candidatePath);
            assert(uploaded.ok, `Upload failed: ${file.path}: ${uploaded.error}`);
        }
        const deployed = prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256));
        const https = await httpsVerify(prepared.candidate, commit);
        const result = {
            contract: '2026-10-19-app-bootstrap-local-css-lazy-vendors-r1',
            generatedAt: new Date().toISOString(),
            decision: 'PASS_APP_BOOTSTRAP_PRODUCTION_DEPLOYMENT',
            candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length },
            remoteBefore: prepared.remoteBefore,
            deployed,
            https,
            rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restoreFiles.length, removeOnRollback: prepared.removeOnRollback.length, verified: true },
            constraints: { schemaChanged: false, productionDatabaseChanged: false, credentialRecorded: false, responseBodiesRecorded: false },
            rollback: { attempted: false, packageReady: true },
        };
        const resultPath = path.join(evidenceRoot, 'result.json');
        fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
        const resultSha256 = fileSha(resultPath);
        fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`);
        process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployed: deployed.length, https: https.public.length, smoke: { publicBranding: https.publicBranding, anonymousAdminHealth: https.anonymousAdminHealth }, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
    } catch (error) {
        let rollbackResult = { attempted: false };
        if (mutationStarted && prepared) {
            try { rollbackResult = rollback(prepared); }
            catch (rollbackError) { rollbackResult = { attempted: true, pass: false, error: rollbackError.message }; }
        }
        fs.mkdirSync(evidenceRoot, { recursive: true });
        fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), error: error.message, rollback: rollbackResult }, null, 2)}\n`);
        throw error;
    }
}

main().catch(error => {
    process.stderr.write(`App bootstrap deployment failed: ${error.message}\n`);
    process.exitCode = 1;
});
