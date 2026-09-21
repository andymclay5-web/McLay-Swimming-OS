'use strict';
// Real coaching failure this pins (Andy, live, 20 Sept 2026) -- and the story of why this file's own name is
// now half-obsolete, kept anyway so the history is visible in the test that lived through it:
//
// Earlier the same night, after TWO separate genuine unbounded-computation bugs were found and fixed in the
// SAME payloadFor() pipeline (readinessFor's stale national-benchmark check, then athleteTrainingView()'s
// full-history recompute), a THIRD freeze (safePerformance, William Callow) prompted a structural fix: split
// payloadFor() into corePayloadFor() (identity + session + squad sessions -- fast, twice-proven bounded) for
// Generate's critical path, with the full analytical payload (performance/training/tests/meet/sharedEvidence)
// republished afterward via a deferred setTimeout(...,0), reasoning that deferring it outside
// GENERATE_TIMEOUT_MS meant it "could no longer delay or fail the access the coach already has in hand."
//
// That reasoning was WRONG about the phone staying usable, even though it was right about the access itself
// staying safe. A few hours after that build shipped -- right after it reached William Callow's
// 'payload:performance' step cleanly in 2.5 seconds, proving the critical-path half of the fix genuinely
// worked -- Andy hit a DIFFERENT, WORSE symptom on a later attempt: "I can't copy the link cause it's frozen,
// cant do anything but back back." Not one modal stuck -- the WHOLE PHONE, unresponsive to every tap. That
// is the signature of the deferred setTimeout(...,0) block itself running and blocking the single JS thread:
// deferring WHEN a synchronous computation starts does nothing to stop it from hogging that one thread for
// however long it takes once it does start, exactly like the athleteTrainingView() freeze earlier the same
// night before that one was bounded. safePerformance()/buildAthletePathways() was read carefully and found
// no unbounded loop -- but that is exactly the same "read it, find nothing" result that missed both of the
// other two real bugs tonight before they were caught by counting real operations instead. Rather than ship
// a fourth guess under time pressure with a coach's phone already locked up mid-session, the deferred
// republish was disabled entirely (engines/swimmer-invite-bn.js, the commented-out setTimeout block, with the
// full account in its own comment) until it can be proven safe the way the other two fixes were: by counting,
// not reading.
//
// 21 Sept 2026, RE-ENABLED (Andy, live: "we need to get them to be able to see all of the information I have
// for them ... what do you need to do to make that happen?"): this test now proves the SAFE re-enablement,
// not the disablement. What changed since the block above was written: (1) buildAthletePathways() was
// directly profiled (not guessed) against a synthetic pathway_standards table sized to Andy's own real
// ~4,406-row figure, and a genuine O(events x standards) inefficiency was found and fixed by indexing the
// table once per athlete instead of rescanning it per event (~2.3x measured speedup at realistic event
// counts, verified against the real pre-fix file -- see engines/performance-pathway-ck.js's own comment and
// tests/performance-pathway-ck-index-parity-20260921.cjs / tests/performance-pathway-ck-index-perf-20260921.cjs).
// (2) The disabled synchronous setTimeout(payloadFor) block was replaced with payloadForAsync -- a real async
// generator over the same five stages (sessions/performance/training/tests/meet/shared_evidence, each still
// computed by the exact same unchanged safeX() functions as before), yielding back to the browser's event
// loop between every stage via a real setTimeout(0) tick, and bounded by a hard wall-clock ceiling
// (ENRICHMENT_BUDGET_MS) that skips all remaining stages if already exceeded rather than adding more
// synchronous work on top of an already-slow run. This test now proves: (1) Generate's critical-path publish
// still carries only corePayloadFor's minimal shape, unaffected by any of this; (2) a SECOND
// msos_publish_swimmer_payload call now DOES follow automatically, carrying the full analytical payload, but
// only after genuinely yielding to the event loop at least once (proving it cannot re-create the single
// unbroken synchronous block that froze Andy's phone); (3) when the wall-clock budget is exceeded partway
// through, the remaining stages are genuinely skipped (truncatedAt set, and the corresponding fields stay at
// their empty default) rather than pushed through anyway.
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
function makeLocalStorageSpy(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}

