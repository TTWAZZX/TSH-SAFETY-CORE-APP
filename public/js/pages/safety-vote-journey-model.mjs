export const SAFETY_VOTE_JOURNEY = Object.freeze([
    { key: 'center', label: 'ศูนย์แคมเปญ', roles: ['admin'] },
    { key: 'readiness', label: 'สร้างและตรวจความพร้อม', roles: ['admin'] },
    { key: 'participation', label: 'การเข้าร่วม', roles: ['admin', 'user'] },
    { key: 'jury', label: 'งานกรรมการ', roles: ['admin', 'jury'], types: ['jury_scoring', 'hybrid_scoring', 'judged_contest', 'submission_challenge', 'award'] },
    { key: 'operations', label: 'ปฏิบัติการ', roles: ['admin'] },
    { key: 'results', label: 'ผลและการรับรอง', roles: ['admin'] },
    { key: 'governance', label: 'ธรรมาภิบาลและหลักฐาน', roles: ['admin'] }
]);

export function normalizeJourneyType(value) {
    const type = String(value || 'popular_vote').trim().toLowerCase();
    if (type === 'jury_scoring') return 'judged_contest';
    return type;
}

export function journeyForCampaign({ role = 'admin', campaignType = 'popular_vote' } = {}) {
    const normalizedRole = ['admin', 'user', 'jury'].includes(role) ? role : 'user';
    const type = normalizeJourneyType(campaignType);
    return SAFETY_VOTE_JOURNEY.filter(step => step.roles.includes(normalizedRole) && (!step.types || step.types.includes(type) || step.types.includes(campaignType)));
}

export function journeyPosition({ role = 'admin', campaignType = 'popular_vote', current = '' } = {}) {
    const steps = journeyForCampaign({ role, campaignType });
    const index = steps.findIndex(step => step.key === current);
    return { steps, index, current: index >= 0 ? steps[index] : null };
}
