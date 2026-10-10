'use strict';

const express = require('express');
const db = require('../db');
const foundation = require('./safety-vote');
const analytics = require('../services/safety-vote-analytics');

const router = express.Router();
const actor = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const role = req => String(req.user?.role || req.user?.Role || '').trim().toUpperCase();
const fail = (res, status, code, message, details) => res.status(status).json({ success: false, code, message, ...(details ? { details } : {}) });
const positiveInt = value => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };

async function permission(req, key) {
    if (role(req) === 'ADMIN') return true;
    const [[userGrant]] = await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1', [actor(req), key]);
    if (userGrant) return Number(userGrant.granted) === 1;
    const [[roleGrant]] = await db.query('SELECT granted FROM Admin_RolePermissions WHERE UPPER(role)=? AND permission=? LIMIT 1', [role(req), key]);
    return Boolean(roleGrant && Number(roleGrant.granted) === 1);
}
const permit = key => async (req, res, next) => { try { return await permission(req, key) ? next() : fail(res, 403, 'PERMISSION_DENIED', 'Safety Vote permission is required.'); } catch { return fail(res, 503, 'PERMISSION_CHECK_UNAVAILABLE', 'Unable to verify Safety Vote permission.'); } };

async function gate(_req, res, next) {
    try {
        const health = await foundation.schemaHealth();
        if (!health.ready) return fail(res, 503, 'SAFETY_VOTE_SCHEMA_NOT_READY', 'Safety Vote schema is not ready.', health);
        if (!health.moduleEnabled) return fail(res, 503, 'SAFETY_VOTE_MODULE_DISABLED', 'Safety Vote is disabled.', health);
        const [[table]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_EngagementCounters'");
        const [[setting]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='engagement_enabled'");
        if (Number(table?.total || 0) !== 1) return fail(res, 503, 'SAFETY_VOTE_ANALYTICS_SETUP_REQUIRED', 'Safety Vote engagement analytics migration is required.');
        if (String(setting?.SettingValue || '0') !== '1') return fail(res, 503, 'SAFETY_VOTE_ENGAGEMENT_DISABLED', 'Safety Vote engagement features are disabled.');
        return next();
    } catch { return fail(res, 503, 'SAFETY_VOTE_ANALYTICS_SETUP_REQUIRED', 'Safety Vote engagement analytics is not ready.'); }
}

function dateRange(query = {}) {
    const today = new Date(), end = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || '')) ? String(query.to) : today.toISOString().slice(0, 10);
    const fallback = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10), start = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || '')) ? String(query.from) : fallback;
    const fromTime = new Date(`${start}T00:00:00Z`).getTime(), toTime = new Date(`${end}T23:59:59Z`).getTime();
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime || toTime - fromTime > 366 * 86400000) return null;
    return { from: start, to: end };
}

