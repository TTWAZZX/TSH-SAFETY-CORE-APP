-- BBS Smart Card Phase 5: corrective action, SLA, evidence, history and queued notifications.
-- Additive only. Phase 1-4 migrations must be applied first.

CREATE TABLE IF NOT EXISTS BBS_Action_SLA_Rules (
    id INT NOT NULL AUTO_INCREMENT,
    Priority VARCHAR(20) NOT NULL,
    SLADays INT NOT NULL,
    NearDueDays INT NOT NULL DEFAULT 2,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    RowVersion INT NOT NULL DEFAULT 1,
    UpdatedBy VARCHAR(20) NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_action_sla_priority (Priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Action_SLA_Rules(Priority,SLADays,NearDueDays,IsActive)
VALUES ('Critical',1,1,1),('High',3,1,1),('Medium',7,2,1),('Low',14,3,1)
ON DUPLICATE KEY UPDATE Priority=VALUES(Priority);

CREATE TABLE IF NOT EXISTS BBS_Corrective_Actions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ActionNo VARCHAR(40) NOT NULL,
    ObservationID BIGINT NOT NULL,
    AnswerID BIGINT NOT NULL,
    OwnerEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    VerifierEmployeeID VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    Priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    DueDate DATE NOT NULL,
    Description TEXT NOT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Open',
    RowVersion INT NOT NULL DEFAULT 1,
    StartedAt DATETIME NULL,
    SubmittedForVerificationAt DATETIME NULL,
    VerifiedAt DATETIME NULL,
    VerifiedBy VARCHAR(20) NULL,
    VerificationNote TEXT NULL,
    ClosedAt DATETIME NULL,
    ClosedBy VARCHAR(20) NULL,
    ReopenedAt DATETIME NULL,
    ReopenedBy VARCHAR(20) NULL,
    ReopenCount INT NOT NULL DEFAULT 0,
    CreatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy VARCHAR(20) NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_action_no (ActionNo),
    UNIQUE KEY uq_bbs_action_source_answer (AnswerID),
    KEY idx_bbs_action_owner_status (OwnerEmployeeID,Status,DueDate),
    KEY idx_bbs_action_verifier_status (VerifierEmployeeID,Status,DueDate),
    KEY idx_bbs_action_observation (ObservationID),
    KEY idx_bbs_action_due (Status,DueDate,Priority),
    CONSTRAINT fk_bbs_action_observation FOREIGN KEY (ObservationID) REFERENCES BBS_Observations(id),
    CONSTRAINT fk_bbs_action_answer FOREIGN KEY (AnswerID) REFERENCES BBS_Observation_Answers(id),
    CONSTRAINT fk_bbs_action_owner FOREIGN KEY (OwnerEmployeeID) REFERENCES employees(EmployeeID),
    CONSTRAINT fk_bbs_action_verifier FOREIGN KEY (VerifierEmployeeID) REFERENCES employees(EmployeeID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Action_Files (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ActionID BIGINT NOT NULL,
    EvidenceType VARCHAR(20) NOT NULL,
    StoredName VARCHAR(160) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(100) NOT NULL,
    FileSize BIGINT NOT NULL,
    UploadedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_action_file (ActionID,EvidenceType,CreatedAt),
    CONSTRAINT fk_bbs_action_file_action FOREIGN KEY (ActionID) REFERENCES BBS_Corrective_Actions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Action_History (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ActionID BIGINT NOT NULL,
    FromStatus VARCHAR(30) NULL,
    ToStatus VARCHAR(30) NOT NULL,
    ActorEmployeeID VARCHAR(20) NOT NULL,
    Note TEXT NULL,
    EventType VARCHAR(40) NOT NULL DEFAULT 'Transition',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_action_history (ActionID,CreatedAt,id),
    CONSTRAINT fk_bbs_action_history_action FOREIGN KEY (ActionID) REFERENCES BBS_Corrective_Actions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Action_EmailOutbox (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ActionID BIGINT NOT NULL,
    EventType VARCHAR(50) NOT NULL,
    RecipientEmployeeID VARCHAR(20) NULL,
    Recipients TEXT NOT NULL,
    Subject VARCHAR(255) NOT NULL,
    Body MEDIUMTEXT NULL,
    HtmlBody MEDIUMTEXT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Queued',
    SuppressionKey CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    RetryCount INT NOT NULL DEFAULT 0,
    Error TEXT NULL,
    LastAttemptAt DATETIME NULL,
    SentAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_action_outbox_suppression (SuppressionKey),
    KEY idx_bbs_action_outbox_status (Status,CreatedAt),
    KEY idx_bbs_action_outbox_action (ActionID,EventType),
    CONSTRAINT fk_bbs_action_outbox_action FOREIGN KEY (ActionID) REFERENCES BBS_Corrective_Actions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('action_notifications_enabled','0'),('action_reminder_suppression_hours','24')
ON DUPLICATE KEY UPDATE SettingKey=VALUES(SettingKey);

-- Backfill qualifying submitted Unsafe answers. Deterministic ActionNo and
-- unique AnswerID keep this safe to rerun and preserve immutable source links.
INSERT IGNORE INTO BBS_Corrective_Actions(
    ActionNo,ObservationID,AnswerID,OwnerEmployeeID,VerifierEmployeeID,
    Priority,DueDate,Description,Status,CreatedBy,CreatedAt
)
SELECT CONCAT('BBS-ACT-',LPAD(a.id,10,'0')),o.id,a.id,
       o.ObservedEmployeeID,o.ObserverEmployeeID,'Medium',
       DATE_ADD(o.ObservationDate,INTERVAL 7 DAY),
       CONCAT(a.ItemCodeSnapshot,' - ',a.ItemPromptSnapshot,
              IF(COALESCE(a.Remark,'')<>'',CONCAT('\nRemark: ',a.Remark),''),
              IF(COALESCE(a.ImmediateAction,'')<>'',CONCAT('\nImmediate action: ',a.ImmediateAction),'')),
       'Open',o.ObserverEmployeeID,COALESCE(o.SubmittedAt,o.UpdatedAt)
FROM BBS_Observation_Answers a
JOIN BBS_Observations o ON o.id=a.ObservationID AND o.Status='Submitted'
WHERE a.Response='Unsafe' AND a.UnsafeRequiresActionSnapshot=1;

INSERT INTO BBS_Action_History(ActionID,FromStatus,ToStatus,ActorEmployeeID,Note,EventType,CreatedAt)
SELECT ca.id,NULL,'Open',ca.CreatedBy,'Created automatically from submitted Unsafe answer.','Created',ca.CreatedAt
FROM BBS_Corrective_Actions ca
WHERE NOT EXISTS(SELECT 1 FROM BBS_Action_History h WHERE h.ActionID=ca.id);
