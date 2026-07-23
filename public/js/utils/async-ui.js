const actionLocks = new Map();
const latestRequests = new Map();

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
}

function stableElementKey(element, prefix) {
    if (!element) return null;
    const dataset = element.dataset || {};
    const explicit = dataset.asyncAction || dataset.actionKey;
    if (explicit) return `${prefix}:${explicit}`;
    if (element.id) return `${prefix}:id:${element.id}`;
    const classKey = String(element.className || '').trim().split(/\s+/).slice(0, 3).join('.');
    const recordKey = dataset.id || dataset.version || dataset.requestId || dataset.licenseId || dataset.type || '';
    if (recordKey) return `${prefix}:${classKey}:${recordKey}`;
    return element;
}

function spinnerMarkup(message) {
    return `<span class="inline-flex items-center gap-2"><span class="inline-block h-3.5 w-3.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span><span>${escapeHtml(message || 'กำลังดำเนินการ...')}</span></span>`;
}

export function isActionLocked(actionKey) {
    return actionKey != null && actionLocks.has(actionKey);
}

export function withActionLock(actionKey, task) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
    if (actionKey == null || actionKey === '') return Promise.resolve().then(task);
    if (actionLocks.has(actionKey)) return actionLocks.get(actionKey);
    let resolveTask;
    let rejectTask;
    const taskPromise = new Promise((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
    });
    let trackedPromise;
    trackedPromise = taskPromise.finally(() => {
        if (actionLocks.get(actionKey) === trackedPromise) actionLocks.delete(actionKey);
    });
    actionLocks.set(actionKey, trackedPromise);
    try {
        Promise.resolve(task()).then(resolveTask, rejectTask);
    } catch (error) {
        rejectTask(error);
    }
    return trackedPromise;
}

export function runBusy(button, message, task, options = {}) {
    if (!button) return Promise.reject(new TypeError('runBusy requires a button'));
    if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
    const settings = options && typeof options === 'object' ? options : {};
    const actionKey = settings.actionKey || stableElementKey(button, 'button');
    if (isActionLocked(actionKey)) return actionLocks.get(actionKey);
    const snapshot = {
        disabled: Boolean(button.disabled),
        innerHTML: button.innerHTML,
        ariaBusy: button.getAttribute?.('aria-busy'),
        busy: button.dataset?.busy,
    };
    return withActionLock(actionKey, async () => {
        if (button.dataset) button.dataset.busy = '1';
        button.disabled = true;
        button.setAttribute?.('aria-busy', 'true');
        if (settings.render !== false) button.innerHTML = spinnerMarkup(message);
        try {
            return await task();
        } finally {
            button.disabled = snapshot.disabled;
            button.innerHTML = snapshot.innerHTML;
            if (snapshot.ariaBusy == null) button.removeAttribute?.('aria-busy');
            else button.setAttribute?.('aria-busy', snapshot.ariaBusy);
            if (button.dataset) {
                if (snapshot.busy == null) delete button.dataset.busy;
                else button.dataset.busy = snapshot.busy;
            }
        }
    });
}

export function runFormBusy(form, message, task, options = {}) {
    if (!form) return Promise.reject(new TypeError('runFormBusy requires a form'));
    if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
    const settings = options && typeof options === 'object' ? options : {};
    const actionKey = settings.actionKey || stableElementKey(form, 'form');
    if (isActionLocked(actionKey)) return actionLocks.get(actionKey);
    const controls = Array.from(form.elements || []);
    const controlStates = controls.map(control => ({ control, disabled: Boolean(control.disabled) }));
    const submitter = settings.submitter || controls.find(control => String(control.type || '').toLowerCase() === 'submit') || null;
    const submitterHtml = submitter?.innerHTML;
    const ariaBusy = form.getAttribute?.('aria-busy');
    const submitting = form.dataset?.submitting;
    return withActionLock(actionKey, async () => {
        if (form.dataset) form.dataset.submitting = '1';
        form.setAttribute?.('aria-busy', 'true');
        controlStates.forEach(({ control }) => { control.disabled = true; });
        if (submitter && settings.render !== false) submitter.innerHTML = spinnerMarkup(message);
        try {
            return await task();
        } finally {
            controlStates.forEach(({ control, disabled }) => { control.disabled = disabled; });
            if (submitter) submitter.innerHTML = submitterHtml;
            if (ariaBusy == null) form.removeAttribute?.('aria-busy');
            else form.setAttribute?.('aria-busy', ariaBusy);
            if (form.dataset) {
                if (submitting == null) delete form.dataset.submitting;
                else form.dataset.submitting = submitting;
            }
        }
    });
}

