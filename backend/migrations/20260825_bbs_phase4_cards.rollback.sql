-- Guarded Phase 4 rollback. This intentionally removes Phase 4 card data only.
DELETE FROM BBS_Settings WHERE SettingKey='qr_resolve_limit_5m';
DROP TABLE IF EXISTS BBS_QR_Resolve_Attempts;
DROP TABLE IF EXISTS BBS_Card_Print_Logs;
DROP TABLE IF EXISTS BBS_Cards;
DROP TABLE IF EXISTS BBS_Card_Templates;
