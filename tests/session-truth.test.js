'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,'\n ',e.message);process.exitCode=1}}
const id={id:'test',date:'2026-08-17',dayPart:'PM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};

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

test('12x50 repeating 1x50 pattern counts only parent distance',()=>{
 const src=`Pre set
12 x 50 #1 Stroke @ 1:10
1 x 50 Scull
1 x 50 Drill
1 x 50 Swim`;
 const s=E.parse(src,id),b=s.blocks[0];assert.equal(E.blockDistance(b),600);assert.equal(b.items.length,1);assert.equal(b.items[0].pattern.length,3);
});

test('inline 1 Scull / 1 Drill / 1 Swim is instruction not distance',()=>{
 const src=`Pre set
12 x 50 #1 Stroke @ 1:10
1 Scull / 1 Drill / 1 Swim`;
 const s=E.parse(src,id),b=s.blocks[0];assert.equal(E.blockDistance(b),600);assert.equal(b.items.length,1);assert.equal(b.items[0].pattern.length,3);
});

test('round group multiplies once',()=>{
 const src=`Main Set
3 Rounds:
5 x 100 Freestyle Threshold 10s rest
400 Easy`;
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),2700);
});

test('unknown cue is retained and contributes no metres',()=>{
 const src=`Main Set
5 x 100 Free Threshold 10 sr
Hold shape through the final 15m`;
 const s=E.parse(src,id);assert.equal(E.totalDistance(s),500);assert.equal(s.blocks[0].items[0].cues[0],'Hold shape through the final 15m');
});

test('written mismatch blocks validation',()=>{
 const s=E.parse(`Main Set
5 x 100 Free
600m`,id),v=E.validate(s);assert.equal(v.ok,false);assert(v.errors.includes('Written total mismatch'));
});