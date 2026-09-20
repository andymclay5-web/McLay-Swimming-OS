'use strict';
// Real coaching failure this fixes (Andy, 18 Sept 2026, live): Matthew Robertson's "Give swimmer access" QR
// held on "Swimmer access held: No upcoming verified SCM national benchmark is linked." Checked directly
// against production Supabase: this was WRONG -- a real, current NZSC qualifying standard exists for every
// one of Matthew's events (age 16, male, SCM, meet 2026-09-27), exactly matching engines/swimmer-performance-
// ci.js's own standardApplies()/national()/defaultStandard() rules (confirmed via tests/swimmer-performance-
// ci.cjs and tests/para-national-standard-classification-20260910.cjs, which already prove that matching
// logic works correctly against comparable fixtures).
//
// Root cause: engines/swimmer-performance-ci.js's completeEvidence() only ever (re)fetched pathway_standards/
// pathway_meets from Supabase when the LOCAL cache was completely EMPTY (`if(!standardRows().length)`). Once
// ANY rows were cached on a device -- even months ago, even before this year's meet's standards existed --
// they were never refreshed again, on any schedule, by any mechanism. A coach's device can sit on a stale
// reference table forever while the real, current, matching data sits unfetched on the server the whole
// time -- exactly what happened to Matthew.
//
// This test proves: (1) with a non-empty but STALE local pathway_standards cache (the exact shape of the
// bug -- old rows present, but not the one that actually matches), completeEvidence() now queues a fresh
// fetch anyway, and the built model correctly recovers the real matching standard once it's merged in;
// (2) a FRESH (recently-synced) non-empty cache is correctly left alone -- no wasted network call, so the
// original "skip when already loaded" optimisation this guarded against removing still holds when the data
// genuinely isn't stale; (3) fail-before/pass-after on the exact source change.
//
// 20 Sept 2026 update: this test originally asserted on readinessFor().ok flipping false->true as the cache
// recovered -- that was a fair proxy back when completeEvidence() was always awaited immediately before
// readinessFor() ran in the live Generate flow, so "the gate resolves" and "the model has the right data"
// were the same observable moment. Andy's same-day "give access from cache, refresh in background" redesign
// (engines/swimmer-invite-bn.js) made completeEvidence() fire-and-forget and, separately, readinessFor()
// itself no longer hard-blocks on national-benchmark data at all (see
// tests/qr-generate-national-benchmark-not-blocking-20260920.cjs for why: that gate could only ever be
// satisfied by this same async, now-unawaited step, so it started hard-blocking every swimmer on a cold
// cache -- which is Andy's real chronic state -- the moment it was no longer awaited first). This test now
// asserts directly on what it actually cares about -- whether buildModel()'s events carry the correct,
// current `.next` target once the fresh standard lands -- rather than through a gate that no longer exists.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const ciPath=path.join(repoRoot,'engines','swimmer-performance-ci.js');
const realSrc=fs.readFileSync(ciPath,'utf8');

const matthew={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',sex:'M',date_of_birth:'2010-06-18'};
// His real SCM 200 IM PB (from production Supabase, pulled 2026-09-18).
const pbRows=[{athlete_id:matthew.id,course:'SCM',distance:200,stroke:'IM',result_seconds:147.73,result_date:'2026-03-22'}];
// The STALE local cache: a real, older NZSC row for a DIFFERENT age group only -- present, non-empty, but
// missing the one that actually matches Matthew today. This is what makes `standardRows().length` truthy
// and, under the old code, permanently blocks any refetch.
const staleStandards=[{id:'stale-wrong-age',programme:'NZSC',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:14,age_max:14,distance:200,stroke:'IM',qualifying_seconds:150,meet_date:'2025-04-01'}];
// The REAL, current, matching row (confirmed live in production 18 Sept 2026) that only a fresh fetch can
// recover.
const freshStandards=[{id:'future-current-16-im2',programme:'NZSC',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:16,age_max:16,distance:200,stroke:'IM',qualifying_seconds:140.80,meet_date:'2026-09-27'}];
const meets=[{programme:'NZSC',meet_name:'NZSC',course:'SCM',meet_date:'2026-09-27'}];

const Evidence={
  course:r=>String(r?.course||'').toUpperCase(),distance:r=>Number(r?.distance),rowStroke:r=>String(r?.stroke||''),
  stroke:v=>String(v||''),seconds:r=>Number(r?.result_seconds??r?.qualifying_seconds),points:()=>null,
  pbRows:ath=>pbRows.filter(r=>r.athlete_id===ath.id),merge:(a,b)=>[...(a||[]),...(b||[])],
};

function makeLocalStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}

function bootFixture(fromPath=ciPath){
  global.localStorage=makeLocalStorage();
  const refData={pathway_standards:[...staleStandards],pathway_meets:[...meets]};
  global.MSOSEngines={Evidence};
  const fetchedPaths=[];
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes:[matthew]},
    refs:{
      get:key=>refData[key]||[],
      merge:(key,rows)=>{refData[key]=[...(refData[key]||[]),...rows];return refData[key];},
      save:async()=>true,
    },
    currentSession:()=>({identity:{date:'2026-09-18',course:'SCM'}}),
    pathway:{defaultStandard:r=>r.standard_kind==='qualifying',paraClass:()=>''},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},
    cloud:{ready:()=>true,fetchPages:async(p)=>{fetchedPaths.push(p);if(p.includes('/pathway_standards'))return[...freshStandards];if(p.includes('/pathway_meets'))return[];return[];}},
    engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:new Map()},
  };
  delete require.cache[require.resolve(fromPath)];
  require(fromPath);
  return{X:global.MSOS4.swimmerPerformanceBM,fetchedPaths,refData};
}

