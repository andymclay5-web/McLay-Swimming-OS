'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Capture=require('../engines/capture-evidence.js');
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
  {id:'andy',full_name:'Andy McLay',squad:'National',active:true,sex:'M'},
  {id:'amy',full_name:'Amy March',squad:'National',active:true,sex:'F'},
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
function system(src,{id=identity.id}={}){
 const ev=evidence(),attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence:ev,clock:(()=>{let n=0;return()=>`2026-08-18T05:30:${String(n++).padStart(2,'0')}+12:00`})()}),targets=Targets.create({evidence:ev}),adaptation=Adaptation.create({evidence:ev}),captures=Capture.create({storage:new Capture.MemoryStorage(),evidence:ev,clock:(()=>{let n=0;return()=>`2026-08-18T06:00:${String(n++).padStart(2,'0')}+12:00`})()}),board=Board.create({truth:Truth,attendance,adaptation,targets,captures}),session=Truth.parse(src,{...identity,id});return{ev,attendance,targets,adaptation,captures,board,session};
}
function walk(nodes=[],out=[]){for(const n of nodes){out.push(n);if(n.kind==='group')walk(n.items||[],out)}return out}
function boardSets(model){return model.blocks.flatMap(b=>walk(b.items,[])).filter(x=>x.kind==='set')}
function truthSets(session){return session.blocks.flatMap(b=>walk(b.items,[])).filter(x=>x.kind==='set')}
function findSet(model,predicate){return boardSets(model).find(predicate)||null}

const friday4220=`WARM UP
400 Choice

PRE-SET
2 Rounds:
300 Regeneration
200 Development
100 Overload

MAIN SET
2 Rounds:
4 x 25 #1 Build @0:45
4 x 25 #1, with 15m Max @0:45
8 x 25 Dive Start @100 Pace @2:00
6 x 12.5 Max @0:45
1 x 35 Dive Start
100 HBS
150 Scull

POST-SET
8 x 25 Fins @1:15 · 1 Underwater / 1 15m Max
4 x 100 Fins · 1 Kick / 1 Free · 20s rest
3 x 100 · 1 Pull / 1 Paddles / 1 Swim · 15s rest

WARM DOWN
200 Easy

TOTAL 4220m`;

test('Board v2 is a projection of Session Truth, including exact 4220 block totals',()=>{
 const {board,session}=system(friday4220),m=board.project(session);
 assert.equal(m.schema,'msos.board.v2');assert.equal(m.totalDistance,4220);
 assert.deepEqual(m.blocks.map(b=>b.distance),[400,1200,1520,900,200]);
 assert.equal(m.validation.writtenTotal,4220);assert.equal(m.validation.totalMatches,true);
 assert.equal(boardSets(m).length,truthSets(session).length);
});

test('Board never owns metre semantics: injected Session Truth distance contract is used',()=>{
 const {attendance,adaptation,targets,captures,session}=system('Main Set\n2 Rounds:\n4 x 100 Free Threshold 10 sr\n200 Easy');
 const calls={node:0,block:0,total:0},truth={nodeDistance(n){calls.node++;return Truth.nodeDistance(n)},blockDistance(b){calls.block++;return Truth.blockDistance(b)},totalDistance(s){calls.total++;return Truth.totalDistance(s)},parse(){throw new Error('Board must never parse')}};
 const board=Board.create({truth,attendance,adaptation,targets,captures}),m=board.project(session);
 assert.equal(m.totalDistance,1200);assert(calls.node>0);assert(calls.block>0);assert.equal(calls.total,1);
});

test('Board renders canonical team session even with nobody marked here',()=>{
 const {board,session}=system('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy');const m=board.project(session);assert.equal(m.totalDistance,2700);assert.equal(m.attendance.here,0);assert.equal(m.blocks[0].items[0].kind,'group');assert.equal(m.blocks[0].items[0].rounds,3);assert.equal(m.blocks[0].items[0].scope,'local_rounds');assert.equal(m.blocks[0].items[0].distance,2700);const set=m.blocks[0].items[0].items[0];assert.equal(set.modifications.length,0);assert.equal(set.targets.length,0);
});

test('every visible Board node carries exact stable session/block/set context',()=>{
 const {board,session}=system('Main Set\n2 Rounds:\n4 x 100 Free Threshold 10 sr\n200 Easy'),m=board.project(session),b=m.blocks[0],g=b.items[0],s=g.items[0];
 assert.deepEqual(b.context,{sessionId:session.id,blockId:b.id});
 assert.equal(g.context.sessionId,session.id);assert.equal(g.context.blockId,b.id);assert.equal(g.context.groupId,g.id);
 assert.deepEqual(s.context,{sessionId:session.id,blockId:b.id,groupId:null,setId:s.id,itemId:s.id,cueId:null,phaseIndex:null});
});

