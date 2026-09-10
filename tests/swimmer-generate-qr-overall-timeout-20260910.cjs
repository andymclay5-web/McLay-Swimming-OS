'use strict';
// Real coaching failure this pins: Andy's own live report, in order --
//   1. "it just stopps on checking swimmer evidence" / "more than 10 mins"
//   2. fixed with a per-job evidence timeout (tests/swimmer-evidence-completion-timeout-20260910.cjs)
//   3. "stuck on training_test_types, didn't move past 5/5" -- the progress counter (fixed in
//      tests/swimmer-evidence-progress-callback-20260910.cjs) PROVED the per-job timeout was working and had
//      genuinely reached the last evidence job -- yet the modal still froze on that exact status text for
//      "much longer minutes and minites" with zero further change and no error.
//
// Once the evidence-job loop itself was confirmed bounded and working, the only place left for an unbounded
// hang was one of the steps engines/swimmer-invite-bn.js's generate-QR handler runs AFTER
// prepareAthlete() resolves: the reference-cache save inside completeEvidence (separately fixed and pinned
// by tests/swimmer-evidence-refs-save-timeout-20260910.cjs), "Establishing secure owner access"
// (msos_bootstrap_owner), the Challenge/Edit/Finish check (verifySessionInteractionLayer), publishing the
// payload (msos_publish_swimmer_payload), creating the invite (msos_create_swimmer_invite), and loading the
// QR renderer script from a CDN -- NONE of which had any timeout. A single stalled request at any one of
// those steps freezes the status text at whatever it last said and never recovers.
//
// Fix: the whole generate-QR flow (from the evidence check through the QR render) now runs inside one
// withTimeout(...) race (X.GENERATE_TIMEOUT_MS, default 120000ms in production), which reports which named
// step was in flight when it gives up. This test drives the REAL button-click handler end to end (via a
// minimal DOM stub -- there is no jsdom in this project) with every step fast/successful EXCEPT the
// "Establishing secure owner access" RPC, which never resolves -- proving the flow still recovers with a
// clear, step-named error instead of freezing forever, and re-enables the button so the coach can retry.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// --- minimal DOM stub -------------------------------------------------------------------------------------
// modal() in engines/swimmer-invite-bn.js builds its markup via wrap.innerHTML=`...` then immediately
// re-queries pieces of it with wrap.querySelector('[data-bn-xxx]'). Rather than actually parsing HTML (no
// jsdom available here), each distinct selector string queried against the same node is handed a stable,
// cached mock element -- which is all modal() needs, since it never re-queries expecting fresh parsed
// content, only a live handle to mutate.
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
    // Only a node whose markup was actually set via innerHTML (modal()'s `wrap`) can resolve attribute
    // selectors -- a plain container that never had content set (like the "is the button already there?"
    // probe in installButton()) must correctly report nothing found, or every fresh container would look
    // pre-populated and installButton() would wrongly skip installing the button.
    querySelector(sel){if(!this._hasContent)return null;if(!this._cache[sel])this._cache[sel]=makeNode('div');return this._cache[sel];},
    querySelectorAll(){return [];},
  };
  return node;
}
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

// --- app state / engine stubs -----------------------------------------------------------------------------
const athlete={id:'ath-overall-timeout-fixture',full_name:'Overall Timeout Fixture Swimmer',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
global.MSOS4={
  ui:{},
  state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
  access:{role:()=>'owner'},
  store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
  currentSession:()=>({id:'sess-1',identity:{date:'2026-09-10',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
  swimmerTrainingBG:{
    projectionFor:()=>({date:'2026-09-10',squad:'Development',course:'SCM',title:'Threshold set',
      metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
      blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
    viewFor:()=>null,
  },
  performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
  // completeEvidence itself is not under test here -- it already resolves fast and successfully, exactly as
  // it does once the two evidence-check fixes above are in place.
  swimmerPerformanceBM:{
    prepareAthlete:async(a,{onJob}={})=>{onJob?.('results_pb_board',1,1);return{completion:{ok:true,rows:0,errors:[]},model:{events:[]}};},
    readinessFor:()=>({ok:true,issues:[]}),
  },
};

// The bug condition: every RPC call hangs forever -- the handler must reach "Establishing secure owner
// access..." (the first RPC call, msos_bootstrap_owner) and get stuck there with no timeout of its own.
global.fetch=()=>new Promise(()=>{});

const invitePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');

async function driveGenerateClick(){
  require(invitePath);
  const M=global.MSOS4;
  M.swimmerInviteBN.GENERATE_TIMEOUT_MS=30; // drop for test speed; identical code path as production
  await null; // let requestAnimationFrame(install) settle
  const genBtn=athletesHead._appended[0]; // "Give swimmer access" button installed by installButton()
  assert.ok(genBtn,'installButton() must have appended the "Give swimmer access" button');
  genBtn.onclick(); // opens the modal synchronously (modal(a))
  const wrap=modalHost._appended[0];
  assert.ok(wrap,'modal() must have appended the access modal into #modalHost');
  const status=wrap.querySelector('[data-bn-status]');
  const generate=wrap.querySelector('[data-bn-generate]');
  assert.ok(generate.onclick,'generate button must have a click handler wired');
  const start=Date.now();
  const clickPromise=generate.onclick();
  await Promise.race([
    clickPromise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle -- a stalled RPC step is not bounded')),2000)),
  ]);
  const elapsedMs=Date.now()-start;
  return {status,generate,elapsedMs};
}

(async()=>{
  const {status,generate,elapsedMs}=await driveGenerateClick();

  assert.ok(elapsedMs<1000,`the generate-QR handler must settle promptly once bounded, took ${elapsedMs}ms`);
  assert.match(status.textContent,/Establishing secure owner access/i,`the reported step must name what was actually in flight when it gave up, got: ${JSON.stringify(status.textContent)}`);
  assert.match(status.textContent,/timed out after/i,`must surface a clear timeout message instead of freezing silently, got: ${JSON.stringify(status.textContent)}`);
  assert.equal(generate.disabled,false,'the generate button must be re-enabled after a timeout so the coach can retry, not left permanently locked');

  console.log('SWIMMER_GENERATE_QR_OVERALL_TIMEOUT_PASS', `settled in ${elapsedMs}ms ·`, status.textContent);
})().catch(err=>{console.error('SWIMMER_GENERATE_QR_OVERALL_TIMEOUT_FAIL',err);process.exit(1);});
