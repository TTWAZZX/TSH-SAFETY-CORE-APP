-- Safety Vote UX/UI Phase 9B — Admin Planning, Content and Communication
-- Additive and idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_AdminSavedViews (
 id BIGINT NOT NULL AUTO_INCREMENT,
 EmployeeID VARCHAR(20) NOT NULL,
 ViewName VARCHAR(100) NOT NULL,
 FiltersJson TEXT NOT NULL,
 IsDefault TINYINT(1) NOT NULL DEFAULT 0,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uq_sv_saved_view_employee_name(EmployeeID,ViewName),
 KEY idx_sv_saved_view_employee(EmployeeID,UpdatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_CampaignTemplates (
 id BIGINT NOT NULL AUTO_INCREMENT,
 TemplateName VARCHAR(120) NOT NULL,
 CampaignType VARCHAR(40) NOT NULL,
 SourceCampaignID BIGINT NULL,
 ConfigJson LONGTEXT NOT NULL,
 ConfigSha256 CHAR(64) NOT NULL,
 Status VARCHAR(20) NOT NULL DEFAULT 'Active',
 RowVersion INT NOT NULL DEFAULT 1,
 CreatedBy VARCHAR(20) NOT NULL,
 UpdatedBy VARCHAR(20) NOT NULL,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 KEY idx_sv_template_status_type(Status,CampaignType,UpdatedAt),
 KEY idx_sv_template_source(SourceCampaignID),
 CONSTRAINT fk_sv_template_source_campaign FOREIGN KEY(SourceCampaignID) REFERENCES SafetyVote_Campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('ux_phase9b_contract','2026-10-10-safety-vote-ux-phase9b-r1','migration'),
('engagement_enabled','0','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
