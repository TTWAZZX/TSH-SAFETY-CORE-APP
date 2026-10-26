'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/playwright');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'patrol.js'), 'utf8');
const scheduleStart = source.indexOf('window._scOnScheduleChange = function() {');
const typeStart = source.indexOf('window._scOnTypeChange = function() {');
const modalStart = source.indexOf('function openSelfPatrolScheduleDetail', typeStart);
assert(scheduleStart >= 0 && typeStart > scheduleStart && modalStart > typeStart, 'Self check-in mode handlers are missing');
const handlers = source.slice(scheduleStart, modalStart);

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`
            <form id="self-checkin-form">
                <select id="sc-session">
                    <option value="past-r1" data-type="compensation" data-date="2026-10-14" data-area="Factory 1" selected>Past R1</option>
                </select>
                <input type="radio" name="sc-type" value="normal" id="sc-type-normal">
                <input type="radio" name="sc-type" value="compensation" id="sc-type-comp" checked>
                <input id="sc-date">
                <input id="sc-area-value">
                <span id="sc-area-text"></span>
                <span id="sc-mode-hint"></span>
                <button type="submit">Save</button>
            </form>
        `);
        await page.evaluate(({ handlerSource }) => {
            window.patrolIsFlexibleSelfPatrol = () => false;
            window.patrolDateOnly = () => '2026-10-26';
            window.eval(handlerSource);
            window._scOnScheduleChange();
        }, { handlerSource: handlers });

        const initial = await page.evaluate(() => ({
            type: document.querySelector('input[name="sc-type"]:checked')?.value,
            disabled: document.querySelector('button[type="submit"]').disabled,
        }));
        assert.deepEqual(initial, { type: 'compensation', disabled: false });

        const recovered = await page.evaluate(() => {
            const normal = document.getElementById('sc-type-normal');
            normal.checked = true;
            window._scOnTypeChange();
            return {
                selectedSession: document.getElementById('sc-session').value,
                type: document.querySelector('input[name="sc-type"]:checked')?.value,
                disabled: document.querySelector('button[type="submit"]').disabled,
            };
        });
        assert.deepEqual(recovered, { selectedSession: 'past-r1', type: 'compensation', disabled: false });
        console.log('Patrol self check-in mode Browser regression: PASS (invalid Normal selection recovers to Makeup with Save enabled)');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
