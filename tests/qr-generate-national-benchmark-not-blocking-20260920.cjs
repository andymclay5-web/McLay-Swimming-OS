'use strict';
// Real coaching failure this pins (Andy, live, 20 Sept 2026, immediately after the same-day "give access
// from cache, refresh in background" redesign of the QR-generate flow): the freeze was gone, but generating
// Matthew Robertson's "Give swimmer access" QR now failed INSTANTLY with "Swimmer access held: No upcoming
// verified SCM national benchmark is linked." Andy: "This is no help to me" / "If there's an issue with
// upcoming meets we need to sort that too."
//
// Root cause: engines/swimmer-performance-ci.js's readinessFor() had a third check --
// `if(!model.events.some(e=>e.next))` -- requiring at least one event to carry a linked upcoming national
// standard, which only ever gets set from the pathway_standards/pathway_meets reference tables. Before the
// 20 Sept redesign, completeEvidence() (the thing that fetches those two tables) was always awaited
// immediately before readinessFor() ran, so on a lucky day the fetch would land in time and the check would
// pass. The redesign made completeEvidence() fire-and-forget in the background specifically so a slow or
// failing network fetch could never block/freeze the Generate button again -- but that also means nothing
// can ever populate those tables BEFORE this synchronous check runs anymore. On Andy's real device,
// pathway_standards/pathway_meets have sat at 0 rows all session (every breadcrumb this whole engagement
// confirms it) -- so this check now fails unconditionally, for every swimmer, turning "freeze" into an
// instant hard block that is arguably worse: it doesn't even attempt to give access.
//
// The fix (this commit): drop that third check entirely. It is confirmed safe: swimmer-portal.js already
// renders an event with no linked `.next` target gracefully (see the two source-level assertions below --
// "Tap for pathway" in the event summary line, "No pathway marks loaded." in the expanded detail) -- nothing
// downstream assumes every event has a linked national benchmark. Checks 1-2 (date of birth present, at
// least one verified race event loaded) remain hard blocks: they are about the swimmer's OWN evidence, never
// starved by an unawaited background step, so this fix does not touch them.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const ciPath=path.join(repoRoot,'engines','swimmer-performance-ci.js');
const realSrc=fs.readFileSync(ciPath,'utf8');
const portalSrc=fs.readFileSync(path.join(repoRoot,'swimmer-portal.js'),'utf8');

// Matthew Robertson's real shape (from the live 18-20 Sept reports): valid DOB, one real verified SCM PB,
// but a completely empty local pathway_standards/pathway_meets cache -- his actual chronic state all session.
const matthew={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',sex:'M',date_of_birth:'2010-06-18'};
const pbRows=[{athlete_id:matthew.id,course:'SCM',distance:200,stroke:'IM',result_seconds:147.73,result_date:'2026-03-22'}];

const Evidence={
  course:r=>String(r?.course||'').toUpperCase(),distance:r=>Number(r?.distance),rowStroke:r=>String(r?.stroke||''),
  stroke:v=>String(v||''),seconds:r=>Number(r?.result_seconds??r?.qualifying_seconds),points:()=>null,
  pbRows:ath=>pbRows.filter(r=>r.athlete_id===ath.id),merge:(a,b)=>[...(a||[]),...(b||[])],
};

function bootFixture(fromPath=ciPath,{athletes=[matthew]}={}){
  global.MSOSEngines={Evidence};
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes},
    // The chronic real-world state: both reference tables genuinely empty, nothing to merge in.
    refs:{get:()=>[],merge:()=>{},save:async()=>true},
    currentSession:()=>({identity:{date:'2026-09-20',course:'SCM'}}),
    pathway:{defaultStandard:r=>r.standard_kind==='qualifying',paraClass:()=>''},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},cloud:{ready:()=>false},
    engineBridge:{canAttemptCloudRead:()=>false,pathwayPbCache:new Map()},
  };
  delete require.cache[require.resolve(fromPath)];
  require(fromPath);
  return global.MSOS4.swimmerPerformanceBM;
}

