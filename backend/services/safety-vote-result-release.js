'use strict';
const CONTRACT='2026-10-25-result-release-policy-r1';
const normalize=value=>String(value||'manual').toLowerCase()==='automatic'?'automatic':'manual';
function decision(input={}){
 const policy=normalize(input.policy),type=String(input.campaignType||''),status=String(input.snapshotStatus||''),balanced=String(input.reconciliationState||'')==='balanced',governanceReady=Boolean(input.governanceReady);
 if(policy!=='automatic')return{contract:CONTRACT,policy,action:'hold',reason:'MANUAL_RELEASE'};
 if(!balanced)return{contract:CONTRACT,policy,action:'hold',reason:'RECONCILIATION_REQUIRED'};
 if(type==='popular_vote'&&status==='Frozen')return{contract:CONTRACT,policy,action:'publish',reason:'STANDARD_CLOSE_READY'};
 if(status==='Certified'&&governanceReady)return{contract:CONTRACT,policy,action:'publish',reason:'GOVERNANCE_COMPLETE'};
 return{contract:CONTRACT,policy,action:'hold',reason:'GOVERNANCE_PENDING'};
}
module.exports={CONTRACT,normalize,decision};
