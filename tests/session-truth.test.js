'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const C=require('../engines/morning-coaching.js');
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,'\n ',e.stack||e.message);process.exitCode=1}}
const id={id:'test',date:'2026-08-18',dayPart:'AM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};

test('live 4650 session parses exactly',()=>{
 const src=`Warm up
200 fr
200 IM
4x50 hbs
10 sr

Pre set
5x50 #1 build on 60
5x100 IM desc 1-5 on 1.45

Main set 3 rounds
5x100 free threshold 10 sr
400 easy

Post set
8x75
25 Easy
25 Build
25 Fast

4650m`;
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),4650);assert.equal(s.metadata.writtenTotal,4650);assert.equal(s.metadata.totalMatches,true);
 const main=s.blocks.find(b=>b.type==='main_set');assert.equal(main.items.length,1);assert.equal(main.items[0].kind,'group');assert.equal(main.items[0].rounds,3);assert.equal(E.blockDistance(main),2700);
 const post=s.blocks.find(b=>b.type==='post_set');assert.equal(E.blockDistance(post),600);assert.equal(post.items.length,1);assert.equal(post.items[0].composition.length,3);
});

test('Tuesday AM 5400 session treats 12x50 Total as summary, not another set',()=>{
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
 const s=E.parse(src,id);
 assert.equal(E.totalDistance(s),5400);
 assert.equal(s.metadata.writtenTotal,5400);
 assert.equal(s.metadata.totalMatches,true);
 const warm=s.blocks.find(b=>b.type==='warm_up'),pre=s.blocks.find(b=>b.type==='pre_set'),main=s.blocks.find(b=>b.type==='main_set'),post=s.blocks.find(b=>b.type==='post_set'),wd=s.blocks.find(b=>b.type==='warm_down');
 assert.equal(E.blockDistance(warm),1200);
 assert.equal(E.blockDistance(pre),600);
 assert.equal(E.blockDistance(main),2600);
 assert.equal(E.blockDistance(post),800);
 assert.equal(E.blockDistance(wd),200);
 assert.equal(pre.items.filter(x=>x.kind==='set').length,0);
 assert.equal(pre.items.filter(x=>x.kind==='group').length,1);
 assert(pre.items.some(x=>x.role==='summary'&&x.summaryMetres===600));
});

test('12x50 repeating 1x50 pattern counts only parent distance',()=>{
 const s=E.parse(`Pre set
12 x 50 #1 Stroke @ 1:10
1 x 50 Scull
1 x 50 Drill
1 x 50 Swim`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),600);assert.equal(b.items.length,1);assert.equal(b.items[0].pattern.length,3);
});
test('inline 1 Scull / 1 Drill / 1 Swim is instruction not distance',()=>{
 const s=E.parse(`Pre set
12 x 50 #1 Stroke @ 1:10
1 Scull / 1 Drill / 1 Swim`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),600);assert.equal(b.items.length,1);assert.equal(b.items[0].pattern.length,3);
});
test('round group multiplies once',()=>{
 const s=E.parse(`Main Set
3 Rounds:
5 x 100 Freestyle Threshold 10s rest
400 Easy`,id);assert.equal(E.totalDistance(s),2700);
});
test('round scope ends on blank line',()=>{
 const s=E.parse(`Main Set
2 Rounds:
4 x 100 Free Threshold 10 sr
200 Easy

100 Easy reset`,id),b=s.blocks[0];assert.equal(b.items.length,2);assert.equal(b.items[0].kind,'group');assert.equal(E.blockDistance(b),1300);
});
test('unknown cue is retained and contributes no metres',()=>{
 const s=E.parse(`Main Set
5 x 100 Free Threshold 10 sr
Hold shape through the final 15m`,id);assert.equal(E.totalDistance(s),500);assert.equal(s.blocks[0].items[0].cues[0],'Hold shape through the final 15m');
});
test('written mismatch blocks validation',()=>{
 const s=E.parse(`Main Set
5 x 100 Free
600m`,id),v=E.validate(s);assert.equal(v.ok,false);assert(v.errors.includes('Written total mismatch'));
});
test('bare 500 breakdown is composition, not phantom metres',()=>{
 const s=E.parse(`Warm up
500
300 Free
200 Reverse IM`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),500);assert.equal(b.items.length,1);assert.equal(b.items[0].composition.length,2);
});
test('bare 400 with 4x100 breakdown is composition',()=>{
 const s=E.parse(`Warm up
400
4 x 100 Choice`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),400);assert.equal(b.items.length,1);assert.equal(b.items[0].composition.length,1);
});
test('sequential 400 Pull 200 Easy 200 Free remains sequential',()=>{
 const s=E.parse(`Main Set
400 Pull
200 Easy
200 Free`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),800);assert.equal(b.items.length,3);
});
test('15m Max after 4x25 is cue, not phantom distance',()=>{
 const s=E.parse(`Pre set
4 x 25
15m Max`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),100);assert.equal(b.items[0].cues[0],'15m Max');
});
test('compact repetition grammar 8100s and 875s',()=>{
 const s=E.parse(`Main Set
8100s Free
875s Choice`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),1400);assert.equal(b.items[0].reps,8);assert.equal(b.items[0].distance,100);assert.equal(b.items[1].reps,8);assert.equal(b.items[1].distance,75);
});
test('spoken repetition grammar and on a minute',()=>{
 const s=E.parse(`Main Set
three 200s Free
six 50s Build on a minute
eight 25s Fast on 45`,id),b=s.blocks[0];assert.equal(E.blockDistance(b),1100);assert.equal(b.items[1].cycleSeconds,60);assert.equal(b.items[2].cycleSeconds,45);
});
test('spoken warm down becomes a block',()=>{
 const s=E.parse(`Main Set
5 x 100 Free
warm down of 200 metres`,id);assert.equal(E.totalDistance(s),700);assert.equal(s.blocks.at(-1).type,'warm_down');assert.equal(E.blockDistance(s.blocks.at(-1)),200);
});
test('race intent parses @100 pace',()=>{
 const x=E.parse(`Main Set
4 x 25 Free @100 pace @ 1:00`,id).blocks[0].items[0];assert.equal(x.raceIntent.distance,100);assert.equal(x.raceIntent.workingStroke,'Freestyle');
});
test('odd/even race instruction survives',()=>{
 const x=E.parse(`Main Set
4 x 50 Free Odd 100 pace / Even Drill`,id).blocks[0].items[0];assert.equal(x.repInstructions.length,4);assert.equal(x.repInstructions[0].raceIntent.distance,100);assert.equal(x.repInstructions[1].raceIntent,null);
});
test('inline aerobic pattern expands rep zones',()=>{
 const x=E.parse(`Main Set
6 x 100 Free
1 Reg / 1 Dev / 1 OL`,id).blocks[0].items[0];assert.equal(x.repPattern.length,6);assert.deepEqual(x.repPattern.map(r=>r.zone),['Regeneration','Development','Overload','Regeneration','Development','Overload']);
});
test('Molly T400 fallback gives threshold target',()=>{
 const s=E.parse(`Main Set
5 x 100 Free Threshold 10 sr`,id),x=s.blocks[0].items[0],ath={id:'molly',full_name:'Molly McKernan',squad:'Development'};
 const r=C.targetForItem(s,x,ath,{trainingTestTypes:[],trainingTestResults:[],coachResults:[],resultsEventHistory:[],resultsPbBoard:[]});
 assert.equal(r.status,'ok');assert(Math.abs(r.seconds-83.0976)<1e-6);assert.equal(r.sendOff,95);
});
test('race pace uses loaded PB',()=>{
 const s=E.parse(`Main Set
4 x 25 Free @100 pace`,id),x=s.blocks[0].items[0],ath={id:'a',full_name:'A Swimmer',sex:'F'};
 const state={coachResults:[{athlete_id:'a',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60}],resultsEventHistory:[],resultsPbBoard:[],courseConversions:[]};
 const r=C.targetForItem(s,x,ath,state);assert.equal(r.status,'ok');assert(Math.abs(r.seconds-15)<1e-9);
});
test('Charlotte aerobic volume modifies but short quality stays together',()=>{
 const ath={id:'c',full_name:'Charlotte Murphy'},state={adaptationProfiles:[],adaptationOverrides:[]};
 let s=E.parse(`Main Set
5 x 100 Free Threshold 10 sr`,id),x=s.blocks[0].items[0],m=C.adaptItem(x,ath,state,s);assert(m.reps<5);
 s=E.parse(`Main Set
4 x 25 Max @ 1:00`,id);x=s.blocks[0].items[0];m=C.adaptItem(x,ath,state,s);assert.equal(m.reps,4);
});

