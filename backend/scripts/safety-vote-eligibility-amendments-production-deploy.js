'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const productionBaseline = 'ef47230aa705397231c29f988418be3be9cea363';
const confirmation = 'DEPLOY_SAFETY_VOTE_ELIGIBILITY_AMENDMENTS';
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const helperTemplate = path.join(__dirname, 'safety-vote-eligibility-amendments-production-helper.php.template');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runtimePaths = [
    'api/handlers/safety_vote.php',
    'api/handlers/safety_vote_eligibility_amendments.php',
    'api/handlers/safety_vote_phase2.php',
    'api/handlers/safety_vote_phase3.php',
    'api/handlers/safety_vote_phase5.php',
    'api/handlers/safety_vote_phase6.php',
    'api/handlers/safety_vote_phase7.php',
    'api/index.php',
    'api/lib/safety_vote_phase5.php',
    'index.html',
    'public/js/main.js',
    'public/js/pages/admin-safety-vote-eligibility.js',
    'public/js/pages/admin-safety-vote-operations.js',
    'public/js/pages/admin-safety-vote-planning.js',
    'public/js/pages/admin-safety-vote-results.js',
    'public/js/pages/admin-safety-vote-ux1.js',
    'public/js/pages/admin.js',
    'public/js/pages/safety-vote-live-results.js',
    'public/js/pages/safety-vote-page-ux1.js',
    'public/js/pages/safety-vote.js',
    'public/js/utils/safety-vote-auth-image.js',
    'public/style.css',
];
const newPaths = new Set(['public/js/utils/safety-vote-auth-image.js']);
const publicPaths = runtimePaths.filter(relative => relative === 'index.html' || relative.startsWith('public/'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-eligibility-amendments-deploy-${stamp}`);
const candidateRoot = path.join(evidenceRoot, 'candidate');
const rollbackRoot = path.join(evidenceRoot, 'rollback-package');
const helperName = `safety-vote-eligibility-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `safety-vote-eligibility-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const normalizedSha = value => sha256(Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n'));
let prepared = null;
let helperUploaded = false;
let htaccessModified = false;
let htaccessOriginal = '';
let htaccessSha = '';
let schemaMigrated = false;
let runtimeMutation = false;

function safeRelative(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`); return relative; }
function under(base, relative) { const resolvedBase = path.resolve(base); const target = path.resolve(base, ...safeRelative(relative).split('/')); assert(target.startsWith(`${resolvedBase}${path.sep}`), `Escaped guarded root: ${relative}`); return target; }
function run(program, args, { binary = false, timeout = 240000 } = {}) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, options) { const result = run('git', args, options); assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`); return result.stdout; }
function gitBlob(revision, relative) { return git(['show', `${revision}:${safeRelative(relative)}`], { binary: true }); }
function gitPathExists(revision, relative) { return run('git', ['cat-file', '-e', `${revision}:${safeRelative(relative)}`]).status === 0; }
function ftps(action, remotePath, localPath = null) { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remotePath ? safeRelative(remotePath) : '']; if (localPath) args.push('-LocalPath', localPath); const result = run('powershell.exe', args); return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') }; }
function remoteExists(relative) { const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative); const result = ftps('list', parent); assert(result.ok, `Remote list failed: ${parent}`); return result.output.split(/\r?\n/).some(line => line.trim().endsWith(path.posix.basename(relative))); }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed: ${relative}: ${result.error || result.output}`); return { path: relative, bytes: fs.statSync(target).size, sha256: fileSha(target), normalizedSha256: normalizedSha(fs.readFileSync(target)), firstPath: target }; }
function doubleDownload(relative, label, expectedSha = null) { const first = download(relative, under(path.join(evidenceRoot, `${label}-a`), relative)); const second = download(relative, under(path.join(evidenceRoot, `${label}-b`), relative)); assert.equal(first.sha256, second.sha256, `FTPS double-download mismatch: ${relative}`); if (expectedSha) assert.equal(first.sha256, expectedSha, `Deployed checksum mismatch: ${relative}`); return { ...first, doubleDownloadMatched: true }; }