test('only exact-session here swimmers receive targets or modifications',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');attendance.mark({id:'yesterday'},'mk','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.attendance.here,1);assert.deepEqual(m.attendance.athletes.map(x=>x.id),['molly']);assert.equal(set.targets.length,1);assert.equal(set.targets[0].athleteId,'molly');assert(!set.targets.some(x=>x.athleteId==='mk'));
});

test('attendance status remains visible for present modified and late swimmers',()=>{
 const {board,session,attendance}=system('Main set\n4 x 25 Max @ 1:00');attendance.mark(session,'molly','present');attendance.mark(session,'mk','modified');attendance.mark(session,'std','late');const a=board.project(session).attendance.athletes;assert.deepEqual(Object.fromEntries(a.map(x=>[x.id,x.status])),{mk:'modified',molly:'present',std:'late'});
});

test('absent swimmer is never projected merely because they belong to session squad',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','absent');attendance.mark(session,'std','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.attendance.here,1);assert.equal(m.attendance.athletes[0].id,'std');assert.equal(set.targets.length,1);assert.equal(set.targets[0].athleteId,'std');
});

test('McKenzie modification is projected beside canonical group work, not as a second session',()=>{
 const {board,session,attendance}=system('Main set\n400 Pull');attendance.mark(session,'mk','modified');attendance.mark(session,'std','present');const m=board.project(session),set=m.blocks[0].items[0];assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[1,400]);assert.equal(set.modifications.length,1);assert.equal(set.modifications[0].athleteId,'mk');assert.equal(set.modifications[0].work.distance,300);assert.equal(set.modifications[0].context.setId,set.id);assert.equal(m.blocks.length,1);assert.equal(m.blocks[0].items.length,1);
});

test('standard swimmer does not get a duplicate modification line',()=>{
 const {board,session,attendance}=system('Main set\n400 Pull');attendance.mark(session,'std','present');const set=board.project(session).blocks[0].items[0];assert.equal(set.modifications.length,0);
});

test('Development target is retrieved from Target Engine and sits under the exact set',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const set=board.project(session).blocks[0].items[0],target=set.targets[0];assert.equal(target.status,'ok');assert.equal(target.kind,'aerobic');assert(Math.abs(target.seconds-87.642)<1e-9);assert.equal(target.sendOff,100);assert(/Latest valid Freestyle T400/.test(target.source));assert.equal(target.context.setId,set.id);
});

test('missing T400 is visible on Board and does not remove the group set',()=>{
 const {board,session,attendance}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'missing','present');const m=board.project(session),set=m.blocks[0].items[0];assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[6,100]);assert.equal(set.targets.length,1);assert.equal(set.targets[0].status,'missing');assert(/No current Freestyle T400/.test(set.targets[0].message));
});

