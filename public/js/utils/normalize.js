// public/js/utils/normalize.js

/**
 * Normalize API response to array safely
 * รองรับ:
 * - []
 * - { data: [] }
 * - { rows: [] }
 * - null / undefined
 */
export function normalizeApiArray(input) {
    if (Array.isArray(input)) return input;

    if (input && Array.isArray(input.data)) return input.data;

    if (input && Array.isArray(input.rows)) return input.rows;

    return [];
}

/**
 * Normalize API response to object safely
 * รองรับ:
 * - {}
 * - { data: {} }
 * - null / undefined
 */
export function normalizeApiObject(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        if (input.data && typeof input.data === 'object') {
            return input.data;
        }
        return input;
    }
    return {};
}
