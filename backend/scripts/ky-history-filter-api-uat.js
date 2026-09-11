'use strict';

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const year = Number(process.env.KY_HISTORY_UAT_YEAR || new Date().getFullYear());
const credentials = {
    employeeId: String(process.env.PROD_UAT_ADMIN_ID || '').trim(),
    password: String(process.env.PROD_UAT_ADMIN_PASSWORD || ''),
};
const stacks = [
    {
        name: 'Node',
        login: 'http://127.0.0.1:5000/api/login',
        url: route => `http://127.0.0.1:5000/api${route}`,
    },
    {
        name: 'PHP',
        login: 'http://localhost/tsh-safety-core/api/index.php?route=login',
        url: route => `http://localhost/tsh-safety-core/api/index.php?route=${route.slice(1).replace('?', '&')}`,
    },
];

async function login(stack) {
    const response = await fetch(stack.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
    });
    assert.strictEqual(response.status, 200, `${stack.name} login failed`);
    const payload = await response.json();
    assert.ok(payload.token, `${stack.name} login returned no token`);
    return payload.token;
}

async function read(stack, token, query) {
    const response = await fetch(stack.url(`/ky?${query}`), { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    assert.strictEqual(response.status, 200, `${stack.name} query failed (${query}): ${payload.message || response.status}`);
    assert.ok(Array.isArray(payload.data), `${stack.name} query must return an array`);
    return payload.data;
}

function hasText(value) {
    return String(value || '').trim() !== '';
}

function evidenceMatches(row, filter) {
    const file = hasText(row.AttachmentUrl);
    const video = hasText(row.VideoUrl);
    if (filter === 'complete') return file && video;
    if (filter === 'waiting_video') return file && !video;
    if (filter === 'no_video') return !video;
    if (filter === 'missing_file') return !file;
    return true;
}

function activityDateKey(value) {
    const text = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(text));
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function ids(rows) {
    return rows.map(row => String(row.id)).sort();
}

(async () => {
    assert.ok(credentials.employeeId && credentials.password, 'Admin UAT credentials are required');
    const tokens = Object.fromEntries(await Promise.all(stacks.map(async stack => [stack.name, await login(stack)])));
    const baselines = {};
    for (const stack of stacks) baselines[stack.name] = await read(stack, tokens[stack.name], `year=${year}`);
    assert.ok(baselines.PHP.length > 0, `No KY ${year} records are available for read-only UAT`);

    const sample = baselines.PHP[0];
    const departments = [...new Set(baselines.PHP.map(row => row.Department).filter(Boolean))];
    const queryCases = [
        {
            name: 'department',
            query: `year=${year}&department=${encodeURIComponent(sample.Department)}`,
            predicate: row => row.Department === sample.Department,
        },
        {
            name: 'risk',
            query: `year=${year}&riskCategory=${encodeURIComponent(sample.RiskCategory)}`,
            predicate: row => row.RiskCategory === sample.RiskCategory,
        },
        {
            name: 'date-range',
            query: `dateFrom=${sample.ActivityDate}&dateTo=${sample.ActivityDate}`,
            predicate: row => activityDateKey(row.ActivityDate) === sample.ActivityDate,
        },
        {
            name: 'search',
            query: `year=${year}&q=${encodeURIComponent(sample.ReporterName)}`,
            predicate: row => [row.ReporterName, row.SubmittedByName, row.Department, row.SafetyUnit, row.TeamName, row.KYTKeyword, row.HazardDescription, row.Countermeasure]
                .some(value => String(value || '').toLocaleLowerCase().includes(String(sample.ReporterName).toLocaleLowerCase())),
        },
        {
            name: 'configured-departments',
            query: `year=${year}&depts=${encodeURIComponent(departments.slice(0, 2).join(','))}`,
            predicate: row => departments.slice(0, 2).includes(row.Department),
        },
        ...['complete', 'waiting_video', 'no_video', 'missing_file'].map(filter => ({
            name: `evidence-${filter}`,
            query: `year=${year}&evidence=${filter}`,
            predicate: row => evidenceMatches(row, filter),
        })),
        {
            name: 'source-admin',
            query: `year=${year}&source=admin`,
            predicate: row => hasText(row.SubmittedByID) && String(row.SubmittedByID) !== String(row.ReporterID),
        },
        {
            name: 'source-self',
            query: `year=${year}&source=self`,
            predicate: row => !hasText(row.SubmittedByID) || String(row.SubmittedByID) === String(row.ReporterID),
        },
    ];

    const summary = {};
    for (const testCase of queryCases) {
        const results = {};
        for (const stack of stacks) {
            results[stack.name] = await read(stack, tokens[stack.name], testCase.query);
            assert.ok(results[stack.name].every(testCase.predicate), `${stack.name} leaked rows for ${testCase.name}`);
        }
        assert.deepStrictEqual(ids(results.Node), ids(results.PHP), `Node/PHP result mismatch for ${testCase.name}`);
        summary[testCase.name] = results.PHP.length;
    }

    for (const stack of stacks) {
        const response = await fetch(stack.url('/ky?dateFrom=2026-12-31&dateTo=2026-01-01'), {
            headers: { Authorization: `Bearer ${tokens[stack.name]}` },
        });
        assert.strictEqual(response.status, 400, `${stack.name} must reject a reversed date range`);
    }

    console.log(JSON.stringify({ success: true, year, baselineRows: baselines.PHP.length, filters: summary, nodePhpParity: true, writes: 0 }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
