// Interactive anatomy atlas for Accident analytics.
// The generated atlas is a project-local asset: runtime needs no API key or network service.

const ANATOMY_ATLAS = 'public/images/accident/anatomy-atlas-v2.png?v=20261002-anatomy-atlas-v2';
let anatomyInstance = 0;

export function anatomyRegion(label) {
    const text = String(label || '').trim().toLowerCase();
    const rules = [
        ['foot', /เท้า|ข้อเท้า|นิ้วเท้า|foot|feet|toe|ankle/],
        ['hand', /มือ|ข้อมือ|นิ้วมือ|hand|finger|wrist/],
        ['back', /หลัง|เอว|สะโพก|back|waist|hip/],
        ['neck', /คอ|บ่า|ไหล่|neck|shoulder/],
        ['face', /ใบหน้า|ตา|หู|จมูก|ปาก|face|eye|ear|nose|mouth/],
        ['head', /ศีรษะ|หน้าผาก|กะโหลก|head|forehead|skull/],
        ['chest', /หน้าอก|ซี่โครง|ท้อง|ลำตัว|chest|rib|abdomen|torso/],
        ['arm', /แขน|ศอก|ต้นแขน|ท่อนแขน|arm|elbow|forearm/],
        ['leg', /ขา|เข่า|ต้นขา|หน้าแข้ง|leg|knee|thigh|shin/],
        ['whole', /ทั่วร่างกาย|ทั้งร่างกาย|whole body/],
    ];
    return rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

const VIEW_POINTS = {
    front: {
        head: [{ x: 50, y: 8, side: 'Midline' }], face: [{ x: 50, y: 12, side: 'Midline' }],
        neck: [{ x: 50, y: 17, side: 'Midline' }], chest: [{ x: 50, y: 31, side: 'Midline' }],
        arm: [{ x: 25, y: 35, side: 'Right' }, { x: 75, y: 35, side: 'Left' }],
        hand: [{ x: 14, y: 54, side: 'Right' }, { x: 86, y: 54, side: 'Left' }],
        leg: [{ x: 42, y: 72, side: 'Right' }, { x: 58, y: 72, side: 'Left' }],
        foot: [{ x: 41, y: 94, side: 'Right' }, { x: 59, y: 94, side: 'Left' }],
        whole: [{ x: 50, y: 49, side: 'Midline' }],
    },
    back: {
        head: [{ x: 50, y: 8, side: 'Midline' }], neck: [{ x: 50, y: 17, side: 'Midline' }],
        back: [{ x: 50, y: 32, side: 'Midline' }],
        arm: [{ x: 25, y: 35, side: 'Left' }, { x: 75, y: 35, side: 'Right' }],
        hand: [{ x: 14, y: 54, side: 'Left' }, { x: 86, y: 54, side: 'Right' }],
        leg: [{ x: 42, y: 72, side: 'Left' }, { x: 58, y: 72, side: 'Right' }],
        foot: [{ x: 41, y: 94, side: 'Left' }, { x: 59, y: 94, side: 'Right' }],
        whole: [{ x: 50, y: 49, side: 'Midline' }],
    },
};

const SIDE_LABELS = {
    Left: 'ซ้าย / Left', Right: 'ขวา / Right', Bilateral: 'ทั้งสองข้าง / Bilateral',
    Midline: 'กึ่งกลาง / Midline', 'Not Applicable': 'ไม่เกี่ยวข้อง / N/A',
};

function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map(row => {
            const bodyPart = String(row?.bodyPart || row?.label || '-');
            const bodySide = String(row?.bodySide || '');
            return {
                bodyPart,
                bodySide,
                label: String(row?.label || `${bodyPart} · ${SIDE_LABELS[bodySide] || 'ไม่ระบุข้าง / Unspecified'}`),
                cnt: Math.max(0, Number(row?.cnt) || 0),
            };
        })
        .filter(row => row.cnt > 0);
}

