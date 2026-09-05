-- CCCF Phase C4: authorized submit-on-behalf, additive and reversible by disabling rows.
-- Existing Permanent rows remain untouched. Legacy display falls back to CreatedBy/SubmitterName.

ALTER TABLE CCCF_FormA_Permanent
    ADD COLUMN IF NOT EXISTS SubmittedByEmployeeID VARCHAR(50) NULL AFTER AssigneeID,
    ADD COLUMN IF NOT EXISTS SubmittedByName VARCHAR(100) NULL AFTER SubmittedByEmployeeID;

CREATE TABLE IF NOT EXISTS CCCF_Submit_Delegations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    OwnerEmployeeID VARCHAR(50) NOT NULL,
    DelegateEmployeeID VARCHAR(50) NOT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(100) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cccf_submit_delegation (OwnerEmployeeID, DelegateEmployeeID),
    KEY idx_cccf_submit_delegate (DelegateEmployeeID, IsActive),
    KEY idx_cccf_submit_owner (OwnerEmployeeID, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
