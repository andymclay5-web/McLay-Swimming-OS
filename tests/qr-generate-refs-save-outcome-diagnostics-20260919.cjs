'use strict';
// Real coaching gap this instruments (NOT a fix -- still gathering evidence on the freeze/slowness chase):
// Andy's fifth+ same-day occurrence for Matthew Robertson finally did NOT hang forever -- it settled after
// ~3 minutes with an honest error, driven by two real 12-second network timeouts on training_test_types and
// pathway_standards. But the same breadcrumb also showed diagStateCounts.pathwayStandards and .pathwayMeets
// both sitting at 0 -- meaning neither reference table had a usable local cache going into that attempt, so
// it was forced to redownload pathway_standards (a ~4400-row table) from scratch, on a connection that could
// not complete it inside 12 seconds.
//
// completeEvidence()'s post-loop tail already calls M.refs.save() (the IndexedDB write that is supposed to
// persist a successful fetch for next time) wrapped in a withTimeout()+try/catch that discards EVERY outcome
// identically -- a clean success, a silent false-return failure, a timeout, and a thrown error all look
// exactly the same from outside: nothing changes, the flow just moves on to t400_hydrate. That means there
// has never been any way to tell, from a breadcrumb, whether a fetch that DID succeed is actually being
// cached for next time, or whether the save itself is quietly failing every single attempt -- which would by
// itself explain why pathway_standards never seems to "stick" between attempts, independent of whatever is
// causing the network timeouts.
//
// This records that outcome (one of 'ok'/'failed'/'timeout'/'error') and how long the save actually took, on
// completeEvidence()'s own return value (and, from there, on prepareAthlete()'s .completion and the QR
// breadcrumb's diagRefsSaveOutcome/diagRefsSaveMs fields) -- without changing what happens on any outcome in
// any way: a failed, timed-out, or throwing save still never blocks or fails the overall flow, exactly as
// before this change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const ciPath=path.join(repoRoot,'engines','swimmer-performance-ci.js');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const ciRealSrc=fs.readFileSync(ciPath,'utf8');
const inviteRealSrc=fs.readFileSync(invitePath,'utf8');

const athlete={id:'ath-refs-save-outcome-fixture',full_name:'Refs Save Outcome Fixture Swimmer',date_of_birth:'2010-07-01'};

// --- Part 1: completeEvidence()'s refsSaveOutcome/refsSaveMs on its own return value ------------------------
function bootCi(saveImpl){
  global.MSOSEngines={Evidence:{
    course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
    seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
  }};
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
    refs:{get:()=>[],merge:()=>{},save:saveImpl},
    currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
    pathway:{defaultStandard:()=>true},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},
    cloud:{ready:()=>true,fetch:()=>Promise.resolve([])},
    engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
    cloudSessionEngine:{fetchPages:()=>Promise.resolve([])}, // every evidence job settles instantly with no rows
  };
  delete require.cache[require.resolve(ciPath)];
  delete global.MSOS4.swimmerPerformanceBM;
  require(ciPath);
  return global.MSOS4.swimmerPerformanceBM;
}

async function runOutcomeOk(){
  const X=bootCi(async()=>true);
  const result=await X.completeEvidence(athlete,()=>{});
  assert.equal(result.refsSaveOutcome,'ok',`a save that resolves true must report 'ok', got ${result.refsSaveOutcome}`);
  assert.ok(typeof result.refsSaveMs==='number'&&result.refsSaveMs>=0,`refsSaveMs must be a real elapsed-time number, got ${result.refsSaveMs}`);
  console.log('QR_REFS_SAVE_OUTCOME_OK_PASS',result.refsSaveOutcome,result.refsSaveMs);
}

async function runOutcomeFailed(){
  // Mirrors the real M.refs.save() in app.js, which catches its own IndexedDB errors internally and
  // resolves to false rather than rejecting -- this must be told apart from a genuine success.
  const X=bootCi(async()=>false);
  const result=await X.completeEvidence(athlete,()=>{});
  assert.equal(result.refsSaveOutcome,'failed',`a save that resolves false must report 'failed', got ${result.refsSaveOutcome}`);
  console.log('QR_REFS_SAVE_OUTCOME_FAILED_PASS');
}

