const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { logAudit } = require('../utils/audit');
const { isAdmin } = require('../middleware/auth');

const privateDir = path.join(__dirname, '..', 'private-uploads', 'file-library');
fs.mkdirSync(privateDir, { recursive: true });

const extensionRules = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const inlineTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const clean = (value, max) => String(value || '').replace(/[\r\n\0]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const actor = req => clean(req.user?.id || req.user?.EmployeeID || 'system', 50);
const token = () => crypto.randomBytes(32).toString('base64url');
const categoryCodePattern = /^(?:[A-Z][A-Z0-9_]{1,79})$/;
const originalName = value => {
    const raw = String(value || '').replace(/[\r\n\0]/g, ' ').trim();
    if (!/[\u0080-\u00FF]/.test(raw) || /[^\u0000-\u00FF]/.test(raw)) return clean(raw, 255);
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    return clean(decoded && !decoded.includes('\uFFFD') ? decoded : raw, 255);
};
const storedName = ext => `${Date.now()}-${crypto.randomBytes(18).toString('hex')}${ext}`;
const filePath = name => {
    const safe = path.basename(String(name || ''));
    const target = path.join(privateDir, safe);
    return safe && target.startsWith(privateDir) ? target : null;
};
const sha256 = target => crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');

function verifiedMime(target, extension) {
    const data = fs.readFileSync(target);
    const ascii = data.subarray(0, 16).toString('ascii');
    if (extensionRules[extension] === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
    if (extensionRules[extension] === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
    if (extensionRules[extension] === 'image/webp' && ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
    if (extensionRules[extension] === 'application/pdf' && ascii.startsWith('%PDF-')) return 'application/pdf';
    if (['.docx', '.xlsx', '.pptx'].includes(extension) && data[0] === 0x50 && data[1] === 0x4b) {
        const archiveIndex = data.toString('latin1');
        if (extension === '.docx' && archiveIndex.includes('word/')) return extensionRules[extension];
        if (extension === '.xlsx' && archiveIndex.includes('xl/')) return extensionRules[extension];
        if (extension === '.pptx' && archiveIndex.includes('ppt/')) return extensionRules[extension];
    }
    return null;
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, privateDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, storedName(Object.prototype.hasOwnProperty.call(extensionRules, ext) ? ext : ''));
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(Object.prototype.hasOwnProperty.call(extensionRules, ext) ? null : new Error('FILE_TYPE_NOT_ALLOWED'), true);
    },
});

function uploadOne(req, res, next) {
    upload.single('file')(req, res, err => {
        if (!err) return next();
        return res.status(400).json({ success: false, code: err.code || 'FILE_UPLOAD_REJECTED', message: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ต้องมีขนาดไม่เกิน 25 MB' : 'รองรับเฉพาะ JPG, PNG, WebP, PDF, DOCX, XLSX และ PPTX' });
    });
}

function publicUrl(req, publicToken) {
    const configured = String(process.env.PUBLIC_API_URL || '').replace(/\/+$/, '').replace(/\/api$/i, '');
    const base = configured || `${req.protocol}://${req.get('host')}`;
    return `${base}/api/public/file-library/${encodeURIComponent(publicToken)}`;
}

function authenticatedUrl(req, publicToken) {
    const configured = String(process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
    const origin = String(req.get('origin') || '').replace(/\/+$/, '');
    const base = configured || origin || `${req.protocol}://${req.get('host')}`;
    return `${base}/index.html#file-library=${encodeURIComponent(publicToken)}`;
}

function itemDto(req, row) {
    return {
        id: Number(row.id), title: row.Title, description: row.Description || '', category: row.Category || '',
        categoryDetail: row.CategoryDetail || '',
        originalName: originalName(row.OriginalName), mimeType: row.MimeType, fileExtension: row.FileExtension,
        fileSize: Number(row.FileSize), status: row.Status, accessMode: row.AccessMode || 'Public',
        deliveryMode: row.DeliveryMode || 'Auto', expiresAt: row.ExpiresAt,
        publishedAt: row.PublishedAt, createdAt: row.CreatedAt, updatedAt: row.UpdatedAt,
        uploadedBy: row.UploadedBy, viewCount: Number(row.ViewCount || 0), lastAccessedAt: row.LastAccessedAt,
        rowVersion: Number(row.RowVersion), publicToken: row.PublicToken,
        url: (row.AccessMode || 'Public') === 'Authenticated' ? authenticatedUrl(req, row.PublicToken) : publicUrl(req, row.PublicToken),
        canPreview: inlineTypes.has(row.MimeType) && (row.DeliveryMode || 'Auto') !== 'Download',
    };
}

function categoryDto(row) {
    return {
        id: Number(row.id), code: row.Code, labelTh: row.LabelTh, labelEn: row.LabelEn || '',
        sortOrder: Number(row.SortOrder), isActive: Boolean(row.IsActive), isSystem: Boolean(row.IsSystem),
    };
}

async function categoryCatalog(includeInactive = true) {
    const [rows] = await db.query(`SELECT * FROM FileLibrary_Categories${includeInactive ? '' : ' WHERE IsActive=1'} ORDER BY IsActive DESC,SortOrder,LabelTh,id`);
    return rows.map(categoryDto);
}

async function category(value, activeOnly = true) {
    const code = clean(value, 80);
    if (!categoryCodePattern.test(code)) return null;
    const [[row]] = await db.query(`SELECT Code FROM FileLibrary_Categories WHERE Code=?${activeOnly ? ' AND IsActive=1' : ''} LIMIT 1`, [code]);
    return row?.Code || null;
}

function categoryDetail(code, value) {
    const detail = clean(value, 120);
    if (code === 'OTHER' && !detail) return null;
    return code === 'OTHER' ? detail : '';
}

function sendItem(res, row, target) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-File-Library-Access', row.AccessMode || 'Public');
    res.setHeader('Content-Type', row.MimeType);
    const disposition = (row.DeliveryMode || 'Auto') !== 'Download' && inlineTypes.has(row.MimeType) ? 'inline' : 'attachment';
    const downloadName = originalName(row.OriginalName) || 'download';
    const fallback = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    db.query('UPDATE FileLibrary_Items SET ViewCount=ViewCount+1,LastAccessedAt=NOW() WHERE id=?', [row.id]).catch(() => {});
    return res.sendFile(target);
}

const publicRouter = express.Router();
publicRouter.use(rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));
publicRouter.get('/:token', async (req, res) => {
    const publicToken = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(publicToken)) return res.status(404).end();
    const [[row]] = await db.query("SELECT * FROM FileLibrary_Items WHERE PublicToken=? AND AccessMode='Public' AND Status='Published' AND (ExpiresAt IS NULL OR ExpiresAt>NOW()) LIMIT 1", [publicToken]);
    const target = row && filePath(row.StoredName);
    if (!row || !target || !fs.existsSync(target)) return res.status(404).end();
    return sendItem(res, row, target);
});

const authenticatedRouter = express.Router();
authenticatedRouter.use(rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
authenticatedRouter.get('/:token', async (req, res) => {
    const publicToken = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(publicToken)) return res.status(404).end();
    const [[row]] = await db.query("SELECT * FROM FileLibrary_Items WHERE PublicToken=? AND Status='Published' AND (ExpiresAt IS NULL OR ExpiresAt>NOW()) LIMIT 1", [publicToken]);
    const target = row && filePath(row.StoredName);
    if (!row || !target || !fs.existsSync(target)) return res.status(404).end();
    return sendItem(res, row, target);
});

const adminRouter = express.Router();
adminRouter.get('/', isAdmin, async (req, res) => {
    const q = clean(req.query.q, 120), status = clean(req.query.status, 16), categoryFilter = clean(req.query.category, 80);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1), limit = 20, offset = (page - 1) * limit;
    const where = [], params = [];
    if (['Draft', 'Published', 'Revoked'].includes(status)) { where.push('Status=?'); params.push(status); }
    if (categoryCodePattern.test(categoryFilter)) { where.push('Category=?'); params.push(categoryFilter); }
    if (q) { where.push('(Title LIKE ? OR OriginalName LIKE ? OR Category LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [countResult, rowsResult, summaryResult, categories] = await Promise.all([
        db.query(`SELECT COUNT(*) total FROM FileLibrary_Items${clause}`, params),
        db.query(`SELECT * FROM FileLibrary_Items${clause} ORDER BY CreatedAt DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
        db.query("SELECT COUNT(*) total,SUM(Status='Published' AND (ExpiresAt IS NULL OR ExpiresAt>NOW())) published,SUM(Status='Draft') drafts,SUM(Status='Revoked' OR (ExpiresAt IS NOT NULL AND ExpiresAt<=NOW())) unavailable,COALESCE(SUM(FileSize),0) bytes FROM FileLibrary_Items"),
        categoryCatalog(true),
    ]);
    const count = countResult[0][0], rows = rowsResult[0], summary = summaryResult[0][0];
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { rows: rows.map(row => itemDto(req, row)), categories, page, total: Number(count.total), totalPages: Math.max(1, Math.ceil(Number(count.total) / limit)), summary: Object.fromEntries(Object.entries(summary).map(([k,v]) => [k, Number(v || 0)])) } });
});

adminRouter.get('/categories', isAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: await categoryCatalog(true) });
});

adminRouter.post('/categories', isAdmin, async (req, res) => {
    const labelTh = clean(req.body.labelTh, 120), labelEn = clean(req.body.labelEn, 120);
    if (!labelTh) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_LABEL_REQUIRED', message: 'กรุณาระบุชื่อหมวดหมู่ภาษาไทย' });
    const code = `CUSTOM_${crypto.randomBytes(8).toString('hex').toUpperCase()}`, who = actor(req);
    const [result] = await db.query(`INSERT INTO FileLibrary_Categories(Code,LabelTh,LabelEn,SortOrder,IsActive,IsSystem,CreatedBy,UpdatedBy)
        SELECT ?,?,?,COALESCE(MAX(SortOrder),0)+10,1,0,?,? FROM FileLibrary_Categories`, [code, labelTh, labelEn || null, who, who]);
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_CATEGORY_CREATE', targetType: 'FileLibrary_Category', targetId: result.insertId, detail: `Created category ${code}`, metadata: { code, labelTh } });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Categories WHERE id=?', [result.insertId]);
    res.status(201).json({ success: true, data: categoryDto(row) });
});

adminRouter.put('/categories/:id', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), labelTh = clean(req.body.labelTh, 120), labelEn = clean(req.body.labelEn, 120);
    const sortOrder = Math.min(9999, Math.max(0, Number.parseInt(req.body.sortOrder, 10) || 0));
    if (!id || !labelTh) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_INVALID', message: 'ข้อมูลหมวดหมู่ไม่ถูกต้อง' });
    const [[current]] = await db.query('SELECT * FROM FileLibrary_Categories WHERE id=? LIMIT 1', [id]);
    if (!current) return res.status(404).json({ success: false, message: 'ไม่พบหมวดหมู่' });
    const isActive = current.Code === 'OTHER' ? 1 : (String(req.body.isActive) === 'false' || Number(req.body.isActive) === 0 ? 0 : 1);
    await db.query('UPDATE FileLibrary_Categories SET LabelTh=?,LabelEn=?,SortOrder=?,IsActive=?,UpdatedBy=? WHERE id=?', [labelTh, labelEn || null, sortOrder, isActive, actor(req), id]);
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_CATEGORY_UPDATE', targetType: 'FileLibrary_Category', targetId: id, detail: `Updated category ${current.Code}`, metadata: { code: current.Code, isActive: Boolean(isActive) } });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Categories WHERE id=?', [id]);
    res.json({ success: true, data: categoryDto(row) });
});

adminRouter.delete('/categories/:id', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_INVALID', message: 'รหัสหมวดหมู่ไม่ถูกต้อง' });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Categories WHERE id=? LIMIT 1', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'ไม่พบหมวดหมู่' });
    if (row.Code === 'OTHER') return res.status(409).json({ success: false, code: 'FILE_CATEGORY_OTHER_REQUIRED', message: 'หมวดหมู่อื่นๆ ต้องเปิดใช้งานเสมอ' });
    await db.query('UPDATE FileLibrary_Categories SET IsActive=0,UpdatedBy=? WHERE id=?', [actor(req), id]);
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_CATEGORY_ARCHIVE', targetType: 'FileLibrary_Category', targetId: id, detail: `Archived category ${row.Code}`, metadata: { code: row.Code } });
    res.json({ success: true, message: 'ปิดใช้งานหมวดหมู่แล้ว โดยไฟล์เดิมยังคงข้อมูลครบถ้วน' });
});

adminRouter.post('/', isAdmin, uploadOne, async (req, res) => {
    let keep = false;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์' });
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        const mime = verifiedMime(req.file.path, ext);
        if (!mime) return res.status(400).json({ success: false, code: 'FILE_SIGNATURE_INVALID', message: 'เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่อนุญาต' });
        const normalizedOriginalName = originalName(req.file.originalname);
        const title = clean(req.body.title || path.basename(normalizedOriginalName, ext), 200);
        if (!title) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อไฟล์' });
        const categoryCode = await category(req.body.category);
        const categoryDetailValue = categoryDetail(categoryCode, req.body.categoryDetail);
        if (!categoryCode) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_INVALID', message: 'กรุณาเลือกหมวดหมู่ที่เปิดใช้งาน' });
        if (categoryDetailValue === null) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_DETAIL_REQUIRED', message: 'กรุณาระบุรายละเอียดเมื่อเลือกหมวดหมู่อื่นๆ' });
        const status = String(req.body.publishNow || '1') === '0' ? 'Draft' : 'Published';
        const accessMode = String(req.body.accessMode || 'Public');
        const deliveryMode = String(req.body.deliveryMode || 'Auto');
        if (!['Public', 'Authenticated'].includes(accessMode) || !['Auto', 'Download'].includes(deliveryMode)) {
            return res.status(400).json({ success: false, code: 'FILE_ACCESS_INVALID', message: 'รูปแบบการเข้าถึงไฟล์ไม่ถูกต้อง' });
        }
        const expiresAt = clean(req.body.expiresAt, 30) || null;
        if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return res.status(400).json({ success: false, message: 'วันหมดอายุไม่ถูกต้อง' });
        const publicToken = token(), who = actor(req);
        const [result] = await db.query(`INSERT INTO FileLibrary_Items(PublicToken,Title,Description,Category,CategoryDetail,OriginalName,StoredName,MimeType,FileExtension,FileSize,ContentSha256,Status,AccessMode,DeliveryMode,ExpiresAt,PublishedAt,UploadedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,${status === 'Published' ? 'NOW()' : 'NULL'},?,?)`, [publicToken, title, clean(req.body.description, 1000) || null, categoryCode, categoryDetailValue || null, normalizedOriginalName, path.basename(req.file.filename), mime, ext.slice(1), req.file.size, sha256(req.file.path), status, accessMode, deliveryMode, expiresAt, who, who]);
        keep = true;
        await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_UPLOAD', targetType: 'FileLibrary_Item', targetId: result.insertId, detail: `Uploaded ${title}`, metadata: { mime, size: req.file.size, status, accessMode, deliveryMode } });
        const [[row]] = await db.query('SELECT * FROM FileLibrary_Items WHERE id=?', [result.insertId]);
        return res.status(201).json({ success: true, data: itemDto(req, row) });
    } finally {
        if (!keep && req.file?.path) fs.rmSync(req.file.path, { force: true });
    }
});

adminRouter.put('/:id', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), version = Number.parseInt(req.body.rowVersion, 10);
    if (!id || !version) return res.status(400).json({ success: false, message: 'ข้อมูลเวอร์ชันไม่ถูกต้อง' });
    const status = clean(req.body.status, 16);
    const accessMode = String(req.body.accessMode || 'Public');
    const deliveryMode = String(req.body.deliveryMode || 'Auto');
    if (!['Public', 'Authenticated'].includes(accessMode) || !['Auto', 'Download'].includes(deliveryMode)) {
        return res.status(400).json({ success: false, code: 'FILE_ACCESS_INVALID', message: 'รูปแบบการเข้าถึงไฟล์ไม่ถูกต้อง' });
    }
    if (!['Draft', 'Published'].includes(status)) return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
    const title = clean(req.body.title, 200), expiresAt = clean(req.body.expiresAt, 30) || null;
    const categoryCode = await category(req.body.category);
    if (!categoryCode) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_INVALID', message: 'กรุณาเลือกหมวดหมู่ที่เปิดใช้งาน' });
    const categoryDetailValue = categoryDetail(categoryCode, req.body.categoryDetail);
    if (categoryDetailValue === null) return res.status(400).json({ success: false, code: 'FILE_CATEGORY_DETAIL_REQUIRED', message: 'กรุณาระบุรายละเอียดเมื่อเลือกหมวดหมู่อื่นๆ' });
    if (!title || (expiresAt && Number.isNaN(Date.parse(expiresAt)))) return res.status(400).json({ success: false, message: 'ชื่อหรือวันหมดอายุไม่ถูกต้อง' });
    const [result] = await db.query(`UPDATE FileLibrary_Items SET Title=?,Description=?,Category=?,CategoryDetail=?,Status=?,AccessMode=?,DeliveryMode=?,ExpiresAt=?,PublishedAt=CASE WHEN ?='Published' AND PublishedAt IS NULL THEN NOW() ELSE PublishedAt END,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=? AND Status<>'Revoked'`, [title, clean(req.body.description, 1000) || null, categoryCode, categoryDetailValue || null, status, accessMode, deliveryMode, expiresAt, status, actor(req), id, version]);
    if (!result.affectedRows) return res.status(409).json({ success: false, code: 'ROW_VERSION_CONFLICT', message: 'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่' });
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_UPDATE', targetType: 'FileLibrary_Item', targetId: id, detail: `Updated ${title}`, metadata: { status, accessMode, deliveryMode } });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Items WHERE id=?', [id]);
    res.json({ success: true, data: itemDto(req, row) });
});

adminRouter.post('/:id/purge', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), version = Number.parseInt(req.body.rowVersion, 10);
    if (!id || !version) return res.status(400).json({ success: false, code: 'FILE_PURGE_INVALID', message: 'ข้อมูลยืนยันการลบไม่ถูกต้อง' });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Items WHERE id=? LIMIT 1', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการไฟล์' });
    if (row.Status !== 'Revoked') return res.status(409).json({ success: false, code: 'FILE_PURGE_REVOKE_FIRST', message: 'ต้องยกเลิกลิงก์ก่อนจึงจะลบไฟล์ถาวรได้' });
    if (Number(row.RowVersion) !== version) return res.status(409).json({ success: false, code: 'ROW_VERSION_CONFLICT', message: 'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่' });
    if (String(req.body.confirmTitle || '').trim() !== row.Title) return res.status(400).json({ success: false, code: 'FILE_PURGE_CONFIRMATION_MISMATCH', message: 'กรุณาพิมพ์ชื่อไฟล์ให้ตรงก่อนลบถาวร' });

    const target = filePath(row.StoredName);
    const quarantine = target ? `${target}.purge-${crypto.randomBytes(8).toString('hex')}` : null;
    let quarantined = false;
    try {
        if (target && fs.existsSync(target)) { fs.renameSync(target, quarantine); quarantined = true; }
        const [result] = await db.query("DELETE FROM FileLibrary_Items WHERE id=? AND Status='Revoked' AND RowVersion=?", [id, version]);
        if (!result.affectedRows) {
            if (quarantined && fs.existsSync(quarantine)) fs.renameSync(quarantine, target);
            return res.status(409).json({ success: false, code: 'ROW_VERSION_CONFLICT', message: 'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่' });
        }
    } catch (error) {
        if (quarantined && target && fs.existsSync(quarantine) && !fs.existsSync(target)) fs.renameSync(quarantine, target);
        throw error;
    }
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_PURGE', targetType: 'FileLibrary_Item', targetId: id, detail: `Permanently deleted revoked file ${row.Title}`, metadata: { title: row.Title, originalName: row.OriginalName, size: Number(row.FileSize), sha256: row.ContentSha256, bytesRemoved: quarantined } });
    if (quarantined) fs.rmSync(quarantine, { force: true });
    res.json({ success: true, message: 'ลบรายการและไฟล์จริงออกจากระบบถาวรแล้ว' });
});

adminRouter.post('/:id/rotate-link', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), version = Number.parseInt(req.body.rowVersion, 10);
    if (!id || !version) return res.status(400).json({ success: false, message: 'Invalid item version' });
    const [result] = await db.query("UPDATE FileLibrary_Items SET PublicToken=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=? AND Status<>'Revoked'", [token(), actor(req), id, version]);
    if (!result.affectedRows) return res.status(409).json({ success: false, code: 'ROW_VERSION_CONFLICT', message: 'รายการถูกแก้ไขไปแล้ว กรุณาโหลดข้อมูลใหม่' });
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_ROTATE_LINK', targetType: 'FileLibrary_Item', targetId: id, detail: 'Rotated file library link token' });
    const [[row]] = await db.query('SELECT * FROM FileLibrary_Items WHERE id=?', [id]);
    res.json({ success: true, data: itemDto(req, row) });
});

adminRouter.delete('/:id', isAdmin, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10), who = actor(req);
    if (!id) return res.status(400).json({ success: false, message: 'รหัสรายการไม่ถูกต้อง' });
    const [result] = await db.query("UPDATE FileLibrary_Items SET Status='Revoked',RemovedAt=NOW(),RemovedBy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND Status<>'Revoked'", [who, who, id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่เปิดใช้งาน' });
    await logAudit(req, { module: 'file_library', action: 'FILE_LIBRARY_REVOKE', targetType: 'FileLibrary_Item', targetId: id, detail: 'Revoked public file link; retained private bytes' });
    res.json({ success: true, message: 'ยกเลิกลิงก์แล้ว โดยยังเก็บไฟล์ไว้สำหรับการตรวจสอบ' });
});

module.exports = { publicRouter, authenticatedRouter, adminRouter, privateDir, verifiedMime, extensionRules, categoryCatalog };
