'use strict';
// 10 Oct 2026. Andy's phone diagnostics: build v4-season-base-weeks-20261010, "writes": false, 636 changes
// pending; the cloud's newest session was from 6 Sep. Root cause: app.js's release gate wiped cloud-write
// permission on EVERY build change ("Write permission NEVER survives a build change"), so with frequent
// uploads sync sat off for a month. Andy chose: keep sync on across updates, switch it off automatically
// only if the new build fails its checks.
//
// Proves in a real browser against the real app:
//  1. Sync enabled on a previous build (device accepted, schema probed) stays enabled on the new build;
//     acceptance and an unchanged schema probe carry over; canWrite() is true once this build's Guardian
//     has passed.
//  2. A Guardian FAIL on the new build switches sync off and records why.
//  3. A changed schema contract does NOT carry the old probe (writes wait for a new probe).
//  4. Coach Hub warns when sync is off, with the pending count, and links to the sync screen; no warning
//     when sync is on and current.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&document.body.dataset.guardian,{timeout:20000});
    const setup=()=>page.evaluate(({digestOverride})=>{const M=window.MSOS4,s=M.state.settings,U=M.util,old='v4-previous-build';
      s.cloudWritesEnabled=true;s.cloudWriteBuild=old;s.cutoverBuild=old;s.guardianCutoverUnlocked=true;s.deviceAcceptedBuild=old;s.cloudWritesSuspended=null;
      s.cloudSchemaProbe={build:old,at:'x',schemaDigest:digestOverride||U.hash(JSON.stringify(M.cloud.SCHEMA_CONTRACT||{})),tables:[...(M.cloud.CORE_WRITE_TABLES||[])],columns:{}};
      M.state.guardian.runs=[{build:old,ok:true,tests:[]}];},{digestOverride:null});

    // 1: carry over
    await setup();
    const r1=await page.evaluate(()=>{const M=window.MSOS4,s=M.state.settings;M.release.ensure();const a={enabled:s.cloudWritesEnabled,writeBuild:s.cloudWriteBuild===M.BUILD,device:M.release.deviceAccepted(),probe:M.release.cloudProbePassed(),carried:s.cloudWritesCarriedFrom};
      M.state.guardian.runs.push({build:M.BUILD,ok:true,tests:[]});a.guardian=M.release.guardianCurrent();return a;});
    assert.deepEqual({...r1},{enabled:true,writeBuild:true,device:true,probe:true,carried:'v4-previous-build',guardian:true},'sync on a previous build must stay on, with acceptance and probe carried');

    // 2: guardian fail switches it off
    const r2=await page.evaluate(()=>{const M=window.MSOS4,s=M.state.settings;M.state.guardian.runs.push({build:M.BUILD,ok:false,tests:[{name:'Board renders',ok:false}]});M.release.ensure();return{enabled:s.cloudWritesEnabled,sus:s.cloudWritesSuspended,canWrite:M.release.canWrite()};});
    assert.equal(r2.enabled,false,'a Guardian failure on the new build must switch sync off');
    assert.equal(r2.canWrite,false);
    assert.match(r2.sus.reason,/Guardian failed/);assert.deepEqual(r2.sus.failed,['Board renders']);

    // 3: schema change -> probe not carried
    await page.evaluate(()=>{const M=window.MSOS4,s=M.state.settings,old='v4-previous-build';s.cloudWritesEnabled=true;s.cloudWriteBuild=old;s.cutoverBuild=old;s.deviceAcceptedBuild=old;s.cloudSchemaProbe={build:old,schemaDigest:'different',tables:[...(M.cloud.CORE_WRITE_TABLES||[])],columns:{}};M.state.guardian.runs=[{build:old,ok:true,tests:[]}];M.release.ensure();});
    assert.equal(await page.evaluate(()=>window.MSOS4.release.cloudProbePassed()),false,'a changed schema contract must not inherit the old probe');

    // 4: Hub banner
    await page.evaluate(()=>{const s=window.MSOS4.state.settings;s.cloudWritesEnabled=false;s.cloudWritesSuspended=null;window.MSOS4.state.pending=[{table:'sessions',action:'upsert',record:{id:'x'}},{table:'attendance',action:'upsert',record:{id:'y'}}];});
    await page.tap('[data-nav="hub"]');await page.waitForSelector('[data-hub-sync]');
    const banner=await page.evaluate(()=>document.querySelector('[data-hub-sync]').innerText);
    assert.match(banner,/Cloud sync is off[\s\S]*2 changes waiting/);
    // 10 Oct 2026 (one-press sync): the button now turns sync on right here; not signed in -> plain reason in the card.
    await page.tap('[data-hub-sync-btn]');await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'hub','the Hub button acts in place');
    assert.match(await page.evaluate(()=>document.querySelector('[data-hub-sync-status]')?.textContent||''),/Sign in first/,'not signed in -> says so in the card');
    await page.evaluate(()=>{const M=window.MSOS4,s=M.state.settings;s.cloudWritesEnabled=true;s.cloudWriteBuild=M.BUILD;M.state.guardian.runs.push({build:M.BUILD,ok:true,tests:[]});});
    await page.tap('[data-nav="hub"]');await page.waitForTimeout(600);
    assert.equal(await page.$('[data-hub-sync]'),null,'no warning when sync is on and this build has passed Guardian');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('CLOUD_SYNC_SURVIVES_BUILD_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
