'use strict';

const express = require('express');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { normalizeIsoDate, bangkokIsoDate } = require('../services/bbs-phase1');
const { cleanText, validateDraftPayload, buildImportPreview, detectPublishConflicts, resolveCandidates } = require('../services/bbs-checklist');

const router = express.Router();
const actorId = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const isAdminUser = req => String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';

function checklistError(res, error, label) {
    console.error(`[bbs-phase2] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success: false, code: 'BBS_CHECKLIST_SETUP_REQUIRED', message: 'BBS Phase 2 checklist migration is required.' });
    return res.status(500).json({ success: false, message: 'Unable to process the BBS checklist request.' });
}

async function loadVersion(versionId, queryable = db) {
    const [[version]] = await queryable.query(
        `SELECT v.*,t.TemplateCode,t.TemplateName,t.Description,t.IsActive AS TemplateIsActive
           FROM BBS_Checklist_Versions v JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID
          WHERE v.id=? LIMIT 1`, [versionId]);
    if (!version) return null;
    const [categories] = await queryable.query('SELECT * FROM BBS_Checklist_Categories WHERE VersionID=? ORDER BY SortOrder,id', [versionId]);
    const categoryIds = categories.map(row => Number(row.id));
    let items = [];
    if (categoryIds.length) {
        const marks = categoryIds.map(() => '?').join(',');
        [items] = await queryable.query(`SELECT * FROM BBS_Checklist_Items WHERE CategoryID IN (${marks}) ORDER BY SortOrder,id`, categoryIds);
    }
    const [scopes] = await queryable.query(
        `SELECT s.*,d.Name AS DepartmentName,u.name AS SafetyUnitName,p.Name AS PositionName
           FROM BBS_Checklist_Scope_Mappings s
           LEFT JOIN Master_Departments d ON d.id=s.DepartmentID
           LEFT JOIN Master_SafetyUnits u ON u.id=s.SafetyUnitID
           LEFT JOIN Master_Positions p ON p.id=s.PositionID
          WHERE s.VersionID=? ORDER BY s.Priority DESC,s.id`, [versionId]);
    const byCategory = new Map(categories.map(row => [Number(row.id), { ...row, items: [] }]));
    items.forEach(item => byCategory.get(Number(item.CategoryID))?.items.push(item));
    return { ...version, categories: [...byCategory.values()], scopes };
}

async function validateMasterScopes(conn, scopes) {
    for (const scope of scopes) {
        if (scope.departmentId) {
            const [[department]] = await conn.query('SELECT id FROM Master_Departments WHERE id=? LIMIT 1', [scope.departmentId]);
            if (!department) return `DepartmentID ${scope.departmentId} was not found.`;
        }
        if (scope.safetyUnitId) {
            const [[unit]] = await conn.query('SELECT id FROM Master_SafetyUnits WHERE id=? AND department_id=? LIMIT 1', [scope.safetyUnitId, scope.departmentId]);
            if (!unit) return `SafetyUnitID ${scope.safetyUnitId} does not belong to the selected Department.`;
        }
        if (scope.positionId) {
            const [[position]] = await conn.query('SELECT id FROM Master_Positions WHERE id=? LIMIT 1', [scope.positionId]);
            if (!position) return `PositionID ${scope.positionId} was not found.`;
        }
    }
    return null;
}

async function replaceDraftContents(conn, versionId, validation, userId) {
    await conn.query('DELETE FROM BBS_Checklist_Scope_Mappings WHERE VersionID=?', [versionId]);
    await conn.query('DELETE FROM BBS_Checklist_Categories WHERE VersionID=?', [versionId]);
    for (const category of validation.categories) {
        const [categoryResult] = await conn.query('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)', [versionId, category.name, category.sortOrder]);
        for (const item of category.items) await conn.query(
            'INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)',
            [categoryResult.insertId, item.code, item.prompt, item.responseType, item.helpText, item.sortOrder, item.isRequired, item.unsafeRequiresRemark, item.unsafeRequiresPhoto, item.unsafeRequiresAction]);
    }
    for (const scope of validation.scopes) await conn.query(
        'INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,1)',
        [versionId, scope.departmentId, scope.safetyUnitId, scope.positionId, scope.bbsLevel, scope.priority]);
    await conn.query('UPDATE BBS_Checklist_Versions SET EffectiveFrom=?,EffectiveTo=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?', [validation.from, validation.to, userId, versionId]);
}

router.get('/admin/checklists', isAdmin, async (_req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT t.*,COUNT(v.id) AS VersionCount,
                    SUM(v.Status='Draft') AS DraftCount,SUM(v.Status='Published') AS PublishedCount,
                    MAX(v.VersionNo) AS LatestVersionNo
               FROM BBS_Checklist_Templates t LEFT JOIN BBS_Checklist_Versions v ON v.TemplateID=t.id
              GROUP BY t.id ORDER BY t.IsActive DESC,t.UpdatedAt DESC,t.id DESC`);
        res.json({ success: true, data: rows });
    } catch (error) { return checklistError(res, error, 'list'); }
});