function prepare(commit, tree) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidate = [], restoreFiles = [], removeOnRollback = [], remoteBefore = [];
    for (const relative of runtimePaths) {
        const blob = gitBlob(commit, relative), candidatePath = under(candidateRoot, relative); fs.mkdirSync(path.dirname(candidatePath), { recursive: true }); fs.writeFileSync(candidatePath, blob);
        if (relative.endsWith('.php')) { const lint = run(php, ['-l', candidatePath]); assert.equal(lint.status, 0, `PHP lint failed: ${relative}`); }
        candidate.push({ path: relative, bytes: blob.length, sha256: sha256(blob), candidatePath });
        if (newPaths.has(relative)) { assert.equal(gitPathExists(productionBaseline, relative), false, `Baseline unexpectedly contains new path: ${relative}`); assert.equal(remoteExists(relative), false, `Expected new remote path already exists: ${relative}`); removeOnRollback.push({ path: relative }); remoteBefore.push({ path: relative, absent: true }); continue; }
        const before = doubleDownload(relative, 'remote-before'); assert.equal(before.normalizedSha256, normalizedSha(gitBlob(productionBaseline, relative)), `Production drift from ${productionBaseline}: ${relative}`);
        const rollbackPath = under(path.join(rollbackRoot, 'runtime-before'), relative); fs.mkdirSync(path.dirname(rollbackPath), { recursive: true }); fs.copyFileSync(before.firstPath, rollbackPath); restoreFiles.push({ path: relative, bytes: before.bytes, sha256: before.sha256, rollbackPath }); remoteBefore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, doubleDownloadMatched: true });
    }
    const manifest = { contract: '2026-10-20-safety-vote-eligibility-media-runtime-r2', productionBaseline, candidate: { commit, tree }, runtimePaths, restoreFiles: restoreFiles.map(({ rollbackPath: ignored, ...file }) => file), removeOnRollback, schemaRollbackPolicy: 'No schema mutation in this incremental runtime release.' };
    const manifestPath = path.join(rollbackRoot, 'rollback-manifest.json'); fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { candidate, restoreFiles, removeOnRollback, remoteBefore, manifestSha256: fileSha(manifestPath) };
}

function prepareHelper() {
    const migration = fs.readFileSync(path.join(root, 'backend', 'migrations', '20261020_safety_vote_eligibility_amendments.sql')).toString('base64');
    const source = fs.readFileSync(helperTemplate, 'utf8').replace('__RUN_TOKEN_SHA256__', sha256(runToken)).replace('__CLEANUP_TOKEN_SHA256__', sha256(cleanupToken)).replace('__GUARD_NAME__', guardName).replace('__BACKUP_ID__', backupId).replace('__ELIGIBILITY_MIGRATION_B64__', migration);
    const helperPath = path.join(evidenceRoot, helperName), guardPath = path.join(evidenceRoot, guardName); fs.mkdirSync(evidenceRoot, { recursive: true }); fs.writeFileSync(helperPath, source); fs.writeFileSync(guardPath, `${fileSha(helperPath)}\n`); assert.equal(run(php, ['-l', helperPath]).status, 0, 'Helper PHP lint failed');
    const first = path.join(evidenceRoot, 'htaccess-before-a'), second = path.join(evidenceRoot, 'htaccess-before-b'); assert(ftps('download', '.htaccess', first).ok && ftps('download', '.htaccess', second).ok, '.htaccess download failed'); htaccessOriginal = first; htaccessSha = fileSha(first); assert.equal(fileSha(second), htaccessSha, '.htaccess double-download mismatch');
    const original = fs.readFileSync(first, 'utf8'), anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,'; assert(original.includes(anchor), 'Temporary helper rewrite anchor missing'); const rule = `# Exact temporary Safety Vote eligibility deployment helper exception.\nRewriteRule ^api/${helperName.replace(/\./g, '\\.')}$ - [L]\n\n`; const windowPath = path.join(evidenceRoot, 'htaccess-helper-window'); fs.writeFileSync(windowPath, original.replace(anchor, rule + anchor));
    assert(ftps('upload', remoteGuard, guardPath).ok, 'Helper guard upload failed'); assert(ftps('upload', remoteHelper, helperPath).ok, 'Helper upload failed'); helperUploaded = true; assert(ftps('upload', '.htaccess', windowPath).ok, '.htaccess helper window upload failed'); htaccessModified = true;
    const verified = path.join(evidenceRoot, 'helper-download-back.php'); assert(ftps('download', remoteHelper, verified).ok && fileSha(verified) === fileSha(helperPath), 'Helper upload verification failed');
}

