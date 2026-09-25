'use strict';
// Real coaching failure this fixes (Andy, live, 21 Sept 2026, looking at a real session's SESSION METHODOLOGY
// banner reading "Race pace 55% · Threshold 23%" for a squad of ordinary aerobic 100s -- authored rest, no
// race framing, no pace notation anywhere): "There is no world those aerobic 100s should and could be race
// pace, race pace is only race pace is it is specified @ ... pace we need to use a little common sense here."
//
// Before this fix, engines/dosage.js's systemFrom() had a structural distance+rest fallback ladder (Andy's own
// 18 Sept design, see tests/dosage-structural-default-20260918.cjs) whose 100-199m rung returned the
// TRAINING-SYSTEM label "Race pace" purely from an item having a real distance of 100-199m and a real authored
// rest -- no keyword, no item.raceIntent, no pace specification of any kind required. That is exactly the
// aerobic-100s-not-race-pace bug Andy is reporting: a squad of easy/aerobic 100s with a rest between them (very
// common, unremarkable session shape) was being labelled "Race pace" by shape alone.
//
// Fixed by removing that rung entirely -- "Race pace" as a training-system classification is reachable ONLY
// via an explicit signal: item.raceIntent, or the existing keyword/pace-notation check ("race pace", "RP 2",
// "200 pace", etc. -- the same branch that already existed above the structural fallback and is UNCHANGED by
// this fix).
//
// SUPERSEDED CLAIM, kept only for history: this test originally had the removed 100-199m band fold into
// "Clearance" instead of Race pace. That was itself corrected minutes later, live, by Andy -- see
// engines/dosage.js's own 21 Sept "correction #2" comment and tests/dosage-no-intensity-defaults-to-
// development-20260921.cjs: distance+rest structure no longer implies ANY zone above Development, Clearance
// included. This file's own assertions below are updated to match that final state.
//
// This test proves: (1) a rest-bearing 100-199m item with NO explicit pace signal is not Race pace -- the exact
// bug Andy reported; (2) an item with an explicit pace keyword, or item.raceIntent, still classifies as Race
// pace -- completely unaffected, since that is the "specified @ ... pace" case Andy wants preserved; (3) other
// distances/shapes are equally unaffected by rest alone (they all resolve to Development, per the later,
// broader correction); (4) end-to-end, a real squad-shaped session of aerobic 100s with rest no longer reports
// any Race pace share at all unless a set is explicitly framed as such; (5) fail-before/pass-after against the
// exact reverted pre-fix source (the original 100-199m -> Race pace rung) reproduces the real bug.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const dosagePath=path.join(root,'engines','dosage.js');
const realSrc=fs.readFileSync(dosagePath,'utf8');

