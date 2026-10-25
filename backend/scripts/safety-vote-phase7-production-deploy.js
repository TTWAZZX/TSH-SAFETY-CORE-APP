'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const confirmation = 'DEPLOY_SAFETY_VOTE_PHASE7_FINAL_PRODUCTION';
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const helperTemplate = path.join(__dirname, 'safety-vote-phase7-production-helper.php.template');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runtime = [
    'api/lib/safety_vote_company_visibility_remediation.php', 'api/lib/safety_vote_gallery.php',
    'api/lib/safety_vote_next_cycle.php', 'api/lib/safety_vote_participation_authorization.php',
    'api/lib/safety_vote_phase1.php', 'api/lib/safety_vote_phase2.php', 'api/lib/safety_vote_phase3.php',
    'api/lib/safety_vote_phase4.php', 'api/lib/safety_vote_phase5.php', 'api/lib/safety_vote_result_release.php',
    'api/lib/safety_vote_work_items.php', 'api/lib/safety_vote_workflow_profile.php',
    'api/handlers/safety_vote_analytics.php', 'api/handlers/safety_vote_company_visibility_remediation.php',
    'api/handlers/safety_vote_eligibility_amendments.php', 'api/handlers/safety_vote_gallery.php',
    'api/handlers/safety_vote_phase10_4.php', 'api/handlers/safety_vote_phase2.php',
    'api/handlers/safety_vote_phase3.php', 'api/handlers/safety_vote_phase4.php',
    'api/handlers/safety_vote_phase5.php', 'api/handlers/safety_vote_phase6.php',
    'api/handlers/safety_vote_phase7.php', 'api/handlers/safety_vote_work_items.php',
    'public/js/utils/safety-vote-auth-image.js', 'public/js/pages/safety-vote-participation-model.mjs',
    'public/js/pages/safety-vote-results-model.mjs', 'public/js/pages/safety-vote-wizard-model.mjs',
    'public/js/pages/safety-vote-workflow-profile.mjs', 'public/js/pages/admin-safety-vote-eligibility.js',
    'public/js/pages/admin-safety-vote-operations.js', 'public/js/pages/admin-safety-vote-planning.js',
    'public/js/pages/admin-safety-vote-results.js', 'public/js/pages/admin-safety-vote-review.js',
    'public/js/pages/admin-safety-vote-ux1.js', 'public/js/pages/admin-safety-vote.js',
    'public/js/pages/safety-vote-campaign-wizard.js', 'public/js/pages/safety-vote-jury-workspace.js',
    'public/js/pages/safety-vote-live-results.js', 'public/js/pages/safety-vote-page-ux1.js',
    'public/js/pages/safety-vote-people-picker.js', 'public/js/pages/safety-vote.js',
    'public/js/api.js', 'public/style.css', 'api/bootstrap.php', 'api/handlers/safety_vote.php', 'api/index.php',
    'public/js/pages/admin.js', 'public/js/main.js', 'index.html',
];
const migrations = [
    '20261024_safety_vote_question_images.sql', '20261024_safety_vote_candidate_submission_gallery.sql',
    '20261024_safety_vote_company_wide_visibility.sql', '20261024_safety_vote_eligibility_removal_policy.sql',
    '20261025_safety_vote_company_visibility_remediation.sql', '20261025_safety_vote_official_topn_next_cycle.sql',
    '20261025_safety_vote_result_release_policy.sql', '20261025_safety_vote_jury_work_items_atomic_media.sql',
];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidence = path.join(root, 'backups', 'production', `safety-vote-phase7-final-deploy-${stamp}`);
const candidateRoot = path.join(evidence, 'candidate');
const rollbackRoot = path.join(evidence, 'rollback-package');
const helperName = `safety-vote-phase7-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
let prepared = null;
let helperUploaded = false;
let htaccessModified = false;
let htaccessBefore = '';
let htaccessSha = '';
let runtimeMutation = false;

function safe(relative) { assert(relative && !relative.includes('\\') && !relative.split('/').includes('..') && !path.posix.isAbsolute(relative), `Unsafe path: ${relative}`); return relative; }
function under(base, relative) { const target = path.resolve(base, ...safe(relative).split('/')); assert(target.startsWith(`${path.resolve(base)}${path.sep}`)); return target; }
function run(program, args, binary = false, timeout = 300000) { return spawnSync(program, args, { cwd: root, encoding: binary ? null : 'utf8', timeout, windowsHide: true }); }
function git(args, binary = false) { const result = run('git', args, binary); assert.equal(result.status, 0, String(result.stderr || 'git failed')); return result.stdout; }
function blob(commit, relative) { return git(['show', `${commit}:${safe(relative)}`], true); }
function ftps(action, remote, local = '') { const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remote ? safe(remote) : '']; if (local) args.push('-LocalPath', local); const result = run('powershell.exe', args); return { ok: result.status === 0, output: String(result.stdout || ''), error: String(result.stderr || '') }; }
function remoteExists(relative) { const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative); const result = ftps('list', parent); assert(result.ok, `Remote list failed: ${parent}`); return result.output.split(/\r?\n/).some(line => line.trim().endsWith(path.posix.basename(relative))); }
function download(relative, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); const result = ftps('download', relative, target); assert(result.ok, `Download failed: ${relative}`); return { bytes: fs.statSync(target).size, sha256: fileSha(target), source: target }; }
function doubleDownload(relative, label, expected = '') { const a = download(relative, under(path.join(evidence, `${label}-a`), relative)); const b = download(relative, under(path.join(evidence, `${label}-b`), relative)); assert.equal(a.sha256, b.sha256, `Double-download mismatch: ${relative}`); if (expected) assert.equal(a.sha256, expected, `Checksum mismatch: ${relative}`); return { path: relative, bytes: a.bytes, sha256: a.sha256, source: a.source }; }

async function login() {
    const id = String(process.env.PROD_UAT_ADMIN_ID || '').trim(), password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
    assert(id && password, 'Production UAT Admin credentials are required');
    const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ employeeId: id, password }) });
    const body = await response.json().catch(() => null); assert.equal(response.status, 200, 'Production Admin login failed'); assert(body?.token); return body.token;
}
async function api(route, token) { const response = await fetch(`${baseUrl}/api/index.php?route=${route}&release=${Date.now()}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const body = await response.json().catch(() => null); return { status: response.status, body, cache: response.headers.get('cache-control') || '' }; }
async function smoke(token, expected) { const health = await api('safety-vote/admin/health', token), campaigns = await api('safety-vote/admin/campaigns', token); assert.equal(health.status, 200); assert.equal(health.body?.success, true); assert.equal(health.body?.data?.ready, true); assert.equal(health.body?.data?.schemaVersion, expected); assert.equal(campaigns.status, 200); assert.equal(campaigns.body?.success, true); assert(/no-store/i.test(health.cache)); return { schemaVersion: expected, campaignTotal: Number(campaigns.body?.data?.total), capabilities: health.body?.data?.capabilities || {}, responseBodiesRecorded: false }; }

