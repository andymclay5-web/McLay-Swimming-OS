'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const Aerobic=require('../engines/aerobic.js');global.MSOSEngines.Aerobic=Aerobic;
const RacePace=require('../engines/race-pace.js');global.MSOSEngines.RacePace=RacePace;
const Modification=require('../engines/modification.js');global.MSOSEngines.Modification=Modification;
const Coordinator=require('../engines/coordinator.js');
const cm={id:'cm',full_name:'Charlotte Murphy',sex:'F',squad:'National'};
const ap={id:'ap',full_name:'Amber Proudfoot',sex:'F',squad:'National'};
const cf={id:'cf',full_name:'Conor Fischer',primary_stroke:'Breaststroke',sex:'M',squad:'National'};
const md={id:'md',full_name:'Mackenzie Drage',sex:'F',squad:'National'};
const h={id:'h',full_name:'Henry Test',primary_stroke:'Freestyle',sex:'M',squad:'National'};
const state={athletes:[cm,ap,cf,md,h],adaptationProfiles:[],adaptationOverrides:[],attendance:[],trainingTestTypes:[{id:'tf',test_key:'T400 Freestyle'},{id:'tb',test_key:'T400 Backstroke'},{id:'tbr',test_key:'T400 Breaststroke'}],trainingTestResults:[{athlete_id:'cm',test_type_id:'tf',result_seconds:360,valid_for_anchor:true},{athlete_id:'cm',test_type_id:'tb',result_seconds:562.8,valid_for_anchor:true},{athlete_id:'ap',test_type_id:'tf',result_seconds:300,valid_for_anchor:true},{athlete_id:'cf',test_type_id:'tbr',result_seconds:545.2,valid_for_anchor:true},{athlete_id:'h',test_type_id:'tf',result_seconds:300,valid_for_anchor:true}],resultsPbBoard:[{athlete_id:'cm',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:70,wa_points:500,sex:'F'},{athlete_id:'cf',distance:100,stroke:'Breaststroke',course:'SCM',result_seconds:80,wa_points:500,sex:'M'},{athlete_id:'h',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:60,wa_points:500,sex:'M'}],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[]};
const session={id:'fixture',identity:{course:'SCM',squads:['National']}};
const set=(id,reps,distance,extra={})=>({id,kind:'set',reps,distance,stroke:extra.stroke||'',raw:extra.raw||`${reps} x ${distance}`,text:extra.raw||`${reps} x ${distance}`,cues:extra.cues||[],pattern:extra.pattern||[],repeatBreakdown:extra.repeatBreakdown||null,repeatBreakdownCue:extra.repeatBreakdownCue||'',repPattern:extra.repPattern||[],repInstructions:extra.repInstructions||[],raceIntent:extra.raceIntent||null,zone:extra.zone||'',restSeconds:extra.restSeconds??10,cycleSeconds:extra.cycleSeconds||null,targetSeconds:extra.targetSeconds??null,equipment:extra.equipment||[],composition:extra.composition||[]});

const a400=set('a400',2,400,{stroke:'Freestyle',raw:'2 x 400 Freestyle',repPattern:[{rep:1,zone:'Regeneration'},{rep:2,zone:'Development'}]});
let x=Modification.adaptItem(a400,cm,state,session);assert.equal(x.reps,2);assert.equal(x.distance,200);assert.deepEqual(x.repPattern.map(p=>p.zone),['Regeneration','Development']);
x=Modification.adaptItem(a400,ap,state,session);assert.equal(x.reps,2);assert.equal(x.distance,250);
const mixed500=set('mixed500',1,500,{raw:'500',composition:[{distance:300,text:'Fr'},{distance:200,text:'Reverse IM'}]});x=Modification.adaptItem(mixed500,cm,state,session);assert.equal(x.distance,250);assert.deepEqual(x.composition.map(v=>v.distance),[150,100]);assert.equal(x.composition.reduce((n,v)=>n+v.distance,0),250);x=Modification.adaptItem(mixed500,ap,state,session);assert.equal(x.distance,350);assert.equal(x.composition.reduce((n,v)=>n+v.distance,0),350);
const a100=set('a100',8,100,{stroke:'Freestyle',raw:'8 x 100 Freestyle',repPattern:[1,2,3,4].map(rep=>({rep,zone:'Overload'})).concat([5,6,7,8].map(rep=>({rep,zone:'Threshold'})))});
x=Modification.adaptItem(a100,cm,state,session);assert.equal(x.reps,4);assert.deepEqual(x.repPattern.map(p=>p.zone),['Overload','Overload','Threshold','Threshold']);
x=Modification.adaptItem(a100,ap,state,session);assert.equal(x.reps,5);assert.equal(x.repPattern.length,5);
state.adaptationOverrides=[{sessionId:'fixture',itemId:'a100',athleteId:'cm',active:true,patch:{stroke:'Backstroke'}}];x=Modification.adaptItem(a100,cm,state,session);assert.equal(x.reps,4);assert.equal(x.distance,100);assert.equal(x.stroke,'Backstroke');state.adaptationOverrides=[];

