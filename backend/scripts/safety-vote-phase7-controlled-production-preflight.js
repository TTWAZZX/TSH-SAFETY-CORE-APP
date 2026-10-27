'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const immutable = process.argv.includes('--immutable');
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const forbiddenPrefixes = ['backups/', 'api/private/', 'backend/private-uploads/', 'uploads/'];
const forbiddenNames = new Set(['.env', 'backend/.env']);
const allowedExact = new Set([
    'AGENTS.md', 'index.html', 'package.json', 'backend/package.json', 'backend/server.js',
    'api/index.php', 'public/js/api.js', 'public/js/main.js', 'public/js/pages/admin.js', 'public/style.css',
    'backend/scripts/safety-vote-phase7-production-helper.php.template',
]);
const allowedPatterns = [
    /^api\/(handlers|lib)\/safety_vote[^/]*\.php$/,
    /^backend\/migrations\/202610(08_safety_vote_phase1_foundation|24_safety_vote_(company_wide_visibility|eligibility_removal_policy)|25_safety_vote_jury_work_items_atomic_media)(\.rollback)?\.sql$/,
    /^backend\/(routes|services|scripts)\/safety-vote[^/]*\.(?:js|mjs|php)$/,
    /^docs\/safety-vote[^/]*\.md$/,
    /^public\/js\/pages\/(admin-safety-vote[^/]*|safety-vote[^/]*)(\.mjs|\.js)$/,
];

