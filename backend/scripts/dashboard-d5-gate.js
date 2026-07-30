'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const artifactDir = path.join(repositoryRoot, 'backups', 'local', `dashboard-d5-gate-${timestamp}`);

const checks = [
    ['metric-contract', 'dashboard-module-health-contract.test.js'],
    ['metric-node-php-parity', 'dashboard-metric-contract-parity.test.js'],
    ['module-health-node-readonly', 'dashboard-module-health-d2-readonly.test.js'],
    ['module-health-php-readonly', 'dashboard-module-health-php-readonly.test.js'],
    ['personal-target-fixture-parity', 'personal-target-eligibility-parity.test.js'],
    ['personal-target-runtime-parity', 'personal-target-runtime-readonly.test.js'],
    ['personal-target-ready-variants', 'personal-target-eligibility-variants-readonly.test.js'],
    ['personal-target-population-audit', 'personal-target-eligibility-audit.js'],
    ['department-coverage-source', 'dashboard-coverage-source-smoke.js'],
    ['metric-baseline-select-audit', 'dashboard-module-health-baseline-audit.js'],
    ['authenticated-browser-uat', 'dashboard-d4-browser-uat.js'],
];

function runCheck(name, script) {
    const startedAt = new Date();
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
        cwd: backendRoot,
        env: process.env,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
    });
    const finishedAt = new Date();
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    fs.writeFileSync(path.join(artifactDir, `${name}.log`), `${stdout}${stderr}`);
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const passed = exitCode === 0 && !result.error;
    console.log(`${passed ? 'PASS' : 'FAIL'} D5 ${name} (${finishedAt - startedAt}ms)`);
    return {
        name,
        script,
        passed,
        exitCode,
        durationMs: finishedAt - startedAt,
        error: result.error ? result.error.message : null,
        log: `${name}.log`,
    };
}

function main() {
    fs.mkdirSync(artifactDir, { recursive: true });
    const startedAt = new Date();
    const results = checks.map(([name, script]) => runCheck(name, script));
    const passed = results.every(result => result.passed);
    const report = {
        phase: 'D5',
        executedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        environment: 'local',
        authenticatedUat: true,
        businessDataWrites: false,
        checks: results,
        summary: {
            total: results.length,
            passed: results.filter(result => result.passed).length,
            failed: results.filter(result => !result.passed).length,
        },
        passed,
    };
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(report, null, 2));
    console.log(`${passed ? 'PASS' : 'FAIL'} Dashboard D5 consolidated gate: ${report.summary.passed}/${report.summary.total}`);
    console.log(`ARTIFACT ${artifactDir}`);
    if (!passed) process.exitCode = 1;
}

main();
