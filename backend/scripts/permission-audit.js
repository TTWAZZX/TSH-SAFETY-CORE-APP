// Static permission audit for backend mutation routes.
// This is intentionally conservative: it flags any POST/PUT/PATCH/DELETE route
// that is not admin-mounted, does not use isAdmin, and is not on the reviewed
// user-workflow allowlist below.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const routesDir = path.join(root, 'routes');

const MUTATION = new Set(['post', 'put', 'patch', 'delete']);

const USER_WORKFLOW_ALLOWLIST = new Set([
    'POST /api/login',
    'POST /api/register',
    'POST /api/change-password',
    'POST /api/session/verify',
    'PUT /api/profile',
    'PUT /api/profile/employee-id',
    'POST /api/policies/:id/acknowledge',

    // CCCF: user-owned forms; update/delete enforce owner-or-admin in route.
    'POST /api/cccf/activity',
    'POST /api/cccf/form-a-worker',
    'PUT /api/cccf/form-a-worker/:id',
    'DELETE /api/cccf/form-a-worker/:id',
    'POST /api/cccf/form-a-permanent',

    // Patrol: check-in/self-check-in and opening/temp action are user workflows.
    'POST /api/patrol/checkin',
    'POST /api/patrol/issue/save',
    'DELETE /api/patrol/issue/:id',
    'POST /api/patrol/self-checkin',
    'DELETE /api/patrol/self-checkin/:id',

    // Reporting/activity submissions that normal users can create.
    'POST /api/hiyari',
    'POST /api/ky',
    'POST /api/fourm/notices',
    'POST /api/fourm/notices/:id/close',
    'POST /api/yokoten/respond',
    'PUT /api/yokoten/respond/:id',
]);

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function normalizeRoute(route) {
    return route
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .replace(/\/:([A-Za-z0-9_]+)/g, '/:$1') || '/';
}

function parseServerMounts(serverText) {
    const requires = new Map();
    for (const m of serverText.matchAll(/const\s+(\w+)\s*=\s*require\('\.\/routes\/([^']+)'\)/g)) {
        requires.set(m[1], m[2]);
    }

    const mounts = new Map();
    for (const line of serverText.split(/\r?\n/)) {
        const m = line.match(/app\.use\('([^']+)'\s*,\s*([^)]*)\)/);
        if (!m) continue;
        const base = normalizeRoute(m[1]);
        const args = m[2].split(',').map(s => s.trim()).filter(Boolean);
        const routeVar = args[args.length - 1];
        const routeFile = requires.get(routeVar);
        if (!routeFile) continue;
        mounts.set(`${routeFile}.js`, {
            base,
            adminMounted: args.includes('isAdmin'),
            authMounted: args.includes('authenticateToken'),
        });
    }
    return mounts;
}

function parseAppRoutes(serverText) {
    const rows = [];
    const lines = serverText.split(/\r?\n/);
    lines.forEach((line, idx) => {
        const m = line.match(/app\.(post|put|patch|delete)\('([^']+)'\s*,\s*([^)]*)/i);
        if (!m) return;
        const method = m[1].toUpperCase();
        const route = normalizeRoute(m[2]);
        rows.push({
            file: 'server.js',
            line: idx + 1,
            method,
            route,
            key: `${method} ${route}`,
            admin: line.includes('isAdmin'),
            mountedAdmin: false,
            inlineGuard: false,
        });
    });
    return rows;
}

function parseRouterRoutes(fileName, text, mount) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
        const m = line.match(/router\.(post|put|patch|delete)\('([^']+)'\s*,\s*([^)]*)/i);
        if (!m) return;
        const method = m[1].toUpperCase();
        const route = normalizeRoute(`${mount?.base || ''}/${m[2]}`);
        const snippet = lines.slice(idx, idx + 45).join('\n');
        rows.push({
            file: `routes/${fileName}`,
            line: idx + 1,
            method,
            route,
            key: `${method} ${route}`,
            admin: line.includes('isAdmin'),
            mountedAdmin: !!mount?.adminMounted,
            inlineGuard: /req\.user\??\.(role|Role).*Admin|req\.user\??\.(role|Role)[\s\S]{0,80}Admin|isAdminUser/.test(snippet),
        });
    });
    return rows;
}

function statusFor(row) {
    if (row.admin || row.mountedAdmin) return 'ADMIN';
    if (row.inlineGuard) return 'INLINE_GUARD';
    if (USER_WORKFLOW_ALLOWLIST.has(row.key)) return 'USER_WORKFLOW';
    return 'UNREVIEWED';
}

function main() {
    const serverText = read(serverPath);
    const mounts = parseServerMounts(serverText);
    const rows = [...parseAppRoutes(serverText)];

    for (const fileName of fs.readdirSync(routesDir).filter(f => f.endsWith('.js')).sort()) {
        rows.push(...parseRouterRoutes(fileName, read(path.join(routesDir, fileName)), mounts.get(fileName)));
    }

    const enriched = rows
        .filter(r => MUTATION.has(r.method.toLowerCase()))
        .map(r => ({ ...r, status: statusFor(r) }))
        .sort((a, b) => a.status.localeCompare(b.status) || a.file.localeCompare(b.file) || a.line - b.line);

    const counts = enriched.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});

    console.log('Permission audit summary');
    console.log(JSON.stringify(counts, null, 2));
    console.log('');
    for (const row of enriched) {
        console.log(`${row.status.padEnd(13)} ${row.key.padEnd(46)} ${row.file}:${row.line}`);
    }

    const unreviewed = enriched.filter(r => r.status === 'UNREVIEWED');
    if (unreviewed.length) {
        console.error(`\nFAILED: ${unreviewed.length} mutation route(s) need permission review.`);
        process.exit(1);
    }
}

main();
