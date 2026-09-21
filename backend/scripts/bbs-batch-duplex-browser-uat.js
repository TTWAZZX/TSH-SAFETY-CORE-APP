'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'../..');
const chromePath=process.env.BBS_BATCH_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=Number(process.env.BBS_BATCH_CDP_PORT||9864);
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/, '');
const artifactDir=path.join(root,'output',`bbs-batch-duplex-e2e-${stamp}`);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tsh-bbs-batch-duplex-'));
const pending=new Map(),browserErrors=[];
let commandId=1,chrome,socket;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function command(method,params={},timeout=60000){
    const id=commandId++;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},timeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
async function waitFor(expression,timeout=30000){const started=Date.now();while(Date.now()-started<timeout){if(await evaluate(expression))return;await sleep(200);}throw new Error(`Timed out: ${expression}`);}
async function connect(){
    assert.ok(fs.existsSync(chromePath),'Chrome is required for Batch Duplex browser UAT');
    chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-allow-origins=*','--window-size=1400,1300',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    let targets;for(let i=0;i<60;i++){try{const response=await fetch(`http://127.0.0.1:${port}/json`);if(response.ok){targets=await response.json();break;}}catch{}await sleep(250);}
    const page=targets?.find(row=>row.type==='page');assert.ok(page?.webSocketDebuggerUrl,'Chrome target unavailable');
    socket=new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:','://127.0.0.1:'));
    socket.addEventListener('message',async event=>{let raw=event.data;if(raw&&typeof raw.text==='function')raw=await raw.text();if(raw instanceof ArrayBuffer)raw=Buffer.from(raw).toString('utf8');const message=JSON.parse(String(raw));if(message.method==='Runtime.exceptionThrown')browserErrors.push(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text||'Runtime exception');if(message.method==='Runtime.consoleAPICalled'&&message.params?.type==='error')browserErrors.push((message.params.args||[]).map(value=>value.value||value.description||'').join(' '));const current=pending.get(message.id);if(!current)return;pending.delete(message.id);clearTimeout(current.timer);message.error?current.reject(new Error(message.error.message)):current.resolve(message.result);});
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    await command('Page.enable');await command('Runtime.enable');
}

