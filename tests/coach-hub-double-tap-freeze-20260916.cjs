'use strict';
// Real coaching failure this fixes (Andy, 16 Sept 2026): "I hit coach hub and nothing happens, I click it
// again it freezes. Stays there till I back out." engines/coach-loop-ui.js's renderCoachHub() walks nearly
// all of M.state synchronously on every visit (every weekly/season plan, every canonicalSession scanned
// for carry-forward, every block/item for the session-makeup mix, captures/reflections/meetRaces lookups)
// with no caching -- as months of real history accumulate (the same "state has grown large, cloud sync
// off" pattern behind the QR-freeze/background-save investigation), this can take long enough that nothing
// visibly happens on the first tap. engines/navigation.js's real click handler (V.go) has no guard against
// re-navigating to a view that's already active, so an impatient second tap on "Coach Hub" queues a full
// SECOND run of the exact same expensive computation right behind the first -- JS is single-threaded, so
// this isn't concurrent, it's back-to-back, roughly doubling the wait and crossing into what reads as a
// genuine freeze.
//
// The fix coalesces a rapid repeat render: if nothing in state changed (M.state.settings.storageRevision
// is unchanged) and the last real render finished under 400ms ago, a repeat call is a no-op instead of
// redoing the whole expensive computation. This test proves: (a) two back-to-back calls with unchanged
// state only do the real work once (L.hubRenderRuns stays at 1, not 2); (b) a call after state genuinely
// changed (revision bumped) still does real work again -- the coalescing must never suppress a real
// update; (c) fail-before/pass-after on the exact source change, proving this test would have caught the
// double-render bug.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const coachLoopPath=path.join(repoRoot,'engines','coach-loop-ui.js');
const realSrc=fs.readFileSync(coachLoopPath,'utf8');

function makeHubElement(){
  const el={
    dataset:{},
    _html:'',
    get innerHTML(){return this._html},
    set innerHTML(v){this._html=v},
    querySelector(){return{addEventListener(){}}},
    querySelectorAll(){return[]},
  };
  return el;
}

function bootApp(){
  global.window=global;global.scrollY=0;
  global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  const hubEl=makeHubElement();
  global.document={
    addEventListener(){},
    querySelector(sel){return sel==='#hubView'?hubEl:null;},
    querySelectorAll(){return[];},
    body:{dataset:{}},
  };
  global.location={hash:'',href:'https://hub-test.local/'};
  global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
  require(path.join(repoRoot,'app.js'));
  require(path.join(repoRoot,'v4-correct.js'));
  require(path.join(repoRoot,'v4-poolside-core.js'));
  require(path.join(repoRoot,'engines','coach-loop-ui.js'));
  return{M:global.MSOS4,hubEl};
}

function seedSession(M){
  const session={id:'sess-1',kind:'session',identity:{date:'2026-09-16',dayPart:'PM',squads:['National'],course:'SCM'},blocks:[],metadata:{}};
  M.state.canonicalSessions={[session.id]:session};
  M.state.settings.selectedSessionId=session.id;
  M.state.athletes=M.state.athletes||[];
  M.state.attendance=M.state.attendance||[];
  M.state.captures=M.state.captures||[];
  M.state.meets=M.state.meets||[];
  M.state.meetRaces=M.state.meetRaces||[];
  M.state.athleteReflections=M.state.athleteReflections||[];
  M.state.weeklyPlans=[];M.state.seasonPlans=[];
  return session;
}

function run(){
  delete require.cache[require.resolve(coachLoopPath)];
  delete require.cache[require.resolve(path.join(repoRoot,'app.js'))];
  delete require.cache[require.resolve(path.join(repoRoot,'v4-correct.js'))];
  delete require.cache[require.resolve(path.join(repoRoot,'v4-poolside-core.js'))];
  const{M}=bootApp();
  seedSession(M);
  M.state.settings.storageRevision=1;

  // Two back-to-back calls with unchanged state: only the first should do real work.
  M.coachLoopUI.renderCoachHub();
  assert.equal(M.coachLoopUI.hubRenderRuns,1,'first call must do real work');
  assert.ok(M.viewTimings?.hub!=null,'first real render must record a timing');
  M.coachLoopUI.renderCoachHub();
  assert.equal(M.coachLoopUI.hubRenderRuns,1,'a second back-to-back call with unchanged state must be coalesced, not redo the full expensive computation (the exact bug Andy hit on a double tap)');

  // A genuine state change (revision bumped, as every M.store.save() does) must still re-render for real.
  M.state.settings.storageRevision=2;
  M.coachLoopUI.renderCoachHub();
  assert.equal(M.coachLoopUI.hubRenderRuns,2,'a call after a real state change must not be suppressed by the coalescing guard');

  console.log('COACH_HUB_DOUBLE_TAP_PASS');
}

