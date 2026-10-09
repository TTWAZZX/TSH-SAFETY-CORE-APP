'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const candidateManifestPath = path.join(root, 'docs', 'safety-vote-phase94-candidate-manifest.json');
const driftRoot = path.join(root, 'backups', 'production', 'safety-vote-phase94-drift-20261009025816');
const postcheckRoot = path.join(root, 'backups', 'production', 'safety-vote-phase82-preflight-20261009034316');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95-preflight-${stamp}`);
const packageRoot = path.join(evidenceRoot, 'rollback-package');
const runtimeRoot = path.join(packageRoot, 'runtime-before');
const zipPath = path.join(evidenceRoot, 'safety-vote-phase95-runtime-rollback.zip');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha256(fs.readFileSync(file));
const gitBlob = (commit, relative) => execFileSync('git', ['show', `${commit}:${relative}`], { cwd: root, encoding: null, stdio: ['ignore', 'pipe', 'pipe'] });

function copyVerified(source, destination, expectedSha) {
  assert(fs.existsSync(source), `Rollback source missing: ${source}`);
  assert.strictEqual(fileSha(source), expectedSha, `Rollback source hash mismatch: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  assert.strictEqual(fileSha(destination), expectedSha, `Rollback copy hash mismatch: ${destination}`);
}

