'use strict';

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const foundation = require('./safety-vote');
const phase1 = require('../services/safety-vote-phase1');
const phase2 = require('../services/safety-vote-phase2');

const router = express.Router();
const CONTRACT = '2026-10-20-safety-vote-eligibility-amendments-r1';
const ACTIVE_STATES = new Set(['Scheduled', 'Open']);
const CONFIGURABLE_STATES = new Set(['Draft', 'Scheduled', 'Open']);
const ENROLLMENT_MODES = new Set(['closed_after_open', 'admin_approval', 'automatic_rule_match']);
const OPEN_MODES = new Set(['admin_approval', 'automatic_rule_match']);

const actor = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const role = req => String(req.user?.role || req.user?.Role || '').trim().toUpperCase();
const fail = (res, status, code, message, details) => res.status(status).json({ success: false, code, message, ...(details ? { details } : {}) });

async function hasPermission(req, permission) {
    if (role(req) === 'ADMIN') return true;
    const [[override]] = await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1', [actor(req), permission]);
    if (override) return Number(override.granted) === 1;
    const [[row]] = await db.query('SELECT granted FROM Admin_RolePermissions WHERE UPPER(role)=? AND permission=? LIMIT 1', [role(req), permission]);
    return Boolean(row && Number(row.granted) === 1);
}

const permit = permission => async (req, res, next) => {
    try {
        return await hasPermission(req, permission) ? next() : fail(res, 403, 'PERMISSION_DENIED', 'Safety Vote eligibility permission is required.');
    } catch (_) {
        return fail(res, 503, 'PERMISSION_CHECK_UNAVAILABLE', 'Unable to verify Safety Vote permission.');
    }
};

async function requireFeature(queryable = db, lock = false) {
    const [[row]] = await queryable.query(`SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_amendment_enabled'${lock ? ' FOR UPDATE' : ''}`);
    return String(row?.SettingValue || '0') === '1';
}

async function requireRemovalFeature(queryable = db, lock = false) {
    const [[row]] = await queryable.query(`SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_removal_enabled'${lock ? ' FOR UPDATE' : ''}`);
    return String(row?.SettingValue || '0') === '1';
}

async function campaign(campaignId, queryable = db, lock = false) {
    const [rows] = await queryable.query(`SELECT c.id,c.CampaignCode,c.Status,c.CurrentVersionID,c.ScheduledOpenAt,c.ScheduledCloseAt,v.VersionNo,v.Status VersionStatus,v.TitleTh,v.OpenAt,v.CloseAt,v.EligibilityEnrollmentMode FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?${lock ? ' FOR UPDATE' : ''}`, [campaignId]);
    return rows[0] || null;
}

function voterProjection(row) {
    return {
        employeeId: String(row.employeeId), employeeName: row.employeeName || '',
        departmentId: row.departmentId ?? null, departmentName: row.departmentName || '',
        safetyUnitId: row.safetyUnitId ?? null, safetyUnitName: row.safetyUnitName || '',
        positionId: row.positionId ?? null, positionName: row.positionName || '',
        role: row.role || '', team: row.team || '', masterPresent: row.masterPresent !== false,
        accountReady: Boolean(row.accountReady), inclusionSource: row.inclusionSource || 'rule',
        inclusionReason: row.inclusionReason || null, masterWarnings: Array.isArray(row.masterWarnings) ? row.masterWarnings : [],
    };
}

