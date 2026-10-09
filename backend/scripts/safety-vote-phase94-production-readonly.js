'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { runtime } = require('./safety-vote-phase94-scope');

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(__dirname, 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase94-drift-${stamp}`);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedSha = value => sha256(Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'));

function run(program, args, options = {}) {
  return spawnSync(program, args, { cwd: root, encoding: options.binary ? null : 'utf8', timeout: options.timeout || 60000, windowsHide: true });
}
function gitBlob(spec) {
  const result = run('git', ['show', spec], { binary: true });
  return result.status === 0 ? result.stdout : null;
}
function ftps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', action, '-RemotePath', remotePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = run('powershell.exe', args);
  return { ok: result.status === 0, output: String(result.stdout || '') };
}
function inventoryHas(inventory, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s])${escaped}(?:[\\r\\n]|$)`, 'm').test(inventory);
}
function httpsGet(relative) {
  return new Promise(resolve => {
    const request = https.get(`${baseUrl}${relative}`, { headers: { 'User-Agent': 'TSH-Safety-Vote-Phase94-ReadOnly-Preflight/1.0', 'Cache-Control': 'no-cache' }, timeout: 20000 }, response => {
      let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; });
      response.on('end', () => resolve({ path: relative, status: response.statusCode, bytes, cacheControl: response.headers['cache-control'] || null, contentType: response.headers['content-type'] || null }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', error => resolve({ path: relative, status: null, errorClass: error.message === 'timeout' ? 'TIMEOUT' : 'HTTPS_READ_FAILED' }));
  });
}

async function main() {
  const candidateCommit = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const parentCommit = run('git', ['rev-parse', 'HEAD^']).stdout.trim();
  const candidateManifest = path.join(root, 'docs', 'safety-vote-phase94-candidate-manifest.json');
  const candidateManifestSha256 = sha256(fs.readFileSync(candidateManifest));
  const downloadRoot = path.join(evidenceRoot, 'remote-downloads');
  fs.mkdirSync(downloadRoot, { recursive: true });

  const parents = [...new Set(runtime.map(file => path.posix.dirname(file)).map(dir => dir === '.' ? '' : dir))];
  const inventories = new Map(parents.map(parent => [parent, ftps('list', parent, null)]));
  const files = [];
  for (const relative of runtime) {
    const parentPath = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const inventory = inventories.get(parentPath);
    const basename = path.posix.basename(relative);
    const before = gitBlob(`${parentCommit}:${relative}`);
    const candidate = gitBlob(`${candidateCommit}:${relative}`);
    if (!candidate) throw new Error(`Candidate blob missing: ${relative}`);
    const listed = Boolean(inventory?.ok && inventoryHas(inventory.output, basename));
    const record = { path: relative, expectedPredeploy: before ? 'parent_commit' : 'absent', remoteListed: listed, candidateSha256: sha256(candidate) };
    if (!inventory?.ok) record.verdict = before ? 'PARENT_INVENTORY_UNAVAILABLE' : 'ABSENT_PARENT_INVENTORY';
    else if (!listed) record.verdict = before ? 'MISSING_PARENT_RUNTIME' : 'EXPECTED_ABSENT_NEW_FILE';
    else {
      const target = path.join(downloadRoot, ...relative.split('/'));
      const first = ftps('download', relative, target);
      if (!first.ok) record.verdict = 'REMOTE_DOWNLOAD_FAILED';
      else {
        const remote = fs.readFileSync(target);
        record.remoteSha256 = sha256(remote);
        record.remoteBytes = remote.length;
        record.remoteMatchesParentNormalized = Boolean(before && normalizedSha(remote) === normalizedSha(before));
        record.remoteMatchesCandidateNormalized = normalizedSha(remote) === normalizedSha(candidate);
        record.verdict = before
          ? (record.remoteMatchesParentNormalized ? 'MATCHES_PARENT' : (record.remoteMatchesCandidateNormalized ? 'CANDIDATE_ALREADY_PRESENT' : 'REMOTE_DRIFT'))
          : 'UNEXPECTED_EXISTING_NEW_FILE';
      }
    }
    files.push(record);
  }

  const acceptable = new Set(['MATCHES_PARENT', 'EXPECTED_ABSENT_NEW_FILE', 'ABSENT_PARENT_INVENTORY']);
  const blockers = files.filter(file => !acceptable.has(file.verdict));
  const privateInventory = ftps('list', 'api/private/safety-vote', null);
  const http = await Promise.all([
    httpsGet('/?safety_vote_phase94_preflight=1'),
    httpsGet('/api/index.php?route=safety-vote/admin/health'),
    httpsGet('/api/index.php?route=safety-vote/admin/campaigns/1/release-preflight'),
    httpsGet('/api/handlers/safety_vote.php'),
    httpsGet('/api/private/'),
    httpsGet('/shared/safety-vote-phase7-contract.json')
  ]);
  const result = {
    contract: '2026-10-09-safety-vote-phase9.4-r1',
    generatedAt: new Date().toISOString(),
    productionTarget: `${baseUrl}/`,
    candidateCommit,
    parentCommit,
    candidateManifestSha256,
    operations: ['FTPS LIST', 'FTPS DOWNLOAD', 'HTTPS GET'],
    productionMutationPerformed: false,
    runtimeFiles: files,
    remoteDrift: { pass: blockers.length === 0, blockerCount: blockers.length, blockers: blockers.map(file => ({ path: file.path, verdict: file.verdict })) },
    privateStorage: { exists: privateInventory.ok, contentsRead: false, inventoryEntryCount: privateInventory.ok ? privateInventory.output.split(/\r?\n/).filter(Boolean).length : 0 },
    http,
    decision: blockers.length === 0 ? 'PASS_READONLY_DRIFT' : 'HOLD_REMOTE_DRIFT'
  };
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), candidateCommit, candidateManifestSha256, runtimeCount: files.length, remoteDrift: result.remoteDrift, privateStorage: result.privateStorage, http, decision: result.decision }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`Safety Vote Phase 9.4 read-only drift failed: ${error.message}\n`); process.exitCode = 1; });
