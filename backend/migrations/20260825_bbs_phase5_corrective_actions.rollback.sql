-- Operational rollback for Phase 5.
-- Preserve corrective actions, evidence, history and outbox for auditability.
-- Disable delivery; application rollback may then hide the Phase 5 UI/routes.
INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('action_notifications_enabled','0')
ON DUPLICATE KEY UPDATE SettingValue='0';
