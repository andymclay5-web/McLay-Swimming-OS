'use strict';

const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const BUILD='v4-poolside-core-20260819f-targettruth';
const ATHLETE_ID='predeploy-browser-athlete';
const NOTE='Predeploy poolside note';
const SATURDAY_ROSTER=[
  ['sat-thomas','Thomas Cave','4:35.0','present'],
  ['sat-charlotte','Charlotte Murphy','4:50.0','modified'],
  ['sat-alex','Alex Gibson','4:29.0','present'],
  ['sat-william','William Callow','4:44.0','present'],
  ['sat-mckenzie','McKenzie Drage','5:03.0','modified'],
  ['sat-luke','Luke Thompson','4:38.0','present'],
  ['sat-henry','Henry Crump','4:58.0','present']
].map(([id,full_name,t400,status])=>({id,full_name,t400,status}));

async function appSnapshot(page){
  return page.evaluate(()=>{
    const M=window.MSOS4,s=M.currentSession?.(),result=M.guardian.run();
    return {
      build:M.BUILD,
      releaseReady:M.release.softwareReady(),
      guardian:{ok:result.ok,passed:result.passed,total:result.total,build:result.build},
      sessionId:s?.id||'',
      sessionTotal:s?M.session.total(s):0,
      blockTotals:s?(s.blocks||[]).map(M.session.blockDistance):[],
      repairs:s?.metadata?.canonicalRepairs||[],
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
    assert.deepEqual(snapshot.guardian,{ok:true,passed:82,total:82,build:BUILD},'browser Guardian is not current and complete');
    assert.ok(snapshot.width.scroll<=snapshot.width.inner+1,`fresh phone page overflows: ${snapshot.width.scroll}px > ${snapshot.width.inner}px`);

    await page.click('#newSessionBtn');
    await page.waitForSelector('#coreRaw');
    await page.fill('#coreRaw','WARM-UP\n4 x 100 Freestyle Development 10s Rest\n4 x 50 Kick\n\n600m');
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
    await page.waitForSelector('.pool-targets');
    assert.equal(await page.locator('.pool-targets').first().getAttribute('open'),null,'Board targets opened inline by default');
    assert.ok((await page.locator('.pool-line').first().innerText()).includes('4 × 100 Freestyle'),'parent set disappeared behind target UI');
    await page.locator('.pool-targets summary').first().click();
    const targetText=await page.locator('.pool-targets').first().innerText();
    assert.ok(!/No Freestyle T400 loaded|target needed/i.test(targetText),`saved T400 did not resolve on Board: ${targetText}`);
    assert.ok(/Predeploy|PS\b/.test(targetText),'swimmer target row is missing');
    await page.click('[data-pool-swimmers]');
    await page.waitForSelector('#athletesView.active #pathAthlete');
    assert.ok((await page.locator('#athletesView').innerText()).includes('POOLSIDE ANSWER'),'direct swimmer route did not open the poolside answer surface');
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

    const acceptedSessionId=snapshot.sessionId;
    await page.evaluate(roster=>{
      const M=window.MSOS4,s=M.parser.parse(M.guardian.SATURDAY_SOURCE,{id:'saved-saturday-phone-shape',date:'2026-08-15',dayPart:'AM',title:'Sat AM',squads:['National','Development','Fitness'],venue:'AquaGym',course:'SCM'});
      const warm=s.blocks[0],parent=warm.items.find(x=>x.kind==='set'&&Number(x.reps)===12&&Number(x.distance)===50);
      warm.items.splice(warm.items.indexOf(parent)+1,0,{id:'phantom-breakdown',kind:'group',rounds:4,text:'4 ROUNDS',items:[{id:'p1',kind:'set',reps:1,distance:50,raw:'1 x 50 Scull'},{id:'p2',kind:'set',reps:1,distance:50,raw:'1 x 50 Drill'},{id:'p3',kind:'set',reps:1,distance:50,raw:'1 x 50 Swim Perfect Technique'}]});
      s.blocks[2].items.splice(1,0,{id:'phantom-rest-10',kind:'set',reps:1,distance:10,raw:'10s rest',text:'10s rest'});
      s.blocks[2].items.push({id:'phantom-rest-30',kind:'set',reps:1,distance:30,raw:'30s rest',text:'30s rest'});
      const ids=new Set(roster.map(x=>x.id));
      M.state.athletes=(M.state.athletes||[]).filter(x=>!ids.has(x.id)).concat(roster.map(x=>({id:x.id,full_name:x.full_name,squad:'National',active:true,legacy_pace:{t400:x.t400,course:'SCM',t400_date:'2026-08-01'}})));
      M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id).concat(roster.map(x=>({id:`attendance-${s.id}-${x.id}`,session_id:s.id,athlete_id:x.id,status:x.status,updated_at:M.util.now()})));
      M.state.canonicalSessions[s.id]=s;M.state.settings.selectedSessionId=s.id;M.state.settings.view='board';M.store.save(M.state);
    },SATURDAY_ROSTER);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.currentSession?.()?.id==='saved-saturday-phone-shape'&&window.MSOS4.session.total(window.MSOS4.currentSession())===5450);
    snapshot=await appSnapshot(page);
    assert.equal(snapshot.sessionTotal,5450,'saved 6,090m Saturday corruption was not repaired on reload');
    assert.deepEqual(snapshot.blockTotals,[1100,850,2900,600],'saved Saturday section truth was not restored');
    assert.ok(snapshot.repairs.some(x=>x.beforeTotal===6090&&x.afterTotal===5450),'saved-session repair audit is missing');
    const saturdayIds=new Set(SATURDAY_ROSTER.map(x=>x.id));
    assert.equal(snapshot.t400.filter(x=>saturdayIds.has(x.athleteId)).length,7,'legacy swimmer T400 references did not hydrate for the seven attending swimmers');
    const saturdayBoard=await page.evaluate(()=>{
      const lines=[...document.querySelectorAll('#boardView .pool-line')].map(line=>({
        work:line.querySelector('.pool-work-head strong')?.textContent?.trim()||'',
        text:line.textContent||'',
        modified:[...line.querySelectorAll('.pool-mod')].map(x=>x.textContent?.trim()||''),
        targets:!!line.querySelector('details.pool-targets')
      }));
      const details=[...document.querySelectorAll('#boardView details.pool-targets')];
      for(const detail of details){detail.open=true;detail.dispatchEvent(new Event('toggle'))}
      return{
        lines,
        targetDropdowns:details.length,
        targetText:details.map(x=>x.textContent||''),
        targetRows:details.map(x=>x.querySelectorAll('.pool-target-row').length),
        width:{inner:window.innerWidth,scroll:document.documentElement.scrollWidth}
      };
    });
    assert.equal(saturdayBoard.targetDropdowns,5,'Saturday target-driven sets do not all expose a compact Targets dropdown');
    assert.ok(saturdayBoard.lines.find(x=>x.work==='2 × 400 Freestyle')?.modified.some(x=>/CM.*2 × 200/s.test(x)),'Charlotte mixed-zone 2 × 400 did not retain two shortened phases');
    assert.ok(saturdayBoard.lines.find(x=>x.work==='2 × 400 Freestyle')?.modified.some(x=>/MD.*2 × 275/s.test(x)),'McKenzie mixed-zone 2 × 400 did not retain two shortened phases');
    assert.ok(saturdayBoard.targetText.some(x=>/#2–6/.test(x)),'6 × 25 race-pace target range is missing');
    assert.ok(saturdayBoard.targetText.some(x=>/#1–4/.test(x)&&/#5–8/.test(x)),'8 × 100 Overload/Threshold target ranges are missing');
    assert.ok(saturdayBoard.targetText.some(x=>/#2–4/.test(x)),'4 × 50 race-pace target range is missing');
    assert.ok(saturdayBoard.targetText.some(x=>/Exact race-model segment not loaded|No #1 stroke evidence loaded|PB unavailable/i.test(x)),'second 100 race-model target-needed state is missing');
    assert.ok(saturdayBoard.targetRows.every(x=>x===7),'a Saturday target dropdown is missing one or more attending swimmers');
    assert.ok(!saturdayBoard.targetText.some(x=>/No Freestyle T400 loaded/i.test(x)),'legacy Freestyle T400 evidence is still absent on the Board');
    assert.ok(saturdayBoard.width.scroll<=saturdayBoard.width.inner+1,`Saturday Board overflows at phone width: ${saturdayBoard.width.scroll}px > ${saturdayBoard.width.inner}px`);
    await page.click('[data-pool-times]');
    await page.waitForSelector('#timesView.active .v4-timing-roster');
    const timesText=await page.locator('#timesView').innerText();
    for(const swimmer of SATURDAY_ROSTER){
      const display=swimmer.t400.replace(/\.0$/,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      assert.ok(new RegExp(`${swimmer.full_name}[^]*${display}`).test(timesText),`${swimmer.full_name} T400 is missing from Times`);
    }
    await page.click('[data-nav="board"]');
    await page.evaluate(id=>{window.MSOS4.state.settings.selectedSessionId=id;window.MSOS4.store.save(window.MSOS4.state);window.MSOS4.ui.renderCurrent()},acceptedSessionId);

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
