'use strict';

// Forensic source for the failed 2026-10-09 guarded attempt. Do not rerun without a separately reviewed diagnosis and authorization.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const templatePath = path.join(__dirname, 'safety-vote-phase94-disable-helper.php.template');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase94-remediation-${stamp}`);
const staging = path.join(evidenceRoot, 'staging');
const helperName = `safety-vote-phase94-remediation-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `safety-vote-phase94-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let remoteUploaded = false, htaccessModified = false, htaccessOriginalPath = null, htaccessOriginalSha = null;

function runFtps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper, '-Action', action, '-RemotePath', remotePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
  return { ok: result.status === 0, output: String(result.stdout || '') };
}
async function request(token, action) {
  const response = await fetch(helperUrl, { method: 'POST', headers: {
    'User-Agent': 'TSH-Safety-Vote-Phase94-Remediation/1.0', 'Content-Type': 'application/json',
    'X-Safety-Vote-Remediation-Token': token, 'X-Safety-Vote-Remediation-Action': action, 'Cache-Control': 'no-cache'
  }, body: '{}' });
  let data = null;
  try { data = await response.json(); } catch (_) { data = { success: false, code: 'NON_JSON_RESPONSE' }; }
  return { status: response.status, data };
}
async function cleanupRemote() {
  if (!remoteUploaded && !htaccessModified) return { attempted: false, zeroResidue: true };
  let response = null;
  try { if (remoteUploaded && htaccessModified) { response = await request(cleanupToken, 'cleanup'); await new Promise(resolve => setTimeout(resolve, 1200)); } } catch (_) {}
  let restored = !htaccessModified, restoredSha256 = null;
  if (htaccessModified && htaccessOriginalPath) {
    const upload = runFtps('upload', '.htaccess', htaccessOriginalPath);
    const target = path.join(evidenceRoot, 'htaccess-restored-download-back');
    const download = upload.ok ? runFtps('download', '.htaccess', target) : { ok: false };
    restoredSha256 = download.ok ? hash(fs.readFileSync(target)) : null;
    restored = upload.ok && download.ok && restoredSha256 === htaccessOriginalSha;
    if (restored) htaccessModified = false;
  }
  const api = runFtps('list', 'api', null), backup = runFtps('list', `api/private/${backupId}`, null);
  if (api.ok && api.output.includes(helperName)) runFtps('delete', remoteHelper, null);
  if (api.ok && api.output.includes(guardName)) runFtps('delete', remoteGuard, null);
  const finalApi = runFtps('list', 'api', null), finalBackup = runFtps('list', `api/private/${backupId}`, null);
  return { attempted: true, responseStatus: response?.status || null, htaccessRestored: restored, restoredSha256, zeroResidue: finalApi.ok && !finalApi.output.includes(helperName) && !finalApi.output.includes(guardName) && !finalBackup.ok };
}

