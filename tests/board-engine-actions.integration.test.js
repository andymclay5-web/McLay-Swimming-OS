'use strict';
const assert=require('assert');
const App=require('../rebuild/board-app.js');
const Runtime=require('../rebuild/runtime.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Attendance=require('../engines/attendance.js');
const Capture=require('../engines/capture-evidence.js');
const Delivered=require('../engines/delivered-session.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
let tick=0;const clock=()=>`2026-08-18T12:30:${String(tick++%60).padStart(2,'0')}+12:00`;
function fixture(){
 const stores={lifecycle:new Lifecycle.MemoryStorage(),attendance:new Attendance.MemoryStorage(),capture:new Capture.MemoryStorage(),delivery:new Delivered.MemoryStorage()},evidenceSources=[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true}],training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'molly-t',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}]}}];
 const runtime=Runtime.create({stores,evidenceSources,clock}),source=`Main Set\n400 Pull\n6 x 100 Free Development\n10s Rest\n\nWarm Down\n200 Easy\nTOTAL 1200m`,identity={id:'board-actions',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym',title:'Board action flow'};runtime.createSession({source,identity});
 const root={innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn},removeEventListener(type){delete this.listeners[type]}},presented=[];
 const app=App.create({root,runtime,present:panel=>{presented.push(panel);return panel},getScroll:()=>0,setScroll:()=>{}});app.mount();
 const click=(action,{blockId='',itemId='',athleteId=''}={})=>root.listeners.click({target:{dataset:{boardAction:action,sessionId:'board-actions',blockId,itemId,athleteId},closest(){return this}},preventDefault(){}});
 return{app,root,runtime,presented,click};
}
function main(rt){return rt.selectedSession().blocks.find(b=>b.type==='main_set')}

test('Roll tap opens engine-backed roll and marking swimmer refreshes Board names and count',()=>{
 const x=fixture(),panel=x.click('roll');assert.equal(panel.type,'roll');panel.mark('molly','present');assert.equal(x.runtime.roll().summary.here,1);assert(/Roll · 1/.test(x.root.innerHTML));assert(/>Molly</.test(x.root.innerHTML));
});

test('Times tap can retrieve T400 without mutating session',()=>{
 const x=fixture(),before=JSON.stringify(x.runtime.selectedSession()),panel=x.click('times'),t=panel.t400('molly');assert.equal(panel.type,'times');assert.equal(t.seconds,324.6);assert.equal(JSON.stringify(x.runtime.selectedSession()),before);
});

test('group Edit tap saves canonical revision and rerenders new total',()=>{
 const x=fixture(),block=main(x.runtime),set=block.items.find(i=>i.distance===100),panel=x.click('edit',{blockId:block.id,itemId:set.id});assert.equal(panel.type,'editSet');panel.save({reps:8},{note:'deck change'});assert.equal(x.runtime.selectedRecord().revision,2);assert.equal(x.runtime.selectedSession().metadata.parsedTotal,1400);assert(/1,400m/.test(x.root.innerHTML));
});

test('modified swimmer Edit tap writes Adaptation override only and Board shows exact result',()=>{
 const x=fixture();x.click('roll').mark('mk','modified');const block=main(x.runtime),pull=block.items.find(i=>i.distance===400);assert(/McKenzie/.test(x.root.innerHTML));const panel=x.click('edit-athlete',{blockId:block.id,itemId:pull.id,athleteId:'mk'});assert.equal(panel.type,'editAthleteSet');assert.equal(panel.current.prescription.distance,300);const canonical=JSON.stringify(x.runtime.selectedSession());panel.save({distance:200},{reason:'Poolside return-to-start change'});assert.equal(JSON.stringify(x.runtime.selectedSession()),canonical);assert.equal(x.runtime.adaptationFor(pull.id,'mk').prescription.distance,200);assert(/200/.test(x.root.innerHTML));
});

test('Note tap writes exact Capture Evidence and marker appears on same set',()=>{
 const x=fixture(),block=main(x.runtime),set=block.items.find(i=>i.distance===100),panel=x.click('note',{blockId:block.id,itemId:set.id});assert.equal(panel.type,'capture');panel.save({text:'Held line through final reps'});assert.equal(x.runtime.evidenceAt({sessionId:'board-actions',blockId:block.id,itemId:set.id}).length,1);assert(/1 note/.test(x.root.innerHTML));
});

test('Finish tap does nothing until confirm then records delivered truth',()=>{
 const x=fixture(),panel=x.click('finish');assert.equal(panel.type,'finish');assert.equal(x.runtime.state().delivery.deliveries.length,0);panel.confirm({point:{full:true},coachId:'andy'});assert.equal(x.runtime.state().delivery.deliveries.length,1);assert.equal(x.runtime.state().delivery.deliveries[0].delivered_distance,1200);
});

if(fails){console.error(`\n${fails} Board engine-action regression(s) failed`);process.exit(1)}console.log('\nALL BOARD ENGINE-ACTION INTEGRATION REGRESSIONS PASS');
