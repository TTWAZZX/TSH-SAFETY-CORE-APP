export function valueOf(row, ...keys) {
    for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
    return null;
}

export function normalizeVerification(data = null) {
    if (!data) return { available: false, ready: false, checks: [], verificationHash: '', privacySafe: false, identityMappings: 0, activeCertifiers: 0, dualCertificationRequired: false };
    const raw = Array.isArray(data.checks) ? data.checks : Object.entries(data.checks || {}).map(([key, value]) => ({ key, ...value }));
    const checks = raw.map(item => ({
        key: String(item?.key || 'verification'),
        storedHash: String(item?.storedHash || ''),
        calculatedHash: String(item?.calculatedHash || ''),
        state: item?.state === 'pass' || item?.pass === true ? 'pass' : 'fail'
    }));
    return {
        available: true,
        ready: Boolean(data.ready) && checks.length > 0 && checks.every(item => item.state === 'pass'),
        checks,
        verificationHash: String(data.verificationHash || ''),
        privacySafe: data.privacySafe === true,
        identityMappings: Number(data.identityMappings || 0),
        activeCertifiers: Number(data.activeCertifiers || 0),
        dualCertificationRequired: data.dualCertificationRequired === true
    };
}

export function normalizeAcceptance(data = null) {
    const required = Array.isArray(data?.required) ? data.required.map(String) : ['she_owner'];
    const rows = Array.isArray(data?.rows) ? data.rows.map((row, index) => ({
        id: Number(valueOf(row, 'id', 'ID') || index + 1),
        acceptanceArea: String(valueOf(row, 'acceptanceArea', 'AcceptanceArea') || ''),
        decision: String(valueOf(row, 'decision', 'Decision') || ''),
        evidenceReference: String(valueOf(row, 'evidenceReference', 'EvidenceReference') || ''),
        evidenceSha256: String(valueOf(row, 'evidenceSha256', 'EvidenceSha256') || '').toLowerCase(),
        approvedBy: String(valueOf(row, 'approvedBy', 'ApprovedBy') || ''),
        approvedAt: valueOf(row, 'approvedAt', 'ApprovedAt') || null,
        expiresAt: valueOf(row, 'expiresAt', 'ExpiresAt') || null,
        revokedAt: valueOf(row, 'revokedAt', 'RevokedAt') || null
    })) : [];
    const now = Date.now();
    const activeAreas = new Set(rows.filter(row => row.decision === 'Accepted' && !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt).getTime() > now)).map(row => row.acceptanceArea));
    return { required, rows, activeAreas: [...activeAreas], missing: required.filter(area => !activeAreas.has(area)), ready: required.every(area => activeAreas.has(area)) };
}

export function normalizePreflight(data = null) {
    if (!data) return { available: false, decision: 'HOLD', ready: false, checks: [], missingAcceptance: ['she_owner'], productionConnected: false, deployAuthorized: false, preflightHash: '' };
    return {
        available: true,
        governanceOwner: String(data.governanceOwner || 'SHE'),
        governanceContract: String(data.governanceContract || ''),
        decision: data.decision === 'READY_FOR_SEPARATE_PRODUCTION_PREFLIGHT' ? data.decision : 'HOLD',
        ready: data.ready === true,
        checks: Array.isArray(data.checks) ? data.checks.map(item => ({ key: String(item.key || ''), state: item.state === 'pass' ? 'pass' : 'block', required: item.required !== false })) : [],
        missingAcceptance: Array.isArray(data.missingAcceptance) ? data.missingAcceptance.map(String) : [],
        productionConnected: data.productionConnected === true,
        deployAuthorized: data.deployAuthorized === true,
        preflightHash: String(data.preflightHash || '')
    };
}

export function normalizeObservability(data = null) {
    return {
        available: Boolean(data),
        handoffs: { total: Number(data?.handoffs?.total || 0), delivered: Number(data?.handoffs?.delivered || 0), failed: Number(data?.handoffs?.failed || 0) },
        openAlerts: Number(data?.openAlerts || 0),
        voterChoiceMetrics: data?.privacy?.voterChoiceMetrics === true,
        receiptLookup: data?.privacy?.receiptLookup === true
    };
}

export function normalizeCatalog(data = null) {
    return Array.isArray(data?.adapters) ? data.adapters.filter(item => item && item.key).map(item => ({ key: String(item.key), mode: String(item.mode || 'read_only'), explicitConfirmation: item.explicitConfirmation === true, automaticMutation: item.automaticMutation === true, canVote: item.canVote === true, canCertify: item.canCertify === true, canReadHiddenResults: item.canReadHiddenResults === true })) : [];
}

export function normalizePreview(data = null) {
    if (!data?.payload) return null;
    return {
        previewHash: String(data.previewHash || ''),
        confirmation: String(data.confirmation || ''),
        externalMutation: data.externalMutation === true,
        payload: {
            targetAdapter: String(data.payload.targetAdapter || ''), campaignCode: String(data.payload.campaignCode || ''),
            resultSnapshotId: Number(data.payload.resultSnapshotId || 0), resultHash: String(data.payload.resultHash || ''),
            reportId: String(data.payload.reportId || ''), reportSha256: String(data.payload.reportSha256 || ''),
            classification: String(data.payload.classification || ''), containsVoterIdentity: data.payload.containsVoterIdentity === true,
            containsBallotChoice: data.payload.containsBallotChoice === true, externalMutation: data.payload.externalMutation === true
        }
    };
}

export function evidenceTimeline(acceptance, receipts = []) {
    const rows = (acceptance?.rows || []).map(row => ({ type: 'acceptance', at: row.approvedAt, title: `${row.acceptanceArea}: ${row.decision}`, actor: row.approvedBy, reference: row.evidenceReference, hash: row.evidenceSha256 }));
    return [...rows, ...(receipts || [])].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}
