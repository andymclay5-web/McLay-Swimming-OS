'use strict';
// Real coaching failure this fixes (Andy, 17 Sept 2026, real Board screenshots for Charlotte/McKenzie's AM
// session): the warm-up "400 Fr / 300 Bk / 200 Br / 100 Fr" -- a genuine ~1,000m descending stroke ladder --
// showed on the Board banner as only "400m", and Charlotte/McKenzie each showed only "250m" (their modified Fr
// leg alone) instead of ~850m. Traced to app.js's attachPostCues: any distance-led line smaller than the set
// above it, and not matching a short exclusion-keyword list (@/rest/SR/pace/MAX/build/pull/kick/scull/easy), is
// tentatively marked a 'component' pending a later merge into the parent's `composition` -- but that merge only
// fires when the components sum EXACTLY to the parent's distance. A stroke ladder never does, so the merge
// failed and -- per a documented, deliberate 9 Sept 2026 tradeoff (tests/composition-ladder-fidelity-20260909.cjs)
// -- the unmerged lines stayed visible on the Board but permanently counted 0m everywhere.
//
// Andy corrected an initial over-broad read of this bug directly: his pre-set's "400 #1 / 75 Drill / 25 Swim" is
// NOT a second instance of the same bug -- "The 75 25 is how the 400 is broken down not an extra set" (75+25=100,
// x4=400; CLAUDE.md 2.24 already covers this exact shape: "6x50 with 25 drill/25 swim is 300m, not 600m"). That
// correction is now CLAUDE.md 2.24a, confirmed with him directly: a component run that fails the exact-sum merge
// can still be an already-counted REPEATING breakdown of the parent (leave at 0m) when every line carries
// descriptive text AND the run's own sum divides evenly into the parent's distance at least twice; otherwise it's
// a genuine separate/additive swim and must be promoted to its own fully-counted item.
//
// This test proves both halves of 2.24a against the real parser: the genuine stroke ladder now counts in full,
// the genuine repeating breakdown still counts once (regression guard for Andy's own correction), the pre-
// existing "500 = 300 Free + 200 Reverse IM" exact-merge case is unaffected, and a bare-number ladder (no
// descriptive text at all) is promoted rather than swallowed -- plus fail-before/pass-after on the real fix.
//
// Harness matches tests/composition-ladder-fidelity-20260909.cjs exactly: extract app.js's parser section by its
// real source markers and run it in a VM, then load the real engines/parser-semantics.js on top, so this
// exercises the actual shipped parser, not a paraphrase.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const appPath=path.join(root,'app.js');
const app=fs.readFileSync(appPath,'utf8');
const START_MARKER="(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};";
const END_MARKER="\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};";
const start=app.indexOf(START_MARKER);
assert.ok(start>=0,'base parser section not found in app.js');
const end=app.indexOf(END_MARKER,start);
assert.ok(end>start,'base parser section end not found in app.js');

function makeUtil(){return{text:v=>String(v??'').replace(/\s+/g,' ').trim(),lines:v=>String(v??'').replace(/\r/g,'').split('\n'),hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)},stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,now:()=>'2026-09-17T07:00:00.000Z',deepFreeze:o=>o,clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'}}
function makeSession(U){const S={};S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);return S}

function loadParser(appSlice){
  const U=makeUtil(),S=makeSession(U);
  global.MSOS4={util:U,session:S};
  vm.runInThisContext(appSlice,{filename:'app-parser-section.js'});
  delete require.cache[require.resolve(path.join(root,'engines','parser-semantics.js'))];
  require(path.join(root,'engines','parser-semantics.js'));
  return{P:global.MSOS4.parser,S};
}

