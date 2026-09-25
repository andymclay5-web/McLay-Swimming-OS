'use strict';
// Real coaching failure this fixes (Andy, live, 21 Sept 2026, immediately after seeing the previous fix's own
// result -- an ordinary rest-bearing 100 now classified as "Clearance" instead of "Race pace" -- his full
// instruction, verbatim): "Those one hundreds definitely wouldn't be clearance... The low key hundreds with no
// intensity gauge. They're always going to fit into regeneration or development. No, not clearance. Clearance
// is like high intensity aerobic. That's only ever going to happen if it's specified, with a heart rate or the
// word clearance. If it's a descending set... descending one to three, we might have an incorporation of up to
// clearance or threshold in there. But again, I said it's common sense around this -- you understand
// physiology, you should be able to use a little bit more logic for this. If it's got no intensity, it's going
// to be easy, so that's going to fit into regeneration [or development]."
//
// This is a full retraction of engines/dosage.js's distance+rest STRUCTURAL ladder, not only its Race-pace
// rung (already fixed once, see tests/dosage-race-pace-requires-explicit-pace-20260921.cjs -- that fix folded
// the removed Race-pace band into Clearance, which is exactly what THIS message corrects). An authored rest
// interval was never a reliable "worked/hard" signal on its own, at ANY distance -- a rest-bearing 400, 300,
// 200 or 100 is just as often an easy set broken into reps with a short recovery as it is a genuinely hard
// one. So Threshold, Clearance and Speed/Max are no longer reachable from distance+rest structure at all --
// only from an explicit signal already checked earlier in systemFrom() (a real keyword such as "threshold" /
// "clearance" / "max", or item.raceIntent for Race pace). Any real, distance-bearing item with no explicit
// signal anywhere now always resolves to Development, matching Andy's own "regeneration or development, either
// is fine" latitude for genuinely easy/untagged swimming -- rest presence no longer distinguishes anything.
//
// Deliberately NOT built here (Andy floated it as a "maybe", not a concrete rule, and it needs real per-rep
// zone data the parser doesn't populate yet -- see the 17 Sept comment in engines/dosage.js): escalating a
// descending set ("descending 1-3") toward Clearance/Threshold. Also deliberately not built: a heart-rate-range
// -> zone reverse mapping (Andy named HR as a valid Clearance signal, but hasn't given the exact boundary
// numbers for it -- a coaching call, not a code one, same as the existing Rushton Cone forward-only gap
// documented in msos-known-issues.md).
//
// This test proves: (1) every distance (50/100/150/300/400) with a real authored rest and no keyword now
// resolves to Development, not any higher zone -- the exact bug Andy just flagged, generalised across the
// whole former ladder, not just the 100m rung; (2) explicit signals (a real keyword, or item.raceIntent) still
// win outright at every distance, completely unaffected; (3) no-rest and no-distance behaviour is unaffected;
// (4) end-to-end, a real squad-shaped session spanning every former rung reports zero metres in Threshold,
// Clearance and Speed/Max, with the whole load landing on Development; (5) fail-before/pass-after against the
// immediately-prior (correction #1) source, which still escalated distance+rest into Threshold/Clearance,
// reproduces the exact "those hundreds wouldn't be clearance" bug Andy just reported.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const dosagePath=path.join(root,'engines','dosage.js');
const realSrc=fs.readFileSync(dosagePath,'utf8');

