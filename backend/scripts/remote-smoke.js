// Remote smoke test for staging/production preview deployments.
// Usage: SMOKE_BASE_URL=https://preview.example.com npm run smoke:remote

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const rawBase = process.env.SMOKE_BASE_URL || process.argv[2];

if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

if (!rawBase) {
    console.error('FAILED: set SMOKE_BASE_URL or pass the base URL as the first argument.');
    process.exit(1);
}

const base = rawBase.replace(/\/+$/, '') + '/api';

function makeToken(role) {
    return jwt.sign(
        {
            id: `remote-smoke-${role.toLowerCase()}`,
            name: `Remote Smoke ${role}`,
            department: 'QA',
            team: '',
            role,
        },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
}

async function request({ name, method = 'GET', path, token, expect }) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let status = 0;
    let message = '';
    try {
        const res = await fetch(`${base}${path}`, { method, headers });
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

    return { name, path, status, expect, pass: status === expect, message };
}

async function main() {
    const adminToken = makeToken('Admin');
    const userToken = makeToken('User');
    const cases = [
        { name: 'public register options', path: '/register/options', expect: 200 },
        { name: 'admin without token rejected', path: '/admin/dashboard-stats', expect: 401 },
        { name: 'admin with user token forbidden', path: '/admin/dashboard-stats', token: userToken, expect: 403 },
        { name: 'admin with admin token ok', path: '/admin/dashboard-stats', token: adminToken, expect: 200 },
        { name: 'user can read policies page data', path: '/pagedata/policies', token: userToken, expect: 200 },
        { name: 'user blocked from audit logs', path: '/admin/audit-logs?limit=1', token: userToken, expect: 403 },
    ];

    const results = [];
    for (const testCase of cases) {
        results.push(await request(testCase));
    }

    console.log(`Remote smoke test summary for ${rawBase}`);
    for (const r of results) {
        const label = r.pass ? 'PASS' : 'FAIL';
        console.log(`${label.padEnd(4)} ${String(r.status).padStart(3)} expected ${String(r.expect).padStart(3)}  ${r.name} ${r.path}${r.message ? ` - ${r.message}` : ''}`);
    }

    if (results.some(r => !r.pass)) process.exit(1);
}

main().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
