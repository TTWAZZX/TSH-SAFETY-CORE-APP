export function valueOf(row, ...keys) {
    for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
    return null;
}

export function metricView(metric = {}) {
    if (metric.suppressed || metric.visible === false) {
        return { visible: false, value: null, label: 'ปกปิด', reason: metric.reason || 'PRIVACY_THRESHOLD', percentage: null };
    }
    const value = Number(metric.value || 0);
    const percentage = Number.isFinite(Number(metric.percentage)) ? Number(metric.percentage) : null;
    return { visible: true, value, label: value.toLocaleString('th-TH'), reason: null, percentage };
}

export function statusCounts(rows = []) {
    const counts = {};
    for (const row of rows || []) {
        const key = String(valueOf(row, 'Status', 'status') || 'Unknown');
        counts[key] = (counts[key] || 0) + Number(valueOf(row, 'total', 'Total') || 0);
    }
    return counts;
}

export function juryProgress(rows = []) {
    const result = { total: 0, draft: 0, submitted: 0, recused: 0, conflict: 0, percent: 0 };
    for (const row of rows || []) {
        const total = Number(valueOf(row, 'total', 'Total') || 0);
        const status = String(valueOf(row, 'Status', 'status') || '').toLowerCase();
        const conflict = String(valueOf(row, 'ConflictState', 'conflictState') || '').toLowerCase();
        result.total += total;
        if (status === 'draft') result.draft += total;
        if (status === 'submitted') result.submitted += total;
        if (status === 'recused') result.recused += total;
        if (conflict && conflict !== 'clear') result.conflict += total;
    }
    result.percent = result.total ? Math.round(result.submitted / result.total * 100) : 0;
    return result;
}

export function stageRows(stages = [], progressRows = []) {
    return (stages || []).map(stage => {
        const stageId = Number(valueOf(stage, 'id', 'ID'));
        const rows = (progressRows || []).filter(row => Number(valueOf(row, 'StageID', 'stageId')) === stageId);
        return {
            id: stageId,
            name: String(valueOf(stage, 'StageName', 'stageName') || `Stage ${stageId}`),
            type: String(valueOf(stage, 'StageType', 'stageType') || 'stage'),
            status: String(valueOf(stage, 'Status', 'status') || 'Draft'),
            sequence: Number(valueOf(stage, 'SequenceNo', 'sequenceNo') || 0),
            jury: juryProgress(rows)
        };
    }).sort((a, b) => a.sequence - b.sequence);
}

const EXPORTABLE = new Set(['Frozen', 'Certified', 'Published']);
const CERTIFIED = new Set(['Certified', 'Published']);

export function snapshotReadiness(rows = []) {
    return (rows || []).map(row => {
        const status = String(valueOf(row, 'Status', 'status') || 'Calculated');
        return {
            id: Number(valueOf(row, 'id', 'ID')),
            snapshotNo: Number(valueOf(row, 'SnapshotNo', 'snapshotNo') || 0),
            status,
            stageId: Number(valueOf(row, 'StageID', 'stageId') || 0) || null,
            resultRows: Number(valueOf(row, 'ResultRows', 'resultRows') || 0),
            reconciliation: String(valueOf(row, 'ReconciliationState', 'reconciliationState') || 'unknown'),
            quorum: String(valueOf(row, 'QuorumState', 'quorumState') || 'unknown'),
            resultHash: String(valueOf(row, 'ResultHash', 'resultHash') || ''),
            aggregateExportReady: EXPORTABLE.has(status),
            certifiedReportReady: CERTIFIED.has(status)
        };
    });
}

export function preferredSnapshot(rows = [], certified = false) {
    return snapshotReadiness(rows).find(row => certified ? row.certifiedReportReady : row.aggregateExportReady) || null;
}

export function safeTimeline(rows = []) {
    return (rows || []).slice(0, 20).map(row => ({
        action: String(valueOf(row, 'Action', 'action') || 'SAFETY_VOTE_EVENT'),
        statusCode: String(valueOf(row, 'StatusCode', 'statusCode') || ''),
        occurredAt: valueOf(row, 'OccurredAt', 'occurredAt') || null
    }));
}

export function operationalWarnings({ operations = {}, jury = [], snapshots = [], stages = [], partialIssues = [] } = {}) {
    const warnings = [];
    const funnel = operations.funnel || {};
    const reconciliation = operations.health?.reconciliation || funnel.reconciliation;
    if (reconciliation && reconciliation !== 'balanced') warnings.push({ tone: 'danger', code: 'RECONCILIATION', text: 'ยอดการเข้าร่วมและบัตรที่รับยังไม่สมดุล ห้ามใช้ตัวเลขเพื่อประกาศผล' });
    if (!operations.campaign?.scheduledOpenAt || !operations.campaign?.scheduledCloseAt) warnings.push({ tone: 'warning', code: 'SCHEDULE', text: 'กำหนดเวลาเปิดหรือปิดยังไม่ครบ กรุณาตรวจในพื้นที่จัดการแคมเปญ' });
    const progress = juryProgress(jury);
    if (progress.total && progress.submitted < progress.total) warnings.push({ tone: 'warning', code: 'JURY_PENDING', text: `ยังมีงานประเมินที่ไม่ส่ง ${progress.total - progress.submitted} งาน` });
    if ((stages || []).length && !snapshotReadiness(snapshots).length) warnings.push({ tone: 'info', code: 'RESULT_PENDING', text: 'ยังไม่มี Result Snapshot สำหรับตรวจความพร้อมหรือสร้างรายงาน' });
    for (const issue of partialIssues || []) warnings.push({ tone: 'info', code: issue.code || 'PARTIAL', text: issue.message || 'ข้อมูลบางส่วนไม่พร้อมใช้งาน' });
    return warnings;
}

export function notificationSummary(rows = []) {
    const counts = statusCounts(rows);
    return {
        queued: Number(counts.Queued || 0) + Number(counts.Retry || 0),
        sent: Number(counts.Sent || 0),
        failed: Number(counts.Failed || 0),
        total: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)
    };
}
