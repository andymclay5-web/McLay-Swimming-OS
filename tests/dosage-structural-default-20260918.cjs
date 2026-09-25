'use strict';
// Real coaching gap this fixes (Andy, 18 Sept 2026, answering the open question raised alongside the same-day
// cues fix -- see tests/dosage-cue-classification-20260918.cjs and msos-known-issues.md's dosage section):
// even after that fix, ~3200m of his real 4250m session -- the warm-up stroke ladder, the pre-set breakdown,
// and critically the entire 1600m post-set 4x400 IM/Freestyle/IM/Choice -- still reported Unclassified,
// because none of those lines carry ANY zone/intensity keyword anywhere (not raw, not cues, not zone).
//
// HISTORY (both retracted -- kept only so the file's own claims stay traceable; the code itself no longer
// carries either of these):
//   - 18 Sept 2026 original: Andy asked for a full distance+rest STRUCTURE-inferred ladder (a rest-bearing
//     item's distance alone deciding 400+->Threshold, 200-399->Clearance, 100-199->Race pace, <100->Speed/Max).
//   - 21 Sept 2026, correction #1: "Race pace" removed from that ladder (see
//     tests/dosage-race-pace-requires-explicit-pace-20260921.cjs), folded into Clearance.
//   - 21 Sept 2026, correction #2, live, direct instruction, immediately superseding correction #1's Clearance
//     result too: "Those one hundreds definitely wouldn't be clearance... The low key hundreds with no
//     intensity gauge. They're always going to fit into regeneration or development. No, not clearance.
//     Clearance is like high intensity aerobic. That's only ever going to happen if it's specified, with a
//     heart rate or the word clearance... If it's got no intensity, it's going to be easy, so that's going to
//     fit into regeneration [or development]." This retracted the WHOLE distance+rest ladder, not only its
//     Race-pace/Clearance rungs -- rest was never a reliable "worked/hard" signal on its own, at any distance.
//     See tests/dosage-no-intensity-defaults-to-development-20260921.cjs for the full current-behaviour test.
//
// What SURVIVES from the original 18 Sept fix, and what this file now actually tests: any real, distance-
// bearing item that carries no keyword anywhere (raw/zone/cues) still gets a structural default instead of
// staying Unclassified -- it just now always resolves to Development (the same "neutral middle" of Andy's own
// "Aerobic Capacity/Development/Regeneration, either is fine" latitude), regardless of rest. An item with no
// real distance at all (a bare fixture, a non-distance cue) is untouched -- still Unclassified, exactly as
// before any of this.
//
// This test proves: (1) a distance-bearing item with no keyword anywhere defaults to Development, not
// Unclassified, whether or not it carries a rest; (2) no regression -- an explicit keyword anywhere still wins
// outright; (3) an item with no distance at all stays Unclassified; (4) end-to-end against Andy's REAL session
// text: Unclassified drops from 3650m to 0m, with every previously-untagged line landing on Development; (5)
// fail-before/pass-after on the original 18 Sept gap (no default at all -> Unclassified).
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
  return global.MSOS4.parser.parse(ANDY_REAL_SESSION,{id:'andy-real-structural-default'});
}

function run(){
  const D=loadDosage();
  assert.ok(D&&typeof D.systemFrom==='function','dosage engine must load and expose systemFrom');

  // A distance-bearing item with no keyword anywhere defaults to Development -- with or without a rest.
  assert.equal(D.systemFrom('',{raw:'4 x 400 IM/Free/IM/Choice',distance:400,restSeconds:20}),'Development',
    'a rest-bearing 400 with no keyword must default to Development, not Unclassified and not Threshold (rest is not a "worked" signal on its own -- see the 21 Sept correction)');
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400,restSeconds:null}),'Development',
    'a distance-bearing item with NO authored rest must also default to Development, not Unclassified');
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400}),'Development',
    'the same must hold when restSeconds is simply absent from the item, not just explicitly null');

  // No regression: an explicit keyword anywhere still wins outright, unaffected by this default.
  assert.equal(D.systemFrom('Overload',{raw:'4 x 400',distance:400,restSeconds:20}),'Overload',
    'an item already classifiable from a real keyword must be unaffected by the structural default');
  assert.equal(D.systemFrom('',{raw:'4 x 100 MAX',distance:100,restSeconds:20,cues:['MAX']}),'Speed / Max',
    'an explicit MAX keyword must still win outright over the structural default');

  // No regression to the prior fixes' own "genuinely unclassifiable" claims: an item with NO real distance at
  // all (a bare/synthetic fixture, or a genuinely non-distance line) must stay Unclassified -- there is
  // nothing to structurally default FROM.
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'2x100 choice'}),'Unclassified',
    'an item with no distance field at all must be untouched by this default -- still Unclassified (matches tests/dosage-zone-raw-text-fallback-20260917.cjs\'s own claim)');
  assert.equal(D.systemFrom('',{raw:'200 Choice',cues:['Rest 15 sec']}),'Unclassified',
    'an item with no distance field at all must be untouched even if it happens to mention "rest" in its own text (matches tests/dosage-cue-classification-20260918.cjs\'s own claim)');
  assert.equal(D.systemFrom('',{raw:'4 x Resisted Cords',distance:0,restSeconds:20}),'Unclassified',
    'an item with a real but zero distance (e.g. dryland/equipment work with no swim distance) must not be defaulted into a zone');

  console.log('DOSAGE_STRUCTURAL_DEFAULT_UNIT_PASS');
}

