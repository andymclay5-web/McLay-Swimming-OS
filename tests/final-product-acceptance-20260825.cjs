'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const BUILD='v4-final-acceptance-20260825a';
const SOURCE=`WARM-UP
400 Choice
4 x 50 as 25 Drill / 25 Swim

MAIN SET
2 x 400 Freestyle — 1 Regeneration / 1 Development +20s
8 x 100 Freestyle — 1-4 Overload / 5-8 Threshold +20s
4 x 50 #1 Stroke @ 1:15 — Odd 200 Pace / Even Drill

WARM-DOWN
200 Easy`;
const swimmers=[
  {id:'final-charlotte',full_name:'Charlotte Murphy',squad:'National',t400:'4:50.0',status:'modified'},
  {id:'final-mckenzie',full_name:'McKenzie Drage',squad:'National',t400:'5:03.0',status:'modified'},
  {id:'final-thomas',full_name:'Thomas Cave',squad:'National',t400:'4:35.0',status:'present'},
  {id:'final-alex',full_name:'Alex Gibson',squad:'National',t400:'4:29.0',status:'present'}
];
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    let snap=await page.evaluate(()=>({build:MSOS4.BUILD,view:MSOS4.state.settings.view,scrollY:scrollY,bodyView:document.body.dataset.msosView,storage:MSOS4.state.settings.storageMode,guardian:MSOS4.state.guardian?.runs?.at(-1)}));
    assert.equal(snap.build,BUILD);assert.equal(snap.view,'board');assert.equal(snap.bodyView,'board');assert.ok(snap.scrollY<2);assert.equal(snap.storage,'indexeddb');assert.equal(snap.guardian?.ok,true);
    assert.ok((snap.guardian?.tests||[]).some(x=>/exact package is CI-attested/i.test(x.name)),'device Guardian does not expose full-release attestation');

    async function nav(view){await page.click(`[data-nav="${view}"]`);await page.waitForFunction(v=>window.MSOS4?.state?.settings?.view===v&&document.querySelector(`#${v}View`)?.classList.contains('active'),view,{timeout:2500});}
    await nav('hub');await nav('roll');await nav('times');await nav('board');

    await page.click('#guardianShortcut');
    await page.waitForFunction(()=>MSOS4.state.settings.view==='guardian'&&document.querySelector('#guardianView.active'),{timeout:2500});
    const guardianText=await page.locator('#guardianView').innerText();
    assert.match(guardianText,/PASS/);assert.match(guardianText,/Release Guardian · exact package is CI-attested/i);
    await nav('board');

    await page.click('#newSessionBtn');await page.waitForSelector('#coreRaw');await page.fill('#coreRaw',SOURCE);
    await page.waitForFunction(()=>document.querySelector('#coreCreate')?.disabled===false,{timeout:3000});await page.click('#coreCreate');
    await page.waitForFunction(()=>window.MSOS4?.currentSession?.()&&window.MSOS4.session.total(window.MSOS4.currentSession())===2600,{timeout:5000});
    const sessionId=await page.evaluate(()=>MSOS4.currentSession().id);
    let boardText=await page.locator('#boardView').innerText();
    const compactBoard=boardText.replace(/\s+/g,' ');
    for(const rule of [/\b400\b/,/4\s*[×x]\s*50/,/2\s*[×x]\s*400\s*(?:Fr|Freestyle)/i,/8\s*[×x]\s*100\s*(?:Fr|Freestyle)/i,/4\s*[×x]\s*50[^\n]*#1\s*Stroke/i,/\b200\b/])assert.match(compactBoard,rule,`Board missing ${rule}`);
    assert.match(compactBoard,/Drill/i);assert.match(compactBoard,/REG|Regeneration/i);assert.match(compactBoard,/THR|Threshold/i);assert.match(compactBoard,/RP200|200 Pace/i);

    await page.evaluate(list=>{
      const M=MSOS4,s=M.currentSession();const ids={};for(const spec of list){const existing=(M.state.athletes||[]).find(x=>String(x.full_name||'').toLowerCase()===spec.full_name.toLowerCase());if(existing){ids[spec.id]=existing.id;existing.squad=existing.squad||spec.squad;existing.active=true;existing.legacy_pace={...(existing.legacy_pace||{}),t400:spec.t400,course:'SCM',t400_date:'2026-08-01'}}else{M.state.athletes.push({id:spec.id,full_name:spec.full_name,squad:spec.squad,active:true,legacy_pace:{t400:spec.t400,course:'SCM',t400_date:'2026-08-01'}});ids[spec.id]=spec.id}}
      M.state.__finalAcceptanceIds=ids;M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id||!Object.values(ids).includes(x.athlete_id));M.state.resultsPbBoard=M.state.resultsPbBoard||[];const thomas=ids['final-thomas'];if(!M.state.resultsPbBoard.some(x=>x.athlete_id===thomas&&Number(x.distance)===100&&String(x.stroke)==='Freestyle'))M.state.resultsPbBoard.push({athlete_id:thomas,distance:100,stroke:'Freestyle',course:'SCM',result_seconds:58.4,sex:'M',date:'2026-07-01'});M.store.save(M.state);M.ui.renderCurrent();
    },swimmers);
    const liveSwimmers=await page.evaluate(list=>list.map(x=>({...x,id:MSOS4.state.__finalAcceptanceIds[x.id]})),swimmers);
    await nav('roll');
    for(const sw of liveSwimmers){const button=page.locator(`[data-roll="${sw.id}:${sw.status}"]`);assert.equal(await button.count(),1,`Roll missing ${sw.full_name}`);await button.click();await page.waitForFunction(({sid,id,status})=>MSOS4.state.attendance.some(x=>x.session_id===sid&&x.athlete_id===id&&x.status===status),{sid:sessionId,id:sw.id,status:sw.status})}
    await nav('board');boardText=await page.locator('#boardView').innerText();
    assert.match(boardText,/Charlotte Murphy|Charlotte|CM/);assert.match(boardText,/McKenzie Drage|McKenzie|MD/);
    const modifiedText=(await page.locator('.pool-mod').allInnerTexts()).join('\n');assert.match(modifiedText,/CM|Charlotte/);assert.match(modifiedText,/MD|McKenzie/);
    assert.ok(!/NaN|undefined|@ 00\.0/.test(boardText),'Board exposed invalid target/modification text');

    await nav('times');const timesText=await page.locator('#timesView').innerText();for(const sw of liveSwimmers)assert.ok(timesText.includes(sw.full_name),`Times missing ${sw.full_name}`);
    await nav('board');
    const swimmerButton=page.locator('[data-pool-swimmers]').first();assert.ok(await swimmerButton.count(),'Board has no swimmer/performance route');await swimmerButton.click();
    await page.waitForFunction(()=>MSOS4.state.settings.view==='athletes'&&document.querySelector('#athletesView.active'),{timeout:2500});
    const thomasId=liveSwimmers.find(x=>x.full_name==='Thomas Cave').id;await page.selectOption('#pathAthlete',thomasId);await page.waitForFunction(()=>document.querySelector('#athletesView')?.innerText.includes('Thomas Cave'));
    const pathText=await page.locator('#athletesView').innerText();assert.match(pathText,/SWIMMER PERFORMANCE/);assert.match(pathText,/Thomas Cave/);assert.match(pathText,/PB|PATHWAY|QUALIFIER/i);

    await page.click('[data-nav="board"]');await page.waitForFunction(()=>MSOS4.state.settings.view==='board');
    const before=Date.now();await page.evaluate(()=>MSOS4.store.save(MSOS4.state));await page.waitForFunction(t=>Number(MSOS4.storageEngine.lastPersistedAt||0)>=t,before,{timeout:5000});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(sid=>MSOS4?.storageEngine?.hydrated?.()===true&&MSOS4.currentSession?.()?.id===sid,sessionId,{timeout:10000});
    snap=await page.evaluate(()=>({view:MSOS4.state.settings.view,scrollY,sessionId:MSOS4.currentSession()?.id,attendance:MSOS4.state.attendance.filter(x=>x.session_id===MSOS4.currentSession()?.id).map(x=>[x.athlete_id,x.status])}));
    assert.equal(snap.view,'board');assert.ok(snap.scrollY<2);assert.equal(snap.sessionId,sessionId);for(const sw of liveSwimmers)assert.ok(snap.attendance.some(([id,status])=>id===sw.id&&status===sw.status),`attendance lost for ${sw.full_name}`);

    await page.click('[data-nav="roll"]');await page.waitForFunction(()=>MSOS4.state.settings.view==='roll');await page.goBack();await page.waitForFunction(()=>MSOS4.state.settings.view==='board',{timeout:2500});

    const worker=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker build timeout')),3000),fn=e=>{if(e.data?.type!=='MSOS_BUILD')return;clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',fn);resolve(e.data)};navigator.serviceWorker.addEventListener('message',fn);(navigator.serviceWorker.controller||reg.active)?.postMessage({type:'MSOS_BUILD'})})});
    assert.equal(worker.build,BUILD);
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});assert.equal(await page.evaluate(()=>MSOS4.BUILD),BUILD);assert.equal(await page.evaluate(()=>MSOS4.state.settings.view),'board');

    assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);assert.deepEqual(consoleErrors.filter(x=>!/service worker/i.test(x)),[],`console errors: ${consoleErrors.join('\n')}`);
    console.log('FINAL_PRODUCT_ACCEPTANCE_PASS');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
