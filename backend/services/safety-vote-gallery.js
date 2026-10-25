'use strict';

const OWNER_TYPES = Object.freeze(['candidate', 'submission']);
const MAX_ITEMS = 12;

function int(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function text(value, max) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

function metadata(input = {}) {
    const altText = text(input.altText, 300), caption = text(input.caption, 500);
    return { ok: Boolean(altText), value: { altText, caption: caption || null }, errors: altText ? [] : ['ALT_TEXT_REQUIRED'] };
}

function reorder(input) {
    if (!Array.isArray(input) || input.length > MAX_ITEMS) return { ok: false, items: [], errors: ['GALLERY_ITEMS_INVALID'] };
    const seen = new Set(), items = [], errors = [];
    input.forEach((row, index) => {
        const id = int(row?.id), normalized = metadata(row);
        if (!id || seen.has(id)) errors.push('GALLERY_ITEM_DUPLICATE_OR_INVALID');
        if (!normalized.ok) errors.push(...normalized.errors);
        if (id && !seen.has(id)) { seen.add(id); items.push({ id, ...normalized.value, sortOrder: index + 1, isCover: row?.isCover === true }); }
    });
    if (items.filter(item => item.isCover).length > 1) errors.push('GALLERY_COVER_DUPLICATE');
    return { ok: errors.length === 0, items, errors: [...new Set(errors)] };
}

module.exports = { OWNER_TYPES, MAX_ITEMS, int, text, metadata, reorder };
