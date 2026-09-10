'use strict';
// Real coaching failure this pins: Andy reported the "Give swimmer access" QR-generate modal
// (engines/swimmer-invite-bn.js) getting stuck forever on the "Checking swimmer evidence…" status
// with no error, no button re-enable, nothing. That status text is set immediately before
// `await M.swimmerPerformanceBM.prepareAthlete(a)`, which calls completeEvidence() in
// engines/swimmer-performance-ci.js -- a sequential loop of up to six network fetches
// (results_pb_board, coach_results, results_event_history, training_test_results,
// training_test_types, pathway_standards, pathway_meets) via M.cloudSessionEngine.fetchPages /
// M.cloud.fetchPages. None of those fetches had a timeout anywhere in the chain (cloud-session.js's
// C.fetch, C.ensureFresh, or the underlying M.cloud.fetch), so a single stalled request (a slow
// network, a wedged auth-refresh call, a proxy that never completes the TLS handshake) left the
// `await` permanently pending -- the per-job try/catch only ever catches a REJECTED promise, never
// one that simply never settles. The generate-QR button stays disabled and the status text frozen,
// indistinguishable from a healthy in-progress state, forever.
//
// Fix: engines/swimmer-performance-ci.js now wraps each evidence job in a bounded
// `withTimeout(...)` (X.EVIDENCE_JOB_TIMEOUT_MS, default 12000ms in production) so a stalled fetch
// rejects with a clear, user-facing message instead of hanging -- which the existing per-job
// try/catch converts into a completion error, which swimmer-invite-bn.js's modal already surfaces
// as "Could not verify complete swimmer evidence: …" instead of leaving the coach staring at a
// frozen screen.
//
// This test proves the bound is real, not decorative: it stubs a network call that NEVER resolves
// (the exact shape of the original bug) and confirms completeEvidence still settles -- with a clear
// timeout message -- well within a short test budget. X.EVIDENCE_JOB_TIMEOUT_MS is dropped to a few
// milliseconds for the test so this doesn't require a real 12-second wait; the code path exercised
// (withTimeout wrapping a real never-resolving promise) is identical to production, only the
// duration differs.
const assert=require('node:assert/strict');

const athlete={id:'ath-hang-fixture',full_name:'Hang Fixture Swimmer',date_of_birth:'2010-07-01'};

global.MSOSEngines={Evidence:{
  course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
  seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
}};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
  refs:{get:()=>[],merge:()=>{},save:async()=>{}},
  currentSession:()=>({identity:{date:'2026-09-10',course:'SCM'}}),
  pathway:{defaultStandard:()=>true},
  performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
  ui:{},
  // The bug condition: cloud reads are attemptable, and the fetch layer NEVER resolves or rejects --
  // exactly what a wedged network request looks like from the caller's point of view.
  cloud:{ready:()=>true,fetch:()=>new Promise(()=>{})},
  engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
  cloudSessionEngine:{fetchPages:()=>new Promise(()=>{})}, // never settles
};

require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM;

(async()=>{
  // Drop the timeout to make the test fast; exercises the identical withTimeout code path as production.
  X.EVIDENCE_JOB_TIMEOUT_MS=30;

  const start=Date.now();
  const result=await Promise.race([
    X.completeEvidence(athlete),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: completeEvidence did not settle -- the hang is not bounded')),2000)),
  ]);
  const elapsedMs=Date.now()-start;

  assert.equal(result.ok,false,'a permanently-pending evidence fetch must not be reported as a successful completion');
  assert.ok(result.errors.length>0,'a bounded failure must record at least one error');
  assert.ok(result.errors.some(e=>/timed out/i.test(e)),`expected a clear timeout message, got: ${JSON.stringify(result.errors)}`);
  assert.ok(elapsedMs<1000,`completeEvidence must settle promptly once bounded, took ${elapsedMs}ms`);

  console.log('SWIMMER_EVIDENCE_COMPLETION_TIMEOUT_PASS', `settled in ${elapsedMs}ms ·`, result.errors[0]);
})().catch(err=>{console.error('SWIMMER_EVIDENCE_COMPLETION_TIMEOUT_FAIL',err);process.exit(1);});
