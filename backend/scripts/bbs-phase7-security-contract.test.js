'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeServer = read('backend/server.js');
const nodeCards = read('backend/routes/bbs-cards.js');
const nodeObservations = read('backend/routes/bbs-observations.js');
const nodeActions = read('backend/routes/bbs-actions.js');
const nodeAnalytics = read('backend/routes/bbs-analytics.js');
const phpIndex = read('api/index.php');
const phpCards = read('api/handlers/bbs_cards.php');
const phpObservations = read('api/handlers/bbs_observations.php');
const frontend = read('public/js/pages/bbs-smart-card.js');
const cardMigration = read('backend/migrations/20260825_bbs_phase4_cards.sql');

for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Cache-Control']) {
    assert.match(nodeServer, new RegExp(header), `Node BBS responses must set ${header}`);
    assert.match(phpIndex, new RegExp(header), `PHP BBS responses must set ${header}`);
}

assert.match(nodeServer, /app\.use\('\/api\/bbs',\s+authenticateToken,\s+bbsSmartCardRoutes\)/, 'BBS foundation routes must require authentication');
assert.match(nodeServer, /app\.use\('\/api\/bbs',\s+authenticateToken,\s+bbsAnalyticsRoutes\)/, 'BBS analytics routes must require authentication');
assert.match(nodeCards, /publicRouter\.post\('\/qr\/resolve'/, 'Public QR resolve contract is missing');
assert.doesNotMatch(nodeCards, /publicRouter\.(?:get|post|put|delete)\((?!'\/qr\/resolve')/, 'Only QR resolve may be public in BBS card routes');
assert.match(nodeCards, /router\.post\('\/qr\/claim'/, 'QR claim must remain authenticated');
assert.match(nodeCards, /employee:self \? null : employee/, 'Node QR claim must return one employee object, matching PHP');
assert.match(phpCards, /'employee'=>\$self\?null:\$employees\[0\]/, 'PHP QR claim must return one employee object');

for (const [label, source] of [['Node observation', nodeObservations], ['Node action', nodeActions]]) {
    assert.match(source, /verifiedImageMime/, `${label} upload must verify file signatures`);
    assert.match(source, /private-uploads/, `${label} evidence must use private storage`);
    assert.match(source, /path\.basename/, `${label} file paths must be basename-confined`);
}
assert.match(phpObservations, /finfo\(FILEINFO_MIME_TYPE\)/, 'PHP observation upload must verify file signatures');
assert.match(phpObservations, /basename\(/, 'PHP evidence retrieval must basename-confine stored names');
assert.match(nodeCards, /TokenHash/, 'QR tokens must be looked up by hash');
assert.doesNotMatch(cardMigration, /\bRawToken\b/i, 'The card schema must never persist raw QR tokens');

for (const [label, source] of [['cards', nodeCards], ['observations', nodeObservations], ['actions', nodeActions], ['analytics', nodeAnalytics]]) {
    assert.doesNotMatch(source, /\$\{\s*req\.(?:query|body|params)/, `${label} SQL must not interpolate raw request values`);
}
for (const field of ['ObserverNameSnapshot', 'ObservedNameSnapshot', 'ItemPromptSnapshot', 'OriginalName', 'Description']) {
    assert.match(frontend, new RegExp(`escHtml\\([^\\n]{0,120}${field}`), `Frontend must escape ${field} before HTML rendering`);
}
assert.doesNotMatch(frontend, /innerHTML\s*=\s*`[^`]*\$\{error\?\.message\}/s, 'Raw API error messages must not enter innerHTML');
assert.match(nodeObservations, /FOR UPDATE/, 'Observation double-submit protection must retain row locking');
assert.match(nodeObservations, /IdempotencyKey/, 'Observation creation must retain an idempotency key');
assert.match(nodeActions, /RowVersion/, 'Corrective Actions must retain optimistic concurrency');
assert.match(nodeCards, /QR_RATE_LIMITED/, 'Public QR resolve must retain database-backed throttling');

console.log('BBS Phase 7 security contract: PASS (auth/IDOR boundaries, headers, private upload signatures, SQL/XSS contracts, QR and concurrency guards)');
