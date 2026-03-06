// backend/routes/patrol.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // เชื่อมต่อ TiDB
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- 0. Setup Upload ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, 'patrol-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ==========================================
// 🎯 PART 1: ข้อมูลตารางและสถิติเบื้องต้น
// ==========================================

// 1.1 GET: ดึงตารางเดินตรวจ (แก้ 404 Not Found)
router.get('/my-schedule', async (req, res) => {
    try {
        const { employeeId, month, year } = req.query;
        const sql = `
            SELECT * FROM Patrol_Sessions 
            WHERE YEAR(PatrolDate) = ? AND MONTH(PatrolDate) = ?
            ORDER BY PatrolDate ASC
        `;
        try {
            const [rows] = await db.query(sql, [year, month]);
            res.json(rows);
        } catch (e) {
            res.json([]); 
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 1.2 GET: ดึงสถิติการเข้างานรายบุคคล (แก้ 404 Not Found)
router.get('/attendance-stats', async (req, res) => {
    try {
        // ส่งค่า Mock ไปก่อนเพื่อให้ Frontend คำนวณ % ได้
        res.json([
            { Name: 'Sattaya Wongchomphu', Total: 12, Percent: 85 },
            { Name: 'Staff 1', Total: 10, Percent: 70 }
        ]);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 🆕 1.3 GET: ข้อมูลสำหรับ Dashboard (กราฟวงกลม + ตารางแผนก)
router.get('/dashboard-stats', async (req, res) => {
    try {
        // ส่งข้อมูลจำลองไปก่อน เพื่อให้กราฟ Rank และตาราง Section แสดงผล
        res.json({
            bySection: [
                { Section: 'Production 1', Achieved: 15, OnProcess: 3 },
                { Section: 'Warehouse', Achieved: 8, OnProcess: 1 },
                { Section: 'Office', Achieved: 12, OnProcess: 0 }
            ],
            byRank: [
                { Rank: 'A', Count: 5 },
                { Rank: 'B', Count: 12 },
                { Rank: 'C', Count: 8 }
            ]
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 🎯 PART 2: ระบบเช็คอิน (Attendance)
// ==========================================

router.post('/checkin', async (req, res) => {
    try {
        const { UserID, UserName, TeamName } = req.body;
        const currentWeek = getWeekNumber(new Date());

        await db.query(
            `INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber) VALUES (?, ?, ?, ?)`,
            [UserID, UserName, TeamName, currentWeek]
        );

        const [stats] = await db.query(`
            SELECT COUNT(*) as TotalWalks, MAX(PatrolDate) as LastWalk
            FROM Patrol_Attendance WHERE UserID = ?
        `, [UserID]);

        const [teamStats] = await db.query(`
            SELECT COUNT(*) as TeamWalks FROM Patrol_Attendance WHERE TeamName = ?
        `, [TeamName]);

        const [todayWalkers] = await db.query(`
            SELECT UserName, PatrolDate FROM Patrol_Attendance 
            WHERE DATE(PatrolDate) = CURDATE()
            ORDER BY PatrolDate DESC LIMIT 5
        `);

        res.json({
            success: true,
            message: 'เช็คอินสำเร็จ!',
            data: {
                totalWalks: stats[0].TotalWalks,
                teamWalks: teamStats[0].TeamWalks || 0,
                todayWalkers: todayWalkers
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 🎯 PART 3: ระบบประเด็น (Issue Feed)
// ==========================================

// 3.1 ดึงรายการประเด็นทั้งหมด
router.get('/issues', async (req, res) => {
    try {
        // ✅ แก้ไข: เปลี่ยน id เป็น IssueID ให้ตรงกับชื่อคอลัมน์ใน TiDB
        const [issues] = await db.query(`
            SELECT * FROM Patrol_Issues 
            ORDER BY IssueID DESC
        `);
        res.json({ success: true, issues });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3.2 บันทึก/อัปเดต ประเด็น
router.post('/issue/save', upload.fields([
    { name: 'BeforeImage', maxCount: 1 }, 
    { name: 'TempImage', maxCount: 1 },
    { name: 'AfterImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files || {};
        const getPath = (fieldName) => files[fieldName] ? `/uploads/${files[fieldName][0].filename}` : null;

        if (data.ActionType === 'OPEN') {
            const beforeImg = getPath('BeforeImage');
            await db.query(`
                INSERT INTO Patrol_Issues 
                (DateFound, FoundByTeam, Area, ResponsibleDept, HazardType, MachineName, HazardDescription, BeforeImage, CurrentStatus)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open')
            `, [data.DateFound, data.FoundByTeam, data.Area, data.ResponsibleDept, data.HazardType, data.MachineName, data.HazardDescription, beforeImg]);

        } else if (data.ActionType === 'TEMP') {
            const tempImg = getPath('TempImage');
            await db.query(`
                UPDATE Patrol_Issues 
                SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                WHERE IssueID = ?
            `, [data.TempDescription, tempImg, data.IssueID]);

        } else if (data.ActionType === 'CLOSE') {
            const afterImg = getPath('AfterImage');
            await db.query(`
                UPDATE Patrol_Issues 
                SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed'
                WHERE IssueID = ?
            `, [data.ActionDescription, afterImg, data.FinishDate, data.IssueID]);
        }

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

module.exports = router;