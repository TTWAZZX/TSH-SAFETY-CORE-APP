// =================================================================
// TSH Safety Core Activity - Backend API (Node.js + Express)
// v2.2 — Security Patched
// =================================================================
require('dotenv').config({ path: __dirname + '/.env' });

const requiredEnv = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnv = requiredEnv.filter(key => !(key in process.env));
if (missingEnv.length) {
    throw new Error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
}

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const fs         = require('fs');
const path       = require('path');
const { randomUUID } = require('crypto');

const { authenticateToken, isAdmin } = require('./middleware/auth');
const { storage: uploadStorage, fileFilter, uploadsDir, deleteLocalUpload, cleanOriginalFilename } = require('./storage');
const { logAudit } = require('./utils/audit');
const {
    COMPANY_EMAIL_DOMAIN,
    validateCompanyEmail,
    ensureEmployeeCompanyEmailColumn,
} = require('./utils/company-email');
const { getEmailRequirementRule } = require('./utils/email-requirement');
const {
    PasswordContinuationError,
    executePasswordContinuation,
} = require('./services/password-continuation');
const {
    SafetyUnitContinuationError,
    executeSafetyUnitContinuation,
} = require('./services/safety-unit-continuation');
const {
    ProfileValidationError,
    validateEmployeeProfileCandidate,
} = require('./utils/profile-validator');
const { executeProfileUpdate } = require('./services/profile-update');
const {
    CROSS_PATH_OPERATION,
    loadEmployeeProfileMasters,
    executeEmployeeProfileWrite,
    writeEmployeeProfileWithinTransaction,
} = require('./services/employee-profile-write');
const pool       = require('./db');

const patrolRoutes        = require('./routes/patrol');
const adminRoutes         = require('./routes/admin');
const cccfRoutes          = require('./routes/cccf');
const masterRoutes        = require('./routes/master');
const machineSafetyRoutes = require('./routes/machine-safety');
const forkliftRoutes      = require('./routes/forklift');
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
const dashboardRoutes         = require('./routes/dashboard');
const moduleFormsRoutes       = require('./routes/module-forms');
const personSearchRoutes      = require('./routes/person-search');
const johnnyAiRoutes          = require('./routes/johnny-ai');

// =================================================================
// SECTION 1: SETUP
// =================================================================

// --- CORS: restrict to known origins ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5000,http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500')
    .split(',').map(o => o.trim());

const app = express();

function sendCrossPathProfileError(res, error, fallbackMessage) {
    if (error instanceof ProfileValidationError) {
        return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ success: false, message: fallbackMessage });
}
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin / curl / mobile)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Tightened body size limit (was 50mb)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

