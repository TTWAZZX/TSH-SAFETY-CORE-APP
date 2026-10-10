-- Safety Vote UX/UI Phase 9A — Engagement, Promotion and Admin Productivity
-- Additive and idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_Promotions (
 id BIGINT NOT NULL AUTO_INCREMENT,
 CampaignID BIGINT NOT NULL,
 TitleTh VARCHAR(160) NOT NULL,
 SubtitleTh VARCHAR(500) NULL,
 CtaLabel VARCHAR(40) NOT NULL DEFAULT 'ดูรายละเอียด',
 DesktopFileID BIGINT NULL,
 MobileFileID BIGINT NULL,
 AltText VARCHAR(240) NULL,
 Priority INT NOT NULL DEFAULT 0,
 StartAt DATETIME NOT NULL,
 EndAt DATETIME NOT NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Draft',
 RowVersion INT NOT NULL DEFAULT 1,
 CreatedBy VARCHAR(20) NOT NULL,
 UpdatedBy VARCHAR(20) NOT NULL,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 KEY idx_sv_promotion_live(Status,StartAt,EndAt,Priority),
 KEY idx_sv_promotion_campaign(CampaignID,Status),
 CONSTRAINT fk_sv_promotion_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_promotion_desktop_file FOREIGN KEY(DesktopFileID) REFERENCES SafetyVote_Files(id),
 CONSTRAINT fk_sv_promotion_mobile_file FOREIGN KEY(MobileFileID) REFERENCES SafetyVote_Files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_NotificationReads (
 NotificationID BIGINT NOT NULL,
 EmployeeID VARCHAR(20) NOT NULL,
 ReadAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(NotificationID,EmployeeID),
 KEY idx_sv_notification_read_employee(EmployeeID,ReadAt),
 CONSTRAINT fk_sv_notification_read_notification FOREIGN KEY(NotificationID) REFERENCES SafetyVote_Notifications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('ux_phase9a_contract','2026-10-10-safety-vote-ux-phase9a-r1','migration'),
('engagement_enabled','0','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
