'use strict';

const CONTRACT_VERSION = '2026-10-10-safety-vote-ux-phase9c-r1';
const EVENT_TYPES = new Set(['impression', 'cta_click']);

function integer(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function thresholdMetric(value, threshold, base = null) {
    const count = integer(value), limit = Math.max(2, integer(threshold) || 5);
    if (count < limit) return { value: null, visible: false, suppressed: true, reason: 'PRIVACY_THRESHOLD', percentage: null };
    const denominator = base == null ? null : integer(base);
    const percentage = denominator && denominator >= limit ? Math.round(count / denominator * 10000) / 100 : null;
    return { value: count, visible: true, suppressed: false, reason: null, percentage };
}

function normalizeEventType(value) {
    const type = String(value || '').trim().toLowerCase();
    return EVENT_TYPES.has(type) ? type : null;
}

function queueAudit(detail = '') {
    const match = String(detail).match(/queued=(\d+)\s*;\s*suppressed=(\d+)/i);
    return { queued: match ? integer(match[1]) : 0, suppressed: match ? integer(match[2]) : 0 };
}

function buildCampaignMetric(row = {}) {
    const threshold = Math.max(2, integer(row.privacyThreshold) || 5), eligible = integer(row.eligible), started = integer(row.started), submitted = integer(row.submitted);
    return {
        id: integer(row.id), campaignCode: String(row.campaignCode || ''), title: String(row.title || ''), status: String(row.status || ''),
        campaignType: String(row.campaignType || ''), privacyMode: String(row.privacyMode || ''), privacyThreshold: threshold,
        eligible: thresholdMetric(eligible, threshold), started: thresholdMetric(started, threshold, eligible),
        submitted: thresholdMetric(submitted, threshold, eligible), conversion: thresholdMetric(submitted, threshold, eligible),
        reach: thresholdMetric(row.reach, threshold), notificationReads: thresholdMetric(row.notificationReads, threshold),
        impressions: thresholdMetric(row.impressions, threshold), ctaClicks: thresholdMetric(row.ctaClicks, threshold, row.impressions)
    };
}

function scheduleConflicts(groups = [], minutes = 30) {
    const buckets = new Map(), warnings = [];
    for (const row of groups.map(item => ({ ...item, at: new Date(item.scheduledAt).getTime() })).filter(item => Number.isFinite(item.at))) {
        const key = `${Number(row.campaignId)}:${String(row.channel || '')}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
    }
    for (const sorted of buckets.values()) {
        sorted.sort((a, b) => a.at - b.at);
        for (let index = 1; index < sorted.length; index += 1) {
            const previous = sorted[index - 1], current = sorted[index];
            if (current.at - previous.at > minutes * 60000) continue;
            warnings.push({ campaignId: integer(current.campaignId), campaignCode: String(current.campaignCode || ''), channel: String(current.channel || ''), firstAt: previous.scheduledAt, secondAt: current.scheduledAt, windowMinutes: minutes });
        }
    }
    return warnings.slice(0, 100);
}

function recommendations(campaigns = [], deliveries = [], conflicts = []) {
    const rows = [];
    for (const item of campaigns) {
        if (item.conversion.visible && item.conversion.percentage < 40) rows.push({ key: 'low-conversion', severity: 'high', campaignId: item.id, campaignCode: item.campaignCode, title: 'เพิ่มความชัดเจนของข้อความเชิญชวน', description: 'อัตราการเข้าร่วมต่ำกว่า 40% ควรทบทวนหัวข้อ ปุ่ม CTA และช่วงเวลาสื่อสาร', action: 'content' });
        else if (item.conversion.visible && item.conversion.percentage < 70) rows.push({ key: 'conversion-opportunity', severity: 'medium', campaignId: item.id, campaignCode: item.campaignCode, title: 'ทดสอบข้อความประชาสัมพันธ์เพิ่มเติม', description: 'อัตราการเข้าร่วมยังมีโอกาสเพิ่มขึ้น ควรเปรียบเทียบข้อความและช่วงเวลา', action: 'content' });
        if (item.impressions.visible && item.ctaClicks.visible && item.ctaClicks.percentage < 10) rows.push({ key: 'low-cta', severity: 'medium', campaignId: item.id, campaignCode: item.campaignCode, title: 'ปรับ CTA ของป้ายกิจกรรม', description: 'อัตราคลิกต่ำกว่า 10% ควรทำให้ข้อความสั้น ชัดเจน และตรงกับกิจกรรม', action: 'promotion' });
    }
    if (deliveries.some(row => row.status === 'Failed' && row.total?.visible)) rows.push({ key: 'delivery-failures', severity: 'high', campaignId: null, campaignCode: '', title: 'ตรวจสอบรายการส่งไม่สำเร็จ', description: 'มีการส่งที่ไม่สำเร็จเหนือ privacy threshold ควรตรวจช่องทางและ error code ก่อน retry', action: 'delivery' });
    if (conflicts.length) rows.push({ key: 'schedule-conflict', severity: 'medium', campaignId: null, campaignCode: '', title: 'แยกช่วงเวลาการแจ้งเตือน', description: 'มีคิวช่องทางเดียวกันใกล้กันภายใน 30 นาที อาจทำให้ผู้รับได้รับข้อความถี่เกินไป', action: 'schedule' });
    return rows.slice(0, 50);
}

function csv(model = {}) {
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Campaign Code', 'Title', 'Status', 'Eligible', 'Started', 'Submitted', 'Conversion %', 'Reach', 'Impressions', 'CTA Clicks', 'CTA %']];
    for (const row of model.campaigns || []) lines.push([row.campaignCode, row.title, row.status, row.eligible.value ?? 'SUPPRESSED', row.started.value ?? 'SUPPRESSED', row.submitted.value ?? 'SUPPRESSED', row.conversion.percentage ?? 'SUPPRESSED', row.reach.value ?? 'SUPPRESSED', row.impressions.value ?? 'SUPPRESSED', row.ctaClicks.value ?? 'SUPPRESSED', row.ctaClicks.percentage ?? 'SUPPRESSED']);
    return '\ufeff' + lines.map(line => line.map(quote).join(',')).join('\r\n');
}

module.exports = { CONTRACT_VERSION, integer, thresholdMetric, normalizeEventType, queueAudit, buildCampaignMetric, scheduleConflicts, recommendations, csv };
