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
const productionBaseline = '20b09f9b1a3369d3d989614e0ed7b93fc096db42';
const confirmation = 'DEPLOY_APP_COMPACT_SAFETY_VOTE_RUNTIME';
const runtimePaths = [
    'api/handlers/safety_vote_planning.php',
    'api/lib/safety_vote_planning.php',
    'backend/routes/safety-vote-planning.js',
    'backend/services/safety-vote-planning.js',
    'public/js/pages/admin-safety-vote-review.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/admin.js',
    'public/js/pages/safety-vote-campaign-wizard.js',
    'shared/johnny-system-usage-knowledge.json',
    'public/js/johnny-drawer.js',
    'public/js/main.js',
    'public/style.css',
    'index.html',
];
const newPaths = new Set(['public/js/pages/admin-safety-vote-review.js']);
const publicPaths = runtimePaths.filter(relative => relative === 'index.html' || relative.startsWith('public/'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `app-compact-safety-vote-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizeText = value => Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n');
const normalizedSha = value => sha256(Buffer.from(normalizeText(value), 'utf8'));
let mutationStarted = false;
let rollbackManifest = null;

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
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remotePath ? safeRelative(remotePath) : ''];
    if (localPath) args.push('-LocalPath', localPath);
    const result = run('powershell.exe', args, { timeout: 120000 });
    return { ok: result.status === 0, status: result.status, output: String(result.stdout || ''), error: String(result.stderr || '') };
}

function remoteExists(relative) {
    const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const listing = ftps('list', parent);
    assert(listing.ok, `Unable to list remote directory: ${parent || '/'}`);
    const escaped = path.posix.basename(relative).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${escaped}(?:\\r?\\n|$)`, 'm').test(listing.output);
}

function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `Download failed: ${relative}`);
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

function prepareCandidateAndRollback(commit, tree) {
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
        if (relative.endsWith('.php')) {
            const lint = run(php, ['-l', candidatePath]);
            assert.equal(lint.status, 0, `PHP lint failed: ${relative}`);
        }
        if (relative.endsWith('.json')) JSON.parse(blob.toString('utf8'));
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

    const index = fs.readFileSync(under(candidateRoot, 'index.html'), 'utf8');
    const drawer = fs.readFileSync(under(candidateRoot, 'public/js/johnny-drawer.js'), 'utf8');
    const knowledge = JSON.parse(fs.readFileSync(under(candidateRoot, 'shared/johnny-system-usage-knowledge.json'), 'utf8'));
    assert(index.includes('fullwidth-r1-compact-r1'), 'Compact layout cache marker missing');
    assert(index.includes('admin-safety-vote-review.js'), 'Admin review runtime entry missing');
    assert(drawer.includes('johnny-launcher-position'), 'Johnny draggable launcher contract missing');
    assert(String(knowledge.version || '').includes('safety-vote'), 'Safety Vote Johnny knowledge version missing');

    rollbackManifest = {
        contract: '2026-10-10-app-compact-safety-vote-production-r1',
        productionBaseline,
        candidate: { commit, tree },
        restoreFiles: restoreFiles.map(({ rollbackPath: ignored, ...file }) => file),
        removeOnRollback,
        schemaChanged: false,
    };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(rollbackManifest, null, 2)}\n`);
    return { candidate, restoreFiles, removeOnRollback, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

async function httpsVerify(candidate, commit) {
    const byPath = new Map(candidate.map(file => [file.path, file]));
    const verified = [];
    for (const relative of publicPaths) {
        const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, { headers: { Accept: relative.endsWith('.html') ? 'text/html' : 'text/javascript', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
        assert.equal(response.status, 200, `HTTPS ${relative} returned ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        assert.equal(sha256(body), byPath.get(relative).sha256, `HTTPS checksum mismatch: ${relative}`);
        verified.push({ path: relative, bytes: body.length, sha256: sha256(body), status: response.status });
    }
    const protectedKnowledge = await fetch(`${baseUrl}/shared/johnny-system-usage-knowledge.json?release=${Date.now()}`, { redirect: 'manual', cache: 'no-store' });
    assert.equal(protectedKnowledge.status, 403, 'Shared Johnny knowledge must remain denied over HTTPS');
    return { public: verified, protectedKnowledgeStatus: protectedKnowledge.status };
}

async function authenticatedSmoke() {
    assert(bearer && bearer.split('.').length === 3, 'Existing Production bearer token is required');
    assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
    const requests = [];
    for (const relative of ['/api/index.php?route=safety-vote/admin/health', '/api/index.php?route=safety-vote/admin/campaigns']) {
        const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'Cache-Control': 'no-cache' } });
        const body = await response.json().catch(() => null);
        const cache = response.headers.get('cache-control') || '';
        assert.equal(response.status, 200, `Authenticated GET failed: ${relative}`);
        assert.equal(body?.success, true, `Authenticated response failed: ${relative}`);
        assert(/private/i.test(cache) && /no-store/i.test(cache), `Privacy header missing: ${relative}`);
        if (relative.includes('/health')) {
            assert.equal(body.data?.ready, true, 'Safety Vote health is not ready');
            assert.equal(body.data?.moduleEnabled, true, 'Safety Vote module is not enabled');
        }
        requests.push({ path: relative, method: 'GET', status: response.status, privateNoStore: true, responseBodyRecorded: false });
    }
    const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    assert.equal(anonymous.status, 401, 'Anonymous Safety Vote health must remain denied');
    return { requests, anonymousHealthDenied: anonymous.status };
}

function rollbackRuntime(prepared) {
    for (const file of [...prepared.restoreFiles].reverse()) {
        assert.equal(fileSha(file.rollbackPath), file.sha256, `Rollback source checksum changed: ${file.path}`);
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
        prepared = prepareCandidateAndRollback(commit, tree);
        mutationStarted = true;
        for (const file of prepared.candidate) assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed: ${file.path}`);
        const deployed = prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256));
        const https = await httpsVerify(prepared.candidate, commit);
        const smoke = await authenticatedSmoke();
        const result = {
            contract: '2026-10-10-app-compact-safety-vote-production-r1',
            generatedAt: new Date().toISOString(),
            decision: 'RELEASED_GO',
            candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length },
            remoteBefore: prepared.remoteBefore,
            deployed,
            https,
            smoke,
            rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restoreFiles.length, removeOnRollback: prepared.removeOnRollback.length, verified: true },
            constraints: { schemaChanged: false, productionDatabaseChanged: false, notificationDispatched: false, credentialRecorded: false, responseBodiesRecorded: false },
            rollback: { attempted: false, packageReady: true },
        };
        const resultPath = path.join(evidenceRoot, 'result.json');
        fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
        const resultSha256 = fileSha(resultPath);
        fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha256}  result.json\n`);
        process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, deployed: deployed.length, https: https.public.length, smoke, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
    } catch (error) {
        let rollback = { attempted: false };
        if (mutationStarted && prepared) {
            try { rollback = rollbackRuntime(prepared); }
            catch (rollbackError) { rollback = { attempted: true, pass: false, error: rollbackError.message }; }
        }
        fs.mkdirSync(evidenceRoot, { recursive: true });
        const failure = { generatedAt: new Date().toISOString(), error: error.message, rollback, decision: rollback.attempted && rollback.pass ? 'HOLD_RELEASE_FAILED_ROLLED_BACK' : 'HOLD_RELEASE_FAILED' };
        fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
        throw error;
    }
}

main().catch(error => {
    process.stderr.write(`App compact/Safety Vote deployment failed: ${error.message}\n`);
    process.exitCode = 1;
});
