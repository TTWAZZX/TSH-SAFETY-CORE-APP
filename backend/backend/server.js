// =================================================================
// TSH Safety Core Activity - Backend API (Node.js + Express)
// FINAL VERSION - v2.1
// =================================================================

// SECTION 1: SETUP AND CONFIGURATION
require('dotenv').config();

// --- ▼▼▼ เพิ่มโค้ดตรวจสอบ 4 บรรทัดนี้ ▼▼▼ ---
console.log("--- Verifying Cloudinary Credentials ---");
console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME ? "Loaded" : "!! MISSING !!");
console.log("API Key:", process.env.CLOUDINARY_API_KEY ? "Loaded" : "!! MISSING !!");
console.log("API Secret:", process.env.CLOUDINARY_API_SECRET ? "Loaded" : "!! MISSING !!");
console.log("--------------------------------------");

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const patrolRoutes = require('./routes/patrol'); // ✅ เพิ่มบรรทัดนี้
const adminRoutes = require('./routes/admin');
const cccfRoutes = require('./routes/cccf');     // ✅ เพิ่มบรรทัดนี้
const masterRoutes = require('./routes/master'); // ✅ 1. เพิ่มบรรทัดนี้ (Import)

// --- ตั้งค่า Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => { // <--- เปลี่ยนจาก Object เป็นฟังก์ชัน
    // กำหนดประเภทไฟล์เริ่มต้นให้เป็น 'raw' สำหรับเอกสารทั่วไป
    let resource_type = 'raw';

    // ตรวจสอบ mimetype ของไฟล์
    if (file.mimetype.startsWith('image')) {
      resource_type = 'image';
    } else if (file.mimetype.startsWith('video')) {
      resource_type = 'video';
    }
    // ถ้าไม่ใช่ทั้ง image และ video ก็จะเป็น 'raw' ตามค่าเริ่มต้น

    return {
      folder: 'tsh_safety_app',
      public_id: `${Date.now()}-${file.originalname}`,
      resource_type: resource_type, // ส่งค่าที่ถูกต้องเข้าไป
      access_mode: 'public',
      overwrite: true,
    };
  },
});

const upload = multer({ storage: storage });



const app = express();
app.use(cors({
    origin: '*', // อนุญาตให้ทุกโดเมนเรียกใช้ API นี้ได้
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // อนุญาต Method ที่เราใช้
    allowedHeaders: ['Content-Type', 'Authorization'] // (สำคัญ) อนุญาตให้ส่ง Header ที่จำเป็นสำหรับ Token
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = require('./db');

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

// Middleware สำหรับตรวจสอบว่าเป็น Admin หรือไม่
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Permission denied. Admin access required.' });
    }
};

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

// POST: สร้าง Policy ใหม่
app.post('/api/policies', authenticateToken, isAdmin, async (req, res) => {
    const { PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent } = req.body;
    if (!PolicyTitle || !EffectiveDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและวันที่บังคับใช้' });
    }
    try {
        // ถ้าตั้งอันใหม่เป็น Current ต้องเคลียร์อันเก่าก่อน
        if (IsCurrent) {
            await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1');
        }
        const [result] = await pool.query(
            'INSERT INTO Policies (PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent) VALUES (?, ?, ?, ?, ?)',
            [PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent ? 1 : 0]
        );
        res.status(201).json({ success: true, message: 'สร้างนโยบายใหม่สำเร็จ', insertedId: result.insertId });
    } catch (error) {
        console.error("Error creating policy:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างนโยบายได้' });
    }
});

// PUT: อัปเดต Policy ที่มีอยู่
app.put('/api/policies/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent } = req.body;
    if (!PolicyTitle || !EffectiveDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและวันที่บังคับใช้' });
    }
    try {
        // ถ้าตั้งอันนี้เป็น Current ต้องเคลียร์อันเก่าก่อน
        if (IsCurrent) {
            await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        }
        await pool.query(
            'UPDATE Policies SET PolicyTitle = ?, Description = ?, EffectiveDate = ?, DocumentLink = ?, IsCurrent = ? WHERE id = ?',
            [PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent ? 1 : 0, id]
        );
        res.json({ success: true, message: 'อัปเดตนโยบายสำเร็จ' });
    } catch (error) {
        console.error(`Error updating policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตนโยบายได้' });
    }
});

// DELETE: ลบ Policy
app.delete('/api/policies/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Policies WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบนโยบายสำเร็จ' });
    } catch (error) {
        console.error(`Error deleting policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบนโยบายได้' });
    }
});

// =================================================================
// SECTION: COMMITTEES CRUD
// =================================================================

// --- ▼▼▼ แทนที่ 3 ฟังก์ชันนี้ด้วยเวอร์ชันใหม่ ▼▼▼ ---

app.get('/api/pagedata/committees', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Committees ORDER BY TermStartDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });

        // --- โค้ดส่วนที่แก้ไขให้ทำงานได้ถูกต้อง 100% ---
        allItems.forEach(item => {
            // ตรวจสอบว่ามีข้อมูลและไม่ใช่ string ว่างๆ ก่อนที่จะ parse
            if (item.SubCommitteeData && typeof item.SubCommitteeData === 'string') {
                try {
                    item.SubCommitteeData = JSON.parse(item.SubCommitteeData);
                } catch (e) {
                    item.SubCommitteeData = []; // ถ้า parse ไม่ได้ ให้เป็น array ว่าง
                }
            } else {
                // ถ้าเป็น null, undefined, หรือไม่ใช่ string ให้เป็น array ว่าง
                item.SubCommitteeData = [];
            }
        });
        // --- สิ้นสุดส่วนที่แก้ไข ---

        let currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error("Error fetching page data for Committees:", error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ' });
    }
});

