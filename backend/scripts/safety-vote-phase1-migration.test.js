'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random()*100000)}`;
const databaseName = `tsh_safety_vote_phase1_${stamp}`;
const allowed = /^tsh_safety_vote_phase1_\d+_\d+$/;
const loopback = new Set(['localhost','127.0.0.1','::1']);
let admin;

async function main(){
    assert.ok(loopback.has(String(process.env.DB_HOST||'').trim().toLowerCase()), 'Refusing non-loopback DB_HOST');
    assert.ok(allowed.test(databaseName), 'Disposable database guard rejected generated name');
    admin=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,multipleStatements:true});
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASS,database:databaseName,multipleStatements:true});
    try{
        await db.query(`CREATE TABLE Admin_RolePermissions (role VARCHAR(50) NOT NULL,permission VARCHAR(100) NOT NULL,granted TINYINT(1) NOT NULL DEFAULT 0,PRIMARY KEY(role,permission)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        const migration=fs.readFileSync(path.join(root,'backend','migrations','20261008_safety_vote_phase1_foundation.sql'),'utf8');
        const rollback=fs.readFileSync(path.join(root,'backend','migrations','20261008_safety_vote_phase1_foundation.rollback.sql'),'utf8');
        await db.query(migration);
        await db.query(migration);
        const [tables]=await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME LIKE 'SafetyVote\\_%' ESCAPE '\\\\'",[databaseName]);
        assert.strictEqual(tables.length,10,'Expected ten Phase 1 foundation tables');
        const [[settings]]=await db.query("SELECT COUNT(*) count,SUM(SettingKey='module_enabled' AND SettingValue='0') disabled FROM SafetyVote_Settings");
        assert.strictEqual(Number(settings.count),7);
        assert.strictEqual(Number(settings.disabled),1);
        const [[permissions]]=await db.query("SELECT COUNT(*) count,SUM(role='ADMIN' AND granted=1) adminGrants,SUM(role<>'ADMIN' AND permission<>'SAFETY_VOTE_VIEW' AND granted=1) excessive FROM Admin_RolePermissions WHERE permission LIKE 'SAFETY_VOTE_%'");
        assert.strictEqual(Number(permissions.count),77);
        assert.strictEqual(Number(permissions.adminGrants),11);
        assert.strictEqual(Number(permissions.excessive),0);
        const [campaign]=await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,CreatedBy,UpdatedBy) VALUES('ROLLBACK-PROBE','Draft','ADMIN-UAT','ADMIN-UAT','ADMIN-UAT')");
        const [version]=await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,TitleTh,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','Rollback probe','ADMIN-UAT','ADMIN-UAT')",[campaign.insertId]);
        await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?',[version.insertId,campaign.insertId]);
        await db.query(rollback);
        const [[preserved]]=await db.query('SELECT COUNT(*) count FROM SafetyVote_Campaigns WHERE id=?',[campaign.insertId]);
        const [[disabled]]=await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='module_enabled'");
        assert.strictEqual(Number(preserved.count),1,'Rollback removed campaign data');
        assert.strictEqual(String(disabled.SettingValue),'0');
        console.log('Safety Vote Phase 1 guarded disposable migration: PASS (idempotent additive schema, 10 tables, 77 permission defaults, data-preserving rollback)');
    } finally { await db.end(); }
}

main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;}).finally(async()=>{
    if(admin){if(allowed.test(databaseName))await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(()=>{});const [[row]]=await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?',[databaseName]).catch(()=>[[{count:-1}]]);if(Number(row.count)!==0){console.error('Disposable database residue remains');process.exitCode=1;}await admin.end().catch(()=>{});}
});
