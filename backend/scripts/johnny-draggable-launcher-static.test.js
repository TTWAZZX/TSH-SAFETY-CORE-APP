'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const drawer = read('public/js/johnny-drawer.js');
const main = read('public/js/main.js');
const css = read('public/style.css');
const html = read('index.html');

const checks = [
    [drawer.includes("tsh_johnny_launcher_position_${_userId || 'user'}"), 'position must be stored per user'],
    [drawer.includes("addEventListener('pointerdown', handleLauncherPointerDown)"), 'pointer drag start is missing'],
    [drawer.includes("addEventListener('pointermove', handleLauncherPointerMove)"), 'pointer drag movement is missing'],
    [drawer.includes("addEventListener('pointerup', handleLauncherPointerEnd)"), 'pointer drag completion is missing'],
    [drawer.includes("addEventListener('pointercancel', handleLauncherPointerEnd)"), 'pointer cancellation is missing'],
    [drawer.includes('Math.hypot(deltaX, deltaY) < 6'), 'click-versus-drag movement threshold is missing'],
    [drawer.includes('_suppressLauncherClick'), 'drag must suppress the following synthetic click'],
    [drawer.includes('launcherBounds') && drawer.includes('Math.max(minX') && drawer.includes('Math.max(minY'), 'viewport clamping is missing'],
    [drawer.includes('window.visualViewport') && drawer.includes("window.addEventListener('resize'"), 'viewport resize handling is missing'],
    [drawer.includes('rememberLauncherPosition') && drawer.includes('restoreLauncherPosition'), 'position persistence is incomplete'],
    [drawer.includes("event.key === 'Home'") && drawer.includes('ArrowLeft') && drawer.includes('ArrowRight'), 'keyboard movement/reset is missing'],
    [drawer.includes('aria-describedby="johnny-global-launcher-help"'), 'accessible launcher instructions are missing'],
    [drawer.includes('unbindLauncherViewportEvents()'), 'viewport listener cleanup is missing'],
    [css.includes('cursor: grab') && css.includes('cursor: grabbing'), 'drag cursor states are missing'],
    [css.includes('touch-action: none'), 'touch dragging must not scroll the page'],
    [css.includes('.johnny-global-launcher.is-positioned'), 'custom-position CSS state is missing'],
    [css.includes('.johnny-global-launcher.is-dragging'), 'active drag CSS state is missing'],
    [main.includes("johnny-drawer.js?v=20261010-johnny-draggable-launcher-r1"), 'drawer cache key is stale'],
    [html.includes('johnny-drag-r1'), 'entrypoint cache key is stale'],
];

for (const [condition, message] of checks) assert(condition, message);
console.log(`Johnny draggable launcher static contract: PASS (${checks.length} assertions)`);
