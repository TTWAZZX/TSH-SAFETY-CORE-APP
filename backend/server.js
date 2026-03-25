// =================================================================
// TSH Safety Core Activity - Backend API (Node.js + Express)
// v2.2 — Security Patched
// =================================================================
require('dotenv').config({ path: __dirname + '/.env' });

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');

const { authenticateToken, isAdmin } = require('./middleware/auth');
const { storage: cloudinaryStorage, fileFilter, isLocal } = require('./cloudinary');
const pool       = require('./db');

const patrolRoutes        = require('./routes/patrol');
const adminRoutes         = require('./routes/admin');
const cccfRoutes          = require('./routes/cccf');
const masterRoutes        = require('./routes/master');
const machineSafetyRoutes = require('./routes/machine-safety');
const ojtRoutes           = require('./routes/ojt');
const trainingRoutes      = require('./routes/training');
const accidentRoutes      = require('./routes/accident');
const yokotenRoutes       = require('./routes/yokoten');
const safetyCultureRoutes = require('./routes/safety-culture');
const contractorRoutes    = require('./routes/contractor');
const hiyariRoutes        = require('./routes/hiyari');
const kyRoutes            = require('./routes/ky');
const fourmRoutes         = require('./routes/fourm');
const settingsRoutes          = require('./routes/settings');
const activityTargetsRoutes   = require('./routes/activity-targets');

// =================================================================
// SECTION 1: SETUP
// =================================================================

// --- CORS: restrict to known origins ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5000,http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500')
    .split(',').map(o => o.trim());

const app = express();
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin / curl / mobile)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Tightened body size limit (was 50mb)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve uploaded files as static in local dev mode
if (isLocal) {
    app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));
}

// --- Document upload via Cloudinary (sanitised filename, type-filtered) ---
const upload = multer({
    storage: cloudinaryStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// --- Login rate limiter: max 10 attempts per 15 min per IP ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'ลองใหม่อีกครั้งหลังจาก 15 นาที (Too many login attempts)' },
    standardHeaders: true,
    legacyHeaders: false,
});

// =================================================================
// SECTION 2: AUTHENTICATION & SESSION MANAGEMENT
// =================================================================

