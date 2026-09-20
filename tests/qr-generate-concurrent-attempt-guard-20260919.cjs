'use strict';
// Real coaching failure this fixes (Andy, 19 Sept 2026, THIRD same-day freeze on Matthew Robertson):
//
// Three separate times in one day, the "Give swimmer access" QR modal froze on the exact same step --
// "Checking swimmer evidence... (5/5 * training_test_types) (0s)" -- across two different diagnostic builds
// (the screen wake lock, then three new observational breadcrumb fields on top of it). Live Supabase edge
// logs proved, all three times, that every evidence network call had already returned fine in under a few
// seconds and nothing further (no msos_bootstrap_owner / msos_publish_swimmer_payload / msos_create_swimmer_
// invite RPC) ever reached the network -- so whatever was happening was entirely client-side, yet a careful
// synchronous read of every line between the evidence-fetch loop finishing and those RPCs firing turned up no
// plausible unbounded hang: mergeRows() is synchronous, the per-job/refs-save/whole-flow timeouts are all real
// setTimeout-backed ceilings that should always eventually fire and move the code on. That contradiction --
// "the code cannot get stuck there, yet the breadcrumb shows it stuck there every single time" -- is only
// resolved by a bug in how ATTEMPTS themselves are tracked, not in the evidence/RPC chain itself: the only
// guard against two "Generate" flows running at once was `genBtn.disabled`, scoped to ONE modal's ONE button
// element. Closing the modal (the Close button, or the phone's back button) never cancelled an in-flight
// generate() call -- its ticker, wake lock, visibility listener and pending network/RPC calls all kept running
// in the background for up to the full 2-minute ceiling, completely invisibly. Andy retrying "Give swimmer
// access" after a frozen-looking attempt -- exactly what three same-day occurrences on the same athlete imply
// -- opened a BRAND NEW modal with a freshly-enabled button that had zero awareness of that still-running old
// attempt. Both then wrote to the SAME shared msos_qr_last_attempt breadcrumb key on every tick, so whichever
// one wrote last simply overwrote the other's real progress: a genuinely slow-but-working NEW attempt could
// have its status silently stomped by an OLD, already-abandoned attempt re-stamping its own frozen step every
// second, making a real recovery indistinguishable from an eternal freeze and matching "same old shit"
// recurring same-day, same-build, same exact step far better than three unrelated fresh freezes would.
//
// This test proves: (1) a stuck first attempt's ticker is cancelled the instant a second attempt starts, so
// it can never again write to the shared breadcrumb; (2) the second attempt can complete cleanly and its
// success is what the breadcrumb shows, not the first attempt's frozen step; (3) closing a modal on its own
// (no retry) also cancels its own pending attempt, for the same reason; (4) fail-before: reverting the one
// line that cancels a superseded attempt reproduces exactly this failure -- the old ticker keeps writing and
// visibly corrupts the breadcrumb after the new attempt has already finished.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const realSrc=fs.readFileSync(invitePath,'utf8');

function makeNode(tag){
  const node={
    tagName:tag,className:'',dataset:{},style:{setProperty(){},getPropertyValue:()=>''},
    textContent:'',value:'',hidden:false,disabled:false,onclick:null,
    _cache:{},_appended:[],_hasContent:false,
    set innerHTML(v){this._html=v;this._cache={};this._hasContent=true;},
    get innerHTML(){return this._html||''},
    addEventListener(){},removeEventListener(){},
    append(...kids){this._appended.push(...kids)},
    appendChild(k){this._appended.push(k);return k},
    remove(){this._removed=true},
    closest:()=>null,
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    querySelector(sel){if(!this._hasContent)return null;if(!this._cache[sel])this._cache[sel]=makeNode('div');return this._cache[sel];},
    querySelectorAll(){return [];},
  };
  return node;
}
// A spy localStorage so the test can prove a superseded attempt's ticker stops writing entirely, not merely
// "eventually agrees" with the real one by coincidence.
function makeLocalStorageSpy(){const m=new Map();const calls=[];return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{calls.push([k,v]);m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear(),_calls:calls};}
function makeDocument(modalHost,athletesHead){
  const listeners={};
  return{
    readyState:'complete',
    body:makeNode('body'),
    visibilityState:'visible',
    addEventListener(type,fn){(listeners[type]=listeners[type]||[]).push(fn);},
    removeEventListener(type,fn){if(listeners[type])listeners[type]=listeners[type].filter(f=>f!==fn);},
    createElement:tag=>makeNode(tag),
    querySelector(sel){
      if(sel==='#modalHost')return modalHost;
      if(sel==='#athletesView .cn-owner-actions')return athletesHead;
      return null;
    },
    _fire(type){(listeners[type]||[]).slice().forEach(fn=>fn());},
  };
}

