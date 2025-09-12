// =================================================================
// TSH Safety Core Activity - Backend API (Node.js + Express)
// FINAL STABLE VERSION
// =================================================================

// SECTION 1: SETUP AND CONFIGURATION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
// การตั้งค่า CORS ที่สมบูรณ์
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// --- Database Connection ---
let pool;
try {
    pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("✅ Database connection pool created successfully.");
} catch (error) {
    console.error("❌ FATAL ERROR: Could not create database connection pool.", error);
    process.exit(1);
}

// Middleware สำหรับตรวจสอบ Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ success: false, message: 'No token provided' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token is not valid' });
        req.user = user;
        next();
    });
};

// =================================================================
// SECTION 2: AUTHENTICATION
// =================================================================
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

app.post('/api/session/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.json({ success: false });
        const { iat, exp, ...userData } = user;
        const newToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({ success: true, user: userData, token: newToken });
    });
});

// =================================================================
// SECTION 3: PAGE-SPECIFIC ROUTES
// =================================================================
app.get('/api/pagedata/policies', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Policies ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error("Error in /api/pagedata/policies:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
    }
});

// เพิ่ม API สำหรับหน้าอื่นๆ ที่นี่ในอนาคต

// =================================================================
// SECTION 4: START THE SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ TSH Safety App Server is running on port ${PORT}`);
});