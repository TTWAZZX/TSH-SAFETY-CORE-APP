// Shared physical style projection for the Designer canvas and printed cards.
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const bounded=(value,min,max,fallback=min)=>Math.min(max,Math.max(min,number(value,fallback)));
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick=(value,allowed,fallback)=>allowed.includes(String(value).toLowerCase())?String(value).toLowerCase():fallback;
const color=(value,fallback)=>/^(#[0-9a-f]{3,8}|transparent|black|white)$/i.test(String(value))?String(value):fallback;
const imageUrl=value=>/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(String(value))?String(value):'';

export function designerElementCss(element,{pixelsPerMM=null}={}){
    const s=element.style||{},shape=element.elementType==='Shape',type=String(s.shapeType||'Rectangle').toLowerCase();
    const unit=points=>pixelsPerMM===null?`${points}pt`:`${points*25.4/72*pixelsPerMM}px`;
    const weight=String(s.fontWeight||'700'),font=/^[a-z0-9 ,_-]{1,100}$/i.test(String(s.fontFamily||''))?s.fontFamily:'Kanit, Tahoma, Arial, sans-serif';
    const vertical=pick(s.verticalAlign,['top','middle','center','bottom'],'middle');
    const border=bounded(s.borderWidthPt,0,20,shape?1:0);
    return `position:absolute;box-sizing:border-box;left:${number(element.xBP)/100}%;top:${number(element.yBP)/100}%;width:${number(element.widthBP)/100}%;height:${number(element.heightBP)/100}%;z-index:${number(element.zIndex)};transform:rotate(${number(element.rotationDeg)}deg);`+
        `font-family:${font};font-size:${unit(bounded(s.fontSizePt,1,144,12))};font-weight:${/^(normal|bold|[1-9]00)$/.test(weight)?weight:'700'};font-style:${pick(s.fontStyle,['normal','italic','oblique'],'normal')};`+
        `text-align:${pick(s.textAlign,['left','center','right','justify'],'left')};color:${color(s.color,'#0f172a')};background-color:${color(s.backgroundColor,'transparent')};`+
        `border:${unit(type==='line'?0:border)} solid ${color(s.borderColor,'#0f172a')};${type==='line'?`border-top:${unit(border||1)} solid ${color(s.borderColor,'#0f172a')};`:''}`+
        `border-radius:${type==='ellipse'?50:bounded(s.borderRadiusBP,0,5000)/100}%;line-height:${bounded(s.lineHeight,.5,5,1.2)};letter-spacing:${unit(bounded(s.letterSpacingPt,-10,30,0))};opacity:${bounded(s.opacity,0,1,1)};`+
        `object-fit:${pick(s.objectFit,['contain','cover','fill','none','scale-down'],'contain')};object-position:${bounded(s.objectPositionXBP,0,10000,5000)/100}% ${bounded(s.objectPositionYBP,0,10000,5000)/100}%;`+
        `display:flex;flex-direction:column;justify-content:${vertical==='top'?'flex-start':vertical==='bottom'?'flex-end':'center'};overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;`;
}

export function renderDesignerElement(element,values,resources,qrDataUrl){
    if(!element.visible)return '';
    const value=element.dataSourceKey?values[element.dataSourceKey]:element.staticText||'';
    const css=html(designerElementCss(element));
    if(element.elementType==='Shape')return `<div class="designer-element designer-shape" style="${css}" aria-hidden="true"></div>`;
    if(element.elementType==='QR'){
        if(!value)throw new Error('The card QR is unavailable. Prepare the card again.');
        return `<img class="designer-element designer-qr" style="${css};background-color:#fff" src="${html(qrDataUrl(String(value)))}" alt="BBS QR">`;
    }
    if(['DynamicImage','StaticImage'].includes(element.elementType)){
        const src=imageUrl(element.assetUrl?resources.get(element.assetUrl):value);
        if(!src&&element.required)throw new Error('A required card image is unavailable.');
        return src?`<img class="designer-element" style="${css}" src="${html(src)}" alt="">`:'';
    }
    if(element.required&&(value===undefined||value===null||value===''))throw new Error('A required card field is unavailable.');
    return `<div class="designer-element designer-text" style="${css}"><span>${html(value)}</span></div>`;
}

const PAPERS={A4:[210,297],A5:[148,210],A6:[105,148]};
export function planDesignerSheets(cards,paperSize='A4'){
    const paper=PAPERS[paperSize];if(!paper)throw new Error('Choose A4, A5 or A6 paper.');
    const margin=8,gap=5,sheets=[];
    let offset=0;
    while(offset<cards.length){
        const layout=cards[offset]?.designerRender?.layout;
        if(!layout)throw new Error('Prepare Designer and legacy cards in separate print jobs.');
        const width=number(layout.widthMM),height=number(layout.heightMM),bleed=Math.max(0,...layout.sides.map(s=>bounded(s.bleedMM,0,20)));
        const key=l=>JSON.stringify([number(l.widthMM),number(l.heightMM),l.duplexFlip,Math.max(0,...l.sides.map(s=>bounded(s.bleedMM,0,20)))]);
        let end=offset+1;while(end<cards.length&&cards[end]?.designerRender?.layout&&key(cards[end].designerRender.layout)===key(layout))end++;
        const cellWidth=width+2*bleed,cellHeight=height+2*bleed;
        const columns=Math.floor((paper[0]-margin*2+gap)/(cellWidth+gap)),rows=Math.floor((paper[1]-margin*2+gap)/(cellHeight+gap));
        if(width<=0||height<=0||columns<1||rows<1)throw new Error(`The card including bleed does not fit ${paperSize}. Choose larger paper or smaller card dimensions.`);
        const capacity=columns*rows,flip=layout.duplexFlip||'LongEdge';
        for(let first=offset;first<end;first+=capacity){
            const indices=Array.from({length:Math.min(capacity,end-first)},(_,i)=>first+i);
            const hasBack=indices.some(i=>cards[i].designerRender.layout.sides.some(s=>s.side==='Back'));
            for(const side of hasBack?['Front','Back']:['Front']){
                const slots=indices.map((cardIndex,i)=>{
                    const x=margin+(i%columns)*(cellWidth+gap),y=margin+Math.floor(i/columns)*(cellHeight+gap);
                    return {cardIndex,side,blank:!cards[cardIndex].designerRender.layout.sides.some(s=>s.side===side),
                        x:side==='Back'&&flip==='LongEdge'?paper[0]-x-cellWidth:x,
                        y:side==='Back'&&flip==='ShortEdge'?paper[1]-y-cellHeight:y,
                        width,height,bleed,cellWidth,cellHeight};
                });
                sheets.push({side,flip,paperSize,width:paper[0],height:paper[1],slots});
            }
        }
        offset=end;
    }
    return sheets;
}

function slotHtml(slot,cards,resources,qrDataUrl){
    if(slot.blank)return '';
    const render=cards[slot.cardIndex].designerRender,layout=render.layout,side=layout.sides.find(s=>s.side===slot.side);
    const background=imageUrl(resources.get(side.backgroundUrl));
    if(!background)throw new Error('Card background is unavailable. Prepare the card again.');
    const fit=side.backgroundFit==='Stretch'?'100% 100%':pick(side.backgroundFit,['cover','contain'],'cover');
    const rotation=slot.side==='Back'?number(layout.backRotation):0;
    const elements=layout.elements.filter(e=>e.side===slot.side).map(e=>renderDesignerElement(e,render.values||{},resources,qrDataUrl)).join('');
    return `<div class="bbs-print-slot" data-card-index="${slot.cardIndex}" style="left:${slot.x}mm;top:${slot.y}mm;width:${slot.cellWidth}mm;height:${slot.cellHeight}mm"><article class="designer-card" data-card-side="${slot.side}" style="left:${slot.bleed}mm;top:${slot.bleed}mm;width:${slot.width}mm;height:${slot.height}mm;transform:rotate(${rotation}deg)"><div class="designer-background" style="inset:-${slot.bleed}mm;background-image:url('${background}');background-size:${fit};background-position:${bounded(side.backgroundPositionXBP,0,10000,5000)/100}% ${bounded(side.backgroundPositionYBP,0,10000,5000)/100}%"></div><div class="designer-content">${elements}</div><div class="designer-cut"></div><div class="designer-safe" style="inset:${bounded(side.safeMarginMM,0,50,3)}mm"></div><div class="designer-bleed" style="inset:-${slot.bleed}mm"></div></article></div>`;
}

export function designerPrintDocument(cards,resources,qrDataUrl,{paperSize='A4',title='BBS Smart Card Print',autoPrint=true}={}){
    const sheets=planDesignerSheets(cards,paperSize),flips=[...new Set(sheets.filter(s=>s.side==='Back').map(s=>s.flip))];
    if(flips.length>1)throw new Error('Print cards with different duplex flip settings in separate jobs.');
    const pages=sheets.map(sheet=>`<section class="bbs-print-sheet" data-print-side="${sheet.side}" data-duplex-flip="${sheet.flip}" style="width:${sheet.width}mm;height:${sheet.height}mm">${sheet.slots.map(slot=>slotHtml(slot,cards,resources,qrDataUrl)).join('')}</section>`).join('');
    const note=flips.length?`Print double-sided at 100% scale. Flip on the ${flips[0]==='ShortEdge'?'short':'long'} edge.`:'Print at 100% scale. Single-sided cards.';
    const script=autoPrint?`<script>window.addEventListener('load',async()=>{try{if(document.fonts)await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.decode()));window.print();}catch(error){document.getElementById('print-status').textContent='An image could not be loaded. Keep this window open and prepare the print again.';}});<\/script>`:'';
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${html(title)}</title><style>@page{size:${paperSize};margin:0}*{box-sizing:border-box}body{margin:0;font-family:Kanit,Tahoma,Arial,sans-serif;background:#e2e8f0}#print-status{padding:12px;background:#fff}.bbs-print-sheet{position:relative;background:#fff;overflow:hidden;break-after:page;page-break-after:always}.bbs-print-sheet:last-child{break-after:auto;page-break-after:auto}.bbs-print-slot,.designer-card,.designer-background,.designer-content,.designer-cut,.designer-safe,.designer-bleed{position:absolute}.designer-content{inset:0;overflow:hidden}.designer-cut{inset:0;outline:.15mm dashed #64748b;pointer-events:none;z-index:10002}.designer-safe{border:.15mm dashed #0891b2;pointer-events:none;z-index:10001}.designer-bleed{border:.15mm dashed #f97316;pointer-events:none}.designer-qr{object-fit:contain!important}@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}#print-status,.designer-safe,.designer-bleed{display:none}}</style></head><body><div id="print-status">${note}</div>${pages}${script}</body></html>`;
}
