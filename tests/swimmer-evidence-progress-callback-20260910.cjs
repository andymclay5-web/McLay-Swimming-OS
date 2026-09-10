'use strict';
// Real coaching failure this pins: even with the bounded per-job timeout (see
// tests/swimmer-evidence-completion-timeout-20260910.cjs), Andy still reported the QR-generate modal as
// "stuck on checking swimmer evidence" -- because completeEvidence() runs up to seven checks one after
// another, and the status text never changed while any of them ran, so a slow-but-legitimately-working
// pass (each check bounded at 12s, up to ~84s total) was visually IDENTICAL to a genuinely frozen one.
// There was no way for Andy, or for us debugging his reports, to tell "still working, on check 3 of 7"
// apart from "actually stuck".
//
// Fix: completeEvidence() (and prepareAthlete()) now accept an optional onJob(name, index, total)
// callback, invoked immediately before each evidence check starts. engines/swimmer-invite-bn.js's
// generate-QR handler wires this into the visible status text, so the coach now sees e.g. "Checking
// swimmer evidence... (3/7 * results_event_history)" instead of a static, unchanging message for up to
// a minute and a half.
//
// This test proves the callback fires for every job, in order, with correct 1-based index/total, using
// the same never-resolving-fetch fixture as the timeout test (so it also incidentally re-confirms jobs
// keep proceeding past an individually-timed-out one rather than stalling the whole sequence).
const assert=require('node:assert/strict');

const athlete={id:'ath-progress-fixture',full_name:'Progress Fixture Swimmer',date_of_birth:'2010-07-01'};

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
  cloud:{ready:()=>true,fetch:()=>new Promise(()=>{})},
  engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
  cloudSessionEngine:{fetchPages:()=>new Promise(()=>{})}, // never settles -- every job times out
};

require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM;

(async()=>{
  X.EVIDENCE_JOB_TIMEOUT_MS=20;

  const calls=[];
  const result=await Promise.race([
    X.completeEvidence(athlete,(name,i,total)=>calls.push({name,i,total})),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: did not settle')),2000)),
  ]);

  // No organisation_id on the fixture athlete, and empty pathway_standards/pathway_meets refs, means
  // exactly 6 jobs run: the four athlete-id-keyed ones plus pathway_standards and pathway_meets.
  assert.equal(calls.length,6,`expected onJob called once per job, got ${JSON.stringify(calls)}`);
  assert.deepEqual(calls.map(c=>c.name),
    ['results_pb_board','coach_results','results_event_history','training_test_results','pathway_standards','pathway_meets'],
    'jobs must be reported in the same order they actually run');
  calls.forEach((c,idx)=>{
    assert.equal(c.i,idx+1,`call ${idx} must report 1-based index ${idx+1}, got ${c.i}`);
    assert.equal(c.total,6,`call ${idx} must report the true total job count (6), got ${c.total}`);
  });
  assert.equal(result.ok,false,'every job timed out, so completion must still be reported as not-ok');

  console.log('SWIMMER_EVIDENCE_PROGRESS_CALLBACK_PASS', `${calls.length} jobs reported in order`);
})().catch(err=>{console.error('SWIMMER_EVIDENCE_PROGRESS_CALLBACK_FAIL',err);process.exit(1);});
