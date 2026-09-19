'use strict';
// Real coaching failure this guards against (Andy, 16 Sept 2026): "we'll just get started here on the zero
// seconds. It gets to there, and nothing happens. Two minutes later, it's still just sitting there" -- the
// "Give swimmer access" QR modal froze on "Checking swimmer evidence... (5/5 * training_test_types)" with the
// on-screen ticker apparently stuck, and the modal itself became unresponsive during the freeze (Close did
// nothing, matching his separate "I hit coach hub... freezes... stays there till I back out" report of the
// same shape elsewhere in the app). Every existing timeout in this flow (12s per-job evidence timeout, 5s
// local-cache-save timeout, 120s whole-flow ceiling) only reports something once the flow actually resolves
// -- but Andy has to force-close the app to escape a freeze that never resolves, so none of those bounded
// diagnostics ever get read. This test proves the new plain-localStorage breadcrumb (written on every status
// tick, independent of the flow ever completing) is visible mid-freeze -- i.e. it would survive exactly the
// "back out of the app" escape Andy actually uses -- and is correctly marked resolved once the flow does
// settle, one way or the other.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const realSrc=fs.readFileSync(invitePath,'utf8');

// --- minimal DOM stub (same shape as tests/swimmer-generate-qr-status-tick-20260910.cjs) -------------------
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

