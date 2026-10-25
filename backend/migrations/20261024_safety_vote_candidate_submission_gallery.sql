-- Safety Vote Candidate / Submission Gallery.
-- Additive and idempotent. Runtime must never execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_GalleryItems (
  id BIGINT NOT NULL AUTO_INCREMENT,
  CampaignID BIGINT NOT NULL,
  CampaignVersionID BIGINT NOT NULL,
  OwnerType VARCHAR(20) NOT NULL,
  OwnerID BIGINT NOT NULL,
  FileID BIGINT NOT NULL,
  AltText VARCHAR(300) NOT NULL,
  Caption VARCHAR(500) NULL,
  SortOrder INT NOT NULL DEFAULT 1,
  IsCover TINYINT(1) NOT NULL DEFAULT 0,
  Status VARCHAR(20) NOT NULL DEFAULT 'Active',
  RowVersion INT NOT NULL DEFAULT 1,
  CreatedBy VARCHAR(20) NOT NULL,
  UpdatedBy VARCHAR(20) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_gallery_owner_file (OwnerType,OwnerID,FileID),
  KEY idx_sv_gallery_owner (OwnerType,OwnerID,Status,SortOrder,id),
  KEY idx_sv_gallery_campaign (CampaignID,CampaignVersionID,Status),
  KEY idx_sv_gallery_file (FileID,Status),
  CONSTRAINT fk_sv_gallery_campaign FOREIGN KEY (CampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_gallery_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
  CONSTRAINT fk_sv_gallery_file FOREIGN KEY (FileID) REFERENCES SafetyVote_Files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-24-candidate-submission-gallery-r1','migration'),
('candidate_submission_gallery_contract','2026-10-24-safety-vote-gallery-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
