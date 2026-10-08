'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { runtime } = require('./safety-vote-phase8-scope');

const root = path.resolve(__dirname, '..', '..');
const helper = path.join(root, 'backend', 'scripts', 'patrol-checkin-v2-ftps.ps1');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase8-preflight-${stamp}`);
const copyA = path.join(evidenceRoot, 'remote-copy-a');
const copyB = path.join(evidenceRoot, 'remote-copy-b');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedSha(value) {
  const text = value.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return sha256(Buffer.from(text, 'utf8'));
}

function runFtps(action, remotePath, localPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper,
    '-Action', action, '-RemotePath', remotePath];
  if (localPath) args.push('-LocalPath', localPath);
  const result = spawnSync('powershell.exe', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 45000,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    errorClass: result.status === 0 ? null : 'FTPS_READ_FAILED'
  };
}

function headBytes(relative) {
  const result = spawnSync('git', ['show', `HEAD:${relative}`], {
    cwd: root,
    encoding: null,
    windowsHide: true
  });
  return result.status === 0 ? result.stdout : null;
}

function httpsGet(relative) {
  return new Promise((resolve) => {
    const url = `${baseUrl}${relative}`;
    const request = https.get(url, {
      headers: {
        'User-Agent': 'TSH-Safety-Vote-Phase8-ReadOnly-Preflight/1.0',
        'Cache-Control': 'no-cache'
      },
      timeout: 20000
    }, (response) => {
      let bytes = 0;
      response.on('data', (chunk) => { bytes += chunk.length; });
      response.on('end', () => resolve({
        path: relative,
        method: 'GET',
        status: response.statusCode,
        bytes,
        cacheControl: response.headers['cache-control'] || null,
        contentType: response.headers['content-type'] || null
      }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({
      path: relative,
      method: 'GET',
      status: null,
      errorClass: error.message === 'timeout' ? 'TIMEOUT' : 'HTTPS_READ_FAILED'
    }));
  });
}

function inventoryHas(inventory, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s])${escaped}(?:[\\r\\n]|$)`, 'm').test(inventory);
}

