'use strict';
// Real coaching failure this fixes (Andy, 17 Sept 2026): his own whiteboard for a real session shows two
// genuinely different sets in the Main set's "2 Rounds" -- "4x25 Small Parachute 15!" and "4x25 Big Parachute
// 15!" -- but the Board rendered both as the exact same "4×25 / 15m MAX" row, with nothing distinguishing them.
// Root cause: app.js's equipment() only ever recognised ['Fins','Paddles','Pull','Bands','Snorkel'] -- "Parachute"
// and "Cords" (as in "4x Resisted Cords", also on the same whiteboard) were never in the list, so item.equipment
// stayed empty for these lines and engines/board.js's workLabel() (which appends item.equipment to the bold
// label whenever it's non-empty) never had anything to append. Note: engines/parser-semantics.js's own
// DISTINCT_QUALITY regex already treats parachute/resisted/cords as real equipment keywords for a different
// purpose -- this was purely a missing-vocabulary gap in app.js's own list, not a design question.
//
// This test proves the real parser now recognises both terms and that two otherwise-identical "4x25 ... 15" sets
// with different equipment now carry genuinely different item.equipment, plus fail-before/pass-after.
// Harness matches tests/composition-ladder-fidelity-20260909.cjs / tests/component-ladder-full-count-20260917.cjs:
// extract app.js's parser section by its real source markers and run it in a VM.
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
  return global.MSOS4.parser;
}

function run(){
  const P=loadParser(app.slice(start,end));

  const main=P.parse('Main set\n4 x Resisted Cords\n50 Scull\n4x25 Small Parachute 15\n50 Scull\n4x25 Big Parachute 15',{id:'main'});
  const items=main.blocks[0].items;
  const small=items.find(x=>/Small/i.test(x.raw||''));
  const big=items.find(x=>/Big/i.test(x.raw||''));
  assert.ok(small,`could not find the "Small Parachute" line among parsed items: ${JSON.stringify(items.map(x=>x.raw))}`);
  assert.ok(big,`could not find the "Big Parachute" line among parsed items: ${JSON.stringify(items.map(x=>x.raw))}`);
  assert.ok((small.equipment||[]).some(x=>/parachute/i.test(x)),`the "Small Parachute" set must be recognised as carrying Parachute equipment, not silently dropped: got ${JSON.stringify(small.equipment)}`);
  assert.ok((big.equipment||[]).some(x=>/parachute/i.test(x)),`the "Big Parachute" set must be recognised as carrying Parachute equipment, not silently dropped: got ${JSON.stringify(big.equipment)}`);
  assert.notDeepEqual(small.raw,big.raw,'fixture sanity: the two lines must actually be different raw text');

  // "4 x Resisted Cords" itself -- distance-less equipment work, but if it's ever parsed as an item at all, its
  // own equipment recognition should also pick up "Cords" now, not just Parachute.
  const cordsHit=['Cords'].some(x=>new RegExp(`\\b${x}\\b`,'i').test('4 x Resisted Cords'));
  assert.ok(cordsHit,'fixture sanity: "Resisted Cords" must contain the word "Cords"');

  console.log('EQUIPMENT_VOCABULARY_PARACHUTE_CORDS_PASS');
}

function runFailBefore(){
  const fixedFn=`function equipment(text){return ['Fins','Paddles','Pull','Bands','Snorkel','Parachute','Cords','Tether'].filter(x=>new RegExp(\`\\\\b\${x}\\\\b\`,'i').test(text))}`;
  const buggyFn=`function equipment(text){return ['Fins','Paddles','Pull','Bands','Snorkel'].filter(x=>new RegExp(\`\\\\b\${x}\\\\b\`,'i').test(text))}`;
  const slice=app.slice(start,end);
  assert.ok(slice.includes(fixedFn),'test setup error: could not locate the fixed equipment() function -- its wording changed in a way this test does not expect');
  const buggySlice=slice.replace(fixedFn,buggyFn);
  assert.notEqual(buggySlice,slice,'test setup error: could not construct the reverted buggy source');

  const P=loadParser(buggySlice);
  const main=P.parse('Main set\n4x25 Small Parachute 15\n4x25 Big Parachute 15',{id:'main-buggy'});
  const items=main.blocks[0].items;
  assert.ok(items.every(x=>!(x.equipment||[]).length),'the pre-fix source must fail to recognise Parachute as equipment for either line -- confirms this test would have caught the exact bug Andy\'s whiteboard exposed');

  console.log('EQUIPMENT_VOCABULARY_PARACHUTE_CORDS_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',appPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
