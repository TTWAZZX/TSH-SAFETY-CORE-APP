'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});
const loopback=new Set(['localhost','127.0.0.1','::1']);

(async()=>{
    assert(loopback.has(String(process.env.DB_HOST||'').trim().toLowerCase()),'Refusing non-loopback database');
    const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,multipleStatements:true});
    try{
        const[[before]]=await connection.query('SELECT COUNT(*) campaigns,SUM(DiscoveryMode=\'eligible_only\') eligibleOnly,SUM(DiscoveryMode=\'public_listing\') publicListing FROM SafetyVote_Campaigns');
        const migration=fs.readFileSync(path.join(__dirname,'..','migrations','20261024_safety_vote_company_wide_visibility.sql'),'utf8');
        await connection.query(migration);await connection.query(migration);
        if(process.argv.includes('--activate-local'))await connection.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='local-activation' WHERE SettingKey='company_wide_campaign_visibility_enabled'");
        const[[after]]=await connection.query('SELECT COUNT(*) campaigns,SUM(DiscoveryMode=\'eligible_only\') eligibleOnly,SUM(DiscoveryMode=\'public_listing\') publicListing FROM SafetyVote_Campaigns');
        assert.deepStrictEqual(Object.values(after).map(value=>Number(value||0)),Object.values(before).map(value=>Number(value||0)),'existing campaign rows changed');
        const[[setting]]=await connection.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='company_wide_campaign_visibility_enabled'");
        console.log(JSON.stringify({decision:'PASS_LOCAL_COMPANY_WIDE_VISIBILITY_SCHEMA',enabled:String(setting.SettingValue)==='1',existingCampaignsPreserved:true,campaigns:Number(after.campaigns),productionConnected:false}));
    }finally{await connection.end();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});\n