function runFailBefore(){
  // Fail-before: revert to the exact pre-fix renderCoachHub (no coalescing guard, no finish()/timing) and
  // confirm two back-to-back calls with unchanged state incorrectly redo the full computation twice.
  const fixedOpen=`  L.hubRenderRuns=0;
  function renderCoachHub(){
    const h=document.querySelector('#hubView');if(!h)return;
    const rev=Number(M.state?.settings?.storageRevision)||0;
    if(h.dataset.loopHubRev===String(rev)&&Date.now()-(Number(h.dataset.loopHubRenderedAt)||0)<400)return;
    const t0=Date.now();
    const finish=()=>{h.dataset.loopHubRev=String(rev);h.dataset.loopHubRenderedAt=String(Date.now());L.hubRenderRuns++;M.viewTimings=M.viewTimings||{};M.viewTimings.hub=Date.now()-t0;};
    const s=currentSession();if(!s){h.innerHTML='<section class="empty-card">Select a session to see the coaching picture.</section>';finish();return;}`;
  const buggyOpen=`  function renderCoachHub(){
    const h=document.querySelector('#hubView');if(!h)return;const s=currentSession();if(!s){h.innerHTML='<section class="empty-card">Select a session to see the coaching picture.</section>';return;}`;

  const fixedClose=`    h.querySelector('[data-loop-connection]')?.addEventListener('click',()=>go('connection'));
    finish();
  }`;
  const buggyClose=`    h.querySelector('[data-loop-connection]')?.addEventListener('click',()=>go('connection'));
  }`;

  assert.ok(realSrc.includes(fixedOpen),'test setup error: could not locate the fixed renderCoachHub opening -- its wording changed in a way this test does not expect');
  assert.ok(realSrc.includes(fixedClose),'test setup error: could not locate the fixed renderCoachHub closing -- its wording changed in a way this test does not expect');
  let buggySrc=realSrc.replace(fixedOpen,buggyOpen).replace(fixedClose,buggyClose);
  // The buggy source has no L.hubRenderRuns counter at all -- add a minimal one via a harmless append so
  // the test can still count real (in this case, EVERY) invocation without altering the reverted logic.
  buggySrc=buggySrc.replace('L.renderCoachHub=renderCoachHub;','L.hubRenderRuns=0;L.renderCoachHub=function(){L.hubRenderRuns++;return renderCoachHub.apply(this,arguments);};');
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=coachLoopPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    delete require.cache[require.resolve(path.join(repoRoot,'app.js'))];
    delete require.cache[require.resolve(path.join(repoRoot,'v4-correct.js'))];
    delete require.cache[require.resolve(path.join(repoRoot,'v4-poolside-core.js'))];
    global.window=global;global.scrollY=0;
    global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
    global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
    const hubEl=makeHubElement();
    global.document={addEventListener(){},querySelector(sel){return sel==='#hubView'?hubEl:null;},querySelectorAll(){return[];},body:{dataset:{}}};
    global.location={hash:'',href:'https://hub-test.local/'};
    global.history={state:null,replaceState(){},pushState(){},back(){}};
    global.addEventListener=()=>{};global.removeEventListener=()=>{};
    require(path.join(repoRoot,'app.js'));
    require(path.join(repoRoot,'v4-correct.js'));
    require(path.join(repoRoot,'v4-poolside-core.js'));
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const M=global.MSOS4;
    seedSession(M);
    M.state.settings.storageRevision=1;

    M.coachLoopUI.renderCoachHub();
    M.coachLoopUI.renderCoachHub();
    assert.equal(M.coachLoopUI.hubRenderRuns,2,'the buggy pre-fix source must redo the full computation on both back-to-back calls -- confirms this test would have caught the double-render bug Andy hit');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('COACH_HUB_DOUBLE_TAP_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',coachLoopPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
