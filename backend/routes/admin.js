// backend/routes/admin.js
// Auth (authenticateToken + isAdmin) applied at mount level in server.js
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const xlsx     = require('xlsx');
const bcrypt   = require('bcryptjs');
const db       = require('../db');

const upload = multer({ storage: multer.memoryStorage() });

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_ROLES = ['Admin', 'User', 'Viewer'];

// ─── Audit Log Helper ─────────────────────────────────────────────────────────
async function auditLog(req, action, targetType, targetId, detail) {
    try {
        await db.query(
            `INSERT INTO Admin_AuditLogs (AdminID, AdminName, Action, TargetType, TargetID, Detail, IPAddress)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user?.id   || 'system',
                req.user?.name || 'System',
                action,
                targetType,
                String(targetId || ''),
                detail || null,
                req.ip || null,
            ]
        );
    } catch (_) {
        // ถ้า log ไม่ได้ (table ยังไม่มี) ก็ข้ามไปได้ — ไม่ควร block main flow
    }
}

// =============================================================================
// EMPLOYEES
// =============================================================================

// GET /admin/employees
router.get('/employees', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT EmployeeID, EmployeeName, Department, Team, Role FROM Employees ORDER BY Team, EmployeeName'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/create
router.post('/employee/create', async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Team, Role } = req.body;
    if (!EmployeeID || !EmployeeName) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสและชื่อพนักงาน' });
    }
    const role = ALLOWED_ROLES.includes(Role) ? Role : 'User';
    try {
        const [existing] = await db.query('SELECT EmployeeID FROM Employees WHERE EmployeeID = ?', [EmployeeID]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว' });
        }
        await db.query(
            'INSERT INTO Employees (EmployeeID, EmployeeName, Department, Team, Role) VALUES (?, ?, ?, ?, ?)',
            [EmployeeID, EmployeeName, Department || '', Team || '', role]
        );
        await auditLog(req, 'CREATE_EMPLOYEE', 'Employee', EmployeeID, `ชื่อ: ${EmployeeName}, แผนก: ${Department}, Role: ${role}`);
        res.json({ success: true, message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /admin/employee/:id  (เปลี่ยนจาก POST เพื่อ RESTful)
router.put('/employee/:id', async (req, res) => {
    const { EmployeeName, Department, Team, Role } = req.body;
    const role = ALLOWED_ROLES.includes(Role) ? Role : undefined;
    if (!EmployeeName) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อพนักงาน' });
    }
    try {
        await db.query(
            'UPDATE Employees SET EmployeeName = ?, Department = ?, Team = ?, Role = ? WHERE EmployeeID = ?',
            [EmployeeName, Department || '', Team || '', role || 'User', req.params.id]
        );
        await auditLog(req, 'UPDATE_EMPLOYEE', 'Employee', req.params.id, `ชื่อ: ${EmployeeName}, Role: ${role}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── keep legacy POST route as alias so old frontend code still works ──────────
router.post('/employee/update', async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Team, Role } = req.body;
    const role = ALLOWED_ROLES.includes(Role) ? Role : 'User';
    try {
        await db.query(
            'UPDATE Employees SET EmployeeName = ?, Department = ?, Team = ?, Role = ? WHERE EmployeeID = ?',
            [EmployeeName || '', Department || '', Team || '', role, EmployeeID]
        );
        await auditLog(req, 'UPDATE_EMPLOYEE', 'Employee', EmployeeID, `Role: ${role}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /admin/employee/:id
router.delete('/employee/:id', async (req, res) => {
    try {
        // ดึงชื่อก่อนลบ เพื่อใส่ใน audit
        const [rows] = await db.query('SELECT EmployeeName FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        const name = rows[0]?.EmployeeName || '?';
        await db.query('DELETE FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        await auditLog(req, 'DELETE_EMPLOYEE', 'Employee', req.params.id, `ชื่อ: ${name}`);
        res.json({ success: true, message: 'ลบข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/:id/reset-password
router.post('/employee/:id/reset-password', async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const [result] = await db.query(
            'UPDATE Employees SET Password = ? WHERE EmployeeID = ?',
            [hashed, req.params.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        }
        await auditLog(req, 'RESET_PASSWORD', 'Employee', req.params.id, 'รีเซ็ตรหัสผ่าน');
        res.json({ success: true, message: 'รีเซ็ตรหัสผ่านเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/import  — Excel bulk import
router.post('/employee/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Excel' });
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'ไฟล์ไม่มีข้อมูล' });
        }

        let successCount = 0;
        let errorCount   = 0;

        for (const row of data) {
            const id   = row['EmployeeID'] || row['ID']   || row['รหัสพนักงาน'];
            const name = row['EmployeeName'] || row['Name'] || row['ชื่อ-นามสกุล'];
            const dept = row['Department']   || row['Dept'] || row['แผนก'] || '';
            const team = row['Team']         || row['ทีม']  || '';
            // Whitelist role — reject unknown values, fallback to 'User'
            const rawRole = row['Role'] || row['สิทธิ์'] || '';
            const role    = ALLOWED_ROLES.includes(rawRole) ? rawRole : 'User';

            if (id && name) {
                try {
                    await db.query(
                        `INSERT INTO Employees (EmployeeID, EmployeeName, Department, Team, Role)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                           EmployeeName = VALUES(EmployeeName),
                           Department   = VALUES(Department),
                           Team         = VALUES(Team),
                           Role         = VALUES(Role)`,
                        [id, name, dept, team, role]
                    );
                    successCount++;
                } catch (e) {
                    console.error(`Import error ID ${id}:`, e.message);
                    errorCount++;
                }
            }
        }

        await auditLog(req, 'IMPORT_EMPLOYEES', 'Employee', null, `สำเร็จ ${successCount} / ล้มเหลว ${errorCount}`);
        res.json({ success: true, message: `นำเข้าสำเร็จ ${successCount} รายการ (ล้มเหลว ${errorCount})` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// SCHEDULES
// =============================================================================

// GET /admin/schedules
router.get('/schedules', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Patrol_Schedule ORDER BY ScheduledDate DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/schedule/create  — สร้างทีละวัน
router.post('/schedule/create', async (req, res) => {
    const { ScheduledDate, Teams } = req.body;
    if (!ScheduledDate || !Array.isArray(Teams) || Teams.length === 0) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่และทีม' });
    }
    try {
        for (const team of Teams) {
            await db.query(
                "INSERT INTO Patrol_Schedule (ScheduledDate, TeamName, Status) VALUES (?, ?, 'Pending')",
                [ScheduledDate, team]
            );
        }
        await auditLog(req, 'CREATE_SCHEDULE', 'Schedule', null, `วันที่: ${ScheduledDate}, ทีม: ${Teams.join(', ')}`);
        res.json({ success: true, message: `จัดตารางสำหรับวันที่ ${ScheduledDate} เรียบร้อย` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/schedule/bulk-create  — สร้างหลายวันพร้อมกัน (range / repeat)
router.post('/schedule/bulk-create', async (req, res) => {
    // dates: string[] เช่น ['2026-03-01','2026-03-08','2026-03-15']
    // Teams: string[]
    const { dates, Teams } = req.body;
    if (!Array.isArray(dates) || dates.length === 0 || !Array.isArray(Teams) || Teams.length === 0) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่และทีม' });
    }
    try {
        let created = 0;
        for (const date of dates) {
            for (const team of Teams) {
                await db.query(
                    "INSERT INTO Patrol_Schedule (ScheduledDate, TeamName, Status) VALUES (?, ?, 'Pending')",
                    [date, team]
                );
                created++;
            }
        }
        await auditLog(req, 'BULK_CREATE_SCHEDULE', 'Schedule', null, `${created} รายการ, ${dates.length} วัน`);
        res.json({ success: true, message: `สร้างตารางเวร ${created} รายการ (${dates.length} วัน)` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /admin/schedule/:id
router.delete('/schedule/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Schedule WHERE ScheduleID = ?', [req.params.id]);
        await auditLog(req, 'DELETE_SCHEDULE', 'Schedule', req.params.id, null);
        res.json({ success: true, message: 'ลบรายการเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// AUDIT LOGS
// =============================================================================

// GET /admin/audit-logs?page=1&limit=50&action=&adminId=
router.get('/audit-logs', async (req, res) => {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const action  = req.query.action   || '';
    const adminId = req.query.adminId  || '';

    try {
        let where = 'WHERE 1=1';
        const params = [];
        if (action)  { where += ' AND Action = ?';   params.push(action); }
        if (adminId) { where += ' AND AdminID = ?';  params.push(adminId); }

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM Admin_AuditLogs ${where}`, params
        );
        const [rows] = await db.query(
            `SELECT * FROM Admin_AuditLogs ${where} ORDER BY ActionTime DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        res.json({ success: true, data: rows, total, page, limit });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// DASHBOARD STATS
// =============================================================================

// GET /admin/dashboard-stats
router.get('/dashboard-stats', async (_req, res) => {
    try {
        const [[empRow]]       = await db.query('SELECT COUNT(*) AS total FROM Employees');
        const [[schedRow]]     = await db.query("SELECT COUNT(*) AS total FROM Patrol_Schedule WHERE MONTH(ScheduledDate)=MONTH(NOW()) AND YEAR(ScheduledDate)=YEAR(NOW())");
        const [[pendRow]]      = await db.query("SELECT COUNT(*) AS total FROM Patrol_Schedule WHERE Status='Pending' AND ScheduledDate >= CURDATE()");
        const [[hiyariRow]]    = await db.query('SELECT COUNT(*) AS total FROM HiyariReports WHERE Status != "Closed"').catch(() => [[{ total: 0 }]]);
        const [[kyRow]]        = await db.query('SELECT COUNT(*) AS total FROM KY_Activities WHERE MONTH(ActivityDate)=MONTH(NOW()) AND YEAR(ActivityDate)=YEAR(NOW())').catch(() => [[{ total: 0 }]]);
        const [[fourmRow]]     = await db.query("SELECT COUNT(*) AS total FROM FourM_ChangeNotices WHERE Status='Open'").catch(() => [[{ total: 0 }]]);
        const [[auditRow]]     = await db.query("SELECT COUNT(*) AS total FROM Admin_AuditLogs WHERE DATE(ActionTime)=CURDATE()").catch(() => [[{ total: 0 }]]);

        // dept breakdown
        const [deptRows] = await db.query(
            'SELECT Department, COUNT(*) AS cnt FROM Employees GROUP BY Department ORDER BY cnt DESC LIMIT 10'
        );

        // recent audit (5 items)
        const [recentAudit] = await db.query(
            'SELECT * FROM Admin_AuditLogs ORDER BY ActionTime DESC LIMIT 5'
        ).catch(() => [[]]);

        res.json({
            success: true,
            data: {
                totalEmployees:    empRow.total,
                schedulesThisMonth: schedRow.total,
                pendingSchedules:  pendRow.total,
                openHiyari:        hiyariRow.total,
                kyThisMonth:       kyRow.total,
                openChangeNotices: fourmRow.total,
                auditToday:        auditRow.total,
                deptBreakdown:     deptRows,
                recentAudit,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// SYSTEM HEALTH
// =============================================================================

// GET /admin/system-health
router.get('/system-health', async (_req, res) => {
    const safeCount = async (sql) => {
        try { const [[r]] = await db.query(sql); return r.total ?? r.cnt ?? 0; }
        catch { return null; } // null = table not exist yet
    };

    try {
        const [
            empTotal, deptTotal, teamTotal,
            patrolSessions, patrolIssues,
            hiyariOpen, hiyariTotal,
            kyTotal,
            fourmOpen, fourmTotal,
            manRecords,
            contractorDocs,
            ojtDocs,
            yokotenTopics,
        ] = await Promise.all([
            safeCount('SELECT COUNT(*) AS total FROM Employees'),
            safeCount('SELECT COUNT(*) AS total FROM Master_Departments'),
            safeCount('SELECT COUNT(*) AS total FROM Master_Teams'),
            safeCount('SELECT COUNT(*) AS total FROM Patrol_Sessions'),
            safeCount('SELECT COUNT(*) AS total FROM Patrol_Issues'),
            safeCount("SELECT COUNT(*) AS total FROM HiyariReports WHERE Status != 'Closed'"),
            safeCount('SELECT COUNT(*) AS total FROM HiyariReports'),
            safeCount('SELECT COUNT(*) AS total FROM KY_Activities'),
            safeCount("SELECT COUNT(*) AS total FROM FourM_ChangeNotices WHERE Status='Open'"),
            safeCount('SELECT COUNT(*) AS total FROM FourM_ChangeNotices'),
            safeCount('SELECT COUNT(*) AS total FROM FourM_ManRecords'),
            safeCount('SELECT COUNT(*) AS total FROM Contractor_Documents'),
            safeCount('SELECT COUNT(*) AS total FROM SCW_Documents'),
            safeCount('SELECT COUNT(*) AS total FROM YokotenTopics'),
        ]);

        // Change notices ค้างนาน (> 30 วัน)
        const [staleNotices] = await db.query(
            "SELECT id, NoticeNo, Department, ChangeDate FROM FourM_ChangeNotices WHERE Status='Open' AND DATEDIFF(NOW(), ChangeDate) > 30 ORDER BY ChangeDate ASC LIMIT 10"
        ).catch(() => [[]]);

        // Hiyari ค้างนาน (> 14 วัน)
        const [staleHiyari] = await db.query(
            "SELECT id, Department, ReportDate FROM HiyariReports WHERE Status != 'Closed' AND DATEDIFF(NOW(), ReportDate) > 14 ORDER BY ReportDate ASC LIMIT 10"
        ).catch(() => [[]]);

        res.json({
            success: true,
            data: {
                modules: {
                    employees:    { total: empTotal, depts: deptTotal, teams: teamTotal },
                    patrol:       { sessions: patrolSessions, issues: patrolIssues },
                    hiyari:       { total: hiyariTotal, open: hiyariOpen },
                    ky:           { total: kyTotal },
                    fourm:        { total: fourmTotal, open: fourmOpen, manRecords },
                    contractor:   { docs: contractorDocs },
                    ojt:          { docs: ojtDocs },
                    yokoten:      { topics: yokotenTopics },
                },
                alerts: {
                    staleChangeNotices: staleNotices,
                    staleHiyari,
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
