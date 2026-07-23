function formatPermanentNo(sequence) {
    return `CCCF${String(Number(sequence || 0)).padStart(3, '0')}`;
}

async function addColumnIfMissing(db, table, column, definition) {
    const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (!rows.length) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
}

async function ensureCccfEnhancementSchema(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS cccf_worker_attachments (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            WorkerRecordID  INT NOT NULL,
            OriginalName    VARCHAR(255) NOT NULL,
            StoredName      VARCHAR(255) NOT NULL,
            FileUrl         TEXT NOT NULL,
            MimeType        VARCHAR(100) NOT NULL,
            FileSize        INT NOT NULL DEFAULT 0,
            UploadedBy      VARCHAR(100) DEFAULT NULL,
            CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            IsDeleted       TINYINT(1) NOT NULL DEFAULT 0,
            DeletedBy       VARCHAR(100) DEFAULT NULL,
            DeletedAt       DATETIME DEFAULT NULL,
            KEY idx_cccf_worker_attachment_record (WorkerRecordID, IsDeleted)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await addColumnIfMissing(
        db,
        'CCCF_FormA_Permanent',
        'PermanentYear',
        'PermanentYear SMALLINT UNSIGNED DEFAULT NULL AFTER id'
    );
    await addColumnIfMissing(
        db,
        'CCCF_FormA_Permanent',
        'PermanentSeq',
        'PermanentSeq INT UNSIGNED DEFAULT NULL AFTER PermanentYear'
    );
    await addColumnIfMissing(
        db,
        'CCCF_FormA_Permanent',
        'PermanentNo',
        'PermanentNo VARCHAR(30) DEFAULT NULL AFTER PermanentSeq'
    );

    await db.query(`
        CREATE TABLE IF NOT EXISTS cccf_permanent_sequences (
            PermanentYear SMALLINT UNSIGNED PRIMARY KEY,
            LastSeq       INT UNSIGNED NOT NULL DEFAULT 0,
            UpdatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await backfillPermanentNumbers(db);
    try {
        await db.query(
            'ALTER TABLE CCCF_FormA_Permanent ADD UNIQUE KEY uq_cccf_permanent_year_seq (PermanentYear, PermanentSeq)'
        );
    } catch (err) {
        if (!['ER_DUP_KEYNAME', 'ER_DUP_ENTRY'].includes(err.code)) throw err;
    }
}

async function backfillPermanentNumbers(db) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`
            SELECT id,
                   COALESCE(NULLIF(PermanentYear, 0), YEAR(COALESCE(SubmitDate, CreatedAt)), YEAR(CURDATE())) AS NumberYear,
                   PermanentYear,
                   PermanentSeq,
                   PermanentNo
              FROM CCCF_FormA_Permanent
             ORDER BY NumberYear ASC, COALESCE(CreatedAt, SubmitDate) ASC, id ASC
             FOR UPDATE
        `);

        const years = [...new Set(rows.map(row => Number(row.NumberYear)).filter(Boolean))];
        for (const year of years) {
            const yearRows = rows.filter(row => Number(row.NumberYear) === year);
            const existingMax = yearRows.reduce((max, row) => Math.max(max, Number(row.PermanentSeq || 0)), 0);
            await connection.query(
                `INSERT INTO cccf_permanent_sequences (PermanentYear, LastSeq)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE LastSeq = GREATEST(LastSeq, VALUES(LastSeq))`,
                [year, existingMax]
            );
            const [[sequenceRow]] = await connection.query(
                'SELECT LastSeq FROM cccf_permanent_sequences WHERE PermanentYear = ? FOR UPDATE',
                [year]
            );
            let lastSeq = Number(sequenceRow?.LastSeq || 0);

            for (const row of yearRows) {
                let sequence = Number(row.PermanentSeq || 0);
                if (!sequence) {
                    sequence = ++lastSeq;
                }
                const permanentNo = formatPermanentNo(sequence);
                if (
                    Number(row.NumberYear) !== Number(row.PermanentYear)
                    || Number(row.PermanentSeq || 0) !== sequence
                    || String(row.PermanentNo || '') !== permanentNo
                ) {
                    await connection.query(
                        `UPDATE CCCF_FormA_Permanent
                            SET PermanentYear = ?, PermanentSeq = ?, PermanentNo = ?
                          WHERE id = ?`,
                        [year, sequence, permanentNo, row.id]
                    );
                }
                lastSeq = Math.max(lastSeq, sequence);
            }

            await connection.query(
                'UPDATE cccf_permanent_sequences SET LastSeq = GREATEST(LastSeq, ?) WHERE PermanentYear = ?',
                [lastSeq, year]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function allocatePermanentNumber(connection, year) {
    const permanentYear = Number(year);
    await connection.query(
        'INSERT IGNORE INTO cccf_permanent_sequences (PermanentYear, LastSeq) VALUES (?, 0)',
        [permanentYear]
    );
    const [[row]] = await connection.query(
        'SELECT LastSeq FROM cccf_permanent_sequences WHERE PermanentYear = ? FOR UPDATE',
        [permanentYear]
    );
    const permanentSeq = Number(row?.LastSeq || 0) + 1;
    await connection.query(
        'UPDATE cccf_permanent_sequences SET LastSeq = ? WHERE PermanentYear = ?',
        [permanentSeq, permanentYear]
    );
    return {
        permanentYear,
        permanentSeq,
        permanentNo: formatPermanentNo(permanentSeq),
    };
}

async function attachWorkerAttachments(db, records) {
    if (!records.length) return records;
    const ids = records.map(row => Number(row.id)).filter(Boolean);
    if (!ids.length) return records;
    const [attachments] = await db.query(
        `SELECT id, WorkerRecordID, OriginalName, StoredName, FileUrl, MimeType, FileSize,
                UploadedBy, CreatedAt
           FROM cccf_worker_attachments
          WHERE IsDeleted = 0
            AND WorkerRecordID IN (${ids.map(() => '?').join(',')})
          ORDER BY id ASC`,
        ids
    );
    const byRecord = new Map();
    attachments.forEach(item => {
        const key = Number(item.WorkerRecordID);
        if (!byRecord.has(key)) byRecord.set(key, []);
        byRecord.get(key).push(item);
    });
    return records.map(row => {
        const workerAttachments = byRecord.get(Number(row.id)) || [];
        return {
            ...row,
            Attachments: workerAttachments,
            AttachmentCount: workerAttachments.length,
        };
    });
}

module.exports = {
    allocatePermanentNumber,
    attachWorkerAttachments,
    ensureCccfEnhancementSchema,
    formatPermanentNo,
};
