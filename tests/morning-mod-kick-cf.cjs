'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Aerobic=Aerobic;
const Modification=require('../engines/modification.js');
global.MSOSEngines.Modification=Modification;

const cm={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
const md={id:'md',full_name:'McKenzie Drage',squad:'National'};
const normal={id:'n1',full_name:'Test Medley',squad:'National'};
const session={id:'morning-cf',identity:{course:'SCM',squads:['National']},blocks:[]};
const state={athletes:[cm,md,normal],adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:7/12},{athlete_id:'md',active:true,default_volume_ratio:2/3}],adaptationOverrides:[],attendance:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};
const set=(id,reps,distance,raw,cycleSeconds,cues=[],stroke='')=>({id,kind:'set',reps,distance,raw,text:raw,cycleSeconds,cues,stroke,pattern:[],repPattern:[],repInstructions:[],equipment:/\bfins?\b/i.test(raw)?['Fins']:[]});

global.MSOS4={state,currentSession:()=>session,ui:{presentAthletes:()=>[cm,md,normal]},util:{uid:()=>`mod-${Date.now()}`},store:{save(){}},cloud:{stageAdaptationsForSession(){}},performanceEngine:{selectStrokeForContext(ath){return{stroke:ath.id==='n1'?'Backstroke':'Freestyle',source:'highest ranked PB'}}}};
require('../engines/contract-fixes-al.js');
const F=global.MSOS4.contractFixesAL;
const apply=(item,ath)=>{const patch=F.rulePatchFor(item,ath,state,session);assert.ok(patch,`expected rule patch for ${item.id} / ${ath.id}`);state.adaptationOverrides=state.adaptationOverrides.filter(r=>!(r.sessionId===session.id&&r.itemId===item.id&&r.athleteId===ath.id));state.adaptationOverrides.push({id:`ov-${item.id}-${ath.id}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,active:true,patch,source:'coach-confirmed-morning-cf'});return Modification.adaptItem(item,ath,state,session);};

const kick100=set('kick100',12,100,'12 x 100 Kick @ 2:10',130,['Descend 1-3']);
let x=apply(kick100,cm);
assert.equal(x.reps,6);assert.equal(x.cycleSeconds,270);assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-3/i);assert.doesNotMatch([x.raw,...x.cues].join(' '),/1-4\s*\/\s*5-/i);
x=apply(kick100,md);
assert.equal(x.reps,8);assert.equal(x.cycleSeconds,225);assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-4/i);

const fins200=set('fins200',4,200,'4 x 200 Fins Kick @ 3:30',210,['Descend 1-4']);
x=apply(fins200,cm);assert.equal(x.reps,2);assert.equal(x.cycleSeconds,330);assert.match([x.raw,...x.cues].join(' '),/1 Build \/ 1 Fast/i);
x=apply(fins200,md);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,270);assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-3/i);

const underwater=set('underwater',8,25,'8 x 25 @ 0:45 · 15m Underwater MAX',45);
x=apply(underwater,cm);assert.equal(x.reps,6);assert.equal(x.cycleSeconds,60);
assert.equal(F.rulePatchFor(underwater,md,state,session),null,'McKenzie keeps full underwater exposure');

const maxKick=set('max-kick',8,25,'8 x 25 Kick MAX @ 1:00',60);
const maxPatch=F.rulePatchFor(maxKick,cm,state,session);assert.equal(maxPatch.reps,undefined,'short MAX kick must not reduce reps');assert.equal(maxPatch.cycleSeconds,undefined,'short MAX kick must keep authored cycle');

const generic=set('generic-kick',6,50,'6 x 50 Kick @ 1:10',70);
const gp=F.rulePatchFor(generic,normal,state,session);assert.equal(gp.stroke,'Backstroke','plain Kick resolves to swimmer #1/context stroke');assert.equal(F.strokeAssignmentIntent(generic),true);
x=apply(generic,normal);assert.equal(x.stroke,'Backstroke');

const explicit=set('free-kick',6,50,'6 x 50 Freestyle Kick @ 1:10',70,[],'Freestyle');
const ep=F.rulePatchFor(explicit,normal,state,session);assert.equal(ep.stroke,'Freestyle');x=apply(explicit,normal);assert.equal(x.stroke,'Freestyle');

state.adaptationOverrides=[{id:'coach',sessionId:session.id,itemId:generic.id,athleteId:normal.id,active:true,source:'coach-poolside',patch:{stroke:'Butterfly'}}];
x=Modification.adaptItem(generic,normal,state,session);assert.equal(x.stroke,'Butterfly','coach override wins');

assert.equal(F.descentFor(6,3),'Desc 1-3');assert.equal(F.descentFor(8,3),'Desc 1-4');assert.equal(F.descentFor(2,4),'1 Build / 1 Fast');
console.log('MORNING_MOD_KICK_CF_PASS');
