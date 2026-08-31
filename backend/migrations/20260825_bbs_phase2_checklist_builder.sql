-- BBS Smart Card Phase 2: Checklist Builder and immutable published versions.
-- Additive only. Phase 1 migration must be applied first.

CREATE TABLE IF NOT EXISTS BBS_Checklist_Templates (
    id BIGINT NOT NULL AUTO_INCREMENT,
    TemplateCode VARCHAR(50) NOT NULL,
    TemplateName VARCHAR(160) NOT NULL,
    Description TEXT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NULL,
    UpdatedBy VARCHAR(20) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_checklist_template_code (TemplateCode),
    KEY idx_bbs_checklist_template_active (IsActive, TemplateName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Checklist_Versions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    TemplateID BIGINT NOT NULL,
    VersionNo INT NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    EffectiveFrom DATE NOT NULL,
    EffectiveTo DATE NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    PublishedAt DATETIME NULL,
    PublishedBy VARCHAR(20) NULL,
    ArchivedAt DATETIME NULL,
    ArchivedBy VARCHAR(20) NULL,
    CreatedBy VARCHAR(20) NULL,
    UpdatedBy VARCHAR(20) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_checklist_template_version (TemplateID, VersionNo),
    KEY idx_bbs_checklist_version_resolve (Status, EffectiveFrom, EffectiveTo),
    CONSTRAINT fk_bbs_checklist_version_template FOREIGN KEY (TemplateID)
        REFERENCES BBS_Checklist_Templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Checklist_Categories (
    id BIGINT NOT NULL AUTO_INCREMENT,
    VersionID BIGINT NOT NULL,
    CategoryName VARCHAR(160) NOT NULL,
    SortOrder INT NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY idx_bbs_checklist_category_version (VersionID, SortOrder),
    CONSTRAINT fk_bbs_checklist_category_version FOREIGN KEY (VersionID)
        REFERENCES BBS_Checklist_Versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Checklist_Items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CategoryID BIGINT NOT NULL,
    ItemCode VARCHAR(50) NOT NULL,
    ItemPrompt VARCHAR(500) NOT NULL,
    ResponseType VARCHAR(30) NOT NULL DEFAULT 'safe_unsafe_na',
    HelpText VARCHAR(500) NULL,
    SortOrder INT NOT NULL DEFAULT 1,
    IsRequired TINYINT(1) NOT NULL DEFAULT 1,
    UnsafeRequiresRemark TINYINT(1) NOT NULL DEFAULT 1,
    UnsafeRequiresPhoto TINYINT(1) NOT NULL DEFAULT 0,
    UnsafeRequiresAction TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_checklist_item_code (CategoryID, ItemCode),
    KEY idx_bbs_checklist_item_category (CategoryID, SortOrder),
    CONSTRAINT fk_bbs_checklist_item_category FOREIGN KEY (CategoryID)
        REFERENCES BBS_Checklist_Categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Checklist_Scope_Mappings (
    id BIGINT NOT NULL AUTO_INCREMENT,
    VersionID BIGINT NOT NULL,
    DepartmentID INT NULL,
    SafetyUnitID INT NULL,
    PositionID INT NULL,
    BBSLevel VARCHAR(32) NULL,
    Priority INT NOT NULL DEFAULT 0,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY idx_bbs_checklist_scope_version (VersionID, IsActive),
    KEY idx_bbs_checklist_scope_resolve (DepartmentID, SafetyUnitID, PositionID, BBSLevel, Priority),
    CONSTRAINT fk_bbs_checklist_scope_version FOREIGN KEY (VersionID)
        REFERENCES BBS_Checklist_Versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('checklist_builder_enabled', '1')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);
