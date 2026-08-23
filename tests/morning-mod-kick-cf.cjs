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
const session={id:'morning-cf',identity:{course:'SCM',squads:['National']}};
const state={athletes:[cm,md,normal],adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:7/12},{athlete_id:'md',active:true,default_volume_ratio:2/3}],adaptationOverrides:[],attendance:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};
const set=(id,reps,distance,raw,cycleSeconds,cues=[],stroke='')=>({id,kind:'set',reps,distance,raw,text:raw,cycleSeconds,cues,stroke,pattern:[],repPattern:[],repInstructions:[],equipment:/\bfins?\b/i.test(raw)?['Fins']:[]});

global.MSOS4={
  state,
  currentSession:()=>session,
  ui:{presentAthletes:()=>[cm,md,normal]},
  util:{uid:()=>`mod-${Date.now()}`},
  store:{save(){}},cloud:{stageAdaptationsForSession(){}},
  performanceEngine:{selectStrokeForContext(ath){return{stroke:ath.id==='n1'?'Backstroke':'Freestyle',source:'highest ranked PB'}}}
};
require('../engines/contract-fixes-al.js');
const F=global.MSOS4.contractFixesAL;

const kick100=set('kick100',12,100,'12 x 100 Kick @ 2:10',130,['Descend 1-3']);
let x=Modification.adaptItem(kick100,cm,state,session);
assert.equal(x.reps,6,'Charlotte 12x100 kick should become 6x100');
assert.equal(x.cycleSeconds,270,'Charlotte 100 kick should be on 4:30');
assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-3/i,'Charlotte should keep 1-3 descend pattern');
assert.doesNotMatch([x.raw,...x.cues].join(' '),/1-4\s*\/\s*5-/i,'split artificial descend must be gone');

x=Modification.adaptItem(kick100,md,state,session);
assert.equal(x.reps,8,'McKenzie 12x100 kick should become 8x100');
assert.equal(x.cycleSeconds,225,'McKenzie 100 kick should be on 3:45');
assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-4/i,'8 reps should resolve to descend 1-4');

const fins200=set('fins200',4,200,'4 x 200 Fins Kick @ 3:30',210,['Descend 1-4']);
x=Modification.adaptItem(fins200,cm,state,session);
assert.equal(x.reps,2);assert.equal(x.cycleSeconds,330,'Charlotte fins 200 kick should be on 5:30');
assert.match([x.raw,...x.cues].join(' '),/1 Build \/ 1 Fast/i);
x=Modification.adaptItem(fins200,md,state,session);
assert.equal(x.reps,3);assert.equal(x.cycleSeconds,270,'McKenzie fins 200 kick should be on 4:30');
assert.match([x.raw,...x.cues].join(' '),/Desc(?:end)? 1-3/i);

const underwater=set('underwater',8,25,'8 x 25 @ 0:45 · 15m Underwater MAX',45);
x=Modification.adaptItem(underwater,cm,state,session);
assert.equal(x.reps,6,'Charlotte underwater should be 6 reps');
assert.equal(x.cycleSeconds,60,'Charlotte underwater should be on 1:00');
x=Modification.adaptItem(underwater,md,state,session);
assert.equal(x.reps,8,'McKenzie keeps full underwater exposure');
assert.equal(x.cycleSeconds,45);

const maxKick=set('max-kick',8,25,'8 x 25 Kick MAX @ 1:00',60);
x=Modification.adaptItem(maxKick,cm,state,session);
assert.equal(x.reps,8,'short MAX kick stays full team exposure');assert.equal(x.cycleSeconds,60);

const generic=set('generic-kick',6,50,'6 x 50 Kick @ 1:10',70);
x=Modification.adaptItem(generic,normal,state,session);
assert.equal(x.stroke,'Backstroke','plain Kick must resolve as swimmer #1/context stroke');
assert.equal(x.strokePolicy,'number1');
assert.equal(x.numberOneStroke,true);
assert.equal(F.strokeAssignmentIntent(generic),true,'plain kick should surface stroke assignment controls');

const explicit=set('free-kick',6,50,'6 x 50 Freestyle Kick @ 1:10',70,[],'Freestyle');
x=Modification.adaptItem(explicit,normal,state,session);
assert.equal(x.stroke,'Freestyle','explicit Freestyle kick must remain Freestyle by default');
assert.equal(x.strokePolicy,'authored');

state.adaptationOverrides=[{id:'ov',sessionId:session.id,itemId:generic.id,athleteId:normal.id,active:true,patch:{stroke:'Butterfly'}}];
x=Modification.adaptItem(generic,normal,state,session);
assert.equal(x.stroke,'Butterfly','poolside stroke override must beat #1 default');
assert.equal(x.strokePolicy,'coach');

assert.equal(F.descentFor(6,3),'Desc 1-3');
assert.equal(F.descentFor(8,3),'Desc 1-4');
assert.equal(F.descentFor(2,4),'1 Build / 1 Fast');
console.log('MORNING_MOD_KICK_CF_PASS');
