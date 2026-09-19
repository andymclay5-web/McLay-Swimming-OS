'use strict';
// Real coaching failure this fixes/instruments (Andy, 19 Sept 2026, TWO occurrences the same day):
//
// First occurrence: Matthew Robertson's "Give swimmer access" QR modal froze again on the exact 16 Sept
// symptom text -- "Checking swimmer evidence... (5/5 * training_test_types) (0s)", ticker apparently stuck at
// zero, never advancing, no error ever surfaced. Checked directly against live Supabase edge logs for that
// exact minute: every evidence job, INCLUDING training_test_types, had already returned 200 in under 2.5
// seconds, and no msos_bootstrap_owner / msos_publish_swimmer_payload / msos_create_swimmer_invite RPC ever
// reached the network afterward -- so the freeze was real but entirely client-side. Asked Andy directly rather
// than guessing: "did your screen lock or did you switch away from the app during that wait?" -- his answer:
// "screen was locked, yeah". Shipped a fix (v4-qr-wake-lock-fix-20260919a): request a screen wake lock
// (navigator.wakeLock.request('screen')) the moment Generate is tapped, release it in the handler's existing
// finally block on every exit path.
//
// Second occurrence, same day, same build: it happened again, same exact symptom, same athlete, same step --
// "hit 0s, whole screen froze again, could only get out by hard back". This DISPROVES treating the wake lock
// as a confirmed fix. The likely reason, on reflection: the Wake Lock API only prevents the screen dimming
// from ordinary INACTIVITY timeout -- it does NOT prevent a manual power-button press, and does NOT prevent
// Android throttling/suspending a BACKGROUNDED tab if Andy switches to another app (a text message, phone in
// pocket) even while the screen itself stays on. "Screen was locked" could have meant any of these, and only
// the inactivity-timeout case is even theoretically fixable by holding a wake lock. Rather than guess a THIRD
// time, this adds purely observational breadcrumb fields so the next occurrence proves which one actually
// happened: whether the lock was even supported/held at all (wakeLockSupported/wakeLockHeld), whether the
// BROWSER itself force-released it before we did (wakeLockReleasedEarly/wakeLockReleasedAt -- its own native
// 'release' event, which fires when the OS reclaims the lock, e.g. a real hardware screen-off), and the exact
// moment(s) the tab's own visibility changed (lastVisibilityState/lastVisibilityChangeAt -- hidden means truly
// backgrounded, not just dimmed). This test proves: (1) the lock is requested and its supported/held state is
// written to the breadcrumb immediately; (2) the lock is released on both the success and error paths; (3) a
// browser-forced 'release' event mid-flow is captured in the breadcrumb, with a timestamp; (4) a
// visibilitychange event mid-flow is captured in the breadcrumb, with a timestamp, and the listener is
// correctly torn down once the flow ends; (5) a browser with no navigator.wakeLock at all must not throw or
// block QR generation, with graceful support:false recorded instead.
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
function makeLocalStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}

// A document mock that actually tracks visibilitychange listeners (the base makeNode() stub is a no-op) so a
// test can fire one mid-flow, and can assert the handler was torn down once the flow finishes.
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
    _listenerCount(type){return(listeners[type]||[]).length;},
  };
}

const athlete={id:'ath-wake-lock-fixture',full_name:'Wake Lock Fixture Swimmer',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

// A fetch mock that answers every RPC this flow makes (msos_bootstrap_owner, the Challenge/Edit/Finish check,
// msos_publish_swimmer_payload, msos_create_swimmer_invite) fast and successfully, so the SUCCESS test proves
// the lock is released once the whole flow genuinely completes, not merely once it throws early.
function okFetch(){
  return async(url)=>{
    const text=String(url).includes('msos_create_swimmer_invite')
      ?JSON.stringify({invite_token:'tok-wake-lock-fixture',expires_at:new Date(Date.now()+900000).toISOString()})
      :JSON.stringify({});
    return{ok:true,text:async()=>text};
  };
}

function bootFixture({navigatorValue,slowRpc}={}){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead);
  global.document=doc;
  global.window=global;
  global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:navigatorValue||{},configurable:true});
  global.localStorage=makeLocalStorage();
  global.QRCode=function FakeQRCode(){}; // short-circuits loadQr()'s CDN script-append path entirely

  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
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
      viewFor:()=>null,
      candidateSessionsFor:()=>[],
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    swimmerPerformanceBM:{
      prepareAthlete:(a,{onJob}={})=>{onJob?.('training_test_types',5,5);return slowRpc?new Promise(()=>{}):Promise.resolve({completion:{ok:true}});},
      readinessFor:()=>({ok:true,issues:[]}),
    },
  };
  global.fetch=okFetch();
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return{M:global.MSOS4,modalHost,athletesHead,doc};
}

