'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'public', 'js', 'utils', 'async-ui.js'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'admin.js'), 'utf8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const calls = [];
  const element = {
    isConnected: true,
    innerHTML: '',
    querySelector: selector => ({ selector }),
    querySelectorAll: selector => [{ selector }],
    addEventListener: (...args) => calls.push(args)
  };
  const first = module.createLatestRenderTarget('phase96-admin-target', element);
  first.target.innerHTML = '<div></div>';
  assert.strictEqual(first.target.querySelector('.sv-role-nav').selector, '.sv-role-nav');
  assert.strictEqual(first.target.querySelectorAll('[data-sv-action]').length, 1);
  first.target.addEventListener('keydown', () => {});
  assert.strictEqual(calls.length, 1);

  const second = module.createLatestRenderTarget('phase96-admin-target', element);
  assert.strictEqual(first.isCurrent(), false, 'Prior render target must become stale');
  assert.strictEqual(first.target.querySelector('.stale'), null, 'Stale target must not reach live DOM');
  assert.deepStrictEqual(first.target.querySelectorAll('.stale'), []);
  first.target.innerHTML = '<p>stale</p>';
  assert.strictEqual(element.innerHTML, '<div></div>', 'Stale target must not overwrite current content');
  assert.strictEqual(second.target.querySelector('.current').selector, '.current');
  assert(admin.includes("../utils/async-ui.js?v=20261009-safety-vote-phase96-r1"), 'Admin cache key does not select the remediated render target');

  process.stdout.write(`${JSON.stringify({ decision: 'PASS_PHASE96_ADMIN_RENDER_TARGET', domProxy: true, staleWriteBlocked: true, cacheKeyUpdated: true }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
