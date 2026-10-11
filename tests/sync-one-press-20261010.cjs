'use strict';
// Andy, 10 Oct 2026: "we need to simplify the whole sync thing -- 1 push". His phone showed Guardian PASS but
// "This device NOT PASSED" and "Read-only cloud schema NOT PASSED", production sync OFF, 165 changes waiting:
// switching sync on took up to five separate buttons in the right order. Proves in a real browser, with a fake
// cloud (this sandbox cannot reach Supabase):
//  A. One press (Connection or Coach Hub) runs every gate in order, turns production sync on and sends the
//     waiting changes. No gate is skipped: the probe really runs, device acceptance is recorded for this build.
//  B. Not signed in -> a plain reason, sync stays off, nothing recorded.
//  C. Cloud check fails -> a plain reason with the failing table, sync stays off.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.cloud?.turnOnSync&&(window.MSOS4.state.guardian?.runs||[]).length,{timeout:25000});
    // B. Not signed in.
    const b=await page.evaluate(async()=>{const M=window.MSOS4;try{await M.cloud.turnOnSync();return'no error'}catch(e){return{msg:e.message,on:!!M.state.settings.cloudWritesEnabled,device:M.release.deviceAccepted()}}});
    assert.match(b.msg,/Sign in first/);assert.equal(b.on,false);assert.equal(b.device,false,'nothing recorded when not signed in');
    // Fake cloud: signed in, PostgREST accepts reads and writes; one table can be made to fail.
    await page.evaluate(()=>{const M=window.MSOS4,C=M.cloud;window.__writes=0;window.__failTable='';
      C.ready=()=>true;C.org=()=>'org-1';C.preflight=()=>({ok:true,errors:[],warnings:[],pending:(M.state.pending||[]).length,ready:true});
      C.fetch=async(url,opts={})=>{if(window.__failTable&&url.includes(`/rest/v1/${window.__failTable}?`))throw new Error('permission denied');if(opts.method&&opts.method!=='GET')window.__writes++;return[];};
      if(M.cloudSessionEngine)M.cloudSessionEngine.fetch=C.fetch;
      const s=M.parser.parse('MAIN SET\n4 x 100 free',{date:'2026-10-13',dayPart:'PM',squads:['National']});s.id='sync-one-test';M.store.putSession(M.state,s);M.store.save(M.state);window.__pendingBefore=(M.state.pending||[]).length;});
    // C. Cloud check fails.
    const c=await page.evaluate(async()=>{const M=window.MSOS4;window.__failTable='attendance';try{await M.cloud.turnOnSync();return'no error'}catch(e){return{msg:e.message,on:!!M.state.settings.cloudWritesEnabled}}finally{window.__failTable=''}});
    assert.match(c.msg,/Cloud check failed — sync stays off\. attendance: permission denied/);assert.equal(c.on,false);
    // A. One press on the Connection screen.
    await page.evaluate(()=>window.MSOS4.nav.show('connection'));await page.waitForSelector('#syncOneBtn');
    assert.match(await page.textContent('.sync-one'),/Cloud sync: OFF[\s\S]*Turn on cloud sync/);
    await page.tap('#syncOneBtn');
    await page.waitForFunction(()=>window.MSOS4.state.settings.cloudWritesEnabled===true,{timeout:10000});await page.waitForTimeout(400);
    const a=await page.evaluate(()=>{const M=window.MSOS4,R=M.release;return{device:R.deviceAccepted(),probe:R.cloudProbePassed(),canWrite:R.canWrite(),status:document.querySelector('#connectionStatus')?.textContent||'',card:document.querySelector('.sync-one')?.textContent||''};});
    assert.equal(a.device,true);assert.equal(a.probe,true,'the read-only cloud check really ran and passed');assert.equal(a.canWrite,true);
    assert.match(a.status,/Cloud sync is ON · \d+ changes? sent/,a.status);
    assert.match(a.card,/Cloud sync: ON[\s\S]*Send now/);
    assert.ok(await page.evaluate(()=>window.__pendingBefore)>0,'the test queued real changes');
    assert.ok(await page.evaluate(()=>window.__writes)>0,`waiting changes were sent straight away (${a.status})`);
    // Hub: the card is gone once sync is on; with sync off again its button turns it on in place.
    await page.evaluate(()=>{const M=window.MSOS4;M.state.settings.cloudWritesEnabled=false;M.nav.show('hub');});
    await page.waitForSelector('[data-hub-sync-btn]',{timeout:8000});
    await page.tap('[data-hub-sync-btn]');
    await page.waitForFunction(()=>window.MSOS4.state.settings.cloudWritesEnabled===true,{timeout:10000});
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'hub','turning sync on from the Hub does not navigate away');
    await page.waitForFunction(()=>!document.querySelector('[data-hub-sync]'),{timeout:5000});
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('SYNC_ONE_PRESS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
