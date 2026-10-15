export const SAFETY_VOTE_TIME_ZONE = 'Asia/Bangkok';

function asDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    const text = String(value || '').trim();
    if (!text) return null;
    // MySQL DATETIME values have no zone. Safety Vote stores and presents these
    // as Bangkok wall-clock values, so make the contract explicit in browsers.
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
        ? `${text.replace(' ', 'T')}+07:00`
        : text;
    return new Date(normalized);
}

function bangkokParts(value) {
    const date = asDate(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SAFETY_VOTE_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return parts;
}

export function formatThaiDateTime(value, fallback = 'ยังไม่กำหนด') {
    const date = asDate(value);
    if (!date || Number.isNaN(date.getTime())) return fallback;
    return `${new Intl.DateTimeFormat('th-TH', {
        timeZone: SAFETY_VOTE_TIME_ZONE,
        dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23'
    }).format(date)} น.`;
}

export function formatThaiTime(value, fallback = 'ไม่ระบุเวลา', includeSeconds = false) {
    const date = asDate(value);
    if (!date || Number.isNaN(date.getTime())) return fallback;
    return `${new Intl.DateTimeFormat('th-TH', {
        timeZone: SAFETY_VOTE_TIME_ZONE,
        hour: '2-digit', minute: '2-digit',
        ...(includeSeconds ? { second: '2-digit' } : {}),
        hourCycle: 'h23'
    }).format(date)} น.`;
}

export function toBangkokInputValue(value = Date.now()) {
    const parts = bangkokParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : '';
}

export function splitBangkokInput(value = Date.now()) {
    const text = String(value || '').trim();
    const localInput = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
    if (localInput) return { date: localInput[1], time: localInput[2] };
    const combined = toBangkokInputValue(value);
    const [date = '', time = ''] = combined.split('T');
    return { date, time };
}

export function joinBangkokInput(date, time) {
    const day = String(date || '').trim();
    const clock = String(time || '').trim();
    return day && clock ? `${day}T${clock.slice(0, 5)}` : '';
}

export function bangkokInputToIso(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return '';
    const date = new Date(`${text}:00+07:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
