'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Board=require('../engines/board-projection.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const identity={id:'board-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym',title:'Tuesday AM'};
function evidence(){return Evidence.create({sources:[{id:'verified',priority:100,trust:'verified',data:{
 athletes:[
  {id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},
  {id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'},
  {id:'std',full_name:'Standard Swimmer',squad:'Development',active:true,sex:'M'},
  {id:'mc1',full_name:'Matthew Callow',squad:'Development',active:true,sex:'M'},
  {id:'mc2',full_name:'Mia Carter',squad:'Development',active:true,sex:'F'},
  {id:'missing',full_name:'Missing T400',squad:'Development',active:true,sex:'F'}
 ],
 training_test_types:[{id:'tt',test_key:'t400_freestyle'}],
 training_test_results:[
  {id:'molly-t400',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},
  {id:'mk-t400',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
  {id:'std-t400',athlete_id:'std',test_type_id:'tt',result_seconds:300,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}
 ],
 coach_results:[
  {id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'},
  {id:'mk100',athlete_id:'mk',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:80,result_date:'2026-07-01'}
 ]
}}]})}
function system(src){
 const ev=evidence(),attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence:ev,clock:(()=>{let n=0;return()=>`2026-08-18T05:30:${String(n++).padStart(2,'0')}+12:00`})()}),targets=Targets.create({evidence:ev}),adaptation=Adaptation.create({evidence:ev}),board=Board.create({attendance,adaptation,targets}),session=Truth.parse(src,identity);return{ev,attendance,targets,adaptation,board,session};
}
function findSet(model,predicate){for(const b of model.blocks)for(const n of b.items){if(n.kind==='set'&&predicate(n))return n;if(n.kind==='group')for(const x of n.items)if(x.kind==='set'&&predicate(x))return x}return null}

test('Board renders canonical team session even with nobody marked here',()=>{
 const {board,session}=system('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy');const m=board.project(session);assert.equal(m.totalDistance,2700);assert.equal(m.attendance.here,0);assert.equal(m.blocks[0].items[0].kind,'group');assert.equal(m.blocks[0].items[0].rounds,3);assert.equal(m.blocks[0].items[0].distance,2700);const set=m.blocks[0].items[0].items[0];assert.equal(set.modifications.length,0);assert.equal(set.targets.length,0);
});

test('only exact-session here swimmers receive targets or modifications',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');attendance.mark({id:'yesterday'},'mk','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.attendance.here,1);assert.deepEqual(m.attendance.athletes.map(x=>x.id),['molly']);assert.equal(set.targets.length,1);assert.equal(set.targets[0].athleteId,'molly');assert(!set.targets.some(x=>x.athleteId==='mk'));
});

test('absent swimmer is never projected merely because they belong to session squad',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','absent');attendance.mark(session,'std','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.attendance.here,1);assert.equal(m.attendance.athletes[0].id,'std');assert.equal(set.targets.length,1);assert.equal(set.targets[0].athleteId,'std');
});

test('McKenzie modification is projected beside canonical group work, not as a second session',()=>{
 const {board,session,attendance}=system('Main set\n400 Pull');attendance.mark(session,'mk','modified');attendance.mark(session,'std','present');const m=board.project(session),set=m.blocks[0].items[0];assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[1,400]);assert.equal(set.modifications.length,1);assert.equal(set.modifications[0].athleteId,'mk');assert.equal(set.modifications[0].work.distance,300);assert.equal(m.blocks.length,1);assert.equal(m.blocks[0].items.length,1);
});

test('standard swimmer does not get a duplicate modification line',()=>{
 const {board,session,attendance}=system('Main set\n400 Pull');attendance.mark(session,'std','present');const set=board.project(session).blocks[0].items[0];assert.equal(set.modifications.length,0);
});

test('Development target is retrieved from Target Engine with evidence source',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const target=board.project(session).blocks[0].items[0].targets[0];assert.equal(target.status,'ok');assert.equal(target.kind,'aerobic');assert(Math.abs(target.seconds-87.642)<1e-9);assert.equal(target.sendOff,100);assert(/Latest valid Freestyle T400/.test(target.source));
});

test('missing T400 is visible on Board and does not remove the group set',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'missing','present');const m=board.project(session),set=m.blocks[0].items[0];assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[6,100]);assert.equal(set.targets.length,1);assert.equal(set.targets[0].status,'missing');assert(/No current Freestyle T400/.test(set.targets[0].message));
});

test('compact parent phases remain one Board line with nested phase information',()=>{
 const {board,session,attendance}=system(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`);attendance.mark(session,'molly','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.blocks[0].items.length,1);assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[16,50]);assert.equal(set.phases.length,2);assert.deepEqual(set.phases.map(x=>x.work.reps),[8,8]);assert.deepEqual(set.phases[1].targets[0].rows.map(x=>x.rep),[4,8]);assert.deepEqual(set.phases[1].targets[0].rows.map(x=>x.seconds),[30,30]);
});

test('4-round pre-set stays one compact group and summary remains a cue',()=>{
 const {board,session}=system(`Pre set\n4 Rounds:\n3 x 50 #1 @ 1:00\n2 Drill\n1 @ 200 Pace\n\n12 x 50 Total`),m=board.project(session),items=m.blocks[0].items;assert.equal(m.blocks[0].distance,600);assert.equal(items.length,2);assert.equal(items[0].kind,'group');assert.equal(items[0].rounds,4);assert.equal(items[0].items.length,1);assert.equal(items[1].kind,'cue');assert.equal(items[1].role,'summary');assert.equal(items[1].summaryMetres,600);
});

test('identifier collisions are resolved deterministically instead of showing duplicate initials',()=>{
 const {board,session,attendance}=system('Main set\n4 x 25 Max @ 1:00');attendance.mark(session,'mc1','present');attendance.mark(session,'mc2','present');const labels=board.project(session).attendance.athletes.map(x=>x.label);assert.equal(new Set(labels).size,2);assert(labels.every(x=>x!=='MC'));
});

test('Target Engine failure is contained to target row and canonical group work still projects',()=>{
 const {attendance,adaptation,session}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const badTargets={forItem(){throw new Error('target engine exploded')}};const board=Board.create({attendance,adaptation,targets:badTargets}),m=board.project(session),set=m.blocks[0].items[0];assert.equal(set.groupWork.reps,6);assert.equal(set.targets.length,1);assert.equal(set.targets[0].status,'error');assert(/target engine exploded/.test(set.targets[0].message));
});

test('Adaptation failure is contained and does not replace canonical group work',()=>{
 const {attendance,targets,session}=system('Main set\n400 Pull');attendance.mark(session,'mk','present');const badAdapt={forItem(){throw new Error('adaptation exploded')}};const board=Board.create({attendance,adaptation:badAdapt,targets}),set=board.project(session).blocks[0].items[0];assert.equal(set.groupWork.distance,400);assert.equal(set.modifications.length,1);assert.equal(set.modifications[0].status,'error');assert(/adaptation exploded/.test(set.modifications[0].message));
});

test('Board projection is read-only across session, attendance, evidence and derived engines',()=>{
 const {board,session,attendance,ev}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const beforeSession=JSON.stringify(session),beforeAttendance=JSON.stringify(attendance.snapshot()),beforeEvidence=JSON.stringify(ev.results('molly',{}));board.project(session);assert.equal(JSON.stringify(session),beforeSession);assert.equal(JSON.stringify(attendance.snapshot()),beforeAttendance);assert.equal(JSON.stringify(ev.results('molly',{})),beforeEvidence);
});

if(fails){console.error(`\n${fails} Board Projection regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD PROJECTION REGRESSIONS PASS');
