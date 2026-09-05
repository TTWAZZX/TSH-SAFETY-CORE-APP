'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createPrintReceipt, readPrintReceipt, PrintReceiptError } = require('../services/bbs-card-print-receipt');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { BBS_LEVELS, bangkokIsoDate, levelRank } = require('../services/bbs-phase1');
const { clean, createRawToken, hashToken, tokenFingerprint, validRawToken, normalizeInternalRoute, cardPayload } = require('../services/bbs-card');
const { listQuery, pagination, searchText } = require('../services/bbs-list-query');

const publicRouter = express.Router();
const router = express.Router();
const templateDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-templates');
fs.mkdirSync(templateDir, { recursive: true });

const templateUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, templateDir),
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(18).toString('hex')}${({ 'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp' })[file.mimetype] || ''}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)),
});

function actorId(req) { return String(req.user?.id || req.user?.EmployeeID || '').trim(); }
function admin(req) { return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin'; }
function positiveInt(value) { return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function unlinkStored(name) { if (!name) return; const file = path.join(templateDir, path.basename(name)); if (file.startsWith(templateDir)) fs.promises.rm(file, { force:true }).catch(() => {}); }
function verifiedImageMime(filePath) {
    const head = fs.readFileSync(filePath).subarray(0, 16);
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head.length >= 8 && head.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
    if (head.subarray(0,4).toString('ascii') === 'RIFF' && head.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}
function phase4Error(res, error, label) {
    if (error instanceof PrintReceiptError) return res.status(error.status).json({success:false,code:error.code,message:error.message});
    console.error(`[bbs-phase4] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success:false, code:'BBS_CARD_SETUP_REQUIRED', message:'BBS Phase 4 database migration is required.' });
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, code:'ACTIVE_CARD_EXISTS', message:'This employee already has an Active card. Use Replace.' });
    return res.status(500).json({ success:false, message:'Unable to process the BBS card request.' });
}
async function qrLimit(ip, token) {
    const ipHash = crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:${String(ip || '')}`).digest('hex');
    const fingerprint = tokenFingerprint(token);
    const [[setting]] = await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='qr_resolve_limit_5m' LIMIT 1");
    const limit = Math.max(5, Math.min(200, Number(setting?.SettingValue || 30)));
    const [[row]] = await db.query('SELECT COUNT(*) count FROM BBS_QR_Resolve_Attempts WHERE IPHash=? AND AttemptedAt>=DATE_SUB(NOW(),INTERVAL 5 MINUTE)', [ipHash]);
    if (Number(row.count) >= limit) return { allowed:false, ipHash, fingerprint };
    return { allowed:true, ipHash, fingerprint };
}
async function recordResolve(limitState, successful) {
    await db.query('INSERT INTO BBS_QR_Resolve_Attempts(IPHash,TokenFingerprint,Successful) VALUES(?,?,?)', [limitState.ipHash, limitState.fingerprint, successful ? 1 : 0]);
    if (Math.random() < 0.02) await db.query('DELETE FROM BBS_QR_Resolve_Attempts WHERE AttemptedAt<DATE_SUB(NOW(),INTERVAL 7 DAY)').catch(() => {});
}
async function activeCardForToken(rawToken, queryable = db) {
    const [[row]] = await queryable.query(`SELECT c.*,t.Status TemplateStatus FROM BBS_Cards c JOIN BBS_Card_Templates t ON t.id=c.TemplateID WHERE c.TokenHash=? AND c.Status='Active' AND t.Status='Active' LIMIT 1`, [hashToken(rawToken)]);
    return row || null;
}
async function activeDepartmentCardForToken(rawToken, queryable = db) {
    const [[row]] = await queryable.query(`SELECT q.*,d.Name DepartmentName FROM BBS_Department_QR_Cards q JOIN Master_Departments d ON d.id=q.DepartmentID WHERE q.TokenHash=? AND q.Status='Active' LIMIT 1`, [hashToken(rawToken)]);
    return row || null;
}
async function canUseCardTarget(req, card, queryable = db) {
    const userId = actorId(req);
    if (admin(req) || String(card.EmployeeID).toLowerCase() === userId.toLowerCase()) return true;
    const asOf = bangkokIsoDate();
    const [[row]] = await queryable.query(`SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND (EffectiveTo IS NULL OR EffectiveTo>=?) LIMIT 1`, [userId, card.EmployeeID, asOf, asOf]);
    return Boolean(row);
}
async function employeeCardData(employeeIds, queryable = db) {
    if (!employeeIds.length) return [];
    const placeholders = employeeIds.map(() => '?').join(',');
    const [rows] = await queryable.query(`SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,md.id DepartmentID FROM Employees e LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 WHERE e.EmployeeID IN (${placeholders})`, employeeIds);
    return rows.map(row => ({ ...row, PhotoUrl:'' }));
}
function templateMatches(template, employee) {
    return (!template.DepartmentID || Number(template.DepartmentID) === Number(employee.DepartmentID))
        && (!template.BBSLevel || String(template.BBSLevel) === String(employee.BBSLevel));
}
function appBase(req) {
    const configured = clean(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.FRONTEND_URL || '', 500);
    if (configured) return configured;
    const origin = clean(req.get('origin') || '', 500);
    if (/^https?:\/\/[A-Za-z0-9.:[\]-]+$/.test(origin)) return `${origin}/index.html`;
    return `${req.protocol}://${req.get('host')}/index.html`;
}
async function designerRenderingEnabled(queryable=db){const [[row]]=await queryable.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='visual_card_designer_rendering_enabled' LIMIT 1");return String(row?.SettingValue||'0')==='1';}
async function issueWithin(connection, req, employee, template, reason) {
    const rawToken = createRawToken();
    const [result] = await connection.query(`INSERT INTO BBS_Cards(EmployeeID,TemplateID,TokenHash,TokenFingerprint,Status,IssueReason,IssuedBy) VALUES(?,?,?,?,'Active',?,?)`, [employee.EmployeeID, template.id, hashToken(rawToken), tokenFingerprint(rawToken), reason || null, actorId(req)]);
    const payload={ cardId:Number(result.insertId), rawToken, ...cardPayload(employee, template, rawToken, appBase(req)) };
    const designerRender=await personalDesignerRender(connection, employee, template, payload, rawToken, actorId(req));
    return designerRender ? { ...payload, designerRender } : payload;
}

function safeDesignerLayout(version,sides,elements,assets){
    const assetByStored=new Map(assets.map(asset=>[String(asset.StoredName),Number(asset.id)]));
    return { layoutVersionId:Number(version.id),versionNo:Number(version.VersionNo),widthMM:Number(version.WidthMM),heightMM:Number(version.HeightMM),dpi:Number(version.DPI),duplexFlip:String(version.DuplexFlip),backRotation:Number(version.BackRotation),sides:sides.map(side=>({side:String(side.Side),storageClass:String(side.StorageClass),backgroundAssetId:side.StorageClass==='DesignerAsset'?(assetByStored.get(String(side.BackgroundStoredName))||null):null,backgroundUrl:`/bbs/admin/card-designer/versions/${Number(version.id)}/sides/${String(side.Side).toLowerCase()}/background`,backgroundFit:String(side.BackgroundFit),backgroundPositionXBP:Number(side.BackgroundPositionXBP),backgroundPositionYBP:Number(side.BackgroundPositionYBP),bleedMM:Number(side.BleedMM),safeMarginMM:Number(side.SafeMarginMM)})),elements:elements.map(element=>({elementKey:String(element.ElementKey),side:String(element.Side),elementType:String(element.ElementType),dataSourceKey:element.DataSourceKey||null,staticText:element.StaticText||null,assetId:element.AssetID==null?null:Number(element.AssetID),assetUrl:element.AssetID==null?null:`/bbs/admin/card-designer/assets/${Number(element.AssetID)}/file`,xBP:Number(element.XBP),yBP:Number(element.YBP),widthBP:Number(element.WidthBP),heightBP:Number(element.HeightBP),rotationDeg:Number(element.RotationDeg),zIndex:Number(element.ZIndex),visible:Boolean(element.Visible),style:JSON.parse(element.StyleJSON||'{}')})),assets:assets.map(asset=>({id:Number(asset.id),assetKey:String(asset.AssetKey),originalName:String(asset.OriginalName),mimeType:String(asset.MimeType)}))};
}
async function activePersonalDesignerLayout(queryable,templateId){
    try{const [[version]]=await queryable.query("SELECT * FROM BBS_Card_Layout_Versions WHERE PersonalTemplateID=? AND TemplateKind='Personal' AND Status='Active' LIMIT 1",[templateId]);if(!version)return null;const[sides]=await queryable.query("SELECT * FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=? ORDER BY FIELD(Side,'Front','Back')",[version.id]);const[elements]=await queryable.query("SELECT * FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=? ORDER BY FIELD(Side,'Front','Back'),ZIndex,id",[version.id]);const[assets]=await queryable.query("SELECT * FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=? AND Status='Active' ORDER BY id",[version.id]);return safeDesignerLayout(version,sides,elements,assets);}catch(error){if(error?.code==='ER_NO_SUCH_TABLE')return null;throw error;}
}
async function personalDesignerRender(queryable,employee,template,card,rawToken,actor){
    if(!await designerRenderingEnabled(queryable))return null;
    const layout=await activePersonalDesignerLayout(queryable,template.id);if(!layout)return null;
    const values={'employee.full_name':String(employee.EmployeeName||''),'employee.id':String(employee.EmployeeID||''),'employee.department':String(employee.Department||''),'employee.safety_unit':String(employee.Unit||''),'employee.position':String(employee.Position||''),'employee.bbs_level':String(employee.BBSLevel||''),'employee.photo':'','card.personal_qr':String(card.qrUrl||''),'card.issue_date':bangkokIsoDate(),'template.name':String(template.TemplateName||''),'organization.name':'Thai Summit Harness Co., Ltd.','organization.logo':''};
    const safeSnapshot={layout,values:{...values,'card.personal_qr':{kind:'PersonalQr',fingerprint:tokenFingerprint(rawToken)}}};
    return {layout,values,printSnapshot:{layoutVersionId:layout.layoutVersionId,renderContractHash:crypto.createHash('sha256').update(JSON.stringify(safeSnapshot)).digest('hex'),snapshot:safeSnapshot,receipt:createPrintReceipt({kind:'Personal',subjectId:card.cardId,actorId:actor,snapshot:safeSnapshot})}};
}
publicRouter.post('/qr/resolve', async (req, res) => {
    try {
        const token = String(req.body?.token || '');
        const limiter = await qrLimit(req.ip || req.headers['x-forwarded-for'], token);
        if (!limiter.allowed) return res.status(429).json({ success:false, code:'QR_RATE_LIMITED', message:'Too many QR attempts. Please try again later.' });
        if (!validRawToken(token)) { await recordResolve(limiter, false); return res.status(404).json({ success:false, code:'QR_NOT_ACTIVE', message:'This BBS QR is not active.' }); }
        const card = await activeCardForToken(token);
        const departmentCard = card ? null : await activeDepartmentCardForToken(token);
        await recordResolve(limiter, Boolean(card || departmentCard));
        if (!card && !departmentCard) return res.status(404).json({ success:false, code:'QR_NOT_ACTIVE', message:'This BBS QR is not active.' });
        if (card) await db.query('UPDATE BBS_Cards SET LastResolvedAt=NOW(),ResolveCount=ResolveCount+1 WHERE id=?', [card.id]);
        else await db.query('UPDATE BBS_Department_QR_Cards SET LastResolvedAt=NOW(),ResolveCount=ResolveCount+1 WHERE id=?', [departmentCard.id]);
        return res.json({ success:true, data:{ active:true, route:'#bbs-smart-card', requiresLogin:true } });
    } catch (error) { return phase4Error(res, error, 'public QR resolve'); }
});

router.post('/qr/claim', async (req, res) => {
    try {
        const token = String(req.body?.token || '');
        if (!validRawToken(token)) return res.status(404).json({ success:false, code:'QR_NOT_ACTIVE', message:'This BBS QR is not active.' });
        const card = await activeCardForToken(token);
        const departmentCard = card ? null : await activeDepartmentCardForToken(token);
        if (!card && !departmentCard) return res.status(404).json({ success:false, code:'QR_NOT_ACTIVE', message:'This BBS QR is not active.' });
        if (departmentCard) {
            const [[employee]] = await db.query(`SELECT e.EmployeeID,d.id DepartmentID FROM Employees e LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department)) WHERE e.EmployeeID=? LIMIT 1`, [actorId(req)]);
            if (!admin(req) && Number(employee?.DepartmentID) !== Number(departmentCard.DepartmentID)) return res.status(403).json({ success:false, code:'QR_SCOPE_DENIED', message:'This Community QR belongs to another Department.' });
            return res.json({ success:true, data:{ mode:'community', route:normalizeInternalRoute(req.body?.returnRoute), departmentId:Number(departmentCard.DepartmentID), departmentName:departmentCard.DepartmentName } });
        }
        if (!await canUseCardTarget(req, card)) return res.status(403).json({ success:false, code:'QR_SCOPE_DENIED', message:'You do not have permission to use this employee card.' });
        const [employee] = await employeeCardData([card.EmployeeID]);
        if (!employee) return res.status(404).json({ success:false, message:'Card owner is no longer available.' });
        const self = String(card.EmployeeID).toLowerCase() === actorId(req).toLowerCase();
        return res.json({ success:true, data:{ mode:self ? 'workspace' : 'observation', route:normalizeInternalRoute(req.body?.returnRoute), employee:self ? null : employee } });
    } catch (error) { return phase4Error(res, error, 'QR claim'); }
});

router.get('/admin/card-templates', isAdmin, async (_req, res) => {
    try { const [rows] = await db.query(`SELECT t.*,d.Name DepartmentName FROM BBS_Card_Templates t LEFT JOIN Master_Departments d ON d.id=t.DepartmentID ORDER BY FIELD(t.Status,'Active','Draft','Archived'),t.UpdatedAt DESC,t.id DESC`); return res.json({ success:true, data:rows }); }
    catch (error) { return phase4Error(res, error, 'template list'); }
});

router.post('/admin/card-templates', isAdmin, templateUpload.single('template'), async (req, res) => {
    let persisted = false;
    try {
        if (!req.file) return res.status(400).json({ success:false, message:'A JPG, PNG, or WebP card template is required.' });
        const actualMime = verifiedImageMime(req.file.path);
        if (!actualMime || actualMime !== req.file.mimetype) { unlinkStored(req.file.filename); return res.status(400).json({ success:false, message:'Template file content does not match its image type.' }); }
        const name = clean(req.body?.templateName, 160); const departmentId = positiveInt(req.body?.departmentId); const level = clean(req.body?.bbsLevel, 40) || null;
        if (!name) { unlinkStored(req.file.filename); return res.status(400).json({ success:false, message:'Template name is required.' }); }
        if (level && !BBS_LEVELS.includes(level)) { unlinkStored(req.file.filename); return res.status(400).json({ success:false, message:'BBS level is invalid.' }); }
        if (departmentId) { const [[dept]] = await db.query('SELECT id FROM Master_Departments WHERE id=? LIMIT 1',[departmentId]); if (!dept) { unlinkStored(req.file.filename); return res.status(400).json({success:false,message:'Department is invalid.'}); } }
        const [result] = await db.query(`INSERT INTO BBS_Card_Templates(TemplateName,DepartmentID,BBSLevel,BackgroundStoredName,OriginalName,MimeType,FileSize,IncludeEmployeeID,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?)`, [name,departmentId,level,req.file.filename,clean(req.file.originalname),actualMime,req.file.size,String(req.body?.includeEmployeeId) === '0' ? 0 : 1,actorId(req),actorId(req)]);
        persisted = true; await logAudit(req,{action:'BBS_CARD_TEMPLATE_CREATE',module:'bbs',targetType:'BBS_Card_Template',targetId:result.insertId,detail:'Created Draft BBS card template.'});
        const [[row]] = await db.query('SELECT * FROM BBS_Card_Templates WHERE id=?',[result.insertId]); return res.status(201).json({success:true,data:row});
    } catch (error) { if (req.file && !persisted) unlinkStored(req.file.filename); return phase4Error(res,error,'template create'); }
});

router.get('/admin/card-templates/:id/file', isAdmin, async (req,res) => {
    try { const id=positiveInt(req.params.id); const [[row]]=await db.query('SELECT BackgroundStoredName,OriginalName,MimeType FROM BBS_Card_Templates WHERE id=? LIMIT 1',[id]); if(!row)return res.status(404).json({success:false,message:'Template was not found.'}); const file=path.join(templateDir,path.basename(row.BackgroundStoredName)); if(!file.startsWith(templateDir)||!fs.existsSync(file))return res.status(404).json({success:false,message:'Template file was not found.'}); res.setHeader('Content-Type',row.MimeType);res.setHeader('Content-Disposition',`inline; filename="${clean(row.OriginalName).replace(/["\\]/g,'_')}"`);res.setHeader('Cache-Control','private, no-store');return res.sendFile(file); }
    catch(error){return phase4Error(res,error,'template file');}
});

router.put('/admin/card-templates/:id', isAdmin, async (req,res) => {
    const connection=await db.getConnection();
    try { const id=positiveInt(req.params.id),version=positiveInt(req.body?.rowVersion); if(!id||!version)return res.status(400).json({success:false,message:'Valid template ID and RowVersion are required.'}); await connection.beginTransaction(); const [[row]]=await connection.query('SELECT * FROM BBS_Card_Templates WHERE id=? FOR UPDATE',[id]); if(!row){await connection.rollback();return res.status(404).json({success:false,message:'Template was not found.'});} if(Number(row.RowVersion)!==version){await connection.rollback();return res.status(409).json({success:false,code:'VERSION_CONFLICT',message:'Template was changed by another user.'});}
        const action=clean(req.body?.action,20).toLowerCase(); if(!['activate','archive'].includes(action)){await connection.rollback();return res.status(400).json({success:false,message:'Action must be activate or archive.'});}
        if(action==='activate'){if(row.Status==='Archived'){await connection.rollback();return res.status(409).json({success:false,message:'Archived templates cannot be activated.'});} await connection.query(`UPDATE BBS_Card_Templates SET Status='Archived',ArchivedAt=NOW(),ArchivedBy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE Status='Active' AND id<>? AND DepartmentID <=> ? AND BBSLevel <=> ?`,[actorId(req),actorId(req),id,row.DepartmentID,row.BBSLevel]);await connection.query(`UPDATE BBS_Card_Templates SET Status='Active',ActivatedAt=NOW(),ActivatedBy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?`,[actorId(req),actorId(req),id]);}
        else {await connection.query(`UPDATE BBS_Card_Templates SET Status='Archived',ArchivedAt=NOW(),ArchivedBy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?`,[actorId(req),actorId(req),id]);}
        await connection.commit(); await logAudit(req,{action:action==='activate'?'BBS_CARD_TEMPLATE_ACTIVATE':'BBS_CARD_TEMPLATE_ARCHIVE',module:'bbs',targetType:'BBS_Card_Template',targetId:id,detail:`${action} card template.`}); const[[updated]]=await db.query('SELECT * FROM BBS_Card_Templates WHERE id=?',[id]);return res.json({success:true,data:updated});
    } catch(error){await connection.rollback().catch(()=>{});return phase4Error(res,error,'template transition');} finally{connection.release();}
});

router.get('/admin/card-employees', isAdmin, async (req,res) => {
    try {const paging=listQuery(req.query,{defaultPageSize:24}),q=searchText(req.query.q),departmentId=positiveInt(req.query.departmentId),where=["FIELD(m.BBSLevel,'Operator','Group Leader','Department Head','Section Head','Manager')>=2"],params=[];if(departmentId){where.push('md.id=?');params.push(departmentId);}if(q){where.push('(e.EmployeeID LIKE ? OR e.EmployeeName LIKE ? OR e.Department LIKE ? OR e.Unit LIKE ? OR e.Position LIKE ?)');params.push(...Array(5).fill(`%${q}%`));}const from=`FROM Employees e JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN BBS_Cards c ON c.id=(SELECT x.id FROM BBS_Cards x WHERE x.EmployeeID=e.EmployeeID AND x.Status='Active' ORDER BY x.id DESC LIMIT 1) WHERE ${where.join(' AND ')}`;const select=`SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,md.id DepartmentID,c.id ActiveCardID,c.TokenFingerprint,c.IssuedAt ${from}`;if(!paging.paged){const[rows]=await db.query(`${select} ORDER BY e.Department,e.Unit,e.EmployeeName`,params);return res.json({success:true,data:rows});}const[[countRow]]=await db.query(`SELECT COUNT(*) total ${from}`,params),meta=pagination(countRow?.total,paging.page,paging.pageSize),offset=(meta.page-1)*meta.pageSize;const[rows]=await db.query(`${select} ORDER BY e.Department,e.Unit,e.EmployeeName LIMIT ? OFFSET ?`,[...params,meta.pageSize,offset]);return res.json({success:true,data:{rows,pagination:meta}});}
    catch(error){return phase4Error(res,error,'card employees');}
});

router.get('/admin/cards', isAdmin, async (req,res) => {
    try {const paging=listQuery(req.query),q=searchText(req.query.q),departmentId=positiveInt(req.query.departmentId),status=['Active','Revoked','Replaced'].includes(String(req.query.status))?String(req.query.status):null,where=['1=1'],params=[];if(status){where.push('c.Status=?');params.push(status);}if(departmentId){where.push('md.id=?');params.push(departmentId);}if(q){where.push('(c.EmployeeID LIKE ? OR e.EmployeeName LIKE ? OR e.Department LIKE ? OR e.Unit LIKE ? OR e.Position LIKE ? OR t.TemplateName LIKE ? OR c.TokenFingerprint LIKE ?)');params.push(...Array(7).fill(`%${q}%`));}const from=`FROM BBS_Cards c JOIN Employees e ON e.EmployeeID=c.EmployeeID JOIN BBS_Card_Templates t ON t.id=c.TemplateID LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) WHERE ${where.join(' AND ')}`,select=`SELECT c.id,c.EmployeeID,c.TemplateID,c.TokenFingerprint,c.Status,c.IssueReason,c.IssuedAt,c.IssuedBy,c.RevokedAt,c.RevokedBy,c.RevokeReason,c.ReplacedByCardID,c.ResolveCount,e.EmployeeName,e.Department,e.Unit,e.Position,t.TemplateName ${from}`;if(!paging.paged){const[rows]=await db.query(`${select} ORDER BY c.IssuedAt DESC,c.id DESC LIMIT 500`,params);return res.json({success:true,data:rows});}const[[countRow]]=await db.query(`SELECT COUNT(*) total ${from}`,params),meta=pagination(countRow?.total,paging.page,paging.pageSize),offset=(meta.page-1)*meta.pageSize;const[rows]=await db.query(`${select} ORDER BY c.IssuedAt DESC,c.id DESC LIMIT ? OFFSET ?`,[...params,meta.pageSize,offset]);return res.json({success:true,data:{rows,pagination:meta}});}
    catch(error){return phase4Error(res,error,'card list');}
});

router.post('/admin/cards/issue', isAdmin, async (req,res) => {
    const ids=[...new Set((Array.isArray(req.body?.employeeIds)?req.body.employeeIds:[]).map(value=>clean(value,50)).filter(Boolean))];const templateId=positiveInt(req.body?.templateId);const reason=clean(req.body?.reason,255);
    if(!ids.length||ids.length>100||!templateId)return res.status(400).json({success:false,message:'Choose 1-100 employees and an Active template.'});
    const connection=await db.getConnection();
    try {await connection.beginTransaction();const[[template]]=await connection.query("SELECT * FROM BBS_Card_Templates WHERE id=? AND Status='Active' FOR UPDATE",[templateId]);if(!template){await connection.rollback();return res.status(409).json({success:false,message:'The selected card template is not Active.'});}const employees=await employeeCardData(ids,connection);if(employees.length!==ids.length){await connection.rollback();return res.status(400).json({success:false,message:'One or more employees were not found.'});}for(const employee of employees){if(levelRank(employee.BBSLevel)<levelRank('Group Leader')){await connection.rollback();return res.status(400).json({success:false,message:`Personal cards are available from Group Leader level upward (${employee.EmployeeID}).`});}if(!templateMatches(template,employee)){await connection.rollback();return res.status(400).json({success:false,message:`Template scope does not match employee ${employee.EmployeeID}.`});}const[[active]]=await connection.query("SELECT id FROM BBS_Cards WHERE EmployeeID=? AND Status='Active' LIMIT 1",[employee.EmployeeID]);if(active){await connection.rollback();return res.status(409).json({success:false,code:'ACTIVE_CARD_EXISTS',message:`Employee ${employee.EmployeeID} already has an Active card. Use Replace.`});}}
        const cards=[];for(const employee of employees)cards.push(await issueWithin(connection,req,employee,template,reason));await connection.commit();await logAudit(req,{action:'BBS_CARD_ISSUE',module:'bbs',targetType:'BBS_Card_Batch',targetId:cards.map(c=>c.cardId).join(','),detail:`Issued ${cards.length} BBS card(s).`,metadata:{count:cards.length,templateId}});return res.status(201).json({success:true,data:cards});
    }catch(error){await connection.rollback().catch(()=>{});return phase4Error(res,error,'card issue');}finally{connection.release();}
});

router.post('/admin/cards/:id/revoke', isAdmin, async (req,res) => {
    try {const id=positiveInt(req.params.id),reason=clean(req.body?.reason,255);if(!id||!reason)return res.status(400).json({success:false,message:'Card ID and revoke reason are required.'});const[result]=await db.query("UPDATE BBS_Cards SET Status='Revoked',RevokedAt=NOW(),RevokedBy=?,RevokeReason=? WHERE id=? AND Status='Active'",[actorId(req),reason,id]);if(!result.affectedRows)return res.status(409).json({success:false,message:'Only an Active card can be revoked.'});await logAudit(req,{action:'BBS_CARD_REVOKE',module:'bbs',targetType:'BBS_Card',targetId:id,detail:'Revoked BBS card.',metadata:{reason}});return res.json({success:true});}catch(error){return phase4Error(res,error,'card revoke');}
});

router.post('/admin/cards/:id/replace', isAdmin, async (req,res) => {
    const id=positiveInt(req.params.id),reason=clean(req.body?.reason,255)||'Replace / reprint';if(!id)return res.status(400).json({success:false,message:'Valid card ID is required.'});const connection=await db.getConnection();
    try{await connection.beginTransaction();const[[old]]=await connection.query("SELECT c.id CardID,c.EmployeeID,c.TemplateID,t.TemplateName,t.DepartmentID,t.BBSLevel,t.WidthMM,t.HeightMM,t.IncludeEmployeeID,t.Status TemplateStatus FROM BBS_Cards c JOIN BBS_Card_Templates t ON t.id=c.TemplateID WHERE c.id=? AND c.Status='Active' FOR UPDATE",[id]);if(!old){await connection.rollback();return res.status(409).json({success:false,message:'Only an Active card can be replaced.'});}if(old.TemplateStatus!=='Active'){await connection.rollback();return res.status(409).json({success:false,message:'The card template is not Active.'});}const[employee]=await employeeCardData([old.EmployeeID],connection);if(!employee){await connection.rollback();return res.status(404).json({success:false,message:'Employee was not found.'});}if(levelRank(employee.BBSLevel)<levelRank('Group Leader')){await connection.rollback();return res.status(409).json({success:false,message:'The employee is no longer eligible for a personal BBS card.'});}const template={...old,id:old.TemplateID,Status:old.TemplateStatus};await connection.query("UPDATE BBS_Cards SET Status='Replaced',RevokedAt=NOW(),RevokedBy=?,RevokeReason=? WHERE id=?",[actorId(req),reason,id]);const replacement=await issueWithin(connection,req,employee,template,reason);await connection.query('UPDATE BBS_Cards SET ReplacedByCardID=? WHERE id=?',[replacement.cardId,id]);await connection.commit();await logAudit(req,{action:'BBS_CARD_REPLACE',module:'bbs',targetType:'BBS_Card',targetId:id,detail:'Replaced BBS card and rotated QR token.',metadata:{replacementCardId:replacement.cardId,reason}});return res.status(201).json({success:true,data:replacement});}catch(error){await connection.rollback().catch(()=>{});return phase4Error(res,error,'card replace');}finally{connection.release();}
});

router.post('/admin/cards/print-log', isAdmin, async (req, res) => {
    const ids=[...new Set((Array.isArray(req.body?.cardIds)?req.body.cardIds:[]).map(positiveInt).filter(Boolean))];
    const mode=ids.length>1?'batch':'single',reason=clean(req.body?.reason,255);
    if(!ids.length||ids.length>100)return res.status(400).json({success:false,message:'Choose 1-100 cards.'});
    const receipts=new Map();
    const supplied=req.body?.designerReceipts;
    if(supplied!==undefined && (!Array.isArray(supplied)||supplied.length>ids.length))return res.status(400).json({success:false,message:'Invalid prepared card receipts.'});
    for(const entry of supplied||[]){const id=positiveInt(entry?.cardId);if(!ids.includes(id)||receipts.has(id)||typeof entry?.receipt!=='string')return res.status(400).json({success:false,message:'Invalid prepared card receipts.'});receipts.set(id,entry.receipt);}
    const connection=await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows]=await connection.query('SELECT id,TokenFingerprint FROM BBS_Cards WHERE id IN ('+ids.map(()=>'?').join(',')+') FOR UPDATE',ids);
        if(rows.length!==ids.length){await connection.rollback();return res.status(400).json({success:false,message:'One or more cards were not found.'});}
        const printLogIds=[];let snapshotCount=0;
        for(const id of ids){
            const card=rows.find(row=>Number(row.id)===id);
            // A legacy caller has no signed render contract. Do not fabricate a snapshot from current Master/layout data.
            const snapshot=receipts.has(id)?readPrintReceipt(receipts.get(id),{kind:'Personal',subjectId:id,actorId:actorId(req),fingerprint:card.TokenFingerprint}):null;
            const [result]=await connection.query('INSERT INTO BBS_Card_Print_Logs(CardID,PrintMode,PrintedBy,Reason) VALUES(?,?,?,?)',[id,mode,actorId(req),reason||null]);
            printLogIds.push(Number(result.insertId));
            if(snapshot){await connection.query('INSERT INTO BBS_Card_Designer_Print_Snapshots(LayoutVersionID,PersonalPrintLogID,RenderContractHash,SnapshotJSON,RenderMetadata) VALUES(?,?,?,?,?)',[snapshot.layoutVersionId,result.insertId,snapshot.renderContractHash,snapshot.snapshotJson,JSON.stringify({renderer:'visual-card-designer',rawQrStored:false})]);snapshotCount++;}
        }
        await connection.commit();
        await logAudit(req,{action:'BBS_CARD_PRINT',module:'bbs',targetType:'BBS_Card_Batch',targetId:ids.join(','),detail:'Recorded '+mode+' card print.',metadata:{count:ids.length,designerSnapshots:snapshotCount}});
        return res.status(201).json({success:true,data:{count:ids.length,mode,printLogIds}});
    }catch(error){await connection.rollback().catch(()=>{});return phase4Error(res,error,'print log');}finally{connection.release();}
});

module.exports = router;
module.exports.publicRouter = publicRouter;
