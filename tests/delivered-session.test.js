'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Delivered=require('../engines/delivered-session.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function clock(){let n=0;return()=>`2026-08-18T07:00:${String(n++).padStart(2,'0')}+12:00`}
const id={id:'delivery-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National'],venue:'AquaGym'};
function session(src){return Truth.parse(src,id)}
function engine(){return Delivered.create({storage:new Delivered.MemoryStorage(),clock:clock()})}

test('full finish records current delivered distance and zero remaining without mutating session',()=>{
 const s=session('Warm up\n400 Choice\nMain set\n5 x 100 Free Threshold 10 sr\nWarm down\n200 Easy'),before=JSON.stringify(s),d=engine().finish(s,{point:{full:true},coachId:'andy'});assert.equal(d.planned_distance,1100);assert.equal(d.current_distance,1100);assert.equal(d.delivered_distance,1100);assert.equal(d.remaining_distance,0);assert.equal(JSON.stringify(s),before);
});

test('finish at a block delivers exactly through that block',()=>{
 const s=session('Warm up\n400 Choice\nPre set\n4 x 50 Build\nMain set\n5 x 100 Free Threshold 10 sr\nWarm down\n200 Easy'),pre=s.blocks.find(b=>b.type==='pre_set'),d=engine().finish(s,{point:{blockId:pre.id}});assert.equal(d.delivered_distance,600);assert.equal(d.remaining_distance,700);assert.equal(d.finish_point.block_id,pre.id);
});

test('repeated-group finish requires exact occurrence rather than guessing which round',()=>{
 const s=session('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy'),group=s.blocks[0].items[0],first=group.items[0],e=engine();assert.throws(()=>e.finish(s,{point:{itemId:first.id}}),/guessing is forbidden/);
});

test('finish after first set in round two has exact delivered distance',()=>{
 const s=session('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy'),group=s.blocks[0].items[0],first=group.items[0],occ=Delivered.expand(s).filter(x=>x.item_id===first.id);assert.equal(occ.length,3);const d=engine().finish(s,{point:{occurrenceId:occ[1].occurrence_id}});assert.equal(d.delivered_distance,1400);assert.equal(d.remaining_distance,1300);assert.deepEqual(d.finish_point.group_rounds.map(x=>x.round),[2]);
});

test('expanded round occurrences retain stable source item identity and unique occurrence identity',()=>{
 const s=session('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy'),rows=Delivered.expand(s),setRows=rows.filter(x=>x.item_id===s.blocks[0].items[0].items[0].id);assert.equal(setRows.length,3);assert.equal(new Set(setRows.map(x=>x.occurrence_id)).size,3);assert(setRows.every(x=>x.item_id===setRows[0].item_id));assert.deepEqual(setRows.map(x=>x.group_rounds[0].round),[1,2,3]);
});

test('delivered record keeps original plan and edited current plan as separate immutable snapshots',()=>{
 const original=session('Main set\n4 x 100 Free'),edited=session('Main set\n5 x 100 Free');const record={id:id.id,originalPlan:original,current:edited},d=engine().finish(record,{point:{full:true}});assert.equal(d.planned_distance,400);assert.equal(d.current_distance,500);assert.equal(d.delivered_distance,500);edited.blocks[0].items[0].reps=99;original.blocks[0].items[0].reps=99;assert.equal(d.planned_snapshot.blocks[0].items[0].reps,4);assert.equal(d.current_snapshot.blocks[0].items[0].reps,5);
});

test('Finish is an explicit one-time transaction; duplicate finish is rejected',()=>{
 const s=session('Main set\n4 x 100 Free'),storage=new Delivered.MemoryStorage(),e=Delivered.create({storage,clock:clock()});e.finish(s,{point:{full:true}});const writes=storage.writes;assert.throws(()=>e.finish(s,{point:{full:true}}),/already finished/);assert.equal(storage.writes,writes);
});

test('boot is read-only and preserves finished record byte-for-byte',()=>{
 const s=session('Main set\n4 x 100 Free'),storage=new Delivered.MemoryStorage(),e=Delivered.create({storage,clock:clock()});e.finish(s,{point:{full:true}});const before=JSON.stringify(storage.value),writes=storage.writes,reopened=Delivered.create({storage,clock:clock()});assert.equal(storage.writes,writes);assert.equal(JSON.stringify(storage.value),before);assert.equal(reopened.get(s.id).delivered_distance,400);
});

test('remaining original work stays available as occurrences after early finish',()=>{
 const s=session('Main set\n400 Pull\n6 x 100 Free Development 10 sr\n400 Easy'),pull=s.blocks[0].items[0],d=engine().finish(s,{point:{itemId:pull.id}});assert.equal(d.delivered_distance,400);assert.equal(d.remaining_distance,1000);assert.deepEqual(d.remaining_occurrences.map(x=>x.item_id),[s.blocks[0].items[1].id,s.blocks[0].items[2].id]);
});

if(fails){console.error(`\n${fails} Delivered Session regression(s) failed`);process.exit(1)}
console.log('\nALL DELIVERED SESSION REGRESSIONS PASS');
