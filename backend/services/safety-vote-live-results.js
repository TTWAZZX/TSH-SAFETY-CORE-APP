'use strict';

const CONTRACT_VERSION = '2026-10-16-safety-vote-empty-threshold-live-r1';
const SERVER_MINIMUM_THRESHOLD = 5;
const LIVE_LEADERBOARD_TOP_N_MIN = 1;
const LIVE_LEADERBOARD_TOP_N_MAX = 100;
const SCORE_MODES = Object.freeze(['count', 'percentage', 'count_percentage']);
const VISIBILITY_MODES = Object.freeze(['after_submit', 'always', 'admin_only']);

function integer(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function normalizeConfig(input = {}, campaignPrivacyThreshold = SERVER_MINIMUM_THRESHOLD) {
    const enabled = input.liveLeaderboardEnabled === true || input.LiveLeaderboardEnabled === true || Number(input.liveLeaderboardEnabled ?? input.LiveLeaderboardEnabled) === 1;
    const topN = integer(input.liveLeaderboardTopN ?? input.LiveLeaderboardTopN, 5, LIVE_LEADERBOARD_TOP_N_MIN, LIVE_LEADERBOARD_TOP_N_MAX);
    const scoreMode = String(input.liveLeaderboardScoreMode ?? input.LiveLeaderboardScoreMode ?? 'count_percentage').toLowerCase();
    const visibility = String(input.liveLeaderboardVisibility ?? input.LiveLeaderboardVisibility ?? 'after_submit').toLowerCase();
    const refreshSeconds = integer(input.liveLeaderboardRefreshSeconds ?? input.LiveLeaderboardRefreshSeconds, 15, 10, 60);
    const privacyThreshold = Math.max(SERVER_MINIMUM_THRESHOLD, integer(campaignPrivacyThreshold, SERVER_MINIMUM_THRESHOLD, 2, 100));
    const requestedThreshold = input.liveLeaderboardPrivacyThreshold ?? input.LiveLeaderboardPrivacyThreshold;
    const livePrivacyThreshold = requestedThreshold == null || requestedThreshold === '' ? privacyThreshold : integer(requestedThreshold, -1, privacyThreshold, 100);
    const errors = [];
    const rawTopN = input.liveLeaderboardTopN ?? input.LiveLeaderboardTopN;
    const rawRefresh = input.liveLeaderboardRefreshSeconds ?? input.LiveLeaderboardRefreshSeconds;
    if (rawTopN != null && rawTopN !== '' && (!Number.isInteger(Number(rawTopN)) || Number(rawTopN) < LIVE_LEADERBOARD_TOP_N_MIN || Number(rawTopN) > LIVE_LEADERBOARD_TOP_N_MAX)) errors.push({ field: 'liveLeaderboardTopN', code: 'INVALID_RANGE' });
    if (rawRefresh != null && rawRefresh !== '' && (!Number.isInteger(Number(rawRefresh)) || Number(rawRefresh) < 10 || Number(rawRefresh) > 60)) errors.push({ field: 'liveLeaderboardRefreshSeconds', code: 'OUT_OF_RANGE' });
    if (!SCORE_MODES.includes(scoreMode)) errors.push({ field: 'liveLeaderboardScoreMode', code: 'INVALID_ENUM' });
    if (!VISIBILITY_MODES.includes(visibility)) errors.push({ field: 'liveLeaderboardVisibility', code: 'INVALID_ENUM' });
    if (livePrivacyThreshold < privacyThreshold) errors.push({ field: 'liveLeaderboardPrivacyThreshold', code: 'BELOW_PRIVACY_THRESHOLD' });
    return { ok: errors.length === 0, errors, value: { enabled, topN, scoreMode, visibility, refreshSeconds, privacyThreshold: livePrivacyThreshold < privacyThreshold ? privacyThreshold : livePrivacyThreshold } };
}

function supportedQuestions(campaignType, questions = []) {
    if (String(campaignType).toLowerCase() !== 'popular_vote') return { ok: false, code: 'LIVE_RESULTS_UNSUPPORTED_CAMPAIGN_TYPE' };
    if (!questions.length) return { ok: false, code: 'LIVE_RESULTS_NO_QUESTIONS' };
    if (questions.some(question => Number(question.maxSelections ?? question.MaxSelections) !== 1 || !(question.options || []).length)) return { ok: false, code: 'LIVE_RESULTS_UNSUPPORTED_QUESTION_TYPE' };
    return { ok: true, code: null };
}

function aggregate(questions = [], answerRows = [], topN = 5) {
    const counts = new Map();
    for (const row of answerRows) {
        const questionId = Number(row.QuestionID ?? row.questionId), optionId = Number(row.OptionID ?? row.optionId);
        if (!questionId || !optionId) continue;
        const key = `${questionId}:${optionId}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return questions.map(question => {
        const questionId = Number(question.id), validAnswerCount = (question.options || []).reduce((sum, option) => sum + (counts.get(`${questionId}:${Number(option.id)}`) || 0), 0);
        const ranked = (question.options || []).map(option => ({
            optionId: Number(option.id), optionCode: option.optionCode ?? option.OptionCode, label: option.label ?? option.Label,
            description: option.description ?? option.Description ?? null, fileId: Number(option.fileId ?? option.FileID) || null,
            voteCount: counts.get(`${questionId}:${Number(option.id)}`) || 0
        })).sort((a, b) => b.voteCount - a.voteCount || a.optionId - b.optionId);
        let previous = null;
        ranked.forEach((option, index) => { option.rank = previous !== null && option.voteCount === previous ? ranked[index - 1].rank : index + 1; previous = option.voteCount; option.percentage = validAnswerCount ? Math.round(option.voteCount / validAnswerCount * 10000) / 100 : 0; option.tied = ranked.some(other => other.optionId !== option.optionId && other.voteCount === option.voteCount); });
        const summary = ranked.filter(option => option.rank <= topN);
        return { questionId, questionCode: question.questionCode ?? question.QuestionCode, title: question.title ?? question.Title, validAnswerCount, denominatorPolicy: 'valid_option_answers_including_abstain', options: ranked, summary };
    });
}

function maskedQuestions(questions = [], topN = 5, empty = false) {
    return questions.map(question => {
        const options = (question.options || []).map((option, index) => ({
            optionId: Number(option.id), optionCode: option.optionCode ?? option.OptionCode, label: option.label ?? option.Label,
            description: option.description ?? option.Description ?? null, fileId: Number(option.fileId ?? option.FileID) || null,
            displayPosition: index + 1, rank: null, voteCount: empty ? 0 : null, percentage: empty ? 0 : null,
            tied: false, pending: true
        }));
        return {
            questionId: Number(question.id), questionCode: question.questionCode ?? question.QuestionCode,
            title: question.title ?? question.Title, validAnswerCount: empty ? 0 : null,
            denominatorPolicy: 'valid_option_answers_including_abstain', scoreDisclosure: empty ? 'zero' : 'masked',
            options, summary: options.slice(0, topN)
        };
    });
}

module.exports = { CONTRACT_VERSION, SERVER_MINIMUM_THRESHOLD, LIVE_LEADERBOARD_TOP_N_MIN, LIVE_LEADERBOARD_TOP_N_MAX, SCORE_MODES, VISIBILITY_MODES, normalizeConfig, supportedQuestions, aggregate, maskedQuestions };