async function main() {
  fs.mkdirSync(staging, { recursive: true });
  const source = fs.readFileSync(templatePath, 'utf8')
    .replace('__RUN_TOKEN_SHA256__', hash(runToken)).replace('__CLEANUP_TOKEN_SHA256__', hash(cleanupToken))
    .replace('__BACKUP_ID__', backupId).replace('__GUARD_NAME__', guardName);
  assert(!source.includes('__RUN_TOKEN_SHA256__') && !source.includes('__BACKUP_ID__'));
  const localHelper = path.join(staging, helperName), localGuard = path.join(staging, guardName);
  fs.writeFileSync(localHelper, source, 'utf8');
  const helperSha = hash(fs.readFileSync(localHelper));
  fs.writeFileSync(localGuard, `${helperSha}\n`, 'utf8');
  const lint = spawnSync('C:\\xampp\\php\\php.exe', ['-l', localHelper], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(lint.status, 0, lint.stderr || lint.stdout);

  const apiBefore = runFtps('list', 'api', null);
  assert(apiBefore.ok && !apiBefore.output.includes(helperName) && !apiBefore.output.includes(guardName), 'Unique helper path is not clean');
  const htA = path.join(evidenceRoot, 'htaccess-before-a'), htB = path.join(evidenceRoot, 'htaccess-before-b');
  assert(runFtps('download', '.htaccess', htA).ok && runFtps('download', '.htaccess', htB).ok, 'Production .htaccess download failed');
  htaccessOriginalPath = htA; htaccessOriginalSha = hash(fs.readFileSync(htA));
  assert.strictEqual(hash(fs.readFileSync(htB)), htaccessOriginalSha, 'Production .htaccess double-download mismatch');
  const original = fs.readFileSync(htA, 'utf8'), anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,';
  assert(original.includes(anchor), 'Production .htaccess rewrite anchor missing');
  const ruleName = helperName.replace(/\./g, '\\.');
  const windowPath = path.join(staging, 'htaccess-helper-window');
  fs.writeFileSync(windowPath, original.replace(anchor, `# Exact temporary Safety Vote Phase 9.4 remediation helper exception.\nRewriteRule ^api/${ruleName}$ - [L]\n\n${anchor}`), 'utf8');
  assert(runFtps('upload', remoteGuard, localGuard).ok && runFtps('upload', remoteHelper, localHelper).ok, 'Helper upload failed');
  remoteUploaded = true;
  assert(runFtps('upload', '.htaccess', windowPath).ok, 'Temporary helper window upload failed');
  htaccessModified = true;
  const windowBack = path.join(evidenceRoot, 'htaccess-helper-window-download-back'), helperBack = path.join(evidenceRoot, 'helper-download-back.php');
  assert(runFtps('download', '.htaccess', windowBack).ok && hash(fs.readFileSync(windowBack)) === hash(fs.readFileSync(windowPath)), 'Temporary .htaccess hash mismatch');
  assert(runFtps('download', remoteHelper, helperBack).ok && hash(fs.readFileSync(helperBack)) === helperSha, 'Helper hash mismatch');
  const get = await fetch(helperUrl, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase94-Remediation/1.0' } });
  const invalid = await request('invalid-token', 'disable');
  assert.strictEqual(get.status, 405); assert.strictEqual(invalid.status, 401);

  const change = await request(runToken, 'disable');
  fs.writeFileSync(path.join(evidenceRoot, 'value-suppressed-change.json'), `${JSON.stringify(change, null, 2)}\n`, 'utf8');
  assert.strictEqual(change.status, 200, JSON.stringify(change.data));
  assert(change.data?.success && change.data?.valuesSuppressed && change.data?.helperIntegrityVerified);
  assert.strictEqual(change.data.tableCount, 39); assert.strictEqual(change.data.afterModuleDisabled, true);
  assert.strictEqual(change.data.integrationsDisabledBeforeAndAfter, true);
  assert.strictEqual(change.data.businessRowsBefore, 0); assert.strictEqual(change.data.businessRowsAfter, 0);
  assert.strictEqual(change.data.dmlLimitedToModuleSetting, true); assert.strictEqual(change.data.ddlExecuted, false);
  const backupRelative = String(change.data.backup?.relativePath || '');
  assert(/^api\/private\/safety-vote-phase94-[a-f0-9]+\/module-enabled-rollback\.sql$/.test(backupRelative));
  const backupAPath = path.join(evidenceRoot, 'rollback-download-a.sql'), backupBPath = path.join(evidenceRoot, 'rollback-download-b.sql');
  assert(runFtps('download', backupRelative, backupAPath).ok && runFtps('download', backupRelative, backupBPath).ok, 'Rollback backup download failed');
  const backupA = fs.readFileSync(backupAPath), backupB = fs.readFileSync(backupBPath), backupSha = hash(backupA);
  assert.strictEqual(backupSha, change.data.backup.sha256); assert.strictEqual(hash(backupB), backupSha); assert.strictEqual(backupA.length, Number(change.data.backup.bytes));
  assert(/^-- Safety Vote Phase 9\.4 guarded module setting rollback\r?\nUPDATE `SafetyVote_Settings` SET /i.test(backupA.toString('utf8')));
  const publicBackup = await fetch(`${baseUrl}/${backupRelative}`, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase94-Remediation/1.0' } });
  assert([401, 403, 404].includes(publicBackup.status), `Rollback backup was public (${publicBackup.status})`);
  const cleanup = await cleanupRemote();
  assert.strictEqual(cleanup.responseStatus, 200); assert.strictEqual(cleanup.htaccessRestored, true); assert.strictEqual(cleanup.zeroResidue, true);

  const result = {
    contract: '2026-10-09-safety-vote-phase9.4-remediation-r1', generatedAt: new Date().toISOString(), productionTarget: `${baseUrl}/`,
    change: { valuesSuppressed: true, beforeModuleWasEnabled: Boolean(change.data.beforeModuleWasEnabled), afterModuleDisabled: true, integrationsDisabledBeforeAndAfter: true, businessRowsBefore: 0, businessRowsAfter: 0, rowsChanged: Number(change.data.rowsChanged), dmlLimitedToModuleSetting: true, ddlExecuted: false },
    rollbackBackup: { bytes: backupA.length, sha256: backupSha, doubleDownloadVerified: true, publicHttpStatus: publicBackup.status },
    helper: { checksumLocked: true, sha256: helperSha, unauthorizedGetStatus: get.status, invalidTokenStatus: invalid.status, htaccessOriginalSha256: htaccessOriginalSha, htaccessRestoredSha256: cleanup.restoredSha256, htaccessRestored: true, zeroResidue: true },
    runtimeDeployed: false, pushPerformed: false, decision: 'MODULE_DISABLED_READY_FOR_PROTECTED_RECHECK'
  };
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, beforeModuleWasEnabled: result.change.beforeModuleWasEnabled, afterModuleDisabled: true, integrationsDisabled: true, businessRows: 0, rowsChanged: result.change.rowsChanged, rollbackBackupSha256: backupSha, htaccessRestored: true, zeroResidue: true }, null, 2)}\n`);
  fs.rmSync(staging, { recursive: true, force: true });
}

main().catch(async error => {
  const cleanup = await cleanupRemote();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), errorClass: error.name || 'Error', message: String(error.message || error), cleanup }, null, 2)}\n`, 'utf8');
  process.stderr.write(`Safety Vote Phase 9.4 guarded disable failed: ${error.message}\n`);
  process.exitCode = 1;
});
