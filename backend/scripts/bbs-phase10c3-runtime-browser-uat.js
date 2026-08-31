'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'bbs-phase10c2-mobile-accessibility-browser-uat.js');
const result = spawnSync(process.execPath, [script], {
    cwd:path.join(__dirname, '..'),
    env:{
        ...process.env,
        BBS_PHASE10C2_APP_URL:process.env.BBS_PHASE10C3_APP_URL || process.env.BBS_PHASE10C2_APP_URL,
        BBS_PHASE10C2_API_URL:process.env.BBS_PHASE10C3_API_URL || process.env.BBS_PHASE10C2_API_URL,
        BBS_PHASE10C2_BROWSER:process.env.BBS_PHASE10C3_BROWSER || process.env.BBS_PHASE10C2_BROWSER,
        BBS_PHASE10C2_CDP_PORT:process.env.BBS_PHASE10C3_CDP_PORT || '9843',
        BBS_PHASE10C3_TEST_RECOVERY:'1'
    },
    encoding:'utf8',
    stdio:'pipe'
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status || 1);
console.log('BBS Phase 10C-3 authenticated read-only runtime regression UAT: PASS');
