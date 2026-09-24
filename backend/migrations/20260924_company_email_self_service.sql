CREATE TABLE IF NOT EXISTS company_email_verification_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    EmployeeID VARCHAR(50) NOT NULL,
    PreviousCompanyEmail VARCHAR(150) NULL,
    NewCompanyEmail VARCHAR(150) NOT NULL,
    PendingEmailKey VARCHAR(150) NULL,
    TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    RequestedIPAddress VARCHAR(80) NULL,
    RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt DATETIME NOT NULL,
    VerifiedAt DATETIME NULL,
    CancelledAt DATETIME NULL,
    SupersededAt DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_company_email_change_token (TokenHash),
    UNIQUE KEY uq_company_email_change_pending_email (PendingEmailKey),
    KEY idx_company_email_change_employee (EmployeeID, Status, ExpiresAt),
    KEY idx_company_email_change_email (NewCompanyEmail, Status, ExpiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS company_email_change_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    RequestID BIGINT UNSIGNED NULL,
    EmployeeID VARCHAR(50) NOT NULL,
    Action VARCHAR(50) NOT NULL,
    Detail VARCHAR(500) NULL,
    IPAddress VARCHAR(80) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_company_email_audit_employee (EmployeeID, CreatedAt),
    KEY idx_company_email_audit_request (RequestID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
