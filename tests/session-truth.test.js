'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'test-session',date:'2026-08-18',dayPart:'AM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function block(s,type){return s.blocks.find(b=>b.type===type)}

console.log('Session Truth engine',E.VERSION);

test('17 Aug live 4650 session parses exactly and preserves grouped main set',()=>{
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
 const main=block(s,'main_set');assert.equal(main.items.length,1);assert.equal(main.items[0].kind,'group');assert.equal(main.items[0].rounds,3);assert.equal(E.blockDistance(main),2700);
 const post=block(s,'post_set');assert.equal(E.blockDistance(post),600);assert.equal(post.items.length,1);assert.equal(post.items[0].composition.length,3);
});

test('18 Aug Tuesday 5400 session preserves summary, rep pace and post-set phases',()=>{
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
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),5400);assert.equal(s.metadata.writtenTotal,5400);assert.equal(s.metadata.totalMatches,true);
 assert.equal(E.blockDistance(block(s,'warm_up')),1200);assert.equal(E.blockDistance(block(s,'pre_set')),600);assert.equal(E.blockDistance(block(s,'main_set')),2600);assert.equal(E.blockDistance(block(s,'post_set')),800);assert.equal(E.blockDistance(block(s,'warm_down')),200);
 const pre=block(s,'pre_set');assert.equal(pre.items[0].kind,'group');assert.equal(pre.items[0].rounds,4);assert.equal(pre.items[0].items.length,1);const p=pre.items[0].items[0];assert.equal(p.reps,3);assert.equal(p.pattern.length,2);assert.equal(p.repInstructions.find(x=>x.rep===3).raceIntent.distance,200);assert(pre.items.some(x=>x.role==='summary'&&x.summaryMetres===600));
 const main=block(s,'main_set');const im=main.items.find(x=>x.kind==='set'&&x.reps===4&&x.distance===100&&x.stroke==='IM');assert.deepEqual(im.cycleOptions,[100,110]);const bf=main.items.find(x=>x.kind==='set'&&x.reps===2&&x.distance===100);assert.equal(bf.pattern.length,2);assert.deepEqual(bf.pattern.map(x=>x.text),['Build','Fast']);
 const post=block(s,'post_set');assert.equal(post.items.length,1);const parent=post.items[0];assert.equal(parent.reps,16);assert.equal(parent.phases.length,2);assert.equal(parent.phases[0].reps,8);assert(parent.phases[0].equipment.includes('Bands'));assert(parent.phases[0].cues.includes('4 Build'));assert(parent.phases[1].cues.includes('Descend 1—4 twice'));assert.deepEqual(parent.phases[1].repInstructions.map(x=>x.rep),[4,8]);assert(parent.phases[1].repInstructions.every(x=>x.raceIntent?.distance===100));
});

test('12x50 Total is summary metadata and zero runnable metres',()=>{
 const s=E.parse(`Pre set\n4 Rounds:\n3 x 50 #1 @ 1:00\n2 Drill\n1 @ 200 Pace\n\n12 x 50 Total`,id);assert.equal(E.totalDistance(s),600);const b=block(s,'pre_set');assert.equal(b.items.at(-1).kind,'cue');assert.equal(b.items.at(-1).role,'summary');assert.equal(b.items.at(-1).summaryMetres,600);
});

test('same-distance child sets become repeating pattern only once',()=>{
 const s=E.parse(`Pre set\n12 x 50 #1 Stroke @ 1:10\n1 x 50 Scull\n1 x 50 Drill\n1 x 50 Swim`,id),b=block(s,'pre_set');assert.equal(E.blockDistance(b),600);assert.equal(b.items.length,1);assert.equal(b.items[0].pattern.length,3);assert.equal(b.items[0].phases.length,0);
});

test('inline 1 Scull / 1 Drill / 1 Swim is canonical pattern, not distance',()=>{
 const s=E.parse(`Pre set\n12 x 50 #1 Stroke @ 1:10\n1 Scull / 1 Drill / 1 Swim`,id),x=block(s,'pre_set').items[0];assert.equal(E.totalDistance(s),600);assert.equal(x.pattern.length,3);assert.equal(x.repInstructions.length,12);
});

