'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const nodeRoute = read('backend/routes/johnny-ai.js');
const phpRoute = read('api/handlers/johnny_ai.php');
const migration = read('backend/migrations/20261006_johnny_phase7_schema.sql');
const rollback = read('backend/migrations/20261006_johnny_phase7_schema.rollback.sql');
const htaccess = read('.htaccess');
const server = read('backend/server.js');
const configExample = read('api/config.production.example.php');
const retention = read('backend/scripts/johnny-retention-maintenance.js');
const browser = read('backend/scripts/johnny-phase71-browser-local-uat.js');
const candidateBuilder = read('backend/scripts/johnny-phase71-build-candidate.js');
const packageJson = JSON.parse(read('backend/package.json'));

for (const [stack, source] of [['Node', nodeRoute], ['PHP', phpRoute]]) {
    check(`${stack} runtime has no CREATE TABLE`, !source.includes('CREATE TABLE IF NOT EXISTS johnny_'));
    check(`${stack} runtime has no ALTER TABLE`, !source.includes('ALTER TABLE johnny_'));
    check(`${stack} runtime has no automatic retention delete`, !source.includes('CreatedAt < DATE_SUB(NOW()') && !source.includes('UpdatedAt < DATE_SUB(NOW()'));
    check(`${stack} runtime checks INFORMATION_SCHEMA`, source.includes('INFORMATION_SCHEMA.COLUMNS'));
    check(`${stack} runtime fails closed`, source.includes('JOHNNY_SCHEMA_NOT_READY') && source.includes('503'));
}

const executableMigration = migration.replace(/^\s*--.*$/gm, '');
check('migration creates all seven schema tables', [
    'app_settings', 'johnny_chat_conversations', 'johnny_chat_messages', 'johnny_answer_feedback',
    'johnny_kb_documents', 'johnny_kb_chunks', 'johnny_operational_logs',
].every(table => migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)));
check('migration is idempotent for additive columns', migration.includes('INFORMATION_SCHEMA.COLUMNS') && migration.includes('PREPARE johnny_stmt'));
check('migration contains no data delete', !/\bDELETE\s+(?:\w+\s+FROM|FROM)\b/i.test(executableMigration));
check('migration contains no drop', !/\bDROP\s+(?:TABLE|COLUMN|DATABASE|INDEX)\b/i.test(executableMigration));
check('rollback is deliberately non-destructive', !/^(?!\s*--).*\b(?:DROP|DELETE|UPDATE|ALTER)\b/im.test(rollback));

check('Apache denies shared contracts', /RewriteRule \^shared/.test(htaccess) && /R=404/.test(htaccess));
check('Node denies shared contracts', server.includes("app.use('/shared'") && server.includes('404'));
check('retention defaults to dry-run', retention.includes("mode: apply ? 'apply' : 'dry-run'"));
check('retention apply requires explicit confirmation', retention.includes('DELETE_EXPIRED_JOHNNY_DATA'));
check('Browser UAT requires explicit URL', browser.includes('JOHNNY_UAT_URL is required; Production fallback is forbidden'));
check('Browser UAT refuses non-loopback', browser.includes('refuses non-loopback URLs'));
check('Browser UAT covers 390px', browser.includes('390, 844'));
check('Browser UAT covers feedback and shared denial', browser.includes('feedbackSaved') && browser.includes('sharedContractAccess'));
check('candidate approval requires an explicit confirmation phrase', candidateBuilder.includes('PRODUCTION_DEPLOYMENT_APPROVED'));
check('candidate approval requires a clean immutable worktree', candidateBuilder.includes('Approved candidate requires a clean immutable working tree'));
check('candidate remains hold-by-default', candidateBuilder.includes("const approved = approvalRequested && approvalConfirmed && workingTreeClean"));

for (const key of [
    'public_upload_base_url', 'public_app_url', 'gemini_models', 'johnny_chat_retention_days',
    'johnny_operational_log_retention_days', 'johnny_avatar_max_upload_mb',
    'johnny_risk_image_max_upload_mb', 'johnny_web_research_enabled',
    'johnny_web_allowed_domains', 'johnny_system_data_enabled',
]) check(`Production config example includes ${key}`, configExample.includes(`'${key}'`));

for (const script of [
    'preflight:johnny-phase7-config', 'verify:johnny-phase7-php74',
    'retention:johnny-dry-run', 'uat:johnny-phase71-browser-local',
]) check(`package registers ${script}`, Boolean(packageJson.scripts?.[script]));

const failures = checks.filter(item => !item.pass);
console.log(JSON.stringify({
    marker: 'JOHNNY_PHASE71_PRODUCTION_RELEASE_BLOCKER_REMEDIATION',
    mode: 'static-local-no-production',
    checks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
}, null, 2));
if (failures.length) process.exit(1);
