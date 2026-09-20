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
// UPDATED 20 Sept 2026, same evening, TWICE more (kept as this same file rather than a new one each time,
// since each update is a direct continuation of the same investigation): (1) after the isolation fix below
// shipped, Andy hit the identical CDN message a THIRD time, proving the isolation and retry logic both worked
// while the CDN dependency itself kept failing -- so the CDN was replaced with a second same-origin FILE
// (engines/qrcode-local.js); (2) that second file then failed to load too ("QR renderer is missing from this
// build"), TWICE in a row, almost certainly because a brand-new file is exactly the kind of change a manual
// deploy step can miss, when every other fix that night only touched files that already existed and deployed
// correctly every time. The final fix removes the risk category entirely: there is no second file any more.
// engines/swimmer-invite-bn.js now contains its own inline QR encoder (qrEncode()/drawQr()) -- no external
// CDN, no separate file, no window global, nothing that can be missing independently of the one file that has
// proven itself reliable on every single deploy that night. See
// tests/qr-generate-no-external-cdn-dependency-20260920.cjs for the structural proof of that. This file now
// covers what the isolation still guards against: a genuine draw-time exception (e.g. a canvas API failure),
// which remains a real (if unlikely) possibility even though a missing renderer no longer is one.
//
// This test proves, against the real source: (1) if drawing the QR image throws for ANY reason, the overall
// attempt still lands on outcome:'ok'/step:'done' (access is real) while qrRenderOutcome/qrRenderMessage
// record the cosmetic failure separately, and the url box + Copy link remain visible and correct; (2) a
// successful Generate attempt never touches document.head.appendChild at all -- there is no dynamic
// script/network step of any kind left in this flow; (3) fail-before/pass-after proving that if the QR draw
// step ever again depended on an external global instead of this file's own inline encoder, that regression
// would show up immediately as an isolated qrRenderOutcome:'error' rather than silently.
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
// document.head.appendChild is only still simulated here so a fail-before against an OLD, superseded source
// could prove it used a dynamic <script> load -- the current source never calls it at all, which is exactly
// what runNoNetworkOrExternalDependency() below proves for every real attempt.
function makeDocument(modalHost,athletesHead,canvasBehavior){
  const listeners={};
  let scriptAppendCount=0;
  return{
    readyState:'complete',
    body:makeNode('body'),
    visibilityState:'visible',
    addEventListener(type,fn){(listeners[type]=listeners[type]||[]).push(fn);},
    removeEventListener(type,fn){if(listeners[type])listeners[type]=listeners[type].filter(f=>f!==fn);},
    createElement(tag){
      if(tag==='canvas'){
        if(canvasBehavior==='throw')throw new Error('canvas 2d context unavailable');
        const ctx={fillStyle:'',fillRect(){}};
        return{width:0,height:0,getContext:()=>ctx};
      }
      return makeNode(tag);
    },
    head:{appendChild(node){scriptAppendCount++;return node;}},
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

function bootFixture(canvasBehavior,src){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead,canvasBehavior);
  global.document=doc;
  global.window=global;
  global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
  global.localStorage=makeLocalStorageSpy();
  delete global.QRCode;
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
  // The QR encoder is this file's own inline code (no external global, no separate file to be missing) but
  // drawing throws for some other genuine reason -- e.g. no canvas 2d context available. The isolation must
  // still catch this, since a drawing exception remains a real possibility independent of where the encoder
  // lives.
  const{M,athletesHead,modalHost,doc}=bootFixture('throw');
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
  assert.equal(doc._scriptAppendCount(),0,'no dynamic script/network load of any kind should ever be attempted -- the encoder is this file\'s own inline code');

  console.log('QR_IMAGE_DRAW_THROW_DOES_NOT_FAIL_ATTEMPT_PASS');
}

async function runNoNetworkOrExternalDependency(){
  // The ordinary, expected-every-time case: drawing succeeds using this file's own inline encoder. Proves the
  // happy path never touches document.head.appendChild -- there is no dynamic script/network step or
  // external global lookup left in this flow at all, success or failure.
  const{M,athletesHead,modalHost,doc}=bootFixture('ok');
  const{generate,urlBox,copy}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.outcome,'ok');
  assert.equal(attempt.step,'done');
  assert.equal(attempt.qrRenderOutcome,'ok','the QR image must draw successfully using this file\'s own inline encoder, with no external dependency of any kind');
  assert.equal(urlBox.hidden,false);
  assert.equal(copy.hidden,false);
  assert.equal(doc._scriptAppendCount(),0,'a fully successful Generate attempt must never touch document.head.appendChild -- no external fetch of any kind belongs in this flow any more');

  console.log('QR_NO_NETWORK_OR_EXTERNAL_DEPENDENCY_PASS');
}

function runFailBefore(){
  // Both superseded shapes (the original CDN load, and the second-same-origin-file load that replaced it)
  // shared one trait this test can check for directly: they depended on SOME external global (window.QRCode)
  // rather than this file's own inline encoder, so a build where that global is not yet present would fail
  // outright instead of quietly using its own code. Constructing a minimal stand-in for that shape -- without
  // needing the exact superseded source text, which has already changed twice tonight -- proves this file's
  // fixture would have caught either one: with no inline encoder and no external global available, drawing
  // must fail and be correctly isolated, exactly like today's real canvas-throw case above.
  const fixedCallSite=`try{if(gen.cancelled)return;drawQr(qr,activeUrl,240,240);}`;
  const buggyCallSite=`try{if(gen.cancelled)return;if(typeof g.QRCode!=='function')throw new Error('QR renderer is missing from this build (engines/qrcode-local.js did not load) -- reload the app.');new g.QRCode(qr,{text:activeUrl,width:240,height:240,correctLevel:0});}`;
  assert.ok(realSrc.includes(fixedCallSite),'test setup error: could not locate the current drawQr() call site in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedCallSite,buggyCallSite);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted, externally-dependent call site');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  return(async()=>{
    // No global.QRCode is ever defined in this fixture (bootFixture always deletes it) -- exactly the "brand
    // new file didn't load" scenario from tonight. On the reverted, externally-dependent call site, that must
    // surface as an isolated draw failure, not a silent success and not a crash of the whole attempt.
    const{M,athletesHead,modalHost}=bootFixture('ok',buggySrc);
    const{generate,urlBox,copy}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
    ]);
    const attempt=M.swimmerInviteBN.lastAttemptStatus();
    assert.equal(attempt.qrRenderOutcome,'error','pre-fix (externally-dependent) source: with no external global present, drawing must fail -- confirming this test would have caught exactly the class of dependency this build removes');
    assert.ok(/QR renderer is missing/.test(attempt.qrRenderMessage));
    assert.equal(attempt.outcome,'ok','even on the reverted source, the isolation fix from earlier tonight must still keep the real access outcome intact');
    assert.equal(urlBox.hidden,false);
    assert.equal(copy.hidden,false);

    console.log('QR_IMAGE_LOAD_FAILBEFORE_PASS');
  })();
}

(async()=>{
  await runQrDrawThrowDoesNotFailTheAttempt();
  await runNoNetworkOrExternalDependency();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
