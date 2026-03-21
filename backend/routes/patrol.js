// backend/routes/patrol.js
// Auth is applied at mount level: app.use('/api/patrol', authenticateToken, patrolRoutes)
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage, fileFilter } = require('../cloudinary');

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
    try {
        const [bySection] = await db.query(`
            SELECT
                Area AS Section,
                COUNT(CASE WHEN CurrentStatus = 'Closed' THEN 1 END) AS Achieved,
                COUNT(CASE WHEN CurrentStatus != 'Closed' THEN 1 END) AS OnProcess
            FROM Patrol_Issues
            GROUP BY Area
            ORDER BY Achieved DESC
        `);
        const [byRank] = await db.query(`
            SELECT HazardType AS Rank, COUNT(*) AS Count
            FROM Patrol_Issues
            GROUP BY HazardType
            ORDER BY Count DESC
        `);
        res.json({ bySection, byRank });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูล dashboard ได้' });
    }
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
        const currentWeek = getWeekNumber(new Date());
        await db.query(
            'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber) VALUES (?, ?, ?, ?)',
            [UserID, UserName, TeamName, currentWeek]
        );

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
        res.json({ success: true, issues });
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
                 (DateFound, FoundByTeam, Area, ResponsibleDept, HazardType, MachineName, HazardDescription, BeforeImage, CurrentStatus)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
                [data.DateFound, data.FoundByTeam, data.Area, data.ResponsibleDept,
                 data.HazardType, data.MachineName, data.HazardDescription, getUrl('BeforeImage')]
            );
        } else if (data.ActionType === 'TEMP') {
            await db.query(
                `UPDATE Patrol_Issues
                 SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                 WHERE IssueID = ?`,
                [data.TempDescription, getUrl('TempImage'), data.IssueID]
            );
        } else if (data.ActionType === 'CLOSE') {
            await db.query(
                `UPDATE Patrol_Issues
                 SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed'
                 WHERE IssueID = ?`,
                [data.ActionDescription, getUrl('AfterImage'), data.FinishDate, data.IssueID]
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
router.post('/teams', async (req, res) => {
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
router.put('/teams/:id', async (req, res) => {
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
router.delete('/teams/:id', async (req, res) => {
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
                   e.FirstName, e.LastName, e.Department, e.Position
            FROM   Patrol_Team_Members m
            LEFT JOIN Employees e ON e.EmployeeID = m.EmployeeID
            WHERE  m.TeamID = ?
            ORDER BY m.PatrolType DESC, e.FirstName
        `, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/teams/:id/members — add member
router.post('/teams/:id/members', async (req, res) => {
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
router.delete('/teams/:teamId/members/:memberId', async (req, res) => {
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
// PART 7: Rotation
// ==========================================

// GET /api/patrol/rotation?year=&month= — rotation ของเดือน (all teams)
router.get('/rotation', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        const [rows] = await db.query(`
            SELECT r.*, t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            JOIN   Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
            ORDER BY t.id
        `, [year, month]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/rotation — upsert rotation (array of {TeamID, AreaID, Year, Month})
router.post('/rotation', async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array ของ rotation' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        for (const { TeamID, AreaID, Year, Month } of items) {
            await conn.query(`
                INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE AreaID=VALUES(AreaID)
            `, [TeamID, AreaID, Year, Month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
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
router.post('/generate-sessions', async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });

    try {
        // 1. ดึง rotation + teams ของเดือนนี้
        const [rotations] = await db.query(`
            SELECT r.TeamID, r.AreaID,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            JOIN   Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
        `, [year, month]);

        if (rotations.length === 0)
            return res.status(400).json({ success: false, message: 'ยังไม่มีตารางหมุนเวียนของเดือนนี้ กรุณาตั้งค่า Rotation ก่อน' });

        // 2. หาวันพุธทั้งหมดในเดือน (เรียงลำดับ)
        const wednesdays = getWednesdaysInMonth(parseInt(year), parseInt(month));
        // wednesdays[0]=พุธ1, [1]=พุธ2, [2]=พุธ3, [3]=พุธ4
        // Group A → [0],[2] (พุธที่ 1 & 3)
        // Group B → [1],[3] (พุธที่ 2 & 4)

        const groupDates = {
            A: [wednesdays[0], wednesdays[2]].filter(Boolean),
            B: [wednesdays[1], wednesdays[3]].filter(Boolean),
        };

        const conn = await db.getConnection();
        let created = 0;
        try {
            await conn.beginTransaction();
            for (const rot of rotations) {
                const dates = groupDates[rot.PatrolGroup] || [];
                for (let i = 0; i < dates.length; i++) {
                    const dateStr = dates[i]; // 'YYYY-MM-DD'
                    const round   = i + 1;    // 1 หรือ 2

                    // ตรวจว่ามี session นี้แล้วหรือยัง (ป้องกัน duplicate)
                    const [exist] = await conn.query(
                        'SELECT id FROM Patrol_Sessions WHERE ScheduledDate=? AND TeamID=?',
                        [dateStr, rot.TeamID]
                    );
                    if (exist.length > 0) continue;

                    await conn.query(`
                        INSERT INTO Patrol_Sessions
                            (ScheduledDate, TeamName, TeamID, AreaID, PatrolRound, Status)
                        VALUES (?,?,?,?,?,'Pending')
                    `, [dateStr, rot.TeamName, rot.TeamID, rot.AreaID, round]);
                    created++;
                }
            }
            await conn.commit();
            res.json({ success: true, created, message: `สร้าง ${created} sessions สำเร็จ` });
        } catch (err) {
            await conn.rollback();
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
            SELECT s.*, t.Color AS TeamColor, a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.ScheduledDate) = ? AND MONTH(s.ScheduledDate) = ?
            ORDER BY s.ScheduledDate, s.TeamID
        `, [year, month]);
        res.json({ success: true, data: sessions });
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

module.exports = router;
