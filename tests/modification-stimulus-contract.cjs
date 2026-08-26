'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Aerobic=Aerobic;
const Modification=require('../engines/modification.js');

const cm={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
const md={id:'md',full_name:'McKenzie Drage',squad:'National'};
const ap={id:'ap',full_name:'Amber Proudfoot',squad:'National'};
const session={id:'stimulus-contract',identity:{course:'SCM',squads:['National']}};
const baseState={athletes:[cm,md,ap],adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};
const set=(id,reps,distance,extra={})=>({id,kind:'set',reps,distance,stroke:extra.stroke||'',raw:extra.raw||`${reps} x ${distance}`,text:extra.raw||`${reps} x ${distance}`,cues:extra.cues||[],pattern:extra.pattern||[],repPattern:extra.repPattern||[],repInstructions:extra.repInstructions||[],raceIntent:extra.raceIntent||null,zone:extra.zone||'',restSeconds:extra.restSeconds??10,cycleSeconds:extra.cycleSeconds||null,equipment:extra.equipment||[],composition:extra.composition||[]});

const friday=set('friday',8,25,{raw:'8 x 25 @ 1:30',cycleSeconds:90,pattern:[{count:4,text:'#1 Build'},{count:4,text:'#1 Max'}]});
let x=Modification.adaptItem(friday,cm,baseState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,25);
assert.equal(x.cycleSeconds,90);

const noCycleQuality=set('no-cycle-quality',8,25,{raw:'8 x 25 MAX @ 1:00'});
x=Modification.adaptItem(noCycleQuality,cm,baseState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,25);
assert.match(x.adaptationReason||'',/same team exposure/i);

const maxKick25=set('max-kick-25',8,25,{raw:'8 x 25 Kick @ 1:00 MAX',cycleSeconds:60});
for(const ath of [cm,md]){
  x=Modification.adaptItem(maxKick25,ath,baseState,session);
  assert.equal(x.reps,8,`${ath.full_name} should keep all 8 short MAX kick reps`);
  assert.equal(x.distance,25);
  assert.equal(x.cycleSeconds,60);
  assert.match(x.adaptationReason||'',/same team exposure|common interval/i);
}

const evidenceTrapState={...baseState,resultsPbBoard:[{athlete_id:'cm',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:65}],trainingTestTypes:[{id:'tf',test_key:'T400 Freestyle'}],trainingTestResults:[{athlete_id:'cm',test_type_id:'tf',result_seconds:300,valid_for_anchor:true}]};
assert.equal(Modification.relativeEvidence(set('kick-evidence-trap',12,100,{stroke:'Freestyle',raw:'12 x 100 Freestyle Kick @ 2:10',cycleSeconds:130}),cm,evidenceTrapState,session),null);

const kick100=set('kick100',12,100,{raw:'12 x 100 Kick @ 2:10',cues:['Descend 1-3'],cycleSeconds:130});
const phoneKickState={...baseState,adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:7/12},{athlete_id:'md',active:true,default_volume_ratio:2/3}]};
x=Modification.adaptItem(kick100,cm,phoneKickState,session);
assert.equal(x.reps,7);
assert.equal(x.distance,100);
assert.equal(x.cycleSeconds,225);
assert.match([x.raw,...x.cues].join(' '),/Desc 1-4 \/ 5-7/i);
assert.equal(x.kickTimingPlan?.groupWindowSeconds,1560);
x=Modification.adaptItem(kick100,md,phoneKickState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,100);
assert.equal(x.cycleSeconds,195);
assert.match([x.raw,...x.cues].join(' '),/Desc 1-4 \/ 5-8/i);
assert.equal(x.kickTimingPlan?.groupWindowSeconds,1560);

