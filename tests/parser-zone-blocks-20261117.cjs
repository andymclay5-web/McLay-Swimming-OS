'use strict';
// Andy, Tue 17 Nov 2026 AM: "8 250s, 4 free regeneration, then 4 IM / 50 #1 ... it wouldn't give me times until I
// changed it to just 8 250s free development ... if it's got 4 development, it's not actually picking them up as aerobic
// development work." "4 <work>" lines under a set are consecutive blocks of reps. When the blocks carry their own zone
// they are different work: the set becomes one line per block, each read exactly as if he had written it that way --
// so "4 x 250 Free Development" gets Freestyle + Development (the work that carries T400 target times). Proves:
//  - his set (Regeneration and Development versions) splits into two lines, same metres, rest carried to both;
//  - the Development block is identical in stroke / zone / rest to writing "4 x 250 Free Development 20s rest";
//  - a "#1 IM / #2 Freestyle" rotation and a "1 Scull / 1 Drill / 1 Swim" pattern are NOT split.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.parser&&window.MSOS4?.storageEngine?.ready,{timeout:30000});
  const r=await p.evaluate(()=>{const M=window.MSOS4;const parse=t=>M.parser.parse(t,{date:'2026-11-17',dayPart:'AM',squads:['National'],course:'SCM'});
    const sets=t=>{const s=parse(t);return{total:M.session.total(s),items:s.blocks.flatMap(b=>b.items).filter(i=>i.kind==='set').map(i=>({raw:i.raw,reps:i.reps,distance:i.distance,stroke:i.stroke,zone:i.zone,rest:i.restSeconds,pattern:(i.pattern||[]).length}))}};
    return{regen:sets('WARM-UP\n8 x 250 20s rest\n4 Free Regeneration\n4 IM / 50 #1'),dev:sets('MAIN SET\n8 x 250 20s rest\n4 Free Development\n4 IM / 50 #1'),
      written:sets('MAIN SET\n4 x 250 Free Development 20s rest'),rotation:sets('MAIN SET\n4 x 400\n#1 IM\n#2 Freestyle\n#3 IM\n#4 Choice'),skill:sets('WARM-UP\n12 x 50 #1 Stroke\n1 Scull\n1 Drill\n1 Swim — Perfect Technique')};});
  assert.equal(r.dev.total,2000);assert.equal(r.dev.items.length,2,JSON.stringify(r.dev));
  assert.deepEqual(r.dev.items.map(i=>[i.raw,i.reps,i.distance,i.rest]),[['4 × 250 Free Development',4,250,20],['4 × 250 IM / 50 #1',4,250,20]]);
  const w=r.written.items[0];assert.deepEqual([r.dev.items[0].stroke,r.dev.items[0].zone,r.dev.items[0].rest],[w.stroke,w.zone,w.rest]);
  assert.deepEqual([r.dev.items[0].stroke,r.dev.items[0].zone],['Freestyle','Development']);assert.equal(r.dev.items[1].stroke,'IM');
  assert.deepEqual(r.regen.items.map(i=>[i.raw,i.zone]),[['4 × 250 Free Regeneration','Regeneration'],['4 × 250 IM / 50 #1','']]);assert.equal(r.regen.total,2000);
  assert.equal(r.rotation.items.length,1);assert.equal(r.rotation.items[0].pattern,4,'a #1/#2 rotation stays one set');
  assert.equal(r.skill.items.length,1);assert.equal(r.skill.total,600,'a 1 Scull / 1 Drill / 1 Swim pattern stays one set');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('PARSER_ZONE_BLOCKS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
