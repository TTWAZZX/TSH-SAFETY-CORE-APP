'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const confirmation = 'DEPLOY_SAFETY_VOTE_OPTION_IMAGE_AUTOSAVE_HOTFIX';
const expectedCommit = String(process.argv[4] || '').trim();
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidence = path.join(root, 'backups', 'production', `safety-vote-option-image-hotfix-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package', 'runtime-before');
const runtime = [
    'public/js/pages/safety-vote-campaign-wizard.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/admin.js',
    'public/js/main.js',
    'index.html',
];
const publicFiles = new Set(runtime.filter(file => !file.endsWith('.php')));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));
const fileSha = file => sha256(fs.readFileSync(file));
let prepared;
let mutationStarted = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`); return relative; }
function under(basePath, relative) { const target = path.resolve(basePath, ...safe(relative).split('/')); assert(target.startsWith(`${path.resolve(basePath)}${path.sep}`)); return target; }
function run(program, args, binary = false, timeout = 300000) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, binary = false) { const result = run('git', args, binary); assert.equal(result.status, 0, String(result.stderr || 'git failed')); return result.stdout; }
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safe(remote)]; if (local) args.push('-LocalPath', local); const result = run('powershell.exe', args); return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') }; }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed: ${relative}: ${result.error}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target), source: target }; }
function doubleDownload(relative, label) { const a = download(relative, under(path.join(evidence, `${label}-a`), relative)); const b = download(relative, under(path.join(evidence, `${label}-b`), relative)); assert.equal(a.sha256, b.sha256, `Double-download mismatch: ${relative}`); return a; }
function writeJson(name, value) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return fileSha(target); }

async function login() { const id = String(process.env.PROD_UAT_ADMIN_ID || '').trim(), password = String(process.env.PROD_UAT_ADMIN_PASSWORD || ''); assert(id && password, 'Production UAT Admin credentials are required'); const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: id, password }) }); const body = await response.json().catch(() => null); assert.equal(response.status, 200, 'Production Admin login failed'); assert(body?.token); return body.token; }
async function api(route, token) { const response = await fetch(`${base}/api/index.php?route=${route}&option_image_release=${Date.now()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const text = await response.text(); assert(!/(?:PHP\s+(?:Warning|Fatal error|Parse error)|undefined function|uncaught (?:error|exception))/i.test(text)); return { status: response.status, body: JSON.parse(text), cache: response.headers.get('cache-control') || '' }; }
async function smoke(token) { const health = await api('safety-vote/admin/health', token), campaigns = await api('safety-vote/admin/campaigns', token); assert.equal(health.status, 200); assert.equal(health.body?.success, true); assert.equal(health.body?.data?.ready, true); assert.equal(health.body?.data?.capabilities?.atomicMedia, true); assert.equal(campaigns.status, 200); assert.equal(campaigns.body?.success, true); assert(/no-store/i.test(health.cache)); return { health: 200, campaigns: 200, schemaVersion: health.body?.data?.schemaVersion, atomicMedia: true, campaignTotal: Number(campaigns.body?.data?.total), responseBodiesRecorded: false }; }

function prepare(commit, parent) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidates = [], restore = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), prior = blob(parent, relative), before = doubleDownload(relative, 'remote-before'), remote = fs.readFileSync(before.source);
        assert.notEqual(normalizedSha(bytes), normalizedSha(prior), `Release file is unchanged from parent: ${relative}`);
        assert.equal(normalizedSha(remote), normalizedSha(prior), `Production drift outside approved parent: ${relative}`);
        const target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        const rollback = under(rollbackRoot, relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback);
        candidates.push({ path: relative, target, bytes: bytes.length, sha256: sha256(bytes) }); restore.push({ path: relative, rollback, bytes: before.bytes, sha256: before.sha256 });
    }
    const manifest = { contract: '2026-10-27-safety-vote-option-image-autosave-hotfix-r2', commit, parent, runtime: candidates.map(({ target, ...item }) => item), restore: restore.map(({ rollback, ...item }) => item), schemaChanged: false, businessDataChanged: false, externalDeliveryChanged: false };
    return { candidates, restore, manifestSha256: writeJson('rollback-manifest.json', manifest) };
}
async function verifyHttps(commit) { const verified = []; for (const file of prepared.candidates.filter(item => publicFiles.has(item.path))) { const response = await fetch(`${base}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }); const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200, `HTTPS read failed: ${file.path}`); assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`); verified.push({ path: file.path, sha256: file.sha256 }); } return verified; }
function rollback() { if (!prepared || !mutationStarted) return { attempted: false }; for (const file of [...prepared.restore].reverse()) { assert.equal(fileSha(file.rollback), file.sha256); assert(ftps('upload', file.path, file.rollback).ok, `Rollback upload failed: ${file.path}`); const remote = doubleDownload(file.path, 'rollback-verified'); assert.equal(remote.sha256, file.sha256); } return { attempted: true, pass: true, restored: prepared.restore.length }; }

(async () => {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation); assert.match(expectedCommit, /^[a-f0-9]{40}$/);
    const commit = String(git(['rev-parse', 'HEAD'])).trim(), parent = String(git(['rev-parse', 'HEAD^'])).trim();
    assert.equal(String(git(['branch', '--show-current'])).trim(), 'main'); assert.equal(commit, expectedCommit); assert.equal(commit, String(git(['rev-parse', 'origin/main'])).trim()); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const token = await login(), before = await smoke(token); prepared = prepare(commit, parent);
    for (const file of prepared.candidates) { mutationStarted = true; const uploaded = ftps('upload', file.path, file.target); assert(uploaded.ok, `Upload failed: ${file.path}: ${uploaded.error}`); }
    const deployed = prepared.candidates.map(file => { const remote = doubleDownload(file.path, 'deployed'); assert.equal(remote.sha256, file.sha256, `Deployed checksum mismatch: ${file.path}`); return { path: file.path, sha256: remote.sha256 }; });
    const https = await verifyHttps(commit), after = await smoke(token);
    const result = { decision: 'PASS_SAFETY_VOTE_OPTION_IMAGE_AUTOSAVE_PRODUCTION_HOTFIX', generatedAt: new Date().toISOString(), commit, deployed, https, before, after, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length }, schemaChanged: false, migrationPerformed: false, businessDataChanged: false, externalDeliveryChanged: false, rollback: { attempted: false } };
    const resultSha256 = writeJson('result.json', result); process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replace(/\\/g, '/'), decision: result.decision, commit, deployed: deployed.map(item => item.path), httpsVerified: https.length, after, rollbackPackage: result.rollbackPackage, resultSha256 }, null, 2)}\n`);
})().catch(error => { let rollbackResult = { attempted: false }; try { rollbackResult = rollback(); } catch (caught) { rollbackResult = { attempted: true, pass: false, error: caught.message }; } const failure = { decision: rollbackResult.attempted && rollbackResult.pass ? 'HOLD_SAFETY_VOTE_OPTION_IMAGE_HOTFIX_FAILED_ROLLED_BACK' : 'HOLD_SAFETY_VOTE_OPTION_IMAGE_HOTFIX_ROLLBACK_INCOMPLETE', error: error.message, rollback: rollbackResult }; writeJson('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1; });
