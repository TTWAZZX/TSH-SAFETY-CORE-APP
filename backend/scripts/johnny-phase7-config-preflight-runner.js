'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const candidates = [
    process.env.PHP_BIN,
    'C:\\xampp\\php\\php.exe',
    'php',
].filter(Boolean);
let php = null;
for (const candidate of candidates) {
    if (candidate === 'php' || fs.existsSync(candidate)) {
        const probe = spawnSync(candidate, ['-v'], { encoding: 'utf8', windowsHide: true });
        if (probe.status === 0) { php = candidate; break; }
    }
}
if (!php) {
    console.error('CONFIG_PREFLIGHT_BLOCKED: PHP CLI not found; set PHP_BIN');
    process.exit(2);
}

const result = spawnSync(php, [path.join(__dirname, 'johnny-phase7-config-preflight.php'), ...process.argv.slice(2)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status === null ? 2 : result.status);
