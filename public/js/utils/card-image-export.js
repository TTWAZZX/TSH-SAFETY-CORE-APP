const activeCaptures = new WeakMap();
let captureSequence = 0;

export const CARD_IMAGE_EXPORT_PHASE = 'phase1-shadow';

export const DEFAULT_CARD_IMAGE_EXPORT_PROFILE = Object.freeze({
    width: 1200,
    minWidth: 720,
    maxWidth: 1600,
    maxHeight: 5000,
    maxPixels: 16000000,
    scale: 1.5,
    minScale: 1,
    assetTimeoutMs: 8000,
    backgroundColor: '#ffffff',
});

export class CardImageExportError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'CardImageExportError';
        this.code = code;
        this.details = details;
    }
}

function finitePositive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeCardImageFilename(value, extension = 'png') {
    const safeExtension = String(extension || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const stem = String(value || 'card-image')
        .normalize('NFKC')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[.\s-]+|[.\s-]+$/g, '')
        .slice(0, 120) || 'card-image';
    return `${stem}.${safeExtension}`;
}

export function buildCardImageExportPlan(metrics = {}, options = {}) {
    const profile = { ...DEFAULT_CARD_IMAGE_EXPORT_PROFILE, ...options };
    const sourceWidth = finitePositive(metrics.contentWidth || metrics.sourceWidth, profile.width);
    const sourceHeight = finitePositive(metrics.contentHeight || metrics.sourceHeight, 1);
    const minWidth = finitePositive(profile.minWidth, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.minWidth);
    const maxWidth = Math.max(minWidth, finitePositive(profile.maxWidth, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.maxWidth));
    const width = Math.round(clamp(finitePositive(profile.width, sourceWidth), minWidth, maxWidth));
    const maxHeight = finitePositive(profile.maxHeight, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.maxHeight);
    const maxPixels = finitePositive(profile.maxPixels, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.maxPixels);
    const requestedScale = finitePositive(profile.scale, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.scale);
    const minScale = Math.min(requestedScale, finitePositive(profile.minScale, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.minScale));

    if (sourceHeight > maxHeight) {
        throw new CardImageExportError(
            'CARD_TOO_TALL',
            'Card is too tall for one safe image. Use split images, PDF, or Excel export.',
            { sourceHeight, maxHeight, recommendedAction: 'split-or-document-export' },
        );
    }

    const maximumScale = Math.sqrt(maxPixels / Math.max(1, width * sourceHeight));
    const scale = Math.min(requestedScale, maximumScale);
    if (scale < minScale) {
        throw new CardImageExportError(
            'CARD_TOO_LARGE',
            'Card exceeds the safe image pixel budget. Use split images, PDF, or Excel export.',
            { width, sourceHeight, maxPixels, requestedScale, recommendedAction: 'split-or-document-export' },
        );
    }

    return Object.freeze({
        width,
        estimatedHeight: Math.ceil(sourceHeight),
        scale: Math.floor(scale * 100) / 100,
        estimatedPixels: Math.ceil(width * sourceHeight * scale * scale),
        maxHeight,
        maxPixels,
        sourceWidth,
        sourceHeight,
    });
}

function assertVisibleTarget(target) {
    if (!target || target.nodeType !== 1 || !target.isConnected) {
        throw new CardImageExportError('INVALID_TARGET', 'Export target must be a connected element.');
    }
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    if (rect.width < 1 || rect.height < 1 || style.display === 'none' || style.visibility === 'hidden') {
        throw new CardImageExportError('HIDDEN_TARGET', 'Only a currently visible card can be exported.');
    }
    return { rect, style };
}

function waitWithTimeout(promise, timeoutMs, label) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new CardImageExportError('ASSET_TIMEOUT', `${label} did not become ready in time.`)), timeoutMs);
        }),
    ]).finally(() => clearTimeout(timer));
}

function waitForImage(image) {
    if (image.complete) return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('Image is unavailable'));
    if (typeof image.decode === 'function') return image.decode();
    return new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', () => reject(new Error('Image is unavailable')), { once: true });
    });
}