function main() {
  const candidate = JSON.parse(fs.readFileSync(candidateManifestPath, 'utf8'));
  const drift = JSON.parse(fs.readFileSync(path.join(driftRoot, 'result.json'), 'utf8'));
  const postcheck = JSON.parse(fs.readFileSync(path.join(postcheckRoot, 'result.json'), 'utf8'));
  assert.strictEqual(candidate.sourceCommit, drift.candidateCommit, 'Candidate/drift commit mismatch');
  assert.strictEqual(candidate.immutable, true, 'Candidate is not immutable');
  assert.strictEqual(drift.productionMutationPerformed, false, 'Drift evidence was not read-only');
  assert.strictEqual(drift.privateStorage.contentsRead, false, 'Private contents entered drift evidence');
  assert.strictEqual(postcheck.production.schema.settings.moduleEnabled, '0', 'Module is not disabled in protected postcheck');
  assert.strictEqual(Number(postcheck.production.schema.tableCount), 39, 'Phase 7 table count mismatch');
  assert.strictEqual(Number(postcheck.production.schema.businessRowCount), 0, 'Safety Vote business rows are present');
  assert(Object.values(postcheck.production.providers).every(provider => provider.configured === false), 'External provider is configured');
  const postSql = fs.readFileSync(path.join(postcheckRoot, 'database-download-a', 'safety-vote-phase82-scoped.sql'), 'utf8');
  assert(/'phase7_integrations_enabled','0'/.test(postSql), 'Integrations are not disabled');

  const runtime = candidate.groups.runtime;
  assert.strictEqual(runtime.length, 41, 'Runtime scope must contain 41 paths');
  for (const file of runtime) assert.strictEqual(sha256(gitBlob(candidate.sourceCommit, file.path)), file.sha256, `Immutable candidate blob mismatch: ${file.path}`);
  const driftByPath = new Map(drift.runtimeFiles.map(file => [file.path, file]));
  assert(runtime.every(file => driftByPath.has(file.path)), 'Drift evidence does not cover every runtime path');

  fs.mkdirSync(runtimeRoot, { recursive: true });
  const restoreFiles = [], removeOnRollback = [];
  for (const file of runtime) {
    const remote = driftByPath.get(file.path);
    if (remote.remoteSha256) {
      const source = path.join(driftRoot, 'remote-downloads', ...file.path.split('/'));
      const destination = path.join(runtimeRoot, ...file.path.split('/'));
      copyVerified(source, destination, remote.remoteSha256);
      restoreFiles.push({ path: file.path, bytes: Number(remote.remoteBytes), sha256: remote.remoteSha256, predeployVerdict: remote.verdict });
    } else {
      assert(['MISSING_PARENT_RUNTIME', 'EXPECTED_ABSENT_NEW_FILE'].includes(remote.verdict), `Unrecoverable drift state: ${file.path} ${remote.verdict}`);
      removeOnRollback.push({ path: file.path, provenAbsent: true, predeployVerdict: remote.verdict });
    }
  }
  assert.strictEqual(restoreFiles.length, 25, 'Rollback restore coverage mismatch');
  assert.strictEqual(removeOnRollback.length, 16, 'Rollback remove coverage mismatch');

  const relevantEnv = Object.keys(process.env).filter(key => /(PROD|UAT).*(TOKEN|SESSION)|(TOKEN|SESSION).*(PROD|UAT)/i.test(key));
  const existingSessionReady = relevantEnv.some(key => String(process.env[key] || '').trim() !== '');
  const envTracked = spawnSync('git', ['ls-files', '--error-unmatch', 'backend/.env'], { cwd: root, stdio: 'ignore' }).status === 0;
  const envIgnored = spawnSync('git', ['check-ignore', 'backend/.env'], { cwd: root, stdio: 'ignore' }).status === 0;
  const smtpCredentialPresent = String(process.env.SMTP_PASS || '').trim().length > 0;

  const rollbackManifest = {
    contract: '2026-10-09-safety-vote-phase9.5-r1',
    candidateCommit: candidate.sourceCommit,
    candidateRuntimeSha256: candidate.digests.runtimeScopeSha256,
    sourceDriftEvidence: path.relative(root, driftRoot).replaceAll('\\', '/'),
    sourceDriftResultSha256: fileSha(path.join(driftRoot, 'result.json')),
    restoreFiles,
    removeOnRollback,
    databaseRollback: 'No Phase 9.5 schema migration is authorized; keep module_enabled=0 and use the verified Phase 9.4 privacy-safe backup evidence.',
    privateFileRollback: 'No Production Safety Vote private directory exists and no private content is included.',
    externalIntegrationsRemainDisabled: true
  };
  fs.writeFileSync(path.join(packageRoot, 'rollback-manifest.json'), `${JSON.stringify(rollbackManifest, null, 2)}\n`, 'utf8');
  const zip = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${packageRoot.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(zip.status, 0, zip.stderr || zip.stdout || 'Rollback ZIP creation failed');

  const remoteDriftBlockers = drift.remoteDrift.blockers;
  const result = {
    contract: '2026-10-09-safety-vote-phase9.5-r1',
    generatedAt: new Date().toISOString(),
    phase: 'controlled_pilot_preflight',
    candidate: { commit: candidate.sourceCommit, tree: candidate.sourceTree, manifestSha256: fileSha(candidateManifestPath), runtimeSha256: candidate.digests.runtimeScopeSha256, runtimeFiles: runtime.length, immutable: true },
    credentialHygiene: { smtpRotationUserAttested: true, smtpCredentialPresent, envTracked, envIgnored, secretValueRecorded: false, emailSent: false },
    productionState: { moduleEnabled: false, integrationsEnabled: false, externalProvidersConfigured: false, businessRows: 0, tables: 39, sourceEvidence: path.relative(root, postcheckRoot).replaceAll('\\', '/') },
    remoteDrift: { checked: true, productionMutationPerformed: false, blockerCount: remoteDriftBlockers.length, blockers: remoteDriftBlockers },
    rollback: { ready: true, restoreFileCount: restoreFiles.length, removeProvenNewCount: removeOnRollback.length, manifestSha256: fileSha(path.join(packageRoot, 'rollback-manifest.json')), archiveSha256: fileSha(zipPath), archiveBytes: fs.statSync(zipPath).size },
    authenticatedSession: { existingTokenOrSessionPresent: existingSessionReady, credentialsPresentButLoginForbidden: true, loginAttempted: false, authenticationBypassed: false, ready: existingSessionReady },
    externalDelivery: false,
    moduleOpened: false,
    deploymentPerformed: false,
    pushPerformed: false,
    deployAuthorized: false,
    blockers: existingSessionReady ? [] : ['NO_EXISTING_NON_MUTATING_AUTHENTICATED_SESSION'],
    decision: existingSessionReady ? 'READY_FOR_SEPARATE_CONTROLLED_PILOT_DEPLOYMENT_AUTHORIZATION' : 'HOLD_NO_EXISTING_AUTHENTICATED_SESSION'
  };
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${fileSha(path.join(evidenceRoot, 'result.json'))}  result.json\n${result.rollback.archiveSha256}  safety-vote-phase95-runtime-rollback.zip\n${result.rollback.manifestSha256}  rollback-package/rollback-manifest.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, candidate: result.candidate, credentialHygiene: result.credentialHygiene, productionState: result.productionState, remoteDriftBlockers: result.remoteDrift.blockerCount, rollback: result.rollback, authenticatedSession: result.authenticatedSession }, null, 2)}\n`);
}

try { main(); } catch (error) { process.stderr.write(`Safety Vote Phase 9.5 controlled pilot preflight failed: ${error.message}\n`); process.exitCode = 1; }
