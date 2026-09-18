'use strict';
// Real coaching failure this fixes (Andy, 18 Sept 2026, live Board on a real 2026-09-18 AM session): "I don't
// see this as 72% unclassified do you?" A slice of that 72% Unclassified was main-set work like:
//
//   4 x 25 Small Parachute
//   15m MAX
//
// The parser correctly keeps "15m MAX" as the item's own cue (item.cues), separate from item.raw/item.text --
// it is a real, authored intensity descriptor for that line, not noise. But engines/dosage.js's systemFrom()
// only ever checked `item.raw||item.text` (plus the passed-in zone value) -- it never looked at item.cues at
// all. So "MAX" sitting one line down was completely invisible to the classifier even though it unambiguously
// describes the effort of that line. This is the exact same root pattern as the 17 Sept zone/raw fix (real
// classification signal sitting in a field the checker didn't look at) -- extended here to also check the
// item's own authored cue text. This test proves: (1) systemFrom() now classifies an item from its cues when
// raw/zone carry no keyword; (2) no regression -- an item with a real keyword already in raw/zone is unaffected,
// and an item with no keyword anywhere (including cues) still correctly reports Unclassified; (3) end-to-end,
// feeding Andy's REAL session text through the REAL parser and REAL dosage engine, his actual 4 x 25 Small/Big
// Parachute lines (each followed by "15m MAX") now contribute 450m to Speed / Max instead of Unclassified, and
// the session's Unclassified share drops from 3650m/75.3%-of-dose to 3200m/55.0%-of-dose; (4) fail-before/
// pass-after on the exact source change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const dosagePath=path.join(root,'engines','dosage.js');
const dosageSrc=fs.readFileSync(dosagePath,'utf8');

function loadDosage(fromPath=dosagePath){
  delete require.cache[require.resolve(fromPath)];
  global.MSOS4={session:{},util:{}};
  require(fromPath);
  return global.MSOS4.dosageEngine;
}

const ANDY_REAL_SESSION=`WARM-UP
400 Freestyle
300 Backstroke
200 Breaststroke
100 Freestyle

PRE-SET
4 x Dive Start
15m MAX
200 Choice
2 x 25 Dive Start
MAX
400 #1
75 Drill
25 Swim

MAIN SET
2 Rounds:
  4 x Resisted Cords
  50 Scull
  4 x 25 Small Parachute
15m MAX
  4 x 25 Big Parachute
15m MAX
  50 Scull
  200 #1 Drill

POST-SET
4 x 400
#1 IM
#2 Freestyle
#3 IM
#4 Choice
Rest · 20 sec

WARM-DOWN
Easy Choice
TOTAL 3650m`;

function makeUtil(){return{text:v=>String(v??'').replace(/\s+/g,' ').trim(),lines:v=>String(v??'').replace(/\r/g,'').split('\n'),hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)},stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,now:()=>'2026-09-18T07:00:00.000Z',deepFreeze:o=>o,clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'}}
function makeSession(U){const S={};S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);return S}

function parseAndyRealSession(){
  const appPath=path.join(root,'app.js');
  const app=fs.readFileSync(appPath,'utf8');
  const START_MARKER="(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};";
  const END_MARKER="\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};";
  const start=app.indexOf(START_MARKER);
  assert.ok(start>=0,'base parser section not found in app.js');
  const end=app.indexOf(END_MARKER,start);
  assert.ok(end>start,'base parser section end not found in app.js');

  const U=makeUtil(),S=makeSession(U);
  global.MSOS4={util:U,session:S};
  vm.runInThisContext(app.slice(start,end),{filename:'app-parser-section.js'});
  delete require.cache[require.resolve(path.join(root,'engines','parser-semantics.js'))];
  require(path.join(root,'engines','parser-semantics.js'));
  return global.MSOS4.parser.parse(ANDY_REAL_SESSION,{id:'andy-real-cue-classification'});
}

