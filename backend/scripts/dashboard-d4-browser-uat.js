'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyEligibilityVariants } = require('./personal-target-test-users');

const apiPort = Number(process.env.DASHBOARD_D5_API_PORT || 5015);
const apiBaseUrl = `http://localhost:${apiPort}`;
const frontendUrl = String(process.env.LOCAL_FRONTEND_URL || 'http://localhost/tsh-safety-core').replace(/\/+$/, '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.DASHBOARD_D5_CDP_PORT || process.env.DASHBOARD_D4_CDP_PORT || 9814);
const browserRuntimeDir = path.join(path.resolve(__dirname, '..', '..'), 'backups', 'local', '.uat-browser-runtime');
fs.mkdirSync(browserRuntimeDir, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(browserRuntimeDir, 'tsh-dashboard-d5-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    'local',
    `dashboard-d5-browser-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;
let server;
let sessionBootstrapScriptIdentifier = null;

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() {
        try { this.socket.close(); } catch (_) {}
    }
}

async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeout) {
        try {
            if (await evaluate(expression)) return;
            lastError = null;
        } catch (error) {
            // Navigation briefly destroys the prior execution context. Retry against the new document.
            lastError = error;
        }
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

async function screenshot(name) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(result.data, 'base64'));
}

async function navigateWithSession(destination, user, token) {
    if (sessionBootstrapScriptIdentifier) {
        await client.command('Page.removeScriptToEvaluateOnNewDocument', {
            identifier: sessionBootstrapScriptIdentifier,
        });
    }
    const bootstrap = await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            localStorage.setItem('tsh_token', ${JSON.stringify(token)});
            localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(user))});
        `,
    });
    sessionBootstrapScriptIdentifier = bootstrap.identifier;
    await client.command('Page.navigate', { url: destination });
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let index = 0; index < 60; index += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) {
                targets = await response.json();
                break;
            }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome CDP target unavailable');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.API_BASE=${JSON.stringify(`${apiBaseUrl}/api`)};
            window.__designSystemBootstrapErrors = [];
            addEventListener('error', event => window.__designSystemBootstrapErrors.push(String(event.error?.stack || event.message || 'window error')));
            addEventListener('unhandledrejection', event => window.__designSystemBootstrapErrors.push(String(event.reason?.stack || event.reason || 'unhandled rejection')));
        `,
    });
}

async function browserState() {
    return evaluate(`(() => ({
        cards: [...document.querySelectorAll('#db-module-cards a')].map(card => ({
            key: (card.getAttribute('href') || '').replace(/^#/, ''),
            status: card.querySelector('span.inline-flex.mt-2')?.textContent.trim() || '',
            primary: card.querySelector('p.text-3xl')?.textContent.trim() || ''
        })),
        summary: document.querySelector('#db-module-cards > div')?.innerText || '',
        policyTarget: document.body.innerText.includes('Safety Policy Acknowledgement'),
        companyBaselineOnly: document.body.innerText.includes('Company baseline only'),
        targetRows: document.querySelectorAll('#db-my-targets .divide-y > div').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
}

const applicationRoutes = [
    'dashboard', 'search', 'johnny-ai', 'policy', 'committee', 'kpi', 'patrol', 'cccf',
    'yokoten', 'ojt', 'employee', 'machine-safety', 'forklift', 'training', 'accident',
    'safety-culture', 'bbs-smart-card', 'safety-vote', 'contractor', 'hiyari', 'ky', 'fourm', 'admin',
];
const requestedAuditRoute = String(process.env.APP_VISUAL_AUDIT_ROUTE || '').trim();
const requestedAdminTab = String(process.env.APP_VISUAL_AUDIT_ADMIN_TAB || '').trim();
const auditedRoutes = requestedAuditRoute ? applicationRoutes.filter(route => route === requestedAuditRoute) : applicationRoutes;

async function auditApplicationRoute(route, viewport) {
    const expectedRoute = route === 'employee' ? 'admin' : route;
    const visibleRouteExpression = `(() => {
        const page = document.getElementById(${JSON.stringify(expectedRoute)} + '-page');
        if (document.body.dataset.activePage !== ${JSON.stringify(expectedRoute)} || !page) return false;
        const style = getComputedStyle(page);
        return !page.classList.contains('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
    })()`;
    await evaluate(`(async () => {
        const route = ${JSON.stringify(route)};
        history.replaceState(null, '', '#' + route);
        if (typeof handleRouting === 'function') await handleRouting();
        else window.dispatchEvent(new HashChangeEvent('hashchange'));
        return true;
    })()`);
    await waitFor(visibleRouteExpression, 30000);
    await sleep(450);
    if (!await evaluate(visibleRouteExpression)) {
        await evaluate(`(async () => {
            if (typeof handleRouting === 'function') await handleRouting();
            else window.dispatchEvent(new HashChangeEvent('hashchange'));
            return true;
        })()`);
        await waitFor(visibleRouteExpression, 30000);
        await sleep(150);
    }
    if (route === 'admin' && requestedAdminTab) {
        await evaluate(`(async () => {
            if (typeof window._adminTab !== 'function') return false;
            await window._adminTab(${JSON.stringify(requestedAdminTab)});
            return true;
        })()`);
        await waitFor(`Boolean(document.getElementById('admin-content-area'))`, 30000);
        if (requestedAdminTab === 'branding') {
            await waitFor(`Boolean(document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]'))`, 30000);
        }
        await sleep(650);
    }
    await evaluate(`(() => {
        const page = document.getElementById(${JSON.stringify(expectedRoute)} + '-page');
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const first = page && [...page.querySelectorAll('button, input, select, textarea, summary, a.btn, [role="button"]')]
            .find(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
        first?.focus({ preventScroll: true });
        return Boolean(first);
    })()`);
    await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    return evaluate(`(() => {
        const route = ${JSON.stringify(route)};
        const expectedRoute = ${JSON.stringify(expectedRoute)};
        const page = document.getElementById(expectedRoute + '-page');
        const visible = element => {
            if (!element) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const elements = page ? [...page.querySelectorAll('button, input, select, textarea, summary, a.btn, [role="button"]')].filter(visible) : [];
        const labelText = element => {
            const labelledBy = element.getAttribute('aria-labelledby');
            const labelled = labelledBy ? document.getElementById(labelledBy)?.textContent : '';
            const explicit = element.id ? document.querySelector('label[for="' + CSS.escape(element.id) + '"]')?.textContent : '';
            const wrapping = element.closest('label')?.textContent;
            return String(element.getAttribute('aria-label') || labelled || explicit || wrapping || element.getAttribute('title') || element.getAttribute('placeholder') || element.textContent || '').trim();
        };
        const smallTargets = innerWidth < 768 ? elements.filter(element => {
            const nativeChoice = element.matches('input[type="checkbox"], input[type="radio"]');
            const hitElement = nativeChoice ? element.closest('label') || element : element;
            const rect = hitElement.getBoundingClientRect();
            // CSS-pixel rounding under device emulation can report 44px controls as 43.98px.
            return rect.width < 43.5 || rect.height < 43.5;
        }).slice(0, 20).map(element => {
            const nativeChoice = element.matches('input[type="checkbox"], input[type="radio"]');
            const hitElement = nativeChoice ? element.closest('label') || element : element;
            const rect = hitElement.getBoundingClientRect();
            return { tag: element.tagName, text: labelText(element).slice(0, 80), width: Math.round(rect.width), height: Math.round(rect.height) };
        }) : [];
        const unnamed = elements.filter(element => !labelText(element)).slice(0, 20).map(element => ({
            tag: element.tagName,
            id: element.id || '',
            className: String(element.className || '').slice(0, 100),
        }));
        const focusTarget = page?.contains(document.activeElement) ? document.activeElement : null;
        const focusStyle = focusTarget ? getComputedStyle(focusTarget) : null;
        const focusVisible = !focusTarget || focusStyle.outlineStyle !== 'none' || focusStyle.boxShadow !== 'none';
        const rootOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        const pageOverflow = page ? page.scrollWidth > page.clientWidth + 2 : true;
        const pageStyle = page ? getComputedStyle(page) : null;
        const pageRect = page?.getBoundingClientRect();
        const overflowElements = page && pageRect ? [...page.querySelectorAll('*')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.right > pageRect.right + 2 || rect.left < pageRect.left - 2 || element.scrollWidth > element.clientWidth + 2);
        }).slice(0, 20).map(element => ({
            tag: element.tagName,
            id: element.id || '',
            className: String(element.className || '').slice(0, 140),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right),
        })) : [];
        return {
            route,
            renderedRoute: document.body.dataset.activePage || '',
            pagePresent: Boolean(page),
            pageVisible: Boolean(page && !page.classList.contains('hidden') && pageStyle.display !== 'none' && pageStyle.visibility !== 'hidden'),
            pageClassName: page?.className || '',
            pageDisplay: pageStyle?.display || '',
            pageVisibility: pageStyle?.visibility || '',
            contentHeight: page?.scrollHeight || 0,
            rootOverflow,
            pageOverflow,
            overflowElements,
            interactiveCount: elements.length,
            smallTargets,
            unnamed,
            focusVisible,
            focusTarget: focusTarget ? { tag: focusTarget.tagName, text: labelText(focusTarget).slice(0, 80) } : null,
            fontFamily: page ? getComputedStyle(page).fontFamily : '',
            bootstrapErrors: [...(window.__designSystemBootstrapErrors || [])],
            blockedWrites: [...(window.__designSystemBlockedWrites || [])],
        };
    })()`);
}

async function auditBrandingRealLayoutPreview() {
    const devices = [
        { key: 'desktop', width: 1440, height: 900 },
        { key: 'tablet', width: 768, height: 1024 },
        { key: 'mobile', width: 390, height: 844 },
    ];
    const results = [];

    const workspaceNavigation = await evaluate(`(() => {
        const tabs = [...document.querySelectorAll('[data-branding-workspace-tab]')];
        const visibleKeys = [...document.querySelectorAll('[data-branding-workspace-panel]')]
            .filter(panel => !panel.hidden)
            .map(panel => panel.dataset.brandingWorkspacePanel);
        return {
            tabCount: tabs.length,
            summaryCardCount: document.querySelectorAll('[data-branding-workspace-panel="overview"] [data-branding-workspace-jump]').length,
            labels: tabs.map(tab => tab.textContent.trim().replace(/\\s+/g, ' ')),
            active: tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.brandingWorkspaceTab || '',
            visibleKeys: [...new Set(visibleKeys)],
            actionBarVisible: Boolean(document.querySelector('[aria-label="การจัดการ Draft และ Publish"]')?.offsetParent),
        };
    })()`);
    assert.strictEqual(workspaceNavigation.tabCount, 5, 'Branding workspace has five task-focused sections');
    assert.strictEqual(workspaceNavigation.summaryCardCount, 4, 'Branding overview summarizes all editable areas');
    assert.strictEqual(workspaceNavigation.active, 'overview', 'Branding workspace opens on overview');
    assert.deepStrictEqual(workspaceNavigation.visibleKeys, ['overview'], 'Branding workspace initially hides unrelated sections');
    assert.strictEqual(workspaceNavigation.actionBarVisible, false, 'Overview keeps editing actions out of the Preview');

    await evaluate(`document.querySelector('[data-branding-workspace-panel="overview"] [data-branding-workspace-jump="identity"]')?.click(); true`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'identity', 'Overview shortcut opens Brand Identity');
    await evaluate(`document.getElementById('branding-next-section-btn')?.click(); true`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'login', 'Brand Identity continues to Login settings');
    await evaluate(`document.getElementById('branding-next-section-btn')?.click(); true`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'communications', 'Login settings continue to Communications');
    await evaluate(`document.getElementById('branding-next-section-btn')?.click(); true`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'overview', 'Communications continue to Preview review');

    await evaluate(`document.querySelector('[data-branding-workspace-tab="communications"]')?.click(); true`);
    const communicationsSection = await evaluate(`(() => ({
        active: document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab || '',
        visibleKeys: [...new Set([...document.querySelectorAll('[data-branding-workspace-panel]')].filter(panel => !panel.hidden).map(panel => panel.dataset.brandingWorkspacePanel))],
        headingVisible: Boolean(document.getElementById('branding-communications-heading')?.offsetParent),
        actionBarVisible: Boolean(document.querySelector('[data-branding-action-bar]')?.offsetParent)
    }))()`);
    assert.deepStrictEqual(communicationsSection, { active: 'communications', visibleKeys: ['communications'], headingVisible: true, actionBarVisible: true }, 'Branding workspace opens only the selected section with its Draft actions');

    await evaluate(`(() => {
        const tab = document.querySelector('[data-branding-workspace-tab="communications"]');
        tab?.focus();
        tab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        return true;
    })()`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'versions', 'End moves to the final Branding section');
    const releaseActions = await evaluate(`(() => ({
        publishVisible: Boolean(document.getElementById('branding-publish-btn')?.offsetParent),
        nextVisible: Boolean(document.getElementById('branding-next-section-btn')?.offsetParent),
        resetVisible: Boolean(document.getElementById('branding-reset-btn')?.offsetParent)
    }))()`);
    assert.deepStrictEqual(releaseActions, { publishVisible: true, nextVisible: false, resetVisible: true }, 'Publish and destructive Draft controls appear only in the final review section');
    await evaluate(`(() => {
        const tab = document.querySelector('[data-branding-workspace-tab="versions"]');
        tab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        return true;
    })()`);
    assert.strictEqual(await evaluate(`document.querySelector('[data-branding-workspace-tab][aria-selected="true"]')?.dataset.brandingWorkspaceTab`), 'overview', 'Home returns to Branding overview');

    const publishingWorkflow = await evaluate(`(() => {
        const heading = document.getElementById('branding-workflow-heading');
        const form = document.getElementById('branding-form');
        const saveDraft = document.getElementById('branding-save-btn');
        const publish = document.getElementById('branding-publish-btn');
        const history = document.getElementById('branding-version-list');
        return {
            heading: heading?.textContent?.trim() || '',
            formPresent: Boolean(form),
            saveDraftLabel: saveDraft?.textContent?.trim() || '',
            publishPresent: Boolean(publish),
            publishDisabledWithoutDraft: Boolean(publish?.disabled),
            historyPresent: Boolean(history),
        };
    })()`);
    assert.ok(publishingWorkflow.heading.includes('Draft'), 'Branding publishing workflow heading');
    assert.ok(publishingWorkflow.formPresent && publishingWorkflow.historyPresent, 'Branding draft form and version history');
    assert.ok(publishingWorkflow.saveDraftLabel.includes('Draft'), 'Branding save action is Draft-only');
    assert.ok(publishingWorkflow.publishPresent, 'Branding Publish action');

    const loginCommunications = await evaluate(`(() => {
        const values = {
            'branding-announcement-title': 'ทดสอบประกาศระบบ',
            'branding-announcement-message': 'ระบบจะแสดงประกาศโดยไม่เปิดเผยข้อมูลผู้ใช้',
            'branding-announcement-start': '2099-01-01T08:00',
            'branding-announcement-end': '2099-01-02T17:00',
            'branding-announcement-link-label': 'ดูรายละเอียด',
            'branding-announcement-url': '/help',
            'branding-support-title': 'ติดต่อทีมสนับสนุน',
            'branding-support-email': 'support@example.com',
            'branding-support-phone': '02-000-0000',
            'branding-support-hours': 'จันทร์–ศุกร์ 08:00–17:00 น.',
            'branding-support-link-label': 'ศูนย์ช่วยเหลือ',
            'branding-support-url': 'https://example.com/help'
        };
        Object.entries(values).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (!field) return;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const enabled = document.getElementById('branding-announcement-enabled');
        if (enabled) { enabled.checked = true; enabled.dispatchEvent(new Event('change', { bubbles: true })); }
        const tone = document.getElementById('branding-announcement-tone');
        if (tone) { tone.value = 'warning'; tone.dispatchEvent(new Event('change', { bubbles: true })); }
        return {
            controlsPresent: Object.keys(values).every(id => Boolean(document.getElementById(id))) && Boolean(enabled) && Boolean(tone),
            publishDisabledForUnsavedChanges: Boolean(document.getElementById('branding-publish-btn')?.disabled)
        };
    })()`);
    assert.deepStrictEqual(loginCommunications, { controlsPresent: true, publishDisabledForUnsavedChanges: true }, 'Login communication controls are Draft-only');
    await waitFor(`(() => {
        const doc = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]')?.contentDocument;
        return doc && !doc.getElementById('login-system-announcement')?.classList.contains('hidden')
            && doc.getElementById('login-announcement-title')?.textContent === 'ทดสอบประกาศระบบ'
            && doc.querySelectorAll('#login-support-links a').length === 3;
    })()`, 30000);
    const communicationPreview = await evaluate(`(() => {
        const doc = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]')?.contentDocument;
        const announcement = doc?.getElementById('login-system-announcement');
        return {
            announcementVisible: Boolean(announcement && !announcement.classList.contains('hidden')),
            announcementTitle: doc?.getElementById('login-announcement-title')?.textContent || '',
            announcementMessage: announcement?.querySelector('[data-login-announcement-message]')?.textContent || '',
            announcementInBrandPanel: Boolean(announcement?.closest('#login-brand-panel')),
            supportTitle: doc?.getElementById('login-support-title')?.textContent || '',
            supportHours: doc?.getElementById('login-support-hours')?.textContent || '',
            supportLinks: doc?.querySelectorAll('#login-support-links a').length || 0,
            fallbackHidden: Boolean(doc?.getElementById('login-support-fallback')?.classList.contains('hidden')),
        };
    })()`);
    assert.deepStrictEqual(communicationPreview, {
        announcementVisible: true,
        announcementTitle: 'ทดสอบประกาศระบบ',
        announcementMessage: 'ระบบจะแสดงประกาศโดยไม่เปิดเผยข้อมูลผู้ใช้',
        announcementInBrandPanel: true,
        supportTitle: 'ติดต่อทีมสนับสนุน',
        supportHours: 'จันทร์–ศุกร์ 08:00–17:00 น.',
        supportLinks: 3,
        fallbackHidden: true,
    }, 'Announcement and support channels render in real-layout Preview');

    await evaluate(`(() => {
        document.querySelector('[data-branding-workspace-tab="login"]')?.click();
        const cover = document.querySelector('input[name="branding-background-fit"][value="cover"]');
        if (cover && !cover.checked) { cover.checked = true; cover.dispatchEvent(new Event('change', { bubbles: true })); }
        document.querySelector('[data-branding-focus-preset][data-focus-x="75"][data-focus-y="75"]')?.click();
        return true;
    })()`);
    await waitFor(`(() => {
        const iframe = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]');
        const panel = iframe?.contentDocument?.getElementById('login-brand-panel');
        return document.getElementById('branding-focus-value')?.textContent.includes('X 75% · Y 75%')
            && Boolean(panel?.querySelector('[data-branding-safe-area-guide]'));
    })()`, 30000);
    const focusState = await evaluate(`(() => {
        const iframe = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]');
        const panel = iframe?.contentDocument?.getElementById('login-brand-panel');
        const marker = panel?.querySelector('[data-branding-focus-marker]');
        const pickerRect = document.getElementById('branding-focus-picker')?.getBoundingClientRect();
        return {
            value: document.getElementById('branding-focus-value')?.textContent || '',
            backgroundPosition: panel?.style.backgroundPosition || '',
            markerLeft: marker?.style.left || '',
            markerTop: marker?.style.top || '',
            safeAreaVisible: Boolean(panel?.querySelector('[data-branding-safe-area-guide]')),
            pickerAspectRatio: pickerRect?.height ? pickerRect.width / pickerRect.height : 0,
        };
    })()`);
    assert.strictEqual(focusState.value, 'X 75% · Y 75%', 'focus preset updates the selected focal coordinates');
    assert.ok(!focusState.backgroundPosition.includes(',') || focusState.backgroundPosition.endsWith('75% 75%'), `real-layout Preview uses the focal point when a custom image is present (${focusState.backgroundPosition})`);
    assert.deepStrictEqual({ markerLeft: focusState.markerLeft, markerTop: focusState.markerTop, safeAreaVisible: focusState.safeAreaVisible }, {
        markerLeft: '75%', markerTop: '75%', safeAreaVisible: true,
    }, 'focus preset updates the real-layout marker and Safe Area');
    assert.ok(focusState.pickerAspectRatio >= 0.73 && focusState.pickerAspectRatio <= 0.77, `focus editor mirrors portrait 3:4 left panel (${focusState.pickerAspectRatio})`);
    await evaluate(`(() => {
        const contain = document.querySelector('input[name="branding-background-fit"][value="contain"]');
        if (contain) { contain.checked = true; contain.dispatchEvent(new Event('change', { bubbles: true })); }
        return true;
    })()`);
    await waitFor(`document.getElementById('branding-focus-x')?.disabled === true`, 30000);
    const imageFitState = await evaluate(`(() => {
        const panel = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]')?.contentDocument?.getElementById('login-brand-panel');
        return {
            containSelected: Boolean(document.querySelector('input[name="branding-background-fit"][value="contain"]')?.checked),
            focusDisabled: Boolean(document.getElementById('branding-focus-x')?.disabled && document.getElementById('branding-focus-y')?.disabled),
            previewUsesContain: panel?.style.backgroundSize.includes('contain') || !panel?.classList.contains('has-custom-background'),
        };
    })()`);
    assert.deepStrictEqual(imageFitState, { containSelected: true, focusDisabled: true, previewUsesContain: true }, 'Contain mode shows the full image and disables crop-only focus controls');
    await evaluate(`(() => {
        const cover = document.querySelector('input[name="branding-background-fit"][value="cover"]');
        if (cover) { cover.checked = true; cover.dispatchEvent(new Event('change', { bubbles: true })); }
        return true;
    })()`);
    await evaluate(`document.querySelector('form#branding-form [data-branding-safe-area-toggle]')?.click(); true`);
    await waitFor(`!document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]')?.contentDocument?.querySelector('[data-branding-safe-area-guide]')`, 30000);
    const safeAreaHidden = await evaluate(`document.querySelector('form#branding-form [data-branding-safe-area-toggle]')?.getAttribute('aria-pressed') === 'false'`);
    assert.strictEqual(safeAreaHidden, true, 'Safe Area guide can be hidden');
    await evaluate(`document.querySelector('form#branding-form [data-branding-safe-area-toggle]')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]')?.contentDocument?.querySelector('[data-branding-safe-area-guide]'))`, 30000);

    for (const device of devices) {
        await evaluate(`(() => {
            document.querySelector('#branding-login-preview-device-tabs [data-branding-preview-device="${device.key}"]')?.click();
            return true;
        })()`);
        await waitFor(`(() => {
            const iframe = document.querySelector('#branding-login-page-preview iframe[data-branding-preview-iframe]');
            return iframe && iframe.style.width === '${device.width}px' && iframe.style.height === '${device.height}px'
                && iframe.contentDocument?.readyState === 'complete';
        })()`, 30000);
        await sleep(500);
        const state = await evaluate(`(() => {
            const expected = ${JSON.stringify(device)};
            const target = document.getElementById('branding-login-page-preview');
            const iframe = target?.querySelector('iframe[data-branding-preview-iframe]');
            const doc = iframe?.contentDocument;
            const overlay = doc?.getElementById('branding-real-login-overlay');
            const brandPanel = doc?.getElementById('login-brand-panel');
            const loginForm = doc?.getElementById('login-form');
            const active = document.querySelector('#branding-login-preview-device-tabs [aria-selected="true"]');
            const controls = [...(doc?.querySelectorAll('button, a, input, select, textarea') || [])];
            return {
                key: expected.key,
                width: iframe?.style.width || '',
                height: iframe?.style.height || '',
                title: iframe?.getAttribute('title') || '',
                activeDevice: active?.dataset.brandingPreviewDevice || '',
                overlayPresent: Boolean(overlay),
                loginFormPresent: Boolean(loginForm),
                brandPanelPresent: Boolean(brandPanel),
                horizontalOverflow: Boolean(doc && doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 2),
                populatedCredentials: [...(doc?.querySelectorAll('#employee-id, #password') || [])].some(input => input.value),
                brokenImages: [...(doc?.images || [])].filter(image => image.complete && !image.naturalWidth).length,
                unsafeInteractiveControls: controls.filter(element => element.tabIndex !== -1 && !element.hasAttribute('aria-disabled')).length,
                pointerEvents: iframe ? getComputedStyle(iframe).pointerEvents : '',
            };
        })()`);
        assert.strictEqual(state.width, `${device.width}px`, `${device.key}: exact preview width`);
        assert.strictEqual(state.height, `${device.height}px`, `${device.key}: exact preview height`);
        assert.strictEqual(state.activeDevice, device.key, `${device.key}: active preview tab`);
        assert.ok(state.overlayPresent && state.loginFormPresent && state.brandPanelPresent, `${device.key}: real Login structure cloned`);
        assert.strictEqual(state.horizontalOverflow, false, `${device.key}: preview horizontal overflow`);
        assert.strictEqual(state.populatedCredentials, false, `${device.key}: credential values excluded`);
        assert.strictEqual(state.brokenImages, 0, `${device.key}: broken preview images`);
        assert.strictEqual(state.unsafeInteractiveControls, 0, `${device.key}: preview controls are inert`);
        results.push(state);
    }

    await evaluate(`(() => {
        document.querySelector('[data-branding-workspace-tab="overview"]')?.click();
        const trigger = document.getElementById('branding-login-full-preview-btn');
        trigger?.focus();
        trigger?.click();
        return true;
    })()`);
    await waitFor(`Boolean(document.querySelector('#branding-login-full-preview[role="dialog"][aria-modal="true"] iframe[data-branding-preview-iframe]'))`, 30000);
    const dialogState = await evaluate(`(() => {
        const dialog = document.getElementById('branding-login-full-preview');
        const close = dialog?.querySelector('[data-branding-preview-close]');
        return {
            present: Boolean(dialog),
            labelled: Boolean(dialog?.getAttribute('aria-labelledby') && document.getElementById(dialog.getAttribute('aria-labelledby'))),
            closeFocused: close === document.activeElement,
            bodyLocked: document.body.style.overflow === 'hidden',
            deviceTabs: dialog?.querySelectorAll('[data-branding-preview-device]').length || 0,
        };
    })()`);
    assert.deepStrictEqual(dialogState, {
        present: true,
        labelled: true,
        closeFocused: true,
        bodyLocked: true,
        deviceTabs: 3,
    }, 'full-screen preview dialog semantics');
    await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(`!document.getElementById('branding-login-full-preview')`, 10000);
    const closeState = await evaluate(`(() => ({
        dialogRemoved: !document.getElementById('branding-login-full-preview'),
        bodyUnlocked: document.body.style.overflow !== 'hidden',
        focusReturned: document.activeElement?.id === 'branding-login-full-preview-btn',
    }))()`);
    assert.deepStrictEqual(closeState, {
        dialogRemoved: true,
        bodyUnlocked: true,
        focusReturned: true,
    }, 'full-screen preview closes safely and restores focus');

    return { workspaceNavigation, releaseActions, publishingWorkflow, loginCommunications, communicationPreview, focus: focusState, imageFit: imageFitState, safeAreaToggle: true, devices: results, dialog: dialogState, close: closeState };
}

const expectedLabels = {
    DATA_UNAVAILABLE: 'Data unavailable',
    CRITICAL: 'Critical',
    WATCH: 'Watch',
    ON_TRACK: 'On Track',
    N_A: 'N/A',
};

async function loadDashboardVariant(name, variant) {
    if (!variant) return { name, available: false, skipped: true };
    const token = jwt.sign(variant.user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const [overviewResponse, targetResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/dashboard/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBaseUrl}/api/activity-targets/me`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const overviewBody = await overviewResponse.json();
    const targetBody = await targetResponse.json();
    assert.strictEqual(overviewResponse.status, 200, `${name}: Dashboard overview API`);
    assert.strictEqual(targetResponse.status, 200, `${name}: Personal Target API`);
    const overview = overviewBody.data;
    const personalTargets = targetBody.data;
    const destination = `${frontendUrl}/?d5v=${encodeURIComponent(name)}&ts=${Date.now()}#dashboard`;
    await navigateWithSession(destination, variant.user, token);
    const readyExpression = `location.search.includes(${JSON.stringify(`d5v=${encodeURIComponent(name)}`)})`
        + ` && document.querySelectorAll('#db-module-cards a').length === 15`
        + ` && document.body.innerText.includes('Safety Policy Acknowledgement')`;
    try {
        await waitFor(readyExpression);
    } catch (error) {
        const diagnostic = await evaluate(`(() => ({
            href: location.href,
            readyState: document.readyState,
            activePage: document.body.dataset.activePage || '',
            cards: document.querySelectorAll('#db-module-cards a').length,
            hasPolicyTarget: document.body.innerText.includes('Safety Policy Acknowledgement'),
            scripts: [...document.scripts].map(script => script.src).filter(Boolean),
            errors: window.__designSystemBootstrapErrors || [],
            bodyText: document.body.innerText.slice(0, 500),
        }))()`);
        throw new Error(`${error.message}\nDashboard bootstrap diagnostic: ${JSON.stringify(diagnostic)}`);
    }
    const expectsBaselineOnly = !personalTargets.eligibility.hasAdditionalConfiguredTargets;
    await waitFor(
        `document.querySelectorAll('#db-my-targets .divide-y > div').length === ${Number(personalTargets.targets.length)}`
        + ` && document.body.innerText.includes('Company baseline only') === ${expectsBaselineOnly}`,
        30000
    );

    const state = await browserState();
    assert.strictEqual(state.cards.length, 15, `${name}: Module Health cards`);
    for (const card of state.cards) {
        assert.strictEqual(
            card.status,
            expectedLabels[overview.moduleMetrics[card.key].status],
            `${name}/${card.key}: browser/API canonical status`
        );
    }
    assert.ok(
        state.summary.includes('Unavailable') && state.summary.includes('N/A'),
        `${name}: canonical summary signals`
    );
    assert.strictEqual(state.policyTarget, true, `${name}: mandatory Policy target rendered`);
    assert.strictEqual(
        state.companyBaselineOnly,
        !personalTargets.eligibility.hasAdditionalConfiguredTargets,
        `${name}: baseline-only notice`
    );
    assert.strictEqual(
        state.targetRows,
        personalTargets.targets.length,
        `${name}: rendered/API Personal Target count`
    );
    assert.strictEqual(state.horizontalOverflow, false, `${name}: horizontal overflow`);
    return {
        name,
        available: true,
        skipped: false,
        state,
        eligibility: personalTargets.eligibility,
        expectedStatuses: Object.fromEntries(
            Object.entries(overview.moduleMetrics).map(([key, metric]) => [key, metric.status])
        ),
    };
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const variants = await loadReadyEligibilityVariants(db);
    assert.ok(variants.configured || variants.baselineOnly, 'A READY eligibility variant is required');
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    const brandingResponse = await fetch(`${apiBaseUrl}/api/public/branding`);
    const brandingBody = await brandingResponse.json();
    const publicBrandingContract = brandingBody?.data || {};
    assert.strictEqual(brandingResponse.status, 200, 'public Branding contract status');
    assert.ok(Number.isFinite(publicBrandingContract.loginBackgroundFocusX) && publicBrandingContract.loginBackgroundFocusX >= 0 && publicBrandingContract.loginBackgroundFocusX <= 100, 'public Branding focus X is bounded');
    assert.ok(Number.isFinite(publicBrandingContract.loginBackgroundFocusY) && publicBrandingContract.loginBackgroundFocusY >= 0 && publicBrandingContract.loginBackgroundFocusY <= 100, 'public Branding focus Y is bounded');
    assert.strictEqual(typeof publicBrandingContract.loginAnnouncementEnabled, 'boolean', 'public Branding announcement enabled contract');
    assert.ok(['info', 'warning', 'critical'].includes(publicBrandingContract.loginAnnouncementTone), 'public Branding announcement tone contract');
    assert.strictEqual(typeof publicBrandingContract.supportTitle, 'string', 'public Branding support title contract');
    await connectBrowser();
    await client.command('Page.navigate', { url: `${frontendUrl}/?d4=${Date.now()}` });
    await waitFor(`document.readyState === 'complete'`);

    let configuredDesktop = { name: 'configured-desktop', available: false, skipped: true };
    let baselineDesktop = { name: 'baseline-only-desktop', available: false, skipped: true };
    const responsiveViewports = [];
    const viewportMatrix = [
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
    ];
    if (!requestedAuditRoute) {
        configuredDesktop = await loadDashboardVariant('configured-desktop', variants.configured);
        if (configuredDesktop.available) {
            await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
            await sleep(300);
            await screenshot('desktop-module-health.png');
            await evaluate(`document.getElementById('db-my-targets').scrollIntoView({block:'center'}); true`);
            await sleep(300);
            await screenshot('desktop-personal-targets-configured.png');
        }
        baselineDesktop = await loadDashboardVariant('baseline-only-desktop', variants.baselineOnly);
        if (baselineDesktop.available) {
            if (!configuredDesktop.available) {
                await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
                await sleep(300);
                await screenshot('desktop-module-health.png');
            }
            await evaluate(`document.getElementById('db-my-targets').scrollIntoView({block:'center'}); true`);
            await sleep(300);
            await screenshot('desktop-personal-targets-baseline-only.png');
        }

        const responsiveVariant = configuredDesktop.available ? variants.configured : variants.baselineOnly;
        const responsivePrefix = configuredDesktop.available ? 'configured' : 'baseline-only';
        for (const viewport of viewportMatrix) {
            await client.command('Emulation.setDeviceMetricsOverride', {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: 1,
                mobile: viewport.width < 768,
            });
            await sleep(300);
            const result = await loadDashboardVariant(
                `${responsivePrefix}-${viewport.width}x${viewport.height}`,
                responsiveVariant
            );
            await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
            await sleep(200);
            await screenshot(`responsive-module-health-${viewport.width}x${viewport.height}.png`);
            responsiveViewports.push({ ...viewport, ...result });
        }
    }
    const mobile = responsiveViewports[0] || null;

    const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE LOWER(Role)='admin' ORDER BY EmployeeID LIMIT 1");
    assert.ok(admin, 'Local Admin fixture is required for the full application visual audit');
    const adminUser = {
        id: admin.EmployeeID,
        EmployeeID: admin.EmployeeID,
        name: admin.EmployeeName,
        EmployeeName: admin.EmployeeName,
        role: admin.Role,
        Role: admin.Role,
        department: admin.Department,
        Department: admin.Department,
        unit: admin.Unit,
        Unit: admin.Unit,
        position: admin.Position,
        Position: admin.Position,
    };
    const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: '20m' });
    await navigateWithSession(`${frontendUrl}/?d5admin=${Date.now()}#dashboard`, adminUser, adminToken);
    await waitFor(`document.body.dataset.activePage === 'dashboard'`);
    await evaluate(`(() => {
        window.alert = () => undefined;
        window.confirm = () => false;
        window.__designSystemBlockedWrites = [];
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init = {}) => {
            const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                const url = String(typeof input === 'string' ? input : input?.url || '');
                window.__designSystemBlockedWrites.push({ method, url });
                return Promise.reject(new Error('DESIGN_SYSTEM_UAT_BLOCKED_WRITE'));
            }
            return originalFetch(input, init);
        };
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__designSystemMethod = String(method || 'GET').toUpperCase();
            this.__designSystemUrl = String(url || '');
            return open.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
            if (!['GET', 'HEAD', 'OPTIONS'].includes(this.__designSystemMethod || 'GET')) {
                window.__designSystemBlockedWrites.push({ method: this.__designSystemMethod, url: this.__designSystemUrl });
                throw new Error('DESIGN_SYSTEM_UAT_BLOCKED_WRITE');
            }
            return send.apply(this, args);
        };
        return true;
    })()`);

    const applicationVisualAudit = [];
    let brandingRealLayoutPreview = null;
    for (const viewport of viewportMatrix) {
        await client.command('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: viewport.width < 768,
        });
        await sleep(250);
        for (const route of auditedRoutes) {
            const audited = await auditApplicationRoute(route, viewport);
            applicationVisualAudit.push({ ...viewport, ...audited });
            assert.ok(audited.pagePresent && audited.pageVisible, `${route}/${viewport.width}: page render ${JSON.stringify(audited)}`);
            assert.strictEqual(audited.rootOverflow, false, `${route}/${viewport.width}: root horizontal overflow`);
            assert.strictEqual(audited.pageOverflow, false, `${route}/${viewport.width}: page horizontal overflow ${JSON.stringify(audited.overflowElements)}`);
            assert.strictEqual(audited.focusVisible, true, `${route}/${viewport.width}: focus visibility`);
            assert.ok(/Kanit/i.test(audited.fontFamily), `${route}/${viewport.width}: shared typography`);
            assert.deepStrictEqual(audited.smallTargets, [], `${route}/${viewport.width}: touch targets smaller than 44px`);
            assert.deepStrictEqual(audited.unnamed, [], `${route}/${viewport.width}: interactive controls without accessible names`);
            assert.deepStrictEqual(audited.bootstrapErrors, [], `${route}/${viewport.width}: uncaught browser errors`);
            assert.deepStrictEqual(audited.blockedWrites, [], `${route}/${viewport.width}: unexpected write attempt`);
            if (route === 'admin' && requestedAdminTab === 'branding' && viewport.width === 1366) {
                brandingRealLayoutPreview = await auditBrandingRealLayoutPreview();
                await screenshot('branding-real-layout-preview-1366x768.png');
                await evaluate(`document.getElementById('branding-login-preview-heading')?.scrollIntoView({ block: 'start' }); true`);
                await sleep(200);
            }
            if ((viewport.width === 390 || viewport.width === 1366) && route !== 'employee') {
                await screenshot(`module-${route}-${viewport.width}x${viewport.height}.png`);
            }
        }
    }

    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        readyEligibilityAvailability: variants.counts,
        configuredDesktop,
        baselineDesktop,
        mobile,
        responsiveViewports,
        publicBrandingContract: {
            loginBackgroundFocusX: publicBrandingContract.loginBackgroundFocusX,
            loginBackgroundFocusY: publicBrandingContract.loginBackgroundFocusY,
            loginAnnouncementEnabled: publicBrandingContract.loginAnnouncementEnabled,
            loginAnnouncementTone: publicBrandingContract.loginAnnouncementTone,
            supportTitle: publicBrandingContract.supportTitle,
        },
        applicationVisualAudit,
        brandingRealLayoutPreview,
        applicationVisualAuditSummary: {
            routes: auditedRoutes.length,
            viewportRouteCombinations: applicationVisualAudit.length,
            horizontalOverflow: applicationVisualAudit.filter(item => item.rootOverflow || item.pageOverflow).length,
            missingAccessibleNames: applicationVisualAudit.reduce((sum, item) => sum + item.unnamed.length, 0),
            smallMobileTargets: applicationVisualAudit.reduce((sum, item) => sum + item.smallTargets.length, 0),
            blockedBusinessWrites: applicationVisualAudit.reduce((sum, item) => sum + item.blockedWrites.length, 0),
            uncaughtBrowserErrors: applicationVisualAudit.reduce((sum, item) => sum + item.bootstrapErrors.length, 0),
        },
        passed: true,
    }, null, 2));
    console.log('PASS Dashboard D5 authenticated browser UAT: 15/15 canonical statuses, both READY eligibility variants, five responsive viewports without overflow');
    console.log(`PASS application visual audit: ${auditedRoutes.length} routes x ${viewportMatrix.length} viewports, no overflow, visible focus, shared typography, zero write attempts`);
    if (brandingRealLayoutPreview) console.log('PASS Branding real-layout preview: Desktop/Tablet/Mobile exact viewports, inert credentials, full-screen dialog and focus restore');
    console.log(`ARTIFACT ${artifactDir}`);
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        client?.close();
        if (browser && !browser.killed) browser.kill();
        if (server) await new Promise(resolve => server.close(resolve));
        await db.end();
        await sleep(300);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmdirSync(browserRuntimeDir); } catch (_) {}
    });