function sniffUploadContentType(filePath) {
    if (path.extname(filePath)) return null;
    try {
        const head = fs.readFileSync(filePath, { encoding: null, flag: 'r' }).subarray(0, 16);
        const ascii = head.toString('ascii');
        if (ascii.startsWith('%PDF')) return 'application/pdf';
        if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
        if (head[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image/png';
        if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
    } catch (_) {
        return null;
    }
    return null;
}

app.use('/uploads', (req, res, next) => {
    if (req.query.filename) {
        const filename = cleanOriginalFilename(req.query.filename);
        const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
        res.setHeader('Content-Disposition', `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
    next();
}, express.static(uploadsDir, {
    setHeaders(res, filePath) {
        const detectedType = sniffUploadContentType(filePath);
        if (detectedType) res.setHeader('Content-Type', detectedType);
    },
}));

// --- Request logger (lightweight, no external dep) ---
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms  = Date.now() - start;
        const lvl = res.statusCode >= 500 ? 'ERROR'
                  : res.statusCode >= 400 ? 'WARN'
                  : 'INFO';
        console.log(`[${lvl}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
});

app.get('/api/public/branding', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT value FROM App_Settings WHERE key_name = ? LIMIT 1',
            ['app_branding']
        );
        let branding = {};
        if (rows.length && rows[0].value) {
            try {
                branding = JSON.parse(rows[0].value);
            } catch (_) {
                branding = {};
            }
        }
        res.json({
            success: true,
            data: {
                appName: String(branding.appName || '').slice(0, 80),
                tagline: String(branding.tagline || '').slice(0, 80),
                loginHeroTitle: String(branding.loginHeroTitle || '').slice(0, 140),
                loginHeroSubtitle: String(branding.loginHeroSubtitle || '').slice(0, 180),
                logoUrl: String(branding.logoUrl || '').slice(0, 1024),
            },
        });
    } catch (error) {
        console.error('[branding] public read failed:', error);
        res.json({ success: true, data: {} });
    }
});

// --- Document upload to server storage (sanitised filename, type-filtered) ---
const upload = multer({
    storage: uploadStorage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
const brandingLogoUpload = multer({
    storage: uploadStorage,
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
        if (allowed.includes(file.mimetype) && allowedExt.includes(ext)) return cb(null, true);
        cb(new Error(`Unsupported logo type: ${file.mimetype}`), false);
    },
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

// =================================================================
// ROLE NORMALIZATION
// Ensures JWT role is always a known title-cased value regardless
// of how it was stored in the DB (e.g. 'admin', 'ADMIN' → 'Admin')
// =================================================================
const ALLOWED_ROLES = ['Admin', 'User', 'Viewer'];
function normalizeRole(rawRole) {
    const r = String(rawRole || '').trim();
    return ALLOWED_ROLES.find(ar => ar.toLowerCase() === r.toLowerCase()) || 'User';
}

async function ensureCommitteeColumns() {
    await pool.query('ALTER TABLE Committees ADD COLUMN AppointmentDocLink VARCHAR(1024) DEFAULT NULL AFTER MainOrgChartLink').catch(() => {});
}

async function ensureKpiAnnouncementColumns() {
    await pool.query('ALTER TABLE KPIAnnouncements ADD COLUMN DocumentLink VARCHAR(1024) DEFAULT NULL AFTER EffectiveDate').catch(() => {});
    const [blankRows] = await pool.query(
        'SELECT AnnouncementID, EffectiveDate FROM KPIAnnouncements WHERE AnnouncementID IS NULL OR AnnouncementID = ""'
    ).catch(() => [[]]);
    for (const row of blankRows || []) {
        const newId = await createKpiAnnouncementId(row.EffectiveDate);
        await pool.query(
            'UPDATE KPIAnnouncements SET AnnouncementID = ? WHERE AnnouncementID IS NULL OR AnnouncementID = "" LIMIT 1',
            [newId]
        ).catch(() => {});
    }
}

async function createKpiAnnouncementId(effectiveDate) {
    const year = effectiveDate ? new Date(effectiveDate).getFullYear() : new Date().getFullYear();
    const base = `KPI-${year}`;
    let candidate = base;
    let suffix = 2;
    while (true) {
        const [[existing]] = await pool.query(
            'SELECT AnnouncementID FROM KPIAnnouncements WHERE AnnouncementID = ? LIMIT 1',
            [candidate]
        );
        if (!existing) return candidate;
        candidate = `${base}-${suffix++}`;
    }
}

async function ensurePolicyAcknowledgementColumns() {
    await pool.query("ALTER TABLE Policy_Acknowledgements ADD COLUMN AckSource VARCHAR(20) NOT NULL DEFAULT 'self' AFTER AcknowledgedAt").catch(() => {});
    await pool.query('ALTER TABLE Policy_Acknowledgements ADD COLUMN AcknowledgedByAdminID VARCHAR(50) DEFAULT NULL AFTER AckSource').catch(() => {});
    await pool.query('ALTER TABLE Policy_Acknowledgements ADD COLUMN AcknowledgedByAdminName VARCHAR(100) DEFAULT NULL AFTER AcknowledgedByAdminID').catch(() => {});
}

function normalizeJsonField(value, fallback = []) {
    if (value === undefined || value === null || value === '') return JSON.stringify(fallback);
    if (typeof value === 'string') {
        try {
            JSON.parse(value);
            return value;
        } catch (_) {
            return JSON.stringify(fallback);
        }
    }
    return JSON.stringify(value);
}

function deleteReplacedUpload(oldUrl, newUrl) {
    if (oldUrl && oldUrl !== newUrl) deleteLocalUpload(oldUrl);
}

function parseJsonArrayField(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function getSubCommitteeDocumentUrls(value) {
    return parseJsonArrayField(value)
        .map(item => item?.documentUrl || item?.activeLink || '')
        .filter(Boolean);
}

function deleteRemovedSubCommitteeUploads(oldValue, newValue) {
    const nextUrls = new Set(getSubCommitteeDocumentUrls(newValue));
    for (const oldUrl of getSubCommitteeDocumentUrls(oldValue)) {
        if (!nextUrls.has(oldUrl)) deleteLocalUpload(oldUrl);
    }
}

function deleteSubCommitteeUploads(value) {
    for (const url of getSubCommitteeDocumentUrls(value)) deleteLocalUpload(url);
}

function toDbBool(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

// --- Change-password rate limiter: max 10 attempts per 15 min per IP ---
const changePwdLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'ลองใหม่อีกครั้งหลังจาก 15 นาที (Too many password change attempts)' },
    standardHeaders: true,
    legacyHeaders: false,
});

// =================================================================
// SECTION 2: AUTHENTICATION & SESSION MANAGEMENT
// =================================================================

let authSecurityReady = false;
async function ensureAuthSecuritySchema() {
    if (authSecurityReady) return;
    await pool.query('ALTER TABLE Employees ADD COLUMN MustChangePassword TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_login_attempts (
            ID BIGINT AUTO_INCREMENT PRIMARY KEY,
            IPAddress VARCHAR(64) NOT NULL,
            EmployeeID VARCHAR(80) NOT NULL DEFAULT '',
            Successful TINYINT(1) NOT NULL DEFAULT 0,
            AttemptedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_auth_attempt_ip (IPAddress,AttemptedAt),
            KEY idx_auth_attempt_emp (EmployeeID,AttemptedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS registration_requests (
            ID BIGINT AUTO_INCREMENT PRIMARY KEY,
            ReferenceCode VARCHAR(36) NOT NULL,
            EmployeeID VARCHAR(50) NOT NULL,
            EmployeeName VARCHAR(150),
            Department VARCHAR(150),
            Unit VARCHAR(150),
            Position VARCHAR(150),
            CompanyEmail VARCHAR(150),
            PasswordHash VARCHAR(255) NULL,
            Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
            RejectionReason TEXT,
            SubmittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            ReviewedAt DATETIME,
            ReviewedBy VARCHAR(80),
            StatusViewedAt DATETIME,
            StatusViewCount INT NOT NULL DEFAULT 0,
            UNIQUE KEY uq_registration_reference (ReferenceCode),
            UNIQUE KEY uq_registration_employee (EmployeeID),
            KEY idx_registration_status_submitted (Status,SubmittedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query('ALTER TABLE registration_requests MODIFY PasswordHash VARCHAR(255) NULL').catch(() => {});
    await pool.query('ALTER TABLE registration_requests ADD COLUMN StatusViewedAt DATETIME NULL').catch(() => {});
    await pool.query('ALTER TABLE registration_requests ADD COLUMN StatusViewCount INT NOT NULL DEFAULT 0').catch(() => {});
    authSecurityReady = true;
}

function authClientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown').trim().slice(0, 64) || 'unknown';
}

async function authCheckLoginLimit(req, employeeId) {
    await ensureAuthSecuritySchema();
    const [[row]] = await pool.query(
        'SELECT COUNT(*) failures FROM auth_login_attempts WHERE Successful=0 AND AttemptedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND IPAddress=?',
        [authClientIp(req)]
    );
    if (Number(row?.failures || 0) >= 10) {
        await logAuthAudit(req, 'LOGIN_RATE_LIMITED', employeeId, 429, { windowMinutes: 15 });
        return false;
    }
    return true;
}

async function authRecordLogin(req, employeeId, successful) {
    await ensureAuthSecuritySchema();
    const ip = authClientIp(req);
    await pool.query(
        'INSERT INTO auth_login_attempts(IPAddress,EmployeeID,Successful) VALUES(?,?,?)',
        [ip, String(employeeId || '').slice(0, 80), successful ? 1 : 0]
    );
    if (successful) {
        await pool.query(
            'DELETE FROM auth_login_attempts WHERE AttemptedAt<DATE_SUB(NOW(),INTERVAL 7 DAY) OR (Successful=0 AND IPAddress=?)',
            [ip]
        );
    }
}

async function logAuthAudit(req, action, employeeId, statusCode, metadata = {}, user = null) {
    const previousUser = req.user;
    req.user = user || {
        id: 'system',
        name: 'System',
        role: 'System',
        department: null,
    };
    try {
        await logAudit(req, {
            action,
            module: 'auth',
            targetType: 'employee',
            targetId: String(employeeId || '').slice(0, 100),
            detail: `${action} ${String(employeeId || '').slice(0, 80)}`,
            metadata,
            statusCode,
        });
    } catch (err) {
        console.warn('[auth] audit log failed:', err.message);
    } finally {
        if (previousUser) req.user = previousUser;
        else delete req.user;
    }
}

app.post('/api/login', async (req, res) => {
    const { employeeId, password } = req.body;
    if (typeof employeeId !== 'string' || typeof password !== 'string' || !employeeId.trim() || !password) {
        await logAuthAudit(req, 'LOGIN_FAILED', employeeId, 400, { reason: 'missing_credentials' });
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }
    try {
        if (!await authCheckLoginLimit(req, employeeId)) {
            return res.status(429).json({ success: false, message: 'ลองใหม่อีกครั้งหลังจาก 15 นาที (Too many login attempts)' });
        }
        await ensureAuthSecuritySchema();
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [employeeId]);
        const user = rows[0];
        // Return identical message for wrong ID and wrong password (prevent user enumeration)
        if (!user) {
            await authRecordLogin(req, employeeId, false);
            await logAuthAudit(req, 'LOGIN_FAILED', employeeId, 401, { reason: 'invalid_credentials' });
            return res.status(401).json({ success: false, message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        let passwordMatch = false;
        if (user.Password) {
            // Proper bcrypt hashed password stored in DB
            passwordMatch = await bcrypt.compare(password, user.Password);
        } else {
            // Legacy mode: Password column is NULL — password equals EmployeeID
            console.warn(`[Security] User ${employeeId} using legacy password mode — will auto-migrate on success.`);
            passwordMatch = (password === user.EmployeeID);
            // Auto-migrate: store bcrypt hash on first successful legacy login
            if (passwordMatch) {
                const hashed = await bcrypt.hash(password, 10);
                await pool.query(
                    'UPDATE Employees SET Password = ?, MustChangePassword = 1 WHERE EmployeeID = ?',
                    [hashed, employeeId]
                );
                user.Password = hashed;
                user.MustChangePassword = 1;
                console.info(`[Security] Auto-migrated password hash for ${employeeId}.`);
            }
        }

        if (!passwordMatch) {
            await authRecordLogin(req, employeeId, false);
            await logAuthAudit(req, 'LOGIN_FAILED', employeeId, 401, { reason: 'invalid_credentials' });
            return res.status(401).json({ success: false, message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        await authRecordLogin(req, employeeId, true);

        const userData = {
            id:         user.EmployeeID,
            name:       user.EmployeeName,
            department: user.Department,
            unit:       user.Unit || '',
            role:       normalizeRole(user.Role),
            team:       user.Team || '',
            mustChangePassword: Boolean(user.MustChangePassword || !user.Password),
        };
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({ success: true, user: userData, token });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// Change Password — atomic continuation from the password gate.
app.post('/api/change-password', changePwdLimiter, authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
        return res.status(400).json({ success: false, code: 'PASSWORD_FIELDS_REQUIRED', message: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ success: false, code: 'PASSWORD_POLICY_VIOLATION', message: 'Password must be at least 4 characters.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const result = await executePasswordContinuation({
            connection,
            employeeId: String(req.user.id || req.user.EmployeeID || ''),
            currentPassword,
            newPassword,
            comparePassword: bcrypt.compare,
            hashPassword: password => bcrypt.hash(password, 10),
        });
        const user = result.employee;
        const userData = {
            id: user.EmployeeID,
            name: user.EmployeeName,
            department: user.Department || '',
            unit: user.Unit || '',
            role: normalizeRole(user.Role),
            team: user.Team || '',
            position: user.Position || '',
            mustChangePassword: false,
        };
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        await logAuthAudit(req, 'PASSWORD_CHANGED', user.EmployeeID, 200, {
            forced: Boolean(req.user.mustChangePassword),
            onboardingStatus: result.status,
        }, req.user);
        res.json({
            success: true,
            message: 'Password changed successfully.',
            status: result.status,
            onboardingStatus: result.status,
            nextAction: result.nextAction,
            user: userData,
            token,
        });
    } catch (error) {
        if (error instanceof PasswordContinuationError) {
            return res.status(error.httpStatus).json({
                success: false,
                code: error.code,
                message: error.message,
            });
        }
        console.error('Change Password Error:', error);
        res.status(503).json({ success: false, code: 'ONBOARDING_STATE_UNAVAILABLE', message: 'Unable to verify onboarding state.' });
    } finally {
        connection?.release();
    }
});

// Session verify always refreshes the user profile and onboarding state from the database.
app.post('/api/session/verify', authenticateToken, async (req, res) => {
    try {
        const [[employee]] = await pool.query(
            'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword FROM Employees WHERE EmployeeID=? LIMIT 1',
            [req.user.id || req.user.EmployeeID]
        );
        if (!employee) {
            return res.status(503).json({ success: false, code: 'ONBOARDING_STATE_UNAVAILABLE', message: 'Unable to verify onboarding state.' });
        }
        const userData = {
            id: employee.EmployeeID,
            name: employee.EmployeeName,
            department: employee.Department || '',
            unit: employee.Unit || '',
            role: employee.Role || 'User',
            team: employee.Team || '',
            position: employee.Position || '',
            mustChangePassword: Boolean(employee.MustChangePassword),
        };
        const newToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({
            success: true,
            status: req.onboardingStatus,
            onboardingStatus: req.onboardingStatus,
            user: userData,
            token: newToken,
        });
    } catch (error) {
        console.warn('[onboarding] session verification failed:', error?.code || error?.message || error);
        res.status(503).json({ success: false, code: 'ONBOARDING_STATE_UNAVAILABLE', message: 'Unable to verify onboarding state.' });
    }
});

app.get('/api/onboarding/status', authenticateToken, (req, res) => {
    res.json({ success: true, status: req.onboardingStatus });
});

// ─── Registration: Public master data for dropdowns ────────────────────────
app.get('/api/register/options', async (req, res) => {
    try {
        const [depts]     = await pool.query('SELECT id, Name FROM Master_Departments ORDER BY Name');
        const [positions] = await pool.query('SELECT id, Name FROM Master_Positions ORDER BY Name');
        const [units]     = await pool.query(
            'SELECT id, name, department_id FROM Master_SafetyUnits ORDER BY sort_order, name'
        ).catch(() => [[]]);
        const emailRule = await getEmailRequirementRule();
        res.json({ success: true, data: {
            departments: depts,
            positions,
            units,
            requiredEmailPositionIds: emailRule.requiredPositionIds,
            companyEmailDomain: COMPANY_EMAIL_DOMAIN,
        } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถโหลดข้อมูลได้' });
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { success: false, message: 'ลองใหม่ภายหลัง (เกินขีดจำกัดการสมัคร)' },
    standardHeaders: true, legacyHeaders: false,
});

const registrationStatusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, message: 'ตรวจสอบสถานะบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
    standardHeaders: true, legacyHeaders: false,
});

app.post('/api/register/status', registrationStatusLimiter, async (req, res) => {
    const employeeId = String(req.body?.EmployeeID || '').trim();
    const referenceCode = String(req.body?.ReferenceCode || '').trim();
    if (!employeeId || !referenceCode) {
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_STATUS_FAILED', employeeId, 400, { reason: 'missing_status_credentials' });
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงานและเลขอ้างอิง' });
    }
    try {
        await ensureAuthSecuritySchema();
        const [[request]] = await pool.query(
            `SELECT ID,Status,RejectionReason,SubmittedAt,ReviewedAt,StatusViewedAt,StatusViewCount,
                    CASE WHEN CompanyEmail IS NULL OR TRIM(CompanyEmail)='' THEN 0 ELSE 1 END HasCompanyEmail
             FROM registration_requests
             WHERE EmployeeID=? AND ReferenceCode=? LIMIT 1`,
            [employeeId, referenceCode]
        );
        if (!request) {
            await logAuthAudit(req, 'ACCOUNT_REGISTRATION_STATUS_FAILED', employeeId, 404, { reason: 'status_not_found' });
            return res.status(404).json({ success: false, message: 'ไม่พบคำขอจากข้อมูลที่ระบุ กรุณาตรวจสอบรหัสพนักงานและเลขอ้างอิง' });
        }
        const status = String(request.Status || 'Pending');
        const unread = Boolean(
            request.ReviewedAt
            && (!request.StatusViewedAt || new Date(request.ReviewedAt) > new Date(request.StatusViewedAt))
        );
        await pool.query(
            'UPDATE registration_requests SET StatusViewedAt=NOW(),StatusViewCount=COALESCE(StatusViewCount,0)+1 WHERE ID=?',
            [request.ID]
        );
        const nextAction = status === 'Approved' ? 'LOGIN'
            : status === 'Rejected' ? 'CONTACT_ADMIN'
                : status === 'Cancelled' ? 'CONTACT_ADMIN' : 'WAIT_FOR_REVIEW';
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_STATUS_VIEWED', employeeId, 200, {
            requestId: request.ID, status, unread,
        });
        return res.json({
            success: true,
            data: {
                status,
                submittedAt: request.SubmittedAt,
                reviewedAt: request.ReviewedAt,
                rejectionReason: status === 'Rejected' ? request.RejectionReason : null,
                nextAction,
                notification: {
                    channel: 'portal',
                    unread,
                    emailAvailable: Boolean(request.HasCompanyEmail),
                    viewedAt: new Date().toISOString(),
                    viewCount: Number(request.StatusViewCount || 0) + 1,
                },
            },
        });
    } catch (err) {
        console.error('Registration Status Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    }
});

app.post('/api/register', registerLimiter, async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Position, Unit, CompanyEmail, password } = req.body;
    const registrationMode = String(req.body?.RegistrationMode || 'auto').trim().toLowerCase();
    if (String(req.body?.Website || '').trim()) {
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', EmployeeID, 400, { reason: 'bot_honeypot' });
        return res.status(400).json({ success: false, message: 'ไม่สามารถดำเนินการคำขอได้' });
    }
    if (!['auto', 'activate', 'new'].includes(registrationMode)) {
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', EmployeeID, 400, { reason: 'invalid_registration_mode' });
        return res.status(400).json({ success: false, message: 'โหมดการสมัครไม่ถูกต้อง' });
    }
    if (typeof password !== 'string' || !EmployeeID || !password) {
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', EmployeeID, 400, { reason: 'missing_required_fields' });
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }
    if (password.length < 4) {
        await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', EmployeeID, 400, { reason: 'password_too_short' });
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    try {
        await ensureAuthSecuritySchema();
        const [existing] = await pool.query('SELECT EmployeeID,Password FROM Employees WHERE EmployeeID = ?', [EmployeeID.trim()]);
        if (!existing.length) {
            const employeeId = EmployeeID.trim();
            if (registrationMode === 'activate') {
                await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', employeeId, 400, { reason: 'account_activation_unavailable' });
                return res.status(400).json({
                    success: false,
                    code: 'REGISTRATION_NOT_AVAILABLE',
                    nextAction: 'NEW_REGISTRATION_OR_ADMIN',
                    message: 'ไม่สามารถเปิดใช้งานบัญชีด้วยข้อมูลนี้ได้ กรุณาเลือกสมัครบัญชีใหม่หรือติดต่อ Admin',
                });
            }
            let employeeName = String(EmployeeName || '').trim();
            let department = String(Department || '').trim();
            let position = String(Position || '').trim();
            let unit = String(Unit || '').trim();
            if (employeeName.length < 2 || !department || !position) {
                await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', employeeId, 400, { reason: 'missing_applicant_profile' });
                return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อ แผนก และตำแหน่งให้ครบถ้วน' });
            }
            let registrationValidation;
            let registrationMasters;
            try {
                registrationMasters = await loadEmployeeProfileMasters(pool);
                registrationValidation = validateEmployeeProfileCandidate(
                    {
                        EmployeeID: employeeId,
                        EmployeeName: employeeName,
                        Department: department,
                        Unit: unit,
                        Position: position,
                        Password: 'PENDING_REGISTRATION_PASSWORD',
                        MustChangePassword: 0,
                    },
                    { EmployeeName: employeeName, Department: department, Unit: unit, Position: position },
                    registrationMasters
                );
            } catch (error) {
                const validationError = error instanceof ProfileValidationError ? error : new ProfileValidationError(
                    'PROFILE_VALIDATION_UNAVAILABLE',
                    'Profile validation is unavailable.',
                    503,
                    error
                );
                await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', employeeId, validationError.httpStatus, { reason: validationError.code });
                return res.status(validationError.httpStatus).json({
                    success: false,
                    code: validationError.code,
                    message: validationError.message,
                });
            }
            ({ EmployeeName: employeeName, Department: department, Unit: unit, Position: position } = registrationValidation.profile);
            const masterPosition = registrationMasters.positions.find(row => String(row.Name ?? row.name ?? '') === position);
            const emailRule = await getEmailRequirementRule();
            const emailRequired = emailRule.requiredPositionIds.map(Number).includes(Number(masterPosition.id));
            const emailCheck = validateCompanyEmail(CompanyEmail);
            if (!emailCheck.ok || (emailRequired && !emailCheck.email)) {
                const reason = !emailCheck.ok ? 'invalid_company_email' : 'company_email_required';
                await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', employeeId, 400, { reason, positionId: Number(masterPosition.id) });
                return res.status(400).json({
                    success: false,
                    message: emailRequired && !emailCheck.email
                        ? 'ตำแหน่งนี้ต้องระบุ CompanyEmail'
                        : emailCheck.message,
                });
            }
            if (emailCheck.email) {
                await ensureEmployeeCompanyEmailColumn(pool);
                const [[duplicateEmail]] = await pool.query(
                    `SELECT CompanyEmail FROM Employees WHERE LOWER(CompanyEmail)=?
                     UNION ALL
                     SELECT CompanyEmail FROM registration_requests WHERE LOWER(CompanyEmail)=? LIMIT 1`,
                    [emailCheck.email, emailCheck.email]
                );
                if (duplicateEmail) {
                    await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', employeeId, 409, { reason: 'company_email_exists' });
                    return res.status(409).json({ success: false, message: 'CompanyEmail นี้ถูกใช้งานแล้ว' });
                }
            }
            const [prior] = await pool.query(
                'SELECT ReferenceCode,Status FROM registration_requests WHERE EmployeeID=? LIMIT 1',
                [employeeId]
            );
            if (prior.length) {
                await logAuthAudit(req, 'ACCOUNT_REGISTRATION_REQUEST_DUPLICATE', employeeId, 409, { status: prior[0].Status });
                return res.status(409).json({
                    success: false,
                    pending: prior[0].Status === 'Pending',
                    status: prior[0].Status,
                    message: 'มีคำขอสมัครสำหรับรหัสพนักงานนี้แล้ว กรุณาติดต่อ Admin',
                });
            }
            const referenceCode = randomUUID();
            const passwordHash = await bcrypt.hash(password, 10);
            try {
                await pool.query(
                    `INSERT INTO registration_requests
                     (ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail,PasswordHash,Status)
                     VALUES(?,?,?,?,?,?,?,?,?)`,
                    [
                        referenceCode, employeeId, employeeName,
                        department, unit || null,
                        position, emailCheck.email,
                        passwordHash, 'Pending',
                    ]
                );
            } catch (error) {
                if (error?.code === 'ER_DUP_ENTRY') {
                    await logAuthAudit(req, 'ACCOUNT_REGISTRATION_REQUEST_DUPLICATE', employeeId, 409, { reason: 'duplicate_race' });
                    return res.status(409).json({ success: false, message: 'มีคำขอสมัครสำหรับรหัสพนักงานนี้แล้ว กรุณาติดต่อ Admin' });
                }
                throw error;
            }
            await logAuthAudit(req, 'ACCOUNT_REGISTRATION_REQUESTED', employeeId, 202, { referenceCode, status: 'Pending' });
            return res.status(202).json({
                success: true,
                pending: true,
                status: 'Pending',
                referenceCode,
                message: 'ส่งคำขอสมัครแล้ว กรุณารอ Admin ตรวจสอบและอนุมัติ',
            });
        }
        if (existing[0].Password) {
            await logAuthAudit(req, 'ACCOUNT_REGISTRATION_FAILED', EmployeeID, 409, { reason: 'account_exists' });
            return res.status(409).json({
                success: false,
                code: 'REGISTRATION_NOT_AVAILABLE',
                nextAction: 'LOGIN_OR_ADMIN_RESET',
                message: 'ไม่สามารถสมัครหรือเปิดบัญชีใหม่ได้ หากเคยมีบัญชีแล้วให้เข้าสู่ระบบ หรือติดต่อ Admin เพื่อรีเซ็ตรหัสผ่าน',
            });
        }
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(
            'UPDATE Employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=? AND Password IS NULL',
            [hashed, EmployeeID.trim()]
        );
        await logAuthAudit(req, 'ACCOUNT_REGISTERED', EmployeeID, 200, { source: 'public_registration' });
        res.json({
            success: true,
            activated: true,
            nextAction: 'LOGIN',
            message: 'เปิดใช้งานบัญชีสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้',
        });
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
    let connection;
    try {
        connection = await pool.getConnection();
        const result = await executeProfileUpdate({
            connection,
            employeeId: String(req.user.id || req.user.EmployeeID || ''),
            payload: req.body,
        });
        const employee = result.employee;
        const userData = {
            id: employee.EmployeeID,
            name: employee.EmployeeName,
            department: employee.Department || '',
            unit: employee.Unit || '',
            team: employee.Team || '',
            position: employee.Position || '',
            role: normalizeRole(employee.Role),
            mustChangePassword: Boolean(employee.MustChangePassword),
        };
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({
            success: true,
            status: result.status,
            onboardingStatus: result.status,
            nextAction: result.nextAction,
            message: 'Profile updated successfully.',
            idempotent: result.idempotent,
            changedFields: result.changedFields,
            user: userData,
            token,
        });
    } catch (err) {
        if (err instanceof ProfileValidationError) {
            return res.status(err.httpStatus).json({
                success: false,
                code: err.code,
                message: err.message,
            });
        }
        console.error('Profile Update Error:', err?.code || err?.message || err);
        res.status(503).json({
            success: false,
            code: 'PROFILE_VALIDATION_UNAVAILABLE',
            message: 'Profile validation is unavailable.',
        });
    } finally {
        connection?.release();
    }
});

// ─── Safety Unit onboarding continuation ───────────────────────────────────
app.put('/api/profile/safety-unit', authenticateToken, async (req, res) => {
    const requestedUnit = req.body?.Unit;
    if (typeof requestedUnit !== 'string' || !requestedUnit.trim()) {
        return res.status(400).json({
            success: false,
            code: 'SAFETY_UNIT_VALUE_REQUIRED',
            message: 'Safety Unit is required.',
        });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const result = await executeSafetyUnitContinuation({
            connection,
            employeeId: String(req.user.id || req.user.EmployeeID || ''),
            requestedUnit,
        });
        const employee = result.employee;
        const userData = {
            id:         employee.EmployeeID,
            name:       employee.EmployeeName,
            department: employee.Department || '',
            unit:       employee.Unit || '',
            role:       normalizeRole(employee.Role),
            team:       employee.Team || '',
            position:   employee.Position || '',
            mustChangePassword: false,
        };
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '6h' });
        res.json({
            success: true,
            status: result.status,
            onboardingStatus: result.status,
            nextAction: result.nextAction,
            message: 'Safety Unit saved successfully.',
            idempotent: result.idempotent,
            user: userData,
            token,
        });
    } catch (err) {
        if (err instanceof SafetyUnitContinuationError) {
            return res.status(err.httpStatus).json({
                success: false,
                code: err.code,
                message: err.message,
            });
        }
        console.error('Safety Unit Save Error:', err);
        res.status(503).json({
            success: false,
            code: 'ONBOARDING_STATE_UNAVAILABLE',
            message: 'Unable to verify onboarding state.',
        });
    } finally {
        connection?.release();
    }
});

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
            await connection.query(sql, [newID, oldID]).catch((e) => {
                // ตารางบางตัวอาจยังไม่ถูกสร้าง — log แต่ไม่ abort transaction
                console.warn('[cascade EmployeeID] skip:', sql.split(' ')[1], e.message);
            });
        }

        await connection.commit();

        // ออก JWT ใหม่ด้วย EmployeeID ใหม่
        const [[updated]] = await pool.query(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Role, Team FROM Employees WHERE EmployeeID = ?', [newID]
        );
        const userData = {
            id:         updated.EmployeeID,
            name:       updated.EmployeeName,
            department: updated.Department,
            unit:       updated.Unit || '',
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
        const isCurrent = toDbBool(IsCurrent);
        if (isCurrent) await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1');
        const [result] = await pool.query(
            'INSERT INTO Policies (PolicyTitle, Description, EffectiveDate, DocumentLink, IsCurrent, Category, ReviewDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [PolicyTitle, Description || null, EffectiveDate, DocumentLink || null, isCurrent ? 1 : 0, Category || null, ReviewDate || null]
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
        const [[existing]] = await pool.query('SELECT id, DocumentLink FROM Policies WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'Policy not found' });

        const isCurrent = toDbBool(IsCurrent);
        if (isCurrent) await pool.query('UPDATE Policies SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        await pool.query(
            'UPDATE Policies SET PolicyTitle = ?, Description = ?, EffectiveDate = ?, DocumentLink = ?, IsCurrent = ?, Category = ?, ReviewDate = ? WHERE id = ?',
            [PolicyTitle, Description || null, EffectiveDate, DocumentLink || null, isCurrent ? 1 : 0, Category || null, ReviewDate || null, id]
        );
        deleteReplacedUpload(existing?.DocumentLink, DocumentLink || null);
        res.json({ success: true, message: 'อัปเดตนโยบายสำเร็จ' });
    } catch (error) {
        console.error(`Error updating policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตนโยบายได้' });
    }
});

app.delete('/api/policies/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [[existing]] = await pool.query('SELECT id, DocumentLink FROM Policies WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'Policy not found' });

        await pool.query('DELETE FROM Policy_Acknowledgements WHERE PolicyID = ?', [id]).catch(() => {});
        await pool.query('DELETE FROM Policies WHERE id = ?', [id]);
        deleteLocalUpload(existing?.DocumentLink);
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
        await ensurePolicyAcknowledgementColumns();
        const [rows] = await pool.query('SELECT id FROM Policies WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบนโยบาย' });
        await pool.query(
            "INSERT IGNORE INTO Policy_Acknowledgements (PolicyID, UserID, UserName, Department, AckSource) VALUES (?, ?, ?, ?, 'self')",
            [id, UserID, UserName || null, Department || null]
        );
        res.json({ success: true, message: 'รับทราบนโยบายเรียบร้อยแล้ว' });
    } catch (error) {
        console.error('Error acknowledging policy:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// GET /api/policies/:id/acknowledgements — Admin: who acked + who hasn't
// POST /api/policies/:id/acknowledge-all - Admin marks all current employees as acknowledged
app.post('/api/policies/:id/acknowledge-all', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.id || req.user.EmployeeID || null;
    const adminName = req.user.name || req.user.EmployeeName || null;
    try {
        await ensurePolicyAcknowledgementColumns();

        const [[policy]] = await pool.query('SELECT id, PolicyTitle FROM Policies WHERE id = ?', [id]);
        if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

        const [[totalRow]] = await pool.query(
            'SELECT COUNT(*) AS total FROM Employees WHERE EmployeeID IS NOT NULL AND EmployeeID != ""'
        );
        const [[beforeRow]] = await pool.query(
            'SELECT COUNT(*) AS acknowledged FROM Policy_Acknowledgements WHERE PolicyID = ?',
            [id]
        );

        const [result] = await pool.query(
            `INSERT IGNORE INTO Policy_Acknowledgements
             (PolicyID, UserID, UserName, Department, AckSource, AcknowledgedByAdminID, AcknowledgedByAdminName)
             SELECT ?, e.EmployeeID, e.EmployeeName, e.Department, 'admin_all', ?, ?
             FROM Employees e
             WHERE e.EmployeeID IS NOT NULL AND e.EmployeeID != ''`,
            [id, adminId, adminName]
        );

        const added = result.affectedRows || 0;
        const totalEmployees = totalRow.total || 0;
        const alreadyAcknowledged = beforeRow.acknowledged || 0;

        await logAudit(req, {
            action: 'ACKNOWLEDGE_ALL_POLICIES',
            module: 'policies',
            targetType: 'Policy',
            targetId: id,
            detail: `Admin acknowledged policy for all employees: added ${added}, already acknowledged ${alreadyAcknowledged}`,
            metadata: {
                policyId: id,
                policyTitle: policy.PolicyTitle,
                added,
                alreadyAcknowledged,
                totalEmployees,
            },
            statusCode: 200,
        });

        res.json({
            success: true,
            message: 'บันทึกรับทราบแทนพนักงานทั้งหมดเรียบร้อยแล้ว',
            added,
            skipped: alreadyAcknowledged,
            totalEmployees,
            acknowledgedTotal: alreadyAcknowledged + added,
        });
    } catch (error) {
        console.error(`Error acknowledging all for policy ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถรับทราบแทนทั้งหมดได้' });
    }
});

app.get('/api/policies/:id/acknowledgements', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await ensurePolicyAcknowledgementColumns();
        const [acked] = await pool.query(
            'SELECT UserID, UserName, Department, AcknowledgedAt, AckSource, AcknowledgedByAdminID, AcknowledgedByAdminName FROM Policy_Acknowledgements WHERE PolicyID = ? ORDER BY AcknowledgedAt DESC',
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
        const [[existing]] = await pool.query('SELECT id FROM Policies WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'Policy not found' });

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
        await ensureCommitteeColumns();
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
        await ensureCommitteeColumns();
        if (IsCurrent) await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1');
        const [result] = await pool.query(
            'INSERT INTO Committees (CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink, AppointmentDocLink, IsCurrent, SubCommitteeData) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink || null, AppointmentDocLink || null, IsCurrent ? 1 : 0, normalizeJsonField(SubCommitteeData)]
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
        await ensureCommitteeColumns();
        const [[existing]] = await pool.query('SELECT MainOrgChartLink, AppointmentDocLink, SubCommitteeData FROM Committees WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'Committee not found' });
        if (IsCurrent) await pool.query('UPDATE Committees SET IsCurrent = 0 WHERE IsCurrent = 1 AND id != ?', [id]);
        await pool.query(
            'UPDATE Committees SET CommitteeTitle = ?, TermStartDate = ?, TermEndDate = ?, MainOrgChartLink = ?, AppointmentDocLink = ?, IsCurrent = ?, SubCommitteeData = ? WHERE id = ?',
            [CommitteeTitle, TermStartDate, TermEndDate, MainOrgChartLink || null, AppointmentDocLink || null, IsCurrent ? 1 : 0, normalizeJsonField(SubCommitteeData), id]
        );
        deleteReplacedUpload(existing?.MainOrgChartLink, MainOrgChartLink || null);
        deleteReplacedUpload(existing?.AppointmentDocLink, AppointmentDocLink || null);
        deleteRemovedSubCommitteeUploads(existing?.SubCommitteeData, SubCommitteeData);
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error(`Error updating committee ${id}:`, error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

app.delete('/api/committees/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await ensureCommitteeColumns();
        const [[existing]] = await pool.query('SELECT MainOrgChartLink, AppointmentDocLink, SubCommitteeData FROM Committees WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ success: false, message: 'Committee not found' });
        await pool.query('DELETE FROM Committees WHERE id = ?', [id]);
        deleteLocalUpload(existing?.MainOrgChartLink);
        deleteLocalUpload(existing?.AppointmentDocLink);
        deleteSubCommitteeUploads(existing?.SubCommitteeData);
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
        await ensureKpiAnnouncementColumns();
        const [allItems] = await pool.query('SELECT *, AnnouncementID as id, AnnouncementID as rowIndex FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
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
        await ensureKpiAnnouncementColumns();
        const [rows] = await pool.query('SELECT *, AnnouncementID as id FROM KPIAnnouncements ORDER BY EffectiveDate DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลประกาศ KPI ได้' });
    }
});

app.post('/api/kpiannouncements', authenticateToken, isAdmin, async (req, res) => {
    const { AnnouncementTitle, EffectiveDate, DocumentLink, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    try {
        await ensureKpiAnnouncementColumns();
        const announcementId = await createKpiAnnouncementId(EffectiveDate);
        if (IsCurrent) await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1');
        await pool.query(
            'INSERT INTO KPIAnnouncements (AnnouncementID, AnnouncementTitle, EffectiveDate, DocumentLink, IsCurrent) VALUES (?, ?, ?, ?, ?)',
            [announcementId, AnnouncementTitle, EffectiveDate, DocumentLink || null, IsCurrent ? 1 : 0]
        );
        res.status(201).json({ success: true, message: 'สร้างประกาศ KPI ใหม่สำเร็จ', insertedId: announcementId });
    } catch (error) {
        console.error('Error creating KPI announcement:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างประกาศได้' });
    }
});

app.put('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { AnnouncementTitle, EffectiveDate, DocumentLink, IsCurrent } = req.body;
    if (!AnnouncementTitle || !EffectiveDate) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    try {
        await ensureKpiAnnouncementColumns();
        const [[existing]] = await pool.query('SELECT DocumentLink FROM KPIAnnouncements WHERE AnnouncementID = ?', [id]);
        if (IsCurrent) await pool.query('UPDATE KPIAnnouncements SET IsCurrent = 0 WHERE IsCurrent = 1 AND AnnouncementID != ?', [id]);
        await pool.query(
            'UPDATE KPIAnnouncements SET AnnouncementTitle = ?, EffectiveDate = ?, DocumentLink = ?, IsCurrent = ? WHERE AnnouncementID = ?',
            [AnnouncementTitle, EffectiveDate, DocumentLink || null, IsCurrent ? 1 : 0, id]
        );
        deleteReplacedUpload(existing?.DocumentLink, DocumentLink || null);
        res.json({ success: true, message: 'อัปเดตประกาศสำเร็จ' });
    } catch (error) {
        console.error('Error updating KPI announcement:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตประกาศได้' });
    }
});

app.delete('/api/kpiannouncements/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await ensureKpiAnnouncementColumns();
        const [[existing]] = await pool.query('SELECT DocumentLink FROM KPIAnnouncements WHERE AnnouncementID = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'ไม่พบประกาศ KPI ที่ต้องการลบ' });
        }
        const [[linked]] = await pool.query('SELECT COUNT(*) AS total FROM KPIData WHERE AnnouncementID = ?', [id]);
        if (Number(linked?.total || 0) > 0) {
            return res.status(409).json({
                success: false,
                message: `ประกาศนี้มี KPI ผูกอยู่ ${linked.total} รายการ กรุณาย้ายหรือลบ KPI ก่อนลบประกาศ`,
            });
        }
        await pool.query('DELETE FROM KPIAnnouncements WHERE AnnouncementID = ?', [id]);
        deleteLocalUpload(existing?.DocumentLink);
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
const KPI_MONTH_FIELDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizeKpiText(value) {
    return String(value || '').trim();
}

async function findDuplicateKpi(data, excludeId = null) {
    const year = normalizeKpiText(data.Year);
    const announcementId = normalizeKpiText(data.AnnouncementID);
    const metric = normalizeKpiText(data.Metric);
    const department = normalizeKpiText(data.Department);
    if (!year || !announcementId || !metric) return null;

    const params = [year, announcementId, metric, department];
    let sql = `
        SELECT id FROM KPIData
        WHERE CAST(Year AS CHAR) = ?
          AND COALESCE(AnnouncementID, '') = ?
          AND LOWER(TRIM(Metric)) = LOWER(TRIM(?))
          AND LOWER(TRIM(COALESCE(Department, ''))) = LOWER(TRIM(?))
    `;
    if (excludeId) {
        sql += ' AND id != ?';
        params.push(excludeId);
    }
    sql += ' LIMIT 1';
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
}

function kpiAuditMetadata(data = {}) {
    return {
        Year: data.Year || null,
        AnnouncementID: data.AnnouncementID || null,
        Metric: data.Metric || null,
        Department: data.Department || null,
        Unit: data.Unit || null,
    };
}

function validateKpiDataPayload(data = {}, { requireCore = false } = {}) {
    const errors = [];
    if (requireCore && !normalizeKpiText(data.Metric)) errors.push('กรุณากรอกชื่อตัวชี้วัด');
    if (requireCore && !normalizeKpiText(data.AnnouncementID)) errors.push('ไม่พบ Announcement ID');
    if (requireCore && !normalizeKpiText(data.Year)) errors.push('ไม่พบปี KPI');
    if (requireCore && (data.Target === null || data.Target === undefined || data.Target === '')) errors.push('กรุณากรอกเป้าหมาย');

    const numericFields = ['Year', 'Target', 'Weight', ...KPI_MONTH_FIELDS];
    for (const field of numericFields) {
        if (!(field in data)) continue;
        const value = data[field];
        if (value === null || value === undefined || value === '') continue;
        if (!Number.isFinite(Number(value))) errors.push(`${field} ต้องเป็นตัวเลข`);
    }
    if ('Weight' in data && data.Weight !== null && data.Weight !== undefined && data.Weight !== '' && Number(data.Weight) <= 0) {
        errors.push('Weight ต้องมากกว่า 0');
    }
    return errors;
}

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
            const validationErrors = validateKpiDataPayload(safe);
            if (validationErrors.length > 0) {
                const validationError = new Error(validationErrors[0]);
                validationError.statusCode = 400;
                throw validationError;
            }
            await conn.query('UPDATE KPIData SET ? WHERE id = ?', [safe, id]);
            updated++;
        }
        await conn.commit();
        if (updated > 0) {
            await logAudit(req, {
                module: 'kpi',
                action: 'BULK_UPDATE_KPI_DATA',
                targetType: 'KPIData',
                detail: `Updated monthly KPI values: ${updated} row(s)`,
                metadata: {
                    updated,
                    ids: updates.map(row => row.id).filter(Boolean).slice(0, 100),
                },
            });
        }
        res.json({ success: true, updated });
    } catch (err) {
        await conn.rollback();
        res.status(err.statusCode || 500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/kpidata', authenticateToken, isAdmin, async (req, res) => {
    const safeData = Object.fromEntries(Object.entries(req.body).filter(([k]) => KPI_DATA_FIELDS.includes(k)));
    if (Object.keys(safeData).length === 0) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }
    const validationErrors = validateKpiDataPayload(safeData, { requireCore: true });
    if (validationErrors.length > 0) {
        return res.status(400).json({ success: false, message: validationErrors[0] });
    }
    try {
        const duplicate = await findDuplicateKpi(safeData);
        if (duplicate) {
            return res.status(409).json({ success: false, message: 'มี KPI นี้อยู่แล้วในปี ประกาศ และแผนก/หน่วยงานเดียวกัน' });
        }
        const [result] = await pool.query('INSERT INTO KPIData SET ?', safeData);
        await logAudit(req, {
            module: 'kpi',
            action: 'CREATE_KPI',
            targetType: 'KPIData',
            targetId: result.insertId,
            detail: `Create KPI: ${safeData.Metric || result.insertId}`,
            metadata: kpiAuditMetadata(safeData),
        });
        res.status(201).json({ success: true, message: 'เพิ่มตัวชี้วัด KPI ใหม่สำเร็จ', insertedId: result.insertId });
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
    const validationErrors = validateKpiDataPayload(safeData);
    if (validationErrors.length > 0) {
        return res.status(400).json({ success: false, message: validationErrors[0] });
    }
    try {
        const [[existing]] = await pool.query('SELECT * FROM KPIData WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล KPI ที่ต้องการแก้ไข' });
        }
        const mergedData = { ...existing, ...safeData };
        const duplicate = await findDuplicateKpi(mergedData, id);
        if (duplicate) {
            return res.status(409).json({ success: false, message: 'มี KPI นี้อยู่แล้วในปี ประกาศ และแผนก/หน่วยงานเดียวกัน' });
        }
        await pool.query('UPDATE KPIData SET ? WHERE id = ?', [safeData, id]);
        await logAudit(req, {
            module: 'kpi',
            action: 'UPDATE_KPI',
            targetType: 'KPIData',
            targetId: id,
            detail: `Update KPI: ${mergedData.Metric || id}`,
            metadata: kpiAuditMetadata(mergedData),
        });
        res.json({ success: true, message: 'อัปเดตข้อมูล KPI สำเร็จ' });
    } catch (error) {
        console.error('Error updating KPI data:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถอัปเดตข้อมูลได้' });
    }
});

app.delete('/api/kpidata/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [[existing]] = await pool.query('SELECT * FROM KPIData WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล KPI ที่ต้องการลบ' });
        }
        await pool.query('DELETE FROM KPIData WHERE id = ?', [id]);
        await logAudit(req, {
            module: 'kpi',
            action: 'DELETE_KPI',
            targetType: 'KPIData',
            targetId: id,
            detail: `Delete KPI: ${existing.Metric || id}`,
            metadata: kpiAuditMetadata(existing),
        });
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
    res.json({
        success: true,
        message: 'File uploaded successfully',
        url: req.file.path,
        originalName: req.file.originalName,
        storedName: req.file.storedName || req.file.filename,
    });
});

app.post('/api/upload/branding-logo', authenticateToken, isAdmin, brandingLogoUpload.single('logo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No logo uploaded.' });
    }
    try {
        await logAudit(req, {
            module: 'system',
            action: 'UPLOAD_BRANDING_LOGO',
            targetType: 'App_Settings',
            targetId: 'app_branding',
            detail: 'Uploaded system branding logo',
            metadata: {
                originalName: req.file.originalName,
                storedName: req.file.storedName || req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size,
            },
        });
    } catch (err) {
        console.warn('[branding] audit log failed:', err.message);
    }
    res.json({
        success: true,
        message: 'Logo uploaded successfully',
        url: req.file.path,
        originalName: req.file.originalName,
        storedName: req.file.storedName || req.file.filename,
    });
});

app.delete('/api/upload/document', authenticateToken, isAdmin, async (req, res) => {
    const url = String(req.body?.url || req.body?.FileURL || '').trim();
    if (!url || !url.includes('/uploads/')) {
        return res.status(400).json({ success: false, message: 'ไม่พบไฟล์ที่ต้องการลบ' });
    }
    try {
        let deleted = false;
        try {
            deleted = deleteLocalUpload(url);
        } catch (err) {
            console.warn('[upload] local document cleanup failed:', err.message);
            setTimeout(() => {
                try { deleteLocalUpload(url); } catch (_) {}
            }, 1500);
        }
        await logAudit(req, {
            module: 'upload',
            action: 'DELETE_UPLOADED_DOCUMENT',
            targetType: 'upload',
            targetId: url.split('/uploads/').pop()?.split('?')[0] || '',
            detail: 'Deleted uploaded document file',
            metadata: { deleted }
        });
        res.json({ success: true, deleted });
    } catch (error) {
        console.error('Error deleting uploaded document:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบไฟล์ที่อัปโหลดได้' });
    }
});

// =================================================================
// SECTION 4: ROUTE MOUNTS
// FIX: all 4 routers were mounted WITHOUT any auth middleware
// =================================================================
if (forkliftRoutes.publicVerify) {
    app.get('/api/forklift/verify/:token', forkliftRoutes.publicVerify);
}

app.use('/api/patrol',          authenticateToken, patrolRoutes);
app.use('/api/admin',          authenticateToken, isAdmin, adminRoutes);
app.use('/api/cccf',           authenticateToken, cccfRoutes);
app.use('/api/master',         authenticateToken, masterRoutes);
app.use('/api/machine-safety', authenticateToken, machineSafetyRoutes);
app.use('/api/forklift',       authenticateToken, forkliftRoutes);
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
app.use('/api/dashboard',         authenticateToken, dashboardRoutes);
app.use('/api/module-forms',      authenticateToken, moduleFormsRoutes);
app.use('/api/person-search',     authenticateToken, personSearchRoutes);
app.use('/api/johnny',            authenticateToken, johnnyAiRoutes);

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
            res.status(500).json({ success: false, message: `Could not fetch data from ${table}` });
        }
    });

    app.post(endpoint, authenticateToken, isAdmin, async (req, res) => {
        try {
            const columns = Object.keys(req.body);
            const values  = Object.values(req.body);
            await pool.query(`INSERT INTO \`${table}\` (\`${columns.join('`,`')}\`) VALUES (?)`, [values]);
            res.status(201).json({ success: true, message: 'เพิ่มข้อมูลใหม่สำเร็จ' });
        } catch (error) {
            console.error(`Error adding to ${table}:`, error);
            res.status(500).json({ success: false, message: `Could not add data to ${table}` });
        }
    });

    app.put(`${endpoint}/:id`, authenticateToken, isAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const columns = Object.keys(req.body).map(k => `\`${k}\` = ?`).join(',');
            const values  = [...Object.values(req.body), id];
            const [result] = await pool.query(`UPDATE \`${table}\` SET ${columns} WHERE id = ?`, values);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found for update' });
            }
            res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
        } catch (error) {
            console.error(`Error updating ${table}:`, error);
            res.status(500).json({ success: false, message: `Could not update data in ${table}` });
        }
    });

    app.delete(`${endpoint}/:id`, authenticateToken, isAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const [result] = await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found for deletion' });
            }
            res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
        } catch (error) {
            console.error(`Error deleting from ${table}:`, error);
            res.status(500).json({ success: false, message: `Could not delete data from ${table}` });
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
        await ensureEmployeeCompanyEmailColumn(pool);
        const [rows] = await pool.query('SELECT * FROM Employees ORDER BY EmployeeName ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลพนักงานได้' });
    }
});