function bootDosage(src){
  const tmpPath=dosagePath.replace(/\.js$/,`.racepacetest.${process.hrtime.bigint()}.tmp.js`);
  fs.writeFileSync(tmpPath,src);
  try{
    delete require.cache[require.resolve(tmpPath)];
    global.MSOS4={session:{},util:{text:v=>String(v??'').replace(/\s+/g,' ').trim(),clone:v=>v==null?v:JSON.parse(JSON.stringify(v))}};
    global.MSOSEngines=global.MSOSEngines||{};
    require(tmpPath);
    return global.MSOS4.dosageEngine;
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

function run(){
  const D=bootDosage(realSrc);

  // The exact bug: an ordinary aerobic 100 with a real authored rest and no pace framing at all.
  assert.notEqual(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15}),'Race pace',
    'a rest-bearing 100 with no explicit pace signal must no longer default to Race pace -- Andy: "there is no world those aerobic 100s should and could be race pace"');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15}),'Development',
    'it must land on Development instead (no intensity gauge -> easy, per Andy\'s 21 Sept correction)');
  assert.equal(D.systemFrom('',{raw:'6 x 150 Freestyle',distance:150,restSeconds:20}),'Development',
    'the whole former 100-199m band (not just the 100m boundary) must land on Development, not Race pace or Clearance');

  // Explicit signals still win outright -- exactly the "specified @ ... pace" case Andy wants preserved.
  assert.equal(D.systemFrom('',{raw:'8 x 100 @ Race pace',distance:100,restSeconds:15}),'Race pace',
    'an item explicitly naming "race pace" must still classify as Race pace -- unaffected by this fix');
  assert.equal(D.systemFrom('',{raw:'8 x 100 RP 2',distance:100,restSeconds:15}),'Race pace',
    'an item with an explicit "RP <n>" notation must still classify as Race pace');
  assert.equal(D.systemFrom('',{raw:'8 x 100 @ 200 pace',distance:100,restSeconds:15}),'Race pace',
    'an item with an explicit "<n> pace" notation must still classify as Race pace');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15,raceIntent:{target:'200 Freestyle'}}),'Race pace',
    'an item carrying item.raceIntent must still classify as Race pace regardless of distance/rest shape');

  // No regression: rest alone doesn't escalate ANY distance now, and no-distance/keyword behaviour is untouched.
  assert.equal(D.systemFrom('',{raw:'4 x 400 IM/Free/IM/Choice',distance:400,restSeconds:20}),'Development',
    'a rest-bearing 400 with no keyword must also resolve to Development, not Threshold, per the broader 21 Sept correction');
  assert.equal(D.systemFrom('',{raw:'3 x 300 Choice',distance:300,restSeconds:15}),'Development',
    'a rest-bearing 300 with no keyword must also resolve to Development, not Clearance');
  assert.equal(D.systemFrom('',{raw:'8 x 50 Choice',distance:50,restSeconds:10}),'Development',
    'a rest-bearing 50 with no keyword must also resolve to Development, not Speed / Max');
  assert.equal(D.systemFrom('',{raw:'8 x 50 Choice MAX',distance:50,restSeconds:10,cues:['MAX']}),'Speed / Max',
    'an explicit MAX keyword must still win outright, at any distance');
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400,restSeconds:null}),'Development',
    'the no-rest -> Development default must be unaffected by this fix');
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'2x100 choice'}),'Unclassified',
    'an item with no distance field at all must stay Unclassified, unaffected by this fix');

  console.log('DOSAGE_RACE_PACE_REQUIRES_EXPLICIT_PACE_UNIT_PASS');
}

function runEndToEnd(){
  const D=bootDosage(realSrc);
  // A real squad-shaped set of aerobic 100s with rest, McKenzie's exact live-reported shape (no race framing).
  const session={id:'s1',identity:{},blocks:[{items:[
    {kind:'set',reps:8,distance:100,raw:'8 x 100 Choice',restSeconds:15},
    {kind:'set',reps:6,distance:150,raw:'6 x 150 Freestyle',restSeconds:20},
  ]}]};
  const state={};
  const dose=D.session(session,state,{delivered:false});
  const racePace=dose.systems['Race pace'];
  assert.ok(!racePace||racePace.metres===0,
    `a session of ordinary aerobic 100s/150s with rest and no pace framing must report zero Race pace metres -- got ${racePace?.metres??0}m, the exact "Race pace 55%" bug Andy reported`);
  const clearance=dose.systems['Clearance'];
  assert.ok(!clearance||clearance.metres===0,
    `that same load must not be classified under Clearance either (Andy's 21 Sept correction: Clearance needs an explicit signal) -- got ${clearance?.metres??0}m`);
  const development=dose.systems['Development'];
  assert.ok(development&&development.metres>0,
    'that same load must now be classified under Development instead, per Andy\'s "no intensity gauge -> regeneration or development" instruction');

  console.log('DOSAGE_RACE_PACE_REQUIRES_EXPLICIT_PACE_E2E_PASS');
}

function runFailBefore(){
  // Reconstruct the exact pre-fix ladder (100-199m -> Race pace) by editing just the code shape, independent
  // of the surrounding prose comment (rewritten twice since).
  const fixedTail=`if(Number(item?.distance)>0)return'Development';
    return'Unclassified';
  }`;
  const buggyTail=`if(Number(item?.distance)>0){
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
  assert.ok(realSrc.includes(fixedTail),'test setup error: could not locate the fixed systemFrom tail -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedTail,buggyTail);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(buggySrc.includes("if(d>=100)return'Race pace';"),'test setup error: reverted source must contain the old Race pace rung');

  const D=bootDosage(buggySrc);
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15}),'Race pace',
    'the reverted pre-fix source must reproduce the real bug -- an ordinary aerobic 100 with rest and no pace framing wrongly classifies as Race pace, confirming this test would have caught it');

  console.log('DOSAGE_RACE_PACE_REQUIRES_EXPLICIT_PACE_FAILBEFORE_PASS');
}

try{
  run();
  runEndToEnd();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
  console.log('DOSAGE_RACE_PACE_REQUIRES_EXPLICIT_PACE_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
