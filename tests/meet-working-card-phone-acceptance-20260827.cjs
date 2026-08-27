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
  await page.waitForFunction(()=>window.MSOS4?.meetProgramOpsBridge?.build?.includes('cold-start'),{timeout:3000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-meet-program-ba] .ba-seed').length===3,{timeout:3000});

  const seedProof=await page.evaluate(()=>[...document.querySelectorAll('[data-meet-program-ba] .ba-seed')].map(n=>{const r=n.getBoundingClientRect();return{value:n.dataset.seedValue||'',left:r.left,right:r.right,width:r.width,display:getComputedStyle(n).display,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+0.5}}));
  assert.deepEqual(seedProof.map(x=>x.value),['1:02.20','1:00.44','59.88'],'every competitor seed must be preserved in programme order');
  assert.equal(seedProof.every(x=>x.visible),true,`every seed must be physically inside the phone viewport: ${JSON.stringify(seedProof)}`);

  const programmeText=await page.locator('.ba-event').innerText();
  assert.match(programmeText,/Rival One[\s\S]*1:02\.20/);
  assert.match(programmeText,/Aqua One[\s\S]*1:00\.44/);
  assert.match(programmeText,/Rival Two[\s\S]*59\.88/);
  assert.equal(await page.locator('[data-meet-ops-av]:visible').count(),0,'programme must not expose a second meet-ops working card');
  assert.equal(await page.locator('[data-meet-board-az]:visible').count(),0,'legacy Meet deck must stay hidden beneath the live programme');

  const row=page.locator('.ba-row.aqua').first();
  assert.equal(await row.count(),1,'AquaGym programme row must be visible');
  await row.click();
  await page.waitForSelector('.ba-row.aqua.expanded .ba-intel',{timeout:3000});
  await page.waitForSelector('.ba-row.aqua.expanded [data-mpo-quick-note]',{timeout:3000});

  const intel=page.locator('.ba-row.aqua.expanded .ba-intel');
  const intelText=await intel.innerText();
  assert.match(intelText,/Seed\s*1:00\.44/,'expanded swimmer must retain its entry time');
  assert.match(intelText,/Quick note/,'quick typed notes must be directly visible');
  assert.match(intelText,/Voice commentary/,'voice commentary must be a primary race action');
  assert.match(intelText,/Capture/,'capture must be a primary race action');
  assert.match(intelText,/Backup stopwatch/,'stopwatch remains available only as backup');
  assert.doesNotMatch(intelText,/Talk through race/,'old commentary wording must not remain');

  const backup=page.locator('.ba-row.aqua.expanded details[data-mpo-backup]');
  assert.equal(await backup.count(),1);
  assert.equal(await backup.evaluate(n=>n.open),false,'backup stopwatch must be collapsed by default');
  assert.equal(await page.locator('[data-ba-add-session]').count(),1,'Add session must survive race expansion');
  await page.click('[data-ba-add-session]',{timeout:3000});
  await page.waitForSelector('[data-ba-session]',{timeout:3000});
  await page.click('[data-ba-close]');

  const selectedKey=await page.evaluate(()=>MSOS4.state.meetOps?.selectedRaceKey||'');
  assert.ok(selectedKey,'programme row must select an exact meet-ops race key');
  assert.equal(await page.evaluate(()=>MSOS4.state.meetProgramBA?.selectedKey||''),selectedKey,'programme and meet-ops must agree on selected race');

  const note=page.locator('[data-mpo-quick-note]');
  await note.fill('Held line well; breakout improved.');
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(k=>MSOS4.state.meetOps?.races?.[k]?.notes||'',selectedKey),'Held line well; breakout improved.');

  await page.click('.ba-row.aqua.expanded [data-ba-capture]');
  await page.waitForSelector('[data-mo-note]',{timeout:3000});
  await page.fill('[data-mo-note]','Finish timing strong; check stroke count next race.');
  await page.click('[data-mo-save-note]');
  await page.waitForFunction(k=>(MSOS4.state.meetOps?.evidence||[]).some(e=>e.race_key===k&&e.capture_type==='note'&&/Finish timing strong/.test(e.text_content||'')),selectedKey,{timeout:3000});

  const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},rev);
  await page.waitForFunction(()=>Number(MSOS4.storageEngine.lastCompactPersistedAt||0)>0,{timeout:6000});
  assert.equal(await page.evaluate(()=>MSOS4.state.settings.view),'meet','Meet view must be persisted before the cold-start proof');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.waitForFunction(()=>MSOS4.state?.settings?.view==='meet',{timeout:10000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:10000});
  await page.waitForFunction(()=>window.MSOS4?.meetProgramOpsBridge?.build?.includes('cold-start'),{timeout:3000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-meet-program-ba] .ba-seed').length===3,{timeout:6000});
  assert.equal(await page.locator('[data-meet-board-az]:visible').count(),0,'legacy Guardian Meet deck must already be hidden on direct cold restore before any Meet navigation click');
  await page.locator('.ba-row.aqua').first().click();
  await page.waitForSelector('[data-mpo-quick-note]',{timeout:3000});
  assert.equal(await page.locator('[data-mpo-quick-note]').inputValue(),'Held line well; breakout improved.','quick note must restore on the programme itself after direct cold startup');
  const coldIntelText=await page.locator('.ba-row.aqua.expanded .ba-intel').innerText();
  assert.match(coldIntelText,/Voice commentary/,'cold-restored race card must expose voice commentary without a manual Meet re-navigation');
  assert.match(coldIntelText,/Capture/,'cold-restored race card must expose Capture without a manual Meet re-navigation');
  assert.doesNotMatch(coldIntelText,/Talk through race/,'cold-restored race card must not fall back to the old controls');
  await page.waitForFunction(k=>(MSOS4.state.meetOps?.evidence||[]).some(e=>e.race_key===k&&/Finish timing strong/.test(e.text_content||'')),selectedKey,{timeout:5000});
  assert.equal(await page.locator('[data-ba-add-session]').count(),1,'programme controls must still exist after cold reload and race expansion');
  assert.equal(await page.locator('[data-meet-ops-av]:visible').count(),0,'no duplicate working card may reappear after reload');
  assert.equal(await page.locator('[data-meet-board-az]:visible').count(),0,'no Guardian Meet deck may reappear after reload');

  assert.deepEqual(pageErrors,[],'page errors during Meet phone-priority journey');
  assert.deepEqual(consoleErrors,[],'console errors during Meet phone-priority journey');
  console.log('MEET_PHONE_PRIORITY_ACCEPTANCE_PASS competitors=3 seeds=3 viewport=390 note=primary voice=primary capture=primary stopwatch=secondary add-session=stable cold-start=direct legacy-deck=hidden reload=restored');
 }finally{await browser.close()}
})().catch(err=>{console.error(err?.stack||err);process.exit(1)});
