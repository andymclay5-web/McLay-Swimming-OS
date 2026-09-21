'use strict';
// Real coaching failure this addresses: Andy, 18 Sept 2026, confirming the QR-generate flow's overall ~3.5
// minute duration still needs fixing ("Yea that needs to be fixed"). Investigated which of
// engines/swimmer-performance-ci.js's completeEvidence() sequential network jobs is actually the slow one,
// checking directly against production Supabase rather than guessing: every job except pathway_standards/
// pathway_meets is scoped to one athlete (`athlete_id=eq.<id>`) or one organisation, and returns well under
// 100 rows each (Charlotte Murphy and Matthew Robertson's real per-table counts confirmed live: all <100).
// pathway_standards is the one job with NO scope at all -- `/rest/v1/pathway_standards?select=*` fetches the
// WHOLE table -- and it has 4406 real rows (confirmed live, 18 Sept). The shared pagination helper
// (engines/cloud-session.js's C.fetchPages / app.js's C.fetchPages) pages at 1000 rows by default, so this
// ONE job alone was up to 5 SEQUENTIAL network round trips, on top of the up to 6 other sequential jobs in
// the same loop -- a highly plausible dominant contributor to the overall slowness Andy is seeing.
//
// Fix: cloudPages() (swimmer-performance-ci.js) now forwards an optional pageSize through to the real
// fetchPages(), and the pathway_standards/pathway_meets jobs request X.REF_FETCH_PAGE_SIZE (8000, matching
// the existing maxRows ceiling -- comfortably above the live 4406 rows) instead of the default 1000. This
// changes NOTHING about which rows are fetched or merged (same data, same 8000-row ceiling) -- purely cuts
// the round-trip count for this one job from up to 5 down to 1.
//
// This test drives the REAL pagination algorithm (mirrored from cloud-session.js's C.fetchPages, the actual
// shipped implementation) against a fake pathway_standards table sized to match the real live row count, and
// proves: (1) the fixed code now fetches all 4406 real-shaped rows in exactly 1 round trip instead of 5;
// (2) the merged row set is byte-identical either way (no data loss/change from the larger page size);
// (3) an unrelated, already-small job (pathway_meets) is unaffected; (4) fail-before/pass-after against the
// exact pre-fix cloudPages() source, proving this test would have caught the real bottleneck.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const ciPath=path.join(repoRoot,'engines','swimmer-performance-ci.js');
const realSrc=fs.readFileSync(ciPath,'utf8');

const matthew={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',sex:'M',date_of_birth:'2010-06-18'};

// A synthetic pathway_standards table sized to match the REAL live row count (4406, confirmed via production
// Supabase 18 Sept 2026) -- large enough to be genuinely multi-page under the default 1000/page pagination,
// small enough to keep the test fast. Row shape is minimal (only what completeEvidence()/mergeRows/E.merge
// touch) since this test is about round-trip COUNT, not standard-matching semantics (already covered by
// tests/pathway-standards-reference-staleness-20260918.cjs and tests/swimmer-performance-ci.cjs).
const STANDARDS_ROW_COUNT=4406;
const fakeStandards=Array.from({length:STANDARDS_ROW_COUNT},(_,i)=>({id:`standard-${i}`,programme:'NZSC',active:true}));
const fakeMeets=Array.from({length:8},(_,i)=>({id:`meet-${i}`,programme:'NZSC'}));

const Evidence={
  course:()=>'',distance:()=>0,rowStroke:()=>'',stroke:v=>String(v||''),seconds:()=>NaN,points:()=>null,
  pbRows:()=>[],merge:(a,b)=>[...(a||[]),...(b||[])],
};

function makeLocalStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}

// Mirrors the REAL, shipped pagination algorithm (engines/cloud-session.js's C.fetchPages / app.js's
// C.fetchPages -- both identical): pages at `pageSize` (default 1000) up to `maxRows` (default 8000),
// stopping early once a short page comes back. Logging each iteration is what lets this test count real
// round trips rather than just checking the final row count (which would be identical either way).
function makeFetchPages(tables,callLog){
  return async(pathStr,pageSize=1000,maxRows=8000)=>{
    const table=pathStr.match(/\/rest\/v1\/([a-z_]+)\?/)?.[1]||'';
    const all=tables[table]||[];
    const rows=[];
    for(let from=0;from<maxRows;from+=pageSize){
      callLog.push({table,pageSize,from});
      const page=all.slice(from,from+pageSize);
      rows.push(...page);
      if(page.length<pageSize)break;
    }
    return rows;
  };
}

