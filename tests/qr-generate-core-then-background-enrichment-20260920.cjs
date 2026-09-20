'use strict';
// Real coaching failure this pins (Andy, live, 20 Sept 2026): after TWO separate genuine unbounded-computation
// bugs were found and fixed in ONE evening inside the SAME payloadFor() pipeline (readinessFor's stale
// national-benchmark check, then athleteTrainingView()'s full-history recompute) -- each one independently
// unblocked "Give swimmer access" only to reach a NEW freeze on a DIFFERENT analytical step (this time
// 'performance', for a different swimmer, William Callow) -- Andy asked directly: "Come on Claude this is
// enough, can you sort it out or do we need to find an easier way to give swimmers access." An exhaustive,
// but inconclusive, static read of safePerformance()'s entire call chain found no further smoking-gun bug.
// Rather than keep reactively patching one slow analytical step at a time under pressure, this is the
// structural answer: Generate's critical path now awaits corePayloadFor() (identity + current session +
// squad sessions only -- already fast and bounded) and publishes THAT immediately, while the full, richly
// analytical payload (performance/training/tests/meet/sharedEvidence -- built by the unchanged payloadFor())
// is computed and republished in the background, deferred one tick, entirely outside GENERATE_TIMEOUT_MS.
// msos_publish_swimmer_payload is a plain upsert keyed by athlete_id (confirmed against
// supabase/20260824_secure_swimmer_portal.sql), so the second publish safely updates the same record in
// place, and swimmer-portal.js already renders every analytical section gracefully when empty (confirmed by
// reading its own rendering code) -- so a swimmer opening the link in the first few seconds sees a working
// portal with their session, and the richer sections fill in moments later automatically.
//
// This test proves, against the REAL source (not a description of intent): (1) Generate's critical path RPC
// call to msos_publish_swimmer_payload carries corePayloadFor's minimal shape -- empty performance/training/
// tests/meet/sharedEvidence -- even though real, non-empty analytical data is available in the fixture and
// WOULD show up if the slow, full payloadFor() were awaited live, proving the swap actually happened and
// Generate can never again be blocked by a slow analytical step; (2) Generate completes ('done'/'ok') using
// only that minimal payload, well within a tight budget, regardless of how much analytical data exists;
// (3) a SECOND msos_publish_swimmer_payload call follows automatically, carrying the FULL, enriched payload
// (the real analytical data), proving the swimmer's portal is topped up automatically without a new invite;
// (4) the breadcrumb records enrichmentOutcome:'ok' when that background republish succeeds, and
// enrichmentOutcome:'error' (not a silent swallow, not a thrown/unhandled rejection) when it fails; (5)
// fail-before: reverting the one-line swap back to the old, unbounded payloadFor() call makes the critical-
// path publish carry the FULL analytical payload again -- reproducing the exact risk category this fix
// removes -- and confirms this test would have caught it.
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

// Real, non-empty analytical data throughout -- the whole point is that this data exists and is available,
// but must NOT appear in the critical-path publish call, only in the deferred background one.
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

function bootFixture(src){
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
      // Real, non-empty training view -- must appear ONLY in the background-enrichment publish, never the
      // critical-path one.
      viewFor:()=>({
        today:{title:'Threshold set',date:'2026-09-20',delivery:'',deliveredMetres:4000,prescribedMetres:4000,strokes:{},tags:{},zones:{}},
        week:{confirmedDeliveredMetres:8000,sessions:2,strokes:{},tags:{},zones:{}},
        month:{confirmedDeliveredMetres:32000,sessions:8,strokes:{},tags:{},zones:{}},
        upcoming:[],
      }),
      candidateSessionsFor:()=>[],
    },
    // Real, non-empty performance pathway data -- same reasoning: must appear ONLY in the background publish.
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    swimmerPerformanceBM:{
      completeEvidence:()=>Promise.resolve({ok:true,rows:0,errors:[]}),
      readinessFor:()=>({ok:true,issues:[],model:{events:[{id:'ev1'}]}}),
    },
  };
  const fetchSpy=makeFetchSpy();
  global.fetch=fetchSpy;
  const loadPath=src?null:invitePath;
  if(src){
    const tmpPath=invitePath.replace(/\.js$/,'.coreenrichmentfailbefore.tmp.js');
    fs.writeFileSync(tmpPath,src);
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    fs.unlinkSync(tmpPath);
  }else{
    delete require.cache[require.resolve(invitePath)];
    require(invitePath);
  }
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

async function waitForEnrichment(M){
  for(let i=0;i<50;i++){
    const s=M.swimmerInviteBN.lastAttemptStatus();
    if(s?.enrichmentOutcome)return s;
    await new Promise(r=>setTimeout(r,10));
  }
  throw new Error('TEST_HARNESS_GUARD: background enrichment never settled');
}

