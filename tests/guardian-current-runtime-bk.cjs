'use strict';
const assert=require('node:assert/strict');

global.MSOSArchitecture={AthleteSession:{},TrainingHistory:{},AthleteObservation:{},AthleteReport:{}};
const state={athletes:[],attendance:[],meetEntries:[],meetEvidence:[],settings:{activeRole:'owner',activeUserAthleteId:'',roleBindingVersion:'bh1',roleBindingKind:'owner',roleBindingAthleteId:''},guardian:{runs:[]}};
const caps={owner:new Set(['session.edit','attendance.read','capture.write','meet.manage']),swimmer:new Set(['pathway.read_own','capture.write_own','meet.view_own']),assistant:new Set(['capture.write'])};
const M=global.MSOS4={
  state,BUILD:'old',CORE:'old',RELEASE_ATTESTATION:{build:'old',softwareReady:false},
  util:{clone:v=>JSON.parse(JSON.stringify(v)),uid:p=>`${p}-1`,now:()=>new Date().toISOString()},
  store:{save:s=>s},currentSession:()=>({id:'s'}),
  presencePersistenceBC:{mergeRows:(a,b)=>[...a,...b]},
  athleteSessionBE:{startAtItem(){},startSquadAtItem(){},endAtItem(){}},
  release:{deviceAccepted:()=>false},
  access:{
    role:()=>state.settings.activeRole||'owner',
    can:cap=>caps[state.settings.activeRole||'owner']?.has(cap)||false,
    athleteAllowed:a=>state.settings.activeRole==='owner'||(state.settings.activeRole==='swimmer'?a.id===state.settings.activeUserAthleteId:true),
    visibleAthletes(){return state.athletes.filter(a=>a.active!==false&&this.athleteAllowed(a));},
    captureVisible:()=>true
  },
  meet:{ensureState(){state.meetEntries=state.meetEntries||[];state.meetEvidence=state.meetEvidence||[];},current:()=>({id:'m'})},
  guardian:{run:()=>({ok:false,build:'old',tests:[
    {name:'Legacy evidence is never assumed swimmer-visible without an explicit v4 audience',ok:false,detail:'old'},
    {name:'Swimmer role cannot see another swimmer or coach editing capabilities',ok:false,detail:'old'},
    {name:'Meet Deck race truth is separate from training-session truth and swimmer queue is private',ok:false,detail:'old'},
    {name:'Swimmer Meet evidence is own-athlete and shared-only',ok:false,detail:'old'},
    {name:'Guardian is running the current presence-persistence candidate',ok:false,detail:'old'},
    {name:'Squad layer candidate is active and remains release locked',ok:false,detail:'old'},
    {name:'Truth release stays field-acceptance locked',ok:false,detail:'old'},
    {name:'Preserved foundation check',ok:true,detail:''}
  ],passed:1,total:8})}
};
require('../engines/privacy-hardening-bk.js');
require('../engines/release-guardian-bk.js');
const r=M.guardian.run();
const stale=new Set([
  'Legacy evidence is never assumed swimmer-visible without an explicit v4 audience',
  'Swimmer role cannot see another swimmer or coach editing capabilities',
  'Meet Deck race truth is separate from training-session truth and swimmer queue is private',
  'Swimmer Meet evidence is own-athlete and shared-only',
  'Guardian is running the current presence-persistence candidate',
  'Squad layer candidate is active and remains release locked',
  'Truth release stays field-acceptance locked'
]);
assert.equal(r.build,'v4-guardian-privacy-20260822bk');
assert.equal(r.tests.some(t=>stale.has(t.name)),false,'stale candidate-specific Guardian failures survived');
assert.equal(r.tests.some(t=>t.name==='Current privacy · legacy coach evidence requires explicit swimmer audience'),true);
assert.equal(r.tests.some(t=>t.name==='Current privacy · swimmer Meet evidence is own-athlete and shared-only'),true);
assert.equal(r.tests.some(t=>t.name==='Current privacy · swimmer cannot write Meet evidence to another athlete'),true);
assert.equal(r.tests.some(t=>t.name==='Current integration · presence persistence remains connected under current build'),true);
const failures=r.tests.filter(t=>!t.ok);
assert.deepEqual(failures,[],JSON.stringify(failures));
assert.equal(r.ok,true);
console.log(`PASS guardian-current-runtime-bk · ${r.passed}/${r.total} · stale checks replaced by current privacy/integration gates`);
