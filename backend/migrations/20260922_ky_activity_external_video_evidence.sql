-- Additive KY Activity External Video Evidence storage.
-- Existing KY activities, annual evidence, inventory, uploads and audit rows are untouched.

CREATE TABLE IF NOT EXISTS KY_Activity_External_Video_Evidence (
    id                 VARCHAR(36) NOT NULL PRIMARY KEY,
    EvidenceYear       SMALLINT NOT NULL,
    ActivityID         VARCHAR(36) NOT NULL,
    Department         VARCHAR(100) NOT NULL,
    SafetyUnit         VARCHAR(100) NULL,
    ExternalReference  TEXT NOT NULL,
    OriginalFileName   VARCHAR(255) NOT NULL,
    MimeType           VARCHAR(120) NULL,
    FileSize           BIGINT UNSIGNED NOT NULL DEFAULT 0,
    SHA256             CHAR(64) NOT NULL,
    Status             VARCHAR(30) NOT NULL DEFAULT 'Pending',
    DeclaredByID       VARCHAR(50) NULL,
    DeclaredByName     VARCHAR(100) NULL,
    DeclaredAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    VerifiedByID       VARCHAR(50) NULL,
    VerifiedByName     VARCHAR(100) NULL,
    VerifiedAt         DATETIME NULL,
    VerificationNote   TEXT NULL,
    RowVersion         INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ky_activity_external_video (ActivityID),
    KEY idx_ky_activity_external_status (EvidenceYear, Status),
    KEY idx_ky_activity_external_scope (EvidenceYear, Department, SafetyUnit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS KY_Activity_External_Video_Evidence_Audit (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    EvidenceID  VARCHAR(36) NOT NULL,
    ActivityID  VARCHAR(36) NOT NULL,
    Action      VARCHAR(80) NOT NULL,
    ActorID     VARCHAR(50) NULL,
    ActorName   VARCHAR(100) NULL,
    BeforeJson  LONGTEXT NULL,
    AfterJson   LONGTEXT NULL,
    Detail      TEXT NULL,
    CreatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ky_activity_external_audit (EvidenceID, CreatedAt),
    KEY idx_ky_activity_external_action (Action, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