app.post('/api/login', loginLimiter, async (req, res) => {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
        const user = rows[0];
        // Return identical message for wrong ID and wrong password (prevent user enumeration)
        if (!user) {
            return res.status(401).json({ success: false, message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        let passwordMatch = false;
        if (user.Password) {
            // Proper bcrypt hashed password stored in DB
            passwordMatch = await bcrypt.compare(password, user.Password);
        } else {
            // Legacy mode: no Password column — password equals EmployeeID
            // TODO: Add hashed Password column to Employees table for proper security
            console.warn(`[Security] User ${employeeId} using legacy password mode.`);
            passwordMatch = (password === user.EmployeeID);
        }

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        const userData = {
            id: user.EmployeeID,
            name: user.EmployeeName,
            department: user.Department,
            role: user.Role,
            team: user.Team,
        };
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({ success: true, user: userData, token });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// Change Password — ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง
app.post('/api/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }
    try {
        const [rows] = await pool.query('SELECT EmployeeID, Password FROM Employees WHERE EmployeeID = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

        const user = rows[0];
        let currentValid = false;
        if (user.Password) {
            currentValid = await bcrypt.compare(currentPassword, user.Password);
        } else {
            // legacy mode
            currentValid = (currentPassword === user.EmployeeID);
        }

        if (!currentValid) {
            return res.status(401).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE Employees SET Password = ? WHERE EmployeeID = ?', [hashed, req.user.id]);
        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    }
});

// Session verify — reads token from Authorization header via authenticateToken middleware
// FIX: was reading from req.body.token (always undefined) → now uses middleware
app.post('/api/session/verify', authenticateToken, (req, res) => {
    const { iat, exp, ...userData } = req.user;
    const newToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
    res.json({ success: true, user: userData, token: newToken });
});

// ─── Registration: Public master data for dropdowns ────────────────────────
app.get('/api/register/options', async (req, res) => {
    try {
        const [depts]     = await pool.query('SELECT id, Name FROM Master_Departments ORDER BY Name');
        const [positions] = await pool.query('SELECT id, Name FROM Master_Positions ORDER BY Name');
        const [units]     = await pool.query(
            'SELECT id, name, department_id FROM Master_SafetyUnits ORDER BY sort_order, name'
        ).catch(() => [[]]);
        res.json({ success: true, data: { departments: depts, positions, units } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถโหลดข้อมูลได้' });
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { success: false, message: 'ลองใหม่ภายหลัง (เกินขีดจำกัดการสมัคร)' },
    standardHeaders: true, legacyHeaders: false,
});

app.post('/api/register', registerLimiter, async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Position, Unit, password } = req.body;
    if (!EmployeeID || !EmployeeName || !Department || !Position || !password)
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    if (password.length < 6)
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
    try {
        const [existing] = await pool.query('SELECT EmployeeID FROM Employees WHERE EmployeeID = ?', [EmployeeID.trim()]);
        if (existing.length > 0)
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้มีอยู่แล้วในระบบ' });
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO Employees (EmployeeID, EmployeeName, Department, Unit, Team, Position, Role, Password) VALUES (?,?,?,?,?,?,?,?)',
            [EmployeeID.trim(), EmployeeName.trim(), Department, Unit || '', '', Position, 'User', hashed]
        );
        res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสที่ตั้งไว้' });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    }
});

// ─── Profile: Get & Update own profile ─────────────────────────────────────
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role FROM Employees WHERE EmployeeID = ?',
            [req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    const { EmployeeName, Department, Unit, Position } = req.body;
    if (!EmployeeName || !EmployeeName.trim())
        return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ-นามสกุล' });
    try {
        await pool.query(
            'UPDATE Employees SET EmployeeName=?, Department=?, Unit=?, Position=? WHERE EmployeeID=?',
            [EmployeeName.trim(), Department || '', Unit || '', Position || '', req.user.id]
        );
        res.json({ success: true, message: 'อัปเดตโปรไฟล์สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── เปลี่ยนรหัสพนักงาน (cascade update ทุกตารางที่อ้างอิง) ─────────────────
app.put('/api/profile/employee-id', authenticateToken, async (req, res) => {
    const { newEmployeeID } = req.body;
    const oldID = req.user.id;
    if (!newEmployeeID || !newEmployeeID.trim())
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสพนักงานใหม่' });
    const newID = newEmployeeID.trim().toUpperCase();
    if (newID === oldID)
        return res.status(400).json({ success: false, message: 'รหัสพนักงานเหมือนเดิม ไม่มีการเปลี่ยนแปลง' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // ตรวจว่า newID ยังไม่มีในระบบ
        const [[existing]] = await connection.query(
            'SELECT EmployeeID FROM Employees WHERE EmployeeID = ?', [newID]
        );
        if (existing) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `รหัสพนักงาน "${newID}" มีอยู่แล้วในระบบ` });
        }

        // อัปเดต Employees (PK)
        await connection.query('UPDATE Employees SET EmployeeID = ? WHERE EmployeeID = ?', [newID, oldID]);

        // Cascade update ตารางที่อ้างอิง EmployeeID ของผู้ใช้
        const cascades = [
            'UPDATE Patrol_Attendance    SET UserID      = ? WHERE UserID      = ?',
            'UPDATE Patrol_Self_Checkin  SET EmployeeID  = ? WHERE EmployeeID  = ?',
            'UPDATE CCCF_Activity        SET EmployeeID  = ? WHERE EmployeeID  = ?',
            'UPDATE KY_Activities        SET ReporterID  = ? WHERE ReporterID  = ?',
            'UPDATE FourM_ChangeNotices  SET CreatedByID = ? WHERE CreatedByID = ?',
            'UPDATE SC_PPEInspections    SET InspectorID = ? WHERE InspectorID = ?',
            'UPDATE YokotenResponses     SET EmployeeID  = ? WHERE EmployeeID  = ?',
            'UPDATE Policy_Acknowledgements SET UserID   = ? WHERE UserID      = ?',
            'UPDATE Admin_AuditLogs      SET AdminID     = ? WHERE AdminID     = ?',
        ];
        for (const sql of cascades) {
            await connection.query(sql, [newID, oldID]).catch(() => {}); // silent — ตารางอาจยังไม่มี
        }

        await connection.commit();

        // ออก JWT ใหม่ด้วย EmployeeID ใหม่
        const [[updated]] = await pool.query(
            'SELECT EmployeeID, EmployeeName, Department, Role, Team FROM Employees WHERE EmployeeID = ?', [newID]
        );
        const userData = {
            id:         updated.EmployeeID,
            name:       updated.EmployeeName,
            department: updated.Department,
            role:       updated.Role,
            team:       updated.Team || '',
        };
        const newToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });

        res.json({ success: true, message: 'เปลี่ยนรหัสพนักงานสำเร็จ', token: newToken, user: userData });
    } catch (err) {
        await connection.rollback();
        console.error('Change EmployeeID Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    } finally {
        connection.release();
    }
});

// =================================================================
// SECTION 3: PAGE-SPECIFIC DATA ROUTES
// =================================================================

app.get('/api/pagedata/policies', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Policies ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [], totalEmployees: 0 });

        // Total employees
        const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM Employees').catch(() => [[{ total: 0 }]]);

        // Ack counts per policy from new table
        const [ackCounts] = await pool.query(
            'SELECT PolicyID, COUNT(*) as cnt FROM Policy_Acknowledgements GROUP BY PolicyID'
        ).catch(() => [[]]);
        const ackMap = {};
        ackCounts.forEach(r => { ackMap[r.PolicyID] = Number(r.cnt); });

        // Current user's acknowledged policies
        const [userAcks] = await pool.query(
            'SELECT PolicyID FROM Policy_Acknowledgements WHERE UserID = ?', [req.user.id]
        ).catch(() => [[]]);
        const userAckSet = new Set(userAcks.map(r => r.PolicyID));

        // Version numbers (sorted ascending by date)
        const sorted = [...allItems].sort((a, b) => new Date(a.EffectiveDate) - new Date(b.EffectiveDate));
        const versionMap = {};
        sorted.forEach((p, i) => { versionMap[p.id] = i + 1; });

        const withStats = allItems.map(p => ({
            ...p,
            ackCount: ackMap[p.id] || 0,
            totalEmployees: total,
            userAcknowledged: userAckSet.has(p.id),
            version: versionMap[p.id]
        }));

        const current = withStats.find(p => p.IsCurrent == 1) || withStats[0] || null;
        const past = withStats.filter(p => p.id !== current?.id);
        res.json({ current, past, totalEmployees: total });
    } catch (error) {
        console.error('Error fetching Policies:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
    }
});

app.post('/api/policies', authenticateToken, isAdmin, async (req, res) => {
    const { PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent, Category, ReviewDate } = req.body;
    if (!PolicyTitle || !EffectiveDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและวันที่บังคับใช้' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1');
        const [result] = await pool.query(
            'INSERT INTO Policies (PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent, Category, ReviewDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [PolicyTitle, Description || null, EffectiveDate, DocumentLink || null, IsCurrent ? 1 : 0, Category || null, ReviewDate || null]
        );
        res.status(201).json({ success: true, message: 'สร้างนโยบายใหม่สำเร็จ', insertedId: result.insertId });
    } catch (error) {
        console.error('Error creating policy:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างนโยบายได้' });
    }
});

app.put('/api/policies/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent, Category, ReviewDate } = req.body;
    if (!PolicyTitle || !EffectiveDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและวันที่บังคับใช้' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        await pool.query(
            'UPDATE Policies SET PolicyTitle = ?, Description = ?, EffectiveDate = ?, DocumentLink = ?, IsCurrent = ?, Category = ?, ReviewDate = ? WHERE id = ?',
            [PolicyTitle, Description || null, EffectiveDate, DocumentLink || null, IsCurrent ? 1 : 0, Category || null, ReviewDate || null, id]
        );
        res.json({ success: true, message: 'อัปเดตนโยบายสำเร็จ' });
    } catch (error) {
        console.error(`Error updating policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตนโยบายได้' });
    }
});

app.delete('/api/policies/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Policy_Acknowledgements WHERE PolicyID = ?', [id]).catch(() => {});
        await pool.query('DELETE FROM Policies WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบนโยบายสำเร็จ' });
    } catch (error) {
        console.error(`Error deleting policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบนโยบายได้' });
    }
});

// POST /api/policies/:id/acknowledge — uses dedicated table (idempotent)
app.post('/api/policies/:id/acknowledge', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { id: UserID, name: UserName, department: Department } = req.user;
    try {
        const [rows] = await pool.query('SELECT id FROM Policies WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบนโยบาย' });
        await pool.query(
            'INSERT IGNORE INTO Policy_Acknowledgements (PolicyID, UserID, UserName, Department) VALUES (?, ?, ?, ?)',
            [id, UserID, UserName || null, Department || null]
        );
        res.json({ status: 'success', message: 'รับทราบนโยบายเรียบร้อยแล้ว' });
    } catch (error) {
        console.error('Error acknowledging policy:', error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// GET /api/policies/:id/acknowledgements — Admin: who acked + who hasn't
app.get('/api/policies/:id/acknowledgements', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [acked] = await pool.query(
            'SELECT UserID, UserName, Department, AcknowledgedAt FROM Policy_Acknowledgements WHERE PolicyID = ? ORDER BY AcknowledgedAt DESC',
            [id]
        );
        const [notAcked] = await pool.query(
            `SELECT e.EmployeeID, e.EmployeeName AS Name, e.Department
             FROM Employees e
             WHERE e.EmployeeID NOT IN (SELECT UserID FROM Policy_Acknowledgements WHERE PolicyID = ?)
             ORDER BY e.Department, e.EmployeeName`,
            [id]
        );
        res.json({ acknowledged: acked, notAcknowledged: notAcked, ackCount: acked.length, totalEmployees: acked.length + notAcked.length });
    } catch (error) {
        console.error(`Error fetching acknowledgements for policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
    }
});

// PUT /api/policies/:id/restore — Admin: set old policy as current
app.put('/api/policies/:id/restore', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1');
        await pool.query('UPDATE Policies SET IsCurrent = 1 WHERE id = ?', [id]);
        res.json({ success: true, message: 'ตั้งเป็นฉบับปัจจุบันเรียบร้อยแล้ว' });
    } catch (error) {
        console.error(`Error restoring policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถกู้คืนนโยบายได้' });
    }
});

// =================================================================
// SECTION: COMMITTEES CRUD
// =================================================================

app.get('/api/pagedata/committees', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, id as rowIndex FROM Committees ORDER BY TermStartDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        allItems.forEach(item => {
            if (item.SubCommitteeData && typeof item.SubCommitteeData === 'string') {
                try { item.SubCommitteeData = JSON.parse(item.SubCommitteeData); }
                catch (_) { item.SubCommitteeData = []; }
            } else {
                item.SubCommitteeData = [];
            }
        });
        const currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.id !== currentItem.id);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error('Error fetching Committees:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคณะกรรมการ' });
    }
});