const g1={id:'g1',full_name:'Group One',sex:'M',squad:'National'},g2={id:'g2',full_name:'Group Two',sex:'F',squad:'National'},g3={id:'g3',full_name:'Group Three',sex:'M',squad:'National'},dev={id:'dev',full_name:'Development Outlier',sex:'M',squad:'Development'};
const relAerobic=set('rel-aerobic',8,100,{stroke:'Freestyle',raw:'8 x 100 Freestyle Threshold 10s Rest',zone:'Threshold',restSeconds:10});
const aerobicState={...state,athletes:[md,g1,g2,g3,dev],trainingTestTypes:[{id:'tf',test_key:'T400 Freestyle'}],trainingTestResults:[{athlete_id:g1.id,test_type_id:'tf',stroke:'Freestyle',result_seconds:270,valid_for_anchor:true},{athlete_id:g2.id,test_type_id:'tf',stroke:'Freestyle',result_seconds:280,valid_for_anchor:true},{athlete_id:g3.id,test_type_id:'tf',stroke:'Freestyle',result_seconds:290,valid_for_anchor:true},{athlete_id:dev.id,test_type_id:'tf',stroke:'Freestyle',result_seconds:180,valid_for_anchor:true},{athlete_id:md.id,test_type_id:'tf',stroke:'Freestyle',result_seconds:360,valid_for_anchor:true}]};
let ev=Modification.relativeEvidence(relAerobic,md,aerobicState,session);assert.equal(ev.kind,'t400');assert.equal(ev.referenceCount,3);assert.equal(ev.referenceSeconds,280);assert.equal(ev.athleteSeconds,360);assert.ok(Math.abs(ev.speedFactor-(280/360))<1e-9);assert.match(ev.source,/assigned-squad reference bank/i);
const weakState={...aerobicState,athletes:[md,g1,g2,dev],trainingTestResults:aerobicState.trainingTestResults.filter(r=>r.athlete_id!==g3.id)};ev=Modification.relativeEvidence(relAerobic,md,weakState,session);assert.equal(ev.missingReference,true);assert.equal(ev.referenceCount,2);assert.equal(ev.confidence,'low');

const im=set('im',5,100,{stroke:'IM',raw:'5 x 100 IM @ 1:45',cycleSeconds:105});
const imState={...state,athletes:[cm,md,g1,g2,g3],resultsPbBoard:[...state.resultsPbBoard,{athlete_id:g1.id,distance:100,stroke:'IM',course:'SCM',result_seconds:68},{athlete_id:g2.id,distance:100,stroke:'IM',course:'SCM',result_seconds:70},{athlete_id:g3.id,distance:100,stroke:'IM',course:'SCM',result_seconds:72},{athlete_id:md.id,distance:100,stroke:'IM',course:'SCM',result_seconds:112},{athlete_id:cm.id,distance:100,stroke:'IM',course:'SCM',result_seconds:132}]};
x=Modification.adaptItem(im,md,imState,session);assert.equal(x.distance,100);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,170);assert.match(x.cyclePolicy||'',/performance-relative/i);assert.match(x.raw,/2:50/);assert.equal(x.imPerformancePlan.referenceSeconds,70);assert.equal(x.imPerformancePlan.athleteSeconds,112);assert.equal(x.imPerformancePlan.groupWindowSeconds,525);assert.equal(x.imPerformancePlan.totalSeconds,510);
x=Modification.adaptItem(im,cm,imState,session);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,200);assert.match(x.raw,/3:20/);assert.equal(x.imPerformancePlan.athleteSeconds,132);assert.equal(x.imPerformancePlan.totalSeconds,600);

