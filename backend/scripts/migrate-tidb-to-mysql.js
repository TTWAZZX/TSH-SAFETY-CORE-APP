const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SOURCE_REQUIRED = ['SOURCE_DB_HOST', 'SOURCE_DB_USER', 'SOURCE_DB_PASS', 'SOURCE_DB_NAME'];
const TARGET_REQUIRED = ['DB_HOST', 'DB_USER', 'DB_NAME'];

function requireEnv(keys) {
    const missing = keys.filter((key) => !(key in process.env));
    if (missing.length) {
        throw new Error(`Missing env: ${missing.join(', ')}`);
    }
}

function quoteId(identifier) {
    return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeCreateTable(sql) {
    const withoutConstraints = sql
        .split(/\r?\n/)
        .filter((line) => !/^\s*CONSTRAINT\s+`?[^`\s]+`?\s+FOREIGN KEY/i.test(line))
        .join('\n')
        .replace(/,\n\) ENGINE=/, '\n) ENGINE=');

    return withoutConstraints
        .replace(/ AUTO_RANDOM(?:\([^)]+\))?/gi, '')
        .replace(/\/\*T!\[[^\]]+\]\s*/g, '/* ')
        .replace(/\s+CLUSTERED/gi, '')
        .replace(/\s+NONCLUSTERED/gi, '');
}

function normalizeValue(value, columnType) {
    if (value === null || value === undefined) return value;
    if (String(columnType).toLowerCase() === 'json' && typeof value !== 'string') {
        return JSON.stringify(value);
    }
    return value;
}

async function main() {
    requireEnv(SOURCE_REQUIRED);
    requireEnv(TARGET_REQUIRED);

    const source = await mysql.createConnection({
        host: process.env.SOURCE_DB_HOST,
        port: Number(process.env.SOURCE_DB_PORT || 4000),
        user: process.env.SOURCE_DB_USER,
        password: process.env.SOURCE_DB_PASS,
        database: process.env.SOURCE_DB_NAME,
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true,
        },
    });

    const target = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME,
        multipleStatements: false,
    });

    const [tableRows] = await source.query(
        `SELECT TABLE_NAME
         FROM information_schema.tables
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [process.env.SOURCE_DB_NAME]
    );
    const tables = tableRows.map((row) => row.TABLE_NAME);

    console.log(`Found ${tables.length} source table(s).`);
    await target.query('SET FOREIGN_KEY_CHECKS = 0');

    try {
        for (const table of tables) {
            const tableId = quoteId(table);
            console.log(`Migrating ${table}...`);

            const [createRows] = await source.query(`SHOW CREATE TABLE ${tableId}`);
            const createSql = normalizeCreateTable(createRows[0]['Create Table']);

            await target.query(`DROP TABLE IF EXISTS ${tableId}`);
            await target.query(createSql);

            const [[{ total }]] = await source.query(`SELECT COUNT(*) AS total FROM ${tableId}`);
            if (!total) {
                console.log(`  created, 0 row(s).`);
                continue;
            }

            const [columns] = await source.query(`SHOW COLUMNS FROM ${tableId}`);
            const columnNames = columns.map((column) => column.Field);
            const columnTypes = new Map(columns.map((column) => [column.Field, column.Type]));
            const insertSql = `INSERT INTO ${tableId} (${columnNames.map(quoteId).join(', ')}) VALUES ?`;
            const selectSql = `SELECT ${columnNames.map(quoteId).join(', ')} FROM ${tableId}`;
            const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);

            let migrated = 0;
            for (let offset = 0; offset < total; offset += batchSize) {
                const [rows] = await source.query(`${selectSql} LIMIT ? OFFSET ?`, [batchSize, offset]);
                if (!rows.length) break;
                const values = rows.map((row) =>
                    columnNames.map((column) => normalizeValue(row[column], columnTypes.get(column)))
                );
                await target.query(insertSql, [values]);
                migrated += rows.length;
            }

            console.log(`  copied ${migrated}/${total} row(s).`);
        }
    } finally {
        await target.query('SET FOREIGN_KEY_CHECKS = 1');
        await source.end();
        await target.end();
    }

    console.log('Migration completed.');
}

main().catch((err) => {
    console.error('Migration failed:', err.message || err);
    process.exitCode = 1;
});
