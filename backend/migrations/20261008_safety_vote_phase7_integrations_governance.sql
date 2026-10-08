-- Safety Vote Phase 7 Integrations, Governance and Release Candidate
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive/idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_IntegrationSnapshots (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NULL, CampaignVersionID BIGINT NULL,
 AdapterKey VARCHAR(50) NOT NULL, SourceType VARCHAR(50) NOT NULL, SourceReference VARCHAR(160) NOT NULL,
 SnapshotHash CHAR(64) NOT NULL, PayloadJson LONGTEXT NOT NULL, Classification VARCHAR(30) NOT NULL DEFAULT 'internal',
 CreatedBy VARCHAR(20) NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_integration_snapshot(AdapterKey,SourceReference,SnapshotHash),
 KEY idx_sv_integration_campaign(CampaignID,AdapterKey,CreatedAt),
 CONSTRAINT fk_sv_integration_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_integration_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_IntegrationHandoffs (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NOT NULL, CampaignVersionID BIGINT NOT NULL,
 ResultSnapshotID BIGINT NOT NULL, ReportID BIGINT NULL, TargetAdapter VARCHAR(50) NOT NULL,
 PreviewHash CHAR(64) NOT NULL, ResultHash CHAR(64) NOT NULL, ReportSha256 CHAR(64) NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Previewed', ConfirmationHash CHAR(64) NULL,
 ProviderReceipt VARCHAR(160) NULL, RequestedBy VARCHAR(20) NOT NULL, ConfirmedBy VARCHAR(20) NULL,
 RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ConfirmedAt DATETIME NULL,
 MetadataJson TEXT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_handoff_once(CampaignID,ResultSnapshotID,TargetAdapter,PreviewHash),
 KEY idx_sv_handoff_status(Status,RequestedAt),
 CONSTRAINT fk_sv_handoff_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_handoff_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_handoff_result FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id),
 CONSTRAINT fk_sv_handoff_report FOREIGN KEY(ReportID) REFERENCES SafetyVote_Reports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_AcceptanceEvidence (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NULL, AcceptanceArea VARCHAR(30) NOT NULL,
 Decision VARCHAR(20) NOT NULL DEFAULT 'Pending', EvidenceReference VARCHAR(255) NOT NULL,
 EvidenceSha256 CHAR(64) NOT NULL, StatementHash CHAR(64) NOT NULL,
 ApprovedBy VARCHAR(20) NULL, ApprovedAt DATETIME NULL, ExpiresAt DATETIME NULL,
 RecordedBy VARCHAR(20) NOT NULL, RecordedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 RevokedAt DATETIME NULL, RevokedBy VARCHAR(20) NULL, RevokeReason VARCHAR(1000) NULL,
 PRIMARY KEY(id), KEY idx_sv_acceptance_current(CampaignID,AcceptanceArea,Decision,RevokedAt),
 CONSTRAINT fk_sv_acceptance_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_OperationalAlerts (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NULL, AlertKey VARCHAR(80) NOT NULL,
 Severity VARCHAR(16) NOT NULL, State VARCHAR(20) NOT NULL DEFAULT 'Open',
 EvidenceHash CHAR(64) NOT NULL, BoundedDetail VARCHAR(1000) NULL,
 DetectedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ResolvedAt DATETIME NULL, ResolvedBy VARCHAR(20) NULL,
 PRIMARY KEY(id), KEY idx_sv_alert_open(State,Severity,DetectedAt),
 CONSTRAINT fk_sv_alert_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase7-r1','migration'),
('phase7_contract','2026-10-08-safety-vote-phase7-r1','migration'),
('module_enabled','0','migration'),
('phase7_integrations_enabled','0','migration'),
('phase7_adapter_mode','fixture_only','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
