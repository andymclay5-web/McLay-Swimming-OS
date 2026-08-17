'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'history-5700',date:'2026-08-04',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'};
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function block(s,type){return s.blocks.find(b=>b.type===type)}

test('verified 5700 structure survives as 600 / 500 / 4400 / 200',()=>{
 const src=`Warm-up
3 x 200
1 Free
1 Back
1 Breast
15s Rest

Pre-set
6 x 50
25 #1 Drill
25 #1 Swim on 1:00
8 x 25 #1 Kick
12.5 Max
12.5 Easy on 0:45

Main set
800 Regeneration Freestyle
30s Rest
2 x 400 Development
30s Rest
4 x 200 Overload
30s Rest
12 x 100 with Fins
4 Rounds:
1 - 25 Max / 75 Easy
1 - 75 Easy / 25 Underwater
1 - 25 Max / 50 Easy / 25 Max
800 Pull
Hypoxic 3 / 5 / 7

Warm-down
200 Easy
TOTAL: 5700m`;
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),5700);assert.equal(E.validate(s).ok,true);assert.deepEqual(s.blocks.map(b=>E.blockDistance(b)),[600,500,4400,200]);
 const wu=block(s,'warm_up').items[0];assert.deepEqual([wu.reps,wu.distance],[3,200]);assert.deepEqual(wu.pattern.map(x=>x.text),['Free','Back','Breast']);assert.equal(wu.restSeconds,15);
 const pre=block(s,'pre_set');assert.equal(pre.items.length,2);assert.deepEqual([pre.items[0].reps,pre.items[0].distance],[6,50]);assert.equal(pre.items[0].composition.length,2);assert.equal(pre.items[0].cycleSeconds,60);assert.deepEqual([pre.items[1].reps,pre.items[1].distance],[8,25]);assert.equal(pre.items[1].composition.length,2);assert.equal(pre.items[1].cycleSeconds,45);
 const main=block(s,'main_set');assert.equal(main.items.length,5);assert.deepEqual(main.items.slice(0,3).map(x=>x.restSeconds),[30,30,30]);const fins=main.items[3];assert.deepEqual([fins.reps,fins.distance],[12,100]);assert.equal(E.nodeDistance(fins),1200);assert.equal(fins.patternRounds,4);assert.equal(fins.pattern.length,3);assert.equal(fins.repInstructions.length,12);assert.deepEqual(fins.pattern.map(x=>x.composition.reduce((n,p)=>n+p.distance,0)),[100,100,100]);const pull=main.items[4];assert.deepEqual([pull.reps,pull.distance],[1,800]);assert(pull.cues.includes('Hypoxic 3 / 5 / 7'));
});

if(fails){console.error(`\n${fails} historical regression(s) failed`);process.exit(1)}
console.log('\nALL HISTORICAL SESSION REGRESSIONS PASS');