const athlete={id:'ath-core-enrichment-fixture',full_name:'William Callow',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

// Real, non-empty analytical data throughout -- proves the critical-path publish deliberately leaves this
// out, and that the deferred enrichment genuinely picks it up afterward.
function makeFetchSpy(){
  const calls=[];
  const fn=async(url,opts)=>{
    const u=String(url);
    let body=null;
    try{body=opts&&opts.body?JSON.parse(opts.body):null;}catch{}
    calls.push({url:u,body});
    if(u.includes('msos_create_swimmer_invite')){
      return{ok:true,text:async()=>JSON.stringify({invite_token:'tok-core-enrichment-fixture',expires_at:new Date(Date.now()+900000).toISOString()})};
    }
    return{ok:true,text:async()=>JSON.stringify({})};
  };
  fn._calls=calls;
  return fn;
}

function bootFixture(){
  const modalHost=makeNode('div');
  const athletesHead=makeNode('div');
  const doc=makeDocument(modalHost,athletesHead);
  global.document=doc;
  global.window=global;
  global.location={href:'https://example.test/app.html'};
  global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
  global.localStorage=makeLocalStorageSpy();
  global.QRCode=function FakeQRCode(){};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id,pathwayCourse:'SCM'},athletes:[athlete],captures:[],
      meetEntries:[],trainingTestResults:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-20',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{
      projectionFor:()=>({date:'2026-09-20',squad:'Development',course:'SCM',title:'Threshold set',
        metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
        blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
      // Real, non-empty training view -- must appear only in the DEFERRED publish, never the critical-path one.
      viewFor:()=>({
        today:{title:'Threshold set',date:'2026-09-20',delivery:'',deliveredMetres:4000,prescribedMetres:4000,strokes:{},tags:{},zones:{}},
        week:{confirmedDeliveredMetres:8000,sessions:2,strokes:{},tags:{},zones:{}},
        month:{confirmedDeliveredMetres:32000,sessions:8,strokes:{},tags:{},zones:{}},
        upcoming:[],
      }),
      candidateSessionsFor:()=>[],
    },
    // Real, non-empty performance pathway data -- same reasoning: only the deferred publish may carry it.
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    swimmerPerformanceBM:{
      completeEvidence:()=>Promise.resolve({ok:true,rows:0,errors:[]}),
      readinessFor:()=>({ok:true,issues:[],model:{events:[{id:'ev1'}]}}),
    },
  };
  const fetchSpy=makeFetchSpy();
  global.fetch=fetchSpy;
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  global.MSOS4.swimmerInviteBN.STATUS_TICK_MS=5;
  return{M:global.MSOS4,modalHost,athletesHead,doc,fetchSpy};
}

async function openModal(athletesHead,modalHost){
  await null;
  const outerBtn=athletesHead._appended[0];
  assert.ok(outerBtn,'installButton() must have appended the "Give swimmer access" button');
  outerBtn.onclick();
  const wrap=modalHost._appended[modalHost._appended.length-1];
  return{wrap,generate:wrap.querySelector('[data-bn-generate]')};
}

function publishCalls(fetchSpy){
  return fetchSpy._calls.filter(c=>c.url.includes('msos_publish_swimmer_payload'));
}

async function waitFor(predicate,{tries=100,everyMs=10}={}){
  for(let i=0;i<tries;i++){if(predicate())return true;await new Promise(r=>setTimeout(r,everyMs));}
  return predicate();
}

