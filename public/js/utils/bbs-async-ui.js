const activeOperations = new Map();
let operationSequence = 0;
const performanceEntries = [];
const PERFORMANCE_ENTRY_LIMIT = 200;

function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function performanceSummary() {
    const groups = new Map();
    for (const entry of performanceEntries) {
        const durations = groups.get(entry.name) || [];
        durations.push(entry.durationMs);
        groups.set(entry.name, durations);
    }
    return [...groups.entries()].map(([name, durations]) => ({
        name,
        count: durations.length,
        averageMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
        p50Ms: Math.round(percentile(durations, .5)),
        p95Ms: Math.round(percentile(durations, .95)),
        maximumMs: Math.round(Math.max(...durations))
    }));
}

export function beginBbsPerformance(name, detail = {}) {
    const startedAt = performanceNow();
    let finished = false;
    return {
        finish(outcome = 'completed') {
            if (finished) return null;
            finished = true;
            const entry = Object.freeze({
                name: String(name || 'bbs-operation'),
                durationMs: Math.max(0, performanceNow() - startedAt),
                outcome: String(outcome),
                detail: { ...detail },
                recordedAt: new Date().toISOString()
            });
            performanceEntries.push(entry);
            if (performanceEntries.length > PERFORMANCE_ENTRY_LIMIT) performanceEntries.splice(0, performanceEntries.length - PERFORMANCE_ENTRY_LIMIT);
            globalThis.dispatchEvent?.(new CustomEvent('bbs:performance', { detail:entry }));
            return entry;
        }
    };
}

if (typeof window !== 'undefined') {
    window.BBSPerformance = Object.freeze({
        entries: () => performanceEntries.map(entry => ({ ...entry, detail:{ ...entry.detail } })),
        summary: () => performanceSummary().map(row => ({ ...row })),
        clear: () => { performanceEntries.length = 0; }
    });
}

function operationHost() {
    let host = document.getElementById('bbs-operation-status');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'bbs-operation-status';
    host.className = 'pointer-events-none fixed bottom-4 right-4 w-[min(24rem,calc(100vw-2rem))]';
    host.style.zIndex = '10060';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
}

function renderOperationStatus() {
    const host = document.getElementById('bbs-operation-status');
    if (!activeOperations.size) {
        host?.remove();
        return;
    }
    const operation = [...activeOperations.values()].at(-1);
    const progress = Number.isFinite(operation.progress) ? Math.max(0, Math.min(100, operation.progress)) : null;
    const detail = operation.detail || (progress === null ? 'กรุณารอสักครู่ ระบบกำลังดำเนินการ' : `อัปโหลดแล้ว ${progress}%`);
    const node = operationHost();
    node.innerHTML = `<section role="status" aria-busy="true" class="pointer-events-auto overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
      <div class="flex items-center gap-3 p-4">
        <span aria-hidden="true" class="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"></span>
        <div class="min-w-0 flex-1"><p class="text-sm font-black text-slate-800">${escapeText(operation.label)}</p><p class="mt-0.5 text-xs text-slate-500">${escapeText(detail)}</p></div>
        ${progress === null ? '' : `<span class="text-xs font-black text-emerald-700">${progress}%</span>`}
      </div>
      <div class="h-1.5 overflow-hidden bg-emerald-100" role="progressbar" aria-label="${escapeText(operation.label)}" aria-valuemin="0" aria-valuemax="100" ${progress === null ? '' : `aria-valuenow="${progress}"`}>
        <div class="h-full bg-emerald-500 transition-[width] duration-200 ${progress === null ? 'w-1/3 animate-pulse' : ''}" style="${progress === null ? '' : `width:${progress}%`}"></div>
      </div>
    </section>`;
}

function escapeText(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
}

export function beginBbsOperation(label = 'กำลังดำเนินการ...', detail = '', metricName = '') {
    const id = ++operationSequence;
    const measurement = beginBbsPerformance(metricName || `operation:${String(label)}`, { detail:String(detail) });
    activeOperations.set(id, { label:String(label), detail:String(detail), progress:null });
    renderOperationStatus();
    let finished = false;
    return {
        update(next = {}) {
            const current = activeOperations.get(id);
            if (!current) return;
            if (next.label !== undefined) current.label = String(next.label);
            if (next.detail !== undefined) current.detail = String(next.detail);
            if (next.progress !== undefined) current.progress = Number.isFinite(Number(next.progress)) ? Number(next.progress) : null;
            renderOperationStatus();
        },
        finish() {
            if (finished) return;
            finished = true;
            activeOperations.delete(id);
            renderOperationStatus();
            measurement.finish();
        }
    };
}

export async function runBbsBusy(control, task, label = 'กำลังดำเนินการ...') {
    control = control?.currentTarget || control;
    const operation = beginBbsOperation(label);
    const actionable = control && typeof control.setAttribute === 'function' ? control : null;
    if (actionable) actionable.setAttribute('aria-busy', 'true');
    try {
        return await task(operation);
    } finally {
        if (actionable?.isConnected) actionable.removeAttribute('aria-busy');
        operation.finish();
    }
}

export function uploadProgress(operation, label = 'กำลังอัปโหลดไฟล์...') {
    return progress => operation?.update({ label, detail:`ส่งข้อมูลไปยังระบบแล้ว ${progress}%`, progress });
}
