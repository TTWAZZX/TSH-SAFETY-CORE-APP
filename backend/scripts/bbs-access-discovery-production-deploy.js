'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { expandRuntimeClosure } = require('./production-dependency-closure');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const confirmation = 'DEPLOY_BBS_ACCESS_DISCOVERY_HOTFIX';
const expectedCommit = String(process.argv[4] || '').trim();
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `bbs-access-discovery-hotfix-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package');
const runtime = expandRuntimeClosure(['api/index.php', 'index.html']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
const fileSha = file => sha256(fs.readFileSync(file));
let prepared = null;
let runtimeMutation = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative)); return relative; }
function under(basePath, relative) { const target = path.resolve(basePath, ...safe(relative).split('/')); assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`)); return target; }
function run(program, args, binary = false, timeout = 300000) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, binary = false) { const result = run('git', args, binary); assert.equal(result.status, 0, String(result.stderr || 'git failed')); return result.stdout; }
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remote)]; if (local) args.push('-LocalPath', local); const result = run('powershell.exe', args); return { ok: result.status === 0 }; }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); assert(ftps('download', relative, target).ok, `Download failed: ${relative}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target), source: target }; }
function doubleDownload(relative, label) { const a = download(relative, under(path.join(evidence, `${label}-a`), relative)); const b = download(relative, under(path.join(evidence, `${label}-b`), relative)); assert.equal(a.sha256, b.sha256, `Double-download mismatch: ${relative}`); return a; }
function writeJson(name, value) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return fileSha(target); }

async function login(id, password) { assert(id && password); const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: id, password }) }); const body = await response.json().catch(() => null); assert.equal(response.status, 200); assert(body?.token); return body.token; }
async function api(route, token = '') { const response = await fetch(`${base}/api${route}${route.includes('?') ? '&' : '?'}bbs_access_release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' }); const text = await response.text(); assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text)); return { status: response.status, body: JSON.parse(text) }; }
async function smoke(expectDiscovery) { const admin = await login(String(process.env.PROD_UAT_ADMIN_ID || '').trim(), String(process.env.PROD_UAT_ADMIN_PASSWORD || '')); const user = await login(String(process.env.PROD_UAT_USER_ID || '').trim(), String(process.env.PROD_UAT_USER_PASSWORD || '')); const health = await api('/safety-vote/admin/health', admin); assert.equal(health.status, 200); assert.equal(health.body?.data?.ready, true); const result = { health: 200, schemaVersion: health.body?.data?.schemaVersion, responseBodiesRecorded: false }; if (expectDiscovery) { const adminAccess = await api('/bbs/access', admin), userAccess = await api('/bbs/access', user); assert.equal(adminAccess.status, 200); assert.equal(adminAccess.body?.data?.available, true); assert.equal(userAccess.status, 200); assert.equal(typeof userAccess.body?.data?.available, 'boolean'); Object.assign(result, { adminAccess: 200, userAccess: 200, userAvailable: userAccess.body.data.available }); } return result; }

function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const verified = [], candidate = [], restore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), prior = blob(parent, relative), before = doubleDownload(relative, 'remote-before');
        const remoteBytes = fs.readFileSync(before.source), matchesCandidate = normalizedSha(remoteBytes) === normalizedSha(bytes);
        if (matchesCandidate) { verified.push(relative); continue; }
        assert.equal(normalizedSha(remoteBytes), normalizedSha(prior), `Production drift outside approved parent: ${relative}`);
        const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        if (relative.endsWith('.php')) assert.equal(run(php, ['-l', target]).status, 0, `PHP lint failed: ${relative}`);
        const rollback = under(path.join(rollbackRoot, 'runtime-before'), relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback);
        candidate.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) }); restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
    }
    assert.deepStrictEqual(candidate.map(file => file.path), ['api/lib/bbs_rollout_access.php', 'api/index.php', 'public/js/main.js', 'index.html']);
    const manifest = { contract: '2026-10-26-bbs-access-discovery-hotfix-r1', commit, parent, dependencyClosure: runtime.length, unchangedVerified: verified.length, runtime: candidate.map(({ target, ...item }) => item), restore: restore.map(({ rollback, ...item }) => item), schemaChanged: false, businessDataChanged: false };
    return { candidate, restore, verified, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}
function upload() { for (const file of prepared.candidate) { runtimeMutation = true; assert(ftps('upload', file.path, file.target).ok, `Upload failed: ${file.path}`); } }
function verify() { return prepared.candidate.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256, `Post-deploy mismatch: ${file.path}`); return { path: file.path, sha256: remote.sha256 }; }); }
function rollback() { if (!prepared || !runtimeMutation) return { attempted: false }; for (const file of [...prepared.restore].reverse()) { assert.equal(fileSha(file.rollback), file.sha256); assert(ftps('upload', file.path, file.rollback).ok); const remote = doubleDownload(file.path, 'rollback-verified'); assert.equal(remote.sha256, file.sha256); } return { attempted: true, pass: true, restored: prepared.restore.length }; }

(async () => {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation); assert.match(expectedCommit, /^[a-f0-9]{40}$/);
    const commit = String(git(['rev-parse', 'HEAD'])).trim(), parent = String(git(['rev-parse', 'HEAD^'])).trim();
    assert.equal(commit, expectedCommit); assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const before = await smoke(false); prepared = prepare(commit, parent); upload(); const deployed = verify(); const after = await smoke(true);
    const result = { decision: 'PASS_BBS_ACCESS_DISCOVERY_PRODUCTION_HOTFIX', generatedAt: new Date().toISOString(), commit, dependencyClosure: runtime.length, unchangedVerified: prepared.verified.length, deployed, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length }, schemaChanged: false, migrationPerformed: false, businessDataChanged: false, externalDeliveryChanged: false, rollback: { attempted: false } };
    const resultSha256 = writeJson('result.json', result); process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, dependencyClosure: runtime.length, deployed: deployed.map(item => item.path), rollbackPackage: result.rollbackPackage, after, resultSha256 }, null, 2)}\n`);
})().catch(error => { let rollbackResult = { attempted: false }; try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; } const failure = { decision: rollbackResult.attempted && rollbackResult.pass ? 'HOLD_BBS_ACCESS_HOTFIX_FAILED_ROLLED_BACK' : 'HOLD_BBS_ACCESS_HOTFIX_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult }; writeJson('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1; });
