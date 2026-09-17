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
    const textElement=['StaticText','DynamicText'].includes(element.elementType);
    const border=bounded(s.borderWidthPt,0,20,shape?1:0);
    return `position:absolute;box-sizing:border-box;left:${number(element.xBP)/100}%;top:${number(element.yBP)/100}%;width:${number(element.widthBP)/100}%;height:${number(element.heightBP)/100}%;z-index:${number(element.zIndex)};transform:rotate(${number(element.rotationDeg)}deg);`+
        `font-family:${font};font-size:${unit(bounded(s.fontSizePt,1,144,12))};font-weight:${/^(normal|bold|[1-9]00)$/.test(weight)?weight:'700'};font-style:${pick(s.fontStyle,['normal','italic','oblique'],'normal')};`+
        `text-align:${pick(s.textAlign,['left','center','right','justify'],'left')};color:${color(s.color,'#0f172a')};background-color:${color(s.backgroundColor,'transparent')};`+
        `border:${unit(type==='line'?0:border)} solid ${color(s.borderColor,'#0f172a')};${type==='line'?`border-top:${unit(border||1)} solid ${color(s.borderColor,'#0f172a')};`:''}`+
        `border-radius:${type==='ellipse'?50:bounded(s.borderRadiusBP,0,5000)/100}%;line-height:${bounded(s.lineHeight,.5,5,1.2)};letter-spacing:${unit(bounded(s.letterSpacingPt,-10,30,0))};opacity:${bounded(s.opacity,0,1,1)};`+
        `object-fit:${pick(s.objectFit,['contain','cover','fill','none','scale-down'],'contain')};object-position:${bounded(s.objectPositionXBP,0,10000,5000)/100}% ${bounded(s.objectPositionYBP,0,10000,5000)/100}%;`+
        `display:flex;flex-direction:column;align-items:${textElement?'stretch':'center'};justify-content:${vertical==='top'?'flex-start':vertical==='bottom'?'flex-end':'center'};overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;`;
}

