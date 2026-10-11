const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
const PUBLISHED_KEY = 'app_branding';
const DRAFT_KEY = 'app_branding_draft';
const VERSIONS_KEY = 'app_branding_versions';
const HISTORY_LIMIT = 12;

const DEFAULT_BRANDING = Object.freeze({
    appName: 'TSH SCA',
    tagline: 'TSH Safety Core Activity',
    loginHeroTitle: 'TSH Safety Core Activity Management System',
    loginHeroSubtitle: 'ระบบบริหารจัดการกิจกรรมด้านความปลอดภัยครบวงจร',
    logoUrl: '',
    loginBackgroundUrl: '',
    loginBackgroundFit: 'cover',
    loginBackgroundFocusX: 50,
    loginBackgroundFocusY: 50,
    loginAnnouncementEnabled: false,
    loginAnnouncementTone: 'info',
    loginAnnouncementTitle: '',
    loginAnnouncementMessage: '',
    loginAnnouncementStartAt: '',
    loginAnnouncementEndAt: '',
    loginAnnouncementLinkLabel: '',
    loginAnnouncementUrl: '',
    supportTitle: 'ต้องการความช่วยเหลือ?',
    supportEmail: '',
    supportPhone: '',
    supportHours: '',
    supportLinkLabel: '',
    supportUrl: '',
});

function parseJson(raw, fallback = null) {
    if (!raw) return fallback;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function normalizeBranding(raw = {}) {
    const focus = value => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
    };
    const text = (value, limit) => String(value || '').trim().slice(0, limit);
    const safeUrl = value => {
        const url = text(value, 1024);
        return url === '' || url.startsWith('/') || /^https:\/\//i.test(url) ? url : '';
    };
    const announcementTone = ['info', 'warning', 'critical'].includes(String(raw.loginAnnouncementTone))
        ? String(raw.loginAnnouncementTone)
        : 'info';
    const loginBackgroundFit = String(raw.loginBackgroundFit) === 'contain' ? 'contain' : 'cover';
    return {
        appName: String(raw.appName || DEFAULT_BRANDING.appName).trim().slice(0, 80) || DEFAULT_BRANDING.appName,
        tagline: String(raw.tagline || DEFAULT_BRANDING.tagline).trim().slice(0, 80) || DEFAULT_BRANDING.tagline,
        loginHeroTitle: String(raw.loginHeroTitle || '').trim().slice(0, 140),
        loginHeroSubtitle: String(raw.loginHeroSubtitle || '').trim().slice(0, 180),
        logoUrl: String(raw.logoUrl || '').trim().slice(0, 1024),
        loginBackgroundUrl: String(raw.loginBackgroundUrl || '').trim().slice(0, 1024),
        loginBackgroundFit,
        loginBackgroundFocusX: focus(raw.loginBackgroundFocusX),
        loginBackgroundFocusY: focus(raw.loginBackgroundFocusY),
        loginAnnouncementEnabled: raw.loginAnnouncementEnabled === true || raw.loginAnnouncementEnabled === 1 || raw.loginAnnouncementEnabled === '1',
        loginAnnouncementTone: announcementTone,
        loginAnnouncementTitle: text(raw.loginAnnouncementTitle, 100),
        loginAnnouncementMessage: text(raw.loginAnnouncementMessage, 300),
        loginAnnouncementStartAt: text(raw.loginAnnouncementStartAt, 40),
        loginAnnouncementEndAt: text(raw.loginAnnouncementEndAt, 40),
        loginAnnouncementLinkLabel: text(raw.loginAnnouncementLinkLabel, 60),
        loginAnnouncementUrl: safeUrl(raw.loginAnnouncementUrl),
        supportTitle: text(raw.supportTitle, 80) || DEFAULT_BRANDING.supportTitle,
        supportEmail: text(raw.supportEmail, 160),
        supportPhone: text(raw.supportPhone, 40),
        supportHours: text(raw.supportHours, 120),
        supportLinkLabel: text(raw.supportLinkLabel, 60),
        supportUrl: safeUrl(raw.supportUrl),
    };
}

function actor(req) {
    return {
        id: String(req.user?.id || req.user?.EmployeeID || 'admin').slice(0, 50),
        name: String(req.user?.name || req.user?.EmployeeName || 'Admin').slice(0, 100),
    };
}

function normalizeHistory(raw) {
    const parsed = parseJson(raw, {});
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
        activeVersionId: String(parsed?.activeVersionId || ''),
        items: items.slice(-HISTORY_LIMIT).map((item, index) => ({
            id: String(item?.id || `legacy-${index + 1}`).slice(0, 80),
            versionNo: Math.max(1, Number.parseInt(item?.versionNo, 10) || index + 1),
            value: normalizeBranding(item?.value || {}),
            publishedAt: String(item?.publishedAt || ''),
            publishedBy: item?.publishedBy && typeof item.publishedBy === 'object' ? item.publishedBy : null,
            source: item?.source === 'rollback' ? 'rollback' : 'publish',
            restoredFromVersionId: item?.restoredFromVersionId ? String(item.restoredFromVersionId).slice(0, 80) : null,
            note: String(item?.note || '').trim().slice(0, 240),
        })),
    };
}

