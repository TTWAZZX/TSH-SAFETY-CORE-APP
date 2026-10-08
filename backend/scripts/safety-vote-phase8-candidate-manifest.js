'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const scope = require('./safety-vote-phase8-scope');

const root = path.resolve(__dirname, '..', '..');
const output = path.join(root, 'docs', 'safety-vote-phase8-candidate-manifest.json');

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding === null ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function statusMap() {
  const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const result = new Map();
  const entries = raw.split('\0').filter(Boolean);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const code = entry.slice(0, 2);
    let name = entry.slice(3).replace(/\\/g, '/');
    if (code.includes('R') || code.includes('C')) {
      const destination = entries[index + 1];
      if (destination) {
        name = destination.replace(/\\/g, '/');
        index += 1;
      }
    }
    result.set(name, code);
  }
  return result;
}

function fileRecord(relative, statuses) {
  const absolute = path.join(root, ...relative.split('/'));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return { path: relative, exists: false, status: statuses.get(relative) || 'missing' };
  }
  const bytes = fs.readFileSync(absolute);
  let trackedAtHead = true;
  try {
    git(['cat-file', '-e', `HEAD:${relative}`]);
  } catch (_) {
    trackedAtHead = false;
  }
  return {
    path: relative,
    exists: true,
    bytes: bytes.length,
    sha256: sha256(bytes),
    status: statuses.get(relative) || '  ',
    trackedAtHead
  };
}

const statuses = statusMap();
const groups = {};
for (const [name, files] of Object.entries({
  runtime: scope.runtime,
  migrations: scope.migrations,
  sourceOnly: scope.sourceOnly
})) {
  groups[name] = files.map((file) => fileRecord(file, statuses));
}

const allRequired = [...groups.runtime, ...groups.migrations, ...groups.sourceOnly];
const missing = allRequired.filter((item) => !item.exists).map((item) => item.path);
const runtimeDigest = sha256(Buffer.from(groups.runtime
  .map((item) => `${item.path}\0${item.sha256 || 'missing'}\0${item.bytes || 0}`)
  .join('\n'), 'utf8'));
const operationsDigest = sha256(Buffer.from(groups.migrations
  .map((item) => `${item.path}\0${item.sha256 || 'missing'}\0${item.bytes || 0}`)
  .join('\n'), 'utf8'));

const manifest = {
  contract: '2026-10-08-safety-vote-phase0-r1',
  phaseContract: '2026-10-08-safety-vote-phase8.3.1-disabled-mode-r1',
  protectedPreflightContract: '2026-10-08-safety-vote-phase8.2-r1',
  generatedAt: new Date().toISOString(),
  productionTarget: 'https://dev.tshpcl.com/safety/tsh-safety-core/',
  sourceCommit: git(['rev-parse', 'HEAD']).trim(),
  sourceBranch: git(['branch', '--show-current']).trim(),
  immutable: false,
  decision: 'HOLD',
  holdReasons: [
    'candidate manifest is generated before the authorized immutable successor commit',
    'Production deployment and push are explicitly outside Phase 8.3.1 authorization'
  ],
  disabledMode: {
    defaultAfterMigrations: true,
    operationalRoutesFailClosed: true,
    authenticatedReadonlyExceptions: [
      'GET /api/safety-vote/admin/health',
      'GET /api/safety-vote/admin/campaigns/:id/release-preflight'
    ],
    disabledErrorCode: 'SAFETY_VOTE_MODULE_DISABLED',
    nodePhpParityGate: 'backend/scripts/safety-vote-phase831-disabled-gate.test.js'
  },
  governance: {
    contract: '2026-10-08-safety-vote-phase8.1-she-governance-r1',
    owner: 'SHE',
    campaignAcceptance: ['she_owner'],
    certifiedElectionDualCertificationRequired: true
  },
  protectedProductionPreflight: {
    evidence: 'backups/production/safety-vote-phase82-preflight-20261008092819/',
    phpVersion: '7.4.33',
    valueSuppressedConfigurationReady: true,
    schemaState: 'absent_predeployment',
    safetyVoteTableCount: 0,
    privacySafeBackupSha256: '4a67122f21be115a9cc950e1668408d0447dc2f4f45682380efbdc41bfb5e8d1',
    downloadBackAndRestoreVerified: true,
    helperAndDumpZeroResidue: true,
    authenticatedSmoke: 'HOLD_NO_EXISTING_VALID_SESSION'
  },
  digests: {
    runtimeScopeSha256: runtimeDigest,
    migrationScopeSha256: operationsDigest
  },
  groups,
  explicitExclusions: scope.explicitExclusions,
  missingRequiredFiles: missing,
  assertions: {
    unrelatedDirtyPatrolTestExcluded: !scope.runtime.includes('backend/scripts/patrol-checkin-v2.test.js') &&
      !scope.migrations.includes('backend/scripts/patrol-checkin-v2.test.js') &&
      !scope.sourceOnly.includes('backend/scripts/patrol-checkin-v2.test.js'),
    privateBusinessFilesExcluded: !scope.runtime.some((item) => item.startsWith('api/private/safety-vote/')),
    deployableRuntimeFileCount: groups.runtime.length,
    migrationArtifactCount: groups.migrations.length,
    sourceOnlyFileCount: groups.sourceOnly.length
  }
};

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, output).replace(/\\/g, '/'),
  decision: manifest.decision,
  immutable: manifest.immutable,
  runtimeFiles: groups.runtime.length,
  migrationFiles: groups.migrations.length,
  sourceOnlyFiles: groups.sourceOnly.length,
  missing,
  runtimeScopeSha256: runtimeDigest,
  migrationScopeSha256: operationsDigest
}, null, 2)}\n`);