test('compact parent phases remain one Board line with nested phase information',()=>{
 const {board,session,attendance}=system(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`);attendance.mark(session,'molly','present');const m=board.project(session),set=m.blocks[0].items[0];assert.equal(m.blocks[0].items.length,1);assert.deepEqual([set.groupWork.reps,set.groupWork.distance],[16,50]);assert.equal(set.phases.length,2);assert.deepEqual(set.phases.map(x=>x.work.reps),[8,8]);assert.deepEqual(set.phases.map(x=>x.context.phaseIndex),[1,2]);assert.deepEqual(set.phases[1].targets[0].rows.map(x=>x.rep),[4,8]);assert.deepEqual(set.phases[1].targets[0].rows.map(x=>x.seconds),[30,30]);
});

test('4-round pre-set stays one compact group and summary remains a cue',()=>{
 const {board,session}=system(`Pre set\n4 Rounds:\n3 x 50 #1 @ 1:00\n2 Drill\n1 @ 200 Pace\n\n12 x 50 Total`),m=board.project(session),items=m.blocks[0].items;assert.equal(m.blocks[0].distance,600);assert.equal(items.length,2);assert.equal(items[0].kind,'group');assert.equal(items[0].rounds,4);assert.equal(items[0].scope,'local_rounds');assert.equal(items[0].items.length,1);assert.equal(items[1].kind,'cue');assert.equal(items[1].role,'summary');assert.equal(items[1].summaryMetres,600);
});

test('authored Round 1/2/3 variants remain three distinct Board groups, never one repeated group',()=>{
 const src=`Main Set — 3 Rounds\nRound 1\n5 x 100 @ 1:50\n300 Easy\n\nRound 2\n5 x 100 @ 1:40\n300 Easy\n\nRound 3\n5 x 100 @ 1:30\n300 Easy`,{board,session}=system(src),main=board.project(session).blocks[0],groups=main.items.filter(x=>x.kind==='group');
 assert.equal(groups.length,3);assert.deepEqual(groups.map(x=>x.scope),['authored_round','authored_round','authored_round']);assert.deepEqual(groups.map(x=>x.roundNumber),[1,2,3]);assert.deepEqual(groups.map(x=>x.distance),[800,800,800]);
});

test('inline patterns stay nested in one Board set row',()=>{
 const {board,session}=system('Post Set\n4 x 100 Fins · 1 Kick / 1 Free · 20s rest'),m=board.project(session),set=m.blocks[0].items[0];assert.equal(boardSets(m).length,1);assert.equal(set.distance,400);assert.equal(set.groupWork.pattern.length,2);assert.equal(set.groupWork.restSeconds,20);
});

test('composition repeat count survives projection without creating extra Board rows',()=>{
 const {board,session}=system('Warm Up\n400 as:\n100 five-count reset / 100 swim'),m=board.project(session),set=m.blocks[0].items[0];assert.equal(set.distance,400);assert.equal(set.groupWork.composition.length,2);assert.equal(set.groupWork.compositionRepeats,2);assert.equal(boardSets(m).length,1);
});

test('race intent and coach target fields are preserved, not recalculated by Board',()=>{
 const {board,session}=system('Main Set\n4 x 50 Free 200 Pace'),set=board.project(session).blocks[0].items[0];assert.equal(set.groupWork.raceIntent.distance,200);
 const session2=Truth.parse('Main Set\n4 x 50 Free',{...identity,id:'coach-target'});session2.blocks[0].items[0].targetSeconds=31.5;const m2=board.project(session2),x=m2.blocks[0].items[0];assert.equal(x.groupWork.targetSeconds,31.5);
});

test('capture markers are read-only and stay attached to exact Board line context',()=>{
 const {board,session,captures}=system('Main Set\n6 x 100 Free Development 10 sr'),b=session.blocks[0],item=b.items[0];captures.create(session,{type:'note',blockId:b.id,itemId:item.id,athleteIds:['molly'],text:'Hold line off wall'});const set=board.project(session).blocks[0].items[0];assert.equal(set.captures.count,1);assert.equal(set.captures.byType.note,1);assert.deepEqual(set.captures.items[0].athleteIds,['molly']);assert.equal(set.context.itemId,item.id);
});

test('identifier collisions progressively extend surname characters',()=>{
 const {board,session,attendance}=system('Main set\n4 x 25 Max @ 1:00');attendance.mark(session,'andy','present');attendance.mark(session,'amy','present');const labels=Object.fromEntries(board.project(session).attendance.athletes.map(x=>[x.id,x.label]));assert.equal(labels.andy,'AMc');assert.equal(labels.amy,'AMa');
});

test('deeper identifier collisions remain deterministic and unique',()=>{
 const {board,session,attendance}=system('Main set\n4 x 25 Max @ 1:00');attendance.mark(session,'mc1','present');attendance.mark(session,'mc2','present');const labels=board.project(session).attendance.athletes.map(x=>x.label);assert.equal(new Set(labels).size,2);assert.deepEqual(labels.sort(),['MCal','MCar']);
});

test('Target Engine failure is contained to target row and canonical group work still projects',()=>{
 const {attendance,adaptation,captures,session}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const badTargets={forItem(){throw new Error('target engine exploded')}};const board=Board.create({truth:Truth,attendance,adaptation,targets:badTargets,captures}),m=board.project(session),set=m.blocks[0].items[0];assert.equal(set.groupWork.reps,6);assert.equal(set.targets.length,1);assert.equal(set.targets[0].status,'error');assert(/target engine exploded/.test(set.targets[0].message));
});

test('Adaptation failure is contained and does not replace canonical group work',()=>{
 const {attendance,targets,captures,session}=system('Main set\n400 Pull');attendance.mark(session,'mk','present');const badAdapt={forItem(){throw new Error('adaptation exploded')}};const board=Board.create({truth:Truth,attendance,adaptation:badAdapt,targets,captures}),set=board.project(session).blocks[0].items[0];assert.equal(set.groupWork.distance,400);assert.equal(set.modifications.length,1);assert.equal(set.modifications[0].status,'error');assert(/adaptation exploded/.test(set.modifications[0].message));
});

test('Board projection is read-only across session attendance captures evidence and derived engines',()=>{
 const {board,session,attendance,captures,ev}=system('Main set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const b=session.blocks[0],item=b.items[0];captures.create(session,{type:'note',blockId:b.id,itemId:item.id,text:'test'});const beforeSession=JSON.stringify(session),beforeAttendance=JSON.stringify(attendance.snapshot()),beforeCaptures=JSON.stringify(captures.snapshot()),beforeEvidence=JSON.stringify(ev.results('molly',{}));board.project(session);assert.equal(JSON.stringify(session),beforeSession);assert.equal(JSON.stringify(attendance.snapshot()),beforeAttendance);assert.equal(JSON.stringify(captures.snapshot()),beforeCaptures);assert.equal(JSON.stringify(ev.results('molly',{})),beforeEvidence);
});

if(fails){console.error(`\n${fails} Board Projection regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD PROJECTION REGRESSIONS PASS');
