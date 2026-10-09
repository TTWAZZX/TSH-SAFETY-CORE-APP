'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const snapshot = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009025522', 'database-download-a', 'safety-vote-phase82-scoped.sql');
const templatePath = path.join(__dirname, 'safety-vote-phase94-disable-helper.php.template');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const dbName = `tsh_safety_vote_phase94_diag_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-vote-phase94-diag-'));
const helperName = 'remediation.php', guardName = 'remediation.php.sha256';
const runToken = crypto.randomBytes(24).toString('base64url'), cleanupToken = crypto.randomBytes(24).toString('base64url');
const backupId = 'safety-vote-phase94-local-fixture';
const port = 19494 + Math.floor(Math.random() * 300);
let admin = null, db = null, php = null;

const phpString = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { await fetch(`http://127.0.0.1:${port}/${helperName}`); return; } catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Local PHP fixture did not start');
}

async function call(token, action = 'disable') {
  const response = await fetch(`http://127.0.0.1:${port}/${helperName}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Safety-Vote-Remediation-Token': token, 'X-Safety-Vote-Remediation-Action': action
  }, body: '{}' });
  return { status: response.status, data: await response.json() };
}

async function main() {
  assert(fs.existsSync(snapshot), 'Accepted Production schema/settings snapshot is missing');
  const correctedTemplate = fs.readFileSync(templatePath, 'utf8');
  assert(correctedTemplate.includes("$tablesByLower[strtolower($table)] = $table"), 'Case-normalized schema guard is missing');
  assert(correctedTemplate.includes("'failureStage' => $failureStage"), 'Bounded diagnostic stage is missing');
  assert(correctedTemplate.includes("UpdatedBy='phase94_disable'"), 'Schema-bounded remediation actor is missing');
  assert('phase94_disable'.length <= 20, 'Remediation actor exceeds SafetyVote_Settings.UpdatedBy');
  assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()), 'Diagnosis database must be loopback-only');
  assert(/^tsh_safety_vote_phase94_diag_\d+_\d+$/.test(dbName));
  admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, multipleStatements: true });
  await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: dbName, multipleStatements: true });
  await db.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission))');
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  try { await db.query(fs.readFileSync(snapshot, 'utf8')); } finally { await db.query('SET FOREIGN_KEY_CHECKS=1'); }
  await db.query("SET SESSION sql_mode='STRICT_TRANS_TABLES'");
  await db.beginTransaction();
  await assert.rejects(
    db.query("UPDATE SafetyVote_Settings SET UpdatedBy='phase94_guarded_disable' WHERE SettingKey='module_enabled'"),
    error => error?.code === 'ER_DATA_TOO_LONG',
    'The forensic 23-character actor must fail against UpdatedBy VARCHAR(20) in strict mode'
  );
  await db.rollback();

  const source = correctedTemplate
    .replace('__RUN_TOKEN_SHA256__', hash(runToken)).replace('__CLEANUP_TOKEN_SHA256__', hash(cleanupToken))
    .replace('__BACKUP_ID__', backupId).replace('__GUARD_NAME__', guardName);
  const helperPath = path.join(tempRoot, helperName);
  fs.writeFileSync(helperPath, source, 'utf8');
  fs.writeFileSync(path.join(tempRoot, guardName), `${hash(fs.readFileSync(helperPath))}\n`, 'utf8');
  fs.writeFileSync(path.join(tempRoot, 'config.php'), `<?php return [\n'db_host'=>${phpString(process.env.DB_HOST)},\n'db_port'=>${Number(process.env.DB_PORT || 3306)},\n'db_user'=>${phpString(process.env.DB_USER)},\n'db_pass'=>${phpString(process.env.DB_PASS)},\n'db_name'=>${phpString(dbName)},\n];\n`, 'utf8');
  php = spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', tempRoot], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let phpError = '';
  php.stderr.on('data', chunk => { phpError += String(chunk); });
  await waitForServer();

  const before = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='module_enabled'");
  assert.strictEqual(String(before[0][0].SettingValue), '1', 'Fixture must reproduce enabled Production snapshot');
  const result = await call(runToken);
  if (result.status !== 200) throw new Error(`Exact forensic helper failed locally: ${JSON.stringify(result.data)}\n${phpError}`);
  assert.strictEqual(result.data.afterModuleDisabled, true);
  assert.strictEqual(result.data.integrationsDisabledBeforeAndAfter, true);
  assert.strictEqual(result.data.businessRowsBefore, 0);
  assert.strictEqual(result.data.businessRowsAfter, 0);
  assert.strictEqual(result.data.rowsChanged, 1);
  const [[after]] = await db.query("SELECT SettingValue,UpdatedBy FROM SafetyVote_Settings WHERE SettingKey='module_enabled'");
  assert.deepStrictEqual({ value: String(after.SettingValue), by: String(after.UpdatedBy) }, { value: '0', by: 'phase94_disable' });
  const backupPath = path.join(tempRoot, 'private', backupId, 'module-enabled-rollback.sql');
  assert(fs.existsSync(backupPath));
  const rollbackSql = fs.readFileSync(backupPath, 'utf8');
  assert(rollbackSql.includes("`SettingValue`='1'") && rollbackSql.includes("`UpdatedBy`='activation'"), 'Rollback artifact does not preserve the prior setting');
  const cleanup = await call(cleanupToken, 'cleanup');
  assert.strictEqual(cleanup.status, 200);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert(!fs.existsSync(helperPath) && !fs.existsSync(path.join(tempRoot, guardName)) && !fs.existsSync(path.join(tempRoot, 'private', backupId)), 'Fixture cleanup left residue');

  console.log('Safety Vote Phase 9.4 remediation local regression: PASS (strict-mode root cause reproduced, case-normalized 39-table fixture, exact 1->0 row, integrations off, business rows 0, rollback preserved, cleanup 0)');
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => {
  if (php && !php.killed) php.kill();
  if (db) await db.end().catch(() => {});
  if (admin) {
    if (/^tsh_safety_vote_phase94_diag_\d+_\d+$/.test(dbName)) {
      await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      const [[residue]] = await admin.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?", [dbName]);
      assert.strictEqual(Number(residue.count), 0, 'Disposable diagnosis database residue remains');
      console.log('Safety Vote Phase 9.4 diagnosis disposable database residue: 0');
    }
    await admin.end().catch(() => {});
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