function runEndToEndOnAndyRealSession(){
  const parsed=parseAndyRealSession();
  delete require.cache[require.resolve(dosagePath)];
  global.MSOSEngines=global.MSOSEngines||{};
  require(dosagePath);
  const D=global.MSOS4.dosageEngine;

  const dose=D.session(parsed,{},{delivered:false});
  assert.equal(dose.rawMetres,4250,'sanity: Andy\'s real session must still total the same 4250m computed by S.total');

  assert.equal(dose.unclassifiedMetres,0,
    'Unclassified metres must drop all the way to 0m now that every distance-bearing line in Andy\'s real session gets a structural default when nothing else classifies it');

  const development=dose.systems['Development'];
  assert.ok(development,'dosage report must include a Development system entry');
  assert.equal(development.metres,3200,
    'both the no-rest lines AND the 1600m post-set 4x400 (which has an authored rest but no intensity keyword) must land on Development now that rest no longer escalates the classification');

  const speedMax=dose.systems['Speed / Max'];
  assert.equal(speedMax.metres,450,'the cues-fix\'s own 450m of Speed / Max work (see tests/dosage-cue-classification-20260918.cjs), which comes from a real MAX keyword, must be unaffected by this fix');

  assert.ok(!dose.systems['Threshold']||dose.systems['Threshold'].metres===0,
    'no line in this session names "threshold" explicitly, so nothing should land there now that distance+rest alone no longer implies Threshold');

  const ranked=Object.entries(dose.systems).filter(([,v])=>v.pctDose>0).sort((a,b)=>b[1].pctDose-a[1].pctDose);
  const banner=ranked.slice(0,2).map(([l,v])=>`${l} ${Math.round(v.pctDose)}%`).join(' · ');
  assert.equal(banner,'Development 61% · Speed / Max 21%',
    `the Coach Hub/Board "SESSION METHODOLOGY" banner must now read Development 61% · Speed / Max 21% (no more phantom Threshold from an authored rest alone): got "${banner}"`);

  console.log('DOSAGE_STRUCTURAL_DEFAULT_E2E_PASS');
}

function runFailBefore(){
  // Fail-before: revert systemFrom to end at the plain `return'Unclassified';` (no structural default at
  // all) and confirm the same untagged 400 now wrongly reports Unclassified -- the original 18 Sept gap.
  // Matched on the code shape only (not the preceding prose comment, rewritten twice since), so this test
  // stays robust to comment wording changes; the code fragment itself is unique in the file.
  const fixedTail=`if(Number(item?.distance)>0)return'Development';
    return'Unclassified';
  }`;
  const buggyTail=`return'Unclassified';
  }`;
  assert.ok(dosageSrc.includes(fixedTail),'test setup error: could not locate the fixed systemFrom tail -- its wording changed in a way this test does not expect');
  const buggySrc=dosageSrc.replace(fixedTail,buggyTail);
  assert.notEqual(buggySrc,dosageSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=dosagePath.replace(/\.js$/,`.structuraldefaultfailbefore.${process.hrtime.bigint()}.tmp.js`);
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const D=loadDosage(tmpPath);
    assert.equal(D.systemFrom('',{raw:'4 x 400 IM/Free/IM/Choice',distance:400,restSeconds:20}),'Unclassified',
      'the buggy pre-fix source must wrongly report Unclassified for an untagged 400 -- confirms this test would have caught the original gap Andy flagged');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('DOSAGE_STRUCTURAL_DEFAULT_FAILBEFORE_PASS');
}

try{
  run();
  runEndToEndOnAndyRealSession();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
  console.log('DOSAGE_STRUCTURAL_DEFAULT_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
