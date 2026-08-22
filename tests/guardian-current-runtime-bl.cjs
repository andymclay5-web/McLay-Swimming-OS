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
  guardian:{run:()=>({ok:true,build:'foundation',tests:[{name:'Preserved foundation check',ok:true,detail:''}],passed:1,total:1})}
};
require('../engines/privacy-hardening-bk.js');
require('../engines/release-guardian-bl.js');
const r=M.guardian.run();
assert.equal(M.BUILD,'v4-guardian-runtime-order-20260822bl');
assert.equal(M.RELEASE_ATTESTATION.build,M.BUILD);
assert.equal(r.build,M.BUILD);
assert.equal(r.tests.some(t=>t.name==='Current integration · presence persistence remains connected under current build'&&!t.ok),false);
assert.equal(r.tests.some(t=>t.name==='Current integration · truth-release architecture remains connected and field locked'&&!t.ok),false);
assert.deepEqual(r.tests.filter(t=>!t.ok),[]);
assert.equal(r.ok,true);
console.log(`PASS guardian-current-runtime-bl · ${r.passed}/${r.total} · final build and attestation agree`);
