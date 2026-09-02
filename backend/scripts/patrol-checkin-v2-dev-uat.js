const assert = require('assert');

const appUrl = String(process.env.PATROL_DEV_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const helperToken = String(process.env.PATROL_DEPLOY_HELPER_TOKEN || '');
const marker = `PV2D${Date.now()}`;
let fixture;
let passed = false;

assert.ok(helperToken.length >= 32, 'PATROL_DEPLOY_HELPER_TOKEN is required.');

async function helper(action, query = {}) {
    const params = new URLSearchParams({ action, ...query });
    const response = await fetch(`${appUrl}/__codex_patrol_v2_deploy.php?${params}`, {
        method: 'POST',
        headers: { 'X-Deploy-Token': helperToken, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'x=1',
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `${action}: HTTP ${response.status} ${JSON.stringify(json)}`);
    assert.strictEqual(json.success, true, `${action}: ${JSON.stringify(json)}`);
    return json.data;
}

async function api(method, route, token, body) {
    const response = await fetch(`${appUrl}/api${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

function key(suffix) {
    return `${marker}:${suffix}:001`;
}

(async () => {
    fixture = await helper('fixture-create', { marker });
    const user = fixture.userToken;
    const admin = fixture.adminToken;

    const flagOffPlan = await api('GET', `/patrol/my-monthly-plan?year=${fixture.year}&month=${fixture.month}`, user);
    assert.strictEqual(flagOffPlan.status, 200, JSON.stringify(flagOffPlan.json));
    assert.strictEqual(flagOffPlan.json.data.features.checkinV2Enabled, false, 'Flag-off legacy smoke must report v2 disabled.');

    await helper('flag', { value: '1' });

    const missed = await api('GET', `/patrol/my-missed-sessions?year=${fixture.year}&scope=all`, user);
    assert.strictEqual(missed.status, 200, JSON.stringify(missed.json));
    const missedIds = new Set((missed.json.data || []).map(row => String(row.id || row.ScheduledSessionID)));
    assert.ok(missedIds.has(fixture.sessions.priorYear), 'Prior-year Makeup session is missing.');
    assert.ok(missedIds.has(fixture.sessions.priorMonth), 'Prior-month Makeup session is missing.');

    const makeupBody = { CheckinMode: 'makeup', PatrolType: 'compensation', ScheduledSessionID: fixture.sessions.priorYear, IdempotencyKey: key('MAKEUP') };
    const makeup = await api('POST', '/patrol/checkin', user, makeupBody);
    assert.strictEqual(makeup.status, 200, JSON.stringify(makeup.json));
    const makeupReplay = await api('POST', '/patrol/checkin', user, makeupBody);
    assert.strictEqual(makeupReplay.status, 200, JSON.stringify(makeupReplay.json));
    assert.strictEqual(makeupReplay.json.data.idempotentReplay, true);
    assert.strictEqual(makeupReplay.json.data.checkin.id, makeup.json.data.checkin.id);

    const crossMonth = await api('POST', '/patrol/checkin', user, { CheckinMode: 'makeup', PatrolType: 'compensation', ScheduledSessionID: fixture.sessions.priorMonth, IdempotencyKey: key('CROSSMONTH') });
    assert.strictEqual(crossMonth.status, 200, JSON.stringify(crossMonth.json));

    const selectionRequired = await api('POST', '/patrol/checkin', user, { CheckinMode: 'scheduled', PatrolType: 'normal', IdempotencyKey: key('NOSELECT') });
    assert.strictEqual(selectionRequired.status, 409, JSON.stringify(selectionRequired.json));
    assert.strictEqual(selectionRequired.json.code, 'PATROL_SESSION_SELECTION_REQUIRED');

    for (const [index, sessionId] of [fixture.sessions.today1, fixture.sessions.today2].entries()) {
        const scheduled = await api('POST', '/patrol/checkin', user, { CheckinMode: 'scheduled', PatrolType: 'normal', ScheduledSessionID: sessionId, IdempotencyKey: key(`SCHEDULED${index}`) });
        assert.strictEqual(scheduled.status, 200, JSON.stringify(scheduled.json));
    }
    const duplicate = await api('POST', '/patrol/checkin', user, { CheckinMode: 'scheduled', PatrolType: 'normal', ScheduledSessionID: fixture.sessions.today1, IdempotencyKey: key('DUPLICATE') });
    assert.strictEqual(duplicate.status, 409, JSON.stringify(duplicate.json));

    const concurrentBody = { CheckinMode: 'extra', PatrolType: 'normal', IdempotencyKey: key('RETRY') };
    const concurrent = await Promise.all([api('POST', '/patrol/checkin', user, concurrentBody), api('POST', '/patrol/checkin', user, concurrentBody)]);
    assert.deepStrictEqual(concurrent.map(result => result.status), [200, 200]);
    assert.strictEqual(new Set(concurrent.map(result => result.json.data.checkin.id)).size, 1, 'Concurrent retry created duplicate attendance.');
    for (const suffix of ['EXTRA1', 'EXTRA2']) {
        const extra = await api('POST', '/patrol/checkin', user, { CheckinMode: 'extra', PatrolType: 'normal', IdempotencyKey: key(suffix) });
        assert.strictEqual(extra.status, 200, JSON.stringify(extra.json));
        assert.strictEqual(extra.json.data.checkin.mode, 'extra');
    }

    const plan = await api('GET', `/patrol/my-monthly-plan?year=${fixture.year}&month=${fixture.month}`, user);
    assert.strictEqual(plan.status, 200, JSON.stringify(plan.json));
    assert.strictEqual(plan.json.data.features.checkinV2Enabled, true);
    assert.ok(Number(plan.json.data.actualActivity.extra) >= 3, 'Actual Walk Activity did not count Extra walks.');
    const today3 = (plan.json.data.sessions || []).find(item => String(item.id) === fixture.sessions.today3);
    assert.ok(today3 && !today3.isCompleted, 'Extra walk incorrectly closed the remaining scheduled round.');

    const priorDetail = await api('GET', `/patrol/attendance-detail?employeeId=${encodeURIComponent(fixture.userId)}&group=top_management&year=${fixture.priorYear}`, admin);
    assert.strictEqual(priorDetail.status, 200, JSON.stringify(priorDetail.json));
    const priorSession = (priorDetail.json.data.schedule || []).find(item => String(item.sessionId) === fixture.sessions.priorYear);
    assert.ok(priorSession && priorSession.status === 'completed', 'Cross-year Makeup did not complete the scheduled round.');

    const teams = await api('GET', '/patrol/teams', admin);
    assert.strictEqual(teams.status, 200, JSON.stringify(teams.json));
    const bbsExpectedDenial = await api('GET', '/bbs/me/context', user);
    assert.strictEqual(bbsExpectedDenial.status, 403, 'Ordinary User BBS context should remain denied.');

    passed = true;
    console.log(JSON.stringify({
        success: true,
        marker,
        checks: ['flag-off', 'makeup-cross-year', 'makeup-cross-month', 'multiple-round-selection', 'scheduled-duplicate', 'network-retry', 'intentional-extra', 'actual-activity', 'scheduled-compliance', 'admin-read', 'bbs-expected-denial'],
        actualActivity: plan.json.data.actualActivity,
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try {
        if (!passed) await helper('flag', { value: '0' });
        if (fixture) {
            const residue = await helper('fixture-cleanup', { marker });
            const total = Object.values(residue).reduce((sum, value) => sum + Number(value || 0), 0);
            console.log(JSON.stringify({ cleanup: residue, total }, null, 2));
            if (total !== 0) process.exitCode = 1;
        }
    } catch (cleanupError) {
        console.error(cleanupError.stack || cleanupError);
        process.exitCode = 1;
    }
});
