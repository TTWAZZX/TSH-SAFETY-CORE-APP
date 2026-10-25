'use strict';

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const model = require('../services/safety-vote-company-visibility-remediation');

const router = express.Router();
const actor = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const role = req => String(req.user?.role || req.user?.Role || '').trim().toUpperCase();
const fail = (res, status, code, message, details) => res.status(status).json({ success: false, code, message, ...(details ? { details } : {}) });

async function permitted(req) {
    if (role(req) === 'ADMIN') return true;
    const [[override]] = await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1', [actor(req), 'SAFETY_VOTE_MANAGE']);
    if (override) return Number(override.granted) === 1;
    const [[grant]] = await db.query('SELECT granted FROM Admin_RolePermissions WHERE UPPER(role)=? AND permission=? LIMIT 1', [role(req), 'SAFETY_VOTE_MANAGE']);
    return Boolean(grant && Number(grant.granted) === 1);
}
const permit = async (req, res, next) => {
    try { return await permitted(req) ? next() : fail(res, 403, 'PERMISSION_DENIED', 'Safety Vote management permission is required.'); }
    catch (_) { return fail(res, 503, 'PERMISSION_CHECK_UNAVAILABLE', 'Unable to verify Safety Vote permission.'); }
};

async function enabled(queryable = db, lock = false) {
    const [rows] = await queryable.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('company_visibility_remediation_contract','company_visibility_remediation_enabled')" + (lock ? ' FOR UPDATE' : ''));
    const settings = Object.fromEntries(rows.map(row => [row.SettingKey, String(row.SettingValue)]));
    return settings.company_visibility_remediation_enabled === '1' && settings.company_visibility_remediation_contract === model.CONTRACT;
}
async function rows(queryable = db, lock = false) {
    const [campaigns] = await queryable.query(`SELECT c.id,c.CampaignCode,c.Status,c.DiscoveryMode,c.RowVersion,c.IsHidden,c.IsTest,v.TitleTh FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID ORDER BY c.id${lock ? ' FOR UPDATE' : ''}`);
    return campaigns;
}
async function audit(queryable, req, action, targetType, targetId, detail, metadata, campaignId = null) {
    await queryable.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,BoundedDetail,MetadataJson) VALUES(?,?,?,?,?,?,?,?)', [campaignId, actor(req), role(req), action, targetType, String(targetId), String(detail).slice(0, 1000), JSON.stringify(metadata || {})]);
}

router.get('/admin/company-visibility-remediation/preview', permit, async (req, res) => {
    try {
        if (!await enabled()) return fail(res, 503, 'REMEDIATION_DISABLED', 'Company visibility remediation is disabled.');
        return res.json({ success: true, data: model.buildPlan(await rows()) });
    } catch (_) { return fail(res, 503, 'REMEDIATION_PREVIEW_UNAVAILABLE', 'Unable to build a remediation preview.'); }
});

router.post('/admin/company-visibility-remediation/apply', permit, async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 1000), previewHash = String(req.body?.previewHash || '').trim().toLowerCase(), confirmation = String(req.body?.confirmation || '').trim(), key = String(req.get('Idempotency-Key') || '').trim();
    if (reason.length < 10 || !/^[a-f0-9]{64}$/.test(previewHash) || key.length < 16) return fail(res, 400, 'VALIDATION_FAILED', 'Reason, preview hash and Idempotency-Key are required.');
    const idempotencyHash = crypto.createHash('sha256').update(`${actor(req)}\n${key}`).digest('hex'), connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await enabled(connection, true)) { await connection.rollback(); return fail(res, 503, 'REMEDIATION_DISABLED', 'Company visibility remediation is disabled.'); }
        const [[replay]] = await connection.query('SELECT * FROM SafetyVote_VisibilityRemediationBatches WHERE IdempotencyHash=? FOR UPDATE', [idempotencyHash]);
        if (replay) { await connection.commit(); return res.json({ success: true, data: { batchId: Number(replay.id), status: replay.Status, replayed: true, previewHash: replay.PreviewHash, candidateCount: Number(replay.CandidateCount) } }); }
        const plan = model.buildPlan(await rows(connection, true));
        if (plan.previewHash !== previewHash) { await connection.rollback(); return fail(res, 409, 'REMEDIATION_PREVIEW_STALE', 'Campaign visibility changed after preview. Run dry-run again.', { currentPreviewHash: plan.previewHash }); }
        if (confirmation !== plan.exactConfirmation) { await connection.rollback(); return fail(res, 400, 'REMEDIATION_CONFIRMATION_REQUIRED', 'Exact remediation confirmation is required.', { exactConfirmation: plan.exactConfirmation }); }
        const [batch] = await connection.query("INSERT INTO SafetyVote_VisibilityRemediationBatches(ContractVersion,PreviewHash,CandidateCount,Reason,IdempotencyHash,Status,AppliedBy) VALUES(?,?,?,?,?,'Applied',?)", [model.CONTRACT, plan.previewHash, plan.counts.remediate, reason, idempotencyHash, actor(req)]);
        for (const item of plan.items.filter(row => row.decision === 'remediate')) {
            const [changed] = await connection.query("UPDATE SafetyVote_Campaigns SET DiscoveryMode='public_listing',UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND DiscoveryMode='eligible_only' AND RowVersion=?", [actor(req), item.id, item.rowVersion]);
            if (Number(changed.affectedRows) !== 1) throw Object.assign(new Error('Campaign visibility changed during remediation.'), { code: 'REMEDIATION_CONFLICT' });
            await connection.query("INSERT INTO SafetyVote_VisibilityRemediationItems(BatchID,CampaignID,CampaignCode,OriginalDiscoveryMode,TargetDiscoveryMode,BeforeRowVersion,AppliedRowVersion,Status) VALUES(?,?,?,?,?,?,?,'Applied')", [batch.insertId, item.id, item.campaignCode, item.discoveryMode, item.targetDiscoveryMode, item.rowVersion, item.rowVersion + 1]);
            await audit(connection, req, 'SAFETY_VOTE_COMPANY_VISIBILITY_REMEDIATED', 'SafetyVote_Campaign', item.id, `eligible_only -> public_listing; batch=${batch.insertId}`, { batchId: Number(batch.insertId), previewHash: plan.previewHash, eligibilityChanged: false, resultEvidenceChanged: false }, item.id);
        }
        await audit(connection, req, 'SAFETY_VOTE_COMPANY_VISIBILITY_REMEDIATION_APPLIED', 'SafetyVote_VisibilityRemediationBatch', batch.insertId, `campaigns=${plan.counts.remediate}`, { previewHash: plan.previewHash, protectedEvidence: plan.protectedEvidence });
        await connection.commit();
        return res.status(201).json({ success: true, data: { batchId: Number(batch.insertId), status: 'Applied', replayed: false, previewHash: plan.previewHash, candidateCount: plan.counts.remediate, protectedEvidence: plan.protectedEvidence } });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return fail(res, error.code === 'REMEDIATION_CONFLICT' ? 409 : 500, error.code === 'REMEDIATION_CONFLICT' ? error.code : 'REMEDIATION_APPLY_FAILED', 'Unable to apply company visibility remediation safely.');
    } finally { connection.release(); }
});

