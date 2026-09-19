'use strict';
// Real coaching failure this fixes (Andy, 19 Sept 2026): Matthew Robertson's "Give swimmer access" QR modal
// froze again on the exact 16 Sept symptom text -- "Checking swimmer evidence... (5/5 * training_test_types)
// (0s)", ticker apparently stuck at zero, never advancing, no error ever surfaced. Checked directly against
// live Supabase edge logs for that exact minute (project cwoqjxiniuwmslltsfgi): every evidence job, INCLUDING
// training_test_types, had already returned 200 in under 2.5 seconds, and no msos_bootstrap_owner /
// msos_publish_swimmer_payload / msos_create_swimmer_invite RPC ever reached the network afterward -- so the
// freeze was real but entirely client-side, with nothing running to throw an error or log anything. A
// synchronous compute-cost check of the standards-matching work in that stretch (targetsFor/rowsByProgramme
// against ~4400 pathway_standards rows, x2-3 over for Matthew's ~35 events) benchmarked at ~90ms for 300k+
// iterations -- even derated 100x for a slow phone that's seconds, not the 2+ minutes reported. Asked Andy
// directly rather than guessing: "did your screen lock or did you switch away from the app during that
// wait?" -- his answer: "screen was locked, yeah". That confirms the root cause: Android suspends a
// backgrounded/locked page's JavaScript entirely, which explains a frozen ticker (setInterval callbacks never
// fire), zero further network traffic, and zero thrown errors, all at once, exactly as observed.
//
// The fix: acquire a screen wake lock (navigator.wakeLock.request('screen')) the moment Generate is tapped,
// and release it in the handler's existing finally block so it releases on every exit path -- success, a
// thrown error, or the overall GENERATE_TIMEOUT_MS firing. This test proves: (1) the lock is requested for
// 'screen' as soon as Generate is tapped, (2) it is released once the flow settles successfully, (3) it is
// released even when the flow fails partway through (a thrown error, not just the happy path), and (4) a
// browser with no navigator.wakeLock at all (older browsers, or the API denied) must not throw or block QR
// generation -- the flow must still complete exactly as before, just without the protection.
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

function bootFixture({navigatorValue}={}){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  global.document={
    readyState:'complete',
    body:makeNode('body'),
    addEventListener(){},
    createElement:tag=>makeNode(tag),
    querySelector(sel){
      if(sel==='#modalHost')return modalHost;
      if(sel==='#athletesView .cn-owner-actions')return athletesHead;
      return null;
    },
  };
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
      prepareAthlete:(a,{onJob}={})=>{onJob?.('training_test_types',5,5);return Promise.resolve({completion:{ok:true}});},
      readinessFor:()=>({ok:true,issues:[]}),
    },
  };
  global.fetch=okFetch();
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return{M:global.MSOS4,modalHost,athletesHead};
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
  const lock={release:async()=>{released.push(true);}};
  const navigatorValue={wakeLock:{request:async(type)=>{requested.push(type);return lock;}},clipboard:{writeText:async()=>{}}};
  const{athletesHead}=bootFixture({navigatorValue});

  const generate=await clickGenerate(athletesHead);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle')),3000)),
  ]);

  assert.deepEqual(requested,['screen'],`Generate must request a 'screen' wake lock exactly once, got ${JSON.stringify(requested)}`);
  assert.equal(released.length,1,'the wake lock must be released exactly once the flow completes successfully');
  const status=global.document.querySelector('#modalHost')._appended[0].querySelector('[data-bn-status]');
  assert.match(status.textContent,/^Ready/,`fixture sanity: the flow must actually reach success for this to prove anything, got status: ${JSON.stringify(status.textContent)}`);

  console.log('QR_WAKE_LOCK_SUCCESS_PASS');
}

async function runErrorPathStillReleases(){
  // Same fixture, but readinessFor now declines -- an ordinary, early thrown error, not a timeout. The lock
  // must still be released: a coach whose evidence isn't ready yet must not be stuck with the screen held
  // awake by a dead lock after the attempt fails.
  const requested=[],released=[];
  const lock={release:async()=>{released.push(true);}};
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
  // throw or stall on this; it must complete exactly as it always did, just without the protection.
  const{athletesHead}=bootFixture({navigatorValue:{clipboard:{writeText:async()=>{}}}});

  const generate=await clickGenerate(athletesHead);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle without navigator.wakeLock')),3000)),
  ]);

  const status=global.document.querySelector('#modalHost')._appended[0].querySelector('[data-bn-status]');
  assert.match(status.textContent,/^Ready/,`the flow must complete successfully even with no navigator.wakeLock present, got status: ${JSON.stringify(status.textContent)}`);

  console.log('QR_WAKE_LOCK_GRACEFUL_DEGRADATION_PASS');
}

function runFailBefore(){
  // Fail-before: revert to the exact pre-fix handler opening (no wake-lock request/release at all) and
  // confirm navigator.wakeLock.request is never called, even on a run that otherwise succeeds -- this is
  // what this test would have caught before today's fix existed.
  const fixedOpen="genBtn.onclick=async()=>{if(genBtn.disabled)return;genBtn.disabled=true;try{let wakeLock=null;writeAttempt(";
  assert.ok(realSrc.includes(fixedOpen),'test setup error: could not locate the fixed genBtn.onclick opening in the real source -- its wording changed in a way this test does not expect');
  const buggyOpen="genBtn.onclick=async()=>{if(genBtn.disabled)return;genBtn.disabled=true;try{writeAttempt(";

  const fixedAcquire="      try{wakeLock=await navigator.wakeLock?.request?.('screen');}catch{}\n      let step='Checking swimmer evidence',tickTimer=null;";
  assert.ok(realSrc.includes(fixedAcquire),'test setup error: could not locate the wake-lock acquisition block in the real source');
  const buggyAcquire="      let step='Checking swimmer evidence',tickTimer=null;";

  const fixedRelease="}finally{clearInterval(tickTimer);try{await wakeLock?.release?.()}catch{}wakeLock=null;}}catch(err){";
  assert.ok(realSrc.includes(fixedRelease),'test setup error: could not locate the wake-lock release block in the real source');
  const buggyRelease="}finally{clearInterval(tickTimer);}}catch(err){";

  let buggySrc=realSrc.replace(fixedOpen,buggyOpen).replace(fixedAcquire,buggyAcquire).replace(fixedRelease,buggyRelease);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes("navigator.wakeLock?.request?.('screen')"),'test setup error: reverted source must not still request a wake lock');
  assert.ok(!buggySrc.includes('wakeLock?.release?.()'),'test setup error: reverted source must not still release a wake lock');

  const tmpPath=invitePath.replace(/\.js$/,'.wakelockfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const requested=[];
    const navigatorValue={wakeLock:{request:async(type)=>{requested.push(type);return{release:async()=>{}};}},clipboard:{writeText:async()=>{}}};
    const modalHost=makeNode('div'),athletesHead=makeNode('div');
    global.document={
      readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
      querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
    };
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
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
