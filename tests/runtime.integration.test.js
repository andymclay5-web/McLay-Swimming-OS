'use strict';
const assert=require('assert');
const Runtime=require('../rebuild/runtime.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Attendance=require('../engines/attendance.js');
const Capture=require('../engines/capture-evidence.js');
const Delivered=require('../engines/delivered-session.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
let tick=0;const clock=()=>`2026-08-18T05:30:${String(tick++%60).padStart(2,'0')}+12:00`;
const source=`Warm up\n400 Choice\n\nMain set\n400 Pull\n6 x 100 Freestyle Development\n10s Rest\n4 x 25 Free @ 100 Pace\n\nWarm down\n200 Easy\n\nTOTAL: 1,700m`;
const identity={id:'runtime-session',date:'2026-08-18',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',squads:['National','Development'],title:'Runtime test'};
const evidenceSources=[{id:'verified',priority:100,trust:'verified',data:{
 athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'}],
 training_test_types:[{id:'tt',test_key:'t400_freestyle'}],
 training_test_results:[{id:'mk-t',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},{id:'molly-t',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}],
 coach_results:[{id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'}]
}}];
const plan={seasons:[{id:'season',start_date:'2026-01-01',end_date:'2026-12-31',active:true}],weeks:[{id:'week',season_id:'season',start_date:'2026-08-17',end_date:'2026-08-23',active:true}],sessionIntents:[{id:'intent',session_id:'runtime-session',week_id:'week',purpose:'Aerobic Development with race-speed touch',primary_stimulus:'Development',primary_dose_key:'aerobic:development',supporting_dose_keys:['race_pace'],active:true}]};
function stores(){return{lifecycle:new Lifecycle.MemoryStorage(),attendance:new Attendance.MemoryStorage(),capture:new Capture.MemoryStorage(),delivery:new Delivered.MemoryStorage()}}
function runtime(s=stores()){return Runtime.create({stores:s,evidenceSources,plan,clock})}
function findSet(model,pred){for(const b of model.blocks)for(const n of b.items){if(n.kind==='set'&&pred(n))return n;if(n.kind==='group')for(const x of n.items||[])if(x.kind==='set'&&pred(x))return x}return null}

test('composition root creates accepted canonical session and projects empty Roll without inventing swimmers',()=>{
 const rt=runtime(),created=rt.createSession({source,identity});assert.equal(created.record.id,'runtime-session');assert.equal(rt.selectedSession().metadata.parsedTotal,1700);const b=rt.boardModel();assert.equal(b.totalDistance,1700);assert.equal(b.attendance.here,0);assert.equal(b.blocks.length,3);
});

test('mark Roll then Board retrieves target and McKenzie modification from separate engines',()=>{
 const rt=runtime();rt.createSession({source,identity});rt.markAttendance('molly','present');rt.markAttendance('mk','modified');const b=rt.boardModel(),dev=findSet(b,x=>x.groupWork.reps===6&&x.groupWork.distance===100),pull=findSet(b,x=>x.groupWork.reps===1&&x.groupWork.distance===400);assert.equal(b.attendance.here,2);assert(dev.targets.some(x=>x.athleteId==='molly'&&x.status==='ok'));assert.equal(dev.modifications.find(x=>x.athleteId==='mk').work.reps,4);assert.equal(pull.modifications.find(x=>x.athleteId==='mk').work.distance,300);
});

test('live edit routes Session Edit -> Lifecycle and Board immediately reads same revised truth',()=>{
 const rt=runtime();rt.createSession({source,identity});const before=rt.selectedRecord(),dev=before.current.blocks.find(b=>b.type==='main_set').items.find(x=>x.reps===6&&x.distance===100);rt.editSession(dev.id,{reps:8},{note:'deck increased aerobic work'});const after=rt.selectedRecord(),board=rt.boardModel();assert.equal(after.revision,2);assert.equal(after.originalPlan.blocks.find(b=>b.type==='main_set').items.find(x=>x.distance===100&&x.zone==='Development').reps,6);assert.equal(after.current.blocks.find(b=>b.type==='main_set').items.find(x=>x.zone==='Development').reps,8);assert.equal(board.totalDistance,1900);assert.equal(after.journal.at(-1).type,'edit');assert.equal(after.journal.at(-1).note,'deck increased aerobic work');
});

test('canonicalized fragment can be added without Board interpreting raw language',()=>{
 const rt=runtime();rt.createSession({source,identity});const main=rt.selectedSession().blocks.find(b=>b.type==='main_set'),anchor=main.items.at(-1),node=rt.parseFragment('2 x 50 Fast @ 1:00',{blockType:'main_set'});rt.addAfter(anchor.id,node,{note:'time available'});assert.equal(rt.boardModel().totalDistance,1800);assert.equal(rt.selectedRecord().originalPlan.metadata.parsedTotal,1700);
});

test('capture, finish, dose and report all keep the same canonical session identity',()=>{
 const rt=runtime();rt.createSession({source,identity});rt.markAttendance('molly','present');const s=rt.selectedSession(),main=s.blocks.find(b=>b.type==='main_set'),dev=main.items.find(x=>x.zone==='Development');const cap=rt.captureEvidence({type:'note',blockId:main.id,itemId:dev.id,athleteIds:['molly'],coachId:'andy',text:'Held shape through final reps'});assert.equal(cap.session_id,'runtime-session');const delivery=rt.finish({point:{full:true},coachId:'andy'});assert.equal(delivery.session_id,'runtime-session');assert.equal(delivery.delivered_distance,1700);const dose=rt.doseAnalysis({delivered:true});assert.equal(dose.sessionId,'runtime-session');assert.equal(dose.dose['aerobic:development'],600);assert.equal(dose.dose.race_pace,100);assert.equal(dose.alignment.status,'aligned');const report=rt.sessionReport();assert.equal(report.sessionId,'runtime-session');assert.equal(report.delivery.deliveredDistance,1700);assert.equal(report.captures.total,1);assert.equal(report.dose.alignment.status,'aligned');
});

test('session learning is generated only from stored report facts',()=>{
 const rt=runtime();rt.createSession({source,identity});rt.finish({point:{full:true}});const findings=rt.sessionLearning();assert(Array.isArray(findings));assert(!findings.some(x=>/guarantee|definitely caused|must be because/i.test(x.message||''));
});

test('pathway query is available through runtime without Board owning result logic',()=>{
 const rt=runtime(),p=rt.pathwayProfile('molly',{course:'SCM'});assert.equal(p.status,'ok');assert(p.pbs.some(x=>x.distance===100&&x.stroke==='Freestyle'&&x.result_seconds===60));
});

test('reopening runtime from same stores is read-only and restores exact selected truth, Roll, captures and finish',()=>{
 const shared=stores(),rt=runtime(shared);rt.createSession({source,identity});rt.markAttendance('molly','present');const s=rt.selectedSession(),dev=s.blocks.find(b=>b.type==='main_set').items.find(x=>x.zone==='Development');rt.editSession(dev.id,{reps:8},{note:'live'});rt.captureEvidence({type:'note',itemId:dev.id,athleteIds:['molly'],text:'note'});rt.finish({point:{full:true}});const writes={l:shared.lifecycle.writes,a:shared.attendance.writes,c:shared.capture.writes,d:shared.delivery.writes},reopened=runtime(shared);assert.deepEqual({l:shared.lifecycle.writes,a:shared.attendance.writes,c:shared.capture.writes,d:shared.delivery.writes},writes);assert.equal(reopened.selectedSession().blocks.find(b=>b.type==='main_set').items.find(x=>x.zone==='Development').reps,8);assert.equal(reopened.roll().here.length,1);assert.equal(reopened.capture.query({sessionId:'runtime-session',athleteId:'molly'}).length,1);assert.equal(reopened.delivered.get('runtime-session').delivered_distance,1900);assert.equal(reopened.boardModel().totalDistance,1900);
});

test('creating a stale draft after a saved session cannot change selected Board truth',()=>{
 const rt=runtime();rt.createSession({source,identity});const before=rt.boardModel().totalDistance;rt.createDraft({id:'stale',identity,source:'Main set\n99 x 100 Free'});assert.equal(rt.boardModel().totalDistance,before);assert.equal(rt.selectedSession().id,'runtime-session');
});

if(fails){console.error(`\n${fails} Runtime integration regression(s) failed`);process.exit(1)}
console.log('\nALL RUNTIME INTEGRATION REGRESSIONS PASS');