function bootDosage(src){
  const tmpPath=dosagePath.replace(/\.js$/,`.noiintensitytest.${process.hrtime.bigint()}.tmp.js`);
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

  // Every former rung of the retracted ladder, rest-bearing, no keyword: all Development now.
  for(const distance of[50,100,150,300,400]){
    assert.equal(D.systemFrom('',{raw:`${distance}m set`,distance,restSeconds:15}),'Development',
      `a rest-bearing ${distance}m item with no intensity keyword must resolve to Development, not any escalated zone -- Andy: "if it's got no intensity, it's going to be easy"`);
  }

  // Explicit signals still win outright, at every distance -- Andy's own "specified with a heart rate or the
  // word clearance" (word case) and the pre-existing keyword ladder for the others.
  assert.equal(D.systemFrom('',{raw:'6 x 100 Clearance',distance:100,restSeconds:15,cues:['Clearance']}),'Clearance',
    'an item explicitly naming "clearance" must still classify as Clearance -- exactly the signal Andy named');
  assert.equal(D.systemFrom('',{raw:'4 x 400 Threshold',distance:400,restSeconds:20,cues:['Threshold']}),'Threshold',
    'an item explicitly naming "threshold" must still classify as Threshold');
  assert.equal(D.systemFrom('',{raw:'8 x 50 MAX',distance:50,restSeconds:10,cues:['MAX']}),'Speed / Max',
    'an item explicitly naming "max" must still classify as Speed / Max');
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15,raceIntent:{target:'200 Freestyle'}}),'Race pace',
    'an item carrying item.raceIntent must still classify as Race pace');

  // No regression: no-rest and no-distance behaviour is unaffected by this correction.
  assert.equal(D.systemFrom('',{raw:'400 Freestyle',distance:400,restSeconds:null}),'Development',
    'a distance-bearing item with no rest must still default to Development');
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'2x100 choice'}),'Unclassified',
    'an item with no distance field at all must stay Unclassified');

  console.log('DOSAGE_NO_INTENSITY_DEFAULTS_TO_DEVELOPMENT_UNIT_PASS');
}

function runEndToEnd(){
  const D=bootDosage(realSrc);
  // Real squad-shaped session spanning every former rung of the retracted ladder, all rest-bearing, none
  // carrying any intensity keyword -- the exact shape Andy was looking at when he flagged this.
  const session={id:'s1',identity:{},blocks:[{items:[
    {kind:'set',reps:4,distance:400,raw:'4 x 400 Choice',restSeconds:20},
    {kind:'set',reps:3,distance:300,raw:'3 x 300 Choice',restSeconds:15},
    {kind:'set',reps:8,distance:100,raw:'8 x 100 Choice',restSeconds:15},
    {kind:'set',reps:8,distance:50,raw:'8 x 50 Choice',restSeconds:10},
  ]}]};
  const dose=D.session(session,{},{delivered:false});

  for(const zone of['Threshold','Clearance','Speed / Max','Race pace']){
    const entry=dose.systems[zone];
    assert.ok(!entry||entry.metres===0,
      `zone "${zone}" must report zero metres for this all-rest/no-keyword session -- got ${entry?.metres??0}m`);
  }
  const development=dose.systems['Development'];
  assert.ok(development,'dosage report must include a Development system entry');
  assert.equal(development.metres,dose.rawMetres,
    'the entire session must land on Development now that distance+rest structure no longer implies any escalated zone');

  console.log('DOSAGE_NO_INTENSITY_DEFAULTS_TO_DEVELOPMENT_E2E_PASS');
}

function runFailBefore(){
  // Fail-before against the IMMEDIATELY PRIOR source (this session's own correction #1, which still escalated
  // distance+rest structure into Threshold/Clearance) -- reproduces the exact bug Andy just reported: an
  // ordinary rest-bearing 100 wrongly showing as "Clearance".
  const fixedTail=`if(Number(item?.distance)>0)return'Development';
    return'Unclassified';
  }`;
  const buggyTail=`if(Number(item?.distance)>0){
      if(item?.restSeconds!=null&&Number(item.restSeconds)>0){
        const d=Number(item.distance);
        if(d>=400)return'Threshold';
        if(d>=100)return'Clearance';
        return'Speed / Max';
      }
      return'Development';
    }
    return'Unclassified';
  }`;
  assert.ok(realSrc.includes(fixedTail),'test setup error: could not locate the fixed systemFrom tail -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedTail,buggyTail);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const D=bootDosage(buggySrc);
  assert.equal(D.systemFrom('',{raw:'8 x 100 Choice',distance:100,restSeconds:15}),'Clearance',
    'the immediately-prior (correction #1) source must reproduce the exact bug Andy just flagged -- an ordinary rest-bearing 100 with no intensity gauge wrongly classifies as Clearance, confirming this test would have caught it');
  assert.equal(D.systemFrom('',{raw:'4 x 400 Choice',distance:400,restSeconds:20}),'Threshold',
    'the same prior source must also wrongly classify a rest-bearing 400 with no keyword as Threshold');

  console.log('DOSAGE_NO_INTENSITY_DEFAULTS_TO_DEVELOPMENT_FAILBEFORE_PASS');
}

try{
  run();
  runEndToEnd();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
  console.log('DOSAGE_NO_INTENSITY_DEFAULTS_TO_DEVELOPMENT_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
