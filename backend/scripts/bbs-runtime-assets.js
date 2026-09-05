'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');

function assertBbsRuntimeAssets(){
    const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const entry=index.match(/src=["']([^"']*public\/js\/main\.js\?[^"']+)["']/);
    assert.ok(entry,'The module entry must have a cache-busted URL.');
    const verify=(url,parent)=>{
        const parsed=new URL(url,'https://local.invalid/'+parent.replaceAll('\\','/'));
        assert.equal(parsed.origin,'https://local.invalid');
        assert.match(parsed.searchParams.get('v')||'',/^[A-Za-z0-9._-]+$/,'An explicit asset version is required.');
        const file=path.join(root,parsed.pathname);
        assert.ok(fs.existsSync(file),'Referenced runtime asset is missing: '+parsed.pathname);
        return fs.readFileSync(file,'utf8');
    };
    const main=verify(entry[1],'index.html');
    const bbs=main.match(/from\s+["']([^"']*pages\/bbs-smart-card\.js\?[^"']+)["']/);
    assert.ok(bbs,'Main must load the BBS module through a versioned import.');
    const client=verify(bbs[1],'public/js/main.js');
    for(const target of ['bbs-card-designer.js','bbs-card-print.js']){
        const imports=[...client.matchAll(/from\s+["']([^"']+)["']/g)];
        const item=imports.find(match=>match[1].split('?')[0].endsWith(target));
        assert.ok(item,'BBS must load '+target);verify(item[1],'public/js/pages/bbs-smart-card.js');
    }
}
module.exports={assertBbsRuntimeAssets};
