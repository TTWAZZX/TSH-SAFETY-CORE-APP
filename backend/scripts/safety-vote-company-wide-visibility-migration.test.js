'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});

const root=path.resolve(__dirname,'..','..');
const databaseName=`tsh_sv_visibility_${process.pid}_${Date.now()}`;
const guard=/^tsh_sv_visibility_\d+_\d+$/;
const loopback=new Set(['localhost','127.0.0.1','::1']);
let admin,db;

(async()=>{
    assert(loopback.has(String(process.env.DB_HOST||'').trim().toLowerCase()),'Refusing non-loopback DB_HOST');
    assert(guard.test(databaseName),'Disposable database name rejected');
    const config={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS};
    admin=await mysql.createConnection({...config,multipleStatements:true});
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db=await mysql.createConnection({...config,database:databaseName,multipleStatements:true});
    await db.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT(1),PRIMARY KEY(role,permission))');
    await db.query(fs.readFileSync(path.join(root,'backend','migrations','20261008_safety_vote_phase1_foundation.sql'),'utf8'));
    const[created]=await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES('LEGACY-001','Draft','A1','eligible_only','A1','A1')");
    const migration=fs.readFileSync(path.join(root,'backend','migrations','20261024_safety_vote_company_wide_visibility.sql'),'utf8');
    await db.query(migration);await db.query(migration);
    const[[legacy]]=await db.query('SELECT DiscoveryMode FROM SafetyVote_Campaigns WHERE id=?',[created.insertId]);
    assert.strictEqual(legacy.DiscoveryMode,'eligible_only','migration rewrote an existing campaign');
    const[settings]=await db.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey LIKE 'company_wide_campaign_visibility_%' ORDER BY SettingKey");
    assert.deepStrictEqual(settings.map(row=>[row.SettingKey,String(row.SettingValue)]),[
        ['company_wide_campaign_visibility_contract','2026-10-24-company-wide-campaign-visibility-r1'],
        ['company_wide_campaign_visibility_enabled','0'],
    ]);
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='company_wide_campaign_visibility_enabled'");
    await db.query(migration);
    const[[enabled]]=await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='company_wide_campaign_visibility_enabled'");
    assert.strictEqual(String(enabled.SettingValue),'1','idempotent migration disabled an activated Local gate');
    await db.query(fs.readFileSync(path.join(root,'backend','migrations','20261024_safety_vote_company_wide_visibility.rollback.sql'),'utf8'));
    const[[rolledBack]]=await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='company_wide_campaign_visibility_enabled'");
    const[[preserved]]=await db.query('SELECT COUNT(*) count FROM SafetyVote_Campaigns WHERE id=?',[created.insertId]);
    assert.strictEqual(String(rolledBack.SettingValue),'0');assert.strictEqual(Number(preserved.count),1);
    console.log('Safety Vote company-wide visibility disposable migration: PASS (idempotent, fail-closed, activation-preserving, data-preserving rollback)');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    if(db)await db.end().catch(()=>{});
    if(admin&&guard.test(databaseName))await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(()=>{});
    if(admin)await admin.end().catch(()=>{});
});