const fins200=set('fins200',4,200,{raw:'4 x 200 Fins Kick @ 3:30',cues:['Descend 1-4'],cycleSeconds:210,equipment:['Fins']});
x=Modification.adaptItem(fins200,cm,baseState,session);
assert.equal(x.reps,2);
assert.equal(x.distance,200);
assert.equal(x.cycleSeconds,420);
assert.match([x.raw,...x.cues].join(' '),/1 Build \/ 1 Fast/i);
x=Modification.adaptItem(fins200,md,baseState,session);
assert.equal(x.reps,3);
assert.equal(x.distance,200);
assert.equal(x.cycleSeconds,280);
assert.match([x.raw,...x.cues].join(' '),/Desc 1-3/i);

const im=set('im',5,100,{stroke:'IM',raw:'5 x 100 IM @ 1:45',cycleSeconds:105});
x=Modification.adaptItem(im,cm,baseState,session);
assert.equal(x.distance,100);
assert.equal(x.reps,3);
assert.equal(x.cycleSeconds,175);
assert.match(x.adaptationReason||'',/complete IM units.*squad set window/i);

const fast75=set('fast75',4,75,{raw:'4 x 75 #1 Fast @ 1:30',cycleSeconds:90});
x=Modification.adaptItem(fast75,md,baseState,session);
assert.ok([50,75].includes(Number(x.distance)),JSON.stringify(x));
assert.ok(Number(x.reps)*Number(x.distance)>=150&&Number(x.reps)*Number(x.distance)<=225,JSON.stringify(x));
assert.equal((Number(x.reps)*Number(x.distance))%50,0,'modified 75 work should return to the starting end in SCM');
assert.notEqual(Number(x.cycleSeconds),115,'1:55 must not be a hard-coded McKenzie minimum');
if(Number(x.distance)!==75)assert.equal(x.targetMustRecalculate,false,'non-target 75 distance change must not invent a target');

const amber75=set('amber75',8,75,{stroke:'Choice',raw:'8 x 75 with Fins 50 technique / 25 fast',equipment:['Fins']});
x=Modification.adaptItem(amber75,ap,baseState,session);
const amberMetres=Number(x.reps)*Number(x.distance);
assert.ok(amberMetres>=350&&amberMetres<=450,JSON.stringify(x));
assert.equal(amberMetres%50,0,'Amber modified work must return to the starting end in SCM');
assert.match(x.raw,/Upper-body/i);

const mixed=set('mixed',2,400,{stroke:'Freestyle',raw:'2 x 400 Freestyle',repPattern:[{rep:1,zone:'Regeneration'},{rep:2,zone:'Development'}]});
x=Modification.adaptItem(mixed,cm,baseState,session);
assert.equal(x.repPattern.length,2);
assert.deepEqual(x.repPattern.map(r=>r.zone),['Regeneration','Development']);
assert.equal(x.distance,200);

x=Modification.adaptItem(mixed,md,baseState,session);
assert.equal(x.reps,2);
assert.equal(x.distance,275);
assert.deepEqual(x.repPattern.map(r=>r.zone),['Regeneration','Development']);
const mixedTimed={...mixed,id:'mixed-timed',raw:'2 x 400 Freestyle @ 5:00',text:'2 x 400 Freestyle @ 5:00',cycleSeconds:300};
x=Modification.adaptItem(mixedTimed,md,baseState,session);
assert.equal(x.reps,2);
assert.equal(x.distance,250);
assert.equal(x.cycleSeconds,300);
assert.deepEqual(x.repPattern.map(r=>r.zone),['Regeneration','Development']);

const twelve=set('twelve',12,50,{raw:'12 x 50 Choice'});
const override={id:'ov',sessionId:session.id,itemId:twelve.id,athleteId:cm.id,active:true,patch:{reps:12}};
x=Modification.adaptItem(twelve,cm,{...baseState,adaptationOverrides:[override]},session);
assert.equal(x.reps,12);
x=Modification.adaptItem(twelve,cm,{...baseState,adaptationOverrides:[{...override,active:false}]},session);
assert.equal(x.reps,6);

console.log('MODIFICATION_STIMULUS_CONTRACT_PASS');
