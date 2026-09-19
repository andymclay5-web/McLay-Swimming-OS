'use strict';
// Real coaching failure this instruments (NOT a fix -- the actual freeze cause is still unknown): the 19
// Sept concurrency-guard fix (qr-generate-concurrent-attempt-guard-20260919.cjs) did not hold. Andy reported
// the exact same "Checking swimmer evidence... (5/5 * training_test_types)" freeze recurring on that build,
// then confirmed two facts that rule the concurrency fix out as the cause: (1) it now happens for EVERY
// swimmer he tries, not just Matthew Robertson, and (2) it survives a full app reload (a fresh page load has
// no leftover attempt for a newer one to collide with). Separately, Andy checked Chrome's own per-site
// storage usage for this app and found 223MB stored, for an app whose real per-athlete evidence should be
// single-digit-to-low-double-digit MB -- a strong sign something local has grown unbounded, but there is no
// safe way to confirm what without risking real, possibly-unsynced coaching data (Andy has marked very few
// sessions "Finished" while chasing this bug), so no storage clear is being attempted.
//
// This adds two purely-observational diagnostics, neither of which changes behavior or blocks the flow if
// unsupported/unavailable:
// (1) engines/swimmer-performance-ci.js's completeEvidence() job loop now fires two extra, non-indexed onJob
//     checkpoints per job -- immediately after that job's network fetch resolves, and immediately after its
//     merge into M.state completes -- each carrying the in-memory row count for that job's own state array,
//     embedded in the checkpoint name itself (e.g. "training_test_types_fetched_rows10_existing4821"). If a
//     future freeze's breadcrumb shows the "fetched" checkpoint but never the "merged" one, the hang is
//     inside mergeRows (R.merge/E.merge) specifically -- and the "existing" count tells us whether that
//     array was already large before this run even started.
// (2) engines/swimmer-invite-bn.js's Generate handler now takes one read-only navigator.storage.estimate()
//     snapshot, plus the in-memory length of every evidence/reference array the flow touches, and writes both
//     to the msos_qr_last_attempt breadcrumb before any network activity begins -- so even a freeze that
//     never reaches a single evidence job still leaves behind real numbers, in MB and row counts, instead of
//     leaving "is something bloated" as pure speculation from a Chrome settings screen alone.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const ciPath=path.join(repoRoot,'engines','swimmer-performance-ci.js');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const ciRealSrc=fs.readFileSync(ciPath,'utf8');
const inviteRealSrc=fs.readFileSync(invitePath,'utf8');

const athlete={id:'ath-storage-diag-fixture',full_name:'Storage Diagnostics Fixture Swimmer',date_of_birth:'2010-07-01',
  current_s_class:'',current_sb_class:'',current_sm_class:''};

// --- Part 1: completeEvidence()'s per-job fetched/merged row-count checkpoints -----------------------------
function bootCi(existingRows){
  global.MSOSEngines={Evidence:{
    course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
    seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
  }};
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes:[athlete],resultsPbBoard:existingRows||[]},
    refs:{get:()=>[],merge:()=>{},save:async()=>{}},
    currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
    pathway:{defaultStandard:()=>true},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},
    cloud:{ready:()=>true,fetch:()=>Promise.resolve([{id:'r1'},{id:'r2'},{id:'r3'}])},
    engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
    cloudSessionEngine:{fetchPages:()=>Promise.resolve([{id:'r1'},{id:'r2'},{id:'r3'}])}, // 3 fresh rows every job
  };
  delete require.cache[require.resolve(ciPath)];
  delete global.MSOS4.swimmerPerformanceBM;
  require(ciPath);
  return global.MSOS4.swimmerPerformanceBM;
}

