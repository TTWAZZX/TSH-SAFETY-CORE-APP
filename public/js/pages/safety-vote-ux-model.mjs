export function statusGroup(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'draft') return 'draft';
    if (value === 'scheduled') return 'scheduled';
    if (['closed', 'certified', 'published'].includes(value)) return 'completed';
    if (['archived', 'voided'].includes(value)) return 'archived';
    return 'active';
}
function campaignDate(row, ...keys) {
    for (const key of keys) if (row?.[key]) return new Date(row[key]);
    return null;
}

export function isNearClose(row, now = new Date()) {
    if (String(row.Status).toLowerCase() !== 'open') return false;
    const close = campaignDate(row, 'ScheduledCloseAt', 'CloseAt', 'closeAt');
    if (!close || Number.isNaN(close.getTime())) return false;
    const remaining = close.getTime() - now.getTime();
    return remaining >= 0 && remaining <= 72 * 60 * 60 * 1000;
}

export function campaignMetrics(rows, now = new Date()) {
    return {
        draft: rows.filter(row => String(row.Status).toLowerCase() === 'draft').length,
        open: rows.filter(row => String(row.Status).toLowerCase() === 'open').length,
        nearClose: rows.filter(row => isNearClose(row, now)).length,
        closed: rows.filter(row => ['closed', 'certified', 'published'].includes(String(row.Status).toLowerCase())).length
    };
}

export function sectionsForCampaign(row) {
    const type = String(row?.CampaignType || 'popular_vote');
    const sections = [
        ['overview', 'ภาพรวม'],
        ['content', ['survey', 'poll', 'feedback', 'knowledge_check'].includes(type) ? 'คำถาม' : type === 'submission_challenge' ? 'ข้อกำหนดผลงาน' : ['nomination', 'award'].includes(type) ? 'ผู้ถูกเสนอชื่อ' : 'ตัวเลือก'],
        ['eligibility', 'ผู้มีสิทธิ์'],
        ['schedule', 'กำหนดการ']
    ];
    if (['submission_challenge', 'nomination', 'award'].includes(type)) sections.push(['review', type === 'submission_challenge' ? 'ตรวจผลงาน' : 'ตรวจคำเสนอชื่อ']);
    if (['jury_scoring', 'hybrid_scoring', 'submission_challenge', 'award'].includes(type)) sections.push(['jury', 'กรรมการและเกณฑ์คะแนน']);
    sections.push(['results', 'ผลและรายงาน']);
    return sections;
}
