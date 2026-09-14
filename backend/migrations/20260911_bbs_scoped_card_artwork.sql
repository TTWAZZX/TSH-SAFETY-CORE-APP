-- BBS scoped card artwork foundation.
-- Additive only: keeps every legacy Master Artwork, layout asset, template, card,
-- QR row, print snapshot and private file unchanged.

CREATE TABLE IF NOT EXISTS BBS_Card_Artwork_Slots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    SlotKey VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ArtworkRole VARCHAR(20) NOT NULL,
    TemplateKind VARCHAR(20) NULL,
    DepartmentID INT NULL,
    SafetyUnitID INT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(50) NOT NULL,
    UpdatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_card_artwork_slot_key (SlotKey),
    KEY idx_bbs_card_artwork_slot_scope (ArtworkRole,TemplateKind,DepartmentID,SafetyUnitID,IsActive),
    CONSTRAINT fk_bbs_card_artwork_slot_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id),
    CONSTRAINT fk_bbs_card_artwork_slot_unit FOREIGN KEY (SafetyUnitID) REFERENCES master_safetyunits(id),
    CONSTRAINT chk_bbs_card_artwork_slot_role CHECK (ArtworkRole IN ('GlobalBack','ScopedFront')),
    CONSTRAINT chk_bbs_card_artwork_slot_kind CHECK (TemplateKind IS NULL OR TemplateKind IN ('Personal','Department')),
    CONSTRAINT chk_bbs_card_artwork_slot_shape CHECK (
        (ArtworkRole='GlobalBack' AND TemplateKind IS NULL AND DepartmentID IS NULL AND SafetyUnitID IS NULL)
        OR
        (ArtworkRole='ScopedFront' AND TemplateKind IS NOT NULL AND DepartmentID IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Card_Artwork_Versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ArtworkSlotID BIGINT UNSIGNED NOT NULL,
    VersionNo INT UNSIGNED NOT NULL,
    StoredName VARCHAR(255) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(80) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL,
    PixelWidth INT UNSIGNED NULL,
    PixelHeight INT UNSIGNED NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    CreatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ActivatedAt DATETIME NULL,
    ArchivedAt DATETIME NULL,
    ActiveArtworkSlotID BIGINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN ArtworkSlotID ELSE NULL END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_card_artwork_version (ArtworkSlotID,VersionNo),
    UNIQUE KEY uq_bbs_card_artwork_active_version (ActiveArtworkSlotID),
    KEY idx_bbs_card_artwork_version_status (ArtworkSlotID,Status,VersionNo),
    CONSTRAINT fk_bbs_card_artwork_version_slot FOREIGN KEY (ArtworkSlotID) REFERENCES BBS_Card_Artwork_Slots(id),
    CONSTRAINT chk_bbs_card_artwork_version_status CHECK (Status IN ('Active','Archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE BBS_Card_Layout_Assets
    ADD COLUMN IF NOT EXISTS ArtworkVersionID BIGINT UNSIGNED NULL AFTER MasterArtworkID;

SET @bbs_artwork_asset_fk_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_bbs_layout_asset_artwork_version'
);
SET @bbs_artwork_asset_fk_sql := IF(@bbs_artwork_asset_fk_exists=0,
    'ALTER TABLE BBS_Card_Layout_Assets ADD CONSTRAINT fk_bbs_layout_asset_artwork_version FOREIGN KEY (ArtworkVersionID) REFERENCES BBS_Card_Artwork_Versions(id)',
    'SELECT 1');
PREPARE bbs_artwork_asset_fk_stmt FROM @bbs_artwork_asset_fk_sql;
EXECUTE bbs_artwork_asset_fk_stmt;
DEALLOCATE PREPARE bbs_artwork_asset_fk_stmt;

SET @bbs_artwork_asset_index_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Card_Layout_Assets' AND INDEX_NAME='idx_bbs_layout_asset_artwork_version'
);
SET @bbs_artwork_asset_index_sql := IF(@bbs_artwork_asset_index_exists=0,
    'ALTER TABLE BBS_Card_Layout_Assets ADD KEY idx_bbs_layout_asset_artwork_version (ArtworkVersionID)',
    'SELECT 1');
PREPARE bbs_artwork_asset_index_stmt FROM @bbs_artwork_asset_index_sql;
EXECUTE bbs_artwork_asset_index_stmt;
DEALLOCATE PREPARE bbs_artwork_asset_index_stmt;

ALTER TABLE BBS_Card_Layout_Sides
    ADD COLUMN IF NOT EXISTS ArtworkRole VARCHAR(20) NULL AFTER StorageClass;

-- CardArtwork stores only a logical role on the layout side. The concrete
-- private file/version is resolved from the issue/print context.
SET @bbs_layout_storage_supports_card_artwork := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND CONSTRAINT_NAME='chk_bbs_layout_storage'
      AND CHECK_CLAUSE LIKE '%CardArtwork%'
);
SET @bbs_layout_storage_sql := IF(@bbs_layout_storage_supports_card_artwork=0,
    "ALTER TABLE BBS_Card_Layout_Sides DROP CONSTRAINT chk_bbs_layout_storage, ADD CONSTRAINT chk_bbs_layout_storage CHECK (StorageClass IN ('PersonalTemplate','DepartmentTemplate','DesignerAsset','CardArtwork'))",
    'SELECT 1');
PREPARE bbs_layout_storage_stmt FROM @bbs_layout_storage_sql;
EXECUTE bbs_layout_storage_stmt;
DEALLOCATE PREPARE bbs_layout_storage_stmt;

ALTER TABLE BBS_Card_Layout_Versions
    ADD COLUMN IF NOT EXISTS PreviewDepartmentID INT NULL AFTER DepartmentTemplateID,
    ADD COLUMN IF NOT EXISTS PreviewSafetyUnitID INT NULL AFTER PreviewDepartmentID;

ALTER TABLE BBS_Card_Templates
    ADD COLUMN IF NOT EXISTS SafetyUnitID INT NULL AFTER DepartmentID;

ALTER TABLE BBS_Department_Card_Templates
    ADD COLUMN IF NOT EXISTS SafetyUnitID INT NULL AFTER DepartmentID;

SET @bbs_personal_template_unit_fk_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_bbs_card_template_unit'
);
SET @bbs_personal_template_unit_fk_sql := IF(@bbs_personal_template_unit_fk_exists=0,
    'ALTER TABLE BBS_Card_Templates ADD CONSTRAINT fk_bbs_card_template_unit FOREIGN KEY (SafetyUnitID) REFERENCES master_safetyunits(id)',
    'SELECT 1');
