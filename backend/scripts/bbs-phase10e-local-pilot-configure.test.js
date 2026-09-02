'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'bbs-phase10e-local-pilot-configure.js'), 'utf8');

assert.match(source, /assertLocalDatabase\(\)/, 'configuration must fail closed outside Local DB');
assert.match(source, /staged_admin_only/, 'configuration must preserve the staged Admin-only gate');
assert.match(source, /\/api\/admin\/employee\//, 'Employee Master update must use the established Admin API');
assert.match(source, /\/api\/bbs\/admin\/inspectors/, 'inspector enrollment must use the established API');
assert.match(source, /\/api\/bbs\/inspectors\/\$\{enrollmentId\}\/team/, 'team assignment must use the established API');
assert.match(source, /\/api\/bbs\/admin\/inspectors\/\$\{enrollmentId\}\/schedule/, 'schedule must use the established API');
assert.match(source, /'1,2,3,4,5'/, 'weekday schedule must remain Monday-Friday');
assert.match(source, /TargetCount\), 1/, 'daily target must remain one');
assert.match(source, /EXCLUDED_TEST_ID = '111111'/, 'the confirmed test account exclusion must be explicit');
assert.doesNotMatch(source, /DELETE\s+FROM|DROP\s+TABLE|TRUNCATE\s+/i, 'configuration must not delete existing data');

console.log('BBS Phase 10E Local Pilot configuration contract: PASS');