function prepare(commit) {
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.mkdirSync(rollbackRoot, { recursive: true });
    const candidate = [], restore = [], remove = [];
    for (const relative of runtime) {
        const bytes = blob(commit, relative), target = under(candidateRoot, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        if (relative.endsWith('.php')) assert.equal(run(php, ['-l', target]).status, 0, `PHP lint failed: ${relative}`);
        candidate.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes), target });
        if (!remoteExists(relative)) { remove.push({ path: relative }); continue; }
        const before = doubleDownload(relative, 'remote-before'), rollback = under(path.join(rollbackRoot, 'runtime-before'), relative); fs.mkdirSync(path.dirname(rollback), { recursive: true }); fs.copyFileSync(before.source, rollback); restore.push({ path: relative, bytes: before.bytes, sha256: before.sha256, rollback });
    }
    const manifest = { contract: '2026-10-26-safety-vote-phase7-final-production-r1', commit, runtime: candidate.map(({ target: ignored, ...item }) => item), restore: restore.map(({ rollback: ignored, ...item }) => item), remove, fullDatabaseBackup: 'full-db-local-sync-20261025172836' };
    const manifestPath = path.join(rollbackRoot, 'manifest.json'); fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); return { candidate, restore, remove, manifestSha256: fileSha(manifestPath) };
}