async function runCorePublishedImmediatelyThenEnrichedInBackground(){
  const{M,athletesHead,modalHost,fetchSpy}=bootFixture();
  const{generate}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const finalAttempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(finalAttempt.outcome,'ok','generate must complete successfully using only the fast, bounded core payload');
  assert.equal(finalAttempt.step,'done');

  // 1 + 2: the critical-path publish call must carry ONLY corePayloadFor's minimal shape.
  const beforeEnrichment=publishCalls(fetchSpy);
  assert.equal(beforeEnrichment.length,1,'exactly one msos_publish_swimmer_payload call must have happened by the time Generate resolves');
  const corePublished=beforeEnrichment[0].body.p_payload;
  assert.equal(corePublished.performance.events.length,0,'the critical-path publish must NOT carry the real, non-empty performance data available in the fixture -- it must use corePayloadFor, not the full analytical payloadFor');
  assert.deepEqual(corePublished.training,{},'the critical-path publish must not carry the real, non-empty training data available in the fixture');
  assert.ok(corePublished.session?.blocks?.length,'the critical-path publish must still carry the current session -- corePayloadFor is not empty, just minimal');

  // 3 + 4: a second publish call follows automatically, in the background, carrying the FULL enriched payload.
  const enrichmentSettled=await waitForEnrichment(M);
  assert.equal(enrichmentSettled.enrichmentOutcome,'ok','the background enrichment republish must succeed in this fixture');

  const afterEnrichment=publishCalls(fetchSpy);
  assert.equal(afterEnrichment.length,2,'the background enrichment must issue a SECOND msos_publish_swimmer_payload call for the same athlete');
  const fullPublished=afterEnrichment[1].body.p_payload;
  assert.equal(afterEnrichment[1].body.p_athlete_id,String(athlete.id),'the background republish must target the same athlete');
  assert.equal(fullPublished.performance.events.length,1,'the background republish must carry the real, non-empty performance data the critical-path publish deliberately left out');
  assert.equal(fullPublished.training.week.sessions,2,'the background republish must carry the real, non-empty training data the critical-path publish deliberately left out');

  // The winning attempt's real "done" status must not be clobbered by its own background enrichment writes.
  assert.equal(enrichmentSettled.step,'done');
  assert.equal(enrichmentSettled.outcome,'ok');
  assert.equal(enrichmentSettled.resolvedAt,finalAttempt.resolvedAt);

  console.log('QR_CORE_THEN_BACKGROUND_ENRICHMENT_PASS');
}

async function runEnrichmentFailureIsRecordedNotSwallowed(){
  // If the background republish itself fails (network blip, RPC error), the breadcrumb must say so --
  // not swallow it silently, which would make a real "the swimmer's richer sections never filled in" report
  // look identical to "everything is fine" from the diagnostics Andy actually has available to him.
  const{M,athletesHead,modalHost,fetchSpy}=bootFixture();
  const realFetch=fetchSpy;
  global.fetch=async(url,opts)=>{
    if(String(url).includes('msos_publish_swimmer_payload')&&realFetch._calls.filter(c=>c.url.includes('msos_publish_swimmer_payload')).length>=1){
      // Let the FIRST (critical-path) publish succeed, fail only the background one.
      realFetch._calls.push({url:String(url),body:JSON.parse(opts.body)});
      return{ok:false,text:async()=>JSON.stringify({message:'network blip'})};
    }
    return realFetch(url,opts);
  };

  const{generate}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);
  assert.equal(M.swimmerInviteBN.lastAttemptStatus().outcome,'ok','the critical path must still succeed even though the LATER background republish will fail');

  const settled=await(async()=>{
    for(let i=0;i<50;i++){
      const s=M.swimmerInviteBN.lastAttemptStatus();
      if(s?.enrichmentOutcome)return s;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error('TEST_HARNESS_GUARD: background enrichment never settled');
  })();
  assert.equal(settled.enrichmentOutcome,'error','a failed background republish must be recorded as enrichmentOutcome:"error", not silently dropped');
  assert.ok(settled.enrichmentMessage,'the enrichmentMessage must carry the real failure reason');
  assert.equal(settled.outcome,'ok','the swimmer still has working core access even when the background enrichment fails -- that failure must not retroactively fail the whole attempt');

  console.log('QR_CORE_THEN_BACKGROUND_ENRICHMENT_FAILURE_RECORDED_PASS');
}

function runFailBefore(){
  // Fail-before: revert the one-line swap in Generate's critical path from corePayloadFor back to the old,
  // full, analytical payloadFor -- reproducing exactly the risk category this fix removes (the critical path
  // is once again at the mercy of however slow performance/training/tests/meet/sharedEvidence happen to be).
  const fixedLine='const portal=corePayloadFor(a,name=>{mark(`payload:${name}`);note(`Assembling private swimmer view… (${String(name||\'\').replace(/_/g,\' \')})`);});';
  const buggyLine='const portal=payloadFor(a,name=>{mark(`payload:${name}`);note(`Assembling private swimmer view… (${String(name||\'\').replace(/_/g,\' \')})`);});';
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the corePayloadFor call in Generate\'s critical path -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  return(async()=>{
    const{M,athletesHead,modalHost,fetchSpy}=bootFixture(buggySrc);
    const{generate}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
    ]);
    assert.equal(M.swimmerInviteBN.lastAttemptStatus().outcome,'ok','fixture sanity: the buggy pre-fix source must still be able to complete in this fixture (it is only slow on real production data volume, not wrong)');

    const calls=publishCalls(fetchSpy);
    assert.equal(calls.length,1,'fixture sanity: the pre-fix source only ever publishes once, live in the critical path -- there is no background republish to wait for');
    const published=calls[0].body.p_payload;
    assert.equal(published.performance.events.length,1,'pre-fix source: the critical-path publish carries the FULL analytical payload directly -- confirms this test would have caught the exact regression (a slow analytical step blocking Generate again) if the corePayloadFor swap were ever reverted');

    console.log('QR_CORE_THEN_BACKGROUND_ENRICHMENT_FAILBEFORE_PASS');
  })();
}

(async()=>{
  await runCorePublishedImmediatelyThenEnrichedInBackground();
  await runEnrichmentFailureIsRecordedNotSwallowed();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
