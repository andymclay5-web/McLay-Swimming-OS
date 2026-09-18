'use strict';
// Real coaching failure this fixes (Andy, 17 Sept 2026): looking at a real session's "SESSION METHODOLOGY" /
// "Delivered dosage" report, 93-95% of the session's metres showed as "Unclassified" despite items plainly
// saying "Easy", carrying explicit heart-rate targets, or being short max-effort technical work ("4 x dive 15
// max"). Root cause in engines/dosage.js's systemFrom(): every keyword check tested `v||raw` -- a single
// string picked by which of the item's own `zone` field (v) and its raw authored text (raw) happened to be
// non-empty -- NOT both. Whenever an item had ANY non-empty zone value that didn't itself match a known
// keyword (a squad-authored tag spelled differently, "Technical" as a zone label, an HR-range string, or
// just a stray default), the coach's own actual description in raw text was never even looked at, silently
// discarding real classification signal sitting right there in the item's own text. This test proves: (1)
// an item whose zone value doesn't match anything but whose raw text plainly says "Easy" now correctly
// classifies as Regeneration, not Unclassified; (2) same for "max" effort work; (3) an item whose zone DOES
// match a known keyword still classifies correctly (no regression to the common case); (4) fail-before/
// pass-after on the exact source change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const dosagePath=path.join(repoRoot,'engines','dosage.js');
const realSrc=fs.readFileSync(dosagePath,'utf8');

function loadDosage(fromPath=dosagePath){
  delete require.cache[require.resolve(fromPath)];
  global.MSOS4={session:{},util:{}};
  require(fromPath);
  return global.MSOS4.dosageEngine;
}

function run(){
  const D=loadDosage();
  assert.ok(D&&typeof D.systemFrom==='function','dosage engine must load and expose systemFrom');

  // The exact shape of Andy's report: a real coaching descriptor in raw text, shadowed by an unrelated,
  // unrecognised zone value.
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'150 Easy'}),'Regeneration',
    'an item plainly saying "Easy" in its own text must classify as Regeneration even when its zone field holds an unrecognised value, not silently fall through to Unclassified');
  assert.equal(D.systemFrom('Technical',{zone:'Technical',raw:'4 x dive 15 max'}),'Speed / Max',
    'short max-effort technical work must classify as Speed / Max from its own raw text even when its zone field holds an unrecognised value');
  assert.equal(D.systemFrom('',{zone:'',raw:'2x100 #1 Build Threshold pace'}),'Threshold',
    'raw-text-only classification (no zone field at all) must keep working exactly as before');

  // No regression to the common case: a zone value that DOES match a real keyword must still win outright.
  assert.equal(D.systemFrom('Threshold',{zone:'Threshold',raw:'2x100 #1 Build'}),'Threshold',
    'an item whose zone field already correctly names a real system must still classify from that zone, unaffected by this fix');
  assert.equal(D.systemFrom('Overload',{zone:'Overload',raw:'irrelevant free text with no keywords'}),'Overload',
    'a recognised zone value must not require any matching raw text either');

  // Genuinely unclassifiable work (no recognised signal anywhere) must still report Unclassified -- this
  // fix recovers wrongly-hidden signal, it does not invent classification where none exists.
  assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'2x100 choice'}),'Unclassified',
    'an item with no recognisable keyword in EITHER its zone or its raw text must still report Unclassified');

  console.log('DOSAGE_ZONE_RAW_TEXT_FALLBACK_PASS');
}

function runFailBefore(){
  // Fail-before: revert systemFrom to the exact pre-fix `v||raw` short-circuit and confirm the same "Easy"
  // item now wrongly reports Unclassified -- the exact bug Andy hit.
  //
  // NOTE (18 Sept 2026): systemFrom() was extended twice more on top of this fix -- to also check item.cues
  // (tests/dosage-cue-classification-20260918.cjs) and to add a distance/rest structural default (tests/
  // dosage-structural-default-20260918.cjs). Rather than re-snapshotting the whole function (fragile --
  // broke twice already as later edits landed below this one), this test now reverts ONLY the single line
  // that IS its claim: the `either` predicate's OR-logic. That line's shape is unaffected by either later
  // change, so this test stays valid regardless of what else gets added to systemFrom() after it.
  const fixedLine=`const either=re=>re.test(v)||re.test(raw);`;
  const buggyLine=`const either=re=>re.test(v||raw);`;
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed `either` predicate -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=dosagePath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const D=loadDosage(tmpPath);
    assert.equal(D.systemFrom('Aerobic',{zone:'Aerobic',raw:'150 Easy'}),'Unclassified',
      'the buggy pre-fix source must wrongly report Unclassified for an item plainly saying "Easy" -- confirms this test would have caught the real bug Andy hit');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('DOSAGE_ZONE_RAW_TEXT_FALLBACK_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',dosagePath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
