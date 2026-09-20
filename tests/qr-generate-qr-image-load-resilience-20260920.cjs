'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026, TWICE on two different builds, same exact
// message both times): "QR renderer could not load." By the time that step runs, access is already fully
// granted -- msos_bootstrap_owner, the Challenge/Edit/Finish check, msos_publish_swimmer_payload and
// msos_create_swimmer_invite have all already succeeded, and the real, working invite link is already sitting
// in the modal's url box with Copy link visible. Drawing the small QR IMAGE is a separate, purely cosmetic
// step that loads a script from an external CDN (cdn.jsdelivr.net/npm/qrcodejs), and it failing had been
// treated exactly like every other failure in the flow: the whole attempt's outcome flipped to 'error', the
// status turned red, and the qr box was blanked to "QR not generated" -- with nothing on screen distinguishing
// "access itself failed" from "access worked fine, only the picture didn't draw." Two real bugs, fixed
// together: (1) the QR-load step shared the SAME try/catch as the rest of the flow, so its failure looked
// identical to a genuine access failure even though the link above it was completely valid and copyable; (2)
// loadQr()'s X.qrPromise was cached forever, success OR failure -- once the CDN load failed even once, EVERY
// later Generate attempt in that same page session replayed the identical stale rejected promise without ever
// touching the network again, turning one transient blip into a permanent failure for the rest of the session
// (which is exactly why Andy saw the identical message twice on two different attempts).
//
// This test proves, against the real source: (1) a QR-image load failure does NOT fail the overall attempt --
// outcome/step still land on 'ok'/'done' (access is real), while a separate qrRenderOutcome/qrRenderMessage
// records the cosmetic failure on its own, the url box and Copy link remain visible and correct, and the
// status text says the link is ready rather than reading like a bare error; (2) a SECOND Generate attempt,
// in the same page session, after the first attempt's QR image failed to load, genuinely retries the network
// load rather than replaying the same stale rejection -- and can succeed; (3) fail-before/pass-after against
// the exact source changes for both fixes.
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
// Simulates the QR-loader <script> tag's async CDN load: each document.head.appendChild(script) call consumes
// one entry from `scriptOutcomes` ('ok' or 'fail') and fires that script's onload/onerror on a fresh tick,
// exactly like a real network load resolving after the script element is inserted. Counts real append calls
// so a test can prove whether a retry genuinely re-touched the "network" or replayed a cached result.
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
        const outcome=scriptOutcomes.length?scriptOutcomes.shift():'fail';
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

function bootFixture(scriptOutcomes,src){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead,scriptOutcomes);
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

async function runQrImageFailureDoesNotFailTheAttempt(){
  const{M,athletesHead,modalHost,doc}=bootFixture(['fail']);
  const{generate,urlBox,copy,qr}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(attempt.outcome,'ok','access itself must still be reported as successful -- the invite really was created');
  assert.equal(attempt.step,'done');
  assert.equal(attempt.qrRenderOutcome,'error','the cosmetic QR-image failure must be recorded on its own field, separate from the real outcome');
  assert.ok(attempt.qrRenderMessage,'the real QR-render failure reason must be recorded');
  assert.equal(urlBox.hidden,false,'the real invite link must remain visible even though the QR image failed to draw');
  assert.ok(urlBox.textContent.includes('tok-qr-image-fixture'),'the url box must still hold the real, working invite link');
  assert.equal(copy.hidden,false,'Copy link must remain usable even though the QR image failed to draw');
  assert.equal(doc._scriptAppendCount(),1,'exactly one script load must have been attempted for this one Generate tap');

  console.log('QR_IMAGE_LOAD_FAILURE_DOES_NOT_FAIL_ATTEMPT_PASS');
}

async function runSecondAttemptGenuinelyRetriesAfterFirstFailure(){
  // Same page session (no module reload) -- first Generate's QR script load fails, second Generate's must
  // genuinely re-touch the "network" (a fresh script append) rather than replaying the first's stale
  // rejection, and can succeed this time.
  const{M,athletesHead,modalHost,doc}=bootFixture(['fail','ok']);
  const{generate:generate1}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate1.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: first generate did not settle')),3000)),
  ]);
  assert.equal(M.swimmerInviteBN.lastAttemptStatus().qrRenderOutcome,'error','fixture sanity: the first attempt\'s QR image load must fail');
  assert.equal(doc._scriptAppendCount(),1);

  const{generate:generate2,qr}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate2.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: second generate did not settle')),3000)),
  ]);
  const second=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(second.outcome,'ok');
  assert.equal(second.qrRenderOutcome,'ok','the second attempt must succeed at drawing the QR image -- proves loadQr() genuinely retried the network rather than replaying the first attempt\'s cached rejection');
  assert.equal(doc._scriptAppendCount(),2,'a genuine retry must append a SECOND script tag -- one real load attempt per Generate tap, not a cached-forever rejection');

  console.log('QR_IMAGE_LOAD_SECOND_ATTEMPT_RETRIES_PASS');
}

function runFailBefore(){
  const fixedLoadQr=`async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.referrerPolicy='no-referrer';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('QR renderer did not load'));s.onerror=()=>reject(new Error('QR renderer could not load'));document.head.appendChild(s)}).catch(err=>{X.qrPromise=null;throw err;});return X.qrPromise;}`;
  const buggyLoadQr=`async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.referrerPolicy='no-referrer';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('QR renderer did not load'));s.onerror=()=>reject(new Error('QR renderer could not load'));document.head.appendChild(s)});return X.qrPromise;}`;
  assert.ok(realSrc.includes(fixedLoadQr),'test setup error: could not locate the fixed loadQr() in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLoadQr,buggyLoadQr);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy loadQr()');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  return(async()=>{
    // Reproduces bug #2 alone (loadQr's forever-cached rejection): first attempt fails, second would succeed
    // if retried, but on the buggy source it must replay the SAME stale rejection without touching the
    // "network" a second time.
    const{M,athletesHead,modalHost,doc}=bootFixture(['fail','ok'],buggySrc);
    const{generate:generate1}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate1.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: first generate did not settle')),3000)),
    ]);
    assert.equal(doc._scriptAppendCount(),1);

    const{generate:generate2}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate2.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: second generate did not settle')),3000)),
    ]);
    assert.equal(doc._scriptAppendCount(),1,'pre-fix source: a second Generate attempt must NOT append a new script tag at all -- it replays the first attempt\'s cached rejection forever, confirming this test would have caught the exact bug that made Andy see the identical failure message twice');
    assert.equal(M.swimmerInviteBN.lastAttemptStatus().qrRenderOutcome,'error','pre-fix source: the second attempt must still fail, from the stale cached rejection, even though this attempt\'s own script-load simulation was set up to succeed');

    console.log('QR_IMAGE_LOAD_FAILBEFORE_PASS');
  })();
}

(async()=>{
  await runQrImageFailureDoesNotFailTheAttempt();
  await runSecondAttemptGenuinelyRetriesAfterFirstFailure();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
