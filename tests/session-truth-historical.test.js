'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
const id={id:'historical',date:'2026-08-07',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'};
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,'\n ',e.stack||e.message);process.exitCode=1}}

test('Friday dive-start shorthand 4 x Dive Start to 15m is 60m',()=>{
 const s=E.parse('Pre Set\n4 x Dive Start to 15m\nClean entry\nWalk-back recovery',id);
 assert.equal(E.totalDistance(s),60);
 const x=s.blocks[0].items[0];assert.equal(x.reps,4);assert.equal(x.distance,15);
 assert(x.cues.includes('Clean entry'));assert(x.cues.includes('Walk-back recovery'));
});

test('explicit 4 x 15m mid-pool finish is runnable 60m',()=>{
 const s=E.parse('Main Set\n4 x 15m Mid-Pool Goal Medal Finish',id);
 assert.equal(E.totalDistance(s),60);
 const x=s.blocks[0].items[0];assert.equal(x.reps,4);assert.equal(x.distance,15);
});

test('200, 5 HR is a genuine 200m line',()=>{
 const s=E.parse('Pre Set\n200, 5 HR',id);
 assert.equal(E.totalDistance(s),200);
 assert.equal(s.blocks[0].items[0].distance,200);
});

test('Friday main round totals 360m and keeps all three jobs',()=>{
 const s=E.parse(`Main Set 3 Rounds
4 x 25 #1 @ 100 Pace
4 x 15m Mid-Pool Goal Medal Finish
200, 5 HR`,id);
 assert.equal(E.totalDistance(s),1080);
 const g=s.blocks[0].items[0];assert.equal(g.kind,'group');assert.equal(g.rounds,3);assert.equal(E.nodeDistance(g),1080);
 const sets=g.items.filter(x=>x.kind==='set');assert.equal(sets.length,3);
 assert.equal(sets.reduce((n,x)=>n+E.nodeDistance(x),0),360);
});

test('6 x 150 numbered stroke allocations remain child meaning, not metres',()=>{
 const s=E.parse(`Main Set
6 x 150
2-100 fr-50bk
2-50 br-100 fr
2-50fly-50back-50br`,id);
 assert.equal(E.totalDistance(s),900);
 const x=s.blocks[0].items[0];assert.equal(x.reps,6);assert.equal(x.distance,150);
 assert.equal(s.blocks[0].items.filter(n=>n.kind==='set').length,1);
 const preserved=JSON.stringify(x);assert(/100 fr-50bk/i.test(preserved));assert(/50 br-100 fr/i.test(preserved));assert(/50fly-50back-50br/i.test(preserved));
});

test('12 x 50 Fins repeating 1/1/1 pattern counts parent once',()=>{
 const s=E.parse(`Pre Set
12 x 50 Fins
1 MSC / 1 First 15-20 Max / 1 Last 15-20 Max`,id);
 assert.equal(E.totalDistance(s),600);
 const x=s.blocks[0].items[0];assert.equal(x.pattern.length,3);assert.equal(x.repInstructions.length,12);
});

test('800 with 175 MSC / 25 Max is internal repeated composition, not +175m',()=>{
 const s=E.parse(`Main Set
800
175 MSC / 25 Max`,id);
 assert.equal(E.totalDistance(s),800);
 assert.equal(s.blocks[0].items.filter(n=>n.kind==='set').length,1);
 const x=s.blocks[0].items[0];assert(/175 MSC/.test(JSON.stringify(x)));
});

test('800 with 3-5-3-7 by 100 stays instruction only',()=>{
 const s=E.parse(`Main Set
800 Pull
3-5-3-7 by 100`,id);
 assert.equal(E.totalDistance(s),800);
 const x=s.blocks[0].items[0];assert(x.cues.some(c=>/3-5-3-7/.test(c)));
});

test('real 8 x 12.5 Max remains runnable 100m',()=>{
 const s=E.parse('Post Set\n8 x 12.5 Max',id);
 assert.equal(E.totalDistance(s),100);
});

test('numbered descriptive cue does not create phantom metres',()=>{
 const s=E.parse(`Post Set
400 Easy
1. Reset alignment before the next race block
2. Check breakout quality`,id);
 assert.equal(E.totalDistance(s),400);
 assert.equal(s.blocks[0].items.filter(n=>n.kind==='set').length,1);
});
