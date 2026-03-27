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
router.get('/employees', async (_req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role FROM Employees ORDER BY Department, EmployeeName'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/create
router.post('/employee/create', async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Unit, Team, Position, Role } = req.body;
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
            'INSERT INTO Employees (EmployeeID, EmployeeName, Department, Unit, Team, Position, Role) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [EmployeeID, EmployeeName, Department || '', Unit || '', Team || '', Position || '', role]
        );
        await auditLog(req, 'CREATE_EMPLOYEE', 'Employee', EmployeeID, `ชื่อ: ${EmployeeName}, แผนก: ${Department}, หน่วย: ${Unit}, ตำแหน่ง: ${Position}, Role: ${role}`);
        res.json({ success: true, message: 'เพิ่มพนักงานเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /admin/employee/:id  (เปลี่ยนจาก POST เพื่อ RESTful)
router.put('/employee/:id', async (req, res) => {
    const { EmployeeName, Department, Unit, Team, Position, Role } = req.body;
    const role = ALLOWED_ROLES.includes(Role) ? Role : undefined;
    if (!EmployeeName) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อพนักงาน' });
    }
    try {
        await db.query(
            'UPDATE Employees SET EmployeeName = ?, Department = ?, Unit = ?, Team = ?, Position = ?, Role = ? WHERE EmployeeID = ?',
            [EmployeeName, Department || '', Unit || '', Team || '', Position || '', role || 'User', req.params.id]
        );
        await auditLog(req, 'UPDATE_EMPLOYEE', 'Employee', req.params.id, `ชื่อ: ${EmployeeName}, หน่วย: ${Unit}, ตำแหน่ง: ${Position}, Role: ${role}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── keep legacy POST route as alias so old frontend code still works ──────────
router.post('/employee/update', async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Unit, Team, Position, Role } = req.body;
    const role = ALLOWED_ROLES.includes(Role) ? Role : 'User';
    try {
        await db.query(
            'UPDATE Employees SET EmployeeName = ?, Department = ?, Unit = ?, Team = ?, Position = ?, Role = ? WHERE EmployeeID = ?',
            [EmployeeName || '', Department || '', Unit || '', Team || '', Position || '', role, EmployeeID]
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

// GET /admin/employee/import-template-data — master lists for Excel template
router.get('/employee/import-template-data', async (_req, res) => {
    try {
        const [[depts], [positions], [units]] = await Promise.all([
            db.query('SELECT Name FROM Master_Departments ORDER BY Name ASC'),
            db.query('SELECT Name FROM Master_Positions ORDER BY Name ASC'),
            db.query('SELECT name FROM Master_SafetyUnits ORDER BY name ASC'),
        ]);
        res.json({
            success: true,
            departments: depts.map(r => r.Name),
            positions:   positions.map(r => r.Name),
            units:       units.map(r => r.name),
            roles:       ALLOWED_ROLES,
        });
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

        // Fetch master sets for validation
        const [[deptRows], [posRows]] = await Promise.all([
            db.query('SELECT Name FROM Master_Departments'),
            db.query('SELECT Name FROM Master_Positions'),
        ]);
        const deptSet = new Set(deptRows.map(r => r.Name));
        const posSet  = new Set(posRows.map(r => r.Name));

        let successCount = 0;
        let errorCount   = 0;
        const details    = [];   // per-row result for frontend

        for (const row of data) {
            const id   = String(row['EmployeeID'] || row['ID']   || row['รหัสพนักงาน'] || '').trim();
            const name = String(row['EmployeeName'] || row['Name'] || row['ชื่อ-นามสกุล'] || '').trim();
            const dept = String(row['Department']   || row['Dept'] || row['แผนก']   || '').trim();
            const unit = String(row['Unit']         || row['หน่วย']                 || '').trim();
            const pos  = String(row['Position']     || row['ตำแหน่ง']               || '').trim();
            const rawRole = String(row['Role'] || row['สิทธิ์'] || '').trim();
            const role    = ALLOWED_ROLES.includes(rawRole) ? rawRole : 'User';

            if (!id || !name) {
                details.push({ id: id || '—', name: name || '—', status: 'skip', reason: 'ไม่มี EmployeeID หรือ EmployeeName' });
                errorCount++;
                continue;
            }

            // Validate against master (warn but still import)
            const warnings = [];
            if (dept && !deptSet.has(dept)) warnings.push(`Department "${dept}" ไม่ตรง master`);
            if (pos  && !posSet.has(pos))   warnings.push(`Position "${pos}" ไม่ตรง master`);
            if (rawRole && !ALLOWED_ROLES.includes(rawRole)) warnings.push(`Role "${rawRole}" ไม่ถูกต้อง → ใช้ User`);

            try {
                await db.query(
                    `INSERT INTO Employees (EmployeeID, EmployeeName, Department, Unit, Position, Role)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       EmployeeName = VALUES(EmployeeName),
                       Department   = VALUES(Department),
                       Unit         = VALUES(Unit),
                       Position     = VALUES(Position),
                       Role         = VALUES(Role)`,
                    [id, name, dept, unit, pos, role]
                );
                successCount++;
                details.push({ id, name, status: warnings.length ? 'warn' : 'ok', reason: warnings.join(' | ') });
            } catch (e) {
                console.error(`Import error ID ${id}:`, e.message);
                errorCount++;
                details.push({ id, name, status: 'error', reason: e.message });
            }
        }

        await auditLog(req, 'IMPORT_EMPLOYEES', 'Employee', null, `สำเร็จ ${successCount} / ล้มเหลว ${errorCount}`);
        res.json({
            success: true,
            message: `นำเข้าสำเร็จ ${successCount} รายการ (ล้มเหลว ${errorCount})`,
            successCount,
            errorCount,
            warnCount: details.filter(d => d.status === 'warn').length,
            details,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// SCHEDULES
// =============================================================================

// GET /admin/schedules
router.get('/schedules', async (_req, res) => {
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
        const [[schedRow]]     = await db.query("SELECT COUNT(*) AS total FROM Patrol_Sessions WHERE MONTH(ScheduledDate)=MONTH(NOW()) AND YEAR(ScheduledDate)=YEAR(NOW())").catch(() => [[{ total: 0 }]]);
        const [[pendRow]]      = await db.query("SELECT COUNT(*) AS total FROM Patrol_Sessions WHERE Status='Pending' AND ScheduledDate >= CURDATE()").catch(() => [[{ total: 0 }]]);
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

// =============================================================================
// ORGANIZATION — departments + safety units
// =============================================================================

// One-time migration guard
let _orgTablesReady = false;
async function ensureOrgTables() {
    if (_orgTablesReady) return;

    // Add is_safety_core to Master_Departments if missing
    try {
        await db.query('ALTER TABLE Master_Departments ADD COLUMN is_safety_core TINYINT NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists */ }

    // Safety Units table
    await db.query(`
        CREATE TABLE IF NOT EXISTS Master_SafetyUnits (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            name          VARCHAR(100) NOT NULL,
            short_code    VARCHAR(30),
            department_id INT NOT NULL,
            sort_order    INT DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_unit_dept (name, department_id),
            INDEX idx_dept (department_id)
        )
    `);

    _orgTablesReady = true;
}

// ─── GET /admin/org/departments ──────────────────────────────────────────────
router.get('/org/departments', async (_req, res) => {
    try {
        await ensureOrgTables();
        const [rows] = await db.query(`
            SELECT d.id, d.Name, d.is_safety_core,
                   COUNT(u.id) AS unit_count
            FROM   Master_Departments d
            LEFT JOIN Master_SafetyUnits u ON u.department_id = d.id
            GROUP BY d.id, d.Name, d.is_safety_core
            ORDER BY d.Name ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/org/departments/:id — toggle is_safety_core + rename ─────────
router.put('/org/departments/:id', async (req, res) => {
    try {
        await ensureOrgTables();
        const { Name, is_safety_core } = req.body;
        if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผนก' });
        const flag = is_safety_core ? 1 : 0;
        await db.query(
            'UPDATE Master_Departments SET Name=?, is_safety_core=? WHERE id=?',
            [Name, flag, req.params.id]
        );
        await auditLog(req, 'UPDATE_DEPT_ORG', 'Department', req.params.id,
            `Name: ${Name}, is_safety_core: ${flag}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลแผนกสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /admin/org/units  (all) ─────────────────────────────────────────────
router.get('/org/units', async (_req, res) => {
    try {
        await ensureOrgTables();
        const [rows] = await db.query(
            'SELECT * FROM Master_SafetyUnits ORDER BY department_id, sort_order, name ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /admin/org/units/:deptId  (per dept) ────────────────────────────────
router.get('/org/units/:deptId', async (req, res) => {
    try {
        await ensureOrgTables();
        const [rows] = await db.query(
            'SELECT * FROM Master_SafetyUnits WHERE department_id=? ORDER BY sort_order, name ASC',
            [req.params.deptId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /admin/org/units — add unit ────────────────────────────────────────
router.post('/org/units', async (req, res) => {
    try {
        await ensureOrgTables();
        const { name, short_code, department_id, sort_order } = req.body;
        if (!name || !department_id)
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ unit และ department_id' });
        await db.query(
            'INSERT INTO Master_SafetyUnits (name, short_code, department_id, sort_order) VALUES (?,?,?,?)',
            [name, short_code || '', department_id, parseInt(sort_order) || 0]
        );
        await auditLog(req, 'CREATE_SAFETY_UNIT', 'SafetyUnit', name, `dept: ${department_id}`);
        res.json({ success: true, message: 'เพิ่ม Safety Unit สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'ชื่อ unit นี้มีอยู่ใน department แล้ว' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/org/units/:id — edit unit ────────────────────────────────────
router.put('/org/units/:id', async (req, res) => {
    try {
        await ensureOrgTables();
        const { name, short_code, sort_order } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ unit' });
        await db.query(
            'UPDATE Master_SafetyUnits SET name=?, short_code=?, sort_order=? WHERE id=?',
            [name, short_code || '', parseInt(sort_order) || 0, req.params.id]
        );
        await auditLog(req, 'UPDATE_SAFETY_UNIT', 'SafetyUnit', req.params.id, `name: ${name}`);
        res.json({ success: true, message: 'แก้ไข Safety Unit สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /admin/org/units/:id — delete unit ───────────────────────────────
router.delete('/org/units/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM Master_SafetyUnits WHERE id=?', [req.params.id]);
        await auditLog(req, 'DELETE_SAFETY_UNIT', 'SafetyUnit', req.params.id, null);
        res.json({ success: true, message: 'ลบ Safety Unit สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// PERMISSIONS — role matrix + per-user overrides
// =============================================================================

const ALL_PERMISSIONS = [
    'VIEW_DASHBOARD', 'MANAGE_USERS', 'VIEW_REPORT',
    'APPROVE_SAFETY', 'SUBMIT_SAFETY',
];
const ALL_ROLES = ['ADMIN', 'EXECUTIVE', 'MANAGER', 'STAFF', 'SAFETY_OFFICER'];

// Role display labels
const ROLE_LABELS = {
    ADMIN:          'Admin',
    EXECUTIVE:      'Executive',
    MANAGER:        'Manager',
    STAFF:          'Staff',
    SAFETY_OFFICER: 'Safety Officer',
};

let _permTablesReady = false;
async function ensurePermTables() {
    if (_permTablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_RolePermissions (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            role       VARCHAR(50)  NOT NULL,
            permission VARCHAR(80)  NOT NULL,
            granted    TINYINT      NOT NULL DEFAULT 1,
            updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_role_perm (role, permission)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_UserPermissions (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(50) NOT NULL,
            permission  VARCHAR(80) NOT NULL,
            granted     TINYINT     NOT NULL DEFAULT 1,
            updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_perm (employee_id, permission)
        )
    `);

    // Seed defaults: ADMIN gets all; EXECUTIVE gets VIEW_*; MANAGER gets VIEW_* + SUBMIT; STAFF gets SUBMIT; SAFETY_OFFICER gets all except MANAGE_USERS
    const defaults = [
        ['ADMIN',          'VIEW_DASHBOARD', 1],
        ['ADMIN',          'MANAGE_USERS',   1],
        ['ADMIN',          'VIEW_REPORT',    1],
        ['ADMIN',          'APPROVE_SAFETY', 1],
        ['ADMIN',          'SUBMIT_SAFETY',  1],
        ['EXECUTIVE',      'VIEW_DASHBOARD', 1],
        ['EXECUTIVE',      'VIEW_REPORT',    1],
        ['EXECUTIVE',      'APPROVE_SAFETY', 1],
        ['EXECUTIVE',      'MANAGE_USERS',   0],
        ['EXECUTIVE',      'SUBMIT_SAFETY',  0],
        ['MANAGER',        'VIEW_DASHBOARD', 1],
        ['MANAGER',        'VIEW_REPORT',    1],
        ['MANAGER',        'SUBMIT_SAFETY',  1],
        ['MANAGER',        'APPROVE_SAFETY', 0],
        ['MANAGER',        'MANAGE_USERS',   0],
        ['STAFF',          'VIEW_DASHBOARD', 1],
        ['STAFF',          'SUBMIT_SAFETY',  1],
        ['STAFF',          'VIEW_REPORT',    0],
        ['STAFF',          'APPROVE_SAFETY', 0],
        ['STAFF',          'MANAGE_USERS',   0],
        ['SAFETY_OFFICER', 'VIEW_DASHBOARD', 1],
        ['SAFETY_OFFICER', 'VIEW_REPORT',    1],
        ['SAFETY_OFFICER', 'APPROVE_SAFETY', 1],
        ['SAFETY_OFFICER', 'SUBMIT_SAFETY',  1],
        ['SAFETY_OFFICER', 'MANAGE_USERS',   0],
    ];
    for (const [role, perm, granted] of defaults) {
        await db.query(
            'INSERT IGNORE INTO Admin_RolePermissions (role, permission, granted) VALUES (?,?,?)',
            [role, perm, granted]
        );
    }

    _permTablesReady = true;
}

// ─── GET /admin/permissions/matrix ───────────────────────────────────────────
router.get('/permissions/matrix', async (_req, res) => {
    try {
        await ensurePermTables();
        const [rows] = await db.query('SELECT role, permission, granted FROM Admin_RolePermissions');
        // Shape: { ADMIN: { VIEW_DASHBOARD: 1, ... }, ... }
        const matrix = {};
        ALL_ROLES.forEach(r => {
            matrix[r] = {};
            ALL_PERMISSIONS.forEach(p => { matrix[r][p] = 0; });
        });
        rows.forEach(row => {
            if (matrix[row.role]) matrix[row.role][row.permission] = row.granted;
        });
        res.json({ success: true, data: { matrix, roles: ALL_ROLES, permissions: ALL_PERMISSIONS, roleLabels: ROLE_LABELS } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/permissions/matrix — bulk update ──────────────────────────────
router.put('/permissions/matrix', async (req, res) => {
    try {
        await ensurePermTables();
        const { role, permission, granted } = req.body;
        if (!ALL_ROLES.includes(role) || !ALL_PERMISSIONS.includes(permission))
            return res.status(400).json({ success: false, message: 'role หรือ permission ไม่ถูกต้อง' });
        await db.query(
            'INSERT INTO Admin_RolePermissions (role, permission, granted) VALUES (?,?,?) ON DUPLICATE KEY UPDATE granted=VALUES(granted)',
            [role, permission, granted ? 1 : 0]
        );
        await auditLog(req, 'UPDATE_PERMISSION', 'RolePermission', `${role}:${permission}`,
            `granted: ${granted ? 1 : 0}`);
        res.json({ success: true, message: 'อัปเดต permission สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
