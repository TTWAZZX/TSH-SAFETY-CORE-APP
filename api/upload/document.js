// api/upload/document.js
const jwt = require('jsonwebtoken');

function auth(req) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) throw Object.assign(new Error('No token'), { status: 401 });
  try { return jwt.verify(token, process.env.JWT_SECRET || ''); }
  catch { throw Object.assign(new Error('Token invalid'), { status: 403 }); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const user = auth(req);
    if (user.role !== 'Admin') return res.status(403).json({ success:false, message:'Admin only' });

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
    const status = e.status || 500;
    res.status(status).json({ success:false, message:e.message || 'Upload error' });
  }
};
