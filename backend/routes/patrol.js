// backend/routes/patrol.js
// Auth is applied at mount level: app.use('/api/patrol', authenticateToken, patrolRoutes)
const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const mysql        = require('mysql2'); // used for mysql.escape() in generate-sessions
const { randomUUID } = require('crypto'); // UUID for Patrol_Sessions.SessionID (VARCHAR)
const multer       = require('multer');
const { storage, fileFilter, deleteLocalUpload } = require('../storage');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');

// Auto-migrate: Patrol_Attendance columns + Master_Positions.PatrolPassPct
(async () => {
    for (const sql of [
        'ALTER TABLE Patrol_Attendance ADD COLUMN Notes TEXT DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN Area VARCHAR(200) DEFAULT NULL',
        'ALTER TABLE Master_Positions ADD COLUMN PatrolPassPct INT DEFAULT 80',
        'ALTER TABLE Patrol_Attendance ADD COLUMN PatrolType VARCHAR(20) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD INDEX idx_patrol_attendance_session (ScheduledSessionID)',
        'ALTER TABLE Patrol_Self_Checkin ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Self_Checkin ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Self_Checkin ADD INDEX idx_patrol_self_checkin_session (ScheduledSessionID)',
        'ALTER TABLE Patrol_Issues ADD COLUMN ReporterID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Employees ADD COLUMN CompanyEmail VARCHAR(150) DEFAULT NULL',
        // Ensure PatrolType in Team_Members is VARCHAR (not ENUM) to support 'committee'
        'ALTER TABLE Patrol_Team_Members MODIFY COLUMN PatrolType VARCHAR(20) NOT NULL',
        // Per-round area assignment (0=legacy both rounds, 1=round1, 2=round2)
        'ALTER TABLE Patrol_Team_Rotation ADD COLUMN IF NOT EXISTS PatrolRound TINYINT NOT NULL DEFAULT 0',
        // Allow AreaID=NULL so we can store "explicit no-patrol" sentinel (PatrolRound=0, AreaID=NULL)
        'ALTER TABLE Patrol_Team_Rotation MODIFY COLUMN AreaID INT DEFAULT NULL',
    ]) { try { await db.query(sql); } catch (_) {} }

    // Note: imported MySQL-compatible schemas may not allow changing this AUTO_INCREMENT safely.
    // IDs are generated in application code using MAX(SessionID)+1 within transactions.

    // Auto-create Patrol_Roster table (admin-managed roster for Top Management & Supervisor overview)
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_Roster (
                id INT AUTO_INCREMENT PRIMARY KEY,
                EmployeeID VARCHAR(50) NOT NULL,
                RosterGroup VARCHAR(20) NOT NULL,
                TargetPerYear INT NOT NULL DEFAULT 12,
                SortOrder INT DEFAULT 99,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_EmailOutbox (
                id INT AUTO_INCREMENT PRIMARY KEY,
                AttendanceID INT DEFAULT NULL,
                EmployeeID VARCHAR(50) DEFAULT NULL,
                EventType VARCHAR(50) NOT NULL DEFAULT 'CheckInRecorded',
                Recipients TEXT NOT NULL,
                Subject VARCHAR(255) NOT NULL,
                Body MEDIUMTEXT,
                HtmlBody MEDIUMTEXT,
                Status VARCHAR(30) NOT NULL DEFAULT 'Queued',
                Error TEXT,
                SentAt DATETIME DEFAULT NULL,
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_attendance (AttendanceID),
                KEY idx_employee (EmployeeID),
                KEY idx_status (Status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await db.query('ALTER TABLE Patrol_EmailOutbox ADD COLUMN HtmlBody MEDIUMTEXT AFTER Body').catch(() => {});
    } catch (_) {}

    // Migrate unique key to include PatrolRound (drop old key, add new one)
    try {
        const [idxRows] = await db.query(`
            SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Patrol_Team_Rotation'
            AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY' AND INDEX_NAME != 'uq_team_yr_mo_rnd'
        `);
        for (const { INDEX_NAME } of idxRows) {
            try { await db.query(`ALTER TABLE Patrol_Team_Rotation DROP INDEX \`${INDEX_NAME}\``); } catch (_) {}
        }
        await db.query('ALTER TABLE Patrol_Team_Rotation ADD UNIQUE KEY uq_team_yr_mo_rnd (TeamID, Year, Month, PatrolRound)');
    } catch (_) {}
})();

// Uses backend/storage.js local uploads. Image URLs are stored in DB.
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

const ISSUE_ACTION_TYPES = ['OPEN', 'TEMP', 'CLOSE', 'UPDATE'];
const SESSION_STATUSES = ['Pending', 'Completed', 'Missed', 'Cancelled'];

function isAdminUser(req) {
    return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
}

async function canViewRosterAttendanceDetail(employeeId, group) {
    if (!['top_management', 'supervisor'].includes(group)) return false;
    const [[row]] = await db.query(
        'SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup=? LIMIT 1',
        [employeeId, group]
    );
    return !!row;
}

function cleanupUploadedIssueFiles(files = {}) {
    Object.values(files).flat().forEach(file => deleteLocalUpload(file?.path));
}

function validateIssuePayload(data = {}) {
    const actionType = data.ActionType;
    if (!ISSUE_ACTION_TYPES.includes(actionType)) return 'ActionType ไม่ถูกต้อง';
    if (['TEMP', 'CLOSE', 'UPDATE'].includes(actionType) && !data.IssueID) return 'ไม่พบ IssueID';
    if (actionType === 'OPEN') {
        if (!data.DateFound) return 'กรุณาระบุวันที่พบปัญหา';
        if (!data.Area) return 'กรุณาระบุพื้นที่ตรวจ';
        if (!data.HazardType) return 'กรุณาระบุประเภทอันตราย';
        if (!data.HazardDescription) return 'กรุณาระบุรายละเอียดปัญหา';
    }
    if (actionType === 'TEMP' && !data.TempDescription) return 'กรุณาระบุรายละเอียดการแก้ไขชั่วคราว';
    if (actionType === 'CLOSE') {
        if (!data.ActionDescription) return 'กรุณาระบุรายละเอียดการแก้ไข';
        if (!data.FinishDate) return 'กรุณาระบุวันที่เสร็จสิ้น';
    }
    return null;
}

function patrolIssueAuditMeta(data = {}) {
    return {
        issueId: data.IssueID || null,
        actionType: data.ActionType || null,
        area: data.Area || null,
        responsibleDept: data.ResponsibleDept || null,
        responsibleUnit: data.ResponsibleUnit || null,
        hazardType: data.HazardType || null,
        rank: data.Rank || null,
        currentStatus: data.CurrentStatus || null,
    };
}

function parseYear(value) {
    const year = Number(value);
    const current = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > current + 2) return null;
    return year;
}

function parseMonth(value) {
    const month = Number(value);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    return month;
}

function validateYearMonthInput({ year, month }, { requireMonth = true } = {}) {
    const parsedYear = parseYear(year);
    if (!parsedYear) return { error: 'year ไม่ถูกต้อง' };
    if (!requireMonth) return { year: parsedYear };
    const parsedMonth = parseMonth(month);
    if (!parsedMonth) return { error: 'month ต้องอยู่ระหว่าง 1-12' };
    return { year: parsedYear, month: parsedMonth };
}

function parseDateInput(value) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return normalized === match[0] ? normalized : null;
}

function sendPatrolError(res, err, fallback = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง', statusCode = 500) {
    console.error('[patrol]', err?.message || err);
    return res.status(err?.statusCode || statusCode).json({
        success: false,
        message: fallback,
    });
}

// ==========================================
// PART 1: Schedule & Stats
// ==========================================

