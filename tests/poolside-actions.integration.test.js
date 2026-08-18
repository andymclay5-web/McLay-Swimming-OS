'use strict';
const assert=require('assert');
const Runtime=require('../rebuild/runtime.js');
const Actions=require('../rebuild/poolside-actions.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Attendance=require('../engines/attendance.js');
const Capture=require('../engines/capture-evidence.js');
const Delivered=require('../engines/delivered-session.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
let tick=0;const clock=()=>`2026-08-18T12:20:${String(tick++%60).padStart(2,'0')}+12:00`;
function fixture(){
 const stores={lifecycle:new Lifecycle.MemoryStorage(),attendance:new Attendance.MemoryStorage(),capture:new Capture.MemoryStorage(),delivery:new Delivered.MemoryStorage()};
 const evidenceSources=[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true}],training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'molly-t',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}],coach_results:[{id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'}]}}];
 const runtime=Runtime.create({stores,evidenceSources,clock});
 const source=`Main Set\n400 Pull\n6 x 100 Free Development\n10s Rest\n\nWarm Down\n200 Easy\nTOTAL 1200m`,identity={id:'poolside',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym',title:'Poolside action test'};
 runtime.createSession({source,identity});let changes=0;const actions=Actions.create({runtime,onChange:()=>changes++});return{runtime,actions,get changes(){return changes}};
}
function mainSets(rt){return rt.selectedSession().blocks.find(b=>b.type==='main_set').items}

test('Roll action writes Attendance Engine and Board immediately sees who is here',()=>{
 const x=fixture(),panel=x.actions.roll({context:{sessionId:'poolside'},session:x.runtime.selectedSession(),data:x.runtime.roll()});panel.mark('molly','present');panel.mark('mk','modified');const board=x.runtime.boardModel();assert.equal(board.attendance.here,2);assert.equal(x.runtime.roll().summary.counts.present,1);assert.equal(x.runtime.roll().summary.counts.modified,1);assert.equal(x.changes,2);
});

test('Times action retrieves T400 and pathway through performance engines without writing session truth',()=>{
 const x=fixture(),before=JSON.stringify(x.runtime.selectedSession()),panel=x.actions.times({context:{sessionId:'poolside'},session:x.runtime.selectedSession()});const t=panel.t400('molly');assert.equal(t.status,'ok');assert.equal(t.seconds,324.6);const p=panel.pathway('molly');assert(p&&typeof p==='object');assert.equal(JSON.stringify(x.runtime.selectedSession()),before);assert.equal(x.changes,0);
});

test('group Edit action writes Session Edit + Lifecycle and keeps original plan immutable',()=>{
 const x=fixture(),item=mainSets(x.runtime).find(s=>s.distance===100),before=x.runtime.selectedRecord();const panel=x.actions.editSet({context:{sessionId:'poolside',blockId:before.current.blocks[0].id,itemId:item.id},session:before.current,block:before.current.blocks[0],item});panel.save({reps:8},{note:'deck change'});const after=x.runtime.selectedRecord();assert.equal(after.revision,2);assert.equal(after.originalPlan.blocks[0].items.find(s=>s.distance===100).reps,6);assert.equal(after.current.blocks[0].items.find(s=>s.distance===100).reps,8);assert.equal(x.changes,1);
});

test('individual Edit action writes Adaptation Engine override not squad canonical truth',()=>{
 const x=fixture();x.runtime.markAttendance('mk','modified');const item=mainSets(x.runtime).find(s=>s.distance===400),block=x.runtime.selectedSession().blocks[0],ath=x.runtime.roll().here.find(a=>a.id==='mk'),canonicalBefore=JSON.stringify(x.runtime.selectedSession());const panel=x.actions.editAthleteSet({context:{sessionId:'poolside',blockId:block.id,itemId:item.id,athleteId:'mk'},session:x.runtime.selectedSession(),block,item,athlete:ath});assert.equal(panel.current.prescription.distance,300);panel.save({distance:200},{reason:'Coach chose shorter return-to-start repeat'});assert.equal(JSON.stringify(x.runtime.selectedSession()),canonicalBefore);assert.equal(x.runtime.adaptationFor(item.id,'mk').prescription.distance,200);assert.equal(x.runtime.boardModel().blocks[0].items.find(s=>s.id===item.id).modifications.find(m=>m.athleteId==='mk').work.distance,200);
});

test('Capture action writes exact session block set evidence and Evidence button retrieves same row',()=>{
 const x=fixture(),item=mainSets(x.runtime).find(s=>s.distance===100),block=x.runtime.selectedSession().blocks[0],ctx={sessionId:'poolside',blockId:block.id,itemId:item.id};const panel=x.actions.capture({context:ctx,mode:'note',session:x.runtime.selectedSession(),roll:x.runtime.roll()});const row=panel.save({text:'Held stroke count'});assert.equal(row.session_id,'poolside');assert.equal(row.block_id,block.id);assert.equal(row.item_id,item.id);assert.equal(x.runtime.evidenceAt(ctx).length,1);
});

test('Finish action writes Delivered Session only when explicitly confirmed',()=>{
 const x=fixture(),panel=x.actions.finish({context:{sessionId:'poolside'},session:x.runtime.selectedSession()});assert.equal(x.runtime.state().delivery.deliveries.length,0);const result=panel.confirm({point:{full:true},coachId:'andy'});assert.equal(result.session_id,'poolside');assert.equal(result.delivered_distance,1200);assert.equal(x.runtime.state().delivery.deliveries.length,1);
});

if(fails){console.error(`\n${fails} Poolside action regression(s) failed`);process.exit(1)}console.log('\nALL POOLSIDE ACTION INTEGRATION REGRESSIONS PASS');
