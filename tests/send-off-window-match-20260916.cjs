'use strict';
// Real coaching failure this fixes (Andy, 16 Sept 2026 board dump + voice follow-up): "modified sessions
// send off times don't make sense... it reduced the reps but it didn't change the set timing of the set."
// Andy's stated rule for aerobic/threshold work (confirmed back to him and approved before this was built):
// a modified swimmer should land in roughly the same TOTAL TIME window as the main group, not the same
// rep count or the same frozen interval. If reps come down, the interval/send-off must go UP so
// reps x interval still lands close to the group's total set time -- it should never just stay frozen
// while reps drop, since that finishes the modified swimmer early and leaves them idle/out of sync with
// the squad. His own worked example: main group does 3x200 @3:30 (630s total); a swimmer who can't hold
// that pace should get ~2x200 @~5:15-5:40 (roughly matching that same ~630s total), not 2x200 @3:30
// (only 420s -- a full 3:30 short of the group).
//
// Distance-only reductions (reps unchanged, only per-rep distance shrinks) are deliberately NOT touched
// by this fix -- Andy confirmed that keeping the interval frozen there already preserves the same total
// group time by construction (same reps x same interval = same total, just less work inside it), which is
// exactly what he wants for that case. This is tested too, as a guard against ever "fixing" that path by
// mistake.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');

const repoRoot=path.join(__dirname,'..');
const modPath=path.join(repoRoot,'engines','modification.js');
const realSrc=fs.readFileSync(modPath,'utf8');

function bootApp(){
  global.window=global;global.scrollY=0;
  global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
  global.location={hash:'',href:'https://sendoff-test.local/'};
  global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
  require(path.join(repoRoot,'app.js'));
  require(path.join(repoRoot,'v4-correct.js'));
  require(path.join(repoRoot,'v4-poolside-core.js'));
  global.MSOSEngines={};
  global.MSOSEngines.Evidence=require(path.join(repoRoot,'engines','evidence.js'));
  global.MSOSEngines.RacePace=require(path.join(repoRoot,'engines','race-pace.js'));
  global.MSOSEngines.Aerobic=require(path.join(repoRoot,'engines','aerobic.js'));
}
bootApp();

const session={id:'s1',identity:{course:'SCM'}};
const athlete={id:'cm',full_name:'Charlotte Murphy',sex:'F',squad:'Senior'};
function baseState(){return{athletes:[athlete],adaptationOverrides:[],adaptationProfiles:[{athlete_id:'cm',default_volume_ratio:0.5,active:true}]};}

function checkAgainst(Modification){
  // Case 1: Andy's own worked example -- a plain (non-aerobic-tagged) reps-reduction fallback. Main
  // group 3x200 @3:30 (630s total). Charlotte's fixed 0.5 load ratio drops her to 2 reps; the interval
  // must be recalculated so her total time still matches the group's 630s, not stay frozen at 3:30.
  const item1={id:'i1',kind:'set',reps:3,distance:200,raw:'3 x 200 Free @ 3:30',text:'3 x 200 Free @ 3:30',stroke:'Freestyle',cycleSeconds:210,restSeconds:20,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:null};
  const adapted1=Modification.adaptItem(item1,athlete,baseState(),session);

  // Case 2: the aerobic-zone reps-reduction sub-case (the distance floor at exactly 100 architecturally
  // blocks the distance-shrink sub-case, forcing the reps-reduction path instead).
  const item2={id:'i2',kind:'set',reps:3,distance:100,raw:'3 x 100 THR @ 1:40',text:'3 x 100 THR @ 1:40',stroke:'Freestyle',cycleSeconds:100,restSeconds:15,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:null};
  const adapted2=Modification.adaptItem(item2,athlete,baseState(),session);

  return{adapted1,adapted2,item1,item2};
}

