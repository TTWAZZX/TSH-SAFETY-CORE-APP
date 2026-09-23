CREATE TABLE IF NOT EXISTS KY_Annual_Unit_Contest_Entries (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    EntryYear SMALLINT NOT NULL,
    ScopeKey VARCHAR(220) NOT NULL,
    Department VARCHAR(100) NOT NULL,
    SafetyUnit VARCHAR(100) NULL,
    ActivityID VARCHAR(36) NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Submitted',
    SubmittedByID VARCHAR(50) NULL,
    SubmittedByName VARCHAR(100) NULL,
    SubmittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedByID VARCHAR(50) NULL,
    UpdatedByName VARCHAR(100) NULL,
    RowVersion INT UNSIGNED NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ky_contest_year_scope (EntryYear, ScopeKey),
    KEY idx_ky_contest_activity (ActivityID),
    KEY idx_ky_contest_status (EntryYear, Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS KY_Annual_Unit_Contest_Entry_Audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    EntryID VARCHAR(36) NOT NULL,
    ActivityID VARCHAR(36) NULL,
    Action VARCHAR(80) NOT NULL,
    ActorID VARCHAR(50) NULL,
    ActorName VARCHAR(100) NULL,
    BeforeJson LONGTEXT NULL,
    AfterJson LONGTEXT NULL,
    Detail TEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ky_contest_audit_entry (EntryID, CreatedAt),
    KEY idx_ky_contest_audit_activity (ActivityID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
