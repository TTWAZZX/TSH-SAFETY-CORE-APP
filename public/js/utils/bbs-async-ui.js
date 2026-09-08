const activeOperations = new Map();
let operationSequence = 0;

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

export function beginBbsOperation(label = 'กำลังดำเนินการ...', detail = '') {
    const id = ++operationSequence;
    activeOperations.set(id, { label:String(label), detail:String(detail), progress:null });
    renderOperationStatus();
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
            activeOperations.delete(id);
            renderOperationStatus();
        }
    };
}

export async function runBbsBusy(control, task, label = 'กำลังดำเนินการ...') {
    const operation = beginBbsOperation(label);
    if (control) control.setAttribute('aria-busy', 'true');
    try {
        return await task(operation);
    } finally {
        if (control?.isConnected) control.removeAttribute('aria-busy');
        operation.finish();
    }
}

export function uploadProgress(operation, label = 'กำลังอัปโหลดไฟล์...') {
    return progress => operation?.update({ label, detail:`ส่งข้อมูลไปยังระบบแล้ว ${progress}%`, progress });
}