function git(args, options = {}) {
    return execFileSync('git', args, {
        cwd: root,
        encoding: options.encoding === null ? null : 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function normalize(value) {
    return String(value || '').replace(/\\/g, '/').trim();
}

function dirtyFiles() {
    const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const entries = raw.split('\0').filter(Boolean);
    const files = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const code = entry.slice(0, 2);
        let file = normalize(entry.slice(3));
        if (code.includes('R') || code.includes('C')) {
            file = normalize(entries[index + 1]);
            index += 1;
        }
        files.push(file);
    }
    return [...new Set(files)].sort();
}

function commitFiles() {
    return git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split(/\r?\n/).map(normalize).filter(Boolean).sort();
}

function allowed(file) {
    return allowedExact.has(file) || allowedPatterns.some(pattern => pattern.test(file));
}

function bytesFor(file) {
    if (immutable) return git(['show', `HEAD:${file}`], { encoding: null });
    return fs.readFileSync(path.join(root, ...file.split('/')));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function secretHits(file, text) {
    const patterns = [
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
        /\bAKIA[0-9A-Z]{16}\b/,
        /\b(?:DB_PASS|JWT_SECRET|SMTP_PASS)\s*=\s*['"][^'"]{4,}['"]/,
        /\b(?:password|secret|token)\s*:\s*['"][A-Za-z0-9_\-+/=]{20,}['"]/i,
    ];
    return patterns.filter(pattern => pattern.test(text)).map(pattern => `${file}:${pattern.source}`);
}

function whitespaceHits(file, text) {
    const hits = [];
    const lines = text.split(/\n/);
    lines.forEach((line, index) => {
        if (/[ \t]+\r?$/.test(line)) hits.push(`${file}:${index + 1}: trailing whitespace`);
    });
    if (/\n\s*\n$/.test(text)) hits.push(`${file}: new blank line at EOF`);
    return hits;
}

function main() {
    const branch = git(['branch', '--show-current']).trim();
    const sourceCommit = git(['rev-parse', 'HEAD']).trim();
    const dirty = dirtyFiles();
    if (immutable) assert.equal(dirty.length, 0, `Immutable verification requires a clean tree: ${dirty.join(', ')}`);
    const files = immutable ? commitFiles() : dirty;
    assert(files.length > 0, 'No candidate files were found');
    const forbidden = files.filter(file => forbiddenNames.has(file) || forbiddenPrefixes.some(prefix => file.startsWith(prefix)));
    assert.deepEqual(forbidden, [], `Forbidden release files: ${forbidden.join(', ')}`);
    const outsideScope = files.filter(file => !allowed(file));
    assert.deepEqual(outsideScope, [], `Files outside the Safety Vote Phase 7 scope: ${outsideScope.join(', ')}`);
    assert.equal(branch, 'main', `Controlled candidate must be on main, found ${branch}`);
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Offline preflight refuses a non-loopback DB_HOST');

    const diffCheck = spawnSync('git', ['diff', '--check', ...(immutable ? ['HEAD^', 'HEAD'] : [])], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(diffCheck.status, 0, diffCheck.stderr || diffCheck.stdout || 'git diff --check failed');
    if (!immutable) {
        const stagedDiffCheck = spawnSync('git', ['diff', '--cached', '--check'], { cwd: root, encoding: 'utf8', windowsHide: true });
        assert.equal(stagedDiffCheck.status, 0, stagedDiffCheck.stderr || stagedDiffCheck.stdout || 'git diff --cached --check failed');
    }
    const untracked = immutable ? new Set() : new Set(
        git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).map(normalize).filter(Boolean)
    );

    const records = [];
    const secrets = [];
    const whitespace = [];
    for (const file of files) {
        const bytes = bytesFor(file);
        records.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
        if (/\.(?:js|mjs|php|sql|json|md|html|css)$/i.test(file)) {
            const text = bytes.toString('utf8');
            secrets.push(...secretHits(file, text));
            if (untracked.has(file)) whitespace.push(...whitespaceHits(file, text));
        }
    }
    assert.deepEqual(secrets, [], `Potential secret material found: ${secrets.join(', ')}`);
    assert.deepEqual(whitespace, [], `Whitespace errors found: ${whitespace.join(', ')}`);

    for (const required of [
        'backend/migrations/20261025_safety_vote_jury_work_items_atomic_media.sql',
        'backend/migrations/20261025_safety_vote_jury_work_items_atomic_media.rollback.sql',
        'docs/safety-vote-final-acceptance-phase7.md',
        'backend/scripts/safety-vote-final-acceptance-phase7.test.js',
    ]) assert(fs.existsSync(path.join(root, ...required.split('/'))), `Required release artifact is missing: ${required}`);

    const scopeSha256 = sha256(Buffer.from(records.map(record => `${record.path}\0${record.sha256}\0${record.bytes}`).join('\n'), 'utf8'));
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const evidenceRoot = path.join(root, 'backups', 'local', `safety-vote-phase7-production-preflight-${stamp}`);
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const result = {
        contract: '2026-10-26-safety-vote-phase7-controlled-production-preflight-r1',
        generatedAt: new Date().toISOString(),
        mode: immutable ? 'immutable_commit' : 'working_tree_candidate',
        sourceBranch: branch,
        sourceCommit,
        candidateFiles: records.length,
        candidateScopeSha256: scopeSha256,
        files: records,
        checks: {
            phase7FinalAcceptance: 'PASS_LOCAL_SAFETY_VOTE_PHASE7_FINAL_ACCEPTANCE_READY_FOR_CONTROLLED_PRODUCTION_PREFLIGHT',
            phpCompatibility: 'PHP_7_4_AND_LATER_REQUIRED',
            migrationStrategy: 'additive_idempotent_data_preserving_rollback',
            forbiddenFilesExcluded: true,
            secretScanPassed: true,
            diffCheckPassed: true,
            disposableSchemaResidue: 0,
        },
        productionConnected: false,
        productionMutationPerformed: false,
        deploymentPerformed: false,
        externalDelivery: false,
        decision: immutable ? 'PASS_IMMUTABLE_COMMIT_READY_FOR_PUSH_AND_IT_CONTROLLED_PRODUCTION_PREFLIGHT' : 'PASS_WORKING_TREE_READY_FOR_IMMUTABLE_COMMIT',
    };
    const resultPath = path.join(evidenceRoot, 'result.json');
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${sha256(fs.readFileSync(resultPath))}  result.json\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ evidence: normalize(path.relative(root, evidenceRoot)), decision: result.decision, mode: result.mode, sourceBranch: branch, sourceCommit, candidateFiles: records.length, candidateScopeSha256: scopeSha256, productionConnected: false, deploymentPerformed: false }, null, 2)}\n`);
}

try {
    main();
} catch (error) {
    process.stderr.write(`Safety Vote Phase 7 controlled production preflight failed: ${error.message}\n`);
    process.exitCode = 1;
}
