// api/[...all].js
// Express on Vercel with catch-all route: /api/*
// ไม่ต้องมี vercel.json ก็จับทุกเส้นทาง /api/... ให้ Express ได้

const serverlessExpress = require('@vendia/serverless-express');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// ---------- MIDDLEWARE ----------
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ---------- DATABASE POOL ----------
let pool;
async function getPool() {
  if (!pool) {
    pool = await mysql.createPool({
      uri: process.env.DATABASE_URL,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

// ---------- CLOUDINARY ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: (file) => {
    let resource_type = 'raw';
    if (file.mimetype?.startsWith('image')) resource_type = 'image';
    else if (file.mimetype?.startsWith('video')) resource_type = 'video';
    return {
      folder: 'tsh_safety_app',
      public_id: `${Date.now()}-${(file.originalname || 'file').replace(/\s+/g,'_')}`,
      resource_type,
      access_mode: 'public',
      overwrite: true,
    };
  }
});
const upload = multer({ storage });

// ---------- AUTH ----------
function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ success:false, message:'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success:false, message:'Token invalid' });
    req.user = user;
    next();
  });
}
function isAdmin(req, res, next) {
  if (req.user?.role === 'Admin') return next();
  return res.status(403).json({ success:false, message:'Permission denied. Admin only.' });
}

// ---------- ROUTES ตัวอย่างหลัก (คัดจาก server.js คุณมาใส่เพิ่มได้) ----------

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body || {};
    const pool = await getPool();
    const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
    const user = rows?.[0];
    if (!user)      return res.status(401).json({ success:false, message:'รหัสพนักงานไม่ถูกต้อง' });
    if (password !== user.EmployeeID)
                    return res.status(401).json({ success:false, message:'รหัสผ่านไม่ถูกต้อง' });

    const userData = {
      id: user.EmployeeID,
      name: user.EmployeeName,
      department: user.Department,
      role: user.Role,
      team: user.Team,
    };
    const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
    res.json({ success:true, user: userData, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message:'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// Verify session
app.post('/api/session/verify', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.json({ success:false });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.json({ success:false });
    const { iat, exp, ...safeUser } = user;
    const newToken = jwt.sign(safeUser, process.env.JWT_SECRET, { expiresIn: '6h' });
    res.json({ success:true, user: safeUser, token: newToken });
  });
});

// PageData: Policies (ตัวอย่าง)
app.get('/api/pagedata/policies', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT *, id as rowIndex FROM Policies ORDER BY EffectiveDate DESC');
    if (!rows?.length) return res.json({ current:null, past:[] });
    const current = rows.find(p => p.IsCurrent === 1) || rows[0];
    const past = rows.filter(p => p.id !== current.id);
    res.json({ current, past });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:'เกิดข้อผิดพลาดในการดึงข้อมูลนโยบาย' });
  }
});

// Upload (admin only)
app.post('/api/upload/document', authenticateToken, isAdmin, upload.single('document'), (req, res) => {
  if (!req.file?.path) return res.status(400).json({ success:false, message:'Upload failed' });
  res.status(201).json({ success:true, fileUrl: req.file.path });
});

// TODO: เพิ่ม routes อื่น ๆ ของคุณที่นี่ (committees / kpi / kpiannouncements / patrol-cccf / yokoten ...)
// ----- HEALTH CHECK (วางเหนือ module.exports) -----
app.get('/api/health', async (req, res) => {
  try {
    const env = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
    };

    // ทดสอบต่อ DB
    const pool = await getPool();
    const [rows] = await pool.query('SELECT VERSION() AS version');
    res.json({
      ok: true,
      env,
      db: { ok: true, version: rows?.[0]?.version || null }
    });
  } catch (e) {
    console.error('HEALTH ERROR:', e);
    res.status(500).json({
      ok: false,
      message: e.message || 'health failed',
      name: e.name,
      code: e.code
    });
  }
});

// ----- TEMP: test login without DB (ลบออกเมื่อเสร็จ)
app.post('/api/test-login', (req, res) => {
  const { employeeId } = req.body || {};
  if (!employeeId) return res.status(400).json({ success:false, message:'no id' });
  const userData = { id: employeeId, name: 'Test User', department: 'IT', role: 'Admin', team: 'Core' };
  const token = jwt.sign(userData, process.env.JWT_SECRET || 'devsecret', { expiresIn: '6h' });
  res.json({ success: true, user: userData, token });
});


module.exports = serverlessExpress({ app });

