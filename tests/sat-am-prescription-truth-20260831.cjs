'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
global.MSOS4={performanceEngine:{selectStrokeForContext(ath,item){if(ath?.full_name==='Charlotte Murphy'&&/#\s*1/i.test(String(item?.raw||'')))return{stroke:'Backstroke',source:'test context'};return{stroke:'Freestyle',source:'test context'};}}};
const Aerobic=require('../engines/aerobic.js');global.MSOSEngines.Aerobic=Aerobic;
const RacePace=require('../engines/race-pace.js');global.MSOSEngines.RacePace=RacePace;
const Modification=require('../engines/modification.js');global.MSOSEngines.Modification=Modification;
const TrainingPolicy=require('../engines/training-prescription-policy.js');global.MSOSEngines.TrainingPolicy=TrainingPolicy;
const RaceTargetIntent=require('../engines/race-target-intent.js');global.MSOSEngines.RaceTargetIntent=RaceTargetIntent;
const Coordinator=require('../engines/coordinator.js');

const session={id:'sat-am',identity:{course:'SCM',squads:['National']}};
const charlotte={id:'cm',full_name:'Charlotte Murphy',squad:'National',sex:'F'};
const mckenzie={id:'md',full_name:'McKenzie Drage',squad:'National',sex:'F'};
const state={
  athletes:[charlotte,mckenzie],settings:{storageRevision:1},adaptationProfiles:[],adaptationOverrides:[],
  trainingTestTypes:[{id:'tf',test_key:'T400 Freestyle'}],
  trainingTestResults:[
    {id:'cm-t400',athlete_id:'cm',test_type_id:'tf',result_seconds:540,result_date:'2026-08-20',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'},
    {id:'md-old',athlete_id:'md',test_type_id:'tf',result_seconds:441,result_date:'2026-03-01',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'},
    {id:'md-current',athlete_id:'md',test_type_id:'tf',result_seconds:480,result_date:'2026-08-20',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}
  ],resultsPbBoard:[
    {athlete_id:'cm',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:120},
    {athlete_id:'cm',distance:200,stroke:'Backstroke',course:'SCM',result_seconds:260},
    {athlete_id:'md',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:100}
  ],resultsEventHistory:[],coachResults:[]
};

function set(id,reps,distance,extra={}){return{id,kind:'set',reps,distance,stroke:extra.stroke||'Freestyle',raw:extra.raw||`${reps} x ${distance}`,text:extra.text||extra.raw||`${reps} x ${distance}`,instruction:extra.instruction||'',cues:extra.cues||[],repPattern:extra.repPattern||[],repInstructions:extra.repInstructions||[],raceIntent:extra.raceIntent||null,zone:extra.zone||'',restSeconds:extra.restSeconds??null,cycleSeconds:extra.cycleSeconds??null,equipment:[]};}

// Exact Saturday aerobic shape: delivered distance owns the target, not the parent 400.
const aerobic=set('aero',2,400,{raw:'2 x 400 Freestyle',cues:['#1 Regeneration','#2 Development','10 seconds rest'],repPattern:[{rep:1,zone:'Regeneration'},{rep:2,zone:'Development'}],restSeconds:10});
state.adaptationOverrides.push({id:'cm-aero',sessionId:'sat-am',itemId:'aero',athleteId:'cm',active:true,patch:{reps:2,distance:200}});
state.adaptationOverrides.push({id:'md-aero',sessionId:'sat-am',itemId:'aero',athleteId:'md',active:true,patch:{reps:2,distance:250}});
let p=Coordinator.prescription(session,aerobic,charlotte,state);
assert.equal(p.item.distance,200);assert.equal(p.target.status,'pattern');
assert.ok(Math.abs(p.target.rows[0].seconds-307.935)<.02,`Charlotte 200 REG should be recalculated from 9:00 T400, got ${p.target.rows[0].seconds}`);
p=Coordinator.prescription(session,aerobic,mckenzie,state);
assert.equal(p.item.distance,250);assert.equal(p.target.status,'pattern');
assert.ok(Math.abs(p.target.rows[0].seconds-346.8)<.02,`McKenzie 250 REG should use current 8:00 T400, got ${p.target.rows[0].seconds}`);
assert.match(p.target.source||'',/8:00|8:00\.0/,'current T400 must be the source');

// McKenzie kick: modification.js keeps her coach-authored cycle; TrainingPolicy must not
// invent a ratio-derived floor on top of it, and the displayed cue must still agree with it.
const kick=set('kick',5,50,{stroke:'Freestyle',raw:'5 x 50 Kick Build @ 1:00',cues:['Kick Build @ 1:00'],cycleSeconds:60});
p=Coordinator.prescription(session,kick,mckenzie,state);
assert.equal(p.item.cycleSeconds,60,'McKenzie 50 kick must keep the coach-authored cycle, not a ratio-derived floor');assert.match(p.item.raw,/@ 1:00/);assert.match(p.item.cues.join(' '),/@ 1:00/);

// Longer coach-authored race-pace recovery is authoritative once it already clears the floor.
const rpLong=set('rp-long',4,50,{stroke:'#1 Stroke',raw:'4 x 50 #1 Stroke @ 2:30',cues:['#1 Build','#2-4 @ 100m Race Pace'],cycleSeconds:150,repInstructions:[{rep:1,label:'Build',raceIntent:null},{rep:2,label:'100m Race Pace',raceIntent:{distance:100}},{rep:3,label:'100m Race Pace',raceIntent:{distance:100}},{rep:4,label:'100m Race Pace',raceIntent:{distance:100}}]});
p=Coordinator.prescription(session,rpLong,charlotte,state);
assert.equal(p.item.stroke,'Backstroke','#1 stroke must remain Charlotte Backstroke through the modified prescription');
assert.equal(p.item.cycleSeconds,150,'authored 2:30 must not be shortened');

// Unsafe short 100-pace cycle lengthens to protect comparable work:rest.
const rpShort=set('rp-short',6,25,{stroke:'#1 Stroke',raw:'6 x 25 #1 Stroke @ 1:00',cues:['#1 Build','#2-6 @ 100m Race Pace'],cycleSeconds:60,repInstructions:[{rep:1,label:'Build',raceIntent:null},...Array.from({length:5},(_,i)=>({rep:i+2,label:'100m Race Pace',raceIntent:{distance:100}}))]});
p=Coordinator.prescription(session,rpShort,charlotte,state);
assert.equal(p.item.stroke,'Backstroke');assert.ok(p.item.cycleSeconds>=90);assert.match(p.item.raw,/@ 1:30|@ 1:35|@ 1:40|@ 1:45|@ 1:50|@ 1:55|@ 2:00/);

// Explicit coach language "Second 100 of 200 Race" must target that segment, not the whole 200 PB.
const second100=set('second-100',1,100,{stroke:'#1 Stroke',raw:'1 x 100 #1 Stroke MAX',instruction:'Target: Second 100 of 200 Race. Finish strong under pressure.',cues:['Target: Second 100 of 200 Race','Finish strong under pressure']});
p=Coordinator.prescription(session,second100,charlotte,state);
assert.equal(p.item.stroke,'Backstroke');assert.equal(p.item.raceIntent?.distance,200);assert.equal(p.target.status,'ok');
assert.ok(p.target.seconds>125&&p.target.seconds<140,`second 100 of a 4:20 200 Back should be a second-100 segment, got ${p.target.seconds}`);
assert.ok(p.target.seconds<200,'second-100 target must not expose the whole 200 event time');
assert.match(p.target.source||'',/race pace model/i);

console.log('SAT_AM_PRESCRIPTION_TRUTH_PASS modified-distance-aerobic current-T400 kick-display authored-cycle #1-stroke race-pace-floor second-100-segment');
