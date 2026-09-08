'use strict';

const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'..','.env')});

(async()=>{
    const sql=fs.readFileSync(path.join(__dirname,'..','migrations','20260908_bbs_card_master_artwork.sql'),'utf8');
    const connection=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,port:Number(process.env.DB_PORT||3306),multipleStatements:true});
    try{
        await connection.query(sql);
        const[[table]]=await connection.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='BBS_Card_Master_Artwork'",[process.env.DB_NAME]);
        const[[column]]=await connection.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='BBS_Card_Layout_Assets' AND COLUMN_NAME='MasterArtworkID'",[process.env.DB_NAME]);
        if(Number(table.count)!==1||Number(column.count)!==1)throw new Error('BBS Master Artwork migration verification failed.');
        console.log('BBS Master Artwork Local migration: PASS (table + snapshot provenance column)');
    } finally { await connection.end(); }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