function run(){
  delete require.cache[require.resolve(modPath)];
  const Modification=require(modPath);
  const{adapted1,adapted2,item1,item2}=checkAgainst(Modification);

  assert.equal(adapted1.reps,2,'expected reps to drop 3->2 under a 0.5 load ratio');
  const groupTotal1=item1.reps*item1.cycleSeconds,modifiedTotal1=adapted1.reps*adapted1.cycleSeconds;
  assert.equal(modifiedTotal1,groupTotal1,`modified swimmer's total time (${modifiedTotal1}s) must match the main group's total time (${groupTotal1}s) instead of finishing early -- got cycleSeconds=${adapted1.cycleSeconds}`);
  assert.equal(adapted1.cycleSeconds,315,'expected the recalculated interval to be ceil5(630/2)=315s (5:15)');

  assert.equal(adapted2.reps,2,'expected reps to drop 3->2 for the aerobic reps-reduction sub-case');
  const groupTotal2=item2.reps*item2.cycleSeconds,modifiedTotal2=adapted2.reps*adapted2.cycleSeconds;
  assert.equal(modifiedTotal2,groupTotal2,`aerobic reps-reduction case: modified total (${modifiedTotal2}s) must match group total (${groupTotal2}s)`);
  assert.equal(adapted2.cycleSeconds,150,'expected the recalculated interval to be ceil5(300/2)=150s (2:30)');

  // Case 3 (guard): a DISTANCE-only reduction (reps unchanged) must still keep the interval frozen --
  // Andy explicitly confirmed this is correct as-is, since unchanged reps x unchanged interval already
  // equals the group's total time by construction. This must not regress.
  const refState={athletes:[athlete,{id:'r1',full_name:'Ref One',sex:'F',squad:'Senior'},{id:'r2',full_name:'Ref Two',sex:'F',squad:'Senior'},{id:'r3',full_name:'Ref Three',sex:'F',squad:'Senior'}],adaptationOverrides:[],adaptationProfiles:[{athlete_id:'cm',default_volume_ratio:0.5,active:true}],trainingTestTypes:[{id:'t400type',test_key:'T400',name:'T400 Freestyle'}],trainingTestResults:[
    {id:'row-cm',athlete_id:'cm',test_type_id:'t400type',result_seconds:500,stroke:'Freestyle',pool_course:'SCM'},
    {id:'row-r1',athlete_id:'r1',test_type_id:'t400type',result_seconds:250,stroke:'Freestyle',pool_course:'SCM'},
    {id:'row-r2',athlete_id:'r2',test_type_id:'t400type',result_seconds:255,stroke:'Freestyle',pool_course:'SCM'},
    {id:'row-r3',athlete_id:'r3',test_type_id:'t400type',result_seconds:245,stroke:'Freestyle',pool_course:'SCM'},
  ]};
  const item3={id:'i3',kind:'set',reps:3,distance:100,raw:'3 x 100 THR @ 1:40',text:'3 x 100 THR @ 1:40',stroke:'Freestyle',cycleSeconds:100,restSeconds:15,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:null};
  const adapted3=Modification.adaptItem(item3,athlete,refState,session);
  assert.equal(adapted3.reps,3,'guard case must keep reps unchanged (this is a distance-shrink case, not a reps-reduction case)');
  assert.equal(adapted3.distance,50,'guard case must still shrink distance 100->50 from strong relative T400 evidence');
  assert.equal(adapted3.cycleSeconds,100,'guard: distance-only reduction must keep the interval frozen at 100s (1:40) -- Andy confirmed this is correct, do not "fix" it');

  console.log('SEND_OFF_WINDOW_MATCH_PASS');
}

