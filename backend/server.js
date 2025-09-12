require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const app = express();

// --- การตั้งค่า CORS ที่สำคัญที่สุด ---
app.use(cors({
    origin: '*', // อนุญาตให้ทุกโดเมนเรียกใช้
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware นี้ต้องอยู่หลัง cors() และก่อน route ที่ต้องการใช้ JSON
app.use(express.json());

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }
});

// มีแค่ API สำหรับ Login และ Policies เท่านั้น
app.post('/api/login', async (req, res) => {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูล' });
    try {
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
        const user = rows[0];
        if (!user) return res.status(401).json({ success: false, message: 'รหัสพนักงานไม่ถูกต้อง' });
        if (password === user.EmployeeID) {
            const userData = { id: user.EmployeeID, name: user.EmployeeName, department: user.Department, role: user.Role, team: user.Team };
            const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
            res.json({ success: true, user: userData, token: token });
        } else {
            res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
        }
    } catch (error) { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.get('/api/pagedata/policies', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Policies ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Simplified Test Server is running on http://localhost:${PORT}`);
});