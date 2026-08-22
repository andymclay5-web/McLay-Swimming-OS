'use strict';
const assert=require('node:assert/strict');

global.document={readyState:'complete',querySelector:()=>null,addEventListener:()=>{}};
global.setTimeout=(fn)=>{fn();return 1};
const state={
  athletes:[
    {id:'fake',full_name:'Swimmer A',active:true},
    {id:'charlotte',full_name:'Charlotte Murphy',active:true}
  ],
  settings:{activeRole:'swimmer',activeUserAthleteId:'fake',assistantId:'',view:'swimmer',selectedSessionId:'sat'},
  guardian:{runs:[]}
};
const saves=[];
global.MSOS4={
  state,
  BUILD:'old',CORE:'old',RELEASE_ATTESTATION:{build:'old',softwareReady:false},
  util:{escape:v=>String(v??'')},
  store:{save:s=>{saves.push(JSON.parse(JSON.stringify(s)));return s}},
  storageEngine:{saveUi:s=>{saves.push(JSON.parse(JSON.stringify(s)));return s}},
  currentSession:()=>({id:'sat'}),
  toast:()=>{},
  nav:{show:()=>{}},
  presencePersistenceBC:{mergeRows:(local,incoming,sessionId)=>[...local.filter(x=>x.session_id===sessionId),...incoming.filter(x=>x.session_id===sessionId)]},
  guardian:{run:()=>{throw new Error('full guardian must not run on phone')},runAndRender:()=>{throw new Error('old runAndRender must be replaced')}},
  ui:{configureRoleChrome:()=>{},renderGuardian:()=>{}},
  access:{
    role:()=>state.settings.activeRole||'owner',
    setRole:(role,{athleteId='',assistantId=''}={})=>{state.settings.activeRole=role;state.settings.activeUserAthleteId=role==='swimmer'?athleteId:'';state.settings.assistantId=role==='assistant'?assistantId:'';return role},
    can:()=>true
  }
};
require('../engines/stability-identity-bh.js');
const M=global.MSOS4,I=M.stabilityIdentityBH;

assert.equal(M.BUILD,'v4-stability-identity-20260822bh');
assert.equal(state.settings.activeRole,'owner','pre-BH stale swimmer role must reset to owner');
assert.equal(state.settings.activeUserAthleteId,'','stale swimmer id must clear');
assert.equal(state.settings.view,'board','stale swimmer surface must return to Board');
assert.equal(state.settings.roleBindingVersion,'bh1');
assert.equal(I.validLinkedAthlete('fake'),false,'placeholder Swimmer A must never count as a valid linked athlete');
assert.equal(I.validLinkedAthlete('charlotte'),true);
assert.throws(()=>M.access.setRole('swimmer',{athleteId:'fake'}),/real active swimmer/i);
M.access.setRole('swimmer',{athleteId:'charlotte'});
assert.equal(M.access.role(),'swimmer');
assert.equal(state.settings.activeUserAthleteId,'charlotte');
assert.equal(state.settings.roleBindingKind,'swimmer');
assert.equal(state.settings.roleBindingAthleteId,'charlotte');
state.settings.activeUserAthleteId='fake';state.settings.roleBindingAthleteId='fake';
assert.equal(M.access.role(),'owner','runtime placeholder corruption must fail back to owner');
assert.equal(state.settings.activeUserAthleteId,'');
const checks=I.phoneSafeChecks();
assert.equal(checks.ok,true,JSON.stringify(checks.tests.filter(x=>!x.ok)));
assert.equal(checks.total,5);
assert.equal(M.guardian.runAndRender,I.runPhoneSafe,'phone action must not call full Guardian');
assert(saves.length>0,'identity migration should persist');
console.log('PASS stability-identity-bh · stale swimmer identity reset · explicit real swimmer link works · phone Guardian is lightweight');
