'use strict';
// Real coaching failure this pins: Andy's own live report on the "Give swimmer access" QR-generate modal --
// after the per-job evidence-check timeout (tests/swimmer-evidence-completion-timeout-20260910.cjs) and the
// progress counter (tests/swimmer-evidence-progress-callback-20260910.cjs) were both confirmed live and
// working (the counter correctly reached "(5/5 * training_test_types)", the last check), the modal STILL
// froze on that exact status text for several literal minutes with no further change and no error.
//
// The counter reaching the last job and never moving again points at a step that runs AFTER the evidence-job
// loop finishes, with no timeout of its own. engines/swimmer-performance-ci.js's completeEvidence() calls
// `await M.refs?.save?.()` (an IndexedDB write) immediately after that loop, completely unguarded -- if that
// write ever stalls (a blocked IndexedDB connection, storage pressure, a wedged transaction), the coach sees
// exactly Andy's symptom: the LAST evidence-job message frozen forever, because nothing updates the status
// text again until this unguarded step resolves.
//
// Fix: that save is now wrapped in the same withTimeout(...) helper as the evidence jobs
// (X.REFS_SAVE_TIMEOUT_MS, default 5000ms in production) and already sits inside a try/catch that discards
// failures -- a timed-out save just means the freshly-fetched evidence isn't cached locally yet, not a
// reason to block the swimmer-access flow that already has the data in memory. This test proves
// completeEvidence settles promptly even when the save never resolves, instead of hanging forever.
const assert=require('node:assert/strict');

const athlete={id:'ath-refs-save-fixture',full_name:'Refs Save Fixture Swimmer',date_of_birth:'2010-07-01'};

global.MSOSEngines={Evidence:{
  course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
  seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
}};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
  // The bug condition: every evidence job resolves fine (empty pages, instantly) -- exactly like Andy's
  // report, where the counter successfully reached the final job -- but the local-cache save that runs
  // right after the loop NEVER resolves, the exact shape of a wedged IndexedDB write.
  refs:{get:()=>[],merge:()=>{},save:()=>new Promise(()=>{})},
  currentSession:()=>({identity:{date:'2026-09-10',course:'SCM'}}),
  pathway:{defaultStandard:()=>true},
  performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
  ui:{},
  cloud:{ready:()=>true,fetch:async()=>[]},
  engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
  cloudSessionEngine:{fetchPages:async()=>[]}, // every evidence job settles instantly with no rows
};

require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM;

(async()=>{
  // Drop the save timeout to make the test fast; exercises the identical withTimeout code path as production.
  X.REFS_SAVE_TIMEOUT_MS=30;

  const start=Date.now();
  const result=await Promise.race([
    X.completeEvidence(athlete),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: completeEvidence did not settle -- a stalled local-cache save is not bounded')),2000)),
  ]);
  const elapsedMs=Date.now()-start;

  // The evidence jobs themselves all succeeded (empty rows is a valid, error-free result), so completion
  // must still be reported ok -- a slow/stuck local cache write must not fail the whole evidence check when
  // the data was already fetched successfully.
  assert.equal(result.ok,true,`a stalled local-cache save must not fail completion when every evidence job actually succeeded, got errors: ${JSON.stringify(result.errors)}`);
  assert.ok(elapsedMs<1000,`completeEvidence must settle promptly even when M.refs.save() never resolves, took ${elapsedMs}ms`);

  console.log('SWIMMER_EVIDENCE_REFS_SAVE_TIMEOUT_PASS', `settled in ${elapsedMs}ms despite a permanently-pending refs.save()`);
})().catch(err=>{console.error('SWIMMER_EVIDENCE_REFS_SAVE_TIMEOUT_FAIL',err);process.exit(1);});