function pointsForSide(points, bodySide) {
    if (!points.length) return [];
    if (bodySide === 'Left' || bodySide === 'Right') {
        const exact = points.filter(point => point.side === bodySide);
        return exact.length ? exact : points;
    }
    if (bodySide === 'Midline') {
        const exact = points.filter(point => point.side === 'Midline');
        if (exact.length) return exact;
        return [{
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
            side: 'Midline',
        }];
    }
    return points;
}

function anatomyLayers(data, view, maxCount, escapeHtml) {
    const heatPalette = ['#bae6fd', '#38bdf8', '#0ea5e9', '#2563eb', '#312e81'];
    return data.map((row, index) => {
        const region = anatomyRegion(row.bodyPart);
        const points = pointsForSide(VIEW_POINTS[view][region] || [], row.bodySide);
        if (!points.length) return '';
        const markerPoint = points.length === 1 ? points[0] : {
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
        const heatLevel = Math.min(4, Math.max(0, Math.ceil((row.cnt / maxCount) * 5) - 1));
        const heatColor = heatPalette[heatLevel];
        const heat = points.map(({ x, y }) => {
            return `
                <span data-anatomy-heat="${index}" data-anatomy-layer-view="${view}" data-region="${region || ''}"
                    data-body-side="${escapeHtml(row.bodySide || 'Unspecified')}"
                    data-anatomy-x="${x}" data-anatomy-y="${y}"
                    style="position:absolute;left:${x}%;top:${y}%;display:${view === 'front' ? 'block' : 'none'};width:42px;height:42px;transform:translate(-50%,-50%);border-radius:999px;background:radial-gradient(circle,${heatColor}e6 0%,${heatColor}99 38%,${heatColor}33 62%,transparent 76%);mix-blend-mode:multiply;pointer-events:none;z-index:2;transition:filter .18s ease,transform .18s ease"></span>`;
        }).join('');
        return `${heat}
            <button type="button" data-anatomy-marker="${index}" data-anatomy-layer-view="${view}" data-region="${region || ''}"
                data-body-side="${escapeHtml(row.bodySide || 'Unspecified')}" title="${escapeHtml(row.label)}: ${row.cnt} เคส" aria-label="${escapeHtml(row.label)} ${row.cnt} เคส"
                data-anatomy-x="${markerPoint.x}" data-anatomy-y="${markerPoint.y}"
                style="position:absolute;left:${markerPoint.x}%;top:${markerPoint.y}%;transform:translate(-50%,-50%);display:${view === 'front' ? 'inline-flex' : 'none'};align-items:center;justify-content:center;width:44px;height:44px;border:0;background:transparent;cursor:pointer;z-index:3">
                <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 5px;border:2px solid white;border-radius:999px;color:white;background:${heatColor};box-shadow:0 0 0 4px rgba(255,255,255,.7),0 3px 9px rgba(15,23,42,.35);font-size:10px;font-weight:900">${row.cnt}</span>
            </button>`;
    }).join('');
}

export function renderAccidentAnatomy(rows, escapeHtml = String, emptyText = 'ยังไม่มีข้อมูลส่วนร่างกายที่บาดเจ็บ', options = {}) {
    const data = normalizeRows(rows);
    const total = data.reduce((sum, row) => sum + row.cnt, 0);
    const max = Math.max(1, ...data.map(row => row.cnt));
    const top = data[0] || null;
    const regions = new Set(data.map(row => anatomyRegion(row.bodyPart)).filter(Boolean));
    const instanceId = ++anatomyInstance;
    const rootId = `acc-anatomy-root-${instanceId}`;
    const e = value => escapeHtml(String(value));
    const rowsHtml = data.length ? data.map((row, index) => {
        const pct = total ? row.cnt * 100 / total : 0;
        const region = anatomyRegion(row.bodyPart);
        return `<button type="button" data-anatomy-row="${index}" data-region="${region || ''}" aria-pressed="false"
            style="display:block;width:100%;min-height:48px;padding:9px 10px;border:1px solid transparent;border-bottom-color:#e2e8f0;border-radius:10px;background:#fff;text-align:left;cursor:pointer;transition:background .18s ease,border-color .18s ease">
            <span style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px">
                <span style="display:flex;align-items:center;min-width:0;gap:8px;font-weight:800;color:#334155">
                    <span style="display:inline-flex;flex:0 0 22px;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:10px">${index + 1}</span>
                    <span title="${e(row.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(row.label)}</span>
                </span>
                <span style="white-space:nowrap;font-weight:900;color:#0f172a">${row.cnt} <span style="color:#94a3b8">·</span> ${pct.toFixed(1)}%</span>
            </span>
            <span style="display:block;height:4px;margin:7px 0 0 30px;overflow:hidden;border-radius:999px;background:#f1f5f9"><span style="display:block;width:${Math.max(5, row.cnt / max * 100)}%;height:100%;border-radius:999px;background:linear-gradient(90deg,#fb7185,#e11d48)"></span></span>
        </button>`;
    }).join('') : `<div style="padding:28px 14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:12px;font-weight:700;text-align:center">${e(emptyText)}</div>`;

    const html = `<div id="${rootId}" data-acc-anatomy role="region" aria-label="Body Part Anatomy Analytics" style="min-width:0">
        <div data-anatomy-toolbar style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
            <div><strong style="display:block;color:#0f172a;font-size:12px">Interactive Anatomy</strong><span style="color:#64748b;font-size:9px">Zoom · Pan · Case detail</span></div>
            <button type="button" data-anatomy-fullscreen aria-label="เปิด Anatomy แบบเต็มจอ" title="ขยายเต็มจอ"
                style="display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border:1px solid #a7f3d0;border-radius:10px;background:#ecfdf5;color:#047857;font-size:11px;font-weight:900;cursor:pointer">
                <span aria-hidden="true">⛶</span><span data-anatomy-fullscreen-label>ขยาย</span>
            </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px">
            <div style="min-width:0;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc"><div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#94a3b8">Top Area</div><div title="${e(top?.label || 'ยังไม่มีข้อมูล')}" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:900;color:#0f172a">${e(top?.label || 'ยังไม่มีข้อมูล')}</div></div>
            <div style="min-width:0;padding:10px;border:1px solid #fecdd3;border-radius:12px;background:#fff1f2"><div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#fb7185">Top Share</div><div style="margin-top:2px;font-size:13px;font-weight:900;color:#be123c">${total ? (top.cnt * 100 / total).toFixed(1) : '0.0'}%</div></div>
            <div style="min-width:0;padding:10px;border:1px solid #a7f3d0;border-radius:12px;background:#ecfdf5"><div style="font-size:9px;font-weight:900;text-transform:uppercase;color:#10b981">Hotspots</div><div style="margin-top:2px;font-size:13px;font-weight:900;color:#047857">${regions.size}/10</div></div>
        </div>
        <div style="display:grid;grid-template-columns:minmax(190px,0.82fr) minmax(230px,1.18fr);gap:18px;align-items:start" class="acc-anatomy-layout">
            <div style="min-width:0">
                <div role="group" aria-label="เลือกมุมมองโมเดลกายวิภาค" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;padding:4px;border-radius:12px;background:#f1f5f9">
                    <button type="button" data-anatomy-view="front" aria-pressed="true" style="min-height:44px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font-size:12px;font-weight:900;cursor:pointer">ด้านหน้า</button>
                    <button type="button" data-anatomy-view="back" aria-pressed="false" style="min-height:44px;border:1px solid transparent;border-radius:9px;background:transparent;color:#64748b;font-size:12px;font-weight:900;cursor:pointer">ด้านหลัง</button>
                    <button type="button" data-anatomy-view="both" aria-pressed="false" style="min-height:44px;border:1px solid transparent;border-radius:9px;background:transparent;color:#64748b;font-size:12px;font-weight:900;cursor:pointer">แสดงคู่</button>
                </div>
                <div data-anatomy-stage tabindex="0" aria-label="โมเดลกายวิภาค เลื่อนเพื่อซูมและลากเพื่อดูตำแหน่ง" style="position:relative;max-width:185px;margin:0 auto;aspect-ratio:1/2;overflow:hidden;touch-action:none;border:1px solid #e2e8f0;border-radius:22px;background:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 8px 20px rgba(15,23,42,.08);cursor:grab">
                    <div data-anatomy-canvas style="position:absolute;inset:0;transform-origin:0 0;will-change:transform">
                        <img data-anatomy-image src="${ANATOMY_ATLAS}" alt="โมเดลกายวิภาคสามมิติ ด้านหน้า" draggable="false"
                            style="position:absolute;left:0;top:0;width:200%;max-width:none;height:100%;object-fit:fill;user-select:none;pointer-events:none;transition:left .24s ease,width .24s ease">
                        ${anatomyLayers(data, 'front', max, e)}${anatomyLayers(data, 'back', max, e)}
                    </div>
                    <span data-anatomy-view-label style="position:absolute;left:8px;bottom:8px;padding:4px 7px;border:1px solid rgba(148,163,184,.38);border-radius:999px;background:rgba(255,255,255,.9);color:#64748b;font-size:8px;font-weight:900;letter-spacing:.04em;z-index:4">FRONT VIEW</span>
                </div>
                <div role="group" aria-label="ควบคุมการซูม" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">
                    <button type="button" data-anatomy-zoom="in" aria-label="ซูมเข้า" style="min-height:44px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;font-weight:900;cursor:pointer">+</button>
                    <button type="button" data-anatomy-zoom="out" aria-label="ซูมออก" style="min-height:44px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;font-weight:900;cursor:pointer">−</button>
                    <button type="button" data-anatomy-zoom="fit" aria-label="พอดีหน้าจอ" style="min-height:44px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;font-size:10px;font-weight:900;cursor:pointer">Fit</button>
                    <button type="button" data-anatomy-zoom="reset" aria-label="รีเซ็ตมุมมอง" style="min-height:44px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;font-size:10px;font-weight:900;cursor:pointer">Reset</button>
                </div>
                <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:7px;color:#64748b;font-size:9px"><span data-anatomy-zoom-label>100%</span><span>Mouse wheel / Pinch / Drag</span></div>
                <div aria-label="Heatmap legend from low to high" style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:7px;color:#64748b;font-size:8px"><span>Low</span>${['#bae6fd','#38bdf8','#0ea5e9','#2563eb','#312e81'].map(color=>`<span style="display:inline-block;width:18px;height:6px;border-radius:999px;background:${color}"></span>`).join('')}<span>High</span></div>
                <p style="margin:8px 0 0;color:#64748b;font-size:10px;line-height:1.45;text-align:center">สีเรืองแสงแสดงตำแหน่งบาดเจ็บตามด้านซ้าย–ขวาที่บันทึกไว้</p>
            </div>
            <div style="min-width:0">
                <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:0 5px 7px;color:#94a3b8;font-size:9px;font-weight:900;letter-spacing:.04em"><span>BODY PART</span><span>CASE · SHARE</span></div>
                <div data-anatomy-ranking style="max-height:302px;overflow:auto;overscroll-behavior:contain">${rowsHtml}</div>
                <aside data-anatomy-detail role="status" aria-live="polite" style="min-height:42px;margin-top:10px;padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;color:#475569;font-size:11px;font-weight:700">${data.length ? 'เลือกส่วนร่างกายจากรายการหรือจุดบนโมเดลเพื่อดูรายละเอียดเคส' : 'เมื่อมีข้อมูล ตำแหน่งบาดเจ็บจะแสดงบนโมเดล'}</aside>
            </div>
        </div>
        <style>
            #${rootId}[data-anatomy-fullscreen-open="true"]{position:fixed!important;inset:0!important;z-index:10000!important;padding:18px!important;overflow:auto!important;background:rgba(2,6,23,.94)!important}
            #${rootId}[data-anatomy-fullscreen-open="true"]>[data-anatomy-toolbar],#${rootId}[data-anatomy-fullscreen-open="true"]>div:not([data-anatomy-toolbar]){max-width:1180px;margin-left:auto;margin-right:auto;background:#fff;border-radius:16px;padding:12px}
            #${rootId}[data-anatomy-fullscreen-open="true"] .acc-anatomy-layout{grid-template-columns:minmax(300px,.9fr) minmax(360px,1.1fr)!important}
            #${rootId}[data-anatomy-fullscreen-open="true"] [data-anatomy-stage]{max-width:420px!important}
            @media(max-width:639px){#${rootId} .acc-anatomy-layout{grid-template-columns:1fr!important}#${rootId} [data-anatomy-stage]{width:min(100%,220px)}#${rootId} [data-anatomy-ranking]{max-height:260px!important}#${rootId}[data-anatomy-fullscreen-open="true"]{padding:8px!important}#${rootId}[data-anatomy-fullscreen-open="true"] .acc-anatomy-layout{grid-template-columns:1fr!important}}
        </style>
    </div>`;

    if (typeof document !== 'undefined' && typeof setTimeout === 'function') {
        setTimeout(() => {
            const root = document.getElementById(rootId);
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';
            let view = 'front';
            let scale = 1;
            let panX = 0;
            let panY = 0;
            let selectedIndex = -1;
            let previousBodyOverflow = '';
            const stage = root.querySelector('[data-anatomy-stage]');
            const canvas = root.querySelector('[data-anatomy-canvas]');
            const image = root.querySelector('[data-anatomy-image]');
            const pointers = new Map();
            let dragStart = null;
            let pinchStart = null;
            const reportRows = Array.isArray(options.reports) ? options.reports : [];
            const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
            const applyTransform = () => {
                const rect = stage?.getBoundingClientRect();
                const maxX = Math.max(0, (rect?.width || 0) * (scale - 1));
                const maxY = Math.max(0, (rect?.height || 0) * (scale - 1));
                panX = clamp(panX, -maxX, maxX);
                panY = clamp(panY, -maxY, maxY);
                if (canvas) canvas.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
                const label = root.querySelector('[data-anatomy-zoom-label]');
                if (label) label.textContent = `${Math.round(scale * 100)}%`;
            };
            const setScale = (next, anchor = null) => {
                const old = scale;
                scale = clamp(Number(next) || 1, 1, 3);
                if (anchor && stage && old !== scale) {
                    const rect = stage.getBoundingClientRect();
                    const ax = anchor.x - rect.left;
                    const ay = anchor.y - rect.top;
                    const ratio = scale / old;
                    panX = ax - ((ax - panX) * ratio);
                    panY = ay - ((ay - panY) * ratio);
                }
                applyTransform();
            };
            const fitView = () => { scale = 1; panX = 0; panY = 0; applyTransform(); };
            const setView = next => {
                view = ['front', 'back', 'both'].includes(next) ? next : 'front';
                const paired = view === 'both';
                if (image) {
                    image.style.width = paired ? '100%' : '200%';
                    image.style.left = view === 'back' ? '-100%' : '0';
                    image.alt = `โมเดลกายวิภาคสามมิติ ${view === 'both' ? 'ด้านหน้าและด้านหลัง' : (view === 'back' ? 'ด้านหลัง' : 'ด้านหน้า')}`;
                }
                if (stage) {
                    stage.style.aspectRatio = paired ? '1/1' : '1/2';
                    stage.style.maxWidth = paired ? (root.dataset.anatomyFullscreenOpen === 'true' ? '760px' : '370px') : (root.dataset.anatomyFullscreenOpen === 'true' ? '420px' : '185px');
                }
                root.querySelectorAll('[data-anatomy-layer-view]').forEach(layer => {
                    const layerView = layer.dataset.anatomyLayerView;
                    const show = paired || layerView === view;
                    const baseX = Number(layer.dataset.anatomyX || 0);
                    layer.style.left = paired ? `${(layerView === 'back' ? 50 : 0) + (baseX / 2)}%` : `${baseX}%`;
                    layer.style.display = show ? (layer.matches('button') ? 'inline-flex' : 'block') : 'none';
                });
                root.querySelectorAll('[data-anatomy-view]').forEach(button => {
                    const active = button.dataset.anatomyView === view;
                    button.setAttribute('aria-pressed', String(active));
                    button.style.background = active ? '#fff' : 'transparent';
                    button.style.borderColor = active ? '#cbd5e1' : 'transparent';
                    button.style.color = active ? '#0f172a' : '#64748b';
                });
                const label = root.querySelector('[data-anatomy-view-label]');
                if (label) label.textContent = view === 'both' ? 'FRONT + BACK' : (view === 'front' ? 'FRONT VIEW' : 'BACK VIEW');
                fitView();
            };
            const matchingReports = row => reportRows.filter(report => {
                if (String(report?.AccidentType || '') === 'Near Miss') return false;
                if (String(report?.BodyPart || '') !== row.bodyPart) return false;
                if (row.bodySide && String(report?.BodySide || '') !== row.bodySide) return false;
                return true;
            });
            const topEntries = (reports, key, limit = 3) => {
                const counts = new Map();
                reports.forEach(report => {
                    const value = String(report?.[key] || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
                    counts.set(value, (counts.get(value) || 0) + 1);
                });
                return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
            };
            const renderDetail = (row, region) => {
                const reports = matchingReports(row);
                const lostDays = reports.reduce((sum, report) => sum + (Number(report?.LostDays) || 0), 0);
                const typeEntries = topEntries(reports, 'AccidentType', 4);
                const injuryEntries = topEntries(reports, 'InjuryType', 3);
                const deptEntries = topEntries(reports, 'Department', 2);
                const areaEntries = topEntries(reports, 'Area', 2);
                const monthEntries = topEntries(reports.map(report => ({ month: String(report?.AccidentDate || '').slice(0, 7) || 'ไม่ระบุ' })), 'month', 2);
                const detail = root.querySelector('[data-anatomy-detail]');
                if (!detail) return;
                const chips = entries => entries.map(([label, count]) => `<span style="display:inline-flex;padding:4px 7px;border-radius:999px;background:#fff;border:1px solid #e2e8f0">${e(label)} · ${count}</span>`).join('');
                const cases = reports.slice(0, 5).map(report => `<button type="button" data-anatomy-open-report="${Number(report.id) || 0}" style="display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:7px 9px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#334155;text-align:left;cursor:pointer"><span><strong>${e(String(report.AccidentDate || '').slice(0,10) || '-')}</strong><br><small>${e(report.Department || '-')} · ${e(report.AccidentType || '-')}</small></span><span aria-hidden="true">›</span></button>`).join('');
                detail.innerHTML = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><strong style="display:block;color:#0f172a;font-size:13px">${e(row.label)}</strong><span style="color:#64748b">${row.cnt} เคส · ${(row.cnt * 100 / total).toFixed(1)}%${region ? '' : ' · Unmapped data'}</span></div><span style="padding:5px 8px;border-radius:9px;background:#fff1f2;color:#be123c;font-weight:900">${lostDays} Lost days</span></div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px"><div style="padding:7px;border-radius:9px;background:#fff"><small>First Aid</small><strong style="display:block">${reports.filter(r=>r.AccidentType==='First Aid').length}</strong></div><div style="padding:7px;border-radius:9px;background:#fff"><small>Medical</small><strong style="display:block">${reports.filter(r=>r.AccidentType==='Medical Treatment').length}</strong></div><div style="padding:7px;border-radius:9px;background:#fff"><small>Lost Time</small><strong style="display:block">${reports.filter(r=>r.AccidentType==='Lost Time').length}</strong></div></div>
                    <div style="margin-top:8px"><small style="display:block;margin-bottom:4px;color:#64748b">Top Injury Type</small><div style="display:flex;flex-wrap:wrap;gap:4px">${chips(injuryEntries) || '<span>ไม่มีข้อมูล</span>'}</div></div>
                    <div style="margin-top:8px"><small style="display:block;margin-bottom:4px;color:#64748b">Department · Area · Peak month</small><div style="display:flex;flex-wrap:wrap;gap:4px">${chips([...deptEntries,...areaEntries,...monthEntries]) || '<span>ไม่มีข้อมูล</span>'}</div></div>
                    ${typeEntries.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${chips(typeEntries)}</div>` : ''}
                    ${cases ? `<div style="display:grid;gap:5px;margin-top:9px">${cases}</div>` : '<p style="margin-top:8px;color:#94a3b8">ไม่พบรายการเคสในชุดข้อมูลที่กรอง</p>'}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px"><button type="button" data-anatomy-apply-filter="${selectedIndex}" style="min-height:40px;border:1px solid #a7f3d0;border-radius:9px;background:#ecfdf5;color:#047857;font-weight:900;cursor:pointer">ใช้เป็นตัวกรอง</button><button type="button" data-anatomy-view-reports="${selectedIndex}" style="min-height:40px;border:0;border-radius:9px;background:#047857;color:#fff;font-weight:900;cursor:pointer">ดูรายงานทั้งหมด</button></div>`;
            };
            const selectRow = index => {
                const row = data[index];
                if (!row) return;
                selectedIndex = index;
                const region = anatomyRegion(row.bodyPart);
                if (view !== 'both') {
                    if (region === 'back') setView('back');
                    if (region === 'face' || region === 'chest') setView('front');
                }
                root.querySelectorAll('[data-anatomy-row]').forEach(button => {
                    const active = Number(button.dataset.anatomyRow) === index;
                    button.setAttribute('aria-pressed', String(active));
                    button.style.background = active ? '#fff1f2' : '#fff';
                    button.style.borderColor = active ? '#fda4af' : 'transparent';
                    button.style.borderBottomColor = active ? '#fda4af' : '#e2e8f0';
                });
                root.querySelectorAll('[data-anatomy-heat]').forEach(heat => {
                    const active = Number(heat.dataset.anatomyHeat) === index;
                    heat.style.filter = active ? 'drop-shadow(0 0 7px rgba(190,18,60,.95))' : '';
                    heat.style.transform = active ? 'translate(-50%,-50%) scale(1.2)' : 'translate(-50%,-50%)';
                });
                root.querySelectorAll('[data-anatomy-marker]').forEach(marker => {
                    const dot = marker.firstElementChild;
                    if (dot) dot.style.outline = Number(marker.dataset.anatomyMarker) === index ? '3px solid #881337' : 'none';
                });
                renderDetail(row, region);
            };
            const setFullscreen = open => {
                const isOpen = Boolean(open);
                root.dataset.anatomyFullscreenOpen = String(isOpen);
                const fullscreenLabel = root.querySelector('[data-anatomy-fullscreen-label]');
                if (fullscreenLabel) fullscreenLabel.textContent = isOpen ? 'ปิดเต็มจอ' : 'ขยาย';
                if (isOpen) {
                    previousBodyOverflow = document.body.style.overflow;
                    document.body.style.overflow = 'hidden';
                    root.setAttribute('role', 'dialog');
                    root.setAttribute('aria-modal', 'true');
                } else {
                    document.body.style.overflow = previousBodyOverflow;
                    root.setAttribute('role', 'region');
                    root.removeAttribute('aria-modal');
                }
                setView(view);
                root.querySelector('[data-anatomy-fullscreen]')?.focus();
            };
            root.addEventListener('click', event => {
                const button = event.target.closest('button');
                if (!button || !root.contains(button)) return;
                if (button.dataset.anatomyView) setView(button.dataset.anatomyView);
                else if (button.dataset.anatomyRow !== undefined) selectRow(Number(button.dataset.anatomyRow));
                else if (button.dataset.anatomyMarker !== undefined) selectRow(Number(button.dataset.anatomyMarker));
                else if (button.dataset.anatomyFullscreen !== undefined) setFullscreen(root.dataset.anatomyFullscreenOpen !== 'true');
                else if (button.dataset.anatomyZoom === 'in') setScale(scale + 0.25);
                else if (button.dataset.anatomyZoom === 'out') setScale(scale - 0.25);
                else if (button.dataset.anatomyZoom === 'fit') fitView();
                else if (button.dataset.anatomyZoom === 'reset') { setView('front'); fitView(); }
                else if (button.dataset.anatomyApplyFilter !== undefined) options.onSelect?.(data[Number(button.dataset.anatomyApplyFilter)]);
                else if (button.dataset.anatomyViewReports !== undefined) options.onViewReports?.(data[Number(button.dataset.anatomyViewReports)]);
                else if (button.dataset.anatomyOpenReport !== undefined) options.onOpenReport?.(Number(button.dataset.anatomyOpenReport));
            });
            root.addEventListener('click', event => {
                if (event.target === root && root.dataset.anatomyFullscreenOpen === 'true') setFullscreen(false);
            });
            root.addEventListener('dblclick', event => {
                const marker = event.target.closest('[data-anatomy-marker]');
                if (!marker) return;
                selectRow(Number(marker.dataset.anatomyMarker));
                const rect = marker.getBoundingClientRect();
                setScale(2.2, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            });
            stage?.addEventListener('wheel', event => {
                event.preventDefault();
                setScale(scale + (event.deltaY < 0 ? 0.2 : -0.2), { x: event.clientX, y: event.clientY });
            }, { passive: false });
            stage?.addEventListener('pointerdown', event => {
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                stage.setPointerCapture?.(event.pointerId);
                stage.style.cursor = 'grabbing';
                dragStart = { x: event.clientX, y: event.clientY, panX, panY };
                if (pointers.size === 2) {
                    const [a, b] = [...pointers.values()];
                    pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
                }
            });
            stage?.addEventListener('pointermove', event => {
                if (!pointers.has(event.pointerId)) return;
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.size >= 2 && pinchStart) {
                    const [a, b] = [...pointers.values()];
                    const distance = Math.hypot(a.x - b.x, a.y - b.y);
                    setScale(pinchStart.scale * (distance / Math.max(1, pinchStart.distance)), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                } else if (dragStart && scale > 1) {
                    panX = dragStart.panX + event.clientX - dragStart.x;
                    panY = dragStart.panY + event.clientY - dragStart.y;
                    applyTransform();
                }
            });
            const endPointer = event => {
                pointers.delete(event.pointerId);
                if (pointers.size < 2) pinchStart = null;
                if (!pointers.size) { dragStart = null; if (stage) stage.style.cursor = 'grab'; }
            };
            stage?.addEventListener('pointerup', endPointer);
            stage?.addEventListener('pointercancel', endPointer);
            const keydown = event => {
                if (!document.contains(root)) { document.removeEventListener('keydown', keydown); return; }
                if (event.key === 'Escape' && root.dataset.anatomyFullscreenOpen === 'true') setFullscreen(false);
                if (!root.contains(document.activeElement)) return;
                if (event.key === '+' || event.key === '=') setScale(scale + 0.25);
                if (event.key === '-') setScale(scale - 0.25);
                if (event.key === '0') fitView();
            };
            document.addEventListener('keydown', keydown);
            setView('front');
        }, 0);
    }
    return html;
}
