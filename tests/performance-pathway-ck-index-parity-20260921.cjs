'use strict';
// Real coaching failure this pins (Andy, live, 21 Sept 2026: "we need to get them to be able to see all of
// the information I have for them"): re-enabling the swimmer portal's full analytical payload depended on
// buildAthletePathways() in engines/performance-pathway-ck.js being genuinely fast at Andy's real data scale.
// It was fixed by indexing pathway_standards/pathway_meets once per athlete (buildStandardsIndex/
// buildMeetsIndex) instead of rescanning the full table from scratch for every single ranked event -- see
// that file's own dated comment for the full profiling account and
// tests/performance-pathway-ck-index-perf-20260921.cjs for the measured speedup.
//
// A pure algorithmic/data-access change like that is only safe if the OUTPUT never changes -- same filters
// (active/sex/para), same grouping, same ordering, just a different (indexed) route to the same rows. This
// test proves exactly that: it loads the real PRE-FIX implementation straight from git -- pinned to
// 7f1d176, the exact commit immediately before the indexing fix landed (commit a8b8da0), the same
// PRE_FIX_COMMIT pattern tests/board-race-simulation-fins-quality-20260918.cjs already uses, and for the
// same reason: reading `HEAD` here would work only until the fix itself was committed, after which HEAD
// points at the FIXED source and this test would silently compare the file against itself -- in one
// isolated VM context, the real CURRENT (indexed) implementation via a normal require() in another, runs
// both against an identical, realistic multi-event/multi-programme/multi-season fixture (deliberately
// larger and messier than the existing hand-picked tests/performance-pathway-ck.cjs fixture -- more
// distances, more strokes, more seasons, some rows that should be filtered out by active/sex/para/age,
// some meets that need year-rollover projection), and asserts the two athletes' full pathway outputs are
// byte-for-byte JSON-identical.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const{execFileSync}=require('node:child_process');

const PRE_FIX_COMMIT='7f1d176';
const repoRoot=path.join(__dirname,'..');
const modulePath=path.join(repoRoot,'engines','performance-pathway-ck.js');
const oldSrc=execFileSync('git',['show',`${PRE_FIX_COMMIT}:engines/performance-pathway-ck.js`],{cwd:repoRoot,encoding:'utf8'});
const newSrc=fs.readFileSync(modulePath,'utf8');
assert.notEqual(oldSrc,newSrc,`test setup error: ${PRE_FIX_COMMIT}'s performance-pathway-ck.js is identical to the working copy -- the indexing change is not actually present as a diff against this pinned commit, so this parity test would compare a file against itself`);
assert.ok(/buildStandardsIndex|buildMeetsIndex/.test(newSrc),'test setup error: the current file does not look like it has the indexing fix at all');
assert.ok(!/buildStandardsIndex|buildMeetsIndex/.test(oldSrc),'test setup error: HEAD already looks like it has the indexing fix -- picked the wrong pre-fix reference point');

const STROKES=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'];
const DISTANCES=[50,100,200,400,800,1500];
const SEASONS=[2024,2025,2026];
const PROGRAMMES=[
  {name:'Division II',kind:'qualifying'},
  {name:'Canterbury SC Champs',kind:'qualifying'},
  {name:'NZSC',kind:'qualifying'},
  {name:'NAGS',kind:'qualifying'},
  {name:'NZ Championships',kind:'qualifying'},
];