export async function waitForCardImageAssets(target, options = {}) {
    const timeoutMs = finitePositive(options.assetTimeoutMs, DEFAULT_CARD_IMAGE_EXPORT_PROFILE.assetTimeoutMs);
    const warnings = [];
    if (document.fonts?.ready) {
        try {
            await waitWithTimeout(document.fonts.ready, timeoutMs, 'Web fonts');
        } catch (error) {
            warnings.push({ type: 'font', message: error.message });
        }
    }
    const images = Array.from(target.querySelectorAll('img'));
    await Promise.all(images.map(async image => {
        try {
            await waitWithTimeout(waitForImage(image), timeoutMs, 'Image');
        } catch (error) {
            warnings.push({ type: 'image', source: image.currentSrc || image.src || '', message: error.message });
        }
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return warnings;
}

function snapshotControls(target) {
    return Array.from(target.querySelectorAll('input, textarea, select, progress')).map(control => ({
        tag: control.tagName,
        type: control.type,
        value: control.value,
        placeholder: control.placeholder || '',
        selectedText: control.selectedOptions?.[0]?.textContent?.trim?.() || '',
        checked: Boolean(control.checked),
        selectedIndex: control.selectedIndex,
    }));
}

function restoreControlSnapshot(cloneTarget, controls) {
    const clones = Array.from(cloneTarget.querySelectorAll('input, textarea, select, progress'));
    controls.forEach((state, index) => {
        const clone = clones[index];
        if (!clone) return;
        if ('value' in clone) clone.value = state.value;
        if ('checked' in clone) clone.checked = state.checked;
        if ('selectedIndex' in clone && Number.isInteger(state.selectedIndex)) clone.selectedIndex = state.selectedIndex;
        if (state.tag === 'TEXTAREA') clone.textContent = state.value;
    });
}

function renderControlsAsStaticText(cloneTarget, controls, cloneDocument) {
    const clones = Array.from(cloneTarget.querySelectorAll('input, textarea, select, progress'));
    controls.forEach((state, index) => {
        const clone = clones[index];
        if (!clone || state.tag === 'PROGRESS' || clone.type === 'hidden' || ['button', 'submit', 'reset', 'file'].includes(state.type)) return;
        const computed = cloneDocument.defaultView?.getComputedStyle?.(clone);
        const replacement = cloneDocument.createElement('div');
        let text = state.tag === 'SELECT' ? state.selectedText : state.value;
        if (state.type === 'checkbox' || state.type === 'radio') text = state.checked ? '✓' : '—';
        replacement.textContent = String(text || state.placeholder || '—').trim();
        replacement.dataset.cardExportStaticControl = '1';
        Object.assign(replacement.style, {
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            width: computed?.width || `${clone.getBoundingClientRect().width}px`,
            minHeight: computed?.height || `${clone.getBoundingClientRect().height}px`,
            padding: computed?.padding || '8px 12px',
            border: computed?.border || '1px solid #e2e8f0',
            borderRadius: computed?.borderRadius || '8px',
            background: computed?.backgroundColor || '#ffffff',
            color: computed?.color || '#334155',
            fontFamily: computed?.fontFamily || 'inherit',
            fontSize: computed?.fontSize || '14px',
            fontWeight: computed?.fontWeight || '500',
            lineHeight: computed?.lineHeight === 'normal' ? '1.4' : (computed?.lineHeight || '1.4'),
            whiteSpace: 'normal',
            overflow: 'visible',
        });
        clone.replaceWith(replacement);
    });
}

function normalizeClone(cloneDocument, sessionId, plan, controls, options) {
    const cloneTarget = cloneDocument.querySelector(`[data-card-export-session="${sessionId}"]`);
    if (!cloneTarget) throw new CardImageExportError('CLONE_TARGET_MISSING', 'The export clone could not be prepared.');

    Object.assign(cloneTarget.style, {
        boxSizing: 'border-box',
        width: `${plan.width}px`,
        minWidth: `${plan.width}px`,
        maxWidth: `${plan.width}px`,
        height: 'auto',
        maxHeight: 'none',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
    });

    cloneTarget.querySelectorAll('[data-card-image-ignore], [data-html2canvas-ignore]').forEach(element => {
        element.style.setProperty('display', 'none', 'important');
    });

    cloneTarget.querySelectorAll('*').forEach(element => {
        const computed = cloneDocument.defaultView?.getComputedStyle?.(element);
        element.style.setProperty('animation', 'none', 'important');
        element.style.setProperty('transition', 'none', 'important');
        element.style.setProperty('caret-color', 'transparent', 'important');
        if (computed && (computed.position === 'sticky' || computed.position === 'fixed')) {
            element.style.setProperty('position', 'static', 'important');
            element.style.removeProperty('top');
            element.style.removeProperty('right');
            element.style.removeProperty('bottom');
            element.style.removeProperty('left');
        }
        if (options.expandTruncatedText && (element.classList.contains('truncate') || computed?.textOverflow === 'ellipsis')) {
            element.style.setProperty('white-space', 'normal', 'important');
            element.style.setProperty('overflow', 'visible', 'important');
            element.style.setProperty('text-overflow', 'clip', 'important');
            element.style.setProperty('height', 'auto', 'important');
            element.style.setProperty('max-height', 'none', 'important');
        }
        if (computed && element.children.length === 0 && String(element.textContent || '').trim()) {
            const fontSize = parseFloat(computed.fontSize);
            const lineHeight = parseFloat(computed.lineHeight);
            if (Number.isFinite(fontSize)) {
                const safeLineHeight = Math.max(Number.isFinite(lineHeight) ? lineHeight : 0, fontSize * 1.25);
                element.style.setProperty('line-height', `${Math.ceil(safeLineHeight * 10) / 10}px`, 'important');
            }
        }
    });

    restoreControlSnapshot(cloneTarget, controls);
    if (options.renderControlsAsText) renderControlsAsStaticText(cloneTarget, controls, cloneDocument);
    if (typeof options.prepareClone === 'function') options.prepareClone(cloneTarget, cloneDocument, plan);
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob !== 'function') {
            reject(new CardImageExportError('BLOB_UNSUPPORTED', 'This browser cannot create a PNG download.'));
            return;
        }
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new CardImageExportError('BLOB_FAILED', 'The PNG image could not be created.'));
        }, 'image/png');
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    try {
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
    } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