async function clickGenerate(athletesHead){
  await null; // let requestAnimationFrame(install) settle
  const genBtn=athletesHead._appended[0];
  assert.ok(genBtn,'installButton() must have appended the "Give swimmer access" button');
  genBtn.onclick();
  const wrap=global.document.querySelector('#modalHost')._appended[0];
  return wrap.querySelector('[data-bn-generate]');
}

async function runSuccessAcquiresAndReleases(){
  const requested=[],released=[];
  const lock={release:async()=>{released.push(true);},addEventListener(){},removeEventListener(){}};
  const navigatorValue={wakeLock:{request:async(type)=>{requested.push(type);return lock;}},clipboard:{writeText:async()=>{}}};
  const{M,athletesHead}=bootFixture({navigatorValue});

  const generate=await clickGenerate(athletesHead);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle')),3000)),
  ]);

  assert.deepEqual(requested,['screen'],`Generate must request a 'screen' wake lock exactly once, got ${JSON.stringify(requested)}`);
  assert.equal(released.length,1,'the wake lock must be released exactly once the flow completes successfully');
  const status=global.document.querySelector('#modalHost')._appended[0].querySelector('[data-bn-status]');
  assert.match(status.textContent,/^Ready/,`fixture sanity: the flow must actually reach success for this to prove anything, got status: ${JSON.stringify(status.textContent)}`);

  // 19 Sept, second occurrence: the breadcrumb must record whether the lock was actually held, so the NEXT
  // freeze tells us for certain instead of us re-guessing whether acquisition itself silently failed.
  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.wakeLockSupported,true,'breadcrumb must record that navigator.wakeLock was supported');
  assert.equal(attempt.wakeLockHeld,true,'breadcrumb must record that the lock was actually acquired');
  assert.equal(attempt.wakeLockReleasedEarly,false,'a lock that lived until our own release must not be marked as released early');

  console.log('QR_WAKE_LOCK_SUCCESS_PASS');
}

async function runErrorPathStillReleases(){
  // Same fixture, but readinessFor now declines -- an ordinary, early thrown error, not a timeout. The lock
  // must still be released: a coach whose evidence isn't ready yet must not be stuck with the screen held
  // awake by a dead lock after the attempt fails.
  const requested=[],released=[];
  const lock={release:async()=>{released.push(true);},addEventListener(){},removeEventListener(){}};
  const navigatorValue={wakeLock:{request:async(type)=>{requested.push(type);return lock;}},clipboard:{writeText:async()=>{}}};
  const{M,athletesHead}=bootFixture({navigatorValue});
  M.swimmerPerformanceBM.readinessFor=()=>({ok:false,issues:['Swimmer access held: fixture-forced decline.']});

  const generate=await clickGenerate(athletesHead);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle')),3000)),
  ]);

  assert.deepEqual(requested,['screen'],'the lock must still be requested even on a run that goes on to fail');
  assert.equal(released.length,1,'the wake lock must be released on the error path too, not only on success');
  const status=global.document.querySelector('#modalHost')._appended[0].querySelector('[data-bn-status]');
  assert.match(status.textContent,/fixture-forced decline/,'fixture sanity: this run must genuinely fail for the release-on-error assertion to mean anything');

  console.log('QR_WAKE_LOCK_ERROR_PATH_PASS');
}

async function runGracefulDegradationWithoutWakeLockApi(){
  // No navigator.wakeLock at all -- an older browser, or one that never exposed the API. The flow must not
  // throw or stall on this; it must complete exactly as it always did, just without the protection, and the
  // breadcrumb must honestly record wakeLockSupported:false rather than silently omitting the field.
  const{M,athletesHead}=bootFixture({navigatorValue:{clipboard:{writeText:async()=>{}}}});

  const generate=await clickGenerate(athletesHead);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle without navigator.wakeLock')),3000)),
  ]);

  const status=global.document.querySelector('#modalHost')._appended[0].querySelector('[data-bn-status]');
  assert.match(status.textContent,/^Ready/,`the flow must complete successfully even with no navigator.wakeLock present, got status: ${JSON.stringify(status.textContent)}`);
  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.wakeLockSupported,false,'breadcrumb must honestly record wakeLockSupported:false rather than omitting the field');
  assert.equal(attempt.wakeLockHeld,false,'breadcrumb must record wakeLockHeld:false when the API is unavailable');

  console.log('QR_WAKE_LOCK_GRACEFUL_DEGRADATION_PASS');
}