// GET /api/patrol/my-monthly-plan?year=Y&month=M — personal plan for logged-in user
router.get('/my-monthly-plan', async (req, res) => {
    const { year, month } = req.query;
    const employeeId = req.user.id;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        // 1. Base team membership
        const [[base]] = await db.query(`
            SELECT tm.TeamID, tm.PatrolType,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Team_Members tm
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            WHERE  tm.EmployeeID = ?
            LIMIT  1
        `, [employeeId]);

        if (!base) return res.json({ success: true, data: null }); // ไม่ได้อยู่ในทีม

        // 2. Effective team override this month
        const [[override]] = await db.query(`
            SELECT mr.TeamID, t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Member_Rotation mr
            JOIN   Patrol_Teams t ON t.id = mr.TeamID
            WHERE  mr.EmployeeID = ? AND mr.Year = ? AND mr.Month = ?
        `, [employeeId, ym.year, ym.month]);

        const team = override
            ? { id: override.TeamID, name: override.TeamName, group: override.PatrolGroup, color: override.Color }
            : { id: base.TeamID,     name: base.TeamName,     group: base.PatrolGroup,     color: base.Color };

        const personalSchedule = await buildPersonalMonthlySchedule(employeeId, ym.year, ym.month);
        const sessions = personalSchedule.items;
        const required = personalSchedule.items;
        const attendance = personalSchedule.attendance;

        // 6. Team roster for effective team this month
        const [roster] = await db.query(`
            SELECT tm.EmployeeID, tm.PatrolType, e.EmployeeName,
                   COALESCE(mr.TeamID, tm.TeamID) AS EffectiveTeamID
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            LEFT JOIN Patrol_Member_Rotation mr
                   ON mr.EmployeeID = tm.EmployeeID AND mr.Year = ? AND mr.Month = ?
            WHERE  COALESCE(mr.TeamID, tm.TeamID) = ?
            ORDER BY FIELD(tm.PatrolType,'top','committee','management'), e.EmployeeName
        `, [ym.year, ym.month, team.id]);

        // Normalize attendance dates to YYYY-MM-DD for reliable matching
        const attendanceDates = attendance.map(a => {
            const d = new Date(a.PatrolDate);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        });

        res.json({
            success: true,
            data: {
                patrolType: base.PatrolType,
                team,
                sessions,
                required,
                attended: personalSchedule.completed,
                attendanceDates,
                roster,
                compliance: {
                    required: personalSchedule.required,
                    attended: personalSchedule.completed,
                    done: personalSchedule.completed >= personalSchedule.required,
                },
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/my-yearly-stats?year=Y — yearly patrol stats for logged-in user
router.get('/my-yearly-stats', async (req, res) => {
    const parsedYear = req.query.year ? parseYear(req.query.year) : new Date().getFullYear();
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
    const year       = parsedYear;
    const employeeId = req.user.id;
    try {
        // 1. Yearly attendance count
        const [[yearStats]] = await db.query(
            `SELECT COUNT(*) AS yearlyCount FROM Patrol_Attendance
             WHERE UserID = ? AND YEAR(PatrolDate) = ?`,
            [employeeId, year]
        );

        // 2. Yearly target from Patrol_Roster (either group)
        const [[rosterRow]] = await db.query(
            `SELECT TargetPerYear, RosterGroup FROM Patrol_Roster WHERE EmployeeID = ? LIMIT 1`,
            [employeeId]
        );

        // 3. Recent check-ins (last 6)
        const [recentCheckins] = await db.query(
            `SELECT PatrolDate, PatrolType, Area, Notes FROM Patrol_Attendance
             WHERE UserID = ?
             ORDER BY PatrolDate DESC, id DESC LIMIT 6`,
            [employeeId]
        );

        // 4. Team rank this year (among team members by yearly attendance)
        const [[teamBase]] = await db.query(
            `SELECT tm.TeamID FROM Patrol_Team_Members tm WHERE tm.EmployeeID = ? LIMIT 1`,
            [employeeId]
        );

        let teamRank = null;
        let teamMemberStats = [];
        if (teamBase) {
            const [teamMembers] = await db.query(
                `SELECT tm.EmployeeID, e.Position,
                        (SELECT COUNT(*) FROM Patrol_Attendance pa
                         WHERE pa.UserID = tm.EmployeeID AND YEAR(pa.PatrolDate) = ?) AS cnt
                 FROM Patrol_Team_Members tm
                 JOIN Employees e ON e.EmployeeID = tm.EmployeeID
                 WHERE tm.TeamID = ?
                 ORDER BY cnt DESC`,
                [year, teamBase.TeamID]
            );
            const myIdx = teamMembers.findIndex(m => m.EmployeeID === employeeId);
            if (myIdx !== -1) {
                teamRank = { rank: myIdx + 1, total: teamMembers.length };
            }
            teamMemberStats = teamMembers.map(m => ({ EmployeeID: m.EmployeeID, position: m.Position, yearlyCount: m.cnt }));
        }

        // 5. Self-patrol yearly count (supervisor)
        const [[spYear]] = await db.query(
            `SELECT COUNT(*) AS spCount FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?`,
            [employeeId, year]
        );

        // 6. Monthly required count this month (for per-member compliance context)
        const curMonth = new Date().getMonth() + 1;
        const [[monthlyRequired]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM Patrol_Sessions s
             JOIN Patrol_Team_Members tm ON tm.TeamID = s.TeamID AND tm.EmployeeID = ?
             WHERE YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ? AND s.PatrolRound = 2`,
            [employeeId, year, curMonth]
        );

        // 7. Monthly attendance breakdown (for dot tracker)
        const [monthlyAtt] = await db.query(
            `SELECT MONTH(PatrolDate) AS month, COUNT(*) AS cnt
             FROM Patrol_Attendance
             WHERE UserID = ? AND YEAR(PatrolDate) = ?
             GROUP BY MONTH(PatrolDate)`,
            [employeeId, year]
        );

        // 8. Monthly scheduled sessions for user's team
        let monthlySched = [];
        if (teamBase) {
            const [ms] = await db.query(
                `SELECT MONTH(s.PatrolDate) AS month, COUNT(*) AS cnt
                 FROM Patrol_Sessions s
                 JOIN Patrol_Team_Members tm ON tm.TeamID = s.TeamID AND tm.EmployeeID = ?
                 WHERE YEAR(s.PatrolDate) = ?
                 GROUP BY MONTH(s.PatrolDate)`,
                [employeeId, year]
            );
            monthlySched = ms;
        }

        const monthlyAttMap  = {};
        const monthlySchedMap = {};
        monthlyAtt.forEach(r => { monthlyAttMap[r.month] = parseInt(r.cnt); });
        monthlySched.forEach(r => { monthlySchedMap[r.month] = parseInt(r.cnt); });
        const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            attended:  monthlyAttMap[i + 1]  || 0,
            scheduled: monthlySchedMap[i + 1] || 0,
        }));

        res.json({
            success: true,
            data: {
                year,
                yearlyCount:  yearStats.yearlyCount,
                yearlyTarget: rosterRow?.TargetPerYear || null,
                recentCheckins,
                teamRank,
                teamMemberStats,
                monthlyRequired: monthlyRequired?.cnt ?? null,
                selfPatrolYear: { count: spYear.spCount },
                monthlyBreakdown,
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/position-thresholds — ดึงรายการตำแหน่งพร้อม PatrolPassPct
router.get('/position-thresholds', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, Name, COALESCE(PatrolPassPct, 80) AS PatrolPassPct FROM Master_Positions ORDER BY Name ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/position-thresholds/:positionId — อัปเดตเกณฑ์ผ่าน (Admin)
router.put('/position-thresholds/:positionId', isAdmin, async (req, res) => {
    const pct = parseInt(req.body.PatrolPassPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ success: false, message: 'ค่าต้องอยู่ระหว่าง 0–100' });
    }
    try {
        await db.query('UPDATE Master_Positions SET PatrolPassPct = ? WHERE id = ?', [pct, req.params.positionId]);
        res.json({ success: true, message: 'บันทึกเกณฑ์สำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/day-detail?date=YYYY-MM-DD — รายละเอียดการเดินตรวจในวันที่ระบุ
router.get('/day-detail', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    try {
        const [sessions] = await db.query(`
            SELECT s.SessionID AS id, s.PatrolRound, s.Status,
                   t.id AS TeamID, t.Name AS TeamName, t.Color AS TeamColor,
                   a.Name AS AreaName, a.Code AS AreaCode,
                   (SELECT COUNT(*) FROM Patrol_Team_Members WHERE TeamID = s.TeamID) AS MemberCount,
                   (SELECT COUNT(DISTINCT pa.UserID)
                    FROM Patrol_Attendance pa
                    WHERE DATE(pa.PatrolDate) = ? AND pa.TeamName = t.Name) AS AttendedCount
            FROM Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE DATE(s.PatrolDate) = ?
            ORDER BY s.PatrolRound ASC, t.Name ASC
        `, [date, date]);

        const totalExpected = sessions.reduce((sum, s) => sum + (s.MemberCount || 0), 0);
        const totalAttended = sessions.reduce((sum, s) => sum + (s.AttendedCount || 0), 0);

        res.json({
            success: true,
            data: {
                date,
                sessions,
                totalExpected,
                totalAttended,
                overallPct: totalExpected > 0 ? Math.round((totalAttended / totalExpected) * 100) : 0,
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.get('/my-schedule', async (req, res) => {
    const ym = validateYearMonthInput({ year: req.query.year, month: req.query.month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const schedule = await buildPersonalMonthlySchedule(req.user.id, ym.year, ym.month);
        res.json(schedule.items);
    } catch (error) {
        sendPatrolError(res, error, 'ไม่สามารถดึงตาราง Patrol ได้');
    }
});

// FIX: was returning hardcoded mock data — now queries real DB
router.get('/attendance-stats', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                UserName AS Name,
                COUNT(*) AS Total,
                MAX(PatrolDate) AS LastWalk,
                ROUND(COUNT(*) * 100.0 / NULLIF(
                    (SELECT COUNT(DISTINCT YEARWEEK(PatrolDate)) FROM Patrol_Attendance), 0
                )) AS Percent
            FROM Patrol_Attendance
            GROUP BY UserID, UserName
            ORDER BY Total DESC
            LIMIT 20
        `);
        res.json(rows);
    } catch (error) {
        sendPatrolError(res, error, 'ไม่สามารถดึงสถิติการเข้างานได้');
    }
});

// FIX: was returning hardcoded mock data — now queries real DB
router.get('/dashboard-stats', async (req, res) => {
    const [bySection] = await db.query(`
        SELECT Area AS Section,
               COUNT(CASE WHEN CurrentStatus = 'Closed' THEN 1 END) AS Achieved,
               COUNT(CASE WHEN CurrentStatus != 'Closed' THEN 1 END) AS OnProcess
        FROM Patrol_Issues
        GROUP BY Area
        ORDER BY Achieved DESC
    `).catch(e => { console.error('dashboard-stats bySection:', e.message); return [[]]; });

    const [byRank] = await db.query(`
        SELECT HazardType AS HazardRank, COUNT(*) AS Count
        FROM Patrol_Issues
        GROUP BY HazardType
        ORDER BY Count DESC
    `).catch(e => { console.error('dashboard-stats byRank:', e.message); return [[]]; });

    res.json({ bySection: bySection || [], byRank: byRank || [] });
});

router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        const status = String(req.query.status || '').trim();
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
        const params = [];
        let sql = 'SELECT id,AttendanceID,EmployeeID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM Patrol_EmailOutbox';
        if (status) {
            sql += ' WHERE Status=?';
            params.push(status);
        }
        sql += ` ORDER BY id DESC LIMIT ${limit}`;
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err, 'Cannot load Patrol email outbox.');
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    if (!smtpConfigured()) return res.status(400).json({ success: false, message: 'SMTP is not configured.' });
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 20)));
    try {
        const [rows] = await db.query(
            `SELECT * FROM Patrol_EmailOutbox
             WHERE Status IN ('Queued','Failed')
             ORDER BY id ASC
             LIMIT ${limit}`
        );
        let sent = 0;
        let failed = 0;
        for (const item of rows) {
            try {
                await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
                await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [item.id]);
                sent++;
            } catch (error) {
                await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [error.message, item.id]).catch(() => {});
                failed++;
            }
        }
        res.json({ success: true, processed: rows.length, sent, failed });
    } catch (err) {
        sendPatrolError(res, err, 'Cannot retry Patrol email queue.');
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        const [[item]] = await db.query('SELECT * FROM Patrol_EmailOutbox WHERE id=? LIMIT 1', [req.params.id]);
        if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
        await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [req.params.id]);
        res.json({ success: true, message: 'Email sent.' });
    } catch (err) {
        await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [err.message, req.params.id]).catch(() => {});
        res.status(500).json({ success: false, message: 'Email send failed.', error: err.message });
    }
});

// ==========================================
// PART 2: Check-in
// ==========================================

