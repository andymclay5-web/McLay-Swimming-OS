'use strict';
// Andy, Sat 21 Nov 2026, 6:56am: "reading the next line as part of the line above, unless it's bracketed ... a set of HBS,
// hands by side. That's showing as technique, which is true, but it also needs to show kick."
// His real Sat AM National session, as he first wrote it and as he had to re-word it. Proves:
//  - "4x50 #1 @200pace @ 1:15" then "1x50 drill" then "Dive start 50 #1 max": the last two are their own swims, not a
//    "1 drill / 1 dive" rotation of the 4 x 50 (they vanished, 100m short over 2 rounds);
//  - "2x100 #1" then "1 build, 1 fast @ 2:00": two reps (1 build, 1 fast) on 2:00 -- no brackets needed;
//  - "1x Dive start 50 #1 max" is 50m, and still shows as he wrote it;
//  - "12 x 50 #1 / 1 x 50 Scull / 1 x 50 Drill / 1 x 50 Swim" is still a rotation of the 12 (600m);
//  - HBS / hands by side is a Kick set that is also Technique (body alignment), however it is worded.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const FIRST="WARM-UP\n400 free\n300 back\n200 br\n100 fly\n\nPRE-SET\n8x50 hbs 10 sr\n\nMAIN SET\n2 Rounds\n400 free reg 30 sr\n2x100 #1\n1 build, 1 fast @ 2:00\n4x50 #1 @200pace @ 1:15\n50 drill\nDive start 50 #1 max";
const SAVED="WARM-UP\n400 free\n300 back\n200 br\n100 fly\n\nPRE-SET\n8x50 hbs 10 sr\n\nMAIN SET\n2 Rounds:\n  400 free reg 30 sr\n  2x100 #1 (1 build, 1 fast) @ 2:00\n  4x50 #1 @200pace @ 1:15\n  1x50 drill\n  1x Dive start 50 #1 max\nTOTAL 3100m";
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.parser&&window.MSOS4?.dosageEngine?.componentFrom&&window.MSOS4?.raceElements?.tagText,{timeout:30000});
  const read=src=>p.evaluate(src=>{const M=window.MSOS4,s=M.parser.parse(src,{course:'SCM'});const tot=n=>Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0);const rows=[];const walk=(items,m)=>{for(const n of items||[]){if(n.kind==='group'){walk(n.items,m*Math.max(1,Number(n.rounds)||1));continue}rows.push({raw:n.raw,kind:n.kind,metres:tot(n)*m,cycle:n.cycleSeconds,pattern:(n.pattern||[]).map(x=>`${x.count} ${x.text}`)})}};for(const bl of s.blocks)walk(bl.items,1);return{rows,total:rows.reduce((a,r)=>a+(r.kind==='set'?r.metres:0),0)}},src);
  for(const[name,src]of[['first',FIRST],['saved',SAVED]]){const r=await read(src);
    assert.equal(r.total,3200,`${name}: 1000 + 400 + 2 x 900: ${JSON.stringify(r.rows)}`);
    const fifty=r.rows.find(x=>/^4x50/.test(x.raw));assert.deepEqual(fifty.pattern,[],`${name}: nothing folded into the 4 x 50`);
    assert.ok(r.rows.some(x=>/drill/.test(x.raw)&&x.metres===100),`${name}: the drill 50 is its own swim each round`);
    assert.ok(r.rows.some(x=>/Dive start 50/.test(x.raw)&&x.metres===100),`${name}: the dive start 50 is its own swim each round`);}
  const first=await read(FIRST);const hundreds=first.rows.find(x=>/^2x100/.test(x.raw));
  assert.deepEqual(hundreds.pattern,['1 build','1 fast'],JSON.stringify(hundreds));assert.equal(hundreds.cycle,120,'the @ 2:00 on the rep line is the set\'s send-off');
  assert.ok((await read(SAVED)).rows.some(x=>x.raw==='1x Dive start 50 #1 max'),'his wording is what shows');
  const rot=await read('WARM-UP\n12 x 50 #1 @ 1:10\n1 x 50 Scull\n1 x 50 Drill\n1 x 50 Swim Perfect Technique');assert.equal(rot.total,600,'a true rotation still folds');
  const hbs=await p.evaluate(()=>{const M=window.MSOS4;return['8x50 hbs 10 sr','8x50 hands by side kick 10 sr','8x50 kick hands by side 10 sr','6 x 50 HBS'].map(l=>{const it=M.parser.parse('PRE-SET\n'+l,{}).blocks[0].items[0];return{l,comp:M.dosageEngine.componentFrom(it),tags:M.raceElements.tagText(l)}})});
  for(const h of hbs){assert.equal(h.comp,'Kick',JSON.stringify(h));assert.ok(h.tags.includes('kick')&&h.tags.includes('technique'),JSON.stringify(h));}
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SAT_AM_SEPARATE_SWIMS_HBS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
