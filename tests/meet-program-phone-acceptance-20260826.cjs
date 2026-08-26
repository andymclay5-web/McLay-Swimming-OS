'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - 12:40 PM 20/08/2026 Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
2 Rival One M11 North Canterbury 35.12
3 Aqua One M11 Aquagym 34.56
4 Rival Two W12 Jasi 33.90
Event 2 Mixed 12 & Under 50 SC Meter Backstroke
Heat 1 of 1 Finals Starts at 06:18 PM
1 Rival Three W11 Dragon 41.33
4 Aqua Two W12 Aquagym 39.22
5 Rival Four M12 Wharenui 38.77`;
const RAW2=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - 12:40 PM 20/08/2026 Page 2
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 2
Event 3 Mixed 13 & Over 100 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 01:15 PM
2 Rival Five M15 North Canterbury 1:05.20
3 Aqua One M15 Aquagym 1:02.44
4 Rival Six W14 Jasi 1:01.88`;

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
   for(const [id,name] of [['meet-phone-a1','Aqua One'],['meet-phone-a2','Aqua Two']]){
    let a=M.state.athletes.find(x=>x.id===id||String(x.full_name||'').toLowerCase()===name.toLowerCase());
    if(!a){a={id,full_name:name,squad:'National',active:true};M.state.athletes.push(a)}
    a.active=true;a.squad='National';
   }
   M.state.meetImports=[];M.state.meetFieldDeck=null;M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
   M.store.save(M.state);
   if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
  });
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',RAW);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  const review=await page.locator('[data-mfa-status]').innerText();
  assert.match(review,/2\s+AquaGym programme rows/i,'review must identify the two AquaGym programme rows');
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});

  assert.equal(await page.locator('[data-ba-event]').count(),2,'two Event tabs should be visible for Session 1');
  let active=await page.locator('[data-ba-event].active').innerText();
  assert.match(active,/E1/);
  let eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival One','Aqua One','Rival Two','35.12','34.56','33.90'])assert.match(eventText,new RegExp(value.replace('.','\\.')));
  assert.doesNotMatch(eventText,/Rival Three|41\.33/,'only the selected event should be rendered');

  await page.click('[data-ba-event="2"]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2);
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/);
  eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival Three','Aqua Two','Rival Four','41.33','39.22','38.77'])assert.match(eventText,new RegExp(value.replace('.','\\.')));
  assert.doesNotMatch(eventText,/Rival One|35\.12/);

  await page.click('[data-ba-event="1"]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===1);
  await page.click('[data-ba-next]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2&&/\|2\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||''),{timeout:3000});
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/,'Next Heat across an event boundary must activate E2');

  const aqua=page.locator('.ba-row.aqua').first();assert.equal(await aqua.count(),1);await aqua.click();await page.waitForSelector('.ba-intel',{timeout:3000});const intel=await page.locator('.ba-intel').innerText();assert.match(intel,/Aqua Two/);assert.match(intel,/39\.22|39\.2/);

  // Add Session 2 through the actual Meet UI and prove Session 1 is not damaged.
  await page.click('[data-ba-add-session]');
  await page.waitForSelector('[data-ba-session]',{timeout:3000});
  await page.fill('[data-ba-session]',RAW2);
  await page.click('[data-ba-add]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.sources?.length===2&&MSOS4.state.meetProgramBA?.selectedEventNumber===3,{timeout:3000});
  assert.equal(await page.locator('[data-ba-source]').count(),2,'Session tabs should appear once Session 2 is added');
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E3/);
  eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival Five','Aqua One','Rival Six','1:05.20','1:02.44','1:01.88'])assert.match(eventText,new RegExp(value.replace('.','\\.')));
  assert.doesNotMatch(eventText,/Rival One|Rival Three/,'Session 2 view must not leak Session 1 rows');

  const sessionButtons=page.locator('[data-ba-source]');
  const session1Button=sessionButtons.filter({hasText:'Session 1'});
  const session2Button=sessionButtons.filter({hasText:'Session 2'});
  assert.equal(await session1Button.count(),1,'Session 1 tab must remain available');
  assert.equal(await session2Button.count(),1,'Session 2 tab must be available');
  await session1Button.click();
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2,{timeout:3000});
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 1/,'explicit Session 1 tab must activate Session 1');
  assert.equal(await page.locator('[data-ba-event]').count(),2,'Session 1 must still retain E1 and E2 after adding Session 2');
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/,'Session 1 should reopen on its current NOW event');
  eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival Three','Aqua Two','Rival Four','41.33','39.22','38.77'])assert.match(eventText,new RegExp(value.replace('.','\\.')));

  // NOW is still E2; Next Heat must cross the session boundary into Session 2 / E3.
  await page.click('[data-ba-next]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===3&&/\|3\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||'')&&MSOS4.state.meetProgramBA?.sources?.length===2,{timeout:3000});
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E3/,'Next Heat must cross from Session 1 E2 into Session 2 E3');
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 2/,'session tab must follow NOW across the session boundary');

  const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},rev);
  await page.waitForFunction(()=>Number(MSOS4.storageEngine.lastCompactPersistedAt||0)>0,{timeout:6000});
  // Give the structural Session-2 compact checkpoint time to replace any earlier Session-1 compact.
  await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem(MSOS4.STORAGE_KEY)||'null');return c?.meetProgramBA?.sources?.length===2}catch{return false}},{timeout:6000});
  const compact=await page.evaluate(()=>JSON.parse(localStorage.getItem(MSOS4.STORAGE_KEY)||'null'));
  assert.equal(compact?.meetFieldDeck?.races?.length,3,'compact recovery must retain AquaGym races from both sessions');
  assert.equal(compact?.meetProgramBA?.sources?.length,2,'compact recovery must retain both programme sessions');
  assert.ok(compact?.meetProgramBA?.sources?.[0]?.raw?.includes('Event 2'),'compact recovery must retain Session 1 source text');
  assert.ok(compact?.meetProgramBA?.sources?.[1]?.raw?.includes('Event 3'),'compact recovery must retain Session 2 source text');
  assert.equal(compact?.meetProgramBA?.selectedEventNumber,3,'compact recovery must retain current Session 2 event context');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{const M=MSOS4;if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  const restored=await page.evaluate(()=>({races:MSOS4.state.meetFieldDeck?.races?.length||0,sources:MSOS4.state.meetProgramBA?.sources?.length||0,event:MSOS4.state.meetProgramBA?.selectedEventNumber||0,raws:(MSOS4.state.meetProgramBA?.sources||[]).map(x=>x.raw||'')}));
  assert.equal(restored.races,3);
  assert.equal(restored.sources,2);
  assert.equal(restored.event,3);
  assert.ok(restored.raws.some(x=>x.includes('Rival Four')),'Session 1 must survive reload');
  assert.ok(restored.raws.some(x=>x.includes('Rival Six')),'Session 2 must survive reload');
  assert.equal(await page.locator('[data-ba-source]').count(),2,'both Session tabs must survive reload');
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E3/,'reopen must restore Session 2 / E3 context');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors.filter(x=>!/favicon/i.test(x)),[],`console errors: ${consoleErrors.join('\n')}`);
  console.log('MEET_PROGRAM_PHONE_ACCEPTANCE_PASS paste=review=use sessions=2 events=3 seeds=9 nextCross=E2->S2E3 reload=restored');
 }finally{await browser.close()}
})().catch(e=>{console.error(e?.stack||e);process.exit(1)});
