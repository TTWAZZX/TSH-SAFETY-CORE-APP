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
        const { UserID, UserName, TeamName } = req.body;
        if (!UserID || !UserName) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ UserID และ UserName' });
        }
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
// Helpers
// ==========================================

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = router;