app.post('/api/committees', authenticateToken, isAdmin, async (req, res) => {
    const { CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, AppointmentDocLink, IsCurrent, SubCommitteeData } = req.body;
    if (!CommitteeTitle || !TermStartDate || !TermEndDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1');
        const [result] = await pool.query(
            'INSERT INTO Committees (CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, AppointmentDocLink, IsCurrent, SubCommitteeData) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink || null, AppointmentDocLink || null, IsCurrent ? 1 : 0, JSON.stringify(SubCommitteeData || [])]
        );
        res.status(201).json({ success: true, message: 'สร้างข้อมูลคณะกรรมการชุดใหม่สำเร็จ', insertedId: result.insertId });
    } catch (error) {
        console.error('Error creating committee:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างข้อมูลได้' });
    }
});

app.put('/api/committees/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, AppointmentDocLink, IsCurrent, SubCommitteeData } = req.body;
    if (!CommitteeTitle || !TermStartDate || !TermEndDate) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        await pool.query(
            'UPDATE Committees SET CommitteeTitle = ?, TermStartDate = ?, TermEndDate = ?, MainOrgChartLink = ?, AppointmentDocLink = ?, IsCurrent = ?, SubCommitteeData = ? WHERE id = ?',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink || null, AppointmentDocLink || null, IsCurrent ? 1 : 0, JSON.stringify(SubCommitteeData || []), id]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error(`Error updating committee ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

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

// PUT /api/committees/:id/restore — Admin: set old committee as current
app.put('/api/committees/:id/restore', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1');
        await pool.query('UPDATE Committees SET IsCurrent = 1 WHERE id = ?', [id]);
        res.json({ success: true, message: 'ตั้งเป็นคณะกรรมการชุดปัจจุบันเรียบร้อยแล้ว' });
    } catch (error) {
        console.error(`Error restoring committee ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถกู้คืนข้อมูลได้' });
    }
});

