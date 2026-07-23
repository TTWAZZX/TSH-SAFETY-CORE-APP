// backend/storage.js
// Local server file storage for uploaded images/documents.
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function getUploadBaseUrl(req) {
    const configured = (process.env.PUBLIC_UPLOAD_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

function cleanOriginalFilename(name) {
    let rawName = String(name || 'upload');
    if (/[Ãà¸à¹]/.test(rawName)) {
        const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
        if (decoded && !decoded.includes('\uFFFD')) rawName = decoded;
    }
    const looksMojibake = /[ÃÂ]|à¸|à¹|â€|â€™|â€“|â€”/.test(rawName);
    if (looksMojibake) {
        const candidates = [
            Buffer.from(rawName, 'latin1').toString('utf8'),
            Buffer.from(rawName, 'binary').toString('utf8'),
        ];
        const decoded = candidates.find(v => v && !v.includes('\uFFFD') && v !== rawName);
        if (decoded) rawName = decoded;
    }

    return path.basename(rawName)
        .replace(/[\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'upload';
}

function appendFilenameMetadata(publicUrl, originalName) {
    const cleanName = cleanOriginalFilename(originalName);
    return `${publicUrl}?filename=${encodeURIComponent(cleanName)}`;
}

const disk = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const extFromMime = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.ms-excel': '.xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.ms-powerpoint': '.ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        };
        const originalExt = path.extname(file.originalname || '').toLowerCase();
        const ext = originalExt || extFromMime[file.mimetype] || '';
        const id = crypto.randomBytes(8).toString('hex');
        cb(null, `${Date.now()}-${id}${ext}`);
    },
});

const storage = {
    _handleFile(req, file, cb) {
        disk._handleFile(req, file, (err, info) => {
            if (err) return cb(err);
            const publicUrl = `${getUploadBaseUrl(req)}/uploads/${info.filename}`;
            cb(null, {
                ...info,
                originalName: cleanOriginalFilename(file.originalname),
                path: appendFilenameMetadata(publicUrl, file.originalname),
                publicUrl: appendFilenameMetadata(publicUrl, file.originalname),
                storedName: info.filename,
            });
        });
    },
    _removeFile(req, file, cb) {
        disk._removeFile(req, file, cb);
    },
};

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
        cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
};

function deleteLocalUpload(fileUrl) {
    if (!fileUrl) return false;
    let pathname = fileUrl;
    try {
        pathname = new URL(fileUrl).pathname;
    } catch (_) {
        // Accept legacy relative paths.
    }

    if (!pathname.includes('/uploads/')) return false;
    const absPath = path.join(uploadsDir, path.basename(pathname));
    if (!absPath.startsWith(uploadsDir)) return false;
    if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        return true;
    }
    return false;
}

module.exports = { storage, fileFilter, deleteLocalUpload, uploadsDir, cleanOriginalFilename };
