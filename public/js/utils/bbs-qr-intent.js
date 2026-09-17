export const BBS_QR_INTENT_KEY='bbs_qr_intent';
export const BBS_QR_PENDING_KEY='bbs_qr_intent_pending';

const code=value=>String(value?.code||'').trim().toUpperCase();
const message=value=>String(value?.message||value||'').trim().toLowerCase();

export function shouldDiscardBbsQrIntent(error){
    return new Set(['QR_NOT_ACTIVE','QR_SCOPE_DENIED']).has(code(error));
}

export function isBbsRolloutBlockedError(error){
    if(new Set(['BBS_ADMIN_ONLY','BBS_PILOT_ACCESS_REQUIRED']).has(code(error)))return true;
    const text=message(error);
    return text.includes('admin access required')||text.includes('approved pilot participant');
}

export function normalizeBbsQrRoute(_value){
    return '#bbs-smart-card';
}
