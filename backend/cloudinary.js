// backend/cloudinary.js
// Shared Cloudinary configuration used by server.js and patrol.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs   = require('fs');

const isLocal = (process.env.STORAGE_MODE || 'cloudinary') === 'local';

// ── Cloudinary config (always init in case it's needed elsewhere) ──────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Storage backend ─────────────────────────────────────────────────────────
let storage;

if (isLocal) {
    // Save files to backend/uploads/ for localhost testing.
    // We wrap diskStorage to set file.path → /uploads/<filename>
    // so all route files using req.file.path get a usable URL with zero changes.
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const disk = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const safeName = path
                .basename(file.originalname)
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .substring(0, 80);
            cb(null, `${Date.now()}-${safeName}`);
        },
    });

    // Custom storage engine: wraps disk but overrides file.path to a URL
    storage = {
        _handleFile(req, file, cb) {
            disk._handleFile(req, file, (err, info) => {
                if (err) return cb(err);
                cb(null, { ...info, path: `/uploads/${info.filename}` });
            });
        },
        _removeFile(req, file, cb) {
            disk._removeFile(req, file, cb);
        },
    };
} else {
    storage = new CloudinaryStorage({
        cloudinary,
        params: (req, file) => {
            let resource_type = 'raw';
            if (file.mimetype.startsWith('image/')) resource_type = 'image';
            else if (file.mimetype.startsWith('video/')) resource_type = 'video';

            const safeName = path
                .basename(file.originalname)
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .substring(0, 80);

            return {
                folder: 'tsh_safety_app',
                public_id: `${Date.now()}-${safeName}`,
                resource_type,
                access_mode: 'public',
                overwrite: true,
            };
        },
    });
}

// Allow images, PDFs, and MS Office documents only
const fileFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`ประเภทไฟล์ไม่รองรับ: ${file.mimetype}`), false);
    }
};

module.exports = { cloudinary, storage, fileFilter, isLocal };