async function main() {
  fs.mkdirSync(copyA, { recursive: true });
  fs.mkdirSync(copyB, { recursive: true });

  const rootInventory = runFtps('list', '', null);
  if (!rootInventory.ok) {
    throw new Error('Production FTPS root inventory failed; no drift conclusion is safe');
  }

  const parentPaths = [...new Set(runtime.map((file) => path.posix.dirname(file)).map((dir) => dir === '.' ? '' : dir))];
  const inventories = new Map();
  for (const parent of parentPaths) {
    const result = runFtps('list', parent, null);
    inventories.set(parent, result);
  }

  const files = [];
  for (const relative of runtime) {
    const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const basename = path.posix.basename(relative);
    const inventory = inventories.get(parent);
    const localBytes = fs.readFileSync(path.join(root, ...relative.split('/')));
    const baseline = headBytes(relative);
    const listed = Boolean(inventory && inventory.ok && inventoryHas(inventory.stdout, basename));
    const record = {
      path: relative,
      expectedRemoteState: baseline ? 'matches_HEAD_baseline_before_release' : 'absent_new_file',
      remoteListed: listed,
      localCandidateSha256: sha256(localBytes),
      localCandidateBytes: localBytes.length,
      headBaselineSha256Normalized: baseline ? normalizedSha(baseline) : null
    };

    if (!inventory || !inventory.ok) {
      record.verdict = baseline
        ? 'UNVERIFIED_PARENT_INVENTORY'
        : 'EXPECTED_ABSENT_NEW_FILE_PARENT_ABSENT';
      files.push(record);
      continue;
    }
    if (!listed) {
      record.verdict = baseline ? 'MISSING_EXISTING_REMOTE_FILE' : 'EXPECTED_ABSENT_NEW_FILE';
      files.push(record);
      continue;
    }

    const targetA = path.join(copyA, ...relative.split('/'));
    const targetB = path.join(copyB, ...relative.split('/'));
    const first = runFtps('download', relative, targetA);
    const second = first.ok ? runFtps('download', relative, targetB) : { ok: false };
    record.downloadA = first.ok;
    record.downloadB = second.ok;
    if (!first.ok || !second.ok) {
      record.verdict = 'REMOTE_DOWNLOAD_FAILED';
      files.push(record);
      continue;
    }

    const remoteA = fs.readFileSync(targetA);
    const remoteB = fs.readFileSync(targetB);
    record.remoteSha256 = sha256(remoteA);
    record.remoteBytes = remoteA.length;
    record.downloadBackSha256 = sha256(remoteB);
    record.downloadBackVerified = record.remoteSha256 === record.downloadBackSha256;
    record.remoteSha256Normalized = normalizedSha(remoteA);
    record.remoteMatchesHeadBaselineNormalized = baseline
      ? record.remoteSha256Normalized === normalizedSha(baseline)
      : false;
    record.remoteMatchesCandidateNormalized = record.remoteSha256Normalized === normalizedSha(localBytes);
    record.verdict = !record.downloadBackVerified
      ? 'DOWNLOAD_BACK_HASH_MISMATCH'
      : baseline
        ? (record.remoteMatchesHeadBaselineNormalized ? 'NO_REMOTE_DRIFT_FROM_HEAD' : 'REMOTE_DRIFT_FROM_HEAD')
        : 'UNEXPECTED_EXISTING_NEW_FILE';
    files.push(record);
  }

  const privateInventory = runFtps('list', 'api/private/safety-vote', null);
  const privateStorage = privateInventory.ok
    ? {
        exists: true,
        inventoryEntryCount: privateInventory.stdout.split(/\r?\n/).filter(Boolean).length,
        inventorySha256: sha256(Buffer.from(privateInventory.stdout, 'utf8')),
        contentsRead: false,
        backedUp: false,
        blocker: 'Private Safety Vote data exists; content-safe recursive backup requires a separately reviewed backup channel.'
      }
    : {
        exists: false,
        inventoryEntryCount: 0,
        contentsRead: false,
        backedUp: true,
        note: 'Remote directory was absent; there were no Safety Vote private files to copy.'
      };

  const http = await Promise.all([
    httpsGet('/?safety_vote_phase8_preflight=1'),
    httpsGet('/api/index.php?route=safety-vote/admin/schema-health'),
    httpsGet('/api/handlers/safety_vote.php'),
    httpsGet('/api/lib/safety_vote_phase1.php'),
    httpsGet('/api/private/'),
    httpsGet('/shared/safety-vote-phase7-contract.json')
  ]);

  const driftBlockers = files.filter((item) => ![
    'NO_REMOTE_DRIFT_FROM_HEAD',
    'EXPECTED_ABSENT_NEW_FILE',
    'EXPECTED_ABSENT_NEW_FILE_PARENT_ABSENT'
  ].includes(item.verdict));
  const result = {
    contract: '2026-10-08-safety-vote-phase8-preflight-r1',
    generatedAt: new Date().toISOString(),
    productionTarget: `${baseUrl}/`,
    operations: ['FTPS LIST', 'FTPS DOWNLOAD', 'HTTPS GET'],
    forbiddenOperationsPerformed: [],
    productionMutationPerformed: false,
    rootInventoryVerified: true,
    runtimeFiles: files,
    remoteDrift: {
      pass: driftBlockers.length === 0,
      blockerCount: driftBlockers.length,
      blockers: driftBlockers.map((item) => ({ path: item.path, verdict: item.verdict }))
    },
    privateStorage,
    http,
    database: {
      connected: false,
      schemaVersionVerified: false,
      privilegesVerified: false,
      narrowBackupCreated: false,
      ballotChoicesReadOrExported: false,
      voterChoiceMappingCreated: false,
      blocker: 'No existing value-suppressed read-only Production database preflight/backup channel is available; no helper was uploaded.'
    },
    configuration: {
      secretValuesRead: false,
      phpCapabilitiesVerifiedFresh: false,
      valueSuppressedConfigurationVerifiedFresh: false,
      clockTimeZoneVerifiedFresh: false,
      providersVerifiedFresh: false,
      blocker: 'These checks require an existing protected server-side read-only channel; downloading secret configuration or uploading a helper was intentionally refused.'
    },
    authenticatedSmoke: {
      attempted: false,
      authenticationBypassed: false,
      businessMutationPerformed: false,
      blocker: 'Stored Production UAT credentials previously returned 401 and login can create audit mutations; no known-valid non-mutating authenticated session was available.'
    },
    decision: 'HOLD'
  };

  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'runtime-backup-sha256.json'), `${JSON.stringify(files
    .filter((item) => item.downloadBackVerified)
    .map((item) => ({
      path: item.path,
      bytes: item.remoteBytes,
      sha256: item.remoteSha256,
      downloadBackSha256: item.downloadBackSha256
    })), null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    evidence: path.relative(root, evidenceRoot).replace(/\\/g, '/'),
    decision: result.decision,
    runtimeCount: files.length,
    runtimeBackedUp: files.filter((item) => item.downloadBackVerified).length,
    expectedAbsentNewFiles: files.filter((item) => item.verdict === 'EXPECTED_ABSENT_NEW_FILE').length,
    remoteDriftPass: result.remoteDrift.pass,
    remoteDriftBlockers: result.remoteDrift.blockers,
    privateStorage,
    http
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Safety Vote Phase 8 read-only preflight failed: ${error.message}\n`);
  process.exitCode = 1;
});
