'use strict';

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const confirmation = String(process.env.JOHNNY_RETENTION_CONFIRM || '');
const chatDays = Math.min(3650, Math.max(30, Number.parseInt(process.env.JOHNNY_CHAT_RETENTION_DAYS || '180', 10) || 180));
const logDays = Math.min(365, Math.max(1, Number.parseInt(process.env.JOHNNY_OPERATIONAL_LOG_RETENTION_DAYS || '30', 10) || 30));

async function main() {
    if (apply && confirmation !== 'DELETE_EXPIRED_JOHNNY_DATA') {
        throw new Error('Apply refused: set JOHNNY_RETENTION_CONFIRM=DELETE_EXPIRED_JOHNNY_DATA for the approved maintenance window');
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    try {
        const [[preview]] = await connection.query(`
            SELECT
                (SELECT COUNT(*) FROM johnny_chat_conversations WHERE UpdatedAt < DATE_SUB(NOW(), INTERVAL ${chatDays} DAY)) AS conversations,
                (SELECT COUNT(*) FROM johnny_chat_messages m INNER JOIN johnny_chat_conversations c ON c.id=m.ConversationID WHERE c.UpdatedAt < DATE_SUB(NOW(), INTERVAL ${chatDays} DAY)) AS messages,
                (SELECT COUNT(*) FROM johnny_answer_feedback f INNER JOIN johnny_chat_conversations c ON c.id=f.ConversationID WHERE c.UpdatedAt < DATE_SUB(NOW(), INTERVAL ${chatDays} DAY)) AS feedback,
                (SELECT COUNT(*) FROM johnny_operational_logs WHERE CreatedAt < DATE_SUB(NOW(), INTERVAL ${logDays} DAY)) AS operationalLogs
        `);
        const result = {
            mode: apply ? 'apply' : 'dry-run',
            chatRetentionDays: chatDays,
            operationalLogRetentionDays: logDays,
            eligible: Object.fromEntries(Object.entries(preview).map(([key, value]) => [key, Number(value || 0)])),
            deleted: { conversations: 0, messages: 0, feedback: 0, operationalLogs: 0 },
        };
        if (!apply) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        await connection.beginTransaction();
        try {
            const [messages] = await connection.query(`
                DELETE m FROM johnny_chat_messages m
                INNER JOIN johnny_chat_conversations c ON c.id=m.ConversationID
                WHERE c.UpdatedAt < DATE_SUB(NOW(), INTERVAL ${chatDays} DAY)
            `);
            const [conversations] = await connection.query(`
                DELETE FROM johnny_chat_conversations
                WHERE UpdatedAt < DATE_SUB(NOW(), INTERVAL ${chatDays} DAY)
            `);
            const [logs] = await connection.query(`
                DELETE FROM johnny_operational_logs
                WHERE CreatedAt < DATE_SUB(NOW(), INTERVAL ${logDays} DAY)
            `);
            await connection.commit();
            result.deleted = {
                conversations: Number(conversations.affectedRows || 0),
                messages: Number(messages.affectedRows || 0),
                feedback: result.eligible.feedback,
                operationalLogs: Number(logs.affectedRows || 0),
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        }
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(`Johnny retention maintenance failed: ${error.message}`);
    process.exit(1);
});
