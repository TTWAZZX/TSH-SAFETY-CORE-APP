'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const candidates = [
    process.env.PHP74_BIN,
    path.join(root, 'tools', 'php74', 'php.exe'),
].filter(Boolean);
const php = candidates.find(candidate => fs.existsSync(candidate));
if (!php) {
    console.error('PHP74_VERIFY_BLOCKED: set PHP74_BIN or install the portable runtime at tools/php74/php.exe');
    process.exit(2);
}

const extensionDir = path.join(path.dirname(php), 'ext');
const runtimeArgs = [
    '-n',
    '-d', `extension_dir=${extensionDir}`,
    '-d', 'extension=php_mbstring.dll',
    '-d', 'extension=php_fileinfo.dll',
    '-d', 'extension=php_pdo_mysql.dll',
    '-d', 'extension=php_curl.dll',
    '-d', 'extension=php_zip.dll',
];

function run(args, label) {
    const result = spawnSync(php, [...runtimeArgs, ...args], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(`${label} failed\n${result.stdout || ''}${result.stderr || ''}`);
    }
    return String(result.stdout || '').trim();
}

const version = run(['-r', 'echo PHP_VERSION;'], 'PHP version');
if (!/^7\.4\./.test(version)) throw new Error(`Expected PHP 7.4.x, received ${version}`);
const modules = run(['-m'], 'PHP extensions').toLowerCase();
for (const required of ['curl', 'fileinfo', 'json', 'mbstring', 'pdo_mysql', 'zip']) {
    if (!modules.split(/\r?\n/).includes(required)) throw new Error(`PHP 7.4 runtime is missing ${required}`);
}

const phpFiles = [
    'api/config.php',
    'api/handlers/johnny_ai.php',
    'api/lib/johnny_quality_feedback.php',
    'api/lib/johnny_system_usage.php',
    'api/lib/johnny_workflow_actions.php',
    'backend/scripts/johnny-phase7-config-preflight.php',
];
for (const file of phpFiles) run(['-l', file], `lint ${file}`);

const evaluations = [
    'backend/scripts/johnny-phase3-system-usage-php-eval.php',
    'backend/scripts/johnny-phase4-quality-release-php-eval.php',
    'backend/scripts/johnny-phase5-workflow-release-php-eval.php',
];
for (const file of evaluations) run([file], `evaluation ${file}`);
run([
    'backend/scripts/johnny-phase7-config-preflight.php',
    '--config=backend/fixtures/johnny-phase7-config.fixture.php',
], 'PHP 7.4 configuration preflight fixture');

console.log(JSON.stringify({
    success: true,
    phpVersion: version,
    lintedFiles: phpFiles.length,
    phpEvaluations: evaluations.length,
    configPreflightFixture: true,
}, null, 2));