export function guardSubmitHandler(handler, options = {}) {
    if (typeof handler !== 'function') throw new TypeError('guardSubmitHandler requires a handler');
    const settings = options && typeof options === 'object' ? options : {};
    return function guardedSubmit(event) {
        event?.preventDefault?.();
        const eventTarget = event?.currentTarget || event?.target;
        const form = typeof settings.target === 'function'
            ? settings.target(event, eventTarget)
            : (settings.target || eventTarget);
        if (!form && typeof settings.target === 'function') return handler.call(this, event);
        if (!form) return Promise.reject(new TypeError('guarded submit requires a form event'));
        const actionKey = typeof settings.actionKey === 'function'
            ? settings.actionKey(event, form)
            : (settings.actionKey || stableElementKey(form, 'form'));
        if (isActionLocked(actionKey)) {
            event?.stopImmediatePropagation?.();
            return actionLocks.get(actionKey);
        }

        const controls = Array.from(form.elements || []);
        const controlStates = controls.map(control => ({ control, disabled: Boolean(control.disabled) }));
        const submitter = event?.submitter || controls.find(control => String(control.type || '').toLowerCase() === 'submit') || null;
        const submitterHtml = submitter?.innerHTML;
        const ariaBusy = form.getAttribute?.('aria-busy');
        const submitting = form.dataset?.submitting;

        return withActionLock(actionKey, async () => {
            // Invoke first so existing handlers can synchronously read FormData before controls are disabled.
            const result = handler.call(this, event);
            if (form.dataset) form.dataset.submitting = '1';
            form.setAttribute?.('aria-busy', 'true');
            controlStates.forEach(({ control }) => { control.disabled = true; });
            if (submitter && settings.render !== false) submitter.innerHTML = spinnerMarkup(settings.message || 'กำลังบันทึก...');
            try {
                return await result;
            } finally {
                controlStates.forEach(({ control, disabled }) => { control.disabled = disabled; });
                if (submitter) submitter.innerHTML = submitterHtml;
                if (ariaBusy == null) form.removeAttribute?.('aria-busy');
                else form.setAttribute?.('aria-busy', ariaBusy);
                if (form.dataset) {
                    if (submitting == null) delete form.dataset.submitting;
                    else form.dataset.submitting = submitting;
                }
            }
        });
    };
}

export function delegatedActionOptions(moduleKey, selector = 'button, [data-action], [data-id], [data-person-id], [data-topic-id], [role="button"]') {
    const scope = String(moduleKey || 'module').trim() || 'module';
    return {
        render: false,
        target: event => event?.target?.closest?.(selector) || null,
        actionKey: (_event, element) => {
            const dataset = element?.dataset || {};
            const action = element?.id || dataset.action || dataset.command || String(element?.className || '').trim().split(/\s+/)[0] || 'action';
            const record = dataset.id || dataset.recordId || dataset.issueId || dataset.taskId || dataset.requestId || dataset.employeeId || dataset.personId || dataset.topicId || 'global';
            return `${scope}:delegated:${action}:${record}`;
        },
    };
}

export function installWindowActionLocks(moduleKey, names = []) {
    const scope = String(moduleKey || 'module').trim() || 'module';
    for (const name of names) {
        const original = window?.[name];
        if (typeof original !== 'function' || original.__asyncUiLocked) continue;
        const guarded = (...args) => {
            const record = args.slice(0, 2)
                .filter(value => ['string', 'number', 'boolean'].includes(typeof value))
                .map(String).join(':') || 'global';
            return withActionLock(`${scope}:window:${name}:${record}`, () => original(...args));
        };
        guarded.__asyncUiLocked = true;
        window[name] = guarded;
    }
}

export function guardActionHandler(handler, options = {}) {
    if (typeof handler !== 'function') throw new TypeError('guardActionHandler requires a handler');
    const settings = options && typeof options === 'object' ? options : {};
    return function guardedAction(event) {
        const eventTarget = event?.currentTarget || null;
        const button = typeof settings.target === 'function'
            ? settings.target(event, eventTarget)
            : (settings.target || eventTarget);
        if (!button && typeof settings.target === 'function') return handler.call(this, event);
        if (!button) return Promise.reject(new TypeError('guarded action requires an event target'));
        const actionKey = typeof settings.actionKey === 'function'
            ? settings.actionKey(event, button)
            : (settings.actionKey || stableElementKey(button, 'button'));
        if (actionKey == null || actionKey === '') {
            return Promise.reject(new TypeError('guarded action requires a non-empty action key'));
        }
        if (isActionLocked(actionKey)) {
            event?.preventDefault?.();
            event?.stopImmediatePropagation?.();
            return actionLocks.get(actionKey);
        }
        const snapshot = {
            disabled: Boolean(button.disabled),
            innerHTML: button.innerHTML,
            ariaBusy: button.getAttribute?.('aria-busy'),
            busy: button.dataset?.busy,
        };
        return withActionLock(actionKey, async () => {
            // Invoke first so existing handlers retain synchronous preventDefault and payload preparation.
            const result = handler.call(this, event);
            if (button.dataset) button.dataset.busy = '1';
            button.disabled = true;
            button.setAttribute?.('aria-busy', 'true');
            if (settings.render !== false) button.innerHTML = spinnerMarkup(settings.message || 'กำลังดำเนินการ...');
            try {
                return await result;
            } finally {
                button.disabled = snapshot.disabled;
                button.innerHTML = snapshot.innerHTML;
                if (snapshot.ariaBusy == null) button.removeAttribute?.('aria-busy');
                else button.setAttribute?.('aria-busy', snapshot.ariaBusy);
                if (button.dataset) {
                    if (snapshot.busy == null) delete button.dataset.busy;
                    else button.dataset.busy = snapshot.busy;
                }
            }
        });
    };
}

