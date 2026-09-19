'use strict';
// Real coaching failure this instruments (not yet fixed -- see the note below): Matthew Robertson's
// QR-generate modal froze AGAIN on 19 Sept 2026, on the exact symptom text from the 16 Sept report --
// "Checking swimmer evidence... (5/5 * training_test_types) (0s)", the ticker apparently never advancing.
// Checked directly against live Supabase edge logs for that exact minute (project cwoqjxiniuwmslltsfgi):
// all 5 evidence jobs, INCLUDING training_test_types, returned 200 in under 2.5 seconds total, and no
// msos_bootstrap_owner / msos_publish_swimmer_payload / msos_create_swimmer_invite RPC call ever reached
// the network afterward. So the freeze is real, but it happens entirely CLIENT-SIDE, somewhere in the
// stretch between completeEvidence()'s job loop finishing and note('Establishing secure owner access...')
// in engines/swimmer-invite-bn.js -- and that whole stretch (refs.save, T400 hydrate, cache invalidation,
// buildModel via readinessFor, and payloadFor's sessions/performance/training/tests/meet assembly) had NO
// breadcrumb of its own, so it was indistinguishable from the evidence check itself still running.
//
// A synchronous compute-cost check of the standards-matching this stretch does (targetsFor/rowsByProgramme
// against the ~4400-row pathway_standards table, x2-3 over for Matthew's ~35 events) benchmarked at ~90ms
// for 300k+ iterations on ordinary hardware -- even generously derated 100x for a slow phone, that is
// seconds, not the 2+ minutes reported, so pure compute time is an unlikely sole explanation. The leading
// suspect is the phone's screen locking/backgrounding mid-flow (Android can suspend a page's JS entirely
// while backgrounded, which would also explain the ticker looking frozen at literal 0s) -- matching the
// already-tracked "phone-in-pocket/screen-off" freeze pattern -- but this is not confirmed.
//
// This is NOT a fix: the real stuck step is still unknown. It adds the same diagnostic-first breadcrumbs
// that cracked the pathway_standards staleness bug on the 18th, so the NEXT occurrence's breadcrumb names
// the exact step still running instead of leaving this whole post-network tail as one blind spot. This test
// proves the new checkpoints exist, fire in the right order, and are wired into the visible status text.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const ciPath=path.join(root,'engines','swimmer-performance-ci.js');
const invitePath=path.join(root,'engines','swimmer-invite-bn.js');

const athlete={id:'ath-post-network-checkpoints-fixture',full_name:'Post Network Checkpoints Fixture Swimmer',date_of_birth:'2010-07-01'};

function bootCi(){
  global.MSOSEngines={Evidence:{
    course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
    seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
  }};
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
    refs:{get:()=>[],merge:()=>{},save:async()=>{}},
    currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
    pathway:{defaultStandard:()=>true},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},
    cloud:{ready:()=>true,fetch:()=>Promise.resolve([])},
    engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
    cloudSessionEngine:{fetchPages:()=>Promise.resolve([])}, // every job succeeds quickly
  };
  delete require.cache[require.resolve(ciPath)];
  delete global.MSOS4.swimmerPerformanceBM;
  require(ciPath);
  return global.MSOS4.swimmerPerformanceBM;
}

