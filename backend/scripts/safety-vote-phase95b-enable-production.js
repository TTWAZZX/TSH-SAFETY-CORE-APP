'use strict';

// Guarded Production orchestrator. Intentionally has no package command.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const templatePath = path.join(__dirname, 'safety-vote-phase95b-enable-helper.php.template');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const rollbackScript = path.join(__dirname, 'safety-vote-phase94-disable-production.js');
const preflightRoot = path.join(root, 'backups', 'production', 'safety-vote-phase95b-preflight-20261009060333');
const protectedRoot = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009060516');
const expectedTemplateSha = 'bf1ad0adf834a7efc9f4bd54075b157d32728b85580782913619b743977b9707';
const confirmation = 'ENABLE_PHASE95B_COMPANY_WIDE_MODULE_ONLY';
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95b-enable-${stamp}`);
const staging = path.join(evidenceRoot, 'staging');
const helperName = `safety-vote-phase95b-enable-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `safety-vote-phase95b-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => hash(fs.readFileSync(file));
let remoteUploaded = false;
let htaccessModified = false;
let htaccessOriginalPath = null;
let htaccessOriginalSha = null;
let activationAttempted = false;

function runFtps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remotePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', timeout: 90000, windowsHide: true });
  return { ok: result.status === 0, output: String(result.stdout || '') };
}

async function request(token, action) {
  const response = await fetch(helperUrl, { method: 'POST', headers: {
    'User-Agent': 'TSH-Safety-Vote-Phase95B-Company-Wide-Enable/1.0',
    'Content-Type': 'application/json', 'Cache-Control': 'no-cache',
    'X-Safety-Vote-Phase95B-Token': token, 'X-Safety-Vote-Phase95B-Action': action
  }, body: '{}' });
  let data = null;
  try { data = await response.json(); } catch (_) { data = { success: false, code: 'NON_JSON_RESPONSE' }; }
  return { status: response.status, data };
}

async function cleanupRemote() {
  if (!remoteUploaded && !htaccessModified) return { attempted: false, zeroResidue: true };
  let response = null;
  try {
    if (remoteUploaded && htaccessModified) {
      response = await request(cleanupToken, 'cleanup');
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } catch (_) {}
  let restored = !htaccessModified, restoredSha256 = null;
  if (htaccessModified && htaccessOriginalPath) {
    const upload = runFtps('upload', '.htaccess', htaccessOriginalPath);
    const target = path.join(evidenceRoot, 'htaccess-restored-download-back');
    const download = upload.ok ? runFtps('download', '.htaccess', target) : { ok: false };
    restoredSha256 = download.ok ? fileSha(target) : null;
    restored = upload.ok && download.ok && restoredSha256 === htaccessOriginalSha;
    if (restored) htaccessModified = false;
  }
  const api = runFtps('list', 'api', null);
  if (api.ok && api.output.includes(helperName)) runFtps('delete', remoteHelper, null);
  if (api.ok && api.output.includes(guardName)) runFtps('delete', remoteGuard, null);
  const finalApi = runFtps('list', 'api', null);
  const finalBackup = runFtps('list', `api/private/${backupId}`, null);
  return { attempted: true, responseStatus: response?.status || null, htaccessRestored: restored, restoredSha256, zeroResidue: finalApi.ok && !finalApi.output.includes(helperName) && !finalApi.output.includes(guardName) && !finalBackup.ok };
}

function validatePreconditions() {
  assert.strictEqual(process.argv[2], '--execute');
  assert.strictEqual(process.argv[3], confirmation, 'Exact company-wide activation confirmation is required');
  assert.strictEqual(fileSha(templatePath), expectedTemplateSha, 'Activation candidate checksum mismatch');
  const preflight = JSON.parse(fs.readFileSync(path.join(preflightRoot, 'result.json'), 'utf8'));
  assert.strictEqual(preflight.candidate?.productionDoubleDownloadVerified, true);
  assert.strictEqual(preflight.candidate?.runtimeFiles, 41);
  assert.strictEqual(preflight.rollback?.ready, true);
  assert.strictEqual(preflight.productionState?.moduleEnabled, false);
  assert.strictEqual(preflight.productionState?.integrationsEnabled, false);
  assert.strictEqual(preflight.productionState?.configuredExternalProviders, 0);
  assert.strictEqual(preflight.productionState?.businessRows, 0);
  assert.strictEqual(preflight.access?.roleDerivedHealthAccessAccounts, preflight.access?.employeeTotal);
  assert.strictEqual(preflight.access?.exactEffectiveAccountCountProvable, true);
  const protectedResult = JSON.parse(fs.readFileSync(path.join(protectedRoot, 'result.json'), 'utf8'));
  const sql = fs.readFileSync(path.join(protectedRoot, 'database-download-a', 'safety-vote-phase82-scoped.sql'), 'utf8');
  assert.strictEqual(protectedResult.production?.schema?.settings?.moduleEnabled, '0');
  assert.strictEqual(Number(protectedResult.production?.schema?.tableCount), 39);
  assert.strictEqual(Number(protectedResult.production?.schema?.businessRowCount), 0);
  assert(Object.values(protectedResult.production?.providers || {}).every(item => item.configured === false));
  assert(/'phase7_integrations_enabled','0'/.test(sql));
  assert.strictEqual(protectedResult.helper?.zeroResidue, true);
  assert.strictEqual(protectedResult.backupVerification?.restoreVerified, true);
  assert(String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim(), 'Existing bearer token is required');
}

function emergencyDisable() {
  const result = spawnSync(process.execPath, [rollbackScript], { cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true });
  return { attempted: true, pass: result.status === 0, exitCode: result.status };
}

async function main() {
  validatePreconditions();
  fs.mkdirSync(staging, { recursive: true });
  const source = fs.readFileSync(templatePath, 'utf8')
    .replace('__RUN_TOKEN_SHA256__', hash(runToken))
    .replace('__CLEANUP_TOKEN_SHA256__', hash(cleanupToken))
    .replace('__BACKUP_ID__', backupId)
    .replace('__GUARD_NAME__', guardName);
  assert(!source.includes('__RUN_TOKEN_SHA256__') && !source.includes('__BACKUP_ID__'));
  const localHelper = path.join(staging, helperName), localGuard = path.join(staging, guardName);
  fs.writeFileSync(localHelper, source, 'utf8');
  const helperSha = fileSha(localHelper);
  fs.writeFileSync(localGuard, `${helperSha}\n`, 'utf8');
  const lint = spawnSync('C:\\xampp\\php\\php.exe', ['-l', localHelper], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(lint.status, 0, lint.stderr || lint.stdout);

  const apiBefore = runFtps('list', 'api', null);
  assert(apiBefore.ok && !apiBefore.output.includes(helperName) && !apiBefore.output.includes(guardName), 'Unique helper path is not clean');
  const htA = path.join(evidenceRoot, 'htaccess-before-a'), htB = path.join(evidenceRoot, 'htaccess-before-b');
  assert(runFtps('download', '.htaccess', htA).ok && runFtps('download', '.htaccess', htB).ok, 'Production .htaccess download failed');
  htaccessOriginalPath = htA;
  htaccessOriginalSha = fileSha(htA);
  assert.strictEqual(fileSha(htB), htaccessOriginalSha, 'Production .htaccess double-download mismatch');
  const original = fs.readFileSync(htA, 'utf8');
  const anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,';
  assert(original.includes(anchor), 'Production .htaccess rewrite anchor missing');
  const ruleName = helperName.replace(/\./g, '\\.');
  const windowPath = path.join(staging, 'htaccess-helper-window');
  fs.writeFileSync(windowPath, original.replace(anchor, `# Exact temporary Safety Vote Phase 9.5B activation helper exception.\nRewriteRule ^api/${ruleName}$ - [L]\n\n${anchor}`), 'utf8');

  assert(runFtps('upload', remoteGuard, localGuard).ok && runFtps('upload', remoteHelper, localHelper).ok, 'Helper upload failed');
  remoteUploaded = true;
  assert(runFtps('upload', '.htaccess', windowPath).ok, 'Temporary helper window upload failed');
  htaccessModified = true;
  const windowBack = path.join(evidenceRoot, 'htaccess-helper-window-download-back');
  const helperBack = path.join(evidenceRoot, 'helper-download-back.php');
  assert(runFtps('download', '.htaccess', windowBack).ok && fileSha(windowBack) === fileSha(windowPath), 'Temporary .htaccess checksum mismatch');
  assert(runFtps('download', remoteHelper, helperBack).ok && fileSha(helperBack) === helperSha, 'Helper checksum mismatch');
  const get = await fetch(helperUrl, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase95B-Company-Wide-Enable/1.0' } });
  const invalid = await request('invalid-token', 'activate');
  assert.strictEqual(get.status, 405);
  assert.strictEqual(invalid.status, 401);

  activationAttempted = true;
  const change = await request(runToken, 'activate');
  fs.writeFileSync(path.join(evidenceRoot, 'value-suppressed-change.json'), `${JSON.stringify(change, null, 2)}\n`, 'utf8');
  assert.strictEqual(change.status, 200, JSON.stringify(change.data));
  assert(change.data?.success && change.data?.valuesSuppressed && change.data?.helperIntegrityVerified);
  assert.strictEqual(change.data.tableCount, 39);
  assert.strictEqual(change.data.businessRowsBefore, 0);
  assert.strictEqual(change.data.beforeModuleDisabled, true);
  assert.strictEqual(change.data.afterModuleEnabled, true);
  assert.strictEqual(change.data.integrationsDisabledBeforeAndAfter, true);
  assert.strictEqual(change.data.externalProvidersUnconfigured, true);
  assert.strictEqual(change.data.rowsChanged, 1);
  assert.strictEqual(change.data.dmlLimitedToModuleSetting, true);
  assert.strictEqual(change.data.ddlExecuted, false);

  const backupRelative = String(change.data.backup?.relativePath || '');
  assert(/^api\/private\/safety-vote-phase95b-[a-f0-9]+\/module-enabled-rollback\.sql$/.test(backupRelative));
  const backupAPath = path.join(evidenceRoot, 'rollback-download-a.sql');
  const backupBPath = path.join(evidenceRoot, 'rollback-download-b.sql');
  assert(runFtps('download', backupRelative, backupAPath).ok && runFtps('download', backupRelative, backupBPath).ok, 'Rollback backup download failed');
  const backupA = fs.readFileSync(backupAPath), backupB = fs.readFileSync(backupBPath), backupSha = hash(backupA);
  assert.strictEqual(backupSha, change.data.backup.sha256);
  assert.strictEqual(hash(backupB), backupSha);
  assert.strictEqual(backupA.length, Number(change.data.backup.bytes));
  assert(/^-- Safety Vote Phase 9\.5B exact module setting rollback\r?\nUPDATE `SafetyVote_Settings` SET /i.test(backupA.toString('utf8')));
  const publicBackup = await fetch(`${baseUrl}/${backupRelative}`, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase95B-Company-Wide-Enable/1.0' } });
  assert([401, 403, 404].includes(publicBackup.status), `Rollback backup was public (${publicBackup.status})`);
  const cleanup = await cleanupRemote();
  assert.strictEqual(cleanup.responseStatus, 200);
  assert.strictEqual(cleanup.htaccessRestored, true);
  assert.strictEqual(cleanup.zeroResidue, true);

  const result = {
    contract: '2026-10-09-safety-vote-phase9.5b-r1', generatedAt: new Date().toISOString(), productionTarget: `${baseUrl}/`,
    authorization: { mode: 'company_wide_visibility', approvedAccountCount: 2543, permissionChangesAuthorized: false },
    change: { valuesSuppressed: true, beforeModuleDisabled: true, afterModuleEnabled: true, integrationsDisabledBeforeAndAfter: true, externalProvidersUnconfigured: true, businessRowsBefore: 0, rowsChanged: 1, dmlLimitedToModuleSetting: true, ddlExecuted: false },
    rollbackBackup: { bytes: backupA.length, sha256: backupSha, doubleDownloadVerified: true, publicHttpStatus: publicBackup.status },
    helper: { candidateSha256: expectedTemplateSha, renderedSha256: helperSha, unauthorizedGetStatus: get.status, invalidTokenStatus: invalid.status, htaccessOriginalSha256: htaccessOriginalSha, htaccessRestoredSha256: cleanup.restoredSha256, htaccessRestored: true, zeroResidue: true },
    constraints: { permissionChanged: false, campaignCreated: false, emailOrNotificationSent: false, loginAttempted: false, runtimeDeployed: false, pushPerformed: false },
    rollback: { attempted: false }, decision: 'MODULE_ENABLED_HOLD_FOR_PROTECTED_POSTCHECK_AND_AUTHENTICATED_SMOKE'
  };
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const resultSha = fileSha(resultPath);
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${resultSha}  result.json\n`, 'utf8');
  fs.rmSync(staging, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, authorization: result.authorization, change: result.change, rollbackBackup: result.rollbackBackup, helper: result.helper, constraints: result.constraints, resultSha256: resultSha }, null, 2)}\n`);
}

main().catch(async error => {
  const cleanup = await cleanupRemote();
  const rollback = activationAttempted ? emergencyDisable() : { attempted: false };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const failure = { contract: '2026-10-09-safety-vote-phase9.5b-r1', generatedAt: new Date().toISOString(), errorClass: error.name || 'Error', error: String(error.message || error), activationAttempted, cleanup, rollback, secretValueRecorded: false, decision: rollback.attempted && rollback.pass ? 'HOLD_ACTIVATION_FAILED_ROLLED_BACK_DISABLED' : (rollback.attempted ? 'HOLD_ACTIVATION_FAILED_ROLLBACK_FAILED' : 'HOLD_ACTIVATION_FAILED_NO_MUTATION') };
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  process.stderr.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: failure.decision, error: failure.error, rollback }, null, 2)}\n`);
  process.exitCode = 1;
});