// With no fair performance comparator, repeated work keeps the authored repeat distance and adjusts total load by reps.
// Distance shortening remains available earlier in the engine when relative evidence shows it is needed to preserve the stimulus.
const timed75=set('timed75',4,75,{raw:'4 x 75 Pull @ 1:45',cycleSeconds:105});x=Modification.adaptItem(timed75,cm,state,session);assert.equal(x.reps,2);assert.equal(x.distance,75);assert.equal(x.cycleSeconds,105);assert.match(x.raw,/2 × 75/);
const timed25=set('timed25',4,25,{raw:'4 x 25 Max @ 0:45',cycleSeconds:45});x=Modification.adaptItem(timed25,cm,state,session);assert.equal(x.reps,4);assert.equal(x.distance,25);assert.equal(x.cycleSeconds,45);

const desc=set('desc',4,100,{raw:'4 x 100 Freestyle Descend 1-4 @ 1:45',cues:['Descend 1-4'],cycleSeconds:105});x=Modification.adaptItem(desc,cm,state,session);assert.equal(x.reps,2);assert.match([x.raw,...x.cues].join(' '),/1 Build \/ 1 Fast/i);assert.deepEqual(x.repInstructions.map(v=>v.label),['Build','Fast']);
const pull=set('pull',3,200,{raw:'3 x 200 Pull',cues:['Descend Stroke Count 1-3']});x=Modification.adaptItem(pull,cm,state,session);assert.equal(x.reps,2);assert.equal(x.distance,200);assert.match(x.cues.join(' '),/Desc SC 1-2/i);assert.doesNotMatch(x.cues.join(' '),/1 Build \/ 1 Fast/i);

const fixedTarget=set('fixed-target',1,200,{stroke:'Freestyle',raw:'200 Freestyle target 2:00',targetSeconds:120,cycleSeconds:150});x=Modification.adaptItem(fixedTarget,cm,state,session);assert.equal(x.distance,100);assert.equal(x.targetMustRecalculate,true);assert.equal(x.targetSeconds,undefined);assert.equal(x.referenceTargetSeconds,120);

const kick=set('kick',5,50,{raw:'5 x 50 Kick Build @ 1:00',cues:['Kick Build'],cycleSeconds:60});x=Modification.adaptItem(kick,cm,state,session);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,135);assert.equal(x.kickCycleRange?.min,130);assert.equal(x.kickCycleRange?.max,140);x=Modification.adaptItem(kick,cf,state,session);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,60);x=Modification.adaptItem(kick,ap,state,session);assert.equal(x.reps,3);assert.equal(x.cycleSeconds,60);assert.equal(x.adaptivePending,true);assert.match(x.raw,/Upper-body choice/i);
const repeat=set('repeat',12,50,{raw:'12 x 50 #1 Stroke',repeatBreakdown:{rounds:4,unitReps:3,unit:[{count:1,text:'Scull'},{count:1,text:'Drill'},{count:1,text:'Swim — Perfect Technique'}]},repeatBreakdownCue:'4 rounds · Scull / Drill / Swim — Perfect Technique',cues:['4 rounds · Scull / Drill / Swim — Perfect Technique']});x=Modification.adaptItem(repeat,cm,state,session);assert.equal(x.reps,6);assert.match(x.repeatBreakdownCue,/^2 rounds · Scull \/ Drill \/ Swim/);x=Modification.adaptItem(repeat,md,state,session);assert.equal(x.reps,8);assert.match(x.repeatBreakdownCue,/^2 rounds · Scull \/ Drill \/ Swim.*\+ Scull \/ Drill/);
const quality=set('q',6,25,{raw:'6 x 25 #1 Stroke @ 1:00',cycleSeconds:60,repInstructions:[{rep:1,label:'Build',raceIntent:null},...Array.from({length:5},(_,i)=>({rep:i+2,label:'100m Race Pace',raceIntent:{distance:100}}))]});x=Modification.adaptItem(quality,cm,state,session);assert.equal(x.reps,6);assert.equal(x.distance,25);

