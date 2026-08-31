-- BBS Smart Card Phase 8: Department card templates and Community Good/Risky reporting.
-- Additive only. Existing personal cards, Formal Observations, KPI, and Actions remain unchanged.

CREATE TABLE IF NOT EXISTS BBS_Department_Card_Templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateName VARCHAR(160) NOT NULL,
    DepartmentID INT NOT NULL,
    BackgroundStoredName VARCHAR(255) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(80) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL DEFAULT 0,
    WidthMM DECIMAL(7,2) NOT NULL DEFAULT 105.00,
    HeightMM DECIMAL(7,2) NOT NULL DEFAULT 148.00,
    DisplayOrder INT NOT NULL DEFAULT 0,
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
    KEY idx_bbs_dept_template_scope (DepartmentID,Status,DisplayOrder,id),
    CONSTRAINT fk_bbs_dept_template_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Department_QR_Cards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    DepartmentID INT NOT NULL,
    Generation INT UNSIGNED NOT NULL DEFAULT 1,
    TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    TokenFingerprint CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    IssuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    IssuedBy VARCHAR(50) NOT NULL,
    RevokedAt DATETIME NULL,
    RevokedBy VARCHAR(50) NULL,
    RevokeReason VARCHAR(255) NULL,
    ReplacedByCardID BIGINT UNSIGNED NULL,
    LastResolvedAt DATETIME NULL,
    ResolveCount INT UNSIGNED NOT NULL DEFAULT 0,
    ActiveDepartmentID INT GENERATED ALWAYS AS (CASE WHEN Status='Active' THEN DepartmentID ELSE NULL END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_dept_qr_hash (TokenHash),
    UNIQUE KEY uq_bbs_dept_qr_active (ActiveDepartmentID),
    KEY idx_bbs_dept_qr_department (DepartmentID,Status,Generation),
    CONSTRAINT fk_bbs_dept_qr_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id),
    CONSTRAINT fk_bbs_dept_qr_replacement FOREIGN KEY (ReplacedByCardID) REFERENCES BBS_Department_QR_Cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Department_Card_Print_Logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    TemplateID BIGINT UNSIGNED NOT NULL,
    DepartmentQRID BIGINT UNSIGNED NOT NULL,
    PaperSize VARCHAR(20) NOT NULL DEFAULT 'A5',
    Copies INT UNSIGNED NOT NULL DEFAULT 1,
    PrintedBy VARCHAR(50) NOT NULL,
    PrintedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_dept_print_template (TemplateID,PrintedAt),
    KEY idx_bbs_dept_print_department (DepartmentQRID,PrintedAt),
    CONSTRAINT fk_bbs_dept_print_template FOREIGN KEY (TemplateID) REFERENCES BBS_Department_Card_Templates(id),
    CONSTRAINT fk_bbs_dept_print_qr FOREIGN KEY (DepartmentQRID) REFERENCES BBS_Department_QR_Cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Community_Action_Handlers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    DepartmentID INT NOT NULL,
    OwnerEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    VerifierEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    UpdatedBy VARCHAR(50) NOT NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_community_handler_department (DepartmentID),
    CONSTRAINT fk_bbs_community_handler_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id),
    CONSTRAINT fk_bbs_community_handler_owner FOREIGN KEY (OwnerEmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_community_handler_verifier FOREIGN KEY (VerifierEmployeeID) REFERENCES employees(EmployeeID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Community_Reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ReportNo VARCHAR(40) NOT NULL,
    DepartmentID INT NOT NULL,
    DepartmentQRID BIGINT UNSIGNED NOT NULL,
    ReporterEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    ObservedEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    SafetyUnitID INT NULL,
    AreaText VARCHAR(255) NULL,
    ReportType VARCHAR(20) NOT NULL,
    Description TEXT NOT NULL,
    Status VARCHAR(30) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_community_report_no (ReportNo),
    KEY idx_bbs_community_good_feed (ReportType,CreatedAt,id),
    KEY idx_bbs_community_department (DepartmentID,ReportType,CreatedAt),
    KEY idx_bbs_community_reporter (ReporterEmployeeID,CreatedAt),
    CONSTRAINT fk_bbs_community_department FOREIGN KEY (DepartmentID) REFERENCES master_departments(id),
    CONSTRAINT fk_bbs_community_qr FOREIGN KEY (DepartmentQRID) REFERENCES BBS_Department_QR_Cards(id),
    CONSTRAINT fk_bbs_community_reporter FOREIGN KEY (ReporterEmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_community_observed FOREIGN KEY (ObservedEmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_community_unit FOREIGN KEY (SafetyUnitID) REFERENCES master_safetyunits(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Community_Report_Files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ReportID BIGINT UNSIGNED NOT NULL,
    StoredName VARCHAR(180) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(100) NOT NULL,
    FileSize BIGINT UNSIGNED NOT NULL,
    UploadedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_community_file_report (ReportID,CreatedAt),
    CONSTRAINT fk_bbs_community_file_report FOREIGN KEY (ReportID) REFERENCES BBS_Community_Reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Community_Actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ActionNo VARCHAR(40) NOT NULL,
    ReportID BIGINT UNSIGNED NOT NULL,
    OwnerEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    VerifierEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    Priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    DueDate DATE NOT NULL,
    Description TEXT NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Open',
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    ClosedAt DATETIME NULL,
    ClosedBy VARCHAR(20) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_community_action_no (ActionNo),
    UNIQUE KEY uq_bbs_community_action_report (ReportID),
    KEY idx_bbs_community_action_status (Status,DueDate,Priority),
    CONSTRAINT fk_bbs_community_action_report FOREIGN KEY (ReportID) REFERENCES BBS_Community_Reports(id),
    CONSTRAINT fk_bbs_community_action_owner FOREIGN KEY (OwnerEmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_community_action_verifier FOREIGN KEY (VerifierEmployeeID) REFERENCES employees(EmployeeID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BBS_Community_Action_History (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ActionID BIGINT UNSIGNED NOT NULL,
    FromStatus VARCHAR(30) NULL,
    ToStatus VARCHAR(30) NOT NULL,
    ActorEmployeeID VARCHAR(20) NOT NULL,
    Note TEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_community_action_history (ActionID,CreatedAt,id),
    CONSTRAINT fk_bbs_community_action_history FOREIGN KEY (ActionID) REFERENCES BBS_Community_Actions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('community_reporting_enabled','1'),('department_cards_enabled','1')
ON DUPLICATE KEY UPDATE SettingKey=VALUES(SettingKey);
