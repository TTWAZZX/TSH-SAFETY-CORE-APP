-- Safety Vote Phase 5 Operations, Analytics, Export and Notification
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive and idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_Reports (
 id BIGINT NOT NULL AUTO_INCREMENT, ResultSnapshotID BIGINT NOT NULL, ReportType VARCHAR(40) NOT NULL,
 ReportID VARCHAR(80) NOT NULL, ReportVersion INT NOT NULL DEFAULT 1, StoredName VARCHAR(255) NOT NULL,
 MimeType VARCHAR(120) NOT NULL, FileSize BIGINT NOT NULL, ContentSha256 CHAR(64) NOT NULL,
 ResultHashSnapshot CHAR(64) NOT NULL, Status VARCHAR(24) NOT NULL DEFAULT 'Ready',
 GeneratedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, GeneratedBy VARCHAR(20) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_report_id(ReportID),
 KEY idx_sv_report_snapshot(ResultSnapshotID,ReportType,Status,ReportVersion),
 CONSTRAINT fk_sv_report_snapshot FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_ExportJobs (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NOT NULL, CampaignVersionID BIGINT NOT NULL,
 ResultSnapshotID BIGINT NULL, ExportType VARCHAR(40) NOT NULL, Format VARCHAR(20) NOT NULL,
 PrivacyClass VARCHAR(30) NOT NULL DEFAULT 'aggregate', Status VARCHAR(24) NOT NULL DEFAULT 'Queued',
 RequestedBy VARCHAR(20) NOT NULL, RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 StartedAt DATETIME NULL, CompletedAt DATETIME NULL, ReportID BIGINT NULL, ErrorCode VARCHAR(80) NULL,
 FilterJson TEXT NULL, RowVersion INT NOT NULL DEFAULT 1,
 PRIMARY KEY(id), KEY idx_sv_export_queue(Status,RequestedAt), KEY idx_sv_export_campaign(CampaignID,RequestedAt),
 CONSTRAINT fk_sv_export_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_export_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_export_snapshot FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id),
 CONSTRAINT fk_sv_export_report FOREIGN KEY(ReportID) REFERENCES SafetyVote_Reports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Notifications (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NOT NULL, StageID BIGINT NULL,
 EventType VARCHAR(50) NOT NULL, TemplateKey VARCHAR(80) NOT NULL, Channel VARCHAR(30) NOT NULL DEFAULT 'in_app',
 RecipientEmployeeID VARCHAR(20) NOT NULL, ScheduledAt DATETIME NOT NULL, DispatchedAt DATETIME NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Queued', SuppressionKey CHAR(64) NOT NULL,
 AttemptCount INT NOT NULL DEFAULT 0, MaxAttempts INT NOT NULL DEFAULT 3, LastErrorCode VARCHAR(80) NULL,
 NextAttemptAt DATETIME NULL, PayloadMetadataJson TEXT NULL, CreatedBy VARCHAR(20) NOT NULL,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_notification_suppression(SuppressionKey),
 KEY idx_sv_notification_due(Status,ScheduledAt,NextAttemptAt), KEY idx_sv_notification_campaign(CampaignID,EventType,Status),
 CONSTRAINT fk_sv_notification_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_notification_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_NotificationDeliveries (
 id BIGINT NOT NULL AUTO_INCREMENT, NotificationID BIGINT NOT NULL, AttemptNo INT NOT NULL,
 DeliveryState VARCHAR(24) NOT NULL, ErrorCode VARCHAR(80) NULL, ProviderReference VARCHAR(120) NULL,
 AttemptedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, MetadataJson TEXT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_delivery_attempt(NotificationID,AttemptNo),
 KEY idx_sv_delivery_state(DeliveryState,AttemptedAt),
 CONSTRAINT fk_sv_delivery_notification FOREIGN KEY(NotificationID) REFERENCES SafetyVote_Notifications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase5-r1','migration'),('module_enabled','0','migration'),
('phase5_contract','2026-10-08-safety-vote-phase5-r1','migration'),
('retention_days','2555','migration'),('notification_max_attempts','3','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