router.post('/admin/company-visibility-remediation/:batchId/rollback', permit, async (req, res) => {
    const batchId = Number(req.params.batchId), reason = String(req.body?.reason || '').trim().slice(0, 1000), confirmation = String(req.body?.confirmation || '').trim();
    if (!Number.isInteger(batchId) || batchId < 1 || reason.length < 10 || confirmation !== `ROLLBACK COMPANY VISIBILITY ${batchId}`) return fail(res, 400, 'ROLLBACK_CONFIRMATION_REQUIRED', 'Exact rollback confirmation and reason are required.');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await enabled(connection, true)) { await connection.rollback(); return fail(res, 503, 'REMEDIATION_DISABLED', 'Company visibility remediation is disabled.'); }
        const [[batch]] = await connection.query('SELECT * FROM SafetyVote_VisibilityRemediationBatches WHERE id=? FOR UPDATE', [batchId]);
        if (!batch) { await connection.rollback(); return fail(res, 404, 'REMEDIATION_BATCH_NOT_FOUND', 'Remediation batch was not found.'); }
        if (batch.Status === 'RolledBack') { await connection.commit(); return res.json({ success: true, data: { batchId, status: 'RolledBack', replayed: true } }); }
        const [items] = await connection.query("SELECT i.*,c.DiscoveryMode,c.RowVersion FROM SafetyVote_VisibilityRemediationItems i JOIN SafetyVote_Campaigns c ON c.id=i.CampaignID WHERE i.BatchID=? AND i.Status='Applied' ORDER BY i.id FOR UPDATE", [batchId]);
        const conflicts = items.filter(item => item.DiscoveryMode !== item.TargetDiscoveryMode || Number(item.RowVersion) !== Number(item.AppliedRowVersion));
        if (conflicts.length) { await connection.rollback(); return fail(res, 409, 'REMEDIATION_ROLLBACK_CONFLICT', 'A remediated campaign changed after apply; rollback was not performed.', { campaignIds: conflicts.map(item => Number(item.CampaignID)) }); }
        for (const item of items) {
            await connection.query('UPDATE SafetyVote_Campaigns SET DiscoveryMode=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?', [item.OriginalDiscoveryMode, actor(req), item.CampaignID]);
            await connection.query("UPDATE SafetyVote_VisibilityRemediationItems SET Status='RolledBack' WHERE id=?", [item.id]);
            await audit(connection, req, 'SAFETY_VOTE_COMPANY_VISIBILITY_REMEDIATION_ROLLED_BACK', 'SafetyVote_Campaign', item.CampaignID, `batch=${batchId}; restored=${item.OriginalDiscoveryMode}`, { batchId, eligibilityChanged: false, resultEvidenceChanged: false }, item.CampaignID);
        }
        await connection.query("UPDATE SafetyVote_VisibilityRemediationBatches SET Status='RolledBack',RolledBackBy=?,RolledBackAt=NOW(),RollbackReason=? WHERE id=?", [actor(req), reason, batchId]);
        await connection.commit();
        return res.json({ success: true, data: { batchId, status: 'RolledBack', replayed: false, restoredCount: items.length } });
    } catch (_) { await connection.rollback().catch(() => {}); return fail(res, 500, 'REMEDIATION_ROLLBACK_FAILED', 'Unable to roll back company visibility remediation safely.'); }
    finally { connection.release(); }
});

module.exports = router;
