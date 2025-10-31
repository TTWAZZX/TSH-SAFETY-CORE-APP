// api/[...all].js
// Express catch-all สำหรับ /api/* บน Vercel

const serverlessExpress = require('@vendia/serverless-express');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ---------- Cloudinary (ไม่ทำให้ล้มถ้า ENV ยังไม่ครบ) ----------
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || undefined,
    api_key:    process.env.CLOUDINARY_API_KEY || undefined,
    api_secret: process.env.CLOUDINARY_API_SECRET || undefined,
  });
} catch (e) {
  console.error('Cloudinary config error:', e);
}

let storage;
try {
  storage = new CloudinaryStorage({
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
} catch (e) {
  console.error('Cloudinary storage init error:', e);
}
const upload = multer({ storage });

// ---------- DB Pool (บังคับ TLS ในโค้ด ไม่พึ่ง query string) ----------
let pool;
async function getPool() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      const err = new Error('DATABASE_URL is missing');
      err.code = 'NO_DB_URL';
      throw err;
    }
    // ใช้รูปแบบ: mysql://user:pass@host:port/dbname   (ไม่มีพารามิเตอร์ ssl)
    pool = await mysql.createPool({
      uri: dbUrl,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

// ---------- Auth ----------
function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ success:false, message:'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET || '', (err, user) => {
    if (err) return res.status(403).json({ success:false, message:'Token invalid' });
    req.user = user; next();
  });
}
function isAdmin(req, res, next) {
  if (req.user?.role === 'Admin') return next();
  return res.status(403).json({ success:false, message:'Permission denied. Admin only.' });
}

// ---------- Health Endpoints ----------
// ping: ไม่แตะ DB กันไว้ก่อน
app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

// health: เช็ค ENV ก่อน แล้วจึงลองต่อ DB
app.get('/api/health', async (req, res) => {
  try {
    const env = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME
    };
    if (!env.DATABASE_URL) {
      return res.status(500).json({ ok:false, message:'DATABASE_URL missing', code:'NO_DB_URL', env });
    }

    const pool = await getPool();
    const [rows] = await pool.query('SELECT VERSION() AS version');
    res.json({ ok:true, env, db:{ ok:true, version: rows?.[0]?.version || null } });
  } catch (e) {
    console.error('HEALTH ERROR:', e);
    res.status(500).json({
      ok:false,
      message: e.message || 'health failed',
      name: e.name,
      code: e.code
    });
  }
});

// ---------- Routes หลัก (ตัวอย่าง) ----------
app.post('/api/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body || {};
    const pool = await getPool();
    const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
    const user = rows?.[0];
    if (!user) return res.status(401).json({ success:false, message:'รหัสพนักงานไม่ถูกต้อง' });
    if (password !== user.EmployeeID) return res.status(401).json({ success:false, message:'รหัสผ่านไม่ถูกต้อง' });

    const userData = { id:user.EmployeeID, name:user.EmployeeName, department:user.Department, role:user.Role, team:user.Team };
    const token = jwt.sign(userData, process.env.JWT_SECRET || 'devsecret', { expiresIn: '6h' });
    res.json({ success:true, user:userData, token });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ success:false, message: err.code === 'NO_DB_URL' ? 'DATABASE_URL missing' : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// Upload document (admin only)
app.post('/api/upload/document', authenticateToken, isAdmin, upload.single('document'), (req, res) => {
  if (!req.file?.path) return res.status(400).json({ success:false, message:'Upload failed' });
  res.status(201).json({ success:true, fileUrl: req.file.path });
});

// TODO: เพิ่ม routes อื่น ๆ ของคุณ (pagedata/committees/kpi/...)

// ---------- Export Serverless ----------
module.exports = serverlessExpress({ app });
