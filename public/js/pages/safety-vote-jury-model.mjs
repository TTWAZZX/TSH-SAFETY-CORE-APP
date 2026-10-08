export const JURY_VIEW_LABELS = Object.freeze({ draft: 'รอดำเนินการ', submitted: 'ส่งแล้ว', recused: 'ถอนตัวแล้ว' });

export function valueOf(source = {}, ...keys) {
    for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
    return '';
}

export function assignmentState(assignment = {}) {
    const status = String(valueOf(assignment, 'Status', 'status') || 'Draft').toLowerCase();
    const conflict = String(valueOf(assignment, 'ConflictState', 'conflictState') || 'clear').toLowerCase();
    if (status === 'recused' || conflict === 'recused') return 'recused';
    if (status === 'submitted') return 'submitted';
    return 'draft';
}

export function filterAssignments(assignments = [], { view = 'draft', query = '' } = {}) {
    const normalized = String(query).trim().toLocaleLowerCase('th');
    return assignments.filter(item => assignmentState(item) === view).filter(item => {
        if (!normalized) return true;
        return ['CampaignTitle', 'campaignTitle', 'AssignmentScope', 'assignmentScope', 'Status', 'status', 'StageID', 'stageId']
            .some(key => String(item[key] ?? '').toLocaleLowerCase('th').includes(normalized));
    });
}

export function assignmentProgress(assignments = []) {
    const submitted = assignments.filter(item => assignmentState(item) === 'submitted').length;
    const recused = assignments.filter(item => assignmentState(item) === 'recused').length;
    return { submitted, recused, pending: assignments.length - submitted - recused, total: assignments.length };
}

export function scoreKey(candidateId, criterionId) {
    return `${Number(candidateId)}:${Number(criterionId)}`;
}

export function normalizeScores(rows = []) {
    return Object.fromEntries(rows.map(row => [scoreKey(valueOf(row, 'CandidateID', 'candidateId'), valueOf(row, 'CriterionID', 'criterionId')), {
        score: valueOf(row, 'Score', 'score'),
        comment: String(valueOf(row, 'BoundedComment', 'comment') || '')
    }]));
}

export function validateScoreSheet(detail = {}, scores = {}) {
    const errors = [];
    for (const candidate of detail.candidates || []) {
        for (const criterion of detail.criteria || []) {
            const key = scoreKey(candidate.id, criterion.id), raw = scores[key]?.score;
            const min = Number(valueOf(criterion, 'MinScore', 'minScore')), max = Number(valueOf(criterion, 'MaxScore', 'maxScore'));
            if (raw === '' || raw === undefined || raw === null || !Number.isFinite(Number(raw))) {
                errors.push({ key, message: `กรุณาให้คะแนน “${valueOf(criterion, 'Title', 'title')}” สำหรับ ${candidate.displayName}` });
            } else if (Number(raw) < min || Number(raw) > max) {
                errors.push({ key, message: `คะแนน “${valueOf(criterion, 'Title', 'title')}” ต้องอยู่ระหว่าง ${min}–${max}` });
            }
            if (String(scores[key]?.comment || '').length > 1000) errors.push({ key, message: 'หมายเหตุแต่ละรายการต้องไม่เกิน 1,000 ตัวอักษร' });
        }
    }
    return errors;
}

export function scoreProgress(detail = {}, scores = {}) {
    const total = (detail.candidates || []).length * (detail.criteria || []).length;
    let completed = 0;
    for (const candidate of detail.candidates || []) for (const criterion of detail.criteria || []) {
        const raw = scores[scoreKey(candidate.id, criterion.id)]?.score;
        if (raw !== '' && raw !== undefined && raw !== null && Number.isFinite(Number(raw))) completed += 1;
    }
    return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
}

export function buildScorePayload(detail = {}, scores = {}) {
    return {
        scores: (detail.candidates || []).flatMap(candidate => (detail.criteria || []).map(criterion => {
            const row = scores[scoreKey(candidate.id, criterion.id)] || {};
            return { candidateId: Number(candidate.id), criterionId: Number(criterion.id), score: Number(row.score), comment: String(row.comment || '').trim() };
        }))
    };
}

export function safeJuryReceipt(assignment = {}) {
    return {
        assignmentId: Number(valueOf(assignment, 'id')),
        sheetVersion: Number(valueOf(assignment, 'SheetVersion', 'sheetVersion') || 1),
        submittedAt: valueOf(assignment, 'SubmittedAt', 'submittedAt') || new Date().toISOString(),
        status: 'Submitted',
        immutable: true,
        scoresIncluded: false,
        candidateDetailsIncluded: false
    };
}
