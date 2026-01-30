const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- 0. Setup Upload (เหมือนเดิม) ---
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
// 🎯 PART 1: ระบบเช็คอิน (Attendance)
// ==========================================

// 1.1 เช็คอิน และ คืนค่าสถิติ + รายชื่อคนมาวันนี้
router.post('/checkin', async (req, res) => {
    try {
        const { UserID, UserName, TeamName } = req.body;
        const currentWeek = getWeekNumber(new Date());

        // A. บันทึกการมาเดิน
        await db.query(
            `INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber) VALUES (?, ?, ?, ?)`,
            [UserID, UserName, TeamName, currentWeek]
        );

        // B. ดึงสถิติส่วนตัว
        const [stats] = await db.query(`
            SELECT COUNT(*) as TotalWalks, MAX(PatrolDate) as LastWalk
            FROM Patrol_Attendance WHERE UserID = ?
        `, [UserID]);

        // C. ดึงสถิติทีม
        const [teamStats] = await db.query(`
            SELECT COUNT(*) as TeamWalks FROM Patrol_Attendance WHERE TeamName = ?
        `, [TeamName]);

        // D. (เพิ่มใหม่) ดึงรายชื่อคนที่มาเช็คอิน "วันนี้" (5 คนล่าสุด)
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
                todayWalkers: todayWalkers // ส่งรายชื่อกลับไป
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 🎯 PART 2: ระบบประเด็น (Issue Feed & Smart Form)
// ==========================================

// 2.1 ดึงรายการประเด็นทั้งหมด (สำหรับหน้า Dashboard/Feed)
router.get('/issues', async (req, res) => {
    try {
        const [issues] = await db.query(`
            SELECT * FROM Patrol_Issues 
            ORDER BY CurrentStatus = 'Open' DESC, UpdatedAt DESC
        `);
        res.json({ success: true, issues });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2.2 บันทึก/อัปเดต ประเด็น (Smart API: Open / Temp / Close)
router.post('/issue/save', upload.fields([
    { name: 'BeforeImage', maxCount: 1 }, 
    { name: 'TempImage', maxCount: 1 },
    { name: 'AfterImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const data = req.body;
        const files = req.files || {};

        // Helper: เอา path รูปออกมา (ถ้ามีการอัปโหลด)
        const getPath = (fieldName) => files[fieldName] ? `/uploads/${files[fieldName][0].filename}` : null;

        if (data.ActionType === 'OPEN') {
            // --- กรณี: เปิดประเด็นใหม่ (INSERT) ---
            const beforeImg = getPath('BeforeImage');
            await db.query(`
                INSERT INTO Patrol_Issues 
                (DateFound, FoundByTeam, Area, ResponsibleDept, HazardType, MachineName, HazardDescription, BeforeImage, CurrentStatus)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open')
            `, [data.DateFound, data.FoundByTeam, data.Area, data.ResponsibleDept, data.HazardType, data.MachineName, data.HazardDescription, beforeImg]);

        } else if (data.ActionType === 'TEMP') {
            // --- กรณี: แก้ไขชั่วคราว (UPDATE) ---
            const tempImg = getPath('TempImage');
            await db.query(`
                UPDATE Patrol_Issues 
                SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                WHERE IssueID = ?
            `, [data.TempDescription, tempImg, data.IssueID]);

        } else if (data.ActionType === 'CLOSE') {
            // --- กรณี: ปิดจบงาน (UPDATE) ---
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

// ฟังก์ชันช่วยหา Week Number
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

module.exports = router;