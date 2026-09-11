'use strict';

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const base = String(process.env.BBS_PRODUCTION_API_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core/api').replace(/\/+$/, '');
const credentials = {
    employeeId: String(process.env.PROD_UAT_ADMIN_ID || '').trim(),
    password: String(process.env.PROD_UAT_ADMIN_PASSWORD || ''),
};

async function call(route, options = {}) {
    const response = await fetch(`${base}${route}`, options);
    const payload = await response.json().catch(() => ({}));
    assert.ok(response.ok, `${response.status} ${route}: ${payload.message || 'request failed'}`);
    return payload;
}

function provenanceIssues(detail) {
    const sides = new Map((detail.layout?.sides || []).map(side => [side.side, side]));
    return ['Front', 'Back'].filter(name => {
        const side = sides.get(name);
        return !side
            || side.storageClass !== 'DesignerAsset'
            || !Number(side.backgroundAssetId)
            || !Number(side.masterArtworkId)
            || side.masterArtworkKind !== detail.TemplateKind
            || side.masterArtworkSide !== name;
    });
}

async function mapLimit(items, limit, mapper) {
    const result = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            result[index] = await mapper(items[index]);
        }
    }));
    return result;
}

(async () => {
    assert.ok(credentials.employeeId && credentials.password, 'Production Admin UAT credentials are required');
    const login = await call('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
    });
    const headers = { Authorization: `Bearer ${login.token}` };
    const [personalPayload, departmentPayload] = await Promise.all([
        call('/bbs/admin/card-templates', { headers }),
        call('/bbs/admin/department-cards', { headers }),
    ]);
    const templates = [
        ...(personalPayload.data || []).map(row => ({ kind: 'Personal', id: Number(row.id), name: row.TemplateName, status: row.Status })),
        ...(departmentPayload.data?.templates || []).map(row => ({ kind: 'Department', id: Number(row.id), name: row.TemplateName, status: row.Status })),
    ];
    const versionGroups = await mapLimit(templates, 4, async template => ({
        template,
        versions: (await call(`/bbs/admin/card-designer/${template.kind.toLowerCase()}/${template.id}/versions`, { headers })).data || [],
    }));
    const refs = versionGroups.flatMap(group => group.versions.map(version => ({ template: group.template, version })));
    const details = await mapLimit(refs, 4, async ref => ({ ...ref, detail: (await call(`/bbs/admin/card-designer/versions/${ref.version.id}`, { headers })).data }));
    const affected = details.map(row => ({
        templateKind: row.template.kind,
        templateId: row.template.id,
        templateName: row.template.name,
        layoutVersionId: Number(row.detail.id),
        versionNo: Number(row.detail.VersionNo),
        status: row.detail.Status,
        affectedSides: provenanceIssues(row.detail),
    })).filter(row => row.affectedSides.length);
    const repairable = affected.filter(row => row.status === 'Draft');
    const immutable = affected.filter(row => row.status !== 'Draft');
    console.log(JSON.stringify({
        success: true,
        readOnly: true,
        writes: 0,
        templates: {
            personal: templates.filter(row => row.kind === 'Personal').length,
            department: templates.filter(row => row.kind === 'Department').length,
            total: templates.length,
        },
        layoutVersions: details.length,
        compliantVersions: details.length - affected.length,
        repairableDrafts: repairable,
        immutableLegacyVersions: immutable,
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