// 1. The reported bug, fixed: a swimmer with real evidence but an empty national-benchmark reference cache
//    must be able to receive access.
{
  const X=bootFixture();
  const readiness=X.readinessFor(matthew,{course:'SCM'});
  assert.ok(readiness.model.events.length>0,'Matthew\'s real SCM PB must still build a performance model');
  assert.ok(!readiness.model.events.some(e=>e.next),'sanity: with an empty reference cache, no event should carry a linked national target');
  assert.equal(readiness.ok,true,`Matthew must pass readiness even with no national benchmark linked yet, got issues: ${JSON.stringify(readiness.issues)}`);
  assert.deepEqual(readiness.issues,[],'no readiness issues should block access purely for a missing/unsynced national benchmark');
}

// 2. The checks that remain must still work -- this fix must not have accidentally weakened them too.
{
  const X=bootFixture();
  const noDob={...matthew,date_of_birth:''};
  const r1=X.readinessFor(noDob,{course:'SCM'});
  assert.equal(r1.ok,false,'a swimmer with no date of birth must still be blocked');
  assert.ok(r1.issues.some(i=>/date of birth/i.test(i)),'the date-of-birth issue must still be reported');

  const noEvidenceAthlete={id:'athlete-nobody',full_name:'Nobody',sex:'M',date_of_birth:'2010-01-01'};
  const X2=bootFixture(ciPath,{athletes:[noEvidenceAthlete]});
  const r2=X2.readinessFor(noEvidenceAthlete,{course:'SCM'});
  assert.equal(r2.ok,false,'a swimmer with zero verified race events must still be blocked');
  assert.ok(r2.issues.some(i=>/no verified/i.test(i)),'the no-verified-events issue must still be reported');
}

// 3. The safety claim the fix's own comment relies on: swimmer-portal.js must already render an event with
//    no linked `.next` target gracefully, not assume every event has one.
{
  assert.match(portalSrc,/e\.next\?`\$\{esc\(e\.next\.label\)\}.*:'Tap for pathway'/,
    'swimmer-portal.js\'s event summary line must fall back to "Tap for pathway" when an event has no linked national target');
  assert.match(portalSrc,/No pathway marks loaded\./,
    'swimmer-portal.js\'s expanded pathway detail must fall back to "No pathway marks loaded." when there is nothing to show');
}

// 4. Fail-before/pass-after on the exact source change.
{
  const fixedBlock=`  function readinessFor(ath,{course=currentCourse()}={}){\n    const model=buildModel(ath,course),issues=[];\n    if(!ath?.date_of_birth)issues.push('Date of birth is required for age-specific pathway standards.');\n    if(!model.events.length)issues.push(\`No verified \${model.course} race events are loaded.\`);\n    return{ok:issues.length===0,issues,model};\n  }`;
  const buggyBlock=`  function readinessFor(ath,{course=currentCourse()}={}){\n    const model=buildModel(ath,course),issues=[];\n    if(!ath?.date_of_birth)issues.push('Date of birth is required for age-specific pathway standards.');\n    if(!model.events.length)issues.push(\`No verified \${model.course} race events are loaded.\`);\n    if(!model.events.some(e=>e.next))issues.push(\`No upcoming verified \${model.course} national benchmark is linked.\`);\n    return{ok:issues.length===0,issues,model};\n  }`;
  assert.ok(realSrc.includes(fixedBlock),'test setup error: could not locate the fixed readinessFor() block -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedBlock,buggyBlock);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.readinessfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const X=bootFixture(tmpPath);
    const readiness=X.readinessFor(matthew,{course:'SCM'});
    assert.equal(readiness.ok,false,
      'the buggy pre-fix source must block Matthew purely because no national benchmark is linked yet -- confirms this test would have caught the exact bug Andy hit');
    assert.ok(readiness.issues.some(i=>/national benchmark/i.test(i)));
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});

console.log('QR_GENERATE_NATIONAL_BENCHMARK_NOT_BLOCKING_PASS');