async function run(){
  const X=bootCi();
  const calls=[];
  const result=await Promise.race([
    X.completeEvidence(athlete,(name,i,total)=>calls.push({name,i,total})),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: completeEvidence did not settle')),2000)),
  ]);
  assert.equal(result.ok,true,'fixture sanity: every job resolves fast, so completion must be ok');

  const names=calls.map(c=>c.name);
  const checkpointIdx=['refs_save','t400_hydrate','cache_invalidate'].map(n=>names.indexOf(n));
  assert.ok(checkpointIdx.every(i=>i>=0),`all three post-loop checkpoints must fire, got ${JSON.stringify(names)}`);
  assert.ok(checkpointIdx[0]<checkpointIdx[1]&&checkpointIdx[1]<checkpointIdx[2],
    `checkpoints must fire in order refs_save -> t400_hydrate -> cache_invalidate, got ${JSON.stringify(names)}`);
  const lastJobIdx=Math.max(...names.map((n,i)=>['results_pb_board','coach_results','results_event_history','training_test_results','pathway_standards','pathway_meets'].includes(n)?i:-1));
  assert.ok(lastJobIdx>=0&&lastJobIdx<checkpointIdx[0],'the three checkpoints must fire AFTER every evidence job, not interleaved with them');
  calls.filter(c=>['refs_save','t400_hydrate','cache_invalidate'].includes(c.name)).forEach(c=>{
    assert.equal(c.i,undefined,`checkpoint ${c.name} must not carry an index`);
    assert.equal(c.total,undefined,`checkpoint ${c.name} must not carry a total`);
  });

  // payloadFor's own sub-step breadcrumb: called directly (it is exposed on X for exactly this purpose --
  // see the existing X.payloadFor=payloadFor export), with a fixture minimal enough that every dependency
  // it calls resolves to an empty/harmless value, so this purely proves the callback ordering/coverage.
  global.MSOS4.access={role:()=>'owner'};
  global.MSOS4.state.captures=[];global.MSOS4.state.meetEntries=[];global.MSOS4.state.trainingTestResults=[];
  global.MSOS4.swimmerTrainingBG={candidateSessionsFor:()=>[],viewFor:()=>null};
  global.MSOS4.performanceEngine.pathwaysForAthlete=()=>({events:[]});
  delete require.cache[require.resolve(invitePath)];
  global.document={readyState:'complete',addEventListener(){},querySelector:()=>null,createElement:()=>({})};
  global.window=global;global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
  require(invitePath);
  const B=global.MSOS4.swimmerInviteBN;
  const steps=[];
  const portal=B.payloadFor(athlete,name=>steps.push(name));
  assert.deepEqual(steps,['sessions','performance','training','tests','meet','shared_evidence'],
    `payloadFor must report each of its 6 sub-steps, in order, got ${JSON.stringify(steps)}`);
  assert.ok(portal&&portal.schema==='msos-swimmer-portal-v6','payloadFor must still return the real portal payload shape unaffected by the new callback');
  assert.deepEqual(portal.tests,[],'fixture sanity: payload data itself must still be produced correctly alongside the new breadcrumb');

  console.log('QR_POST_NETWORK_CHECKPOINTS_PASS', JSON.stringify(names), JSON.stringify(steps));
}

function runFailBeforeCi(){
  // Fail-before: revert engines/swimmer-performance-ci.js to its pre-checkpoint shape (no onJob calls in
  // the post-loop tail) and confirm the three checkpoints are genuinely absent -- proving this test would
  // have caught their absence before today's instrumentation.
  const ciSrc=fs.readFileSync(ciPath,'utf8');
  const fixedTail="const refsSaveStartedAt=Date.now();\n    try{onJob?.('refs_save')}catch{}\n    try{const saved=await withTimeout(M.refs?.save?.()||Promise.resolve(true),X.REFS_SAVE_TIMEOUT_MS,'Saving evidence to local cache');refsSaveOutcome=saved===false?'failed':'ok';}catch(err){refsSaveOutcome=/timed out/.test(err?.message||'')?'timeout':'error';}\n    refsSaveMs=Date.now()-refsSaveStartedAt;\n    try{onJob?.('t400_hydrate')}catch{}\n    try{M.correct?.hydrateT400Evidence?.(M.state,M.store?.legacy?.()||null)}catch{}\n    try{onJob?.('cache_invalidate')}catch{}\n    M.performanceEngine?.invalidate?.(M.state);";
  const buggyTail="try{await withTimeout(M.refs?.save?.()||Promise.resolve(),X.REFS_SAVE_TIMEOUT_MS,'Saving evidence to local cache')}catch{}\n    try{M.correct?.hydrateT400Evidence?.(M.state,M.store?.legacy?.()||null)}catch{}\n    M.performanceEngine?.invalidate?.(M.state);";
  assert.ok(ciSrc.includes(fixedTail),'test setup error: could not locate the fixed post-loop tail in the real file -- its wording changed in a way this test does not expect');
  const buggySrc=ciSrc.replace(fixedTail,buggyTail);
  assert.notEqual(buggySrc,ciSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.checkpointfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    global.MSOSEngines={Evidence:{
      course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
      seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
    }};
    global.MSOS4={
      state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
      refs:{get:()=>[],merge:()=>{},save:async()=>{}},
      currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
      pathway:{defaultStandard:()=>true},
      performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
      ui:{},
      cloud:{ready:()=>true,fetch:()=>Promise.resolve([])},
      engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
      cloudSessionEngine:{fetchPages:()=>Promise.resolve([])},
    };
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const buggyX=global.MSOS4.swimmerPerformanceBM;
    const buggyCalls=[];
    return buggyX.completeEvidence(athlete,(name,i,total)=>buggyCalls.push({name,i,total}))
      .then(()=>{
        const names=buggyCalls.map(c=>c.name);
        assert.ok(!names.includes('refs_save')&&!names.includes('t400_hydrate')&&!names.includes('cache_invalidate'),
          `pre-fix source must NOT report any of the three checkpoints -- confirms this is a real, reproduced gap, got ${JSON.stringify(names)}`);
        console.log('QR_POST_NETWORK_CHECKPOINTS_FAILBEFORE_PASS');
      });
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

(async()=>{
  await run();
  await runFailBeforeCi();
  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
