// backend/cloudinary.js
// Shared Cloudinary configuration used by server.js and patrol.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        let resource_type = 'raw';
        if (file.mimetype.startsWith('image/')) resource_type = 'image';
        else if (file.mimetype.startsWith('video/')) resource_type = 'video';

        // Sanitize filename: keep only safe characters, limit length
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

module.exports = { cloudinary, storage, fileFilter };
