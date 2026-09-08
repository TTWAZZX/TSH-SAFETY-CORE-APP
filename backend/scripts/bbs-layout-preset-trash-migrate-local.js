'use strict';

const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'..','.env')});

(async()=>{
    const sql=fs.readFileSync(path.join(__dirname,'..','migrations','20260908_bbs_layout_presets_safe_trash.sql'),'utf8');
    const connection=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,port:Number(process.env.DB_PORT||3306),multipleStatements:true});
    try{
        await connection.query(sql);
        const[[table]]=await connection.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='BBS_Card_Layout_Presets'",[process.env.DB_NAME]);
        const[columns]=await connection.query("SELECT TABLE_NAME,COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME='IsDeleted' AND TABLE_NAME IN ('BBS_Card_Templates','BBS_Department_Card_Templates','BBS_Card_Layout_Versions')",[process.env.DB_NAME]);
        if(Number(table.count)!==1||columns.length!==3)throw new Error('BBS Layout Preset / safe Trash migration verification failed.');
        console.log('BBS Layout Preset / safe Trash Local migration: PASS (Preset table + 3 recoverable Trash boundaries)');
    } finally { await connection.end(); }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
