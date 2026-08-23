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

// Pattern text is coaching intent. Build/Max must be recognised as short quality work.
const friday=set('friday',8,25,{raw:'8 x 25 @ 1:30',cycleSeconds:90,pattern:[{count:4,text:'#1 Build'},{count:4,text:'#1 Max'}]});
let x=Modification.adaptItem(friday,cm,baseState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,25);
assert.equal(x.cycleSeconds,90);

// A raw short-quality line with no parsed cycle still remains same-team exposure; Guardian must not depend on a cycle field just to recognise the coaching intent.
const noCycleQuality=set('no-cycle-quality',8,25,{raw:'8 x 25 MAX @ 1:00'});
x=Modification.adaptItem(noCycleQuality,cm,baseState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,25);
assert.match(x.adaptationReason||'',/same team exposure/i);

// Short MAX kick on a common safe interval stays full-team work. Do not ratio-cut every 25 just because the swimmer has a modified load profile.
const maxKick25=set('max-kick-25',8,25,{raw:'8 x 25 Kick @ 1:00 MAX',cycleSeconds:60});
for(const ath of [cm,md]){
  x=Modification.adaptItem(maxKick25,ath,baseState,session);
  assert.equal(x.reps,8,`${ath.full_name} should keep all 8 short MAX kick reps`);
  assert.equal(x.distance,25);
  assert.equal(x.cycleSeconds,60);
  assert.match(x.adaptationReason||'',/same team exposure|common interval/i);
}

// Kick is not swimming-PB/T400 evidence. If no real kick-speed anchor exists, the kick owner must not borrow unrelated swimming speed.
const evidenceTrapState={...baseState,resultsPbBoard:[{athlete_id:'cm',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:65}],trainingTestTypes:[{id:'tf',test_key:'T400 Freestyle'}],trainingTestResults:[{athlete_id:'cm',test_type_id:'tf',result_seconds:300,valid_for_anchor:true}]};
assert.equal(Modification.relativeEvidence(set('kick-evidence-trap',12,100,{stroke:'Freestyle',raw:'12 x 100 Freestyle Kick @ 2:10',cycleSeconds:130}),cm,evidenceTrapState,session),null);

// A reduced long timed kick set keeps the authored repeat distance, but its individual interval must spread the delivered reps across the squad set window.
// Descents are regenerated from the actual delivered rep count, not left as stale Desc 1-3 text.
const kick100=set('kick100',12,100,{raw:'12 x 100 Kick @ 2:10',cues:['Descend 1-3'],cycleSeconds:130});
const phoneKickState={...baseState,adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:7/12},{athlete_id:'md',active:true,default_volume_ratio:2/3}]};
x=Modification.adaptItem(kick100,cm,phoneKickState,session);
assert.equal(x.reps,7);
assert.equal(x.distance,100);
assert.equal(x.cycleSeconds,225); // 12 x 2:10 squad window -> 7 starts ≈ 3:45
assert.match([x.raw,...x.cues].join(' '),/Desc 1-4 \/ 5-7/i);
assert.equal(x.kickTimingPlan?.groupWindowSeconds,1560);
x=Modification.adaptItem(kick100,md,phoneKickState,session);
assert.equal(x.reps,8);
assert.equal(x.distance,100);
assert.equal(x.cycleSeconds,195); // 3:15
assert.match([x.raw,...x.cues].join(' '),/Desc 1-4 \/ 5-8/i);
assert.equal(x.kickTimingPlan?.groupWindowSeconds,1560);

