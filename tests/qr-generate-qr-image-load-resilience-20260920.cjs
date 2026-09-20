'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026, TWICE on two different builds, same exact
// message both times): "QR renderer could not load." By the time that step runs, access is already fully
// granted -- msos_bootstrap_owner, the Challenge/Edit/Finish check, msos_publish_swimmer_payload and
// msos_create_swimmer_invite have all already succeeded, and the real, working invite link is already sitting
// in the modal's url box with Copy link visible. Drawing the small QR IMAGE is a separate step, and its
// failure had been treated exactly like every other failure in the flow: the whole attempt's outcome flipped
// to 'error', the status turned red, and the qr box was blanked to "QR not generated" -- with nothing on
// screen distinguishing "access itself failed" from "access worked fine, only the picture didn't draw."
//
// UPDATED 20 Sept 2026, same evening (superseded build, kept as this same file rather than a new one since
// it is the direct continuation of the same investigation): after this isolation fix shipped, Andy hit the
// identical "QR renderer could not load" message a THIRD time -- proving the isolation and the loadQr()
// retry fix below were both working exactly as designed (outcome/step still 'ok'/'done', a genuinely fresh
// attempt, not a replayed cached rejection) while the underlying CDN dependency itself kept failing. Rather
// than attempt a fourth CDN-retry guess, the CDN dependency was removed entirely: engines/qrcode-local.js is
// now vendored same-origin and precached like every other script, so loadQr() no longer loads, fetches, or
// caches anything from a network at all -- it just returns the already-present global. That makes most of
// this file's original network-retry scenario impossible to construct any more (there is no network step left
// to fail and retry), so those sub-tests are replaced below with tests of what the isolation now actually
// guards against: SOME OTHER reason the QR image fails to draw (a draw-time exception, or the renderer global
// somehow missing), which is still a real possibility worth isolating even though a network CDN blip no
// longer is one. See tests/qr-generate-no-external-cdn-dependency-20260920.cjs for the CDN-removal fix itself.
//
// This test proves, against the real source: (1) if drawing the QR image throws for ANY reason, the overall
// attempt still lands on outcome:'ok'/step:'done' (access is real) while qrRenderOutcome/qrRenderMessage
// record the cosmetic failure separately, and the url box + Copy link remain visible and correct; (2) if the
// renderer global is somehow missing entirely (e.g. a build where qrcode-local.js failed to load), the same
// isolation still applies -- Generate does not fail outright; (3) a successful Generate attempt never touches
// document.head.appendChild at all any more -- there is no dynamic script/network step left in this flow;
// (4) fail-before/pass-after against the exact loadQr() source change.
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
// document.head.appendChild is only still simulated here so runFailBefore() can prove the OLD, reverted
// source genuinely used it (a dynamic <script> load against an external CDN) -- the fixed source never calls
// it at all, which is exactly what runNoNetworkOrExternalDependency() below proves.
function makeDocument(modalHost,athletesHead,scriptOutcomes){
  const listeners={};
  let scriptAppendCount=0;
  return{
    readyState:'complete',
    body:makeNode('body'),
    visibilityState:'visible',
    addEventListener(type,fn){(listeners[type]=listeners[type]||[]).push(fn);},
    removeEventListener(type,fn){if(listeners[type])listeners[type]=listeners[type].filter(f=>f!==fn);},
    createElement:tag=>makeNode(tag),
    head:{
      appendChild(node){
        scriptAppendCount++;
        const outcome=(scriptOutcomes&&scriptOutcomes.length)?scriptOutcomes.shift():'fail';
        setTimeout(()=>{
          if(outcome==='ok'){global.QRCode=function FakeQRCode(){};node.onload&&node.onload();}
          else node.onerror&&node.onerror();
        },0);
        return node;
      },
    },
    querySelector(sel){
      if(sel==='#modalHost')return modalHost;
      if(sel==='#athletesView .cn-owner-actions')return athletesHead;
      return null;
    },
    _scriptAppendCount:()=>scriptAppendCount,
  };
}
function makeLocalStorageSpy(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}