export function renderDesignerElement(element,values,resources,qrDataUrl,styleOptions={}){
    if(!element.visible)return '';
    const value=element.dataSourceKey?values[element.dataSourceKey]:element.staticText||'';
    const css=html(designerElementCss(element,styleOptions));
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

export const DESIGNER_CARD_FACE_CONTRACT='bbs-designer-card-face-v2';

// Canonical card-face projection shared by Composite Preview, Print, PDF and
// PNG/JPG. Consumers may change only the display scale and outer placement;
// artwork, geometry, typography, data binding and rotation stay identical.
export function designerCardFaceHtml(render,sideName,resources,qrDataUrl,{pixelsPerMM=null,cardIndex=0,cardStyle='',className='',showGuides=true}={}){
    const layout=render?.layout,side=(layout?.sides||[]).find(item=>item.side===sideName);
    if(!layout||!side)throw new Error(`Designer ${sideName} side is unavailable. Prepare the card again.`);
    const background=imageUrl(resources.get(side.backgroundUrl));
    if(!background)throw new Error('Card background is unavailable. Prepare the card again.');
    const width=bounded(layout.widthMM,1,1000,85.6),height=bounded(layout.heightMM,1,1000,54);
    const bleed=bounded(side.bleedMM,0,20,0),safe=bounded(side.safeMarginMM,0,50,3);
    const length=value=>pixelsPerMM===null?`${value}mm`:`${value*pixelsPerMM}px`;
    const fit=side.backgroundFit==='Stretch'?'100% 100%':pick(side.backgroundFit,['cover','contain'],'cover');
    const rotation=side.side==='Back'?number(layout.backRotation):0;
    const elements=(layout.elements||[]).filter(element=>element.side===side.side).map(element=>renderDesignerElement(element,render.values||{},resources,qrDataUrl,{pixelsPerMM})).join('');
    const safeGuide=showGuides?`<div class="designer-safe" style="position:absolute;pointer-events:none;z-index:10001;left:${length(safe)};right:${length(safe)};top:${length(safe)};bottom:${length(safe)};border:${length(.15)} dashed #0891b2"></div>`:'';
    const bleedGuide=showGuides?`<div class="designer-bleed" style="position:absolute;pointer-events:none;left:${length(-bleed)};right:${length(-bleed)};top:${length(-bleed)};bottom:${length(-bleed)};border:${length(.15)} dashed #f97316"></div>`:'';
    const cutGuide=showGuides?`<div class="designer-cut" style="position:absolute;inset:0;pointer-events:none;z-index:10002;outline:${length(.15)} dashed #64748b"></div>`:'';
    const safeClass=String(className||'').replace(/[^a-z0-9 _-]+/gi,' ').trim();
    return `<article class="designer-card${safeClass?` ${safeClass}`:''}" data-renderer-contract="${DESIGNER_CARD_FACE_CONTRACT}" data-card-index="${number(cardIndex)}" data-card-side="${html(side.side)}" data-card-width-mm="${width}" data-card-height-mm="${height}" data-card-dpi="${Math.round(bounded(layout.dpi,72,1200,300))}" style="position:absolute;box-sizing:border-box;overflow:hidden;background:#fff;width:${length(width)};height:${length(height)};transform:rotate(${rotation}deg);${cardStyle}"><div class="designer-background" style="position:absolute;left:${length(-bleed)};right:${length(-bleed)};top:${length(-bleed)};bottom:${length(-bleed)};background-image:url('${html(background)}');background-size:${fit};background-position:${bounded(side.backgroundPositionXBP,0,10000,5000)/100}% ${bounded(side.backgroundPositionYBP,0,10000,5000)/100}%"></div><div class="designer-content" style="position:absolute;inset:0;overflow:hidden">${elements}</div>${cutGuide}${safeGuide}${bleedGuide}</article>`;
}

export async function saveDesignerPrintPdf(outputDocument,{filename='BBS_Cards.pdf',dpi=null}={}){
    const renderer=globalThis.html2canvas,JsPdf=globalThis.jspdf?.jsPDF;
    if(typeof renderer!=='function'||!JsPdf)throw new Error('PDF library is unavailable. Reload the page and try again.');
    const sheets=[...outputDocument.querySelectorAll('.bbs-print-sheet')];
    if(!sheets.length)throw new Error('Designer print sheets are unavailable. Prepare the cards again.');
    if(outputDocument.fonts)await outputDocument.fonts.ready;
    await Promise.all([...outputDocument.images].map(image=>image.complete?image.decode?.().catch(()=>{}):new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    let pdf=null;
    for(let index=0;index<sheets.length;index+=1){
        const sheet=sheets[index],width=number(sheet.dataset.pageWidthMm,210),height=number(sheet.dataset.pageHeightMm,297),orientation=width>height?'landscape':'portrait';
        const cardDpis=[...(sheet.querySelectorAll?.('.designer-card[data-card-dpi]')||[])].map(card=>number(card.dataset.cardDpi)).filter(value=>value>=72);
        const outputDpi=Math.round(bounded(Math.max(450,number(dpi??Math.max(450,...cardDpis),450)),72,1200,450)),targetWidth=Math.max(1,Math.round(width/25.4*outputDpi)),targetHeight=Math.max(1,Math.round(height/25.4*outputDpi));
        let canvas,pdfCanvas;
        try{
            const rect=sheet.getBoundingClientRect?.()||{width:sheet.scrollWidth,height:sheet.scrollHeight},renderScale=targetWidth/rect.width;
            canvas=await renderer(sheet,{scale:renderScale,useCORS:true,backgroundColor:'#ffffff',logging:false,width:rect.width,height:rect.height,windowWidth:Math.max(sheet.scrollWidth,Math.ceil(rect.width)),windowHeight:Math.max(sheet.scrollHeight,Math.ceil(rect.height)),onclone:clone=>clone.querySelectorAll('.designer-safe,.designer-bleed,.bbs-output-toolbar,[data-print-exclude]').forEach(node=>node.style.display='none')});
            pdfCanvas=exactSizeCanvas(canvas,targetWidth,targetHeight,outputDocument);
            if(!pdf)pdf=new JsPdf({orientation,unit:'mm',format:[width,height],compress:false,precision:12});else pdf.addPage([width,height],orientation);
            pdf.addImage(pdfCanvas.toDataURL('image/png'),'PNG',0,0,width,height,undefined,'NONE',0);
        }finally{
            if(pdfCanvas&&pdfCanvas!==canvas){pdfCanvas.width=1;pdfCanvas.height=1;}
            if(canvas){canvas.width=1;canvas.height=1;}
        }
    }
    pdf.save(String(filename||'BBS_Cards.pdf').replace(/[\\/:*?"<>|]+/g,'_'));
}

let pngCrcTable=null;
function crc32(bytes){
    if(!pngCrcTable)pngCrcTable=Array.from({length:256},(_,value)=>{let crc=value;for(let bit=0;bit<8;bit+=1)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
    let crc=0xffffffff;for(const byte of bytes)crc=pngCrcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;
}
function joinBytes(...parts){const length=parts.reduce((sum,part)=>sum+part.length,0),output=new Uint8Array(length);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;}
function pngPhysicalChunk(dpi){
    const chunk=new Uint8Array(21),view=new DataView(chunk.buffer),pixelsPerMeter=Math.round(dpi/0.0254),type=new Uint8Array([112,72,89,115]);
    view.setUint32(0,9);chunk.set(type,4);view.setUint32(8,pixelsPerMeter);view.setUint32(12,pixelsPerMeter);chunk[16]=1;view.setUint32(17,crc32(chunk.subarray(4,17)));return chunk;
}
function embedPngDpi(bytes,dpi){
    if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw new Error('The PNG encoder returned an invalid file.');
    const replacement=pngPhysicalChunk(dpi),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,insertAt=-1;
    while(offset+12<=bytes.length){const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw new Error('The PNG encoder returned a truncated file.');const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(type==='pHYs')return joinBytes(bytes.subarray(0,offset),replacement,bytes.subarray(end));if(insertAt<0&&(type==='IDAT'||type==='IEND'))insertAt=offset;if(type==='IEND')break;offset=end;}
    if(insertAt<0)throw new Error('The PNG encoder did not produce an image data chunk.');return joinBytes(bytes.subarray(0,insertAt),replacement,bytes.subarray(insertAt));
}
function embedJpegDpi(bytes,dpi){
    if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw new Error('The JPEG encoder returned an invalid file.');
    const density=Math.round(bounded(dpi,1,65535,300)),patched=bytes.slice();let offset=2;
    while(offset+4<=patched.length){if(patched[offset]!==255)break;const markerStart=offset;while(offset<patched.length&&patched[offset]===255)offset+=1;const marker=patched[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(offset+2>patched.length)break;const length=(patched[offset]<<8)|patched[offset+1],payload=offset+2,end=offset+length;if(length<2||end>patched.length)break;if(marker===224&&length>=16&&String.fromCharCode(...patched.subarray(payload,payload+5))==='JFIF\0'){patched[payload+7]=1;patched[payload+8]=density>>>8;patched[payload+9]=density&255;patched[payload+10]=density>>>8;patched[payload+11]=density&255;return patched;}offset=end;if(markerStart===offset)break;}
    const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,density>>>8,density&255,density>>>8,density&255,0,0]);return joinBytes(patched.subarray(0,2),jfif,patched.subarray(2));
}
export function readRasterDpi(input,format){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input),type=String(format).toLowerCase();
    if(type==='png'){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8;while(offset+12<=bytes.length){const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)break;const name=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(name==='pHYs'&&length>=9&&bytes[offset+16]===1)return{dpiX:view.getUint32(offset+8)*0.0254,dpiY:view.getUint32(offset+12)*0.0254};offset=end;}return null;}
    if(type==='jpg'||type==='jpeg'){let offset=2;while(offset+4<=bytes.length){if(bytes[offset]!==255)break;while(offset<bytes.length&&bytes[offset]===255)offset+=1;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(offset+2>bytes.length)break;const length=(bytes[offset]<<8)|bytes[offset+1],payload=offset+2,end=offset+length;if(length<2||end>bytes.length)break;if(marker===224&&length>=16&&String.fromCharCode(...bytes.subarray(payload,payload+5))==='JFIF\0'){const unit=bytes[payload+7],x=(bytes[payload+8]<<8)|bytes[payload+9],y=(bytes[payload+10]<<8)|bytes[payload+11],factor=unit===1?1:unit===2?2.54:null;return factor?{dpiX:x*factor,dpiY:y*factor}:null;}offset=end;}return null;}
    return null;
}
export async function embedRasterDpi(blob,format,dpi){
    const type=String(format).toLowerCase()==='jpg'?'jpg':'png',source=new Uint8Array(await blob.arrayBuffer()),bytes=type==='jpg'?embedJpegDpi(source,dpi):embedPngDpi(source,dpi),metadata=readRasterDpi(bytes,type);
    if(!metadata||Math.abs(metadata.dpiX-dpi)>.6||Math.abs(metadata.dpiY-dpi)>.6)throw new Error(`Could not embed ${dpi} DPI metadata in the ${type.toUpperCase()} file.`);
    return new Blob([bytes],{type:type==='jpg'?'image/jpeg':'image/png'});
}
function exactSizeCanvas(canvas,width,height,doc){
    if(canvas.width===width&&canvas.height===height)return canvas;
    const widthGap=Math.abs(canvas.width-width)/width,heightGap=Math.abs(canvas.height-height)/height;
    if(widthGap>.02||heightGap>.02)throw new Error(`Image size mismatch: expected ${width}×${height}px, received ${canvas.width}×${canvas.height}px.`);
    const output=doc.createElement('canvas');output.width=width;output.height=height;const context=output.getContext?.('2d',{alpha:false});if(!context)throw new Error('High-resolution image canvas is unavailable.');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(canvas,0,0,width,height);return output;
}

export async function saveDesignerPrintImages(outputDocument,{filename='BBS_Cards',format='png',scale=3.125,dpi=null,quality=.98}={}){
    const renderer=globalThis.html2canvas,type=String(format).toLowerCase()==='jpg'?'jpg':'png',mime=type==='jpg'?'image/jpeg':'image/png';
    if(typeof renderer!=='function')throw new Error('Image renderer is unavailable. Reload the page and try again.');
    const cards=[...outputDocument.querySelectorAll('.designer-card[data-card-side]')];
    if(!cards.length)throw new Error('Designer card faces are unavailable. Prepare the cards again.');
    if(outputDocument.fonts)await outputDocument.fonts.ready;
    await Promise.all([...outputDocument.images].map(image=>image.complete?image.decode?.().catch(()=>{}):new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    const base=String(filename||'BBS_Cards').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]+/g,'_'),downloadDocument=globalThis.document;
    if(!downloadDocument?.createElement)throw new Error('Download is unavailable in this browser.');
    for(let index=0;index<cards.length;index+=1){
        const card=cards[index],side=String(card.dataset.cardSide||`Side${index+1}`).replace(/[^a-z0-9_-]+/gi,'_');
        const widthMM=bounded(card.dataset.cardWidthMm,1,1000,85.6),heightMM=bounded(card.dataset.cardHeightMm,1,1000,54);
        const outputDpi=Math.round(bounded(Math.max(600,number(dpi??card.dataset.cardDpi,Math.round(scale*96))),72,1200,600));
        const prior={position:card.style.position,left:card.style.left,top:card.style.top,transform:card.style.transform};
        Object.assign(card.style,{position:'relative',left:'0',top:'0',transform:'none'});
        let canvas,encodedCanvas;
        try{
            const rect=card.getBoundingClientRect(),targetWidth=Math.max(1,Math.round(widthMM/25.4*outputDpi)),targetHeight=Math.max(1,Math.round(heightMM/25.4*outputDpi));
            const renderScale=targetWidth/rect.width;
            canvas=await renderer(card,{scale:renderScale,useCORS:true,backgroundColor:'#ffffff',logging:false,width:rect.width,height:rect.height,windowWidth:Math.max(card.scrollWidth,Math.ceil(rect.width)),windowHeight:Math.max(card.scrollHeight,Math.ceil(rect.height)),onclone:clone=>clone.querySelectorAll('.designer-safe,.designer-bleed').forEach(node=>node.style.display='none')});
            encodedCanvas=exactSizeCanvas(canvas,targetWidth,targetHeight,downloadDocument);
        }finally{Object.assign(card.style,prior);}
        const rawBlob=await new Promise((resolve,reject)=>encodedCanvas.toBlob(value=>value?resolve(value):reject(new Error(`สร้างไฟล์ ${type.toUpperCase()} ไม่สำเร็จ`)),mime,type==='jpg'?quality:undefined));
        const blob=await embedRasterDpi(rawBlob,type,outputDpi);
        if(encodedCanvas!==canvas){encodedCanvas.width=1;encodedCanvas.height=1;}canvas.width=1;canvas.height=1;
        const cardNo=String(number(card.dataset.cardIndex,index)+1).padStart(2,'0'),size=`${widthMM}x${heightMM}mm_${outputDpi}dpi`;
        const url=URL.createObjectURL(blob),link=downloadDocument.createElement('a');link.href=url;link.download=`${base}_Card${cardNo}_${side}_${size}.${type}`;link.style.display='none';downloadDocument.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    return cards.length;
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
    if(!side)throw new Error(`Designer ${slot.side} side is unavailable. Prepare the card again.`);
    const face=designerCardFaceHtml(render,slot.side,resources,qrDataUrl,{cardIndex:slot.cardIndex,cardStyle:`left:${slot.bleed}mm;top:${slot.bleed}mm;`});
    return `<div class="bbs-print-slot" data-card-index="${slot.cardIndex}" style="left:${slot.x}mm;top:${slot.y}mm;width:${slot.cellWidth}mm;height:${slot.cellHeight}mm">${face}</div>`;
}

export function designerPrintDocument(cards,resources,qrDataUrl,{paperSize='A4',title='BBS Smart Card Print',autoPrint=true}={}){
    const sheets=planDesignerSheets(cards,paperSize),flips=[...new Set(sheets.filter(s=>s.side==='Back').map(s=>s.flip))];
    if(flips.length>1)throw new Error('Print cards with different duplex flip settings in separate jobs.');
    const pages=sheets.map(sheet=>`<section class="bbs-print-sheet" data-print-side="${sheet.side}" data-duplex-flip="${sheet.flip}" data-page-width-mm="${sheet.width}" data-page-height-mm="${sheet.height}" style="width:${sheet.width}mm;height:${sheet.height}mm">${sheet.slots.map(slot=>slotHtml(slot,cards,resources,qrDataUrl)).join('')}</section>`).join('');
    const note=flips.length?`Print double-sided at 100% scale. Flip on the ${flips[0]==='ShortEdge'?'short':'long'} edge.`:'Print at 100% scale. Single-sided cards.';
    const script=autoPrint?`<script>window.addEventListener('load',async()=>{try{if(document.fonts)await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.decode()));window.print();}catch(error){document.getElementById('print-status').textContent='An image could not be loaded. Keep this window open and prepare the print again.';}});<\/script>`:'';
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"><style>@page{size:${paperSize};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Kanit,Tahoma,Arial,sans-serif;background:#e2e8f0}#print-status{padding:12px;background:#fff}.bbs-print-sheet{position:relative;background:#fff;overflow:hidden;break-after:page;page-break-after:always}.bbs-print-sheet:last-child{break-after:auto;page-break-after:auto}.bbs-print-slot,.designer-card,.designer-background,.designer-content,.designer-cut,.designer-safe,.designer-bleed{position:absolute}.designer-content{inset:0;overflow:hidden}.designer-cut{inset:0;outline:.15mm dashed #64748b;pointer-events:none;z-index:10002}.designer-safe{border:.15mm dashed #0891b2;pointer-events:none;z-index:10001}.designer-bleed{border:.15mm dashed #f97316;pointer-events:none}.designer-qr{object-fit:contain!important}@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}#print-status,.bbs-output-toolbar,[data-print-exclude],.designer-safe,.designer-bleed{display:none!important}.bbs-print-sheet{margin:0!important;box-shadow:none!important}.designer-card{break-inside:avoid!important;page-break-inside:avoid!important}}</style></head><body><div id="print-status" data-print-exclude>${note}</div>${pages}${script}</body></html>`;
}