const athlete={id:'ath-concurrent-fixture',full_name:'Concurrent Fixture Swimmer',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

function okFetch(){
  return async(url)=>{
    const text=String(url).includes('msos_create_swimmer_invite')
      ?JSON.stringify({invite_token:'tok-concurrent-fixture',expires_at:new Date(Date.now()+900000).toISOString()})
      :JSON.stringify({});
    return{ok:true,text:async()=>text};
  };
}
// 19 Sept 2026 redesign (Andy, direct: "I just want to give them access ... this back and forth is wearing
// me down"): the live prepareAthlete()/completeEvidence() call that used to be this fixture's "stuck" step
// was removed from Generate's critical path entirely -- it's still real (just fire-and-forget in the
// background now), so it can no longer be what a coach sees frozen on screen. The first genuinely awaited
// network step left in the flow is the msos_bootstrap_owner RPC, so THAT is now the fixture's stuck point:
// the very first fetch() call ever made (attempt 1's bootstrap_owner) never resolves, and every fetch call
// after it succeeds normally -- reproducing "first attempt frozen, second attempt succeeds cleanly" under
// the new architecture, which is exactly what this test needs to keep proving the concurrency guard itself.
function hangFirstThenOkFetch(){
  let callCount=0;
  return async(url)=>{
    callCount++;
    if(callCount===1)return new Promise(()=>{});
    const text=String(url).includes('msos_create_swimmer_invite')
      ?JSON.stringify({invite_token:'tok-concurrent-fixture',expires_at:new Date(Date.now()+900000).toISOString()})
      :JSON.stringify({});
    return{ok:true,text:async()=>text};
  };
}

function bootFixture(src){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead);
  global.document=doc;
  global.window=global;
  global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
  const storage=makeLocalStorageSpy();
  global.localStorage=storage;
  global.QRCode=function FakeQRCode(){};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  let prepareCallCount=0;
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{
      projectionFor:()=>({date:'2026-09-19',squad:'Development',course:'SCM',title:'Threshold set',
        metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
        blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
      viewFor:()=>null,candidateSessionsFor:()=>[],
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    swimmerPerformanceBM:{
      // No longer awaited in Generate's critical path (19 Sept redesign) -- fire-and-forget background
      // refresh only, so it resolving instantly or never makes no difference to this test's timing.
      completeEvidence:()=>{prepareCallCount++;return Promise.resolve({ok:true,rows:0,errors:[]});},
      readinessFor:()=>({ok:true,issues:[]}),
    },
  };
  global.fetch=hangFirstThenOkFetch();
  const loadPath=src?null:invitePath;
  if(src){
    const tmpPath=invitePath.replace(/\.js$/,'.concurrentfailbefore.tmp.js');
    fs.writeFileSync(tmpPath,src);
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    fs.unlinkSync(tmpPath);
  }else{
    delete require.cache[require.resolve(invitePath)];
    require(invitePath);
  }
  global.MSOS4.swimmerInviteBN.STATUS_TICK_MS=5; // fast ticks so the test doesn't need to wait a full second
  return{M:global.MSOS4,modalHost,athletesHead,doc,storage};
}

async function openModal(athletesHead,modalHost){
  await null; // let requestAnimationFrame(install) settle
  const outerBtn=athletesHead._appended[0];
  assert.ok(outerBtn,'installButton() must have appended the "Give swimmer access" button');
  outerBtn.onclick(); // modal(a) -- a fresh wrap/generate button each time, exactly like closing and reopening
  const wrap=modalHost._appended[modalHost._appended.length-1];
  return{wrap,generate:wrap.querySelector('[data-bn-generate]')};
}

async function runStaleAttemptIsCancelledByANewOne(){
  const{M,athletesHead,modalHost,storage}=bootFixture();

  // First modal: tap Generate -- deliberately NOT awaited, this is the abandoned, still-running first
  // attempt, stuck exactly on the real reported symptom step.
  const{generate:generate1}=await openModal(athletesHead,modalHost);
  generate1.onclick();
  await new Promise(r=>setTimeout(r,25)); // let its ticker write a few times

  const attemptWhileStuck=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attemptWhileStuck.step,'Establishing secure owner access…','fixture sanity: the first attempt must actually be stuck on the real symptom step for this test to mean anything');
  assert.ok(storage._calls.length>2,"fixture sanity: the stuck first attempt's ticker must have written to the breadcrumb more than once");

  // Real coaching failure this reproduces: Andy closes/leaves the frozen modal and opens "Give swimmer
  // access" again to retry -- exactly what three same-day occurrences on the same athlete imply.
  const{generate:generate2}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate2.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: second attempt did not settle')),3000)),
  ]);

  const finalAttempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(finalAttempt.outcome,'ok','the second, retried attempt must be able to succeed cleanly even while the first is technically still alive in the background');
  assert.equal(finalAttempt.step,'done',"the breadcrumb must show the SECOND attempt genuinely finishing, not the first attempt's frozen step still sitting there");

  // 20 Sept 2026 architecture change (corePayloadFor + deferred background enrichment, added the same night
  // as the training-history-view fix, for the same reason: Generate must never again be at the mercy of a
  // slow analytical step): a REAL, WINNING attempt now legitimately keeps writing to this same breadcrumb key
  // for a little while after 'done' -- its own fire-and-forget setTimeout(...,0) republishes the full,
  // enriched payload and stamps enrichmentStep/enrichmentOutcome/enrichmentAt as it goes. That is expected,
  // wanted behaviour, not the stray-ticker bug this test exists to catch. So: wait for that enrichment to
  // actually finish (bounded poll, not a fixed sleep -- avoids a flaky race against however many steps
  // payloadFor() happens to have), confirm it succeeded, and confirm the fields a stray FIRST-attempt ticker
  // would corrupt (step/outcome/resolvedAt) survive it untouched -- THEN prove no further write of any kind
  // ever lands, which is the real invariant: a still-alive stray ticker would keep re-stamping its own frozen
  // step forever, even after the second attempt's own legitimate background work has long finished.
  const enrichmentSettled=await(async()=>{
    for(let i=0;i<50;i++){
      const s=M.swimmerInviteBN.lastAttemptStatus();
      if(s.enrichmentOutcome)return s;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error('TEST_HARNESS_GUARD: background enrichment never settled');
  })();
  assert.equal(enrichmentSettled.enrichmentOutcome,'ok','fixture sanity: background enrichment must succeed cleanly in this fixture');
  assert.equal(enrichmentSettled.step,'done',"the second attempt's real 'done' step must survive the background enrichment writes that follow it");
  assert.equal(enrichmentSettled.outcome,'ok',"the second attempt's real 'ok' outcome must survive the background enrichment writes that follow it");
  assert.equal(enrichmentSettled.resolvedAt,finalAttempt.resolvedAt,"the second attempt's resolvedAt must not be re-stamped by anything after it, including its own background enrichment");

  const writesAfterEnrichmentSettles=storage._calls.length;
  await new Promise(r=>setTimeout(r,60));
  assert.equal(storage._calls.length,writesAfterEnrichmentSettles,"the first, superseded attempt's ticker must be fully cancelled -- a still-running stray ticker would keep writing to the shared breadcrumb key forever, and the second attempt's own background enrichment has already finished so nothing legitimate should write either");
  assert.deepEqual(M.swimmerInviteBN.lastAttemptStatus(),enrichmentSettled,'no stray write from the superseded attempt may land after the real attempt -- including its own background enrichment -- has finished');

  console.log('QR_CONCURRENT_GUARD_SUPERSEDE_PASS');
}