async function runOutcomeTimeout(){
  const X=bootCi(()=>new Promise(()=>{})); // never resolves -- the exact shape of a wedged IndexedDB write
  X.REFS_SAVE_TIMEOUT_MS=30; // drop the timeout to keep the test fast; identical withTimeout() code path as production
  const start=Date.now();
  const result=await Promise.race([
    X.completeEvidence(athlete,()=>{}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: completeEvidence did not settle despite a bounded save timeout')),2000)),
  ]);
  const elapsedMs=Date.now()-start;
  assert.equal(result.refsSaveOutcome,'timeout',`a save that never resolves must report 'timeout' once its own bound elapses, got ${result.refsSaveOutcome}`);
  assert.ok(result.refsSaveMs>=30,`refsSaveMs must reflect the real ~30ms bound that was hit, got ${result.refsSaveMs}`);
  assert.ok(elapsedMs<1000,'completeEvidence must still settle promptly even while recording a timeout outcome');
  console.log('QR_REFS_SAVE_OUTCOME_TIMEOUT_PASS',result.refsSaveMs);
}

async function runOutcomeError(){
  const X=bootCi(async()=>{throw new Error('IDBDatabaseException: connection is closing')});
  const result=await X.completeEvidence(athlete,()=>{});
  assert.equal(result.refsSaveOutcome,'error',`a save that throws/rejects must report 'error', got ${result.refsSaveOutcome}`);
  console.log('QR_REFS_SAVE_OUTCOME_ERROR_PASS');
}

async function runPropagatesThroughPrepareAthlete(){
  const X=bootCi(async()=>false);
  const prepared=await X.prepareAthlete(athlete,{onJob:()=>{}});
  assert.ok(prepared.completion,'prepareAthlete must still return a completion object');
  assert.equal(prepared.completion.refsSaveOutcome,'failed',
    `prepareAthlete's completion must carry the same refsSaveOutcome completeEvidence computed, got ${prepared.completion.refsSaveOutcome}`);
  console.log('QR_REFS_SAVE_OUTCOME_PREPARE_ATHLETE_PASS');
}

function runCiFailBefore(){
  const fixedReturn="X.lastCompletion={athleteId:ath.id,ok:errors.length===0,rows:added,errors,refsSaveOutcome,refsSaveMs,at:new Date().toISOString()};return{ok:errors.length===0,rows:added,errors,refsSaveOutcome,refsSaveMs};";
  const buggyReturn="X.lastCompletion={athleteId:ath.id,ok:errors.length===0,rows:added,errors,at:new Date().toISOString()};return{ok:errors.length===0,rows:added,errors};";
  assert.ok(ciRealSrc.includes(fixedReturn),'test setup error: could not locate the fixed completeEvidence() return statement in the real file -- its wording changed in a way this test does not expect');
  const buggySrc=ciRealSrc.replace(fixedReturn,buggyReturn);
  assert.notEqual(buggySrc,ciRealSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.refssaveoutcomefailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    global.MSOSEngines={Evidence:{course:()=>'',distance:()=>0,rowStroke:()=>'',stroke:v=>String(v||''),seconds:()=>0,points:()=>null,pbRows:()=>[],merge:(a,b)=>[...(a||[]),...(b||[])]}};
    global.MSOS4={
      state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
      refs:{get:()=>[],merge:()=>{},save:async()=>false},
      currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
      pathway:{defaultStandard:()=>true},
      performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
      ui:{},
      cloud:{ready:()=>true,fetch:()=>Promise.resolve([])},
      engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
      cloudSessionEngine:{fetchPages:()=>Promise.resolve([])},
    };
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const buggyX=global.MSOS4.swimmerPerformanceBM;
    return buggyX.completeEvidence(athlete,()=>{}).then(result=>{
      assert.equal(result.refsSaveOutcome,undefined,
        `pre-fix source must NOT report refsSaveOutcome -- confirms this is a real, reproduced gap, got ${result.refsSaveOutcome}`);
      assert.equal(result.refsSaveMs,undefined,
        `pre-fix source must NOT report refsSaveMs -- confirms this is a real, reproduced gap, got ${result.refsSaveMs}`);
      console.log('QR_REFS_SAVE_OUTCOME_CI_FAILBEFORE_PASS');
    });
  }finally{
    fs.unlinkSync(tmpPath);
  }
}

// --- Part 2: the Generate handler writing diagRefsSaveOutcome/diagRefsSaveMs onto the breadcrumb ------------
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

function bootInvite(swimmerPerformanceBM){
  const modalHost=makeNode('div'),athletesHead=makeNode('div');
  global.document={
    readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
    querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
  };
  global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
  global.localStorage=makeLocalStorage();
  global.QRCode=function FakeQRCode(){};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[],
      trainingTestTypes:[],resultsPbBoard:[],coachResults:[],resultsEventHistory:[],pathwayStandards:[],pathwayMeets:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{candidateSessionsFor:()=>[],viewFor:()=>null},
    performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
    swimmerPerformanceBM,
  };
  global.fetch=()=>new Promise(()=>{});
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return{M:global.MSOS4,modalHost,athletesHead};
}

async function clickGenerate(athletesHead){
  await null;
  const genBtn=athletesHead._appended[0];
  assert.ok(genBtn,'installButton() must have appended the "Give swimmer access" button');
  genBtn.onclick();
  const wrap=global.document.querySelector('#modalHost')._appended[0];
  return wrap.querySelector('[data-bn-generate]');
}