function buildStandards(){
  const rows=[];let i=0;
  for(const distance of DISTANCES)for(const stroke of STROKES)for(const programme of PROGRAMMES)for(const season of SEASONS){
    i++;
    const course=programme.name==='NAGS'||programme.name==='NZ Championships'?'LCM':'SCM';
    rows.push({
      id:'std'+i,programme:programme.name,standard_kind:programme.kind,course,
      sex:i%7===0?'F':'M',age_min:12+(i%8),age_max:12+(i%8),
      distance,stroke,season,active:i%37!==0, // occasional inactive row, must be filtered
      qualifying_seconds:20+(distance/10)+(i%40),
      meet_date:`${season}-0${1+(i%9)}-1${i%9}`,
    });
    if(i%23===0)rows.push({...rows[rows.length-1],id:'std'+i+'-para',para_class:'S9'}); // must be filtered (paraMatch)
  }
  return rows;
}
function buildMeets(){
  const rows=[];let i=0;
  for(const programme of PROGRAMMES)for(const season of[2025,2026]){
    i++;
    rows.push({meet_name:programme.name,meet_date:`${season}-0${1+(i%9)}-2${i%9}`});
  }
  return rows;
}
function buildRankedEvents(){
  const out=[];let i=0;
  for(const distance of DISTANCES)for(const stroke of STROKES){
    i++;
    out.push({distance,stroke,course:'SCM',seconds:20+(distance/10)+(i%30),points:400+i,pointSystem:'WA',raw:{id:'pb'+i}});
  }
  return out;
}

const standards=buildStandards();
const meets=buildMeets();
const rankedEvents=buildRankedEvents();
const athletes=[
  {id:'a1',full_name:'Matthew Robertson',sex:'M',date_of_birth:'2010-06-18'},
  {id:'a2',full_name:'Mackenzie Example',sex:'F',date_of_birth:'2011-03-02'},
];

function makeEvidence(){
  return{
    course:r=>String(r?.course||'').toUpperCase(),
    distance:r=>Number(r?.distance),
    rowStroke:r=>String(r?.stroke||''),
    stroke:v=>String(v||''),
    seconds:r=>Number(r?.qualifying_seconds??r?._seconds??r?.result_seconds),
  };
}
function makeMSOS4(athlete){
  return{
    state:{settings:{pathwayCourse:'SCM'},athletes},
    currentSession:()=>({identity:{date:'2026-09-21',course:'SCM'}}),
    refs:{get:key=>key==='pathway_standards'?standards:key==='pathway_meets'?meets:[]},
    pathway:{profile:()=>({events:[]}),seconds:r=>Number(r?._seconds),standardLabel:r=>r?._label||'',isPara:()=>false},
    performanceEngine:{isPara:()=>false,rankedEvents:()=>rankedEvents},
  };
}

function runInVm(src,athlete){
  const sandbox={};
  sandbox.globalThis=sandbox;
  sandbox.MSOSEngines={Evidence:makeEvidence()};
  sandbox.MSOS4=makeMSOS4(athlete);
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox,{filename:'performance-pathway-ck.OLD.js'});
  return sandbox.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM',now:'2026-09-21'});
}
function runViaRequire(athlete){
  const g=global;
  g.MSOSEngines={Evidence:makeEvidence()};
  g.MSOS4=makeMSOS4(athlete);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  return g.MSOS4.performanceEngine.pathwaysForAthlete(athlete,{course:'SCM',now:'2026-09-21'});
}

function run(){
  let comparedEvents=0;
  for(const athlete of athletes){
    const oldResult=runInVm(oldSrc,athlete);
    const newResult=runViaRequire(athlete);
    assert.equal(oldResult.events.length,newResult.events.length,`${athlete.full_name}: same number of ranked events must be present in both`);
    assert.ok(oldResult.events.length>0,'fixture sanity: there must be real ranked events to compare, or this test proves nothing');
    assert.equal(
      JSON.stringify(oldResult),
      JSON.stringify(newResult),
      `${athlete.full_name}: the indexed implementation must produce byte-for-byte identical output to the pre-fix full-table-scan implementation`,
    );
    comparedEvents+=oldResult.events.length;
  }
  assert.ok(comparedEvents>=2*DISTANCES.length*STROKES.length,'fixture sanity: expected a realistically large number of compared events across both athletes');
  console.log(`PERFORMANCE_PATHWAY_CK_INDEX_PARITY_PASS (${comparedEvents} events compared across ${athletes.length} athletes, ${standards.length} standards rows, ${meets.length} meet rows)`);
}

run();
