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
// This test now proves the OPPOSITE of what it used to: (1) Generate's critical-path publish still carries
// only corePayloadFor's minimal shape -- that half of the fix is real and unaffected by the disablement; (2)
// crucially, NO second msos_publish_swimmer_payload call ever follows, and no enrichmentStep/enrichmentOutcome
// breadcrumb field ever appears, however long you wait -- the exact thing that was freezing phones cannot run
// at all right now; (3) a source-level guard: if someone re-enables that commented-out block without first
// fixing/proving safePerformance() is actually bounded, this test reproduces a second publish call carrying
// the full analytical payload again -- confirming this test would catch an accidental or premature
// re-enablement before it reaches a coach's phone a second time.
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
// out, and (in the disabled-by-default state) that nothing ever comes along afterward to add it back in.
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
      // Real, non-empty training view -- must never appear in ANY publish call while enrichment is disabled.
      viewFor:()=>({
        today:{title:'Threshold set',date:'2026-09-20',delivery:'',deliveredMetres:4000,prescribedMetres:4000,strokes:{},tags:{},zones:{}},
        week:{confirmedDeliveredMetres:8000,sessions:2,strokes:{},tags:{},zones:{}},
        month:{confirmedDeliveredMetres:32000,sessions:8,strokes:{},tags:{},zones:{}},
        upcoming:[],
      }),
      candidateSessionsFor:()=>[],
    },
    // Real, non-empty performance pathway data -- same reasoning: must never appear while disabled.
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    swimmerPerformanceBM:{
      completeEvidence:()=>Promise.resolve({ok:true,rows:0,errors:[]}),
      readinessFor:()=>({ok:true,issues:[],model:{events:[{id:'ev1'}]}}),
    },
  };
  const fetchSpy=makeFetchSpy();
  global.fetch=fetchSpy;
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

async function runCoreOnlyNoAutomaticEnrichment(){
  const{M,athletesHead,modalHost,fetchSpy}=bootFixture();
  const{generate}=await openModal(athletesHead,modalHost);
  await Promise.race([
    generate.onclick(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
  ]);

  const finalAttempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(finalAttempt.outcome,'ok','generate must complete successfully using only the fast, bounded core payload');
  assert.equal(finalAttempt.step,'done');

  const calls=publishCalls(fetchSpy);
  assert.equal(calls.length,1,'exactly one msos_publish_swimmer_payload call must happen -- the critical-path one');
  const corePublished=calls[0].body.p_payload;
  assert.equal(corePublished.performance.events.length,0,'the critical-path publish must NOT carry the real, non-empty performance data available in the fixture -- it must use corePayloadFor, not the full analytical payloadFor');
  assert.deepEqual(corePublished.training,{},'the critical-path publish must not carry the real, non-empty training data available in the fixture');
  assert.ok(corePublished.session?.blocks?.length,'the critical-path publish must still carry the current session -- corePayloadFor is not empty, just minimal');

  // The heart of this test, now inverted from what it used to prove: NOTHING must follow. Wait comfortably
  // longer than the disabled block's own setTimeout(...,0) delay and confirm no second publish call, and no
  // enrichment breadcrumb field, ever appears -- proving the mechanism that froze Andy's phone cannot run.
  await new Promise(r=>setTimeout(r,150));
  const callsAfterWaiting=publishCalls(fetchSpy);
  assert.equal(callsAfterWaiting.length,1,'no second msos_publish_swimmer_payload call may follow automatically -- the background-enrichment republish that used to fire here is disabled specifically because it could freeze the whole phone');
  const settled=M.swimmerInviteBN.lastAttemptStatus();
  assert.equal(settled.enrichmentOutcome,undefined,'no enrichmentOutcome field may appear on the breadcrumb -- confirms the deferred republish never ran at all, not merely that it has not finished yet');
  assert.equal(settled.enrichmentStep,undefined,'no enrichmentStep field may appear on the breadcrumb either');
  assert.equal(settled.step,'done',"the attempt's real 'done' step must be exactly what it was right after Generate finished -- nothing runs afterward to change it");
  assert.equal(settled.resolvedAt,finalAttempt.resolvedAt);

  console.log('QR_CORE_ONLY_NO_AUTOMATIC_ENRICHMENT_PASS');
}

function runReenablementWouldBeCaught(){
  // Source-level guard, not a fail-before/pass-after of a bug fix: if the disabled setTimeout block is ever
  // simply uncommented again without first proving payloadFor() cannot run long enough to matter, this
  // reproduces exactly the risk that froze Andy's phone -- a second, automatic publish call carrying the full
  // analytical payload, with nothing bounding how long building it can take.
  const disabledBlock=`        /*
        setTimeout(()=>{
          try{
            const full=payloadFor(a,name=>{try{writeAttempt({enrichmentStep:String(name||'')});}catch{}});
            rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:full}).then(
              ()=>{try{writeAttempt({enrichmentOutcome:'ok',enrichmentAt:new Date().toISOString()});}catch{}},
              err=>{try{writeAttempt({enrichmentOutcome:'error',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
            );
          }catch(err){try{writeAttempt({enrichmentOutcome:'threw',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
        },0);
        */`;
  const reenabledBlock=`        setTimeout(()=>{
          try{
            const full=payloadFor(a,name=>{try{writeAttempt({enrichmentStep:String(name||'')});}catch{}});
            rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:full}).then(
              ()=>{try{writeAttempt({enrichmentOutcome:'ok',enrichmentAt:new Date().toISOString()});}catch{}},
              err=>{try{writeAttempt({enrichmentOutcome:'error',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
            );
          }catch(err){try{writeAttempt({enrichmentOutcome:'threw',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
        },0);`;
  assert.ok(realSrc.includes(disabledBlock),'test setup error: could not locate the disabled (commented-out) background-enrichment block in the real source -- its wording changed in a way this test does not expect');
  const reenabledSrc=realSrc.replace(disabledBlock,reenabledBlock);
  assert.notEqual(reenabledSrc,realSrc,'test setup error: could not construct the re-enabled source');
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  return(async()=>{
    const{M,athletesHead,modalHost,fetchSpy}=bootFixture(reenabledSrc);
    const{generate}=await openModal(athletesHead,modalHost);
    await Promise.race([
      generate.onclick(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: generate did not settle')),3000)),
    ]);
    assert.equal(M.swimmerInviteBN.lastAttemptStatus().outcome,'ok','fixture sanity: the re-enabled source must still complete the critical path successfully');

    for(let i=0;i<50;i++){
      if(publishCalls(fetchSpy).length>=2)break;
      await new Promise(r=>setTimeout(r,10));
    }
    const calls=publishCalls(fetchSpy);
    assert.equal(calls.length,2,'re-enabling the commented-out block must reproduce a second, automatic publish call -- confirming this test would catch an accidental re-enablement before it reaches a coach\'s phone again');
    assert.equal(calls[1].body.p_payload.performance.events.length,1,'the re-enabled background republish carries the full analytical payload -- exactly the shape of work that is not yet proven bounded');

    console.log('QR_CORE_REENABLEMENT_WOULD_BE_CAUGHT_PASS');
  })();
}

(async()=>{
  await runCoreOnlyNoAutomaticEnrichment();
  await runReenablementWouldBeCaught();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1);});
