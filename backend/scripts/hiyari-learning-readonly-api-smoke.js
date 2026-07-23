'use strict';

if (process.env.HIYARI_SMOKE_ALLOW_DB_ACCESS !== 'YES') {
    console.error('Refusing Hiyari learning API smoke: set HIYARI_SMOKE_ALLOW_DB_ACCESS=YES for read-only database access.');
    process.exit(1);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

async function request(base, route, token, options = {}) {
    const response = await fetch(`${base}${route}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const json = await response.json();
    return { response, json };
}

async function main() {
    const viewerId = 'HIYARI-LEARNING-READONLY';
    const [[closed]] = await db.query(
        "SELECT id, YEAR(ReportDate) AS ReportYear FROM HiyariReports WHERE DeletedAt IS NULL AND Status='Closed' AND ReporterID<>? AND COALESCE(SubmittedByID,'')<>? ORDER BY ReportDate DESC LIMIT 1",
        [viewerId, viewerId]
    );
    if (!closed) throw new Error('No Closed Hiyari report is available for the read-only learning smoke.');
    const [[active]] = await db.query(
        "SELECT id FROM HiyariReports WHERE DeletedAt IS NULL AND Status<>'Closed' AND ReporterID<>? AND COALESCE(SubmittedByID,'')<>? ORDER BY ReportDate DESC LIMIT 1",
        [viewerId, viewerId]
    );

    const token = jwt.sign({ id: viewerId, EmployeeID: viewerId, name: 'Hiyari Learning Read-only', role: 'User' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const list = await request(base, `/hiyari?year=${closed.ReportYear}`, token);
        if (!list.response.ok) throw new Error(`List failed: ${list.response.status}`);
        const listRow = (list.json.data || []).find(row => String(row.id) === String(closed.id));
        if (!listRow?.IsLearningRecord || !listRow?.ReadOnly) throw new Error('Closed report is missing from the learning list or is not read-only.');
        if (listRow.CompanyEmail || listRow.AttachmentUrl || listRow.AdditionalFileUrl || listRow.ReporterID) throw new Error('Learning list exposed protected fields.');

        const stats = await request(base, `/hiyari/stats?year=${closed.ReportYear}`, token);
        if (!stats.response.ok) throw new Error(`Stats failed: ${stats.response.status}`);
        const statsRow = (stats.json.data?.reports || []).find(row => String(row.id) === String(closed.id));
        if (!statsRow?.IsLearningRecord || statsRow.CompanyEmail || statsRow.AttachmentUrl) throw new Error('Stats visibility/sanitization differs from the list contract.');

        const detail = await request(base, `/hiyari/${closed.id}`, token);
        if (!detail.response.ok || !detail.json.data?.IsLearningRecord || !detail.json.data?.ReadOnly) throw new Error('Closed learning detail is not readable.');
        if (detail.json.data.CompanyEmail || detail.json.data.AttachmentUrl || detail.json.data.AdditionalFileUrl || detail.json.data.ReporterID) throw new Error('Learning detail exposed protected fields.');

        const timeline = await request(base, `/hiyari/${closed.id}/timeline`, token);
        if (!timeline.response.ok || !Array.isArray(timeline.json.data) || timeline.json.data.length !== 0) throw new Error('Learning detail exposed internal timeline data.');

        if (active) {
            const hidden = await request(base, `/hiyari/${active.id}`, token);
            if (hidden.response.status !== 404) throw new Error(`Non-Closed report should remain hidden; received ${hidden.response.status}.`);
        }

        const forbidden = await request(base, `/hiyari/${closed.id}`, token, { method: 'PUT', body: JSON.stringify({ Description: 'must not write' }) });
        if (forbidden.response.status !== 403) throw new Error(`User mutation should be forbidden; received ${forbidden.response.status}.`);

        console.log(JSON.stringify({
            ok: true,
            closedReportId: closed.id,
            listLearningRecord: true,
            statsLearningRecord: true,
            detailLearningRecord: true,
            protectedFieldsHidden: true,
            timelineRows: 0,
            activeReportHidden: Boolean(active),
            userMutationStatus: forbidden.response.status,
        }, null, 2));
    } finally {
        await new Promise(resolve => server.close(resolve));
        await db.end();
    }
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, message: error.message }));
    process.exit(1);
});
