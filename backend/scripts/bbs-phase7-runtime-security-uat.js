const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { tokenFingerprint } = require('../services/bbs-card');

const nodeBase = String(process.env.LOCAL_NODE_UAT_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const phpBase = String(process.env.LOCAL_PHP_UAT_URL || 'http://127.0.0.1:8099/api/index.php?route=').replace(/\/+$/, '');
const malformedToken = `P7SEC-${Date.now()}-<script>alert(1)</script>`;
let db;

function urlFor(stack, route) {
  if (stack === 'node') return `${nodeBase}/api/bbs${route}`;
  return `${phpBase}bbs${route.includes('?') ? route.replace('?', '&') : route}`;
}

async function request(stack, route, options = {}) {
  const response = await fetch(urlFor(stack, route), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, text: await response.text() };
}

function assertSecurityHeaders(stack, response) {
  assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff', `${stack}: nosniff missing`);
  assert.strictEqual(response.headers.get('x-frame-options'), 'SAMEORIGIN', `${stack}: frame policy missing`);
  assert.strictEqual(
    response.headers.get('referrer-policy'),
    'strict-origin-when-cross-origin',
    `${stack}: referrer policy missing`,
  );
  assert.match(response.headers.get('permissions-policy') || '', /camera=\(self\)/, `${stack}: camera policy missing`);
  assert.match(response.headers.get('cache-control') || '', /no-store/i, `${stack}: no-store missing`);
}

(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  for (const stack of ['node', 'php']) {
    const protectedContext = await request(stack, '/me/context');
    assert.strictEqual(protectedContext.response.status, 401, `${stack}: protected context must reject anonymous access`);
    assertSecurityHeaders(stack, protectedContext.response);

    const protectedClaim = await request(stack, '/qr/claim', { method: 'POST', body: { token: '' } });
    assert.strictEqual(protectedClaim.response.status, 401, `${stack}: QR claim must require authentication`);
    assertSecurityHeaders(stack, protectedClaim.response);

    const publicResolve = await request(stack, '/qr/resolve', {
      method: 'POST',
      body: { token: malformedToken },
    });
    assert.ok([400, 404].includes(publicResolve.response.status), `${stack}: malformed public token must be rejected`);
    assertSecurityHeaders(stack, publicResolve.response);
    assert.ok(!publicResolve.text.includes(malformedToken), `${stack}: malformed token reflected unsafely`);
  }

  console.log('BBS Phase 7 Node/PHP runtime security UAT: PASS (auth boundaries, non-reflection and response headers)');
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (!db) return;
  await db.query(
    'DELETE FROM BBS_QR_Resolve_Attempts WHERE TokenFingerprint IN (?, ?)',
    [tokenFingerprint(malformedToken), tokenFingerprint('<script>alert(1)</script>')],
  ).catch(() => {});
  const [[remaining]] = await db.query(
    'SELECT COUNT(*) count FROM BBS_QR_Resolve_Attempts WHERE TokenFingerprint IN (?, ?)',
    [tokenFingerprint(malformedToken), tokenFingerprint('<script>alert(1)</script>')],
  ).catch(() => [[{ count: -1 }]]);
  console.log(`BBS Phase 7 security UAT cleanup: qrAttempts=${Number(remaining.count)}`);
  await db.end();
});
