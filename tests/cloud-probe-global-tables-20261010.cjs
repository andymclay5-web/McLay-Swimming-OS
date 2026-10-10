'use strict';
// 10 Oct 2026, Andy's phone: Guardian PASS and device accepted, but "Current-build read-only production
// schema probe has not passed" -- production sync could never be switched on. Root cause: C.probe filtered
// EVERY core table by organisation_id, but world_aquatics_base_times and pathway_standards are shared
// reference tables with no organisation_id column (confirmed against the live project), so PostgREST rejects
// that read and the probe fails every time.
//
// Proves in a real browser: with a fake PostgREST that rejects an organisation_id filter on those two tables
// (exactly as the real one does) and accepts everything else, the probe passes and is recorded; and the
// Guardian screen labels a result from an older build instead of showing it as a current PASS.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.cloud?.probe,{timeout:20000});
    const r=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,urls=[];
      const realPre=C.preflight,realFetch=C.fetch;
      C.preflight=()=>({ok:true,errors:[],warnings:[],pending:0,ready:true,writesEnabled:false});
      C.org=C.org||(()=>'org-1');const realOrg=C.org;C.org=()=>'org-1';
      C.fetch=async url=>{urls.push(url);if(/\/(world_aquatics_base_times|pathway_standards)\?/.test(url)&&/organisation_id=eq\./.test(url))throw new Error('400 column world_aquatics_base_times.organisation_id does not exist');return[];};
      try{const out=await C.probe();return{ok:out.ok,errors:out.probeErrors,tables:out.tables.length,want:C.CORE_WRITE_TABLES.length,passed:M.release.cloudProbePassed(),globalUrls:urls.filter(u=>/world_aquatics|pathway_standards/.test(u))};}
      finally{C.preflight=realPre;C.fetch=realFetch;C.org=realOrg;}});
    assert.deepEqual(r.errors,{},`probe errors: ${JSON.stringify(r.errors)}`);
    assert.equal(r.ok,true);assert.equal(r.tables,r.want);assert.equal(r.passed,true,'a passing probe must be recorded for this build');
    for(const u of r.globalUrls)assert.doesNotMatch(u,/organisation_id=eq\./,'shared reference tables must not be filtered by organisation');

    // Guardian screen: an older build's PASS is labelled, not shown as current.
    const g=await page.evaluate(()=>{const M=window.MSOS4;M.state.guardian.runs.push({ok:true,passed:4,total:4,build:'v4-old-build',tests:[]});M.state.settings.view='guardian';M.ui.renderGuardian();return document.querySelector('#guardianView').innerText;});
    assert.match(g,/NOT RUN ON THIS BUILD[\s\S]*v4-old-build[\s\S]*Run again/);
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('CLOUD_PROBE_GLOBAL_TABLES_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