test('equal-count child sets become one-pass phases',()=>{
 const s=E.parse(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\n#4 + #8 @ 100 Pace`,id),x=block(s,'post_set').items[0];assert.equal(E.totalDistance(s),800);assert.equal(x.phases.length,2);assert.equal(x.pattern.length,0);assert.deepEqual(x.phases[1].repInstructions.map(r=>r.rep),[4,8]);
});

test('round scope ends on blank line instead of multiplying reset work',()=>{
 const s=E.parse(`Main Set\n2 Rounds:\n4 x 100 Free Threshold 10 sr\n200 Easy\n\n100 Easy reset`,id),b=block(s,'main_set');assert.equal(b.items.length,2);assert.equal(b.items[0].kind,'group');assert.equal(E.blockDistance(b),1300);
});

test('nested local rounds are structural groups',()=>{
 const s=E.parse(`Main Set\n2 Rounds:\n3 Rounds:\n2 x 50 Free\n\n100 Easy`,id),b=block(s,'main_set');assert.equal(b.items[0].kind,'group');assert.equal(b.items[0].items[0].kind,'group');assert.equal(E.blockDistance(b),700);
});

test('bare parent distance absorbs exact composition once',()=>{
 let s=E.parse(`Warm up\n500\n300 Free\n200 Reverse IM`,id),b=block(s,'warm_up');assert.equal(E.blockDistance(b),500);assert.equal(b.items.length,1);assert.equal(b.items[0].composition.length,2);
 s=E.parse(`Warm up\n4 x 300\n200 Free\n100 Reverse IM`,id);b=block(s,'warm_up');assert.equal(E.blockDistance(b),1200);assert.equal(b.items.length,1);assert.equal(b.items[0].composition.length,2);
});

test('labelled sequential work is never swallowed as composition',()=>{
 const s=E.parse(`Main Set\n400 Pull\n200 Easy\n200 Free`,id),b=block(s,'main_set');assert.equal(E.blockDistance(b),800);assert.equal(b.items.length,3);assert.equal(b.items[0].composition.length,0);
});

test('rest and short-distance cues never create phantom metres',()=>{
 const s=E.parse(`Pre set\n4 x 25\n15m Max\n10 sr`,id),x=block(s,'pre_set').items[0];assert.equal(E.totalDistance(s),100);assert(x.cues.includes('15m Max'));assert.equal(x.restSeconds,10);
});

test('cycle shorthand survives as authored timing',()=>{
 const s=E.parse(`Main Set\n5 x 50 Build on 60\n5 x 100 IM on 1.45\n4 x 100 IM\n@ 1:40 / 1:50`,id),b=block(s,'main_set');assert.equal(b.items[0].cycleSeconds,60);assert.equal(b.items[1].cycleSeconds,105);assert.deepEqual(b.items[2].cycleOptions,[100,110]);
});

test('spoken and compact repetition grammar remains accepted',()=>{
 const s=E.parse(`Main Set\n8100s Free\n875s Choice\nthree 200s Free\nsix 50s Build on a minute\neight 25s Fast on 45`,id),b=block(s,'main_set');assert.equal(E.blockDistance(b),2500);assert.equal(b.items[3].cycleSeconds,60);assert.equal(b.items[4].cycleSeconds,45);
});

test('spoken warm down creates its own block',()=>{
 const s=E.parse(`Main Set\n5 x 100 Free\nwarm down of 200 metres`,id);assert.equal(E.totalDistance(s),700);assert.equal(s.blocks.at(-1).type,'warm_down');assert.equal(E.blockDistance(s.blocks.at(-1)),200);
});

test('odd/even and explicit rep race instructions survive canonically',()=>{
 let x=E.parse(`Main Set\n4 x 50 Free Odd 100 pace / Even Drill`,id).blocks[0].items[0];assert.equal(x.repInstructions.length,4);assert.equal(x.repInstructions[0].raceIntent.distance,100);assert.equal(x.repInstructions[1].raceIntent,null);
 x=E.parse(`Main Set\n8 x 50 Swim\n#4 + #8 @ 100 Pace`,id).blocks[0].items[0];assert.deepEqual(x.repInstructions.map(r=>r.rep),[4,8]);assert(x.repInstructions.every(r=>r.raceIntent.distance===100));
});

test('unknown coaching language is retained verbatim and contributes zero metres',()=>{
 const line='Hold shape through the final 15m and feel the water';const s=E.parse(`Main Set\n5 x 100 Free Threshold 10 sr\n${line}`,id),x=block(s,'main_set').items[0];assert.equal(E.totalDistance(s),500);assert(x.cues.includes(line));
});

test('written mismatch fails validation instead of being silently accepted',()=>{
 const s=E.parse(`Main Set\n5 x 100 Free\n600m`,id),v=E.validate(s);assert.equal(v.ok,false);assert(v.errors.includes('Written total mismatch'));
});

test('same input and identity produce stable canonical IDs',()=>{
 const src=`Main Set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy`;const a=E.parse(src,id),b=E.parse(src,id);assert.equal(a.id,b.id);assert.equal(a.blocks[0].id,b.blocks[0].id);assert.equal(a.blocks[0].items[0].id,b.blocks[0].items[0].id);assert.equal(a.blocks[0].items[0].items[0].id,b.blocks[0].items[0].items[0].id);
});

if(fails){console.error(`\n${fails} Session Truth regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION TRUTH REGRESSIONS PASS');
