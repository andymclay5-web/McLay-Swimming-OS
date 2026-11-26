'use strict';
// 27 Nov 2026 (Andy's Fri AM session: "12 x 25 @ 0:45 (1- 15m MAX, 2- Underwater)" headlined "12×25 Underwater 15m MAX
// @ 0:45" -- "bit of a parser issue on the 25s"; "3 x 100 #1 (50 Drill / 50 Swim) 15s rest" headlined the split twice;
// "(15-20m MAX)" read "20m MAX"). Proves:
//  - "1- 15m MAX, 2- Underwater" is a cycle by count (Andy: "number 1 is 15 max, then the next 2 are underwater ... and
//    so on"): the rep pattern 1 × 15m MAX then 2 × Underwater, repeating -- the same as writing those on their own lines;
//  - only when the counts go evenly into the reps;
//  - "1- 3 desc" and per-rep counts ("1 build, 1@200pace") are not taken as a rotation;
//  - the #1 split shows once, rest stays out of the headline, a written range stays a range;
//  - the session total is unchanged (2,400m).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION=['WARM-UP','600 Choice','12 x 25 @ 0:45 (1- 15m MAX, 2- Underwater)','3 x 100 #1 (50 Drill / 50 Swim) 15s rest','50 Drill / 50 Swim','','PRE-SET','4 x Dive & glide','4 x Dive & glide (Briefly) & underwater','800 Fins & Paddles MSC','','MAIN SET','4 x 25 Big Parachute + Fins (15-20m MAX)','4 x 25 Big Parachute (15-20m MAX)','4 x 25 Small Parachute (15-20m MAX)','4 x 25 Swim (15-20m MAX)','','WARM-DOWN','Loosen'].join('\n');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.boardEngine?.workLabel&&window.MSOS4?.boardEngine?.compactSequence,{timeout:30000});
  const r=await p.evaluate(src=>{const M=window.MSOS4,B=M.boardEngine,one=l=>M.parser.parse('WARM UP\n'+l,{date:'2026-11-27',dayPart:'AM',squads:['National']}).blocks[0].items[0];
    const s=M.parser.parse(src,{date:'2026-11-27',dayPart:'AM',squads:['National']}),items=s.blocks.flatMap(x=>x.items||[]).filter(x=>x.kind==='set');
    const rot=items.find(x=>x.reps===12),hundred=items.find(x=>x.reps===3),chute=items.find(x=>/Big Parachute \(/.test(x.raw));
    const desc=one('6 x 100 1- 3 desc'),perRep=one('3x50 1 build, 1@200pace, 1 max @ 1:30'),colon=one('9 x 50 1: Kick / 2: Drill @ 1:00'),uneven=one('8 x 50 1- Kick, 2- Drill');
    return{total:M.session.total(s),rotHead:B.workLabel(rot),rotSeq:B.compactSequence(rot),rotPattern:rot.pattern.map(x=>[x.count,x.text]),uneven:uneven.pattern.length,hundred:B.workLabel(hundred),under:Object.fromEntries(items.map(x=>[x.raw,B.cueText(x)])),chute:B.workLabel(chute),descPattern:desc.pattern.length,perRepPattern:perRep.pattern.length,colon:[B.workLabel(colon),B.compactSequence(colon)]};},SESSION);
  assert.equal(r.total,2400);
  assert.equal(r.rotHead,'12×25 @ 0:45',JSON.stringify(r));assert.deepEqual(r.rotPattern,[[1,'15m MAX'],[2,'Underwater']]);assert.equal(r.rotSeq,'1× 15m MAX / 2 Underwater');assert.equal(r.uneven,0,'1+2 does not go into 8');
  assert.equal(r.hundred,'3×100 #1 (50 Drill / 50 Swim)');
  assert.equal(r.chute,'4×25 Big Parachute 15-20m MAX');
  // 27 Nov 2026 (Andy, 8:04 am: "still some double up wording"): the line under a set doesn't repeat its headline
  const u=r.under;assert.equal(u['3 x 100 #1 (50 Drill / 50 Swim) 15s rest'],'Rest · 15 sec',JSON.stringify(u));
  assert.equal(u['800 Fins & Paddles MSC'],'MSC');assert.equal(u['4 x 25 Big Parachute (15-20m MAX)'],'');assert.equal(u['4 x 25 Big Parachute + Fins (15-20m MAX)'],'');assert.equal(u['4 x 25 Swim (15-20m MAX)'],'Swim');
  assert.equal(r.descPattern,0,'"1- 3 desc" is not a rotation');assert.equal(r.perRepPattern,0,'per-rep counts are not a rotation');
  assert.deepEqual(r.colon,['9×50 @ 1:00','1 Kick / 2 Drill']);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('INLINE_ROTATION_HEADLINE_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