const athlete={id:'ath-qr-breadcrumb-fixture',full_name:'Breadcrumb Fixture Swimmer',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

function bootFixture(){
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
  if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
  global.localStorage=makeLocalStorage();

  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-16',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{
      projectionFor:()=>({date:'2026-09-16',squad:'Development',course:'SCM',title:'Threshold set',
        metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
        blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
      viewFor:()=>null,
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    // The bug condition: evidence-checking itself never resolves -- exactly Andy's report of the flow
    // stalling on the "Checking swimmer evidence..." step specifically, with onJob reporting the real
    // "5/5 * training_test_types" shape before the hang.
    swimmerPerformanceBM:{
      prepareAthlete:(a,{onJob}={})=>{onJob?.('training_test_types',5,5);return new Promise(()=>{});},
      readinessFor:()=>({ok:true,issues:[]}),
    },
  };
  global.fetch=()=>new Promise(()=>{});
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return{M:global.MSOS4,modalHost,athletesHead};
}

async function run(){
  const{M,athletesHead}=bootFixture();
  M.swimmerInviteBN.GENERATE_TIMEOUT_MS=1500; // settle soon so the test doesn't run long
  M.swimmerInviteBN.STATUS_TICK_MS=200;

  assert.equal(M.swimmerInviteBN.lastAttemptStatus(),null,'no attempt should be recorded before Generate is ever tapped');

  await null; // let requestAnimationFrame(install) settle
  const genBtn=athletesHead._appended[0];
  assert.ok(genBtn,'installButton() must have appended the "Give swimmer access" button');
  genBtn.onclick();
  const modalHostEl=global.document.querySelector('#modalHost');
  const wrap=modalHostEl._appended[0];
  const generate=wrap.querySelector('[data-bn-generate]');

  const clickPromise=generate.onclick();

  // Give the stuck step a couple of ticks, then read the breadcrumb -- this must be visible WITHOUT the
  // flow ever resolving, since a real freeze on Andy's phone never resolves until he force-closes the app.
  await new Promise(r=>setTimeout(r,650));
  const midFlight=M.swimmerInviteBN.lastAttemptStatus();
  assert.ok(midFlight,'a breadcrumb must exist while the step is genuinely stuck, mid-flight, without waiting for the flow to settle');
  assert.equal(midFlight.athleteName,athlete.full_name,'breadcrumb must name the athlete the coach was generating access for');
  assert.equal(midFlight.resolvedAt,null,'a still-stuck attempt must not be marked resolved');
  assert.match(midFlight.step,/Checking swimmer evidence.*5\/5.*training_test_types/,`breadcrumb must record the real stuck step, got: ${JSON.stringify(midFlight.step)}`);
  assert.ok(Number(midFlight.tickSeconds)>=0,'breadcrumb must record an elapsed-seconds figure for the stuck step');

  // Now let the flow actually settle (the overall timeout fires) and confirm the breadcrumb is updated to
  // reflect a resolved, failed attempt -- proving this ISN'T a case where the breadcrumb, once written, is
  // never updated again.
  await Promise.race([
    clickPromise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle')),3000)),
  ]);
  const resolved=M.swimmerInviteBN.lastAttemptStatus();
  assert.ok(resolved.resolvedAt,'breadcrumb must be marked resolved once the flow settles, one way or another');
  assert.equal(resolved.outcome,'error','the overall-timeout path must record outcome:error');
  assert.match(resolved.message,/timed out after/i,`resolved breadcrumb message should carry the real error, got: ${JSON.stringify(resolved.message)}`);

  console.log('QR_ATTEMPT_BREADCRUMB_PASS');
}

async function runFailBefore(){
  // Fail-before: revert to the exact pre-fix source (no writeAttempt/lastAttemptStatus at all) and confirm
  // no breadcrumb is ever recorded, even while the step is genuinely stuck -- this is what this test would
  // have caught before the fix existed.
  const marker='const QR_ATTEMPT_KEY=';
  assert.ok(realSrc.includes(marker),'test setup error: could not locate the breadcrumb constant in the real source -- its wording changed in a way this test does not expect');

  const startMarker=`  const QR_ATTEMPT_KEY='msos_qr_last_attempt';`;
  const startIdx=realSrc.indexOf(startMarker);
  assert.ok(startIdx>=0,'test setup error: could not locate the start of the breadcrumb block');
  const endMarker=`  X.lastAttemptStatus=()=>{try{return JSON.parse(localStorage.getItem(QR_ATTEMPT_KEY)||'null')}catch{return null}};\n`;
  const endIdx=realSrc.indexOf(endMarker,startIdx);
  assert.ok(endIdx>=0,'test setup error: could not locate the end of the breadcrumb block');
  let buggySrc=realSrc.slice(0,startIdx)+realSrc.slice(endIdx+endMarker.length);
  // Neutralize every remaining writeAttempt(...) call by replacing just the call itself with a harmless
  // no-op expression, leaving whatever surrounds it (a bare `;`, or -- since the 19 Sept wake-lock
  // instrumentation added one nested inside an addEventListener('release', ...) callback -- trailing args
  // like `,{once:true})` before the real semicolon) syntactically intact either way.
  buggySrc=buggySrc.replace(/writeAttempt\(\{[^}]*\}\)/g,'(void 0)');
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes('writeAttempt'),'test setup error: reverted source must not still reference writeAttempt');

  const tmpPath=invitePath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const modalHost=makeNode('div'),athletesHead=makeNode('div');
    global.document={
      readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
      querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
    };
    global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
    if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
    global.localStorage=makeLocalStorage();
    global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
    global.MSOS4={
      ui:{},
      state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
      access:{role:()=>'owner'},
      store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
      currentSession:()=>({id:'sess-1',identity:{date:'2026-09-16',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
      swimmerTrainingBG:{projectionFor:()=>({date:'2026-09-16',squad:'Development',course:'SCM',title:'Threshold set',metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},blocks:[]}),viewFor:()=>null},
      performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
      swimmerPerformanceBM:{prepareAthlete:(a,{onJob}={})=>{onJob?.('training_test_types',5,5);return new Promise(()=>{});},readinessFor:()=>({ok:true,issues:[]})},
    };
    global.fetch=()=>new Promise(()=>{});
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const M=global.MSOS4;
    M.swimmerInviteBN.GENERATE_TIMEOUT_MS=800;
    M.swimmerInviteBN.STATUS_TICK_MS=200;
    assert.equal(typeof M.swimmerInviteBN.lastAttemptStatus,'undefined','test setup error: reverted build must not expose lastAttemptStatus');

    await null;
    const genBtn=athletesHead._appended[0];
    genBtn.onclick();
    const wrap=modalHost._appended[0];
    const generate=wrap.querySelector('[data-bn-generate]');
    generate.onclick();
    await new Promise(r=>setTimeout(r,650));
    assert.equal(global.localStorage.getItem('msos_qr_last_attempt'),null,'the buggy pre-fix source must never record a breadcrumb -- confirms this test would have caught its absence');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('QR_ATTEMPT_BREADCRUMB_FAILBEFORE_PASS');
}

(async()=>{
  await run();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
