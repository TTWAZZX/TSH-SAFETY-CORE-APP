const TRIGGER_SELECTOR = '[data-sv-image-gallery]';

export function bindSafetyVoteImageGallery(root = document) {
    root.querySelectorAll(TRIGGER_SELECTOR).forEach(trigger => {
        if (trigger.dataset.svGalleryBound === 'true') return;
        trigger.dataset.svGalleryBound = 'true';
        trigger.addEventListener('click', () => openSafetyVoteImageGallery(root, trigger));
    });
}

export function openSafetyVoteImageGallery(root, initialTrigger) {
    const initialImage = initialTrigger?.querySelector('img');
    if (!initialImage?.src) return;

    const group = initialTrigger.dataset.svGalleryGroup || 'default';
    const triggers = [...root.querySelectorAll(TRIGGER_SELECTOR)].filter(trigger =>
        (trigger.dataset.svGalleryGroup || 'default') === group && trigger.querySelector('img')?.src
    );
    let index = Math.max(0, triggers.indexOf(initialTrigger));
    let touchStartX = null;
    let touchStartY = null;
    const restoreTarget = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const host = document.createElement('div');
    host.className = 'svp-gallery';
    host.dataset.svImageGalleryDialog = '';
    host.innerHTML = `<div class="svp-gallery__backdrop" data-sv-gallery-close></div><section role="dialog" aria-modal="true" aria-labelledby="sv-gallery-title" aria-describedby="sv-gallery-position"><header class="svp-gallery__header"><div><h2 id="sv-gallery-title"></h2><p id="sv-gallery-position" aria-live="polite"></p></div><button type="button" class="sv-icon-button" data-sv-gallery-close aria-label="ปิดรูปภาพ">×</button></header><div class="svp-gallery__stage" data-sv-gallery-stage><button type="button" class="svp-gallery__nav svp-gallery__nav--previous" data-sv-gallery-previous aria-label="ดูรูปก่อนหน้า">←</button><img alt=""><button type="button" class="svp-gallery__nav svp-gallery__nav--next" data-sv-gallery-next aria-label="ดูรูปถัดไป">→</button></div></section>`;

    const dialog = host.querySelector('section');
    const image = host.querySelector('.svp-gallery__stage img');
    const title = host.querySelector('#sv-gallery-title');
    const position = host.querySelector('#sv-gallery-position');
    const previous = host.querySelector('[data-sv-gallery-previous]');
    const next = host.querySelector('[data-sv-gallery-next]');
    const stage = host.querySelector('[data-sv-gallery-stage]');

    const render = () => {
        const trigger = triggers[index], source = trigger.querySelector('img');
        const label = trigger.dataset.svGalleryLabel || source.alt || 'รูปตัวเลือก';
        image.src = source.src;
        image.alt = label;
        title.textContent = label;
        position.textContent = `รูปที่ ${index + 1} จาก ${triggers.length}`;
        previous.hidden = next.hidden = triggers.length < 2;
    };
    const move = delta => {
        if (triggers.length < 2) return;
        index = (index + delta + triggers.length) % triggers.length;
        render();
    };
    const close = () => {
        document.removeEventListener('keydown', onKeydown);
        document.body.style.overflow = previousOverflow;
        host.remove();
        if (restoreTarget?.isConnected) restoreTarget.focus();
    };
    const onKeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); return; }
        if (event.key === 'ArrowRight') { event.preventDefault(); move(1); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...dialog.querySelectorAll('button:not([hidden]):not([disabled])')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    host.querySelectorAll('[data-sv-gallery-close]').forEach(node => node.addEventListener('click', close));
    stage.addEventListener('touchstart', event => {
        const touch = event.changedTouches[0]; touchStartX = touch.clientX; touchStartY = touch.clientY;
    }, { passive: true });
    stage.addEventListener('touchend', event => {
        if (touchStartX === null || touchStartY === null) return;
        const touch = event.changedTouches[0], dx = touch.clientX - touchStartX, dy = touch.clientY - touchStartY;
        touchStartX = touchStartY = null;
        if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? -1 : 1);
    }, { passive: true });

    document.body.appendChild(host);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    render();
    host.querySelector('[data-sv-gallery-close]')?.focus();
}