function bootFixture(fromPath=ciPath){
  global.localStorage=makeLocalStorage();
  const refData={pathway_standards:[],pathway_meets:[]}; // empty local cache -> both jobs always run (cold load)
  const callLog=[];
  global.MSOSEngines={Evidence};
  global.MSOS4={
    state:{settings:{pathwayCourse:'SCM'},athletes:[matthew]},
    refs:{get:key=>refData[key]||[],merge:(key,rows)=>{refData[key]=[...(refData[key]||[]),...rows];return refData[key];},save:async()=>true},
    currentSession:()=>({identity:{date:'2026-09-18',course:'SCM'}}),
    pathway:{defaultStandard:()=>true,paraClass:()=>''},
    performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
    ui:{},
    cloud:{ready:()=>true,fetchPages:makeFetchPages({pathway_standards:fakeStandards,pathway_meets:fakeMeets},callLog)},
    engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:new Map()},
  };
  delete require.cache[require.resolve(fromPath)];
  require(fromPath);
  return{X:global.MSOS4.swimmerPerformanceBM,callLog,refData};
}

async function run(){
  const{X,callLog,refData}=bootFixture();
  const result=await X.completeEvidence(matthew,()=>{});
  assert.ok(result.ok,`completeEvidence must succeed, got errors: ${JSON.stringify(result.errors)}`);

  const standardsCalls=callLog.filter(c=>c.table==='pathway_standards');
  assert.equal(standardsCalls.length,1,
    `the fixed pathway_standards fetch must complete in exactly 1 round trip (requesting REF_FETCH_PAGE_SIZE=${X.REF_FETCH_PAGE_SIZE} rows/page), got ${standardsCalls.length} -- this is the exact round-trip reduction meant to cut the real ~3.5 minute QR-generate duration`);
  assert.equal(standardsCalls[0].pageSize,X.REF_FETCH_PAGE_SIZE,'the pathway_standards job must request the larger page size, not the shared 1000-row default');
  assert.equal(refData.pathway_standards.length,STANDARDS_ROW_COUNT,'every one of the 4406 real-shaped rows must still be merged in -- the larger page size must not drop or duplicate data');

  const meetsCalls=callLog.filter(c=>c.table==='pathway_meets');
  assert.equal(meetsCalls.length,1,'pathway_meets (already small) must remain a single round trip -- no regression');
  assert.equal(refData.pathway_meets.length,8,'all pathway_meets rows must still be merged in');

  console.log('QR_EVIDENCE_PATHWAY_STANDARDS_PAGESIZE_PASS',`standards rows=${refData.pathway_standards.length} in ${standardsCalls.length} round trip(s)`);
}

async function runFailBefore(){
  // Fail-before: revert cloudPages() to the exact pre-fix source (ignores any pageSize argument entirely,
  // always falling back to the shared 1000-row default) and confirm the pathway_standards job reproduces the
  // real pre-fix shape: 5 sequential round trips for the same 4406 real-shaped rows -- the exact bottleneck
  // this fix removes.
  const fixedLine=`  async function cloudPages(path,pageSize){if(M.cloudSessionEngine?.fetchPages)return pageSize?M.cloudSessionEngine.fetchPages(path,pageSize):M.cloudSessionEngine.fetchPages(path);if(M.cloud?.ready?.()&&M.cloud?.fetchPages)return pageSize?M.cloud.fetchPages(path,pageSize):M.cloud.fetchPages(path);throw new Error('Connected swimmer evidence is unavailable.');}`;
  const buggyLine=`  async function cloudPages(path){if(M.cloudSessionEngine?.fetchPages)return M.cloudSessionEngine.fetchPages(path);if(M.cloud?.ready?.()&&M.cloud?.fetchPages)return M.cloud.fetchPages(path);throw new Error('Connected swimmer evidence is unavailable.');}`;
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed cloudPages() line -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=ciPath.replace(/\.js$/,'.pagesizefailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const{X,callLog,refData}=bootFixture(tmpPath);
    const result=await X.completeEvidence(matthew,()=>{});
    assert.ok(result.ok,`test setup: completeEvidence itself must not error in the buggy version, got: ${JSON.stringify(result.errors)}`);
    const standardsCalls=callLog.filter(c=>c.table==='pathway_standards');
    assert.equal(standardsCalls.length,5,
      `test setup: the buggy pre-fix source must reproduce the real 5-round-trip pagination for 4406 rows at the default 1000/page, got ${standardsCalls.length} -- confirms this test would have caught the exact bottleneck`);
    assert.equal(refData.pathway_standards.length,STANDARDS_ROW_COUNT,'sanity: the buggy version must still eventually fetch every row, just across far more round trips');
  }finally{
    fs.unlinkSync(tmpPath);
  }
  console.log('QR_EVIDENCE_PATHWAY_STANDARDS_PAGESIZE_FAILBEFORE_PASS');
}

(async()=>{
  await run();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
