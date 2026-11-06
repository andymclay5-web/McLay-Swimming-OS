'use strict';
// Andy, Sat 7 Nov 2026: his phone sent nothing from 9:29 pm Fri until he opened Guardian at 8:07 am ("mine says guardian
// passed"); Kaleb's Fri PM session never left his phone. Guardian ran once, just after the app opened, and a check about
// the phone's data at that moment ("Selected session identity resolves") failed -- every send was then held back until
// the app was fully restarted. Proves:
//  1. A failed device-data check does not switch sync off (a real build failure still does -- cloud-sync-survives-build).
//  2. The next send re-runs Guardian, so sending carries on by itself once it passes.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&document.body.dataset.guardian,{timeout:20000});
    const r=await page.evaluate(async()=>{const M=window.MSOS4,s=M.state.settings,U=M.util,old='v4-previous-build';
      s.cloudWritesEnabled=true;s.cloudWriteBuild=old;s.cutoverBuild=old;s.guardianCutoverUnlocked=true;s.deviceAcceptedBuild=old;s.cloudWritesSuspended=null;
      s.cloudSchemaProbe={build:old,at:'x',schemaDigest:U.hash(JSON.stringify(M.cloud.SCHEMA_CONTRACT||{})),tables:[...(M.cloud.CORE_WRITE_TABLES||[])],columns:{}};
      M.state.guardian.runs=[{build:old,ok:true,tests:[]}];M.release.ensure();
      // the app opened before the selected session had loaded
      M.state.guardian.runs.push({build:M.BUILD,ok:false,tests:[{name:'Selected session identity resolves',ok:false,detail:'session-kaleb → missing'}]});
      M.release.ensure();const after={enabled:s.cloudWritesEnabled,sus:s.cloudWritesSuspended||null,current:M.release.guardianCurrent()};
      M.cloud._guardianRecheckAt=0;await M.cloud.flushOnce();
      const rechecked={current:M.release.guardianCurrent(),last:M.state.guardian.runs.at(-1).ok,enabled:s.cloudWritesEnabled};
      const throttled=M.cloud.recheckGuardian();
      return{after,rechecked,throttled};});
    assert.equal(r.after.enabled,true,`a device-data check must not switch sync off: ${JSON.stringify(r)}`);assert.equal(r.after.sus,null);assert.equal(r.after.current,false);
    assert.deepEqual(r.rechecked,{current:true,last:true,enabled:true},'the next send re-runs Guardian and it passes');
    assert.equal(r.throttled,false,'no re-run once current');
    assert.deepEqual(errors,[],errors.join('\n'));console.log('GUARDIAN_RECHECK_BEFORE_SEND_PASS');
  }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
