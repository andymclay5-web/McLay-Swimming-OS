'use strict';
// Real coaching failure this fixes (Andy, live, 21 Sept 2026, direct instruction): "mckenzies kick times
// need to change, why would we reduce reps if she was capable of going on the same send off." Before this
// fix, engines/modification.js's adaptItem() had a McKenzie-specific rule that ran AFTER the general
// reps-reduction logic had already correctly computed both a reduced rep count (12->8, matching her real
// live screen) and a proportionally longer interval (via alignReducedRepsToGroupWindow -- the same
// "fewer reps, longer interval, same total squad-window time" rule every other swimmer's kick set already
// gets) -- and unconditionally called preserveAuthoredTiming() to silently overwrite that correct interval
// back to the original, unchanged send-off. Her own rep count changing at all is the engine's own signal
// that she could not hold the full volume at that send-off; locking the interval afterward directly
// contradicted the reason the reps were reduced in the first place.
//
// Fixed by removing the McKenzie-specific override entirely -- her 50m kicks now go through the exact same
// general fallback every other swimmer's kick set already uses. This test proves: (a) with the fix, a real
// 12x50 kick item at her real default 2/3 load ratio reduces to 8 reps AND lengthens the interval (matching
// the real observed 12x50 @1:10 -> 8x50 case, where 12*70/8=105s -- a real interval increase, not the
// original 70s); (b) fail-before/pass-after against the exact reverted pre-fix source reproduces the real
// bug (reps reduce but the interval silently reverts to the original 70s).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const modPath=path.join(__dirname,'..','engines','modification.js');
const realSrc=fs.readFileSync(modPath,'utf8');

function bootModification(src){
  delete require.cache[require.resolve(path.join(__dirname,'..','engines','evidence.js'))];
  delete require.cache[require.resolve(path.join(__dirname,'..','engines','aerobic.js'))];
  global.MSOSEngines={};
  global.MSOSEngines.Evidence=require(path.join(__dirname,'..','engines','evidence.js'));
  global.MSOSEngines.Aerobic=require(path.join(__dirname,'..','engines','aerobic.js'));
  const tmpPath=modPath.replace(/\.js$/,`.mckenzietest.${process.hrtime.bigint()}.tmp.js`);
  fs.writeFileSync(tmpPath,src);
  try{
    delete require.cache[require.resolve(tmpPath)];
    return require(tmpPath);
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

function makeFixture(){
  const mckenzie={id:'mck-1',full_name:'McKenzie Drage',sex:'F'};
  const session={id:'s1',identity:{course:'SCM'}};
  const state={adaptationProfiles:[],adaptationOverrides:[]};
  // Her real live shape: 12x50 Kick @1:10 (cycleSeconds=70), descending-pattern cue, no explicit rest
  // (send-off interval only) -- matches the exact set Andy reported.
  const item={id:'i1',kind:'set',reps:12,distance:50,raw:'12 x 50 Kick',text:'12 x 50 Kick',stroke:'Freestyle',
    cycleSeconds:70,restSeconds:null,repPattern:[],repInstructions:[],cues:['Desc 1-3'],equipment:[],
    composition:[],raceIntent:null,pattern:[]};
  return{mckenzie,session,state,item};
}

function run(){
  const Modification=bootModification(realSrc);
  const{mckenzie,session,state,item}=makeFixture();
  const out=Modification.adaptItem(item,mckenzie,state,session);

  assert.equal(out.reps,8,`sanity: McKenzie's real 2/3 load ratio must still reduce 12 reps to 8, matching her real live screen -- got ${out.reps}`);
  assert.notEqual(Number(out.cycleSeconds),70,`the interval must no longer be silently locked back to the original 70s (1:10) once reps have been reduced -- got ${out.cycleSeconds}s, the exact bug Andy reported ("why would we reduce reps if she was capable of going on the same send off")`);
  assert.ok(Number(out.cycleSeconds)>70,`the interval must actually LENGTHEN to compensate for fewer reps (same total squad-window time) -- got ${out.cycleSeconds}s`);
  assert.equal(Number(out.cycleSeconds),105,`the recalculated interval must match alignReducedRepsToGroupWindow's own math (12*70/8=105s, i.e. 1:45) -- got ${out.cycleSeconds}s`);

  console.log('MCKENZIE_KICK_INTERVAL_NOT_LOCKED_PASS');
}

function runFailBefore(){
  const buggyLine=`    if(!manualShape&&(key==='mckenziedrage'||key==='mackenziedrage')&&Number(item.distance)===50&&isKick(item)&&Number(item.cycleSeconds)>0)preserveAuthoredTiming(out,item,'McKenzie 50 kick keeps the coach-authored cycle');applyCharlotteKickBase(out,ath,manualShape);adaptiveLabel(out,item,ath);applyOverride(out,ov);syncRepeatBreakdown(out,item);return out;`;
  const fixedTail=`applyCharlotteKickBase(out,ath,manualShape);adaptiveLabel(out,item,ath);applyOverride(out,ov);syncRepeatBreakdown(out,item);return out;`;
  assert.ok(realSrc.includes(fixedTail),'test setup error: could not locate the fixed adaptItem tail in the real file -- its wording changed in a way this test does not expect');
  // Reconstruct the exact pre-fix line by re-inserting the McKenzie override immediately before the fixed tail.
  const buggySrc=realSrc.replace(fixedTail,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(buggySrc.includes("key==='mckenziedrage'"),'test setup error: reverted source must contain the McKenzie override');

  const Modification=bootModification(buggySrc);
  const{mckenzie,session,state,item}=makeFixture();
  const out=Modification.adaptItem(item,mckenzie,state,session);

  assert.equal(out.reps,8,'sanity: the buggy pre-fix source must still reduce reps to 8');
  assert.equal(Number(out.cycleSeconds),70,`the reverted pre-fix source must reproduce the real bug -- the interval silently locked back to the original 70s despite reps being reduced -- got ${out.cycleSeconds}s, confirming this test would have caught it`);

  console.log('MCKENZIE_KICK_INTERVAL_NOT_LOCKED_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',modPath],{stdio:'pipe'});
  console.log('MCKENZIE_KICK_INTERVAL_NOT_LOCKED_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
