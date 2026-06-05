const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

function tokenFor(user) {
    return jwt.sign(user, JWT_SECRET, { expiresIn: '15m' });
}

function dateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function addDays(date, days) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    return dateOnly(d);
}

function shiftMonth(date, delta) {
    const d = new Date(`${date}T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    return dateOnly(d);
}

function sameMonth(date, other) {
    return String(date).slice(0, 7) === String(other).slice(0, 7);
}

async function request(base, method, path, token, body) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, options);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { status: res.status, json, text };
}

async function topSessions(employeeId, year) {
    const [baseRows] = await db.query(
        `SELECT tm.TeamID, tm.PatrolType, e.EmployeeName, e.Department, t.Name AS TeamName
         FROM Patrol_Team_Members tm
         JOIN Employees e ON e.EmployeeID=tm.EmployeeID
         LEFT JOIN Patrol_Teams t ON t.id=tm.TeamID
         WHERE tm.EmployeeID=? LIMIT 1`,
        [employeeId]
    );
    const base = baseRows[0];
    if (!base) return { base: null, sessions: [] };
    const [rotRows] = await db.query(
        'SELECT Month, TeamID FROM Patrol_Member_Rotation WHERE EmployeeID=? AND Year=?',
        [employeeId, year]
    );
    const rot = new Map(rotRows.map(r => [Number(r.Month), Number(r.TeamID)]));
    const teamIds = [...new Set([Number(base.TeamID), ...rotRows.map(r => Number(r.TeamID))])];
    const [rows] = await db.query(
        `SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,
                t.Name AS TeamName,a.Name AS AreaName,a.Code AS AreaCode
         FROM Patrol_Sessions s
         LEFT JOIN Patrol_Teams t ON t.id=s.TeamID
         LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
         WHERE YEAR(s.PatrolDate)=? AND s.TeamID IN (${teamIds.map(() => '?').join(',')})
         ORDER BY s.PatrolDate,s.PatrolRound`,
        [year, ...teamIds]
    );
    const sessions = rows.filter(s => {
        const d = dateOnly(s.PatrolDate);
        const month = Number(d.slice(5, 7));
        const effectiveTeam = rot.get(month) || Number(base.TeamID);
        if (Number(s.TeamID) !== effectiveTeam) return false;
        if (String(s.Status || '').toLowerCase() === 'cancelled') return false;
        return base.PatrolType === 'management' || Number(s.PatrolRound || 0) === 2;
    }).map(s => ({ ...s, PatrolDate: dateOnly(s.PatrolDate) }));
    return { base, sessions };
}

async function isSessionCompleted(employeeId, session) {
    const date = dateOnly(session.PatrolDate);
    const [rows] = await db.query(
        `SELECT id FROM Patrol_Attendance
         WHERE UserID=? AND (ScheduledSessionID=? OR (DATE(PatrolDate)=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID='')))
         LIMIT 1`,
        [employeeId, session.id, date]
    );
    return rows.length > 0;
}

async function findCandidate(targetPerYear, neededInMonth = 1) {
    const year = new Date().getFullYear();
    const [members] = await db.query(
        `SELECT pr.EmployeeID, pr.TargetPerYear, e.EmployeeName, e.Department
         FROM Patrol_Roster pr
         JOIN Employees e ON e.EmployeeID=pr.EmployeeID
         WHERE pr.RosterGroup='top_management' AND pr.TargetPerYear=?
         ORDER BY pr.SortOrder,e.EmployeeName`,
        [targetPerYear]
    );
    for (const m of members) {
        const { base, sessions } = await topSessions(m.EmployeeID, year);
        if (!base) continue;
        const byMonth = new Map();
        for (const s of sessions) {
            const month = s.PatrolDate.slice(0, 7);
            if (!byMonth.has(month)) byMonth.set(month, []);
            byMonth.get(month).push(s);
        }
        for (const monthSessions of byMonth.values()) {
            if (monthSessions.length < neededInMonth) continue;
            const open = [];
            for (const s of monthSessions) {
                if (!(await isSessionCompleted(m.EmployeeID, s))) open.push(s);
            }
            if (open.length >= neededInMonth) {
                return { employee: { ...m, ...base }, sessions: open, year };
            }
        }
    }
    return null;
}

async function findExactAutoLinkCandidate(targetPerYear) {
    const year = new Date().getFullYear();
    const [members] = await db.query(
        `SELECT pr.EmployeeID, pr.TargetPerYear, e.EmployeeName, e.Department
         FROM Patrol_Roster pr
         JOIN Employees e ON e.EmployeeID=pr.EmployeeID
         WHERE pr.RosterGroup='top_management' AND pr.TargetPerYear=?
         ORDER BY pr.SortOrder,e.EmployeeName`,
        [targetPerYear]
    );
    for (const m of members) {
        const { base, sessions } = await topSessions(m.EmployeeID, year);
        if (!base) continue;
        const byDate = new Map();
        for (const s of sessions) {
            const date = dateOnly(s.PatrolDate);
            if (!byDate.has(date)) byDate.set(date, []);
            byDate.get(date).push(s);
        }
        for (const [date, dateSessions] of byDate.entries()) {
            if (dateSessions.length !== 1) continue;
            const session = dateSessions[0];
            if (await isSessionCompleted(m.EmployeeID, session)) continue;
            return { employee: { ...m, ...base }, session, year, date };
        }
    }
    return null;
}

async function main() {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;
    const marker = `CODX_PATROL7E_LOCAL_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
    const adminToken = tokenFor({ id: '012609', name: 'Patrol 7E Admin', department: 'QA', role: 'Admin' });
    const results = [];

    function pass(name, detail = '') { results.push({ name, pass: true, detail }); }
    function fail(name, detail = '') { results.push({ name, pass: false, detail }); }

    try {
        const c12 = await findCandidate(12, 1);
        if (!c12) throw new Error('No open 12/year Top Management candidate found.');
        const s12 = c12.sessions[0];
        const scheduledDate = dateOnly(s12.PatrolDate);
        const actualDate = sameMonth(addDays(scheduledDate, -7), scheduledDate) ? addDays(scheduledDate, -7) : addDays(scheduledDate, 1);
        if (!sameMonth(actualDate, scheduledDate) || actualDate === scheduledDate) {
            throw new Error('Could not derive a same-month actual makeup date.');
        }

        const userToken12 = tokenFor({
            id: c12.employee.EmployeeID,
            name: c12.employee.EmployeeName,
            department: c12.employee.Department || '',
            team: c12.employee.TeamName || '',
            role: 'User',
        });

        const missed12 = await request(base, 'GET', `/patrol/my-missed-sessions?year=${c12.year}`, userToken12);
        const openForMonth = (missed12.json?.data || []).filter(r => dateOnly(r.PatrolDate).slice(0, 7) === scheduledDate.slice(0, 7));
        if (missed12.status === 200 && openForMonth.some(r => String(r.ScheduledSessionID || r.id) === String(s12.id))) {
            pass('12/year missed-session list includes open scheduled round', `${c12.employee.EmployeeID} ${scheduledDate}`);
        } else {
            fail('12/year missed-session list includes open scheduled round', `status=${missed12.status}`);
        }

        const crossMonth = await request(base, 'POST', '/patrol/admin-record', adminToken, {
            EmployeeID: c12.employee.EmployeeID,
            PatrolDate: shiftMonth(scheduledDate, -1),
            PatrolType: 'compensation',
            Notes: marker,
            ScheduledSessionID: s12.id,
        });
        if (crossMonth.status === 400) pass('cross-month makeup rejected', crossMonth.json?.message || '');
        else fail('cross-month makeup rejected', `status=${crossMonth.status}`);

        const makeup = await request(base, 'POST', '/patrol/admin-record', adminToken, {
            EmployeeID: c12.employee.EmployeeID,
            PatrolDate: actualDate,
            PatrolType: 'compensation',
            Area: '',
            Notes: marker,
            ScheduledSessionID: s12.id,
        });
        if (makeup.status === 200 && makeup.json?.success) {
            pass('same-month makeup saved with ScheduledSessionID', `${actualDate} -> ${scheduledDate}`);
        } else {
            fail('same-month makeup saved with ScheduledSessionID', `status=${makeup.status} ${makeup.json?.message || ''}`);
        }

        const dup = await request(base, 'POST', '/patrol/admin-record', adminToken, {
            EmployeeID: c12.employee.EmployeeID,
            PatrolDate: actualDate,
            PatrolType: 'compensation',
            Notes: marker,
            ScheduledSessionID: s12.id,
        });
        if (dup.status === 409) pass('duplicate scheduled session rejected', dup.json?.message || '');
        else fail('duplicate scheduled session rejected', `status=${dup.status}`);

        const detail12 = await request(base, 'GET', `/patrol/attendance-detail?employeeId=${encodeURIComponent(c12.employee.EmployeeID)}&group=top_management&year=${c12.year}`, adminToken);
        const item12 = (detail12.json?.data?.schedule || []).find(i => String(i.sessionId) === String(s12.id));
        const extraHit = (detail12.json?.data?.extraRecords || []).some(r => String(r.Notes || '') === marker);
        const makeupRecord = (item12?.records || []).find(r => String(r.Notes || '') === marker);
        if (detail12.status === 200 && item12?.status === 'completed' && makeupRecord?.isMakeup && !extraHit) {
            pass('makeup completes scheduled item and is not extra', `actual=${makeupRecord.actualDate || ''}`);
        } else {
            fail('makeup completes scheduled item and is not extra', `status=${detail12.status} item=${item12?.status || 'missing'} records=${(item12?.records || []).length} extra=${extraHit}`);
        }

        const exactCandidate = await findExactAutoLinkCandidate(12);
        if (!exactCandidate) throw new Error('No second open candidate found for exact-date auto-link.');
        const exactSession = exactCandidate.session;
        const exact = await request(base, 'POST', '/patrol/admin-record', adminToken, {
            EmployeeID: exactCandidate.employee.EmployeeID,
            PatrolDate: exactCandidate.date,
            PatrolType: 'normal',
            Area: '',
            Notes: marker,
        });
        if (exact.status === 200 && exact.json?.success) {
            const [rows] = await db.query(
                `SELECT ScheduledSessionID, Area FROM Patrol_Attendance
                 WHERE UserID=? AND DATE(PatrolDate)=? AND Notes=?
                 ORDER BY id DESC LIMIT 1`,
                [exactCandidate.employee.EmployeeID, exactCandidate.date, marker]
            );
            if (String(rows[0]?.ScheduledSessionID || '') === String(exactSession.id) && rows[0]?.Area) {
                pass('exact scheduled date auto-links and defaults area', rows[0].Area);
            } else {
                fail('exact scheduled date auto-links and defaults area', `ScheduledSessionID=${rows[0]?.ScheduledSessionID || ''}`);
            }
        } else {
            fail('exact scheduled date auto-links and defaults area', `status=${exact.status}`);
        }

        const c24 = await findCandidate(24, 2);
        if (c24) {
            const [first, second] = c24.sessions;
            const firstActual = sameMonth(addDays(dateOnly(first.PatrolDate), -7), dateOnly(first.PatrolDate))
                ? addDays(dateOnly(first.PatrolDate), -7)
                : addDays(dateOnly(first.PatrolDate), 1);
            const saved24 = await request(base, 'POST', '/patrol/admin-record', adminToken, {
                EmployeeID: c24.employee.EmployeeID,
                PatrolDate: firstActual,
                PatrolType: 'compensation',
                Notes: marker,
                ScheduledSessionID: first.id,
            });
            const detail24 = await request(base, 'GET', `/patrol/attendance-detail?employeeId=${encodeURIComponent(c24.employee.EmployeeID)}&group=top_management&year=${c24.year}`, adminToken);
            const firstItem = (detail24.json?.data?.schedule || []).find(i => String(i.sessionId) === String(first.id));
            const secondItem = (detail24.json?.data?.schedule || []).find(i => String(i.sessionId) === String(second.id));
            if (saved24.status === 200 && firstItem?.status === 'completed' && Array.isArray(secondItem?.records) && secondItem.records.length === 0) {
                pass('24/year one compensated round leaves second round missing', `${c24.employee.EmployeeID}`);
            } else {
                fail('24/year one compensated round leaves second round missing', `save=${saved24.status} detail=${detail24.status}`);
            }
        } else {
            pass('24/year two-round smoke skipped', 'No open 24/year month with two uncompleted sessions in local DB.');
        }
    } finally {
        await db.query('DELETE FROM Patrol_Attendance WHERE Notes=?', [marker]).catch(() => {});
        const [remaining] = await db.query('SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE Notes=?', [marker]);
        if (Number(remaining[0]?.cnt || 0) === 0) pass('cleanup temp Patrol_Attendance records', 'remaining=0');
        else fail('cleanup temp Patrol_Attendance records', `remaining=${remaining[0]?.cnt}`);

        console.log(`Patrol-7E local authenticated smoke ${marker}`);
        for (const r of results) {
            console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` - ${r.detail}` : ''}`);
        }
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
        if (results.some(r => !r.pass)) process.exitCode = 1;
    }
}

main().catch(async err => {
    console.error('FAILED:', err);
    await db.end().catch(() => {});
    process.exit(1);
});
