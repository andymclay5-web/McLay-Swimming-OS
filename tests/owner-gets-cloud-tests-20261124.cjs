'use strict';
// 24 Nov 2026 (Andy: "have we got these t400 free times locked in yet" -- 34 T400s from the paper roll, entered in the
// cloud from his photo). The owner's phone never took tests from the cloud, so they would not have reached it. Proves the
// owner's phone adds cloud tests it doesn't have, leaves the ones it has exactly as they are, doesn't add a second copy
// of the same swimmer/test/date/time under another id, and the targets recalculate.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.cloud?.pullTeamData,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,T='test-type-t400-free-ebf6466a7d8a';
    M.access.role=()=>'owner';C.ready=()=>true;C.org=()=>'9d40beff-e632-414d-9daa-7ee78104ad2a';
    M.state.trainingTestResults=[{id:'t1',athlete_id:'mr',test_type_id:T,result_seconds:300,result_date:'2026-06-01'},{id:'t3-local',athlete_id:'zak',test_type_id:T,result_seconds:351.06,result_date:'2026-09-20'}];
    const rev=M.state.settings.evidenceRevision||0;
    C.fetch=async path=>{if(/training_test_results/.test(path))return[{id:'t1',athlete_id:'mr',test_type_id:T,result_seconds:'299',result_date:'2026-06-01'},{id:'t2',athlete_id:'ruby',test_type_id:T,result_seconds:'394.01',result_date:'2026-09-20',pool_course:'SCM'},{id:'t3-cloud',athlete_id:'zak',test_type_id:T,result_seconds:'351.06',result_date:'2026-09-20'}];return[]};
    const out=await C.pullTeamData({tests:true});
    return{tests:out.tests,rows:M.state.trainingTestResults.map(x=>[x.id,Number(x.result_seconds)]),revUp:(M.state.settings.evidenceRevision||0)>rev};});
  assert.deepEqual(r.rows,[['t1',300],['t3-local',351.06],['t2',394.01]],'only the missing test is added; the phone\'s own are unchanged: '+JSON.stringify(r.rows));
  assert.equal(r.tests,1);assert.ok(r.revUp,'targets recalculate');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('OWNER_GETS_CLOUD_TESTS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
