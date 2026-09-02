'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/routes/bbs-actions.js');
const php = read('api/handlers/bbs_actions.php');
const ui = read('public/js/pages/bbs-smart-card.js');
const main = read('public/js/main.js');
const index = read('index.html');

for (const source of [node, php]) {
    assert.match(source, /\/admin\/action-outbox/, 'Admin action outbox route must remain available');
    assert.match(source, /Queued['"]?,['"]Sent['"]?,['"]Failed|\['Queued','Sent','Failed'\]/, 'Outbox must expose Queued, Sent, and Failed states');
    assert.match(source, /ActionNo/, 'Outbox rows must retain their Corrective Action identity');
    assert.match(source, /QueuedCount/, 'Outbox must return operational status totals');
    assert.match(source, /eventType/, 'Outbox must support event filtering');
    assert.match(source, /BBS_ACTION_EMAIL_RETRY_NOT_ALLOWED/, 'Retry must fail closed for non-Failed messages');
    assert.match(source, /FOR UPDATE/, 'Retry must serialize against the selected outbox row');
    assert.match(source, /RetryCount=RetryCount\+1/, 'Retry attempts must remain auditable');
    assert.match(source, /BBS_ACTION_OUTBOX_RETRY_FAILED/, 'Failed manual retries must be audit logged');
}

assert.match(node, /listQuery\(req\.query\)/, 'Node outbox must use bounded opt-in pagination');
assert.match(node, /row\.Status!==['"]Failed['"]/, 'Node retry must allow Failed items only');
assert.match(php, /bbs_list_query\(\$_GET\)/, 'PHP outbox must use bounded opt-in pagination');
assert.ok(php.includes("(string)$row['Status']!=='Failed'"), 'PHP retry must allow Failed items only');

for (const token of ['data-action-outbox','data-action-outbox-filter','data-action-outbox-retry','data-action-outbox-reload','action-outbox']) {
    assert.ok(ui.includes(token), `Operational Outbox UI is missing ${token}`);
}
for (const status of ['Queued','Sent','Failed']) assert.ok(ui.includes(status), `Operational Outbox UI is missing ${status}`);
assert.match(ui, /meta\.deliveryEnabled&&meta\.smtpConfigured/, 'Retry availability must reflect delivery and SMTP readiness');
assert.match(ui, /row\.Status===['"]Failed['"]/, 'Only Failed rows may render Retry');
assert.match(ui, /min-h-11/, 'Operational controls must retain mobile touch targets');
assert.match(main, /bbs-smart-card\.js\?v=20260901-bbs-phase10d[45]/, 'BBS page cache bust must include Phase 10D-4 or later');
assert.match(index, /main\.js\?v=(?:20260901-bbs-phase10d[45]|20260902-bbs-auto-reference-r1)/, 'Application cache bust must include Phase 10D-4 or later');

console.log('BBS Phase 10D-4 operational follow-up contract tests passed.');
