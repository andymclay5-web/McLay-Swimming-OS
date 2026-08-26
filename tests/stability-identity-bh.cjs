'use strict';
const assert=require('node:assert/strict');

const state={
  athletes:[
    {id:'fake',full_name:'Swimmer A',active:true},
    {id:'fake2',full_name:'Swimmer B',active:true},
    {id:'charlotte',full_name:'Charlotte Murphy',active:true}
  ],
  attendance:[{session_id:'sat',athlete_id:'fake',status:'present'},{session_id:'sat',athlete_id:'charlotte',status:'present'}],
  captures:[],adaptationProfiles:[],adaptationOverrides:[],trainingTestResults:[],coachResults:[],athleteAchievements:[],timedSets:[],
  settings:{activeRole:'swimmer',activeUserAthleteId:'fake',assistantId:'',view:'swimmer',selectedSessionId:'sat'},
  guardian:{runs:[]}
};
const saves=[];
global.MSOS4={
  state,
  BUILD:'v4-before-bh',CORE:'old',RELEASE_ATTESTATION:{build:'old',softwareReady:false},
  store:{save:s=>{saves.push(JSON.parse(JSON.stringify(s)));return s}},
  storageEngine:{saveUi:s=>{saves.push(JSON.parse(JSON.stringify(s)));return s}},
  ui:{configureRoleChrome:()=>{}},
  access:{
    role:()=>state.settings.activeRole||'owner',
    setRole:(role,{athleteId='',assistantId=''}={})=>{state.settings.activeRole=role;state.settings.activeUserAthleteId=role==='swimmer'?athleteId:'';state.settings.assistantId=role==='assistant'?assistantId:'';return role}
  }
};
require('../engines/stability-identity-bh.js');
const M=global.MSOS4,I=M.stabilityIdentityBH;

assert.equal(I.build,'v4-stability-identity-20260822bh');
assert.equal(state.settings.activeRole,'owner','pre-BH stale swimmer role must reset to owner');
assert.equal(state.settings.activeUserAthleteId,'','stale swimmer id must clear');
assert.equal(state.settings.view,'board','stale swimmer surface must return to Board');
assert.equal(state.settings.roleBindingVersion,'bh1');
assert.equal(state.athletes.some(a=>/^Swimmer\s+[AB]$/i.test(a.full_name)),false,'placeholder swimmers must be purged from roster');
assert.equal(state.attendance.some(r=>r.athlete_id==='fake'),false,'placeholder attendance must be purged');
assert.equal(state.guardian.fieldIncidents?.at(-1)?.type,'placeholder_roster_contamination','cleanup must leave a Guardian field incident');
assert.deepEqual(state.guardian.fieldIncidents.at(-1).names,['Swimmer A','Swimmer B']);
assert.equal(I.validLinkedAthlete('fake'),false,'placeholder Swimmer A must never count as a valid linked athlete');
assert.equal(I.validLinkedAthlete('charlotte'),true);
assert.throws(()=>M.access.setRole('swimmer',{athleteId:'fake'}),/real active swimmer/i);
M.access.setRole('swimmer',{athleteId:'charlotte'});
assert.equal(M.access.role(),'swimmer');
assert.equal(state.settings.activeUserAthleteId,'charlotte');
assert.equal(state.settings.roleBindingKind,'swimmer');
assert.equal(state.settings.roleBindingAthleteId,'charlotte');
assert(saves.length>0,'identity/roster migration should persist');
console.log('PASS stability-identity-bh · placeholder roster purged + audited · stale role reset · explicit real swimmer link works');