async function preview(campaignId, queryable = db, options = {}) {
    const current = await campaign(campaignId, queryable, Boolean(options.lock));
    if (!current) return { error: [404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.'] };
    if (!ACTIVE_STATES.has(current.Status)) return { error: [409, 'CAMPAIGN_STATE_CONFLICT', 'Eligibility amendments are available only for Scheduled or Open campaigns.'] };
    const mode = String(current.EligibilityEnrollmentMode || 'closed_after_open');
    if (!OPEN_MODES.has(mode)) return { error: [409, 'ELIGIBILITY_ENROLLMENT_CLOSED', 'This campaign does not accept new eligible voters after opening.'] };
    const [snapshots] = await queryable.query(`SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1${options.lock ? ' FOR UPDATE' : ''}`, [current.CurrentVersionID]);
    const source = snapshots[0] || null;
    if (!source) return { error: [409, 'FROZEN_SNAPSHOT_REQUIRED', 'A frozen eligibility snapshot is required before an amendment.'] };
    const [stored] = await queryable.query('SELECT RuleGroup ruleGroup,RuleOrder ruleOrder,Effect effect,AttributeKey attributeKey,Operator operator,ValuesJson,Reason reason FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 ORDER BY RuleGroup,RuleOrder,id', [current.CurrentVersionID]);
    const parsed = phase1.normalizeRules(stored.map(row => ({ ...row, values: JSON.parse(row.ValuesJson || '[]') })));
    if (!parsed.ok || !parsed.rules.length) return { error: [422, 'ELIGIBILITY_RULES_INVALID', 'Active eligibility rules are required.'] };
    const master = await foundation.masterProjection(queryable);
    const eligible = phase1.evaluateEligibility(parsed.rules, master.employees).map(voterProjection);
    const [baseline] = await queryable.query('SELECT EmployeeID employeeId,EmployeeNameSnapshot employeeName,DepartmentIDSnapshot departmentId,DepartmentNameSnapshot departmentName,SafetyUnitIDSnapshot safetyUnitId,SafetyUnitNameSnapshot safetyUnitName,PositionIDSnapshot positionId,PositionNameSnapshot positionName,RoleSnapshot role,TeamSnapshot team,MasterPresent masterPresent,AccountReady accountReady,InclusionSource inclusionSource,InclusionReason inclusionReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [source.id]);
    const baselineIds = new Set(baseline.map(row => String(row.employeeId)));
    const eligibleIds = new Set(eligible.map(row => row.employeeId));
    const candidates = eligible.filter(row => !baselineIds.has(row.employeeId));
    const ignoredRemovalCount = baseline.filter(row => !eligibleIds.has(String(row.employeeId))).length;
    const candidateSetHash = phase2.rowsHash(candidates);
    const ruleHash = phase1.canonicalHash(parsed.rules);
    const previewHash = phase2.hash({ campaignId: Number(current.id), campaignVersionId: Number(current.CurrentVersionID), sourceSnapshotId: Number(source.id), sourceRowsHash: String(source.RowsHash || ''), ruleHash, candidateSetHash, enrollmentMode: mode });
    return {
        campaign: current, source, baseline: baseline.map(voterProjection), candidates, ruleHash, candidateSetHash, previewHash, ignoredRemovalCount,
        data: {
            contractVersion: CONTRACT, dryRun: true, addOnly: true,
            campaign: { id: Number(current.id), campaignCode: current.CampaignCode, status: current.Status, versionId: Number(current.CurrentVersionID), versionNo: Number(current.VersionNo), enrollmentMode: mode },
            sourceSnapshot: { id: Number(source.id), snapshotNo: Number(source.SnapshotNo), eligibleCount: Number(source.EligibleCount), rowsHash: source.RowsHash, snapshotKind: source.SnapshotKind || 'initial_freeze' },
            candidateCount: candidates.length,
            accountReadyCount: candidates.filter(row => row.accountReady).length,
            warningCount: candidates.reduce((sum, row) => sum + row.masterWarnings.length, 0),
            ignoredRemovalCount, candidateSetHash, previewHash,
            rows: candidates.slice(0, 250), truncated: candidates.length > 250,
        },
    };
}

async function appendEvent(connection, req, amendment, eventType, fromStatus, toStatus, detail, metadata, previousHash = null, sequence = 1) {
    const payload = { amendmentId: Number(amendment.id), campaignId: Number(amendment.campaignId), campaignVersionId: Number(amendment.versionId), eventSequence: sequence, eventType, actorEmployeeId: actor(req), actorRole: role(req), fromStatus, toStatus, boundedDetail: detail, metadata, previousEventHash: previousHash };
    const eventHash = phase2.hash(payload);
    await connection.query('INSERT INTO SafetyVote_EligibilityAmendmentEvents(AmendmentID,CampaignID,CampaignVersionID,EventSequence,EventType,ActorEmployeeID,ActorRole,FromStatus,ToStatus,BoundedDetail,MetadataJson,PreviousEventHash,EventHash,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [amendment.id, amendment.campaignId, amendment.versionId, sequence, eventType, actor(req), role(req), fromStatus, toStatus, detail, JSON.stringify(metadata), previousHash, eventHash, req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
    return eventHash;
}

async function autoEnrollEligibleMember(req, campaignId) {
    const employeeId = actor(req);
    if (!employeeId || role(req) === 'ADMIN') return { checked: false, enrolled: false, reason: 'ACTOR_NOT_APPLICABLE' };
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await requireFeature(connection, true)) { await connection.rollback(); return { checked: false, enrolled: false, reason: 'FEATURE_DISABLED' }; }
        const current = await campaign(campaignId, connection, true);
        if (!current || !ACTIVE_STATES.has(current.Status) || String(current.EligibilityEnrollmentMode) !== 'automatic_rule_match') {
            await connection.rollback();
            return { checked: false, enrolled: false, reason: 'POLICY_NOT_ACTIVE' };
        }
        const [snapshots] = await connection.query("SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC,id DESC LIMIT 1 FOR UPDATE", [current.CurrentVersionID]);
        const source = snapshots[0];
        if (!source) { await connection.rollback(); return { checked: true, enrolled: false, reason: 'FROZEN_SNAPSHOT_REQUIRED' }; }
        const [[existing]] = await connection.query('SELECT id FROM SafetyVote_EligibleVoters WHERE SnapshotID=? AND EmployeeID=? LIMIT 1', [source.id, employeeId]);
        if (existing) { await connection.rollback(); return { checked: true, enrolled: false, eligible: true, reason: 'ALREADY_ELIGIBLE', snapshotId: Number(source.id) }; }
        const [stored] = await connection.query('SELECT RuleGroup ruleGroup,RuleOrder ruleOrder,Effect effect,AttributeKey attributeKey,Operator operator,ValuesJson,Reason reason FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 ORDER BY RuleGroup,RuleOrder,id', [current.CurrentVersionID]);
        const parsed = phase1.normalizeRules(stored.map(row => ({ ...row, values: JSON.parse(row.ValuesJson || '[]') })));
        if (!parsed.ok || !parsed.rules.length) { await connection.rollback(); return { checked: true, enrolled: false, reason: 'ELIGIBILITY_RULES_INVALID' }; }
        const master = await foundation.masterProjection(connection);
        const matched = phase1.evaluateEligibility(parsed.rules, master.employees).find(row => String(row.employeeId) === employeeId);
        if (!matched) { await connection.rollback(); return { checked: true, enrolled: false, reason: 'RULE_NOT_MATCHED' }; }
        const row = voterProjection(matched), reason = 'Automatic enrollment after current eligibility rule match';
        const keyHash = crypto.createHash('sha256').update(`automatic-rule-match:${current.CurrentVersionID}:${employeeId}`).digest('hex');
        const candidateSetHash = phase2.rowsHash([row]), ruleHash = phase1.canonicalHash(parsed.rules);
        const [created] = await connection.query("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy,ReviewedBy,ReviewedAt) VALUES(?,?,?,'automatic_rule_match','automatic_rule_match','Approved',?,1,1,?,?,?,?,?,NOW())", [campaignId, current.CurrentVersionID, source.id, reason, source.RowsHash, candidateSetHash, keyHash, employeeId, employeeId]);
        const amendmentId = Number(created.insertId);
        await connection.query('INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())', [amendmentId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, 'rule_match', row.inclusionReason, JSON.stringify(row.masterWarnings), 'Approved', reason, employeeId]);
        const amendment = { id: amendmentId, campaignId, versionId: current.CurrentVersionID };
        let eventHash = await appendEvent(connection, req, amendment, 'REQUESTED', null, 'Pending', reason, { candidateCount: 1, candidateSetHash, trigger: 'participant_access' }, null, 1);
        eventHash = await appendEvent(connection, req, amendment, 'APPROVED', 'Pending', 'Approved', reason, { approvedCount: 1, enrollmentMode: 'automatic_rule_match', trigger: 'participant_access' }, eventHash, 2);
        const [[next]] = await connection.query('SELECT COALESCE(MAX(SnapshotNo),0)+1 snapshotNo FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [current.CurrentVersionID]);
        const [snapshotCreated] = await connection.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,?,'building',?,NULL,0,0,?,NULL,NULL,?,?,?,'amendment')", [current.CurrentVersionID, next.snapshotNo, ruleHash, Number(source.WarningCount || 0) + row.masterWarnings.length, reason, employeeId, source.id]);
        const resultSnapshotId = Number(snapshotCreated.insertId);
        await connection.query('INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) SELECT ?,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=?', [resultSnapshotId, source.id]);
        await connection.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'eligible',?,?,?,NOW(),?)", [resultSnapshotId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, 'automatic_rule_match', row.inclusionReason, employeeId, reason]);
        const [merged] = await connection.query('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [resultSnapshotId]);
        const afterRowsHash = phase2.rowsHash(merged), accountReadyCount = merged.filter(item => Boolean(item.accountReady)).length;
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=? AND Status='frozen'", [source.id]);
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='frozen',RowsHash=?,EligibleCount=?,AccountReadyCount=?,FrozenAt=NOW(),FrozenBy=? WHERE id=? AND Status='building'", [afterRowsHash, merged.length, accountReadyCount, employeeId, resultSnapshotId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendmentMembers SET MemberStatus='Applied',AppliedAt=NOW() WHERE AmendmentID=?", [amendmentId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=1,SkippedCount=0,AfterRowsHash=?,AppliedBy=?,AppliedAt=NOW(),MetadataJson=? WHERE id=?", [resultSnapshotId, afterRowsHash, employeeId, JSON.stringify({ trigger: 'participant_access', addOnly: true, automatic: true }), amendmentId]);
        await appendEvent(connection, req, amendment, 'APPLIED', 'Approved', 'Applied', reason, { sourceSnapshotId: Number(source.id), resultSnapshotId, addedCount: 1, afterRowsHash, trigger: 'participant_access' }, eventHash, 3);
        const notificationSuppressionKey = crypto.createHash('sha256').update(`eligibility-auto-enrolled:${current.CurrentVersionID}:${employeeId}`).digest('hex');
        const notificationMetadata = {
            title: 'คุณได้รับสิทธิ์เข้าร่วมแคมเปญแล้ว',
            message: current.Status === 'Open'
                ? 'ข้อมูลของคุณตรงตามเงื่อนไขของแคมเปญ สามารถเปิดรายละเอียดและเข้าร่วมโหวตได้แล้ว'
                : 'ข้อมูลของคุณตรงตามเงื่อนไขของแคมเปญ ระบบเพิ่มสิทธิ์ให้แล้ว และจะเข้าร่วมได้เมื่อถึงเวลาเปิด',
            route: `#safety-vote=${current.CampaignCode}`,
            campaignCode: current.CampaignCode,
            enrollmentMode: 'automatic_rule_match',
            eligibilityReason: 'CAMPAIGN_RULE_MATCH',
            automaticEnrollment: true,
            canParticipateNow: current.Status === 'Open',
            opensAt: current.OpenAt || current.ScheduledOpenAt || null,
            closesAt: current.CloseAt || current.ScheduledCloseAt || null,
            snapshotNo: Number(next.snapshotNo),
        };
        const [notification] = await connection.query("INSERT INTO SafetyVote_Notifications(CampaignID,EventType,TemplateKey,Channel,RecipientEmployeeID,ScheduledAt,DispatchedAt,Status,SuppressionKey,AttemptCount,PayloadMetadataJson,CreatedBy) VALUES(?,'eligibility_granted','automatic_eligibility_granted','in_app',?,NOW(),NOW(),'Sent',?,1,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [campaignId, employeeId, notificationSuppressionKey, JSON.stringify(notificationMetadata), employeeId]);
        const notificationId = Number(notification.insertId || 0);
        await connection.query("INSERT IGNORE INTO SafetyVote_NotificationDeliveries(NotificationID,AttemptNo,DeliveryState,MetadataJson) VALUES(?,1,'Sent',?)", [notificationId, JSON.stringify({ channel: 'in_app', transport: 'internal_auto_enrollment' })]);
        await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [campaignId, current.CurrentVersionID, employeeId, role(req), 'SAFETY_VOTE_ELIGIBILITY_AUTO_ENROLLED', 'SafetyVote_EligibilityAmendment', String(amendmentId), 201, `employee=${employeeId}; sourceSnapshot=${source.id}; resultSnapshot=${resultSnapshotId}`, JSON.stringify({ employeeId, sourceSnapshotId: Number(source.id), resultSnapshotId, beforeRowsHash: source.RowsHash, afterRowsHash, candidateSetHash, enrollmentMode: 'automatic_rule_match', trigger: 'participant_access', addOnly: true }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        await connection.commit();
        return { checked: true, enrolled: true, eligible: true, amendmentId, notificationId, sourceSnapshotId: Number(source.id), snapshotId: resultSnapshotId, snapshotNo: Number(next.snapshotNo) };
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') return { checked: true, enrolled: false, reason: 'CONCURRENTLY_ENROLLED' };
        throw error;
    } finally { connection.release(); }
}

async function overview(campaignId, queryable = db) {
    const current = await campaign(campaignId, queryable);
    if (!current) return null;
    const enabled = await requireFeature(queryable);
    const [snapshotResult, amendmentResult, removalEnabled] = await Promise.all([
        queryable.query("SELECT id,SnapshotNo,Status,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,ParentSnapshotID,SnapshotKind FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1", [current.CurrentVersionID]),
        queryable.query("SELECT a.id,a.SourceSnapshotID,a.ResultSnapshotID,a.EnrollmentMode,a.RequestType,a.Status,a.Reason,a.CandidateCount,a.ApprovedCount,a.AddedCount,a.SkippedCount,a.BeforeRowsHash,a.CandidateSetHash,a.AfterRowsHash,a.RequestedBy,a.RequestedAt,a.ReviewedBy,a.ReviewedAt,a.AppliedBy,a.AppliedAt,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentMembers m WHERE m.AmendmentID=a.id AND m.MemberStatus='Removed') RemovedCount FROM SafetyVote_EligibilityAmendments a WHERE a.CampaignVersionID=? ORDER BY a.id DESC LIMIT 50", [current.CurrentVersionID]),
        requireRemovalFeature(queryable),
    ]);
    const snapshot = snapshotResult[0][0] || null, amendments = amendmentResult[0];
    const mode = String(current.EligibilityEnrollmentMode || 'closed_after_open');
    return {
        contractVersion: CONTRACT,
        featureEnabled: enabled,
        campaign: { id: Number(current.id), campaignCode: current.CampaignCode, status: current.Status, versionId: Number(current.CurrentVersionID), versionNo: Number(current.VersionNo) },
        policy: {
            enrollmentMode: mode,
            configurable: enabled && CONFIGURABLE_STATES.has(current.Status),
            previewAllowed: enabled && ACTIVE_STATES.has(current.Status) && OPEN_MODES.has(mode),
            applyAllowed: enabled && ACTIVE_STATES.has(current.Status) && OPEN_MODES.has(mode),
            automaticOnParticipantAccess: enabled && ACTIVE_STATES.has(current.Status) && mode === 'automatic_rule_match',
            automaticTriggers: ['campaign_discovery', 'campaign_detail', 'ballot_submit'],
            addOnly: true,
            allowedModes: [...ENROLLMENT_MODES],
            removal: { enabled: removalEnabled, mode: 'unstarted_only', allowed: removalEnabled && ACTIVE_STATES.has(current.Status) && mode === 'admin_approval', requiresEnrollmentMode: 'admin_approval', protectedActivities: ['participation', 'submission', 'nomination', 'jury_assignment'] },
        },
        currentSnapshot: snapshot ? {
            id: Number(snapshot.id), snapshotNo: Number(snapshot.SnapshotNo), status: snapshot.Status,
            eligibleCount: Number(snapshot.EligibleCount), accountReadyCount: Number(snapshot.AccountReadyCount), warningCount: Number(snapshot.WarningCount),
            rowsHash: snapshot.RowsHash, frozenAt: snapshot.FrozenAt, frozenBy: snapshot.FrozenBy, reason: snapshot.Reason,
            parentSnapshotId: snapshot.ParentSnapshotID ? Number(snapshot.ParentSnapshotID) : null, snapshotKind: snapshot.SnapshotKind || 'initial_freeze',
        } : null,
        amendments: amendments.map(row => ({
            id: Number(row.id), sourceSnapshotId: Number(row.SourceSnapshotID), resultSnapshotId: row.ResultSnapshotID ? Number(row.ResultSnapshotID) : null,
            enrollmentMode: row.EnrollmentMode, requestType: row.RequestType, status: row.Status, reason: row.Reason,
            candidateCount: Number(row.CandidateCount), approvedCount: Number(row.ApprovedCount), addedCount: Number(row.AddedCount), skippedCount: Number(row.SkippedCount),
            removedCount: Number(row.RemovedCount || 0),
            beforeRowsHash: row.BeforeRowsHash, candidateSetHash: row.CandidateSetHash, afterRowsHash: row.AfterRowsHash,
            requestedBy: row.RequestedBy, requestedAt: row.RequestedAt, reviewedBy: row.ReviewedBy, reviewedAt: row.ReviewedAt, appliedBy: row.AppliedBy, appliedAt: row.AppliedAt,
        })),
    };
}

router.get('/admin/campaigns/:id/eligibility/amendments', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id);
    if (!id) return fail(res, 400, 'VALIDATION_FAILED', 'A valid campaign ID is required.');
    try {
        const data = await overview(id);
        return data ? res.json({ success: true, data }) : fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.');
    } catch (error) {
        console.error('[safety-vote] eligibility amendment overview failed:', error);
        return fail(res, 503, 'ELIGIBILITY_AMENDMENT_OVERVIEW_FAILED', 'Unable to load eligibility management status.');
    }
});

router.put('/admin/campaigns/:id/eligibility/enrollment-mode', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id), mode = phase2.text(req.body?.enrollmentMode, 32), reason = phase2.text(req.body?.reason, 500);
    if (!id || !ENROLLMENT_MODES.has(mode) || reason.length < 10) return fail(res, 400, 'VALIDATION_FAILED', 'Campaign, enrollment mode and a reason of at least 10 characters are required.');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await requireFeature(connection, true)) { await connection.rollback(); return fail(res, 503, 'ELIGIBILITY_AMENDMENT_DISABLED', 'Eligibility amendments are disabled.'); }
        const current = await campaign(id, connection, true);
        if (!current) { await connection.rollback(); return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.'); }
        if (!CONFIGURABLE_STATES.has(current.Status)) { await connection.rollback(); return fail(res, 409, 'CAMPAIGN_STATE_CONFLICT', 'Enrollment policy is read-only after the campaign closes.'); }
        if (current.Status !== 'Draft' && req.body?.confirmation !== `SET ${current.CampaignCode} ${mode}`) { await connection.rollback(); return fail(res, 400, 'ENROLLMENT_MODE_CONFIRMATION_REQUIRED', 'Exact campaign and enrollment mode confirmation is required.'); }
        const previousMode = String(current.EligibilityEnrollmentMode || 'closed_after_open');
        if (previousMode !== mode) {
            await connection.query('UPDATE SafetyVote_CampaignVersions SET EligibilityEnrollmentMode=?,EligibilityEnrollmentUpdatedAt=NOW(),EligibilityEnrollmentUpdatedBy=?,UpdatedAt=NOW() WHERE id=?', [mode, actor(req), current.CurrentVersionID]);
            await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [id, current.CurrentVersionID, actor(req), role(req), 'SAFETY_VOTE_ELIGIBILITY_ENROLLMENT_MODE_UPDATE', 'SafetyVote_CampaignVersion', String(current.CurrentVersionID), 200, reason, JSON.stringify({ previousMode, enrollmentMode: mode, campaignStatus: current.Status }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        }
        await connection.commit();
        return res.json({ success: true, data: { contractVersion: CONTRACT, campaignId: id, campaignVersionId: Number(current.CurrentVersionID), campaignStatus: current.Status, previousMode, enrollmentMode: mode, changed: previousMode !== mode } });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error('[safety-vote] eligibility enrollment mode update failed:', error);
        return fail(res, 500, 'ELIGIBILITY_ENROLLMENT_MODE_UPDATE_FAILED', 'Unable to update eligibility enrollment mode.');
    } finally { connection.release(); }
});

router.post('/admin/campaigns/:id/eligibility/amendments/preview', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id);
    if (!id) return fail(res, 400, 'VALIDATION_FAILED', 'A valid campaign ID is required.');
    try {
        if (!await requireFeature()) return fail(res, 503, 'ELIGIBILITY_AMENDMENT_DISABLED', 'Eligibility amendments are disabled.');
        const result = await preview(id);
        if (result.error) return fail(res, ...result.error);
        return res.json({ success: true, data: result.data });
    } catch (error) {
        console.error('[safety-vote] eligibility amendment preview failed:', error);
        return fail(res, 503, 'ELIGIBILITY_AMENDMENT_PREVIEW_FAILED', 'Unable to preview new eligible voters.');
    }
});

router.post('/admin/campaigns/:id/eligibility/amendments/individual', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id), employeeId = phase2.text(req.body?.employeeId, 20), reason = phase2.text(req.body?.reason, 500);
    const idempotencyKey = phase2.text(req.get('Idempotency-Key'), 200);
    if (!id || !employeeId || Array.from(reason).length < 10 || idempotencyKey.length < 16) return fail(res, 400, 'VALIDATION_FAILED', 'Campaign, employee, reason of at least 10 characters and a valid Idempotency-Key are required.');
    const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await requireFeature(connection, true)) { await connection.rollback(); return fail(res, 503, 'ELIGIBILITY_AMENDMENT_DISABLED', 'Eligibility amendments are disabled.'); }
        const [replays] = await connection.query('SELECT * FROM SafetyVote_EligibilityAmendments WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND IdempotencyKeyHash=? LIMIT 1 FOR UPDATE', [id, keyHash]);
        const replay = replays[0];
        if (replay) {
            const [[member]] = await connection.query('SELECT EmployeeID employeeId FROM SafetyVote_EligibilityAmendmentMembers WHERE AmendmentID=? ORDER BY id LIMIT 1', [replay.id]);
            await connection.rollback();
            if (replay.Status !== 'Applied') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to an unfinished amendment.');
            return res.json({ success: true, data: { contractVersion: CONTRACT, amendmentId: Number(replay.id), status: replay.Status, employeeId: member?.employeeId || null, sourceSnapshotId: Number(replay.SourceSnapshotID), resultSnapshotId: Number(replay.ResultSnapshotID), addedCount: Number(replay.AddedCount), afterRowsHash: replay.AfterRowsHash, replayed: true } });
        }
        const current = await campaign(id, connection, true);
        if (!current) { await connection.rollback(); return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.'); }
        if (!ACTIVE_STATES.has(current.Status)) { await connection.rollback(); return fail(res, 409, 'CAMPAIGN_STATE_CONFLICT', 'Individual eligibility additions are available only for Scheduled or Open campaigns.'); }
        const mode = String(current.EligibilityEnrollmentMode || 'closed_after_open');
        if (!OPEN_MODES.has(mode)) { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_ENROLLMENT_CLOSED', 'This campaign does not accept new eligible voters after opening.'); }
        if (req.body?.confirmation !== `ADD ${current.CampaignCode} ${employeeId}`) { await connection.rollback(); return fail(res, 400, 'AMENDMENT_CONFIRMATION_REQUIRED', 'Exact campaign and employee confirmation is required.'); }
        const [[source]] = await connection.query("SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC,id DESC LIMIT 1 FOR UPDATE", [current.CurrentVersionID]);
        if (!source) { await connection.rollback(); return fail(res, 409, 'FROZEN_SNAPSHOT_REQUIRED', 'A frozen eligibility snapshot is required before an amendment.'); }
        const [[existing]] = await connection.query('SELECT id FROM SafetyVote_EligibleVoters WHERE SnapshotID=? AND EmployeeID=? LIMIT 1', [source.id, employeeId]);
        if (existing) { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_ALREADY_GRANTED', 'This employee is already eligible in the current snapshot.'); }
        const master = await foundation.masterProjection(connection);
        const matched = master.employees.find(item => String(item.employeeId) === employeeId);
        if (!matched) { await connection.rollback(); return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found in current Employee Master Data.'); }
        const row = { ...voterProjection(matched), inclusionSource: 'eligibility_amendment', inclusionReason: reason };
        const candidateSetHash = phase2.rowsHash([row]);
        const [created] = await connection.query("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy,ReviewedBy,ReviewedAt) VALUES(?,?,?,?,'individual_add','Approved',?,1,1,?,?,?,?,?,NOW())", [id, current.CurrentVersionID, source.id, mode, reason, source.RowsHash, candidateSetHash, keyHash, actor(req), actor(req)]);
        const amendmentId = Number(created.insertId);
        await connection.query("INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'individual_admin_add',?,?, 'Approved',?,?,NOW())", [amendmentId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, reason, JSON.stringify(row.masterWarnings), reason, actor(req)]);
        const amendment = { id: amendmentId, campaignId: id, versionId: current.CurrentVersionID };
        let eventHash = await appendEvent(connection, req, amendment, 'REQUESTED', null, 'Pending', reason, { employeeId, candidateCount: 1, candidateSetHash, requestType: 'individual_add' }, null, 1);
        eventHash = await appendEvent(connection, req, amendment, 'APPROVED', 'Pending', 'Approved', reason, { employeeId, approvedCount: 1, enrollmentMode: mode }, eventHash, 2);
        const [[next]] = await connection.query('SELECT COALESCE(MAX(SnapshotNo),0)+1 snapshotNo FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [current.CurrentVersionID]);
        const warningCount = Number(source.WarningCount || 0) + row.masterWarnings.length;
        const [snapshotCreated] = await connection.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,?,'building',?,NULL,0,0,?,NULL,NULL,?,?,?,'amendment')", [current.CurrentVersionID, next.snapshotNo, source.RuleHash, warningCount, reason, actor(req), source.id]);
        const resultSnapshotId = Number(snapshotCreated.insertId);
        await connection.query('INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) SELECT ?,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=?', [resultSnapshotId, source.id]);
        await connection.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'eligible','eligibility_amendment',?,?,NOW(),?)", [resultSnapshotId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, reason, actor(req), reason]);
        const [merged] = await connection.query('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [resultSnapshotId]);
        const afterRowsHash = phase2.rowsHash(merged), accountReadyCount = merged.filter(item => Boolean(item.accountReady)).length;
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=? AND Status='frozen'", [source.id]);
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='frozen',RowsHash=?,EligibleCount=?,AccountReadyCount=?,FrozenAt=NOW(),FrozenBy=? WHERE id=? AND Status='building'", [afterRowsHash, merged.length, accountReadyCount, actor(req), resultSnapshotId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendmentMembers SET MemberStatus='Applied',AppliedAt=NOW() WHERE AmendmentID=?", [amendmentId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=1,SkippedCount=0,AfterRowsHash=?,AppliedBy=?,AppliedAt=NOW(),MetadataJson=? WHERE id=?", [resultSnapshotId, afterRowsHash, actor(req), JSON.stringify({ employeeId, requestType: 'individual_add', addOnly: true }), amendmentId]);
        await appendEvent(connection, req, amendment, 'APPLIED', 'Approved', 'Applied', reason, { employeeId, sourceSnapshotId: Number(source.id), resultSnapshotId, addedCount: 1, afterRowsHash }, eventHash, 3);
        await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [id, current.CurrentVersionID, actor(req), role(req), 'SAFETY_VOTE_ELIGIBILITY_INDIVIDUAL_ADDED', 'SafetyVote_EligibilityAmendment', String(amendmentId), 201, `employee=${employeeId}; sourceSnapshot=${source.id}; resultSnapshot=${resultSnapshotId}`, JSON.stringify({ employeeId, sourceSnapshotId: Number(source.id), resultSnapshotId, beforeRowsHash: source.RowsHash, afterRowsHash, candidateSetHash, enrollmentMode: mode, requestType: 'individual_add', addOnly: true }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        await connection.commit();
        return res.status(201).json({ success: true, data: { contractVersion: CONTRACT, amendmentId, status: 'Applied', employeeId, employeeName: row.employeeName, sourceSnapshotId: Number(source.id), resultSnapshotId, snapshotNo: Number(next.snapshotNo), addedCount: 1, afterRowsHash, replayed: false } });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'The individual amendment was already requested.');
        console.error('[safety-vote] individual eligibility amendment failed:', error);
        return fail(res, 500, 'ELIGIBILITY_INDIVIDUAL_ADD_FAILED', 'Unable to add this employee to eligibility.');
    } finally { connection.release(); }
});

router.post('/admin/campaigns/:id/eligibility/removals/individual', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id), employeeId = phase2.text(req.body?.employeeId, 20), reason = phase2.text(req.body?.reason, 500), idempotencyKey = phase2.text(req.get('Idempotency-Key'), 200);
    if (!id || !employeeId || Array.from(reason).length < 10 || idempotencyKey.length < 16) return fail(res, 400, 'VALIDATION_FAILED', 'Campaign, employee, reason of at least 10 characters and a valid Idempotency-Key are required.');
    const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex'), connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await requireFeature(connection, true) || !await requireRemovalFeature(connection, true)) { await connection.rollback(); return fail(res, 503, 'ELIGIBILITY_REMOVAL_DISABLED', 'Eligibility removal is disabled.'); }
        const [replays] = await connection.query('SELECT * FROM SafetyVote_EligibilityAmendments WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND IdempotencyKeyHash=? LIMIT 1 FOR UPDATE', [id, keyHash]);
        const replay = replays[0];
        if (replay) { await connection.rollback(); if (replay.Status !== 'Applied' || replay.RequestType !== 'individual_remove') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to another amendment.'); return res.json({ success: true, data: { contractVersion: '2026-10-24-safety-vote-eligibility-removal-r1', amendmentId: Number(replay.id), status: replay.Status, sourceSnapshotId: Number(replay.SourceSnapshotID), resultSnapshotId: Number(replay.ResultSnapshotID), removedCount: 1, afterRowsHash: replay.AfterRowsHash, replayed: true } }); }
        const current = await campaign(id, connection, true);
        if (!current) { await connection.rollback(); return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.'); }
        if (!ACTIVE_STATES.has(current.Status)) { await connection.rollback(); return fail(res, 409, 'CAMPAIGN_STATE_CONFLICT', 'Eligibility removal is available only for Scheduled or Open campaigns.'); }
        if (String(current.EligibilityEnrollmentMode) !== 'admin_approval') { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_REMOVAL_POLICY_CONFLICT', 'Set enrollment mode to admin approval before removing eligibility.'); }
        if (req.body?.confirmation !== `REMOVE ${current.CampaignCode} ${employeeId}`) { await connection.rollback(); return fail(res, 400, 'REMOVAL_CONFIRMATION_REQUIRED', 'Exact campaign and employee confirmation is required.'); }
        const [[source]] = await connection.query("SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC,id DESC LIMIT 1 FOR UPDATE", [current.CurrentVersionID]);
        if (!source) { await connection.rollback(); return fail(res, 409, 'FROZEN_SNAPSHOT_REQUIRED', 'A frozen eligibility snapshot is required before removal.'); }
        const [[row]] = await connection.query('SELECT EmployeeID employeeId,EmployeeNameSnapshot employeeName,DepartmentIDSnapshot departmentId,DepartmentNameSnapshot departmentName,SafetyUnitIDSnapshot safetyUnitId,SafetyUnitNameSnapshot safetyUnitName,PositionIDSnapshot positionId,PositionNameSnapshot positionName,RoleSnapshot role,TeamSnapshot team,MasterPresent masterPresent,AccountReady accountReady,InclusionSource inclusionSource,InclusionReason inclusionReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=? AND EmployeeID=? AND EligibilityState=\'eligible\' LIMIT 1', [source.id, employeeId]);
        if (!row) { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_NOT_ACTIVE', 'This employee is not eligible in the current snapshot.'); }
        const [[activity]] = await connection.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Participation WHERE CampaignVersionID=? AND EmployeeID=?) participation,(SELECT COUNT(*) FROM SafetyVote_Submissions WHERE CampaignVersionID=? AND SubmitterEmployeeID=?) submissions,(SELECT COUNT(*) FROM SafetyVote_Nominations WHERE CampaignVersionID=? AND (NominatorEmployeeID=? OR NomineeEmployeeID=?)) nominations,(SELECT COUNT(*) FROM SafetyVote_JuryAssignments WHERE CampaignVersionID=? AND JurorEmployeeID=?) juryAssignments', [current.CurrentVersionID, employeeId, current.CurrentVersionID, employeeId, current.CurrentVersionID, employeeId, employeeId, current.CurrentVersionID, employeeId]);
        const protectedActivity = { participation: Number(activity.participation), submissions: Number(activity.submissions), nominations: Number(activity.nominations), juryAssignments: Number(activity.juryAssignments) };
        if (Object.values(protectedActivity).some(Boolean)) { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_REMOVAL_PROTECTED_ACTIVITY', 'Eligibility cannot be removed after protected campaign activity exists.', protectedActivity); }
        const candidate = voterProjection(row), candidateSetHash = phase2.rowsHash([candidate]);
        const [created] = await connection.query("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy,ReviewedBy,ReviewedAt,MetadataJson) VALUES(?,?,?,?,'individual_remove','Approved',?,1,1,?,?,?,?,?,NOW(),?)", [id, current.CurrentVersionID, source.id, current.EligibilityEnrollmentMode, reason, source.RowsHash, candidateSetHash, keyHash, actor(req), actor(req), JSON.stringify({ removalPolicy: 'unstarted_only', employeeId })]);
        const amendmentId = Number(created.insertId);
        await connection.query("INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt,AppliedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'individual_admin_remove',?,'[]','Removed',?,?,NOW(),NOW())", [amendmentId, candidate.employeeId, candidate.employeeName, candidate.departmentId, candidate.departmentName, candidate.safetyUnitId, candidate.safetyUnitName, candidate.positionId, candidate.positionName, candidate.role, candidate.team, candidate.masterPresent ? 1 : 0, candidate.accountReady ? 1 : 0, reason, reason, actor(req)]);
        const amendment = { id: amendmentId, campaignId: id, versionId: current.CurrentVersionID };
        let eventHash = await appendEvent(connection, req, amendment, 'REMOVAL_REQUESTED', null, 'Pending', reason, { employeeId, removalPolicy: 'unstarted_only', protectedActivity }, null, 1);
        eventHash = await appendEvent(connection, req, amendment, 'REMOVAL_APPROVED', 'Pending', 'Approved', reason, { employeeId, approvedCount: 1 }, eventHash, 2);
        const [[next]] = await connection.query('SELECT COALESCE(MAX(SnapshotNo),0)+1 snapshotNo FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [current.CurrentVersionID]);
        const [snapshotCreated] = await connection.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,?,'building',?,NULL,0,0,?,NULL,NULL,?,?,?,'removal')", [current.CurrentVersionID, next.snapshotNo, source.RuleHash, Number(source.WarningCount || 0), reason, actor(req), source.id]);
        const resultSnapshotId = Number(snapshotCreated.insertId);
        await connection.query('INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) SELECT ?,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=? AND EmployeeID<>?', [resultSnapshotId, source.id, employeeId]);
        const [merged] = await connection.query('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [resultSnapshotId]);
        const afterRowsHash = phase2.rowsHash(merged), accountReadyCount = merged.filter(item => Boolean(item.accountReady)).length;
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=? AND Status='frozen'", [source.id]);
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='frozen',RowsHash=?,EligibleCount=?,AccountReadyCount=?,FrozenAt=NOW(),FrozenBy=? WHERE id=? AND Status='building'", [afterRowsHash, merged.length, accountReadyCount, actor(req), resultSnapshotId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=0,SkippedCount=0,AfterRowsHash=?,AppliedBy=?,AppliedAt=NOW(),MetadataJson=? WHERE id=?", [resultSnapshotId, afterRowsHash, actor(req), JSON.stringify({ employeeId, removedCount: 1, removalPolicy: 'unstarted_only', addOnly: false }), amendmentId]);
        await appendEvent(connection, req, amendment, 'REMOVAL_APPLIED', 'Approved', 'Applied', reason, { employeeId, sourceSnapshotId: Number(source.id), resultSnapshotId, removedCount: 1, afterRowsHash }, eventHash, 3);
        await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [id, current.CurrentVersionID, actor(req), role(req), 'SAFETY_VOTE_ELIGIBILITY_INDIVIDUAL_REMOVED', 'SafetyVote_EligibilityAmendment', String(amendmentId), 201, `employee=${employeeId}; sourceSnapshot=${source.id}; resultSnapshot=${resultSnapshotId}`, JSON.stringify({ employeeId, sourceSnapshotId: Number(source.id), resultSnapshotId, beforeRowsHash: source.RowsHash, afterRowsHash, candidateSetHash, removalPolicy: 'unstarted_only', protectedActivity, removedCount: 1 }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        await connection.commit();
        return res.status(201).json({ success: true, data: { contractVersion: '2026-10-24-safety-vote-eligibility-removal-r1', amendmentId, status: 'Applied', employeeId, employeeName: candidate.employeeName, sourceSnapshotId: Number(source.id), resultSnapshotId, snapshotNo: Number(next.snapshotNo), removedCount: 1, afterRowsHash, replayed: false } });
    } catch (error) { await connection.rollback().catch(() => {}); if (error?.code === 'ER_DUP_ENTRY') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'The removal was already requested.'); console.error('[safety-vote] eligibility removal failed:', error); return fail(res, 500, 'ELIGIBILITY_REMOVAL_FAILED', 'Unable to remove eligibility.'); }
    finally { connection.release(); }
});

router.post('/admin/campaigns/:id/eligibility/amendments/apply', permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'), async (req, res) => {
    const id = phase2.int(req.params.id);
    const reason = phase2.text(req.body?.reason, 500);
    const suppliedPreviewHash = phase2.text(req.body?.previewHash, 64).toLowerCase();
    const idempotencyKey = phase2.text(req.get('Idempotency-Key'), 200);
    if (!id || !reason || !/^[a-f0-9]{64}$/.test(suppliedPreviewHash) || idempotencyKey.length < 16) return fail(res, 400, 'VALIDATION_FAILED', 'Campaign, reason, preview hash and a valid Idempotency-Key are required.');
    const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (!await requireFeature(connection, true)) { await connection.rollback(); return fail(res, 503, 'ELIGIBILITY_AMENDMENT_DISABLED', 'Eligibility amendments are disabled.'); }
        const [replays] = await connection.query('SELECT * FROM SafetyVote_EligibilityAmendments WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND IdempotencyKeyHash=? LIMIT 1 FOR UPDATE', [id, keyHash]);
        const replay = replays[0];
        if (replay) {
            await connection.rollback();
            if (replay.Status !== 'Applied') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to an unfinished amendment.');
            return res.json({ success: true, data: { contractVersion: CONTRACT, amendmentId: Number(replay.id), status: replay.Status, sourceSnapshotId: Number(replay.SourceSnapshotID), resultSnapshotId: Number(replay.ResultSnapshotID), addedCount: Number(replay.AddedCount), skippedCount: Number(replay.SkippedCount), afterRowsHash: replay.AfterRowsHash, replayed: true } });
        }
        const result = await preview(id, connection, { lock: true });
        if (result.error) { await connection.rollback(); return fail(res, ...result.error); }
        if (req.body?.confirmation !== `APPLY ${result.campaign.CampaignCode}`) { await connection.rollback(); return fail(res, 400, 'AMENDMENT_CONFIRMATION_REQUIRED', 'Exact campaign confirmation is required.'); }
        if (!crypto.timingSafeEqual(Buffer.from(suppliedPreviewHash), Buffer.from(result.previewHash))) { await connection.rollback(); return fail(res, 409, 'ELIGIBILITY_PREVIEW_STALE', 'Eligibility changed after preview. Run preview again.'); }
        if (!result.candidates.length) { await connection.rollback(); return fail(res, 409, 'NO_NEW_ELIGIBLE_VOTERS', 'No new eligible voters are available to add.'); }
        const mode = String(result.campaign.EligibilityEnrollmentMode);
        const requestType = mode === 'automatic_rule_match' ? 'automatic_rule_match' : 'manual_apply';
        const [created] = await connection.query("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy,ReviewedBy,ReviewedAt) VALUES(?,?,?,?,?,'Approved',?,?,?,?,?,?,?, ?,NOW())", [id, result.campaign.CurrentVersionID, result.source.id, mode, requestType, reason, result.candidates.length, result.candidates.length, result.source.RowsHash, result.candidateSetHash, keyHash, actor(req), actor(req)]);
        const amendmentId = Number(created.insertId);
        const memberStatement = 'INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())';
        for (const row of result.candidates) await connection.query(memberStatement, [amendmentId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, 'rule_match', row.inclusionReason, JSON.stringify(row.masterWarnings), 'Approved', reason, actor(req)]);
        const amendment = { id: amendmentId, campaignId: id, versionId: result.campaign.CurrentVersionID };
        let eventHash = await appendEvent(connection, req, amendment, 'REQUESTED', null, 'Pending', reason, { candidateCount: result.candidates.length, candidateSetHash: result.candidateSetHash }, null, 1);
        eventHash = await appendEvent(connection, req, amendment, 'APPROVED', 'Pending', 'Approved', reason, { approvedCount: result.candidates.length, enrollmentMode: mode }, eventHash, 2);
        const [[next]] = await connection.query('SELECT COALESCE(MAX(SnapshotNo),0)+1 snapshotNo FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [result.campaign.CurrentVersionID]);
        const candidateWarnings = result.candidates.reduce((sum, row) => sum + row.masterWarnings.length, 0);
        const [snapshotCreated] = await connection.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,?,'building',?,NULL,0,0,?,NULL,NULL,?,?,?,'amendment')", [result.campaign.CurrentVersionID, next.snapshotNo, result.ruleHash, Number(result.source.WarningCount || 0) + candidateWarnings, reason, actor(req), result.source.id]);
        const resultSnapshotId = Number(snapshotCreated.insertId);
        await connection.query('INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) SELECT ?,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=?', [resultSnapshotId, result.source.id]);
        const voterInsert = 'INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,\'eligible\',?,?,?,NOW(),?)';
        for (const row of result.candidates) await connection.query(voterInsert, [resultSnapshotId, row.employeeId, row.employeeName, row.departmentId, row.departmentName, row.safetyUnitId, row.safetyUnitName, row.positionId, row.positionName, row.role, row.team, row.masterPresent ? 1 : 0, row.accountReady ? 1 : 0, 'eligibility_amendment', row.inclusionReason, actor(req), reason]);
        const [merged] = await connection.query('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [resultSnapshotId]);
        const afterRowsHash = phase2.rowsHash(merged);
        const accountReadyCount = merged.filter(row => Boolean(row.accountReady)).length;
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=? AND Status='frozen'", [result.source.id]);
        await connection.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='frozen',RowsHash=?,EligibleCount=?,AccountReadyCount=?,FrozenAt=NOW(),FrozenBy=? WHERE id=? AND Status='building'", [afterRowsHash, merged.length, accountReadyCount, actor(req), resultSnapshotId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendmentMembers SET MemberStatus='Applied',AppliedAt=NOW() WHERE AmendmentID=? AND MemberStatus='Approved'", [amendmentId]);
        await connection.query("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=?,SkippedCount=0,AfterRowsHash=?,AppliedBy=?,AppliedAt=NOW(),MetadataJson=? WHERE id=?", [resultSnapshotId, result.candidates.length, afterRowsHash, actor(req), JSON.stringify({ previewHash: result.previewHash, ignoredRemovalCount: result.ignoredRemovalCount, addOnly: true }), amendmentId]);
        await appendEvent(connection, req, amendment, 'APPLIED', 'Approved', 'Applied', reason, { sourceSnapshotId: Number(result.source.id), resultSnapshotId, addedCount: result.candidates.length, afterRowsHash }, eventHash, 3);
        await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [id, result.campaign.CurrentVersionID, actor(req), role(req), 'SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED', 'SafetyVote_EligibilityAmendment', String(amendmentId), 201, `added=${result.candidates.length}; sourceSnapshot=${result.source.id}; resultSnapshot=${resultSnapshotId}`, JSON.stringify({ addedCount: result.candidates.length, sourceSnapshotId: Number(result.source.id), resultSnapshotId, beforeRowsHash: result.source.RowsHash, afterRowsHash, candidateSetHash: result.candidateSetHash, enrollmentMode: mode, addOnly: true }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        await connection.commit();
        return res.status(201).json({ success: true, data: { contractVersion: CONTRACT, amendmentId, status: 'Applied', sourceSnapshotId: Number(result.source.id), resultSnapshotId, snapshotNo: Number(next.snapshotNo), addedCount: result.candidates.length, skippedCount: 0, afterRowsHash, replayed: false } });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error?.code === 'ER_DUP_ENTRY') return fail(res, 409, 'IDEMPOTENCY_CONFLICT', 'The amendment was already requested.');
        console.error('[safety-vote] eligibility amendment apply failed:', error);
        return fail(res, 500, 'ELIGIBILITY_AMENDMENT_APPLY_FAILED', 'Unable to apply the eligibility amendment.');
    } finally {
        connection.release();
    }
});

module.exports = router;
module.exports.CONTRACT = CONTRACT;
module.exports.preview = preview;
module.exports.overview = overview;
module.exports.autoEnrollEligibleMember = autoEnrollEligibleMember;
