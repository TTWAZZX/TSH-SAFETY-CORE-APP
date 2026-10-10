-- Safety Vote UX/UI Phase 9C — Engagement Analytics and Delivery Governance
-- Additive and idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_EngagementCounters (
 id BIGINT NOT NULL AUTO_INCREMENT,
 CampaignID BIGINT NOT NULL,
 PromotionID BIGINT NOT NULL,
 MetricDay DATE NOT NULL,
 MetricKey VARCHAR(32) NOT NULL,
 MetricCount BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uq_sv_engagement_counter(PromotionID,MetricDay,MetricKey),
 KEY idx_sv_engagement_campaign_day(CampaignID,MetricDay,MetricKey),
 CONSTRAINT fk_sv_engagement_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_engagement_promotion FOREIGN KEY(PromotionID) REFERENCES SafetyVote_Promotions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('ux_phase9c_contract','2026-10-10-safety-vote-ux-phase9c-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('engagement_enabled','0','migration')
ON DUPLICATE KEY UPDATE SettingValue=SettingValue;