export function createLatestRequestController(key) {
    if (key == null || key === '') throw new TypeError('request key is required');
    const previous = latestRequests.get(key);
    previous?.controller.abort();
    const controller = new AbortController();
    const version = (previous?.version || 0) + 1;
    const state = { controller, version };
    latestRequests.set(key, state);
    return {
        controller,
        signal: controller.signal,
        version,
        isLatest: () => latestRequests.get(key) === state && !controller.signal.aborted,
        finish: () => {
            if (latestRequests.get(key) === state) latestRequests.delete(key);
        },
    };
}

export function createLatestRenderTarget(key, element) {
    if (!element || typeof element !== 'object') throw new TypeError('render target element is required');
    const request = createLatestRequestController(key);
    const isCurrent = () => request.isLatest() && element.isConnected !== false;
    const target = {
        get innerHTML() {
            return isCurrent() ? element.innerHTML : '';
        },
        set innerHTML(value) {
            if (isCurrent()) element.innerHTML = value;
        },
    };
    return { ...request, target, isCurrent };
}

export function abortLatestRequest(key) {
    const state = latestRequests.get(key);
    if (!state) return false;
    state.controller.abort();
    latestRequests.delete(key);
    return true;
}

export function isAbortError(error) {
    return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

function skeletonStatus(label) {
    const safeLabel = escapeHtml(label || 'กำลังโหลดข้อมูล...');
    return `<span class="sr-only" role="status" aria-live="polite">${safeLabel}</span>`;
}

function skeletonRows(count, height = 'h-12') {
    const safeCount = Math.max(1, Math.min(20, Number(count) || 1));
    return Array.from({ length: safeCount }, () => `<div class="${height} rounded-lg bg-slate-100"></div>`).join('');
}

export function pageSkeleton(options = {}) {
    const { label = 'กำลังโหลดข้อมูล...', cards = 3, rows = 6, hero = true } = options;
    return `<div class="async-skeleton space-y-5 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="${escapeHtml(label)}">
        ${skeletonStatus(label)}
        ${hero ? '<section class="h-52 rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50"></section>' : ''}
        <section class="grid grid-cols-1 gap-3 md:grid-cols-3">${skeletonRows(cards, 'h-20')}</section>
        <section class="rounded-2xl border border-slate-100 bg-white p-4"><div class="mb-4 h-10 rounded-xl bg-slate-100"></div><div class="space-y-3">${skeletonRows(rows)}</div></section>
    </div>`;
}

export function sectionSkeleton(options = {}) {
    const { label = 'กำลังโหลดส่วนนี้...', rows = 4, kind = 'list' } = options;
    const content = kind === 'cards'
        ? `<div class="grid grid-cols-1 gap-3 md:grid-cols-3">${skeletonRows(rows, 'h-24')}</div>`
        : `<div class="space-y-3">${skeletonRows(rows)}</div>`;
    return `<section class="async-skeleton rounded-2xl border border-slate-100 bg-white p-4 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="${escapeHtml(label)}">${skeletonStatus(label)}${content}</section>`;
}

export function modalSkeleton(options = {}) {
    const { label = 'กำลังโหลดรายละเอียด...', rows = 4 } = options;
    return `<div class="async-skeleton space-y-4 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="${escapeHtml(label)}">${skeletonStatus(label)}<div class="h-20 rounded-xl bg-slate-100"></div><div class="space-y-3">${skeletonRows(rows)}</div></div>`;
}

export function loadingErrorState(message = 'โหลดข้อมูลไม่สำเร็จ', retryAction = null) {
    const settings = typeof message === 'object' && message !== null ? message : { message, retryAction };
    const safeMessage = escapeHtml(settings.message || 'โหลดข้อมูลไม่สำเร็จ');
    const canRetry = Boolean(settings.retryAction || settings.retry);
    return `<section class="rounded-2xl border border-red-100 bg-red-50 p-6 text-center" role="alert"><p class="font-bold text-red-700">${safeMessage}</p>${canRetry ? '<button type="button" data-async-retry class="mt-3 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700">ลองอีกครั้ง</button>' : ''}</section>`;
}

export function emptyState(options = {}) {
    const settings = typeof options === 'string' ? { title: options } : options;
    const title = escapeHtml(settings.title || 'ไม่มีข้อมูล');
    const message = escapeHtml(settings.message || 'ยังไม่มีรายการสำหรับแสดงผล');
    return `<section class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><h3 class="font-black text-slate-700">${title}</h3><p class="mt-1 text-sm text-slate-500">${message}</p></section>`;
}