async function runClosingModalCancelsItsOwnPendingAttempt(){
  // Same stuck-first-attempt setup, but this time Andy just hits Close (or the phone's back button, which
  // routes to the same handler) without ever retrying. The abandoned attempt must still be cancelled -- not
  // only when a NEW attempt supersedes it -- so closing the modal genuinely stops the background work instead
  // of leaving it to run for up to two minutes unseen.
  const{M,athletesHead,modalHost,storage}=bootFixture();
  const{wrap,generate}=await openModal(athletesHead,modalHost);
  generate.onclick();
  await new Promise(r=>setTimeout(r,25));
  assert.ok(storage._calls.length>2,"fixture sanity: the stuck attempt's ticker must have written to the breadcrumb more than once before Close is tapped");

  wrap.querySelector('[data-bn-close]').onclick();

  const writesAfterClose=storage._calls.length;
  await new Promise(r=>setTimeout(r,60));
  assert.equal(storage._calls.length,writesAfterClose,"closing the modal must cancel its own in-flight attempt's ticker -- otherwise it keeps writing to the shared breadcrumb key long after the coach has left the screen");

  console.log('QR_CONCURRENT_GUARD_CLOSE_CANCELS_PASS');
}

function runFailBefore(){
  // Fail-before: strip out the one line that cancels a superseded attempt, so a second "Generate" tap no
  // longer supersedes a still-running first one at all -- reproducing the exact failure this whole fix
  // exists for. Everything else (the gen/activeGeneration machinery itself) is left in place, since the bug
  // this test pins is specifically "nothing ever calls cancel", not the cancellation mechanism's existence.
  const buggyLine='      \n';
  const fixedLine='      activeGeneration?.cancel?.();\n';
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the activeGeneration cancel call in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes('activeGeneration?.cancel?.();'),'test setup error: reverted source must not still cancel a superseded attempt');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'}); // sanity: this check is against the real file, confirming our fixture below tests a genuinely different (buggy) copy

  return(async()=>{
    const{M,athletesHead,modalHost,storage}=bootFixture(buggySrc);
    const{generate:generate1}=await openModal(athletesHead,modalHost);
    generate1.onclick();
    await new Promise(r=>setTimeout(r,25));
    assert.equal(M.swimmerInviteBN.lastAttemptStatus().step,'Establishing secure owner access…','fixture sanity: the first attempt must be stuck on the real symptom step');

    const{generate:generate2}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate2.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: second attempt did not settle')),3000)),
    ]);
    const rightAfterSecondSettles=M.swimmerInviteBN.lastAttemptStatus();
    assert.equal(rightAfterSecondSettles.outcome,'ok','fixture sanity: the second attempt itself must still be able to succeed on the buggy source -- this test isolates the breadcrumb corruption, not a second, unrelated failure');

    // Without the cancel call, the first attempt's ticker is still alive and will keep re-stamping its own
    // frozen step over the second attempt's genuine "done" outcome -- reproducing "a real recovery looks
    // exactly like an eternal freeze" from a shared breadcrumb key with no attempt isolation.
    await new Promise(r=>setTimeout(r,60));
    const corrupted=M.swimmerInviteBN.lastAttemptStatus();
    assert.notDeepEqual(corrupted,rightAfterSecondSettles,'pre-fix source must let the stale first attempt keep writing and corrupt the breadcrumb after the second attempt already finished -- confirms this test would have caught the missing cancellation');
    assert.equal(corrupted.step,'Establishing secure owner access…','pre-fix source: the stale attempt\'s frozen step must be the thing that overwrote the real outcome');

    console.log('QR_CONCURRENT_GUARD_FAILBEFORE_PASS');
  })();
}

(async()=>{
  await runStaleAttemptIsCancelledByANewOne();
  await runClosingModalCancelsItsOwnPendingAttempt();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  // The fail-before fixture's whole point is a first attempt whose ticker is NEVER cancelled (that is the bug
  // being pinned) -- its setInterval(...,5) is deliberately left running forever with nothing left to clear
  // it, which would otherwise keep the Node event loop alive past every assertion above already passing.
  // Exiting explicitly here, only after every check has run, is cleanup for that intentional fixture leak --
  // not a way of skipping any assertion.
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