export function isSharedCardImageExportEnabled(flags = globalThis.__TSH_FEATURE_FLAGS__, moduleKey = '') {
    const setting = flags?.cardImageExportV2;
    if (setting === true) return true;
    const key = String(moduleKey || '').trim().toLowerCase();
    if (!key) return false;
    if (Array.isArray(setting)) return setting.map(value => String(value).toLowerCase()).includes(key);
    if (setting && typeof setting === 'object') return setting[key] === true;
    return false;
}

export function createCardImageExporter({ enabled = false, fallback, fallbackOnError = true, defaults = {} } = {}) {
    return async (target, options = {}) => {
        const active = typeof enabled === 'function' ? Boolean(enabled(target, options)) : Boolean(enabled);
        if (!active) {
            if (typeof fallback !== 'function') {
                throw new CardImageExportError('SHADOW_ONLY', 'Shared card image export is not enabled for this module.');
            }
            return fallback(target, options);
        }
        try {
            return await captureCardImage(target, { ...defaults, ...options });
        } catch (error) {
            if (fallbackOnError && typeof fallback === 'function') return fallback(target, options, error);
            throw error;
        }
    };
}

export function captureCardImage(target, options = {}) {
    if (activeCaptures.has(target)) return activeCaptures.get(target);
    const task = (async () => {
        const { rect } = assertVisibleTarget(target);
        const profile = { ...DEFAULT_CARD_IMAGE_EXPORT_PROFILE, ...options };
        const plan = buildCardImageExportPlan({
            sourceWidth: rect.width,
            sourceHeight: rect.height,
            contentWidth: Math.max(rect.width, target.scrollWidth || 0),
            contentHeight: Math.max(rect.height, target.scrollHeight || 0),
        }, profile);
        const renderer = options.html2canvas || globalThis.html2canvas;
        if (typeof renderer !== 'function') {
            throw new CardImageExportError('RENDERER_MISSING', 'html2canvas is not available.');
        }

        const warnings = await waitForCardImageAssets(target, profile);
        const controls = snapshotControls(target);
        const previousSession = target.getAttribute('data-card-export-session');
        const sessionId = `card-export-${Date.now()}-${++captureSequence}`;
        target.setAttribute('data-card-export-session', sessionId);
        try {
            const canvas = await renderer(target, {
                backgroundColor: profile.backgroundColor,
                scale: plan.scale,
                useCORS: true,
                allowTaint: false,
                logging: false,
                width: plan.width,
                windowWidth: plan.width,
                ...(profile.fullHeightViewport ? {
                    windowHeight: Math.ceil(Math.max(plan.estimatedHeight, globalThis.innerHeight || 0)),
                } : {}),
                scrollX: 0,
                scrollY: 0,
                onclone: cloneDocument => normalizeClone(cloneDocument, sessionId, plan, controls, options),
            });
            const renderedPixels = finitePositive(canvas.width, 1) * finitePositive(canvas.height, 1);
            if (renderedPixels > plan.maxPixels) {
                throw new CardImageExportError('RENDER_TOO_LARGE', 'Rendered image exceeds the safe pixel budget.', {
                    renderedPixels,
                    maxPixels: plan.maxPixels,
                    recommendedAction: 'split-or-document-export',
                });
            }
            const blob = await canvasToBlob(canvas);
            const filename = sanitizeCardImageFilename(options.filename || target.dataset?.cardImageName || 'card-image');
            if (options.download !== false) downloadBlob(blob, filename);
            return { blob, filename, plan, warnings, width: canvas.width, height: canvas.height };
        } finally {
            if (previousSession == null) target.removeAttribute('data-card-export-session');
            else target.setAttribute('data-card-export-session', previousSession);
        }
    })();
    activeCaptures.set(target, task);
    const release = () => {
        if (activeCaptures.get(target) === task) activeCaptures.delete(target);
    };
    task.then(release, release);
    return task;
}
