-- BBS Smart Card Phase 10F-1: additive Visual Card Designer foundation.
-- Existing Personal/Department templates, cards, QR records, print logs and files are not modified.

CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateKind VARCHAR(20) NOT NULL,
    PersonalTemplateID BIGINT UNSIGNED NULL,
    DepartmentTemplateID BIGINT UNSIGNED NULL,
    VersionNo INT UNSIGNED NOT NULL,
    WidthMM DECIMAL(7,2) NOT NULL,
    HeightMM DECIMAL(7,2) NOT NULL,
    DPI INT UNSIGNED NOT NULL DEFAULT 300,
    DuplexFlip VARCHAR(20) NOT NULL DEFAULT 'LongEdge',
    BackRotation SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    BootstrapSource VARCHAR(30) NULL,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(50) NOT NULL,
    UpdatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ActivatedAt DATETIME NULL,
    ActivatedBy VARCHAR(50) NULL,
    ArchivedAt DATETIME NULL,
    ArchivedBy VARCHAR(50) NULL,
    ActivePersonalTemplateID BIGINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN PersonalTemplateID ELSE NULL END) STORED,
    ActiveDepartmentTemplateID BIGINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN DepartmentTemplateID ELSE NULL END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_layout_personal_version (PersonalTemplateID,VersionNo),
    UNIQUE KEY uq_bbs_layout_department_version (DepartmentTemplateID,VersionNo),
    UNIQUE KEY uq_bbs_layout_active_personal (ActivePersonalTemplateID),
    UNIQUE KEY uq_bbs_layout_active_department (ActiveDepartmentTemplateID),
    KEY idx_bbs_layout_kind_status (TemplateKind,Status,UpdatedAt),
    CONSTRAINT fk_bbs_layout_personal_template FOREIGN KEY (PersonalTemplateID) REFERENCES BBS_Card_Templates(id),
    CONSTRAINT fk_bbs_layout_department_template FOREIGN KEY (DepartmentTemplateID) REFERENCES BBS_Department_Card_Templates(id),
    CONSTRAINT chk_bbs_layout_parent CHECK (
        (TemplateKind='Personal' AND PersonalTemplateID IS NOT NULL AND DepartmentTemplateID IS NULL)
        OR (TemplateKind='Department' AND DepartmentTemplateID IS NOT NULL AND PersonalTemplateID IS NULL)
    ),
    CONSTRAINT chk_bbs_layout_dimensions CHECK (WidthMM>=20 AND WidthMM<=500 AND HeightMM>=20 AND HeightMM<=500),
    CONSTRAINT chk_bbs_layout_dpi CHECK (DPI>=72 AND DPI<=1200),
    CONSTRAINT chk_bbs_layout_duplex CHECK (DuplexFlip IN ('LongEdge','ShortEdge') AND BackRotation IN (0,180)),
    CONSTRAINT chk_bbs_layout_status CHECK (Status IN ('Draft','Active','Archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Assets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    LayoutVersionID BIGINT UNSIGNED NOT NULL,
    AssetKey VARCHAR(80) NOT NULL,
    StoredName VARCHAR(255) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(80) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PixelWidth INT UNSIGNED NULL,
    PixelHeight INT UNSIGNED NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    CreatedBy VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_layout_asset_key (LayoutVersionID,AssetKey),
    CONSTRAINT fk_bbs_layout_asset_version FOREIGN KEY (LayoutVersionID) REFERENCES BBS_Card_Layout_Versions(id),
    CONSTRAINT chk_bbs_layout_asset_status CHECK (Status IN ('Active','Archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Sides (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    LayoutVersionID BIGINT UNSIGNED NOT NULL,
    Side VARCHAR(10) NOT NULL,
    StorageClass VARCHAR(40) NOT NULL,
    BackgroundStoredName VARCHAR(255) NOT NULL,
    BackgroundOriginalName VARCHAR(255) NOT NULL,
    BackgroundMimeType VARCHAR(80) NOT NULL,
    BackgroundFileSize BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PixelWidth INT UNSIGNED NULL,
    PixelHeight INT UNSIGNED NULL,
    BackgroundFit VARCHAR(20) NOT NULL DEFAULT 'Cover',
    BackgroundPositionXBP INT UNSIGNED NOT NULL DEFAULT 5000,
    BackgroundPositionYBP INT UNSIGNED NOT NULL DEFAULT 5000,
    BleedMM DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    SafeMarginMM DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_layout_side (LayoutVersionID,Side),
    CONSTRAINT fk_bbs_layout_side_version FOREIGN KEY (LayoutVersionID) REFERENCES BBS_Card_Layout_Versions(id),
    CONSTRAINT chk_bbs_layout_side CHECK (Side IN ('Front','Back')),
    CONSTRAINT chk_bbs_layout_storage CHECK (StorageClass IN ('PersonalTemplate','DepartmentTemplate','DesignerAsset')),
    CONSTRAINT chk_bbs_layout_background_fit CHECK (BackgroundFit IN ('Contain','Cover','Stretch')),
    CONSTRAINT chk_bbs_layout_background_position CHECK (BackgroundPositionXBP<=10000 AND BackgroundPositionYBP<=10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Card_Layout_Elements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    LayoutVersionID BIGINT UNSIGNED NOT NULL,
    ElementKey VARCHAR(80) NOT NULL,
    Side VARCHAR(10) NOT NULL,
    ElementType VARCHAR(30) NOT NULL,
    DataSourceKey VARCHAR(80) NULL,
    StaticText TEXT NULL,
    AssetID BIGINT UNSIGNED NULL,
    XBP INT UNSIGNED NOT NULL,
    YBP INT UNSIGNED NOT NULL,
    WidthBP INT UNSIGNED NOT NULL,
    HeightBP INT UNSIGNED NOT NULL,
    RotationDeg DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    ZIndex INT NOT NULL DEFAULT 0,
    Visible TINYINT(1) NOT NULL DEFAULT 1,
    Locked TINYINT(1) NOT NULL DEFAULT 0,
    Required TINYINT(1) NOT NULL DEFAULT 0,
    StyleJSON LONGTEXT NOT NULL,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_layout_element_key (LayoutVersionID,ElementKey),
    KEY idx_bbs_layout_element_order (LayoutVersionID,Side,ZIndex,id),
    CONSTRAINT fk_bbs_layout_element_version FOREIGN KEY (LayoutVersionID) REFERENCES BBS_Card_Layout_Versions(id),
    CONSTRAINT fk_bbs_layout_element_asset FOREIGN KEY (AssetID) REFERENCES BBS_Card_Layout_Assets(id),
    CONSTRAINT chk_bbs_layout_element_side CHECK (Side IN ('Front','Back')),
    CONSTRAINT chk_bbs_layout_element_type CHECK (ElementType IN ('DynamicText','StaticText','DynamicImage','StaticImage','QR','Shape')),
    CONSTRAINT chk_bbs_layout_element_geometry CHECK (
        XBP<=10000 AND YBP<=10000 AND WidthBP>0 AND HeightBP>0
        AND XBP+WidthBP<=10000 AND YBP+HeightBP<=10000
    ),
    CONSTRAINT chk_bbs_layout_element_rotation CHECK (RotationDeg>=-360 AND RotationDeg<=360)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Card_Designer_Print_Snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    LayoutVersionID BIGINT UNSIGNED NOT NULL,
    PersonalPrintLogID BIGINT UNSIGNED NULL,
    DepartmentPrintLogID BIGINT UNSIGNED NULL,
    RenderContractHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SnapshotJSON LONGTEXT NOT NULL,
    RenderMetadata LONGTEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_designer_personal_print (PersonalPrintLogID),
    UNIQUE KEY uq_bbs_designer_department_print (DepartmentPrintLogID),
    KEY idx_bbs_designer_snapshot_layout (LayoutVersionID,CreatedAt),
    CONSTRAINT fk_bbs_designer_snapshot_layout FOREIGN KEY (LayoutVersionID) REFERENCES BBS_Card_Layout_Versions(id),
    CONSTRAINT fk_bbs_designer_snapshot_personal FOREIGN KEY (PersonalPrintLogID) REFERENCES BBS_Card_Print_Logs(id),
    CONSTRAINT fk_bbs_designer_snapshot_department FOREIGN KEY (DepartmentPrintLogID) REFERENCES BBS_Department_Card_Print_Logs(id),
    CONSTRAINT chk_bbs_designer_snapshot_parent CHECK (
        (PersonalPrintLogID IS NOT NULL AND DepartmentPrintLogID IS NULL)
        OR (DepartmentPrintLogID IS NOT NULL AND PersonalPrintLogID IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO BBS_Settings (SettingKey,SettingValue) VALUES
('visual_card_designer_enabled','0'),
('visual_card_designer_rendering_enabled','0')
ON DUPLICATE KEY UPDATE SettingKey=VALUES(SettingKey);
