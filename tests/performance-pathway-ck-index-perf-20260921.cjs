'use strict';
// Real coaching failure this pins (Andy, live, 21 Sept 2026): buildAthletePathways() used to rescan the
// ENTIRE pathway_standards/pathway_meets reference tables from scratch for every single ranked event an
// athlete has -- O(events x standards-table-size). Andy's own diagnostics that night referenced his real
// pathway_standards table sitting around ~4,406 rows, so even a modest 15-ranked-event swimmer meant tens of
// thousands of row comparisons (several regex-based text normalisations each), done fresh every time, right
// before training/tests/meet ran with no yield in between -- exactly the kind of accumulation that reads as
// "the whole phone locked solid." Fixed by indexing both reference tables once per athlete
// (buildStandardsIndex/buildMeetsIndex) and reusing that index for every event -- O(standards + events)
// instead of O(events x standards). See engines/performance-pathway-ck.js's own dated comment for the full
// account, and tests/performance-pathway-ck-index-parity-20260921.cjs for proof the output never changed.
//
// This test proves the actual performance claim, not just the algorithmic reasoning behind it: at Andy's own
// documented real scale (~4,406 pathway_standards rows), the current (indexed) implementation must be
// meaningfully faster than the real pre-fix implementation (loaded straight from git HEAD, not a hand-copied
// approximation), and must complete a single athlete's full pathway build comfortably within a budget that
// keeps a phone responsive. Timing uses warmed-up (JIT-settled), median-of-many-iterations measurement --
// naive single-shot timing is dominated by module-load/cold-start noise, not the steady-state cost that
// actually matters once a coach has the app open and is generating access for swimmer after swimmer.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const{execFileSync}=require('node:child_process');

// Pinned to 7f1d176, the exact commit immediately before the indexing fix landed (a8b8da0) -- not `HEAD`,
// which only pointed at the pre-fix source until the fix itself was committed (same PRE_FIX_COMMIT pattern
// tests/board-race-simulation-fins-quality-20260918.cjs already uses, and the same reason).
const PRE_FIX_COMMIT='7f1d176';
const repoRoot=path.join(__dirname,'..');
const modulePath=path.join(repoRoot,'engines','performance-pathway-ck.js');
const oldSrc=execFileSync('git',['show',`${PRE_FIX_COMMIT}:engines/performance-pathway-ck.js`],{cwd:repoRoot,encoding:'utf8'});
const newSrc=fs.readFileSync(modulePath,'utf8');
assert.notEqual(oldSrc,newSrc,`test setup error: ${PRE_FIX_COMMIT}'s performance-pathway-ck.js is identical to the working copy -- nothing to benchmark against`);

const STANDARDS_ROW_COUNT=4406; // Andy's own real, documented pathway_standards row count
const MEET_ROW_COUNT=300;
const EVENT_COUNT=15;

function makeStandardRows(n){
  const families=['NZSC National Short Course','National LC Age Group','National LC Open','Division II','Canterbury SC','World Short Course','World Long Course'];
  const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly'];
  const distances=[50,100,200,400,800,1500];
  const out=[];
  for(let i=0;i<n;i++)out.push({id:'std'+i,standard_name:families[i%families.length],programme:families[i%families.length],standard_kind:i%5===0?'qualifying':'benchmark',distance:distances[i%distances.length],stroke:strokes[i%strokes.length],course:i%2===0?'SCM':'LCM',sex:i%2===0?'M':'F',age_group:String(14+(i%6)),season:2024+(i%3),qualifying_seconds:60+(i%200),active:true,version_status:'active'});
  return out;
}
function makeMeetRows(n){
  const families=['NZSC National Short Course','National LC Age Group','National LC Open','Division II','Canterbury SC','World Short Course','World Long Course'];
  const out=[];
  for(let i=0;i<n;i++)out.push({meet_name:families[i%families.length],meet_date:`202${6+(i%2)}-0${1+(i%9)}-15`});
  return out;
}
function makeRankedEvents(n){
  const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly'];
  const distances=[50,100,200,400];
  const out=[];
  for(let i=0;i<n;i++)out.push({raw:{id:'pb'+i},distance:distances[i%distances.length],stroke:strokes[i%strokes.length],course:'SCM',seconds:60+i,points:500-i,pointSystem:'WA'});
  return out;
}

