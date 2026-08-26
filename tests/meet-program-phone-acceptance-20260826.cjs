'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

const RAW1=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - 12:40 PM 20/08/2026 Page 1
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

const ADDITIONAL=[
 {session:2,event:3,raw:`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 2
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 2
Event 3 Mixed 13 & Over 100 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 01:15 PM
2 Rival Five M15 North Canterbury 1:05.20
3 Aqua One M15 Aquagym 1:02.44
4 Rival Six W14 Jasi 1:01.88`,markers:['Rival Five','Aqua One','Rival Six','1:05.20','1:02.44','1:01.88']},
 {session:3,event:4,raw:`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 3
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 3
Event 4 Mixed 13 & Over 100 SC Meter Backstroke
Heat 1 of 1 Finals Starts at 06:15 PM
2 Rival Seven W15 North Canterbury 1:16.10
3 Aqua Two W15 Aquagym 1:13.45
4 Rival Eight M14 Jasi 1:12.90`,markers:['Rival Seven','Aqua Two','Rival Eight','1:16.10','1:13.45','1:12.90']},
 {session:4,event:5,raw:`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 4
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 4
Event 5 Mixed 13 & Over 100 SC Meter Breaststroke
Heat 1 of 1 Finals Starts at 01:15 PM
2 Rival Nine M16 North Canterbury 1:28.20
3 Aqua One M15 Aquagym 1:24.77
4 Rival Ten W15 Jasi 1:23.50`,markers:['Rival Nine','Aqua One','Rival Ten','1:28.20','1:24.77','1:23.50']},
 {session:5,event:6,raw:`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 5
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 5
Event 6 Mixed 13 & Over 100 SC Meter Butterfly
Heat 1 of 1 Finals Starts at 06:15 PM
2 Rival Eleven W15 North Canterbury 1:14.20
3 Aqua Two W15 Aquagym 1:10.33
4 Rival Twelve M14 Jasi 1:09.88`,markers:['Rival Eleven','Aqua Two','Rival Twelve','1:14.20','1:10.33','1:09.88']},
 {session:6,event:7,raw:`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 6
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 6
Event 7 Mixed 13 & Over 200 SC Meter IM
Heat 1 of 1 Finals Starts at 01:15 PM
2 Rival Thirteen M16 North Canterbury 2:35.20
3 Aqua One M15 Aquagym 2:28.44
4 Rival Fourteen W15 Jasi 2:26.88`,markers:['Rival Thirteen','Aqua One','Rival Fourteen','2:35.20','2:28.44','2:26.88']}
];

