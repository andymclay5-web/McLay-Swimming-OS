'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Edit=require('../engines/session-edit.js');
const Lifecycle=require('../engines/session-lifecycle.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const id={id:'edit-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National'],venue:'AquaGym'};
let tick=0;const clock=()=>`2026-08-18T06:30:${String(tick++).padStart(2,'0')}+12:00`;
const engine=Edit.create({clock});

test('updating reps changes current canonical total but preserves node id',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free',id),item=s.blocks[0].items[0],before=JSON.stringify(s),r=engine.update(s,item.id,{reps:5},{note:'one extra rep'});assert.equal(Edit.totalDistance(r.session),500);assert.equal(r.session.blocks[0].items[0].id,item.id);assert.equal(r.change.before.reps,4);assert.equal(r.change.after.reps,5);assert.equal(JSON.stringify(s),before);
});

test('updating distance/rest/cycle leaves identity intact and recalculates total',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free Threshold 10 sr',id),item=s.blocks[0].items[0],r=engine.update(s,item.id,{distance:75,restSeconds:20,cycleSeconds:90});assert.equal(r.session.id,s.id);assert.deepEqual(r.session.identity,s.identity);assert.equal(Edit.totalDistance(r.session),300);const x=r.session.blocks[0].items[0];assert.equal(x.restSeconds,20);assert.equal(x.cycleSeconds,90);
});

test('editing an existing node cannot replace its canonical id',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free',id),item=s.blocks[0].items[0];assert.throws(()=>engine.update(s,item.id,{id:'different'}),/id cannot change/);
});

test('nested round set can be edited without flattening the group',()=>{
 const s=Truth.parse('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy',id),group=s.blocks[0].items[0],item=group.items[0],r=engine.update(s,item.id,{reps:4});assert.equal(r.session.blocks[0].items[0].kind,'group');assert.equal(r.session.blocks[0].items[0].rounds,3);assert.equal(r.session.blocks[0].items[0].items[0].reps,4);assert.equal(Edit.totalDistance(r.session),2400);
});

test('changing group rounds is explicit and recalculates once',()=>{
 const s=Truth.parse('Main set\n3 Rounds:\n5 x 100 Free\n400 Easy',id),group=s.blocks[0].items[0],r=engine.update(s,group.id,{rounds:2});assert.equal(r.session.blocks[0].items[0].rounds,2);assert.equal(Edit.totalDistance(r.session),1800);
});

test('remove deletes one canonical node and keeps siblings',()=>{
 const s=Truth.parse('Main set\n400 Pull\n6 x 100 Free Development 10 sr\n400 Easy',id),middle=s.blocks[0].items[1],r=engine.remove(s,middle.id);assert.equal(r.session.blocks[0].items.length,2);assert.deepEqual(r.session.blocks[0].items.map(x=>x.distance),[400,400]);assert.equal(Edit.totalDistance(r.session),800);assert.equal(r.change.before.id,middle.id);
});

test('addAfter accepts a pre-canonicalized node and never parses raw language itself',()=>{
 const s=Truth.parse('Main set\n400 Pull\n400 Easy',id),anchor=s.blocks[0].items[0],fragment=Truth.parse('Main set\n6 x 100 Free Development 10 sr',{...id,id:'fragment'}).blocks[0].items[0];fragment.id='added-development';const r=engine.addAfter(s,anchor.id,fragment);assert.equal(r.session.blocks[0].items.length,3);assert.equal(r.session.blocks[0].items[1].id,'added-development');assert.equal(Edit.totalDistance(r.session),1400);
});

test('adding duplicate node id is rejected',()=>{
 const s=Truth.parse('Main set\n400 Pull\n400 Easy',id),anchor=s.blocks[0].items[0],duplicate=JSON.parse(JSON.stringify(s.blocks[0].items[1]));assert.throws(()=>engine.addAfter(s,anchor.id,duplicate),/already exists/);
});

test('addToBlock and updateBlock are explicit block operations',()=>{
 const s=Truth.parse('Main set\n400 Pull',id),block=s.blocks[0],node=Truth.parse('Main set\n200 Easy',{...id,id:'fragment2'}).blocks[0].items[0];node.id='added-200';let r=engine.addToBlock(s,block.id,node);assert.equal(Edit.totalDistance(r.session),600);r=engine.updateBlock(r.session,block.id,{title:'Main capacity set'});assert.equal(r.session.blocks[0].title,'Main capacity set');assert.equal(Edit.totalDistance(r.session),600);
});

test('invalid reps/distance are rejected instead of creating broken canonical truth',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free',id),item=s.blocks[0].items[0];assert.throws(()=>engine.update(s,item.id,{reps:0}),/at least 1/);assert.throws(()=>engine.update(s,item.id,{distance:-25}),/non-negative/);
});

test('Session Edit result can be handed to Lifecycle as one journalled current-truth revision',()=>{
 const original=Truth.parse('Main set\n4 x 100 Free',id),storage=new Lifecycle.MemoryStorage(),life=Lifecycle.create({storage,clock});life.createSession(original);const item=original.blocks[0].items[0],edited=engine.update(life.selected().current,item.id,{reps:5},{note:'deck change'});life.applyEdit(id.id,edited.session,{action:'edit',note:edited.change.note});const rec=life.selected();assert.equal(Truth.totalDistance(rec.originalPlan),400);assert.equal(Truth.totalDistance(rec.current),500);assert.equal(rec.revision,2);assert.equal(rec.journal.at(-1).type,'edit');assert.equal(rec.journal.at(-1).note,'deck change');
});

test('editing canonical truth does not mutate the original source object',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free',id),before=JSON.stringify(s),item=s.blocks[0].items[0];engine.update(s,item.id,{reps:8});assert.equal(JSON.stringify(s),before);
});

if(fails){console.error(`\n${fails} Session Edit regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION EDIT REGRESSIONS PASS');