router.get('/admin/checklists/:templateId', isAdmin, async (req, res) => {
    const templateId = positiveInt(req.params.templateId);
    if (!templateId) return res.status(400).json({ success: false, message: 'Invalid checklist template ID.' });
    try {
        const [[template]] = await db.query('SELECT * FROM BBS_Checklist_Templates WHERE id=? LIMIT 1', [templateId]);
        if (!template) return res.status(404).json({ success: false, message: 'Checklist template was not found.' });
        const [versions] = await db.query('SELECT * FROM BBS_Checklist_Versions WHERE TemplateID=? ORDER BY VersionNo DESC', [templateId]);
        const details = [];
        for (const version of versions) details.push(await loadVersion(version.id));
        res.json({ success: true, data: { template, versions: details } });
    } catch (error) { return checklistError(res, error, 'detail'); }
});

router.post('/admin/checklists', isAdmin, async (req, res) => {
    const code = cleanText(req.body?.templateCode, 50).toUpperCase();
    const name = cleanText(req.body?.templateName, 160);
    const description = cleanText(req.body?.description, 2000) || null;
    const effectiveFrom = normalizeIsoDate(req.body?.effectiveFrom || bangkokIsoDate(), { required: true });
    if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code) || !name || !effectiveFrom) return res.status(400).json({ success: false, message: 'Template code, name, and valid effective date are required.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [templateResult] = await conn.query('INSERT INTO BBS_Checklist_Templates(TemplateCode,TemplateName,Description,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?)', [code, name, description, actorId(req), actorId(req)]);
        const [versionResult] = await conn.query("INSERT INTO BBS_Checklist_Versions(TemplateID,VersionNo,Status,EffectiveFrom,CreatedBy,UpdatedBy) VALUES(?,1,'Draft',?,?,?)", [templateResult.insertId, effectiveFrom, actorId(req), actorId(req)]);
        await conn.commit();
        await logAudit(req, { action: 'BBS_CHECKLIST_CREATE', module: 'bbs', targetType: 'BBS_Checklist_Template', targetId: templateResult.insertId, detail: `${code}; draftVersion=${versionResult.insertId}` });
        res.status(201).json({ success: true, data: { templateId: templateResult.insertId, versionId: versionResult.insertId }, message: 'Checklist template and first draft created.' });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Template code already exists.' });
        return checklistError(res, error, 'create');
    } finally { conn.release(); }
});

