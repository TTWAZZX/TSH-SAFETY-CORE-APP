const loaded = new Map();

const sources = Object.freeze({
    xlsx: 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
    chart: 'https://cdn.jsdelivr.net/npm/chart.js',
    chartLabels: 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
    fullcalendar: 'public/js/fullcalendar.js',
    flatpickr: 'https://cdn.jsdelivr.net/npm/flatpickr',
    flatpickrTh: 'https://npmcdn.com/flatpickr/dist/l10n/th.js',
    flatpickrCss: 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
});

const pageVendors = Object.freeze({
    policy: ['xlsx', 'flatpickr'],
    committee: ['xlsx', 'flatpickr'],
    kpi: ['chart', 'xlsx', 'html2canvas', 'jspdf', 'flatpickr'],
    patrol: ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    cccf: ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    yokoten: ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    admin: ['xlsx', 'fullcalendar', 'qrcode', 'html2canvas', 'jspdf'],
    employee: ['xlsx', 'fullcalendar', 'qrcode', 'html2canvas', 'jspdf'],
    'machine-safety': ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    forklift: ['xlsx', 'qrcode', 'html2canvas', 'jspdf'],
    ojt: ['html2canvas', 'jspdf'],
    training: ['chart', 'html2canvas', 'jspdf'],
    accident: ['chart', 'html2canvas', 'jspdf', 'flatpickr'],
    'safety-culture': ['chart', 'html2canvas', 'jspdf'],
    'bbs-smart-card': ['xlsx', 'qrcode', 'html2canvas', 'jspdf'],
    contractor: ['xlsx'],
    hiyari: ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    ky: ['chart', 'xlsx', 'html2canvas', 'jspdf'],
    fourm: ['chart', 'xlsx', 'html2canvas', 'jspdf', 'flatpickr'],
    dashboard: ['html2canvas', 'jspdf'],
    search: ['xlsx'],
});

function loadScript(key) {
    if (loaded.has(key)) return loaded.get(key);
    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-vendor="${key}"]`);
        if (existing?.dataset.loaded === 'true') return resolve();
        const script = existing || document.createElement('script');
        script.dataset.vendor = key;
        script.src = sources[key];
        script.async = true;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', () => {
            script.remove();
            loaded.delete(key);
            reject(new Error(`VENDOR_LOAD_FAILED:${key}`));
        }, { once: true });
        if (!existing) document.head.appendChild(script);
    });
    loaded.set(key, promise);
    return promise;
}

function loadStyle(key) {
    if (loaded.has(key)) return loaded.get(key);
    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`link[data-vendor="${key}"]`);
        if (existing?.dataset.loaded === 'true') return resolve();
        const link = existing || document.createElement('link');
        link.dataset.vendor = key;
        link.rel = 'stylesheet';
        link.href = sources[key];
        link.addEventListener('load', () => {
            link.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        link.addEventListener('error', () => {
            link.remove();
            loaded.delete(key);
            reject(new Error(`VENDOR_STYLE_LOAD_FAILED:${key}`));
        }, { once: true });
        if (!existing) document.head.appendChild(link);
    });
    loaded.set(key, promise);
    return promise;
}

export async function loadVendor(name) {
    if (name === 'chart') {
        await loadScript('chart');
        await loadScript('chartLabels');
        return;
    }
    if (name === 'flatpickr') {
        await Promise.all([loadStyle('flatpickrCss'), loadScript('flatpickr')]);
        await loadScript('flatpickrTh');
        return;
    }
    await loadScript(name);
}

export async function loadVendorsForPage(page) {
    const names = pageVendors[String(page || '')] || [];
    await Promise.all(names.map(loadVendor));
}

export const VENDOR_PAGE_CONTRACT = pageVendors;
