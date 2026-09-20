'use strict';
// Real coaching failure this pins (Andy, live, 20 Sept 2026, right after the same-night national-benchmark
// fix unblocked "Give swimmer access" far enough to reach it for the first time tonight): Matthew Robertson's
// QR generation froze for real -- tickSeconds stuck at 0 for 28+ minutes, a genuine main-thread block, not a
// network/await hang (wakeLockHeld:true, so the tab never backgrounded either). The breadcrumb's
// lastCheckpoint pinned it to 'payload:training'.
//
// Root cause: architecture/training-history-core.js's athleteTrainingView() built `records` by mapping EVERY
// session ever recorded (176 on Andy's real device, and growing every week) through recordSession(), and
// recordSession() runs TWO full projection() passes over each session, calling the real per-item
// `prescribe` (engines/coordinator.js's prescription()) once per set/rep item -- genuine pace/target
// computation, not a cheap lookup. Nothing that reads this view's output needs more than a trailing window:
// `today` only needs the current date's session, `week`/`month` only ever look back 7/30 days, and
// `upcoming` was already computed separately from the full session list without this cost. So every call
// re-did real per-item work for months of sessions nobody asked about, and on Andy's real data volume that
// was apparently enough to lock up the main thread for many minutes straight.
//
// This test proves: (1) sessions well outside a trailing window are no longer run through the expensive
// prescribe() path at all -- proven by literally counting prescribe() calls, not by timing (timing is
// flaky; a call count is not); (2) today/week/month/upcoming still come out correct with the bound in place
// -- this is a performance fix, not a behaviour change; (3) fail-before/pass-after against the real source.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const corePath=path.join(repoRoot,'architecture','training-history-core.js');
const realSrc=fs.readFileSync(corePath,'utf8');

const today=new Date('2026-09-20T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const addDays=(n)=>{const x=new Date(today);x.setUTCDate(x.getUTCDate()+n);return x;};

const matthew={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'Senior'};

function makeSession(id,daysAgo,{finish=true}={}){
  return{id,identity:{date:iso(addDays(-daysAgo)),dayPart:'AM',title:`Session ${id}`,squads:['Senior'],course:'SCM'},
    blocks:[{id:`${id}-b1`,title:'Main',items:[{id:`${id}-i1`,kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Threshold',raw:'4 x 100 Threshold'}]}],
    finish:finish?{}:null};
}

// 176 sessions is Andy's real live count tonight -- build a comparable spread: most of them old (well
// outside any 7/30-day window), a handful genuinely recent/current, matching the real shape of the bug.
const oldSessions=Array.from({length:160},(_,i)=>makeSession(`old-${i}`,90+i)); // 90-249 days ago
const recentSessions=[makeSession('recent-1',5),makeSession('recent-2',20)];
const todaySession=makeSession('today-1',0);
const allSessions=[...oldSessions,...recentSessions,todaySession];

const attendance=allSessions.map(s=>({session_id:s.id,athlete_id:matthew.id,status:'present'}));

function runView(fromPath){
  delete require.cache[require.resolve(fromPath)];
  const AthleteSession=require(path.join(repoRoot,'architecture','athlete-session-core.js'));
  delete require.cache[require.resolve(fromPath)];
  const TrainingHistory=require(fromPath);
  let prescribeCalls=0;
  const prescribe=()=>{prescribeCalls++;return{item:null,target:{status:'none'}};};
  const view=TrainingHistory.athleteTrainingView({
    athlete:matthew,sessions:allSessions,attendance,prescribe,asOf:today,currentSessionId:todaySession.id,
  });
  return{view,prescribeCalls,TrainingHistory};
}

// 1. The fix: old sessions must not be run through the expensive per-item prescribe() path.
{
  const{view,prescribeCalls,TrainingHistory}=runView(corePath);
  // Each in-window session contributes at least 2 prescribe() calls (fullPlan+boundedPlan, 1 item each).
  // 160 old sessions would add 320+ calls if unbounded; bounded, only the 3 in-window sessions can contribute.
  assert.ok(prescribeCalls<=8,
    `only the in-window sessions should reach prescribe() -- expected a small bounded count, got ${prescribeCalls} (unbounded would be 300+)`);
  assert.ok(prescribeCalls>=2,'sanity: the in-window sessions must still actually be processed');

  // 2. Behaviour must be unchanged for everything that matters: today/week/month/upcoming still correct.
  assert.ok(view.today,'today\'s session must still be found');
  assert.equal(view.today.sessionId,todaySession.id);
  assert.equal(view.week.sessions,2,'today\'s and the 5-day-old session (both attended+finished) must count into the 7-day window');
  assert.equal(view.month.sessions,3,'today\'s, the 5-day-old, and the 20-day-old session (all attended+finished) must count into the 30-day window');
  assert.ok(TrainingHistory.TRAINING_HISTORY_WINDOW_DAYS>=30,'the bound must comfortably cover the 30-day month window');

  console.log(`TRAINING_HISTORY_VIEW_UNBOUNDED_RECOMPUTE_PASS · ${prescribeCalls} prescribe() calls for 3 in-window sessions out of ${allSessions.length} total`);
}

// 3. Fail-before/pass-after on the exact source change: revert to the old unconditional
//    `(sessions||[]).map(s=>recordSession(...))` and confirm ALL 163 sessions (not just the 3 in-window
//    ones) get run through prescribe() -- reproducing the real unbounded cost this fix removes.
{
  const fixedLine=`function athleteTrainingView({athlete,sessions=[],attendance=[],attendanceSnapshots={},athleteSessionBoundaries=null,squadSessionBoundaries=null,presentSessionIds=[],prescribe=null,captures=[],performance=null,asOf=new Date(),currentSessionId=null}={}){const asOfMs=asOf instanceof Date?asOf.getTime():new Date(asOf).getTime(),recentSessions=(sessions||[]).filter(s=>{const t=dateMs(sessionDate(s));return!Number.isFinite(t)||t>=asOfMs-TRAINING_HISTORY_WINDOW_MS;}),records=recentSessions.map(s=>recordSession({session:s,athlete,attendance,attendanceSnapshots,athleteSessionBoundaries,squadSessionBoundaries,presentSessionIds,prescribe,captures}))`;
  const buggyLine=`function athleteTrainingView({athlete,sessions=[],attendance=[],attendanceSnapshots={},athleteSessionBoundaries=null,squadSessionBoundaries=null,presentSessionIds=[],prescribe=null,captures=[],performance=null,asOf=new Date(),currentSessionId=null}={}){const records=(sessions||[]).map(s=>recordSession({session:s,athlete,attendance,attendanceSnapshots,athleteSessionBoundaries,squadSessionBoundaries,presentSessionIds,prescribe,captures}))`;
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed athleteTrainingView() signature/records line -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=corePath.replace(/\.js$/,'.unboundedfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const{prescribeCalls}=runView(tmpPath);
    assert.ok(prescribeCalls>=320,
      `the buggy pre-fix source must run every one of the 163 sessions through prescribe() -- confirms this test would have caught the exact unbounded-recompute bug, got only ${prescribeCalls} calls`);
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('TRAINING_HISTORY_VIEW_UNBOUNDED_RECOMPUTE_FAILBEFORE_PASS');
}

require('node:child_process').execFileSync(process.execPath,['--check',corePath],{stdio:'pipe'});
