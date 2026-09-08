-- BBS card Master Artwork: four isolated, versioned slots.
-- Personal/Department and Front/Back are deliberately separate domains.
-- Existing templates, layouts, cards, QR records, print snapshots and files are unchanged.

CREATE TABLE IF NOT EXISTS BBS_Card_Master_Artwork (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateKind VARCHAR(20) NOT NULL,
    Side VARCHAR(10) NOT NULL,
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
    ActiveKind VARCHAR(20)
        GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN TemplateKind ELSE NULL END) STORED,
    ActiveSide VARCHAR(10)
        GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN Side ELSE NULL END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_master_artwork_version (TemplateKind,Side,VersionNo),
    UNIQUE KEY uq_bbs_master_artwork_active_slot (ActiveKind,ActiveSide),
    KEY idx_bbs_master_artwork_slot (TemplateKind,Side,Status,VersionNo),
    CONSTRAINT chk_bbs_master_artwork_kind CHECK (TemplateKind IN ('Personal','Department')),
    CONSTRAINT chk_bbs_master_artwork_side CHECK (Side IN ('Front','Back')),
    CONSTRAINT chk_bbs_master_artwork_status CHECK (Status IN ('Active','Archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE BBS_Card_Layout_Assets
    ADD COLUMN IF NOT EXISTS MasterArtworkID BIGINT UNSIGNED NULL AFTER LayoutVersionID;

SET @bbs_master_artwork_fk_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_bbs_layout_asset_master_artwork'
);
SET @bbs_master_artwork_fk_sql := IF(
    @bbs_master_artwork_fk_exists = 0,
    'ALTER TABLE BBS_Card_Layout_Assets ADD CONSTRAINT fk_bbs_layout_asset_master_artwork FOREIGN KEY (MasterArtworkID) REFERENCES BBS_Card_Master_Artwork(id)',
    'SELECT 1'
);
PREPARE bbs_master_artwork_fk_stmt FROM @bbs_master_artwork_fk_sql;
EXECUTE bbs_master_artwork_fk_stmt;
DEALLOCATE PREPARE bbs_master_artwork_fk_stmt;

SET @bbs_master_artwork_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'BBS_Card_Layout_Assets'
      AND INDEX_NAME = 'idx_bbs_layout_asset_master_artwork'
);
SET @bbs_master_artwork_index_sql := IF(
    @bbs_master_artwork_index_exists = 0,
    'ALTER TABLE BBS_Card_Layout_Assets ADD KEY idx_bbs_layout_asset_master_artwork (MasterArtworkID)',
    'SELECT 1'
);
PREPARE bbs_master_artwork_index_stmt FROM @bbs_master_artwork_index_sql;
EXECUTE bbs_master_artwork_index_stmt;
DEALLOCATE PREPARE bbs_master_artwork_index_stmt;
