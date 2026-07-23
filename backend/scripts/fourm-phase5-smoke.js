// Focused Phase 5 workflow smoke test for 4M Change Management.
// Creates temporary Change Notice and Man Record rows, verifies key guards,
// checks semantic audit actions, then removes the temporary records.

const jwt = require('jsonwebtoken');
process.env.FOURM_EMAIL_BACKGROUND = 'false';
const app = require('../server');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

const stamp = `PHASE5_${Date.now()}`;
const qaDept = `${stamp}_DEPT`;
const qaTitle = `${stamp}_NOTICE`;

function tokenFor(role) {
    return jwt.sign(
        {
            id: `fourm-phase5-${role.toLowerCase()}`,
            name: `4M Phase5 ${role}`,
            department: 'QA',
            role,
        },
        JWT_SECRET,
        { expiresIn: '10m' }
    );
}

async function api(base, { name, method = 'GET', path, token, body, expect }) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${base}${path}`, options);
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await res.json().catch(() => null)
        : await res.text().catch(() => '');
    return {
        name,
        status: res.status,
        expect,
        pass: res.status === expect,
        payload,
        message: payload?.message || payload?.error || '',
    };
}

function assertStep(results, result) {
    results.push(result);
    if (!result.pass) {
        throw new Error(`${result.name} expected ${result.expect}, got ${result.status}${result.message ? `: ${result.message}` : ''}`);
    }
    return result;
}

async function main() {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;
    const adminToken = tokenFor('Admin');
    const userToken = tokenFor('User');
    const today = new Date().toISOString().slice(0, 10);
    const results = [];
    let noticeId = '';
    let manId = '';
    let taskId = '';

    try {
        assertStep(results, await api(base, {
            name: 'user creates Change Notice',
            method: 'POST',
            path: '/fourm/notices',
            token: userToken,
            body: {
                RequestDate: today,
                Title: qaTitle,
                Description: 'Temporary 4M Phase 5 notice',
                ChangeType: 'Method',
                Department: qaDept,
                SafetyImpact: 'High',
                QualityImpact: 'Medium',
                ProductionImpact: 'Low',
                EnvironmentImpact: 'N/A',
                TrainingRequired: '1',
                ImpactNote: 'Temporary impact verification',
            },
            expect: 201,
        }));

        const mine = assertStep(results, await api(base, {
            name: 'user My Notices finds own record',
            path: `/fourm/notices?mine=1&q=${encodeURIComponent(qaTitle)}`,
            token: userToken,
            expect: 200,
        }));
        const mineRows = Array.isArray(mine.payload?.data) ? mine.payload.data : [];
        noticeId = mineRows.find(row => row.Title === qaTitle)?.id || '';
        if (!noticeId || mineRows.some(row => row.CreatedByID !== 'fourm-phase5-user')) {
            throw new Error('My Notices did not return the expected user-scoped Change Notice.');
        }
        const mineNotice = mineRows.find(row => row.id === noticeId);
        if (mineNotice.SafetyImpact !== 'High' || Number(mineNotice.TrainingRequired || 0) !== 1) {
            throw new Error('Impact Assessment fields were not saved on Change Notice create.');
        }

        assertStep(results, await api(base, {
            name: 'creator adds Action Plan task',
            method: 'POST',
            path: `/fourm/notices/${noticeId}/tasks`,
            token: userToken,
            body: {
                TaskTitle: 'Phase 5 follow-up task',
                OwnerName: '4M Phase5 Owner',
                DueDate: today,
                Status: 'Pending',
                Notes: 'Temporary task verification',
            },
            expect: 201,
        }));

        const taskList = assertStep(results, await api(base, {
            name: 'Action Plan task list returns temporary task',
            path: `/fourm/notices/${noticeId}/tasks`,
            token: userToken,
            expect: 200,
        }));
        taskId = (Array.isArray(taskList.payload?.data) ? taskList.payload.data : [])
            .find(row => row.TaskTitle === 'Phase 5 follow-up task')?.id || '';
        if (!taskId) throw new Error('Action Plan task list did not return the temporary row.');

        assertStep(results, await api(base, {
            name: 'admin marks Action Plan task done',
            method: 'PUT',
            path: `/fourm/notice-tasks/${taskId}`,
            token: adminToken,
            body: { Status: 'Done' },
            expect: 200,
        }));

        assertStep(results, await api(base, {
            name: 'admin deletes Action Plan task',
            method: 'DELETE',
            path: `/fourm/notice-tasks/${taskId}`,
            token: adminToken,
            expect: 200,
        }));
        taskId = '';

        assertStep(results, await api(base, {
            name: 'user cannot admin-edit Change Notice',
            method: 'PUT',
            path: `/fourm/notices/${noticeId}`,
            token: userToken,
            body: { Status: 'Pending' },
            expect: 403,
        }));

        assertStep(results, await api(base, {
            name: 'admin sets Change Notice pending',
            method: 'PUT',
            path: `/fourm/notices/${noticeId}`,
            token: adminToken,
            body: { Status: 'Pending' },
            expect: 200,
        }));

        assertStep(results, await api(base, {
            name: 'creator closes Change Notice',
            method: 'POST',
            path: `/fourm/notices/${noticeId}/close`,
            token: userToken,
            body: { ClosingComment: 'Phase 5 close verification', ClosedDate: today },
            expect: 200,
        }));

        assertStep(results, await api(base, {
            name: 'closed Notice cannot reopen through generic update',
            method: 'PUT',
            path: `/fourm/notices/${noticeId}`,
            token: adminToken,
            body: { Status: 'Open' },
            expect: 400,
        }));

        const [emailRows] = await db.query(
            `SELECT EventType
             FROM FourM_EmailOutbox
             WHERE NoticeID = ?
               AND EventType IN ('NoticeCreated','NoticePending','NoticeClosed','ActionTaskCreated','ActionTaskDone')`,
            [noticeId]
        );
        const emailEvents = new Set(emailRows.map(row => row.EventType));
        const requiredEmailEvents = ['NoticeCreated', 'NoticePending', 'NoticeClosed', 'ActionTaskCreated', 'ActionTaskDone'];
        const missingEmailEvents = requiredEmailEvents.filter(eventType => !emailEvents.has(eventType));
        if (missingEmailEvents.length) throw new Error(`Missing 4M email outbox events: ${missingEmailEvents.join(', ')}`);
        results.push({ name: '4M notification outbox events present', status: 200, expect: 200, pass: true, message: '' });

        assertStep(results, await api(base, {
            name: 'user cannot create Man Record',
            method: 'POST',
            path: '/fourm/man-records',
            token: userToken,
            body: { Department: qaDept, TotalAttendance: 3, Pass: 2, Fail: 1, Status: 'Pending', ExamDate: today },
            expect: 403,
        }));

        assertStep(results, await api(base, {
            name: 'admin creates Man Record',
            method: 'POST',
            path: '/fourm/man-records',
            token: adminToken,
            body: { Department: qaDept, TotalAttendance: 3, Pass: 2, Fail: 1, Status: 'Pending', ExamDate: today },
            expect: 201,
        }));

        const manList = assertStep(results, await api(base, {
            name: 'Man Record status filter returns temporary record',
            path: `/fourm/man-records?status=Pending&q=${encodeURIComponent(qaDept)}&year=${new Date().getFullYear()}`,
            token: adminToken,
            expect: 200,
        }));
        manId = (Array.isArray(manList.payload?.data) ? manList.payload.data : []).find(row => row.Department === qaDept)?.id || '';
        if (!manId) throw new Error('Man Record status filter did not return the temporary row.');

        assertStep(results, await api(base, {
            name: 'admin updates Man Record',
            method: 'PUT',
            path: `/fourm/man-records/${manId}`,
            token: adminToken,
            body: { Status: 'Pass', TotalAttendance: 3, Pass: 3, Fail: 0, ExamDate: today },
            expect: 200,
        }));

        assertStep(results, await api(base, {
            name: 'admin deletes Man Record',
            method: 'DELETE',
            path: `/fourm/man-records/${manId}`,
            token: adminToken,
            expect: 200,
        }));
        manId = '';

        assertStep(results, await api(base, {
            name: 'admin deletes temporary Change Notice',
            method: 'DELETE',
            path: `/fourm/notices/${noticeId}`,
            token: adminToken,
            expect: 200,
        }));
        await db.query('DELETE FROM FourM_EmailOutbox WHERE NoticeID = ?', [noticeId]).catch(() => {});
        noticeId = '';

        const [auditRows] = await db.query(
            `SELECT Action
             FROM Admin_AuditLogs
             WHERE Action IN (
                'FOURM_NOTICE_CREATE',
                'FOURM_NOTICE_PENDING',
                'FOURM_NOTICE_CLOSE',
                'FOURM_NOTICE_DELETE',
                'FOURM_ACTION_TASK_CREATE',
                'FOURM_ACTION_TASK_DONE',
                'FOURM_ACTION_TASK_DELETE',
                'FOURM_MAN_RECORD_CREATE',
                'FOURM_MAN_RECORD_UPDATE',
                'FOURM_MAN_RECORD_DELETE'
             )
               AND ActionTime >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
        );
        const auditActions = new Set(auditRows.map(row => row.Action));
        const requiredActions = [
            'FOURM_NOTICE_CREATE',
            'FOURM_NOTICE_PENDING',
            'FOURM_NOTICE_CLOSE',
            'FOURM_NOTICE_DELETE',
            'FOURM_ACTION_TASK_CREATE',
            'FOURM_ACTION_TASK_DONE',
            'FOURM_ACTION_TASK_DELETE',
            'FOURM_MAN_RECORD_CREATE',
            'FOURM_MAN_RECORD_UPDATE',
            'FOURM_MAN_RECORD_DELETE',
        ];
        const missing = requiredActions.filter(action => !auditActions.has(action));
        if (missing.length) throw new Error(`Missing semantic 4M audit actions: ${missing.join(', ')}`);
        results.push({ name: 'semantic 4M audit actions present', status: 200, expect: 200, pass: true, message: '' });

        console.log('4M Phase 5 smoke summary');
        for (const result of results) {
            console.log(`${(result.pass ? 'PASS' : 'FAIL').padEnd(4)} ${String(result.status).padStart(3)} expected ${String(result.expect).padStart(3)}  ${result.name}${result.message ? ` - ${result.message}` : ''}`);
        }
    } finally {
        if (manId) await db.query('DELETE FROM FourM_ManRecords WHERE id = ?', [manId]).catch(() => {});
        if (noticeId) await db.query('DELETE FROM FourM_EmailOutbox WHERE NoticeID = ?', [noticeId]).catch(() => {});
        if (taskId) await db.query('DELETE FROM FourM_ActionTasks WHERE id = ?', [taskId]).catch(() => {});
        if (noticeId) await db.query('DELETE FROM FourM_ChangeNotices WHERE id = ?', [noticeId]).catch(() => {});
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
    }
}

main().catch(err => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
