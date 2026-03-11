// ส่วนบนสุดของไฟล์ (เพิ่ม import)
const multer = require('multer');
const xlsx = require('xlsx');

// ตั้งค่า Upload (เก็บลง Memory ชั่วคราวเพื่ออ่านค่า)
const upload = multer({ storage: multer.memoryStorage() });
const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. ดึงรายชื่อพนักงานทั้งหมด (เรียงตาม Team)
router.get('/employees', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM Employees ORDER BY Team, EmployeeName");
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. อัปเดตข้อมูลพนักงาน (เช่น ย้ายทีม, เปลี่ยน Role)
router.post('/employee/update', async (req, res) => {
    try {
        const { EmployeeID, Team, Role } = req.body;
        await db.query("UPDATE Employees SET Team = ?, Role = ? WHERE EmployeeID = ?", [Team, Role, EmployeeID]);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. ดึงตารางเวรที่มีอยู่ (Schedule)
router.get('/schedules', async (req, res) => {
    try {
        // ดึงข้อมูลตารางเวร เรียงจากใหม่ไปเก่า
        const [rows] = await db.query("SELECT * FROM Patrol_Schedule ORDER BY ScheduledDate DESC");
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. สร้าง/จัดตารางเวรใหม่ (Assign Teams to Date)
router.post('/schedule/create', async (req, res) => {
    try {
        const { ScheduledDate, Teams } = req.body; 
        // Teams จะส่งมาเป็น Array เช่น ['Safety Team', 'Production A', 'HR']

        // วนลูปสร้างทีละทีม
        for (const team of Teams) {
            await db.query(
                "INSERT INTO Patrol_Schedule (ScheduledDate, TeamName, Status) VALUES (?, ?, 'Pending')",
                [ScheduledDate, team]
            );
        }
        res.json({ success: true, message: `จัดตารางสำหรับวันที่ ${ScheduledDate} เรียบร้อย` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. ลบตารางเวร (เผื่อจัดผิด)
router.delete('/schedule/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM Patrol_Schedule WHERE ScheduleID = ?", [req.params.id]);
        res.json({ success: true, message: 'ลบรายการเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. เพิ่มพนักงานใหม่ (Create Employee)
router.post('/employee/create', async (req, res) => {
    try {
        const { EmployeeID, EmployeeName, Department, Team, Role } = req.body;
        
        // เช็คก่อนว่า ID ซ้ำไหม
        const [existing] = await db.query("SELECT * FROM Employees WHERE EmployeeID = ?", [EmployeeID]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว' });
        }

        await db.query(
            "INSERT INTO Employees (EmployeeID, EmployeeName, Department, Team, Role) VALUES (?, ?, ?, ?, ?)",
            [EmployeeID, EmployeeName, Department, Team, Role || 'User']
        );
        res.json({ success: true, message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 7. ลบพนักงาน (Delete Employee)
router.delete('/employee/:id', async (req, res) => {
    try {
        await db.query("DELETE FROM Employees WHERE EmployeeID = ?", [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. นำเข้าพนักงานจาก Excel (Import)
router.post('/employee/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Excel' });

        // 1. อ่านไฟล์ Excel จาก Memory
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // 2. แปลงเป็น JSON Data
        const data = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'ไฟล์ไม่มีข้อมูล' });
        }

        // 3. วนลูปบันทึกลง Database
        let successCount = 0;
        let errorCount = 0;

        for (const row of data) {
            // Mapping ชื่อหัวตารางใน Excel ให้ตรงกับตัวแปร (เผื่อ User พิมพ์มาไม่เป๊ะ)
            const id = row['EmployeeID'] || row['ID'] || row['รหัสพนักงาน'];
            const name = row['EmployeeName'] || row['Name'] || row['ชื่อ-นามสกุล'];
            const dept = row['Department'] || row['Dept'] || row['แผนก'];
            const team = row['Team'] || row['ทีม'];
            const role = row['Role'] || row['สิทธิ์'] || 'User'; // Default เป็น User

            if (id && name) {
                try {
                    // ใช้ INSERT ... ON DUPLICATE KEY UPDATE (ถ้ามี ID ซ้ำ ให้ทับข้อมูลเดิม)
                    await db.query(`
                        INSERT INTO Employees (EmployeeID, EmployeeName, Department, Team, Role) 
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                        EmployeeName = VALUES(EmployeeName), 
                        Department = VALUES(Department), 
                        Team = VALUES(Team), 
                        Role = VALUES(Role)
                    `, [id, name, dept || '', team || '', role]);
                    successCount++;
                } catch (err) {
                    console.error(`Error importing ID ${id}:`, err.message);
                    errorCount++;
                }
            }
        }

        res.json({ 
            success: true, 
            message: `นำเข้าสำเร็จ ${successCount} รายการ (ล้มเหลว ${errorCount})` 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;