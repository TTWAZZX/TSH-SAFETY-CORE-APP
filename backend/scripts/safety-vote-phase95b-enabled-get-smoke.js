'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95b-enabled-smoke-${stamp}`);
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function get(relative) {
  const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'TSH-Safety-Vote-Phase95B-Enabled-GET-Smoke/1.0' } });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return { response, body, record: { path: relative, method: 'GET', status: response.status, success: body?.success === true, code: typeof body?.code === 'string' ? body.code : null, cacheControl: response.headers.get('cache-control'), contentType: response.headers.get('content-type'), responseBodyRecorded: false } };
}

async function main() {
  assert(token, 'Existing Production bearer token is required');
  assert(!String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim(), 'Ambiguous authentication inputs');
  const health = await get('/api/index.php?route=safety-vote/admin/health');
  const campaigns = await get('/api/index.php?route=safety-vote/admin/campaigns');
  assert.strictEqual(health.response.status, 200);
  assert.strictEqual(health.body?.success, true);
  assert.strictEqual(health.body?.data?.ready, true);
  assert.strictEqual(health.body?.data?.moduleEnabled, true);
  assert.strictEqual(campaigns.response.status, 200);
  assert.strictEqual(campaigns.body?.success, true);
  assert(Array.isArray(campaigns.body?.data?.rows));
  assert.strictEqual(campaigns.body.data.rows.length, 0);
  assert.strictEqual(Number(campaigns.body?.data?.total), 0);
  for (const item of [health, campaigns]) {
    assert(/private/i.test(String(item.record.cacheControl || '')) && /no-store/i.test(String(item.record.cacheControl || '')));
    assert(/application\/json/i.test(String(item.record.contentType || '')));
  }
  const result = { contract: '2026-10-09-safety-vote-phase9.5b-r1', generatedAt: new Date().toISOString(), credential: { bearerPresent: true, valueRecorded: false }, requests: [health.record, campaigns.record], checks: { authenticated: true, moduleEnabled: true, campaignsReadable: true, campaignRows: 0, privacyHeaders: true }, constraints: { loginAttempted: false, businessDataChanged: false, emailOrNotificationSent: false, responseBodiesRecorded: false }, decision: 'PASS_COMPANY_WIDE_MODULE_ENABLED_GET_ONLY_SMOKE' };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const resultPath = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const digest = sha256(fs.readFileSync(resultPath));
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, requests: result.requests, checks: result.checks, constraints: result.constraints, resultSha256: digest }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`Safety Vote Phase 9.5B enabled smoke failed: ${error.message}\n`); process.exitCode = 1; });
