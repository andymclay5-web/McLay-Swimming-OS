'use strict';
const assert=require('node:assert/strict');

global.MSOSArchitecture={AthleteSession:{},TrainingHistory:{},AthleteObservation:{},AthleteReport:{}};
const state={athletes:[],attendance:[],meetEntries:[],meetEvidence:[],settings:{activeRole:'owner',activeUserAthleteId:'',roleBindingVersion:'bh1',roleBindingKind:'owner',roleBindingAthleteId:''},guardian:{runs:[]}};
const caps={owner:new Set(['session.edit','attendance.read','capture.write','meet.manage']),swimmer:new Set(['pathway.read_own','capture.write_own','meet.view_own']),assistant:new Set(['capture.write'])};
const M=global.MSOS4={
  state,BUILD:'old',CORE:'old',RELEASE_ATTESTATION:{build:'old',softwareReady:false},
  util:{clone:v=>JSON.parse(JSON.stringify(v)),uid:p=>`${p}-1`,now:()=>new Date().toISOString(),clock:s=>Number(s).toFixed(2)},
  store:{save:s=>s},currentSession:()=>({id:'s'}),
  presencePersistenceBC:{mergeRows:(a,b)=>[...a,...b]},
  athleteSessionBE:{startAtItem(){},startSquadAtItem(){},endAtItem(){}},
  release:{deviceAccepted:()=>false},
  parser:{parse:(source,{id,course})=>({id,identity:{course},blocks:[{items:[source.includes('400 IM pace')?{raceIntent:{distance:400,eventStroke:'IM',workingStroke:'Butterfly'}}:{repInstructions:[{rep:1,raceIntent:{distance:200}},{rep:2,raceIntent:null,label:'Drill'},{rep:3,raceIntent:{distance:200}},{rep:4,raceIntent:null,label:'Drill'}]}}]}]})},
  access:{
    role:()=>state.settings.activeRole||'owner',
    can:cap=>caps[state.settings.activeRole||'owner']?.has(cap)||false,
    athleteAllowed:a=>state.settings.activeRole==='owner'||(state.settings.activeRole==='swimmer'?a.id===state.settings.activeUserAthleteId:true),
    visibleAthletes(){return state.athletes.filter(a=>a.active!==false&&this.athleteAllowed(a));},
    captureVisible:()=>true
  },
  meet:{ensureState(){state.meetEntries=state.meetEntries||[];state.meetEvidence=state.meetEvidence||[];},current:()=>({id:'m'})},
  guardian:{run:()=>({ok:false,build:'foundation',tests:[
    {name:'Preserved foundation check',ok:true,detail:''},
    {name:'400 IM pace keeps race event separate and refuses a fake leg target',ok:false,detail:'Sex required for Race pace model'},
    {name:'Odd 200 pace / Even Drill only targets odd reps',ok:false,detail:'Sex required for Race pace model'},
    {name:'Engine · Reduced IM keeps the same total team work window',ok:false,detail:'105'}
  ],passed:1,total:4})}
};
global.MSOSEngines={
  RacePace:{forItem:(session,item)=>item.raceIntent?{status:'ok',seconds:38.88,source:'SCM 400 IM PB · Race pace model · 400 IM Butterfly average'}:{status:'rep_race',rows:[{rep:1,status:'ok',seconds:30.664,source:'Race pace model'},{rep:2,status:'none',label:'Drill'},{rep:3,status:'ok',seconds:30.664,source:'Race pace model'},{rep:4,status:'none',label:'Drill'}]}},
  Modification:{adaptItem:item=>({...item,reps:3,distance:100,cycleSeconds:105})}
};
require('../engines/privacy-hardening-bk.js');
require('../engines/release-guardian-bl.js');
const r=M.guardian.run();
assert.equal(M.BUILD,'v4-guardian-runtime-order-20260822bl');
assert.equal(M.RELEASE_ATTESTATION.build,M.BUILD);
assert.equal(r.build,M.BUILD);
assert.equal(r.tests.some(t=>t.name==='Current integration · presence persistence remains connected under current build'&&!t.ok),false);
assert.equal(r.tests.some(t=>t.name==='Current integration · truth-release architecture remains connected and field locked'&&!t.ok),false);
for(const stale of ['400 IM pace keeps race event separate and refuses a fake leg target','Odd 200 pace / Even Drill only targets odd reps','Engine · Reduced IM keeps the same total team work window'])assert.equal(r.tests.some(t=>t.name===stale),false,`stale Guardian survived: ${stale}`);
for(const current of ['Current race model · 400 IM keeps event and working stroke separate','Current race model · Odd 200 pace targets odd reps and leaves Even Drill clean','Current modification · Reduced IM preserves authored send-off'])assert.equal(r.tests.some(t=>t.name===current&&t.ok),true,`current replacement missing: ${current}`);
assert.deepEqual(r.tests.filter(t=>!t.ok),[]);
assert.equal(r.ok,true);
console.log(`PASS guardian-current-runtime-bl · ${r.passed}/${r.total} · stale model checks replaced by current engine truth`);
