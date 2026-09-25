'use strict';
// Real gap this fixes (Andy, live, 23 Sept 2026, correcting an assumption in the 21 Sept "correction #2"
// comment in engines/dosage.js, which said the reverse HR->zone mapping "wasn't built yet since Andy hasn't
// given the exact boundary numbers for it"): "I've spent hours incorporating Clive Rushton's swim [Ontario]
// heart rate zones within the app already, so there should be some reference to Clive Rushton swim [Ontario]
// and those heart rate zones for the different aerobic intensities there. If that's not there, that's
// frustrating... it should already be there." He was right -- engines/aerobic.js already carries the exact
// table (its own RUSHTON constant: Regeneration/Development <140bpm, Overload ~150bpm, Threshold 160-165bpm,
// Clearance 165-185bpm), used there to show an HR/SR guide when no T400 evidence exists for a zone. It was
// simply never read in REVERSE for engines/dosage.js's systemFrom() -- an authored HR figure or range in a
// set's own text ("HR 165", "Heart Rate 160-165") carried no classification weight at all, which is exactly
// the gap Andy's 21 Sept "specified with a heart rate" requirement needed and the 17 Sept comment in
// dosage.js had already flagged as a real, deliberately-deferred item.
//
// Fixed by engines/dosage.js's new hrZone() helper and its call site inside systemFrom() (checked after every
// keyword, before the Development default): an authored HR figure/range anywhere in the item's own raw/cues
// text is parsed and mapped against the SAME boundaries as engines/aerobic.js's RUSHTON table (a range uses
// its midpoint). Below 140bpm resolves to Development, not Regeneration -- the table gives both zones the
// identical "<140" band, distinguished only by stroke rate, which authored session text doesn't reliably
// carry.
//
// This test proves: (0) a DRIFT GUARD -- dosage.js's hrZone() boundaries are read directly off engines/
// aerobic.js's own live RUSHTON table at test time, not just copied by hand, so if that table's numbers ever
// change, this test fails until hrZone() is updated to match, rather than silently drifting out of sync;
// (1) every rung of the mapping (Development/Overload/Threshold/Clearance) from a bare HR figure; (2) a
// range uses its midpoint; (3) both "HR <n>" and "Heart Rate <n>" phrasing are recognised, matching the same
// phrasing engines/context-engine-av.js already recognises for voice-captured HR; (4) an explicit keyword
// elsewhere in the item still wins outright over a conflicting HR figure; (5) an item with neither a keyword
// nor an HR figure is unaffected (falls through to the ordinary Development/Unclassified default); (6)
// fail-before/pass-after -- reverting to the pre-fix source (no hrZone() call at all) reproduces the exact
// gap Andy flagged: an authored "Clearance HR 170" set with no other keyword wrongly defaults to Development.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const dosagePath=path.join(root,'engines','dosage.js');
const realSrc=fs.readFileSync(dosagePath,'utf8');
const aerobicPath=path.join(root,'engines','aerobic.js');
const aerobicSrc=fs.readFileSync(aerobicPath,'utf8');