router.post('/checkin', async (req, res) => {
    try {
        // ดึงข้อมูลผู้ใช้จาก JWT (req.user) ไม่รับจาก req.body เพื่อป้องกันการปลอมแปลง
        const UserID   = req.user.id;
        const [[employee]] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Position,e.CompanyEmail,t.Name AS TeamName
             FROM Employees e
             LEFT JOIN Patrol_Team_Members tm ON tm.EmployeeID=e.EmployeeID
             LEFT JOIN Patrol_Teams t ON t.id=tm.TeamID
             WHERE e.EmployeeID=?
             LIMIT 1`,
            [UserID]
        );
        const UserName = employee?.EmployeeName || req.user.name || UserID;
        const TeamName = employee?.TeamName || req.user.team || '';
        const Notes     = req.body.Notes?.trim() || null;
        let Area      = req.body.Area?.trim()  || null;
        const ALLOWED_PATROL_TYPES = ['normal', 'compensation'];
        const PatrolType = ALLOWED_PATROL_TYPES.includes(req.body.PatrolType || 'normal') ? (req.body.PatrolType || 'normal') : null;
        if (!PatrolType) {
            return res.status(400).json({ success: false, message: 'Self check-in supports only normal or compensation patrol.' });
        }
        if (PatrolType === 'compensation' && !String(req.body.ScheduledSessionID || '').trim()) {
            return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for makeup patrol.' });
        }
        // PatrolDate: user may supply an explicit date for compensation patrol (same year only)
        let patrolDate = null;
        if (req.body.PatrolDate) {
            const d = new Date(req.body.PatrolDate);
            if (!isNaN(d.getTime())) patrolDate = d.toISOString().split('T')[0];
        }
        const effectiveDate = patrolDate || new Date().toISOString().split('T')[0];

        // ป้องกัน check-in ซ้ำในวันเดียวกัน (ยกเว้น compensation ที่ใช้วันอื่น)
        const [[dupCheck]] = await db.query(
            `SELECT id FROM Patrol_Attendance
             WHERE UserID = ? AND DATE(PatrolDate) = ? AND PatrolType = ?
             LIMIT 1`,
            [UserID, effectiveDate, PatrolType]
        );
        if (dupCheck) {
            return res.status(409).json({ success: false, message: 'คุณได้เช็คอินประเภทนี้ในวันนี้แล้ว' });
        }

        const currentWeek = getWeekNumber(patrolDate ? new Date(patrolDate) : new Date());
        const { session } = await resolveTopScheduledSession(UserID, effectiveDate, req.body.ScheduledSessionID);
        if (!Area && session) Area = session.AreaName || session.AreaCode || null;
        const [insert] = await db.query(
            'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, Notes, Area, PatrolType, PatrolDate, RecordedBy, ScheduledSessionID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [UserID, UserName, TeamName, currentWeek, Notes, Area, PatrolType, effectiveDate, UserID, session?.id || null]
        );
        const attendanceId = insert.insertId;
        const attendance = { id: attendanceId, UserID, UserName, TeamName, PatrolDate: effectiveDate, PatrolType, Area, Notes, ScheduledSessionID: session?.id || null };
        const email = await queuePatrolCheckinEmail({ attendanceId, employee, attendance, session }).catch(err => ({ queued: false, sent: false, reason: err.message }));

        const [stats] = await db.query(
            'SELECT COUNT(*) AS TotalWalks, MAX(PatrolDate) AS LastWalk FROM Patrol_Attendance WHERE UserID = ?',
            [UserID]
        );
        const [teamStats] = await db.query(
            'SELECT COUNT(*) AS TeamWalks FROM Patrol_Attendance WHERE TeamName = ?',
            [TeamName]
        );
        const [todayWalkers] = await db.query(
            'SELECT UserName, PatrolDate FROM Patrol_Attendance WHERE DATE(PatrolDate) = CURDATE() ORDER BY PatrolDate DESC LIMIT 5'
        );

        res.json({
            success: true,
            message: 'เช็คอินสำเร็จ!',
            data: {
                totalWalks: stats[0].TotalWalks,
                teamWalks: teamStats[0].TeamWalks || 0,
                todayWalkers,
                checkin: {
                    id: attendanceId,
                    employeeId: UserID,
                    employeeName: UserName,
                    position: employee?.Position || null,
                    department: employee?.Department || null,
                    type: PatrolType,
                    actualDate: effectiveDate,
                    scheduledDate: session ? dateOnly(session.PatrolDate) : effectiveDate,
                    isMakeup: Boolean(session) && dateOnly(session.PatrolDate) !== effectiveDate,
                    scheduledSessionId: session?.id || null,
                    round: session?.PatrolRound || null,
                    area: Area,
                    teamName: TeamName,
                },
                email,
            },
        });
    } catch (err) {
        console.error(err);
        if (err?.statusCode) {
            return res.status(err.statusCode).json({ success: false, message: err.message });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเช็คอินได้' });
    }
});

// ==========================================
// PART 3: Issues
// ==========================================

router.get('/issues', async (req, res) => {
    try {
        const [issues] = await db.query('SELECT * FROM Patrol_Issues ORDER BY IssueID DESC');
        res.json({ success: true, data: issues });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลประเด็นได้' });
    }
});

router.post('/issue/save', upload.fields([
    { name: 'BeforeImage', maxCount: 1 },
    { name: 'TempImage',   maxCount: 1 },
    { name: 'AfterImage',  maxCount: 1 },
]), async (req, res) => {
    const files = req.files || {};
    try {
        const data  = req.body;
        // Store the public upload URL returned by the storage engine.
        const getUrl = (fieldName) => files[fieldName] ? files[fieldName][0].path : null;
        const validationError = validateIssuePayload(data);
        if (validationError) {
            cleanupUploadedIssueFiles(files);
            return res.status(400).json({ success: false, message: validationError });
        }

        if (data.ActionType === 'OPEN') {
            const [result] = await db.query(
                `INSERT INTO Patrol_Issues
                 (DateFound, FoundByTeam, Area, ResponsibleDept, ResponsibleUnit, HazardType, MachineName, HazardDescription, \`Rank\`, DueDate, BeforeImage, CurrentStatus, ReporterID)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`,
                [data.DateFound, data.FoundByTeam, data.Area,
                 data.ResponsibleDept || null, data.ResponsibleUnit || null,
                 data.HazardType, data.MachineName, data.HazardDescription,
                 data.Rank || null, data.DueDate || null, getUrl('BeforeImage'),
                 req.user.id]
            );
            await logAudit(req, {
                module: 'patrol',
                action: 'OPEN_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: result.insertId,
                detail: `Open patrol issue: ${data.Area || ''} ${data.HazardType || ''}`.trim(),
                metadata: patrolIssueAuditMeta({ ...data, IssueID: result.insertId, CurrentStatus: 'Open' }),
            });
        } else if (data.ActionType === 'TEMP') {
            const [[current]] = await db.query('SELECT TempImage FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            const tempImage = getUrl('TempImage');
            await db.query(
                `UPDATE Patrol_Issues
                 SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                 WHERE IssueID = ?`,
                [data.TempDescription, tempImage, data.IssueID]
            );
            if (tempImage) deleteLocalUpload(current?.TempImage);
            await logAudit(req, {
                module: 'patrol',
                action: 'TEMP_FIX_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Temporary fix patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Temporary' }),
            });
        } else if (data.ActionType === 'CLOSE') {
            if (!isAdminUser(req)) {
                cleanupUploadedIssueFiles(files);
                return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้นที่ปิดประเด็นได้' });
            }
            const [[current]] = await db.query('SELECT AfterImage FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            const afterImage = getUrl('AfterImage');
            await db.query(
                `UPDATE Patrol_Issues
                 SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed'
                 WHERE IssueID = ?`,
                [data.ActionDescription, afterImage, data.FinishDate, data.IssueID]
            );
            if (afterImage) deleteLocalUpload(current?.AfterImage);
            await logAudit(req, {
                module: 'patrol',
                action: 'CLOSE_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Close patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Closed' }),
            });
        } else if (data.ActionType === 'UPDATE') {
            if (!isAdminUser(req)) {
                cleanupUploadedIssueFiles(files);
                return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้นที่แก้ไขประเด็นได้' });
            }
            // Combined edit: saves temp + final + section 1 fields in one shot
            // Status: Closed if ActionDescription filled, Temporary if only TempDescription, else Open
            const hasFinal = !!(data.ActionDescription && data.ActionDescription.trim());
            const hasTemp  = !!(data.TempDescription && data.TempDescription.trim());
            const newStatus = hasFinal ? 'Closed' : hasTemp ? 'Temporary' : 'Open';
            const newTempImage  = getUrl('TempImage');
            const newAfterImage = getUrl('AfterImage');
            const [[current]] = await db.query('SELECT TempImage, AfterImage FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            await db.query(
                `UPDATE Patrol_Issues SET
                    Area              = COALESCE(?, Area),
                    ResponsibleDept   = COALESCE(?, ResponsibleDept),
                    ResponsibleUnit   = ?,
                    HazardType        = COALESCE(?, HazardType),
                    MachineName       = ?,
                    HazardDescription = COALESCE(?, HazardDescription),
                    \`Rank\`          = COALESCE(?, \`Rank\`),
                    DueDate           = COALESCE(?, DueDate),
                    TempDescription   = ?,
                    TempImage         = COALESCE(?, TempImage),
                    TempDate          = IF(? IS NOT NULL AND ? != '', NOW(), TempDate),
                    ActionDescription = ?,
                    AfterImage        = COALESCE(?, AfterImage),
                    FinishDate        = ?,
                    CurrentStatus     = ?
                 WHERE IssueID = ?`,
                [
                    data.Area              || null,
                    data.ResponsibleDept   || null,
                    data.ResponsibleUnit   || null,
                    data.HazardType        || null,
                    data.MachineName       || null,
                    data.HazardDescription || null,
                    data.Rank              || null,
                    data.DueDate           || null,
                    data.TempDescription   || null,
                    newTempImage, newTempImage,
                    data.TempDescription   || null,
                    data.ActionDescription || null,
                    newAfterImage,
                    data.FinishDate        || null,
                    newStatus,
                    data.IssueID
                ]
            );
            if (newTempImage) deleteLocalUpload(current?.TempImage);
            if (newAfterImage) deleteLocalUpload(current?.AfterImage);
            await logAudit(req, {
                module: 'patrol',
                action: 'UPDATE_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Update patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: newStatus }),
            });
        } else {
            return res.status(400).json({ success: false, message: 'ActionType ไม่ถูกต้อง' });
        }

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });
    } catch (err) {
        console.error(err);
        cleanupUploadedIssueFiles(files);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

// DELETE /api/patrol/issue/:id — Admin only
router.delete('/issue/:id', async (req, res) => {
    if (!isAdminUser(req)) {
        return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้น' });
    }
    try {
        const [[row]] = await db.query('SELECT BeforeImage, TempImage, AfterImage FROM Patrol_Issues WHERE IssueID = ?', [req.params.id]);
        const [result] = await db.query('DELETE FROM Patrol_Issues WHERE IssueID = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการนี้' });
        }
        deleteLocalUpload(row?.BeforeImage);
        deleteLocalUpload(row?.TempImage);
        deleteLocalUpload(row?.AfterImage);
        await logAudit(req, {
            module: 'patrol',
            action: 'DELETE_PATROL_ISSUE',
            targetType: 'Patrol_Issues',
            targetId: req.params.id,
            detail: `Delete patrol issue #${req.params.id}`,
            metadata: { issueId: req.params.id },
        });
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ==========================================
// PART 4: Patrol Teams
// ==========================================

// GET /api/patrol/teams — list all teams with member count
router.get('/teams', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*,
                   COUNT(m.id) AS MemberCount
            FROM   Patrol_Teams t
            LEFT JOIN Patrol_Team_Members m ON m.TeamID = t.id
            GROUP BY t.id
            ORDER BY t.id
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/teams — create team
router.post('/teams', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    if (!['A', 'B'].includes(PatrolGroup)) return res.status(400).json({ success: false, message: 'PatrolGroup ต้องเป็น A หรือ B' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Teams (Name, PatrolGroup, Color) VALUES (?,?,?)',
            [Name, PatrolGroup, Color || '#6366f1']
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/teams/:id — update team
router.put('/teams/:id', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    if (!['A', 'B'].includes(PatrolGroup)) return res.status(400).json({ success: false, message: 'PatrolGroup ต้องเป็น A หรือ B' });
    try {
        await db.query(
            'UPDATE Patrol_Teams SET Name=?, PatrolGroup=?, Color=? WHERE id=?',
            [Name, PatrolGroup, Color, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/teams/:id — delete team + members
router.delete('/teams/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE TeamID=?', [req.params.id]);
        await db.query('DELETE FROM Patrol_Teams WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 5: Team Members
// ==========================================

// GET /api/patrol/teams/:id/members — members with employee info
router.get('/teams/:id/members', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT m.id, m.TeamID, m.EmployeeID, m.PatrolType,
                   e.EmployeeName, e.Department, e.Position
            FROM   Patrol_Team_Members m
            LEFT JOIN Employees e ON e.EmployeeID = m.EmployeeID
            WHERE  m.TeamID = ?
            ORDER BY m.PatrolType DESC, e.EmployeeName
        `, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/teams/:id/members — add member
router.post('/teams/:id/members', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolType } = req.body;
    if (!EmployeeID || !PatrolType) return res.status(400).json({ success: false, message: 'EmployeeID และ PatrolType จำเป็น' });
    if (!['top', 'committee', 'management'].includes(PatrolType)) {
        return res.status(400).json({ success: false, message: 'PatrolType ไม่ถูกต้อง' });
    }
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Team_Members (TeamID, EmployeeID, PatrolType) VALUES (?,?,?)',
            [req.params.id, EmployeeID, PatrolType]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้อยู่ในทีมนี้แล้ว' });
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/teams/:teamId/members/:memberId — remove member
router.delete('/teams/:teamId/members/:memberId', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE id=? AND TeamID=?',
            [req.params.memberId, req.params.teamId]);
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 6: Patrol Areas
// ==========================================

// GET /api/patrol/areas
router.get('/areas', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Patrol_Areas ORDER BY SortOrder, id');
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 7: Member Rotation (monthly team assignment per member)
// ==========================================
// SQL to create table (run once in DBeaver):
// CREATE TABLE IF NOT EXISTS Patrol_Member_Rotation (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     EmployeeID VARCHAR(50) NOT NULL,
//     TeamID INT NOT NULL,
//     Year INT NOT NULL,
//     Month INT NOT NULL,
//     UNIQUE KEY uk_emp_yr_mo (EmployeeID, Year, Month),
//     INDEX idx_team_yr_mo (TeamID, Year, Month)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// GET /api/patrol/member-rotation?year=Y — all monthly assignments for the year
router.get('/member-rotation', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
    const parsedYear = parseYear(year);
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
    try {
        const [base] = await db.query(`
            SELECT tm.id, tm.EmployeeID, tm.TeamID, tm.PatrolType,
                   e.EmployeeName,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            ORDER BY t.PatrolGroup, t.id, tm.PatrolType, e.EmployeeName
        `);
        const [monthly] = await db.query(`
            SELECT mr.EmployeeID, mr.TeamID, mr.Month,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Member_Rotation mr
            JOIN   Patrol_Teams t ON t.id = mr.TeamID
            WHERE  mr.Year = ?
            ORDER BY mr.Month
        `, [parsedYear]);
        res.json({ success: true, base, monthly });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/member-rotation — bulk upsert monthly member→team assignments
router.post('/member-rotation', isAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        for (const { EmployeeID, TeamID, Year, Month } of items) {
            const ym = validateYearMonthInput({ year: Year, month: Month });
            if (ym.error) {
                const err = new Error(ym.error);
                err.statusCode = 400;
                throw err;
            }
            await conn.query(`
                INSERT INTO Patrol_Member_Rotation (EmployeeID, TeamID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE TeamID=VALUES(TeamID)
            `, [EmployeeID, TeamID, ym.year, ym.month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
    } catch (err) {
        await conn.rollback();
        sendPatrolError(res, err);
    } finally { conn.release(); }
});

// GET /api/patrol/monthly-report?year=Y&month=M — monthly grid report (all teams + members)
router.get('/monthly-report', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        // Sessions for the month
        const [sessions] = await db.query(`
            SELECT s.SessionID AS id, s.TeamID, s.PatrolDate, s.PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            JOIN   Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.TeamID, s.PatrolDate
        `, [ym.year, ym.month]);

        // Members with effective team (rotation override or base)
        const [members] = await db.query(`
            SELECT tm.EmployeeID, tm.PatrolType,
                   e.EmployeeName,
                   COALESCE(mr.TeamID, tm.TeamID) AS EffectiveTeamID
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            LEFT JOIN Patrol_Member_Rotation mr
                   ON mr.EmployeeID = tm.EmployeeID AND mr.Year = ? AND mr.Month = ?
            ORDER BY COALESCE(mr.TeamID, tm.TeamID),
                     FIELD(tm.PatrolType,'top','committee','management'),
                     e.EmployeeName
        `, [ym.year, ym.month]);

        // Build team map from sessions
        const teamMap = {};
        sessions.forEach(s => {
            if (!teamMap[s.TeamID]) {
                teamMap[s.TeamID] = {
                    TeamID: s.TeamID, TeamName: s.TeamName,
                    PatrolGroup: s.PatrolGroup, Color: s.Color,
                    sessions: [], members: [],
                };
            }
            teamMap[s.TeamID].sessions.push(s);
        });

        // Assign members to effective team
        members.forEach(m => {
            if (teamMap[m.EffectiveTeamID]) {
                teamMap[m.EffectiveTeamID].members.push(m);
            }
        });

        const teams = Object.values(teamMap).sort((a, b) => a.TeamID - b.TeamID);
        res.json({ success: true, data: teams, year: ym.year, month: ym.month });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/member-schedule?year=Y — full annual schedule per member
router.get('/member-schedule', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
    const parsedYear = parseYear(year);
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
    try {
        // 1. Base team members
        const [members] = await db.query(`
            SELECT tm.EmployeeID, tm.TeamID AS BaseTeamID, tm.PatrolType,
                   e.EmployeeName, e.Department,
                   t.Name AS BaseTeamName, t.PatrolGroup
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            ORDER BY t.PatrolGroup, tm.PatrolType, e.EmployeeName
        `);

        // 2. Monthly team overrides
        const [rotations] = await db.query(
            'SELECT EmployeeID, TeamID, Month FROM Patrol_Member_Rotation WHERE Year = ?', [parsedYear]
        );
        const rotMap = {};
        rotations.forEach(r => {
            if (!rotMap[r.EmployeeID]) rotMap[r.EmployeeID] = {};
            rotMap[r.EmployeeID][r.Month] = r.TeamID;
        });

        // 3. All sessions for the year with team + area info
        const [sessions] = await db.query(`
            SELECT s.TeamID, s.PatrolDate, s.PatrolRound,
                   t.Name AS TeamName, t.Color AS TeamColor,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ?
            ORDER BY s.PatrolDate
        `, [parsedYear]);

        // sessMap[teamId][month] = [ session, ... ]
        const sessMap = {};
        sessions.forEach(s => {
            const month = new Date(s.PatrolDate).getMonth() + 1;
            if (!sessMap[s.TeamID]) sessMap[s.TeamID] = {};
            if (!sessMap[s.TeamID][month]) sessMap[s.TeamID][month] = [];
            sessMap[s.TeamID][month].push(s);
        });

        // 4. Build per-member annual schedule
        const data = members.map(m => {
            const months = Array.from({ length: 12 }, (_, i) => {
                const month  = i + 1;
                const teamId = (rotMap[m.EmployeeID] || {})[month] || m.BaseTeamID;
                const all    = (sessMap[teamId] || {})[month] || [];
                // top & committee → round 2 only; management → all rounds
                const filtered = m.PatrolType === 'management'
                    ? all
                    : all.filter(s => s.PatrolRound === 2);
                return { month, teamId, sessions: filtered };
            });
            return { ...m, months };
        });

        res.json({ success: true, data, year: parsedYear });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 8: Area Rotation
// ==========================================

// GET /api/patrol/rotation?year=&month= — rotation ของเดือน (all teams)
router.get('/rotation', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const [rows] = await db.query(`
            SELECT r.TeamID, r.AreaID, r.Year, r.Month,
                   COALESCE(r.PatrolRound, 0) AS PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
            ORDER BY t.id, r.PatrolRound
        `, [ym.year, ym.month]);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/rotation — upsert rotation per round
// items: array of { TeamID, r1: areaId|null, r2: areaId|null, Year, Month }
router.post('/rotation', isAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array ของ rotation' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        let saved = 0;
        for (const { TeamID, r1, r2, Year, Month } of items) {
            const ym = validateYearMonthInput({ year: Year, month: Month });
            if (ym.error) {
                const err = new Error(ym.error);
                err.statusCode = 400;
                throw err;
            }
            // Delete all existing round records for this team/month
            await conn.query(
                'DELETE FROM Patrol_Team_Rotation WHERE TeamID=? AND Year=? AND Month=?',
                [TeamID, ym.year, ym.month]
            );
            if (!r1 && !r2) {
                // Explicit "ไม่มีเดิน" sentinel — AreaID=NULL, PatrolRound=0
                // This lets frontend distinguish "explicitly no patrol" from "never configured"
                await conn.query(
                    'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,NULL,?,?,0)',
                    [TeamID, ym.year, ym.month]
                );
                saved++;
            } else {
                if (r1) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,1)',
                        [TeamID, r1, ym.year, ym.month]
                    );
                    saved++;
                }
                if (r2) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,2)',
                        [TeamID, r2, ym.year, ym.month]
                    );
                    saved++;
                }
            }
        }
        await conn.commit();
        res.json({ success: true, saved });
    } catch (err) {
        await conn.rollback();
        sendPatrolError(res, err);
    } finally { conn.release(); }
});

// ==========================================
// PART 8: Generate Sessions
// ==========================================

// POST /api/patrol/generate-sessions { year, month }
// — สร้าง Patrol_Sessions จาก rotation ของเดือนนั้นอัตโนมัติ
router.post('/generate-sessions', isAdmin, async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });

    try {
        // 1. ดึง rotation + teams ของเดือนนี้
        // LEFT JOIN Patrol_Areas เพราะ AreaID อาจเป็น NULL (sentinel "ไม่มีเดิน")
        // กรอง sentinel (AreaID IS NULL) ออก — ไม่สร้าง session สำหรับทีมที่ไม่มีเดิน
        const [rotations] = await db.query(`
            SELECT r.TeamID, r.AreaID, r.PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
              AND  r.AreaID IS NOT NULL
        `, [ym.year, ym.month]);

        if (rotations.length === 0)
            return res.status(400).json({ success: false, message: 'ยังไม่มีตารางหมุนเวียนของเดือนนี้ หรือทุกทีมถูกตั้งเป็น "ไม่มีเดิน" กรุณาตั้งค่า Rotation ก่อน' });

        // 2. หาวันพุธทั้งหมดในเดือน (เรียงลำดับ)
        const wednesdays = getWednesdaysInMonth(ym.year, ym.month);
        // wednesdays[0]=พุธ1, [1]=พุธ2, [2]=พุธ3, [3]=พุธ4
        // Group A → [0],[2] (พุธที่ 1 & 3)
        // Group B → [1],[3] (พุธที่ 2 & 4)

        const groupDates = {
            A: [wednesdays[0], wednesdays[2]].filter(Boolean),
            B: [wednesdays[1], wednesdays[3]].filter(Boolean),
        };

        // 3. Group rotation records by TeamID
        //    สำหรับแต่ละทีม อาจมีหลาย records (round 1 ต่างพื้นที่จาก round 2)
        //    PatrolRound=0 = legacy (ทั้งสองรอบใช้พื้นที่เดียวกัน)
        //    PatrolRound=1 = สร้าง session เฉพาะรอบ 1
        //    PatrolRound=2 = สร้าง session เฉพาะรอบ 2
        const teamMap = {};
        for (const rot of rotations) {
            if (!teamMap[rot.TeamID]) {
                teamMap[rot.TeamID] = {
                    TeamID: rot.TeamID, TeamName: rot.TeamName,
                    PatrolGroup: rot.PatrolGroup, Color: rot.Color,
                    rounds: {} // round -> AreaID
                };
            }
            const rnd = Number(rot.PatrolRound);
            if (rnd === 0) {
                // legacy: same area both rounds
                teamMap[rot.TeamID].rounds[1] = rot.AreaID;
                teamMap[rot.TeamID].rounds[2] = rot.AreaID;
            } else {
                teamMap[rot.TeamID].rounds[rnd] = rot.AreaID;
            }
        }

        const conn = await db.getConnection();
        let created = 0;
        try {
            await conn.beginTransaction();

            // SessionID is VARCHAR — generate UUID per row (matches existing table schema)
            for (const team of Object.values(teamMap)) {
                const dates = groupDates[team.PatrolGroup] || [];
                for (const [roundStr, areaId] of Object.entries(team.rounds)) {
                    const round   = parseInt(roundStr, 10);
                    const dateStr = dates[round - 1];
                    if (!dateStr || !areaId) continue;

                    // Duplicate check — all values escaped inline, no ? params
                    const chkSql = `SELECT COUNT(*) AS cnt FROM Patrol_Sessions WHERE PatrolDate=${mysql.escape(dateStr)} AND TeamID=${mysql.escape(team.TeamID)} AND PatrolRound=${mysql.escape(round)}`;
                    const [chkRows] = await conn.query(chkSql);
                    if (Number(chkRows[0]?.cnt ?? 0) > 0) continue;

                    // INSERT with UUID as SessionID — all values escaped inline
                    const newId = randomUUID();
                    const insSql = `INSERT INTO Patrol_Sessions (SessionID,PatrolDate,TeamName,TeamID,AreaID,PatrolRound,Status) VALUES (${mysql.escape(newId)},${mysql.escape(dateStr)},${mysql.escape(team.TeamName)},${mysql.escape(team.TeamID)},${mysql.escape(areaId)},${mysql.escape(round)},'Pending')`;
                    await conn.query(insSql);
                    created++;
                }
            }
            await conn.commit();
            res.json({ success: true, created, message: `สร้าง ${created} sessions สำเร็จ` });
        } catch (err) {
            await conn.rollback();
            console.error('[generate-sessions] ERROR:', err.message);
            throw err;
        } finally { conn.release(); }

    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/monthly-summary?year=&month= — สรุปรายเดือนสำหรับแสดงใน patrol page
router.get('/monthly-summary', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const [sessions] = await db.query(`
            SELECT s.*, s.SessionID AS id, s.PatrolDate AS ScheduledDate,
                   t.Color AS TeamColor, a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate, s.TeamID
        `, [ym.year, ym.month]);
        res.json({ success: true, data: sessions });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/sessions/:id — แก้ไขวันที่ / area / status
router.put('/sessions/:id', isAdmin, async (req, res) => {
    const { PatrolDate, AreaID, Status } = req.body;
    if (!PatrolDate && !AreaID && !Status)
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
    if (Status && !SESSION_STATUSES.includes(Status)) {
        return res.status(400).json({ success: false, message: 'Status ไม่ถูกต้อง' });
    }
    try {
        const [[session]] = await db.query(
            'SELECT SessionID, PatrolDate, TeamID, AreaID, PatrolRound, Status FROM Patrol_Sessions WHERE SessionID = ?',
            [req.params.id]
        );
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบ session' });

        const sets  = [];
        const vals  = [];
        let targetDate = dateOnly(session.PatrolDate);
        const targetTeam = session.TeamID;
        const targetRound = session.PatrolRound;

        if (PatrolDate) {
            const parsedDate = parseDateInput(PatrolDate);
            if (!parsedDate) return res.status(400).json({ success: false, message: 'PatrolDate ไม่ถูกต้อง' });
            sets.push('PatrolDate = ?');
            vals.push(parsedDate);
            targetDate = parsedDate;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'AreaID')) {
            sets.push('AreaID = ?');
            vals.push(AreaID || null);
        }
        if (Status)     { sets.push('Status = ?');     vals.push(Status); }
        if (!sets.length) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });

        const [[dupe]] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Patrol_Sessions WHERE PatrolDate = ? AND TeamID = ? AND PatrolRound = ? AND SessionID <> ?',
            [targetDate, targetTeam, targetRound, req.params.id]
        );
        if (Number(dupe?.cnt || 0) > 0) {
            return res.status(409).json({ success: false, message: 'มี session ของทีม/รอบ/วันนี้อยู่แล้ว' });
        }

        vals.push(req.params.id);
        const [result] = await db.query(
            `UPDATE Patrol_Sessions SET ${sets.join(', ')} WHERE SessionID = ?`, vals
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'แก้ไข session เรียบร้อย' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PATCH /api/patrol/sessions/:id/toggle-cancel — สลับ Pending ↔ Cancelled
router.patch('/sessions/:id/toggle-cancel', isAdmin, async (req, res) => {
    try {
        const [[sess]] = await db.query('SELECT Status FROM Patrol_Sessions WHERE SessionID = ?', [req.params.id]);
        if (!sess) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        const newStatus = sess.Status === 'Cancelled' ? 'Pending' : 'Cancelled';
        await db.query('UPDATE Patrol_Sessions SET Status = ? WHERE SessionID = ?', [newStatus, req.params.id]);
        res.json({ success: true, status: newStatus });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/sessions/:id — ลบ session (Admin)
router.delete('/sessions/:id', isAdmin, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM Patrol_Sessions WHERE SessionID = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'ลบ session เรียบร้อย' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// Helpers
// ==========================================

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// คืน array ของวันพุธในเดือน format 'YYYY-MM-DD' เรียงลำดับ
function getWednesdaysInMonth(year, month) {
    const result = [];
    const d = new Date(year, month - 1, 1);
    // หาวันพุธแรก
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    while (d.getMonth() === month - 1) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        result.push(`${d.getFullYear()}-${mm}-${dd}`);
        d.setDate(d.getDate() + 7);
    }
    return result; // [พุธ1, พุธ2, พุธ3, พุธ4]
}

// GET /api/patrol/attendance-overview?year=Y — ภาพรวมการเข้าร่วมรายบุคคลทั้งปี (Patrol_Roster based)
function dateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function patrolCutoffDate(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) return `${year}-12-31`;
    if (year > currentYear) return `${year}-01-01`;
    return dateOnly(now);
}

function patrolDueMonth(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) return 12;
    if (year > currentYear) return 0;
    return now.getMonth() + 1;
}

function patrolPct(done, target) {
    return target > 0 ? Math.min(100, Math.round(done * 100 / target)) : 0;
}

function patrolSupervisorMonthlyRequirement() {
    return 2;
}

async function patrolActivityTargetForEmployee(employeeId, employee, activityKey = 'patrol') {
    try {
        const position = String(employee?.Position || '').trim();
        const department = String(employee?.Department || '').trim();
        const unit = String(employee?.Unit || '').trim();

        let source = 'override';
        let [[row]] = await db.query(
            'SELECT YearlyTarget, PassPct, IsNA FROM Employee_Activity_Targets WHERE EmployeeID=? AND ActivityKey=? LIMIT 1',
            [employeeId, activityKey]
        );
        if (!row && department) {
            [[row]] = await db.query(
                `SELECT YearlyTarget, PassPct, IsNA, Department, Unit
                   FROM Activity_Scope_Overrides
                  WHERE Department=? AND (Unit=? OR Unit='')
                    AND ActivityKey=?
                  ORDER BY CASE WHEN Unit=? THEN 0 ELSE 1 END
                  LIMIT 1`,
                [department, unit, activityKey, unit]
            );
            source = 'scope';
        }
        if (!row && position) {
            [[row]] = await db.query(
                'SELECT YearlyTarget, PassPct, IsNA FROM Activity_Position_Templates WHERE PositionName=? AND ActivityKey=? LIMIT 1',
                [position, activityKey]
            );
            source = 'template';
        }
        if (!row || row.IsNA) return null;
        const yearlyTarget = Number(row.YearlyTarget || 0);
        if (yearlyTarget < 1) return null;
        return { yearlyTarget, passPct: Number(row.PassPct || 80), source };
    } catch {
        return null;
    }
}

function patrolMonthlyRequiredFromYearlyTarget(yearlyTarget, month) {
    const target = Number(yearlyTarget || 0);
    const m = Number(month || 0);
    if (target < 1 || m < 1 || m > 12) return 0;
    return Math.max(0, Math.ceil(target * m / 12) - Math.ceil(target * (m - 1) / 12));
}

function patrolCurrentMonthlyRequirement(year, yearlyTarget) {
    const month = Math.min(12, Math.max(1, patrolDueMonth(year) || 1));
    return patrolMonthlyRequiredFromYearlyTarget(yearlyTarget, month);
}

function patrolSupervisorRequirementFromScheduleCount(count) {
    const total = Number(count || 0);
    return total > 0 ? Math.ceil(total / 2) : 0;
}

async function topManagementSessionsForEmployee(employeeId, year) {
    const [[base]] = await db.query(
        'SELECT TeamID,PatrolType FROM Patrol_Team_Members WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    if (!base) return [];
    const [rotations] = await db.query(
        'SELECT Month,TeamID FROM Patrol_Member_Rotation WHERE EmployeeID=? AND Year=?',
        [employeeId, year]
    );
    const rotMap = {};
    rotations.forEach(r => { rotMap[Number(r.Month)] = Number(r.TeamID); });
    const teamIds = [...new Set([Number(base.TeamID), ...Object.values(rotMap)])].filter(Boolean);
    if (!teamIds.length) return [];
    const [rows] = await db.query(
        `SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,
                t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode
         FROM Patrol_Sessions s
         LEFT JOIN Patrol_Teams t ON t.id=s.TeamID
         LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
         WHERE YEAR(s.PatrolDate)=? AND s.TeamID IN (${teamIds.map(() => '?').join(',')})
         ORDER BY s.PatrolDate,s.PatrolRound`,
        [year, ...teamIds]
    );
    return rows.filter(s => {
        const d = dateOnly(s.PatrolDate);
        const month = Number(d.slice(5, 7));
        const effectiveTeam = rotMap[month] || Number(base.TeamID);
        if (Number(s.TeamID) !== effectiveTeam) return false;
        if (String(s.Status || '').toLowerCase() === 'cancelled') return false;
        return base.PatrolType === 'management' || Number(s.PatrolRound || 0) === 2;
    }).map(s => ({ ...s, PatrolDate: dateOnly(s.PatrolDate) }));
}

async function buildPersonalMonthlySchedule(employeeId, year, month) {
    const sessions = (await topManagementSessionsForEmployee(employeeId, year))
        .filter(s => Number(dateOnly(s.PatrolDate).slice(5, 7)) === Number(month));
    const [attendance] = await db.query(
        `SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID
         FROM Patrol_Attendance
         WHERE UserID=? AND YEAR(PatrolDate)=? AND MONTH(PatrolDate)=?
         ORDER BY PatrolDate,id`,
        [employeeId, year, month]
    );
    const attByDate = {};
    const attBySession = {};
    attendance.forEach(row => {
        const actual = dateOnly(row.PatrolDate);
        const record = { ...row, PatrolDate: actual };
        if (!attByDate[actual]) attByDate[actual] = [];
        attByDate[actual].push(record);
        if (record.ScheduledSessionID) {
            const sid = String(record.ScheduledSessionID);
            if (!attBySession[sid]) attBySession[sid] = [];
            attBySession[sid].push(record);
        }
    });
    let completed = 0;
    const items = sessions.map(s => {
        const scheduledDate = dateOnly(s.PatrolDate);
        const sessionRecords = attBySession[String(s.id)] || [];
        const dateRecords = (attByDate[scheduledDate] || []).filter(r => !r.ScheduledSessionID);
        const records = [...sessionRecords, ...dateRecords].map(r => ({
            ...r,
            scheduledDate,
            actualDate: dateOnly(r.PatrolDate),
            isMakeup: Boolean(r.ScheduledSessionID) && dateOnly(r.PatrolDate) !== scheduledDate,
        }));
        const isCompleted = records.length > 0;
        if (isCompleted) completed++;
        return {
            ...s,
            id: s.id,
            SessionID: s.id,
            ScheduledSessionID: s.id,
            PatrolDate: scheduledDate,
            ScheduledDate: scheduledDate,
            date: scheduledDate,
            completionStatus: isCompleted ? 'completed' : scheduledDate <= dateOnly(new Date()) ? 'missing' : 'upcoming',
            isCompleted,
            actualDate: records[0]?.actualDate || null,
            isMakeup: Boolean(records[0]?.isMakeup),
            records,
        };
    });
    return { items, required: items.length, completed, attendance };
}

async function supervisorScheduleSlotsForYear(year) {
    const [rows] = await db.query(
        `SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,
                t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode
         FROM Patrol_Sessions s
         LEFT JOIN Patrol_Teams t ON t.id=s.TeamID
         LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
         WHERE YEAR(s.PatrolDate)=?
           AND (s.Status IS NULL OR s.Status <> 'Cancelled')
         ORDER BY s.PatrolDate,s.PatrolRound,s.TeamID`,
        [year]
    );
    const slots = [];
    const seen = new Set();
    rows.forEach(row => {
        const scheduledDate = dateOnly(row.PatrolDate);
        const round = Number(row.PatrolRound || 0);
        const key = `${scheduledDate}:${round}`;
        if (seen.has(key)) return;
        seen.add(key);
        slots.push({
            ...row,
            id: row.id,
            SessionID: row.id,
            ScheduledSessionID: row.id,
            PatrolDate: scheduledDate,
            ScheduledDate: scheduledDate,
            date: scheduledDate,
            PatrolRound: round,
        });
    });
    return slots;
}

function attachSupervisorRecordsToSchedule(records, slots) {
    const bySession = {};
    const byDate = {};
    records.forEach(record => {
        if (record.ScheduledSessionID) {
            const sid = String(record.ScheduledSessionID);
            if (!bySession[sid]) bySession[sid] = [];
            bySession[sid].push(record);
        } else {
            const date = dateOnly(record.CheckinDate);
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(record);
        }
    });
    const usedUnlinked = new Set();
    return slots.map(slot => {
        const scheduledDate = dateOnly(slot.PatrolDate || slot.date);
        const linked = bySession[String(slot.id)] || [];
        const unlinked = (byDate[scheduledDate] || []).filter(r => !usedUnlinked.has(r.id));
        const fallback = linked.length ? [] : unlinked.slice(0, 1);
        fallback.forEach(r => usedUnlinked.add(r.id));
        const itemRecords = [...linked, ...fallback].map(r => ({
            ...r,
            scheduledDate,
            actualDate: dateOnly(r.CheckinDate),
            isMakeup: Boolean(r.ScheduledSessionID) && dateOnly(r.CheckinDate) !== scheduledDate,
        }));
        const status = itemRecords.length ? 'completed' : scheduledDate <= dateOnly(new Date()) ? 'missed' : 'upcoming';
        return {
            ...slot,
            status,
            sessionId: slot.id,
            patrolRound: Number(slot.PatrolRound || 0),
            teamId: Number(slot.TeamID || 0),
            teamName: slot.TeamName || '',
            areaName: slot.AreaName || '',
            areaCode: slot.AreaCode || '',
            records: itemRecords,
            isCompleted: itemRecords.length > 0,
        };
    });
}

async function resolveSupervisorScheduledSession(employeeId, date, requestedSessionId) {
    const year = Number(String(date).slice(0, 4));
    const detail = await buildSupervisorAttendanceDetail(employeeId, year);
    const slots = Array.isArray(detail.schedule) ? detail.schedule : [];
    const map = new Map(slots.map(s => [String(s.id), s]));
    let session = null;
    const sid = String(requestedSessionId || '').trim();
    if (sid) {
        session = map.get(sid);
        if (!session) {
            const err = new Error('Selected schedule is not valid for this employee.');
            err.statusCode = 400;
            throw err;
        }
        date = dateOnly(session.date || session.PatrolDate);
    } else {
        session = slots.find(s => dateOnly(s.date || s.PatrolDate) === date && !s.isCompleted) || null;
    }
    if (session) {
        const [[existingLinked]] = await db.query(
            'SELECT id FROM Patrol_Self_Checkin WHERE EmployeeID=? AND ScheduledSessionID=? LIMIT 1',
            [employeeId, session.id]
        );
        const [[existingDate]] = await db.query(
            `SELECT id FROM Patrol_Self_Checkin
             WHERE EmployeeID=? AND DATE(CheckinDate)=?
               AND (ScheduledSessionID IS NULL OR ScheduledSessionID='')
             LIMIT 1`,
            [employeeId, dateOnly(session.date || session.PatrolDate)]
        );
        if (existingLinked || existingDate) {
            const err = new Error('Selected schedule is already completed.');
            err.statusCode = 409;
            throw err;
        }
    }
    return { session, date };
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildPatrolCheckinEmail({ employee, attendance, session }) {
    const employeeName = employee?.EmployeeName || attendance.UserName || attendance.UserID || '';
    const actualDate = dateOnly(attendance.PatrolDate);
    const scheduledDate = session ? dateOnly(session.PatrolDate) : actualDate;
    const typeLabel = attendance.PatrolType === 'compensation' ? 'เดินซ่อม / Makeup' : 'เดินปกติ / Routine';
    const subject = `[Safety Patrol] Check-in recorded - ${employeeName || attendance.UserID}`;
    const rendered = buildHiyariEmail({
        subject,
        title: 'บันทึก Safety Patrol สำเร็จ',
        kicker: 'SAFETY PATROL',
        moduleLabel: 'Safety Patrol Module',
        tone: 'completed',
        greeting: `เรียน คุณ${employeeName || 'ผู้ใช้งาน'} / Dear Safety Patrol user`,
        intro: [
            'ระบบบันทึกการเดินตรวจของคุณเรียบร้อยแล้ว',
            'กรุณาเปิดระบบเพื่อตรวจสอบประวัติและสถานะรอบการเดินของคุณได้ทุกเวลา',
        ],
        details: [
            { label: 'ผู้เดินตรวจ / Inspector', value: employeeName || '-', highlight: true },
            { label: 'รหัสพนักงาน / Employee ID', value: attendance.UserID || '-' },
            { label: 'ตำแหน่ง / Position', value: employee?.Position || '-' },
            { label: 'แผนก / Department', value: employee?.Department || '-' },
            { label: 'ประเภท / Type', value: typeLabel, highlight: true },
            { label: 'วันที่เดินจริง / Actual Date', value: actualDate || '-' },
            { label: 'วันที่ตามรอบ / Scheduled Date', value: scheduledDate || '-' },
            { label: 'รอบ / Round', value: session?.PatrolRound ? `Round ${Number(session.PatrolRound)}` : '-' },
            { label: 'ทีม / Team', value: session?.TeamName || attendance.TeamName || '-' },
            { label: 'พื้นที่ / Area', value: attendance.Area || session?.AreaName || '-' },
            { label: 'หมายเหตุ / Notes', value: attendance.Notes || '-' },
        ],
        actions: ['เปิด Safety Patrol เพื่อตรวจสอบ My Schedule และประวัติการเดินตรวจ'],
        note: 'อีเมลนี้ส่งอัตโนมัติหลังจากผู้ใช้บันทึกการเดินตรวจด้วยตนเอง',
    });
    return { subject, text: rendered.text, html: rendered.html };
}

async function queuePatrolCheckinEmail({ attendanceId, employee, attendance, session }) {
    await ensureEmployeeCompanyEmailColumn(db).catch(() => {});
    const recipient = String(employee?.CompanyEmail || '').trim();
    if (!isValidEmail(recipient)) {
        return { queued: false, sent: false, reason: 'No valid CompanyEmail' };
    }
    const { subject, text, html } = buildPatrolCheckinEmail({ employee, attendance, session });
    const [insert] = await db.query(
        `INSERT INTO Patrol_EmailOutbox (AttendanceID, EmployeeID, EventType, Recipients, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, 'SelfCheckInRecorded', ?, ?, ?, ?, 'Queued')`,
        [attendanceId, attendance.UserID, recipient, subject, text, html || null]
    ).catch(err => {
        console.error('[patrol/email] queue failed:', err.message);
        return [{}];
    });
    const outboxId = insert?.insertId || null;
    if (!smtpConfigured()) return { queued: Boolean(outboxId), outboxId, status: outboxId ? 'Queued' : 'Failed', sent: false };
    try {
        await sendMail({ to: recipient, subject, text, html });
        if (outboxId) await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [outboxId]);
        return { queued: Boolean(outboxId), outboxId, status: 'Sent', sent: true };
    } catch (err) {
        if (outboxId) await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [err.message, outboxId]).catch(() => {});
        return { queued: Boolean(outboxId), outboxId, status: 'Failed', sent: false, reason: err.message };
    }
}

async function resolveTopScheduledSession(employeeId, date, requestedSessionId) {
    const year = Number(String(date).slice(0, 4));
    const sessions = await topManagementSessionsForEmployee(employeeId, year);
    const map = new Map(sessions.map(s => [String(s.id), s]));
    let session = null;
    const sid = String(requestedSessionId || '').trim();
    if (sid) {
        session = map.get(sid);
        if (!session) {
            const err = new Error('Selected schedule is not valid for this employee.');
            err.statusCode = 400;
            throw err;
        }
        if (String(date).slice(0, 7) !== dateOnly(session.PatrolDate).slice(0, 7)) {
            const err = new Error('Makeup patrol must be linked to a scheduled round in the same month.');
            err.statusCode = 400;
            throw err;
        }
    } else {
        const matches = sessions.filter(s => dateOnly(s.PatrolDate) === date);
        if (matches.length === 1) session = matches[0];
    }
    if (session) {
        const [[existing]] = await db.query(
            'SELECT id FROM Patrol_Attendance WHERE UserID=? AND ScheduledSessionID=? LIMIT 1',
            [employeeId, session.id]
        );
        const [[existingDate]] = await db.query(
            `SELECT id FROM Patrol_Attendance
             WHERE UserID=? AND DATE(PatrolDate)=?
               AND (ScheduledSessionID IS NULL OR ScheduledSessionID='')
             LIMIT 1`,
            [employeeId, dateOnly(session.PatrolDate)]
        );
        if (existing || existingDate) {
            const err = new Error('Selected schedule is already completed.');
            err.statusCode = 409;
            throw err;
        }
    }
    return { session, sessions };
}

async function buildTopManagementAttendanceDetail(employeeId, year) {
    const [[employee]] = await db.query(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Position FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    if (!employee) {
        const err = new Error('Employee not found.');
        err.statusCode = 404;
        throw err;
    }
    const [[roster]] = await db.query(
        "SELECT id AS RosterID,TargetPerYear,SortOrder FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='top_management' LIMIT 1",
        [employeeId]
    );
    if (!roster) {
        const err = new Error('Employee is not in Top & Management roster.');
        err.statusCode = 404;
        throw err;
    }
    const sessions = await topManagementSessionsForEmployee(employeeId, year);
    const [attendance] = await db.query(
        `SELECT pa.id,pa.PatrolDate,pa.PatrolType,pa.Area,pa.Notes,pa.RecordedBy,pa.ScheduledSessionID,e.EmployeeName AS RecordedByName
         FROM Patrol_Attendance pa
         LEFT JOIN Employees e ON e.EmployeeID=pa.RecordedBy
         WHERE pa.UserID=? AND YEAR(pa.PatrolDate)=?
         ORDER BY pa.PatrolDate,pa.id`,
        [employeeId, year]
    );
    const records = attendance.map(a => ({
        ...a,
        PatrolDate: dateOnly(a.PatrolDate),
        mode: !a.RecordedBy || String(a.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    const attByDate = {};
    const attBySession = {};
    records.forEach(a => {
        if (!attByDate[a.PatrolDate]) attByDate[a.PatrolDate] = [];
        attByDate[a.PatrolDate].push(a);
        if (a.ScheduledSessionID) {
            const sid = String(a.ScheduledSessionID);
            if (!attBySession[sid]) attBySession[sid] = [];
            attBySession[sid].push(a);
        }
    });
    const cutoff = patrolCutoffDate(year);
    const periods = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, required: 0, completed: 0, missed: 0, upcoming: 0, items: [] }));
    let requiredToDate = 0;
    let completedScheduled = 0;
    const schedule = sessions.map(s => {
        const date = dateOnly(s.PatrolDate);
        const month = Number(date.slice(5, 7));
        const sessionRecords = attBySession[String(s.id)] || [];
        const dateRecords = (attByDate[date] || []).filter(r => !r.ScheduledSessionID);
        const itemRecords = [...sessionRecords, ...dateRecords].map(r => ({
            ...r,
            scheduledDate: date,
            actualDate: dateOnly(r.PatrolDate),
            isMakeup: Boolean(r.ScheduledSessionID) && dateOnly(r.PatrolDate) !== date,
        }));
        const done = Boolean(itemRecords.length);
        const due = date <= cutoff;
        const status = done ? 'completed' : due ? 'missed' : 'upcoming';
        if (due) requiredToDate++;
        if (done) completedScheduled++;
        const item = {
            date,
            status,
            sessionId: s.id,
            patrolRound: Number(s.PatrolRound || 0),
            teamId: Number(s.TeamID || 0),
            teamName: s.TeamName || '',
            areaName: s.AreaName || '',
            areaCode: s.AreaCode || '',
            records: itemRecords,
        };
        const p = periods[month - 1];
        p.required++;
        if (status === 'completed') p.completed++;
        else if (status === 'missed') p.missed++;
        else p.upcoming++;
        p.items.push(item);
        return item;
    });
    const scheduledDates = new Set(schedule.map(s => s.date));
    const extraRecords = records.filter(r => !r.ScheduledSessionID && !scheduledDates.has(r.PatrolDate));
    const yearlyTarget = Number(roster.TargetPerYear || 0);
    return {
        mode: 'scheduled_calendar',
        group: 'top_management',
        year,
        employee,
        roster: { RosterID: Number(roster.RosterID), TargetPerYear: yearlyTarget },
        summary: {
            completed: records.length,
            completedScheduled,
            requiredToDate,
            yearlyTarget,
            scheduledTotal: sessions.length,
            missingToDate: Math.max(0, requiredToDate - completedScheduled),
            upcoming: Math.max(0, sessions.length - requiredToDate),
            progressToDatePct: patrolPct(completedScheduled, requiredToDate),
            fullYearPct: patrolPct(records.length, yearlyTarget),
        },
        periods,
        schedule,
        records,
        extraRecords,
    };
}

async function buildSupervisorAttendanceDetail(employeeId, year) {
    const [[employee]] = await db.query(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Position FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    if (!employee) {
        const err = new Error('Employee not found.');
        err.statusCode = 404;
        throw err;
    }
    const [[roster]] = await db.query(
        "SELECT id AS RosterID,TargetPerYear,SortOrder FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
        [employeeId]
    );
    if (!roster) {
        const err = new Error('Employee is not in Sec. & Supervisor roster.');
        err.statusCode = 404;
        throw err;
    }
    const activityTarget = await patrolActivityTargetForEmployee(employeeId, employee, 'patrol');
    const fallbackTarget = Number(roster.TargetPerYear || patrolSupervisorMonthlyRequirement() * 12);
    const yearlyTarget = Number(activityTarget?.yearlyTarget || fallbackTarget);
    const targetSource = activityTarget?.source || 'patrol_roster';
    const dueMonth = patrolDueMonth(year);
    const [rows] = await db.query(
        `SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName
         FROM Patrol_Self_Checkin sc
         LEFT JOIN Employees e ON e.EmployeeID=sc.RecordedBy
         WHERE sc.EmployeeID=? AND sc.Year=?
         ORDER BY sc.CheckinDate,sc.id`,
        [employeeId, year]
    );
    const records = rows.map(r => ({
        ...r,
        CheckinDate: dateOnly(r.CheckinDate),
        mode: !r.RecordedBy || String(r.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    const byMonth = {};
    records.forEach(r => {
        const m = Number(r.Month || r.CheckinDate.slice(5, 7));
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(r);
    });
    const schedule = attachSupervisorRecordsToSchedule(records, await supervisorScheduleSlotsForYear(year));
    const scheduleByMonth = {};
    schedule.forEach(item => {
        const month = Number(dateOnly(item.date || item.PatrolDate).slice(5, 7));
        if (!scheduleByMonth[month]) scheduleByMonth[month] = [];
        scheduleByMonth[month].push(item);
    });
    const scheduledRequirementByMonth = {};
    let scheduledYearlyTarget = 0;
    for (let month = 1; month <= 12; month++) {
        const monthRequirement = patrolSupervisorRequirementFromScheduleCount((scheduleByMonth[month] || []).length);
        scheduledRequirementByMonth[month] = monthRequirement;
        scheduledYearlyTarget += monthRequirement;
    }
    const effectiveYearlyTarget = scheduledYearlyTarget || yearlyTarget;
    let requiredToDate = 0;
    let completedToDate = 0;
    const periods = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const monthRecords = byMonth[month] || [];
        const completed = monthRecords.length;
        const isDue = month <= dueMonth;
        const monthRequirement = scheduledRequirementByMonth[month] || 0;
        const required = isDue ? monthRequirement : 0;
        if (isDue) {
            requiredToDate += monthRequirement;
            completedToDate += Math.min(completed, monthRequirement);
        }
        const status = !isDue ? 'upcoming' : completed >= monthRequirement ? 'completed' : completed > 0 ? 'partial' : 'missed';
        return {
            month,
            required,
            monthlyRequirement: monthRequirement,
            completed,
            missing: isDue ? Math.max(0, monthRequirement - completed) : 0,
            status,
            records: monthRecords,
            items: scheduleByMonth[month] || [],
        };
    });
    const currentMonth = Math.min(12, Math.max(1, patrolDueMonth(year) || 1));
    const openSchedule = schedule.filter(item => !item.isCompleted);
    return {
        mode: 'scheduled_quota',
        group: 'supervisor',
        year,
        employee,
        roster: { RosterID: Number(roster.RosterID), TargetPerYear: effectiveYearlyTarget, ConfiguredTargetPerYear: yearlyTarget },
        monthlyRequirement: scheduledRequirementByMonth[currentMonth] || 0,
        targetSource,
        summary: {
            completed: records.length,
            completedToDateCapped: completedToDate,
            requiredToDate,
            yearlyTarget: effectiveYearlyTarget,
            configuredYearlyTarget: yearlyTarget,
            targetSource,
            scheduledTotal: schedule.length,
            missingToDate: Math.max(0, requiredToDate - completedToDate),
            upcomingMonths: Math.max(0, 12 - dueMonth),
            progressToDatePct: patrolPct(completedToDate, requiredToDate),
            fullYearPct: patrolPct(records.length, effectiveYearlyTarget),
        },
        periods,
        schedule,
        openSchedule,
        records,
    };
}

router.get('/attendance-detail', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const employeeId = String(req.query.employeeId || req.user.id || '').trim();
    const group = String(req.query.group || 'top_management').trim();
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });
    try {
        if (!['top_management', 'supervisor'].includes(group)) {
            return res.status(400).json({ success: false, message: 'group is invalid.' });
        }
        if (!isAdminUser(req) && employeeId !== req.user.id && !(await canViewRosterAttendanceDetail(employeeId, group))) {
            return res.status(403).json({ success: false, message: 'Permission denied.' });
        }
        if (group === 'supervisor') {
            return res.json({ success: true, data: await buildSupervisorAttendanceDetail(employeeId, year) });
        }
        if (group === 'top_management') {
            return res.json({ success: true, data: await buildTopManagementAttendanceDetail(employeeId, year) });
        }
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
        sendPatrolError(res, err);
    }
});

router.get('/attendance-overview', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const [members] = await db.query(`
            SELECT pr.id AS RosterID, pr.EmployeeID, pr.TargetPerYear,
                   e.EmployeeName AS Name, e.Position, e.Department
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            WHERE pr.RosterGroup = 'top_management'
            ORDER BY pr.SortOrder, e.EmployeeName
        `);
        const result = [];
        let requiredToDateTotal = 0;
        let completedToDateTotal = 0;
        let yearlyTargetTotal = 0;
        let fullYearCompletedTotal = 0;
        let scheduledTotal = 0;
        let missingToDateTotal = 0;
        let upcomingTotal = 0;

        for (const m of members) {
            const detail = await buildTopManagementAttendanceDetail(String(m.EmployeeID), year);
            const summary = detail.summary || {};
            const requiredToDate = Number(summary.requiredToDate || 0);
            const completedToDate = Number(summary.completedScheduled || 0);
            const yearlyTarget = Number(summary.yearlyTarget || m.TargetPerYear || 0);
            const fullYearCompleted = Number(summary.completed || 0);
            const progressPct = patrolPct(completedToDate, requiredToDate);
            const fullYearPct = patrolPct(fullYearCompleted, yearlyTarget);
            requiredToDateTotal += requiredToDate;
            completedToDateTotal += completedToDate;
            yearlyTargetTotal += yearlyTarget;
            fullYearCompletedTotal += fullYearCompleted;
            scheduledTotal += Number(summary.scheduledTotal || 0);
            missingToDateTotal += Number(summary.missingToDate || 0);
            upcomingTotal += Number(summary.upcoming || 0);
            result.push({
                RosterID: m.RosterID,
                EmployeeID: m.EmployeeID,
                Name: m.Name,
                Position: m.Position,
                Department: m.Department,
                TargetPerYear: yearlyTarget,
                Year: year,
                Total: requiredToDate,
                Attended: completedToDate,
                Percent: progressPct,
                ProgressToDatePct: progressPct,
                FullYearPct: fullYearPct,
                fullYearPct: fullYearPct,
                RequiredToDate: requiredToDate,
                CompletedToDate: completedToDate,
                CompletedScheduled: completedToDate,
                ScheduledTotal: Number(summary.scheduledTotal || 0),
                MissingToDate: Number(summary.missingToDate || 0),
                Upcoming: Number(summary.upcoming || 0),
                YearlyTarget: yearlyTarget,
                FullYearCompleted: fullYearCompleted,
            });
        }

        const [latest] = await db.query(
            'SELECT MAX(PatrolDate) AS LatestDate FROM Patrol_Attendance WHERE YEAR(PatrolDate) = ?', [year]
        );

        res.json({
            success: true,
            data: {
                members: result,
                summary: {
                    totalSessions: requiredToDateTotal,
                    totalAttended: completedToDateTotal,
                    percent: patrolPct(completedToDateTotal, requiredToDateTotal),
                    progressToDatePct: patrolPct(completedToDateTotal, requiredToDateTotal),
                    requiredToDate: requiredToDateTotal,
                    completedToDate: completedToDateTotal,
                    scheduledTotal,
                    missingToDate: missingToDateTotal,
                    upcoming: upcomingTotal,
                    yearlyTargetTotal,
                    fullYearCompleted: fullYearCompletedTotal,
                    fullYearPct: patrolPct(fullYearCompletedTotal, yearlyTargetTotal),
                    latestDate: latest[0]?.LatestDate || null,
                    year,
                },
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/member-attendance?employeeId=X&year=Y — รายการเดินตรวจรายบุคคล (สำหรับ spotlight modal)
router.get('/member-attendance', async (req, res) => {
    const { employeeId, year: yearStr } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ employeeId' });
    const year = parseInt(yearStr) || new Date().getFullYear();
    try {
        const [rows] = await db.query(`
            SELECT id, PatrolDate, PatrolType, Area, Notes
            FROM Patrol_Attendance
            WHERE UserID = ? AND YEAR(PatrolDate) = ?
            ORDER BY PatrolDate DESC, id DESC
        `, [employeeId, year]);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ─── Self-Patrol (หัวหน้าส่วน/แผนก) ───────────────────────────────────────────

router.get('/my-self-patrol', async (req, res) => {
    const { year, month } = req.query;
    const empId = req.user.id;
    try {
        const [[emp]] = await db.query(
            `SELECT mp.IsSupervisorPatrol, e.Position
             FROM Employees e
             LEFT JOIN Master_Positions mp ON mp.Name = e.Position
             WHERE e.EmployeeID = ?`, [empId]);
        const [[roster]] = await db.query(
            "SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
            [empId]
        );
        if (!roster) {
            return res.json({ success: true, data: { isSupervisorPatrol: false, checkins: [] } });
        }
        const detail = await buildSupervisorAttendanceDetail(empId, parseInt(year) || new Date().getFullYear());
        const period = (detail.periods || []).find(p => Number(p.month) === Number(month)) || {};
        res.json({
            success: true,
            data: {
                isSupervisorPatrol: true,
                position: emp?.Position || detail.employee?.Position || '',
                checkins: period.records || [],
                target: Number(period.monthlyRequirement || period.required || 0),
                yearlyTarget: Number(detail.summary?.yearlyTarget || 0),
                yearlyCompleted: Number(detail.summary?.completed || 0),
                targetSource: detail.targetSource || detail.summary?.targetSource || 'patrol_roster',
                schedule: period.items || [],
                openSchedule: (period.items || []).filter(item => !item.isCompleted),
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.post('/self-checkin', async (req, res) => {
    const empId = req.user.id;
    const { CheckinDate, Location, Notes, ScheduledSessionID } = req.body;
    if (!CheckinDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    const inputDate = parseDateInput(CheckinDate);
    if (!inputDate) return res.status(400).json({ success: false, message: 'CheckinDate ไม่ถูกต้อง' });
    try {
        const [[emp]] = await db.query(
            `SELECT mp.IsSupervisorPatrol FROM Employees e
             LEFT JOIN Master_Positions mp ON mp.Name = e.Position
             WHERE e.EmployeeID = ?`, [empId]);
        if (!emp?.IsSupervisorPatrol) {
            const [[roster]] = await db.query(
                "SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
                [empId]
            );
            if (!roster) return res.status(403).json({ success: false, message: 'ตำแหน่งของคุณไม่ได้กำหนดให้เดิน Self-Patrol' });
        }
        const resolved = await resolveSupervisorScheduledSession(empId, inputDate, ScheduledSessionID);
        const effectiveDate = resolved.date;
        const effective = new Date(effectiveDate);
        const [result] = await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month, RecordedBy, ScheduledSessionID) VALUES (?,?,?,?,?,?,?,?)`,
            [empId, effectiveDate, Location || null, Notes || null, effective.getFullYear(), effective.getMonth() + 1, empId, resolved.session?.id || null]);
        res.json({ success: true, message: 'บันทึกการเดินตรวจสำเร็จ', id: result.insertId });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.delete('/self-checkin/:id', async (req, res) => {
    const empId = req.user.id;
    try {
        const [[row]] = await db.query('SELECT EmployeeID FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
        if (row.EmployeeID !== empId && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบรายการนี้' });
        }
        await db.query('DELETE FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.get('/supervisor-overview', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const [members] = await db.query(`
            SELECT pr.id AS RosterID, pr.EmployeeID, pr.TargetPerYear,
                   e.EmployeeName, e.Department, e.Position
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            WHERE pr.RosterGroup = 'supervisor'
            ORDER BY pr.SortOrder, e.Department, e.EmployeeName
        `);
        const data = [];
        for (const m of members) {
            const detail = await buildSupervisorAttendanceDetail(String(m.EmployeeID), year);
            const summary = detail.summary || {};
            const requiredToDate = Number(summary.requiredToDate || 0);
            const completedToDate = Number(summary.completedToDateCapped || 0);
            const yearlyTarget = Number(summary.yearlyTarget || m.TargetPerYear || 0);
            const fullYearCompleted = Number(summary.completed || 0);
            const progressPct = patrolPct(completedToDate, requiredToDate);
            const fullYearPct = patrolPct(fullYearCompleted, yearlyTarget);
            data.push({
                ...m,
                attended: completedToDate,
                target: requiredToDate,
                percent: progressPct,
                progressToDatePct: progressPct,
                fullYearPct,
                yearlyTarget,
                fullYearCompleted,
                requiredToDate,
                completedToDateCapped: completedToDate,
                missingToDate: Number(summary.missingToDate || 0),
                upcomingMonths: Number(summary.upcomingMonths || 0),
                monthlyRequirement: Number(detail.monthlyRequirement || patrolCurrentMonthlyRequirement(year, yearlyTarget)),
            });
        }
        res.json({ success: true, data });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 8: Patrol Roster (Admin-managed roster for Top Management & Supervisor overview tables)
// ==========================================
// SQL to create table (run once in DBeaver):
// CREATE TABLE IF NOT EXISTS Patrol_Roster (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   EmployeeID VARCHAR(50) NOT NULL,
//   RosterGroup ENUM('top_management','supervisor') NOT NULL,
//   TargetPerYear INT NOT NULL DEFAULT 12,
//   SortOrder INT DEFAULT 99,
//   CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
//   UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// GET /api/patrol/roster?group=top_management|supervisor
router.get('/roster', async (req, res) => {
    const { group } = req.query;
    try {
        const whereClause = group ? 'WHERE pr.RosterGroup = ?' : '';
        const params      = group ? [group] : [];
        const [rows] = await db.query(`
            SELECT pr.id, pr.EmployeeID, pr.RosterGroup, pr.TargetPerYear, pr.SortOrder,
                   e.EmployeeName, e.Position, e.Department
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            ${whereClause}
            ORDER BY pr.RosterGroup, pr.SortOrder, e.EmployeeName
        `, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/roster — Admin only: add employee to roster
router.post('/roster', isAdmin, async (req, res) => {
    const { EmployeeID, RosterGroup, TargetPerYear, SortOrder } = req.body;
    if (!EmployeeID || !RosterGroup) return res.status(400).json({ success: false, message: 'EmployeeID และ RosterGroup จำเป็น' });
    if (!['top_management', 'supervisor'].includes(RosterGroup))
        return res.status(400).json({ success: false, message: 'RosterGroup ไม่ถูกต้อง' });
    try {
        const [result] = await db.query(
            `INSERT INTO Patrol_Roster (EmployeeID, RosterGroup, TargetPerYear, SortOrder) VALUES (?,?,?,?)`,
            [EmployeeID, RosterGroup, TargetPerYear || 12, SortOrder || 99]
        );
        res.json({ success: true, id: result.insertId, message: 'เพิ่มสมาชิกสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้มีอยู่ในรายการแล้ว' });
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/roster/:id — Admin only: edit TargetPerYear / SortOrder
router.put('/roster/:id', isAdmin, async (req, res) => {
    const { TargetPerYear, SortOrder } = req.body;
    if (!TargetPerYear || TargetPerYear < 1) return res.status(400).json({ success: false, message: 'TargetPerYear ไม่ถูกต้อง' });
    try {
        await db.query(
            `UPDATE Patrol_Roster SET TargetPerYear = ?, SortOrder = ? WHERE id = ?`,
            [TargetPerYear, SortOrder ?? 99, req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/roster/:id — Admin only: remove from roster
router.delete('/roster/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Roster WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบออกจากรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/my-missed-sessions?year=Y — sessions ที่ user ควรเดินแต่ยังไม่มีบันทึก (สำหรับ เดินซ่อม dropdown)
router.get('/my-missed-sessions', async (req, res) => {
    const employeeId = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const sessions = await topManagementSessionsForEmployee(employeeId, year);
        const [linkedRows] = await db.query(
            `SELECT DISTINCT ScheduledSessionID
             FROM Patrol_Attendance
             WHERE UserID=? AND YEAR(PatrolDate)=?
               AND ScheduledSessionID IS NOT NULL AND ScheduledSessionID<>''`,
            [employeeId, year]
        );
        const completed = new Set(linkedRows.map(r => String(r.ScheduledSessionID)));
        const today = new Date().toISOString().split('T')[0];
        const rows = [];
        for (const s of sessions) {
            const date = dateOnly(s.PatrolDate);
            if (date >= today) continue;
            if (completed.has(String(s.id))) continue;
            const [[sameDate]] = await db.query(
                `SELECT id FROM Patrol_Attendance
                 WHERE UserID=? AND DATE(PatrolDate)=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID='')
                 LIMIT 1`,
                [employeeId, date]
            );
            if (sameDate) continue;
            rows.push({
                id: s.id,
                ScheduledSessionID: s.id,
                PatrolDate: date,
                PatrolRound: Number(s.PatrolRound || 0),
                AreaName: s.AreaName || '',
                AreaCode: s.AreaCode || '',
                TeamName: s.TeamName || '',
            });
        }
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});
// GET /api/patrol/supervisor-checkins?employeeId=X&year=Y — รายการ Self-Patrol รายบุคคล (admin/modal view)
router.get('/supervisor-checkins', async (req, res) => {
    const { employeeId, year: yearStr } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ employeeId' });
    const year = parseInt(yearStr) || new Date().getFullYear();
    try {
        const [rows] = await db.query(
            `SELECT id, CheckinDate, Location, Notes, Year, Month, RecordedBy
             FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?
             ORDER BY CheckinDate DESC`,
            [employeeId, year]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 9: Admin Record Management
// ==========================================

// POST /api/patrol/admin-record — Admin เพิ่มรายการเดินตรวจให้สมาชิกคนใดก็ได้ (Patrol_Attendance)
router.post('/admin-record', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolDate, PatrolType, Area, Notes, ScheduledSessionID } = req.body;
    if (!EmployeeID || !PatrolDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ PatrolDate' });
    if (!String(ScheduledSessionID || '').trim()) {
        return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for admin on-behalf patrol records.' });
    }
    try {
        const [[emp]] = await db.query(
            `SELECT e.EmployeeName, t.Name AS TeamName
             FROM Employees e
             LEFT JOIN Patrol_Team_Members tm ON tm.EmployeeID = e.EmployeeID
             LEFT JOIN Patrol_Teams t ON t.id = tm.TeamID
             WHERE e.EmployeeID = ? LIMIT 1`,
            [EmployeeID]
        );
        if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        const d = new Date(PatrolDate);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'PatrolDate ไม่ถูกต้อง' });
        const dateStr = d.toISOString().split('T')[0];
        const week = getWeekNumber(d);
        const { session } = await resolveTopScheduledSession(EmployeeID, dateStr, ScheduledSessionID);
        const area = Area || session?.AreaName || session?.AreaCode || null;
        const [result] = await db.query(
            `INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, PatrolDate, PatrolType, Area, Notes, RecordedBy, ScheduledSessionID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [EmployeeID, emp.EmployeeName, emp.TeamName || '', week,
             dateStr, PatrolType || 'normal', area, Notes || null, req.user.id, session?.id || null]
        );
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_ADD_PATROL_ATTENDANCE',
            targetType: 'Patrol_Attendance',
            targetId: result.insertId,
            detail: `Admin add patrol attendance for ${EmployeeID}`,
            metadata: { employeeId: EmployeeID, patrolDate: dateStr, patrolType: PatrolType || 'normal', area, scheduledSessionId: session?.id || null },
        });
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/admin-record/:id — Admin ลบรายการเดินตรวจ (Patrol_Attendance)
router.delete('/admin-record/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_DELETE_PATROL_ATTENDANCE',
            targetType: 'Patrol_Attendance',
            targetId: req.params.id,
            detail: `Admin delete patrol attendance #${req.params.id}`,
            metadata: { id: req.params.id },
        });
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/admin-record/supervisor — Admin เพิ่มรายการ Self-Patrol ให้หัวหน้า (Patrol_Self_Checkin)
router.post('/admin-record/supervisor', isAdmin, async (req, res) => {
    const { EmployeeID, CheckinDate, Location, Notes, ScheduledSessionID } = req.body;
    if (!EmployeeID || !CheckinDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ CheckinDate' });
    if (!String(ScheduledSessionID || '').trim()) {
        return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for admin on-behalf self-patrol records.' });
    }
    try {
        const [[emp]] = await db.query('SELECT EmployeeName FROM Employees WHERE EmployeeID = ?', [EmployeeID]);
        if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        const inputDate = parseDateInput(CheckinDate);
        if (!inputDate) return res.status(400).json({ success: false, message: 'CheckinDate ไม่ถูกต้อง' });
        const resolved = await resolveSupervisorScheduledSession(EmployeeID, inputDate, ScheduledSessionID);
        const effectiveDate = resolved.date;
        const effective = new Date(effectiveDate);
        const [result] = await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month, RecordedBy, ScheduledSessionID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [EmployeeID, effectiveDate, Location || resolved.session?.AreaName || resolved.session?.AreaCode || null, Notes || null, effective.getFullYear(), effective.getMonth() + 1, req.user.id, resolved.session?.id || null]
        );
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_ADD_SELF_PATROL',
            targetType: 'Patrol_Self_Checkin',
            targetId: result.insertId,
            detail: `Admin add self-patrol for ${EmployeeID}`,
            metadata: { employeeId: EmployeeID, checkinDate: effectiveDate, location: Location || null, scheduledSessionId: resolved.session?.id || null },
        });
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/admin-record/supervisor/:id — Admin ลบรายการ Self-Patrol (Patrol_Self_Checkin)
router.delete('/admin-record/supervisor/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_DELETE_SELF_PATROL',
            targetType: 'Patrol_Self_Checkin',
            targetId: req.params.id,
            detail: `Admin delete self-patrol #${req.params.id}`,
            metadata: { id: req.params.id },
        });
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/employee-search — Admin ค้นหาพนักงานทุกคน (ไม่จำกัดเฉพาะ roster)
router.get('/employee-search', isAdmin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let sql = 'SELECT EmployeeID, EmployeeName, Department, Position FROM Employees WHERE 1=1';
        const params = [];
        if (q) {
            sql += ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ?)';
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        sql += ' ORDER BY EmployeeName ASC LIMIT 30';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

module.exports = router;