// =================================================================
// SECTION: KPI ANNOUNCEMENTS & DATA CRUD
// =================================================================

app.get('/api/pagedata/kpi-announcements', authenticateToken, async (req, res) => {
    try {
        const [allItems] = await pool.query('SELECT *, AnnouncementID as rowIndex FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
        if (allItems.length === 0) return res.json({ current: null, past: [] });
        const currentItem = allItems.find(p => p.IsCurrent === 1) || allItems[0];
        const pastItems = allItems.filter(p => p.AnnouncementID !== currentItem.AnnouncementID);
        res.json({ current: currentItem, past: pastItems });
    } catch (error) {
        console.error('Error fetching KPI Announcements:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประกาศ KPI' });
    }
});

app.get('/api/kpiannouncements', authenticateToken, isAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT *, AnnouncementID as id FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลประกาศ KPI ได้' });
    }
});

app.post('/api/kpiannouncements', authenticateToken, isAdmin, async (req, res) => {
    const { AnnouncementTitle, EffectiveDate, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1');
        await pool.query(
            'INSERT INTO KPIAnnouncements (AnnouncementTitle, EffectiveDate, IsCurrent) VALUES (?, ?, ?)',
            [AnnouncementTitle, EffectiveDate, IsCurrent ? 1 : 0]
        );
        res.status(201).json({ success: true, message: 'สร้างประกาศ KPI ใหม่สำเร็จ' });
    } catch (error) {
        console.error('Error creating KPI announcement:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างประกาศได้' });
    }
});