const standardRows=makeStandardRows(STANDARDS_ROW_COUNT);
const meetRows=makeMeetRows(MEET_ROW_COUNT);
const rankedEvents=makeRankedEvents(EVENT_COUNT);
const athlete={id:'a1',full_name:'Test Athlete',date_of_birth:'2010-05-01',sex:'M'};

function makeSandboxState(){
  const Evidence={course:r=>r.course||'',distance:r=>r.distance,rowStroke:r=>r.stroke,stroke:v=>(typeof v==='string'?v:v?.stroke)||'',seconds:r=>r.qualifying_seconds||r.seconds};
  const state={settings:{}};
  const M={state,currentSession:()=>null,refs:{get:key=>(key==='pathway_standards'?standardRows:key==='pathway_meets'?meetRows:[])},pathway:{profile:()=>({events:[]}),isPara:()=>false,points:()=>null,seconds:()=>null,standardLabel:()=>''}};
  M.performanceEngine={rankedEvents:()=>rankedEvents,isPara:()=>false};
  return{Evidence,M};
}

function median(arr){const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];}

function benchOld(iterations,warmup){
  const sandbox={};
  sandbox.globalThis=sandbox;
  const{Evidence,M}=makeSandboxState();
  sandbox.MSOSEngines={Evidence};
  sandbox.MSOS4=M;
  vm.createContext(sandbox);
  vm.runInContext(oldSrc,sandbox,{filename:'performance-pathway-ck.OLD.js'});
  for(let i=0;i<warmup;i++)sandbox.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM'});
  const times=[];
  for(let i=0;i<iterations;i++){
    const t0=process.hrtime.bigint();
    sandbox.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM'});
    times.push(Number(process.hrtime.bigint()-t0)/1e6);
  }
  return median(times);
}
function benchNew(iterations,warmup){
  const{Evidence,M}=makeSandboxState();
  global.MSOSEngines={Evidence};
  global.MSOS4=M;
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  for(let i=0;i<warmup;i++)global.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM'});
  const times=[];
  for(let i=0;i<iterations;i++){
    const t0=process.hrtime.bigint();
    global.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM'});
    times.push(Number(process.hrtime.bigint()-t0)/1e6);
  }
  return median(times);
}

function run(){
  // OLD's own per-call cost (~100ms+ at this scale -- that's the whole point of this test) means a large
  // iteration count there costs real wall-clock time for no extra statistical value; NEW is cheap enough to
  // afford more. Asymmetric counts keep this test's total runtime well under other tests' typical budget
  // (a few seconds, not the 20+ seconds a naive matching 150/20 on both sides cost during development, which
  // was slow enough to trip this suite's own per-file timeout when run as part of a full sweep).
  const OLD_ITER=25,OLD_WARMUP=5,NEW_ITER=100,NEW_WARMUP=15;
  const oldMs=benchOld(OLD_ITER,OLD_WARMUP);
  const newMs=benchNew(NEW_ITER,NEW_WARMUP);
  const speedup=oldMs/newMs;
  console.log(`OLD (full-table-scan per event): median ${oldMs.toFixed(3)}ms over ${OLD_ITER} warmed-up iterations`);
  console.log(`NEW (indexed once per athlete):  median ${newMs.toFixed(3)}ms over ${NEW_ITER} warmed-up iterations`);
  console.log(`Measured speedup: ${speedup.toFixed(2)}x`);

  // A conservative threshold (well under the ~2.3x measured during development) so this test isn't flaky on a
  // slower or more loaded CI machine, while still failing hard if the indexing fix ever regresses away.
  assert.ok(speedup>=1.4,`the indexed implementation must be meaningfully faster than the real pre-fix implementation at this realistic scale (${STANDARDS_ROW_COUNT} standards rows, ${EVENT_COUNT} events) -- measured only ${speedup.toFixed(2)}x`);
  // An absolute ceiling too: the whole point is that a single athlete's full pathway build must stay well
  // clear of anything a coach would perceive as a stall, independent of how the old implementation compares.
  assert.ok(newMs<40,`a single athlete's full pathway build at this realistic scale must comfortably stay under a perceptible-stall threshold -- measured ${newMs.toFixed(3)}ms`);

  console.log('PERFORMANCE_PATHWAY_CK_INDEX_PERF_PASS');
}

run();