// Same rule for long fins kick: do not leave a slower modified swimmer on the squad 3:30 after cutting reps.
const fins200=set('fins200',4,200,{raw:'4 x 200 Fins Kick @ 3:30',cues:['Descend 1-4'],cycleSeconds:210,equipment:['Fins']});
x=Modification.adaptItem(fins200,cm,baseState,session);
assert.equal(x.reps,2);
assert.equal(x.distance,200);
assert.equal(x.cycleSeconds,420); // 7:00 keeps the 14-minute squad window
assert.match([x.raw,...x.cues].join(' '),/1 Build \/ 1 Fast/i);
x=Modification.adaptItem(fins200,md,baseState,session);
assert.equal(x.reps,3);
assert.equal(x.distance,200);
assert.equal(x.cycleSeconds,280); // 4:40
assert.match([x.raw,...x.cues].join(' '),/Desc 1-3/i);

// IM stays in complete IM units when there is no fair comparator. Missing evidence is not permission to turn 100 IM into 50 IM.
const im=set('im',5,100,{stroke:'IM',raw:'5 x 100 IM @ 1:45',cycleSeconds:105});
x=Modification.adaptItem(im,cm,baseState,session);
assert.equal(x.distance,100);
assert.equal(x.reps,3);
assert.equal(x.cycleSeconds,105);
assert.match(x.adaptationReason||'',/complete IM units/i);

// A 75 may stay 75 or become 50 if that is the safer way to preserve the intended load/stimulus.
// The old McKenzie-specific 1:55 minimum is not a hard rule: current interval/stimulus logic owns the decision.
const fast75=set('fast75',4,75,{raw:'4 x 75 #1 Fast @ 1:30',cycleSeconds:90});
x=Modification.adaptItem(fast75,md,baseState,session);
assert.ok([50,75].includes(Number(x.distance)),JSON.stringify(x));
assert.ok(Number(x.reps)*Number(x.distance)>=150&&Number(x.reps)*Number(x.distance)<=225,JSON.stringify(x));
assert.equal((Number(x.reps)*Number(x.distance))%50,0,'modified 75 work should return to the starting end in SCM');
assert.notEqual(Number(x.cycleSeconds),115,'1:55 must not be a hard-coded McKenzie minimum');
if(Number(x.distance)!==75)assert.equal(x.targetMustRecalculate,false,'non-target 75 distance change must not invent a target');

// Amber uses the same stimulus/load owner before the upper-body constraint is presented.
const amber75=set('amber75',8,75,{stroke:'Choice',raw:'8 x 75 with Fins 50 technique / 25 fast',equipment:['Fins']});
x=Modification.adaptItem(amber75,ap,baseState,session);
const amberMetres=Number(x.reps)*Number(x.distance);
assert.ok(amberMetres>=350&&amberMetres<=450,JSON.stringify(x));
assert.equal(amberMetres%50,0,'Amber modified work must return to the starting end in SCM');
assert.match(x.raw,/Upper-body/i);

// Mixed-zone aerobic work retains the authored phases even when the individual work distance changes.
const mixed=set('mixed',2,400,{stroke:'Freestyle',raw:'2 x 400 Freestyle',repPattern:[{rep:1,zone:'Regeneration'},{rep:2,zone:'Development'}]});
x=Modification.adaptItem(mixed,cm,baseState,session);
assert.equal(x.repPattern.length,2);
assert.deepEqual(x.repPattern.map(r=>r.zone),['Regeneration','Development']);
assert.equal(x.distance,200);

// Without an authored interval McKenzie can stay closer to the load target; once a common cycle exists, pool-end/group rhythm may supersede the exact ratio.
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

// Coach shape override wins while active; deactivating it immediately returns to current automatic truth.
const twelve=set('twelve',12,50,{raw:'12 x 50 Choice'});
const override={id:'ov',sessionId:session.id,itemId:twelve.id,athleteId:cm.id,active:true,patch:{reps:12}};
x=Modification.adaptItem(twelve,cm,{...baseState,adaptationOverrides:[override]},session);
assert.equal(x.reps,12);
x=Modification.adaptItem(twelve,cm,{...baseState,adaptationOverrides:[{...override,active:false}]},session);
assert.equal(x.reps,6);

console.log('MODIFICATION_STIMULUS_CONTRACT_PASS');
