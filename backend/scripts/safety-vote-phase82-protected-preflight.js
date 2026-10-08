'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const templatePath = path.join(__dirname, 'safety-vote-phase82-protected-helper.php.template');
const ftpsHelper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const nonce = crypto.randomBytes(6).toString('hex');
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase82-preflight-${stamp}`);
const staging = path.join(evidenceRoot, 'staging');
const helperName = `safety-vote-phase82-preflight-${nonce}.php`;
const guardName = `${helperName}.sha256`;
const backupId = `safety-vote-phase82-${nonce}`;
const remoteHelper = `api/${helperName}`;
const remoteGuard = `api/${guardName}`;
const helperUrl = `${baseUrl}/api/${helperName}`;
const runToken = crypto.randomBytes(32).toString('base64url');
const cleanupToken = crypto.randomBytes(32).toString('base64url');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
let cleanupResult = null;
let remoteUploaded = false;
let htaccessModified = false;
let htaccessOriginalPath = null;
let htaccessOriginalSha = null;
let admin = null;
let restoreDb = null;

function ensureEvidencePath(target) {
  const resolved = path.resolve(target);
  const base = path.resolve(evidenceRoot) + path.sep;
  if (resolved !== path.resolve(evidenceRoot) && !resolved.startsWith(base)) {
    throw new Error(`Refusing path outside evidence root: ${resolved}`);
  }
  return resolved;
}

function runFtps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ftpsHelper,
    '-Action', action, '-RemotePath', remotePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = spawnSync('powershell.exe', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true
  });
  return { ok: result.status === 0, status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

async function helperRequest(token, action) {
  const response = await fetch(helperUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'TSH-Safety-Vote-Phase82-Protected-Preflight/1.0',
      'Content-Type': 'application/json',
      'X-Safety-Vote-Preflight-Token': token,
      'X-Safety-Vote-Preflight-Action': action,
      'Cache-Control': 'no-cache'
    },
    body: '{}'
  });
  let data = null;
  try { data = await response.json(); } catch (_) { data = { success: false, code: 'NON_JSON_RESPONSE' }; }
  return { status: response.status, data };
}

async function cleanupRemote() {
  if (!remoteUploaded && !htaccessModified) return { attempted: false };
  let helperCleanup = null;
  try {
    if (remoteUploaded && htaccessModified) {
      cleanupResult = await helperRequest(cleanupToken, 'cleanup');
      helperCleanup = cleanupResult;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } catch (error) {
    helperCleanup = { status: null, errorClass: 'CLEANUP_REQUEST_FAILED' };
  }
  let htaccessRestored = !htaccessModified;
  let restoredSha256 = null;
  if (htaccessModified && htaccessOriginalPath && fs.existsSync(htaccessOriginalPath)) {
    const restoreUpload = runFtps('upload', '.htaccess', htaccessOriginalPath);
    const restoredPath = path.join(evidenceRoot, 'htaccess-restored-download-back');
    const restoreDownload = restoreUpload.ok ? runFtps('download', '.htaccess', restoredPath) : { ok: false };
    restoredSha256 = restoreDownload.ok ? hash(fs.readFileSync(restoredPath)) : null;
    htaccessRestored = restoreUpload.ok && restoreDownload.ok && restoredSha256 === htaccessOriginalSha;
    if (htaccessRestored) htaccessModified = false;
  }
  const apiInventory = runFtps('list', 'api', null);
  if (apiInventory.ok && apiInventory.stdout.includes(helperName)) runFtps('delete', remoteHelper, null);
  if (apiInventory.ok && apiInventory.stdout.includes(guardName)) runFtps('delete', remoteGuard, null);
  return { attempted: true, response: helperCleanup, htaccessRestored, restoredSha256 };
}

async function main() {
  fs.mkdirSync(staging, { recursive: true });
  const template = fs.readFileSync(templatePath, 'utf8');
  const helperSource = template
    .replace('__RUN_TOKEN_SHA256__', hash(runToken))
    .replace('__CLEANUP_TOKEN_SHA256__', hash(cleanupToken))
    .replace('__BACKUP_ID__', backupId)
    .replace('__GUARD_NAME__', guardName);
  assert(!helperSource.includes('__RUN_TOKEN_SHA256__'));
  const localHelper = path.join(staging, helperName);
  const localGuard = path.join(staging, guardName);
  fs.writeFileSync(localHelper, helperSource, 'utf8');
  const helperSha = hash(fs.readFileSync(localHelper));
  fs.writeFileSync(localGuard, `${helperSha}\n`, 'utf8');

  const lint = spawnSync('C:\\xampp\\php\\php.exe', ['-l', localHelper], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(lint.status, 0, lint.stderr || lint.stdout);

  const apiBefore = runFtps('list', 'api', null);
  assert(apiBefore.ok, 'Production api inventory unavailable');
  assert(!apiBefore.stdout.includes(helperName) && !apiBefore.stdout.includes(guardName), 'Unique helper path unexpectedly exists');

  const htaccessA = path.join(evidenceRoot, 'htaccess-before-a');
  const htaccessB = path.join(evidenceRoot, 'htaccess-before-b');
  assert(runFtps('download', '.htaccess', htaccessA).ok, 'Production .htaccess download A failed');
  assert(runFtps('download', '.htaccess', htaccessB).ok, 'Production .htaccess download B failed');
  htaccessOriginalPath = htaccessA;
  htaccessOriginalSha = hash(fs.readFileSync(htaccessA));
  assert.strictEqual(hash(fs.readFileSync(htaccessB)), htaccessOriginalSha, 'Production .htaccess double-download mismatch');
  const originalHtaccess = fs.readFileSync(htaccessA, 'utf8');
  const anchor = '# Shared-hosting compatibility layer: keep the existing /api/... contract,';
  assert(originalHtaccess.includes(anchor), 'Production .htaccess rewrite anchor not found');
  const helperRuleName = helperName.replace(/\./g, '\\.');
  const helperWindow = `# Exact temporary Safety Vote Phase 8.2 protected preflight helper exception.\nRewriteRule ^api/${helperRuleName}$ - [L]\n\n`;
  const windowHtaccess = originalHtaccess.replace(anchor, helperWindow + anchor);
  const windowPath = path.join(staging, 'htaccess-helper-window');
  fs.writeFileSync(windowPath, windowHtaccess, 'utf8');

  assert(runFtps('upload', remoteGuard, localGuard).ok, 'Guard upload failed');
  assert(runFtps('upload', remoteHelper, localHelper).ok, 'Helper upload failed');
  remoteUploaded = true;
  assert(runFtps('upload', '.htaccess', windowPath).ok, 'Temporary helper-window .htaccess upload failed');
  htaccessModified = true;
  const windowDownload = path.join(evidenceRoot, 'htaccess-helper-window-download-back');
  assert(runFtps('download', '.htaccess', windowDownload).ok, 'Temporary .htaccess download-back failed');
  assert.strictEqual(hash(fs.readFileSync(windowDownload)), hash(fs.readFileSync(windowPath)), 'Temporary .htaccess SHA-256 mismatch');

  const helperDownload = path.join(evidenceRoot, 'helper-download-back.php');
  assert(runFtps('download', remoteHelper, helperDownload).ok, 'Helper download-back failed');
  assert.strictEqual(hash(fs.readFileSync(helperDownload)), helperSha, 'Helper download-back SHA-256 mismatch');

  const getResponse = await fetch(helperUrl, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase82-Protected-Preflight/1.0' } });
  const invalid = await helperRequest('invalid-token', 'backup');
  assert.strictEqual(getResponse.status, 405, 'Helper GET must fail closed');
  assert.strictEqual(invalid.status, 401, 'Helper invalid token must fail closed');

  const protectedResponse = await helperRequest(runToken, 'backup');
  fs.writeFileSync(path.join(evidenceRoot, 'protected-preflight-response.json'), `${JSON.stringify(protectedResponse, null, 2)}\n`, 'utf8');
  assert.strictEqual(protectedResponse.status, 200, JSON.stringify(protectedResponse.data));
  assert(protectedResponse.data?.success, JSON.stringify(protectedResponse.data));
  const result = protectedResponse.data;
  assert.strictEqual(result.valuesSuppressed, true);
  assert.strictEqual(result.helperIntegrityVerified, true);
  assert.strictEqual(result.readOnlyDatabaseTransaction, true);
  assert.strictEqual(result.ddlExecuted, false);
  assert.strictEqual(result.dmlExecuted, false);
  assert.strictEqual(result.backup?.ballotChoicesExported, false);
  assert.strictEqual(result.backup?.voterChoiceMappingCreated, false);

  const exportRelative = String(result.backup.relativePath || '');
  assert(/^api\/private\/safety-vote-phase82-[a-f0-9]+\/safety-vote-phase82-scoped\.sql$/.test(exportRelative));
  const downloadA = path.join(evidenceRoot, 'database-download-a', 'safety-vote-phase82-scoped.sql');
  const downloadB = path.join(evidenceRoot, 'database-download-b', 'safety-vote-phase82-scoped.sql');
  assert(runFtps('download', exportRelative, downloadA).ok, 'Database backup download A failed');
  assert(runFtps('download', exportRelative, downloadB).ok, 'Database backup download B failed');
  const backupA = fs.readFileSync(downloadA);
  const backupB = fs.readFileSync(downloadB);
  const backupSha = hash(backupA);
  assert.strictEqual(backupSha, result.backup.sha256);
  assert.strictEqual(hash(backupB), backupSha);
  assert.strictEqual(backupA.length, Number(result.backup.bytes));
  const sql = backupA.toString('utf8');
  assert(!/INSERT\s+INTO\s+`SafetyVote_(?!Settings`)/i.test(sql), 'Business row export is forbidden');
  assert(!/INSERT\s+INTO\s+`SafetyVote_(BallotAnswers|Ballots|BallotIdentities|Participation|EligibleVoters|RequestKeys)`/i.test(sql));

  const publicExport = await fetch(`${baseUrl}/${exportRelative}`, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase82-Protected-Preflight/1.0' } });
  assert([401, 403, 404].includes(publicExport.status), `Backup must not be public (${publicExport.status})`);

  const localHost = String(process.env.DB_HOST || '').toLowerCase();
  assert(['localhost', '127.0.0.1', '::1'].includes(localHost), 'Restore rehearsal must use local database only');
  restoreDb = `tsh_safety_vote_phase82_restore_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  assert(/^tsh_safety_vote_phase82_restore_\d+_\d+$/.test(restoreDb));
  admin = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    multipleStatements: true
  });
  await admin.query(`CREATE DATABASE \`${restoreDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const restore = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: restoreDb,
    multipleStatements: true
  });
  await restore.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission))');
  if (/(CREATE\s+TABLE|INSERT\s+INTO|SET\s+FOREIGN_KEY_CHECKS)/i.test(sql)) {
    await restore.query('SET FOREIGN_KEY_CHECKS=0');
    try {
      await restore.query(sql);
    } finally {
      await restore.query('SET FOREIGN_KEY_CHECKS=1');
    }
  }
  const [[restoredTables]] = await restore.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND LEFT(TABLE_NAME,11)='SafetyVote_'", [restoreDb]);
  const [[restoredSettings]] = Number(restoredTables.count) > 0 && sql.includes('SafetyVote_Settings')
    ? await restore.query('SELECT COUNT(*) count FROM SafetyVote_Settings')
    : [[{ count: 0 }]];
  await restore.end();
  const restoreVerified = Number(restoredTables.count) === Number(result.schema.tableCount)
    && Number(restoredSettings.count) === Number(result.backup.settingsRows);
  assert(restoreVerified, 'Local restore rehearsal mismatch');

  const cleanup = await cleanupRemote();
  assert.strictEqual(cleanup.response?.status, 200, 'Protected helper cleanup failed');
  assert.strictEqual(cleanup.htaccessRestored, true, 'Production .htaccess was not restored byte-exact');
  const apiAfter = runFtps('list', 'api', null);
  const backupAfter = runFtps('list', `api/private/${backupId}`, null);
  const zeroResidue = apiAfter.ok
    && !apiAfter.stdout.includes(helperName)
    && !apiAfter.stdout.includes(guardName)
    && !backupAfter.ok;
  assert(zeroResidue, 'Remote helper or backup residue remains');

  const privilegesReady = Object.values(result.databasePrivileges || {}).every(Boolean);
  const schemaReadyForFirstDeploy = result.schema?.state === 'absent_predeployment'
    && Number(result.schema?.tableCount || 0) === 0
    && Number(result.schema?.businessRowCount || 0) === 0;
  const technicalPreflightReady = result.configReady
    && result.capabilitiesReady
    && privilegesReady
    && schemaReadyForFirstDeploy
    && result.backup?.databaseBackupComplete
    && result.backup?.privateBackupComplete
    && restoreVerified
    && zeroResidue;
  const final = {
    contract: '2026-10-08-safety-vote-phase8.2-r1',
    governanceContract: '2026-10-08-safety-vote-phase8.1-she-governance-r1',
    generatedAt: new Date().toISOString(),
    productionTarget: `${baseUrl}/`,
    helper: {
      checksumLocked: true,
      sha256: helperSha,
      downloadBackVerified: true,
      unauthorizedGetStatus: getResponse.status,
      invalidTokenStatus: invalid.status,
      cleanupStatus: cleanup.response?.status || null,
      htaccessOriginalSha256: htaccessOriginalSha,
      htaccessRestoredSha256: cleanup.restoredSha256,
      htaccessRestored: cleanup.htaccessRestored,
      zeroResidue
    },
    production: result,
    backupVerification: {
      downloadASha256: backupSha,
      downloadBSha256: hash(backupB),
      bytes: backupA.length,
      publicHttpStatus: publicExport.status,
      restoreDatabaseGuardedDisposable: true,
      restoreVerified,
      restoredSafetyVoteTables: Number(restoredTables.count),
      restoredSettingsRows: Number(restoredSettings.count),
      businessDataExported: false,
      ballotChoicesExported: false,
      voterChoiceMappingCreated: false
    },
    authenticatedSmoke: {
      attempted: false,
      bypassed: false,
      mutationPerformed: false,
      blocker: 'No existing authenticated token is available; login is mutating because it records login/audit state.'
    },
    technicalPreflightReady,
    deployAuthorized: false,
    pushPerformed: false,
    deploymentPerformed: false,
    decision: technicalPreflightReady ? 'READY_FOR_IMMUTABLE_COMMIT_HOLD_FOR_AUTHENTICATED_SMOKE' : 'HOLD'
  };
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(final, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'backup-sha256.json'), `${JSON.stringify({
    path: exportRelative,
    bytes: backupA.length,
    sha256: backupSha,
    downloadBackSha256: hash(backupB),
    restoreVerified
  }, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify({
    evidence: path.relative(root, evidenceRoot).replace(/\\/g, '/'),
    decision: final.decision,
    phpVersion: result.phpVersion,
    configReady: result.configReady,
    capabilitiesReady: result.capabilitiesReady,
    schemaState: result.schema.state,
    safetyVoteTables: result.schema.tableCount,
    safetyVoteBusinessRows: result.schema.businessRowCount,
    permissionsBeforeMigration: result.permissions.existingDistinctCount,
    databasePrivilegesReady: privilegesReady,
    backupSha256: backupSha,
    restoreVerified,
    zeroResidue,
    authenticatedSmoke: final.authenticatedSmoke
  }, null, 2)}\n`);

  ensureEvidencePath(staging);
  fs.rmSync(staging, { recursive: true, force: true });
}

main().catch(async (error) => {
  const cleanup = await cleanupRemote();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'failure.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    errorClass: error.name || 'Error',
    message: String(error.message || error),
    cleanup
  }, null, 2)}\n`, 'utf8');
  process.stderr.write(`Safety Vote Phase 8.2 protected preflight failed: ${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (admin) {
    if (restoreDb && /^tsh_safety_vote_phase82_restore_\d+_\d+$/.test(restoreDb)) {
      await admin.query(`DROP DATABASE IF EXISTS \`${restoreDb}\``).catch(() => {});
    }
    await admin.end().catch(() => {});
  }
});