test('legacy training-test evidence merges into Morning Coaching state',()=>{
 const st={athletes:[{id:'mk',full_name:'McKenzie Drage'}],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],coachResults:[]};
 C.internals.mergeLegacyEvidence(st,{training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'r',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}]});
 const a=C.t400(st.athletes[0],st,'SCM','Freestyle');assert(a);assert.equal(a.result_seconds,450.1);
});

test('T400 anchor uses latest valid result, not fastest historical result',()=>{
 const ath={id:'a',full_name:'A'},st={trainingTestTypes:[{id:'tt',test_key:'t400_freestyle'}],trainingTestResults:[{id:'old',athlete_id:'a',test_type_id:'tt',result_seconds:300,result_date:'2026-01-01',pool_course:'SCM',valid_for_anchor:true},{id:'new',athlete_id:'a',test_type_id:'tt',result_seconds:320,result_date:'2026-08-01',pool_course:'SCM',valid_for_anchor:true}]};
 assert.equal(C.t400(ath,st,'SCM','Freestyle').id,'new');
});

test('McKenzie continuous volume returns to start end in SCM',()=>{
 const ath={id:'mk',full_name:'McKenzie Drage'},st={adaptationProfiles:[],adaptationOverrides:[]};
 let s=E.parse(`Main Set
400 Pull`,id),x=s.blocks[0].items[0],m=C.adaptItem(x,ath,st,s);assert.equal(m.distance,300);
 s=E.parse(`Warm down
200 Easy Choice`,id);x=s.blocks[0].items[0];m=C.adaptItem(x,ath,st,s);assert.equal(m.distance,150);
});

test('McKenzie pattern-dependent short sets preserve the full pattern',()=>{
 const ath={id:'mk',full_name:'McKenzie Drage'},st={adaptationProfiles:[],adaptationOverrides:[]};
 let s=E.parse(`Main Set
4 x 100 IM Descend 1-4
@ 1:40`,id),x=s.blocks[0].items[0],m=C.adaptItem(x,ath,st,s);assert.equal(m.reps,4);
 s=E.parse(`Main Set
2 x 100 Paddles + Fins @ 2:00
1 Build
1 Fast`,id);x=s.blocks[0].items[0];m=C.adaptItem(x,ath,st,s);assert.equal(m.reps,2);
});