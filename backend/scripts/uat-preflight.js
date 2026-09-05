// Phase 5 UAT preflight.
// Starts the Express app on an ephemeral port and verifies that the main
// read surfaces for every module are reachable with the expected role.

const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

function tokenFor(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
}

async function request(base, testCase) {
    const headers = {};
    if (testCase.token) headers.Authorization = `Bearer ${testCase.token}`;

    let status = 0;
    let message = '';
    try {
        const res = await fetch(`${base}${testCase.path}`, {
            method: testCase.method || 'GET',
            headers,
        });
        status = res.status;
        const type = res.headers.get('content-type') || '';
        if (type.includes('application/json')) {
            const json = await res.json().catch(() => null);
            message = json?.message || json?.error || '';
        } else {
            message = await res.text().catch(() => '');
        }
    } catch (err) {
        message = err.message;
    }

    return {
        name: testCase.name,
        path: testCase.path,
        status,
        expect: testCase.expect,
        pass: status === testCase.expect,
        message,
    };
}

function cases(adminToken, userToken, { bbsRestrictedToApprovedParticipants = false } = {}) {
    const userRead = [
        ['Policies page data', '/pagedata/policies'],
        ['Committees page data', '/pagedata/committees'],
        ['KPI announcements page data', '/pagedata/kpi-announcements'],
        ['KPI data current year', `/kpidata/${new Date().getFullYear()}`],
        ['Employees list', '/employees'],
        ['Overview dashboard', '/dashboard/overview'],
        ['Overview alerts', '/dashboard/alerts'],
        ['Overview config', '/dashboard/config'],
        ['Master departments', '/master/departments'],
        ['Master teams', '/master/teams'],
        ['Master roles', '/master/roles'],
        ['Master positions', '/master/positions'],
        ['Master areas', '/master/areas'],
        ['Master safety units', '/master/safety-units'],
        ['Patrol dashboard stats', '/patrol/dashboard-stats'],
        ['Patrol issues', '/patrol/issues'],
        ['Patrol teams', '/patrol/teams'],
        ['Patrol areas', '/patrol/areas'],
        ['Patrol roster', '/patrol/roster'],
        ['4M stats', '/fourm/stats'],
        ['4M notices', '/fourm/notices'],
        ['4M man records', '/fourm/man-records'],
        ['Hiyari stats', '/hiyari/stats'],
        ['Hiyari dashboard config', '/hiyari/dashboard-config'],
        ['Hiyari reports', '/hiyari'],
        ['KY stats', '/ky/stats'],
        ['KY program config', '/ky/program-config'],
        ['KY activities', '/ky'],
        ['CCCF worker forms', '/cccf/form-a-worker'],
        ['CCCF permanent forms', '/cccf/form-a-permanent'],
        ['CCCF unit targets', '/cccf/unit-targets'],
        ['CCCF assignments', '/cccf/assignments'],
        ['Machine Safety list', '/machine-safety'],
        ['OJT standard', '/ojt/standard'],
        ['OJT records', '/ojt/records'],
        ['OJT documents', '/ojt/documents'],
        ['Training courses', '/training/courses'],
        ['Training summary', '/training/summary'],
        ['Training records', '/training/records'],
        ['Training department summary', '/training/dept-summary'],
        ['Training department records', '/training/dept-records'],
        ['Training course summary', '/training/course-summary'],
        ['4M Training Matrix summary', `/fourm/training-matrix-summary?year=${new Date().getFullYear()}`],
        ['Accident reports', '/accident/reports'],
        ['Accident summary', '/accident/summary'],
        ['Accident analytics', '/accident/analytics'],
        ['Accident performance', '/accident/performance'],
        ['Accident employees', '/accident/employees'],
        ['Yokoten topics', '/yokoten/topics'],
        ['Yokoten dept history', '/yokoten/dept-history'],
        ['Yokoten department completion summary', '/yokoten/dept-completion'],
        ['Yokoten company overview', `/yokoten/company-overview?year=${new Date().getFullYear()}`],
        ['Yokoten dashboard config', '/yokoten/dashboard-config'],
        ['Safety Culture principles', '/safety-culture/principles'],
        ['Safety Culture assessments', '/safety-culture/assessments'],
        ['Safety Culture PPE items', '/safety-culture/ppe-items'],
        ['Safety Culture PPE work types', '/safety-culture/ppe-work-types'],
        ['Safety Culture PPE inspections', '/safety-culture/ppe-inspections'],
        ['Safety Culture dashboard', '/safety-culture/dashboard'],
        ['Contractor documents', '/contractor/documents'],
        ['Contractor document stats', '/contractor/documents/stats'],
        ['Contractor activity', '/contractor/activity'],
        ['Activity target activities', '/activity-targets/activities'],
        ['Activity target position templates', '/activity-targets/position-templates'],
        ['Activity target scope overrides', '/activity-targets/scope-overrides'],
        ['Activity targets me', '/activity-targets/me'],
        ['Module forms hiyari', '/module-forms?module=hiyari'],
        ['Person search employees', '/person-search/employees?limit=5'],
        ['BBS my context', '/bbs/me/context'],
        ['BBS my team', '/bbs/me/team'],
        ['BBS eligible employees', '/bbs/eligible-employees'],
        ['BBS Phase 3 workspace', '/bbs/workspace'],
        ['BBS Phase 3 self history', '/bbs/observations?view=observer'],
        ['BBS Phase 5 action summary', '/bbs/actions/summary'],
        ['BBS Phase 5 visible actions', '/bbs/actions'],
        ['BBS Phase 6 analytics', `/bbs/analytics?scope=personal&year=${new Date().getFullYear()}`],
        ['BBS Phase 6 scoped export data', `/bbs/analytics/export-data?scope=personal&year=${new Date().getFullYear()}`],
        ['BBS Phase 6 drill-down', `/bbs/analytics/drilldown?scope=personal&year=${new Date().getFullYear()}&metric=observations`],
        ['BBS Phase 8 Department cards', '/bbs/department-cards/me'],
        ['BBS Phase 8 Community employees', '/bbs/community/employees'],
        ['BBS Phase 8 Community dashboard', `/bbs/community/dashboard?year=${new Date().getFullYear()}`],
        ['BBS Phase 9 inspector self workspace', '/bbs/inspectors/me'],
        ['BBS Phase 9B inspector self compliance', `/bbs/inspectors/compliance?year=${new Date().getFullYear()}&month=${new Date().getMonth()+1}`],
    ].map(([name, path]) => ({
        name,
        path,
        token: userToken,
        expect: bbsRestrictedToApprovedParticipants && path.startsWith('/bbs/') ? 403 : 200,
    }));

    const adminRead = [
        ['Admin dashboard stats', '/admin/dashboard-stats'],
        ['Admin system health', '/admin/system-health'],
        ['Admin audit logs', '/admin/audit-logs?limit=5'],
        ['Admin employees', '/admin/employees'],
        ['Admin recent employee additions', '/admin/employee/recent-additions'],
        ['Admin email requirement rules', '/admin/email-requirement-rules'],
        ['Admin email readiness', '/admin/email-readiness'],
        ['Admin schedules', '/admin/schedules'],
        ['Admin permissions matrix', '/admin/permissions/matrix'],
        ['Admin org departments', '/admin/org/departments'],
        ['Admin org units', '/admin/org/units'],
        ['4M responsible employee picker', '/fourm/responsible-employees?q=00&limit=5'],
        ['KY missing submission reminder queue', '/ky/reminder-queue'],
        ['Yokoten dept completion', '/yokoten/dept-completion'],
        ['Yokoten all responses', '/yokoten/all-responses'],
        ['Yokoten employee completion', '/yokoten/employee-completion'],
        ['Safety Culture PPE violation summary', '/safety-culture/ppe-violations/summary'],
        ['Safety Culture PPE violations', '/safety-culture/ppe-violations'],
        ['BBS Phase 1 foundation', '/bbs/admin/foundation'],
        ['BBS Phase 2 checklists', '/bbs/admin/checklists'],
        ['BBS Phase 4 card templates', '/bbs/admin/card-templates'],
        ['BBS Phase 4 card employees', '/bbs/admin/card-employees'],
        ['BBS Phase 4 cards', '/bbs/admin/cards'],
        ['BBS Phase 10F-1 designer catalog', '/bbs/admin/card-designer/catalog'],
        ['BBS Phase 5 SLA rules', '/bbs/admin/action-sla-rules'],
        ['BBS Phase 5 action outbox', '/bbs/admin/action-outbox'],
        ['BBS Phase 8 Department card admin', '/bbs/admin/department-cards'],
        ['BBS Phase 9 inspector admin', '/bbs/admin/inspectors'],
        ['BBS Phase 9B inspector company compliance', `/bbs/inspectors/compliance?year=${new Date().getFullYear()}&month=${new Date().getMonth()+1}`],
    ].map(([name, path]) => ({ name, path, token: adminToken, expect: 200 }));

    const userBlocked = [
        ['User blocked from admin dashboard', '/admin/dashboard-stats'],
        ['User blocked from admin system health', '/admin/system-health'],
        ['User blocked from audit logs', '/admin/audit-logs?limit=5'],
        ['User blocked from recent employee additions', '/admin/employee/recent-additions'],
        ['User blocked from admin email readiness', '/admin/email-readiness'],
        ['User blocked from 4M responsible employee picker', '/fourm/responsible-employees?q=00&limit=5'],
        ['User blocked from KY reminder queue', '/ky/reminder-queue'],
        ['User blocked from Yokoten all responses', '/yokoten/all-responses'],
        ['User blocked from Yokoten employee completion', '/yokoten/employee-completion'],
        ['User blocked from Safety Culture PPE violations', '/safety-culture/ppe-violations'],
        ['User blocked from BBS Phase 1 foundation', '/bbs/admin/foundation'],
        ['User blocked from BBS Phase 2 checklists', '/bbs/admin/checklists'],
        ['User blocked from BBS Phase 4 card templates', '/bbs/admin/card-templates'],
        ['User blocked from BBS Phase 4 card employees', '/bbs/admin/card-employees'],
        ['User blocked from BBS Phase 4 cards', '/bbs/admin/cards'],
        ['User blocked from BBS Phase 10F-1 designer catalog', '/bbs/admin/card-designer/catalog'],
        ['User blocked from BBS Phase 5 SLA rules', '/bbs/admin/action-sla-rules'],
        ['User blocked from BBS Phase 5 action outbox', '/bbs/admin/action-outbox'],
        ['User blocked from BBS Phase 8 Department card admin', '/bbs/admin/department-cards'],
        ['User blocked from BBS Phase 9 inspector admin', '/bbs/admin/inspectors'],
    ].map(([name, path]) => ({ name, path, token: userToken, expect: 403 }));

    return [
        { name: 'Public register options', path: '/register/options', expect: 200 },
        ...userRead,
        ...adminRead,
        ...userBlocked,
    ];
}