async function helper(action, token = runToken) { const response = await fetch(helperUrl, { method: 'POST', redirect: 'manual', headers: { 'X-Safety-Vote-Release-Token': token, 'X-Safety-Vote-Release-Action': action, Accept: 'application/json', 'Cache-Control': 'no-cache' } }); return { status: response.status, data: await response.json().catch(() => null) }; }
async function migrate() { assert.equal((await fetch(helperUrl, { method: 'GET', redirect: 'manual' })).status, 405); assert.equal((await helper('migrate', 'invalid')).status, 401); const response = await helper('migrate'); assert.equal(response.status, 200, `Migration failed: ${response.data?.reason || response.data?.code || ''}`); assert.equal(response.data?.schemaReady, true); schemaMigrated = true; const relative = String(response.data?.backup?.relativePath || ''); assert(/^api\/private\/safety-vote-eligibility-[a-f0-9]+\/safety-vote-eligibility-amendments-rollback\.sql$/.test(relative), 'Unexpected schema rollback path'); const first = download(relative, path.join(evidenceRoot, 'schema-rollback-a.sql')), second = download(relative, path.join(evidenceRoot, 'schema-rollback-b.sql')); assert.equal(first.sha256, second.sha256); assert.equal(first.sha256, response.data.backup.sha256); const publicProbe = await fetch(`${baseUrl}/${relative}`, { redirect: 'manual' }); assert([401, 403, 404].includes(publicProbe.status), 'Private rollback artifact is publicly exposed'); return { ...response.data, backup: { path: relative, sha256: first.sha256, bytes: first.bytes, publicStatus: publicProbe.status } }; }
async function activate() { const response = await helper('activate'); assert.equal(response.status, 200, `Feature activation failed: ${response.data?.reason || response.data?.code || ''}`); assert.equal(response.data?.featureEnabled, true); return response.data; }
async function resolveAuth() { if (bearer && bearer.split('.').length === 3) { const response = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health`, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }); if (response.status === 200) return { token: bearer, source: 'existing_bearer', loginPerformed: false }; } assert(adminId && adminPassword, 'Production Admin credentials are required when bearer is unavailable'); const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ employeeId: adminId, password: adminPassword }) }); const body = await response.json().catch(() => null); assert.equal(response.status, 200, 'Production Admin login failed'); assert(body?.token, 'Production Admin token missing'); return { token: body.token, source: 'ephemeral_admin_login', loginPerformed: true }; }
async function smoke(auth, expectedSchema = null) { const requests = []; let campaignId = null; for (const route of ['safety-vote/admin/health', 'safety-vote/admin/campaigns']) { const response = await fetch(`${baseUrl}/api/index.php?route=${route}&release=${Date.now()}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const body = await response.json().catch(() => null), cache = response.headers.get('cache-control') || ''; assert.equal(response.status, 200, `Authenticated smoke failed: ${route}: ${body?.code || ''}`); assert.equal(body?.success, true); assert(/no-store/i.test(cache), `No-store policy missing: ${route}`); if (route.endsWith('/health')) { assert.equal(body.data?.ready, true); assert.equal(body.data?.moduleEnabled, true); if (expectedSchema) assert.equal(body.data?.schemaVersion, expectedSchema); } else campaignId = Number(body.data?.rows?.[0]?.id || body.data?.campaigns?.[0]?.id || 0) || null; requests.push({ route, status: 200, method: 'GET', responseBodyRecorded: false, noStore: true, privateDirective: /private/i.test(cache) }); }
    if (expectedSchema && campaignId) { const route = `safety-vote/admin/campaigns/${campaignId}/eligibility/amendments`; const response = await fetch(`${baseUrl}/api/index.php?route=${route}&release=${Date.now()}`, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const body = await response.json().catch(() => null); assert.equal(response.status, 200, `Eligibility amendment read smoke failed: ${body?.code || ''}`); assert.equal(body?.success, true); requests.push({ route, status: 200, method: 'GET', responseBodyRecorded: false }); }
    const anonymous = await fetch(`${baseUrl}/api/index.php?route=safety-vote/admin/health&release=${Date.now()}`, { cache: 'no-store' }); assert.equal(anonymous.status, 401, 'Anonymous Admin health must remain denied'); return { requests, anonymousDenied: true, authenticationSource: auth.source, loginPerformed: auth.loginPerformed, credentialRecorded: false, tokenRecorded: false }; }
function upload() { for (const file of prepared.candidate) { runtimeMutation = true; assert(ftps('upload', file.path, file.candidatePath).ok, `Upload failed: ${file.path}`); } }
function verify() { return prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256)); }
async function verifyHttps(commit) { const map = new Map(prepared.candidate.map(file => [file.path, file])); const verified = []; for (const relative of publicPaths) { const response = await fetch(`${baseUrl}/${relative}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }); assert.equal(response.status, 200, `HTTPS failed: ${relative}`); const body = Buffer.from(await response.arrayBuffer()); assert.equal(sha256(body), map.get(relative).sha256, `HTTPS checksum mismatch: ${relative}`); verified.push({ path: relative, status: 200, sha256: sha256(body) }); } return verified; }
function rollbackRuntime() { if (!prepared || !runtimeMutation) return { attempted: false }; for (const file of [...prepared.restoreFiles].reverse()) { assert.equal(fileSha(file.rollbackPath), file.sha256); assert(ftps('upload', file.path, file.rollbackPath).ok, `Rollback upload failed: ${file.path}`); } for (const file of prepared.removeOnRollback) { if (remoteExists(file.path)) assert(ftps('delete', file.path).ok, `Rollback delete failed: ${file.path}`); assert.equal(remoteExists(file.path), false, `Rollback residue: ${file.path}`); } for (const file of prepared.restoreFiles) doubleDownload(file.path, 'rollback-verified', file.sha256); return { attempted: true, pass: true, restored: prepared.restoreFiles.length, removed: prepared.removeOnRollback.length }; }
async function rollbackSchema() { if (!schemaMigrated) return { attempted: false }; const response = await helper('rollback'); const pass = response.status === 200 && response.data?.schemaVersionRestored === true; if (pass) schemaMigrated = false; return { attempted: true, pass, status: response.status, evidencePreserved: response.data?.evidencePreserved ?? null }; }
async function cleanup() { if (!helperUploaded && !htaccessModified) return { attempted: false, zeroResidue: true }; let response = null; if (helperUploaded) response = await helper('cleanup', cleanupToken).catch(() => null); await new Promise(resolve => setTimeout(resolve, 1200)); if (htaccessModified) { assert(ftps('upload', '.htaccess', htaccessOriginal).ok, '.htaccess restore failed'); const verified = path.join(evidenceRoot, 'htaccess-restored'); assert(ftps('download', '.htaccess', verified).ok && fileSha(verified) === htaccessSha, '.htaccess restore mismatch'); htaccessModified = false; } const listing = ftps('list', 'api'), privateListing = ftps('list', `api/private/${backupId}`); const zeroResidue = listing.ok && !listing.output.includes(helperName) && !listing.output.includes(guardName) && !privateListing.ok; assert.equal(response?.status, 200, 'Helper cleanup failed'); assert(zeroResidue, 'Temporary helper residue remains'); helperUploaded = false; return { attempted: true, status: 200, htaccessSha256: htaccessSha, zeroResidue: true }; }
function writeEvidence(name, value) { fs.mkdirSync(evidenceRoot, { recursive: true }); const target = path.join(evidenceRoot, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); const digest = fileSha(target); fs.writeFileSync(path.join(evidenceRoot, `${name}.sha256`), `${digest}  ${name}\n`); return digest; }

async function main() {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation, `Confirmation token must be ${confirmation}`);
    const branch = String(git(['branch', '--show-current'])).trim(), commit = String(git(['rev-parse', 'HEAD'])).trim(), origin = String(git(['rev-parse', 'origin/main'])).trim(), tree = String(git(['rev-parse', 'HEAD^{tree}'])).trim(); assert.equal(branch, 'main'); assert.equal(commit, origin, 'Candidate must be pushed'); assert.equal(String(git(['status', '--porcelain'])).trim(), '', 'Worktree must be clean');
    const auth = await resolveAuth(), smokeBefore = await smoke(auth, '2026-10-20-eligibility-amendments-r1'); prepared = prepare(commit, tree); upload(); const deployed = verify(), https = await verifyHttps(commit); const smokeAfter = await smoke(auth, '2026-10-20-eligibility-amendments-r1'); const cleaned = await cleanup();
    const migration = { attempted: false, alreadyApplied: true, schemaVersion: '2026-10-20-eligibility-amendments-r1', sourceEvidence: 'safety-vote-eligibility-amendments-deploy-20261020033559' }, activation = { attempted: false, alreadyEnabled: true };
    const result = { contract: '2026-10-20-safety-vote-eligibility-media-runtime-r2', generatedAt: new Date().toISOString(), decision: 'PASS_SAFETY_VOTE_ELIGIBILITY_MEDIA_RUNTIME_PRODUCTION_DEPLOYMENT', candidate: { branch, commit, tree, productionBaseline, runtimePaths: runtimePaths.length }, remoteBefore: prepared.remoteBefore, migration, activation, deployment: { uploaded: runtimePaths, doubleDownloadVerified: deployed.length, httpsVerified: https.length }, smokeBefore, smokeAfter, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restoreFiles.length, removeOnRollback: prepared.removeOnRollback.length, schemaRollbackSha256: null, verified: true }, cleanup: cleaned, posture: { externalDelivery: false, permissionsChanged: false, schemaChanged: false, businessRowsMutated: false }, rollback: { attempted: false } };
    const resultSha256 = writeEvidence('result.json', result); process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, migration: result.migration, activation: result.activation, deployment: result.deployment, smokeAfter: result.smokeAfter, rollbackPackage: result.rollbackPackage, cleanup: result.cleanup, resultSha256 }, null, 2)}\n`);
}

main().catch(async error => { let runtimeRollback = { attempted: false }, schemaRollback = { attempted: false }, cleaned = { zeroResidue: false }; try { runtimeRollback = rollbackRuntime(); } catch (rollbackError) { runtimeRollback = { attempted: true, pass: false, error: rollbackError.message }; } try { schemaRollback = await rollbackSchema(); } catch (rollbackError) { schemaRollback = { attempted: true, pass: false, error: rollbackError.message }; } try { cleaned = await cleanup(); } catch (cleanupError) { cleaned = { zeroResidue: false, error: cleanupError.message }; } const failure = { generatedAt: new Date().toISOString(), decision: (runtimeRollback.attempted && !runtimeRollback.pass) || (schemaRollback.attempted && !schemaRollback.pass) || cleaned.zeroResidue !== true ? 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE' : 'HOLD_DEPLOYMENT_FAILED_ROLLED_BACK', error: String(error.message || error), runtimeRollback, schemaRollback, cleanup: cleaned }; const failureSha256 = writeEvidence('failure.json', failure); process.stderr.write(`${JSON.stringify({ ...failure, evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), failureSha256 }, null, 2)}\n`); process.exitCode = 1; });