app.get('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(pool);
        const [rows] = await pool.query('SELECT * FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลพนักงานได้' });
    }
});

app.post('/api/employees', authenticateToken, isAdmin, async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Unit, Position, Role, Team, CompanyEmail } = req.body;
    const finalPosition = Position || Team;
    const emailCheck = validateCompanyEmail(CompanyEmail);
    if (!emailCheck.ok) return res.status(400).json({ success: false, message: emailCheck.message });
    let connection;
    try {
        await ensureEmployeeCompanyEmailColumn(pool);
        connection = await pool.getConnection();
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId: EmployeeID,
            profilePayload: {
                EmployeeName,
                Department: typeof Department === 'string' ? Department : '',
                Unit: typeof Unit === 'string' ? Unit : '',
                Position: typeof finalPosition === 'string' ? finalPosition : '',
            },
            protectedFields: {
                CompanyEmail: emailCheck.email,
                Role: ['Admin', 'User', 'Viewer'].includes(Role) ? Role : 'User',
            },
        });
        await logAudit(req, {
            action: 'CREATE_EMPLOYEE',
            module: 'admin',
            targetType: 'Employee',
            targetId: result.employee.EmployeeID,
            detail: `Source: manual_legacy; Role: ${result.employee.Role || 'User'}`,
            metadata: { source: 'manual_legacy' },
            statusCode: 200,
        });
        res.json({ success: true, message: 'เพิ่มพนักงานสำเร็จ', onboardingStatus: result.status });
    } catch (err) {
        sendCrossPathProfileError(res, err, 'ไม่สามารถเพิ่มพนักงานได้');
    } finally {
        connection?.release();
    }
});

