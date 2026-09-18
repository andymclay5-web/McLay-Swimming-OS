'use strict';
// Real coaching gap this fixes (Andy, 18 Sept 2026, answering the open question raised alongside the same-day
// cues fix -- see tests/dosage-cue-classification-20260918.cjs and msos-known-issues.md's dosage section):
// even after that fix, ~3200m of his real 4250m session -- the warm-up stroke ladder, the pre-set breakdown,
// and critically the entire 1600m post-set 4x400 IM/Freestyle/IM/Choice -- still reported Unclassified,
// because none of those lines carry ANY zone/intensity keyword anywhere (not raw, not cues, not zone). Asked
// directly whether the classifier should default entirely-untagged sets from their own structure rather than
// staying Unclassified, Andy answered with his own coaching logic: "all easy swimming would fit into Aerobic
// Capicity and/or aerobic development or regentration... a hard 400 prob is threashold, a hard 200 is prob
// cl, a hard 100 is prob 400 to 200p... max is max, atp cp for short dist... through the other anaerobic
// zones based on dist and rest" -- and explicitly chose inferring this from STRUCTURE (distance + rest), not
// requiring a keyword like "hard" to be typed.
//
// Implemented as a last-resort default inside systemFrom(), firing only when no keyword anywhere matched:
// a real distance-bearing item with a genuine authored rest (item.restSeconds, e.g. from "Rest · 20 sec" --
// distinct from a send-off/cycleSeconds interval) is treated as "worked" and classified by Andy's own named
// distance ladder (400+ -> Threshold, 200-399 -> Clearance, 100-199 -> Race pace, <100 -> Speed / Max /
// ATP-CP); an item with NO authored rest at all is treated as continuous/easy swimming -> Development. An
// item with no real distance at all (a bare fixture, a non-distance cue) is untouched -- still Unclassified,
// exactly as before this fix, since there's nothing to structurally default FROM.
//
// This test proves: (1) each rung of Andy's own distance ladder for a "worked" (rest-bearing) item; (2) a
// distance-bearing item with NO rest defaults to Development, not Unclassified; (3) an item with no distance
// at all is untouched (still Unclassified) -- no regression to the two prior fixes' own "genuinely
// unclassifiable" assertions; (4) end-to-end against Andy's REAL session text: the 1600m post-set 4x400 (his
// single biggest real load chunk, explicitly "Rest · 20 sec" on 400m rounds) now classifies as Threshold,
// Unclassified drops from 3650m all the way to 0m, and the Coach Hub/Board banner now reads "Threshold 45% ·
// Development 24%"; (5) fail-before/pass-after on the exact source change.
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

  // Andy's own named distance ladder for a "worked" (rest-bearing) item with no other keyword anywhere.
  assert.equal(D.systemFrom('',{raw:'4 x 400 IM/Free/IM/Choice',distance:400,restSeconds:20}),'Threshold',
    'a rest-bearing 400 with no other keyword must default to Threshold ("a hard 400 prob is threashold")');
  assert.equal(D.systemFrom('',{raw:'3 x 200 Choice',distance:200,restSeconds:15}),'Clearance',
    'a rest-bearing 200 with no other keyword must default to Clearance ("a hard 200 is prob cl")');
  assert.equal(D.systemFrom('',{raw:'6 x 100 Choice',distance:100,restSeconds:10}),'Race pace',
    'a rest-bearing 100 with no other keyword must default to Race pace ("a hard 100 is prob 400 to 200 pace")');
  assert.equal(D.systemFrom('',{raw:'8 x 50 Choice',distance:50,restSeconds:10}),'Speed / Max',
    'a rest-bearing sub-100 rep with no other keyword must default to Speed / Max (ATP-CP, "atp cp for short dist")');

  // No rest data at all -> continuous/easy swimming -> Development, not Unclassified.
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400,restSeconds:null}),'Development',
    'a distance-bearing item with NO authored rest must default to Development (continuous/easy swimming), not Unclassified');
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400}),'Development',
    'the same must hold when restSeconds is simply absent from the item, not just explicitly null');

  // No regression: an explicit keyword anywhere still wins outright, unaffected by this default.
  assert.equal(D.systemFrom('Overload',{raw:'4 x 400',distance:400,restSeconds:20}),'Overload',
    'an item already classifiable from a real keyword must be unaffected by the new structural default');
  assert.equal(D.systemFrom('',{raw:'4 x 100 MAX',distance:100,restSeconds:20,cues:['MAX']}),'Speed / Max',
    'an explicit MAX keyword must still win outright over the distance ladder (both agree here, but via the keyword path, not the default)');

  // No regression to the two prior fixes' own "genuinely unclassifiable" claims: an item with NO real
  // distance at all (a bare/synthetic fixture, or a genuinely non-distance line) must stay Unclassified --
  // there is nothing to structurally default FROM.
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

  const threshold=dose.systems['Threshold'];
  assert.ok(threshold,'dosage report must include a Threshold system entry');
  assert.equal(threshold.metres,1600,
    'the 1600m post-set 4x400 (his single biggest real load chunk, "Rest · 20 sec" on 400m rounds) must classify as Threshold per his own "hard 400 prob is threashold" rule');

  const development=dose.systems['Development'];
  assert.ok(development,'dosage report must include a Development system entry');
  assert.equal(development.metres,1600,
    'the warm-up ladder and pre-set/main-set lines with no authored rest must default to Development (continuous/easy swimming), not Unclassified');

  const speedMax=dose.systems['Speed / Max'];
  assert.equal(speedMax.metres,450,'the cues-fix\'s own 450m of Speed / Max work (see tests/dosage-cue-classification-20260918.cjs) must be unaffected by this separate fix');

  const ranked=Object.entries(dose.systems).filter(([,v])=>v.pctDose>0).sort((a,b)=>b[1].pctDose-a[1].pctDose);
  const banner=ranked.slice(0,2).map(([l,v])=>`${l} ${Math.round(v.pctDose)}%`).join(' · ');
  assert.equal(banner,'Threshold 45% · Development 24%',
    `the Coach Hub/Board "SESSION METHODOLOGY" banner must now read Threshold 45% · Development 24% (was Unclassified 55% · Speed / Max 24% before this fix): got "${banner}"`);

  console.log('DOSAGE_STRUCTURAL_DEFAULT_E2E_PASS');
}

