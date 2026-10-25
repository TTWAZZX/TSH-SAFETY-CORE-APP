import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';

const clean = value => String(value ?? '').trim();

export function safetyVotePeoplePickerMarkup({ pickerId, key, label = 'เลือกพนักงาน', value = '', selectedLabel = '', help = 'ค้นหาด้วยชื่อ รหัสพนักงาน แผนก หน่วยงาน หรือตำแหน่ง', disabled = false, excludedIds = [] } = {}) {
    const id = clean(pickerId || key).replace(/[^a-zA-Z0-9_-]/g, '-') || 'people';
    const employeeId = clean(value), display = clean(selectedLabel) || employeeId;
    return `<section class="sv-people-picker" data-sv-people-picker="${escHtml(id)}" data-sv-people-key="${escHtml(key || id)}" data-sv-people-excluded="${escHtml(excludedIds.map(clean).filter(Boolean).join(','))}" ${disabled ? 'data-disabled="true"' : ''}>
        <label class="svw-field" for="sv-people-search-${escHtml(id)}"><span>${escHtml(label)}</span><span class="sv-people-picker__search"><input id="sv-people-search-${escHtml(id)}" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sv-people-list-${escHtml(id)}" placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" ${disabled ? 'disabled' : ''}><span class="sv-people-picker__spinner" aria-hidden="true"></span></span><small>${escHtml(help)}</small></label>
        <input type="hidden" data-sv-people-value value="${escHtml(employeeId)}">
        <div class="sv-people-picker__selected" data-sv-people-selected ${employeeId ? '' : 'hidden'}>${employeeId ? `<span><strong>${escHtml(display)}</strong><small>${escHtml(employeeId)}</small></span>${disabled ? '' : '<button type="button" class="sv-icon-button" data-sv-people-clear aria-label="ล้างพนักงานที่เลือก">×</button>'}` : ''}</div>
        <div id="sv-people-list-${escHtml(id)}" class="sv-people-picker__results" data-sv-people-results role="listbox" aria-label="ผลการค้นหาพนักงาน" hidden></div>
        <p class="sv-people-picker__status" data-sv-people-status aria-live="polite">${employeeId ? `เลือก ${escHtml(display)} แล้ว` : 'ยังไม่ได้เลือกพนักงาน'}</p>
    </section>`;
}

function personMarkup(person, excluded) {
    const id = clean(person.employeeId), name = clean(person.employeeName) || id;
    const meta = [person.department, person.unit, person.position].map(clean).filter(Boolean).join(' / ');
    return `<button type="button" role="option" data-sv-person-id="${escHtml(id)}" data-sv-person-name="${escHtml(name)}" ${excluded.has(id) ? 'disabled aria-disabled="true"' : ''}><span><strong>${escHtml(name)}</strong><small>${escHtml(id)}${meta ? ` · ${escHtml(meta)}` : ''}</small></span><span>${excluded.has(id) ? 'เลือกแล้ว' : 'เลือก'}</span></button>`;
}

