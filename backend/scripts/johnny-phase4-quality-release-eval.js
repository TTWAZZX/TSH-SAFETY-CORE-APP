'use strict';

const fs = require('fs');
const path = require('path');
const {
    loadFeedbackContract,
    normalizeFeedback,
    buildReleaseHealth,
} = require('../lib/johnny-quality-feedback');

const ROOT = path.join(__dirname, '..', '..');
const results = [];

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function check(name, condition, details = '') {
    results.push({ name, pass: Boolean(condition), details });
}

function main() {
    const contract = loadFeedbackContract();
    const nodeRoute = read('backend/routes/johnny-ai.js');
    const phpRoute = read('api/handlers/johnny_ai.php');
    const workspace = read('public/js/pages/johnny-ai.js');
    const drawer = read('public/js/johnny-drawer.js');
    const style = read('public/style.css');
    const permissionAudit = read('backend/scripts/permission-audit.js');
    const schemaMigration = read('backend/migrations/20261006_johnny_phase7_schema.sql');

    check('contract version', contract.version === '2026-10-06-phase4-r1');
    check('two fixed ratings', JSON.stringify(contract.ratings) === JSON.stringify(['helpful', 'not_helpful']));
    check('negative reason coverage', contract.negativeReasons.length === 6 && contract.negativeReasons.some(item => item.code === 'unsafe'));
    check('contract stores no message text', contract.privacy?.storesMessageText === false);
    check('contract stores no free text', contract.privacy?.storesFreeText === false);

    const helpful = normalizeFeedback({ rating: 'HELPFUL', reasonCode: 'unsafe' });
    const negative = normalizeFeedback({ rating: 'not_helpful', reasonCode: 'missing_source' });
    const fallback = normalizeFeedback({ rating: 'not_helpful', reasonCode: 'invented' });
    check('helpful clears reason', helpful.rating === 'helpful' && helpful.reasonCode === null);
    check('negative reason accepted', negative.reasonCode === 'missing_source');
    check('unknown negative reason is bounded', fallback.reasonCode === 'other');
    let invalidRejected = false;
    try { normalizeFeedback({ rating: 'five_stars' }); } catch (error) { invalidRejected = error.statusCode === 400; }
    check('invalid rating rejected', invalidRejected);

    const scenarios = [
        ['insufficient feedback', {}, 'insufficient_feedback'],
        ['healthy', { feedbackTotal: 10, notHelpful: 1, assistantMessages: 20, unverifiedAnswers: 1, logTotal: 100, logErrors: 1 }, 'healthy'],
        ['not helpful watch', { feedbackTotal: 20, notHelpful: 6 }, 'watch'],
        ['unverified watch', { feedbackTotal: 10, assistantMessages: 10, unverifiedAnswers: 3 }, 'watch'],
        ['error rate watch', { feedbackTotal: 10, logTotal: 20, logErrors: 2 }, 'watch'],
        ['unsafe review', { feedbackTotal: 10, unsafeFeedback: 1 }, 'needs_review'],
        ['recent error review', { feedbackTotal: 10, errorsLastHour: 1 }, 'needs_review'],
    ];
    scenarios.forEach(([name, input, expected]) => {
        const health = buildReleaseHealth(input);
        check(`release health: ${name}`, health.status === expected, JSON.stringify(health));
    });

    [nodeRoute, phpRoute].forEach((source, index) => {
        const stack = index === 0 ? 'Node' : 'PHP';
        check(`${stack} uses explicit feedback migration`, schemaMigration.includes('CREATE TABLE IF NOT EXISTS johnny_answer_feedback'));
        check(`${stack} migration has cascade lifecycle`, schemaMigration.includes('ON DELETE CASCADE'));
        check(`${stack} upserts fixed feedback`, source.includes('ON DUPLICATE KEY UPDATE Rating=VALUES(Rating)'));
        check(`${stack} enforces assistant ownership`, source.includes("UserID=? AND Role='assistant'"));
        check(`${stack} history exposes feedback state`, source.includes('FeedbackRating') && source.includes('FeedbackReasonCode'));
        check(`${stack} observability includes feedback`, source.includes('unsafeFeedback') && source.includes('releaseHealth'));
        check(`${stack} counts system usage as verified`, source.includes("'system_usage','system_data'"));
        check(`${stack} exposes privacy flags`, source.includes('answerFeedbackStoresMessageText') && source.includes('answerFeedbackStoresFreeText'));
    });

    check('Node PUT feedback route', nodeRoute.includes("router.put('/messages/:id/feedback'"));
    check('Node DELETE feedback route', nodeRoute.includes("router.delete('/messages/:id/feedback'"));
    check('PHP PUT feedback route', phpRoute.includes("$method === 'PUT'") && phpRoute.includes("'/johnny/messages/:id/feedback'"));
    check('PHP DELETE feedback route', phpRoute.includes("$method === 'DELETE'") && phpRoute.includes("'/johnny/messages/:id/feedback'"));
    check('workspace feedback controls', workspace.includes('data-johnny-phase4-feedback') && workspace.includes('updateAnswerFeedback'));
    check('drawer feedback controls', drawer.includes('data-johnny-phase4-feedback') && drawer.includes('updateFeedback'));
    check('admin release health UI', workspace.includes('data-johnny-phase4-release-health') && workspace.includes('Feedback by source'));
    check('drawer feedback touch targets', style.includes('.johnny-global-feedback-button') && style.includes('min-height: 2.75rem'));
    check('permission audit reviews PUT', permissionAudit.includes("'PUT /api/johnny/messages/:id/feedback'"));
    check('permission audit reviews DELETE', permissionAudit.includes("'DELETE /api/johnny/messages/:id/feedback'"));

    const failures = results.filter(item => !item.pass);
    console.log(JSON.stringify({
        marker: 'JOHNNY_PHASE4_QUALITY_FEEDBACK_RELEASE_READINESS',
        mode: 'mock-only-no-db-no-network',
        checks: results.length,
        passed: results.length - failures.length,
        failed: failures.length,
        failures,
    }, null, 2));
    if (failures.length) process.exit(1);
}

main();
