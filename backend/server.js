// =================================================================
// TSH Safety Core Activity - Backend API (Node.js + Express)
// FINAL VERSION - v2.1
// =================================================================

// SECTION 1: SETUP AND CONFIGURATION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({
    origin: '*', // อนุญาตให้ทุกโดเมนเรียกใช้ API นี้ได้
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // อนุญาต Method ที่เราใช้
    allowedHeaders: ['Content-Type', 'Authorization'] // (สำคัญ) อนุญาตให้ส่ง Header ที่จำเป็นสำหรับ Token
}));
app.use(express.json({ limit: '10mb' }));

// --- Database Connection ---
let pool;
try {
    pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: true
        },
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
// SECTION 2: AUTHENTICATION & SESSION MANAGEMENT
// =================================================================
app.post('/api/login', async (req, res) => {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
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
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
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
// SECTION 3: PAGE-SPECIFIC DATA ROUTES
// =================================================================
app.get('/api/pagedata/policies', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Policies ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error("Error fetching page data for Policies:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
    }
});

app.get('/api/pagedata/committees', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Committees ORDER BY TermStartDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error("Error fetching page data for Committees:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ' });
    }
});

app.get('/api/pagedata/kpi-announcements', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, AnnouncementID as rowIndex FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.AnnouncementID !== currentItem.AnnouncementID);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error("Error fetching KPI Announcements:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประกาศ KPI' });
    }
});

app.get('/api/kpidata/:year', authenticateToken, async (req, res) => {
    const { year } = req.params;
    try {
        const [data] = await pool.query('SELECT *, id as rowIndex FROM KPIData WHERE Year = ?', [year]);
        res.json(data);
    } catch (error) {
        console.error(`Error fetching KPI Data for year ${year}:`, error);
        res.status(500).json({ success: false, message: `เกิดข้อผิดพลาดในการดึงข้อมูล KPI ปี ${year}` });
    }
});

app.get('/api/yokoten/pagedata', authenticateToken, async (req, res) => {
    const user = req.user;
    try {
        const [allTopics] = await pool.query('SELECT * FROM YokotenTopics ORDER BY DateIssued DESC');
        const [myHistory] = await pool.query('SELECT * FROM YokotenResponses WHERE EmployeeID = ? ORDER BY ResponseDate DESC', [user.id]);
        const unacknowledgedCount = allTopics.length - myHistory.length;
        const lastAcknowledgedDate = myHistory.length > 0 ? new Date(myHistory[0].ResponseDate).toLocaleDateString('th-TH') : 'N/A';
        res.json({
            success: true,
            data: { allTopics, myHistory, userStats: { unacknowledgedCount, acknowledgedCount: myHistory.length, lastAcknowledgedDate } }
        });
    } catch (error) {
        console.error("Error fetching Yokoten page data:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Yokoten' });
    }
});

app.post('/api/yokoten/acknowledge', authenticateToken, async (req, res) => {
    const user = req.user;
    const { yokotenId, isRelated, comment } = req.body;
    try {
        const [topicRows] = await pool.query('SELECT * FROM YokotenTopics WHERE YokotenID = ?', [yokotenId]);
        if (topicRows.length === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบหัวข้อ Yokoten' });
        const topic = topicRows[0];
        const newResponse = {
            ResponseID: uuidv4(), YokotenID: yokotenId, TopicDescription: topic.TopicDescription,
            EmployeeID: user.id, EmployeeName: user.name, Department: user.department,
            ResponseDate: new Date(), IsRelated: isRelated, Comment: comment || "", RecordedBy: "User"
        };
        await pool.query('INSERT INTO YokotenResponses SET ?', newResponse);
        res.status(201).json({ status: 'success', message: 'บันทึกการรับทราบสำเร็จ', newResponse });
    } catch (error) {
        console.error("Error acknowledging Yokoten topic:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});


// =================================================================
// SECTION 4: GENERIC CRUD (สำหรับ Admin Panel)
// =================================================================
const tablesForCrud = [
    'Employees', 'Policies', 'Committees', 'KPIAnnouncements', 'KPIData',
    'Patrol_Sessions', 'Patrol_Attendance', 'Patrol_Issues',
    'CCCF_Activity', 'CCCF_Targets', 'ManHours', 'AccidentReports',
    'TrainingStatus', 'SCW_Documents', 'OJT_Department_Status',
    'Machines', 'Documents', 'Document_Machine_Links', 'YokotenTopics', 'YokotenResponses'
];

tablesForCrud.forEach(table => {
    const endpoint = `/api/${table.toLowerCase()}`;
    const primaryKeyResult = pool.query(`SHOW KEYS FROM \`${table}\` WHERE Key_name = 'PRIMARY'`);

    // GET ALL
    app.get(endpoint, authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ status: 'error', message: `Could not fetch data from ${table}` });
        }
    });
    
    // ADD NEW (POST)
    app.post(endpoint, authenticateToken, async (req, res) => {
        try {
            const columns = Object.keys(req.body);
            const values = Object.values(req.body);
            const query = `INSERT INTO \`${table}\` (\`${columns.join('`,`')}\`) VALUES (?)`;
            await pool.query(query, [values]);
            res.status(201).json({ status: 'success', message: 'เพิ่มข้อมูลใหม่สำเร็จ' });
        } catch (error) {
            console.error(`Error adding to ${table}:`, error);
            res.status(500).json({ status: 'error', message: `Could not add data to ${table}` });
        }
    });

    // UPDATE (PUT)
    // หมายเหตุ: การ Update นี้จะใช้ 'id' เป็นตัวอ้างอิงหลัก หากตารางไหนไม่มี 'id' อาจจะต้องปรับแก้
    app.put(`${endpoint}/:id`, authenticateToken, async (req, res) => {
        try {
             const { id } = req.params;
            const columns = Object.keys(req.body).map(key => `\`${key}\` = ?`).join(',');
            const values = [...Object.values(req.body), id];
            const query = `UPDATE \`${table}\` SET ${columns} WHERE id = ?`; // สมมติว่า PK คือ 'id'
            const [result] = await pool.query(query, values);
             if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Item not found for update' });
            }
            res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });
        } catch (error) {
            console.error(`Error updating ${table}:`, error);
            res.status(500).json({ status: 'error', message: `Could not update data in ${table}` });
        }
    });

    // DELETE
    app.delete(`${endpoint}/:id`, authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const [result] = await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]); // สมมติว่า PK คือ 'id'
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Item not found for deletion' });
            }
            res.json({ status: 'success', message: 'ลบข้อมูลสำเร็จ' });
        } catch (error) {
            console.error(`Error deleting from ${table}:`, error);
            res.status(500).json({ status: 'error', message: `Could not delete data from ${table}` });
        }
    });
});

// =================================================================
// SECTION 5: START THE SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ TSH Safety App Server (FINAL) is running on http://localhost:${PORT}`);
});