async function runBrowserForcedReleaseIsRecorded(){
  // Simulates the exact forensic gap the second 19 Sept freeze exposed: the OS/browser can force-release a
  // held wake lock on its own (its own native 'release' event) if it decides to reclaim it -- e.g. a real
  // hardware screen-off overriding the lock. If that happens mid-flow, the breadcrumb must show it, with a
  // timestamp, so the next real occurrence can tell "lock was force-released" apart from "lock was never
  // touched at all" apart from "lock was held the whole time and something else still froze the page".
  let releaseHandler=null;
  const lock={release:async()=>{},addEventListener(type,fn){if(type==='release')releaseHandler=fn;},removeEventListener(){}};
  const navigatorValue={wakeLock:{request:async()=>lock},clipboard:{writeText:async()=>{}}};
  const{M,athletesHead}=bootFixture({navigatorValue,slowRpc:true}); // never settles on its own -- we inspect mid-flight
  M.swimmerInviteBN.GENERATE_TIMEOUT_MS=300; // let the handler's own timeout close it out instead of hanging the process

  const generate=await clickGenerate(athletesHead);
  const clickPromise=generate.onclick().catch(()=>{}); // will settle via the overall timeout above
  await new Promise(r=>setTimeout(r,20));

  assert.ok(typeof releaseHandler==='function','test setup error: the handler must have registered a release listener on the lock');
  releaseHandler(); // simulate the browser reclaiming the lock on its own, independent of our own release()

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.wakeLockReleasedEarly,true,'a browser-forced release must be recorded in the breadcrumb');
  assert.ok(attempt.wakeLockReleasedAt,'a browser-forced release must be timestamped');

  await clickPromise; // let the handler's own timeout settle before moving on, so no timer outlives this test

  console.log('QR_WAKE_LOCK_FORCED_RELEASE_PASS');
}

async function runVisibilityChangeIsRecordedAndCleanedUp(){
  // The other half of the same forensic gap: did the TAB itself go hidden (truly backgrounded -- a real
  // app-switch or screen-off) during the freeze? This must show up in the breadcrumb with a timestamp, and
  // the listener must be torn down once the flow ends so it can never write a stray breadcrumb from some
  // later, unrelated tab-visibility change on the same page.
  const lock={release:async()=>{},addEventListener(){},removeEventListener(){}};
  const navigatorValue={wakeLock:{request:async()=>lock},clipboard:{writeText:async()=>{}}};
  const{M,athletesHead,doc}=bootFixture({navigatorValue,slowRpc:true});
  M.swimmerInviteBN.GENERATE_TIMEOUT_MS=300; // let the handler's own timeout close it out instead of hanging the process

  const generate=await clickGenerate(athletesHead);
  const clickPromise=generate.onclick().catch(()=>{});
  await new Promise(r=>setTimeout(r,20));

  assert.ok(doc._listenerCount('visibilitychange')>0,'test setup error: a visibilitychange listener must be registered while the flow is in flight');
  doc.visibilityState='hidden';
  doc._fire('visibilitychange');

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.lastVisibilityState,'hidden','a visibilitychange to hidden mid-flow must be recorded in the breadcrumb');
  assert.ok(attempt.lastVisibilityChangeAt,'a recorded visibility change must be timestamped');

  // Now let the handler's own (shortened) overall timeout end the flow, and confirm the listener is torn down
  // in its finally -- a further visibility change afterward must not silently rewrite the breadcrumb.
  await clickPromise;
  const beforeStray=doc._listenerCount('visibilitychange');
  assert.equal(beforeStray,0,'the visibilitychange listener must be removed once the flow settles, on the timeout path included');
  const resolvedAttempt=M.swimmerInviteBN.lastAttemptStatus();
  doc.visibilityState='visible';doc._fire('visibilitychange');
  assert.deepEqual(M.swimmerInviteBN.lastAttemptStatus(),resolvedAttempt,'a visibility change AFTER the flow ends must not still be able to write to the breadcrumb -- confirms the listener was really torn down, not just uncounted');

  console.log('QR_WAKE_LOCK_VISIBILITY_CHANGE_PASS');
}

