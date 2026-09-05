'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const files=fs.readdirSync(__dirname).filter(file=>/^bbs.*\.test\.js$/.test(file)).sort();
const results=[];
for(const file of files){
    const run=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
    const passed=run.status===0;results.push({file,passed,status:run.status,output:(run.stdout||'')+(run.stderr||''),error:run.error?.message});
    console.log(`${passed?'PASS':'FAIL'} ${file}`);
    if(!passed){const first=(run.stderr||run.stdout||run.error?.message||'No output').split(/\r?\n/).filter(Boolean).slice(0,6).join('\n');console.error(first);}
}
const output=path.resolve(__dirname,'../../output');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'bbs-integration-regression.json'),JSON.stringify(results,null,2));
console.log(`BBS regression: ${results.filter(row=>row.passed).length}/${results.length} passed.`);
if(results.some(row=>!row.passed))process.exitCode=1;