async function runFetchedMergedCheckpoints(){
  // A pre-existing 4821-row results_pb_board (simulating a bloated local cache) so the "existing" figure in
  // the checkpoint name is provably non-zero and provably real, not a coincidental default.
  const existing=Array.from({length:4821},(_,i)=>({id:`old-${i}`}));
  const X=bootCi(existing);
  const calls=[];
  const result=await Promise.race([
    X.completeEvidence(athlete,(name)=>calls.push(name)),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: completeEvidence did not settle')),2000)),
  ]);
  assert.equal(result.ok,true,'fixture sanity: every job resolves fast with real rows, so completion must be ok');

  const fetchedCall=calls.find(n=>n.startsWith('results_pb_board_fetched_'));
  assert.ok(fetchedCall,`expected a results_pb_board_fetched_... checkpoint, got ${JSON.stringify(calls)}`);
  assert.equal(fetchedCall,'results_pb_board_fetched_rows3_existing4821',
    `fetched checkpoint must name the real fetched-row count (3) and the real pre-merge existing count (4821), got ${fetchedCall}`);

  const mergedCall=calls.find(n=>n.startsWith('results_pb_board_merged_'));
  assert.ok(mergedCall,`expected a results_pb_board_merged_... checkpoint, got ${JSON.stringify(calls)}`);
  assert.equal(mergedCall,'results_pb_board_merged_now4824',
    `merged checkpoint must name the real post-merge array length (4821 existing + 3 new = 4824), got ${mergedCall}`);

  // Ordering: fetched must come before merged, and both must come after the job's own plain-named start call.
  const startIdx=calls.indexOf('results_pb_board'),fetchedIdx=calls.indexOf(fetchedCall),mergedIdx=calls.indexOf(mergedCall);
  assert.ok(startIdx>=0&&startIdx<fetchedIdx&&fetchedIdx<mergedIdx,
    `checkpoints must fire in order: start -> fetched -> merged, got indices ${JSON.stringify({startIdx,fetchedIdx,mergedIdx})}`);

  console.log('QR_STORAGE_DIAG_CHECKPOINTS_PASS',fetchedCall,mergedCall);
}

