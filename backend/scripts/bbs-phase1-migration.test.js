'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const databaseName = `tsh_bbs_phase1_test_${process.pid}_${Date.now()}`;
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260825_bbs_phase1_foundation.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260825_bbs_phase1_foundation.rollback.sql'), 'utf8');
let admin;
let testDb;
let created = false;

async function main() {
    assert.match(databaseName, /^tsh_bbs_phase1_test_\d+_\d+$/, 'Unsafe test database name.');
    admin = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        port: Number(process.env.DB_PORT || 3306),
        multipleStatements: true,
    });
    const [[existing]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]);
    assert.strictEqual(Number(existing.count), 0, 'Dedicated BBS migration test database already exists.');
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    testDb = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        port: Number(process.env.DB_PORT || 3306),
        multipleStatements: true,
    });
    await testDb.query(`
        CREATE TABLE Master_Positions (id INT PRIMARY KEY, Name VARCHAR(100) NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        CREATE TABLE Master_Departments (id INT PRIMARY KEY, Name VARCHAR(100) NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        CREATE TABLE Master_SafetyUnits (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, department_id INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        INSERT INTO Master_Positions VALUES
          (1,'พนักงาน'),(2,'หัวหน้ากลุ่ม'),(3,'หัวหน้าแผนก'),(4,'หัวหน้าส่วน'),(5,'ผู้จัดการ'),(6,'วิศวกร');
        INSERT INTO Master_Departments VALUES (18,'MAINTENANCE SEC.'),(19,'PRODUCTION 1 SEC.');
        INSERT INTO Master_SafetyUnits VALUES (2,'Tube Cutting',18),(3,'PD1 Assy 3/1',19);
    `);
    await testDb.query(migration);
    await testDb.query(migration);
    const [tables] = await testDb.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME LIKE 'BBS\\_%'", [databaseName]);
    assert.strictEqual(tables.length, 6, 'Migration must create exactly six Phase 1 BBS tables.');
    const [[mapping]] = await testDb.query('SELECT COUNT(*) count FROM BBS_Position_Level_Mappings WHERE IsActive=1');
    const [[kpi]] = await testDb.query("SELECT COUNT(*) count FROM BBS_KPI_Rules WHERE BBSLevel='Group Leader' AND TargetCount=1 AND Weekdays='1,2,3,4,5'");
    const [[pilot]] = await testDb.query('SELECT COUNT(*) count FROM BBS_Pilot_Scopes WHERE DepartmentID=18 AND SafetyUnitID=2 AND IsActive=1');
    assert.strictEqual(Number(mapping.count), 5, 'Approved five-level seed mismatch.');
    assert.strictEqual(Number(kpi.count), 1, 'Approved Group Leader KPI seed mismatch.');
    assert.strictEqual(Number(pilot.count), 1, 'Approved pilot seed mismatch.');

    await testDb.query(rollback);
    const [afterRollback] = await testDb.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME LIKE 'BBS\\_%'", [databaseName]);
    assert.strictEqual(afterRollback.length, 0, 'Rollback must remove all Phase 1 BBS tables in the isolated database.');
    console.log('BBS Phase 1 migration + idempotency + rollback: PASS');
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
}).finally(async () => {
    if (testDb) await testDb.end().catch(() => {});
    if (admin && created) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(() => {});
    if (admin) await admin.end().catch(() => {});
});