async function run(){
  // Sub-test 1: stale non-empty cache -> a fresh fetch must be queued and must recover real readiness.
  {
    const{X,fetchedPaths}=bootFixture();
    const before=X.modelFor(matthew,'SCM'),im200Before=before.events.find(e=>e.distance===200&&e.stroke==='IM');
    // The stale row's own meet_date (2025-04-01) is already in the past relative to "today" (2026-09-18), so
    // targetsFor()'s future-date filter drops it entirely -- the stale cache alone shows NO linked target at
    // all, not a wrong-but-present one. That absence is itself the bug's real shape: a coach's device can sit
    // with zero usable upcoming targets indefinitely while a real, current, matching standard sits unfetched
    // server-side the whole time.
    assert.ok(!im200Before?.next,'sanity: the stale local cache alone must not already show a usable (future) target');
    const result=await X.completeEvidence(matthew,()=>{});
    assert.ok(result.ok,`completeEvidence must succeed once the fresh standard is fetched, got errors: ${JSON.stringify(result.errors)}`);
    assert.ok(fetchedPaths.some(p=>p.includes('/pathway_standards')),
      'a STALE non-empty local pathway_standards cache must still trigger a fresh fetch, not be treated as good forever');
    const after=X.modelFor(matthew,'SCM');
    const im200=after.events.find(e=>e.distance===200&&e.stroke==='IM');
    assert.ok(im200?.next,'200 IM must now carry the real, current NZSC target');
    assert.equal(im200.next.seconds,140.8,'the recovered target must be the exact fresh age-16 standard, not the stale age-14 one');
  }

  // Sub-test 2: a FRESH (just-synced) non-empty cache must NOT trigger a redundant refetch -- the original
  // "skip when already loaded" optimisation must still hold when the data genuinely isn't stale.
  {
    const{X,fetchedPaths}=bootFixture();
    await X.completeEvidence(matthew,()=>{}); // first call: stale -> fetches and marks synced
    fetchedPaths.length=0;
    await X.completeEvidence(matthew,()=>{}); // second call, immediately after: must NOT refetch pathway_standards/meets
    assert.ok(!fetchedPaths.some(p=>p.includes('/pathway_standards')),
      'a cache that was JUST successfully synced must not be refetched again on the very next call -- staleness must be bounded, not "always refetch"');
    assert.ok(!fetchedPaths.some(p=>p.includes('/pathway_meets')),
      'the same must hold for pathway_meets');
  }

  console.log('PATHWAY_STANDARDS_REFERENCE_STALENESS_PASS');
}

async function runFailBefore(){
  // Fail-before: revert to the exact pre-fix unconditional-skip-when-non-empty condition and confirm the
  // stale cache is NEVER refetched, permanently blocking readiness even though the real matching standard
  // is available -- the exact bug Andy hit for Matthew.
  // Note: these lines picked up a 4th array element (X.REF_FETCH_PAGE_SIZE) later on 18 Sept when the
  // pathway_standards/pathway_meets fetches were also given a larger page size to cut round trips (see
  // tests/qr-evidence-pathway-standards-pagesize-20260918.cjs) -- purely a round-trip-count change,
  // unrelated to and not exercising the staleness logic this test covers, so the fixed/buggy strings here
  // are updated to match without changing what this test actually proves.
  const fixedLine=`    if(!(standardRows().length)||refStale('pathway_standards'))jobs.push(['pathway_standards','pathwayStandards','/rest/v1/pathway_standards?select=*',X.REF_FETCH_PAGE_SIZE]);\n    if(!(meetRows().length)||refStale('pathway_meets'))jobs.push(['pathway_meets','pathwayMeets','/rest/v1/pathway_meets?select=*',X.REF_FETCH_PAGE_SIZE]);`;
  const buggyLine=`    if(!(standardRows().length))jobs.push(['pathway_standards','pathwayStandards','/rest/v1/pathway_standards?select=*',X.REF_FETCH_PAGE_SIZE]);\n    if(!(meetRows().length))jobs.push(['pathway_meets','pathwayMeets','/rest/v1/pathway_meets?select=*',X.REF_FETCH_PAGE_SIZE]);`;
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed job-selection lines -- their wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.reffailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const{X,fetchedPaths}=bootFixture(tmpPath);
    const result=await X.completeEvidence(matthew,()=>{});
    assert.ok(result.ok,'sanity: completeEvidence itself should not error even in the buggy version');
    assert.ok(!fetchedPaths.some(p=>p.includes('/pathway_standards')),
      'test setup: the buggy pre-fix source must skip the fetch entirely when the stale cache is non-empty');
    const model=X.modelFor(matthew,'SCM'),im200=model.events.find(e=>e.distance===200&&e.stroke==='IM');
    assert.ok(!im200?.next,
      'the buggy pre-fix source must leave the model with no usable upcoming target forever (the stale row is past its own meet date) -- confirms this test would have caught the exact bug Andy hit for Matthew Robertson');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('PATHWAY_STANDARDS_REFERENCE_STALENESS_FAILBEFORE_PASS');
}

(async()=>{
  await run();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