async function ensureTable(queryable = db) {
    await queryable.query(`
        CREATE TABLE IF NOT EXISTS App_Settings (
            key_name VARCHAR(100) PRIMARY KEY,
            value TEXT,
            UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function readRows(queryable = db, lock = false) {
    const [rows] = await queryable.query(
        `SELECT key_name, value, UpdatedAt FROM App_Settings
         WHERE key_name IN (?, ?, ?)${lock ? ' FOR UPDATE' : ''}`,
        [PUBLISHED_KEY, DRAFT_KEY, VERSIONS_KEY]
    );
    return new Map(rows.map(row => [String(row.key_name).toLowerCase(), row]));
}

function workspaceFromRows(rows) {
    const publishedRow = rows.get(PUBLISHED_KEY);
    const draftRow = rows.get(DRAFT_KEY);
    const historyRow = rows.get(VERSIONS_KEY);
    const publishedRaw = parseJson(publishedRow?.value, {});
    const draftRaw = parseJson(draftRow?.value, null);
    const history = normalizeHistory(historyRow?.value);
    const versions = [...history.items].sort((a, b) => b.versionNo - a.versionNo);
    return {
        published: normalizeBranding(publishedRaw || {}),
        publishedUpdatedAt: String(publishedRaw?.updatedAt || publishedRow?.UpdatedAt || ''),
        activeVersionId: history.activeVersionId || versions[0]?.id || '',
        draft: draftRaw ? {
            value: normalizeBranding(draftRaw.value || {}),
            updatedAt: String(draftRaw.updatedAt || draftRow?.UpdatedAt || ''),
            updatedBy: draftRaw.updatedBy || null,
            baseVersionId: String(draftRaw.baseVersionId || history.activeVersionId || ''),
        } : null,
        versions,
        historyLimit: HISTORY_LIMIT,
    };
}

async function upsert(connection, key, value) {
    await connection.query(
        `INSERT INTO App_Settings (key_name, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), UpdatedAt=NOW()`,
        [key, JSON.stringify(value)]
    );
}

function newVersion(value, versionNo, who, source = 'publish', extra = {}) {
    return {
        id: crypto.randomUUID(),
        versionNo,
        value: normalizeBranding(value),
        publishedAt: new Date().toISOString(),
        publishedBy: who,
        source,
        restoredFromVersionId: extra.restoredFromVersionId || null,
        note: String(extra.note || '').trim().slice(0, 240),
    };
}

router.get('/workspace', isAdmin, async (_req, res, next) => {
    try {
        await ensureTable();
        const rows = await readRows();
        res.json({ success: true, data: workspaceFromRows(rows) });
    } catch (error) { next(error); }
});

router.put('/draft', isAdmin, async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await ensureTable(connection);
        await connection.beginTransaction();
        const rows = await readRows(connection, true);
        const current = workspaceFromRows(rows);
        const expected = String(req.body?.expectedDraftUpdatedAt || '');
        if (expected && expected !== String(current.draft?.updatedAt || '')) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'BRANDING_DRAFT_CONFLICT', message: 'Draft ถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลใหม่' });
        }
        const who = actor(req);
        const draft = {
            value: normalizeBranding(req.body?.value || {}),
            updatedAt: new Date().toISOString(),
            updatedBy: who,
            baseVersionId: current.activeVersionId || '',
        };
        await upsert(connection, DRAFT_KEY, draft);
        await connection.commit();
        await logAudit(req, { action: 'SAVE_BRANDING_DRAFT', module: 'settings', targetType: 'App_Settings', targetId: DRAFT_KEY, detail: 'Saved system Branding draft', metadata: { baseVersionId: draft.baseVersionId } });
        res.json({ success: true, data: draft });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        next(error);
    } finally { connection.release(); }
});

router.delete('/draft', isAdmin, async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await ensureTable(connection);
        await connection.beginTransaction();
        const current = workspaceFromRows(await readRows(connection, true));
        const expected = String(req.body?.expectedDraftUpdatedAt || '');
        if (!current.draft || !expected || expected !== current.draft.updatedAt) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'BRANDING_DRAFT_CONFLICT', message: 'Draft เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่ก่อนทิ้ง Draft' });
        }
        await connection.query('DELETE FROM App_Settings WHERE key_name=?', [DRAFT_KEY]);
        await connection.commit();
        await logAudit(req, { action: 'DISCARD_BRANDING_DRAFT', module: 'settings', targetType: 'App_Settings', targetId: DRAFT_KEY, detail: 'Discarded system Branding draft' });
        res.json({ success: true });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        next(error);
    } finally { connection.release(); }
});

router.post('/publish', isAdmin, async (req, res, next) => {
    if (req.body?.confirmation !== 'PUBLISH_BRANDING') {
        return res.status(400).json({ success: false, code: 'BRANDING_CONFIRMATION_REQUIRED', message: 'กรุณายืนยันการ Publish Branding' });
    }
    const connection = await db.getConnection();
    try {
        await ensureTable(connection);
        await connection.beginTransaction();
        const rows = await readRows(connection, true);
        const current = workspaceFromRows(rows);
        if (!current.draft) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'BRANDING_DRAFT_REQUIRED', message: 'ไม่พบ Draft สำหรับ Publish' });
        }
        const expected = String(req.body?.expectedDraftUpdatedAt || '');
        if (!expected || expected !== current.draft.updatedAt) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'BRANDING_DRAFT_CONFLICT', message: 'Draft เปลี่ยนแปลงแล้ว กรุณาตรวจสอบก่อน Publish' });
        }
        const history = normalizeHistory(rows.get(VERSIONS_KEY)?.value);
        const who = actor(req);
        if (!history.items.length && rows.get(PUBLISHED_KEY)?.value) {
            history.items.push(newVersion(current.published, 1, { id: 'legacy', name: 'Existing setting' }, 'publish', { note: 'Imported existing published Branding' }));
        }
        const nextNo = history.items.reduce((max, item) => Math.max(max, item.versionNo), 0) + 1;
        const version = newVersion(current.draft.value, nextNo, who, 'publish', { note: req.body?.note });
        history.items = [...history.items, version].slice(-HISTORY_LIMIT);
        history.activeVersionId = version.id;
        const published = { ...version.value, updatedAt: version.publishedAt, updatedBy: who, versionId: version.id, versionNo: version.versionNo };
        await upsert(connection, PUBLISHED_KEY, published);
        await upsert(connection, VERSIONS_KEY, history);
        await connection.query('DELETE FROM App_Settings WHERE key_name=?', [DRAFT_KEY]);
        await connection.commit();
        await logAudit(req, { action: 'PUBLISH_BRANDING', module: 'settings', targetType: 'BrandingVersion', targetId: version.id, detail: `Published Branding version ${version.versionNo}`, metadata: { versionNo: version.versionNo, source: version.source } });
        const freshRows = await readRows();
        res.json({ success: true, data: workspaceFromRows(freshRows) });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        next(error);
    } finally { connection.release(); }
});

router.post('/versions/:versionId/rollback', isAdmin, async (req, res, next) => {
    if (req.body?.confirmation !== 'ROLLBACK_BRANDING') {
        return res.status(400).json({ success: false, code: 'BRANDING_CONFIRMATION_REQUIRED', message: 'กรุณายืนยันการ Rollback Branding' });
    }
    const connection = await db.getConnection();
    try {
        await ensureTable(connection);
        await connection.beginTransaction();
        const rows = await readRows(connection, true);
        const current = workspaceFromRows(rows);
        const expectedActive = String(req.body?.expectedActiveVersionId || '');
        if (expectedActive && expectedActive !== current.activeVersionId) {
            await connection.rollback();
            return res.status(409).json({ success: false, code: 'BRANDING_VERSION_CONFLICT', message: 'เวอร์ชันที่เผยแพร่เปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่' });
        }
        const history = normalizeHistory(rows.get(VERSIONS_KEY)?.value);
        const target = history.items.find(item => item.id === req.params.versionId);
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ success: false, code: 'BRANDING_VERSION_NOT_FOUND', message: 'ไม่พบ Branding version ที่เลือก' });
        }
        const who = actor(req);
        const nextNo = history.items.reduce((max, item) => Math.max(max, item.versionNo), 0) + 1;
        const version = newVersion(target.value, nextNo, who, 'rollback', { restoredFromVersionId: target.id, note: req.body?.note });
        history.items = [...history.items, version].slice(-HISTORY_LIMIT);
        history.activeVersionId = version.id;
        const published = { ...version.value, updatedAt: version.publishedAt, updatedBy: who, versionId: version.id, versionNo: version.versionNo };
        await upsert(connection, PUBLISHED_KEY, published);
        await upsert(connection, VERSIONS_KEY, history);
        await connection.commit();
        await logAudit(req, { action: 'ROLLBACK_BRANDING', module: 'settings', targetType: 'BrandingVersion', targetId: version.id, detail: `Rolled back Branding to version ${target.versionNo} as version ${version.versionNo}`, metadata: { versionNo: version.versionNo, restoredFromVersionId: target.id } });
        const freshRows = await readRows();
        res.json({ success: true, data: workspaceFromRows(freshRows) });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        next(error);
    } finally { connection.release(); }
});

module.exports = router;