function runFailBefore(){
  // Fail-before: revert the two reps-reduction call sites back to their pre-fix behaviour (no interval
  // recalculation) and confirm Case 1 and Case 2 above correctly fail, proving this test would have
  // caught the missing recalculation.
  const fixed1=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,aerobicReturnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);alignReducedRepsToGroupWindow(out,item,baseReps,reps,{source:evidence?.referenceSeconds?'Relative T400':'Load fallback',reason:'Aerobic reps reduced because distance cannot shorten without losing the aerobic unit; interval recalculated so total time still matches the squad set window',confidence:evidence?.confidence||'low'});out.adaptationReason=\`\${evidence?.referenceSeconds?'Relative T400':'Load fallback'} · reps adjusted because distance cannot shorten without losing the aerobic unit · interval recalculated to match squad set time\`;out.adaptationConfidence=evidence?.confidence||'low';}}}`;
  const buggy1=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,aerobicReturnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);out.adaptationReason=\`\${evidence?.referenceSeconds?'Relative T400':'Load fallback'} · reps adjusted because distance cannot shorten without losing the aerobic unit\`;out.adaptationConfidence=evidence?.confidence||'low';}}}`;

  const fixed2=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);alignReducedRepsToGroupWindow(out,item,baseReps,reps,{source:'No fair performance evidence available',reason:'No fair performance evidence requires a shorter repeat; interval recalculated so total time still matches the squad set window',confidence:'low'});out.adaptationReason=\`Load fallback · \${baseReps}→\${reps} reps · authored \${baseDist}m repeat retained · interval recalculated to match squad set time\`;out.adaptationConfidence='low';}}}`;
  const buggy2=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);preserveAuthoredTiming(out,item,'No fair performance evidence requires a shorter repeat; preserve authored distance and adjust total work by reps');out.adaptationReason=\`Load fallback · \${baseReps}→\${reps} reps · authored \${baseDist}m repeat retained\`;out.adaptationConfidence='low';}}}`;

  const fixed3=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);out.adaptationReason=\`\${Math.round(p.ratio*100)}% load fallback · no fair performance comparator · interval recalculated to match squad set time\`;out.adaptationConfidence='low';if(Number(item.cycleSeconds)>0)alignReducedRepsToGroupWindow(out,item,baseReps,reps,{source:'No fair performance comparator available',reason:'Fallback rep reduction; interval recalculated so total time still matches the squad set window',confidence:'low'});}}`;
  const buggy3=`else{const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);out.adaptationReason=\`\${Math.round(p.ratio*100)}% load fallback · no fair performance comparator\`;out.adaptationConfidence='low';if(Number(item.cycleSeconds)>0)preserveAuthoredTiming(out,item,'Fallback rep reduction only; no evidence supports inventing a new send-off');}}`;

  assert.ok(realSrc.includes(fixed1),'test setup error: could not locate the fixed aerobic reps-reduction block -- its wording changed in a way this test does not expect');
  assert.ok(realSrc.includes(fixed2),'test setup error: could not locate the fixed non-aerobic baseDist>50 reps-reduction block -- its wording changed in a way this test does not expect');
  assert.ok(realSrc.includes(fixed3),'test setup error: could not locate the fixed generic-fallback reps-reduction block -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixed1,buggy1).replace(fixed2,buggy2).replace(fixed3,buggy3);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=modPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    delete require.cache[require.resolve(tmpPath)];
    const BuggyModification=require(tmpPath);
    const{adapted1,adapted2,item1,item2}=checkAgainst(BuggyModification);

    assert.equal(adapted1.reps,2,'sanity: buggy source must still drop reps 3->2 (only the interval recalculation should be missing)');
    assert.equal(adapted1.cycleSeconds,210,'the buggy pre-fix source must leave the interval frozen at 210s -- confirms this test would have caught the missing recalculation');
    assert.notEqual(adapted1.reps*adapted1.cycleSeconds,item1.reps*item1.cycleSeconds,'buggy source must produce a mismatched total time vs the group (the exact bug being fixed)');

    assert.equal(adapted2.reps,2,'sanity: buggy source must still drop reps 3->2 for the aerobic case too');
    assert.equal(adapted2.cycleSeconds,100,'the buggy pre-fix aerobic source must leave the interval frozen at 100s -- confirms this test would have caught it');
    assert.notEqual(adapted2.reps*adapted2.cycleSeconds,item2.reps*item2.cycleSeconds,'buggy aerobic source must also produce a mismatched total time vs the group');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('SEND_OFF_WINDOW_MATCH_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  cp.execFileSync(process.execPath,['--check',modPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
