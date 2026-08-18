'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'protected-fixture',date:'2026-08-07',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'};
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function block(s,type){return s.blocks.find(b=>b.type===type)}

test('protected Friday canonical structure is 4740 with a 3 x 360 main set',()=>{
 // Reconstructed from the validated canonical fixture. This is deliberately a
 // structural regression, not a claim that these are the original raw words.
 const src=`Warm-up
1800 Choice

Pre-set
4 x 15 Dive Start — Max
200 5 HR
200 Easy

Main set
3 Rounds:
4 x 25 #1 @ 100 Pace
4 x 15 Mid-Pool Goal Medal Finish
200 5 HR

Post-set
3 x 400 Choice
1 Minimum Stroke Count
2 Build Through
3 Strong Finish

Warm-down
200 Easy
TOTAL: 4740m`;
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),4740);assert.equal(E.validate(s).ok,true);
 assert.deepEqual(s.blocks.map(b=>E.blockDistance(b)),[1800,460,1080,1200,200]);
 const main=block(s,'main_set');assert.equal(main.items.length,1);assert.equal(main.items[0].kind,'group');assert.equal(main.items[0].rounds,3);assert.equal(E.nodeDistance(main.items[0]),1080);assert.deepEqual(main.items[0].items.map(x=>E.nodeDistance(x)),[100,60,200]);
 const pre=block(s,'pre_set');assert.deepEqual(pre.items.map(x=>E.nodeDistance(x)),[60,200,200]);
 const post=block(s,'post_set');assert.equal(E.blockDistance(post),1200);assert.equal(post.items.length,1);assert.equal(post.items[0].reps,3);assert.equal(post.items[0].distance,400);assert.deepEqual(post.items[0].pattern.map(x=>x.text),['Minimum Stroke Count','Build Through','Strong Finish']);
});

test('compact-lingo numeric cues do not create phantom metres while 8 x 12.5 stays runnable',()=>{
 // These instruction strings were explicitly protected by the v3.20.12 field fixture.
 const src=`Warm-up
1000 Choice
2-100 fr-50bk
2-50 br-100 fr
2-50fly50-back-50br

Pre-set
500 Choice
8 x 12.5 Max on 0:45
1msc
1 1st 15-20 max
1 last 15-20 max
175 msc-25 max

Main set
3200 Choice
3-5-3-7 by 100

Warm-down
200 Easy
TOTAL: 5000m`;
 const s=E.parse(src,{...id,id:'protected-5000',date:'2026-08-11'});assert.equal(E.totalDistance(s),5000);assert.equal(E.validate(s).ok,true);assert.deepEqual(s.blocks.map(b=>E.blockDistance(b)),[1000,600,3200,200]);
 const pre=block(s,'pre_set');const runnable12=pre.items.find(x=>x.kind==='set'&&x.reps===8&&x.distance===12.5);assert(runnable12);assert.equal(E.nodeDistance(runnable12),100);assert.equal(runnable12.cycleSeconds,45);
 const flattened=JSON.stringify(s);for(const cue of ['2-100 fr-50bk','2-50 br-100 fr','2-50fly50-back-50br','1msc','1 1st 15-20 max','1 last 15-20 max','175 msc-25 max','3-5-3-7 by 100'])assert(flattened.includes(cue),`missing cue ${cue}`);
});

if(fails){console.error(`\n${fails} protected regression(s) failed`);process.exit(1)}
console.log('\nALL PROTECTED SESSION REGRESSIONS PASS');