app.put('/api/employees/:id', authenticateToken, isAdmin, async (req, res) => {
    const emailCheck = Object.prototype.hasOwnProperty.call(req.body || {}, 'CompanyEmail')
        ? validateCompanyEmail(req.body.CompanyEmail)
        : { ok: true, email: null };
    if (!emailCheck.ok) return res.status(400).json({ success: false, message: emailCheck.message });
    const profilePayload = Object.fromEntries(
        ['EmployeeName', 'Department', 'Unit', 'Position']
            .filter(field => Object.prototype.hasOwnProperty.call(req.body || {}, field))
            .map(field => [field, req.body[field]])
    );
    if (!Object.prototype.hasOwnProperty.call(profilePayload, 'Position')
        && Object.prototype.hasOwnProperty.call(req.body || {}, 'Team')) {
        profilePayload.Position = req.body.Team;
    }
    const protectedFields = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'CompanyEmail')) protectedFields.CompanyEmail = emailCheck.email;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'Role')) {
        protectedFields.Role = ['Admin', 'User', 'Viewer'].includes(req.body.Role) ? req.body.Role : 'User';
    }
    let connection;
    try {
        await ensureEmployeeCompanyEmailColumn(pool);
        connection = await pool.getConnection();
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.UPDATE,
            employeeId: req.params.id,
            profilePayload,
            protectedFields,
        });
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ', onboardingStatus: result.status, idempotent: result.idempotent });
    } catch (err) {
        sendCrossPathProfileError(res, err, 'ไม่สามารถอัปเดตข้อมูลพนักงานได้');
    } finally {
        connection?.release();
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
        await ensureEmployeeCompanyEmailColumn(connection);
        await connection.beginTransaction();
        let addedCount = 0;
        let duplicateCount = 0;
        const seenEmployeeIds = new Set();
        const addedEmployees = [];
        for (const [rowIndex, emp] of data.entries()) {
            const employeeId = String(emp.EmployeeID ?? '').trim();
            const normalizedIdKey = employeeId.toLowerCase();
            if (normalizedIdKey && seenEmployeeIds.has(normalizedIdKey)) {
                duplicateCount++;
                continue;
            }
            if (normalizedIdKey) seenEmployeeIds.add(normalizedIdKey);
            const position = emp.Position || emp.Team || '';
            const role = allowedRoles.includes(emp.Role) ? emp.Role : 'User';
            const emailCheck = validateCompanyEmail(emp.CompanyEmail || emp.Email || '');
            if (!emailCheck.ok) {
                const error = new ProfileValidationError('INVALID_COMPANY_EMAIL', emailCheck.message, 400);
                error.importRow = rowIndex + 1;
                error.employeeId = String(emp.EmployeeID ?? '');
                throw error;
            }
            try {
                const write = await writeEmployeeProfileWithinTransaction({
                    connection,
                    operation: CROSS_PATH_OPERATION.CREATE,
                    employeeId,
                    profilePayload: {
                        EmployeeName: typeof emp.EmployeeName === 'string' ? emp.EmployeeName : '',
                        Department: typeof emp.Department === 'string' ? emp.Department : '',
                        Unit: typeof emp.Unit === 'string' ? emp.Unit : '',
                        Position: typeof position === 'string' ? position : '',
                    },
                    protectedFields: {
                        Team: typeof emp.Team === 'string' ? emp.Team.trim() : '',
                        CompanyEmail: emailCheck.email,
                        Role: role,
                    },
                });
                addedCount++;
                addedEmployees.push(write.employee);
            } catch (error) {
                if (error instanceof ProfileValidationError && error.code === 'EMPLOYEE_ALREADY_EXISTS') {
                    duplicateCount++;
                    continue;
                }
                error.importRow = rowIndex + 1;
                error.employeeId = String(emp.EmployeeID ?? '');
                throw error;
            }
        }
        await connection.commit();
        for (const employee of addedEmployees) {
            await logAudit(req, {
                action: 'CREATE_EMPLOYEE',
                module: 'admin',
                targetType: 'Employee',
                targetId: employee.EmployeeID,
                detail: `Source: import_json; Role: ${employee.Role || 'User'}`,
                metadata: { source: 'import_json' },
                statusCode: 200,
            });
        }
        res.json({
            success: true,
            message: `Added ${addedCount} new employees; skipped ${duplicateCount} duplicates`,
            addedCount,
            duplicateCount,
            successCount: addedCount,
        });
    } catch (err) {
        await connection.rollback();
        if (err instanceof ProfileValidationError) {
            return res.status(err.httpStatus).json({
                success: false,
                code: err.code,
                message: err.message,
                row: err.importRow || null,
                employeeId: err.employeeId || null,
            });
        }
        res.status(500).json({ success: false, code: 'PROFILE_VALIDATION_UNAVAILABLE', message: 'ไม่สามารถนำเข้าข้อมูลได้' });
    } finally {
        connection.release();
    }
});

// =================================================================
// SECTION 5: GLOBAL ERROR HANDLER
// Catches unhandled errors thrown inside async route handlers
// =================================================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // CORS errors from the origin check
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ success: false, message: 'CORS: origin not allowed' });
    }
    console.error('[Unhandled Error]', req.method, req.path, err.message || err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
});

// =================================================================
// SECTION 6: START THE SERVER
// =================================================================
const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
