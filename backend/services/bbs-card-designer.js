'use strict';

const KINDS = Object.freeze(['Personal', 'Department']);
const SIDES = Object.freeze(['Front', 'Back']);
const ELEMENT_TYPES = Object.freeze(['DynamicText', 'StaticText', 'DynamicImage', 'StaticImage', 'QR', 'Shape']);
const PERSONAL_FIELDS = Object.freeze([
    'employee.full_name','employee.id','employee.department','employee.safety_unit','employee.position',
    'employee.bbs_level','employee.photo','card.personal_qr','card.issue_date','template.name',
    'organization.name','organization.logo',
]);
const DEPARTMENT_FIELDS = Object.freeze([
    'department.name','department.community_qr','template.name','organization.name','organization.logo',
]);
const STYLE_KEYS = Object.freeze([
    'fontFamily','fontSizePt','fontWeight','fontStyle','textAlign','verticalAlign','color','backgroundColor',
    'borderColor','borderWidthPt','borderRadiusBP','lineHeight','letterSpacingPt','objectFit','objectPositionXBP',
    'objectPositionYBP','opacity','shapeType',
]);

class DesignerValidationError extends Error {
    constructor(message, code = 'BBS_DESIGNER_VALIDATION_FAILED') { super(message); this.code = code; }
}