(async()=>{
    const source=fs.readFileSync(path.join(root,'public/js/utils/bbs-card-print.js'),'utf8');
    const {designerPrintDocument}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const artwork=fs.readFileSync(path.join(root,'public/images/accident/tsh-factory-layout.jpg')).toString('base64');
    const image=`data:image/jpeg;base64,${artwork}`;
    const label=(side,key,x,y,width,height,size=14)=>({elementType:'DynamicText',side,visible:true,dataSourceKey:key,xBP:x,yBP:y,widthBP:width,heightBP:height,zIndex:10,rotationDeg:0,required:true,style:{fontFamily:'Tahoma, Arial, sans-serif',fontSizePt:size,fontWeight:'700',textAlign:'center',verticalAlign:'middle',color:'#0f172a',backgroundColor:'#ffffff',borderColor:'#0f172a',borderWidthPt:1,lineHeight:1}});
    const elements=[label('Front','card.front_face',500,400,9000,900,12),label('Front','card.number',1500,4200,7000,1500,20),label('Back','card.back_face',500,400,9000,900,12),label('Back','card.number',1500,4200,7000,1500,20)];
    const layout={layoutVersionId:999999,widthMM:60,heightMM:85,dpi:600,duplexFlip:'LongEdge',backRotation:0,sides:[{side:'Front',backgroundUrl:'/front',bleedMM:1,safeMarginMM:3,backgroundFit:'Cover'},{side:'Back',backgroundUrl:'/back',bleedMM:1,safeMarginMM:3,backgroundFit:'Cover'}],elements};
    const cards=Array.from({length:9},(_,index)=>({designerRender:{layout,values:{'card.front_face':index===0?'FRONT — TOP LEFT':'FRONT','card.back_face':index===0?'BACK — TOP RIGHT':'BACK','card.number':`CARD ${String(index+1).padStart(2,'0')}`}}}));
    for(const card of cards){card.designerRender={layout,values:{...card.designerRender.values}};}
    const resources=new Map([['/front',image],['/back',image]]);
    const html=designerPrintDocument(cards,resources,()=>image,{paperSize:'A4',preset:'compact',backOffsetXMM:0,backOffsetYMM:0,autoPrint:false,title:'BBS Batch Duplex Calibration'}).replace('</head>','<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script></head>');
    fs.mkdirSync(artifactDir,{recursive:true});
    const htmlPath=path.join(artifactDir,'BBS_Batch_Duplex_Calibration_A4_9up.html');fs.writeFileSync(htmlPath,html);
    await connect();
    const relative=path.relative(root,htmlPath).split(path.sep).map(encodeURIComponent).join('/');
    await command('Page.navigate',{url:`http://127.0.0.1/tsh-safety-core/${relative}`});
    await waitFor(`document.querySelectorAll('.bbs-print-sheet').length===2 && [...document.images].every(image=>image.complete) && typeof window.html2canvas==='function'`);
    const measurements=await evaluate(`(()=>{const sheets=[...document.querySelectorAll('.bbs-print-sheet')],read=sheet=>[...sheet.querySelectorAll('.bbs-print-slot')].map(slot=>({pair:slot.dataset.pairId,x:parseFloat(slot.style.left),y:parseFloat(slot.style.top),w:parseFloat(slot.style.width),h:parseFloat(slot.style.height),cards:slot.querySelectorAll('.designer-card').length,crops:slot.querySelectorAll('.bbs-crop').length}));const front=read(sheets[0]),back=read(sheets[1]),rect=sheets[0].getBoundingClientRect(),card=sheets[0].querySelector('.designer-card').getBoundingClientRect();return{sheetCount:sheets.length,front,back,page:{width:rect.width,height:rect.height},card:{width:card.width,height:card.height},toolbar:Boolean(document.querySelector('.bbs-output-toolbar')),status:getComputedStyle(document.getElementById('print-status')).display,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.equal(measurements.sheetCount,2);assert.equal(measurements.front.length,9);assert.equal(measurements.back.length,9);assert.equal(measurements.toolbar,false);assert.equal(measurements.overflow,false);
    const mmPx=96/25.4;assert.ok(Math.abs(measurements.page.width-210*mmPx)<1);assert.ok(Math.abs(measurements.page.height-297*mmPx)<1);assert.ok(Math.abs(measurements.card.width-60*mmPx)<1);assert.ok(Math.abs(measurements.card.height-85*mmPx)<1);
    for(let i=0;i<9;i++){const front=measurements.front[i],back=measurements.back[i];assert.equal(front.pair,`card-${i+1}`);assert.equal(back.pair,front.pair);assert.equal(front.cards,1);assert.equal(back.cards,1);assert.equal(front.crops,8);assert.equal(back.crops,8);assert.ok(Math.abs(front.x+back.x+front.w-210)<.001);assert.ok(Math.abs(front.y-back.y)<.001);}
    const pdfResult=await command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,transferMode:'ReturnAsBase64'},120000),pdf=Buffer.from(pdfResult.data,'base64'),pdfText=pdf.toString('latin1'),pageCount=(pdfText.match(/\/Type\s*\/Page\b/g)||[]).length;
    assert.equal(pageCount,2,'Calibration PDF must contain exactly one Front and one Back A4 page');
    const pdfPath=path.join(artifactDir,'BBS_Batch_Duplex_Calibration_A4_9up.pdf');fs.writeFileSync(pdfPath,pdf);
    const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true},120000),screenshotPath=path.join(artifactDir,'BBS_Batch_Duplex_Browser.png');fs.writeFileSync(screenshotPath,Buffer.from(screenshot.data,'base64'));
    const realExport=await evaluate(`(async()=>{const card=document.querySelector('.designer-card[data-card-side="Front"]'),rect=card.getBoundingClientRect(),canvas=await window.html2canvas(card,{scale:1417/rect.width,useCORS:true,backgroundColor:'#ffffff',logging:false,width:rect.width,height:rect.height,windowWidth:Math.max(card.scrollWidth,Math.ceil(rect.width)),windowHeight:Math.max(card.scrollHeight,Math.ceil(rect.height)),onclone:clone=>clone.querySelectorAll('.designer-safe,.designer-bleed').forEach(node=>node.style.display='none')});return{width:canvas.width,height:canvas.height,data:canvas.toDataURL('image/png')};})()`);
    assert.ok(Math.abs(realExport.width-1417)<=1);assert.ok(Math.abs(realExport.height-2008)<=1);
    const realExportPath=path.join(artifactDir,'BBS_DOM_Capture_600dpi.png');fs.writeFileSync(realExportPath,Buffer.from(realExport.data.split(',')[1],'base64'));
    const domCapture=await evaluate(`(async()=>{const cards=[...document.querySelectorAll('.designer-card[data-card-side]')],source=cards[0];cards.slice(1).forEach(card=>card.remove());const text=source.querySelector('.designer-text'),span=text.querySelector('span');span.textContent='ลักษิกา กะการดี';const measure=()=>{const cardRect=source.getBoundingClientRect(),textRect=text.getBoundingClientRect(),spanRect=span.getBoundingClientRect();return{card:{width:cardRect.width,height:cardRect.height},text:{x:(textRect.left-cardRect.left)/cardRect.width,y:(textRect.top-cardRect.top)/cardRect.height,width:textRect.width/cardRect.width,height:textRect.height/cardRect.height,font:parseFloat(getComputedStyle(text).fontSize),baseline:(spanRect.top-textRect.top)/textRect.height},background:source.querySelector('.designer-background').style.backgroundImage};};const before=measure();let during=null;const originalClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){};window.html2canvas=async(target,options)=>{during={sameNode:target===source,options:{scale:options.scale,width:options.width,height:options.height},measurement:measure()};const canvas=document.createElement('canvas');canvas.width=Math.round(options.width*options.scale);canvas.height=Math.round(options.height*options.scale);return canvas;};let contract='';try{const module=await import('/tsh-safety-core/public/js/utils/bbs-card-print.js?v=dom-capture-browser-uat');contract=module.DESIGNER_RASTER_EXPORT_CONTRACT;await module.saveDesignerPrintImages(document,{filename:'BBS_DOM_Capture_UAT',format:'png',dpi:600});}finally{HTMLAnchorElement.prototype.click=originalClick;delete window.html2canvas;}return{contract,before,during,hostResidue:document.querySelectorAll('[data-native-designer-export]').length};})()`);
    assert.equal(domCapture.contract,'bbs-designer-dom-capture-v1');assert.equal(domCapture.during.sameNode,true);assert.ok(Math.abs(domCapture.during.options.scale-6.25)<.02);assert.ok(Math.abs(domCapture.during.options.width-domCapture.before.card.width)<.01);assert.ok(Math.abs(domCapture.during.options.height-domCapture.before.card.height)<.01);assert.deepEqual(domCapture.during.measurement,domCapture.before);assert.equal(domCapture.hostResidue,0);
    assert.deepEqual(browserErrors,[],`Browser errors: ${browserErrors.join(' | ')}`);
    const report={result:'PASS',paper:'A4',preset:'compact',cardsPerSide:9,pages:pageCount,duplexFlip:'LongEdge',backOffsetXMM:0,backOffsetYMM:0,pageCssPixels:measurements.page,cardCssPixels:measurements.card,domCapture,realExport:{width:realExport.width,height:realExport.height,path:path.relative(root,realExportPath)},pdf:path.relative(root,pdfPath),screenshot:path.relative(root,screenshotPath),printerInstruction:'Actual size / 100%; two-sided; flip on long edge'};
    fs.writeFileSync(path.join(artifactDir,'report.json'),JSON.stringify(report,null,2));
    console.log('BBS Batch Duplex Browser E2E: PASS');console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{try{socket?.close();}catch{}try{chrome?.kill();}catch{}await fs.promises.rm(profile,{recursive:true,force:true}).catch(()=>{});});