function runFailBefore(){
  // Fail-before: revert systemFrom to end at the plain `return'Unclassified';` (no structural default at
  // all) and confirm the same rest-bearing 400 now wrongly reports Unclassified -- the exact gap Andy flagged.
  const fixedTail=`    if(either(/\\b(?:drill|scull|skill|techni|underwater|breakout|streamline)\\b/i))return'Skill / Technical';
    // 18 Sept 2026 (Andy, answering the "should untagged sets get a default" question raised alongside the
    // cues fix above): his own stated logic -- "all easy swimming would fit into Aerobic Capicity and/or
    // aerobic development or regentration... a hard 400 prob is threashold, a hard 200 is prob cl, a hard 100
    // is prob 400 to 200p... max is max, atp cp for short dist... through the other anaerobic zones based on
    // dist and rest" -- and he explicitly chose inferring this from STRUCTURE (distance + rest), not requiring
    // a keyword like "hard" to be typed. A real 'set' item always carries its own distance; whether it also
    // carries a genuine authored rest (item.restSeconds, parsed from e.g. "Rest · 20 sec" -- NOT the same as
    // a send-off/cycleSeconds interval) is what tells continuous/easy swimming apart from "worked" reps, per
    // Andy's own words. No keyword anywhere matched at this point, so: an item with a real authored rest is
    // "worked" -- Andy's named distance ladder decides which anaerobic-ish zone (400+->Threshold, 200-399->
    // Clearance, 100-199->Race pace, <100->Speed/Max/ATP-CP); an item with NO authored rest at all is treated
    // as continuous/easy swimming -> Development (his own "either Aerobic Capacity/Development/Regeneration is
    // fine" latitude, picking the neutral middle one). Deliberately NOT touched, since there's no real
    // calibration data for it yet: an "Overload" branch within this ladder (Andy named only the 4 anchors
    // above) -- Overload stays reachable only via its own explicit keyword until he gives a concrete case.
    // Items with no real distance at all (bare/synthetic fixtures, or a genuinely non-distance line) keep
    // returning Unclassified exactly as before -- this default only ever fires for a real, distance-bearing set.
    if(Number(item?.distance)>0){
      if(item?.restSeconds!=null&&Number(item.restSeconds)>0){
        const d=Number(item.distance);
        if(d>=400)return'Threshold';
        if(d>=200)return'Clearance';
        if(d>=100)return'Race pace';
        return'Speed / Max';
      }
      return'Development';
    }
    return'Unclassified';
  }`;
  const buggyTail=`    if(either(/\\b(?:drill|scull|skill|techni|underwater|breakout|streamline)\\b/i))return'Skill / Technical';
    return'Unclassified';
  }`;
  assert.ok(dosageSrc.includes(fixedTail),'test setup error: could not locate the fixed systemFrom tail -- its wording changed in a way this test does not expect');
  const buggySrc=dosageSrc.replace(fixedTail,buggyTail);
  assert.notEqual(buggySrc,dosageSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=dosagePath.replace(/\.js$/,'.structuraldefaultfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const D=loadDosage(tmpPath);
    assert.equal(D.systemFrom('',{raw:'4 x 400 IM/Free/IM/Choice',distance:400,restSeconds:20}),'Unclassified',
      'the buggy pre-fix source must wrongly report Unclassified for a rest-bearing 400 with no keyword -- confirms this test would have caught the real gap Andy flagged');
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
}catch(err){
  console.error(err);
  process.exit(1);
}
