// API smoke test for pre-production checks.
// It starts the Express app on an ephemeral local port, then verifies:
// - public boot/read endpoint
// - admin route rejects missing token
// - admin route rejects User token
// - admin route accepts Admin token
// - User can read normal authenticated data
// - User cannot write admin/master data

const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

function makeToken(role) {
    return jwt.sign(
        {
            id: `smoke-${role.toLowerCase()}`,
            name: `Smoke ${role}`,
            department: 'QA',
            role,
        },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
}

async function request(base, { name, method, path, token, body, expect }) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    let status = 0;
    let message = '';
    try {
        const res = await fetch(`${base}${path}`, options);
        status = res.status;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const json = await res.json().catch(() => null);
            message = json?.message || json?.error || '';
        } else {
            message = await res.text().catch(() => '');
        }
    } catch (err) {
        message = err.message;
    }

    return {
        name,
        status,
        expect,
        pass: status === expect,
        message,
    };
}

async function main() {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;
    const adminToken = makeToken('Admin');
    const userToken = makeToken('User');

    const cases = [
        { name: 'public register options', method: 'GET', path: '/register/options', expect: 200 },
        { name: 'admin without token rejected', method: 'GET', path: '/admin/dashboard-stats', expect: 401 },
        { name: 'admin with user token forbidden', method: 'GET', path: '/admin/dashboard-stats', token: userToken, expect: 403 },
        { name: 'admin with admin token ok', method: 'GET', path: '/admin/dashboard-stats', token: adminToken, expect: 200 },
        { name: 'user can read policies page data', method: 'GET', path: '/pagedata/policies', token: userToken, expect: 200 },
        {
            name: 'user cannot write master data',
            method: 'POST',
            path: '/master/departments',
            token: userToken,
            body: { Name: 'SMOKE_SHOULD_NOT_CREATE' },
            expect: 403,
        },
        { name: 'admin can read audit logs', method: 'GET', path: '/admin/audit-logs?limit=5', token: adminToken, expect: 200 },
    ];

    try {
        const results = [];
        for (const testCase of cases) {
            results.push(await request(base, testCase));
        }

        console.log('API smoke test summary');
        for (const r of results) {
            const status = r.pass ? 'PASS' : 'FAIL';
            console.log(`${status.padEnd(4)} ${String(r.status).padStart(3)} expected ${String(r.expect).padStart(3)}  ${r.name}${r.message ? ` — ${r.message}` : ''}`);
        }

        if (results.some(r => !r.pass)) {
            process.exitCode = 1;
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
    }
}

main().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
