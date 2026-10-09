'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const scope = require('./safety-vote-phase94-scope');

const root = path.resolve(__dirname, '..', '..');
const output = path.join(root, 'docs', 'safety-vote-phase94-candidate-manifest.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: root, encoding, stdio: ['ignore', 'pipe', 'pipe'] });

function blobRecord(relative) {
  const bytes = git(['show', `HEAD:${relative}`], null);
  return { path: relative, bytes: bytes.length, sha256: sha256(bytes), hashSource: 'git_blob' };
}

function digest(records) {
  return sha256(Buffer.from(records.map(item => `${item.path}\0${item.sha256}\0${item.bytes}`).join('\n'), 'utf8'));
}

const sourceCommit = git(['rev-parse', 'HEAD']).trim();
const sourceTree = git(['rev-parse', 'HEAD^{tree}']).trim();
const parentCommit = git(['rev-parse', 'HEAD^']).trim();
const branch = git(['branch', '--show-current']).trim();
const delta = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).trim().split(/\r?\n/).filter(Boolean).map(name => name.replaceAll('\\', '/'));
const status = git(['status', '--porcelain=v1', '--untracked-files=all']).split(/\r?\n/).filter(Boolean);
const allowedDirty = new Set(['backend/scripts/patrol-checkin-v2.test.js']);
const unexpectedDirty = status.filter(line => !allowedDirty.has(line.slice(3).replaceAll('\\', '/')));
assert.deepStrictEqual(unexpectedDirty, [], `Candidate worktree has unexpected changes: ${unexpectedDirty.join(', ')}`);

const forbidden = delta.filter(name => name === 'backend/.env' || name.includes('/.env') || name.startsWith('backups/') || name.startsWith('api/private/safety-vote/') || name.startsWith('backend/private-uploads/') || name === 'backend/scripts/patrol-checkin-v2.test.js');
assert.deepStrictEqual(forbidden, [], `Forbidden candidate path: ${forbidden.join(', ')}`);

const known = new Set([...scope.runtime, ...scope.migrations, ...scope.sourceOnly, ...scope.documents]);
const unknown = delta.filter(name => !known.has(name));
assert.deepStrictEqual(unknown, [], `Unclassified candidate path: ${unknown.join(', ')}`);

const groups = Object.fromEntries(Object.entries({ runtime: scope.runtime, migrations: scope.migrations, sourceOnly: scope.sourceOnly, documents: scope.documents })
  .map(([name, files]) => [name, files.map(blobRecord)]));
const candidateFiles = delta.map(blobRecord);
const manifest = {
  contract: '2026-10-09-safety-vote-phase9.4-r1',
  generatedAt: new Date().toISOString(),
  productionTarget: 'https://dev.tshpcl.com/safety/tsh-safety-core/',
  sourceCommit,
  sourceTree,
  parentCommit,
  sourceBranch: branch,
  immutable: true,
  candidateDeltaFiles: candidateFiles,
  groups,
  digests: {
    candidateDeltaSha256: digest(candidateFiles),
    runtimeScopeSha256: digest(groups.runtime),
    migrationScopeSha256: digest(groups.migrations),
    sourceOnlyScopeSha256: digest(groups.sourceOnly),
    documentScopeSha256: digest(groups.documents)
  },
  controls: {
    moduleDefaultDisabled: true,
    integrationsDefaultDisabled: true,
    protectedPreflightValueSuppressed: true,
    authenticatedSmokeRequired: true,
    deployAuthorized: false,
    productionMutationAuthorized: false
  },
  explicitExclusions: scope.explicitExclusions,
  worktreeExceptions: [...allowedDirty],
  decision: 'IMMUTABLE_CANDIDATE_READY_FOR_FRESH_PROTECTED_PREFLIGHT'
};

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, output).replaceAll('\\', '/'),
  sourceCommit,
  sourceTree,
  candidateFiles: candidateFiles.length,
  runtimeFiles: groups.runtime.length,
  migrationFiles: groups.migrations.length,
  candidateDeltaSha256: manifest.digests.candidateDeltaSha256,
  runtimeScopeSha256: manifest.digests.runtimeScopeSha256,
  decision: manifest.decision
}, null, 2)}\n`);
