'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Board=require('../engines/board-projection.js');
const Capture=require('../engines/capture-evidence.js');

const src=`TUESDAY AM — AEROBIC CAPACITY / REGENERATION

WARM UP
4 x 300
200 Free
100 Reverse IM
15s Rest

PRE-SET
4 Rounds:
3 x 50 #1 @ 1:00
2 Drill
1 @ 200 Pace

12 x 50 Total

MAIN SET
400 Pull
Minimum Stroke Count

6 x 100 Freestyle Development
10s Rest

400 Paddles Only
Minimum Stroke Count

3 x 200 Development
10s Rest

4 x 100 IM Descend 1–4
@ 1:40 / 1:50

2 x 100 Paddles + Fins @ 2:00
1 Build
1 Fast

POST-SET
16 x 50 @ 1:15
8 x 50 Bands Only
4 Build
4 Descend 1–4
8 x 50 Swim
Descend 1–4 twice
#4 + #8 @ 100 Pace

WARM DOWN
200 Easy Choice

TOTAL: 5,400m`;
const identity={id:'2026-08-18-am-national-development',date:'2026-08-18',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',squads:['National','Development'],title:'Tuesday AM — Aerobic Capacity / Regeneration'};
let tick=0;const clock=()=>`2026-08-18T05:${String(20+Math.floor(tick/60)).padStart(2,'0')}:${String(tick++%60).padStart(2,'0')}+12:00`;

const canonical=Truth.parse(src,identity);
assert.equal(Truth.validate(canonical).ok,true);
assert.equal(Truth.totalDistance(canonical),5400);

const lifecycleStorage=new Lifecycle.MemoryStorage();
const lifecycle=Lifecycle.create({storage:lifecycleStorage,clock});
lifecycle.createDraft({id:'morning-draft',identity,source:src,inputMode:'text'});
lifecycle.createFromDraft('morning-draft',canonical);
assert.equal(lifecycle.selectedId(),identity.id);
assert.equal(Truth.totalDistance(lifecycle.selected().current),5400);

const evidence=Evidence.create({sources:[{id:'verified-current',priority:100,trust:'verified',data:{
 athletes:[
  {id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},
  {id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'},
  {id:'std',full_name:'Standard Swimmer',squad:'Development',active:true,sex:'M'},
  {id:'not-here',full_name:'Not Here Swimmer',squad:'Development',active:true,sex:'F'}
 ],
 training_test_types:[{id:'tt-free',test_key:'t400_freestyle'}],
 training_test_results:[
  {id:'mk-t400',athlete_id:'mk',test_type_id:'tt-free',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
  {id:'molly-t400',athlete_id:'molly',test_type_id:'tt-free',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},
  {id:'std-t400',athlete_id:'std',test_type_id:'tt-free',result_seconds:300,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}
 ],
 coach_results:[
  {id:'mk100',athlete_id:'mk',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:80,result_date:'2026-07-01'},
  {id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'},
  {id:'molly200',athlete_id:'molly',distance:200,stroke:'Freestyle',pool_course:'SCM',result_seconds:132,result_date:'2026-07-01'}
 ]
}}]});
const attendanceStorage=new Attendance.MemoryStorage();
const attendance=Attendance.create({storage:attendanceStorage,evidence,clock});
attendance.mark(canonical,'mk','modified');
attendance.mark(canonical,'molly','present');
attendance.mark(canonical,'std','present');
assert.equal(attendance.here(canonical).length,3);
assert.equal(attendance.status(canonical,'not-here'),'not_marked');

const targets=Targets.create({evidence});
const adaptation=Adaptation.create({evidence});
const board=Board.create({attendance,adaptation,targets});
const model=board.project(lifecycle.selected().current);
assert.equal(model.totalDistance,5400);
assert.equal(model.attendance.here,3);
assert(!model.attendance.athletes.some(x=>x.id==='not-here'));
assert.deepEqual(model.blocks.map(x=>x.distance),[1200,600,2600,800,200]);

const main=model.blocks.find(x=>x.type==='main_set');
const pull=main.items.find(x=>x.kind==='set'&&x.groupWork.reps===1&&x.groupWork.distance===400&&x.groupWork.equipment.includes('Pull'));
assert(pull);const mkPull=pull.modifications.find(x=>x.athleteId==='mk');assert(mkPull);assert.equal(mkPull.work.distance,300);
const dev100=main.items.find(x=>x.kind==='set'&&x.groupWork.reps===6&&x.groupWork.distance===100&&x.groupWork.zone==='Development');
assert(dev100);const mollyTarget=dev100.targets.find(x=>x.athleteId==='molly');assert(mollyTarget);assert.equal(mollyTarget.status,'ok');assert(Math.abs(mollyTarget.seconds-87.642)<1e-9);assert.equal(mollyTarget.sendOff,100);
const mkDev=dev100.modifications.find(x=>x.athleteId==='mk');assert(mkDev);assert.equal(mkDev.work.reps,4);
const im=main.items.find(x=>x.kind==='set'&&x.groupWork.reps===4&&x.groupWork.distance===100&&x.groupWork.stroke==='IM');assert(im);assert(!im.modifications.some(x=>x.athleteId==='mk'));
const buildFast=main.items.find(x=>x.kind==='set'&&x.groupWork.reps===2&&x.groupWork.distance===100);assert(buildFast);assert(!buildFast.modifications.some(x=>x.athleteId==='mk'));

const post=model.blocks.find(x=>x.type==='post_set');assert.equal(post.items.length,1);assert.equal(post.items[0].groupWork.reps,16);assert.equal(post.items[0].phases.length,2);const swimPhase=post.items[0].phases[1],mollyRace=swimPhase.targets.find(x=>x.athleteId==='molly');assert(mollyRace);assert.deepEqual(mollyRace.rows.map(x=>x.rep),[4,8]);assert.deepEqual(mollyRace.rows.map(x=>x.seconds),[30,30]);

const captureStorage=new Capture.MemoryStorage();
const capture=Capture.create({storage:captureStorage,evidence,clock});
const liveSession=lifecycle.selected().current,mainBlock=liveSession.blocks.find(b=>b.type==='main_set'),thresholdItem=mainBlock.items.find(x=>x.kind==='set'&&x.reps===6&&x.distance===100);
const note=capture.create(liveSession,{type:'voice',blockId:mainBlock.id,itemId:thresholdItem.id,athleteIds:['molly'],coachId:'andy',mediaRef:{localId:'voice-001'},text:'Held shape well through the last two reps'});
assert.equal(note.session_id,identity.id);assert.equal(note.block_id,mainBlock.id);assert.equal(note.item_id,thresholdItem.id);assert.deepEqual(note.athlete_ids,['molly']);

// Simulate app close/reopen: lifecycle and attendance boot from their own persisted
// stores and neither is allowed to reparse, reselect or copy attendance.
const lifecycleWrites=lifecycleStorage.writes,attendanceWrites=attendanceStorage.writes;
const reopenedLifecycle=Lifecycle.create({storage:lifecycleStorage,clock}),reopenedAttendance=Attendance.create({storage:attendanceStorage,evidence,clock});
assert.equal(lifecycleStorage.writes,lifecycleWrites);assert.equal(attendanceStorage.writes,attendanceWrites);
assert.equal(reopenedLifecycle.selectedId(),identity.id);assert.equal(Truth.totalDistance(reopenedLifecycle.selected().current),5400);assert.equal(reopenedAttendance.here(reopenedLifecycle.selected().current).length,3);
const reopenedModel=Board.create({attendance:reopenedAttendance,adaptation,targets}).project(reopenedLifecycle.selected().current);assert.equal(reopenedModel.totalDistance,5400);assert.equal(reopenedModel.attendance.here,3);assert.equal(capture.query({sessionId:identity.id,athleteId:'molly'}).length,1);

console.log('PASS poolside integration · 5400m → save → roll → targets/mods → board → capture → reload');
