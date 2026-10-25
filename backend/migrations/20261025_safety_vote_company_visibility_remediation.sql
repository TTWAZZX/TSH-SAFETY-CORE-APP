CREATE TABLE IF NOT EXISTS SafetyVote_VisibilityRemediationBatches (
 id BIGINT NOT NULL AUTO_INCREMENT,
 ContractVersion VARCHAR(100) NOT NULL,
 PreviewHash CHAR(64) NOT NULL,
 CandidateCount INT NOT NULL DEFAULT 0,
 Reason VARCHAR(1000) NOT NULL,
 IdempotencyHash CHAR(64) NOT NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Applied',
 AppliedBy VARCHAR(20) NOT NULL,
 AppliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 RolledBackBy VARCHAR(20) NULL,
 RolledBackAt DATETIME NULL,
 RollbackReason VARCHAR(1000) NULL,
 PRIMARY KEY(id),
 UNIQUE KEY uq_sv_visibility_remediation_idempotency(IdempotencyHash),
 KEY idx_sv_visibility_remediation_status(Status,AppliedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_VisibilityRemediationItems (
 id BIGINT NOT NULL AUTO_INCREMENT,
 BatchID BIGINT NOT NULL,
 CampaignID BIGINT NOT NULL,
 CampaignCode VARCHAR(40) NOT NULL,
 OriginalDiscoveryMode VARCHAR(30) NOT NULL,
 TargetDiscoveryMode VARCHAR(30) NOT NULL,
 BeforeRowVersion INT NOT NULL,
 AppliedRowVersion INT NOT NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Applied',
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uq_sv_visibility_remediation_item(BatchID,CampaignID),
 KEY idx_sv_visibility_remediation_campaign(CampaignID,Status),
 CONSTRAINT fk_sv_visibility_remediation_batch FOREIGN KEY(BatchID) REFERENCES SafetyVote_VisibilityRemediationBatches(id),
 CONSTRAINT fk_sv_visibility_remediation_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('company_visibility_remediation_contract','2026-10-25-safety-vote-company-visibility-remediation-r1','migration'),
('company_visibility_remediation_enabled','0','migration')
ON DUPLICATE KEY UPDATE SettingValue=IF(SettingKey='company_visibility_remediation_enabled' AND SettingValue='1','1',VALUES(SettingValue)),UpdatedBy='migration';