// 20 Sept 2026 superseding note: the two tests below used to prove the live prepareAthlete()-driven
// diagRefsSaveOutcome/diagRefsSaveMs breadcrumb fields worked. That whole mechanism was removed the very
// next morning (Andy, direct: "I just want to give them access ... this back and forth is wearing me down
// for 1 simple task") -- the live evidence gate it depended on was the actual cause of every freeze chased
// the night before, so Generate no longer awaits prepareAthlete()/completeEvidence() at all. What replaced
// it: a fire-and-forget background completeEvidence() call (see engines/swimmer-invite-bn.js, right after
// the storage-diagnostics snapshot) that can never block or fail Generate, whose eventual outcome is still
// recorded on the breadcrumb as backgroundRefreshOutcome/backgroundRefreshAt purely for future
// troubleshooting. These two tests now cover that replacement mechanism instead.
async function runInviteWritesBackgroundRefreshOutcome(){
  // Reuses this file's own empty-events fixture shape (performanceEngine.pathwaysForAthlete returns no
  // events), so the foreground flow still genuinely errors out on "no verified performance events are
  // available" exactly as it always has -- proving the background refresh's own outcome is recorded
  // independently of whether the foreground attempt itself succeeds or fails.
  const{M,athletesHead}=bootInvite({
    completeEvidence:()=>Promise.resolve({ok:false,rows:0,errors:['pathway_standards: timed out after 12s — check your connection and try again.']}),
    readinessFor:()=>({ok:true,issues:[]}),
  });
  const generate=await clickGenerate(athletesHead);
  await generate.onclick().catch(()=>{});
  await new Promise(r=>setTimeout(r,10)); // let the fire-and-forget background refresh's own .then() land

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.ok(attempt,'a breadcrumb must exist after the attempt settles');
  assert.equal(attempt.outcome,'error','fixture sanity: this fixture (empty performance events) must still fail the foreground flow the same way it always has');
  assert.equal(attempt.backgroundRefreshOutcome,'errors',`breadcrumb must record the real background refresh outcome even when the foreground attempt errors, got ${attempt.backgroundRefreshOutcome}`);
  assert.ok(attempt.backgroundRefreshAt,'background refresh outcome must be timestamped');

  console.log('QR_REFS_SAVE_OUTCOME_INVITE_PASS',attempt.backgroundRefreshOutcome);
}

async function runInviteFailBefore(){
  const fixedBlock="try{M.swimmerPerformanceBM?.completeEvidence?.(a)?.then?.(c=>{try{writeAttempt({backgroundRefreshOutcome:c?.ok===false?'errors':'ok',backgroundRefreshAt:new Date().toISOString()});}catch{}},()=>{try{writeAttempt({backgroundRefreshOutcome:'threw',backgroundRefreshAt:new Date().toISOString()});}catch{}});}catch{}";
  const buggyBlock="try{M.swimmerPerformanceBM?.completeEvidence?.(a);}catch{}";
  assert.ok(inviteRealSrc.includes(fixedBlock),'test setup error: could not locate the fire-and-forget background-refresh breadcrumb write in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=inviteRealSrc.replace(fixedBlock,buggyBlock);
  assert.notEqual(buggySrc,inviteRealSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes('backgroundRefreshOutcome'),'test setup error: reverted source must not still reference backgroundRefreshOutcome');

  const tmpPath=invitePath.replace(/\.js$/,'.refssaveoutcomefailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const modalHost=makeNode('div'),athletesHead=makeNode('div');
    global.document={
      readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
      querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
    };
    global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
    Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
    global.localStorage=makeLocalStorage();
    global.QRCode=function FakeQRCode(){};
    global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
    global.MSOS4={
      ui:{},
      state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
      access:{role:()=>'owner'},
      store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
      currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
      swimmerTrainingBG:{candidateSessionsFor:()=>[],viewFor:()=>null},
      performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
      swimmerPerformanceBM:{
        completeEvidence:()=>Promise.resolve({ok:false,rows:0,errors:['x: timed out']}),
        readinessFor:()=>({ok:true,issues:[]}),
      },
    };
    global.fetch=()=>new Promise(()=>{});
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const M=global.MSOS4;
    await null;
    const genBtn=athletesHead._appended[0];
    genBtn.onclick();
    const wrap=modalHost._appended[0];
    const generate=wrap.querySelector('[data-bn-generate]');
    await generate.onclick().catch(()=>{});
    await new Promise(r=>setTimeout(r,10));
    const attempt=M.swimmerInviteBN.lastAttemptStatus();
    assert.ok(attempt,'fixture sanity: a breadcrumb must still exist (base attempt-tracking predates this diagnostic)');
    assert.equal(attempt.backgroundRefreshOutcome,undefined,'pre-fix source must never write backgroundRefreshOutcome -- confirms this test would have caught its absence');
    assert.equal(attempt.backgroundRefreshAt,undefined,'pre-fix source must never write backgroundRefreshAt -- confirms this test would have caught its absence');
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('QR_REFS_SAVE_OUTCOME_INVITE_FAILBEFORE_PASS');
}

(async()=>{
  await runOutcomeOk();
  await runOutcomeFailed();
  await runOutcomeTimeout();
  await runOutcomeError();
  await runPropagatesThroughPrepareAthlete();
  await runCiFailBefore();
  await runInviteWritesBackgroundRefreshOutcome();
  await runInviteFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  console.log('QR_REFS_SAVE_OUTCOME_DIAGNOSTICS_ALL_PASS');
})().catch(err=>{console.error(err);process.exit(1);});
