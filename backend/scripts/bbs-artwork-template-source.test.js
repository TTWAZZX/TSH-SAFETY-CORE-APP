'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const {materializeLegacyFallback}=require('../services/bbs-card-artwork');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');

(async()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bbs-artwork-template-'));
    const artworkDir=path.join(temp,'artwork'),targetDir=path.join(temp,'templates');
    fs.mkdirSync(artworkDir);fs.writeFileSync(path.join(artworkDir,'front.png'),png);
    const rows=[{SlotKey:'FRONT:Personal:D7:U11',Status:'Active',StoredName:'front.png',OriginalName:'unit-front.png',MimeType:'image/png',FileSize:png.length,ArtworkVersionID:42},{SlotKey:'BACK:GLOBAL',Status:'Active',StoredName:'back.png',OriginalName:'back.png',MimeType:'image/png',FileSize:png.length,ArtworkVersionID:43}];
    const queryable={query:async()=>[rows]};
    try{
        const result=await materializeLegacyFallback(queryable,{kind:'Personal',departmentId:7,safetyUnitId:11},{artworkDir,targetDir});
        assert.equal(result.source,'CardArtwork');assert.equal(result.artworkVersionId,42);assert.equal(result.mime,'image/png');assert.ok(fs.existsSync(result.target));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(result.target)).digest('hex'),crypto.createHash('sha256').update(png).digest('hex'));
        await assert.rejects(()=>materializeLegacyFallback({query:async()=>[[rows[1]]]},{kind:'Department',departmentId:7,safetyUnitId:11},{artworkDir,targetDir}),/Scoped Front Artwork is required/);
    }finally{fs.rmSync(temp,{recursive:true,force:true});}
    const personalNode=read('backend/routes/bbs-cards.js'),departmentNode=read('backend/routes/bbs-community.js'),personalPhp=read('api/handlers/bbs_cards.php'),departmentPhp=read('api/handlers/bbs_community.php'),phpArtwork=read('api/lib/bbs_card_artwork.php'),ui=read('public/js/pages/bbs-smart-card.js');
    for(const source of [personalNode,departmentNode]){assert.match(source,/materializeLegacyFallback/);assert.match(source,/artworkVersion/);}
    for(const source of [personalPhp,departmentPhp]){assert.match(source,/bbs_card_artwork_materialize_legacy/);assert.match(source,/artworkVersion/);}
    assert.match(phpArtwork,/function bbs_card_artwork_materialize_legacy/);
    const activeForms=[...ui.matchAll(/<form id="bbs-(?:dept-)?template-form" data-template-scope-form[\s\S]*?<\/form>/g)].map(match=>match[0]);
    assert.equal(activeForms.length,2);for(const form of activeForms){assert.doesNotMatch(form,/name="template"[^>]*\srequired(?:\s|>)/);assert.match(form,/data-legacy-fallback-field/);assert.match(form,/สร้าง (?:Personal|Department) Template Draft/);}
    assert.match(ui,/fallbackInput\.required=false/);assert.match(ui,/showFallback=Boolean\(departmentId&&!artwork\?\.front\)/);assert.match(ui,/ไม่ต้องอัปโหลดภาพซ้ำ/);assert.match(ui,/สร้าง \$\{kind\} Template Draft/);
    assert.match(ui,/function openTemplateFormFromArtwork/);assert.match(ui,/data-create-template-from-artwork/);assert.match(ui,/สร้าง Template จาก Artwork นี้/);
    assert.match(ui,/state\.departmentConfigSelectedId=n\(row\.departmentId\)/);assert.match(ui,/department\.dispatchEvent\(new Event\('change'/);assert.match(ui,/unit\.dispatchEvent\(new Event\('change'/);
    assert.match(ui,/function templateLifecycleReadinessHtml/);assert.match(ui,/data-template-lifecycle-readiness/);assert.match(ui,/พร้อมสร้างหรือแก้ไข Designer Draft/);
    assert.match(ui,/data-template-readiness-fix="front"/);assert.match(ui,/data-template-readiness-fix="back"/);assert.match(ui,/function focusArtworkRequirement/);
    assert.match(ui,/installTemplateLifecycleReadiness\(\)/);assert.match(ui,/ใช้ค่าแผนก/);
    console.log('BBS Artwork-first Template creation and automatic Legacy fallback parity: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