function run(){
  const D=loadDosage();
  assert.ok(D&&typeof D.systemFrom==='function','dosage engine must load and expose systemFrom');

  // The exact shape of Andy's real main-set lines: a real intensity keyword sitting in the item's own cue,
  // not in its raw text or zone.
  assert.equal(D.systemFrom('',{raw:'4 x 25 Small Parachute',cues:['15m MAX']}),'Speed / Max',
    'an item whose own cue plainly says "MAX" must classify as Speed / Max even though neither its raw text nor its zone carries any keyword');
  assert.equal(D.systemFrom('',{raw:'150 Swim',cues:['Easy pace throughout']}),'Regeneration',
    'a cue-only "Easy" descriptor must also be picked up (not just MAX), proving this is a general cues fix, not a MAX special-case');

  // No regression: a zone or raw-text keyword must still win outright, unaffected by also checking cues.
  assert.equal(D.systemFrom('Threshold',{zone:'Threshold',raw:'2x100 #1 Build',cues:['negative split']}),'Threshold',
    'an item already classifiable from its zone must be unaffected by this fix, whatever its cues say');
  assert.equal(D.systemFrom('',{raw:'2x100 #1 Build Threshold pace',cues:[]}),'Threshold',
    'raw-text-only classification (no cues at all) must keep working exactly as before');

  // Genuinely unclassifiable work (no recognised signal anywhere, including cues) must still report
  // Unclassified -- this fix recovers wrongly-hidden signal, it does not invent classification where none exists.
  assert.equal(D.systemFrom('',{raw:'200 Choice',cues:['Rest 15 sec']}),'Unclassified',
    'an item with no recognisable keyword in its zone, raw text, OR cues must still report Unclassified');

  console.log('DOSAGE_CUE_CLASSIFICATION_UNIT_PASS');
}

function runEndToEndOnAndyRealSession(){
  const parsed=parseAndyRealSession();
  delete require.cache[require.resolve(dosagePath)];
  global.MSOSEngines=global.MSOSEngines||{};
  require(dosagePath);
  const D=global.MSOS4.dosageEngine;

  const dose=D.session(parsed,{},{delivered:false});
  assert.equal(dose.rawMetres,4250,'sanity: Andy\'s real session must still total the same 4250m computed by S.total');

  // NOTE (18 Sept 2026): a second, separate fix landed on top of this one the same day (tests/dosage-
  // structural-default-20260918.cjs, a distance/rest structural default for items with NO keyword anywhere)
  // -- so the session's overall Unclassified-% and top-2 banner are no longer THIS fix's own number to assert
  // (see that other test for the full current picture). What stays specific to the cues fix, and is asserted
  // here, is that the two "4 x 25 ... Parachute" lines' own cue-authored "15m MAX" is what puts them in Speed
  // / Max -- that classification happens on the keyword-match path, before the structural default ever runs,
  // so it is unaffected by anything added after it.
  const speedMax=dose.systems['Speed / Max'];
  assert.ok(speedMax,'dosage report must include a Speed / Max system entry once the Parachute lines are classified');
  assert.equal(speedMax.metres,450,'the two "4 x 25 ... Parachute" main-set lines (each followed by a "15m MAX" cue) across both rounds must contribute 450m to Speed / Max, recovered from Unclassified');

  console.log('DOSAGE_CUE_CLASSIFICATION_E2E_PASS');
}

function runFailBefore(){
  // Fail-before: revert systemFrom to the exact pre-fix raw/zone-only source (ignoring cues entirely) and
  // confirm the same cue-only "MAX" item now wrongly reports Unclassified -- the exact bug Andy hit.
  //
  // NOTE (18 Sept 2026): rather than re-snapshotting the whole function (fragile -- a later same-day change,
  // the structural default, was added below this one and would otherwise force yet another update here),
  // this reverts ONLY the single line that IS this fix's claim: whether `raw` is built from cues or not.
  const fixedLine=`const raw=txt([base,...(item?.cues||[])].filter(Boolean).join(' ')||v);`;
  const buggyLine=`const raw=txt(base||v);`;
  assert.ok(dosageSrc.includes(fixedLine),'test setup error: could not locate the fixed `raw` computation -- its wording changed in a way this test does not expect');
  const buggySrc=dosageSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,dosageSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=dosagePath.replace(/\.js$/,'.cuefailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const D=loadDosage(tmpPath);
    assert.equal(D.systemFrom('',{raw:'4 x 25 Small Parachute',cues:['15m MAX']}),'Unclassified',
      'the buggy pre-fix source must wrongly report Unclassified for a cue-only "MAX" item -- confirms this test would have caught the real bug Andy hit');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('DOSAGE_CUE_CLASSIFICATION_FAILBEFORE_PASS');
}

try{
  run();
  runEndToEndOnAndyRealSession();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
