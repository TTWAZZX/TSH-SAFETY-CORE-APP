'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const host = String(process.env.DB_HOST || '').trim();
const port = Number(process.env.DB_PORT || 3306);
const user = String(process.env.DB_USER || '');
const password = String(process.env.DB_PASS || '');
const target = String(process.env.DB_NAME || '').trim();
const mysqlBin = process.env.MYSQL_BIN || 'C:\\xampp\\mysql\\bin\\mysql.exe';
const mysqldumpBin = process.env.MYSQLDUMP_BIN || 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
const blocked = new Set(['mysql', 'sys', 'information_schema', 'performance_schema']);
const safeName = /^[A-Za-z0-9_]+$/;
const disposable = `tsh_production_restore_verify_${Date.now()}`;
const localDisposable = `tsh_local_backup_verify_${Date.now()}`;
const recoverLocalBackup = process.argv.includes('--recover-local-backup');
let admin;
let targetReplaced = false;

function quoteIdent(value) {
    assert(safeName.test(value), 'Unsafe database identifier.');
    return `\`${value}\``;
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function newestExport() {
    const parent = path.join(root, 'backups', 'production');
    const candidates = fs.readdirSync(parent, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('full-db-local-sync-'))
        .map(entry => path.join(parent, entry.name))
        .filter(directory => fs.existsSync(path.join(directory, 'result.json')) && fs.existsSync(path.join(directory, 'production-full-database.sql')))
        .sort()
        .reverse();
    assert(candidates.length, 'No successful Production database export was found.');
    return candidates[0];
}

function importSql(database, file, useDatabase = true) {
    const args = ['--no-defaults', '--protocol=tcp', `--host=${host}`, `--port=${port}`, `--user=${user}`, '--default-character-set=utf8mb4'];
    if (useDatabase) args.push(database);
    const result = spawnSync(mysqlBin, args, {
        cwd: root,
        env: { ...process.env, MYSQL_PWD: password },
        input: fs.readFileSync(file),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 300000,
        windowsHide: true
    });
    if (result.error || result.status !== 0) {
        const detail = String(result.stderr || result.error?.message || 'unknown import error').replace(password, '[REDACTED]').slice(0, 2000);
        throw new Error(`MySQL import failed (${database}): ${detail}`);
    }
}

function dumpLocalDatabase(file) {
    const args = [
        '--no-defaults', '--protocol=tcp', `--host=${host}`, `--port=${port}`, `--user=${user}`,
        '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob',
        '--default-character-set=utf8mb4', '--skip-lock-tables', `--result-file=${file}`, target
    ];
    const result = spawnSync(mysqldumpBin, args, {
        cwd: root,
        env: { ...process.env, MYSQL_PWD: password },
        encoding: 'utf8',
        timeout: 300000,
        windowsHide: true
    });
    if (result.error || result.status !== 0) {
        const detail = String(result.stderr || result.error?.message || 'unknown dump error').replace(password, '[REDACTED]').slice(0, 2000);
        throw new Error(`Local database backup failed (${target}): ${detail}`);
    }
    assert(fs.existsSync(file) && fs.statSync(file).size > 0, 'Local database backup is empty.');
}

async function inventory(database) {
    const connection = await mysql.createConnection({ host, port, user, password, database });
    try {
        const [tables] = await connection.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME", [database]);
        let rows = 0;
        for (const table of tables) {
            const name = String(table.TABLE_NAME);
            assert(safeName.test(name), `Unsafe table identifier in restored database: ${name}`);
            const [[count]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`);
            rows += Number(count.count);
        }
        return { tables: tables.length, rows };
    } finally {
        await connection.end();
    }
}

async function recreate(database) {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

(async () => {
    assert(['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase()), 'Refusing to restore a non-loopback database host.');
    assert(safeName.test(target) && !blocked.has(target.toLowerCase()), 'Refusing to replace an unsafe/system database name.');
    assert(fs.existsSync(mysqlBin), 'Local mysql client was not found.');
    assert(fs.existsSync(mysqldumpBin), 'Local mysqldump client was not found.');

    const evidence = newestExport();
    const resultPath = path.join(evidence, 'result.json');
    const sqlPath = path.join(evidence, 'production-full-database.sql');
    const gzipPath = path.join(evidence, 'production-full-database-a.sql.gz');
    const recoveryBackup = path.join(evidence, `local-before-${target}.sql`);
    const localBackup = recoverLocalBackup
        ? recoveryBackup
        : path.join(evidence, `local-before-${target}-${Date.now()}.sql`);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.strictEqual(result.decision, 'PASS_PRODUCTION_FULL_DATABASE_DOWNLOAD');
    assert.strictEqual(sha256(gzipPath), result.sha256, 'Production export SHA-256 no longer matches its signed result.');

    admin = await mysql.createConnection({ host, port, user, password });
    if (recoverLocalBackup) {
        assert(fs.existsSync(localBackup), `Verified Local recovery backup was not found: ${localBackup}`);
        await recreate(target);
        importSql(target, localBackup);
        const recovered = await inventory(target);
        const output = {
            decision: 'PASS_LOCAL_BACKUP_RECOVERY',
            recoveredAt: new Date().toISOString(),
            targetHost: 'loopback',
            targetDatabase: target,
            backup: path.relative(root, localBackup).replace(/\\/g, '/'),
            backupSha256: sha256(localBackup),
            tables: recovered.tables,
            rows: recovered.rows
        };
        fs.writeFileSync(path.join(evidence, 'local-recovery-result.json'), `${JSON.stringify(output, null, 2)}\n`);
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        return;
    }
    const [[targetExists]] = await admin.query('SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [target]);
    assert.strictEqual(Number(targetExists.count), 1, `Local target database does not exist: ${target}`);
    const localBefore = await inventory(target);
    dumpLocalDatabase(localBackup);
    await recreate(localDisposable);
    importSql(localDisposable, localBackup);
    const localBackupVerification = await inventory(localDisposable);
    assert.deepStrictEqual(localBackupVerification, localBefore, 'Fresh Local backup restore inventory does not match the source database.');
    await admin.query(`DROP DATABASE ${quoteIdent(localDisposable)}`);

    await recreate(disposable);
    importSql(disposable, sqlPath);
    const verification = await inventory(disposable);
    assert.deepStrictEqual(verification, { tables: Number(result.tables), rows: Number(result.rows) }, 'Disposable restore inventory does not match Production export.');
    await admin.query(`DROP DATABASE ${quoteIdent(disposable)}`);

    targetReplaced = true;
    try {
        await recreate(target);
        importSql(target, sqlPath);
        const restored = await inventory(target);
        assert.deepStrictEqual(restored, verification, 'Local restored inventory does not match verified disposable restore.');
        const output = {
            decision: 'PASS_PRODUCTION_FULL_DATABASE_LOCAL_RESTORE',
            restoredAt: new Date().toISOString(),
            sourceEvidence: path.relative(root, evidence).replace(/\\/g, '/'),
            targetHost: 'loopback',
            targetDatabase: target,
            tables: restored.tables,
            rows: restored.rows,
            disposableRestoreVerified: true,
            preRestoreBackup: path.relative(root, localBackup).replace(/\\/g, '/'),
            preRestoreBackupSha256: sha256(localBackup),
            preRestoreBackupVerified: true,
            localBefore
        };
        fs.writeFileSync(path.join(evidence, 'local-restore-result.json'), `${JSON.stringify(output, null, 2)}\n`);
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } catch (error) {
        await recreate(target);
        importSql(target, localBackup, false);
        targetReplaced = false;
        throw new Error(`Production restore failed; previous Local database was restored from backup. ${error.message}`);
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(disposable)}`).catch(() => {});
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(localDisposable)}`).catch(() => {});
        await admin.end().catch(() => {});
    }
});