// POST: สร้าง Committee ใหม่
app.post('/api/committees', authenticateToken, isAdmin, async (req, res) => {
    const { CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, IsCurrent } = req.body;
    // สร้าง SubCommitteeData เริ่มต้นเป็น Array ว่าง
    const SubCommitteeData = JSON.stringify([]); 

    if (!CommitteeTitle || !TermStartDate || !TermEndDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) {
            await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1');
        }
        const [result] = await pool.query(
            'INSERT INTO Committees (CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, IsCurrent, SubCommitteeData) VALUES (?, ?, ?, ?, ?, ?)',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, IsCurrent ? 1 : 0, SubCommitteeData]
        );
        res.status(201).json({ success: true, message: 'สร้างข้อมูลคณะกรรมการชุดใหม่สำเร็จ', insertedId: result.insertId });
    } catch (error) {
        console.error("Error creating committee:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างข้อมูลได้' });
    }
});

// PUT: อัปเดต Committee ที่มีอยู่
app.put('/api/committees/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, IsCurrent, SubCommitteeData } = req.body;
    
    // แปลง Object จาก Frontend กลับเป็น JSON string ก่อนบันทึก
    const subDataString = JSON.stringify(SubCommitteeData || []);

    if (!CommitteeTitle || !TermStartDate || !TermEndDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) {
            await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        }
        await pool.query(
            'UPDATE Committees SET CommitteeTitle = ?, TermStartDate = ?, TermEndDate = ?, MainOrgChartLink = ?, IsCurrent = ?, SubCommitteeData = ? WHERE id = ?',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, IsCurrent ? 1 : 0, subDataString, id]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error(`Error updating committee ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});
// DELETE: ลบ Committee
app.delete('/api/committees/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Committees WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (error) {
        console.error(`Error deleting committee ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

// API สำหรับรับทราบ Policy (ย้ายมาไว้รวมกัน)
app.post('/api/policies/:rowIndex/acknowledge', authenticateToken, async (req, res) => {
    const { rowIndex } = req.params;
    const { name } = req.user; // ดึงชื่อผู้ใช้จาก Token ที่ผ่าน authenticateToken มาแล้ว

    try {
        const [policies] = await pool.query('SELECT AcknowledgedBy FROM Policies WHERE id = ?', [rowIndex]);
        if (policies.length === 0) {
            return res.status(404).json({ status: 'error', message: 'ไม่พบนโยบาย' });
        }

        let ackList = [];
        try {
            if (policies[0].AcknowledgedBy) {
                ackList = JSON.parse(policies[0].AcknowledgedBy);
            }
        } catch (e) {
            // กรณีข้อมูลเดิมไม่ใช่ JSON ที่ถูกต้อง
        }

        if (!ackList.includes(name)) {
            ackList.push(name);
        }
        
        await pool.query('UPDATE Policies SET AcknowledgedBy = ? WHERE id = ?', [JSON.stringify(ackList), rowIndex]);
        
        res.json({ status: 'success', message: 'บันทึกการรับทราบเรียบร้อยแล้ว' });

    } catch (error) {
        console.error("Acknowledge Error:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
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

// POST /api/policies/:id/acknowledge - สำหรับบันทึกการรับทราบนโยบาย
app.post('/api/policies/:id/acknowledge', authenticateToken, async (req, res) => {
    const { id } = req.params; // ID ของนโยบายที่ต้องการรับทราบ
    const { name } = req.user; // ชื่อของผู้ใช้ที่ Login อยู่ (จาก Token)

    try {
        // 1. ดึงข้อมูล AcknowledgedBy เดิมออกมา
        const [rows] = await pool.query('SELECT AcknowledgedBy FROM Policies WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'ไม่พบนโยบาย' });
        }

        let ackList = [];
        try {
            // 2. แปลง JSON string เป็น Array
            if (rows[0].AcknowledgedBy) {
                ackList = JSON.parse(rows[0].AcknowledgedBy);
            }
        } catch (e) {
            // ถ้าข้อมูลเดิมไม่ใช่ JSON ให้เริ่มจาก Array ว่าง
            ackList = [];
        }

        // 3. เพิ่มชื่อผู้ใช้ถ้ายังไม่มี
        if (!ackList.includes(name)) {
            ackList.push(name);
        } else {
            return res.json({ status: 'info', message: 'คุณได้รับทราบข้อมูลนี้แล้ว' });
        }

        // 4. แปลง Array กลับเป็น JSON string แล้วอัปเดตลงฐานข้อมูล
        const newAckListJson = JSON.stringify(ackList);
        await pool.query('UPDATE Policies SET AcknowledgedBy = ? WHERE id = ?', [newAckListJson, id]);

        res.json({ status: 'success', message: 'รับทราบข้อมูลเรียบร้อยแล้ว' });

    } catch (error) {
        console.error("Error acknowledging policy:", error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
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

// --- สร้าง API Endpoint ใหม่สำหรับอัปโหลดไฟล์ ---
// server.js
app.post('/api/upload/document', authenticateToken, isAdmin, upload.single('document'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    // --- ▼▼▼ เพิ่มโค้ด Debug 3 บรรทัดนี้ ▼▼▼ ---
    console.log('--- Cloudinary Upload Response ---');
    console.log(req.file);
    console.log('------------------------------------');

    res.json({ success: true, message: 'File uploaded successfully', url: req.file.path });
});

// =================================================================
// SECTION: KPI DATA & ANNOUNCEMENTS CRUD
// =================================================================

// --- KPI Announcements ---
app.post('/api/kpiannouncements', authenticateToken, isAdmin, async (req, res) => {
    const { AnnouncementTitle, EffectiveDate, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    try {
        if (IsCurrent) {
            await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1');
        }
        await pool.query('INSERT INTO KPIAnnouncements (AnnouncementTitle, EffectiveDate, IsCurrent) VALUES (?, ?, ?)', [AnnouncementTitle, EffectiveDate, IsCurrent ? 1 : 0]);
        res.status(201).json({ success: true, message: 'สร้างประกาศ KPI ใหม่สำเร็จ' });
    } catch (error) {
        console.error("Error creating KPI announcement:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างประกาศได้' });
    }
});

app.put('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { AnnouncementTitle, EffectiveDate, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    try {
        if (IsCurrent) {
            await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1 AND AnnouncementID != ?', [id]);
        }
        await pool.query('UPDATE KPIAnnouncements SET AnnouncementTitle = ?, EffectiveDate = ?, IsCurrent = ? WHERE AnnouncementID = ?', [AnnouncementTitle, EffectiveDate, IsCurrent ? 1 : 0, id]);
        res.json({ success: true, message: 'อัปเดตประกาศสำเร็จ' });
    } catch (error) {
        console.error("Error updating KPI announcement:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตประกาศได้' });
    }
});


// --- KPI Data ---
app.post('/api/kpidata', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('INSERT INTO KPIData SET ?', req.body);
        res.status(201).json({ success: true, message: 'เพิ่มตัวชี้วัด KPI ใหม่สำเร็จ' });
    } catch (error) {
        console.error("Error creating KPI data:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มตัวชี้วัดได้' });
    }
});

app.put('/api/kpidata/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE KPIData SET ? WHERE id = ?', [req.body, id]);
        res.json({ success: true, message: 'อัปเดตข้อมูล KPI สำเร็จ' });
    } catch (error) {
        console.error("Error updating KPI data:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

app.delete('/api/kpidata/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM KPIData WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบตัวชี้วัดสำเร็จ' });
    } catch (error) {
        console.error("Error deleting KPI data:", error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบตัวชี้วัดได้' });
    }
});

// GET All KPI Announcements
app.get('/api/kpiannouncements', authenticateToken, isAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT *, AnnouncementID as id FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not fetch KPI Announcements' });
    }
});

// DELETE a KPI Announcement
app.delete('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        // อาจจะต้องลบ KPI Data ที่เกี่ยวข้องด้วย (Optional)
        // await pool.query('DELETE FROM KPIData WHERE AnnouncementID = ?', [id]);
        await pool.query('DELETE FROM KPIAnnouncements WHERE AnnouncementID = ?', [id]);
        res.json({ success: true, message: 'ลบประกาศสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบประกาศได้' });
    }
});

// =================================================================
// SECTION 4: GENERIC CRUD (สำหรับ Admin Panel)
// =================================================================
// --- เชื่อมต่อ Route ใหม่ ---
app.use('/api/patrol', patrolRoutes); // เมื่อเรียก /api/patrol/... ให้ไปใช้ไฟล์ patrol.js
app.use('/api/admin', adminRoutes);
app.use('/api/cccf', cccfRoutes);     // เมื่อเรียก /api/cccf/... ให้ไปใช้ไฟล์ cccf.js
app.use('/api/master', masterRoutes); // Endpoint จะเป็น /api/master/departments

const tablesForCrud = [
    'Employees',
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

// ==========================================
// 👥 EMPLOYEES MANAGEMENT (เพิ่มใหม่)
// ==========================================

// GET: ดึงพนักงานทั้งหมด
app.get('/api/employees', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Employees ORDER BY EmployeeName ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET: ดึงพนักงานรายคน
app.get('/api/employees/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST: เพิ่มพนักงานใหม่
app.post('/api/employees', async (req, res) => {
    // รับค่า Position แทน Team (ตามที่แก้ Frontend ล่าสุด)
    const { EmployeeID, EmployeeName, Department, Position, Role, Team } = req.body;
    
    // Fallback: ถ้าส่งมาเป็น Team ให้ใช้เป็น Position หรือถ้าส่ง Position มาก็ใช้เลย
    const finalPosition = Position || Team; 

    try {
        await pool.query(
            'INSERT INTO Employees (EmployeeID, EmployeeName, Department, Position, Role) VALUES (?, ?, ?, ?, ?)',
            [EmployeeID, EmployeeName, Department, finalPosition, Role]
        );
        res.json({ success: true, message: 'เพิ่มพนักงานสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT: แก้ไขพนักงาน
app.put('/api/employees/:id', async (req, res) => {
    const { EmployeeName, Department, Position, Role, Team } = req.body;
    const finalPosition = Position || Team;

    try {
        const [result] = await pool.query(
            'UPDATE Employees SET EmployeeName=?, Department=?, Position=?, Role=? WHERE EmployeeID=?',
            [EmployeeName, Department, finalPosition, Role, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE: ลบพนักงาน
app.delete('/api/employees/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Import (Fallback) -> ปรับให้รองรับ Position
app.post('/api/admin/employees/import', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).json({ success: false, message: 'Invalid data' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const emp of data) {
            const position = emp.Position || emp.Team || ''; // รองรับทั้งสองชื่อ
            await connection.query(
                `INSERT INTO Employees (EmployeeID, EmployeeName, Department, Position, Role) 
                 VALUES (?, ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE EmployeeName=VALUES(EmployeeName), Department=VALUES(Department), Position=VALUES(Position), Role=VALUES(Role)`,
                [emp.EmployeeID, emp.EmployeeName, emp.Department, position, emp.Role]
            );
        }
        await connection.commit();
        res.json({ success: true, message: `Imported ${data.length} rows` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// =================================================================
// SECTION 5: START THE SERVER
// =================================================================
// ✅ แก้ไขส่วนท้ายไฟล์เป็นแบบนี้ครับ
const PORT = process.env.PORT || 5000;

// ถ้าเป็นการรันในเครื่อง (Local) ให้ Start Server เลย
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// ส่งออก app ให้ Vercel เอาไปใช้ (สำคัญมาก!)
module.exports = app;