'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'public', 'js', 'session.js'), 'utf8');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = payload => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.fixture-signature`;

function runtime(initial = {}) {
    const values = new Map(Object.entries(initial));
    let fetchCount = 0;
    const context = {
        console,
        Date,
        JSON,
        Error,
        Boolean,
        Number,
        String,
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        localStorage: {
            getItem: key => values.has(key) ? values.get(key) : null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key)
        },
        fetch: async () => {
            fetchCount += 1;
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({ success: true, user: { id: '012609' }, token: 'refreshed-token' })
            };
        },
        window: { location: { hostname: 'localhost', pathname: '/' } }
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, values, fetchCount: () => fetchCount };
}

(async () => {
    const expired = runtime({
        tsh_token: token({ exp: Math.floor(Date.now() / 1000) - 60 }),
        tsh_user: JSON.stringify({ id: '012609' })
    });
    assert.strictEqual(await expired.context.window.TSHSession.refreshSession(), null);
    assert.strictEqual(expired.fetchCount(), 0, 'expired JWT must not reach /session/verify');
    assert.strictEqual(expired.values.has('tsh_token'), false, 'expired token must be cleared');
    assert.strictEqual(expired.values.has('tsh_user'), false, 'expired user cache must be cleared');

    const active = runtime({
        tsh_token: token({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        tsh_user: JSON.stringify({ id: '012609' })
    });
    const result = await active.context.window.TSHSession.refreshSession();
    assert.strictEqual(active.fetchCount(), 1, 'active JWT must still be verified by the server');
    assert.strictEqual(result.user.id, '012609');
    assert.strictEqual(active.values.get('tsh_token'), 'refreshed-token');

    console.log('Session JWT expiry preflight: PASS (expired token cleared locally, active token server-verified)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
