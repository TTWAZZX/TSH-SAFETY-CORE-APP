// backend/routes/master.js
// Auth (authenticateToken) is applied at mount level in server.js
// Write operations (POST, DELETE) additionally require isAdmin
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { isAdmin } = require('../middleware/auth');

// ==========================================
// 🏢 DEPARTMENTS
// ==========================================

router.get('/departments', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Departments ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลแผนกได้' });
    }
});

router.post('/departments', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผนก' });
    try {
        await pool.query('INSERT INTO Master_Departments (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'เพิ่มแผนกสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ชื่อแผนกนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มแผนกได้' });
    }
});

router.put('/departments/:id', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผนก' });
    try {
        await pool.query('UPDATE Master_Departments SET Name = ? WHERE id = ?', [Name, req.params.id]);
        res.json({ success: true, message: 'แก้ไขชื่อแผนกสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'ชื่อแผนกนี้มีอยู่แล้ว' });
        res.status(500).json({ success: false, message: 'ไม่สามารถแก้ไขข้อมูลได้' });
    }
});

router.delete('/departments/:id', isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Departments WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ==========================================
// 👷 TEAMS
// ==========================================

router.get('/teams', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Teams ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลทีมได้' });
    }
});

router.post('/teams', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อทีม' });
    try {
        await pool.query('INSERT INTO Master_Teams (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'เพิ่มทีมสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ชื่อทีมนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มทีมได้' });
    }
});

router.put('/teams/:id', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อทีม' });
    try {
        await pool.query('UPDATE Master_Teams SET Name = ? WHERE id = ?', [Name, req.params.id]);
        res.json({ success: true, message: 'แก้ไขชื่อทีมสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'ชื่อทีมนี้มีอยู่แล้ว' });
        res.status(500).json({ success: false, message: 'ไม่สามารถแก้ไขข้อมูลได้' });
    }
});

router.delete('/teams/:id', isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Teams WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ==========================================
// 🔑 ROLES
// ==========================================

router.get('/roles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Roles ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูล roles ได้' });
    }
});

router.post('/roles', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'Missing Name' });
    try {
        await pool.query('INSERT INTO Master_Roles (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'Added Role' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Duplicate Role' });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่ม role ได้' });
    }
});

router.put('/roles/:id', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ Role' });
    try {
        await pool.query('UPDATE Master_Roles SET Name = ? WHERE id = ?', [Name, req.params.id]);
        res.json({ success: true, message: 'แก้ไข Role สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Role นี้มีอยู่แล้ว' });
        res.status(500).json({ success: false, message: 'ไม่สามารถแก้ไขข้อมูลได้' });
    }
});

router.delete('/roles/:id', isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Roles WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ==========================================
// 👔 POSITIONS
// ==========================================

router.get('/positions', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Positions ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูล positions ได้' });
    }
});

router.post('/positions', isAdmin, async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'Missing Name' });
    try {
        await pool.query('INSERT INTO Master_Positions (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'Operation successful' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ (Duplicate Entry)' });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มข้อมูลได้' });
    }
});

router.put('/positions/:id', isAdmin, async (req, res) => {
    const { Name, IsSupervisorPatrol } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อตำแหน่ง' });
    try {
        await pool.query(
            'UPDATE Master_Positions SET Name = ?, IsSupervisorPatrol = ? WHERE id = ?',
            [Name, IsSupervisorPatrol ? 1 : 0, req.params.id]
        );
        res.json({ success: true, message: 'แก้ไขตำแหน่งสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'ชื่อตำแหน่งนี้มีอยู่แล้ว' });
        res.status(500).json({ success: false, message: 'ไม่สามารถแก้ไขข้อมูลได้' });
    }
});

router.put('/positions/:id/supervisor-toggle', isAdmin, async (req, res) => {
    try {
        const [[row]] = await pool.query('SELECT IsSupervisorPatrol FROM Master_Positions WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบตำแหน่ง' });
        const newVal = row.IsSupervisorPatrol ? 0 : 1;
        await pool.query('UPDATE Master_Positions SET IsSupervisorPatrol = ? WHERE id = ?', [newVal, req.params.id]);
        res.json({ success: true, data: { IsSupervisorPatrol: newVal } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/positions/:id', isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Positions WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// ─── Areas (Patrol_Areas) ─────────────────────────────────────────────────────
router.get('/areas', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Patrol_Areas ORDER BY SortOrder, id');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/areas', isAdmin, async (req, res) => {
    const { Name, Code, SortOrder } = req.body;
    if (!Name || !Code) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและรหัสพื้นที่' });
    try {
        await pool.query('INSERT INTO Patrol_Areas (Name, Code, SortOrder) VALUES (?,?,?)', [Name, Code, SortOrder || 99]);
        res.json({ success: true, message: 'เพิ่มพื้นที่สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'รหัสพื้นที่ซ้ำ' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/areas/:id', isAdmin, async (req, res) => {
    const { Name, Code, SortOrder } = req.body;
    if (!Name || !Code) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อและรหัสพื้นที่' });
    try {
        await pool.query('UPDATE Patrol_Areas SET Name=?, Code=?, SortOrder=? WHERE id=?', [Name, Code, SortOrder ?? 99, req.params.id]);
        res.json({ success: true, message: 'แก้ไขพื้นที่สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/areas/:id', isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Patrol_Areas WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'ลบสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Safety Units (read-only for all authenticated users) ────────────────────
// Units are managed by admin via /admin/org/units — this is the public read endpoint
router.get('/safety-units', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.short_code, u.department_id, u.sort_order,
                    d.Name AS DeptName
             FROM Master_SafetyUnits u
             LEFT JOIN Master_Departments d ON d.id = u.department_id
             ORDER BY u.department_id, u.sort_order, u.name`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        // Table may not exist yet (auto-created by admin module on first load)
        res.json({ success: true, data: [] });
    }
});

module.exports = router;