async function runCoreCriticalPathThenSafeDeferredEnrichment(){
  const{M,athletesHead,modalHost,fetchSpy}=bootFixture();
  const{generate}=await openModal(athletesHead,modalHost);

  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const finalAttempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(finalAttempt.outcome,'ok','generate must complete successfully using only the fast, bounded core payload');
  assert.equal(finalAttempt.step,'done');

  const callsRightAfterGenerate=publishCalls(fetchSpy);
  assert.equal(callsRightAfterGenerate.length,1,'exactly one msos_publish_swimmer_payload call must have happened by the time Generate itself resolves -- the critical-path one');
  const corePublished=callsRightAfterGenerate[0].body.p_payload;
  assert.equal(corePublished.performance.events.length,0,'the critical-path publish must NOT carry the real, non-empty performance data available in the fixture -- it must use corePayloadFor, not the full analytical payloadFor/payloadForAsync');
  assert.deepEqual(corePublished.training,{},'the critical-path publish must not carry the real, non-empty training data available in the fixture');
  assert.ok(corePublished.session?.blocks?.length,'the critical-path publish must still carry the current session -- corePayloadFor is not empty, just minimal');

  // The deferred enrichment genuinely runs and eventually completes (the actual thread-yielding proof is a
  // separate, more targeted test below against payloadForAsync directly -- see
  // runPayloadForAsyncYieldsBetweenStages).
  const enrichmentSettled=await waitFor(()=>M.swimmerInviteBN.lastAttemptStatus().enrichmentOutcome!==undefined);
  assert.ok(enrichmentSettled,'the deferred background enrichment must eventually complete, not hang forever');

  const settled=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(settled.enrichmentOutcome,'ok');
  assert.equal(settled.enrichmentTruncatedAt,null,'this fixture\'s data is small and fast -- it must finish well inside the wall-clock budget, not get truncated');
  assert.equal(settled.step,'done',"the real 'done' step must be unchanged by the enrichment that follows it");
  assert.equal(settled.resolvedAt,finalAttempt.resolvedAt,'the enrichment must never rewrite the critical path\'s own resolvedAt');

  const callsAfterEnrichment=publishCalls(fetchSpy);
  assert.equal(callsAfterEnrichment.length,2,'exactly one further msos_publish_swimmer_payload call must follow, carrying the deferred full analytical payload');
  const fullPublished=callsAfterEnrichment[1].body.p_payload;
  assert.equal(fullPublished.performance.events.length,1,'the deferred publish must carry the real, non-empty performance data the critical-path publish deliberately left out');
  assert.equal(fullPublished.training.today?.deliveredMetres,4000,'the deferred publish must carry the real, non-empty training data the critical-path publish deliberately left out');

  console.log('QR_CORE_THEN_SAFE_DEFERRED_ENRICHMENT_PASS');
}

async function runBudgetExceededTruncatesRemainingStages(){
  // Directly exercises payloadForAsync's own safety net (not routed back through the Generate button): a
  // budget already exceeded before the first stage's own check (-1ms, so Date.now()-t0 >= 0 is always > -1,
  // deterministically, with no dependence on how fast the test machine happens to be) must skip every stage,
  // leaving the output at its empty defaults -- proving truncation actually skips work, not merely labels it.
  bootFixture();
  const X=global.MSOS4.swimmerInviteBN;
  const{payload,truncatedAt}=await X.payloadForAsync(athlete,()=>{},-1);
  assert.equal(truncatedAt,'performance','a budget already exceeded before the loop starts must be caught at the very first analytical stage');
  assert.deepEqual(payload.performance,{course:'SCM',events:[],opportunities:[]},'a truncated stage must keep its empty default, never partially-run real data');
  assert.deepEqual(payload.training,{});
  assert.deepEqual(payload.tests,[]);
  assert.deepEqual(payload.meet,[]);
  assert.deepEqual(payload.sharedEvidence,[]);
  assert.ok(payload.session,'even a fully truncated enrichment pass must still carry the identity/session data computed before the budget check -- it is never a blank object');
  console.log('QR_ENRICHMENT_BUDGET_TRUNCATION_PASS');
}

