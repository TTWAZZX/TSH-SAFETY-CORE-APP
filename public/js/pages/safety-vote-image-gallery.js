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
    host.innerHTML = `<div class="svp-gallery__backdrop" data-sv-gallery-close></div><section role="dialog" aria-modal="true" aria-labelledby="sv-gallery-title" aria-describedby="sv-gallery-position"><header class="svp-gallery__header"><div><h2 id="sv-gallery-title"></h2><p id="sv-gallery-position" aria-live="polite"></p></div><button type="button" class="sv-icon-button" data-sv-gallery-close aria-label="ปิดรูปภาพ">×</button></header><div class="svp-gallery__stage" data-sv-gallery-stage><button type="button" class="svp-gallery__nav svp-gallery__nav--previous" data-sv-gallery-previous aria-label="ดูรูปก่อนหน้า">←</button><img alt=""><button type="button" class="svp-gallery__nav svp-gallery__nav--next" data-sv-gallery-next aria-label="ดูรูปถัดไป">→</button></div><footer class="svp-gallery__actions" data-sv-gallery-actions hidden><div><strong data-sv-gallery-choice-label></strong><span data-sv-gallery-choice-status aria-live="polite"></span></div><button type="button" class="sv-button sv-button--secondary" data-sv-gallery-select>เลือกผลงานนี้</button><button type="button" class="sv-button sv-button--primary" data-sv-gallery-confirm disabled>ยืนยันการเลือก</button></footer></section>`;

    const dialog = host.querySelector('section');
    const image = host.querySelector('.svp-gallery__stage img');
    const title = host.querySelector('#sv-gallery-title');
    const position = host.querySelector('#sv-gallery-position');
    const previous = host.querySelector('[data-sv-gallery-previous]');
    const next = host.querySelector('[data-sv-gallery-next]');
    const stage = host.querySelector('[data-sv-gallery-stage]');
    const actions = host.querySelector('[data-sv-gallery-actions]');
    const choiceLabel = host.querySelector('[data-sv-gallery-choice-label]');
    const choiceStatus = host.querySelector('[data-sv-gallery-choice-status]');
    const selectChoice = host.querySelector('[data-sv-gallery-select]');
    const confirmChoice = host.querySelector('[data-sv-gallery-confirm]');

    const choiceInput = trigger => {
        const name = trigger.dataset.svGalleryChoiceName;
        const value = trigger.dataset.svGalleryChoiceValue;
        if (!name || value === undefined) return null;
        return [...root.querySelectorAll('[data-svp-answer]')].find(input => input.name === name && input.value === value) || null;
    };

    const render = () => {
        const trigger = triggers[index], source = trigger.querySelector('img');
        const label = trigger.dataset.svGalleryLabel || source.alt || 'รูปตัวเลือก';
        image.src = source.currentSrc || source.src;
        image.alt = label;
        title.textContent = label;
        position.textContent = `รูปที่ ${index + 1} จาก ${triggers.length}`;
        stage.classList.toggle('is-single', triggers.length < 2);
        previous.hidden = next.hidden = triggers.length < 2;
        previous.disabled = index === 0;
        next.disabled = index === triggers.length - 1;
        const input = choiceInput(trigger);
        actions.hidden = !input;
        if (input) {
            const selected = input.checked;
            choiceLabel.textContent = trigger.dataset.svGalleryChoiceLabel || label;
            choiceStatus.textContent = selected ? 'เลือกผลงานนี้แล้ว' : 'ยังไม่ได้เลือกผลงานนี้';
            selectChoice.textContent = selected ? 'เลือกแล้ว' : 'เลือกผลงานนี้';
            selectChoice.disabled = selected;
            confirmChoice.disabled = !selected;
        }
    };
    const move = delta => {
        if (triggers.length < 2) return;
        index = Math.max(0, Math.min(triggers.length - 1, index + delta));
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
    selectChoice.addEventListener('click', () => {
        const input = choiceInput(triggers[index]);
        if (!input) return;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        render();
    });
    confirmChoice.addEventListener('click', () => {
        const input = choiceInput(triggers[index]);
        if (input?.checked) close();
    });
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
