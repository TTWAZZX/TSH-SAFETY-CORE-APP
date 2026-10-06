const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const nodeRoute = read('backend/routes/johnny-ai.js');
const phpRoute = read('api/handlers/johnny_ai.php');
const phpConfig = read('api/config.php');
const frontend = read('public/js/pages/johnny-ai.js');
const main = read('public/js/main.js');
const index = read('index.html');
const permissionAudit = read('backend/scripts/permission-audit.js');
const pkg = read('backend/package.json');
const server = read('backend/server.js');
const apacheRules = read('.htaccess');
const cacheBust = '20261006-johnny-phase5-workflow-r1';

const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
  if (!ok) process.exitCode = 1;
}

for (const [runtime, source] of [['Node', nodeRoute], ['PHP', phpRoute]]) {
  check(`${runtime}: sources metadata column`, source.includes('SourcesJson'));
  check(`${runtime}: answer quality metadata column`, source.includes('AnswerQualityJson'));
  check(`${runtime}: history returns answer metadata`, source.includes('SourcesJson AS Sources') && source.includes('AnswerQualityJson AS AnswerQuality'));
  check(`${runtime}: bulk user history deletion`, source.includes("'/conversations'") || source.includes("'/johnny/conversations'"));
  check(`${runtime}: private KB reference`, source.includes('private://johnny-kb/'));
  check(`${runtime}: authenticated KB file route`, source.includes('/kb-documents/:id/file'));
  check(`${runtime}: system data fail-closed marker`, source.includes('SYSTEM_DATA_UNAVAILABLE') && source.includes('system-data-guardrail'));
  check(`${runtime}: system query does not fall back to web`, source.includes('requestedModules') && source.includes('enableWebSearch'));
}

check('Node: image magic-byte validation', nodeRoute.includes('detectJohnnyImageMime') && nodeRoute.includes('startsWithBytes'));
check('Node: legacy public KB URLs blocked', server.includes("/^\\/johnny-kb-[^/]+$/i") && server.includes('res.status(404).end()'));
check('PHP: legacy public KB URLs blocked', apacheRules.includes('RewriteRule ^uploads/johnny-kb-[^/]+$'));
check('PHP: image content validation', phpRoute.includes('getimagesize($tmpPath)') && phpRoute.includes('johnny_validate_upload_file'));
check('PHP: document signature validation', phpRoute.includes("strpos($head, '%PDF-')") && phpRoute.includes("strncmp($head, \"PK\\x03\\x04\", 4)"));
check('Node: image analysis confidence capped at medium', /const confidence = imageAnalysis\s*\? 'medium'/.test(nodeRoute));
check('PHP: image analysis confidence capped at medium', phpRoute.includes("!empty($args['imageAnalysis']) ? 'medium'"));
check('Node: chat retention policy', nodeRoute.includes('JOHNNY_CHAT_RETENTION_DAYS') && nodeRoute.includes('CHAT_RETENTION_DAYS'));
check('PHP: chat retention policy', phpConfig.includes('JOHNNY_CHAT_RETENTION_DAYS') && phpRoute.includes('johnny_chat_retention_days'));
check('Frontend: Phase 2 copy removed', !frontend.includes('Phase 2 mobile ready'));
check('Frontend: authenticated blob KB access', frontend.includes('openAuthenticatedKbFile') && frontend.includes('response.blob()'));
check('Frontend: response metadata retained', frontend.includes('id: data.messageId || null') && frontend.includes('Sources: data.sources || []'));
check('Frontend: privacy and delete-all controls', frontend.includes('johnny-delete-all-chats') && frontend.includes('chatRetentionDays') && frontend.includes("API.delete('/johnny/conversations')"));
check('Permission audit: bulk deletion reviewed', permissionAudit.includes("'DELETE /api/johnny/conversations'"));
check('Cache chain: index', index.includes(`public/style.css?v=${cacheBust}`) && index.includes(`public/js/main.js?v=${cacheBust}`));
check('Cache chain: Johnny module', main.includes(`pages/johnny-ai.js?v=${cacheBust}`));
check('Package script registered', pkg.includes('smoke:johnny-phase1-production-foundation'));

const passed = checks.filter((item) => item.ok).length;
console.log(JSON.stringify({
  marker: 'JOHNNY_PHASE1_PRODUCTION_SAFETY_FOUNDATION',
  cacheBust,
  passed,
  total: checks.length,
  checks,
}, null, 2));