function clean(value, max = 255) { return String(value == null ? '' : value).trim().slice(0, max); }
function integer(value, min, max, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new DesignerValidationError(`${label} must be an integer from ${min} to ${max}.`);
    return number;
}
function decimal(value, min, max, label, scale = 2) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw new DesignerValidationError(`${label} must be from ${min} to ${max}.`);
    return Number(number.toFixed(scale));
}
function normalizeKind(value) {
    const kind = KINDS.find(item => item.toLowerCase() === clean(value, 20).toLowerCase());
    if (!kind) throw new DesignerValidationError('Template kind must be Personal or Department.');
    return kind;
}
function fieldsFor(kind) { return kind === 'Personal' ? PERSONAL_FIELDS : DEPARTMENT_FIELDS; }
function catalog() {
    return {
        templateKinds: KINDS,
        sides: SIDES,
        elementTypes: ELEMENT_TYPES,
        dataSources: { Personal: PERSONAL_FIELDS, Department: DEPARTMENT_FIELDS },
        styleKeys: STYLE_KEYS,
        geometry: { unit:'basis-points', min:0, max:10000 },
        versionStatuses: ['Draft','Active','Archived'],
    };
}
function normalizeStyle(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const output = {};
    for (const [key, item] of Object.entries(input)) {
        if (!STYLE_KEYS.includes(key)) throw new DesignerValidationError(`Style property ${key} is not allowed.`);
        if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') throw new DesignerValidationError(`Style property ${key} has an invalid value.`);
        output[key] = typeof item === 'string' ? item.slice(0, 120) : item;
    }
    return output;
}
function normalizeSide(value) {
    const side = clean(value?.side, 10);
    if (!SIDES.includes(side)) throw new DesignerValidationError('Side must be Front or Back.');
    const storageClass = clean(value?.storageClass, 40);
    if (!['PersonalTemplate','DepartmentTemplate','DesignerAsset'].includes(storageClass)) throw new DesignerValidationError(`Storage class is invalid for ${side}.`);
    const storedName = clean(value?.backgroundStoredName, 255);
    if (!storedName || storedName !== storedName.split(/[\\/]/).pop()) throw new DesignerValidationError(`Background stored name is invalid for ${side}.`);
    const originalName = clean(value?.backgroundOriginalName, 255);
    const mimeType = clean(value?.backgroundMimeType, 80).toLowerCase();
    if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) throw new DesignerValidationError(`Background MIME type is invalid for ${side}.`);
    const fit = clean(value?.backgroundFit || 'Cover', 20);
    if (!['Contain','Cover','Stretch'].includes(fit)) throw new DesignerValidationError(`Background fit is invalid for ${side}.`);
    return {
        side, storageClass, backgroundAssetId:value?.backgroundAssetId == null ? null : integer(value.backgroundAssetId,1,Number.MAX_SAFE_INTEGER,'Background asset'), backgroundStoredName:storedName, backgroundOriginalName:originalName || storedName,
        backgroundMimeType:mimeType, backgroundFileSize:integer(value?.backgroundFileSize || 0,0,100*1024*1024,'Background file size'),
        pixelWidth:value?.pixelWidth == null ? null : integer(value.pixelWidth,1,100000,'Pixel width'),
        pixelHeight:value?.pixelHeight == null ? null : integer(value.pixelHeight,1,100000,'Pixel height'),
        backgroundFit:fit,
        backgroundPositionXBP:integer(value?.backgroundPositionXBP ?? 5000,0,10000,'Background X position'),
        backgroundPositionYBP:integer(value?.backgroundPositionYBP ?? 5000,0,10000,'Background Y position'),
        bleedMM:decimal(value?.bleedMM ?? 0,0,20,'Bleed'), safeMarginMM:decimal(value?.safeMarginMM ?? 3,0,50,'Safe margin'),
    };
}
function normalizeElement(value, kind) {
    const elementKey = clean(value?.elementKey, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(elementKey)) throw new DesignerValidationError('Element key is invalid.');
    const side = clean(value?.side,10), elementType = clean(value?.elementType,30);
    if (!SIDES.includes(side)) throw new DesignerValidationError(`Element ${elementKey} has an invalid side.`);
    if (!ELEMENT_TYPES.includes(elementType)) throw new DesignerValidationError(`Element ${elementKey} has an invalid type.`);
    const dataSourceKey = clean(value?.dataSourceKey,80) || null;
    const dynamic = ['DynamicText','DynamicImage','QR'].includes(elementType);
    if (dynamic && (!dataSourceKey || !fieldsFor(kind).includes(dataSourceKey))) throw new DesignerValidationError(`Element ${elementKey} uses a data source that is not allowed for ${kind}.`);
    if (!dynamic && dataSourceKey) throw new DesignerValidationError(`Element ${elementKey} cannot use a dynamic data source.`);
    if (elementType === 'QR' && !dataSourceKey?.endsWith('_qr')) throw new DesignerValidationError(`Element ${elementKey} must use an approved QR data source.`);
    const x = integer(value?.xBP,0,9999,`${elementKey} X`), y=integer(value?.yBP,0,9999,`${elementKey} Y`);
    const width=integer(value?.widthBP,1,10000,`${elementKey} width`), height=integer(value?.heightBP,1,10000,`${elementKey} height`);
    if (x+width>10000 || y+height>10000) throw new DesignerValidationError(`Element ${elementKey} must remain inside the card.`);
    return {
        elementKey,side,elementType,dataSourceKey,staticText:elementType==='StaticText'?clean(value?.staticText,5000):null,
        assetId:value?.assetId == null ? null : integer(value.assetId,1,Number.MAX_SAFE_INTEGER,`${elementKey} asset`),
        xBP:x,yBP:y,widthBP:width,heightBP:height,rotationDeg:decimal(value?.rotationDeg ?? 0,-360,360,`${elementKey} rotation`),
        zIndex:integer(value?.zIndex ?? 0,-10000,10000,`${elementKey} layer`),visible:value?.visible===false?0:1,
        locked:value?.locked===true?1:0,required:value?.required===true?1:0,style:normalizeStyle(value?.style),
    };
}
function normalizeLayoutPayload(payload, expectedKind) {
    const kind = normalizeKind(expectedKind || payload?.templateKind);
    const widthMM=decimal(payload?.widthMM,20,500,'Card width'), heightMM=decimal(payload?.heightMM,20,500,'Card height');
    const dpi=integer(payload?.dpi ?? 300,72,1200,'DPI');
    const duplexFlip=clean(payload?.duplexFlip || 'LongEdge',20);
    if (!['LongEdge','ShortEdge'].includes(duplexFlip)) throw new DesignerValidationError('Duplex flip must be LongEdge or ShortEdge.');
    const backRotation=integer(payload?.backRotation ?? 0,0,180,'Back rotation');
    if (![0,180].includes(backRotation)) throw new DesignerValidationError('Back rotation must be 0 or 180.');
    const sides=(Array.isArray(payload?.sides)?payload.sides:[]).map(normalizeSide);
    if (sides.length<1 || sides.length>2 || new Set(sides.map(item=>item.side)).size!==sides.length || !sides.some(item=>item.side==='Front')) throw new DesignerValidationError('A layout requires one Front side and may have one Back side.');
    const elements=(Array.isArray(payload?.elements)?payload.elements:[]).map(item=>normalizeElement(item,kind));
    if (elements.length>200 || new Set(elements.map(item=>item.elementKey)).size!==elements.length) throw new DesignerValidationError('A layout may contain up to 200 uniquely keyed elements.');
    const availableSides=new Set(sides.map(item=>item.side));
    if (elements.some(item=>!availableSides.has(item.side))) throw new DesignerValidationError('Every element must belong to an available side.');
    return { templateKind:kind,widthMM,heightMM,dpi,duplexFlip,backRotation,sides,elements };
}
function assessLayout(layout) {
    const items=[];
    if (!layout.sides.some(side=>side.side==='Back')) items.push({severity:'Warning',code:'BACK_SIDE_MISSING',message:'Back side is not configured.'});
    if (Number(layout.dpi)<200) items.push({severity:'Warning',code:'DPI_LOW',message:'Print DPI is below the recommended 200 DPI.'});
    for (const side of layout.sides) {
        if (Number(side.bleedMM||0)<1) items.push({severity:'Warning',code:`BLEED_LOW_${side.side.toUpperCase()}`,message:`${side.side} bleed is below the recommended 1 mm.`});
        if (Number(side.safeMarginMM||0)<2) items.push({severity:'Warning',code:`SAFE_MARGIN_LOW_${side.side.toUpperCase()}`,message:`${side.side} safe margin is below the recommended 2 mm.`});
        if (side.pixelWidth&&side.pixelHeight) { const requiredWidth=(Number(layout.widthMM)/25.4)*Number(layout.dpi),requiredHeight=(Number(layout.heightMM)/25.4)*Number(layout.dpi); if(Number(side.pixelWidth)<requiredWidth||Number(side.pixelHeight)<requiredHeight)items.push({severity:'Warning',code:`BACKGROUND_RESOLUTION_LOW_${side.side.toUpperCase()}`,message:`${side.side} background may be below the selected print DPI.`}); }
    }
    const expectedQr=layout.templateKind==='Personal'?'card.personal_qr':'department.community_qr';
    const qr=layout.elements.filter(element=>element.visible && element.elementType==='QR' && element.dataSourceKey===expectedQr);
    if (!qr.length) items.push({severity:'Blocked',code:'QR_MISSING',message:'An approved BBS QR element is required.'});
    if (qr.some(element=>Math.min(element.widthBP,element.heightBP)<1200)) items.push({severity:'Blocked',code:'QR_TOO_SMALL',message:'QR size must be at least 12% of the card on both axes.'});
    return { status:items.some(i=>i.severity==='Blocked')?'Blocked':items.some(i=>i.severity==='Warning')?'Warning':'Ready',items };
}

