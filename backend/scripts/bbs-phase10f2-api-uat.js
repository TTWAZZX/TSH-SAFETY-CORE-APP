'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const marker = `UAT-BBS10F2-${Date.now()}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
const templateDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-templates');
const assetDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-designer');
const createdFiles = new Set();
let server;
let templateId = null;
let layoutId = null;
let auditBaseline = 0;

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn:'15m' });
}

async function call(base, route, { method='GET', token, body, form } = {}) {
    const headers = { Accept:'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const response = await fetch(`${base}${route}`, { method, headers, body:payload });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return { status:response.status, type, bytes:Buffer.from(await response.arrayBuffer()) };
    return { status:response.status, type, json:await response.json() };
}

async function cleanup() {
    if (layoutId) {
        const [assets] = await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?', [layoutId]).catch(() => [[]]);
        assets.forEach(row => createdFiles.add(path.join(assetDir, path.basename(row.StoredName))));
        await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?', [layoutId]).catch(() => {});
        await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?', [layoutId]).catch(() => {});
        await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?', [layoutId]).catch(() => {});
        await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?', [layoutId]).catch(() => {});
    }
    if (templateId) await db.query('DELETE FROM BBS_Card_Templates WHERE id=?', [templateId]).catch(() => {});
    if (auditBaseline) await db.query("DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs' AND TargetType IN ('BBS_Card_Layout_Version','BBS_Card_Layout_Asset')", [auditBaseline]).catch(() => {});
    for (const file of createdFiles) await fs.promises.rm(file, { force:true }).catch(() => {});
    const [[remaining]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM BBS_Card_Templates WHERE TemplateName=?) templates,
            (SELECT COUNT(*) FROM BBS_Card_Layout_Versions WHERE id=?) versions,
            (SELECT COUNT(*) FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?) assets`,
        [marker, layoutId || 0, layoutId || 0]
    ).catch(() => [[{ templates:-1, versions:-1, assets:-1 }]]);
    console.log(`BBS Phase 10F-2 UAT cleanup: templates=${remaining.templates}, versions=${remaining.versions}, assets=${remaining.assets}`);
    assert.deepStrictEqual([Number(remaining.templates), Number(remaining.versions), Number(remaining.assets)], [0,0,0]);
}

(async () => {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const readyUsers = await loadReadyTestUsers(db);
    const adminToken = tokenFor(readyUsers.admin);
    const userToken = tokenFor(readyUsers.user);
    const [[audit]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');
    auditBaseline = Number(audit.id);

    const templateName = `${marker}.png`;
    fs.mkdirSync(templateDir, { recursive:true });
    await fs.promises.writeFile(path.join(templateDir, templateName), png);
    createdFiles.add(path.join(templateDir, templateName));
    const [createdTemplate] = await db.query(
        `INSERT INTO BBS_Card_Templates
         (TemplateName,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,IncludeEmployeeID,Status,CreatedBy,UpdatedBy)
         VALUES(?,?,?,?,?,85.60,53.98,1,'Draft',?,?)`,
        [marker, templateName, templateName, 'image/png', png.length, readyUsers.admin.id, readyUsers.admin.id]
    );
    templateId = Number(createdTemplate.insertId);

    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/bbs`;

    let response = await call(base, '/admin/card-designer/catalog', { token:userToken });
    assert.strictEqual(response.status, 403, 'Ordinary users must not access the designer catalog');

    response = await call(base, `/admin/card-designer/personal/${templateId}/versions`, { method:'POST', token:adminToken, body:{} });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    layoutId = Number(response.json.data.id);
    assert.strictEqual(response.json.data.Status, 'Draft');
    assert.strictEqual(response.json.data.layout.sides.length, 1);

    response = await call(base, `/admin/card-designer/versions/${layoutId}/sides/front/background`, { token:adminToken });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.type, 'image/png');
    assert.deepStrictEqual(response.bytes, png);

    const form = new FormData();
    form.set('assetKey', 'uat-back-background');
    form.set('asset', new Blob([png], { type:'image/png' }), 'uat-back.png');
    response = await call(base, `/admin/card-designer/versions/${layoutId}/assets`, { method:'POST', token:adminToken, form });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    const assetId = Number(response.json.data.id);
    const [[assetRow]] = await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE id=?', [assetId]);
    const privateStoredName = String(assetRow.StoredName);
    assert.strictEqual(JSON.stringify(response.json.data).includes(privateStoredName), false, 'Asset JSON must not expose a stored file name');

    response = await call(base, `/admin/card-designer/assets/${assetId}/file`, { token:adminToken });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.bytes, png);
    response = await call(base, `/admin/card-designer/assets/${assetId}/file`, { token:userToken });
    assert.strictEqual(response.status, 403, 'Ordinary users must not read private designer assets');

    response = await call(base, `/admin/card-designer/versions/${layoutId}`, { token:adminToken });
    assert.strictEqual(response.status, 200);
    const detail = response.json.data;
    const back = {
        ...detail.layout.sides[0], side:'Back', storageClass:'DesignerAsset', backgroundAssetId:assetId,
        backgroundStoredName:'asset-reference', backgroundOriginalName:'uat-back.png', backgroundMimeType:'image/png', backgroundFileSize:png.length,
    };
    detail.layout.sides.push(back);
    detail.layout.elements.push({
        elementKey:'uat-static-text', side:'Back', elementType:'StaticText', dataSourceKey:null, staticText:'Preview only', assetId:null,
        xBP:1000, yBP:1000, widthBP:5000, heightBP:1000, rotationDeg:0, zIndex:1,
        visible:true, locked:false, required:false, style:{ fontSizePt:14, color:'#0f172a' },
    });
    response = await call(base, `/admin/card-designer/versions/${layoutId}`, { method:'PUT', token:adminToken, body:{ rowVersion:detail.RowVersion, layout:detail.layout } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    assert.strictEqual(response.json.data.layout.sides.length, 2);
    assert.strictEqual(response.json.data.layout.sides[1].backgroundAssetId, assetId);
    assert.strictEqual(response.json.data.layout.elements.some(row => row.elementKey === 'uat-static-text'), true);
    assert.strictEqual(JSON.stringify(response.json.data).includes(privateStoredName), false, 'Layout detail must not expose a stored file name');

    response = await call(base, `/admin/card-designer/personal/${templateId}/versions`, { method:'POST', token:adminToken, body:{ sourceVersionId:layoutId } });
    assert.strictEqual(response.status, 400, 'A clone must not cross-reference a private Draft asset');
    assert.strictEqual(response.json.code, 'PRIVATE_ASSET_CLONE_FORBIDDEN');

    response = await call(base, `/admin/card-designer/versions/${layoutId}/sides/back/background`, { token:adminToken });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.bytes, png);

    const [[rendering]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='visual_card_designer_rendering_enabled'");
    assert.strictEqual(String(rendering.SettingValue), '0', 'Phase 10F-2 must keep live designer rendering disabled');

    await db.query("UPDATE BBS_Card_Layout_Versions SET Status='Active' WHERE id=?", [layoutId]);
    response = await call(base, `/admin/card-designer/versions/${layoutId}`, { method:'PUT', token:adminToken, body:{ rowVersion:response.json?.data?.RowVersion || detail.RowVersion + 1, layout:detail.layout } });
    assert.strictEqual(response.status, 409);
    assert.strictEqual(response.json.code, 'IMMUTABLE_LAYOUT_VERSION');

    console.log('BBS Phase 10F-2 Admin Draft, private assets, duplex save, authorization and immutable preview API UAT: PASS');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { await cleanup(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
    await db.end().catch(() => {});
});