global.MSOS4={state,currentSession:()=>session,util:{clock:s=>`${Math.floor(Number(s||0)/60)}:${String(Math.round(Number(s||0)%60)).padStart(2,'0')}`},amberRatioAP:{evidenceMeasured:item=>Modification.targetDriven(item),independentSkill:item=>Modification.independentSkill(item)}};
require('../engines/amber-alignment-at.js');
const ActiveModification=global.MSOSEngines.Modification;
const s75=set('s75',8,75,{raw:'8 x 75 with Fins 50 technique / 25 fast @ 1:45',cycleSeconds:105,equipment:['Fins']});x=ActiveModification.adaptItem(s75,md,state,session);assert.equal(x.reps,6);assert.equal(x.distance,75);assert.equal(x.cycleSeconds,105);x=ActiveModification.adaptItem(s75,ap,state,session);assert.equal(x.reps,6);assert.equal(x.distance,75);assert.equal(x.cycleSeconds,105);assert.equal(x.adaptivePending,true);assert.match(x.raw,/Upper-body choice/i);
const skill50=set('skill50',4,50,{raw:'4 x 50 Start Turn Finish @ 2:30',cycleSeconds:150});x=ActiveModification.adaptItem(skill50,ap,state,session);assert.equal(x.reps,4);assert.equal(x.distance,50);assert.equal(x.cycleSeconds,150);assert.doesNotMatch(x.raw,/Upper-body/i);

let t=Aerobic.forItem(session,ActiveModification.adaptItem(a400,cm,state,session),cm,state);assert.equal(t.status,'pattern');assert.equal(t.rows.length,2);assert.ok(Number.isFinite(t.rows[0].seconds));
t=Aerobic.forItem(session,a100,cf,state);assert.equal(t.status,'pattern_fallback');assert.ok(t.rows.every(r=>r.hr));

let rp=RacePace.racePace(60,100,50,{item:{raw:'first 50'},athlete:h,stroke:'Freestyle',course:'SCM'});assert.ok(Math.abs(rp.seconds-28.524)<0.001);assert.match(rp.source,/Race pace model/i);
rp=RacePace.racePace(60,100,25,{item:{raw:'race start'},athlete:h,stroke:'Freestyle',course:'SCM'});assert.ok(Number.isFinite(rp.seconds)&&rp.seconds>0);assert.match(rp.source,/Race pace model/i);
const femaleFly={id:'ff',full_name:'Female Fly',sex:'F'};rp=RacePace.racePace(70,100,50,{item:{raw:'second 50'},athlete:femaleFly,stroke:'Butterfly',course:'SCM'});assert.ok(Number.isFinite(rp.seconds)&&rp.seconds>35);assert.match(rp.source,/Race pace model/i);
rp=RacePace.racePace(60,100,50,{item:{raw:'first 50'},athlete:h,stroke:'Freestyle',course:'LCM'});assert.equal(rp.missing,true);assert.match(rp.message,/SCM-only/i);

let r=RacePace.forItem(session,quality,cm,state,'');assert.equal(r.status,'rep_race');assert.ok(r.rows.filter(v=>v.status==='ok').every(v=>v.stroke==='Backstroke'));assert.equal(r.rows.filter(v=>v.status==='ok').length,5);assert.ok(r.rows.filter(v=>v.status==='ok').every(v=>/Race pace model/i.test(v.source)));
r=RacePace.forItem(session,quality,cf,state,'');assert.ok(r.rows.filter(v=>v.status==='ok').every(v=>v.stroke==='Breaststroke'));assert.ok(r.rows.filter(v=>v.status==='ok').every(v=>/Race pace model/i.test(v.source)));
const p=Coordinator.prescription(session,a100,cm,state);assert.equal(p.item.reps,4);assert.equal(p.target.status,'pattern');
const recalc=Coordinator.prescription(session,fixedTarget,cm,state);assert.equal(recalc.item.distance,100);assert.notEqual(recalc.target.source,'Coach target');

const board=fs.readFileSync(require.resolve('../engines/board.js'),'utf8');assert.match(board,/msos-mod-target/);assert.match(board,/function modified\(/);assert.match(board,/data-msos-ath/);assert.doesNotMatch(board,/host\.className='view active msos-whiteboard-engine'/);
const navigation=fs.readFileSync(require.resolve('../engines/navigation.js'),'utf8');assert.match(navigation,/bottom-nav \[data-nav\]/);assert.match(navigation,/N\.show=V\.go/);
const capture=fs.readFileSync(require.resolve('../engines/capture-ui.js'),'utf8');assert.match(capture,/Show squad/);assert.match(capture,/Here now/);
const storage=fs.readFileSync(require.resolve('../engines/storage.js'),'utf8');assert.match(storage,/IndexedDB|indexedDB/);assert.match(storage,/compactAfter:true/);assert.match(storage,/M\.store\.save=state=>/);
console.log('ENGINE_ACCEPTANCE_PASS');
