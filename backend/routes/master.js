// backend/routes/master.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // ตรวจสอบ path ให้ถูกว่า db.js อยู่ไหน (อาจจะเป็น ../db หรือ ../../db)

// Helper function
const handleQuery = async (res, sql, params = []) => {
    try {
        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const handleExecute = async (res, sql, params = []) => {
    try {
        await pool.query(sql, params);
        res.json({ success: true, message: 'Operation successful' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ข้อมูลซ้ำ (Duplicate Entry)' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// ==========================================
// 🏢 DEPARTMENTS MANAGEMENT
// ==========================================

// GET: ดึงรายชื่อแผนกทั้งหมด
router.get('/departments', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Departments ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST: เพิ่มแผนกใหม่
router.post('/departments', async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผนก' });
    
    try {
        await pool.query('INSERT INTO Master_Departments (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'เพิ่มแผนกสำเร็จ' });
    } catch (err) {
        // เช็ค Error code 1062 คือค่าซ้ำ (Duplicate entry)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ชื่อแผนกนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE: ลบแผนก
router.delete('/departments/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Departments WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 👷 TEAMS MANAGEMENT
// ==========================================

// GET: ดึงรายชื่อทีมทั้งหมด
router.get('/teams', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Teams ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST: เพิ่มทีมใหม่
router.post('/teams', async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อทีม' });

    try {
        await pool.query('INSERT INTO Master_Teams (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'เพิ่มทีมสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'ชื่อทีมนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE: ลบทีม
router.delete('/teams/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Teams WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 🔑 ROLES MANAGEMENT (เพิ่มส่วนนี้)
// ==========================================

router.get('/roles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Master_Roles ORDER BY Name ASC');
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/roles', async (req, res) => {
    const { Name } = req.body;
    if (!Name) return res.status(400).json({ success: false, message: 'Missing Name' });
    try {
        await pool.query('INSERT INTO Master_Roles (Name) VALUES (?)', [Name]);
        res.json({ success: true, message: 'Added Role' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Duplicate Role' });
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/roles/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Master_Roles WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==========================================
// 👔 POSITIONS MANAGEMENT (เพิ่มส่วนนี้)
// ==========================================
router.get('/positions', (req, res) => handleQuery(res, 'SELECT * FROM Master_Positions ORDER BY Name ASC'));
router.post('/positions', (req, res) => handleExecute(res, 'INSERT INTO Master_Positions (Name) VALUES (?)', [req.body.Name]));
router.delete('/positions/:id', (req, res) => handleExecute(res, 'DELETE FROM Master_Positions WHERE id = ?', [req.params.id]));

module.exports = router;