PREPARE bbs_personal_template_unit_fk_stmt FROM @bbs_personal_template_unit_fk_sql;
EXECUTE bbs_personal_template_unit_fk_stmt;
DEALLOCATE PREPARE bbs_personal_template_unit_fk_stmt;

SET @bbs_department_template_unit_fk_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_bbs_department_card_template_unit'
);
SET @bbs_department_template_unit_fk_sql := IF(@bbs_department_template_unit_fk_exists=0,
    'ALTER TABLE BBS_Department_Card_Templates ADD CONSTRAINT fk_bbs_department_card_template_unit FOREIGN KEY (SafetyUnitID) REFERENCES master_safetyunits(id)',
    'SELECT 1');
PREPARE bbs_department_template_unit_fk_stmt FROM @bbs_department_template_unit_fk_sql;
EXECUTE bbs_department_template_unit_fk_stmt;
DEALLOCATE PREPARE bbs_department_template_unit_fk_stmt;

SET @bbs_personal_template_scope_index_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Card_Templates' AND INDEX_NAME='idx_bbs_card_template_scope'
);
SET @bbs_personal_template_scope_index_sql := IF(@bbs_personal_template_scope_index_exists=0,
    'ALTER TABLE BBS_Card_Templates ADD KEY idx_bbs_card_template_scope (DepartmentID,SafetyUnitID,BBSLevel,Status,IsDeleted)',
    'SELECT 1');
PREPARE bbs_personal_template_scope_index_stmt FROM @bbs_personal_template_scope_index_sql;
EXECUTE bbs_personal_template_scope_index_stmt;
DEALLOCATE PREPARE bbs_personal_template_scope_index_stmt;

SET @bbs_department_template_scope_index_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BBS_Department_Card_Templates' AND INDEX_NAME='idx_bbs_department_template_scope'
);
SET @bbs_department_template_scope_index_sql := IF(@bbs_department_template_scope_index_exists=0,
    'ALTER TABLE BBS_Department_Card_Templates ADD KEY idx_bbs_department_template_scope (DepartmentID,SafetyUnitID,Status,IsDeleted,DisplayOrder)',
    'SELECT 1');
PREPARE bbs_department_template_scope_index_stmt FROM @bbs_department_template_scope_index_sql;
EXECUTE bbs_department_template_scope_index_stmt;
DEALLOCATE PREPARE bbs_department_template_scope_index_stmt;
