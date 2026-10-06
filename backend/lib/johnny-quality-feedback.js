'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.resolve(__dirname, '..', '..', 'shared', 'johnny-answer-feedback.json');
let cachedContract = null;

function loadFeedbackContract() {
    if (cachedContract) return cachedContract;
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.ratings) || !Array.isArray(parsed.negativeReasons)) {
        throw new Error('Johnny answer feedback contract is invalid');
    }
    cachedContract = parsed;
    return cachedContract;
}

function normalizeFeedback(input = {}) {
    const contract = loadFeedbackContract();
    const rating = String(input.rating || '').trim().toLowerCase();
    if (!contract.ratings.includes(rating)) {
        const error = new Error('Invalid Johnny answer feedback rating');
        error.statusCode = 400;
        throw error;
    }
    const allowedReasons = contract.negativeReasons.map(item => item.code);
    const requestedReason = String(input.reasonCode || '').trim().toLowerCase();
    const reasonCode = rating === 'not_helpful'
        ? (allowedReasons.includes(requestedReason) ? requestedReason : 'other')
        : null;
    return { rating, reasonCode, version: contract.version };
}

function percent(part, total) {
    return total > 0 ? Math.round((Number(part || 0) / Number(total)) * 100) : 0;
}

function buildReleaseHealth(input = {}) {
    const contract = loadFeedbackContract();
    const thresholds = contract.releaseThresholds || {};
    const feedbackTotal = Number(input.feedbackTotal || 0);
    const notHelpful = Number(input.notHelpful || 0);
    const assistantMessages = Number(input.assistantMessages || 0);
    const unverifiedAnswers = Number(input.unverifiedAnswers || 0);
    const logTotal = Number(input.logTotal || 0);
    const logErrors = Number(input.logErrors || 0);
    const unsafeFeedback = Number(input.unsafeFeedback || 0);
    const errorsLastHour = Number(input.errorsLastHour || 0);
    const rates = {
        notHelpfulPercent: percent(notHelpful, feedbackTotal),
        unverifiedPercent: percent(unverifiedAnswers, assistantMessages),
        operationalErrorPercent: percent(logErrors, logTotal),
    };
    const blockers = [];
    const warnings = [];
    if (unsafeFeedback > 0) blockers.push('unsafe_feedback_requires_review');
    if (errorsLastHour > 0) blockers.push('recent_operational_errors');
    if (feedbackTotal >= Number(thresholds.minimumFeedbackSamples || 10)
        && rates.notHelpfulPercent > Number(thresholds.maximumNotHelpfulRatePercent || 25)) {
        warnings.push('not_helpful_rate_above_threshold');
    }
    if (assistantMessages > 0 && rates.unverifiedPercent > Number(thresholds.maximumUnverifiedRatePercent || 20)) {
        warnings.push('unverified_rate_above_threshold');
    }
    if (logTotal > 0 && rates.operationalErrorPercent > Number(thresholds.maximumOperationalErrorRatePercent || 5)) {
        warnings.push('operational_error_rate_above_threshold');
    }
    const feedbackSampleReady = feedbackTotal >= Number(thresholds.minimumFeedbackSamples || 10);
    const status = blockers.length ? 'needs_review' : (warnings.length ? 'watch' : (feedbackSampleReady ? 'healthy' : 'insufficient_feedback'));
    return {
        version: contract.version,
        status,
        feedbackSampleReady,
        thresholds,
        rates,
        blockers,
        warnings,
    };
}

module.exports = {
    CONTRACT_PATH,
    loadFeedbackContract,
    normalizeFeedback,
    buildReleaseHealth,
};
