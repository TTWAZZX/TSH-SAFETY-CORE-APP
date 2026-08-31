-- BBS Smart Card Phase 4: opaque QR, card templates, issue/revoke/replace, and print audit.
-- Additive and idempotent. Raw QR tokens are never stored.

CREATE TABLE IF NOT EXISTS BBS_Card_Templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateName VARCHAR(160) NOT NULL,
    DepartmentID INT NULL,
    BBSLevel VARCHAR(40) NULL,
    BackgroundStoredName VARCHAR(255) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(80) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL DEFAULT 0,
    WidthMM DECIMAL(6,2) NOT NULL DEFAULT 85.60,
    HeightMM DECIMAL(6,2) NOT NULL DEFAULT 53.98,
    IncludeEmployeeID TINYINT(1) NOT NULL DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(50) NOT NULL,
    UpdatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ActivatedAt DATETIME NULL,
    ActivatedBy VARCHAR(50) NULL,
    ArchivedAt DATETIME NULL,
    ArchivedBy VARCHAR(50) NULL,
    PRIMARY KEY (id),
    KEY idx_bbs_card_template_scope (DepartmentID, BBSLevel, Status),
    CONSTRAINT fk_bbs_card_template_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Cards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    EmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    TemplateID BIGINT UNSIGNED NOT NULL,
    TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    TokenFingerprint CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    IssueReason VARCHAR(255) NULL,
    IssuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    IssuedBy VARCHAR(50) NOT NULL,
    RevokedAt DATETIME NULL,
    RevokedBy VARCHAR(50) NULL,
    RevokeReason VARCHAR(255) NULL,
    ReplacedByCardID BIGINT UNSIGNED NULL,
    LastResolvedAt DATETIME NULL,
    ResolveCount INT UNSIGNED NOT NULL DEFAULT 0,
    ActiveEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (CASE WHEN Status = 'Active' THEN EmployeeID ELSE NULL END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_card_token_hash (TokenHash),
    UNIQUE KEY uq_bbs_card_one_active_employee (ActiveEmployeeID),
    KEY idx_bbs_card_employee_status (EmployeeID, Status),
    KEY idx_bbs_card_template (TemplateID),
    CONSTRAINT fk_bbs_card_employee FOREIGN KEY (EmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_card_template FOREIGN KEY (TemplateID) REFERENCES BBS_Card_Templates(id),
    CONSTRAINT fk_bbs_card_replacement FOREIGN KEY (ReplacedByCardID) REFERENCES BBS_Cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrade an already-created Phase 4 table without making the migration
-- non-idempotent. The generated nullable key allows unlimited history while
-- guaranteeing at most one Active card per employee under concurrent writes.
SET @bbs_active_column_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BBS_Cards'
      AND COLUMN_NAME = 'ActiveEmployeeID'
);
SET @bbs_active_column_sql := IF(
    @bbs_active_column_exists = 0,
    'ALTER TABLE BBS_Cards ADD COLUMN ActiveEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN Status = ''Active'' THEN EmployeeID ELSE NULL END) STORED',
    'SELECT 1'
);
PREPARE bbs_active_column_stmt FROM @bbs_active_column_sql;
EXECUTE bbs_active_column_stmt;
DEALLOCATE PREPARE bbs_active_column_stmt;

SET @bbs_active_index_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'BBS_Cards'
      AND INDEX_NAME = 'uq_bbs_card_one_active_employee'
);
SET @bbs_active_index_sql := IF(
    @bbs_active_index_exists = 0,
    'ALTER TABLE BBS_Cards ADD UNIQUE KEY uq_bbs_card_one_active_employee (ActiveEmployeeID)',
    'SELECT 1'
);
PREPARE bbs_active_index_stmt FROM @bbs_active_index_sql;
EXECUTE bbs_active_index_stmt;
DEALLOCATE PREPARE bbs_active_index_stmt;

CREATE TABLE IF NOT EXISTS BBS_Card_Print_Logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    CardID BIGINT UNSIGNED NOT NULL,
    PrintMode VARCHAR(20) NOT NULL DEFAULT 'single',
    PrintedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PrintedBy VARCHAR(50) NOT NULL,
    Reason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY idx_bbs_print_card (CardID, PrintedAt),
    CONSTRAINT fk_bbs_print_card FOREIGN KEY (CardID) REFERENCES BBS_Cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_QR_Resolve_Attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    IPHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    TokenFingerprint CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Successful TINYINT(1) NOT NULL DEFAULT 0,
    AttemptedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_qr_rate (IPHash, AttemptedAt),
    KEY idx_bbs_qr_cleanup (AttemptedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('qr_resolve_limit_5m', '30')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);
