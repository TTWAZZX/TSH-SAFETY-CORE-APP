CREATE TABLE IF NOT EXISTS password_reset_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    EmployeeID VARCHAR(50) NOT NULL,
    EmailSnapshot VARCHAR(150) NOT NULL,
    TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    DeliveryStatus VARCHAR(20) NOT NULL DEFAULT 'Disabled',
    RequestedIPAddress VARCHAR(80) NULL,
    RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt DATETIME NOT NULL,
    CompletedAt DATETIME NULL,
    SupersededAt DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_password_reset_token (TokenHash),
    KEY idx_password_reset_employee (EmployeeID, Status, ExpiresAt),
    KEY idx_password_reset_status (Status, ExpiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    RequestID BIGINT UNSIGNED NULL,
    EmployeeID VARCHAR(80) NOT NULL,
    Action VARCHAR(50) NOT NULL,
    Detail VARCHAR(500) NULL,
    IPAddress VARCHAR(80) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_password_reset_audit_employee (EmployeeID, CreatedAt),
    KEY idx_password_reset_audit_request (RequestID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
