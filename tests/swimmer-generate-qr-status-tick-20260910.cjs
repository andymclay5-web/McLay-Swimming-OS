'use strict';
// Real coaching failure this pins: even after the whole generate-QR flow was bounded by one overall timeout
// (tests/swimmer-generate-qr-overall-timeout-20260910.cjs), Andy reported the exact same symptom again --
// the modal frozen on "Checking swimmer evidence... (5/5 * training_test_types)" for about a minute, with no
// visible change. From a screenshot alone there was no way to tell "the app is still alive and this step is
// just slow (and will still resolve or time out on its own bound)" apart from "the page itself has stopped
// running JS entirely" -- a materially different, more serious problem that no timeout inside the app's own
// code can fix.
//
// Fix: engines/swimmer-invite-bn.js's note() (the helper that updates the visible status text for whichever
// step is currently running) now appends a live, ticking elapsed-seconds count to the message, refreshed
// every X.STATUS_TICK_MS (1000ms in production) for as long as that step is in flight, and stops the moment
// the step changes or the flow settles (success, error, or timeout). This test proves the ticker actually
// increments visibly on screen while a step is stuck, and that it stops cleanly once the flow ends --
// instead of ticking forever in the background or never ticking at all.
const assert=require('node:assert/strict');
const path=require('node:path');

// --- minimal DOM stub (see tests/swimmer-generate-qr-overall-timeout-20260910.cjs for rationale; no jsdom
// is available in this project, so each distinct selector queried against a node whose markup was set via
// innerHTML gets a stable, cached mock element) --------------------------------------------------------
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

const athlete={id:'ath-status-tick-fixture',full_name:'Status Tick Fixture Swimmer',date_of_birth:'2010-07-01',
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
  swimmerPerformanceBM:{
    prepareAthlete:async(a,{onJob}={})=>{onJob?.('results_pb_board',1,1);return{completion:{ok:true,rows:0,errors:[]},model:{events:[]}};},
    readinessFor:()=>({ok:true,issues:[]}),
  },
};

// The bug condition: the "Establishing secure owner access" RPC never resolves -- the exact shape of Andy's
// report, where a single step stalls indefinitely while the coach watches the screen.
global.fetch=()=>new Promise(()=>{});

require(path.join(__dirname,'..','engines','swimmer-invite-bn.js'));
const M=global.MSOS4;
M.swimmerInviteBN.GENERATE_TIMEOUT_MS=1600; // settle soon so the test doesn't run long
M.swimmerInviteBN.STATUS_TICK_MS=1000; // production cadence -- the displayed "(Ns)" has whole-second granularity

(async()=>{
  await null; // let requestAnimationFrame(install) settle
  const genBtn=athletesHead._appended[0];
  assert.ok(genBtn,'installButton() must have appended the "Give swimmer access" button');
  genBtn.onclick();
  const wrap=modalHost._appended[0];
  const status=wrap.querySelector('[data-bn-status]');
  const generate=wrap.querySelector('[data-bn-generate]');

  const clickPromise=generate.onclick();

  // Sample the visible status text a few times while the stuck step is in flight -- it must actually change
  // (a ticking "(Ns)" suffix), proving the app is alive and this is a genuinely bounded, still-running step,
  // not a frozen page.
  const samples=[];
  for(let i=0;i<4;i++){
    await new Promise(r=>setTimeout(r,350));
    samples.push(status.textContent);
  }
  assert.ok(samples.every(s=>/^Establishing secure owner access…/.test(s)),`every sample must still name the step that's actually stuck, got: ${JSON.stringify(samples)}`);
  const distinct=new Set(samples);
  assert.ok(distinct.size>1,`the status text must visibly tick while a step is stuck instead of staying frozen -- otherwise a coach watching the screen has no way to tell "still working" from "actually stopped", got identical samples: ${JSON.stringify(samples)}`);

  // Once the flow settles (here: the overall timeout fires), the ticker must stop -- the final message must
  // not keep changing underneath it.
  await Promise.race([
    clickPromise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate-QR handler did not settle')),2000)),
  ]);
  const finalText=status.textContent;
  await new Promise(r=>setTimeout(r,100));
  assert.equal(status.textContent,finalText,'the status ticker must stop once the flow settles, not keep rewriting the final message');
  assert.match(finalText,/timed out after/i,`expected the final message to be the overall-timeout error, got: ${JSON.stringify(finalText)}`);

  console.log('SWIMMER_GENERATE_QR_STATUS_TICK_PASS', `${distinct.size} distinct ticks observed ·`, finalText);
})().catch(err=>{console.error('SWIMMER_GENERATE_QR_STATUS_TICK_FAIL',err);process.exit(1);});