async function main() {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;

    try {
        const readyUsers = await loadReadyTestUsers(db);
        const [bbsGateRows] = await db.query(
            "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('staged_admin_only','pilot_scope_only')"
        ).catch(() => [[]]);
        const bbsGate = Object.fromEntries(bbsGateRows.map(row => [row.SettingKey, String(row.SettingValue)]));
        const bbsRestrictedToApprovedParticipants = bbsGate.staged_admin_only === '1' || bbsGate.pilot_scope_only === '1';
        const tests = cases(tokenFor(readyUsers.admin), tokenFor(readyUsers.user), { bbsRestrictedToApprovedParticipants });
        const results = [];
        for (const testCase of tests) {
            results.push(await request(base, testCase));
        }

        const failed = results.filter(r => !r.pass);
        console.log('Local read-only UAT preflight summary');
        console.log(`Checked ${results.length} read/permission surfaces. Passed ${results.length - failed.length}. Failed ${failed.length}.`);
        for (const r of results) {
            const label = r.pass ? 'PASS' : 'FAIL';
            console.log(`${label.padEnd(4)} ${String(r.status).padStart(3)} expected ${String(r.expect).padStart(3)}  ${r.name} ${r.path}${r.message ? ` — ${r.message}` : ''}`);
        }

        if (failed.length) process.exitCode = 1;
    } finally {
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
    }
}

main().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
