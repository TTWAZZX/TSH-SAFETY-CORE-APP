'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const candidateManifestPath = path.join(root, 'docs', 'safety-vote-phase94-candidate-manifest.json');
const rollbackRoot = path.join(root, 'backups', 'production', 'safety-vote-phase95-preflight-20261009035440');
const rollbackManifestPath = path.join(rollbackRoot, 'rollback-package', 'rollback-manifest.json');
const rollbackArchivePath = path.join(rollbackRoot, 'safety-vote-phase95-runtime-rollback.zip');
const protectedPostcheckRoot = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009050056');
const activationTemplatePath = path.join(__dirname, 'safety-vote-phase95b-enable-helper.php.template');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95b-preflight-${stamp}`);
const expected = {
  commit: '021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b',
  tree: '0cf097bc429ad0f4ae348b820fd9504c5ff538a4',
  manifestSha256: '3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c',
  runtimeSha256: 'd4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc',
  rollbackManifestSha256: '31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd',
  rollbackArchiveSha256: 'df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394',
  rollbackArchiveBytes: 306679,
  protectedPostcheckSha256: '4de2dc781fbe36a2dd00706ae4b245576cdc9be98c98ee3a800db0f9322a0ae7'
};
const safetyPermissions = ['SAFETY_VOTE_VIEW','SAFETY_VOTE_CREATE','SAFETY_VOTE_MANAGE','SAFETY_VOTE_ELIGIBILITY_MANAGE','SAFETY_VOTE_SUBMISSION_REVIEW','SAFETY_VOTE_JURY','SAFETY_VOTE_RESULT_VIEW','SAFETY_VOTE_CERTIFY','SAFETY_VOTE_EXPORT','SAFETY_VOTE_AUDIT_VIEW','SAFETY_VOTE_ADMIN'];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));

function safeRelative(relative) {
  assert(typeof relative === 'string' && relative && !path.posix.isAbsolute(relative) && !relative.includes('\\') && !relative.split('/').includes('..'), `Unsafe path: ${relative}`);
  return relative;
}
function under(base, relative) {
  const target = path.resolve(base, ...safeRelative(relative).split('/'));
  assert(target.startsWith(path.resolve(base) + path.sep), `Path escaped root: ${relative}`);
  return target;
}
function ftps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', safeRelative(remotePath)];
  if (localPath) args.push('-LocalPath', localPath);
  const result = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', timeout: 90000, windowsHide: true });
  return { ok: result.status === 0, status: result.status };
}
async function getJson(relative, token) {
  const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'TSH-Safety-Vote-Phase95B-ReadOnly-Preflight/1.0' } });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return { response, body, meta: { path: relative, method: 'GET', status: response.status, cacheControl: response.headers.get('cache-control'), contentType: response.headers.get('content-type'), responseBodyRecorded: false } };
}
function validateInputs() {
  assert.strictEqual(fileSha(candidateManifestPath), expected.manifestSha256, 'Candidate manifest checksum mismatch');
  assert.strictEqual(fileSha(rollbackManifestPath), expected.rollbackManifestSha256, 'Rollback manifest checksum mismatch');
  assert.strictEqual(fileSha(rollbackArchivePath), expected.rollbackArchiveSha256, 'Rollback archive checksum mismatch');
  assert.strictEqual(fs.statSync(rollbackArchivePath).size, expected.rollbackArchiveBytes, 'Rollback archive byte count mismatch');
  assert.strictEqual(fileSha(path.join(protectedPostcheckRoot, 'result.json')), expected.protectedPostcheckSha256, 'Protected postcheck checksum mismatch');
  assert(fs.existsSync(activationTemplatePath), 'Activation helper review candidate is missing');
  const manifest = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  assert.strictEqual(manifest.sourceCommit, expected.commit);
  assert.strictEqual(manifest.sourceTree, expected.tree);
  assert.strictEqual(manifest.immutable, true);
  assert.strictEqual(manifest.digests.runtimeScopeSha256, expected.runtimeSha256);
  assert.strictEqual(manifest.groups.runtime.length, 41);
  const rollback = JSON.parse(fs.readFileSync(rollbackManifestPath, 'utf8'));
  assert.strictEqual(rollback.restoreFiles.length, 25);
  assert.strictEqual(rollback.removeOnRollback.length, 16);
  const postcheck = JSON.parse(fs.readFileSync(path.join(protectedPostcheckRoot, 'result.json'), 'utf8'));
  const sql = fs.readFileSync(path.join(protectedPostcheckRoot, 'database-download-a', 'safety-vote-phase82-scoped.sql'), 'utf8');
  assert.strictEqual(postcheck.production?.schema?.settings?.moduleEnabled, '0');
  assert.strictEqual(Number(postcheck.production?.schema?.tableCount), 39);
  assert.strictEqual(Number(postcheck.production?.schema?.businessRowCount), 0);
  assert(Object.values(postcheck.production?.providers || {}).every(item => item.configured === false));
  assert(/'phase7_integrations_enabled','0'/.test(sql), 'Protected postcheck does not prove integrations disabled');
  assert.strictEqual(postcheck.helper?.zeroResidue, true);
  assert.strictEqual(postcheck.backupVerification?.restoreVerified, true);
  const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
  assert(token, 'Existing Production bearer token is required');
  assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
  return { manifest, token, postcheck };
}
function verifyRuntime(runtime) {
  const copyA = path.join(evidenceRoot, 'runtime-download-a');
  const copyB = path.join(evidenceRoot, 'runtime-download-b');
  const records = [];
  for (const file of runtime) {
    const a = under(copyA, file.path), b = under(copyB, file.path);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.mkdirSync(path.dirname(b), { recursive: true });
    assert(ftps('download', file.path, a).ok, `Runtime download A failed: ${file.path}`);
    assert(ftps('download', file.path, b).ok, `Runtime download B failed: ${file.path}`);
    const shaA = fileSha(a), shaB = fileSha(b);
    assert.strictEqual(shaA, shaB, `Runtime double-download mismatch: ${file.path}`);
    assert.strictEqual(shaA, file.sha256, `Runtime differs from immutable candidate: ${file.path}`);
    records.push({ path: file.path, bytes: fs.statSync(a).size, sha256: shaA, doubleDownloadMatched: true });
  }
  return records;
}
function roleCounts(employees) {
  const counts = {};
  for (const employee of employees) {
    const role = String(employee?.Role || '').trim().toUpperCase() || 'EMPTY';
    counts[role] = (counts[role] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
function summarizeAccess(matrixData, employees, security) {
  const counts = roleCounts(employees);
  const matrix = matrixData.matrix || {};
  const roles = Array.isArray(matrixData.roles) ? matrixData.roles.map(role => String(role).toUpperCase()) : [];
  const rolePermissions = {};
  for (const role of roles) {
    const granted = safetyPermissions.filter(permission => Number(matrix?.[role]?.[permission] || 0) === 1);
    rolePermissions[role] = { accountCount: Number(counts[role] || 0), grantedPermissionCount: granted.length, grantedPermissions: granted };
  }
  const healthAccessAccounts = roles.reduce((sum, role) => sum + (role === 'ADMIN' || rolePermissions[role].grantedPermissions.includes('SAFETY_VOTE_VIEW') ? Number(counts[role] || 0) : 0), 0);
  const anySafetyPermissionAccounts = roles.reduce((sum, role) => sum + (role === 'ADMIN' || rolePermissions[role].grantedPermissionCount > 0 ? Number(counts[role] || 0) : 0), 0);
  const userOverrides = Number(security?.permissionMatrix?.userOverrides || 0);
  return {
    employeeTotal: employees.length,
    roleCounts: counts,
    rolePermissions,
    adminBypassAccounts: Number(counts.ADMIN || 0),
    roleDerivedHealthAccessAccounts: healthAccessAccounts,
    roleDerivedAnySafetyPermissionAccounts: anySafetyPermissionAccounts,
    userOverrideRows: userOverrides,
    orphanOverrideRows: Number(security?.permissionMatrix?.orphanOverrides || 0),
    exactEffectiveAccountCountProvable: userOverrides === 0,
    personalIdentifiersRecorded: false
  };
}

async function main() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const { manifest, token } = validateInputs();
  const runtime = verifyRuntime(manifest.groups.runtime);
  const [health, systemHealth, permissionMatrix, employees] = await Promise.all([
    getJson('/api/index.php?route=safety-vote/admin/health', token),
    getJson('/api/index.php?route=admin/system-health', token),
    getJson('/api/index.php?route=admin/permissions/matrix', token),
    getJson('/api/index.php?route=admin/employees', token)
  ]);
  for (const item of [health, systemHealth, permissionMatrix, employees]) {
    assert.strictEqual(item.response.status, 200, `Authenticated GET failed: ${item.meta.path}`);
    assert.strictEqual(item.body?.success, true, `Authenticated GET was unsuccessful: ${item.meta.path}`);
  }
  assert.strictEqual(health.body?.data?.ready, true, 'Safety Vote health is not ready');
  assert.strictEqual(health.body?.data?.moduleEnabled, false, 'Safety Vote module is not disabled');
  assert.strictEqual(health.body?.data?.schemaVersion, '2026-10-08-phase7-r1', 'Safety Vote schema version mismatch');
  const security = systemHealth.body?.data?.securityHealth;
  assert(security?.readOnly === true, 'System security health is not marked read-only');
  const employeeRows = Array.isArray(employees.body?.data) ? employees.body.data : [];
  const access = summarizeAccess(permissionMatrix.body?.data || {}, employeeRows, security);
  const blockers = ['PILOT_COHORT_NOT_EXPLICITLY_APPROVED'];
  if (access.userOverrideRows > 0) blockers.push('USER_PERMISSION_OVERRIDE_SCOPE_NOT_DISCLOSED_BY_READ_ONLY_API');
  if (!access.exactEffectiveAccountCountProvable) blockers.push('EXACT_EFFECTIVE_ACCESS_COUNT_NOT_PROVABLE');
  if (access.roleDerivedHealthAccessAccounts === 0) blockers.push('NO_ROLE_DERIVED_PILOT_ACCESS');
  const result = {
    contract: '2026-10-09-safety-vote-phase9.5b-r1', generatedAt: new Date().toISOString(), phase: 'bounded_pilot_enablement_preflight',
    candidate: { commit: expected.commit, tree: expected.tree, manifestSha256: expected.manifestSha256, runtimeSha256: expected.runtimeSha256, runtimeFiles: runtime.length, productionDoubleDownloadVerified: runtime.every(row => row.doubleDownloadMatched) },
    rollback: { ready: true, restoreFileCount: 25, removeProvenNewCount: 16, manifestSha256: expected.rollbackManifestSha256, archiveSha256: expected.rollbackArchiveSha256, archiveBytes: expected.rollbackArchiveBytes },
    productionState: { schemaVersion: health.body.data.schemaVersion, tables: 39, businessRows: 0, moduleEnabled: false, integrationsEnabled: false, configuredExternalProviders: 0, sourceProtectedEvidence: path.relative(root, protectedPostcheckRoot).replaceAll('\\', '/'), freshHealthGet: true },
    authenticatedGets: [health.meta, systemHealth.meta, permissionMatrix.meta, employees.meta],
    access,
    activationCandidate: { path: path.relative(root, activationTemplatePath).replaceAll('\\', '/'), sha256: fileSha(activationTemplatePath), authorizedForProduction: false, mutationScope: 'SafetyVote_Settings.module_enabled 0 -> 1 only', integrationsRemainDisabled: true, exactRollbackBackupGeneratedBeforeMutation: true },
    constraints: { loginAttempted: false, settingsChanged: false, permissionsChanged: false, businessDataChanged: false, emailOrNotificationSent: false, deploymentPerformed: false, pushPerformed: false, personalDataRecorded: false, rawResponseBodiesRecorded: false },
    blockers,
    decision: blockers.length ? 'HOLD_PILOT_COHORT_NOT_PROVEN' : 'READY_FOR_SEPARATE_PHASE95B_ACTIVATION_AUTHORIZATION'
  };
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const digest = fileSha(resultPath);
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`, 'utf8');
  fs.rmSync(path.join(evidenceRoot, 'runtime-download-a'), { recursive: true, force: true });
  fs.rmSync(path.join(evidenceRoot, 'runtime-download-b'), { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, rollback: result.rollback, productionState: result.productionState, access: result.access, activationCandidate: result.activationCandidate, blockers, constraints: result.constraints, resultSha256: digest }, null, 2)}\n`);
}

main().catch(error => {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const failure = { contract: '2026-10-09-safety-vote-phase9.5b-r1', generatedAt: new Date().toISOString(), errorClass: error.name || 'Error', error: String(error.message || error), productionMutationPerformed: false, secretValueRecorded: false, decision: 'HOLD_PREFLIGHT_FAILED' };
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  process.stderr.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: failure.decision, error: failure.error }, null, 2)}\n`);
  process.exitCode = 1;
});