router.put('/admin/checklists/:templateId/status', isAdmin, async (req, res) => {
    const templateId = positiveInt(req.params.templateId);
    const isActive = req.body?.isActive === false || Number(req.body?.isActive) === 0 ? 0 : 1;
    if (!templateId) return res.status(400).json({ success: false, message: 'Invalid checklist template ID.' });
    try {
        const [result] = await db.query('UPDATE BBS_Checklist_Templates SET IsActive=?,UpdatedBy=? WHERE id=?', [isActive, actorId(req), templateId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Checklist template was not found.' });
        await logAudit(req, { action: 'BBS_CHECKLIST_TEMPLATE_STATUS', module: 'bbs', targetType: 'BBS_Checklist_Template', targetId: templateId, detail: `active=${isActive}` });
        res.json({ success: true, data: { templateId, isActive }, message: isActive ? 'Checklist template activated.' : 'Checklist template deactivated without deleting versions.' });
    } catch (error) { return checklistError(res, error, 'template status'); }
});

router.put('/admin/checklist-versions/:versionId', isAdmin, async (req, res) => {
    const versionId = positiveInt(req.params.versionId);
    const validation = validateDraftPayload(req.body || {});
    if (!versionId || !validation.ok) return res.status(400).json({ success: false, message: validation.message || 'Invalid version ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[version]] = await conn.query('SELECT * FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE', [versionId]);
        if (!version) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Checklist version was not found.' }); }
        if (version.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_VERSION', message: 'Published or archived checklist versions are immutable. Clone the version to edit it.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(version.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This draft changed in another session. Reload before saving.' }); }
        const masterError = await validateMasterScopes(conn, validation.scopes);
        if (masterError) { await conn.rollback(); return res.status(400).json({ success: false, message: masterError }); }
        await conn.query('DELETE FROM BBS_Checklist_Scope_Mappings WHERE VersionID=?', [versionId]);
        await conn.query('DELETE FROM BBS_Checklist_Categories WHERE VersionID=?', [versionId]);
        for (const category of validation.categories) {
            const [categoryResult] = await conn.query('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)', [versionId, category.name, category.sortOrder]);
            for (const item of category.items) await conn.query(
                'INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)',
                [categoryResult.insertId, item.code, item.prompt, item.responseType, item.helpText, item.sortOrder, item.isRequired, item.unsafeRequiresRemark, item.unsafeRequiresPhoto, item.unsafeRequiresAction]);
        }
        for (const scope of validation.scopes) await conn.query(
            'INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,1)',
            [versionId, scope.departmentId, scope.safetyUnitId, scope.positionId, scope.bbsLevel, scope.priority]);
        await conn.query('UPDATE BBS_Checklist_Versions SET EffectiveFrom=?,EffectiveTo=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?', [validation.from, validation.to, actorId(req), versionId]);
        await conn.commit();
        await logAudit(req, { action: 'BBS_CHECKLIST_DRAFT_SAVE', module: 'bbs', targetType: 'BBS_Checklist_Version', targetId: versionId, detail: `categories=${validation.categories.length}; items=${validation.itemCount}; scopes=${validation.scopes.length}` });
        res.json({ success: true, data: await loadVersion(versionId), message: 'Checklist draft saved.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return checklistError(res, error, 'save draft'); } finally { conn.release(); }
});

router.post('/admin/checklist-versions/:versionId/import-preview', isAdmin, async (req, res) => {
    const versionId = positiveInt(req.params.versionId);
    const preview = buildImportPreview(req.body || {});
    if (!versionId || !preview.ok) return res.status(400).json({ success: false, code: 'CHECKLIST_IMPORT_INVALID', message: preview.message || 'Invalid version ID.' });
    try {
        const [[version]] = await db.query('SELECT Status,RowVersion FROM BBS_Checklist_Versions WHERE id=? LIMIT 1', [versionId]);
        if (!version) return res.status(404).json({ success: false, message: 'Checklist version was not found.' });
        if (version.Status !== 'Draft') return res.status(409).json({ success: false, code: 'IMMUTABLE_VERSION', message: 'Only a Draft version can receive imported data.' });
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(version.RowVersion)) return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This draft changed in another session. Reload before importing.' });
        const masterError = await validateMasterScopes(db, preview.scopes);
        if (masterError) return res.status(400).json({ success: false, code: 'CHECKLIST_IMPORT_INVALID', message: masterError });
        res.json({ success: true, data: { summary: preview.summary, normalized: preview.normalized, rowVersion: Number(version.RowVersion) }, message: 'Checklist import preview is valid. No data has been changed.' });
    } catch (error) { return checklistError(res, error, 'import preview'); }
});

router.post('/admin/checklist-versions/:versionId/import', isAdmin, async (req, res) => {
    const versionId = positiveInt(req.params.versionId);
    const preview = buildImportPreview(req.body || {});
    if (!versionId || !preview.ok) return res.status(400).json({ success: false, code: 'CHECKLIST_IMPORT_INVALID', message: preview.message || 'Invalid version ID.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ success: false, code: 'IMPORT_CONFIRMATION_REQUIRED', message: 'Preview and confirm the checklist import before saving.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[version]] = await conn.query('SELECT Status,RowVersion FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE', [versionId]);
        if (!version) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Checklist version was not found.' }); }
        if (version.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_VERSION', message: 'Only a Draft version can receive imported data.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(version.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This draft changed after preview. Reload and preview the file again.' }); }
        const masterError = await validateMasterScopes(conn, preview.scopes);
        if (masterError) { await conn.rollback(); return res.status(400).json({ success: false, code: 'CHECKLIST_IMPORT_INVALID', message: masterError }); }
        await replaceDraftContents(conn, versionId, preview, actorId(req));
        await conn.commit();
        await logAudit(req, { action: 'BBS_CHECKLIST_IMPORT', module: 'bbs', targetType: 'BBS_Checklist_Version', targetId: versionId, detail: `categories=${preview.summary.categoryCount}; items=${preview.summary.itemCount}; scopes=${preview.summary.scopeCount}` });
        res.json({ success: true, data: await loadVersion(versionId), summary: preview.summary, message: 'Checklist imported atomically into the Draft version.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return checklistError(res, error, 'import'); } finally { conn.release(); }
});

router.post('/admin/checklist-versions/:versionId/publish', isAdmin, async (req, res) => {
    const versionId = positiveInt(req.params.versionId);
    if (!versionId) return res.status(400).json({ success: false, message: 'Invalid version ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[version]] = await conn.query('SELECT * FROM BBS_Checklist_Versions WHERE id=? LIMIT 1 FOR UPDATE', [versionId]);
        if (!version) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Checklist version was not found.' }); }
        if (version.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_VERSION', message: 'Only a Draft version can be published.' }); }
        const [[counts]] = await conn.query(`SELECT (SELECT COUNT(*) FROM BBS_Checklist_Categories WHERE VersionID=?) Categories,(SELECT COUNT(*) FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=?) Items,(SELECT COUNT(*) FROM BBS_Checklist_Scope_Mappings WHERE VersionID=? AND IsActive=1) Scopes`, [versionId, versionId, versionId]);
        if (!Number(counts.Categories) || !Number(counts.Items) || !Number(counts.Scopes)) { await conn.rollback(); return res.status(400).json({ success: false, message: 'Save at least one category, item, and scope before publishing.' }); }
        const [mine] = await conn.query('SELECT * FROM BBS_Checklist_Scope_Mappings WHERE VersionID=? AND IsActive=1', [versionId]);
        const [otherScopes] = await conn.query(`SELECT s.*,v.id VersionID FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published' WHERE s.IsActive=1 AND v.EffectiveFrom<=COALESCE(?,'9999-12-31') AND COALESCE(v.EffectiveTo,'9999-12-31')>=?`, [version.EffectiveTo, version.EffectiveFrom]);
        const conflicts = detectPublishConflicts(mine, otherScopes);
        if (conflicts.length) { await conn.rollback(); return res.status(409).json({ success: false, code: 'CHECKLIST_CONFLICT', message: 'A published checklist has an overlapping scope with equal specificity and priority.', conflicts }); }
        await conn.query("UPDATE BBS_Checklist_Versions SET Status='Published',PublishedAt=NOW(),PublishedBy=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?", [actorId(req), actorId(req), versionId]);
        await conn.commit();
        await logAudit(req, { action: 'BBS_CHECKLIST_PUBLISH', module: 'bbs', targetType: 'BBS_Checklist_Version', targetId: versionId, detail: `version=${version.VersionNo}` });
        res.json({ success: true, data: await loadVersion(versionId), message: 'Checklist version published and is now immutable.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return checklistError(res, error, 'publish'); } finally { conn.release(); }
});

router.post('/admin/checklist-versions/:versionId/clone', isAdmin, async (req, res) => {
    const versionId = positiveInt(req.params.versionId); const conn = await db.getConnection();
    if (!versionId) return res.status(400).json({ success: false, message: 'Invalid version ID.' });
    try {
        await conn.beginTransaction();
        const source = await loadVersion(versionId, conn);
        if (!source) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Checklist version was not found.' }); }
        await conn.query('SELECT id FROM BBS_Checklist_Templates WHERE id=? LIMIT 1 FOR UPDATE', [source.TemplateID]);
        const [[latest]] = await conn.query('SELECT MAX(VersionNo) MaxVersion FROM BBS_Checklist_Versions WHERE TemplateID=?', [source.TemplateID]);
        const [created] = await conn.query("INSERT INTO BBS_Checklist_Versions(TemplateID,VersionNo,Status,EffectiveFrom,EffectiveTo,CreatedBy,UpdatedBy) VALUES(?,?,'Draft',?,?,?,?)", [source.TemplateID, Number(latest.MaxVersion || 0) + 1, req.body?.effectiveFrom || bangkokIsoDate(), null, actorId(req), actorId(req)]);
        for (const category of source.categories) {
            const [cat] = await conn.query('INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,?,?)', [created.insertId, category.CategoryName, category.SortOrder]);
            for (const item of category.items) await conn.query('INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,ResponseType,HelpText,SortOrder,IsRequired,UnsafeRequiresRemark,UnsafeRequiresPhoto,UnsafeRequiresAction) VALUES(?,?,?,?,?,?,?,?,?,?)', [cat.insertId,item.ItemCode,item.ItemPrompt,item.ResponseType,item.HelpText,item.SortOrder,item.IsRequired,item.UnsafeRequiresRemark,item.UnsafeRequiresPhoto,item.UnsafeRequiresAction]);
        }
        for (const scope of source.scopes) await conn.query('INSERT INTO BBS_Checklist_Scope_Mappings(VersionID,DepartmentID,SafetyUnitID,PositionID,BBSLevel,Priority,IsActive) VALUES(?,?,?,?,?,?,?)', [created.insertId,scope.DepartmentID,scope.SafetyUnitID,scope.PositionID,scope.BBSLevel,scope.Priority,scope.IsActive]);
        await conn.commit(); await logAudit(req,{action:'BBS_CHECKLIST_CLONE',module:'bbs',targetType:'BBS_Checklist_Version',targetId:created.insertId,detail:`source=${versionId}`});
        res.status(201).json({success:true,data:await loadVersion(created.insertId),message:'Checklist cloned as a new Draft version.'});
    } catch(error){try{await conn.rollback();}catch(_){} return checklistError(res,error,'clone');}finally{conn.release();}
});

router.post('/admin/checklist-versions/:versionId/archive', isAdmin, async (req,res)=>{
    const versionId=positiveInt(req.params.versionId); if(!versionId)return res.status(400).json({success:false,message:'Invalid version ID.'});
    try{const [result]=await db.query("UPDATE BBS_Checklist_Versions SET Status='Archived',ArchivedAt=NOW(),ArchivedBy=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=? AND Status='Published'",[actorId(req),actorId(req),versionId]);if(!result.affectedRows)return res.status(409).json({success:false,message:'Only a Published version can be archived.'});await logAudit(req,{action:'BBS_CHECKLIST_ARCHIVE',module:'bbs',targetType:'BBS_Checklist_Version',targetId:versionId,detail:'Published version archived without deleting history.'});res.json({success:true,message:'Checklist version archived.'});}catch(error){return checklistError(res,error,'archive');}
});

router.get('/checklists/resolve', async (req,res)=>{
    const employeeId=String(req.query.employeeId||'').trim(); const asOf=normalizeIsoDate(req.query.asOf||bangkokIsoDate(),{required:true});
    if(!employeeId||!asOf)return res.status(400).json({success:false,message:'employeeId and valid asOf date are required.'});
    try{
        const [[employee]]=await db.query(`SELECT e.EmployeeID,e.EmployeeName,md.id DepartmentID,su.id SafetyUnitID,mp.id PositionID,m.BBSLevel FROM Employees e LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN Master_SafetyUnits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit)) LEFT JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=mp.id AND m.IsActive=1 WHERE e.EmployeeID=? LIMIT 1`,[employeeId]);
        if(!employee)return res.status(404).json({success:false,message:'Observed employee was not found.'});
        if(!isAdminUser(req)){const [[assignment]]=await db.query("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1",[actorId(req),employeeId,asOf,asOf]);if(!assignment)return res.status(403).json({success:false,message:'Employee is outside your active BBS assignment scope.'});}
        const [candidates]=await db.query(`SELECT s.*,v.id VersionID,v.VersionNo,v.EffectiveFrom,v.EffectiveTo,t.id TemplateID,t.TemplateCode,t.TemplateName FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published' JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1 WHERE s.IsActive=1 AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?`,[asOf,asOf]);
        const resolved=resolveCandidates(candidates,{departmentId:employee.DepartmentID,safetyUnitId:employee.SafetyUnitID,positionId:employee.PositionID,bbsLevel:employee.BBSLevel});
        if(!resolved.ok)return res.status(resolved.code==='CHECKLIST_CONFLICT'?409:404).json({success:false,...resolved});
        res.json({success:true,data:{employee,reason:resolved.reason,checklist:await loadVersion(resolved.selected.VersionID)}});
    }catch(error){return checklistError(res,error,'resolve');}
});

module.exports=router;
