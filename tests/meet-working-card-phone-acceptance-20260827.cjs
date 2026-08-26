'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

const RAW=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 8 Mixed 13 & Over 100 SC Meter Freestyle
Heat 2 of 2 Finals Starts at 07:40 PM
2 Rival One M15 North Canterbury 1:02.20
3 Aqua One M15 Aquagym 1:00.44
4 Rival Two M16 Jasi 59.88`;

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),pageErrors=[],consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{
   const M=MSOS4;M.state.athletes=M.state.athletes||[];
   let a=M.state.athletes.find(x=>x.id==='meet-working-a1'||String(x.full_name||'').toLowerCase()==='aqua one');
   if(!a){a={id:'meet-working-a1',full_name:'Aqua One',squad:'National',active:true};M.state.athletes.push(a)}
   Object.assign(a,{id:'meet-working-a1',full_name:'Aqua One',squad:'National',active:true});
   M.state.meetImports=[];M.state.meetFieldDeck=null;
   M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
   M.store.save(M.state);
   if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
  });

  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',RAW);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForFunction(()=>window.MSOS4?.meetProgramOpsBridge?.build?.includes('20260827a'),{timeout:3000});

  const row=page.locator('.ba-row.aqua').first();
  assert.equal(await row.count(),1,'AquaGym programme row must be visible');
  const programmeText=await page.locator('.ba-event').innerText();
  assert.match(programmeText,/Aqua One/);assert.match(programmeText,/1:00\.44/,'entry/seed time must remain visible in whole programme');

  await row.click();
  await page.waitForFunction(()=>{
   const p=document.querySelector('[data-meet-program-ba]'),w=document.querySelector('[data-meet-program-working-card="1"]');
   return !!p&&!!w&&!w.hidden&&p.contains(w)&&/Aqua One/.test(w.textContent||'');
  },{timeout:5000});

  const working=page.locator('[data-meet-program-working-card="1"]');
  const workText=await working.innerText();
  assert.match(workText,/Aqua One/);assert.match(workText,/Seed\s*1:00\.44/,'working card must expose entry time');
  assert.match(workText,/Start timer/);assert.match(workText,/Manual coach time/);assert.match(workText,/Capture/);assert.match(workText,/Race data/);assert.match(workText,/Complete race/);

  const selectedKey=await page.evaluate(()=>MSOS4.state.meetOps?.selectedRaceKey||'');
  assert.ok(selectedKey,'programme row must select an exact meet-ops race key');
  assert.equal(await page.evaluate(()=>MSOS4.state.meetProgramBA?.selectedKey||''),selectedKey,'programme and meet-ops must agree on selected race');

  // Type a coach time directly from the working card.
  await page.fill('[data-mo-manual]','59.91');
  await page.click('[data-mo-save-time]');
  await page.waitForFunction(k=>Math.abs(Number(MSOS4.state.meetOps?.races?.[k]?.draft_time_seconds)-59.91)<0.001,selectedKey,{timeout:3000});

  // Type an observation in place while watching the race.
  const quick=page.locator('[data-mo-quick-note]');
  await quick.fill('Held line well; breakout improved.');
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(k=>MSOS4.state.meetOps?.races?.[k]?.notes||'',selectedKey),'Held line well; breakout improved.');

  // Capture a race-linked note through the actual Capture surface.
  await page.click('[data-mo-cap]');
  await page.waitForSelector('[data-mo-note]',{timeout:3000});
  await page.fill('[data-mo-note]','Finish timing strong; check stroke count next race.');
  await page.click('[data-mo-save-note]');
  await page.waitForFunction(k=>(MSOS4.state.meetOps?.evidence||[]).some(e=>e.race_key===k&&e.capture_type==='note'&&/Finish timing strong/.test(e.text_content||'')),selectedKey,{timeout:3000});

  await page.click('[data-mo-complete]');
  await page.waitForFunction(k=>MSOS4.state.meetOps?.races?.[k]?.status==='complete',selectedKey,{timeout:3000});
  assert.match(await working.innerText(),/Race complete/);

  // Persist the exact race data before the cold reload.
  const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},rev);
  await page.waitForFunction(()=>Number(MSOS4.storageEngine.lastCompactPersistedAt||0)>0,{timeout:6000});

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{const M=MSOS4;if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForFunction(k=>{
   const x=MSOS4.state.meetOps?.races?.[k];
   return x?.status==='complete'&&Math.abs(Number(x.draft_time_seconds)-59.91)<0.001&&/Held line well/.test(x.notes||'')&&(MSOS4.state.meetOps?.evidence||[]).some(e=>e.race_key===k&&/Finish timing strong/.test(e.text_content||''));
  },selectedKey,{timeout:5000});
  await page.waitForFunction(()=>{const w=document.querySelector('[data-meet-program-working-card="1"]');return !!w&&!w.hidden&&/Aqua One/.test(w.textContent||'')},{timeout:5000});

  assert.deepEqual(pageErrors,[],'page errors during Meet working-card journey');
  assert.deepEqual(consoleErrors,[],'console errors during Meet working-card journey');
  console.log('MEET_WORKING_CARD_PHONE_ACCEPTANCE_PASS seed=1:00.44 typed=59.91 note=retained capture=retained complete=retained reload=restored');
 }finally{await browser.close()}
})().catch(err=>{console.error(err?.stack||err);process.exit(1)});