const hasTextRegex=value=>new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));

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

  // Session 1 enters through the same paste/review/use flow used on deck.
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',RAW1);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  const review=await page.locator('[data-mfa-status]').innerText();
  assert.match(review,/2\s+AquaGym programme rows/i,'review must identify the two AquaGym programme rows');
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});

  assert.equal(await page.locator('[data-ba-event]').count(),2,'Session 1 should expose E1 and E2 as Event tabs');
  let active=await page.locator('[data-ba-event].active').innerText();
  assert.match(active,/E1/);
  let eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival One','Aqua One','Rival Two','35.12','34.56','33.90'])assert.match(eventText,hasTextRegex(value));
  assert.doesNotMatch(eventText,/Rival Three|41\.33/,'only the selected event should render');

  await page.click('[data-ba-event="2"]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2);
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/);
  eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival Three','Aqua Two','Rival Four','41.33','39.22','38.77'])assert.match(eventText,hasTextRegex(value));
  assert.doesNotMatch(eventText,/Rival One|35\.12/);

  // Start live progression at E1, then prove the first event boundary E1 -> E2.
  await page.click('[data-ba-event="1"]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===1);
  await page.click('[data-ba-next]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2&&/\|2\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||''),{timeout:3000});
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/,'Next Heat across an event boundary must activate E2');

  const aqua=page.locator('.ba-row.aqua').first();
  assert.equal(await aqua.count(),1);
  await aqua.click();
  await page.waitForSelector('.ba-intel',{timeout:3000});
  const intel=await page.locator('.ba-intel').innerText();
  assert.match(intel,/Aqua Two/);assert.match(intel,/39\.22|39\.2/);

  // Add Sessions 2-6 through the actual Add session UI. Each must remain independent.
  for(const spec of ADDITIONAL){
   await page.click('[data-ba-add-session]');
   await page.waitForSelector('[data-ba-session]',{timeout:3000});
   await page.fill('[data-ba-session]',spec.raw);
   await page.click('[data-ba-add]');
   await page.waitForFunction(({count,event})=>MSOS4.state.meetProgramBA?.sources?.length===count&&MSOS4.state.meetProgramBA?.selectedEventNumber===event,{count:spec.session,event:spec.event},{timeout:5000});
   assert.equal(await page.locator('[data-ba-source]').count(),spec.session,`Session ${spec.session} must add without replacing an earlier session`);
   assert.match(await page.locator('[data-ba-source].active').innerText(),new RegExp(`Session ${spec.session}`));
   active=await page.locator('[data-ba-event].active').innerText();assert.match(active,new RegExp(`E${spec.event}`));
   eventText=await page.locator('.ba-event').innerText();
   for(const value of spec.markers)assert.match(eventText,hasTextRegex(value));
   assert.equal(await page.locator('.ba-row').count(),3,`Session ${spec.session} event should show exactly its three programme rows`);
   assert.doesNotMatch(eventText,/Rival One|Rival Three/,'another session must not leak into the selected session');
  }

  assert.equal(await page.locator('[data-ba-source]').count(),6,'all six South Island sessions must be available at once');
  assert.equal((await page.evaluate(()=>MSOS4.state.meetProgramBA?.sources?.length||0)),6);
  assert.equal((await page.evaluate(()=>MSOS4.state.meetFieldDeck?.races?.length||0)),7,'all seven AquaGym fixture races must remain linked across six sessions');

  // Explicit session browsing must not move NOW. NOW is still Session 1 / E2.
  const sessionTab=n=>page.locator('[data-ba-source]').filter({hasText:`Session ${n}`});
  await sessionTab(1).click();
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2,{timeout:3000});
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 1/);
  assert.equal(await page.locator('[data-ba-event]').count(),2,'Session 1 must retain both of its Event tabs after five later sessions are added');
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E2/,'Session 1 should reopen on its current NOW event');
  eventText=await page.locator('.ba-event').innerText();
  for(const value of ['Rival Three','Aqua Two','Rival Four','41.33','39.22','38.77'])assert.match(eventText,hasTextRegex(value));

  // Walk the live meet from Session 1 through all five session boundaries.
  for(const spec of ADDITIONAL){
   await page.click('[data-ba-next]');
   await page.waitForFunction(({event,session})=>MSOS4.state.meetProgramBA?.selectedEventNumber===event&&new RegExp(`\\|${event}\\|1$`).test(MSOS4.state.meetProgramBA?.nowKey||'')&&MSOS4.state.meetProgramBA?.sources?.length===6,{event:spec.event,session:spec.session},{timeout:3000});
   assert.match(await page.locator('[data-ba-source].active').innerText(),new RegExp(`Session ${spec.session}`),`Next Heat must activate Session ${spec.session}`);
   active=await page.locator('[data-ba-event].active').innerText();assert.match(active,new RegExp(`E${spec.event}`));
  }

  // Backward boundary and return forward must also be deterministic.
  await page.click('[data-ba-prev]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===6&&/\|6\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||''),{timeout:3000});
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 5/,'Previous Heat from Session 6 must return to Session 5');
  await page.click('[data-ba-next]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===7&&/\|7\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||''),{timeout:3000});
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 6/);

  // Persist and prove the compact recovery shape carries all six programme sources.
  const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},rev);
  await page.waitForFunction(()=>Number(MSOS4.storageEngine.lastCompactPersistedAt||0)>0,{timeout:6000});
  await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem(MSOS4.STORAGE_KEY)||'null');return c?.meetProgramBA?.sources?.length===6}catch{return false}},{timeout:8000});
  const compact=await page.evaluate(()=>JSON.parse(localStorage.getItem(MSOS4.STORAGE_KEY)||'null'));
  assert.equal(compact?.meetFieldDeck?.races?.length,7,'compact recovery must retain AquaGym races across all six sessions');
  assert.equal(compact?.meetProgramBA?.sources?.length,6,'compact recovery must retain all six programme sessions');
  for(let n=1;n<=6;n++)assert.ok(compact.meetProgramBA.sources.some(x=>(x.raw||'').includes(`Meet Program - Session ${n}`)),`compact recovery missing Session ${n}`);
  assert.equal(compact?.meetProgramBA?.selectedEventNumber,7,'compact recovery must retain current Session 6 / E7 context');
  assert.ok(/\|7\|1$/.test(compact?.meetProgramBA?.nowKey||''),'compact recovery must retain the live E7 NOW key');

  // Cold reload: six sources, seven AquaGym races and Session 6 context must all return.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{const M=MSOS4;if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  const restored=await page.evaluate(()=>({races:MSOS4.state.meetFieldDeck?.races?.length||0,sources:MSOS4.state.meetProgramBA?.sources?.length||0,event:MSOS4.state.meetProgramBA?.selectedEventNumber||0,nowKey:MSOS4.state.meetProgramBA?.nowKey||'',raws:(MSOS4.state.meetProgramBA?.sources||[]).map(x=>x.raw||'')}));
  assert.equal(restored.races,7);
  assert.equal(restored.sources,6);
  assert.equal(restored.event,7);
  assert.ok(/\|7\|1$/.test(restored.nowKey));
  for(let n=1;n<=6;n++)assert.ok(restored.raws.some(x=>x.includes(`Meet Program - Session ${n}`)),`Session ${n} must survive reload`);
  assert.equal(await page.locator('[data-ba-source]').count(),6,'all six Session tabs must survive reload');
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 6/);
  active=await page.locator('[data-ba-event].active').innerText();assert.match(active,/E7/,'reopen must restore Session 6 / E7 context');

  // After reload, browse every session without changing live NOW, then return to NOW.
  for(let n=1;n<=6;n++){
   await page.locator('[data-ba-source]').filter({hasText:`Session ${n}`}).click();
   assert.match(await page.locator('[data-ba-source].active').innerText(),new RegExp(`Session ${n}`));
   assert.ok(await page.locator('[data-ba-event]').count()>=1,`Session ${n} must still expose Event tabs`);
   const nowKey=await page.evaluate(()=>MSOS4.state.meetProgramBA?.nowKey||'');
   assert.ok(/\|7\|1$/.test(nowKey),`browsing Session ${n} must not move NOW away from Session 6 / E7`);
  }
  await page.click('[data-ba-jump-now]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===7&&/\|7\|1$/.test(MSOS4.state.meetProgramBA?.nowKey||''),{timeout:3000});
  assert.match(await page.locator('[data-ba-source].active').innerText(),/Session 6/,'NOW must return the coach to the live Session 6 context');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors.filter(x=>!/favicon/i.test(x)),[],`console errors: ${consoleErrors.join('\n')}`);
  console.log('MEET_PROGRAM_PHONE_ACCEPTANCE_PASS sessions=6 events=7 rows=21 seeds=21 boundaries=5 forward+1 backward reload=all-restored now=stable');
 }finally{await browser.close()}
})().catch(e=>{console.error(e?.stack||e);process.exit(1)});
