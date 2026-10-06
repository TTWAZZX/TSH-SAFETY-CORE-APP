'use strict';

const { loadSystemUsageCatalog } = require('./johnny-system-usage');

const WORKFLOW_CONTRACT_VERSION = '2026-10-06-phase5-r1';
const DRAFT_TARGETS = new Set(['hiyari', 'ky', 'patrol']);

function getWorkflowActionContract() {
    const catalog = loadSystemUsageCatalog();
    const navigationTargets = catalog.modules.map(entry => ({
        key: entry.key,
        route: entry.route,
        title: entry.title,
    }));
    return {
        version: WORKFLOW_CONTRACT_VERSION,
        navigationTargets,
        draftTargets: navigationTargets.filter(entry => DRAFT_TARGETS.has(entry.key)),
        autoSubmit: false,
        businessMutation: false,
    };
}

function normalizeWorkflowAction(input = {}) {
    const contract = getWorkflowActionContract();
    const requestedTarget = String(input.target || '').trim().toLowerCase();
    const requestedAction = String(input.action || '').trim().toLowerCase();
    const action = requestedAction === 'deep_link' ? 'navigate' : requestedAction;
    if (!['navigate', 'draft'].includes(action)) {
        const error = new Error('Invalid Johnny workflow action');
        error.statusCode = 400;
        throw error;
    }
    const target = contract.navigationTargets.find(entry => entry.key === requestedTarget || entry.route === requestedTarget);
    if (!target) {
        const error = new Error('Invalid Johnny workflow target');
        error.statusCode = 400;
        throw error;
    }
    if (action === 'draft' && !DRAFT_TARGETS.has(target.key)) {
        const error = new Error('Johnny draft handoff is not available for this module');
        error.statusCode = 400;
        throw error;
    }
    return {
        version: contract.version,
        action,
        target: target.key,
        route: target.route,
        title: target.title,
        autoSubmit: false,
        businessMutation: false,
    };
}

module.exports = {
    WORKFLOW_CONTRACT_VERSION,
    getWorkflowActionContract,
    normalizeWorkflowAction,
};