app.put('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { AnnouncementTitle, EffectiveDate, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    try {
        if (IsCurrent) await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1 AND AnnouncementID != ?', [id]);
        await pool.query(
            'UPDATE KPIAnnouncements SET AnnouncementTitle = ?, EffectiveDate = ?, IsCurrent = ? WHERE AnnouncementID = ?',
            [AnnouncementTitle, EffectiveDate, IsCurrent ? 1 : 0, id]
        );
        res.json({ success: true, message: 'อัปเดตประกาศสำเร็จ' });
    } catch (error) {
        console.error('Error updating KPI announcement:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตประกาศได้' });
    }
});

app.delete('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM KPIAnnouncements WHERE AnnouncementID = ?', [id]);
        res.json({ success: true, message: 'ลบประกาศสำเร็จ' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบประกาศได้' });
    }
});

app.get('/api/kpidata/:year', authenticateToken, async (req, res) => {
    const { year } = req.params;
    try {
        const [data] = await pool.query('SELECT *, id as rowIndex FROM KPIData WHERE Year = ?', [year]);
        res.json(data);
    } catch (error) {
        console.error(`Error fetching KPI Data for year ${year}:`, error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล KPI' });
    }
});

// FIX: whitelist fields to prevent mass assignment
const KPI_DATA_FIELDS = [
    'Year', 'AnnouncementID', 'Metric', 'Department', 'Target', 'Unit',
    'Direction', 'Weight',
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Bulk update: PUT /api/kpidata/bulk  — must be declared BEFORE /:id route
app.put('/api/kpidata/bulk', authenticateToken, isAdmin, async (req, res) => {
    const updates = req.body;
    if (!Array.isArray(updates) || updates.length === 0)
        return res.json({ success: true, updated: 0 });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let updated = 0;
        for (const row of updates) {
            const { id, ...fields } = row;
            if (!id) continue;
            const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => KPI_DATA_FIELDS.includes(k)));
            if (Object.keys(safe).length === 0) continue;
            await conn.query('UPDATE KPIData SET ? WHERE id = ?', [safe, id]);
            updated++;
        }
        await conn.commit();
        res.json({ success: true, updated });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/kpidata', authenticateToken, isAdmin, async (req, res) => {
    const safeData = Object.fromEntries(Object.entries(req.body).filter(([k]) => KPI_DATA_FIELDS.includes(k)));
    if (Object.keys(safeData).length === 0) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }
    try {
        await pool.query('INSERT INTO KPIData SET ?', safeData);
        res.status(201).json({ success: true, message: 'เพิ่มตัวชี้วัด KPI ใหม่สำเร็จ' });
    } catch (error) {
        console.error('Error creating KPI data:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มตัวชี้วัดได้' });
    }
});

