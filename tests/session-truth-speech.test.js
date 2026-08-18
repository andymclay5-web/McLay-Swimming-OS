'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'speech-test',date:'2026-08-18',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'};
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function block(s,type){return s.blocks.find(b=>b.type===type)}

test('cardinal hundreds remain single distances while plural hundreds mean repetitions',()=>{
 let s=E.parse('Warm-up will be four hundred choice.',id),x=block(s,'warm_up').items[0];assert.equal(x.reps,1);assert.equal(x.distance,400);
 s=E.parse('Main set, two hundred easy.',id);x=block(s,'main_set').items[0];assert.equal(x.reps,1);assert.equal(x.distance,200);
 s=E.parse('Main set, six hundreds threshold with ten seconds rest.',id);x=block(s,'main_set').items[0];assert.equal(x.reps,6);assert.equal(x.distance,100);assert.equal(x.restSeconds,10);
});

test('rough natural session preserves intended set shapes as well as 3400 metres',()=>{
 const src='Main set, six hundreds threshold with ten seconds rest, then two hundred easy, and repeat that three times. Warm-up will be four hundred choice. After that pre-set eight fifties build on a minute. Warm-down two hundred easy.';
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),3400);const wu=block(s,'warm_up').items[0],pre=block(s,'pre_set').items[0],g=block(s,'main_set').items[0],wd=block(s,'warm_down').items[0];
 assert.deepEqual([wu.reps,wu.distance],[1,400]);assert.deepEqual([pre.reps,pre.distance],[8,50]);assert.equal(pre.cycleSeconds,60);assert.equal(g.kind,'group');assert.equal(g.rounds,3);assert.deepEqual([g.items[0].reps,g.items[0].distance],[6,100]);assert.deepEqual([g.items[1].reps,g.items[1].distance],[1,200]);assert.deepEqual([wd.reps,wd.distance],[1,200]);
});

if(fails){console.error(`\n${fails} speech regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION SPEECH REGRESSIONS PASS');
