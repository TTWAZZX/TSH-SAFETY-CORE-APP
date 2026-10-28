import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildScorePayload,
    validateDraftScoreSheet,
    validateScoreSheet
} from '../../public/js/pages/safety-vote-jury-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const detail = {
    candidates: [{ id: 10, displayName: 'Candidate WORK-1' }, { id: 20, displayName: 'Candidate WORK-2' }],
    criteria: [{ id: 1, Title: 'Safety', MinScore: 1, MaxScore: 10 }]
};
const partial = { '10:1': { score: '8', comment: 'draft' }, '20:1': { score: '', comment: '' } };

assert.deepEqual(validateDraftScoreSheet(detail, partial), [], 'A partial draft must not require every matrix cell');
assert.equal(validateScoreSheet(detail, partial).length, 1, 'Final review must still require the complete matrix');
assert.deepEqual(buildScorePayload(detail, partial), { scores: [{ candidateId: 10, criterionId: 1, score: 8, comment: 'draft' }] });
assert.equal(validateDraftScoreSheet(detail, { '10:1': { score: '99' } }).length, 1, 'Entered draft values must remain range-validated');

const workspace = read('public/js/pages/safety-vote-jury-workspace.js');
const css = read('public/style.css');
const nodeRoute = read('backend/routes/safety-vote-phase4.js');
const phpRoute = read('api/handlers/safety_vote_phase4.php');
assert(workspace.includes('validateDraftScoreSheet') && workspace.includes('บันทึกอัตโนมัติบนเซิร์ฟเวอร์แล้ว'));
assert(workspace.includes('startSessionKeepAlive') && workspace.includes('refreshSession({ preserveOnFailure: true })'));
assert(workspace.includes('svj-candidate__workspace') && workspace.includes('svj-candidate__evidence'));
assert(css.includes('.svj-candidate__criteria { max-height: calc(100dvh - 8rem); overflow-y: auto') && css.includes('grid-template-columns: minmax(330px, .72fr)'));
assert(nodeRoute.includes('r.body?.scores,false') && nodeRoute.includes("DELETE FROM SafetyVote_JuryScores WHERE AssignmentID=? AND Status='Draft'"));
assert(phpRoute.includes("json_body()['scores']??null,false") && phpRoute.includes("DELETE FROM SafetyVote_JuryScores WHERE AssignmentID=? AND Status='Draft'"));

console.log('Safety Vote Jury scoring R1: PASS (partial server drafts, final completeness, session keepalive, sticky evidence workspace)');
