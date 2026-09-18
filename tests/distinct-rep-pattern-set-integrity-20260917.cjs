'use strict';
// Real coaching failure this fixes (Andy, 17 Sept 2026, comparing his own whiteboard photo for a real session
// to the live Board): a 4x400 with a per-round stroke rotation (#1 IM, #2 Fr, #3 IM, #4 Choice) gave a modified
// swimmer "2x400"/"3x400" via the engine's reps-reduction fallback -- fewer full-length rounds, silently
// DROPPING whole stroke exposures (e.g. losing the Choice round entirely). Andy's whiteboard wanted "4x200"/
// "4x300": every round kept, each one just shorter. His own words, confirmed as the design rule:
// "They need to do the same as the main group but reduced dist to have it take the same time, reduced reps
// when set integrity can be maintained."
//
// The fix (engines/modification.js): a new hasDistinctRepPattern(item) helper detects a set whose item.pattern
// carries more than one distinct per-round label (a genuine rotation, not a uniform repeat). adaptItem() now
// checks this immediately after the evidenceDistance branch -- before the dedicated `im` branch that previously
// caught this case via isIM()'s raw-text regex (which fires on any set merely containing the word "IM" in a
// per-round label, uniform or not) -- and reduces DISTANCE instead of reps whenever a smaller practical distance
// exists, keeping every round represented at the squad's own send-off (same reps, same interval => same total
// time, per the other half of Andy's rule).
//
// A genuinely uniform set -- e.g. plain "4 x 400 IM" with no per-round breakdown at all -- carries no
// hasDistinctRepPattern risk and must be completely unaffected: it still reduces reps via the existing
// `im` branch (with alignIMTeamWindow keeping total group time), exactly as before this fix.
//
// This test proves both halves with the real engine, plus fail-before/pass-after by reverting just the new
// branch out of the real source and re-running the same fixture.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('module');
const root=path.resolve(__dirname,'..');

const Evidence=require(path.join(root,'engines','evidence.js'));
global.MSOSEngines={Evidence};
const Aerobic=require(path.join(root,'engines','aerobic.js'));
global.MSOSEngines.Aerobic=Aerobic;

const modPath=path.join(root,'engines','modification.js');
const realSrc=fs.readFileSync(modPath,'utf8');

const cm={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
const session={id:'sess-4x400',identity:{course:'SCM',squads:['National']}};
const baseState={athletes:[cm],adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};

// The real shape from Andy's whiteboard: 4 rounds, each a distinct authored stroke.
const rotation4x400=()=>({id:'main-400',kind:'set',reps:4,distance:400,stroke:'',raw:'4 x 400 #1 IM / #2 Fr / #3 IM / #4 Choice',text:'4 x 400 #1 IM / #2 Fr / #3 IM / #4 Choice',cues:[],pattern:[{count:1,text:'IM'},{count:1,text:'Fr'},{count:1,text:'IM'},{count:1,text:'Choice'}],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:10,cycleSeconds:330,targetSeconds:null,equipment:[],composition:[]});

// A genuinely uniform IM set -- no per-round breakdown -- must be unaffected by this fix.
const uniform4x400IM=()=>({id:'main-400-im',kind:'set',reps:4,distance:400,stroke:'IM',raw:'4 x 400 IM',text:'4 x 400 IM',cues:[],pattern:[],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:10,cycleSeconds:330,targetSeconds:null,equipment:[],composition:[]});

function loadModification(src){
  const m=new Module(modPath,module);
  m.filename=modPath;
  m.paths=Module._nodeModulePaths(path.dirname(modPath));
  m._compile(src,modPath);
  return m.exports;
}

function run(){
  const Modification=loadModification(realSrc);

  const rot=Modification.adaptItem(rotation4x400(),cm,baseState,session);
  assert.equal(rot.reps,4,'every round of the distinct-pattern rotation must be kept -- reps must not drop');
  assert.equal(rot.distance,200,'distance must reduce (400->200) instead of dropping rounds');
  assert.equal(rot.cycleSeconds,330,'interval must stay the same as the main group so total time (reps x interval) matches');
  assert.match(rot.adaptationReason||'',/distinct per-round pattern/i,'reason must explain the per-round pattern was preserved');
  assert.equal(rot.adaptationConfidence,'low');

  const uni=Modification.adaptItem(uniform4x400IM(),cm,baseState,session);
  assert.equal(uni.reps,2,'a genuinely uniform IM set is unaffected -- still reduces reps via the existing IM branch');
  assert.equal(uni.distance,400,'a genuinely uniform IM set keeps its authored distance -- unaffected by this fix');
  assert.equal(uni.cycleSeconds,660,'a genuinely uniform IM set still gets its interval realigned to the group window (existing alignIMTeamWindow behaviour, unaffected)');
  assert.match(uni.adaptationReason||'',/complete IM units/i);

  console.log('DISTINCT_REP_PATTERN_SET_INTEGRITY_PASS');
}

function runFailBefore(){
  const NEW_BLOCK=`        else if(baseReps>1&&hasDistinctRepPattern(item)){\n          const labels=[...new Set(item.pattern.filter(x=>x?.text).map(x=>text(x.text)))],desired=nearestPracticalDistance(baseDist*p.ratio,session,{returnToStart:p.returnToStart,minDistance:poolLength(session),maxDistance:baseDist});\n          if(desired<baseDist){reshapeWithDistance(out,item,desired,session);if(individualStroke)out.stroke=individualStroke;preserveAuthoredTiming(out,item,'Every round carries a distinct authored stroke; dropping a round would drop that stimulus entirely, so distance is reduced instead and every round is kept at the squad send-off');out.adaptationReason=\`Distinct per-round pattern (\${labels.join('/')}) retained · \${baseDist}→\${desired} so every round stays represented at the squad's time\`;out.adaptationConfidence='low';}\n          else{out.adaptationReason=\`Distinct per-round pattern (\${labels.join('/')}) retained · no safe smaller distance available, authored distance kept\`;preserveAuthoredTiming(out,item,'Every round carries a distinct authored stroke and could not be safely shortened further; authored distance/interval kept so every round stays represented');}\n        }\n`;
  assert.ok(realSrc.includes(NEW_BLOCK),'test setup error: could not locate the exact new hasDistinctRepPattern branch in engines/modification.js -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(NEW_BLOCK,'');
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted pre-fix source');

  const Modification=loadModification(buggySrc);
  const rot=Modification.adaptItem(rotation4x400(),cm,baseState,session);
  // Pre-fix: isIM() fires on the raw text alone (it contains "IM" from the per-round label, uniform or not),
  // so this rotation fell into the same dedicated `im` branch as a genuinely uniform IM set -- reps drop from
  // 4 to 2, silently discarding the #3 IM and #4 Choice rounds. That is exactly the bug Andy's whiteboard caught.
  assert.equal(rot.reps,2,'pre-fix source must reproduce the exact reported bug: rounds silently dropped (4->2)');
  assert.equal(rot.distance,400,'pre-fix source must keep the full authored distance while dropping rounds instead');

  console.log('DISTINCT_REP_PATTERN_SET_INTEGRITY_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',modPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
