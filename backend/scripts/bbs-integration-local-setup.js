'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const crypto=require('crypto');
const mysql=require('mysql2/promise');
const root=path.resolve(__dirname,'../..');
require('dotenv').config({path:path.join(root,'backend/.env'),quiet:true});
const migrations=['20260903_cccf_submit_delegations.sql','20260902_bbs_phase10f1_visual_card_designer_foundation.sql'];
const quote=value=>'`'+String(value).replaceAll('`','``')+'`';
(async()=>{
    if(!['localhost','127.0.0.1','::1'].includes(String(process.env.DB_HOST).toLowerCase()))throw new Error('This setup is restricted to the local database.');
    const backup=path.join(root,'backups','bbs-integration-local-'+new Date().toISOString().replace(/[:.]/g,'-'));
    fs.mkdirSync(backup,{recursive:true});
    const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,multipleStatements:true});
    try{
        const [[status]]=await connection.query('SELECT @@innodb_force_recovery recovery,@@read_only readOnly');
        if(Number(status.recovery)!==0||Number(status.readOnly)!==0)throw new Error('Local MySQL must be healthy and writable before setup.');
        const [tables]=await connection.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",[process.env.DB_NAME]);
        const counts=[];
        for(const {name} of tables){const [[r]]=await connection.query('SELECT COUNT(*) count FROM '+quote(name));counts.push({name,count:Number(r.count)});}
        const sqlFile=path.join(backup,'database-before.sql');
        const dump=cp.spawnSync(process.env.MYSQLDUMP_BIN||'C:/xampp/mysql/bin/mysqldump.exe',['--no-defaults','--host='+process.env.DB_HOST,'--port='+String(process.env.DB_PORT||3306),'--user='+process.env.DB_USER,'--single-transaction','--routines','--triggers','--events','--hex-blob','--default-character-set=utf8mb4','--databases',process.env.DB_NAME,'--result-file='+sqlFile],{env:{...process.env,MYSQL_PWD:process.env.DB_PASS||''},encoding:'utf8',windowsHide:true,timeout:120000});
        if(dump.error||dump.status!==0)throw new Error(dump.error?.message||dump.stderr||'Backup failed.');
        const bytes=fs.readFileSync(sqlFile);
        if(!bytes.length||!bytes.toString('utf8').includes('-- Dump completed on'))throw new Error('Incomplete SQL backup.');
        fs.cpSync(path.join(root,'backend/private-uploads'),path.join(backup,'private-uploads'),{recursive:true});
        const manifest={createdAt:new Date().toISOString(),databaseBytes:bytes.length,databaseSha256:crypto.createHash('sha256').update(bytes).digest('hex'),migrations,before:counts};
        fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
        for(const migration of migrations)await connection.query(fs.readFileSync(path.join(root,'backend/migrations',migration),'utf8'));
        const changed=[];
        for(const before of counts){const [[r]]=await connection.query('SELECT COUNT(*) count FROM '+quote(before.name));if(Number(r.count)!==before.count&&before.name.toLowerCase()!=='bbs_settings')changed.push({name:before.name,before:before.count,after:Number(r.count)});}
        const [flags]=await connection.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','staged_admin_only','pilot_scope_only')");
        const [designer]=await connection.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND LOWER(TABLE_NAME) IN ('bbs_card_layout_versions','bbs_card_layout_sides','bbs_card_layout_elements','bbs_card_layout_assets','bbs_card_designer_print_snapshots')",[process.env.DB_NAME]);
        manifest.after={designerTables:designer.length,flags,changedExistingTableCounts:changed};
        fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
        if(changed.length||designer.length!==5)throw new Error('Post-migration reconciliation failed; inspect '+backup);
        console.log(JSON.stringify({backup,sha256:manifest.databaseSha256,...manifest.after},null,2));
    }finally{await connection.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