function legacyLayout(parent, kindValue) {
    const kind=normalizeKind(kindValue), personal=kind==='Personal';
    const elements=personal?[
        {elementKey:'employee-name',side:'Front',elementType:'DynamicText',dataSourceKey:'employee.full_name',xBP:700,yBP:6500,widthBP:5200,heightBP:900,zIndex:10,required:true,style:{fontSizePt:14,fontWeight:'700'}},
        {elementKey:'employee-department',side:'Front',elementType:'DynamicText',dataSourceKey:'employee.department',xBP:700,yBP:7450,widthBP:5200,heightBP:650,zIndex:11,required:true,style:{fontSizePt:9}},
        {elementKey:'employee-position',side:'Front',elementType:'DynamicText',dataSourceKey:'employee.position',xBP:700,yBP:8150,widthBP:5200,heightBP:650,zIndex:12,style:{fontSizePt:9}},
        {elementKey:'personal-qr',side:'Front',elementType:'QR',dataSourceKey:'card.personal_qr',xBP:6800,yBP:6100,widthBP:2500,heightBP:2500,zIndex:20,required:true,style:{objectFit:'Contain'}},
    ]:[{elementKey:'department-qr',side:'Front',elementType:'QR',dataSourceKey:'department.community_qr',xBP:6900,yBP:6900,widthBP:2400,heightBP:2400,zIndex:20,required:true,style:{objectFit:'Contain'}}];
    if(personal&&Number(parent.IncludeEmployeeID)!==0)elements.push({elementKey:'employee-id',side:'Front',elementType:'DynamicText',dataSourceKey:'employee.id',xBP:700,yBP:8850,widthBP:5200,heightBP:550,zIndex:13,style:{fontSizePt:8}});
    return normalizeLayoutPayload({templateKind:kind,widthMM:Number(parent.WidthMM),heightMM:Number(parent.HeightMM),dpi:300,duplexFlip:'LongEdge',backRotation:0,sides:[{side:'Front',storageClass:personal?'PersonalTemplate':'DepartmentTemplate',backgroundStoredName:parent.BackgroundStoredName,backgroundOriginalName:parent.OriginalName,backgroundMimeType:parent.MimeType,backgroundFileSize:Number(parent.FileSize||0),backgroundFit:'Cover',backgroundPositionXBP:5000,backgroundPositionYBP:5000,bleedMM:0,safeMarginMM:3}],elements},kind);
}

module.exports={ DesignerValidationError, catalog, normalizeKind, normalizeLayoutPayload, assessLayout, legacyLayout };
