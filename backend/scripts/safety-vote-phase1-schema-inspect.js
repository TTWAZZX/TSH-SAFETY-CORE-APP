'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TABLES = [
    'employees',
    'master_departments',
    'master_safetyunits',
    'master_positions',
    'admin_rolepermissions',
    'admin_userpermissions',
    'admin_auditlogs',
];

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
        ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true'
            ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
            : undefined,
    });
    try {
        await connection.query('SET SESSION TRANSACTION READ ONLY');
        await connection.beginTransaction();
        const [[server]] = await connection.query('SELECT VERSION() version, DATABASE() databaseName');
        const [columns] = await connection.query(
            `SELECT TABLE_NAME tableName, COLUMN_NAME columnName, COLUMN_TYPE columnType,
                    IS_NULLABLE isNullable, COLUMN_KEY columnKey
               FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA=DATABASE()
                AND LOWER(TABLE_NAME) IN (${TABLES.map(() => '?').join(',')})
              ORDER BY TABLE_NAME, ORDINAL_POSITION`,
            TABLES
        );
        const [safetyVoteTables] = await connection.query(
            `SELECT TABLE_NAME tableName
               FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA=DATABASE()
                AND TABLE_NAME LIKE 'SafetyVote!_%' ESCAPE '!'
              ORDER BY TABLE_NAME`
        );
        await connection.rollback();
        console.log(JSON.stringify({
            mode: 'READ_ONLY_TRANSACTION',
            server,
            tables: [...new Set(columns.map(row => row.tableName))],
            columns,
            safetyVoteTables: safetyVoteTables.map(row => row.tableName),
        }, null, 2));
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(JSON.stringify({
        mode: 'READ_ONLY_TRANSACTION',
        code: error.code || 'SCHEMA_INSPECTION_FAILED',
        message: error.message,
    }));
    process.exitCode = 1;
});