app.put('/api/kpidata/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const safeData = Object.fromEntries(Object.entries(req.body).filter(([k]) => KPI_DATA_FIELDS.includes(k)));
    if (Object.keys(safeData).length === 0) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }
    try {
        await pool.query('UPDATE KPIData SET ? WHERE id = ?', [safeData, id]);
        res.json({ success: true, message: 'อัปเดตข้อมูล KPI สำเร็จ' });
    } catch (error) {
        console.error('Error updating KPI data:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

app.delete('/api/kpidata/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM KPIData WHERE id = ?', [id]);
        res.json({ success: true, message: 'ลบตัวชี้วัดสำเร็จ' });
    } catch (error) {
        console.error('Error deleting KPI data:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบตัวชี้วัดได้' });
    }
});

// =================================================================
// SECTION: DOCUMENT UPLOAD
// =================================================================

app.post('/api/upload/document', authenticateToken, isAdmin, upload.single('document'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    res.json({ success: true, message: 'File uploaded successfully', url: req.file.path });
});

// =================================================================
// SECTION 4: ROUTE MOUNTS
// FIX: all 4 routers were mounted WITHOUT any auth middleware
// =================================================================
app.use('/api/patrol',          authenticateToken, patrolRoutes);
app.use('/api/admin',          authenticateToken, isAdmin, adminRoutes);
app.use('/api/cccf',           authenticateToken, cccfRoutes);
app.use('/api/master',         authenticateToken, masterRoutes);
app.use('/api/machine-safety', authenticateToken, machineSafetyRoutes);
app.use('/api/ojt',           authenticateToken, ojtRoutes);
app.use('/api/training',      authenticateToken, trainingRoutes);
app.use('/api/accident',      authenticateToken, accidentRoutes);
app.use('/api/yokoten',        authenticateToken, yokotenRoutes);
app.use('/api/safety-culture', authenticateToken, safetyCultureRoutes);
app.use('/api/contractor',    authenticateToken, contractorRoutes);
app.use('/api/hiyari',        authenticateToken, hiyariRoutes);
app.use('/api/ky',            authenticateToken, kyRoutes);
app.use('/api/fourm',         authenticateToken, fourmRoutes);
app.use('/api/settings',          authenticateToken, settingsRoutes);
app.use('/api/activity-targets',  authenticateToken, activityTargetsRoutes);

