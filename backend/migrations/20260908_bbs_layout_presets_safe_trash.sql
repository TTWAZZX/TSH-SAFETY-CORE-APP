-- BBS Card Designer: reusable kind-scoped layout presets and recoverable trash.
-- Additive only. No template, layout, card, print history, or private file is deleted.

CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Presets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateKind VARCHAR(20) NOT NULL,
    PresetName VARCHAR(160) NOT NULL,
    LayoutJSON LONGTEXT NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(50) NOT NULL,
    UpdatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    TrashedAt DATETIME NULL,
    TrashedBy VARCHAR(50) NULL,
    PRIMARY KEY (id),
    KEY idx_bbs_layout_preset_kind_status (TemplateKind,Status,UpdatedAt,id),
    CONSTRAINT chk_bbs_layout_preset_kind CHECK (TemplateKind IN ('Personal','Department')),
    CONSTRAINT chk_bbs_layout_preset_status CHECK (Status IN ('Active','Trashed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @bbs_template_deleted_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Card_Templates' AND COLUMN_NAME='IsDeleted');
SET @bbs_template_deleted_sql := IF(@bbs_template_deleted_col=0,'ALTER TABLE BBS_Card_Templates ADD COLUMN IsDeleted TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN DeletedAt DATETIME NULL, ADD COLUMN DeletedBy VARCHAR(50) NULL, ADD KEY idx_bbs_card_template_deleted (IsDeleted,Status,UpdatedAt)','SELECT 1');
PREPARE bbs_template_deleted_stmt FROM @bbs_template_deleted_sql; EXECUTE bbs_template_deleted_stmt; DEALLOCATE PREPARE bbs_template_deleted_stmt;

SET @bbs_dept_template_deleted_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Department_Card_Templates' AND COLUMN_NAME='IsDeleted');
SET @bbs_dept_template_deleted_sql := IF(@bbs_dept_template_deleted_col=0,'ALTER TABLE BBS_Department_Card_Templates ADD COLUMN IsDeleted TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN DeletedAt DATETIME NULL, ADD COLUMN DeletedBy VARCHAR(50) NULL, ADD KEY idx_bbs_dept_template_deleted (IsDeleted,Status,UpdatedAt)','SELECT 1');
PREPARE bbs_dept_template_deleted_stmt FROM @bbs_dept_template_deleted_sql; EXECUTE bbs_dept_template_deleted_stmt; DEALLOCATE PREPARE bbs_dept_template_deleted_stmt;

SET @bbs_layout_deleted_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Card_Layout_Versions' AND COLUMN_NAME='IsDeleted');
SET @bbs_layout_deleted_sql := IF(@bbs_layout_deleted_col=0,'ALTER TABLE BBS_Card_Layout_Versions ADD COLUMN IsDeleted TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN DeletedAt DATETIME NULL, ADD COLUMN DeletedBy VARCHAR(50) NULL, ADD KEY idx_bbs_layout_deleted (IsDeleted,TemplateKind,Status,UpdatedAt)','SELECT 1');
PREPARE bbs_layout_deleted_stmt FROM @bbs_layout_deleted_sql; EXECUTE bbs_layout_deleted_stmt; DEALLOCATE PREPARE bbs_layout_deleted_stmt;
