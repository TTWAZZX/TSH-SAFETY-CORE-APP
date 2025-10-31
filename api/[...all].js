// api/[...all].js
const serverlessExpress = require('@vendia/serverless-express');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// -------- DB: lazy-require + TLS ในโค้ด --------
let pool = null;
async function getPool() {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error('DATABASE_URL missing');
    err.code = 'NO_DB_URL';
    throw err;
  }

  let mysql;
  try {
    // <<< lazy require ที่นี่เท่านั้น >>>
    mysql = require('mysql2/promise');
  } catch (e) {
    // module ไม่ได้อยู่ใน dependencies
    e.code = e.code || 'MYSQL2_NOT_FOUND';
    throw e;
  }

  pool = await mysql.createPool({
    uri: url,                              // เช่น mysql://user:pass@host:4000/db
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  return pool;
}

// -------- Auth --------
function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ success:false, message:'No token' });
  jwt.verify(token, process.env.JWT_SECRET || '', (err, user) => {
    if (err) return res.status(403).json({ success:false, message:'Token invalid' });
    req.user = user; next();
  });
}
function isAdmin(req, res, next) {
  return (req.user?.role === 'Admin')
    ? next()
    : res.status(403).json({ success:false, message:'Admin only' });
}

// -------- Health (ไม่พังเงียบอีก) --------
app.get('/api/health', async (req, res) => {
  try {
    const haveEnv = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET
    };
    const p = await getPool(); // ถ้า mysql2 ไม่มี/DB ต่อไม่ได้ จะ throw มาตรงนี้
    const [rows] = await p.query('SELECT VERSION() AS version');
    res.json({ ok:true, env: haveEnv, db:{ ok:true, version: rows?.[0]?.version || null } });
  } catch (e) {
    console.error('HEALTH ERROR:', e);
    res.status(500).json({
      ok:false,
      code: e.code || e.name,
      message: e.message,
      errno: e.errno,
      sqlState: e.sqlState,
      address: e.address,
      port: e.port,
      host: e.host
    });
  }
});

// -------- Login ตัวอย่าง --------
app.post('/api/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body || {};
    const p = await getPool();
    const [rows] = await p.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
    const user = rows?.[0];
    if (!user) return res.status(401).json({ success:false, message:'รหัสพนักงานไม่ถูกต้อง' });
    if (password !== user.EmployeeID) return res.status(401).json({ success:false, message:'รหัสผ่านไม่ถูกต้อง' });

    const userData = { id:user.EmployeeID, name:user.EmployeeName, department:user.Department, role:user.Role, team:user.Team };
    const token = jwt.sign(userData, process.env.JWT_SECRET || 'dev', { expiresIn: '6h' });
    res.json({ success:true, user:userData, token });
  } catch (e) {
    console.error('LOGIN ERROR:', e);
    res.status(500).json({ success:false, code: e.code || e.name, message: e.message });
  }
});

// -------- Upload: lazy-init cloudinary/multer ตอนเรียกใช้ --------
app.post('/api/upload/document', authenticateToken, isAdmin, async (req, res) => {
  try {
    const multer = require('multer');
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
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
          overwrite: true
        };
      }
    });

    const upload = multer({ storage }).single('document');
    upload(req, res, (err) => {
      if (err) { console.error('UPLOAD ERROR:', err); return res.status(500).json({ success:false, message:'Upload failed' }); }
      if (!req.file?.path) return res.status(400).json({ success:false, message:'No file' });
      res.status(201).json({ success:true, fileUrl: req.file.path });
    });
  } catch (e) {
    console.error('UPLOAD INIT ERROR:', e);
    res.status(500).json({ success:false, code: e.code || e.name, message: e.message });
  }
});

module.exports = serverlessExpress({ app });
