'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const evidenceRoot = path.join(root, 'backups', 'production', `safety-vote-phase95-auth-smoke-${stamp}`);
const token = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
const sessionCookie = String(process.env.SAFETY_VOTE_PHASE95_PROD_SESSION_COOKIE || '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function writeResult(result) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const file = path.join(evidenceRoot, 'result.json');
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const digest = sha256(fs.readFileSync(file));
  fs.writeFileSync(path.join(evidenceRoot, 'result.sha256'), `${digest}  result.json\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidenceRoot).replaceAll('\\', '/'), decision: result.decision, credential: result.credential, requests: result.requests, resultSha256: digest }, null, 2)}\n`);
}

async function get(relative, headers) {
  const response = await fetch(`${baseUrl}${relative}`, { method: 'GET', redirect: 'manual', headers: { ...headers, 'User-Agent': 'TSH-Safety-Vote-Phase95-Authenticated-GET-Smoke/1.0', 'Cache-Control': 'no-cache' } });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return {
    path: relative,
    method: 'GET',
    status: response.status,
    success: body?.success === true,
    code: typeof body?.code === 'string' ? body.code : null,
    healthReady: typeof body?.data?.ready === 'boolean' ? body.data.ready : null,
    moduleEnabled: typeof body?.data?.moduleEnabled === 'boolean' ? body.data.moduleEnabled : null,
    cacheControl: response.headers.get('cache-control'),
    contentType: response.headers.get('content-type')
  };
}

async function main() {
  const credentialCount = Number(Boolean(token)) + Number(Boolean(sessionCookie));
  if (credentialCount !== 1) {
    writeResult({
      contract: '2026-10-09-safety-vote-phase9.5-r1', generatedAt: new Date().toISOString(),
      credential: { bearerPresent: Boolean(token), sessionCookiePresent: Boolean(sessionCookie), exactOnePresent: false, valueRecorded: false },
      requests: [], loginAttempted: false, authenticationBypassed: false, productionMutationPerformed: false,
      moduleOpened: false, externalDelivery: false, deploymentPerformed: false, pushPerformed: false,
      blockers: [credentialCount === 0 ? 'NO_EXISTING_AUTHENTICATED_SESSION' : 'AMBIGUOUS_AUTHENTICATION_INPUT'],
      decision: 'HOLD_NO_EXISTING_AUTHENTICATED_SESSION'
    });
    return;
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : { Cookie: sessionCookie };
  const requests = [];
  requests.push(await get('/api/index.php?route=safety-vote/admin/health', headers));
  requests.push(await get('/api/index.php?route=safety-vote/admin/campaigns', headers));
  const health = requests[0], disabled = requests[1];
  const authenticated = health.status === 200 && health.success;
  const moduleClosed = health.moduleEnabled === false && disabled.status === 503 && disabled.code === 'SAFETY_VOTE_MODULE_DISABLED';
  const privacyHeaders = requests.every(item => /no-store/i.test(String(item.cacheControl || '')) && /application\/json/i.test(String(item.contentType || '')));
  const ready = authenticated && moduleClosed && privacyHeaders;
  writeResult({
    contract: '2026-10-09-safety-vote-phase9.5-r1', generatedAt: new Date().toISOString(),
    credential: { bearerPresent: Boolean(token), sessionCookiePresent: Boolean(sessionCookie), exactOnePresent: true, valueRecorded: false },
    requests, loginAttempted: false, authenticationBypassed: false, productionMutationPerformed: false,
    moduleOpened: false, externalDelivery: false, deploymentPerformed: false, pushPerformed: false,
    checks: { authenticated, moduleClosed, privacyHeaders },
    blockers: ready ? [] : ['AUTHENTICATED_GET_SMOKE_FAILED'],
    decision: ready ? 'PASS_AUTHENTICATED_GET_ONLY_SMOKE' : 'HOLD_AUTHENTICATED_GET_SMOKE_FAILED'
  });
}

main().catch(error => {
  writeResult({
    contract: '2026-10-09-safety-vote-phase9.5-r1', generatedAt: new Date().toISOString(),
    credential: { bearerPresent: Boolean(token), sessionCookiePresent: Boolean(sessionCookie), exactOnePresent: Boolean(token) !== Boolean(sessionCookie), valueRecorded: false },
    requests: [], loginAttempted: false, authenticationBypassed: false, productionMutationPerformed: false,
    errorClass: error.name || 'Error', blockers: ['AUTHENTICATED_GET_SMOKE_UNAVAILABLE'], decision: 'HOLD_AUTHENTICATED_GET_SMOKE_UNAVAILABLE'
  });
  process.exitCode = 1;
});
