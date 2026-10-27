import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { bindSafetyVoteCampaignPreview, safetyVoteCampaignPreview } from '../../public/js/pages/safety-vote-ux-components.js';

const css = fs.readFileSync(new URL('../../public/style.css', import.meta.url), 'utf8');
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const base = { titleTh: 'กิจกรรมจริง', summary: 'ข้อมูลตาม Draft', privacyMode: 'identified', maxParticipationAttempts: 1 };
const question = { questionCode: 'Q1', questionType: 'single_choice', title: 'คำถามจริง', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ optionCode: 'A', label: 'ตัวเลือก A', previewUrl: pixel }, { optionCode: 'B', label: 'ตัวเลือก B' }] };
const workflows = ['survey','popular_vote','secret_election','submission_challenge','nomination'];
const markup = workflows.map(campaignType => {
    const campaign = { ...base, campaignType, privacyMode: campaignType === 'secret_election' ? 'secret_ballot' : 'identified' };
    const questions = campaignType === 'survey' ? [question, { questionCode: 'Q2', questionType: 'long_text', title: 'คำถามตามเงื่อนไข', displayCondition: { questionCode: 'Q1', operator: 'equals', value: 'A' } }] : [question];
    return `${safetyVoteCampaignPreview({ campaign, questions, mode: 'user' })}${safetyVoteCampaignPreview({ campaign, questions, mode: 'admin' })}`;
}).join('') + safetyVoteCampaignPreview({
    campaign: { ...base, campaignType: 'jury_scoring', workSource: 'admin_curated' },
    works: [{ id: 1, workCode: 'WORK-1', title: 'ผลงานจริง', gallery: [{ previewUrl: pixel, isCover: true }] }],
    criteria: [{ title: 'เกณฑ์จริง', minScore: 1, maxScore: 5, weight: 100 }], mode: 'juror'
});

const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
        const page = await browser.newPage({ viewport });
        await page.setContent(`<style>${css}</style><main style="max-width:1000px;margin:auto;display:grid;gap:1rem">${markup}</main>`);
        await page.evaluate(`(${bindSafetyVoteCampaignPreview.toString()})(document)`);
        assert.equal(await page.locator('[data-sv-preview-question-code="Q2"]').isHidden(), true);
        await page.locator('[data-sv-workflow-preview="survey"] [data-sv-preview-question-code="Q1"] input[value="A"]').check();
        assert.equal(await page.locator('[data-sv-preview-question-code="Q2"]').isVisible(), true);
        const result = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            userWorkflows: new Set([...document.querySelectorAll('[data-sv-workflow-preview]')].map(node => node.dataset.svWorkflowPreview)).size,
            adminWorkflows: document.querySelectorAll('[data-sv-admin-preview]').length,
            juryMatrices: document.querySelectorAll('[data-sv-jury-preview="juror"] .sv-live-preview__matrix-work').length
        }));
        assert.ok(result.overflow <= 1, `${viewport.width}px all-workflow preview has horizontal overflow: ${result.overflow}px`);
        assert.equal(result.userWorkflows, 5);
        assert.equal(result.adminWorkflows, 5);
        assert.equal(result.juryMatrices, 1);
        await page.close();
    }
} finally {
    await browser.close();
}

console.log('Safety Vote all-workflow Preview Browser UAT: PASS (6 profiles, User/Admin/Juror, 390px/1366px)');
