'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const baseUrl = 'https://dev.tshpcl.com/safety/tsh-safety-core';
const targetCode = String(process.argv[2] || 'SHE-004-2026').trim();

async function resolveToken() {
    const bearer = String(process.env.SAFETY_VOTE_PHASE95_PROD_BEARER_TOKEN || '').trim();
    if (bearer.split('.').length === 3) {
        const probe = await request('safety-vote/admin/health', bearer);
        if (probe.status === 200) return bearer;
    }
    const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
    const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
    assert(employeeId && password, 'Production read-only credentials are unavailable.');
    const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 200, 'Production read-only login failed.');
    assert(body?.token, 'Production login did not return a token.');
    return body.token;
}

async function request(route, token, accept = 'application/json') {
    const response = await fetch(`${baseUrl}/api/index.php?route=${route}&readonly=${Date.now()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: accept, 'Cache-Control': 'no-cache' },
        cache: 'no-store',
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let body = null;
    if (/json/i.test(response.headers.get('content-type') || '')) {
        try { body = JSON.parse(bytes.toString('utf8')); } catch { body = null; }
    }
    return { status: response.status, contentType: response.headers.get('content-type') || '', bytes: bytes.length, body };
}

async function main() {
    const token = await resolveToken();
    const campaigns = await request('safety-vote/admin/campaigns', token);
    assert.equal(campaigns.status, 200, 'Campaign inventory failed.');
    const campaign = campaigns.body?.data?.rows?.find(row => row.CampaignCode === targetCode);
    assert(campaign, `Campaign ${targetCode} was not found.`);
    const builder = await request(`safety-vote/admin/campaigns/${Number(campaign.id)}/builder`, token);
    assert.equal(builder.status, 200, 'Campaign builder read failed.');
    const options = (builder.body?.data?.questions || []).flatMap(question =>
        (question.options || []).map(option => ({
            questionId: Number(question.id),
            optionId: Number(option.id),
            label: option.label,
            fileId: Number(option.fileId || 0) || null,
        }))
    );
    const files = [];
    for (const fileId of [...new Set(options.map(option => option.fileId).filter(Boolean))]) {
        const response = await request(`safety-vote/files/${fileId}`, token, 'image/*');
        files.push({ fileId, status: response.status, contentType: response.contentType, bytes: response.status === 200 ? response.bytes : 0, code: response.body?.code || null });
    }
    let browser = null;
    if (process.argv.includes('--browser')) {
        const instance = await chromium.launch({ headless: true });
        try {
            const page = await instance.newPage({ viewport: { width: 1366, height: 768 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${baseUrl}/index.html?readonly=${Date.now()}`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(value => localStorage.setItem('tsh_token', value), token);
            browser = await page.evaluate(async fileIds => {
                document.body.innerHTML = `<main>${fileIds.map(id => `<span data-sv-auth-media data-svp-media-state="loading"><img data-sv-auth-file="${id}" alt="file ${id}"></span>`).join('')}</main>`;
                const module = await import(`/safety/tsh-safety-core/public/js/utils/safety-vote-auth-image.js?readonly=${Date.now()}`);
                await module.hydrateSafetyVoteImages(document);
                return [...document.querySelectorAll('[data-sv-auth-media]')].map(host => ({ fileId: Number(host.querySelector('img')?.dataset.svAuthFile || 0), state: host.dataset.svpMediaState, message: host.querySelector('[data-sv-auth-status]')?.textContent || '', naturalWidth: host.querySelector('img')?.naturalWidth || 0, naturalHeight: host.querySelector('img')?.naturalHeight || 0 }));
            }, files.map(file => file.fileId));
            assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
        } finally { await instance.close(); }
    }
    process.stdout.write(`${JSON.stringify({ productionMutation: false, campaign: { id: Number(campaign.id), code: campaign.CampaignCode, status: campaign.Status, version: Number(campaign.VersionNo) }, options, files, browser }, null, 2)}\n`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
