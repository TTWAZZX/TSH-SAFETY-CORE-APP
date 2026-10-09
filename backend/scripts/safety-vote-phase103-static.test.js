'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

(async()=>{
    const model = await import(pathToFileURL(path.join(root, 'public/js/pages/safety-vote-wizard-model.mjs')).href);
    const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
    const node = require('../services/safety-vote-phase3');
    const php = read('api/lib/safety_vote_phase3.php');

    assert.deepStrictEqual(model.QUESTION_TYPES.survey, node.QUESTION_TYPES, 'Survey builder must expose the complete Node API question-type contract');
    for(const type of node.QUESTION_TYPES)assert(php.includes(`'${type}'`),`PHP API question type missing: ${type}`);
    assert.strictEqual(model.QUESTION_TYPES.survey.length,15);
    assert(model.QUESTION_TYPES.popular_vote.includes('ranking')&&model.QUESTION_TYPES.popular_vote.includes('allocation')&&model.QUESTION_TYPES.popular_vote.includes('matrix'));

    for(const marker of ['data-svw-question-config','data-svw-validation-field','data-svw-condition-field','questionValidationErrors','defaultValidationForType','questionTypeAllowedForPrivacy'])assert(wizard.includes(marker),`Advanced builder marker missing: ${marker}`);

    const draft=model.createWizardDraft();draft.titleTh='Advanced';draft.privacyMode='identified';
    draft.questions=model.QUESTION_TYPES.survey.map((type,index)=>({
        ...model.defaultQuestion('survey',index),questionCode:`Q${index+1}`,questionType:type,title:`Question ${type}`,
        minSelections:1,maxSelections:['multiple_choice','ranking'].includes(type)?2:1,
        validation:model.defaultValidationForType(type),options:model.defaultOptionsForType(type)
    }));
    draft.questions.forEach(question=>{if(model.hasOptions(question.questionType)&&question.options.some(option=>!option.label))question.options.forEach((option,index)=>option.label=`Option ${index+1}`);});
    assert(model.contentValid(draft),'All 15 API-supported types must pass valid local configuration');
    const duplicate={...draft.questions[1],questionCode:'Q1'};draft.questions[1]=duplicate;assert(model.contentValidationErrors(draft).some(error=>error.includes('ไม่ซ้ำ')));draft.questions[1]={...duplicate,questionCode:'Q2'};

    const rating=draft.questions.find(question=>question.questionType==='rating');rating.validation={minNumber:5,maxNumber:5};assert(model.questionValidationErrors(rating,draft,draft.questions.indexOf(rating)).some(error=>error.includes('ช่วงคะแนน')));rating.validation={minNumber:1,maxNumber:5};
    const ranking=draft.questions.find(question=>question.questionType==='ranking');ranking.maxSelections=3;assert(model.questionValidationErrors(ranking,draft,draft.questions.indexOf(ranking)).some(error=>error.includes('จำนวนตัวเลือก')));ranking.maxSelections=2;
    const allocation=draft.questions.find(question=>question.questionType==='allocation');allocation.validation={totalMax:0};assert(model.questionValidationErrors(allocation,draft,draft.questions.indexOf(allocation)).some(error=>error.includes('คะแนนรวม')));allocation.validation={totalMax:100};
    const short=draft.questions.find(question=>question.questionType==='short_text');short.validation={minLength:20,maxLength:10};assert(model.questionValidationErrors(short,draft,draft.questions.indexOf(short)).some(error=>error.includes('ความยาว')));short.validation={minLength:1,maxLength:1000};
    const conditional=draft.questions[1];conditional.displayCondition={questionCode:'Q15',operator:'answered',value:''};assert(model.questionValidationErrors(conditional,draft,1).some(error=>error.includes('คำถามก่อนหน้า')));conditional.displayCondition={questionCode:'Q1',operator:'answered',value:''};
    draft.privacyMode='anonymous';const file=draft.questions.find(question=>question.questionType==='file_upload');assert(model.questionValidationErrors(file,draft,draft.questions.indexOf(file)).some(error=>error.includes('ความเป็นส่วนตัว')));draft.privacyMode='identified';

    const payload=model.builderPayload(draft),rankingPayload=payload.find(question=>question.questionType==='ranking'),ratingPayload=payload.find(question=>question.questionType==='rating');
    assert.strictEqual(rankingPayload.maxSelections,2);assert.deepStrictEqual(ratingPayload.validation,{minNumber:1,maxNumber:5});assert.deepStrictEqual(payload[1].displayCondition,{questionCode:'Q1',operator:'answered',value:''});
    assert(payload.every(question=>Object.hasOwn(question,'randomizeOptions')&&Object.hasOwn(question,'allowComment')));

    console.log('Safety Vote Phase 10.3 static contract: PASS (15 API-supported question types, type-specific/privacy/conditional validation and payload parity)');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