async function model(req) {
    const range = dateRange(req.query);
    if (!range) throw Object.assign(new Error('Date range must be between 1 and 366 days.'), { status: 400, code: 'DATE_RANGE_INVALID' });
    const campaignId = req.query.campaignId ? positiveInt(req.query.campaignId) : null;
    if (req.query.campaignId && !campaignId) throw Object.assign(new Error('Campaign ID is invalid.'), { status: 400, code: 'CAMPAIGN_ID_INVALID' });
    const params = [campaignId, campaignId];
    const [campaignRows, counterRows, promotionRows, notificationRows, readRows, scheduleRows, auditRows] = await Promise.all([
        db.query("SELECT c.id,c.CampaignCode campaignCode,c.Status status,c.CurrentVersionID currentVersionId,v.TitleTh title,v.CampaignType campaignType,v.PrivacyMode privacyMode,v.PrivacyThreshold privacyThreshold,COALESCE((SELECT es.EligibleCount FROM SafetyVote_EligibilitySnapshots es WHERE es.CampaignVersionID=c.CurrentVersionID AND es.Status='frozen' ORDER BY es.id DESC LIMIT 1),0) eligible,(SELECT COUNT(*) FROM SafetyVote_Participation p WHERE p.CampaignVersionID=c.CurrentVersionID AND p.State IN ('started','submitted')) started,(SELECT COUNT(*) FROM SafetyVote_Participation p WHERE p.CampaignVersionID=c.CurrentVersionID AND p.State='submitted') submitted FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.Status<>'Voided' AND (? IS NULL OR c.id=?) ORDER BY c.UpdatedAt DESC,c.id DESC LIMIT 250", params),
        db.query("SELECT CampaignID campaignId,PromotionID promotionId,MetricKey metricKey,SUM(MetricCount) total FROM SafetyVote_EngagementCounters WHERE MetricDay BETWEEN ? AND ? AND (? IS NULL OR CampaignID=?) GROUP BY CampaignID,PromotionID,MetricKey", [range.from, range.to, campaignId, campaignId]),
        db.query("SELECT p.id promotionId,p.CampaignID campaignId,p.TitleTh title,p.CtaLabel ctaLabel,p.Status status FROM SafetyVote_Promotions p WHERE (? IS NULL OR p.CampaignID=?) ORDER BY p.CampaignID,p.Priority DESC,p.id", params),
        db.query("SELECT n.CampaignID campaignId,n.Channel channel,n.Status status,COALESCE(n.LastErrorCode,'') errorCode,COUNT(*) total FROM SafetyVote_Notifications n WHERE DATE(n.CreatedAt) BETWEEN ? AND ? AND (? IS NULL OR n.CampaignID=?) GROUP BY n.CampaignID,n.Channel,n.Status,COALESCE(n.LastErrorCode,'') ORDER BY n.CampaignID,n.Channel,n.Status", [range.from, range.to, campaignId, campaignId]),
        db.query("SELECT n.CampaignID campaignId,COUNT(*) total FROM SafetyVote_NotificationReads r JOIN SafetyVote_Notifications n ON n.id=r.NotificationID WHERE DATE(r.ReadAt) BETWEEN ? AND ? AND (? IS NULL OR n.CampaignID=?) GROUP BY n.CampaignID", [range.from, range.to, campaignId, campaignId]),
        db.query("SELECT n.CampaignID campaignId,c.CampaignCode campaignCode,n.Channel channel,n.ScheduledAt scheduledAt,COUNT(*) total FROM SafetyVote_Notifications n JOIN SafetyVote_Campaigns c ON c.id=n.CampaignID WHERE DATE(n.ScheduledAt) BETWEEN ? AND ? AND (? IS NULL OR n.CampaignID=?) GROUP BY n.CampaignID,c.CampaignCode,n.Channel,n.ScheduledAt ORDER BY n.ScheduledAt", [range.from, range.to, campaignId, campaignId]),
        db.query("SELECT CampaignID campaignId,BoundedDetail detail FROM SafetyVote_AuditLogs WHERE Action='SAFETY_VOTE_NOTIFICATION_QUEUE' AND DATE(OccurredAt) BETWEEN ? AND ? AND (? IS NULL OR CampaignID=?) ORDER BY id DESC LIMIT 1000", [range.from, range.to, campaignId, campaignId])
    ]).then(results => results.map(result => result[0]));

    const counters = new Map(), reads = new Map(readRows.map(row => [Number(row.campaignId), analytics.integer(row.total)])), notificationReach = new Map();
    for (const row of counterRows) counters.set(`${row.campaignId}:${row.promotionId}:${row.metricKey}`, analytics.integer(row.total));
    for (const row of notificationRows) if (row.status === 'Sent') notificationReach.set(Number(row.campaignId), (notificationReach.get(Number(row.campaignId)) || 0) + analytics.integer(row.total));
    const audit = new Map();
    for (const row of auditRows) { const current = audit.get(Number(row.campaignId)) || { queued: 0, suppressed: 0 }, parsed = analytics.queueAudit(row.detail); current.queued += parsed.queued; current.suppressed += parsed.suppressed; audit.set(Number(row.campaignId), current); }
    const promotionByCampaign = new Map();
    for (const row of promotionRows) {
        const threshold = Math.max(2, analytics.integer(campaignRows.find(c => Number(c.id) === Number(row.campaignId))?.privacyThreshold) || 5), impressions = counters.get(`${row.campaignId}:${row.promotionId}:impression`) || 0, clicks = counters.get(`${row.campaignId}:${row.promotionId}:cta_click`) || 0;
        const item = { id: Number(row.promotionId), campaignId: Number(row.campaignId), title: row.title, ctaLabel: row.ctaLabel, status: row.status, impressions: analytics.thresholdMetric(impressions, threshold), ctaClicks: analytics.thresholdMetric(clicks, threshold, impressions) };
        if (!promotionByCampaign.has(Number(row.campaignId))) promotionByCampaign.set(Number(row.campaignId), []);
        promotionByCampaign.get(Number(row.campaignId)).push(item);
    }
    const campaigns = campaignRows.map(row => {
        const id = Number(row.id), promotions = promotionByCampaign.get(id) || [], rawImpressions = promotions.reduce((sum, item) => sum + (counters.get(`${id}:${item.id}:impression`) || 0), 0), rawClicks = promotions.reduce((sum, item) => sum + (counters.get(`${id}:${item.id}:cta_click`) || 0), 0);
        return { ...analytics.buildCampaignMetric({ ...row, reach: notificationReach.get(id) || 0, notificationReads: reads.get(id) || 0, impressions: rawImpressions, ctaClicks: rawClicks }), promotions };
    });
    const thresholdByCampaign = new Map(campaigns.map(row => [row.id, row.privacyThreshold]));
    const deliveries = notificationRows.map(row => ({ campaignId: Number(row.campaignId), channel: row.channel, status: row.status, errorCode: row.errorCode || null, total: analytics.thresholdMetric(row.total, thresholdByCampaign.get(Number(row.campaignId)) || 5) }));
    const suppressions = [...audit.entries()].map(([id, value]) => ({ campaignId: id, queued: analytics.thresholdMetric(value.queued, thresholdByCampaign.get(id) || 5), suppressed: analytics.thresholdMetric(value.suppressed, thresholdByCampaign.get(id) || 5) }));
    const conflicts = analytics.scheduleConflicts(scheduleRows), recommendationRows = analytics.recommendations(campaigns, deliveries, conflicts);
    return { contract: analytics.CONTRACT_VERSION, range, privacySafe: true, containsIdentity: false, containsVoterChoice: false, campaigns, deliveries, suppressions, scheduleConflicts: conflicts, recommendations: recommendationRows, exportClassification: 'authorized_aggregate_only' };
}

