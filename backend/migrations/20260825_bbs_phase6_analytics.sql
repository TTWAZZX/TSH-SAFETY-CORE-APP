-- BBS Smart Card Phase 6: analytics feature flags and read-performance indexes.
-- Additive only. No observation or corrective-action business rows are changed.

INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('analytics_enabled','1'),('analytics_export_enabled','1')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue);

SET @bbs_phase6_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='BBS_Observations' AND index_name='idx_bbs_observation_date_status'),
    'SELECT 1',
    'ALTER TABLE BBS_Observations ADD INDEX idx_bbs_observation_date_status (ObservationDate,Status)'
);
PREPARE bbs_phase6_stmt FROM @bbs_phase6_sql; EXECUTE bbs_phase6_stmt; DEALLOCATE PREPARE bbs_phase6_stmt;

SET @bbs_phase6_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='BBS_Observations' AND index_name='idx_bbs_observation_unit_date'),
    'SELECT 1',
    'ALTER TABLE BBS_Observations ADD INDEX idx_bbs_observation_unit_date (ObservedSafetyUnitID,ObservationDate,Status)'
);
PREPARE bbs_phase6_stmt FROM @bbs_phase6_sql; EXECUTE bbs_phase6_stmt; DEALLOCATE PREPARE bbs_phase6_stmt;

SET @bbs_phase6_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='BBS_Observation_Answers' AND index_name='idx_bbs_answer_analytics'),
    'SELECT 1',
    'ALTER TABLE BBS_Observation_Answers ADD INDEX idx_bbs_answer_analytics (Response,CategoryNameSnapshot,ObservationID)'
);
PREPARE bbs_phase6_stmt FROM @bbs_phase6_sql; EXECUTE bbs_phase6_stmt; DEALLOCATE PREPARE bbs_phase6_stmt;

SET @bbs_phase6_sql = IF(
    EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='BBS_Corrective_Actions' AND index_name='idx_bbs_action_analytics'),
    'SELECT 1',
    'ALTER TABLE BBS_Corrective_Actions ADD INDEX idx_bbs_action_analytics (Priority,Status,DueDate,ObservationID)'
);
PREPARE bbs_phase6_stmt FROM @bbs_phase6_sql; EXECUTE bbs_phase6_stmt; DEALLOCATE PREPARE bbs_phase6_stmt;
