'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '../..');
const migrationName = '20260911_bbs_scoped_card_artwork.sql';
require('dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });

const quoteIdentifier = value => '`' + String(value).replaceAll('`', '``') + '`';
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function tableCounts(connection) {
    const [tables] = await connection.query(
        "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
        [process.env.DB_NAME]
    );
    const counts = [];
    for (const { name } of tables) {
        const [[row]] = await connection.query(`SELECT COUNT(*) count FROM ${quoteIdentifier(name)}`);
        counts.push({ name, count: Number(row.count) });
    }
    return counts;
}

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error('This migration runner is restricted to the local database.');
    }

    const backupDir = path.join(root, 'backups', `bbs-scoped-artwork-local-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(backupDir, { recursive: true });
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    try {
        const [[server]] = await connection.query('SELECT @@innodb_force_recovery recovery, @@read_only readOnly');
        if (Number(server.recovery) !== 0 || Number(server.readOnly) !== 0) {
            throw new Error('Local MySQL must be healthy and writable before migration.');
        }

        const before = await tableCounts(connection);
        const [flagsBefore] = await connection.query(
            "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','staged_admin_only','pilot_scope_only') ORDER BY SettingKey"
        );
        const sqlFile = path.join(backupDir, 'database-before.sql');
        const dump = cp.spawnSync(
            process.env.MYSQLDUMP_BIN || 'C:/xampp/mysql/bin/mysqldump.exe',
            [
                '--no-defaults', `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT || 3306}`,
                `--user=${process.env.DB_USER}`, '--single-transaction', '--routines', '--triggers', '--events',
                '--hex-blob', '--default-character-set=utf8mb4', '--databases', process.env.DB_NAME,
                `--result-file=${sqlFile}`
            ],
            { env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || '' }, encoding: 'utf8', windowsHide: true, timeout: 120000 }
        );
        if (dump.error || dump.status !== 0) throw new Error(dump.error?.message || dump.stderr || 'Local database backup failed.');
        const sqlBackup = fs.readFileSync(sqlFile);
        if (!sqlBackup.length || !sqlBackup.toString('utf8').includes('-- Dump completed on')) throw new Error('Local SQL backup is incomplete.');

        const uploadSource = path.join(root, 'backend/private-uploads/bbs-card-master-artwork');
        if (fs.existsSync(uploadSource)) fs.cpSync(uploadSource, path.join(backupDir, 'bbs-card-master-artwork'), { recursive: true });

        const manifest = {
            createdAt: new Date().toISOString(), migration: migrationName,
            databaseBytes: sqlBackup.length, databaseSha256: sha256(sqlBackup), before, flagsBefore
        };
        fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        const migration = fs.readFileSync(path.join(root, 'backend/migrations', migrationName), 'utf8');
        await connection.query(migration);

        const after = await tableCounts(connection);
        const beforeMap = new Map(before.map(row => [row.name.toLowerCase(), row.count]));
        const allowedNew = new Set(['bbs_card_artwork_slots', 'bbs_card_artwork_versions']);
        const changedExistingTableCounts = after
            .filter(row => beforeMap.has(row.name.toLowerCase()) && beforeMap.get(row.name.toLowerCase()) !== row.count)
            .map(row => ({ name: row.name, before: beforeMap.get(row.name.toLowerCase()), after: row.count }));
        const newTables = after.filter(row => !beforeMap.has(row.name.toLowerCase())).map(row => row.name.toLowerCase());
        const unexpectedNewTables = newTables.filter(name => !allowedNew.has(name));
        const finalTables = new Set(after.map(row => row.name.toLowerCase()));
        const [columns] = await connection.query(
            `SELECT LOWER(TABLE_NAME) tableName,COLUMN_NAME columnName FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=? AND (
                (LOWER(TABLE_NAME)='bbs_card_layout_assets' AND COLUMN_NAME='ArtworkVersionID') OR
                (LOWER(TABLE_NAME)='bbs_card_layout_sides' AND COLUMN_NAME='ArtworkRole') OR
                (LOWER(TABLE_NAME)='bbs_card_layout_versions' AND COLUMN_NAME IN ('PreviewDepartmentID','PreviewSafetyUnitID')) OR
                (LOWER(TABLE_NAME) IN ('bbs_card_templates','bbs_department_card_templates') AND COLUMN_NAME='SafetyUnitID')
             )`,
            [process.env.DB_NAME]
        );
        const [flagsAfter] = await connection.query(
            "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','staged_admin_only','pilot_scope_only') ORDER BY SettingKey"
        );
        manifest.after = { newTables, changedExistingTableCounts, columnCount: columns.length, flagsAfter };
        fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        if (!allowedNew.size || ![...allowedNew].every(name => finalTables.has(name)) || unexpectedNewTables.length || changedExistingTableCounts.length || columns.length !== 6 || JSON.stringify(flagsBefore) !== JSON.stringify(flagsAfter)) {
            throw new Error(`Post-migration reconciliation failed; inspect ${backupDir}`);
        }
        console.log(JSON.stringify({ backupDir, databaseSha256: manifest.databaseSha256, ...manifest.after }, null, 2));
    } finally {
        await connection.end();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