export function bindSafetyVotePeoplePickers(root, { onChange = () => {} } = {}) {
    const cleanups = [];
    root.querySelectorAll('[data-sv-people-picker]').forEach(picker => {
        const input = picker.querySelector('[role="combobox"]'), hidden = picker.querySelector('[data-sv-people-value]'), results = picker.querySelector('[data-sv-people-results]'), selected = picker.querySelector('[data-sv-people-selected]'), status = picker.querySelector('[data-sv-people-status]');
        if (!input || !hidden || !results || picker.dataset.disabled === 'true') return;
        const excluded = new Set(clean(picker.dataset.svPeopleExcluded).split(',').filter(Boolean));
        let timer = null, blurTimer = null, controller = null, activeIndex = -1;
        const close = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); activeIndex = -1; };
        const choose = person => {
            if (!person || !person.employeeId) return;
            hidden.value = clean(person.employeeId);
            selected.hidden = false;
            selected.innerHTML = `<span><strong>${escHtml(person.employeeName || person.employeeId)}</strong><small>${escHtml(person.employeeId)}${person.department ? ` · ${escHtml(person.department)}` : ''}</small></span><button type="button" class="sv-icon-button" data-sv-people-clear aria-label="ล้างพนักงานที่เลือก">×</button>`;
            input.value = ''; close(); status.textContent = `เลือก ${person.employeeName || person.employeeId} แล้ว`;
            onChange({ key: picker.dataset.svPeopleKey, employeeId: hidden.value, person, cleared: false }, picker);
        };
        const bindRows = rows => results.querySelectorAll('[data-sv-person-id]').forEach((button,index) => {button.id=`${picker.dataset.svPeoplePicker}-option-${index}`;button.addEventListener('click', () => { if (!button.disabled) choose(rows.find(person => clean(person.employeeId) === button.dataset.svPersonId)); });});
        const search = async () => {
            const query = clean(input.value);
            if (Array.from(query).length < 2) { controller?.abort(); close(); status.textContent = query ? 'พิมพ์อย่างน้อย 2 ตัวอักษร' : 'ค้นหาจาก Employee Master Data'; return; }
            controller?.abort(); controller = new AbortController(); picker.classList.add('is-loading'); status.textContent = 'กำลังค้นหา…';
            try {
                const response = await API.get(`/safety-vote/people?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal, suppressErrorLog: true });
                const rows = response.data?.rows || [];
                results.innerHTML = rows.length ? rows.map(person => personMarkup(person, excluded)).join('') : '<p>ไม่พบพนักงานที่ตรงกับคำค้น</p>';
                results.hidden = false; input.setAttribute('aria-expanded', 'true'); status.textContent = rows.length ? `พบ ${rows.length.toLocaleString('th-TH')} รายการ${response.data?.hasMore ? ' · กรุณาระบุคำค้นให้เจาะจงขึ้น' : ''}` : 'ไม่พบพนักงาน'; bindRows(rows);
            } catch (error) { if (error?.name !== 'AbortError') { results.innerHTML = '<p role="alert">ค้นหาข้อมูลพนักงานไม่สำเร็จ กรุณาลองใหม่</p>'; results.hidden = false; input.setAttribute('aria-expanded', 'true'); status.textContent = 'ค้นหาไม่สำเร็จ'; } }
            finally { picker.classList.remove('is-loading'); }
        };
        const onInput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };
        const onKey = event => {
            const buttons = [...results.querySelectorAll('button:not([disabled])')];
            if (event.key === 'Escape') { close(); input.focus(); return; }
            if (!buttons.length || !['ArrowDown','ArrowUp','Enter'].includes(event.key)) return;
            const focusedIndex = buttons.indexOf(event.target.closest?.('button'));
            if (focusedIndex >= 0) activeIndex = focusedIndex;
            event.preventDefault();
            if (event.key === 'Enter' && activeIndex >= 0) { buttons[activeIndex].click(); return; }
            activeIndex = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, activeIndex + 1) : Math.max(0, activeIndex - 1);
            buttons[activeIndex].focus(); input.setAttribute('aria-activedescendant', buttons[activeIndex].id || `${picker.dataset.svPeoplePicker}-option-${activeIndex}`);
        };
        const onFocusOut = () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => { if (!picker.contains(document.activeElement)) close(); }, 0); };
        const onClick = event => {
            const clearButton = event.target.closest('[data-sv-people-clear]'); if (!clearButton) return;
            hidden.value = ''; selected.hidden = true; selected.innerHTML = ''; input.value = ''; status.textContent = 'ล้างพนักงานที่เลือกแล้ว'; input.focus();
            onChange({ key: picker.dataset.svPeopleKey, employeeId: '', person: null, cleared: true }, picker);
        };
        input.addEventListener('input', onInput); picker.addEventListener('keydown', onKey); picker.addEventListener('focusout', onFocusOut); picker.addEventListener('click', onClick);
        if(hidden.value&&!selected.querySelector('strong')?.textContent?.trim().replace(hidden.value,'').trim())API.get(`/safety-vote/people?employeeId=${encodeURIComponent(hidden.value)}`,{signal:(controller=new AbortController()).signal,suppressErrorLog:true}).then(response=>{const person=response.data?.rows?.[0];if(person)choose(person);}).catch(()=>{});
        cleanups.push(() => { clearTimeout(timer); clearTimeout(blurTimer); controller?.abort(); input.removeEventListener('input', onInput); picker.removeEventListener('keydown', onKey); picker.removeEventListener('focusout', onFocusOut); picker.removeEventListener('click', onClick); });
    });
    return () => cleanups.forEach(cleanup => cleanup());
}
