'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const confirmation = 'DEPLOY_ACCOUNT_JOURNEY_ROUTER_R1';
const expectedCommit = String(process.argv[4] || '').trim();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `account-journey-router-r1-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const runtime = Object.freeze(['api/handlers/foundation.php', 'index.html']);
const publicRuntime = new Set(['index.html']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
let prepared = null;
let mutationStarted = false;

function safe(relative) {
    assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative));
    return relative;
}
function under(basePath, relative) {
    const target = path.resolve(basePath, ...safe(relative).split('/'));
    assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`));
    return target;
}
function run(program, args, binary = false, timeout = 300000) {
    return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true });
}
function git(args, binary = false) {
    const result = run('git', args, binary);
    assert.equal(result.status, 0, String(result.stderr || 'git failed'));
    return result.stdout;
}
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', safe(remote)];
    if (local) args.push('-LocalPath', local);
    const result = run('powershell.exe', args, false, 120000);
    return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') };
}
function download(relative, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = ftps('download', relative, target);
    assert(result.ok, `Download failed: ${relative}: ${result.error || result.output}`);
    return { source: target, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)) };
}
function doubleDownload(relative, label) {
    const first = download(relative, under(path.join(evidence, `${label}-a`), relative));
    const second = download(relative, under(path.join(evidence, `${label}-b`), relative));
    assert.equal(first.sha256, second.sha256, `Remote drift between downloads: ${relative}`);
    return first;
}
function writeJson(name, value) {
    fs.mkdirSync(evidence, { recursive: true });
    const target = path.join(evidence, name);
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    return fileSha(target);
}
async function publicHealth() {
    const response = await fetch(`${base}/api/index.php?route=register/options&release_health=${Date.now()}`, {
        cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Public registration options health failed');
    assert.equal(body?.success, true, 'Public registration options body invalid');
    return { registrationOptions: 200, accountJourneyCalled: false, loginAttempted: false };
}
function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true });
    fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [], restore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative);
        const prior = blob(parent, relative);
        assert.notEqual(sha256(bytes), sha256(prior), `Runtime path did not change: ${relative}`);
        const before = doubleDownload(relative, 'remote-before');
        assert.equal(before.normalizedSha256, normalizedSha(prior), `Production drift outside immutable parent: ${relative}`);
        const target = under(candidateRoot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        if (relative.endsWith('.php')) {
            const lint = run(php, ['-l', target]);
            assert.equal(lint.status, 0, `PHP lint failed: ${relative}: ${lint.stderr || lint.stdout}`);
        }
        const rollback = under(rollbackRoot, relative);
        fs.mkdirSync(path.dirname(rollback), { recursive: true });
        fs.copyFileSync(before.source, rollback);
        candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) });
        restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
    }
    const foundation = fs.readFileSync(under(candidateRoot, 'api/handlers/foundation.php'), 'utf8');
    const index = fs.readFileSync(under(candidateRoot, 'index.html'), 'utf8');
    assert(foundation.includes('2026-11-03-account-journey-router-r1') && foundation.includes("'/account/journey'"), 'PHP router markers missing');
    assert(index.includes('20261103-account-journey-router-r1') && index.includes('account-journey-check'), 'Frontend router markers missing');
    const manifest = {
        contract: '2026-11-03-account-journey-router-production-r1', commit, parent,
        runtime: candidates.map(({ target, ...row }) => row),
        restore: restore.map(({ rollback, ...row }) => row),
        databaseChanged: false, schemaChanged: false, loginAttempted: false, accountJourneyCalled: false,
    };
    return { candidates, restore, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}
async function verifyHttps() {
    const rows = [];
    for (const file of prepared.candidates.filter(row => publicRuntime.has(row.path))) {
        const response = await fetch(`${base}/${file.path}?release=${expectedCommit.slice(0, 12)}-${Date.now()}`, {
            cache: 'no-store', headers: { 'Cache-Control': 'no-cache' },
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200, `HTTPS ${file.path} returned ${response.status}`);
        assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`);
        rows.push({ path: file.path, sha256: file.sha256 });
    }
    return rows;
}
async function rollback() {
    if (!prepared || !mutationStarted) return { attempted: false };
    for (const file of [...prepared.restore].reverse()) {
        assert.equal(fileSha(file.rollback), file.sha256, `Rollback source changed: ${file.path}`);
        assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`);
    }
    for (const file of prepared.restore) {
        const remote = doubleDownload(file.path, 'rollback-verified');
        assert.equal(remote.sha256, file.sha256, `Rollback checksum mismatch: ${file.path}`);
    }
    return { attempted: true, pass: true, restored: prepared.restore.length };
}

(async () => {
    assert.equal(process.argv[2], '--execute');
    assert.equal(process.argv[3], confirmation);
    assert.match(expectedCommit, /^[a-f0-9]{40}$/);
    const commit = String(git(['rev-parse', 'HEAD'])).trim();
    const parent = String(git(['rev-parse', 'HEAD^'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main');
    assert.equal(commit, expectedCommit);
    assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim());
    assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const before = await publicHealth();
    prepared = prepare(commit, parent);
    for (const file of prepared.candidates) {
        mutationStarted = true;
        assert(ftps('upload', file.path, file.target).ok, `Upload failed: ${file.path}`);
    }
    const deployed = prepared.candidates.map(file => {
        const remote = doubleDownload(file.path, 'deployed');
        assert.equal(remote.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`);
        return { path: file.path, sha256: remote.sha256 };
    });
    const https = await verifyHttps();
    const after = await publicHealth();
    const result = {
        decision: 'PASS_ACCOUNT_JOURNEY_ROUTER_R1_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(),
        commit, parent, deployed, https, before, after,
        rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length },
        databaseChanged: false, schemaChanged: false, accountJourneyCalled: false,
        loginAttempted: false, notificationDispatched: false, rollback: { attempted: false },
    };
    const resultSha256 = writeJson('result.json', result);
    process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.length, httpsVerified: https.length, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(async error => {
    let rollbackResult = { attempted: false };
    try { rollbackResult = await rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; }
    writeJson('failure.json', {
        decision: !mutationStarted ? 'HOLD_PRE_UPLOAD_VALIDATION_FAILED_NO_PRODUCTION_MUTATION' : rollbackResult.pass ? 'HOLD_DEPLOYMENT_FAILED_ROLLED_BACK' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE',
        error: error.message, rollback: rollbackResult,
    });
    console.error(error);
    process.exitCode = 1;
});
