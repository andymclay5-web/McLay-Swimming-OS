'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'torture',date:'2026-08-14',dayPart:'AM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,'\n ',e.stack||e.message);process.exitCode=1}}
const block=(s,type)=>s.blocks.find(b=>b.type===type);
const sets=(nodes,out=[])=>{for(const n of nodes||[]){if(n.kind==='set')out.push(n);else if(n.kind==='group')sets(n.items,out)}return out};

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

test('14 Aug delivered fixture is exactly 4220 with protected block totals',()=>{
 const s=E.parse(friday4220,id);
 assert.equal(E.totalDistance(s),4220);
 assert.equal(E.blockDistance(block(s,'warm_up')),400);
 assert.equal(E.blockDistance(block(s,'pre_set')),1200);
 assert.equal(E.blockDistance(block(s,'main_set')),1520);
 assert.equal(E.blockDistance(block(s,'post_set')),900);
 assert.equal(E.blockDistance(block(s,'warm_down')),200);
 assert.equal(s.metadata.totalMatches,true);
});

test('15m Max inside 4x25 remains within-length meaning, not extra metres',()=>{
 const s=E.parse(friday4220,id),main=block(s,'main_set'),g=main.items[0];
 const x=sets(g.items).find(v=>/with 15m Max/i.test(v.raw));
 assert(x);assert.equal(E.nodeDistance(x),100);
 assert(/15m Max/i.test(x.raw));
});

test('inline post-set patterns become structured rep patterns',()=>{
 const s=E.parse(friday4220,id),post=block(s,'post_set'),x=sets(post.items);
 assert.equal(x.length,3);
 assert.equal(x[0].pattern.length,2);assert.equal(x[0].repInstructions.length,8);
 assert.equal(x[1].pattern.length,2);assert.equal(x[1].repInstructions.length,4);assert.equal(x[1].restSeconds,20);
 assert.equal(x[2].pattern.length,3);assert.equal(x[2].repInstructions.length,3);assert.equal(x[2].restSeconds,15);
});

test('child Odd 200 Pace / Even Drill attaches rep-level meaning to parent',()=>{
 const s=E.parse('Main Set\n4 x 50 #1 @ 1:15\nOdd 200 Pace / Even Drill',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),200);
 assert.equal(x.repInstructions.length,4);
 assert.deepEqual(x.repInstructions.map(r=>r.rep),[1,2,3,4]);
 assert(x.repInstructions.filter(r=>r.rep%2===1).every(r=>r.raceIntent&&r.raceIntent.distance===200));
 assert(x.repInstructions.filter(r=>r.rep%2===0).every(r=>r.drill===true));
});

test('#1 is primary-stroke notation, never an implicit rep-1 selector',()=>{
 const s=E.parse('Main Set\n4 x 50 #1 @ 1:15',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),200);
 assert.equal(x.repInstructions.length,0);
 assert(/#1/.test(x.raw));
});

test('explicit rep reference still works when coach says Rep #1',()=>{
 const s=E.parse('Main Set\n4 x 50 #1 @ 1:15\nRep #1 Fast',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),200);
 assert(x.repInstructions.some(r=>r.rep===1&&/Fast/i.test(r.label)));
});

test('#4 + #8 remains explicit rep-specific race pace',()=>{
 const s=E.parse('Post Set\n8 x 50 Swim\n#4 + #8 @ 100 Pace',id),x=s.blocks[0].items[0];
 const race=x.repInstructions.filter(r=>r.raceIntent);
 assert.deepEqual(race.map(r=>r.rep),[4,8]);
 assert(race.every(r=>r.raceIntent.distance===100));
});

const threshold3660=`400 Choice

4 x Dive Start to 15m
Clean entry • breakout • first strokes
Walk-back recovery

6 x 50 Build @ 1:00
Progressively lift speed and aerobic load

MAIN SET — 3 ROUNDS

Round 1
5 x 100 @ 1:50
300 Easy

Round 2
5 x 100 @ 1:40
300 Easy

Round 3
5 x 100 @ 1:30–1:35
300 Easy

Aim: At or just above threshold
Hold fastest sustainable average speed
Protect stroke length, body position and turns
Use up to 2:00 where needed for quality

KICK
200 Aerobic steady
150 Build
100 Strong hold
50 Best quality
~20 sec rest between distances

TOTAL: 3,660m`;