function run(){
  const{P,S}=loadParser(app.slice(start,end));

  // THE FIX: Andy's real warm-up ladder must now count in full -- every stroke leg is its own swim.
  const wu=P.parse('Warm up\n400 Fr\n300 Bk\n200 Br\n100 Fr',{id:'wu'});
  const wuItems=wu.blocks[0].items;
  assert.equal(wuItems.length,4,`Andy's real warm-up ladder must remain four distinct swims, not collapse or vanish: got ${wuItems.length} (${JSON.stringify(wuItems.map(x=>[x.kind,x.distance]))})`);
  assert.deepEqual(wuItems.map(x=>Number(x.distance)),[400,300,200,100],'every ladder leg must retain its own authored distance');
  assert.ok(wuItems.every(x=>x.kind==='set'),'every ladder leg must be promoted to a fully-counted set, not left as a silent 0m component');
  assert.equal(S.total(wu),1000,`the warm-up must total the real 1,000m Andy actually swims, not the 400m it was silently under-reporting: got ${S.total(wu)}`);

  // REGRESSION GUARD: Andy's own correction -- "400 #1 / 75 Drill / 25 Swim" is a repeating breakdown of the
  // SAME 400, not extra work. Must still total exactly 400, per CLAUDE.md 2.24a.
  const pre=P.parse('Warm up\n400 #1\n75 Drill\n25 Swim',{id:'pre'});
  const preItems=pre.blocks[0].items;
  assert.equal(S.total(pre),400,`"400 #1 / 75 Drill / 25 Swim" must still total 400 (a repeating 75+25 breakdown of the same 400, per Andy's own correction and CLAUDE.md 2.24a), not 500: got ${S.total(pre)}`);
  assert.equal(preItems.filter(x=>x.kind==='set').length,1,'the repeating-breakdown case must not promote the drill/swim tail into extra standalone sets');

  // Fixture sanity: the genuine exact-sum composition case (9 Sept 2026 fix) must be completely unaffected.
  const genuine=P.parse('Warm up\n500\n300 Free\n200 Reverse IM',{id:'genuine'});
  assert.equal(genuine.blocks[0].items.length,1,'the genuine "500 = 300 Free + 200 Reverse IM" breakdown must still collapse into one item');
  assert.deepEqual(genuine.blocks[0].items[0].composition.map(c=>c.distance),[300,200],'the genuine composition case must still attach both sub-distances');
  assert.equal(S.total(genuine),500,'the genuine composition case must still total 500, not 500+300+200');

  // A bare-number ladder (no descriptive text at all) must be promoted too -- text-less lines never qualify for
  // the "repeating breakdown" interpretation (that would resurrect the original 9 Sept false-merge bug), so a
  // real bare ladder now correctly counts in full rather than silently reporting only its first line.
  const ladder=P.parse('Main set\n300\n200\n100',{id:'ladder'});
  const ladderItems=ladder.blocks[0].items;
  assert.equal(ladderItems.length,3,'a bare-number descending ladder must remain three distinct lines');
  assert.ok(ladderItems.every(x=>x.kind==='set'),'a bare-number ladder with no text signal must be promoted to fully-counted sets, not left silently uncounted');
  assert.equal(S.total(ladder),600,`a genuine bare-number 300/200/100 ladder must total 600, not silently under-report: got ${S.total(ladder)}`);

  console.log('COMPONENT_LADDER_FULL_COUNT_PASS');
}

function runFailBefore(){
  // Fail-before: revert to the exact pre-fix component-push line and attachPostCues body, and confirm Andy's
  // real warm-up ladder wrongly reports only 400m -- the exact bug his screenshots showed.
  const fixedPush=`if(current&&node.distance<current.distance&&!/\\b(?:@|rest|SR|pace|MAX|build|pull|kick|scull|easy)\\b/i.test(line))push({id:node.id,kind:'component',distance:node.distance,text:U.text(single.tail),raw:line,order:node.order,_wholeSwim:node});`;
  const buggyPush=`if(current&&node.distance<current.distance&&!/\\b(?:@|rest|SR|pace|MAX|build|pull|kick|scull|easy)\\b/i.test(line))push({id:node.id,kind:'component',distance:node.distance,text:U.text(single.tail),raw:line,order:node.order});`;
  assert.ok(app.slice(start,end).includes(fixedPush),'test setup error: could not locate the fixed component-push line -- its wording changed in a way this test does not expect');

  const fixedAttach=` function attachPostCues(items){\n   for(let i=0;i<items.length;i++){\n     const parent=items[i];if(parent.kind!=='set')continue;\n     // Consecutive numeric components following a larger parent, e.g. 500 / 300 Free / 200 Reverse IM.\n     let j=i+1, comps=[];while(j<items.length&&items[j].kind==='component'){comps.push(items[j]);j++}\n     if(!comps.length)continue;\n     const sum=comps.reduce((n,c)=>n+c.distance,0);`;
  assert.ok(app.slice(start,end).includes(fixedAttach),'test setup error: could not locate the fixed attachPostCues header -- its wording changed in a way this test does not expect');

  // Build the pre-fix section by cutting attachPostCues back down to its original 9 Sept body and reverting the
  // component-push line, using the function's own brace-balance rather than a brittle exact-text match on the
  // whole (now longer) function body.
  let appSlice=app.slice(start,end);
  const marker="function attachPostCues(items){";
  const fnStart=appSlice.indexOf(marker);
  assert.ok(fnStart>=0,'test setup error: attachPostCues not found');
  let i=fnStart+marker.length,depth=1;
  for(;i<appSlice.length;i++){const c=appSlice[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  assert.equal(depth,0,'test setup error: attachPostCues body was not closed');
  const buggyAttach=`function attachPostCues(items){
   for(let i=0;i<items.length;i++){
     const parent=items[i];if(parent.kind!=='set')continue;
     // Consecutive numeric components following a larger parent, e.g. 500 / 300 Free / 200 Reverse IM.
     let j=i+1, comps=[];while(j<items.length&&items[j].kind==='component'){comps.push(items[j]);j++}
     if(comps.length&&comps.every(c=>c.distance<parent.distance&&U.text(c.text))&&Math.abs(comps.reduce((n,c)=>n+c.distance,0)-parent.distance)<.001){parent.composition.push(...comps.map(c=>({distance:c.distance,text:c.text})));items.splice(i+1,comps.length)}
   }
 }`;
  appSlice=appSlice.slice(0,fnStart)+buggyAttach+appSlice.slice(i+1);
  appSlice=appSlice.replace(fixedPush,buggyPush);

  const{P,S}=loadParser(appSlice);
  const wu=P.parse('Warm up\n400 Fr\n300 Bk\n200 Br\n100 Fr',{id:'wu-buggy'});
  assert.equal(S.total(wu),400,'the pre-fix source must wrongly total only 400m for the real warm-up ladder -- confirms this test would have caught Andy\'s exact report');

  console.log('COMPONENT_LADDER_FULL_COUNT_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',appPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