router.use((req, res, next) => {
    if (!/^\/(?:engagement\/promotions\/[1-9][0-9]*\/events|admin\/engagement\/analytics(?:\/export\.csv)?)$/.test(req.path)) return next();
    return gate(req, res, next);
});

router.post('/engagement/promotions/:id/events', permit('SAFETY_VOTE_VIEW'), async (req, res) => {
    const id = positiveInt(req.params.id), eventType = analytics.normalizeEventType(req.body?.eventType);
    if (!id || !eventType) return fail(res, 400, 'VALIDATION_FAILED', 'Promotion and aggregate event type are required.');
    try {
        const [[promotion]] = await db.query("SELECT p.id,p.CampaignID,c.CurrentVersionID FROM SafetyVote_Promotions p JOIN SafetyVote_Campaigns c ON c.id=p.CampaignID WHERE p.id=? AND p.Status='Published' AND p.StartAt<=NOW() AND p.EndAt>NOW() AND c.Status IN ('Scheduled','Open','Closed','Certified','Published')", [id]);
        if (!promotion) return fail(res, 404, 'PROMOTION_NOT_AVAILABLE', 'Promotion is not available.');
        const [[eligible]] = await db.query("SELECT 1 ok FROM SafetyVote_EligibilitySnapshots s JOIN SafetyVote_EligibleVoters ev ON ev.SnapshotID=s.id WHERE s.CampaignVersionID=? AND s.Status='frozen' AND ev.EmployeeID=? LIMIT 1", [promotion.CurrentVersionID, actor(req)]);
        if (!eligible) return fail(res, 403, 'CAMPAIGN_NOT_ELIGIBLE', 'Campaign eligibility is required.');
        await db.query('INSERT INTO SafetyVote_EngagementCounters(CampaignID,PromotionID,MetricDay,MetricKey,MetricCount) VALUES(?,?,CURRENT_DATE,?,1) ON DUPLICATE KEY UPDATE MetricCount=MetricCount+1', [promotion.CampaignID, id, eventType]);
        return res.status(202).json({ success: true, data: { accepted: true, aggregateOnly: true, identityStored: false } });
    } catch { return fail(res, 500, 'ENGAGEMENT_EVENT_FAILED', 'Unable to record the aggregate engagement event.'); }
});

router.get('/admin/engagement/analytics', permit('SAFETY_VOTE_RESULT_VIEW'), async (req, res) => { try { return res.json({ success: true, data: await model(req) }); } catch (error) { return fail(res, error.status || 500, error.code || 'ENGAGEMENT_ANALYTICS_FAILED', error.message || 'Unable to load engagement analytics.'); } });
router.get('/admin/engagement/analytics/export.csv', permit('SAFETY_VOTE_EXPORT'), async (req, res) => { try { const data = await model(req), content = analytics.csv(data); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="safety-vote-engagement-${data.range.from}-${data.range.to}.csv"`, 'Cache-Control': 'private, no-store', 'X-Safety-Vote-Privacy-Class': 'authorized_aggregate_only' }); return res.send(content); } catch (error) { return fail(res, error.status || 500, error.code || 'ENGAGEMENT_EXPORT_FAILED', error.message || 'Unable to export engagement analytics.'); } });

module.exports = router;
