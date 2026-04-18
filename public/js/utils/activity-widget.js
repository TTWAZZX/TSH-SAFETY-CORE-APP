// public/js/utils/activity-widget.js
// Shared utility: Activity Targets personal progress card for hero stats strips.
//
// Usage (in any module):
//   import { buildActivityCard, clearActivityCache } from '../utils/activity-widget.js';
//
//   // At end of _loadHeroStats():
//   const card = await buildActivityCard('hiyari');
//   if (card) {
//       strip.insertAdjacentHTML('beforeend', card);
//       strip.className = 'grid grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';
//   }
//
// For modules with multiple keys:
//   const card = await buildActivityCard(['cccf_worker', 'cccf_permanent']);

import { API } from '../api.js';

let _cache    = null;
let _fetching = null;

/** Fetch /activity-targets/me with module-level cache (resets on clearActivityCache()). */
async function _fetchMe() {
    if (_cache) return _cache;
    if (_fetching) return _fetching;
    _fetching = API.get('/activity-targets/me')
        .then(r => { _cache = r?.data ?? null; _fetching = null; return _cache; })
        .catch(() => { _fetching = null; return null; });
    return _fetching;
}

/**
 * Clear the cache — call when navigating away or year changes.
 * (Module pages call this on each page load since they rebuild their DOM.)
 */
export function clearActivityCache() {
    _cache    = null;
    _fetching = null;
}

/**
 * Build an HTML string for an activity target progress card
 * matching the hero stats strip style (rgba glass card).
 *
 * @param {string|string[]} activityKeys  e.g. 'hiyari' or ['cccf_worker','cccf_permanent']
 * @returns {Promise<string>}  HTML card string, or '' if no target is configured for this user.
 */
export async function buildActivityCard(activityKeys) {
    const keys = Array.isArray(activityKeys) ? activityKeys : [activityKeys];

    const data = await _fetchMe();
    if (!data?.targets?.length) return '';

    const items = data.targets.filter(t => keys.includes(t.activityKey));
    if (!items.length) return '';

    const target = items.reduce((s, t) => s + (t.yearlyTarget ?? 0), 0);
    const actual = items.reduce((s, t) => s + (t.actualCount  ?? 0), 0);
    if (target === 0) return '';

    const pct       = Math.min(Math.round((actual / target) * 100), 100);
    const barColor  = pct >= 100 ? '#6ee7b7' : pct >= 50 ? '#fbbf24' : '#fca5a5';
    const textColor = pct >= 100 ? '#6ee7b7' : pct >= 50 ? '#fde68a' : '#fca5a5';

    return `
        <div class="rounded-xl px-4 py-3 text-center"
             style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
            <p class="text-xl font-bold leading-tight" style="color:${textColor}">
                ${actual}<span class="text-sm font-normal" style="opacity:0.7">/${target}</span>
            </p>
            <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">เป้าหมายส่วนตัว</p>
            <div class="mt-1.5 h-1.5 rounded-full overflow-hidden"
                 style="background:rgba(255,255,255,0.2)">
                <div class="h-full rounded-full"
                     style="width:${pct}%;background:${barColor}"></div>
            </div>
        </div>`;
}