async function runPayloadForAsyncYieldsBetweenStages(){
  // The direct, targeted proof of the actual safety property (as opposed to the end-to-end test above, which
  // only proves the enrichment eventually finishes): a macrotask scheduled during payloadForAsync's very first
  // stage must get a genuine turn on the event loop before payloadForAsync's own promise resolves. This is
  // only possible because payloadForAsync awaits a real setTimeout(0) between every stage -- if that yield
  // were ever removed (reverting to one unbroken synchronous span, exactly like the original disabled
  // payloadFor() block), every stage would run back-to-back on the microtask queue and this sentinel
  // (a macrotask, scheduled strictly before payloadForAsync's own first yield timer in the same iteration)
  // would still be pending -- not yet run -- by the time the assertion below checks it.
  bootFixture();
  const X=global.MSOS4.swimmerInviteBN;
  let sentinelRan=false;
  const resultPromise=X.payloadForAsync(athlete,name=>{
    if(name==='performance')setTimeout(()=>{sentinelRan=true;},0);
  });
  await resultPromise;
  assert.ok(sentinelRan,'a macrotask scheduled during payloadForAsync\'s first stage must have already run by the time payloadForAsync itself resolves -- proves it genuinely yields the thread between stages instead of running end to end synchronously');
  console.log('QR_ENRICHMENT_YIELDS_BETWEEN_STAGES_PASS');
}

async function runFailBeforeYieldSentinelWouldCatchARegression(){
  // Fail-before for the yield test above: strip out the one await that actually yields the thread between
  // stages (reverting payloadForAsync to one unbroken synchronous span, the exact shape of the original
  // disabled payloadFor() setTimeout block) and confirm the same sentinel technique correctly reports it as
  // NOT yielding -- proving runPayloadForAsyncYieldsBetweenStages would have caught this regression.
  const fixedLine='      await yieldToMainThread();\n';
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate payloadForAsync\'s own yield call in the real source -- its wording changed in a way this test does not expect');
  const deYieldedSrc=realSrc.replace(fixedLine,'');
  assert.notEqual(deYieldedSrc,realSrc,'test setup error: could not construct the de-yielded reversion');
  const tmpPath=invitePath.replace(/\.js$/,'.enrichmentyieldfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,deYieldedSrc);
  try{
    require('node:child_process').execFileSync(process.execPath,['--check',tmpPath],{stdio:'pipe'});
    bootFixture();
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const X=global.MSOS4.swimmerInviteBN;
    let sentinelRan=false;
    await X.payloadForAsync(athlete,name=>{
      if(name==='performance')setTimeout(()=>{sentinelRan=true;},0);
    });
    assert.equal(sentinelRan,false,'pre-fix (de-yielded) payloadForAsync must run all stages back-to-back on the microtask queue, so a macrotask scheduled during its first stage must NOT have run yet by the time it resolves -- confirms the real fix\'s yield call is what the sentinel test above is actually pinning');
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('QR_ENRICHMENT_YIELD_FAILBEFORE_PASS');
}

function runReenablementIsTheIntendedSafeMechanism(){
  // Source-level guard, inverted from this file's original shape: the deferred republish must be wired
  // through payloadForAsync (yielding, budgeted) and must NOT be the old fully-synchronous payloadFor with no
  // yield points -- that combination is exactly what froze Andy's phone the first time this shipped.
  assert.match(realSrc,/const\{payload:full,truncatedAt\}=await payloadForAsync\(a,/,'the Generate button\'s deferred republish must call the yielding, budgeted payloadForAsync -- not the old fully-synchronous payloadFor');
  assert.doesNotMatch(realSrc.split('function installButton(){')[0].split('async function payloadForAsync')[0].slice(-4000),/setTimeout\(\(\)=>\{\s*try\{\s*const full=payloadFor\(a,/,'the disabled fully-synchronous setTimeout(payloadFor) block must not have been reintroduced verbatim');
  console.log('QR_CORE_REENABLEMENT_USES_SAFE_MECHANISM_PASS');
}

(async()=>{
  await runCoreCriticalPathThenSafeDeferredEnrichment();
  await runBudgetExceededTruncatesRemainingStages();
  await runPayloadForAsyncYieldsBetweenStages();
  await runFailBeforeYieldSentinelWouldCatchARegression();
  runReenablementIsTheIntendedSafeMechanism();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