const athlete={id:'ath-qr-image-fixture',full_name:'Matthew Robertson',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

function okFetch(){
  return async(url)=>{
    const text=String(url).includes('msos_create_swimmer_invite')
      ?JSON.stringify({invite_token:'tok-qr-image-fixture',expires_at:new Date(Date.now()+900000).toISOString()})
      :JSON.stringify({});
    return{ok:true,text:async()=>text};
  };
}

function bootFixture(qrGlobal,src){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead,[]);
  global.document=doc;
  global.window=global;
  global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
  global.localStorage=makeLocalStorageSpy();
  if(qrGlobal===undefined)delete global.QRCode;else global.QRCode=qrGlobal;
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-20',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{
      projectionFor:()=>({date:'2026-09-20',squad:'Development',course:'SCM',title:'Threshold set',
        metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
        blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
      viewFor:()=>null,candidateSessionsFor:()=>[],
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
    swimmerPerformanceBM:{
      completeEvidence:()=>Promise.resolve({ok:true,rows:0,errors:[]}),
      readinessFor:()=>({ok:true,issues:[],model:{events:[{id:'ev1'}]}}),
    },
  };
  global.fetch=okFetch();
  if(src){
    const tmpPath=invitePath.replace(/\.js$/,'.qrimagefailbefore.tmp.js');
    fs.writeFileSync(tmpPath,src);
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    fs.unlinkSync(tmpPath);
  }else{
    delete require.cache[require.resolve(invitePath)];
    require(invitePath);
  }
  global.MSOS4.swimmerInviteBN.STATUS_TICK_MS=5;
  return{M:global.MSOS4,modalHost,athletesHead,doc};
}

async function openModal(athletesHead,modalHost){
  await null;
  const outerBtn=athletesHead._appended[0];
  assert.ok(outerBtn,'installButton() must have appended the "Give swimmer access" button');
  outerBtn.onclick();
  const wrap=modalHost._appended[modalHost._appended.length-1];
  return{wrap,generate:wrap.querySelector('[data-bn-generate]'),urlBox:wrap.querySelector('[data-bn-url]'),copy:wrap.querySelector('[data-bn-copy]'),qr:wrap.querySelector('[data-bn-qr]')};
}

async function runQrDrawThrowDoesNotFailTheAttempt(){
  // The renderer global IS present (as it always will be now -- it's precached same-origin like every other
  // script) but drawing throws for some other reason. The isolation added for the CDN-failure era must still
  // catch this too, since a drawing exception is a real possibility independent of where the renderer came
  // from.
  function ThrowingQRCode(){throw new Error('canvas 2d context unavailable');}
  const{M,athletesHead,modalHost,doc}=bootFixture(ThrowingQRCode);
  const{generate,urlBox,copy}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.outcome,'ok','access itself must still be reported as successful -- the invite really was created');
  assert.equal(attempt.step,'done');
  assert.equal(attempt.qrRenderOutcome,'error','the cosmetic QR-image failure must be recorded on its own field, separate from the real outcome');
  assert.ok(attempt.qrRenderMessage.includes('canvas 2d context unavailable'),'the real draw-time failure reason must be recorded');
  assert.equal(urlBox.hidden,false,'the real invite link must remain visible even though the QR image failed to draw');
  assert.ok(urlBox.textContent.includes('tok-qr-image-fixture'),'the url box must still hold the real, working invite link');
  assert.equal(copy.hidden,false,'Copy link must remain usable even though the QR image failed to draw');
  assert.equal(doc._scriptAppendCount(),0,'no dynamic script/network load of any kind should ever be attempted any more');

  console.log('QR_IMAGE_DRAW_THROW_DOES_NOT_FAIL_ATTEMPT_PASS');
}

async function runRendererMissingIsAlsoIsolated(){
  // Simulates a build where engines/qrcode-local.js somehow failed to load (window.QRCode never became a
  // function) -- loadQr() must throw a clear, local, synchronous error, and that must be isolated exactly
  // the same way as any other draw-time failure, never a bare crash of the whole attempt.
  const{M,athletesHead,modalHost,doc}=bootFixture(undefined);
  const{generate,urlBox,copy}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.outcome,'ok');
  assert.equal(attempt.step,'done');
  assert.equal(attempt.qrRenderOutcome,'error');
  assert.ok(/qrcode-local\.js did not load/.test(attempt.qrRenderMessage),'a missing renderer global must produce a clear, specific message naming the file that failed to load');
  assert.equal(urlBox.hidden,false);
  assert.equal(copy.hidden,false);
  assert.equal(doc._scriptAppendCount(),0,'a missing renderer must never trigger a fallback network fetch of any kind');

  console.log('QR_RENDERER_MISSING_IS_ALSO_ISOLATED_PASS');
}

async function runNoNetworkOrExternalDependency(){
  // The ordinary, expected-every-time case: the renderer global is present (as it always is, same-origin
  // precached) and drawing succeeds. Proves the happy path also never touches document.head.appendChild --
  // there is no dynamic script/network step left in this flow at all, success or failure.
  function WorkingQRCode(el,opts){this.el=el;this.opts=opts;}
  const{M,athletesHead,modalHost,doc}=bootFixture(WorkingQRCode);
  const{generate,urlBox,copy}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.outcome,'ok');
  assert.equal(attempt.step,'done');
  assert.equal(attempt.qrRenderOutcome,'ok','the QR image must draw successfully when the renderer is present and working');
  assert.equal(urlBox.hidden,false);
  assert.equal(copy.hidden,false);
  assert.equal(doc._scriptAppendCount(),0,'a fully successful Generate attempt must never touch document.head.appendChild -- no external fetch of any kind belongs in this flow any more');

  console.log('QR_NO_NETWORK_OR_EXTERNAL_DEPENDENCY_PASS');
}

function runFailBefore(){
  const fixedLoadQr=`async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;throw new Error('QR renderer is missing from this build (engines/qrcode-local.js did not load) -- reload the app.');}`;
  const buggyLoadQr=`async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.referrerPolicy='no-referrer';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('QR renderer did not load'));s.onerror=()=>reject(new Error('QR renderer could not load'));document.head.appendChild(s)}).catch(err=>{X.qrPromise=null;throw err;});return X.qrPromise;}`;
  assert.ok(realSrc.includes(fixedLoadQr),'test setup error: could not locate the fixed loadQr() in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLoadQr,buggyLoadQr);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy loadQr()');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  return(async()=>{
    // On the pre-fix (CDN-based) source, even with the renderer already present as a global, a successful
    // Generate attempt still goes through loadQr()'s `if(typeof g.QRCode==='function')return g.QRCode` fast
    // path -- so to actually prove this test would have caught the CDN dependency, force the slow path by
    // NOT pre-seeding the global, so the old source must fall through to its CDN script load.
    const{M,athletesHead,modalHost,doc}=bootFixture(undefined,buggySrc);
    const{generate}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
    ]);
    assert.equal(doc._scriptAppendCount(),1,'pre-fix source: the QR-renderer-missing case must fall through to a live external CDN script load -- confirming this test would have caught the exact dependency this build removes');

    console.log('QR_IMAGE_LOAD_FAILBEFORE_PASS');
  })();
}

(async()=>{
  await runQrDrawThrowDoesNotFailTheAttempt();
  await runRendererMissingIsAlsoIsolated();
  await runNoNetworkOrExternalDependency();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