async function runCiFailBefore(){
  const fixedLoop="      try{\n        const beforeLen=Array.isArray(M.state[sk])?M.state[sk].length:0;\n        const fetched=await withTimeout(cloudPages(path,pageSize),X.EVIDENCE_JOB_TIMEOUT_MS,rk);\n        try{onJob?.(`${rk}_fetched_rows${Array.isArray(fetched)?fetched.length:'x'}_existing${beforeLen}`);}catch{}\n        added+=await mergeRows(rk,sk,fetched);\n        try{onJob?.(`${rk}_merged_now${Array.isArray(M.state[sk])?M.state[sk].length:'x'}`);}catch{}\n        if(rk==='pathway_standards'||rk==='pathway_meets')markRefSynced(rk);\n      }catch(err){errors.push(`${rk}: ${err?.message||err}`)}";
  const buggyLoop="      try{added+=await mergeRows(rk,sk,await withTimeout(cloudPages(path,pageSize),X.EVIDENCE_JOB_TIMEOUT_MS,rk));if(rk==='pathway_standards'||rk==='pathway_meets')markRefSynced(rk);}catch(err){errors.push(`${rk}: ${err?.message||err}`)}";
  assert.ok(ciRealSrc.includes(fixedLoop),'test setup error: could not locate the fixed per-job fetched/merged checkpoint block -- its wording changed in a way this test does not expect');
  const buggySrc=ciRealSrc.replace(fixedLoop,buggyLoop);
  assert.notEqual(buggySrc,ciRealSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.storagediagfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    global.MSOSEngines={Evidence:{course:()=>'',distance:()=>0,rowStroke:()=>'',stroke:v=>String(v||''),seconds:()=>0,points:()=>null,pbRows:()=>[],merge:(a,b)=>[...(a||[]),...(b||[])]}};
    global.MSOS4={
      state:{settings:{pathwayCourse:'SCM'},athletes:[athlete],resultsPbBoard:[]},
      refs:{get:()=>[],merge:()=>{},save:async()=>{}},
      currentSession:()=>({identity:{date:'2026-09-19',course:'SCM'}}),
      pathway:{defaultStandard:()=>true},
      performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
      ui:{},
      cloud:{ready:()=>true,fetch:()=>Promise.resolve([{id:'r1'}])},
      engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
      cloudSessionEngine:{fetchPages:()=>Promise.resolve([{id:'r1'}])},
    };
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const buggyX=global.MSOS4.swimmerPerformanceBM;
    const buggyCalls=[];
    await buggyX.completeEvidence(athlete,(name)=>buggyCalls.push(name));
    assert.ok(!buggyCalls.some(n=>n.includes('_fetched_')||n.includes('_merged_')),
      `pre-fix source must NOT report any fetched/merged checkpoints -- confirms this test would have caught their absence, got ${JSON.stringify(buggyCalls)}`);
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('QR_STORAGE_DIAG_CHECKPOINTS_FAILBEFORE_PASS');
}

// --- Part 2: the Generate handler's storage-estimate + state-count breadcrumb snapshot ----------------------
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

function bootInvite({navigatorValue}={}){
  const modalHost=makeNode('div'),athletesHead=makeNode('div');
  global.document={
    readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
    querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
  };
  global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
  Object.defineProperty(global,'navigator',{value:navigatorValue||{},configurable:true});
  global.localStorage=makeLocalStorage();
  global.QRCode=function FakeQRCode(){};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[{id:'c1'},{id:'c2'}],meetEntries:[],
      trainingTestResults:[{id:'t1'}],trainingTestTypes:[{id:'tt1'}],resultsPbBoard:[],coachResults:[],resultsEventHistory:[],
      pathwayStandards:Array.from({length:4406},(_,i)=>({id:`s${i}`})),pathwayMeets:[]},
    access:{role:()=>'owner'},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
    currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
    swimmerTrainingBG:{
      projectionFor:()=>({date:'2026-09-19',squad:'Development',course:'SCM',title:'Threshold set',metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},
        blocks:[{id:'blk-1',label:'Main set',metres:800,items:[{id:'item-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]}),
      viewFor:()=>null,candidateSessionsFor:()=>[],
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[{course:'SCM',distance:100,stroke:'Freestyle',seconds:60.5,points:500,ladder:{tracks:{SCM:[],LCM:[]},next:null},raw:{}}]})},
    // Stuck evidence check -- we only need the pre-network diagnostic snapshot, never the flow's own settling.
    swimmerPerformanceBM:{prepareAthlete:()=>new Promise(()=>{}),readinessFor:()=>({ok:true,issues:[]})},
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

async function runStorageEstimateRecorded(){
  const{M,athletesHead}=bootInvite({navigatorValue:{storage:{estimate:async()=>({usage:233832448,quota:1073741824})},clipboard:{writeText:async()=>{}}}});
  const generate=await clickGenerate(athletesHead);
  const clickPromise=generate.onclick().catch(()=>{}); // prepareAthlete never resolves -- inspect mid-flight
  await new Promise(r=>setTimeout(r,20));

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.ok(attempt,'a breadcrumb must already exist mid-flight, before any evidence job runs');
  assert.equal(attempt.diagStorageUsageMB,223,`233832448 bytes must round to 223MB (matches the real 223MB Andy saw in Chrome), got ${attempt.diagStorageUsageMB}`);
  assert.equal(attempt.diagStorageQuotaMB,1024,`1073741824 bytes must round to 1024MB, got ${attempt.diagStorageQuotaMB}`);
  assert.ok(attempt.diagStateCounts,'breadcrumb must carry the in-memory state-array length snapshot');
  assert.equal(attempt.diagStateCounts.pathwayStandards,4406,`the fixture's pathwayStandards array is 4406 rows -- the real live count confirmed 18 Sept -- and must be reported exactly, got ${attempt.diagStateCounts.pathwayStandards}`);
  assert.equal(attempt.diagStateCounts.captures,2,`captures length must be reported exactly, got ${attempt.diagStateCounts.captures}`);
  assert.equal(attempt.diagStateCounts.trainingTestTypes,1,`trainingTestTypes length must be reported exactly, got ${attempt.diagStateCounts.trainingTestTypes}`);

  clickPromise.catch(()=>{}); // never resolves in this fixture -- deliberately not awaited further
  console.log('QR_STORAGE_DIAG_ESTIMATE_PASS',JSON.stringify({usage:attempt.diagStorageUsageMB,quota:attempt.diagStorageQuotaMB}));
}

async function runNoStorageApiIsGraceful(){
  // Older/unsupported browser -- no navigator.storage at all. Must never throw or block the flow; the
  // breadcrumb should record nulls rather than silently omitting the fields or crashing mid-attempt.
  const{M,athletesHead}=bootInvite({navigatorValue:{clipboard:{writeText:async()=>{}}}});
  const generate=await clickGenerate(athletesHead);
  const clickPromise=generate.onclick().catch(()=>{});
  await new Promise(r=>setTimeout(r,20));

  const attempt=M.swimmerInviteBN.lastAttemptStatus();
  assert.ok(attempt,'a breadcrumb must still exist even with no navigator.storage API present');
  assert.equal(attempt.diagStorageUsageMB,null,'diagStorageUsageMB must be recorded as null, not omitted or thrown, when navigator.storage is unavailable');
  assert.equal(attempt.diagStorageQuotaMB,null,'diagStorageQuotaMB must be recorded as null, not omitted or thrown, when navigator.storage is unavailable');
  assert.ok(attempt.diagStateCounts,'the state-count half of the snapshot must still be recorded even when the storage-estimate half is unavailable');

  clickPromise.catch(()=>{});
  console.log('QR_STORAGE_DIAG_NO_API_GRACEFUL_PASS');
}

async function runInviteFailBefore(){
  const fixedBlock="      try{\n        const est=await(navigator.storage?.estimate?.()||Promise.resolve(null));\n        const diagStorageUsageMB=est&&Number.isFinite(est.usage)?Math.round(est.usage/1048576*10)/10:null;\n        const diagStorageQuotaMB=est&&Number.isFinite(est.quota)?Math.round(est.quota/1048576*10)/10:null;\n        const diagStateCounts={trainingTestTypes:(M.state?.trainingTestTypes||[]).length,trainingTestResults:(M.state?.trainingTestResults||[]).length,resultsPbBoard:(M.state?.resultsPbBoard||[]).length,coachResults:(M.state?.coachResults||[]).length,resultsEventHistory:(M.state?.resultsEventHistory||[]).length,pathwayStandards:(M.state?.pathwayStandards||[]).length,pathwayMeets:(M.state?.pathwayMeets||[]).length,captures:(M.state?.captures||[]).length,athletes:(M.state?.athletes||[]).length,sessions:(M.state?.sessions||[]).length};\n        if(!gen.cancelled)writeAttempt({diagStorageUsageMB,diagStorageQuotaMB,diagStateCounts});\n      }catch{}\n      if(gen.cancelled)return;\n";
  assert.ok(inviteRealSrc.includes(fixedBlock),'test setup error: could not locate the storage-diagnostics snapshot block in the real source -- its wording changed in a way this test does not expect');
  const buggySrc=inviteRealSrc.replace(fixedBlock,'');
  assert.notEqual(buggySrc,inviteRealSrc,'test setup error: could not construct the reverted buggy source');
  assert.ok(!buggySrc.includes('diagStorageUsageMB'),'test setup error: reverted source must not still reference diagStorageUsageMB');

  const tmpPath=invitePath.replace(/\.js$/,'.storagediagfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const modalHost=makeNode('div'),athletesHead=makeNode('div');
    global.document={
      readyState:'complete',body:makeNode('body'),addEventListener(){},createElement:tag=>makeNode(tag),
      querySelector(sel){if(sel==='#modalHost')return modalHost;if(sel==='#athletesView .cn-owner-actions')return athletesHead;return null;},
    };
    global.window=global;global.location={href:'https://example.test/app.html'};global.requestAnimationFrame=fn=>fn();
    Object.defineProperty(global,'navigator',{value:{storage:{estimate:async()=>({usage:233832448,quota:1073741824})}},configurable:true});
    global.localStorage=makeLocalStorage();
    global.QRCode=function FakeQRCode(){};
    global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
    global.MSOS4={
      ui:{},
      state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],captures:[],meetEntries:[],trainingTestResults:[]},
      access:{role:()=>'owner'},
      store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'tok'})},
      currentSession:()=>({id:'sess-1',identity:{date:'2026-09-19',slot:'AM',course:'SCM'},title:'Threshold set',finish:false}),
      swimmerTrainingBG:{projectionFor:()=>({date:'2026-09-19',squad:'Development',course:'SCM',title:'Threshold set',metres:{recorded:4000},delivery:'',zones:{},strokes:{},tags:{},blocks:[]}),viewFor:()=>null,candidateSessionsFor:()=>[]},
      performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
      swimmerPerformanceBM:{prepareAthlete:()=>new Promise(()=>{}),readinessFor:()=>({ok:true,issues:[]})},
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
    const clickPromise=generate.onclick().catch(()=>{});
    await new Promise(r=>setTimeout(r,20));
    const attempt=M.swimmerInviteBN.lastAttemptStatus();
    assert.ok(attempt,'fixture sanity: a breadcrumb must still exist (the base attempt-tracking predates this diagnostic)');
    assert.equal(attempt.diagStorageUsageMB,undefined,'pre-fix source must never write diagStorageUsageMB -- confirms this test would have caught its absence');
    assert.equal(attempt.diagStateCounts,undefined,'pre-fix source must never write diagStateCounts -- confirms this test would have caught its absence');
    clickPromise.catch(()=>{});
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('QR_STORAGE_DIAG_INVITE_FAILBEFORE_PASS');
}

(async()=>{
  await runFetchedMergedCheckpoints();
  await runCiFailBefore();
  await runStorageEstimateRecorded();
  await runNoStorageApiIsGraceful();
  await runInviteFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0); // the mid-flight fixtures deliberately leave a never-resolving prepareAthlete() in flight
})().catch(err=>{console.error(err);process.exit(1);});