function prepareHelper() {
    const payload = migrations.map(name => ({ name, sql: fs.readFileSync(path.join(root, 'backend', 'migrations', name)).toString('base64') }));
    const source = fs.readFileSync(helperTemplate, 'utf8').replace('__RUN_TOKEN_SHA256__', sha256(runToken)).replace('__CLEANUP_TOKEN_SHA256__', sha256(cleanupToken)).replace('__GUARD_NAME__', guardName).replace('__MIGRATIONS_JSON_B64__', Buffer.from(JSON.stringify(payload)).toString('base64'));
    const helper = path.join(evidence, helperName), guard = path.join(evidence, guardName); fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(helper, source); fs.writeFileSync(guard, `${fileSha(helper)}\n`); assert.equal(run(php, ['-l', helper]).status, 0, 'Helper PHP lint failed');
    const a = path.join(evidence, 'htaccess-before-a'), b = path.join(evidence, 'htaccess-before-b'); assert(ftps('download', '.htaccess', a).ok && ftps('download', '.htaccess', b).ok); htaccessBefore = a; htaccessSha = fileSha(a); assert.equal(fileSha(b), htaccessSha);
    const original = fs.readFileSync(a, 'utf8'), anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,'; assert(original.includes(anchor)); const rule = `# Exact temporary Safety Vote Phase 7 release helper.\nRewriteRule ^api/${helperName.replace(/\./g, '\\.')}$ - [L]\n\n`; const window = path.join(evidence, 'htaccess-window'); fs.writeFileSync(window, original.replace(anchor, rule + anchor));
    assert(ftps('upload', remoteGuard, guard).ok); assert(ftps('upload', remoteHelper, helper).ok); helperUploaded = true; assert(ftps('upload', '.htaccess', window).ok); htaccessModified = true; const back = path.join(evidence, 'helper-download-back.php'); assert(ftps('download', remoteHelper, back).ok && fileSha(back) === fileSha(helper));
}
async function helper(action, token = runToken) { const response = await fetch(helperUrl, { method: 'POST', redirect: 'manual', headers: { 'X-Safety-Vote-Release-Token': token, 'X-Safety-Vote-Release-Action': action, Accept: 'application/json', 'Cache-Control': 'no-cache' } }); return { status: response.status, body: await response.json().catch(() => null) }; }
function upload() { for (const file of prepared.candidate) { runtimeMutation = true; assert(ftps('upload', file.path, file.target).ok, `Upload failed: ${file.path}`); } }
function verify() { return prepared.candidate.map(file => doubleDownload(file.path, 'deployed', file.sha256)); }
async function verifyHttps(commit) { const selected = prepared.candidate.filter(file => file.path === 'index.html' || file.path === 'public/style.css' || file.path === 'public/js/main.js' || file.path === 'public/js/pages/safety-vote-campaign-wizard.js'); const result = []; for (const file of selected) { const response = await fetch(`${baseUrl}/${file.path}?release=${commit.slice(0, 12)}-${Date.now()}`, { cache: 'no-store' }); const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200); assert.equal(sha256(bytes), file.sha256, `HTTPS checksum mismatch: ${file.path}`); result.push({ path: file.path, sha256: file.sha256 }); } const brandingResponse = await fetch(`${baseUrl}/api/index.php?route=public/branding&release=${Date.now()}`, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' }); const branding = await brandingResponse.json().catch(() => null); assert.equal(brandingResponse.status, 200, 'Public Branding endpoint failed'); assert.equal(branding?.success, true, 'Public Branding response failed'); assert(branding?.data && !Array.isArray(branding.data), 'Public Branding data must be an object'); assert.equal(typeof branding.data.appName, 'string', 'Public Branding appName missing'); assert.equal(typeof branding.data.loginBackgroundFit, 'string', 'Public Branding image-fit missing'); result.push({ path: 'api/public/branding', status: brandingResponse.status, contractVerified: true }); return result; }
function rollbackRuntime() { if (!prepared || !runtimeMutation) return { attempted: false }; for (const file of [...prepared.restore].reverse()) { assert.equal(fileSha(file.rollback), file.sha256); assert(ftps('upload', file.path, file.rollback).ok); } for (const file of prepared.remove) if (remoteExists(file.path)) assert(ftps('delete', file.path).ok); return { attempted: true, pass: true, restored: prepared.restore.length, removed: prepared.remove.length }; }
async function cleanup() { let response = null; if (helperUploaded) response = await helper('cleanup', cleanupToken).catch(() => null); await new Promise(resolve => setTimeout(resolve, 1000)); if (htaccessModified) { assert(ftps('upload', '.htaccess', htaccessBefore).ok); const verifyPath = path.join(evidence, 'htaccess-restored'); assert(ftps('download', '.htaccess', verifyPath).ok && fileSha(verifyPath) === htaccessSha); htaccessModified = false; } const list = ftps('list', 'api'); const zero = list.ok && !list.output.includes(helperName) && !list.output.includes(guardName); assert.equal(response?.status, 200); assert(zero); helperUploaded = false; return { htaccessRestored: true, helperResidue: false }; }
function write(name, value) { fs.mkdirSync(evidence, { recursive: true }); const target = path.join(evidence, name); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return fileSha(target); }

async function main() {
    assert.equal(process.argv[2], '--execute'); assert.equal(process.argv[3], confirmation);
    const branch = String(git(['branch', '--show-current'])).trim(), commit = String(git(['rev-parse', 'HEAD'])).trim(), origin = String(git(['rev-parse', 'origin/main'])).trim(); assert.equal(branch, 'main'); assert.equal(commit, origin); assert.equal(String(git(['status', '--porcelain'])).trim(), '');
    const token = await login(), before = await smoke(token, '2026-10-20-eligibility-amendments-r1'); prepared = prepare(commit); prepareHelper();
    assert.equal((await fetch(helperUrl)).status, 405); assert.equal((await helper('inspect', 'invalid')).status, 401);
    const migration = await helper('migrate'); assert.equal(migration.status, 200, JSON.stringify(migration.body)); assert.equal(migration.body?.protectedCountsPreserved, true);
    const activation = await helper('enable'); assert.equal(activation.status, 200, JSON.stringify(activation.body));
    upload(); const deployed = verify(), https = await verifyHttps(commit), after = await smoke(token, '2026-10-25-jury-work-items-atomic-media-r1'); assert.equal(after.capabilities?.juryWorkItems, true); assert.equal(after.capabilities?.atomicMedia, true); const cleaned = await cleanup();
    const result = { decision: 'PASS_SAFETY_VOTE_PHASE7_FINAL_PRODUCTION_DEPLOYMENT', generatedAt: new Date().toISOString(), commit, runtimeFiles: runtime.length, migration: migration.body, activation: activation.body, before, after, deployment: { doubleDownloadVerified: deployed.length, httpsVerified: https }, rollbackPackage: { manifestSha256: prepared.manifestSha256, restoreFiles: prepared.restore.length, removeOnRollback: prepared.remove.length, fullDatabaseBackup: 'backups/production/full-db-local-sync-20261025172836' }, cleanup: cleaned, externalDeliveryChanged: false, rollback: { attempted: false } }; const digest = write('result.json', result); process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replaceAll('\\', '/'), decision: result.decision, commit, runtimeFiles: runtime.length, migration: { schemaVersion: migration.body.schemaVersion, protectedCountsPreserved: true }, activation: result.activation, after: result.after, rollbackPackage: result.rollbackPackage, cleanup: cleaned, resultSha256: digest }, null, 2)}\n`);
}

main().catch(async error => { let rollback = { attempted: false }, cleanupResult = { helperResidue: true }; try { rollback = rollbackRuntime(); } catch (caught) { rollback = { attempted: true, pass: false, error: caught.message }; } try { cleanupResult = await cleanup(); } catch (caught) { cleanupResult = { helperResidue: true, error: caught.message }; } const failure = { decision: rollback.attempted && rollback.pass && cleanupResult.helperResidue === false ? 'HOLD_DEPLOYMENT_FAILED_RUNTIME_ROLLED_BACK_SCHEMA_ADDITIVE_RETAINED' : 'HOLD_DEPLOYMENT_ROLLBACK_INCOMPLETE', error: error.message, rollback, cleanup: cleanupResult }; write('failure.json', failure); console.error(JSON.stringify(failure)); process.exitCode = 1; });
