'use strict';

const ACTIVE_STATUSES = new Set(['Draft','Scheduled','Open','Closed','Certified','Published']);
const ARCHIVABLE_STATUSES = new Set(['Closed','Certified','Published']);
const VOIDABLE_STATUSES = new Set(['Draft','Scheduled','Open','Closed','Certified']);
const RESTORABLE_STATUSES = new Set(['Closed','Certified','Published']);

function number(value){ return Number(value || 0); }
function usageTotal(usage={}){
    return Object.entries(usage).filter(([key])=>key!=='files').reduce((sum,[,value])=>sum+number(value),0);
}
function capabilities(campaign,usage={}){
    const status=String(campaign?.Status||''),hidden=number(campaign?.IsHidden)===1,test=number(campaign?.IsTest)===1;
    const businessRows=usageTotal(usage),files=number(usage.files);
    return{
        hide:ACTIVE_STATUSES.has(status)&&!hidden,
        unhide:ACTIVE_STATUSES.has(status)&&hidden,
        markTest:status==='Draft'&&!test&&businessRows===0,
        unmarkTest:status==='Draft'&&test&&businessRows===0,
        archive:ARCHIVABLE_STATUSES.has(status),
        restore:status==='Archived'&&RESTORABLE_STATUSES.has(String(campaign?.ArchivedFromStatus||'')),
        void:VOIDABLE_STATUSES.has(status),
        purge:status==='Voided'&&test&&businessRows===0&&files===0,
        businessRows,files
    };
}

module.exports={capabilities,usageTotal,ACTIVE_STATUSES,ARCHIVABLE_STATUSES,VOIDABLE_STATUSES,RESTORABLE_STATUSES};
