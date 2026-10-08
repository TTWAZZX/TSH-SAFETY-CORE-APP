export function valueOf(row, ...keys) {
    for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
    return null;
}

export function normalizeSnapshot(row = {}) {
    const status = String(valueOf(row, 'Status', 'status') || 'Calculated');
    const resultHash = String(valueOf(row, 'ResultHash', 'resultHash') || '').toLowerCase();
    return {
        id: Number(valueOf(row, 'id', 'ID') || 0),
        snapshotNo: Number(valueOf(row, 'SnapshotNo', 'snapshotNo') || 0),
        parentSnapshotId: Number(valueOf(row, 'ParentSnapshotID', 'parentSnapshotId') || 0) || null,
        stageId: Number(valueOf(row, 'StageID', 'stageId') || 0) || null,
        status,
        calculationContract: String(valueOf(row, 'CalculationContract', 'calculationContract') || ''),
        runType: String(valueOf(row, 'CalculationRunType', 'calculationRunType', 'runType') || 'initial'),
        eligible: Number(valueOf(row, 'EligibleCount', 'eligibleCount', 'eligible') || 0),
        participation: Number(valueOf(row, 'ParticipationCount', 'participationCount', 'participation') || 0),
        accepted: Number(valueOf(row, 'AcceptedBallotCount', 'acceptedBallotCount', 'accepted') || 0),
        abstain: Number(valueOf(row, 'AbstainCount', 'abstainCount', 'abstain') || 0),
        resultRows: Number(valueOf(row, 'ResultRows', 'resultRows') || 0),
        quorum: String(valueOf(row, 'QuorumState', 'quorumState', 'quorum') || 'unknown'),
        tie: String(valueOf(row, 'TieState', 'tieState', 'tie') || 'unknown'),
        reconciliation: String(valueOf(row, 'ReconciliationState', 'reconciliationState', 'reconciliation') || 'unknown'),
        resultHash,
        calculatedAt: valueOf(row, 'CalculatedAt', 'calculatedAt') || null,
        canFreeze: status === 'Calculated',
        canCertify: ['Frozen', 'Certified'].includes(status) && resultHash.length === 64,
        canPublish: status === 'Certified',
        published: status === 'Published'
    };
}

export function snapshotList(rows = []) {
    return (rows || []).map(normalizeSnapshot).sort((a, b) => b.snapshotNo - a.snapshotNo || b.id - a.id);
}

export function selectedSnapshot(rows = [], selectedId = null) {
    const list = snapshotList(rows);
    return list.find(row => row.id === Number(selectedId)) || list[0] || null;
}

export function resultReadiness(snapshot, { secret = false, verification = null } = {}) {
    if (!snapshot) return { ready: false, blocks: ['ยังไม่มี Result Snapshot'] };
    const blocks = [];
    if (snapshot.reconciliation !== 'balanced') blocks.push('ยอดผลยังไม่สมดุล');
    if (snapshot.quorum !== 'met') blocks.push('องค์ประชุมหรือเกณฑ์ขั้นต่ำยังไม่ผ่าน');
    if (snapshot.tie !== 'none') blocks.push('ยังมีผลเสมอที่ต้องจัดการตามกติกา');
    if (snapshot.resultHash.length !== 64) blocks.push('Result SHA-256 ไม่สมบูรณ์');
    if (secret && verification && verification.privacySafe !== true) blocks.push('การแยกตัวตนของบัตรลับยังไม่ผ่าน');
    if (secret && verification && Number(verification.identityMappings || 0) !== 0) blocks.push('พบบันทึกเชื่อมโยงตัวตนกับบัตรลับ');
    return { ready: blocks.length === 0, blocks };
}

export function verificationChecks(data = null) {
    if (!data) return [];
    const checks = data.checks || {};
    const entries = Array.isArray(checks) ? checks.map(value => [value?.key, value]) : Object.entries(checks);
    return entries.map(([key, value]) => ({
        key: String(key || 'verification'),
        storedHash: String(value?.storedHash || ''),
        calculatedHash: String(value?.calculatedHash || ''),
        pass: value?.pass !== undefined ? Boolean(value.pass) : value?.state ? value.state === 'pass' : Boolean(value?.storedHash && value.storedHash === value.calculatedHash)
    }));
}

export function publicPreview({ campaign = {}, snapshot = null, published = null } = {}) {
    const visibility = String(campaign.ResultVisibility || campaign.resultVisibility || 'certified_only');
    if (!snapshot?.published || !published) return { visible: false, visibility, rows: [], message: 'ผลจะยังไม่แสดงจนกว่าเซิร์ฟเวอร์ยืนยันการรับรองและการเผยแพร่' };
    return {
        visible: true,
        visibility,
        rows: Array.isArray(published.rows) ? published.rows.map(row => ({ positionCode: row.positionCode || null, count: Number(row.count || 0), rank: Number(row.rank || 0), state: row.state || 'normal' })) : [],
        message: 'ตัวอย่างนี้อ่านจาก published-result API หลังผ่านกติกาการมองเห็นแล้ว'
    };
}

export function isSecretCampaign(campaign = {}) {
    return String(campaign.CampaignType || campaign.campaignType) === 'secret_election' || String(campaign.PrivacyMode || campaign.privacyMode) === 'secret_ballot';
}