function bootDosage(src){
  const tmpPath=dosagePath.replace(/\.js$/,`.rushtonhrtest.${process.hrtime.bigint()}.tmp.js`);
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

function readLiveRushtonTable(){
  // Pull the RUSHTON table straight out of the real engines/aerobic.js source text (not a hand-copied
  // constant), so this test genuinely fails if that table's own numbers ever move without dosage.js's
  // hrZone() being updated to match.
  const m=aerobicSrc.match(/const RUSHTON=(\{[^;]+\});/);
  assert.ok(m,'test setup error: could not locate the RUSHTON table in engines/aerobic.js -- its shape changed in a way this test does not expect');
  // eslint-disable-next-line no-new-func
  const RUSHTON=new Function(`return ${m[1]}`)();
  assert.equal(RUSHTON.Threshold.hr,'160–165','drift guard: engines/aerobic.js\'s Threshold HR band moved -- update dosage.js\'s hrZone() boundaries to match before touching this test');
  assert.equal(RUSHTON.Clearance.hr,'165–185','drift guard: engines/aerobic.js\'s Clearance HR band moved -- update dosage.js\'s hrZone() boundaries to match before touching this test');
  return RUSHTON;
}

function run(){
  readLiveRushtonTable(); // drift guard -- see its own assertions above
  const D=bootDosage(realSrc);

  // Bare HR figure, no keyword: every rung of the mapping.
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 130',distance:100,restSeconds:15}),'Development',
    'below 140bpm must resolve to Development (Rushton gives Regeneration/Development the same <140 band)');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 145',distance:100,restSeconds:15}),'Overload',
    'a 140-159bpm HR figure must map to Overload, per the Rushton table\'s ~150bpm anchor');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 160',distance:100,restSeconds:15}),'Threshold',
    'a 160-164bpm HR figure must map to Threshold, per the Rushton table\'s 160-165bpm band');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 165',distance:100,restSeconds:15}),'Clearance',
    'a 165bpm+ HR figure must map to Clearance, per the Rushton table\'s 165-185bpm band -- the exact "specified with a heart rate" signal Andy asked for');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 180',distance:100,restSeconds:15}),'Clearance',
    'the top of the Clearance band must also map to Clearance');

  // A range uses its midpoint.
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 160-165',distance:100,restSeconds:15}),'Threshold',
    'an authored HR range must use its midpoint (162.5 here, still inside Threshold)');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice Heart Rate 170-180',distance:100,restSeconds:15}),'Clearance',
    '"Heart Rate" phrasing must be recognised the same as "HR", and a range firmly inside Clearance must map there');

  // Explicit keyword still wins outright over a conflicting HR figure.
  assert.equal(D.systemFrom('',{raw:'8 x 100 Clearance HR 130',distance:100,restSeconds:15}),'Clearance',
    'an explicit "clearance" keyword must win outright even when a low HR figure is also present in the same line');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Easy HR 170',distance:100,restSeconds:15}),'Regeneration',
    'an explicit "easy" keyword must win outright even when a high HR figure is also present in the same line');

  // No regression: no keyword, no HR figure -- ordinary Development default is unaffected.
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15}),'Development',
    'an item with neither a keyword nor an HR figure must be unaffected by this fix');
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'2x100 choice'}),'Unclassified',
    'an item with no distance field at all must stay Unclassified, unaffected by this fix');

  console.log('DOSAGE_RUSHTON_HR_ZONE_UNIT_PASS');
}

function runEndToEnd(){
  const D=bootDosage(realSrc);
  const session={id:'s1',identity:{},blocks:[{items:[
    {kind:'set',reps:4,distance:400,raw:'4 x 400 Choice HR 130',restSeconds:20},
    {kind:'set',reps:6,distance:150,raw:'6 x 150 Choice HR 145',restSeconds:20},
    {kind:'set',reps:8,distance:100,raw:'8 x 100 Choice HR 162',restSeconds:15},
    {kind:'set',reps:6,distance:100,raw:'6 x 100 Choice HR 170',restSeconds:15},
  ]}]};
  const dose=D.session(session,{},{delivered:false});
  assert.ok(dose.systems['Development']?.metres>0,'the HR 130 400s must land on Development');
  assert.ok(dose.systems['Overload']?.metres>0,'the HR 145 150s must land on Overload');
  assert.ok(dose.systems['Threshold']?.metres>0,'the HR 162 100s must land on Threshold');
  assert.ok(dose.systems['Clearance']?.metres>0,'the HR 170 100s must land on Clearance -- a real authored heart rate now actually drives the session methodology banner, as Andy asked');

  console.log('DOSAGE_RUSHTON_HR_ZONE_E2E_PASS');
}

function runFailBefore(){
  // Revert to the pre-fix source: strip the hrZone() call site (keep the helper function itself absent too,
  // by reverting to the exact prior tail this fix replaced).
  const fixedCallSite=`    const hr=hrZone(raw);if(hr)return hr;
    // 18 Sept 2026 (Andy, answering the "should untagged sets get a default" question raised alongside the`;
  const buggyCallSite=`    // 18 Sept 2026 (Andy, answering the "should untagged sets get a default" question raised alongside the`;
  assert.ok(realSrc.includes(fixedCallSite),'test setup error: could not locate the hrZone() call site -- its wording changed in a way this test does not expect');
  let buggySrc=realSrc.replace(fixedCallSite,buggyCallSite);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not remove the hrZone() call site');

  const D=bootDosage(buggySrc);
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice HR 170',distance:100,restSeconds:15}),'Development',
    'the pre-fix source (hrZone() never called) must reproduce the real gap -- an authored HR 170 figure with no recognised keyword wrongly falls back to Development, confirming this test would have caught it');

  console.log('DOSAGE_RUSHTON_HR_ZONE_FAILBEFORE_PASS');
}

try{
  run();
  runEndToEnd();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
  console.log('DOSAGE_RUSHTON_HR_ZONE_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
