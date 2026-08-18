'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const BUILD='v4-poolside-core-20260819b-releasegate';
const ATHLETE_ID='predeploy-browser-athlete';
const NOTE='Predeploy poolside note';

async function appSnapshot(page){
  return page.evaluate(()=>{
    const M=window.MSOS4,s=M.currentSession?.(),result=M.guardian.run();
    return {
      build:M.BUILD,
      releaseReady:M.release.softwareReady(),
      guardian:{ok:result.ok,passed:result.passed,total:result.total,build:result.build},
      sessionId:s?.id||'',
      sessionTotal:s?M.session.total(s):0,
      sessions:Object.keys(M.state.canonicalSessions||{}).length,
      captures:(M.state.captures||[]).map(x=>({sessionId:x.session_id,type:x.capture_type,text:x.text_content,athleteIds:x.athlete_ids||[]})),
      t400:(M.state.trainingTestResults||[]).map(x=>({athleteId:x.athlete_id,seconds:x.result_seconds,sessionId:x.session_id})),
      width:{inner:window.innerWidth,scroll:document.documentElement.scrollWidth}
    };
  });
}

(async()=>{
  const launch={headless:true,args:['--no-sandbox']};
  if(process.env.MSOS4_CHROMIUM_PATH)launch.executablePath=process.env.MSOS4_CHROMIUM_PATH;
  const browser=await chromium.launch(launch);
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const pageErrors=[];
  const consoleErrors=[];
  const badResponses=[];
  page.on('pageerror',error=>pageErrors.push(error.stack||error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  page.on('response',response=>{if(response.url().startsWith(BASE)&&response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`)});

  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.state&&document.body.dataset.guardian==='pass');

    const manifest=await page.evaluate(async()=>{
      const response=await fetch('manifest.webmanifest');
      return {status:response.status,json:await response.json()};
    });
    assert.equal(manifest.status,200,'manifest did not load');
    assert.equal(manifest.json.name,'McLay Swimming OS — Version 4','install manifest is not Version 4');
    assert.equal(manifest.json.short_name,'McLay Swim V4','install short name is not Version 4');

    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.state&&document.body.dataset.guardian==='pass'&&navigator.serviceWorker.controller);
    const worker=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('service worker build response timed out')),3000);
      const receive=event=>{
        if(event.data?.type!=='MSOS_BUILD')return;
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('message',receive);
        resolve(event.data);
      };
      navigator.serviceWorker.addEventListener('message',receive);
      navigator.serviceWorker.controller.postMessage({type:'MSOS_BUILD'});
    }));
    assert.equal(worker.build,BUILD,'service worker and application builds differ');

    let snapshot=await appSnapshot(page);
    assert.equal(snapshot.build,BUILD,'unexpected shipping build');
    assert.equal(snapshot.releaseReady,true,'final shipping build is not software-attested');
    assert.deepEqual(snapshot.guardian,{ok:true,passed:73,total:73,build:BUILD},'browser Guardian is not current and complete');
    assert.ok(snapshot.width.scroll<=snapshot.width.inner+1,`fresh phone page overflows: ${snapshot.width.scroll}px > ${snapshot.width.inner}px`);

    await page.click('#newSessionBtn');
    await page.waitForSelector('#coreRaw');
    await page.fill('#coreRaw','WARM-UP\n4 x 100 Freestyle\n4 x 50 Kick\n\n600m');
    await page.waitForFunction(()=>document.querySelector('#coreCreate')?.disabled===false);
    await page.click('#coreCreate');
    await page.waitForFunction(()=>window.MSOS4?.currentSession?.()&&window.MSOS4.session.total(window.MSOS4.currentSession())===600);
    snapshot=await appSnapshot(page);
    assert.equal(snapshot.sessionTotal,600,'canonical session total changed during browser intake');
    assert.ok(snapshot.width.scroll<=snapshot.width.inner+1,`Board overflows at phone width: ${snapshot.width.scroll}px > ${snapshot.width.inner}px`);

    await page.evaluate(athleteId=>{
      const M=window.MSOS4,s=M.currentSession();
      M.state.athletes.push({id:athleteId,full_name:'Predeploy Swimmer',squad:'National',active:true});
      M.state.attendance.push({session_id:s.id,athlete_id:athleteId,status:'present',updated_at:M.util.now()});
      M.store.save(M.state);
      M.ui.renderCurrent();
    },ATHLETE_ID);

    await page.click('[data-nav="times"]');
    await page.waitForSelector(`#v4ManualAthlete option[value="${ATHLETE_ID}"]`);
    await page.locator('details:has(#v4ManualAthlete) summary').click();
    await page.selectOption('#v4ManualAthlete',ATHLETE_ID);
    await page.fill('#v4ManualTime','4:29.0');
    await page.click('#v4ManualSave');
    await page.waitForFunction(athleteId=>window.MSOS4.state.trainingTestResults.some(x=>x.athlete_id===athleteId&&x.result_seconds===269),ATHLETE_ID);
    snapshot=await appSnapshot(page);
    assert.ok(snapshot.width.scroll<=snapshot.width.inner+1,`Times overflows at phone width: ${snapshot.width.scroll}px > ${snapshot.width.inner}px`);

    await page.click('[data-nav="board"]');
    await page.click('[data-sticky-note]');
    await page.fill('#captureText',NOTE);
    await page.click('[data-save-note]');
    await page.waitForFunction(note=>window.MSOS4.state.captures.some(x=>x.capture_type==='note'&&x.text_content===note),NOTE);

    await page.click('[data-sticky-voice]');
    await page.waitForSelector('[data-capture-voice]');
    await page.evaluate(()=>{
      window.MSOS4.actions.recordVoice=(modal,save)=>{window.__msosVoiceWired=!!modal.querySelector('#captureText')&&typeof save==='function'};
    });
    await page.click('[data-capture-voice]');
    assert.equal(await page.evaluate(()=>window.__msosVoiceWired),true,'Voice capture did not retain the local-first save callback');
    await page.click('[data-close-modal]');

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.state&&document.body.dataset.guardian==='pass');
    snapshot=await appSnapshot(page);
    assert.equal(snapshot.sessionTotal,600,'session did not persist through reload');
    assert.ok(snapshot.captures.some(x=>x.type==='note'&&x.text===NOTE&&x.sessionId===snapshot.sessionId&&x.athleteIds.includes(ATHLETE_ID)),'athlete-linked note did not persist');
    assert.ok(snapshot.t400.some(x=>x.athleteId===ATHLETE_ID&&x.seconds===269&&x.sessionId===snapshot.sessionId),'manual T400 did not persist against the canonical session');

    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.state&&document.body.dataset.guardian==='pass');
    snapshot=await appSnapshot(page);
    assert.equal(snapshot.build,BUILD,'offline page served a stale application build');
    assert.equal(snapshot.sessionTotal,600,'canonical session was unavailable offline');
    assert.ok(snapshot.captures.some(x=>x.text===NOTE),'saved note was unavailable offline');
    assert.ok(snapshot.t400.some(x=>x.athleteId===ATHLETE_ID&&x.seconds===269),'saved T400 was unavailable offline');
    assert.ok(snapshot.width.scroll<=snapshot.width.inner+1,`offline Board overflows at phone width: ${snapshot.width.scroll}px > ${snapshot.width.inner}px`);
    await context.setOffline(false);

    assert.deepEqual(pageErrors,[],'uncaught page errors occurred');
    assert.deepEqual(consoleErrors,[],'browser console errors occurred');
    assert.deepEqual(badResponses,[],'shipping resources returned errors');
    console.log(`V4 browser predeploy PASS · ${BUILD} · 390x844 · session/capture/T400/reload/offline`);
  }finally{
    await context.setOffline(false).catch(()=>{});
    await browser.close();
  }
})().catch(error=>{
  console.error(error.stack||error);
  process.exit(1);
});
