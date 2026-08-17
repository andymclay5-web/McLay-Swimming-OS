'use strict';
const assert=require('assert');
const E=require('../engines/session-truth.js');

function test(name,fn){
  try{fn();console.log('PASS',name)}
  catch(e){console.error('FAIL',name,'\n ',e.stack||e.message);process.exitCode=1}
}

const id={id:'contract',date:'2026-08-18',dayPart:'AM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};

const tuesday=`TUESDAY AM — AEROBIC CAPACITY / REGENERATION

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

function block(session,type){return session.blocks.find(b=>b.type===type)}
function setNodes(nodes,out=[]){for(const n of nodes||[]){if(n.kind==='set')out.push(n);else if(n.kind==='group')setNodes(n.items,out)}return out}

test('Tuesday AM canonical distance is exactly 5400',()=>{
 const s=E.parse(tuesday,id);
 assert.equal(E.totalDistance(s),5400);
 assert.equal(s.metadata.writtenTotal,5400);
 assert.equal(s.metadata.totalMatches,true);
 const expected={warm_up:1200,pre_set:600,main_set:2600,post_set:800,warm_down:200};
 for(const [type,metres] of Object.entries(expected))assert.equal(E.blockDistance(block(s,type)),metres,type);
});

test('12 x 50 Total is summary metadata, never runnable distance',()=>{
 const s=E.parse(tuesday,id),pre=block(s,'pre_set');
 assert(pre.items.some(x=>x.role==='summary'&&x.summaryMetres===600));
 assert.equal(E.blockDistance(pre),600);
});

test('pre-set is one four-round group with one 3x50 parent',()=>{
 const s=E.parse(tuesday,id),pre=block(s,'pre_set'),groups=pre.items.filter(x=>x.kind==='group');
 assert.equal(groups.length,1);
 assert.equal(groups[0].rounds,4);
 assert.equal(E.nodeDistance(groups[0]),600);
 const sets=setNodes(groups[0].items);
 assert.equal(sets.length,1);
 assert.equal(sets[0].reps,3);
 assert.equal(sets[0].distance,50);
});

test('2 Drill / 1 @200 Pace becomes rep-level meaning on the 3x50',()=>{
 const s=E.parse(tuesday,id),g=block(s,'pre_set').items.find(x=>x.kind==='group'),x=setNodes(g.items)[0];
 assert.equal(x.pattern.length,2);
 assert.equal(x.pattern[0].count,2);
 assert.equal(x.pattern[0].drill,true);
 assert.equal(x.pattern[1].count,1);
 assert(x.pattern[1].raceIntent);
 assert.equal(x.pattern[1].raceIntent.distance,200);
 const rep3=x.repInstructions.find(r=>r.rep===3&&r.raceIntent);
 assert(rep3);
 assert.equal(rep3.raceIntent.distance,200);
});

test('post-set parent remains 16x50 and child 8x50s are phases, not extra distance',()=>{
 const s=E.parse(tuesday,id),post=block(s,'post_set');
 assert.equal(post.items.filter(x=>x.kind==='set').length,1);
 const p=post.items.find(x=>x.kind==='set');
 assert.equal(p.reps,16);
 assert.equal(p.distance,50);
 assert.equal(E.nodeDistance(p),800);
 assert.equal(p.phases.length,2);
 assert.equal(p.phases[0].count,8);
 assert(/Bands/i.test(p.phases[0].text));
 assert.equal(p.phases[1].count,8);
 assert(/Swim/i.test(p.phases[1].text));
});

test('Bands phase keeps 4 Build / 4 Descend structure',()=>{
 const s=E.parse(tuesday,id),p=block(s,'post_set').items.find(x=>x.kind==='set'),bands=p.phases[0];
 assert.equal(bands.pattern.length,2);
 assert.equal(bands.pattern[0].count,4);
 assert(/Build/i.test(bands.pattern[0].text));
 assert.equal(bands.pattern[1].count,4);
 assert(/Descend/i.test(bands.pattern[1].text));
});

test('Swim phase keeps #4 + #8 @100 Pace as rep-specific race intent',()=>{
 const s=E.parse(tuesday,id),p=block(s,'post_set').items.find(x=>x.kind==='set'),swim=p.phases[1];
 const raceRows=(swim.repInstructions||[]).filter(r=>r.raceIntent);
 assert.deepEqual(raceRows.map(r=>r.rep),[4,8]);
 assert(raceRows.every(r=>r.raceIntent.distance===100));
 assert((swim.cues||[]).some(x=>/#4\s*\+\s*#8/i.test(x)));
});

test('rest-only line never creates phantom metres',()=>{
 const s=E.parse('Main Set\n6 x 100 Freestyle Development\n10s Rest',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),600);
 assert.equal(x.restSeconds,10);
});

test('15m Max is cue not distance',()=>{
 const s=E.parse('Pre Set\n4 x 25 #1\n15m Max',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),100);
 assert(x.cues.includes('15m Max'));
});

test('parent composition counts once',()=>{
 const s=E.parse('Warm Up\n4 x 300\n200 Free\n100 Reverse IM',id),x=s.blocks[0].items[0];
 assert.equal(E.totalDistance(s),1200);
 assert.equal(x.composition.length,2);
 assert.equal(x.composition[0].distance,200);
 assert.equal(x.composition[1].distance,100);
});

test('heading rounds multiply local work once',()=>{
 const s=E.parse('Main Set 3 rounds\n5 x 100 Free Threshold 10 sr\n400 Easy',id);
 assert.equal(E.totalDistance(s),2700);
 assert.equal(s.blocks[0].items[0].kind,'group');
 assert.equal(s.blocks[0].items[0].rounds,3);
});

test('blank line ends rounds scope',()=>{
 const s=E.parse('Main Set\n2 Rounds:\n4 x 100 Free Threshold 10 sr\n200 Easy\n\n100 Easy Reset',id);
 assert.equal(E.totalDistance(s),1300);
 assert.equal(s.blocks[0].items.length,2);
});

test('unknown coaching language is retained verbatim',()=>{
 const line='Hold shape through the final 15m like a neck brace';
 const s=E.parse(`Main Set\n5 x 100 Free Threshold 10 sr\n${line}`,id),x=s.blocks[0].items[0];
 assert(x.cues.includes(line));
 assert.equal(E.totalDistance(s),500);
});

test('multiple authored cycles are preserved as options',()=>{
 const s=E.parse('Main Set\n4 x 100 IM Descend 1-4\n@ 1:40 / 1:50',id),x=s.blocks[0].items[0];
 assert.deepEqual(x.cycleOptions,[100,110]);
 assert.equal(x.cycleSeconds,100);
});

test('two-rep Build/Fast pattern remains attached to parent set',()=>{
 const s=E.parse('Main Set\n2 x 100 Paddles + Fins @ 2:00\n1 Build\n1 Fast',id),x=s.blocks[0].items[0];
 assert.equal(x.reps,2);
 assert.equal(x.pattern.length,2);
 assert.equal(x.pattern[0].count,1);
 assert(/Build/i.test(x.pattern[0].text));
 assert(/Fast/i.test(x.pattern[1].text));
});

test('17 Aug live session remains exactly 4650',()=>{
 const src=`Warm up\n200 fr\n200 IM\n4x50 hbs\n10 sr\n\nPre set\n5x50 #1 build on 60\n5x100 IM desc 1-5 on 1.45\n\nMain set 3 rounds\n5x100 free threshold 10 sr\n400 easy\n\nPost set\n8x75\n25 Easy\n25 Build\n25 Fast\n\n4650m`;
 const s=E.parse(src,id);
 assert.equal(E.totalDistance(s),4650);
 assert.equal(s.metadata.totalMatches,true);
});

test('Session Truth is pure: parsing does not require browser storage or athlete state',()=>{
 const s=E.parse('Main Set\n4 x 100 Free Development 10 sr',id);
 assert.equal(E.totalDistance(s),400);
 assert.equal(typeof global.localStorage,'undefined');
 assert.equal(s.blocks[0].items[0].zone,'Development');
});
