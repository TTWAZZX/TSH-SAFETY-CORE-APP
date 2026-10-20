import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';

const blobCache = new Map();
const urlsByRoot = new WeakMap();

function fileIdOf(image) {
    return Number(image?.dataset?.svAuthFile || 0);
}

function stateHost(image) {
    const host = image.closest('[data-sv-auth-media], [data-svp-media-state]') || image.parentElement;
    if (!host) return null;
    host.dataset.svAuthMedia = '';
    if (!host.dataset.svpMediaState) host.dataset.svpMediaState = 'loading';
    host.setAttribute('aria-busy', host.dataset.svpMediaState === 'loading' ? 'true' : 'false');
    let status = host.querySelector(':scope > .svp-auth-media__status');
    if (!status) {
        status = document.createElement('span');
        status.className = 'svp-auth-media__status';
        status.setAttribute('role', 'status');
        status.innerHTML = '<span aria-hidden="true"></span><span data-sv-auth-status>กำลังโหลดภาพ…</span>';
        host.insertBefore(status, image);
    }
    return host;
}

function setState(host, state, message, retryable = state === 'error') {
    if (!host) return;
    host.dataset.svpMediaState = state;
    host.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    const label = host.querySelector('[data-sv-auth-status]') || host.querySelector('.svp-auth-media__status > span:last-child');
    if (label) label.textContent = message;
    let retry = host.querySelector('[data-sv-auth-retry]');
    if (retryable && !retry) {
        retry = document.createElement('span');
        retry.setAttribute('role', 'button');
        retry.tabIndex = 0;
        retry.className = 'svp-auth-media__retry';
        retry.dataset.svAuthRetry = '';
        retry.textContent = 'ลองใหม่';
        host.querySelector('.svp-auth-media__status')?.appendChild(retry);
    } else if (!retryable) retry?.remove();
}

async function cachedBlob(fileId, force = false) {
    if (force) blobCache.delete(fileId);
    if (!blobCache.has(fileId)) {
        blobCache.set(fileId, API.get(`/safety-vote/files/${fileId}`, { suppressErrorLog: true })
            .then(response => response.blob())
            .then(blob => {
                if (!blob?.size || !String(blob.type || '').startsWith('image/')) throw new Error('INVALID_IMAGE_RESPONSE');
                return blob;
            })
            .catch(error => { blobCache.delete(fileId); throw error; }));
    }
    return blobCache.get(fileId);
}

async function hydrateOne(root, image, force = false) {
    const fileId = fileIdOf(image), host = stateHost(image);
    if (!fileId || !host) return;
    image.classList.add('svp-auth-image');
    setState(host, 'loading', 'กำลังโหลดภาพ…');
    try {
        const blob = await cachedBlob(fileId, force);
        if (!image.isConnected) return;
        const url = URL.createObjectURL(blob);
        if (!urlsByRoot.has(root)) urlsByRoot.set(root, new Set());
        urlsByRoot.get(root).add(url);
        image.src = url;
        if (typeof image.decode === 'function') await image.decode();
        if (!image.isConnected) return;
        setState(host, 'loaded', 'โหลดภาพแล้ว');
    } catch (error) {
        if (!image.isConnected) return;
        image.removeAttribute('src');
        const unavailable = error?.code === 'FILE_NOT_FOUND';
        setState(host, unavailable ? 'unavailable' : 'error', unavailable ? 'ไม่พบไฟล์ต้นฉบับ' : 'โหลดภาพไม่สำเร็จ', !unavailable);
    }
}

function bindRetryControls(root) {
    root.querySelectorAll('[data-sv-auth-retry]').forEach(button => {
        if (button.dataset.svAuthRetryBound === 'true') return;
        button.dataset.svAuthRetryBound = 'true';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const image = button.closest('[data-sv-auth-media], [data-svp-media-state]')?.querySelector('img[data-sv-auth-file]');
            if (image) hydrateOne(root, image, true);
        });
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') button.click();
        });
    });
}

export async function hydrateSafetyVoteImages(root = document) {
    const images = [...root.querySelectorAll('img[data-sv-auth-file]')];
    bindRetryControls(root);
    await Promise.all(images.map(image => hydrateOne(root, image)));
    bindRetryControls(root);
}

export function releaseSafetyVoteImages(root) {
    for (const url of urlsByRoot.get(root) || []) URL.revokeObjectURL(url);
    urlsByRoot.delete(root);
}

export function clearSafetyVoteImageCache(fileId = null) {
    if (fileId === null) blobCache.clear();
    else blobCache.delete(Number(fileId));
}
