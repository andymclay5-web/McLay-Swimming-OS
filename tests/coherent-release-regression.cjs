'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SOURCE=`WARM-UP
400 Choice
4 x 50 as 25 Drill / 25 Swim

MAIN SET
2 x 400 Freestyle — 1 Regeneration / 1 Development +20s
8 x 100 Freestyle — 1-4 Overload / 5-8 Threshold +20s
4 x 50 #1 Stroke @ 1:15 — Odd 200 Pace / Even Drill

WARM-DOWN
200 Easy`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),pageErrors=[],consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  assert.equal(await page.evaluate(()=>MSOS4.access.role()),'owner');
  assert.equal(await page.evaluate(()=>MSOS4.state.settings.view),'board');

  await page.click('#newSessionBtn');
  await page.waitForSelector('#coreRaw');
  await page.fill('#coreRaw',SOURCE);
  await page.waitForFunction(()=>document.querySelector('#coreCreate')?.disabled===false,{timeout:3000});
  await page.click('#coreCreate');
  await page.waitForFunction(()=>MSOS4.currentSession?.()&&MSOS4.session.total(MSOS4.currentSession())===2600,{timeout:5000});
  const sessionId=await page.evaluate(()=>MSOS4.currentSession().id);

  const specs=[
   {key:'charlotte',name:'Charlotte Murphy',status:'modified',t400:'4:50.0'},
   {key:'mckenzie',name:'McKenzie Drage',status:'modified',t400:'5:03.0'},
   {key:'thomas',name:'Thomas Cave',status:'present',t400:'4:35.0'},
   {key:'alex',name:'Alex Gibson',status:'present',t400:'4:29.0'}
  ];
  await page.evaluate(list=>{const M=MSOS4,s=M.currentSession(),ids={};for(const x of list){let a=M.state.athletes.find(v=>String(v.full_name||'').toLowerCase()===x.name.toLowerCase());if(!a){a={id:`coherent-${x.key}`,full_name:x.name,squad:'National',active:true};M.state.athletes.push(a)}a.active=true;a.squad='National';a.legacy_pace={...(a.legacy_pace||{}),t400:x.t400,course:'SCM',t400_date:'2026-08-01'};ids[x.key]=a.id}M.state.__coherentIds=ids;M.state.attendance=(M.state.attendance||[]).filter(r=>r.session_id!==s.id||!Object.values(ids).includes(r.athlete_id));M.store.save(M.state);M.ui.renderCurrent()},specs);
  const live=await page.evaluate(list=>list.map(x=>({...x,id:MSOS4.state.__coherentIds[x.key]})),specs);
  const nav=async view=>{await page.click(`[data-nav="${view}"]`);await page.waitForFunction(v=>MSOS4.state.settings.view===v&&document.querySelector(`#${v}View`)?.classList.contains('active'),view,{timeout:3000})};
  await nav('roll');
  for(const sw of live){const b=page.locator(`[data-roll="${sw.id}:${sw.status}"]`);assert.equal(await b.count(),1,`Roll missing ${sw.name}`);await b.click();}
  await nav('board');
  const board=await page.locator('#boardView').innerText();
  assert.match(board,/2\s*[×x]\s*400\s*(?:Fr|Freestyle)/i);assert.match(board,/8\s*[×x]\s*100\s*(?:Fr|Freestyle)/i);assert.match(board,/200 Pace|RP200/i);
  assert.ok(!/NaN|undefined|@ 00\.0/.test(board),'Board exposed invalid values');
  const mods=(await page.locator('.msos-mod-row').allInnerTexts()).join('\n');
  assert.match(mods,/Charlotte/);assert.match(mods,/McKenzie/);

  const targetRow=page.locator('.msos-work-row',{hasText:/8×100|8 × 100/}).first();
  assert.equal(await targetRow.count(),1,'8x100 row missing');
  await targetRow.locator('[data-msos-times]').click();
  await page.waitForSelector('[data-msos-target-matrix]');
  const targets=await targetRow.locator('[data-msos-target-matrix]').innerText();
  assert.match(targets,/Charlotte|McKenzie|Thomas|Alex/);assert.ok(!/NaN|undefined/.test(targets));

  const before=Date.now();await page.evaluate(()=>MSOS4.store.save(MSOS4.state));
  await page.waitForFunction(t=>Number(MSOS4.storageEngine.lastPersistedAt||0)>=t,before,{timeout:5000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(sid=>MSOS4?.storageEngine?.hydrated?.()===true&&MSOS4.currentSession?.()?.id===sid,sessionId,{timeout:10000});
  const persisted=await page.evaluate(()=>({view:MSOS4.state.settings.view,attendance:MSOS4.state.attendance.filter(x=>x.session_id===MSOS4.currentSession().id)}));
  assert.equal(persisted.view,'board');for(const sw of live)assert.ok(persisted.attendance.some(x=>x.athlete_id===sw.id&&x.status===sw.status),`attendance lost for ${sw.name}`);

  await nav('roll');await page.goBack();await page.waitForFunction(()=>MSOS4.state.settings.view==='board',{timeout:3000});
  const worker=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker build timeout')),3000),fn=e=>{if(e.data?.type!=='MSOS_BUILD')return;clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',fn);resolve(e.data)};navigator.serviceWorker.addEventListener('message',fn);(navigator.serviceWorker.controller||reg.active)?.postMessage({type:'MSOS_BUILD'})})});
  assert.ok(worker?.build,'service worker did not report a build');
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});assert.equal(await page.evaluate(()=>MSOS4.state.settings.view),'board');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors.filter(x=>!/service worker/i.test(x)),[],`console errors: ${consoleErrors.join('\n')}`);
  console.log('COHERENT_RELEASE_REGRESSION_PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