function runFailBefore(){
  // Fail-before: revert to the exact pre-instrumentation handler (no wake-lock request/release, no breadcrumb
  // fields, no visibilitychange wiring at all) and confirm none of it is present -- this is what this test
  // would have caught before today's rounds of work existed. `wakeLock`/`tickTimer`/`onVisibilityChange` are
  // now declared once, earlier, as part of the 19 Sept concurrency-guard fix (a separate, later change --
  // see swimmer-invite-double-generate-20260907.cjs) rather than right before this block, so there is no
  // longer a meaningful "buggyOpen" variant of that declaration to revert here; only the acquire/release
  // logic itself is this fix's own responsibility.
  const fixedAcquire="const wakeLockSupported=!!(navigator.wakeLock&&typeof navigator.wakeLock.request==='function');\n      try{wakeLock=await navigator.wakeLock?.request?.('screen');}catch{}\n      if(gen.cancelled)return;\n      writeAttempt({wakeLockSupported,wakeLockHeld:!!wakeLock,wakeLockReleasedEarly:false});\n      try{wakeLock?.addEventListener?.('release',()=>{if(!gen.cancelled)writeAttempt({wakeLockReleasedEarly:true,wakeLockReleasedAt:new Date().toISOString()});},{once:true});}catch{}\n      onVisibilityChange=()=>{if(!gen.cancelled)writeAttempt({lastVisibilityState:document.visibilityState,lastVisibilityChangeAt:new Date().toISOString()});};\n      try{document.addEventListener('visibilitychange',onVisibilityChange);}catch{}\n      let step='Checking swimmer evidence';";
  assert.ok(realSrc.includes(fixedAcquire),'test setup error: could not locate the wake-lock acquisition + breadcrumb + visibilitychange block in the real source');
  const buggyAcquire="let step='Checking swimmer evidence';";

  const fixedRelease="}finally{clearInterval(tickTimer);try{document.removeEventListener('visibilitychange',onVisibilityChange);}catch{}try{await wakeLock?.release?.()}catch{}wakeLock=null;}}catch(err){";
  assert.ok(realSrc.includes(fixedRelease),'test setup error: could not locate the wake-lock/listener release block in the real source');
  const buggyRelease="}finally{clearInterval(tickTimer);}}catch(err){";

  let buggySrc=realSrc.replace(fixedAcquire,buggyAcquire).replace(fixedRelease,buggyRelease);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes("navigator.wakeLock?.request?.('screen')"),'test setup error: reverted source must not still request a wake lock');
  // Checked against the handler's OWN release call specifically (it awaits the lock's release on every exit
  // path) rather than the bare substring: the separate, later 19 Sept concurrency-guard fix added its own
  // small, synchronous (non-awaited) `wakeLock?.release?.()`/`removeEventListener('visibilitychange',...)`
  // cleanup inside gen.cancel() that is not part of THIS fix and must stay intact after reverting it.
  assert.ok(!buggySrc.includes('await wakeLock?.release?.()'),'test setup error: reverted source must not still release a wake lock');
  assert.ok(!buggySrc.includes("addEventListener('visibilitychange'"),'test setup error: reverted source must not still wire a visibilitychange listener');

  const tmpPath=invitePath.replace(/\.js$/,'.wakelockfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const requested=[];
    const navigatorValue={wakeLock:{request:async(type)=>{requested.push(type);return{release:async()=>{},addEventListener(){},removeEventListener(){}};}},clipboard:{writeText:async()=>{}}};
    const modalHost=makeNode('div'),athletesHead=makeNode('div');
    global.document=makeDocument(modalHost,athletesHead);
    global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
    Object.defineProperty(global,'navigator',{value:navigatorValue,configurable:true});
    global.localStorage=makeLocalStorage();
    global.QRCode=function FakeQRCode(){};
    global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
    global.MSOS4={
      ui:{},
      state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
      access:{role:()=>'owner'},
      store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
      currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
      swimmerTrainingBG:{
        projectionFor:()=>({date:'2026-09-19',squad:'Development',course:'SCM',title:'Threshold set',metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
          blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
        viewFor:()=>null,candidateSessionsFor:()=>[],
      },
      performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
      swimmerPerformanceBM:{prepareAthlete:(a,{onJob}={})=>{onJob?.('training_test_types',5,5);return Promise.resolve({completion:{ok:true}});},readinessFor:()=>({ok:true,issues:[]})},
    };
    global.fetch=okFetch();
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);

    return (async()=>{
      await null;
      const genBtn=athletesHead._appended[0];
      genBtn.onclick();
      const wrap=modalHost._appended[0];
      const generate=wrap.querySelector('[data-bn-generate]');
      await Promise.race([
        generate.onclick(),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: reverted handler did not settle')),3000)),
      ]);
      assert.deepEqual(requested,[],'pre-fix source must never call navigator.wakeLock.request -- confirms this test would have caught its absence');
      const attempt=global.MSOS4.swimmerInviteBN.lastAttemptStatus();
      assert.equal(attempt.wakeLockSupported,undefined,'pre-fix source must never write wakeLockSupported to the breadcrumb');
      console.log('QR_WAKE_LOCK_FAILBEFORE_PASS');
    })();
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

(async()=>{
  await runSuccessAcquiresAndReleases();
  await runErrorPathStillReleases();
  await runGracefulDegradationWithoutWakeLockApi();
  await runBrowserForcedReleaseIsRecorded();
  await runVisibilityChangeIsRecordedAndCleanedUp();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
