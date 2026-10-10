'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),mysql=require('mysql2/promise');require('dotenv').config({path:path.join(__dirname,'..','.env')});
const loopback=new Set(['localhost','127.0.0.1','::1']);
(async()=>{
    assert(loopback.has(String(process.env.DB_HOST||'').trim().toLowerCase()),'Refusing non-loopback database');
    const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,multipleStatements:true});
    try {
        const [required]=await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('SafetyVote_Settings','SafetyVote_Promotions','SafetyVote_AdminSavedViews','SafetyVote_CampaignTemplates')");
        assert.strictEqual(required.length,4,'Phase 9A/9B local baseline is required before Phase 9C migration');
        const [[before]]=await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers,(SELECT COUNT(*) FROM SafetyVote_JuryScores) jury,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications');
        const migration=fs.readFileSync(path.join(__dirname,'..','migrations','20261010_safety_vote_ux_phase9c_engagement_analytics.sql'),'utf8');
        await db.query(migration);
        await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='local_phase9c' WHERE SettingKey='engagement_enabled'");
        const [[after]]=await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers,(SELECT COUNT(*) FROM SafetyVote_JuryScores) jury,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications');
        assert.deepStrictEqual(Object.values(after).map(Number),Object.values(before).map(Number),'protected business rows changed');
        const [[table]]=await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_EngagementCounters'");
        const [settings]=await db.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('module_enabled','engagement_enabled','ux_phase9c_contract') ORDER BY SettingKey");
        assert.strictEqual(Number(table.total),1);assert.strictEqual(settings.find(row=>row.SettingKey==='engagement_enabled')?.SettingValue,'1');
        console.log(JSON.stringify({decision:'PASS_LOCAL_PHASE9C_ENABLED',host:'loopback',database:process.env.DB_NAME,analyticsTable:true,settings,protectedRowsUnchanged:true,productionConnected:false}));
    } finally { await db.end(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