// =================================================================
// SECTION 4B: GENERIC CRUD
// FIX: removed 'Employees' from this list — handled separately below
// with proper auth and correct primary key (EmployeeID, not id)
// =================================================================
const tablesForCrud = [
    'Patrol_Sessions', 'Patrol_Attendance', 'Patrol_Issues',
    'CCCF_Activity', 'CCCF_Targets', 'ManHours', 'AccidentReports',
    'TrainingStatus', 'SCW_Documents', 'OJT_Department_Status',
    'Machines', 'Documents', 'Document_Machine_Links', 'YokotenTopics', 'YokotenResponses',
];

tablesForCrud.forEach(table => {
    const endpoint = `/api/${table.toLowerCase()}`;

    app.get(endpoint, authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ status: 'error', message: `Could not fetch data from ${table}` });
        }
    });

    app.post(endpoint, authenticateToken, async (req, res) => {
        try {
            const columns = Object.keys(req.body);
            const values  = Object.values(req.body);
            await pool.query(`INSERT INTO \`${table}\` (\`${columns.join('`,`')}\`) VALUES (?)`, [values]);
            res.status(201).json({ status: 'success', message: 'เพิ่มข้อมูลใหม่สำเร็จ' });
        } catch (error) {
            console.error(`Error adding to ${table}:`, error);
            res.status(500).json({ status: 'error', message: `Could not add data to ${table}` });
        }
    });

    app.put(`${endpoint}/:id`, authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const columns = Object.keys(req.body).map(k => `\`${k}\` = ?`).join(',');
            const values  = [...Object.values(req.body), id];
            const [result] = await pool.query(`UPDATE \`${table}\` SET ${columns} WHERE id = ?`, values);
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Item not found for update' });
            }
            res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });
        } catch (error) {
            console.error(`Error updating ${table}:`, error);
            res.status(500).json({ status: 'error', message: `Could not update data in ${table}` });
        }
    });

    app.delete(`${endpoint}/:id`, authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const [result] = await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
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
// SECTION: EMPLOYEES MANAGEMENT
// FIX: all endpoints were missing authenticateToken — unprotected
// FIX: POST/PUT/DELETE now require isAdmin
// =================================================================

app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Employees ORDER BY EmployeeName ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลพนักงานได้' });
    }
});

app.get('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลพนักงานได้' });
    }
});

app.post('/api/employees', authenticateToken, isAdmin, async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Position, Role, Team } = req.body;
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
        res.status(500).json({ success: false, message: 'ไม่สามารถเพิ่มพนักงานได้' });
    }
});

app.put('/api/employees/:id', authenticateToken, isAdmin, async (req, res) => {
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
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลพนักงานได้' });
    }
});

app.delete('/api/employees/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลพนักงานได้' });
    }
});

// Employee Bulk Import
// FIX: was missing auth entirely — anyone could set Role = 'Admin' (privilege escalation)
app.post('/api/admin/employees/import', authenticateToken, isAdmin, async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, message: 'Invalid data' });
    }
    // Whitelist allowed roles — prevent privilege escalation via import
    const allowedRoles = ['Admin', 'User', 'Viewer'];
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const emp of data) {
            const position = emp.Position || emp.Team || '';
            const role = allowedRoles.includes(emp.Role) ? emp.Role : 'User';
            await connection.query(
                `INSERT INTO Employees (EmployeeID, EmployeeName, Department, Position, Role)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   EmployeeName = VALUES(EmployeeName),
                   Department   = VALUES(Department),
                   Position     = VALUES(Position),
                   Role         = VALUES(Role)`,
                [emp.EmployeeID, emp.EmployeeName, emp.Department, position, role]
            );
        }
        await connection.commit();
        res.json({ success: true, message: `Imported ${data.length} rows` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: 'ไม่สามารถนำเข้าข้อมูลได้' });
    } finally {
        connection.release();
    }
});

// =================================================================
// SECTION 5: START THE SERVER
// =================================================================
const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