test('23 Jul historical 3660 source keeps implicit opening work and three authored round variants',()=>{
 const s=E.parse(threshold3660,{...id,id:'3660'});
 assert.equal(E.totalDistance(s),3660);
 assert.equal(E.blockDistance(block(s,'warm_up')),760);
 assert.equal(E.blockDistance(block(s,'main_set')),2400);
 assert.equal(E.blockDistance(block(s,'kick')),500);
 const main=block(s,'main_set');
 const roundGroups=main.items.filter(n=>n.kind==='group'&&n.scope==='authored_round');
 assert.equal(roundGroups.length,3);
 assert.deepEqual(roundGroups.map(g=>E.nodeDistance(g)),[800,800,800]);
 assert.deepEqual(roundGroups.map(g=>g.roundNumber),[1,2,3]);
});

const aerobic4700=`100 Choice

8 x 50 Performance Preparation
2 Alignment
2 Connection
2 Activation
2 Performance stroke

400 as:
100 five-count reset / 100 swim x 2

MAIN — 3 ROUNDS
R1: 400 Pull
4 x 100 IM
200 #1
4 x 50 Kick descend 1–4

R2: 400 Paddles
4 x 100 IM order
200 #1
4 x 50 Kick descend 1–4

R3: 400 Swim
4 x 100 #1
200 #1
4 x 50 Kick with fins, no board
8 kicks underwater max, descend 1–4

200 Easy

TOTAL: 4,700m`;

test('22 Jul historical 4700 source keeps R1/R2/R3 as authored variants, not triple-multiplied block',()=>{
 const s=E.parse(aerobic4700,{...id,id:'4700'});
 assert.equal(E.totalDistance(s),4700);
 assert.equal(E.blockDistance(block(s,'warm_up')),900);
 assert.equal(E.blockDistance(block(s,'main_set')),3800);
 const main=block(s,'main_set'),roundGroups=main.items.filter(n=>n.kind==='group'&&n.scope==='authored_round');
 assert.equal(roundGroups.length,3);
 assert.deepEqual(roundGroups.map(g=>E.nodeDistance(g)),[1200,1200,1200]);
 assert.equal(main.items.filter(n=>n.kind==='set').reduce((n,x)=>n+E.nodeDistance(x),0),200);
});

test('400 as 100 reset / 100 swim x2 remains one 400 parent with repeated composition',()=>{
 const s=E.parse('Warm Up\n400 as:\n100 five-count reset / 100 swim',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),400);
 assert.equal(x.composition.length,2);
 assert.equal(x.compositionRepeats,2);
});

test('non-session coaching note with time and numbers does not invent metres',()=>{
 const s=E.parse('Main Set\nRemember 90 minute session tonight\nKeep HR around 150\nHold 6 kicks off each wall',id);
 assert.equal(E.totalDistance(s),0);
 const v=E.validate(s);assert.equal(v.ok,false);assert(v.errors.includes('No runnable distance'));
});

test('stable identity produces stable canonical IDs across repeated parse',()=>{
 const a=E.parse(friday4220,id),b=E.parse(friday4220,id);
 assert.equal(a.id,b.id);
 assert.deepEqual(a.blocks.map(x=>x.id),b.blocks.map(x=>x.id));
 assert.deepEqual(sets(a.blocks.flatMap(x=>x.items)).map(x=>x.id),sets(b.blocks.flatMap(x=>x.items)).map(x=>x.id));
});

test('original source is immutable evidence and written mismatch fails validation',()=>{
 const src='Warm Up\n4 x 100 Free\nTOTAL 500m',s=E.parse(src,id);
 assert.equal(s.originalSource.text,src);
 assert.equal(s.metadata.parsedTotal,400);
 assert.equal(s.metadata.totalMatches,false);
 const v=E.validate(s);assert.equal(v.ok,false);assert(v.errors.includes('Written total mismatch'));
});

test('spacing and multiplication-symbol variants are distance equivalent',()=>{
 for(const line of ['4x50 Free','4 x 50 Free','4×50 Free','4 ✕ 50 Free']){
   const s=E.parse(`Main Set\n${line}`,id);assert.equal(E.totalDistance(s),200,line);
 }
});
