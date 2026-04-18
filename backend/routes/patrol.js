// backend/routes/patrol.js
// Auth is applied at mount level: app.use('/api/patrol', authenticateToken, patrolRoutes)
const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const mysql        = require('mysql2'); // used for mysql.escape() in generate-sessions
const { randomUUID } = require('crypto'); // UUID for Patrol_Sessions.SessionID (VARCHAR)
const multer       = require('multer');
const { storage, fileFilter } = require('../cloudinary');
const { isAdmin } = require('../middleware/auth');

// Auto-migrate: Patrol_Attendance columns + Master_Positions.PatrolPassPct
(async () => {
    for (const sql of [
        'ALTER TABLE Patrol_Attendance ADD COLUMN Notes TEXT DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN Area VARCHAR(200) DEFAULT NULL',
        'ALTER TABLE Master_Positions ADD COLUMN PatrolPassPct INT DEFAULT 80',
        'ALTER TABLE Patrol_Attendance ADD COLUMN PatrolType VARCHAR(20) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN ReporterID VARCHAR(50) DEFAULT NULL',
        // Ensure PatrolType in Team_Members is VARCHAR (not ENUM) to support 'committee'
        'ALTER TABLE Patrol_Team_Members MODIFY COLUMN PatrolType VARCHAR(20) NOT NULL',
        // Per-round area assignment (0=legacy both rounds, 1=round1, 2=round2)
        'ALTER TABLE Patrol_Team_Rotation ADD COLUMN IF NOT EXISTS PatrolRound TINYINT NOT NULL DEFAULT 0',
        // Allow AreaID=NULL so we can store "explicit no-patrol" sentinel (PatrolRound=0, AreaID=NULL)
        'ALTER TABLE Patrol_Team_Rotation MODIFY COLUMN AreaID INT DEFAULT NULL',
    ]) { try { await db.query(sql); } catch (_) {} }

    // Note: Patrol_Sessions.SessionID AUTO_INCREMENT cannot be migrated on TiDB clustered index tables.
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

// FIX: was using diskStorage (breaks on Vercel read-only filesystem)
// Now uses Cloudinary storage. Image URLs are stored in DB instead of local paths.
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// ==========================================
// PART 1: Schedule & Stats
// ==========================================

// GET /api/patrol/my-monthly-plan?year=Y&month=M — personal plan for logged-in user
router.get('/my-monthly-plan', async (req, res) => {
    const { year, month } = req.query;
    const employeeId = req.user.id;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
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
        `, [employeeId, year, month]);

        const team = override
            ? { id: override.TeamID, name: override.TeamName, group: override.PatrolGroup, color: override.Color }
            : { id: base.TeamID,     name: base.TeamName,     group: base.PatrolGroup,     color: base.Color };

        // 3. Sessions for effective team this month
        const [sessions] = await db.query(`
            SELECT s.SessionID AS id, s.PatrolDate, s.PatrolRound, s.Status,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  s.TeamID = ? AND YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate
        `, [team.id, year, month]);

        // 4. Required sessions based on PatrolType
        const required = base.PatrolType === 'management'
            ? sessions
            : sessions.filter(s => s.PatrolRound === 2);

        // 5. User attendance this month
        const [attendance] = await db.query(`
            SELECT * FROM Patrol_Attendance
            WHERE  UserID = ? AND YEAR(PatrolDate) = ? AND MONTH(PatrolDate) = ?
        `, [employeeId, year, month]);

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
        `, [year, month, team.id]);

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
                attended: attendance.length,
                attendanceDates,
                roster,
                compliance: {
                    required: required.length,
                    attended: attendance.length,
                    done: attendance.length >= required.length,
                },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/my-yearly-stats?year=Y — yearly patrol stats for logged-in user
router.get('/my-yearly-stats', async (req, res) => {
    const year       = parseInt(req.query.year) || new Date().getFullYear();
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/my-schedule', async (req, res) => {
    try {
        const { month, year } = req.query;
        const [rows] = await db.query(
            'SELECT * FROM Patrol_Sessions WHERE YEAR(PatrolDate) = ? AND MONTH(PatrolDate) = ? ORDER BY PatrolDate ASC',
            [year, month]
        );
        res.json(rows);
    } catch (error) {
        res.json([]);
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
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงสถิติการเข้างานได้' });
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

// ==========================================
// PART 2: Check-in
// ==========================================

router.post('/checkin', async (req, res) => {
    try {
        // ดึงข้อมูลผู้ใช้จาก JWT (req.user) ไม่รับจาก req.body เพื่อป้องกันการปลอมแปลง
        const UserID   = req.user.id;
        const UserName = req.user.name;
        const TeamName = req.user.team || '';
        const Notes     = req.body.Notes?.trim() || null;
        const Area      = req.body.Area?.trim()  || null;
        const ALLOWED_PATROL_TYPES = ['normal', 'compensation', 'Re-inspection'];
        const PatrolType = ALLOWED_PATROL_TYPES.includes(req.body.PatrolType) ? req.body.PatrolType : 'normal';
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
        if (patrolDate) {
            await db.query(
                'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, Notes, Area, PatrolType, PatrolDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [UserID, UserName, TeamName, currentWeek, Notes, Area, PatrolType, patrolDate]
            );
        } else {
            await db.query(
                'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, Notes, Area, PatrolType) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [UserID, UserName, TeamName, currentWeek, Notes, Area, PatrolType]
            );
        }

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
            },
        });
    } catch (err) {
        console.error(err);
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
    try {
        const data  = req.body;
        const files = req.files || {};
        // FIX: was returning local /uploads/ path (unusable on Vercel) — now returns Cloudinary URL
        const getUrl = (fieldName) => files[fieldName] ? files[fieldName][0].path : null;

        if (data.ActionType === 'OPEN') {
            await db.query(
                `INSERT INTO Patrol_Issues
                 (DateFound, FoundByTeam, Area, ResponsibleDept, ResponsibleUnit, HazardType, MachineName, HazardDescription, \`Rank\`, DueDate, BeforeImage, CurrentStatus, ReporterID)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`,
                [data.DateFound, data.FoundByTeam, data.Area,
                 data.ResponsibleDept || null, data.ResponsibleUnit || null,
                 data.HazardType, data.MachineName, data.HazardDescription,
                 data.Rank || null, data.DueDate || null, getUrl('BeforeImage'),
                 req.user.id]
            );
        } else if (data.ActionType === 'TEMP') {
            await db.query(
                `UPDATE Patrol_Issues
                 SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                 WHERE IssueID = ?`,
                [data.TempDescription, getUrl('TempImage'), data.IssueID]
            );
        } else if (data.ActionType === 'CLOSE') {
            if (req.user.role !== 'Admin') {
                return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้นที่ปิดประเด็นได้' });
            }
            await db.query(
                `UPDATE Patrol_Issues
                 SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed'
                 WHERE IssueID = ?`,
                [data.ActionDescription, getUrl('AfterImage'), data.FinishDate, data.IssueID]
            );
        } else if (data.ActionType === 'UPDATE') {
            if (req.user.role !== 'Admin') {
                return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้นที่แก้ไขประเด็นได้' });
            }
            // Combined edit: saves temp + final + section 1 fields in one shot
            // Status: Closed if ActionDescription filled, Temporary if only TempDescription, else Open
            const hasFinal = !!(data.ActionDescription && data.ActionDescription.trim());
            const hasTemp  = !!(data.TempDescription && data.TempDescription.trim());
            const newStatus = hasFinal ? 'Closed' : hasTemp ? 'Temporary' : 'Open';
            const newTempImage  = getUrl('TempImage');
            const newAfterImage = getUrl('AfterImage');
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
        } else {
            return res.status(400).json({ success: false, message: 'ActionType ไม่ถูกต้อง' });
        }

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

// DELETE /api/patrol/issue/:id — Admin only
router.delete('/issue/:id', async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้น' });
    }
    try {
        const [result] = await db.query('DELETE FROM Patrol_Issues WHERE IssueID = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการนี้' });
        }
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/teams — create team
router.post('/teams', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Teams (Name, PatrolGroup, Color) VALUES (?,?,?)',
            [Name, PatrolGroup, Color || '#6366f1']
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/patrol/teams/:id — update team
router.put('/teams/:id', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    try {
        await db.query(
            'UPDATE Patrol_Teams SET Name=?, PatrolGroup=?, Color=? WHERE id=?',
            [Name, PatrolGroup, Color, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/teams/:id — delete team + members
router.delete('/teams/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE TeamID=?', [req.params.id]);
        await db.query('DELETE FROM Patrol_Teams WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/teams/:id/members — add member
router.post('/teams/:id/members', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolType } = req.body;
    if (!EmployeeID || !PatrolType) return res.status(400).json({ success: false, message: 'EmployeeID และ PatrolType จำเป็น' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Team_Members (TeamID, EmployeeID, PatrolType) VALUES (?,?,?)',
            [req.params.id, EmployeeID, PatrolType]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้อยู่ในทีมนี้แล้ว' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/teams/:teamId/members/:memberId — remove member
router.delete('/teams/:teamId/members/:memberId', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE id=? AND TeamID=?',
            [req.params.memberId, req.params.teamId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        `, [year]);
        res.json({ success: true, base, monthly });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
            await conn.query(`
                INSERT INTO Patrol_Member_Rotation (EmployeeID, TeamID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE TeamID=VALUES(TeamID)
            `, [EmployeeID, TeamID, Year, Month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { conn.release(); }
});

// GET /api/patrol/monthly-report?year=Y&month=M — monthly grid report (all teams + members)
router.get('/monthly-report', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
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
        `, [year, month]);

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
        `, [year, month]);

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
        res.json({ success: true, data: teams, year: parseInt(year), month: parseInt(month) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/member-schedule?year=Y — full annual schedule per member
router.get('/member-schedule', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
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
            'SELECT EmployeeID, TeamID, Month FROM Patrol_Member_Rotation WHERE Year = ?', [year]
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
        `, [year]);

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

        res.json({ success: true, data, year: parseInt(year) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 8: Area Rotation
// ==========================================

// GET /api/patrol/rotation?year=&month= — rotation ของเดือน (all teams)
router.get('/rotation', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
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
        `, [year, month]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
            // Delete all existing round records for this team/month
            await conn.query(
                'DELETE FROM Patrol_Team_Rotation WHERE TeamID=? AND Year=? AND Month=?',
                [TeamID, Year, Month]
            );
            if (!r1 && !r2) {
                // Explicit "ไม่มีเดิน" sentinel — AreaID=NULL, PatrolRound=0
                // This lets frontend distinguish "explicitly no patrol" from "never configured"
                await conn.query(
                    'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,NULL,?,?,0)',
                    [TeamID, Year, Month]
                );
                saved++;
            } else {
                if (r1) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,1)',
                        [TeamID, r1, Year, Month]
                    );
                    saved++;
                }
                if (r2) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,2)',
                        [TeamID, r2, Year, Month]
                    );
                    saved++;
                }
            }
        }
        await conn.commit();
        res.json({ success: true, saved });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
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
        `, [year, month]);

        if (rotations.length === 0)
            return res.status(400).json({ success: false, message: 'ยังไม่มีตารางหมุนเวียนของเดือนนี้ หรือทุกทีมถูกตั้งเป็น "ไม่มีเดิน" กรุณาตั้งค่า Rotation ก่อน' });

        // 2. หาวันพุธทั้งหมดในเดือน (เรียงลำดับ)
        const wednesdays = getWednesdaysInMonth(parseInt(year), parseInt(month));
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/monthly-summary?year=&month= — สรุปรายเดือนสำหรับแสดงใน patrol page
router.get('/monthly-summary', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        const [sessions] = await db.query(`
            SELECT s.*, s.SessionID AS id, s.PatrolDate AS ScheduledDate,
                   t.Color AS TeamColor, a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate, s.TeamID
        `, [year, month]);
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/patrol/sessions/:id — แก้ไขวันที่ / area / status
router.put('/sessions/:id', isAdmin, async (req, res) => {
    const { PatrolDate, AreaID, Status } = req.body;
    if (!PatrolDate && !AreaID && !Status)
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
    try {
        const sets  = [];
        const vals  = [];
        if (PatrolDate) { sets.push('PatrolDate = ?'); vals.push(PatrolDate); }
        if (AreaID)     { sets.push('AreaID = ?');     vals.push(AreaID); }
        if (Status)     { sets.push('Status = ?');     vals.push(Status); }
        vals.push(req.params.id);
        const [result] = await db.query(
            `UPDATE Patrol_Sessions SET ${sets.join(', ')} WHERE SessionID = ?`, vals
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'แก้ไข session เรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/sessions/:id — ลบ session (Admin)
router.delete('/sessions/:id', isAdmin, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM Patrol_Sessions WHERE SessionID = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'ลบ session เรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        const [attendance] = await db.query(`
            SELECT UserID, COUNT(*) AS Attended
            FROM Patrol_Attendance
            WHERE YEAR(PatrolDate) = ?
            GROUP BY UserID
        `, [year]);
        const attendMap = {};
        attendance.forEach(a => { attendMap[a.UserID] = parseInt(a.Attended); });

        const result = members.map(m => {
            const attended = attendMap[m.EmployeeID] || 0;
            const total    = m.TargetPerYear;
            const percent  = total > 0 ? Math.round((attended / total) * 100) : 0;
            return { RosterID: m.RosterID, EmployeeID: m.EmployeeID, Name: m.Name, Position: m.Position, Department: m.Department, TargetPerYear: total, Year: year, Total: total, Attended: attended, Percent: percent };
        });

        const grandTotal    = result.reduce((s, r) => s + r.Total, 0);
        const grandAttended = result.reduce((s, r) => s + r.Attended, 0);
        const grandPercent  = grandTotal > 0 ? Math.round((grandAttended / grandTotal) * 100) : 0;

        const [latest] = await db.query(
            'SELECT MAX(PatrolDate) AS LatestDate FROM Patrol_Attendance WHERE YEAR(PatrolDate) = ?', [year]
        );

        res.json({
            success: true,
            data: {
                members: result,
                summary: { totalSessions: grandTotal, totalAttended: grandAttended, percent: grandPercent, latestDate: latest[0]?.LatestDate || null, year },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        if (!emp || !emp.IsSupervisorPatrol) {
            return res.json({ success: true, data: { isSupervisorPatrol: false, checkins: [] } });
        }
        const [checkins] = await db.query(
            `SELECT * FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ? AND Month = ? ORDER BY CheckinDate ASC`,
            [empId, year, month]);
        res.json({ success: true, data: { isSupervisorPatrol: true, position: emp.Position, checkins, target: 2 } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/self-checkin', async (req, res) => {
    const empId = req.user.id;
    const { CheckinDate, Location, Notes } = req.body;
    if (!CheckinDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    const d = new Date(CheckinDate);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try {
        const [[emp]] = await db.query(
            `SELECT mp.IsSupervisorPatrol FROM Employees e
             LEFT JOIN Master_Positions mp ON mp.Name = e.Position
             WHERE e.EmployeeID = ?`, [empId]);
        if (!emp?.IsSupervisorPatrol) {
            return res.status(403).json({ success: false, message: 'ตำแหน่งของคุณไม่ได้กำหนดให้เดิน Self-Patrol' });
        }
        const [result] = await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month) VALUES (?,?,?,?,?,?)`,
            [empId, CheckinDate, Location || null, Notes || null, year, month]);
        res.json({ success: true, message: 'บันทึกการเดินตรวจสำเร็จ', id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        const [checkins] = await db.query(
            `SELECT EmployeeID, COUNT(*) AS Attended FROM Patrol_Self_Checkin WHERE Year = ? GROUP BY EmployeeID`,
            [year]
        );
        const checkinMap = {};
        checkins.forEach(c => { checkinMap[c.EmployeeID] = parseInt(c.Attended); });

        const data = members.map(m => ({
            ...m,
            attended: checkinMap[m.EmployeeID] || 0,
            target:   m.TargetPerYear,
            percent:  m.TargetPerYear > 0 ? Math.min(Math.round(((checkinMap[m.EmployeeID] || 0) / m.TargetPerYear) * 100), 100) : 0,
        }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/roster/:id — Admin only: remove from roster
router.delete('/roster/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Roster WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบออกจากรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/my-missed-sessions?year=Y — sessions ที่ user ควรเดินแต่ยังไม่มีบันทึก (สำหรับ เดินซ่อม dropdown)
router.get('/my-missed-sessions', async (req, res) => {
    const employeeId = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        // 1. ตรวจสอบ PatrolType ของ user (management = all rounds, others = round 2 only)
        const [[base]] = await db.query(
            `SELECT tm.PatrolType, tm.TeamID FROM Patrol_Team_Members tm WHERE tm.EmployeeID = ? LIMIT 1`,
            [employeeId]
        );
        if (!base) return res.json({ success: true, data: [] }); // ไม่ได้อยู่ในทีม

        // 2. ดึง sessions ในทีมที่ผ่านมาแล้ว และ user ยังไม่มีบันทึก attendance ตรงวันนั้น
        const roundFilter = base.PatrolType === 'management' ? '' : 'AND s.PatrolRound = 2';
        const [rows] = await db.query(`
            SELECT s.SessionID AS id, s.PatrolDate, s.PatrolRound,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  s.TeamID = ?
              AND  YEAR(s.PatrolDate) = ?
              AND  s.PatrolDate < NOW()
              ${roundFilter}
              AND  NOT EXISTS (
                  SELECT 1 FROM Patrol_Attendance pa
                  WHERE pa.UserID = ? AND DATE(pa.PatrolDate) = DATE(s.PatrolDate)
              )
            ORDER BY s.PatrolDate DESC
        `, [base.TeamID, year, employeeId]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/supervisor-checkins?employeeId=X&year=Y — รายการ Self-Patrol รายบุคคล (admin/modal view)
router.get('/supervisor-checkins', async (req, res) => {
    const { employeeId, year: yearStr } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ employeeId' });
    const year = parseInt(yearStr) || new Date().getFullYear();
    try {
        const [rows] = await db.query(
            `SELECT id, CheckinDate, Location, Notes, Year, Month
             FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?
             ORDER BY CheckinDate DESC`,
            [employeeId, year]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 9: Admin Record Management
// ==========================================

// POST /api/patrol/admin-record — Admin เพิ่มรายการเดินตรวจให้สมาชิกคนใดก็ได้ (Patrol_Attendance)
router.post('/admin-record', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolDate, PatrolType, Area, Notes } = req.body;
    if (!EmployeeID || !PatrolDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ PatrolDate' });
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
        await db.query(
            `INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, PatrolDate, PatrolType, Area, Notes, RecordedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [EmployeeID, emp.EmployeeName, emp.TeamName || '', week,
             dateStr, PatrolType || 'normal', Area || null, Notes || null, req.user.id]
        );
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/admin-record/:id — Admin ลบรายการเดินตรวจ (Patrol_Attendance)
router.delete('/admin-record/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/admin-record/supervisor — Admin เพิ่มรายการ Self-Patrol ให้หัวหน้า (Patrol_Self_Checkin)
router.post('/admin-record/supervisor', isAdmin, async (req, res) => {
    const { EmployeeID, CheckinDate, Location, Notes } = req.body;
    if (!EmployeeID || !CheckinDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ CheckinDate' });
    try {
        const [[emp]] = await db.query('SELECT EmployeeName FROM Employees WHERE EmployeeID = ?', [EmployeeID]);
        if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        const d = new Date(CheckinDate);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'CheckinDate ไม่ถูกต้อง' });
        await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [EmployeeID, CheckinDate, Location || null, Notes || null, d.getFullYear(), d.getMonth() + 1]
        );
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/admin-record/supervisor/:id — Admin ลบรายการ Self-Patrol (Patrol_Self_Checkin)
router.delete('/admin-record/supervisor/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
